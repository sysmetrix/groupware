import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source = await fs.readFile(new URL('../src/live/wc/01-storage.js', import.meta.url), 'utf8');
const approval = await fs.readFile(new URL('../src/live/wc/08-approval-mail.js', import.meta.url), 'utf8');
function fixture(shared = new Map(), gw = {}) {
  const listeners = {};
  const sandbox = vm.createContext({console, Date, Math, Set, Map, JSON,
    localStorage: {getItem: k => shared.has(k) ? shared.get(k) : null, setItem: (k,v) => shared.set(k,String(v)), removeItem: k => shared.delete(k)},
    sessionStorage: {getItem: () => JSON.stringify({ucUserInfo:{empSeq:'A'}})},
    window: {addEventListener:(k,fn)=>{listeners[k]=fn;}}, previewCache: new Map(), routingFailAt: 0, GW:gw, renderMain:()=>{}, toast:()=>{}, isUserBusy:()=>false, reanalyze:()=>{}, render:()=>{},
  });
  vm.runInContext(source + approval + ';globalThis.api={S,saveLocal,syncLocal,switchUserStorage,loadApprovalMore,store};', sandbox);
  return {api:sandbox.api, shared, listeners};
}
const todos = a => JSON.parse(JSON.stringify(a.S.todos));
const key = k => 'bwyfgw:wc:A:' + k;
test('stale tab save preserves additions and concurrent unrelated settings',()=>{
  const a=fixture(),b=fixture(a.shared);a.api.S.todos.push({id:'one',title:'A task'});a.api.saveLocal();
  b.api.S.settings.theme='dark';b.api.saveLocal();a.api.S.settings.fontSize='l';a.api.saveLocal();
  assert.equal(todos(b.api)[0].id,'one');assert.equal(a.api.S.settings.theme,'dark');assert.equal(a.api.S.settings.fontSize,'l');
  b.api.S.todos.push({id:'two',title:'B task'});b.api.saveLocal();a.api.saveLocal();assert.deepEqual(todos(a.api).map(x=>x.id).sort(),['one','two']);
});
test('deletions are not resurrected by stale tabs and edits merge by todo ID',()=>{
  const a=fixture();a.api.S.todos.push({id:'one',title:'original'},{id:'two',title:'other'});a.api.saveLocal();const b=fixture(a.shared);
  a.api.S.todos.splice(0,1);a.api.saveLocal();b.api.S.todos[1].title='edited';b.api.saveLocal();assert.deepEqual(todos(b.api).map(x=>[x.id,x.title]),[['two','edited']]);a.api.saveLocal();assert.equal(todos(a.api)[0].title,'edited');
});
test('storage notifications do not discard unsaved local changes',()=>{
  const a=fixture(),b=fixture(a.shared);a.api.S.settings.theme='dark';b.api.S.settings.fontSize='l';b.api.saveLocal();a.listeners.storage({key:'bwyfgw:wc:A:settings'});a.api.saveLocal();
  assert.equal(a.api.S.settings.theme,'dark');assert.equal(a.api.S.settings.fontSize,'l');
});
test('conflicting weekly text retains a recoverable copy',()=>{
  const a=fixture(),b=fixture(a.shared);a.api.S.weekly='first';a.api.saveLocal();b.api.S.weekly='second';b.api.saveLocal();
  assert.equal(b.api.store.get('weekly'),'second');assert.equal(b.api.store.get('weeklyRecovery').text,'first');
});
test('user switch clears all sensitive view caches and undo',()=>{
  const a=fixture();a.api.S.apMore.pending=[{docId:'private'}];a.api.S.team={private:true};a.api.S.search.res={private:true};a.api.S.undo=[{private:true}];a.api.S.res={bookings:['private']};a.api.switchUserStorage('B');
  assert.equal(a.api.S.userKey,'B');assert.deepEqual(Object.keys(a.api.S.apMore),[]);assert.equal(a.api.S.search.res,null);assert.equal(a.api.S.res,null);assert.equal(a.api.S.undo.length,0);assert.equal(Object.keys(a.api.S.team).length,0);
});
test('approval pagination locks concurrent clicks, deduplicates, rejects stale results',async()=>{
  let finish,calls=0;const a=fixture(new Map(),{approvalPage:async()=>{calls++;return new Promise(r=>{finish=r;});}});a.api.S.a={approval:{lists:{pending:{docs:[{docId:'1'}]}}}};
  const p=a.api.loadApprovalMore();await a.api.loadApprovalMore();assert.equal(calls,1);finish({docs:[{docId:'1'},{docId:'2'},{docId:'2'}]});await p;assert.equal(a.api.S.apMore.pending.length,1);assert.equal(a.api.S.apPages.pending,2);
  const late=a.api.loadApprovalMore();a.api.switchUserStorage('B');finish({docs:[{docId:'private'}]});await late;assert.equal(Object.keys(a.api.S.apMore).length,0);
});
test('remote clear is observed without resurrecting saved values',()=>{
  const a=fixture();a.api.S.todos.push({id:'one',title:'task'});a.api.S.weekly='report';a.api.saveLocal();a.shared.clear();a.listeners.storage({key:null});a.api.saveLocal();
  assert.equal(a.api.S.todos.length,0);assert.equal(a.api.S.weekly,'');assert.equal(a.shared.has('bwyfgw:wc:A:todos'),false);
});
test('storage quota failure returns false and preserves pending data for retry',()=>{
  const a=fixture();a.api.S.todos.push({id:'one',title:'task'});a.api.store.set=()=>false;assert.equal(a.api.saveLocal(),false);assert.equal(a.api.S.storageError,true);assert.equal(a.api.S.todos.length,1);
});

