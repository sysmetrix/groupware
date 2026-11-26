import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = f => readFileSync(new URL('../src/live/wc/' + f, import.meta.url), 'utf8');
const board = source('09-search-board.js'), settings = source('12-report-settings.js'), todo = source('06-today.js');
function setup() {
 const calls = [], badge = {textContent:'', classList:{add(){},remove(){}}}, overlay = {innerHTML:''};
 let inputs = [];
 const S = {todos:[{id:'1',title:'작업',due:'2027-03-17',status:'todo'}],plan:{},hidden:{},snooze:{},undo:[],a:{actions:[]},settings:{budget:[{project:'A201',label:'원본',filter:''}]},budget:{table:{old:true}},filter:{level:'all'},todayTab:'mine'};
 const c = {S,calls,addTodoFromInput(){},R:{dday:()=>3,kstNow:()=>({date:'2026-11-15',y:2026})},today:()=> '2026-11-15',isHidden:k=>!!S.hidden[k],isSnoozed:k=>!!S.snooze[k],resurfaced:()=>false,stateOf:x=>x.state,isMine:x=>x.scope!=='ref',STATE_GROUP:{overdue:'긴급',urgent:'긴급',todo:'할 일',check:'확인',confirm:'완료 확인',wait:'대기'},queue:()=>S.a.actions,
 pushUndo:label=>{S.undo.push(JSON.parse(JSON.stringify({label,todos:S.todos,plan:S.plan,hidden:S.hidden,snooze:S.snooze})));calls.push('undo');},saveLocal:()=>c.saveOK,saveOK:true,render:()=>calls.push('render'),renderMain:()=>calls.push('renderMain'),renderNav(){},renderHead(){},toast:x=>calls.push(x),toastUndo:x=>calls.push(x),esc:x=>String(x),$:id=>id==='#setSaved'?badge:id==='#overlay'?overlay:id==='#overlay button'?{focus:()=>calls.push('focus')}:null,root:{querySelectorAll:selector=>selector==='#budgetRows input'?inputs:[]},applyLook(){},schedule(){},setTimeout:()=>1,clearTimeout(){},window:{},Notification:{},reanalyze(){}};
 vm.createContext(c); vm.runInContext(board+'\n'+settings+'\n'+todo+'\nthis.api={dropTo,boardMove,bucketOfTodo,todayQueue,saveSettingField,saveBudgetRows,budgetSettingRows,budgetRowAdd,resetDoneMarks};',c);
 return {c,S,calls,badge,overlay,setRows(rows){inputs=rows.flatMap((row,i)=>Object.entries(row).map(([b,value])=>({dataset:{b,i:String(i)},value})));}};
}
test('board plans preserve due across movement completion and reopening; undo retains original',()=>{
 const {c,S}=setup();
 for(const b of ['today','tomorrow','week','later','late','done','today']) {c.api.dropTo('todo:1',b);assert.equal(S.todos[0].due,'2027-03-17');assert.equal(c.api.bucketOfTodo(S.todos[0]),b);}
 assert.equal(S.undo[0].todos[0].due,'2027-03-17');assert.deepEqual(Object.keys(S.undo[0].plan),[]);
});
test('legacy due-only fallback works; invalid destinations and wait moves do nothing',()=>{
 const {c,S,calls}=setup();assert.equal(c.api.bucketOfTodo(S.todos[0]),'later');
 S.a.actions=[{key:'doc:wait',state:'wait'}];for(const [id,b] of [['todo:1','bogus'],['todo:1','wait'],['missing','today'],['doc:wait','today']]) c.api.dropTo(id,b);
 assert.equal(calls.length,0);assert.equal(S.todos[0].due,'2027-03-17');
});
test('keyboard plan dialog exposes named destination buttons excluding waiting',()=>{
 const {c,overlay,calls}=setup();c.api.boardMove('todo:1');assert.match(overlay.innerHTML,/role="dialog"/);assert.equal((overlay.innerHTML.match(/data-act="boardMoveTo"/g)||[]).length,6);assert.doesNotMatch(overlay.innerHTML,/data-v="wait"/);assert.ok(calls.includes('focus'));
});
test('save failure is never announced as saved',()=>{
 const {c,badge,calls}=setup();c.saveOK=false;c.api.saveSettingField({dataset:{k:'theme'},value:'dark'});assert.match(badge.textContent,/저장 실패/);assert.ok(calls.some(x=>typeof x==='string'&&x.includes('저장하지 못')));
 c.saveOK=true;c.api.saveSettingField({dataset:{k:'theme'},value:'light'});assert.equal(badge.textContent,'저장됨');
});
test('setting enum validation rejects unsupported values',()=>{
 const {c,S,badge}=setup();c.api.saveSettingField({dataset:{k:'refreshMin'},value:'-1'});assert.equal(S.settings.refreshMin,undefined);assert.match(badge.textContent,/저장하지 않았/);
});
test('incomplete budget rows stay drafts without changing committed settings',()=>{
 const {c,S,setRows,badge}=setup();setRows([{project:'',label:'미완성',filter:''}]);assert.equal(c.api.saveBudgetRows(),false);assert.equal(S.settings.budget[0].project,'A201');assert.equal(c.api.budgetSettingRows()[0].label,'미완성');assert.match(badge.textContent,/저장하지 않음/);
 setRows([{project:'A202',label:'완성',filter:''}]);assert.equal(c.api.saveBudgetRows(),true);assert.equal(S.settings.budget[0].project,'A202');assert.equal(S.budget.table,null);
});
test('budget save failure preserves committed data and draft; account settings replace draft',()=>{
 const {c,S,setRows,badge}=setup();c.saveOK=false;setRows([{project:'A203',label:'편집',filter:''}]);assert.equal(c.api.saveBudgetRows(),false);assert.equal(S.settings.budget[0].project,'A201');assert.equal(c.api.budgetSettingRows()[0].project,'A203');assert.match(badge.textContent,/저장 실패/);
 S.settings={budget:[{project:'B1'}]};assert.equal(c.api.budgetSettingRows()[0].project,'B1');
});
test('reset hidden/snooze preserves plans todos due and takes undo snapshot',()=>{
 const {c,S}=setup();S.hidden.x=1;S.snooze.y=1;S.plan['todo:1']='week';c.api.resetDoneMarks();assert.deepEqual(Object.keys(S.hidden),[]);assert.deepEqual(Object.keys(S.snooze),[]);assert.equal(S.plan['todo:1'],'week');assert.equal(S.todos[0].due,'2027-03-17');assert.equal(S.undo[0].hidden.x,1);
});
test('todo keyboard model matches displayed mine/ref filters and grouped order',()=>{
 const {c,S}=setup();S.a.actions=[{key:'wait',state:'wait'},{key:'todo',state:'todo'},{key:'ref',scope:'ref',state:'info'},{key:'urgent',state:'urgent'},{key:'check',state:'check'},{key:'overdue',state:'overdue'}];
 assert.equal(c.api.todayQueue().map(x=>x.key).join(','),'urgent,overdue,todo,check');S.filter.level='urgent';assert.equal(c.api.todayQueue().map(x=>x.key).join(','),'urgent,overdue');S.todayTab='ref';assert.equal(c.api.todayQueue().map(x=>x.key).join(','),'urgent,overdue','전체 보기에서는 부서 참고 탭이 없다');S.todoSrc='gw';assert.equal(c.api.todayQueue().map(x=>x.key).join(','),'ref');
});
