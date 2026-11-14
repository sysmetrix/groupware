import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const collector = readFileSync(new URL('../src/live/collector.browser.js', import.meta.url),'utf8');
const ccode = collector.slice(collector.indexOf('  async function docPreview('), collector.indexOf('\n  // Forms I actually use'));
const overlays = readFileSync(new URL('../src/live/wc/15-overlays-palette-help-menus.js', import.meta.url),'utf8');
const ucode = overlays.slice(overlays.indexOf('  let docNoRequest'), overlays.indexOf('  async function makeWeekly()'));
const doc = (id, no, title='동일 제목', date='20261012') => ({docId:id,docNo:no,title,date,url:'https://example.test/'+id});
function preview(items=[], total=items.length, error='') {
  const calls=[]; class GwError extends Error { constructor(code,message){super(message);this.code=code;} }
  const ctx={GwError, search:async (...a)=>{calls.push(a); return {groups:{doc:{items,total,reliableTotal:total,error,message:'검색 실패'}}}}};
  vm.createContext(ctx); vm.runInContext(ccode+'\nthis.run=docPreview;',ctx); return {run:ctx.run,calls};
}
function ui() {
  const waits=[], opened=[], toasts=[], output={innerHTML:''}; let element=output;
  const S={sel:{type:'ledger',row:{date:'20261012'}},view:'budget',pane:{url:''}};
  const ctx={S,currentKey:'u', $:()=>element, esc:s=>String(s), toast:s=>toasts.push(s), GW:{docPreview:args=>new Promise((resolve,reject)=>waits.push({args,resolve,reject}))},openUrl:(url,opts)=>{opened.push({url,opts}); return true;}};
  vm.createContext(ctx);vm.runInContext(ucode+'\nthis.run=findAndOpenDocNo;',ctx);
  return {S,ctx,waits,opened,toasts,output,replace:()=>{element={innerHTML:''};}};
}
test('번호가 다르면 같은 제목도 일치하지 않으며 번호 전체를 비교한다',async()=>{
 const h=preview([doc('1','다른부서-6643')]); assert.equal((await h.run({docNo:'전략경영실-6643',title:'동일 제목'})).found,false);
});
test('정확 번호와 연도에 일치하는 고유 문서만 선택한다',async()=>{
 const h=preview([doc('1','전략경영실-7318','동일 제목','20251012'),doc('2','전략경영실-7318')]);
 assert.equal((await h.run({docNo:'전략경영실-7318',year:'2026'})).docId,'2');
 assert.equal((await h.run({docNo:'전략경영실-7318'})).reason,'ambiguous');
 assert.equal((await preview([doc('1','X-1','t','')]).run({docNo:'X-1',year:'2026'})).reason,'ambiguous');
});
test('제목만 검색할 때 중복 문서, 미완결 결과, 오류는 안전하게 처리한다',async()=>{
 assert.equal((await preview([doc('1','A-1'),doc('2','B-2')]).run({title:'동일 제목'})).reason,'ambiguous');
 assert.equal((await preview([doc('1','A-1')],101).run({docNo:'A-1'})).reason,'incomplete');
 await assert.rejects(preview([],0,'TIMEOUT').run({docNo:'A-1'}),/검색 실패/);
 assert.equal((await preview([doc('1','A-1')]).run({title:'동일 제목'})).found,true);
});
test('늦은 응답, 선택 변경, 창 교체, 계정 변경은 열지 않는다',async()=>{
 for(const change of [h=>{h.S.sel={type:'ledger'}},h=>{h.S.view='mail'},h=>{h.S.pane.url='draft'},h=>h.replace(),h=>{h.ctx.currentKey='other'}]){
  const h=ui(); const p=h.ctx.run('A-1','t'); change(h); h.waits[0].resolve({found:true,...doc('1','A-1')}); await p; assert.equal(h.opened.length,0);
 }
 const h=ui();const a=h.ctx.run('A-1','t'),b=h.ctx.run('B-2','t'); h.waits[1].resolve({found:true,...doc('2','B-2')}); await b; h.waits[0].resolve({found:true,...doc('1','A-1')});await a; assert.equal(h.opened.length,1);assert.match(h.opened[0].url,/2$/); assert.equal(h.waits[0].args.year,'2026');
});
test('열기 취소 시 선택을 변조하지 않고 오류와 불확실성을 표시한다',async()=>{
 const h=ui(),sel=h.S.sel; h.ctx.openUrl=()=>false; const p=h.ctx.run('A-1','t');h.waits[0].resolve({found:true,...doc('1','A-1')});await p;assert.equal(h.S.sel,sel);assert.match(h.output.innerHTML,/열지 않았습니다/);
 const q=h.ctx.run('A-1','t');h.waits[1].resolve({found:false,reason:'ambiguous'});await q;assert.match(h.output.innerHTML,/여러 건/);
 const r=h.ctx.run('A-1','t');h.waits[2].reject(Error('timeout'));await r;assert.match(h.output.innerHTML,/timeout/);
});

