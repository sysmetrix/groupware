import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBrowserSnapshot} from '../src/browser-snapshot.mjs';
import {validateDataset} from '../src/schema.mjs';
import {buildBriefing, searchDocuments} from '../src/tasks.mjs';
import {createApp} from '../src/server.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const principal = {userId:'reader',displayName:'테스트 사용자',organizationId:'test-org'};
function fixture() {
  return {schemaVersion:1, principal, source:{kind:'browser-snapshot',label:'합성 화면 조회 시험',exportedAt:'2026-10-23T12:00:00Z',baseUrl:'https://example.invalid',coverage:[
    {type:'approval',state:'complete',query:'모든 대기문서',collected:0,total:0,url:'https://example.invalid/#/pending'},
    {type:'schedule',state:'complete',query:'2026년 10월, 선택 캘린더',collected:0,total:0,url:'https://example.invalid/#/calendar'},
    {type:'notice',state:'partial',query:'첫 페이지의 제목과 본문 한 건',collected:1,total:100,url:'https://example.invalid/#/board'},
    {type:'document',state:'unobserved',query:'규정 미조회',collected:0,total:null,url:''}
  ]},items:[{id:'browser:notice:1',type:'notice',status:'published',title:'연구 최종보고회',body:'회의는 10월 28일에 진행됩니다.',organizationId:principal.organizationId,allowedUserIds:[principal.userId],updatedAt:'2026-10-23T12:00:00Z',url:'https://example.invalid/#/board',tags:['조회화면링크']}]};
}

test('empty queried ranges and partial notices survive normalization distinctly from unobserved documents',()=>{
  const dataset=buildBrowserSnapshot(fixture(),principal);
  assert.deepEqual(validateDataset(dataset),dataset);
  assert.equal(dataset.source.coverage[3].total,null);
  assert.deepEqual(buildBriefing(dataset,new Date('2026-10-23T12:00:00Z')).counts,{pending:0,overdue:0,schedules:0,notices:1});
  const hit=searchDocuments(dataset,'최종보고회',new Date('2026-10-23T12:00:00Z')).hits[0];
  assert.equal(hit.type,'notice'); assert.equal(hit.urlKind,'collection'); assert.match(hit.excerpt,/10월 28일/);
  assert.equal(searchDocuments(dataset,'최종보고회').references[0].urlKind,'collection');
});
test('incomplete, duplicated, misleading and unsafe coverage is rejected',()=>{
  for (const mutate of [
    d=>{delete d.source.coverage;},
    d=>{d.source.coverage[0].type='notice';},
    d=>{d.source.coverage[2].collected=0;},
    d=>{d.source.coverage[2].state='complete';},
    d=>{d.source.coverage[3].total=0;},
    d=>{d.source.coverage[0].url='https://example.invalid/?token=secret';},
    d=>{d.source.coverage[0].url='https://other.invalid';},
    d=>{d.source.coverage[0].cookie='secret';},
    d=>{d.source.kind='manual-export';}
  ]) { const input=fixture(); mutate(input); assert.throws(()=>buildBrowserSnapshot(input,principal)); }
});
test('principal changes and widening the local ACL fail closed',()=>{
  for(const key of ['userId','displayName','organizationId']) assert.throws(()=>buildBrowserSnapshot(fixture(),{...principal,[key]:'different'}));
  const input=fixture(); input.items[0].allowedUserIds.push('other');
  assert.throws(()=>buildBrowserSnapshot(input,principal));
});
test('notice search keeps access and publication filters',()=>{
  const input=fixture();
  input.items.push({...input.items[0],id:'hidden',allowedUserIds:[]});
  input.items.push({...input.items[0],id:'cancelled',status:'cancelled'});
  input.source.coverage[2].collected=3;
  assert.deepEqual(searchDocuments(validateDataset(input),'최종보고회').hits.map(x=>x.id),['browser:notice:1']);
});
test('HTTP import exposes the captured scope but never claims a persistent live connection',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'groupware-browser-test-'));
  const server=await createApp({dataDir:dir,configFile:path.join(dir,'absent.json')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const state=await (await fetch(base+'/api/status')).json();
  const response=await fetch(base+'/api/import',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':state.csrf},body:JSON.stringify(buildBrowserSnapshot(fixture(),principal))});
  assert.equal(response.status,200);
  const result=await (await fetch(base+'/api/status')).json();
  assert.equal(result.liveConnected,false); assert.equal(result.source.kind,'browser-snapshot'); assert.equal(result.visibleCount,1);
  assert.equal(result.source.coverage[2].state,'partial');
});
