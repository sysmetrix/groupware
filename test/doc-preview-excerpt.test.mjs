import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL('../src/live/' + p, import.meta.url), 'utf8');
const data = read('wc/03-data.js');
const cacheCode = data.slice(data.indexOf('  const previewCache ='), data.indexOf('  const isUserBusy ='));
function cacheFixture(docPreview) {
  const c = vm.createContext({currentKey:'A', GW:{docPreview}, Map, Promise, JSON});
  vm.runInContext(cacheCode + '\nthis.api={loadPreview,previewKey,previewCache,setUser:u=>currentKey=u};', c);
  return c.api;
}
test('preview cache isolates users and document identities, and coalesces in-flight requests', async () => {
  let calls=0, finish; const a=cacheFixture(() => {calls++; return new Promise(r=>finish=r);});
  const d={docId:'1',docNo:'N',title:'제목'};
  const p=a.loadPreview(d), q=a.loadPreview(d); await Promise.resolve(); assert.equal(calls,1);
  finish({found:true,text:'A'}); assert.equal((await p).text,'A'); await q;
  a.setUser('B'); const r=a.loadPreview(d); await Promise.resolve(); assert.equal(calls,2); finish({found:true,text:'B'}); assert.equal((await r).text,'B');
  const s=a.loadPreview({...d,docId:'2'}); await Promise.resolve(); assert.equal(calls,3); finish({found:true}); await s;
});
test('failed and ambiguous lookups can be retried without caching the failure', async () => {
  let calls=0; const a=cacheFixture(() => {calls++; if(calls===1) throw Error('offline'); return calls===2 ? {found:false,reason:'ambiguous'} : {found:true};});
  const d={docNo:'N',title:'제목'};
  assert.equal((await a.loadPreview(d)).reason,'error'); assert.equal((await a.loadPreview(d)).reason,'ambiguous'); assert.equal((await a.loadPreview(d)).found,true); assert.equal(calls,3);
});
test('document search index preserves available newlines while masking secrets', () => {
  const src=read('collector.browser.js');
  const helpers=src.slice(src.indexOf('  const indexText ='),src.indexOf('  // Foundation budget projects'));
  const c=vm.createContext({SECRET:/((?:password)\s*[:：=]?\s*)(\S+)/gi,str:(v,max)=>String(v||'').slice(0,max),mask:(v,max)=>String(v||'').slice(0,max),arr:v=>Array.isArray(v)?v:[],snippetAround:()=>'',LINKS:{doc:()=>''}});
  vm.runInContext(helpers+'\nthis.run=normalizeSearch;',c);
  const r=c.run('doc',{docContents:'첫 줄\r\npassword: secret\r마지막 줄',docTitle:'제목'},'제목');
  assert.equal(r.text,'첫 줄\npassword: [MASKED]\n마지막 줄');
});
test('preview UI identifies excerpts, distinct failures, waiting and explicit retry', () => {
  const src=read('wc/13-detail-pane.js');
  const block=src.slice(src.indexOf('    const waiting ='),src.indexOf('    const warn =',src.indexOf('    const waiting =')));
  const run = new Function('d','kind','S','previewKey','currentKey','R','esc','ddayText','loadPreview','$','renderPane',block+'\nreturn pvBox;');
  const base={pane:{},sel:{}}; const invoke=pv=>{base.pane.preview={key:'k',data:pv};return run({title:'제목'},'pending',base,()=> 'k','A',{extractAllDeadlines:()=>[]},s=>String(s),()=>'',()=>{},()=>{},()=>{});};
  assert.match(invoke({found:true,text:'첫 줄\n둘째 줄'}),/평문 색인/); assert.match(invoke({found:true,text:'a\nb'}),/white-space:pre-wrap/);
  assert.match(invoke({found:false,reason:'error'}),/오류/); assert.match(invoke({found:false,reason:'ambiguous'}),/확실히 구분/); assert.match(invoke({found:false,reason:'incomplete'}),/불완전/); assert.match(invoke({found:false}),/data-act="docPreviewRetry"/);
  assert.match(run({title:'t'},'distWaiting',base,()=> 'k','A',{},String,()=>'',()=>{throw Error('unexpected lookup');},()=>{},()=>{}),/조회하지 않습니다/);
  assert.match(read('wc/16-events.js'),/case 'docPreviewRetry':/);
});
