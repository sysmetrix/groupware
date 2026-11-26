import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {gsyncNormalizeExisting, gsyncMatch, gsyncPlan} from '../src/live/gcal-sync.mjs';
const item = {startYmd:'20261115',endYmd:'20261115',layer:'5 BWYF 근태',kind:'trip',time:'09:00~10:00',source:'attend'};
const event = {title:'관내출장(1)',cal:'5 BWYF 근태',from:'09:00',to:'10:00'};
test('calendar comparison distinguishes verified empty days from malformed and partial payloads', () => {
  for (const list of [null, {}, 'bad', ['unrecognized event'], [event, 'unrecognized event'], [{...event,from:'29:00'}], [{title:'missing calendar'}]]) {
    const ex=gsyncNormalizeExisting({days:{'20261115':list}});
    assert.equal(gsyncMatch(item,ex).level,'unknown');
    assert.deepEqual(ex.unknownDates,['20261115']);
  }
  assert.equal(gsyncMatch(item,gsyncNormalizeExisting({days:{'20261115':[]}})).level,'none');
  assert.equal(gsyncMatch(item,gsyncNormalizeExisting({days:{'20261115':[event]}})).level,'exact');
});
test('comparison caps do not establish absence, missing end time is not exact, long ranges remain unknown', () => {
  const capped=gsyncNormalizeExisting({days:{'20261115':Array(5001).fill(event)}});
  assert.equal(gsyncMatch(item,capped).level,'unknown');
  const ex=gsyncNormalizeExisting({days:{'20261115':[{...event,to:''}]}});
  assert.notEqual(gsyncMatch(item,ex).level,'exact');
  assert.equal(gsyncMatch({...item,endYmd:'20270101'}, {dates:['20261115'],records:[]}).level,'unknown');
});
test('failed imported days stay unverified and produce no orphan/cancel assertions', () => {
  const ex=gsyncNormalizeExisting({days:{'20261115':[event,'bad']}});
  const plan=gsyncPlan({me:'1', now:new Date('2026-11-15T00:00Z'), existing:ex,apps:[{empCd:'1',atNm:'관내출장',startDt:'20261115',endDt:'20261115',startTm:'0900',endTm:'1000',approState:'1',noDoc:'d'}]});
  assert.equal(plan.items[0].state,'unverified'); assert.deepEqual(plan.diffs,[]); assert.equal(plan.compared,false);
});
const source=readFileSync(new URL('../src/live/wc/24-resource.js',import.meta.url),'utf8');
// v1.26 자원 예약은 [예약하기] 한 번: 누른 순간 화면의 값(예약명·일시·내용)을 고정해 그룹웨어에 올린다.
function setup(out, {valid = true} = {}) {
  let finish, calls=0; const wait=new Promise(r=>finish=r); const sent=[];
  const s={owner:'A',date:'20261115',list:[{resSeq:'r',name:'Car',apprYn:'Y'}],sel:'r',bookings:[],busy:false,err:'',form:{title:'original',start:'09:00',end:'10:00',desc:'행선지 시청',auto:false},check:null,confirm:false,done:null,seq:0,rev:1,request:{owner:'A',date:'20261115',sel:'r'}};
  const records=[],toasts=[];
  const c={S:{res:s,view:'other'},currentKey:'A', gated:()=>false,$:()=>null,renderMain:()=>{},toast:x=>toasts.push(x),logError:()=>{},logActionRecord:x=>records.push(x),GW:{reserveResource:async a=>{calls++;sent.push(a);await wait;return out},resourceBookings:async()=>[]},R:{validateBooking:()=>(valid?{ok:true,errors:[]}:{ok:false,errors:['이미 지난 시각은 예약할 수 없습니다']}),kstNow:()=>({date:'2026-11-15'}),bookingSpanOnDay:()=>null}};
  vm.createContext(c);vm.runInContext(source+'\nthis.api={resBook,vResource};',c);
  return {c,s,records,toasts,finish,sent,calls:()=>calls,...c.api};
}
test('booking sends the on-screen title, time and 내용 in one click',async()=>{
  const h=setup({ok:true,needsApproval:true});const pending=h.resBook({isTrusted:true});h.finish();await pending;
  assert.equal(h.calls(),1);assert.deepEqual(JSON.parse(JSON.stringify(h.sent[0])),{resSeq:'r',title:'original',start:'202611150900',end:'202611151000',desc:'행선지 시청'});
  assert.match(h.s.done.head,/승인 대기/);assert.match(h.s.done.text,/2026-11-15\(일\) 09:00~10:00/);
});
test('invalid or past time is stopped before anything is sent',async()=>{
  const h=setup({ok:true},{valid:false});await h.resBook({isTrusted:true});assert.equal(h.calls(),0);assert.match(h.s.check.errors[0],/이미 지난 시각/);
  const u=setup({ok:true});await u.resBook({isTrusted:false});assert.equal(u.calls(),0,'사람이 직접 누른 클릭만');
});
test('booking completion and audit use submitted values when current form changes',async()=>{
  const h=setup({ok:true});const pending=h.resBook({isTrusted:true});h.s.date='20261116';h.s.form.start='12:00';h.s.form.title='next booking';h.s.rev++;h.finish();await pending;
  assert.match(h.records[0].summary,/2026-11-15 09:00~10:00/);assert.equal(h.s.form.title,'next booking');
});
test('typing a new title during confirmation preserves it after the previous booking succeeds',async()=>{
  const h=setup({ok:true}); const pending=h.resBook({isTrusted:true});
  const input={id:'resTitle',value:'next booking'};
  h.c.$ = sel => sel === '#resTitle' ? input : null;
  const events=readFileSync(new URL('../src/live/wc/16-events.js',import.meta.url),'utf8');
  const line=events.split('\n').find(l=>l.includes("if (t.id === 'resTitle')"));
  assert.ok(line); h.c.t=input; vm.runInContext(line,h.c);
  h.finish(); await pending; assert.equal(h.s.form.title,'next booking');
});
test('unproven timeout success remains unknown and is not logged as saved',async()=>{
  const h=setup({ok:true,verifiedAfterTimeout:true});const pending=h.resBook({isTrusted:true});h.finish();await pending;assert.equal(h.s.done,null);assert.equal(h.records.length,0);assert.match(h.s.check.errors[0],/저장 여부 미확인/);
});
test('late booking response cannot write into a different account state',async()=>{
  const h=setup({ok:true});const pending=h.resBook({isTrusted:true});h.c.currentKey='B';h.c.S.res={date:'new'};h.finish();await pending;assert.deepEqual(h.c.S.res,{date:'new'});assert.equal(h.records.length,0);
});test('calendar/resource controls expose selected, expanded and live status semantics',()=>{
  const sync=readFileSync(new URL('../src/live/wc/34-gsync.js',import.meta.url),'utf8');
  const gcal=readFileSync(new URL('../src/live/wc/28-gcal.js',import.meta.url),'utf8');
  for(const text of [source,sync,gcal]) assert.match(text,/aria-pressed/);
  assert.match(sync,/aria-controls/); assert.match(source,/aria-live="polite"/);assert.match(gcal,/aria-describedby="gcalHelp"/);
  new vm.Script('(function(){'+sync+'})');new vm.Script('(function(){'+gcal+'})');
});
