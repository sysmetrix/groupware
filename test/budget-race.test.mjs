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
