import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as R from '../src/live/doc-find.mjs';
const read = name => readFileSync(new URL('../src/live/wc/' + name, import.meta.url), 'utf8');
const source = ['01-storage.js', '08-approval-mail.js', '35-docs.js'].map(read).join('\n');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
function fixture(shared = new Map()) {
  const requests = [], notices = [];
  let user = 'A';
  const ctx = vm.createContext({R, console, Date, Math, Set, Map, JSON,
    localStorage: {getItem:k=>shared.get(k)??null,setItem:(k,v)=>shared.set(k,String(v)),removeItem:k=>shared.delete(k)},
    sessionStorage:{getItem:()=>JSON.stringify({ucUserInfo:{empSeq:user}})},
    window:{addEventListener:()=>{}},previewCache:new Map(),routingFailAt:0,
    GW:{search:(kw,opts)=>{const d=deferred();requests.push({...d,kw,opts});return d.promise;}},
    renderMain:()=>{},toast:s=>notices.push(s),go:()=>{},periodFrom:p=>'from-'+p,
  });
  vm.runInContext(source+'\nthis.api={S,dfState,dfRun,runMailSearch,switchUserStorage,store,mailRefKey};',ctx);
  return {...ctx.api,requests,notices,setUser:key=>{user=key;},shared};
}
const docResult = (id,total=1) => ({groups:{doc:{items:[{docId:id,form:'기안문',text:'수신자 내부결재 제목 시험'}],total}}});
const mailResult = id => ({groups:{mail:{items:[{uid:id}],total:1}}});

test('documents and mail discard replies after A -> B -> A, including recent-search persistence',async()=>{
  const f=fixture();const d=f.dfRun('비밀문서'),m=f.runMailSearch('비밀메일');
  f.setUser('B');f.switchUserStorage('B');assert.equal(f.S.docs,null);
  f.setUser('A');f.switchUserStorage('A');
  f.requests[0].resolve(docResult('private'));f.requests[1].resolve(mailResult('private'));await Promise.all([d,m]);
  assert.equal(f.S.docs,null);assert.equal(f.S.mailSearch.res,null);
  assert.equal(f.shared.has('bwyfgw:wc:A:dfRecent'),false);
});
test('live session identity rejects success before ingestion notices an account change',async()=>{
  const f=fixture();const d=f.dfRun('문서검색'),m=f.runMailSearch('메일검색');f.setUser('B');
  f.requests[0].resolve(docResult('private'));f.requests[1].reject(new Error('private error'));await Promise.all([d,m]);
  assert.equal(f.S.docs.items.length,0);assert.equal(f.S.mailSearch.res,null);assert.equal(f.notices.length,0);assert.equal(f.shared.size,0);
});
test('new document request wins reversed success and stale error',async()=>{
  const f=fixture();const old=f.dfRun('이전검색'),next=f.dfRun('새로운검색');
  f.requests[1].resolve(docResult('new'));await next;f.requests[0].reject(new Error('stale'));await old;
  assert.equal(f.S.docs.items[0].docId,'new');assert.equal(f.S.docs.err,'');assert.equal(f.S.docs.busy,false);
  assert.deepEqual(JSON.parse(f.shared.get('bwyfgw:wc:A:dfRecent')),['새로운검색']);
});
test('document pagination freezes keyword and date range at the initial query',async()=>{
  const f=fixture();const first=f.dfRun('원래검색');f.requests[0].resolve(docResult('one',3));await first;
  f.S.docs.kw='입력수정';f.S.docs.period='1';const more=f.dfRun('다른검색',true);
  assert.equal(f.requests[1].kw,'원래검색');assert.equal(f.requests[1].opts.from,'from-12');assert.equal(f.requests[1].opts.page,2);
  f.requests[1].resolve(docResult('two',3));await more;assert.equal(f.S.docs.searched,'원래검색');assert.equal(f.S.docs.items.length,2);
});
test('mail latest request wins and short query cancels outstanding search',async()=>{
  const f=fixture();const a=f.runMailSearch('이전메일'),b=f.runMailSearch('최신메일');
  f.requests[1].resolve(mailResult('new'));await b;f.requests[0].resolve(mailResult('old'));await a;
  assert.equal(f.S.mailSearch.res.groups.mail.items[0].uid,'new');assert.equal(f.S.mailSearch.res.keyword,'최신메일');
  const late=f.runMailSearch('지연메일');await f.runMailSearch('a');f.requests[2].resolve(mailResult('late'));await late;
  assert.equal(f.S.mailSearch.res,null);assert.equal(f.S.mailSearch.busy,false);
});
test('clearMailSearch state replacement cancels success and error without toast',async()=>{
  for(const fail of [false,true]) {const f=fixture();const p=f.runMailSearch('지연검색');f.S.mailSearch={kw:'',res:null};
    fail?f.requests[0].reject(new Error('stale')):f.requests[0].resolve(mailResult('late'));await p;
    assert.equal(f.S.mailSearch.res,null);assert.equal(f.notices.length,0);}
});
test('mail error groups and malformed document groups are not empty success',async()=>{
  const f=fixture();const m=f.runMailSearch('메일검색'),d=f.dfRun('문서검색');
  f.requests[0].resolve({groups:{mail:{items:[],error:true,message:'권한 오류'}}});f.requests[1].resolve({groups:{}});await Promise.all([m,d]);
  assert.equal(f.S.mailSearch.res,null);assert.equal(f.S.mailSearch.err,'권한 오류');assert.equal(f.S.mailSearch.busy,false);
  assert.match(f.S.docs.err,/응답/);assert.equal(f.S.docs.busy,false);
});
test('unowned global legacy data is not assigned to the next signed-in account',()=>{
  const f=fixture(new Map([['bwyfgw:wc:weekly',JSON.stringify('private')],['bwyfgw:wc:dfRecent',JSON.stringify(['private'])]]));
  assert.equal(f.S.weekly,'');assert.deepEqual(Array.from(f.store.get('dfRecent',[])),[]);
  assert.equal(f.shared.has('bwyfgw:wc:A:weekly'),false);
  assert.equal(f.shared.get('bwyfgw:wc:weekly'),JSON.stringify('private'));
});
test('owned legacy data still migrates and mail reference encoding avoids concatenation collisions',()=>{
  const f=fixture(new Map([['bwyfgw:wc:weekly',JSON.stringify('mine')],['bwyfgw:wc:migrated:weekly','A']]));
  assert.equal(f.S.weekly,'mine');assert.notEqual(f.mailRefKey('ab','c'),f.mailRefKey('a','bc'));
});
test('classification keeps absent and ambiguous evidence unknown, separate from draft',()=>{
  for(const d of [null,{}, {form:'기안문',text:''},{text:'수신자 내부결재 또는 외부기관 제목 시험'},{text:'수신자 미정 제목 시험'}]) assert.equal(R.dfKind(d),'unknown');
  assert.equal(R.dfKind({form:'접수문서'}),'recv');assert.equal(R.dfKind({text:'수신자 내부 결재 제목 시험'}),'draft');assert.equal(R.dfKind({text:'수신자 부천시장 제목 시험'}),'send');
  assert.equal(R.DF_KIND_NAME.unknown,'확인 불가');assert.ok(R.DF_KINDS.some(([k])=>k==='unknown'));
});
