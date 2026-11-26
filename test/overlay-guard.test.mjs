import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// 덮개 가드(15-overlays-palette-help-menus.js)와, 기다린(await) 뒤 덮개를 다시 그리거나 닫던 곳의 회귀 검사.
// 조각의 일부만 떼어 vm으로 돌린다. 덮개(#overlay)는 innerHTML을 바꿀 때마다 새 창 요소가 생기는 가짜로 흉내 낸다.
const read = f => readFileSync(new URL('../src/live/wc/' + f, import.meta.url), 'utf8');
function cut(file, from, to) {
  const s = read(file), a = s.indexOf(from), b = s.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`${file}: 구간을 찾지 못함 (${from.slice(0, 30)})`);
  return s.slice(a, b);
}
const GUARD = cut('15-overlays-palette-help-menus.js', '  let ovMarkSeq', '  const fontStep');

function fakeOverlay() {
  let html = '', child = null;
  return {
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); child = html.trim() ? {dataset: {}} : null; },
    get firstElementChild() { return child; },
  };
}
function deferred() { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return {promise, resolve, reject}; }
const tick = () => new Promise(r => setTimeout(r, 0));

// 공통 문맥: 덮개, 알림, 창 닫기. extra로 조각마다 필요한 것을 더한다.
function context(extra = {}, sel = {}) {
  const overlay = fakeOverlay(), toasts = [], toastEl = {html: '', insertAdjacentHTML(_p, h) { this.html += h; }};
  const S = {paletteOpen: false, helpOpen: false, menuOpen: '', coach: null};
  const ctx = {
    S, overlay, toasts, toastEl,
    $: q => (q === '#overlay' ? overlay : q in sel ? sel[q](overlay) : null),
    root: {querySelector: q => (q === '.toast' && toasts.length ? toastEl : null)},
    toast: m => { toasts.push(m); toastEl.html = ''; },
    closeOverlay: () => { S.paletteOpen = false; S.helpOpen = false; S.menuOpen = ''; overlay.innerHTML = ''; },
    ic: () => '', esc: s => String(s ?? ''), logError: () => {}, setTimeout: () => 0,
    ...extra,
  };
  return ctx;
}
const run = (ctx, src, name) => runInNewContext(GUARD + '\n' + src + `\n;${name}`, ctx);
// 사용자가 다른 창을 엶(팔레트 같은 창: S.paletteOpen을 켜고 덮개에 그림)
const openOther = ctx => { ctx.S.paletteOpen = true; ctx.overlay.innerHTML = '<div>다른 창</div>'; };

// ---------- 공통 가드 ----------
test('가드: 빈 덮개는 0, 그 뒤 창이 생기면 0은 더 이상 살아 있지 않다', () => {
  const ctx = context();
  const g = run(ctx, '', '({overlayMark, overlayLive})');
  const m = g.overlayMark();
  assert.equal(m, 0);
  assert.equal(g.overlayLive(m), true);
  ctx.overlay.innerHTML = '<div>창</div>';
  assert.equal(g.overlayLive(m), false);
});

test('가드: 같은 창이면 살아 있고, 닫거나 바꾸면 아니다', () => {
  const ctx = context();
  const g = run(ctx, '', '({overlayMark, overlayLive})');
  ctx.overlay.innerHTML = '<div>A</div>';
  const a = g.overlayMark();
  assert.ok(a > 0);
  assert.equal(g.overlayMark(), a, '같은 창에 다시 표식을 달면 같은 순번');
  assert.equal(g.overlayLive(a), true);
  ctx.overlay.innerHTML = '<div>B</div>';
  const b = g.overlayMark();
  assert.notEqual(b, a);
  assert.equal(g.overlayLive(a), false, '다른 창으로 바뀜');
  assert.equal(g.overlayLive(b), true);
  ctx.overlay.innerHTML = '';
  assert.equal(g.overlayLive(b), false, '닫힘');
});

