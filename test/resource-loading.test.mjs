import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/live/wc/24-resource.js', import.meta.url), 'utf8');
function setup() {
  let resolveBookings, rejectBookings;
  const pending = new Promise((resolve, reject) => { resolveBookings = resolve; rejectBookings = reject; });
  const state = {view: 'resource', res: {date:'20261114', list:[{resSeq:'1',name:'차량'}], sel:'1', bookings:null, busy:false, err:'', form:{title:'',start:'09:00',end:'10:00'}, check:null, confirm:false, done:null, seq:0, rev:0}};
  const context = {S:state, allowed:()=>true, esc:String, ic:()=>'', pgh:()=>'', renderMain:()=>{}, logError:()=>{}, $:()=>null,
    GW:{links:{route:()=>''}, resourceBookings:()=>pending},
    R:{kstNow:()=>({date:'2026-11-14'}), timeOptions:()=>['09:00','10:00'], bookingSpanOnDay:(b,d)=>b.start.startsWith(d), freeSlots:(b)=>b.length ? [] : [{start:'09:00',end:'18:00'}]}};
  vm.createContext(context);
  vm.runInContext(source + '\nthis.api = {vResource, resLoad, resDay};', context);
  return {state, ...context.api, resolveBookings, rejectBookings};
}
const assertLoading = html => {
  assert.match(html, /예약 현황을 조회하는 중/);
  assert.match(html, /빈 시간을 조회하는 중/);
  assert.doesNotMatch(html, /예약이 없습니다|빈 시간이 없습니다|다가오는 예약이 없습니다|0건/);
};
test('조회 전과 진행 중에는 빈 결과로 표시하지 않고 완료 후에만 결과 표시', async () => {
  const h = setup();
  assertLoading(h.vResource());
  const loading = h.resLoad(true);
  assertLoading(h.vResource());
  h.resolveBookings([]); await loading;
  const html = h.vResource();
  assert.match(html, /예약이 없습니다/); assert.match(html, /09:00~18:00/);
  assert.match(html, /다가오는 예약이 없습니다/); assert.match(html, /0건/);
  assert.doesNotMatch(html, /조회하는 중/);
});
test('예약이 있는 결과와 빈 시간이 없는 결과는 정상 표시', async () => {
  const h = setup(); const loading = h.resLoad(true);
  h.resolveBookings([{start:'202611140900',end:'202611141000',title:'업무',who:'홍길동'}]); await loading;
  const html = h.vResource();
  assert.match(html, /업무/); assert.match(html, /홍길동/); assert.match(html, /이 날은 빈 시간이 없습니다/);
  assert.match(html, /1건/); assert.doesNotMatch(html, /조회하는 중/);
});
test('조회 실패는 빈 결과 대신 오류로 표시', async () => {
  const h = setup(); const loading = h.resLoad(true);
  h.rejectBookings(new Error('연결 실패')); await loading;
  const html = h.vResource(); assert.match(html, /연결 실패/); assert.match(html, /다시 시도/);
  assert.doesNotMatch(html, /예약이 없습니다|빈 시간이 없습니다|다가오는 예약이 없습니다/);
});
test('날짜 변경으로 이전 결과가 지워진 직후에도 조회 중 상태로 표시', () => {
  const h = setup(); h.state.res.bookings = [];
  h.resDay(1); assert.equal(h.state.res.date,'20261115'); assertLoading(h.vResource());
});
