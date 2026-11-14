import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('../src/live/wc/10-calendar-budget.js', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8');
const helper = src.slice(src.indexOf('  function ledgerView('), src.indexOf('  function vBudget()'));
const context = vm.createContext({});
vm.runInContext(helper + '\nthis.view = ledgerView;', context);
const rows = Array.from({length: 101}, (_, i) => ({date: i % 2 ? '20260201' : '20260101', desc: i % 3 ? '회의' : '출장', name: '여비', amount: i - 50, docNo: `DOC${i}`, writer: '홍길동', slip: `S${i}`}));
test('month and case-insensitive search combine before pagination', () => {
  const got = context.view({ledger: {rows}, month: '02', ledgerQuery: 'doc1'});
  assert.deepEqual(Array.from(got, x => x.index), [1, 11, 13, 15, 17, 19]);
});
test('amount ordering is stable and preserves original indexes', () => {
  const got = context.view({ledger: {rows}, ledgerSort: 'amountDesc'});
  assert.equal(got.length, 101); assert.equal(got[0].index, 100); assert.equal(got[100].index, 0);
  const equal = context.view({ledger: {rows: [rows[0], rows[0]]}, ledgerSort: 'dateAsc'});
  assert.deepEqual(Array.from(equal, x => x.index), [0, 1]);
});
test('empty and missing fields are safe', () => {
  assert.equal(context.view({ledger: null}).length, 0);
  assert.equal(context.view({ledger: {rows: [{}]}, month: '01', ledgerQuery: 'x'}).length, 0);
});
test('rendering and CSV share all filtered rows while pages show at most 50', () => {
  assert.match(src, /lrows\.slice\(\(ledgerPage - 1\) \* 50, ledgerPage \* 50\)/);
  assert.match(src, /lrows\.reduce\(/);
  assert.match(events, /rows = ledgerView\(S\.budget\)\.map\(\(\{row\}\) => row\)/);
  assert.match(events, /l\.bgtCd === '__ALL' \? \[\{label: '세목'/);
});

test('subject and ledger tabs render exclusively and search hides ledger', () => {
  const code = src.slice(src.indexOf('  const bKey ='), src.indexOf('  // 모든 사업에서 찾은 과목'));
  const b = {project:'A', filter:'', q:'', table:{project:'A', rows:[{code:'C',level:'세',name:'subject',budget:100,executed:10,balance:90,rate:10}]}, ledger:{bgtCd:'C',name:'결의항목',rows:[],check:'대조'}, ledgerPage:1};
  const ctx = {S:{budget:b, settings:{budget:[]}, a:{budget:{elapsedPct:50,url:''}}}, esc:x=>String(x ?? ''), won:String, pct:String, ic:()=>'', pgh:()=>'', shortLabels:a=>a, ymd8:String, budgetHitsHtml:()=> '검색결과'};
  vm.createContext(ctx); vm.runInContext(code+'\nthis.render = vBudget;',ctx);
  let html = ctx.render(); assert.match(html,/data-act="ledger"/); assert.doesNotMatch(html,/결의 내역 · 결의항목/);
  b.budgetTab='ledger'; html=ctx.render(); assert.match(html,/결의 내역 · 결의항목/); assert.doesNotMatch(html,/<th>과목<\/th>/);
  b.q='검색'; html=ctx.render(); assert.match(html,/검색결과/); assert.doesNotMatch(html,/결의 내역 · 결의항목/);
});
test('chart month selection is immediate and stale loading cannot overwrite a newer selection', async () => {
  const line=events.match(/case 'budgetMonth': \{[^\n]+/)[0];
  const body=line.slice(line.indexOf('{')+1,line.lastIndexOf('break;'));
  let finish; const pending=new Promise(r=>finish=r);
  const b={month:'',ledger:null};
  const ctx={S:{budget:b}, v:'01', renderMain(){}, loadLedgerAll(){ b.ledger={bgtCd:'__ALL',rows:null}; return pending; }};
  vm.createContext(ctx); vm.runInContext(`this.click = async () => { ${body} };`,ctx);
  await ctx.click(); assert.equal(b.month,'01'); assert.equal(b.budgetTab,'ledger');
  ctx.v='02'; await ctx.click(); assert.equal(b.month,'02'); finish(); await pending; assert.equal(b.month,'02');
});
test('new business clears search and page before async catalog response', async () => {
  const code=src.slice(src.indexOf('  async function loadBudget()'),src.indexOf('  async function loadLedger('));
  let finish; const pending=new Promise(r=>finish=r);
  const b={seq:0,project:'A',q:'과거',ledgerQuery:'옛 검색',ledgerPage:9,budgetTab:'ledger',ledger:{},monthly:{},month:'05',catalog:null};
  const ctx={S:{view:'budget',budget:b,settings:{budget:[]}},GW:{budgetCatalog:()=>pending,budgetProject:async()=>({project:'A',rows:[]})},renderMain(){},loadLedger(){}};
  vm.createContext(ctx); vm.runInContext(code+'\nthis.load = loadBudget;',ctx);
  const promise=ctx.load(); assert.equal(b.q,''); assert.equal(b.ledgerQuery,''); assert.equal(b.ledgerPage,1); assert.equal(b.budgetTab,'subjects'); assert.equal(b.ledger,null);
  finish([]); await promise;
});