test('가드: 결과 알림은 빈 덮개면 그리게 두고, 다른 창이 있으면 덮지 않고 알림과 결과 보기 단추를 준다', () => {
  const ctx = context();
  const g = run(ctx, '', '({overlayYield})');
  assert.equal(g.overlayYield('끝났습니다.'), false);
  assert.equal(ctx.toasts.length, 0);
  ctx.overlay.innerHTML = '<div>다른 창</div>';
  assert.equal(g.overlayYield('끝났습니다.'), true);
  assert.equal(ctx.overlay.innerHTML, '<div>다른 창</div>');
  assert.match(ctx.toasts[0], /끝났습니다\. 결과는 자동화 작업 내역에 있습니다/);
  assert.match(ctx.toastEl.html, /data-act="openHistory"/);
});

// ---------- 23-ai.js aiSaveKey: 연결 시험(최대 30초) 뒤 ----------
function aiSetupCtx() {
  const first = deferred();
  let calls = 0;
  const ctx = context({
    R: {isGeminiKey: () => true},
    aiShell: b => `<div>시험 ${b}</div>`,
    aiSetup: msg => { ctx.overlay.innerHTML = `<div>키 설정 ${msg || ''}</div>`; },
    aiRequest: () => (calls++ ? Promise.resolve({}) : first.promise),
    aiSessKey: () => 'k', store: {set() {}, del() {}}, sessionStorage: {setItem() {}, removeItem() {}},
  }, {'#aiKey': () => ({value: 'AIzaTEST'}), '#aiSessionOnly': () => ({checked: false})});
  const save = run(ctx, cut('23-ai.js', '  async function aiSaveKey', '  async function aiAsk'), 'aiSaveKey');
  return {ctx, save, first};
}
const MODELS = {models: [{name: 'models/gemini-9-flash', supportedGenerationMethods: ['generateContent']}]};

test('AI 키: 시험 중 창을 닫으면 실패해도 키 설정 창이 다시 뜨지 않고 알림으로 알린다', async () => {
  const {ctx, save, first} = aiSetupCtx();
  const p = save();
  ctx.closeOverlay();
  const e = new Error('네트워크'); first.reject(e); await p;
  assert.equal(ctx.overlay.innerHTML, '');
  assert.match(ctx.toasts.join(' '), /연결하지 못했습니다: 네트워크/);
});

test('AI 키: 시험 중 연 다른 창은 성공해도 닫지 않는다', async () => {
  const {ctx, save, first} = aiSetupCtx();
  const p = save();
  openOther(ctx);
  first.resolve(MODELS); await p;
  assert.equal(ctx.overlay.innerHTML, '<div>다른 창</div>');
  assert.match(ctx.toasts.join(' '), /연결되었습니다/);
});

test('AI 키: 열어 둔 채면 실패 시 키 설정 창을, 성공 시 창을 닫는다', async () => {
  let t = aiSetupCtx(), p = t.save();
  t.first.reject(new Error('네트워크')); await p;
  assert.match(t.ctx.overlay.innerHTML, /키 설정 연결하지 못했습니다/);
  t = aiSetupCtx(); p = t.save();
  t.first.resolve(MODELS); await p;
  assert.equal(t.ctx.overlay.innerHTML, '');
});

// ---------- 21-governance.js govUpdate: 업데이트 확인 뒤 ----------
function govCtx(kind) {
  const d = deferred();
  const ctx = context({
    checkUpdate: () => d.promise, renderHead() {}, renderNav() {}, VERSION: '1.0.0', R: {compareVersions: () => 0},
    openChangelog: () => { ctx.overlay.innerHTML = '<div aria-label="업데이트 내역">내역</div>'; },
    drawDiag: () => { ctx.overlay.innerHTML = '<div aria-label="진단">진단</div>'; },
  }, {'#overlay [aria-label="업데이트 내역"]': ov => (/업데이트 내역/.test(ov.innerHTML) ? {} : null)});
  ctx.overlay.innerHTML = kind === 'log' ? '<div aria-label="업데이트 내역">내역</div>' : '<div aria-label="진단">진단</div>';
  const upd = run(ctx, cut('21-governance.js', '  async function govUpdate', '  // ---------- 최초 사용 안내'), 'govUpdate');
  return {ctx, upd, d};
}

test('업데이트 다시 확인: 확인 중 창을 닫으면 다시 뜨지 않는다', async () => {
  for (const kind of ['log', 'diag']) {
    const {ctx, upd, d} = govCtx(kind);
    const p = upd(); ctx.closeOverlay();
    d.resolve({latest: '1.0.0'}); await p;
    assert.equal(ctx.overlay.innerHTML, '', kind);
    assert.match(ctx.toasts.join(' '), /최신 버전/);
  }
});

