import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {maskSensitive} from '../src/live/briefing.mjs';
const code = readFileSync(new URL('../src/live/wc/40-result-evidence.js',import.meta.url),'utf8');
const plan={id:'p',docNo:'사업팀-12',title:'별빛연구회 운영계획',body:'계획 인원: 100명'};
const evidence={id:'e',docNo:'사업팀-14',title:'별빛연구회 정산보고',binder:'교육',refs:['사업팀-12(운영계획)'],body:'실제 장소: 회의실\n실제 참여 인원: 8명\n실제 집행 금액: 45,000원\n계획 예산: 200,000원'};
const group=items=>({items,reliableTotal:items.length});
function setup({docs=[],complete=[],search=async()=>({groups:{doc:group([]),mail:group([])}})}={}) {
  const calls=[], submitted={docs:complete.map(d=>({docId:d.id,docNo:d.docNo,status:'결재완료'}))};
  const ctx={currentKey:'u',getUserKey:()=>ctx.currentKey, R:{maskSensitive}, S:{raw:{data:{approval:{lists:{submitted}}}}}, patLoad:()=>({docs:Object.fromEntries(docs.map(d=>[d.id,d]))}),GW:{search:(q,opt)=>{calls.push([q,opt]);return search(q,opt)}}};
  vm.runInNewContext(code,ctx);return {ctx,calls,run:async(p=plan)=>JSON.parse(JSON.stringify(await ctx.resultEvidence(p)))};
}
test('확인된 참조 문서의 명시된 실제 값만 출처 인덱스와 함께 제시하고 입력값은 바꾸지 않는다',async()=>{
  const {run,calls}=setup({docs:[plan,evidence],complete:[evidence]});const result=await run();
  assert.equal(result.sources[0].kind,'선택한 계획서');assert.deepEqual(result.suggestions.map(x=>[x.index,x.value,x.sourceIndex]),[[1,'회의실',1],[2,'8명',1],[3,'45,000원',1]]);
  assert.ok(result.sources[1].excerpt.includes('실제 집행 금액: 45,000원'));assert.equal(plan.body,'계획 인원: 100명');assert.deepEqual(calls.map(x=>x[0]),['사업팀-12','별빛연구회']);assert.ok(calls.every(x=>x[1].types.join(',')==='doc,mail'));
});
test('서로 다른 문서번호의 일부가 일치해도 연결하지 않고 검색 결과나 계획·품의를 실적으로 해석하지 않는다',async()=>{
  const docs=['사업팀-120','다른사업팀-12','사업팀-12-1'].map((v,i)=>({...evidence,id:'x'+i,docNo:'관련-'+i,refs:[v+'(참조)'],title:'타 사업 정산보고'}));
  const request={...evidence,id:'req',docNo:'사업팀-15',title:'별빛연구회 정산보고 계획(안)'};
  const {run}=setup({docs:[...docs,request],complete:[...docs,request],search:async()=>({groups:{doc:group([{title:'별빛연구회 결과보고',docNo:'외부-1',text:'실제 참여 인원: 100명'}]),mail:group([{title:'별빛연구회 실적',uid:'1',box:'업무',snippet:'사업팀-12 실제 집행 금액: 123원'}])}})});
  const r=await run(); assert.equal(r.sources.length,4);assert.deepEqual(r.suggestions,[]);assert.ok(!r.sources.some(s=>s.excerpt.includes('123원')));
});
test('서로 다른 출처의 충돌 값은 추천하지 않고 같은 값은 유지한다', async()=>{
  const second={...evidence,id:'e2',docNo:'사업팀-15',body:'실제 참여 인원: 9명\n실제 집행 금액: 45,000원'};
  const r=await setup({docs:[evidence,second],complete:[evidence,second]}).run();assert.ok(!r.suggestions.some(x=>x.index===2));assert.ok(r.suggestions.some(x=>x.index===3));assert.match(r.scope,/값이 다른 항목: 인원/);
});
test('미확정 승인, 예정·미확인 수치와 실패한 검색은 실적 또는 0으로 확정하지 않는다',async()=>{
  const a=await setup({docs:[evidence]}).run();assert.deepEqual(a.suggestions,[]);
  const b={...evidence,body:'실제 참여 인원: 8명 예정\n실제 집행 금액: [확인 필요]\n실제 주요 성과: 예시 기재'};
  const r=await setup({docs:[b],complete:[b],search:async()=>{throw Error('unavailable')}}).run();assert.deepEqual(r.suggestions,[]);assert.match(r.scope,/조회 실패/);
});
test('비동기 검색 대기 중 계정이 바뀌면 기준 문서도 반환하지 않는다',async()=>{
 let ctx;const obj=setup({docs:[evidence],complete:[evidence],search:async()=>{ctx.currentKey='other';return {groups:{}}}});ctx=obj.ctx;
 const r=await obj.run();assert.deepEqual(r.sources,[]);assert.deepEqual(r.suggestions,[]);assert.match(r.scope,/계정/);
});

test('여러 계획에 걸친 보고서는 참고만 제공하고 합산 실적으로 배정하지 않는다', async()=>{
  const joint={...evidence,refs:[...evidence.refs,'다른팀-3(사업)']};
  const r=await setup({docs:[joint],complete:[joint]}).run();assert.equal(r.sources.length,2);assert.deepEqual(r.suggestions,[]);
});