test('stored settings without newer defaults do not look deleted, and legacy to-dos keep stable ids',()=>{
  const shared=new Map([[key('settings'),JSON.stringify({theme:'dark'})],[key('todos'),JSON.stringify([{title:'old',at:5}])],[key('done'),JSON.stringify({'doc:1':1})]]);
  const a=fixture(shared),b=fixture(shared);
  assert.equal(a.api.S.todos[0].id,b.api.S.todos[0].id);assert.equal(a.api.S.settings.refreshMin,5);assert.equal(a.api.S.hidden['doc:1'],1);
  a.api.S.settings.fontSize='l';assert.equal(a.api.saveLocal(),true);assert.equal(b.api.store.get('settings').mailCount,100);
  b.api.S.todos[0].title='edited';b.api.saveLocal();a.api.saveLocal();assert.equal(a.api.S.todos[0].title,'edited');
});
test('a failing key stays pending while later keys such as the weekly draft are still saved',()=>{
  const a=fixture();a.api.S.todos.push({id:'t',title:'x'});a.api.S.weekly='draft';const real=a.api.store.set;let fail=true;a.api.store.set=(k,v)=>k==='todos'&&fail?false:real(k,v);
  assert.equal(a.api.saveLocal(),false);assert.equal(a.api.store.get('weekly'),'draft');assert.equal(a.api.store.get('todos',[]).length,0);
  fail=false;assert.equal(a.api.saveLocal(),true);assert.equal(a.api.store.get('todos').length,1);
});
test('weekly conflict keeps the other draft unless a recovery copy could be saved',()=>{
  const a=fixture(),b=fixture(a.shared);a.api.S.weekly='first';a.api.saveLocal();b.api.S.weekly='second';
  const real=b.api.store.set;b.api.store.set=(k,v)=>k==='weeklyRecovery'?false:real(k,v);assert.equal(b.api.saveLocal(),false);assert.equal(b.api.store.get('weekly'),'first');
  b.api.store.set=real;assert.equal(b.api.saveLocal(),true);assert.equal(b.api.store.get('weekly'),'second');assert.equal(b.api.store.get('weeklyRecovery').text,'first');
});
test('a storage event that merges another tab clears undo; user switch clears mail details',()=>{
  const a=fixture(),b=fixture(a.shared);a.api.S.undo=[{label:'x',todos:[]}];b.api.S.todos.push({id:'n',title:'new'});b.api.saveLocal();a.listeners.storage({key:key('todos')});
  assert.equal(a.api.S.undo.length,0);a.api.S.mailDet={1:{private:true}};a.api.S.mailDetBusy={1:Promise.resolve()};a.api.switchUserStorage('B');assert.equal(Object.keys(a.api.S.mailDet).length,0);assert.equal(Object.keys(a.api.S.mailDetBusy).length,0);
});