test('업데이트 다시 확인: 그 사이 연 다른 창을 덮지 않고, 열려 있으면 다시 그린다', async () => {
  let {ctx, upd, d} = govCtx('diag');
  let p = upd(); openOther(ctx);
  d.resolve({latest: '1.0.0'}); await p;
  assert.equal(ctx.overlay.innerHTML, '<div>다른 창</div>');
  ({ctx, upd, d} = govCtx('log'));
  p = upd(); d.resolve({latest: '1.0.0'}); await p;
  assert.match(ctx.overlay.innerHTML, /업데이트 내역/);
});

// ---------- 55-todo-views.js todoWrapOpen: 목록을 읽은 뒤 ----------
function wrapCtx() {
  const d = deferred();
  const ctx = context({TD: {list: null, err: ''}, todoGwOk: () => true, todoWrapHtml: () => '<div>퇴근 전 마무리</div>'});
  ctx.todoLoad = () => d.promise.then(() => { ctx.TD.list = []; });
  const open = run(ctx, cut('55-todo-views.js', '  function todoWrapOpen', '  const todoWrapRefresh'), 'todoWrapOpen');
  return {ctx, open, d};
}

test('퇴근 전 마무리: 목록을 읽는 동안 연 다른 창을 닫고 뜨지 않는다', async () => {
  const {ctx, open, d} = wrapCtx();
  open(); openOther(ctx);
  d.resolve(); await tick(); await tick();
  assert.equal(ctx.overlay.innerHTML, '<div>다른 창</div>');
});

test('퇴근 전 마무리: 아무것도 열지 않았으면 읽은 뒤 뜬다', async () => {
  const {ctx, open, d} = wrapCtx();
  open(); d.resolve(); await tick(); await tick();
  assert.match(ctx.overlay.innerHTML, /퇴근 전 마무리/);
});

// ---------- 55-todo-views.js todoBulkSave / 51-todo.js tdDelYes: 저장·삭제 뒤 닫기 ----------
function bulkCtx() {
  const d = deferred();
  const ctx = context({
    TD: {}, R: {tdParseBulk: () => ({rows: [{title: '가'}]})}, today: () => '2026-11-27', todoGwOk: () => true,
    GW: {todoCreate: () => d.promise}, todoYmd: s => s, todoLoad: async () => {}, todoBulkPreview() {},
  }, {'#tdeBulk': () => ({value: '가'})});
  ctx.overlay.innerHTML = '<div>할 일 여러 개 추가</div>';
  const save = run(ctx, cut('55-todo-views.js', '  async function todoBulkSave', '  // ---------- 처리기 ----------'), 'todoBulkSave');
  return {ctx, save, d};
}

test('할 일 여러 개 추가: 저장 중 연 다른 창은 저장이 끝나도 닫지 않는다', async () => {
  const {ctx, save, d} = bulkCtx();
  const p = save(null); openOther(ctx);
  d.resolve(); await p;
  assert.equal(ctx.overlay.innerHTML, '<div>다른 창</div>');
  assert.match(ctx.toasts.join(' '), /1건을 추가했습니다/);
});

test('할 일 여러 개 추가: 창을 열어 둔 채면 저장 뒤 닫는다', async () => {
  const {ctx, save, d} = bulkCtx();
  const p = save(null); d.resolve(); await p;
  assert.equal(ctx.overlay.innerHTML, '');
});

function delCtx() {
  const d = deferred();
  const ctx = context({HOME_ACTS: {}, todoRemove: () => d.promise});
  ctx.overlay.innerHTML = '<div>할 일 지우기</div>';
  run(ctx, cut('51-todo.js', '  HOME_ACTS.tdDelYes', '  HOME_ACTS.tdSubAdd'), '0');
  return {ctx, yes: () => ctx.HOME_ACTS.tdDelYes({dataset: {id: 'td1'}}), d};
}

