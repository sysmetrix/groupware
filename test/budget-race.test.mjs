import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('../src/live/wc/10-calendar-budget.js', import.meta.url),'utf8');
const code = src.slice(src.indexOf('  async function loadBudget()'),src.indexOf('  async function loadLedger(',src.indexOf('  async function loadBudget()')));
test('stale project response cannot replace a newer budget', async () => {
  let finish; const old = new Promise(r=>finish=r); const calls=[];
  const S={view:'other',budget:{project:'OLD',filter:'',table:null,full:null,catalog:[{}],seq:0,busy:false},settings:{budget:[]}};
  const ctx={S,GW:{budgetProject:({project})=>{calls.push(project);return project==='OLD'?old:Promise.resolve({project,rows:[]});}},renderMain(){},loadLedger(){},console};
  vm.createContext(ctx); vm.runInContext(code+'\nthis.load=loadBudget;',ctx);
  const a=ctx.load(); S.budget.project='NEW'; const b=ctx.load(); await b; finish({project:'OLD',rows:[]}); await a;
  assert.deepEqual(calls,['OLD','NEW']); assert.equal(S.budget.table.project,'NEW'); assert.equal(S.budget.busy,false);
});
test('stale catalogue wait cannot start a wrong project request', async () => {
  let finish; const catalog = new Promise(r=>finish=r); const calls=[];
  const S={view:'other',budget:{project:'OLD',filter:'',table:null,full:null,catalog:null,seq:0,busy:false},settings:{budget:[]}};
  const ctx={S,GW:{budgetCatalog:()=>catalog,budgetProject:({project})=>{calls.push(project);return Promise.resolve({project,rows:[]});}},renderMain(){},loadLedger(){}};
  vm.createContext(ctx); vm.runInContext(code+'\nthis.load=loadBudget;',ctx);
  const a=ctx.load(); S.budget.project='NEW'; const b=ctx.load(); finish([]); await Promise.all([a,b]);
  assert.deepEqual(calls,['NEW']); assert.equal(S.budget.table.project,'NEW');
});

test('기본 선택은 빈 핀을 건너뛰고 첫 유효 핀을 쓰며 원본을 보존한다', async () => {
  const pins=[null,{}, {project:'  '}, {project:'GOOD',filter:'F'}, {project:'NEXT'}]; const before=JSON.stringify(pins); const calls=[];
  const S={view:'other',budget:{project:'',filter:'',table:null,full:null,catalog:[{project:'CAT',name:'카탈로그'}],seq:0},settings:{budget:pins}};
  const ctx={S,GW:{budgetProject:async ({project})=>{calls.push(project);return {project,rows:[{code:'F',path:'F|'}]};}},renderMain(){},loadLedger(){}};
  vm.createContext(ctx); vm.runInContext(code+'\nthis.load=loadBudget;',ctx); await ctx.load(); assert.deepEqual(calls,['GOOD']); assert.equal(S.budget.filter,'F'); assert.equal(JSON.stringify(pins),before);
});
