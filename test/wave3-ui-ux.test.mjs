// Wave 3 UI/UX 회귀 테스트: AI 설정 진입점 분리, AI 지시 콘솔 자연어 대화 연결, 홈 개인 ToDo 밝은 카드, 닫기 툴팁 정합성
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chatIntent} from '../src/live/chat.mjs';
import {homeNextAction} from '../src/live/home-model.mjs';

const read = f => fs.readFileSync(new URL(`../src/live/wc/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function cut(file, start, end) {
  const s = read(file);
  const a = s.indexOf(start);
  assert.ok(a >= 0, `${start} not found in ${file}`);
  const b = end ? s.indexOf(end, a) : s.length;
  assert.ok(b > a, `${end} not found after ${start} in ${file}`);
  return s.slice(a, b);
}
const spy = (impl = () => {}) => { const f = (...a) => { f.calls.push(a); return impl(...a); }; f.calls = []; return f; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

function makeAiEnv({cfg = {key: 'AIzaTestKey1234567890123456789012345', model: 'gemini-2.5-flash', sessionOnly: false}, aiBody = 'ask', contextText = '업무 2건 <민감없음>'} = {}) {
  const overlay = {innerHTML: ''};
  const S = {paletteOpen: false, aiSettingsOnly: false, settings: {aiBody}};
  const HOME_ACTS = {};
  const toasts = [];
  const saved = [];
  const $ = sel => {
    if (sel === '#overlay') return overlay;
    if (sel === '#aiOut') return /id="aiOut"/.test(overlay.innerHTML) ? {} : null;
    if (sel === '#aiSettingsBox') return /id="aiSettingsBox"/.test(overlay.innerHTML) ? {} : null;
    return null;
  };
  const ctx = vm.createContext({
    S, HOME_ACTS, $, esc, ic: n => `<svg data-ic="${n}"></svg>`,
    gated: () => false, allowed: () => true,
    getPrefix: () => 'bwyfgw:',
    sessionStorage: {getItem: () => cfg.sessionOnly ? JSON.stringify(cfg) : null, setItem() {}, removeItem() {}},
    store: {get: () => (cfg.sessionOnly ? {key: '', model: ''} : cfg), set() {}, del() {}},
    R: {isGeminiKey: k => /^AIza/.test(k)},
    aiContext: () => contextText,
    saveLocal: () => { saved.push(S.settings.aiBody); return true; },
    toast: msg => toasts.push(msg),
    closeOverlay: () => { overlay.innerHTML = ''; S.paletteOpen = false; },
  });
  const code = [
    cut('43-chat-understand.js', '  const cuMode =', '  const cuCut ='),
    cut('43-chat-understand.js', '  // 설정: 메일 본문 AI 정리', null),
    cut('23-ai.js', '  const AI_HOST =', '  function aiContext()'),
    cut('23-ai.js', '  function openAi(', '  async function aiRequest('),
    cut('30-chat-ui.js', '  HOME_ACTS.chatSetupAi =', '  HOME_ACTS.chatFocus ='),
    'this.openAi = openAi;',
  ].join('\n');
  vm.runInContext(code, ctx);
  return {ctx, overlay, S, HOME_ACTS, toasts, saved};
}

test('비서 대화 [AI 설정]은 경쟁 Q&A 입력창 없이 설정 전용 창을 열고, 기존 AI 도우미 호환성을 유지한다', () => {
  // 1) 키가 연결된 상태에서 chatSetupAi -> openAi(true)
  const env = makeAiEnv({cfg: {key: 'AIzaValidKey000000000000000000000000', model: 'gemini-2.5-flash', sessionOnly: true}});
  env.HOME_ACTS.chatSetupAi();
  assert.equal(env.S.aiSettingsOnly, true);
  assert.match(env.overlay.innerHTML, /id="aiSettingsBox"/);
  assert.match(env.overlay.innerHTML, /aria-label="AI 설정"/);
  assert.match(env.overlay.innerHTML, /gemini-2\.5-flash/);
  assert.match(env.overlay.innerHTML, /세션 전용/);
  assert.match(env.overlay.innerHTML, /data-act="aiBodyMode"/);
  assert.match(env.overlay.innerHTML, /<details[^>]*><summary[^>]*>AI에게 보내는 내용 보기<\/summary>/);
  assert.match(env.overlay.innerHTML, /업무 2건 &lt;민감없음&gt;/);
  assert.match(env.overlay.innerHTML, /data-act="aiSetup"/);
  assert.match(env.overlay.innerHTML, /data-act="aiForget"/);
  assert.match(env.overlay.innerHTML, /data-act="aiClose"/);
  assert.doesNotMatch(env.overlay.innerHTML, /id="aiQ"|data-act="aiAsk"|id="aiOut"/);

  // 2) 기존 경로 openAi() -> Q&A 도우미 유지 + 홈 비서 안내 보강
  env.ctx.openAi();
  assert.equal(env.S.aiSettingsOnly, false);
  assert.doesNotMatch(env.overlay.innerHTML, /id="aiSettingsBox"/);
  assert.match(env.overlay.innerHTML, /aria-label="AI 도우미"/);
  assert.match(env.overlay.innerHTML, /id="aiQ"/);
  assert.match(env.overlay.innerHTML, /data-act="aiAsk"/);
  assert.match(env.overlay.innerHTML, /id="aiOut"/);
  assert.match(env.overlay.innerHTML, /일정·예약·근태·예산 조회와 신청 준비는 홈의 ‘GW 비서에게 묻기’에서 바로 할 수 있습니다\./);

  // 3) 키가 없으면 openAi(true)도 키 연결 화면(aiSetup)을 연다
  const noKey = makeAiEnv({cfg: {key: '', model: ''}});
  noKey.HOME_ACTS.chatSetupAi();
  assert.match(noKey.overlay.innerHTML, /id="aiKey"/);
  assert.match(noKey.overlay.innerHTML, /id="aiSessionOnly"/);
});

test('aiBodyMode 변경 시 설정 전용 창(#aiSettingsBox)과 도우미 창(#aiOut) 모두 즉시 선택 상태를 갱신한다', () => {
  const env = makeAiEnv({aiBody: 'ask'});
  env.HOME_ACTS.chatSetupAi();
  assert.match(env.overlay.innerHTML, /class="btn sm primary" data-act="aiBodyMode" data-v="ask" aria-pressed="true"/);

  env.HOME_ACTS.aiBodyMode(null, 'always');
  assert.equal(env.S.settings.aiBody, 'always');
  assert.equal(env.S.aiSettingsOnly, true);
  assert.match(env.overlay.innerHTML, /id="aiSettingsBox"/);
  assert.doesNotMatch(env.overlay.innerHTML, /id="aiOut"/);
  assert.match(env.overlay.innerHTML, /class="btn sm primary" data-act="aiBodyMode" data-v="always" aria-pressed="true"/);
  assert.match(env.overlay.innerHTML, /class="btn sm" data-act="aiBodyMode" data-v="ask" aria-pressed="false"/);

  // 도우미 창에서도 갱신되며 모드가 뒤섞이지 않는다
  env.ctx.openAi(false);
  env.HOME_ACTS.aiBodyMode(null, 'off');
  assert.equal(env.S.aiSettingsOnly, false);
  assert.match(env.overlay.innerHTML, /id="aiOut"/);
  assert.match(env.overlay.innerHTML, /class="btn sm primary" data-act="aiBodyMode" data-v="off" aria-pressed="true"/);
});

function makeCmdEnv({aiReadyVal = false, allowGoHome = true} = {}) {
  const S = {view: 'approval', search: {kw: ''}};
  const scrolled = [];
  const chLog = {closest: sel => (sel === '.hm3-chat' ? {scrollIntoView: opt => scrolled.push(opt)} : null)};
  const tasks = [];
  const g = {
    S, esc, R: {chatIntent},
    aiReady: () => aiReadyVal,
    chatSend: spy(),
    closeOverlay: spy(),
    go: spy(v => {
      if (v === 'home' && !allowGoHome) return false;
      S.view = v;
      return true;
    }),
    runSearch: spy(),
    toast: spy(),
    quickAttendanceApplication: spy(async () => {}),
    openResultPlanPicker: spy(),
    autoStartDraft: spy(),
    queueMicrotask: fn => tasks.push(fn),
    $: sel => (sel === '#chLog' ? chLog : null),
  };
  const code = [
    cut('18-command-console.js', '  function parseKoreanDate(', '  // ---------- Action History'),
    cut('18-command-console.js', '  async function cmdHolidayWork(', '  // ---------- B. 보낸메일함'),
    cut('18-command-console.js', '  async function executeCommandWorkflow(', null),
  ].join('\n');
  const exec = vm.runInContext(`${code}\n;(executeCommandWorkflow)`, vm.createContext({Date, Promise, String, Number, Math, RegExp, ...g}));
  const flushMicrotasks = () => { while (tasks.length) tasks.shift()(); };
  return {g, exec, scrolled, flushMicrotasks};
}

test('AI 지시 콘솔은 자연어 질의·예약·조회를 홈 비서 대화로 보내고, 미인식 키워드만 통합검색으로 폴백한다', async () => {
  // 1) 로컬 chatIntent가 인식하는 자연어 문장 4종 -> 비서 대화(chatSend) 전달
  for (const q of ['오늘 할 일 알려줘', '이번 달 예산 얼마 남았어', '내일 오후 2시 차량 예약해줘', '결재할 문서 보여줘']) {
    const {g, exec, scrolled, flushMicrotasks} = makeCmdEnv({aiReadyVal: false});
    await exec(q);
    flushMicrotasks();
    assert.equal(g.closeOverlay.calls.length, 1, q);
    assert.deepEqual(g.go.calls, [['home']], q);
    assert.deepEqual(g.chatSend.calls, [[q]], q);
    assert.equal(g.runSearch.calls.length, 0, q);
    assert.equal(scrolled.length, 1, q);
  }

  // 2) AI 연결 상태에서는 로컬 의도에 없더라도 질문형 문장을 비서 대화로 전달
  {
    const q = '이번 행사 준비할 때 주의할 점이 뭐야?';
    assert.equal(chatIntent(q).tool, '');
    const {g, exec} = makeCmdEnv({aiReadyVal: true});
    await exec(q);
    assert.deepEqual(g.go.calls, [['home']]);
    assert.deepEqual(g.chatSend.calls, [[q]]);
    assert.equal(g.runSearch.calls.length, 0);
  }

  // 3) 작성 중 화면 보호: go('home') === false 이면 chatSend를 부르지 않고 멈춘다
  {
    const {g, exec, scrolled, flushMicrotasks} = makeCmdEnv({allowGoHome: false});
    await exec('오늘 할 일 알려줘');
    flushMicrotasks();
    assert.deepEqual(g.go.calls, [['home']]);
    assert.equal(g.chatSend.calls.length, 0);
    assert.equal(g.runSearch.calls.length, 0);
    assert.equal(scrolled.length, 0);
  }

  // 4) 짧은 키워드·미인식 어구는 기존대로 통합검색으로 폴백
  for (const kw of ['홍길동', '복무규정']) {
    const {g, exec} = makeCmdEnv({aiReadyVal: true});
    await exec(kw);
    assert.deepEqual(g.go.calls, [['search']], kw);
    assert.equal(g.g ? undefined : g.S.search.kw, kw);
    assert.equal(g.chatSend.calls.length, 0, kw);
    assert.equal(g.runSearch.calls.length, 1, kw);
  }
});

test('홈 먼저 할 일: 개인 ToDo 카드에만 밝은 표면 클래스(hm-next-p)를 붙이고 그룹웨어 업무 카드는 진한 표면을 유지한다', () => {
  const runFirst = ({mine = [], personal = null}) => {
    const ctx = vm.createContext({
      S: {lastRefresh: null},
      TD: {},
      STATE_NAME: {overdue: '기한 지남', urgent: '급함', todo: '할 일', check: '확인 필요', confirm: '끝났는지 확인'},
      R: {kstNow: () => ({date: '2026-11-27'}), homeNextAction},
      stateOf: x => x.state,
      personalHomeDue: () => personal,
      esc,
      hhmm: () => '10:00',
    });
    const src = cut('29-home-view.js', '  const homePersonal =', '  // 핵심 4:');
    return vm.runInContext(`${src}\n;(homeFirstHtml)`, ctx)({mine, taskGaps: false, refN: 0});
  };

  // 개인 ToDo가 선택된 경우(오늘 마감 / 기한 지남): hm-next-p 포함
  const pHtml = runFirst({
    mine: [{key: 'doc:1', title: '일반 공람 문서', headline: '', area: '결재', state: 'todo'}],
    personal: {known: true, late: [], today: [{id: 'td1', title: '개인 발표자료 정리', due: '2026-11-27'}]},
  });
  assert.match(pHtml, /<section class="hm-card hm-next hm-next-p" aria-label="먼저 할 일">/);
  assert.match(pHtml, /먼저 할 일 · 개인 ToDo/);

  // 그룹웨어 긴급 업무가 선택된 경우: hm-next 유지, hm-next-p 없음
  const gwHtml = runFirst({
    mine: [{key: 'doc:2', title: '긴급 결재 문서', headline: '', area: '결재', state: 'urgent', deadline: {date: '2026-11-27', dday: 0}}],
    personal: {known: true, late: [{id: 'td1', title: '개인 발표자료 정리', due: '2026-11-26'}], today: []},
  });
  assert.match(gwHtml, /<section class="hm-card hm-next" aria-label="먼저 할 일">/);
  assert.doesNotMatch(gwHtml, /hm-next-p/);
  assert.match(gwHtml, /먼저 할 일 · 그룹웨어/);
  const css = read('../wc.css');
  assert.match(css, /\.wc \.desk \.hm-next\.hm-next-p\{background:var\(--card\);color:var\(--fg\)/);
});

test('상단 닫기 버튼 툴팁이 실제 최소화 런처 위치(화면 오른쪽 아래)와 일치한다', () => {
  const shell = read('02-shell.js');
  assert.match(shell, /#bwyfgw-wc-fab\{position:fixed;right:22px;bottom:150px;/);
  const closeTag = (shell.match(/<button class="hb back" data-act="close"[^>]*>/) || [''])[0];
  assert.ok(closeTag, '닫기 버튼 태그가 있어야 한다');
  assert.match(closeTag, /화면 오른쪽 아래 'GW 비서' 버튼이나 Alt\+G로 다시 열기/);
  assert.doesNotMatch(closeTag, /화면 위 가운데/);
});
