import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/live/wc/36-chat-tools-more.js',import.meta.url),'utf8');
function tools(){const m=new Map();vm.runInNewContext(source,{chatRegisterTool:x=>m.set(x.name,x),S:{},CHAT_CAPS:[['일정',['오늘 일정']]]});return m;}
test('문장으로 설명해 달라고 하면 버튼 목록 없이 지원 및 미지원 범위를 문장으로 답한다',async()=>{
 const r=await tools().get('get_capabilities').run({}, {userText:'너가 할 수 있는 일을 문장으로 말해봐'});assert.equal(r.cards.length,0);assert.match(r.text,/구글 캘린더 일정은 직접 읽지 못/);assert.match(r.text,/수집된 그룹웨어/);
});
test('보통 기능 안내는 예시를 유지하고 모든 자료를 읽는다고 과장하지 않는다',async()=>{
 const r=await tools().get('get_capabilities').run({}, {userText:'뭘 할 수 있어?'});assert.ok(r.cards.length>0);assert.doesNotMatch(r.text,/자료는 모두/);
});

