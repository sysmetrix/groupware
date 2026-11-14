import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/live/collector.browser.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('  async function approvalFallback('), source.indexOf('  // Preview of an approval document'));
const kinds = ['pending', 'deptWaiting', 'distWaiting', 'sendWaiting', 'submitted', 'viewing'];
const doc = (id, no = '부서-123', date = '20261001', unread = false) => ({docId: id, docNo: no, date, unread});
const page = (docs = [], total = docs.length) => ({docs, reliableTotal: total, from: '20260101', to: '20261231'});
function harness(fn = () => page()) {
  const calls = [];
  class GwError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const ctx = {GwError, APPROVAL_LISTS: kinds.map(key => ({key})), approvalPage: async (...args) => { calls.push(args); return fn(...args); }};
  vm.createContext(ctx); vm.runInContext(code + '\nthis.run = approvalFallback;', ctx);
  return {run: ctx.run, calls};
}

test('6개 업무함 전체를 조회하고 정확한 번호, 연도 및 ID를 검사한다', async () => {
  const h = harness(kind => page(kind === 'viewing' ? [doc('1', '부서-123', '20261001', true), doc('2', '타부서-123'), doc('3', '부서-123', '20251001')] : []));
  const r = await h.run({docNo: '부서-123', year: '2026'});
  assert.equal(r.reason, 'unique'); assert.equal(r.complete, true); assert.equal(r.candidates.length, 1); assert.equal(r.candidates[0].unread, true);
  assert.deepEqual(h.calls.map(x => x[0]), kinds); assert.ok(h.calls.every(x => x[1] === 1 && x[2].size === 100));
  assert.ok(kinds.every(k => r.coverage[k].status === 'complete'));
});

test('뒤 페이지와 업무함 간 고유 ID 및 누락 연도를 확인한다', async () => {
  const filler = Array.from({length:100}, (_, i) => doc('f'+i, '다른번호'));
  let h = harness((kind, p) => kind === 'pending' ? p === 1 ? page(filler, 101) : page([doc('1')], 101) : kind === 'viewing' ? page([doc('1')]) : page());
  let r = await h.run({docNo:'부서-123', year:'2026'}); assert.equal(r.reason, 'unique'); assert.equal(r.coverage.pending.pages, 2);
  h = harness(kind => kind === 'pending' ? page([doc('1'), doc('2')]) : page());
  assert.equal((await h.run({docNo:'부서-123', year:'2026'})).reason, 'ambiguous');
  h = harness(kind => kind === 'pending' ? page([doc('1', '부서-123', '')]) : page());
  assert.equal((await h.run({docNo:'부서-123', year:'2026'})).reason, 'ambiguous');
});

test('상한, 오류, 불안정하거나 불완전한 결과를 구별한다', async () => {
  const filler = Array.from({length:100}, (_, i) => doc('f'+i, '다른번호'));
  for (const bad of [p => p === 1 ? page(filler, 101) : page([], 100), p => p === 1 ? page(filler, 101) : page([], 101), p => p === 1 ? page(filler, 101) : page([filler[0]], 101), () => ({docs:[], reliableTotal:null}), () => page([doc('')])]) {
    const h = harness((kind,p) => kind === 'pending' ? bad(p) : page());
    const r = await h.run({docNo:'부서-123',year:'2026'}); assert.equal(r.coverage.pending.status,'incomplete'); assert.equal(r.reason,'incomplete'); assert.equal(h.calls.at(-1)[0], 'viewing');
  }
  let h = harness(kind => kind === 'pending' ? page([],1001) : page());
  assert.equal((await h.run({docNo:'부서-123',year:'2026'})).coverage.pending.status,'capped');
  h = harness(kind => {if (kind === 'pending') {const e = Error('private details'); e.code='TIMEOUT'; throw e;} return page();});
  const r = await h.run({docNo:'부서-123',year:'2026'}); assert.equal(r.coverage.pending.status,'error'); assert.equal(r.coverage.pending.error,'TIMEOUT'); assert.equal(JSON.stringify(r).includes('private details'), false);
});

test('잘못된 입력을 네트워크 요청 전에 거부하고 기존 미리보기와 분리해 export한다', async () => {
  const h = harness();
  for (const q of [{year:'2026'}, {docNo:'A'}, {docNo:'A',year:'20'}, {docNo:'A',year:'2026',days:0}, {docNo:'A',year:'2026',days:Infinity}]) await assert.rejects(h.run(q), e => e.code === 'BAD_QUERY');
  assert.equal(h.calls.length,0); assert.match(source, /submittedRange, approvalPage, approvalFallback, docPreview/);
});
