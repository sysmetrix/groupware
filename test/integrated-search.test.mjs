import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = n => readFileSync(new URL(`../src/live/wc/${n}`, import.meta.url), 'utf8');
const search = read('09-search-board.js').split('  // ----- 할 일 보드')[0];
const events = read('16-events.js');
const handlers = events.slice(events.indexOf("  root.addEventListener('click'"), events.indexOf('  const csvCols')) + events.slice(events.indexOf("  root.addEventListener('input'"), events.indexOf("  root.addEventListener('keydown'"));
const keys = read('04-timers-keys.js');
const keyFunction = keys.slice(keys.indexOf('  function handleKey('), keys.indexOf('\n  function ', keys.indexOf('  function handleKey(') + 3));
function setup() {
  const callbacks = {}, calls = [], toasts = [], inputs = {sq: {id:'sq', value:'', tagName:'INPUT'}, speriod: {id:'speriod', value:'', tagName:'SELECT'}};
  const S = {open:true, search:{kw:'', period:'', types:['doc'], res:null, busy:false, more:{}}, searchRecent:[]};
  const root = {addEventListener: (name, cb) => { callbacks[name] = cb; }, activeElement:null};
  const FixedDate = class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-14T12:00:00'])); } };
  const context = {S, root, Date:FixedDate, AUTO:{running:false}, GW:{searchLabels:{doc:'문서', mail:'메일'}, search:(kw, opts) => new Promise((resolve,reject) => calls.push({kw,opts,resolve,reject}))}, R:{kstNow:d=>({date:[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')})}, $:sel => inputs[sel.replace('#','')] || null, toast:v=>toasts.push(v), render:()=>{}, renderMain:()=>{}, renderPane:()=>{}, esc:String, pgh:()=>'', ic:()=>'', hl:String, ymd8:String, shortWhen:String};
  vm.createContext(context); vm.runInContext(search + '\n' + handlers + '\n' + keyFunction + '\nthis.api={runSearch,searchMore,vSearch,handleKey};', context);
  const event = t => ({composedPath:()=>[t], stopPropagation(){}, preventDefault(){this.prevented=true;}});
  const click = (act, extra={}) => callbacks.click(event({tagName:'BUTTON',dataset:{act,...extra}}));
  const input = (id,value) => { inputs[id].value = value; callbacks[id==='sq'?'input':'change'](event(inputs[id])); };
  const enter = () => {const e=event(inputs.sq); e.key='Enter'; context.api.handleKey(e); return e;};
  return {S,calls,toasts,inputs,api:context.api,click,input,enter};
}
const result = (kw, items=['a'], total=30) => ({keyword:kw,groups:{doc:{label:'문서',items:items.map(docId=>({docId,title:docId})),total}}});
const tick = () => new Promise(resolve=>setImmediate(resolve));

test('입력과 기간 변경은 재렌더와 유형 변경에도 유지된다', async()=>{
  const h=setup(); h.input('sq','  새 검색  '); h.input('speriod','3'); await h.click('stype',{v:'mail'});
  assert.equal(h.S.search.kw,'  새 검색  '); assert.equal(h.S.search.period,'3');
  assert.match(h.api.vSearch(),/value="  새 검색  "/); assert.match(h.api.vSearch(),/value="3" selected/);
});

test('Enter와 검색 버튼은 같은 값과 기간을 사용하고 빈 검색어는 이전 값으로 대체하지 않는다', async()=>{
  for (const method of ['enter','button']) {
    const h=setup(); h.S.search.kw='이전 검색'; h.inputs.sq.value='  신규 검색  '; h.inputs.speriod.value='3';
    if(method==='enter') assert.equal(h.enter().prevented,true); else await h.click('doSearch');
    assert.equal(h.calls.length,1); assert.equal(h.calls[0].kw,'신규 검색'); assert.equal(h.calls[0].opts.from,'20260814');
    h.calls[0].resolve(result('신규 검색')); await tick();
    h.inputs.sq.value='  '; if(method==='enter') h.enter(); else await h.click('doSearch');
    assert.equal(h.calls.length,1); assert.equal(h.S.search.kw,''); assert.equal(h.toasts.length,1);
  }
});

test('더보기 중복 클릭은 한 요청만 전송하며 편집 중인 입력이 아닌 기존 검색 조건을 사용한다', async()=>{
  const h=setup(); h.input('sq','원래 검색'); h.input('speriod','3'); await h.click('doSearch'); h.calls[0].resolve(result('원래 검색')); await tick();
  h.input('sq','수정 중'); h.input('speriod','1'); await h.click('searchMore',{t:'doc'}); await h.click('searchMore',{t:'doc'});
  assert.equal(h.calls.length,2); assert.equal(h.calls[1].kw,'원래 검색'); assert.equal(h.calls[1].opts.page,2); assert.equal(h.calls[1].opts.from,'20260814');
  assert.match(h.api.vSearch(),/불러오는 중/); h.calls[1].resolve(result('원래 검색',['b'])); await tick();
  assert.deepEqual(Array.from(h.S.search.res.groups.doc.items,x=>x.docId),['a','b']); assert.equal(h.S.search.more.doc,2);
});

test('더보기 오류 시 페이지를 증가시키지 않고 재시도한다', async()=>{
  const h=setup(); h.input('sq','검색어'); await h.click('doSearch'); h.calls[0].resolve(result('검색어')); await tick();
  await h.click('searchMore',{t:'doc'}); h.calls[1].resolve({groups:{doc:{error:'ERROR',message:'오류'}}}); await tick();
  assert.equal(h.toasts.at(-1),'오류'); assert.equal(h.S.search.more.doc,undefined);
  await h.click('searchMore',{t:'doc'}); assert.equal(h.calls[2].opts.page,2); h.calls[2].resolve(result('검색어',['b'])); await tick();
});

test('이전 검색과 이전 더보기의 늦은 응답은 새 결과를 덮지 않는다', async()=>{
  const h=setup(); h.input('sq','첫 검색'); await h.click('doSearch'); h.input('sq','둘 검색'); h.enter();
  h.calls[1].resolve(result('둘 검색',['b'])); await tick(); h.calls[0].resolve(result('첫 검색',['a'])); await tick();
  assert.equal(h.S.search.res.keyword,'둘 검색'); assert.deepEqual(Array.from(h.S.searchRecent),['둘 검색']);
  await h.click('searchMore',{t:'doc'}); h.input('sq','셋 검색'); h.enter(); h.calls[3].resolve(result('셋 검색',['c'])); await tick();
  h.calls[2].resolve(result('둘 검색',['old'])); await tick();
  assert.equal(h.S.search.res.keyword,'셋 검색'); assert.deepEqual(Array.from(h.S.search.res.groups.doc.items,x=>x.docId),['c']); assert.equal(h.S.search.more.doc,undefined);
});
