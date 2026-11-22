// v1.19.2 작업 중 미뤄 둔 새 자료를 손을 뗀 뒤 알아서 반영한다("지금 반영"을 누르지 않아도 됨)
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = f => readFileSync(new URL('../src/live/wc/' + f, import.meta.url), 'utf8');
const keys = read('04-timers-keys.js');
const code = keys.slice(keys.indexOf('  let pendingIdleAt = 0;'), keys.indexOf('  const pendingTimer ='));

function setup({busy = false} = {}) {
  const calls = {render: 0, reanalyze: 0, budget: 0};
  const S = {open: true, pendingRefresh: true, pendingReanalyze: false, loading: false, raw: {}};
  const ctx = {S, busy, now: 0};
  const fn = new Function('S', 'isUserBusy', 'render', 'reanalyze', 'applyDeferredBudgetInvalidation', 'Date',
    code + '\nreturn {autoApplyPending, applyPendingRefresh};');
  const api = fn(S, () => ctx.busy, () => calls.render++, () => calls.reanalyze++, () => calls.budget++, {now: () => ctx.now});
  return {S, ctx, calls, api};
}

test('작업이 끝나고 잠깐 조용하면 미뤄 둔 자료를 자동 반영한다', () => {
  const {S, ctx, calls, api} = setup({busy: true});
  ctx.now = 1000; api.autoApplyPending();
  assert.equal(calls.render, 0, '작업 중에는 화면을 그대로 둔다');
  ctx.busy = false;
  ctx.now = 2000; api.autoApplyPending();
  assert.equal(calls.render, 0, '손을 뗀 직후에는 바로 바꾸지 않는다');
  ctx.now = 3600; api.autoApplyPending();
  assert.equal(calls.render, 1);
  assert.equal(calls.budget, 1);
  assert.equal(S.pendingRefresh, false);
  ctx.now = 9000; api.autoApplyPending();
  assert.equal(calls.render, 1, '반영 뒤에는 다시 그리지 않는다');
});

test('조용히 기다리는 사이 다시 작업을 시작하면 처음부터 다시 센다', () => {
  const {ctx, calls, api} = setup();
  ctx.now = 1000; api.autoApplyPending();
  ctx.busy = true; ctx.now = 2000; api.autoApplyPending();
  ctx.busy = false; ctx.now = 2600; api.autoApplyPending();
  ctx.now = 3000; api.autoApplyPending();
  assert.equal(calls.render, 0);
  ctx.now = 4200; api.autoApplyPending();
  assert.equal(calls.render, 1);
});

test('비서가 닫혀 있거나 읽는 중이면 반영하지 않는다', () => {
  const {S, ctx, calls, api} = setup();
  S.open = false;
  for (const t of [1000, 3000, 5000]) { ctx.now = t; api.autoApplyPending(); }
  S.open = true; S.loading = true;
  for (const t of [6000, 8000, 10000]) { ctx.now = t; api.autoApplyPending(); }
  assert.equal(calls.render, 0);
  assert.equal(S.pendingRefresh, true);
});

test('다른 탭에서 바뀐 상태로 미뤄졌으면 반영할 때 다시 분석한다', () => {
  const {S, calls, api} = setup();
  S.pendingReanalyze = true;
  api.applyPendingRefresh();
  assert.equal(calls.reanalyze, 1);
  assert.equal(S.pendingReanalyze, false);
  const b = setup();
  b.api.applyPendingRefresh();
  assert.equal(b.calls.reanalyze, 0, '새 자료는 이미 분석돼 있으므로 다시 분석하지 않는다');
});

test('지금 반영 버튼과 종료 정리가 같은 경로를 쓴다', () => {
  assert.match(read('16-events.js'), /case 'applyRefresh': applyPendingRefresh\(\); break;/);
  assert.match(read('17-lifecycle.js'), /clearInterval\(pendingTimer\)/);
  assert.match(read('01-storage.js'), /S\.pendingRefresh = true; S\.pendingReanalyze = true;/);
  assert.match(read('05-views.js'), /작업을 마치면 알아서 반영합니다/);
});
