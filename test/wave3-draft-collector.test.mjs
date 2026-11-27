// Wave 3 안전·정직성 회귀 검증:
// 1) 수집기 쓰기 요청 발송 후 통신 오류(Failed to fetch·NetworkError·Load failed·AbortError·ECONNRESET·502/503/504·TIMEOUT) → UNKNOWN 분리
// 2) 51-todo.js UNKNOWN 미확인 안내 (저장/삭제 실패 단정 금지)
// 3) 19-draft-engine.js showDraftReport 본문·기록물철 실패 시 승계 안내 제거, 초안 틀 전용 기안은 노트 보존
// 4) 19-draft-engine.js openResultPlanPicker 캐시 즉시 렌더·덮개 가드·스크롤 보존·실패/미확인 범위 표시
// 5) 19b-payment-goods.js payForm option 하드코딩 색상 제거
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as B from '../src/live/briefing.mjs';
import * as TP from '../src/live/todo-plan.mjs';

const read = p => readFileSync(new URL('../src/live/' + p, import.meta.url), 'utf8');
const ORIGIN = 'https://gw.bwyf.or.kr';
const ME = {ucUserInfo: {empSeq: '1', groupSeq: 'g', compSeq: 'c', deptSeq: 'd', loginId: 'u', empName: '홍길동'}};
const FUTURE = '20990115'; // 90일 제한을 피하기 위해 Date.now 기준 상대 날짜 계산도 지원

