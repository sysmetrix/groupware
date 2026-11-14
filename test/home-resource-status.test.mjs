import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/live/wc/25-home.js', import.meta.url), 'utf8');
async function run({fail = false, count = 5, prior = null} = {}) {
  const S = {view: 'home', homeRes: prior}; let calls = 0, renders = 0;
  const ctx = {S, allowed: () => true, R: {kstNow: () => ({date:'2026-11-14'})}, GW: {
    resourceList: async () => Array.from({length: count}, (_,i) => ({resSeq:i, name:'차량'+i})),
    resourceBookings: async () => { calls++; if (fail) throw new Error('offline'); return [{start:'202611140900',end:'202611141000',who:'사용자'}]; }
  }, logError: () => {}, renderMain: () => {renders++;}, Date};
  vm.createContext(ctx); vm.runInContext(source, ctx); ctx.homeResEnsure();
  for(let i=0;i<30 && S.homeRes.busy;i++) await new Promise(r=>setTimeout(r,5));
  return {state:S.homeRes,calls,renders,ctx};
}
test('자원 예약은 첫 네 자원만 조회한 경우 부분 범위를 밝힌다', async () => {
  const {state,calls,renders} = await run({count:5});
  assert.equal(calls,4); assert.equal(state.items.length,4); assert.equal(state.partial,true); assert.equal(state.day,'20261114'); assert.equal(state.err,''); assert.equal(renders,1);
});
test('자원 예약 오류는 이전 값을 정상 자료처럼 보이지 않는다', async () => {
  const prior={day:'20261113',at:Date.now(),items:[{label:'stale'}],busy:false};
  const {state} = await run({fail:true,prior});
  assert.equal(state.items.length,0); assert.match(state.err,/조회하지 못/); assert.equal(state.day,'20261114');
});
