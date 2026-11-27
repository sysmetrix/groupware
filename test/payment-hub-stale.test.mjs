import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// 지급 문서(지출결의 준비) 창: 분석(learnPatterns)을 기다리는 동안 사용자가 창을 닫으면 끝난 뒤 저절로 다시 뜨지 않아야 한다.
// 조회 실패와 확인하지 못한 범위는 숨기지 않고, 읽어 둔 문서가 있으면 기다리지 않고 바로 그린다.
const read = f => readFileSync(new URL('../src/live/wc/' + f, import.meta.url), 'utf8');
const source = read('19b-payment-goods.js');
const from = source.indexOf('  const ownDocs'), to = source.indexOf('  function payForm');
const body = source.slice(from, to);
const g15 = read('15-overlays-palette-help-menus.js');
const guard = g15.slice(g15.indexOf('  let ovMarkSeq'), g15.indexOf('  const fontStep'));

test('검사할 구간을 찾았다', () => { assert.ok(from >= 0 && to > from); assert.match(guard, /function overlayLive/); });

function fakeOverlay() {
  let html = '', child = null;
  return {
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); child = html.trim() ? {dataset: {}, dlg: {scrollTop: 0}} : null; }, // 새 창마다 스크롤은 0에서 시작
    get firstElementChild() { return child; },
  };
}

const OK = {done: 0, errors: 0, left: 0};
function setup({docs = {}, props = []} = {}) {
  const overlay = fakeOverlay();
  let release = [];
  const ctx = {
    S: {},
    gated: () => false,
    closeOverlay: () => { overlay.innerHTML = ''; },
    ic: () => '',
    esc: s => String(s),
    learnPatterns: () => new Promise((r, j) => release.push({r, j})),
    patLoad: () => ({docs}),
    R: {listProposals: () => props, pendingPayments: () => [], proposalAmount: () => 0, moneyKo: () => ''},
    GW: {links: {route: () => ''}, routes: {expenseEntry: ''}},
    root: {querySelector: () => null},
    $: sel => (sel === '#overlay' ? overlay : sel === '#overlay .dlg' ? overlay.firstElementChild?.dlg || null : null)
  };
  const open = runInNewContext(guard + body + ';openPaymentHub', ctx);
  return {overlay, open, ctx,
    finish: (res = OK) => { release.forEach(x => x.r(res)); release = []; },
    finishFirst: (res = OK) => release.shift().r(res),
    failAll: () => { release.forEach(x => x.j(new Error('조회 실패'))); release = []; }};
}

test('지급 문서 창을 분석 중에 닫으면 다시 그리지 않는다', async () => {
  const {overlay, open, finish, ctx} = setup();
  const p = open();
  assert.match(overlay.innerHTML, /분석하고 있습니다/);
  ctx.closeOverlay();
  finish(); await p;
  assert.equal(overlay.innerHTML, '');
});

test('다른 창으로 바뀌었으면 덮어쓰지 않는다', async () => {
  const {overlay, open, finish} = setup();
  const p = open();
  overlay.innerHTML = '<div>다른 창</div>';
  finish(); await p;
  assert.equal(overlay.innerHTML, '<div>다른 창</div>');
});

test('열어 둔 채 기다리면 결과를 그린다', async () => {
  const {overlay, open, finish} = setup();
  const p = open();
  finish(); await p;
  assert.match(overlay.innerHTML, /지급 건의 새로 작성/);
  assert.match(overlay.innerHTML, /학습된 지급 건의가 없습니다/);
  assert.doesNotMatch(overlay.innerHTML, /확인 중|읽지 못했습니다/);
});

test('다시 열었으면 앞선 분석은 새 창을 덮지 않고 새 창만 그린다', async () => {
  const {overlay, open, finish, finishFirst} = setup();
  const first = open();
  const second = open();
  finishFirst(); await first;
  assert.match(overlay.innerHTML, /분석하고 있습니다/, '앞선 분석이 새 창을 결과로 덮으면 안 된다');
  finish(); await second;
  assert.match(overlay.innerHTML, /지급 건의 새로 작성/);
});

test('목록 조회가 실패하면 "없습니다" 대신 실패와 확인 범위를 보인다', async () => {
  const {overlay, open, finish} = setup();
  const p = open();
  finish({done: 0, errors: 1, errMsg: '서버 응답 없음'}); await p;
  assert.match(overlay.innerHTML, /문서 목록을 읽지 못했습니다\(서버 응답 없음\)/);
  assert.match(overlay.innerHTML, /전에 읽어 둔 0건만 보입니다/);
  assert.match(overlay.innerHTML, /role="status"/);
  assert.doesNotMatch(overlay.innerHTML, /학습된 지급 건의가 없습니다|지출결의서가 필요한 문서가 없습니다/);
});