test('할 일 지우기: 지우는 중 연 다른 창은 닫지 않고, 열어 둔 채면 닫는다', async () => {
  let {ctx, yes, d} = delCtx();
  let p = yes(); openOther(ctx);
  d.resolve({ok: true}); await p;
  assert.equal(ctx.overlay.innerHTML, '<div>다른 창</div>');
  assert.match(ctx.toasts.join(' '), /지웠습니다/);
  ({ctx, yes, d} = delCtx());
  p = yes(); d.resolve({ok: true}); await p;
  assert.equal(ctx.overlay.innerHTML, '');
});

// ---------- 52-budget-plan.js bpImportOpen / bpImportAdd ----------
function bpCtx() {
  const d = deferred();
  const ctx = context({
    BP: {}, HOME_ACTS: {}, learnPatterns: () => d.promise, patLoad: () => ({docs: {}}), bpLoadLedger: async () => null, bpRows: () => [{code: 'c1', name: '세목'}],
    bpAllPlans: () => [], R: {bpPlanCandidates: () => []}, today: () => '2026-11-27', bpAmt: v => Number(String(v).replace(/\D/g, '')) || 0,
  }, {'#bpImpCode0': () => ({value: 'c1'}), '#bpImpAmt0': () => ({value: '1000'}), '#bpImpDate0': () => ({value: '2026-12-01'})});
  ctx.S.budget = {project: 'p', filter: 'h'};
  ctx.bpImportHtml = () => `<div>계획서에서 가져오기 ${ctx.BP.impBusy ? '읽는 중' : '다 읽음'}</div>`;
  const g = run(ctx, cut('52-budget-plan.js', '  async function bpImportOpen', '  function bpImportHtml') + cut('52-budget-plan.js', '  HOME_ACTS.bpImportAdd', '  HOME_ACTS.bpConfirm'), '({bpImportOpen})');
  return {ctx, open: g.bpImportOpen, d};
}

test('계획서에서 가져오기: 읽는 중 닫고 다른 창을 열면 그 창을 덮지 않는다', async () => {
  const {ctx, open, d} = bpCtx();
  const p = open();
  assert.match(ctx.overlay.innerHTML, /읽는 중/);
  ctx.closeOverlay(); openOther(ctx);
  d.resolve({}); await p;
  assert.equal(ctx.overlay.innerHTML, '<div>다른 창</div>');
});

test('계획서에서 가져오기: 열어 둔 채면 다 읽은 뒤 다시 그린다', async () => {
  const {ctx, open, d} = bpCtx();
  const p = open(); d.resolve({}); await p;
  assert.match(ctx.overlay.innerHTML, /다 읽음/);
});

test('계획으로 추가: 저장 중 연 다른 창을 덮지 않고, 열어 둔 채면 다시 그린다', async () => {
  for (const other of [true, false]) {
    const {ctx} = bpCtx();
    const d = deferred();
    ctx.todoCreate = () => d.promise;
    ctx.BP.imp = [{title: '2026년 가나 운영계획', docNo: 'D-1', date: '2026-01-01'}];
    ctx.S.paletteOpen = true; ctx.overlay.innerHTML = ctx.bpImportHtml();
    const p = ctx.HOME_ACTS.bpImportAdd({dataset: {i: '0'}, disabled: false});
    if (other) openOther(ctx);
    d.resolve({ok: true}); await p;
    if (other) assert.equal(ctx.overlay.innerHTML, '<div>다른 창</div>');
    else assert.match(ctx.overlay.innerHTML, /계획서에서 가져오기/);
    assert.equal(ctx.BP.imp[0].taken, true);
  }
});

// ---------- 27-attendance-request.js quickAttendanceApplication: 지난 신청 목록을 최대 4초 기다린 뒤 ----------
function attCtx() {
  const d = deferred(), asked = [];
  const ctx = context({
    ATT_FORM: {trip: '출장신청서', leave: '휴가신청서', overtime: '시간외근무신청서'}, R: {kstNow: () => ({date: '2026-11-27'}), learnAttendanceTitles: () => null},
    selectedAction: () => null, attYmd: () => '', GW: {teamPlanned: true}, loadApps: () => d.promise, wait: () => new Promise(() => {}),
    ATT_LEAVE_KINDS: ['연차'], ATT_TRANSPORTS: [], fillAttendanceForm: async () => ({status: 'success'}),
    askAttendance: async st => { asked.push(st); ctx.overlay.innerHTML = '<div>근태 신청 준비</div>'; return null; },
  });
  ctx.S.view = 'home';
  const q = run(ctx, cut('27-attendance-request.js', '  async function quickAttendanceApplication', '  async function fillAttendanceForm'), 'quickAttendanceApplication');
  return {ctx, q, d, asked};
}

