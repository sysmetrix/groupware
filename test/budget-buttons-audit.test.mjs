import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const events = readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/live/wc/10-calendar-budget.js', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../src/live/wc/12-report-settings.js', import.meta.url), 'utf8');
function fixture() {
  const calls = [], messages = [], inputs = {bq:{value:'여비',focus(){calls.push(['focus','bq']);}},ledgerQuery:{value:'홍길동',focus(){calls.push(['focus','ledgerQuery']);}}};
  const rows = [{date:'20260101',desc:'출장',amount:10,docNo:'D1',writer:'홍길동',slip:'S1'},{date:'20260201',desc:'회의',amount:20,docNo:'D2'}];
  const S = {budget:{project:'A',filter:'',q:'',pickOpen:false,month:'',ledgerPage:3,ledgerQuery:'',budgetTab:'subjects',table:{project:'A',rows:[{level:'세',code:'C',name:'여비',budget:100,executed:10,balance:90,rate:10}]},ledger:{bgtCd:'__ALL',rows}},settings:{budget:[]},pane:{url:'old'}};
  const call = name => (...args) => calls.push([name,...args]);
  const ctx = {S,root:{querySelector:s=>inputs[s.slice(1)]},el:{dataset:{}},e:{stopPropagation:call('stop')},v:'',renderMain:call('render'),renderPane:call('pane'),loadBudget:call('loadBudget'),loadLedger:call('loadLedger'),loadLedgerAll:call('loadLedgerAll'),loadMonthly:call('loadMonthly'),loadBudgetAll:call('loadBudgetAll'),budgetQuery:call('budgetQuery'),toast:m=>messages.push(m),saveLocal:()=>{calls.push(['save']); return true;},findAndOpenDocNo:call('findDocNo'),closeOverlay:call('closeOverlay'),openUrl:call('openUrl'),leavePane:()=>true,download:call('download'),copyRich:call('copyRich'),today:()=> '20261114',esc:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),won:String,pct:x=>x+'%',ymd8:String,R:{toCsv:(data,columns)=>{calls.push(['csv',data,columns]);return 'CSV';}}};
  const helper = ui.slice(ui.indexOf('  function ledgerView('),ui.indexOf('  function vBudget()'));
  vm.createContext(ctx); vm.runInContext(helper,ctx);
  function click(action, data={}, value='') {
    const start = events.indexOf("      case '"+action+"':");
    assert.notEqual(start,-1,'missing handler: '+action);
    const end = events.indexOf("\n      case '",start+1);
    assert.notEqual(end,-1,'missing following handler: '+action);
    const branch = events.slice(start,end);
    ctx.el={dataset:data,textContent:'fallback'}; ctx.v=value;
    return vm.runInContext('(async()=>{switch('+JSON.stringify(action)+'){'+branch+'}})()',ctx);
  }
  return {S,calls,messages,inputs,ctx,click};
}
test('picker and pin buttons choose, toggle, unpin and isolate nested clicks', async()=>{
  const f=fixture(), b=f.S.budget; await f.click('bTogglePick'); assert.equal(b.pickOpen,true);
  await f.click('bPick',{p:'B',f:'H'}); assert.equal(b.pickOpen,false); assert.equal(b.project,'B'); assert.equal(b.filter,'H'); assert.ok(f.calls.some(x=>x[0]==='loadBudget'));
  await f.click('bPin',{p:'B',f:'H',l:'사업'}); assert.equal(JSON.stringify(f.S.settings.budget),JSON.stringify([{project:'B',filter:'H',label:'사업'}]));
  await f.click('bPin',{p:'B',f:'H'}); assert.equal(f.S.settings.budget.length,0);
  await f.click('bPin',{p:'B'}); await f.click('bUnpin',{i:'0'}); assert.equal(f.S.settings.budget.length,0); assert.equal(f.calls.filter(x=>x[0]==='stop').length,5); assert.equal(f.calls.filter(x=>x[0]==='save').length,4);
});
test('search, clear, retry and result navigation preserve expected selection', async()=>{
  const f=fixture(), b=f.S.budget; b.pickOpen=true; await f.click('bSearch'); assert.equal(b.q,'여비'); assert.equal(b.pickOpen,false);
  await f.click('bSearchClear'); assert.equal(b.q,''); assert.ok(f.calls.some(x=>x[0]==='focus'&&x[1]==='bq'));
  await f.click('bSearchRetry'); assert.ok(f.calls.some(x=>x[0]==='loadBudgetAll'&&x[1]===true));
  await f.click('bHit',{empty:'1'}); assert.match(f.messages.at(-1),/없습니다/); assert.equal(b.project,'A');
  await f.click('bHit',{p:'B',h:'H',lv:'세',x:'10',code:'C'}); assert.equal(b.project,'B'); assert.equal(b.filter,'H'); assert.equal(b.pendingLedger,'C');
  await f.click('bHit',{p:'C',lv:'세',x:'0',code:'D'}); assert.equal(b.pendingLedger,'D'); await f.click('bHit',{p:'C',lv:'항',code:'E'}); assert.equal(b.pendingLedger,'');
});
test('tabs, month chart, ledger filters and pagination handle valid and invalid input', async()=>{
  const f=fixture(), b=f.S.budget; await f.click('budgetTab',{},'ledger'); assert.equal(b.budgetTab,'ledger'); await f.click('budgetTab',{},'bogus'); assert.equal(b.budgetTab,'ledger');
  await f.click('budgetMonth',{},'02'); assert.equal(b.month,'02'); assert.equal(b.ledgerPage,1); assert.equal(f.calls.some(x=>x[0]==='loadLedgerAll'),false);
  await f.click('budgetMonth',{},'02'); assert.equal(b.month,''); b.ledger=null; await f.click('budgetMonth',{},'01'); assert.ok(f.calls.some(x=>x[0]==='loadLedgerAll')); assert.equal(b.month,'01');
  await f.click('ledgerMonth',{},'03'); assert.equal(b.month,'03'); assert.equal(b.ledgerPage,1); await f.click('budgetMonthClear'); assert.equal(b.month,'');
  await f.click('ledgerSort',{},'amountDesc'); assert.equal(b.ledgerSort,'amountDesc'); await f.click('ledgerSort',{},'bogus'); assert.equal(b.ledgerSort,'amountDesc');
  await f.click('ledgerPage',{},'-4'); assert.equal(b.ledgerPage,1); await f.click('ledgerPage',{},'2'); assert.equal(b.ledgerPage,2);
  await f.click('ledgerSearch'); assert.equal(b.ledgerQuery,'홍길동'); assert.equal(b.ledgerPage,1); await f.click('ledgerSearchClear'); assert.equal(b.ledgerQuery,''); assert.ok(f.calls.some(x=>x[0]==='focus'&&x[1]==='ledgerQuery'));
});
test('load, detail, document and external source actions call the correct target', async()=>{
  const f=fixture(); await f.click('loadMonthly'); await f.click('ledger',{code:'C'}); await f.click('ledgerAll'); await f.click('ledgerRow',{i:'1'}); assert.equal(f.S.sel.row.docNo,'D2'); assert.equal(f.S.pane.url,'');
  f.ctx.leavePane=()=>false; f.S.sel=null; await f.click('ledgerRow',{i:'0'}); assert.equal(f.S.sel,null);
  await f.click('findDocNo',{no:'D1',t:'출장',date:'20260101'}); await f.click('openUrl',{url:'https://example.com',title:'예실'});
  for(const name of ['loadMonthly','loadLedger','loadLedgerAll','pane','findDocNo','openUrl']) assert.ok(f.calls.some(x=>x[0]===name),name);
  assert.deepEqual(f.calls.find(x=>x[0]==='findDocNo'),['findDocNo','D1','출장','20260101']);
});
test('exports use selected budget and filtered ledger, not current page only', async()=>{
  const f=fixture(); await f.click('csvBudget'); await f.click('richBudget'); assert.match(f.calls.find(x=>x[0]==='download')[1],/^예산_A_/); assert.match(f.calls.find(x=>x[0]==='copyRich')[1],/<table/);
  f.S.budget.month='01'; f.S.budget.ledgerQuery='홍길동'; f.S.budget.ledgerPage=4; await f.click('csvLedger');
  const csv=f.calls.filter(x=>x[0]==='csv').at(-1); assert.equal(csv[1].length,1); assert.equal(csv[1][0].docNo,'D1'); assert.ok(csv[2].some(x=>x.label==='세목')); assert.match(f.calls.filter(x=>x[0]==='download').at(-1)[1],/결의내역___ALL_01월_/);
});
test('settings add and delete update the budget list and invalidate cache', async()=>{
  const f=fixture(); await f.click('budgetRowAdd'); assert.equal(f.S.settings.budget.length,1); assert.equal(f.S.settings.budget[0].project,''); await f.click('budgetRowDel',{i:'0'}); assert.equal(f.S.settings.budget.length,0); assert.equal(f.S.budget.table,null); assert.ok(f.calls.some(x=>x[0]==='save'));
});
test('all budget screen and budget settings actions have handlers',()=>{
  const start=ui.indexOf('  const bKey ='); const budgetUi=ui.slice(start); const actions=new Set([...budgetUi.matchAll(/data-act="([^"]+)"/g)].map(m=>m[1]));
  for(const name of ['budgetRowAdd','budgetRowDel','goBudgetPick']) if(settings.includes('data-act="'+name+'"')) actions.add(name);
  for(const name of actions) assert.ok(events.includes("case '"+name+"':"),'missing action '+name);
});
test('settings button opens the budget picker', async()=>{
  const f=fixture(); f.ctx.go = view => f.calls.push(['go',view]); await f.click('goBudgetPick'); assert.equal(f.S.budget.pickOpen,true); assert.deepEqual(f.calls.find(x=>x[0]==='go'),['go','budget']);
});
test('failed pin addition preserves the list and reports failure without success', async()=>{
  const f=fixture(); f.S.settings.budget.push({project:'A',filter:'H',label:'기존'});
  const before=JSON.stringify(f.S.settings.budget); let saves=0;
  f.ctx.saveLocal=()=>{saves++; return false;}; await f.click('bPin',{p:'B',l:'새 사업'});
  assert.equal(saves,1); assert.equal(JSON.stringify(f.S.settings.budget),before);
  assert.ok(f.messages.some(m=>/저장.*(실패|못)|실패.*저장/.test(m)), '저장 실패 안내가 필요합니다');
  assert.ok(!f.messages.some(m=>/추가했습니다|뺐습니다/.test(m)), '실패 시 성공 안내를 표시하면 안 됩니다');
});
test('failed pin toggle removal preserves the list and reports failure without success', async()=>{
  const f=fixture(); f.S.settings.budget.push({project:'A',filter:'',label:'첫째'},{project:'B',filter:'H',label:'둘째'});
  const before=JSON.stringify(f.S.settings.budget); let saves=0;
  f.ctx.saveLocal=()=>{saves++; return false;}; await f.click('bPin',{p:'B',f:'H'});
  assert.equal(saves,1); assert.equal(JSON.stringify(f.S.settings.budget),before);
  assert.ok(f.messages.some(m=>/저장.*(실패|못)|실패.*저장/.test(m)), '저장 실패 안내가 필요합니다');
  assert.ok(!f.messages.some(m=>/추가했습니다|뺐습니다/.test(m)), '실패 시 성공 안내를 표시하면 안 됩니다');
});
test('failed unpin preserves the list and reports failure without success', async()=>{
  const f=fixture(); f.S.settings.budget.push({project:'A',filter:'',label:'첫째'},{project:'B',filter:'H',label:'둘째'});
  const before=JSON.stringify(f.S.settings.budget); let saves=0;
  f.ctx.saveLocal=()=>{saves++; return false;}; await f.click('bUnpin',{i:'0'});
  assert.equal(saves,1); assert.equal(JSON.stringify(f.S.settings.budget),before);
  assert.ok(f.messages.some(m=>/저장.*(실패|못)|실패.*저장/.test(m)), '저장 실패 안내가 필요합니다');
  assert.ok(!f.messages.some(m=>/추가했습니다|뺐습니다/.test(m)), '실패 시 성공 안내를 표시하면 안 됩니다');
});