function pagedPreview(fn) {
 const calls=[]; class GwError extends Error { constructor(code,message){super(message);this.code=code;} }
 const ctx={GwError,search:async (q,options)=>{calls.push({q,...options});const g=await fn(q,options.page);return {groups:{doc:g}};}};
 vm.createContext(ctx);vm.runInContext(ccode+'\nthis.run=docPreview;',ctx);return {run:ctx.run,calls};
}
const group=(items,total=items.length)=>({items,reliableTotal:total});
test('전체 번호 0건이면 숫자로 재검색하고 모든 페이지에서 전체 번호와 연도를 확인한다',async()=>{
 const filler=Array.from({length:100},(_,i)=>doc('f'+i,'다른부서-6643'));
 const h=pagedPreview((q,p)=>q==='전략경영실-6643'?group([]):p===1?group(filler,101):group([doc('right','전략경영실-6643')],101));
 assert.equal((await h.run({docNo:'전략경영실-6643',year:'2026'})).docId,'right');
 assert.deepEqual(h.calls.map(x=>[x.q,x.page]),[['전략경영실-6643',1],['6643',1],['6643',2]]);
});
test('접미사 결과는 같은 번호 다른 부서나 다른 연도를 열지 않는다',async()=>{
 const h=pagedPreview(q=>q==='전략경영실-6643'?group([]):group([doc('x','타부서-6643'),doc('y','전략경영실-6643','t','20251012')]));
 assert.equal((await h.run({docNo:'전략경영실-6643',year:'2026'})).found,false);
});
test('뒤 페이지의 같은 번호 중복 ID와 누락 연도는 자동 열기를 막는다',async()=>{
 const filler=Array.from({length:99},(_,i)=>doc('f'+i,'타부서-6643'));
 for(const other of [doc('b','전략경영실-6643'),doc('b','전략경영실-6643','t','')]){
  const h=pagedPreview((q,p)=>q==='전략경영실-6643'?group([]):p===1?group([...filler,doc('a','전략경영실-6643')],101):group([other],101));
  assert.equal((await h.run({docNo:'전략경영실-6643',year:'2026'})).reason,'ambiguous');
 }
});
test('상한 초과, 페이지 오류, 변동 총건수, 단축·중복 페이지는 미완결 또는 오류로 처리한다',async()=>{
 const fillers=Array.from({length:100},(_,i)=>doc('f'+i,'타부서-6643'));
 for(const make of [()=>group(fillers,1001),p=>p===1?group(fillers,101):group([],100),p=>p===1?group(fillers,101):group([],101),p=>p===1?group(fillers,101):group([fillers[0]],101)]){
  const h=pagedPreview((q,p)=>q==='전략경영실-6643'?group([]):make(p)); assert.equal((await h.run({docNo:'전략경영실-6643'})).reason,'incomplete');
 }
 const h=pagedPreview((q,p)=>q==='전략경영실-6643'?group([]):p===1?group(fillers,101):({error:'TIMEOUT',message:'timeout'}));
 await assert.rejects(h.run({docNo:'전략경영실-6643'}),/timeout/);
});
test('호출자가 전달한 행 날짜가 상세 패널 선택보다 우선한다',async()=>{
 const h=ui();h.S.sel={type:'ledger',row:{date:'20250101'}};const p=h.ctx.run('전략경영실-7318','제목','20261012');
 assert.equal(h.waits[0].args.year,'2026');h.waits[0].resolve({found:false});await p;
});
test('행 날짜가 빈 값이거나 잘못되면 기존 상세 선택을 대신 쓰지 않고 열지 않는다',async()=>{
 for(const date of ['', '알수없음']){const h=ui();await h.ctx.run('전략경영실-7318','제목',date);assert.equal(h.waits.length,0);assert.match(h.output.innerHTML,/연도/);}
});
test('전체번호 검색이 불완전하거나 오류이면 접미사 검색을 시작하지 않는다',async()=>{
 const h=pagedPreview(()=>({items:[],reliableTotal:null}));assert.equal((await h.run({docNo:'전략경영실-6643'})).reason,'incomplete');assert.equal(h.calls.length,1);
});