test('일부 문서를 못 읽었거나 시간 안에 다 못 읽었으면 그 건수를 보인다', async () => {
  const {overlay, open, finish} = setup();
  const p = open();
  finish({done: 3, errors: 2, left: 4}); await p;
  assert.match(overlay.innerHTML, /확인하지 못한 문서 6건/);
  assert.doesNotMatch(overlay.innerHTML, /학습된 지급 건의가 없습니다/);
});

test('분석이 예외로 끝나도 열려 있는 창에 실패를 그린다', async () => {
  const {overlay, open, failAll} = setup();
  const p = open();
  failAll(); await p;
  assert.match(overlay.innerHTML, /지급 건의 새로 작성/);
  assert.match(overlay.innerHTML, /읽지 못했습니다/);
});

test('읽어 둔 문서가 있으면 기다리지 않고 바로 그리고, 새 문서 확인 중임을 작게 보인다', async () => {
  const docs = {d1: {id: 'd1', title: '가나 운영비 지급 건의', binder: '가'}};
  const {overlay, open, finish} = setup({docs, props: [{id: 'd1', title: '가나 운영비 지급 건의', docNo: 'A-1', binder: '가'}]});
  const p = open();
  assert.doesNotMatch(overlay.innerHTML, /분석하고 있습니다/);
  assert.match(overlay.innerHTML, /가나 운영비 지급 건의/);
  assert.match(overlay.innerHTML, /새 문서 확인 중/);
  finish(); await p;
  assert.match(overlay.innerHTML, /가나 운영비 지급 건의/);
  assert.doesNotMatch(overlay.innerHTML, /새 문서 확인 중/);
});

test('바로 그린 창을 확인 중에 닫으면 확인이 끝나도 다시 뜨지 않는다', async () => {
  const {overlay, open, finish, ctx} = setup({docs: {d1: {id: 'd1'}}});
  const p = open();
  assert.match(overlay.innerHTML, /새 문서 확인 중/);
  ctx.closeOverlay();
  finish(); await p;
  assert.equal(overlay.innerHTML, '');
});

test('막힌 기능이면 열려 있던 창을 건드리지 않는다', async () => {
  const {overlay, open, ctx} = setup();
  overlay.innerHTML = '<div>다른 창</div>';
  ctx.gated = () => true;
  await open();
  assert.equal(overlay.innerHTML, '<div>다른 창</div>');
});

// learnPatterns는 한도(개수·시간) 때문에 이번에 읽지 못한 문서 수(left)를 돌려줘야 창이 확인하지 못한 범위를 보일 수 있다.
test('learnPatterns: 읽은 것·못 읽은 것·남은 것을 따로 돌려준다', async () => {
  const src = read('19-draft-engine.js');
  const a = src.indexOf('  async function learnPatterns'), end = '  return learning;\n  }';
  const b = src.indexOf(end, a) + end.length;
  assert.ok(a >= 0 && b > a);
  const docs = Array.from({length: 20}, (_, i) => ({docId: 'd' + i, tiKeyCode: '1', title: 't' + i}));
  const saved = [];
  const ctx = {
    learning: null, HR_FORMS: /^(36)$/, GW: {submittedRange: async () => ({docs})}, patLoad: () => ({docs: {d0: {}}}),
    readDocPattern: async d => (d.id === 'd3' ? {err: '읽기 실패'} : {id: d.id}), patSaveDoc: d => saved.push(d.id), toast() {}, logError() {}, Date
  };
  const learn = runInNewContext(src.slice(a, b) + ';learnPatterns', ctx);
  const r = await learn({limit: 12, quiet: true});
  assert.deepEqual({...r}, {done: 11, errors: 1, left: 7});
  ctx.GW.submittedRange = async () => { throw new Error('목록 실패'); };
  const f = await learn({limit: 12});
  assert.equal(f.errMsg, '목록 실패');
});

test('확인이 끝나기 전에는 "없습니다"로 단정하지 않는다', async () => {
  const {overlay, open, finish} = setup({docs: {d1: {id: 'd1'}}});
  const p = open();
  assert.match(overlay.innerHTML, /새 문서 확인 중/);
  assert.doesNotMatch(overlay.innerHTML, /지출결의서가 필요한 문서가 없습니다|학습된 지급 건의가 없습니다/);
  assert.match(overlay.innerHTML, /읽어 둔 문서에는 없습니다\(확인 중\)/);
  finish(); await p;
  assert.match(overlay.innerHTML, /지출결의서가 필요한 문서가 없습니다/);
});

test('바로 그린 목록을 내려 보던 중 확인이 끝나 다시 그려도 스크롤 위치를 지킨다', async () => {
  const {overlay, open, finish} = setup({docs: {d1: {id: 'd1'}}});
  const p = open();
  const before = overlay.firstElementChild;
  before.dlg.scrollTop = 240;
  finish(); await p;
  assert.notEqual(overlay.firstElementChild, before, '다시 그렸다');
  assert.equal(overlay.firstElementChild.dlg.scrollTop, 240);
});