function futureYmd(daysAhead = 2) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}`;
}

function loadCollector({gesture = true, todoItems = [], detail = {}, onPost, origin = ORIGIN} = {}) {
  const src = read('collector.browser.js');
  const calls = [];
  const defaultRespond = (p, body) => {
    if (p === '/schres/rs121A24') return {resultCode: 0, resultData: {resAttrList: [{attrSeq: 'A1'}]}};
    if (p === '/schres/rs121A01') return {resultCode: 0, resultData: {resultList: [{attrName: '차량', resList: [{resSeq: '21', resName: '관용차량', apprYn: 'N', useYn: 'Y'}]}]}};
    if (p === '/schres/rs121A42') return {resultCode: 0, resultData: {resName: '관용차량', apprYn: 'N', limitReservationRange: '0'}};
    if (p === '/schres/rs121A04') return {resultCode: 0, resultData: {reservationYn: 'N', limitYn: 'N'}};
    if (p === '/schres/rs121A06') return {resultCode: 0, resultData: {successTf: 1}};
    if (p.endsWith('prj001A12')) return {resultCode: 0, resultData: {totalCnt: todoItems.length, todoList: todoItems}};
    if (p.endsWith('prj001A05')) return {resultCode: 0, resultData: {todoSeq: body.todoSeq, loginUserTodoOwnerYn: 'Y', loginUserTodoCreateYn: 'Y', ownerEmpSeq: '1', createEmpSeq: '1', prjSeq: '', todoName: '기존', startDate: '20261124', endDate: '20261124', contents: '메모', importDegree: '0', todoStatus: '0', processRate: 0, fileCount: 0, todoLevel: 1, ...detail}};
    if (p.endsWith('prj001A01')) return {resultCode: 0, resultData: 'td777'};
    if (p.endsWith('prj001A09')) return {resultCode: 0, resultData: {}};
    if (p.endsWith('prj001A02') || p.endsWith('prj001A03') || p.endsWith('prj001A07')) return {resultCode: 0, resultData: {todoSeq: body.todoSeq, todoStatus: body.processRate === '100' ? '2' : '0'}};
    return {resultCode: 0, resultData: {}};
  };
  const client = {
    call() {},
    post: (p, body) => {
      calls.push({p, body});
      if (onPost) {
        const custom = onPost(p, body, calls);
        if (custom !== undefined) return custom;
      }
      return Promise.resolve(defaultRespond(p, body));
    },
  };
  const req = () => ({A: client});
  req.m = {42: function signer() { return 'wehago-sign getTransactionId'; }};
  const window = {webpackChunkklago_ui_gw: {push: ([, , cb]) => cb(req)}};
  const sandbox = {
    window, location: {origin}, navigator: {userActivation: {isActive: gesture}},
    sessionStorage: {getItem: () => JSON.stringify(ME)}, performance: {now: () => 0},
    Intl, Date, JSON, Promise, setTimeout, clearTimeout, Object, Array, String, Number, Set, Map, Math, Function, Error, TypeError,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return {api: window.BWYFGW, calls};
}

// ---------- 1. 수집기 쓰기 후 통신 오류 UNKNOWN 판정 ----------
test('수집기 reserveResource: 발송 후 통신·게이트웨이 오류는 UNKNOWN, 사전 검증·명시적 서버 거절은 기존 코드 유지', async () => {
  const day = futureYmd(2);
  const netErrors = [
    () => Promise.reject(new TypeError('Failed to fetch')),
    () => Promise.reject(new Error('NetworkError when attempting to fetch resource.')),
    () => Promise.reject(new TypeError('Load failed')),
    () => Promise.reject(Object.assign(new Error('The operation was aborted'), {name: 'AbortError'})),
    () => Promise.reject(Object.assign(new Error('read ECONNRESET'), {code: 'ECONNRESET'})),
    () => Promise.reject(new Error('HTTP 502 Bad Gateway')),
    () => Promise.reject({status: 503, statusText: 'Service Unavailable'}),
    () => Promise.resolve('<html>504 Gateway Timeout</html>'),
  ];
  for (const fail of netErrors) {
    const {api, calls} = loadCollector({onPost: p => (p === '/schres/rs121A06' ? fail() : undefined)});
    await assert.rejects(
      api.reserveResource({resSeq: '21', title: '업무 이동', start: day + '1400', end: day + '1500'}),
      err => err.code === 'UNKNOWN' && /통신 오류 또는 응답 지연으로 저장 여부를 확인하지 못했습니다/.test(err.message),
    );
    assert.equal(calls.filter(c => c.p === '/schres/rs121A06').length, 1, '쓰기 요청은 재시도하지 않는다');
  }

  // 사전 읽기(rs121A04 중복 확인) 단계의 통신 오류는 아직 저장 요청을 보내지 않았으므로 UNKNOWN이 아니다
  const preRead = loadCollector({onPost: p => (p === '/schres/rs121A04' ? Promise.reject(new TypeError('Failed to fetch')) : undefined)});
  await assert.rejects(preRead.api.reserveResource({resSeq: '21', title: '업무 이동', start: day + '1400', end: day + '1500'}), err => err.code === 'API_ERROR');
  assert.equal(preRead.calls.filter(c => c.p === '/schres/rs121A06').length, 0);

  // 사전 입력·제스처 검증 및 서버의 명시적 거절은 확정 실패 코드 유지
  const noGesture = loadCollector({gesture: false});
  await assert.rejects(noGesture.api.reserveResource({resSeq: '21', title: '업무', start: day + '1400', end: day + '1500'}), {code: 'NO_GESTURE'});
  const badOrigin = loadCollector({origin: 'https://example.com'});
  await assert.rejects(badOrigin.api.todoCreate({title: '업무'}), {code: 'WRONG_ORIGIN'});
  await assert.rejects(badOrigin.api.reserveResource({resSeq: '21', title: '업무', start: day + '1400', end: day + '1500'}), err => err.code === 'BAD_INPUT' && err.code !== 'UNKNOWN');
  const expired = loadCollector({onPost: p => (p === '/schres/rs121A06' ? Promise.reject('{"errors":{"code":"E002","message":"Token is not exists"}}') : undefined)});
  await assert.rejects(expired.api.reserveResource({resSeq: '21', title: '업무', start: day + '1400', end: day + '1500'}), {code: 'SESSION_EXPIRED'});
  const bizFail = loadCollector({onPost: p => (p === '/schres/rs121A06' ? Promise.resolve({resultCode: 500, resultMsg: '중복 오류'}) : undefined)});
  await assert.rejects(bizFail.api.reserveResource({resSeq: '21', title: '업무', start: day + '1400', end: day + '1500'}), {code: 'API_ERROR'});
  const saveFail = loadCollector({onPost: p => (p === '/schres/rs121A06' ? Promise.resolve({resultCode: 0, resultData: {successTf: 0}}) : undefined)});
  await assert.rejects(saveFail.api.reserveResource({resSeq: '21', title: '업무', start: day + '1400', end: day + '1500'}), {code: 'SAVE_FAILED'});
});

test('수집기 todoCreate·todoUpdate·todoSetProgress·todoSetImportance·todoDelete: 발송 후 통신 오류 UNKNOWN 전환 및 복구', async () => {
  const todayKst = futureYmd(0);
  // todoCreate: 발송 후 Failed to fetch지만 목록 재조회에서 새 항목이 확인되면 복구 성공
  let listCount = 0;
  const rec = loadCollector({
    onPost: p => {
      if (p.endsWith('prj001A12')) {
        listCount++;
        const rows = listCount === 1 ? [] : [{todoSeq: 'td901', todoName: '복구 할 일', createDate: todayKst, todoStatus: '0', children: []}];
        return Promise.resolve({resultCode: 0, resultData: {totalCnt: rows.length, todoList: rows}});
      }
      if (p.endsWith('prj001A01')) return Promise.reject(new TypeError('Failed to fetch'));
    },
  });
  const ok = await rec.api.todoCreate({title: '복구 할 일'});
  assert.equal(ok.ok, true);
  assert.equal(ok.id, 'td901');
  assert.equal(ok.recovered, true);

  // todoCreate: 복구되지 않거나 before 목록이 없는(하위 ToDo / 사전 조회 실패) 경우에도 API_ERROR 대신 UNKNOWN
  for (const args of [{title: '미확인 상위'}, {title: '미확인 하위', parent: 'td5'}]) {
    const c = loadCollector({onPost: p => (p.endsWith('prj001A01') ? Promise.reject(new TypeError('Failed to fetch')) : undefined)});
    await assert.rejects(c.api.todoCreate(args), err => err.code === 'UNKNOWN' && /저장 여부를 확인하지 못했습니다/.test(err.message));
  }
  const noBefore = loadCollector({
    onPost: p => {
      if (p.endsWith('prj001A12')) return Promise.reject(new TypeError('Failed to fetch'));
      if (p.endsWith('prj001A01')) return Promise.reject(new Error('503 Service Unavailable'));
    },
  });
  await assert.rejects(noBefore.api.todoCreate({title: '사전 목록 실패'}), {code: 'UNKNOWN'});

  // todoUpdate(A02), todoSetProgress(A07), todoSetImportance(A09), todoDelete(A03): todoWrite 이후 통신 오류는 UNKNOWN
  for (const [ep, callFn] of [
    ['prj001A02', api => api.todoUpdate('td9', {title: '수정 제목'})],
    ['prj001A07', api => api.todoSetProgress('td9', 60)],
    ['prj001A09', api => api.todoSetImportance('td9', '2')],
    ['prj001A03', api => api.todoDelete('td9')],
  ]) {
    const net = loadCollector({onPost: p => (p.endsWith(ep) ? Promise.reject(new TypeError('Failed to fetch')) : undefined)});
    await assert.rejects(callFn(net.api), err => err.code === 'UNKNOWN' && /반영 여부를 확인하지 못했습니다/.test(err.message), ep);

    // 사전 읽기(prj001A05 상세 조회)에서 난 통신 오류는 쓰기 요청 전이므로 UNKNOWN으로 바꾸지 않는다
    const pre = loadCollector({onPost: p => (p.endsWith('prj001A05') ? Promise.reject(new TypeError('Failed to fetch')) : undefined)});
    await assert.rejects(callFn(pre.api), err => err.code === 'API_ERROR', ep + ' pre-read');
    assert.equal(pre.calls.filter(x => x.p.endsWith(ep)).length, 0);

    // 서버 비즈니스 실패 응답은 API_ERROR 유지
    const biz = loadCollector({onPost: p => (p.endsWith(ep) ? Promise.resolve({resultCode: -1, resultMsg: '거절됨'}) : undefined)});
    await assert.rejects(callFn(biz.api), err => err.code === 'API_ERROR', ep + ' biz');
  }
});

// ---------- 2. 51-todo.js UNKNOWN 미확인 안내 ----------
test('51-todo.js: UNKNOWN 오류 시 저장·삭제 실패로 단정하지 않고 새로 읽은 목록 확인을 안내한다', async () => {
  const src = read('wc/51-todo.js');
  const EXPECTED = '통신 오류 또는 응답 지연으로 반영됐는지 확인하지 못했습니다. 새로 읽은 목록을 먼저 확인해 주세요.';

  function makeTodoEnv(gwOverrides = {}) {
    const toasts = [];
    let reloadForces = 0;
    const item = {
      id: 'td1', title: '기존 할 일', due: '2026-11-28', start: '2026-11-28', imp: '0', rate: 0, dday: false,
      memo: '메모', meta: {}, contents: '메모', canProgress: true, readonly: false, files: 0, done: false,
      checklist: [{id: 'td2', title: '세부 항목', done: false}],
    };
    const subInput = {value: '새 세부', disabled: false, focus() {}};
    const ctx = {
      R: {...B, ...TP}, S: {view: 'other', settings: {}, todos: []}, store: {get: () => null, set: () => true},
      HOME_ACTS: {}, currentKey: 'u1', today: () => '2026-11-27',
      $: q => (q === '#tdeSub' ? subInput : null),
      root: {querySelector: () => null},
      esc: s => String(s ?? ''), ic: () => '', pgh: () => '', won: n => String(n),
      toast: m => toasts.push(m), logError() {}, saveLocal() {}, renderMain() {}, renderNav() {},
      GW: {
        todoList: async () => {
          reloadForces++;
          return {todos: [{todoSeq: 'td1', todoName: '기존 할 일', startDate: '20261128', endDate: '20261128', todoStatus: '0', processRate: 0, importDegree: '0', contents: '메모', todoLevel: 1, ownerEmpSeq: '1', createEmpSeq: '1', loginUserTodoOwnerYn: 'Y', loginUserTodoCreateYn: 'Y', children: [{todoSeq: 'td2', todoName: '세부 항목', todoStatus: '0', todoLevel: 2}]}], total: 1, complete: true, at: '2026-11-27T00:00:00Z', url: ''};
        },
        ...gwOverrides,
      },
    };
    vm.createContext(ctx);
    vm.runInContext(src + '\nthis.api={TD,todoSave,todoToggle,todoRemove,HOME_ACTS};', ctx);
    ctx.api.TD.list = [item];
    ctx.api.TD.lastLoad = Date.now();
    ctx.api.TD.cached = false;
    ctx.api.TD.sel = 'td1';
    return {api: ctx.api, toasts, reloads: () => reloadForces};
  }

  const unknownErr = () => Promise.reject(Object.assign(new Error('통신 오류'), {code: 'UNKNOWN'}));
  const env = makeTodoEnv({
    todoSetImportance: unknownErr,
    todoSetProgress: unknownErr,
    todoUpdate: unknownErr,
    todoSetDone: unknownErr,
    todoDelete: unknownErr,
    todoCreate: unknownErr,
  });

  const rImp = await env.api.todoSave('td1', {importance: '2'});
  assert.equal(rImp.ok, false);
  assert.equal(rImp.text, EXPECTED);

  const rBody = await env.api.todoSave('td1', {title: '바뀐 제목'});
  assert.equal(rBody.ok, false);
  assert.equal(rBody.text, EXPECTED);

  const rTog = await env.api.todoToggle('td1');
  assert.equal(rTog.ok, false);
  assert.equal(rTog.text, EXPECTED);

  const rRem = await env.api.todoRemove('td1');
  assert.equal(rRem.ok, false);
  assert.equal(rRem.text, EXPECTED);

  await env.api.HOME_ACTS.tdSubAdd();
  await env.api.HOME_ACTS.tdSubToggle({dataset: {id: 'td2'}});
  await env.api.HOME_ACTS.tdSubDel({dataset: {id: 'td2'}});
  assert.deepEqual(env.toasts, [EXPECTED, EXPECTED, EXPECTED]);
  for (const m of [rImp.text, rBody.text, rTog.text, rRem.text, ...env.toasts]) {
    assert.doesNotMatch(m, /저장하지 못했습니다|지우지 못했습니다/);
  }
  assert.ok(env.reloads() >= 7, '미확인 오류마다 목록 새로 읽기를 수행한다');

  // 확정 실패(SAVE_FAILED)는 기존 실패 문구 유지
  const failErr = () => Promise.reject(Object.assign(new Error('권한 없음'), {code: 'SAVE_FAILED'}));
  const env2 = makeTodoEnv({todoUpdate: failErr, todoDelete: failErr});
  assert.match((await env2.api.todoSave('td1', {title: '제목'})).text, /^그룹웨어에 저장하지 못했습니다:/);
  assert.match((await env2.api.todoRemove('td1')).text, /^지우지 못했습니다:/);
});

// ---------- 3. showDraftReport 본문·기록물철 실패 시 오해 소지 노트 제거 ----------
const GUARD = (() => {
  const s = read('wc/15-overlays-palette-help-menus.js');
  return s.slice(s.indexOf('  let ovMarkSeq'), s.indexOf('  const fontStep'));
})();

function fakeOverlay() {
  let html = '', child = null;
  return {
    get innerHTML() { return html; },
    set innerHTML(v) {
      html = String(v);
      child = html.trim() ? {dataset: {}, dlg: {scrollTop: 0}, list: {scrollTop: 0}} : null;
    },
    get firstElementChild() { return child; },
  };
}

test('showDraftReport: 본문 실패 시 승계 노트를 결과 창과 작업 내역에서 모두 제거하고, 본문 없는 기안은 노트를 유지한다', () => {
  const s = read('wc/19-draft-engine.js');
  const part = s.slice(s.indexOf('  function showDraftReport'), s.indexOf('  // ---------- 결과보고: 계획서를 이어받아 작성'));
  const runReport = () => {
    const overlay = fakeOverlay(), logged = [], toasts = [];
    const ctx = {
      S: {paletteOpen: false}, $: q => (q === '#overlay' ? overlay : null),
      root: {querySelector: () => null}, ic: () => '', esc: v => String(v ?? ''),
      toast: m => toasts.push(m), getActionHistory: () => logged,
      logActionRecord: r => { const rec = {...r, id: 'a1'}; logged.unshift(rec); return rec; },
    };
    const show = vm.runInNewContext(GUARD + '\n' + part + '\n;showDraftReport', ctx);
    return {overlay, logged, show};
  };

  const SAFE = {name: '안전장치', keep: 1, ok: true, detail: '상신 전 멈춤'};
  const planNotes = [
    '본문 뼈대: 과거 계획서 “가나”의 서식을 이어받았습니다. 항목 값은 직접 채워 주세요.',
    '1번 관련 문서번호는 그 계획서의 근거를 그대로 가져왔습니다. 이번 사업에 맞는지 확인하세요.',
    '붙임 파일명·개수와 소요예산 문구는 실제 결과에 맞게 확인하세요.',
    '기록물철은 제목이 비슷한 과거 문서를 보고 골랐습니다. 맞는지 확인하세요.',
    '메일 원문을 붙임으로 넣으려면 메일을 PDF로 저장해 첨부하세요.',
  ];

  // 제목은 성공했지만 본문과 기록물철이 실패한 경우
  const r1 = runReport();
  r1.show('2026년 가나 운영계획', [
    {name: '제목', ok: true, detail: '일치'},
    {name: '기록물철', ok: false, detail: '적용 안 함'},
    {name: '본문', ok: false, detail: '한글 에디터를 찾지 못했습니다'},
    SAFE,
  ], planNotes);
  assert.doesNotMatch(r1.overlay.innerHTML, /이어받았습니다|그대로 가져왔습니다|붙임 파일명|기록물철은 제목이 비슷한/);
  assert.doesNotMatch(r1.logged[0].details, /이어받았습니다|그대로 가져왔습니다|붙임 파일명|기록물철은 제목이 비슷한/);
  assert.match(r1.overlay.innerHTML, /메일 원문을 붙임으로 넣으려면/);
  assert.match(r1.logged[0].details, /메일 원문을 붙임으로 넣으려면/);

  // 본문과 기록물철이 모두 성공한 경우에는 승계 안내가 정상 표시된다
  const r2 = runReport();
  r2.show('2026년 가나 운영계획', [
    {name: '제목', ok: true, detail: '일치'},
    {name: '기록물철', ok: true, detail: '일반철'},
    {name: '본문', ok: true, detail: '6줄 기입'},
    SAFE,
  ], planNotes);
  assert.match(r2.overlay.innerHTML, /서식을 이어받았습니다/);
  assert.match(r2.overlay.innerHTML, /기록물철은 제목이 비슷한/);

  // 본문 단계 자체가 없는 기안(물품 품의 등)은 안내 문구가 그대로 유지된다
  const r3 = runReport();
  r3.show('물품 구입', [{name: '제목', ok: true, detail: '일치'}, SAFE], ['물품 내역·금액은 양식의 표에 직접 입력하세요.']);
  assert.match(r3.overlay.innerHTML, /물품 내역·금액은 양식의 표에 직접 입력하세요/);
  assert.equal(r3.logged[0].details, '물품 내역·금액은 양식의 표에 직접 입력하세요.');
});

// ---------- 4. openResultPlanPicker 즉시 렌더·덮개 가드·스크롤·실패 표시 ----------
function pickerSetup({docs = {}, gatedVal = false} = {}) {
  const s = read('wc/19-draft-engine.js');
  const part = s.slice(s.indexOf('  // ---------- 결과보고 대상(미작성 계획서) 선별'), s.indexOf('  // ---------- 새 기안 창 열기 / 채우기'));
  const overlay = fakeOverlay();
  let pending = [];
  const storeDocs = {...docs};
  const ctx = {
    S: {paletteOpen: false},
    gated: () => gatedVal,
    closeOverlay: () => { ctx.S.paletteOpen = false; overlay.innerHTML = ''; },
    ic: () => '',
    esc: v => String(v ?? ''),
    R: B,
    patLoad: () => ({docs: storeDocs}),
    learnPatterns: () => new Promise((r, j) => pending.push({r, j})),
    $: q => {
      if (q === '#overlay') return overlay;
      if (q === '#overlay .dlg') return overlay.firstElementChild?.dlg || null;
      if (q === '#planPickerList') return overlay.firstElementChild?.list || null;
      return null;
    },
  };
  const open = vm.runInNewContext(GUARD + '\n' + part + '\n;openResultPlanPicker', ctx);
  return {
    overlay, ctx, storeDocs, open,
    resolveAll: (res = {done: 0, errors: 0, left: 0}) => { pending.forEach(x => x.r(res)); pending = []; },
    resolveFirst: (res = {done: 0, errors: 0, left: 0}) => pending.shift().r(res),
    rejectAll: msg => { pending.forEach(x => x.j(new Error(msg))); pending = []; },
  };
}

test('openResultPlanPicker: 학습 문서가 있으면 즉시 후보를 그리고 새 문서 확인 중을 표시하며 스크롤을 지킨다', async () => {
  const docs = {
    p1: {id: 'p1', title: '2026년 청소년 포럼 운영계획', docNo: '전략-10', binder: '포럼철', form: '일반기안문', date: '2026-10-01'},
  };
  const h = pickerSetup({docs});
  const p = h.open();
  assert.doesNotMatch(h.overlay.innerHTML, /분석하고 있습니다/);
  assert.match(h.overlay.innerHTML, /2026년 청소년 포럼 운영계획/);
  assert.match(h.overlay.innerHTML, /새 문서 확인 중/);
  h.overlay.firstElementChild.list.scrollTop = 180;
  h.overlay.firstElementChild.dlg.scrollTop = 60;
  h.resolveAll({done: 1, errors: 0, left: 0});
  await p;
  assert.doesNotMatch(h.overlay.innerHTML, /새 문서 확인 중/);
  assert.match(h.overlay.innerHTML, /2026년 청소년 포럼 운영계획/);
  assert.equal(h.overlay.firstElementChild.list.scrollTop, 180);
  assert.equal(h.overlay.firstElementChild.dlg.scrollTop, 60);
});

test('openResultPlanPicker: 분석 중 닫기·다른 창 전환·재열기 시 이전 비동기 작업이 덮어쓰지 않는다', async () => {
  // 닫기
  const h1 = pickerSetup();
  const p1 = h1.open();
  assert.match(h1.overlay.innerHTML, /분석하고 있습니다/);
  h1.ctx.closeOverlay();
  h1.resolveAll();
  await p1;
  assert.equal(h1.overlay.innerHTML, '');

  // 다른 창 전환
  const h2 = pickerSetup({docs: {p1: {id: 'p1', title: '2026년 가나 운영계획', docNo: 'A-1', binder: '철', form: '일반기안문'}}});
  const p2 = h2.open();
  h2.overlay.innerHTML = '<div>다른 창</div>';
  h2.resolveAll();
  await p2;
  assert.equal(h2.overlay.innerHTML, '<div>다른 창</div>');

  // 다시 열기: 첫 호출이 먼저 끝나도 새 창을 덮어쓰지 않는다
  const h3 = pickerSetup();
  const first = h3.open();
  const second = h3.open();
  h3.resolveFirst({done: 0, errors: 0, left: 0});
  await first;
  assert.match(h3.overlay.innerHTML, /분석하고 있습니다/);
  h3.resolveAll({done: 0, errors: 0, left: 0});
  await second;
  assert.match(h3.overlay.innerHTML, /미작성 계획서를 찾지 못했습니다/);
});

test('openResultPlanPicker: 확인 중·목록 실패·미확인 문서가 있을 때 단정하지 않고 role="status"로 알린다', async () => {
  // 캐시는 있으나 후보 계획서가 0건일 때 확인 중에는 단정하지 않는다
  const h1 = pickerSetup({docs: {r1: {id: 'r1', title: '일반 협조문', binder: '철', form: '일반기안문'}}});
  const p1 = h1.open();
  assert.doesNotMatch(h1.overlay.innerHTML, /미작성 계획서를 찾지 못했습니다/);
  assert.match(h1.overlay.innerHTML, /확인 중/);
  h1.resolveAll({done: 0, errors: 0, left: 0});
  await p1;
  assert.match(h1.overlay.innerHTML, /미작성 계획서를 찾지 못했습니다/);

  // 목록 조회 실패(errMsg / reject)
  const h2 = pickerSetup();
  const p2 = h2.open();
  h2.rejectAll('네트워크 단절');
  await p2;
  assert.match(h2.overlay.innerHTML, /role="status"/);
  assert.match(h2.overlay.innerHTML, /문서 목록을 읽지 못했습니다\(네트워크 단절\)/);
  assert.doesNotMatch(h2.overlay.innerHTML, /미작성 계획서를 찾지 못했습니다/);

  // 일부 문서 미확인(errors + left > 0)
  const h3 = pickerSetup();
  const p3 = h3.open();
  h3.resolveAll({done: 4, errors: 2, left: 3});
  await p3;
  assert.match(h3.overlay.innerHTML, /role="status"/);
  assert.match(h3.overlay.innerHTML, /확인하지 못한 문서 5건/);
  assert.doesNotMatch(h3.overlay.innerHTML, /미작성 계획서를 찾지 못했습니다/);
});

// ---------- 5. 19b-payment-goods.js option 하드코딩 색상 제거 ----------
test('19b-payment-goods.js: payForm 근거 계획서 option에 하드코딩 색상(color:#111)이 없다', () => {
  const s = read('wc/19b-payment-goods.js');
  assert.doesNotMatch(s, /style="color:#111"/);
  const from = s.indexOf('  const ownDocs'), to = s.indexOf('  // 근거 계획서를 바꾸면');
  const overlay = fakeOverlay();
  const ctx = {
    S: {}, ic: () => '', esc: v => String(v ?? ''), R: B,
    patLoad: () => ({
      docs: {
        b1: {id: 'b1', title: '강사료 지급 건의', docNo: '전략-2', binder: '철', form: '일반기안문', refs: ['전략-1(계획)']},
        p1: {id: 'p1', title: '2026년 포럼 운영계획', docNo: '전략-1', binder: '철', form: '일반기안문', date: '2026-10-01'},
      },
    }),
    $: q => (q === '#overlay' ? overlay : null),
  };
  const payForm = vm.runInNewContext(s.slice(from, to) + '\n;payForm', ctx);
  payForm('b1');
  assert.match(overlay.innerHTML, /<option value="p1" selected>2026년 포럼 운영계획 \(전략-1\)<\/option>/);
});
