import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// 지급 문서 창: 분석(learnPatterns)을 기다리는 동안 사용자가 창을 닫으면 끝난 뒤 저절로 다시 뜨지 않아야 한다.
const source = readFileSync(new URL('../src/live/wc/19b-payment-goods.js', import.meta.url), 'utf8');
const from = source.indexOf('  const ownDocs'), to = source.indexOf('  function payForm');
const body = source.slice(from, to);

test('검사할 구간을 찾았다', () => { assert.ok(from >= 0 && to > from); });

function setup() {
  const overlay = {innerHTML: ''};
  let release = [];
  const ctx = {
    S: {},
    gated: () => false,
    closeOverlay: () => { overlay.innerHTML = ''; },
    ic: () => '',
    esc: s => String(s),
    won0: () => '-',
    learnPatterns: () => new Promise((r, j) => release.push({r, j})),
    patLoad: () => ({docs: {}}),
    R: {listProposals: () => [], pendingPayments: () => [], proposalAmount: () => 0, moneyKo: () => ''},
    GW: {links: {route: () => ''}, routes: {expenseEntry: ''}},
    $: sel => {
      if (sel === '#overlay') return overlay;
      const m = /data-pay-hub="(\d+)"/.exec(sel);
      return m && overlay.innerHTML.includes(`data-pay-hub="${m[1]}"`) ? {} : null;
    }
  };
  const open = runInNewContext(body + ';openPaymentHub', ctx);
  return {overlay, open, ctx, finish: () => { release.forEach(x => x.r()); release = []; }, finishFirst: () => release.shift().r(), failAll: () => { release.forEach(x => x.j(new Error('조회 실패'))); release = []; }};
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
});

test('다시 열었으면 앞선 분석은 새 창을 덮지 않고 새 창만 그린다', async () => {
  const {overlay, open, finish, finishFirst} = setup();
  const first = open();
  const second = open();
  assert.match(overlay.innerHTML, /data-pay-hub="2"/);
  finishFirst(); await first;
  assert.match(overlay.innerHTML, /data-pay-hub="2"/);
  assert.match(overlay.innerHTML, /분석하고 있습니다/, '앞선 분석이 새 창을 결과로 덮으면 안 된다');
  finish(); await second;
  assert.match(overlay.innerHTML, /data-pay-hub="2"/);
  assert.doesNotMatch(overlay.innerHTML, /data-pay-hub="1"/);
  assert.match(overlay.innerHTML, /지급 건의 새로 작성/);
});

test('분석이 실패해도 열려 있는 창에는 그린다', async () => {
  const {overlay, open, failAll} = setup();
  const p = open();
  failAll(); await p;
  assert.match(overlay.innerHTML, /지급 건의 새로 작성/);
});

test('막힌 기능이면 열려 있던 창을 건드리지 않는다', async () => {
  const {overlay, open, ctx} = setup();
  overlay.innerHTML = '<div>다른 창</div>';
  ctx.gated = () => true;
  await open();
  assert.equal(overlay.innerHTML, '<div>다른 창</div>');
});