test('근태 신청: 목록을 기다리는 동안 연 다른 창을 덮지 않고 알린다', async () => {
  const {ctx, q, d, asked} = attCtx();
  const p = q('leave'); openOther(ctx);
  d.resolve({apps: [], me: ''}); await p;
  assert.equal(asked.length, 0);
  assert.equal(ctx.overlay.innerHTML, '<div>다른 창</div>');
  assert.match(ctx.toasts.join(' '), /근태 신청 창을 띄우지 않았습니다/);
});

test('근태 신청: 아무것도 열지 않았으면 입력 창을 띄운다', async () => {
  const {ctx, q, d, asked} = attCtx();
  const p = q('leave'); d.resolve({apps: [], me: ''}); await p;
  assert.equal(asked.length, 1);
  assert.match(ctx.overlay.innerHTML, /근태 신청 준비/);
});

// ---------- 자동 입력 결과 창: 19-draft-engine.js showDraftReport, 27-attendance-request.js fillAttendanceForm 끝 ----------
function reportCtx() {
  const logged = [];
  const ctx = context({logActionRecord: r => logged.push(r)});
  const show = run(ctx, cut('19-draft-engine.js', '  function showDraftReport', '  // ---------- 결과보고: 계획서를 이어받아 작성'), 'showDraftReport');
  return {ctx, show, logged};
}
const STEPS = [{name: '제목', ok: true, detail: '가나'}, {name: '본문', ok: true, detail: '넣음'}];

test('기안 결과: 그 사이 연 다른 창을 덮지 않고, 알림과 작업 내역으로 남긴다', () => {
  const {ctx, show, logged} = reportCtx();
  openOther(ctx);
  show('가나 지급 건의', STEPS, []);
  assert.equal(ctx.overlay.innerHTML, '<div>다른 창</div>');
  assert.equal(logged.length, 1, '결과는 작업 내역에 남는다');
  assert.match(ctx.toasts.join(' '), /상신 안 함/);
  assert.match(ctx.toastEl.html, /openHistory/);
});

test('기안 결과: 덮개가 비어 있으면 결과 창을 그린다', () => {
  const {ctx, show, logged} = reportCtx();
  show('가나 지급 건의', STEPS, []);
  assert.match(ctx.overlay.innerHTML, /자동 기입 완료/);
  assert.equal(logged.length, 1);
  assert.equal(ctx.toasts.length, 0);
});

function attTail() {
  const body = cut('27-attendance-request.js', "    const bad = steps.filter(s => !s.ok).length;\n    logActionRecord({command: `근태신청 준비", '    return out;\n  }') + '    return out;';
  const logged = [];
  const ctx = context({logActionRecord: r => logged.push(r), ATT_FORM: {leave: '휴가신청서'}, hm: a => a.join(':')});
  const fin = run(ctx, `function attFinish(steps, spec) {\n${body}\n}`, 'attFinish');
  return {ctx, fin, logged};
}

test('근태 신청서 결과: 다른 창이 열려 있으면 덮지 않고 알리며, 결과 값은 그대로 돌려준다', () => {
  const {ctx, fin, logged} = attTail();
  openOther(ctx);
  const out = fin([{name: '휴가구분', ok: true, detail: '연차'}, {name: '비고', ok: false, detail: '비어 있음'}], {type: 'leave', from: '2026-11-28', kind: '연차'});
  assert.deepEqual({...out}, {status: 'partial', total: 2, failed: 1});
  assert.equal(ctx.overlay.innerHTML, '<div>다른 창</div>');
  assert.equal(logged.length, 1);
  assert.match(ctx.toasts.join(' '), /\[신청완료\]는 누르지 않음/);
});

test('근태 신청서 결과: 덮개가 비어 있으면 결과 창을 그린다', () => {
  const {ctx, fin} = attTail();
  const out = fin([{name: '휴가구분', ok: true, detail: '연차'}], {type: 'leave', from: '2026-11-28', kind: '연차'});
  assert.equal(out.status, 'success');
  assert.match(ctx.overlay.innerHTML, /근태신청 준비 결과/);
});
