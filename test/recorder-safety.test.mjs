import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/live/wc/20-recorder.js', import.meta.url), 'utf8');
const start = source.indexOf('  function createPlayer('), end = source.indexOf('  // ---------- 기록기 화면', start);
assert.ok(start >= 0 && end > start);
function setup() {
  let clicks = 0;
  const el = {isConnected: true, getClientRects: () => [1], scrollIntoView() {}, getBoundingClientRect: () => ({left:0,top:0,width:1,height:1})};
  const ctx = vm.createContext({Date, JSON, String, Error, Math, window:{confirm:()=>true}, AUTO:{allow:false}, rNorm:s=>s||'', recFrameDoc:()=>({}), recQuery:()=>el, rVisible:()=>true, recDanger:()=>'', recMouse:()=>{clicks++;throw Error('클릭 이후 오류');}, wait: async()=>{}});
  return {make:vm.runInContext(source.slice(start,end)+';createPlayer',ctx), clicks:()=>clicks};
}
test('a failed click is not repeated', async () => {const env=setup();const p=env.make({getRootDocs:()=>[{}],onProgress:()=>{}});const r=await p.play({steps:[{type:'click',frame:[],selectors:[{by:'text',value:'x'}]}]});assert.equal(r.ok,false);assert.equal(env.clicks(),1);});
test('a stop before a step prevents the click', async () => {const env=setup();let p; p=env.make({getRootDocs:()=>[{}],onProgress:()=>{},beforeStep:async()=>{p.stop();return true;}});const r=await p.play({steps:[{type:'click',frame:[],selectors:[{by:'text',value:'x'}]}]});assert.equal(r.ok,false);assert.equal(env.clicks(),0);});
