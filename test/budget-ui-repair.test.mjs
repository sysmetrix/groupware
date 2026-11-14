import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ui=readFileSync(new URL('../src/live/wc/10-calendar-budget.js',import.meta.url),'utf8');
const ev=readFileSync(new URL('../src/live/wc/16-events.js',import.meta.url),'utf8');
test('사업 전환 즉시 표를 비우고 내보내기를 방지한다',async()=>{
 let finish; const wait=new Promise(r=>finish=r); const b={project:'NEW',filter:'',seq:0,table:{project:'OLD',rows:[]},full:{project:'OLD',rows:[]},catalog:[{}]};
 const ctx={S:{budget:b,view:'budget',settings:{budget:[]}},GW:{budgetProject:()=>wait},renderMain(){assert.equal(b.table,null)},loadLedger(){}};
 vm.createContext(ctx); vm.runInContext(ui.slice(ui.indexOf('  async function loadBudget()'),ui.indexOf('  async function loadLedger('))+';this.load=loadBudget',ctx);
 const p=ctx.load(); assert.equal(b.table,null); assert.equal(b.full,null); ctx.renderMain=()=>{}; finish({project:'NEW',rows:[]}); await p;
 for(const action of ['csvBudget','richBudget']) { const line=ev.split('\n').find(s=>s.includes("case '"+action+"':")); assert.match(line,/S\.budget\.busy \|\| !t \|\| t\.error/); }
});
test('0원 및 음수 세목도 결의로 이동한다',async()=>{
 const line=ev.split('\n').find(s=>s.includes("case 'bHit':")); const b={}; const ctx={S:{budget:b},el:{dataset:{}},toast(){},loadBudget(){}}; vm.createContext(ctx);
 const run=()=>vm.runInContext('(async()=>{switch("bHit"){'+line+'}})()',ctx);
 for(const x of ['0','-12','5']) {ctx.el.dataset={p:'A',h:'H',lv:'세',code:'C',x}; await run(); assert.equal(b.pendingLedger,'C');}
 b.pendingLedger='';ctx.el.dataset={empty:'1',lv:'세',code:'C'};await run();assert.equal(b.pendingLedger,'');
});
test('입력값 보존, Enter 검색, blur 재렌더 방지',()=>{
 assert.match(ev,/t\.id === 'ledgerQuery'\) \{ S\.budget\.ledgerQuery = t\.value/);
 const change=ev.slice(ev.indexOf("root.addEventListener('change'"),ev.indexOf("root.addEventListener('keydown'",ev.indexOf("root.addEventListener('change'")));
 assert.doesNotMatch(change,/t\.id === 'bq'.*budgetQuery/);
 assert.match(ev,/e\.key === 'Enter' && t\.id === 'ledgerQuery'[\s\S]*?ledgerPage = 1; renderMain/);
 assert.match(ev,/e\.isComposing/);
});
test('행과 칩은 키보드 접근 가능하며 화면 전환은 버튼 그룹이다',()=>{
 for(const action of ['ledgerRow','bHit','ledger','bPick']) assert.match(ui,new RegExp('data-budget-key data-act="'+action+'"'));
 assert.match(ev,/t\.hasAttribute\?\.\('data-budget-key'\)/); assert.match(ev,/t\.click\(\)/);
 assert.match(ui,/role="group" aria-label="예산 화면"/); assert.doesNotMatch(ui,/role="tablist" aria-label="예산 화면"/);
 assert.match(ui,/<button type="button" class="btn sm ghost" data-act="bPick"/);
});
test('관심 사업 저장 실패 시 배열을 복원한다',async()=>{
 for(const act of ['bPin','bUnpin']) { const list=[{project:'A',filter:''}], initial=JSON.stringify(list), messages=[]; const ctx={S:{settings:{budget:list}},el:{dataset:act==='bPin'?{p:'B'}:{i:'0'}},e:{stopPropagation(){}},saveLocal:()=>false,toast:m=>messages.push(m),renderMain(){}}; vm.createContext(ctx); const line=ev.split('\n').find(s=>s.includes("case '"+act+"':")); await vm.runInContext('(async()=>{switch('+JSON.stringify(act)+'){'+line+'}})()',ctx); assert.equal(JSON.stringify(list),initial); assert.match(messages[0],/저장하지 못/); }
});
