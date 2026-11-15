import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as R from '../src/live/chat.mjs';
const ui=await readFile(new URL('../src/live/wc/30-chat-ui.js',import.meta.url),'utf8');
const engine=await readFile(new URL('../src/live/wc/31-chat-engine.js',import.meta.url),'utf8');
const reply=parts=>({candidates:[{content:{parts},finishReason:'STOP'}]});
function setup(replies=[],ready=true) {
 const requests=[],db={chatHistV:3,chatModels:{at:Date.now(),list:['gemini-test']}};
 const ctx={R:{...R,kstNow:()=>({date:'2026-11-16'})},S:{settings:{},userKey:'test'},HOME_ACTS:{},root:{addEventListener(){}},setInterval(){},setTimeout:(f,n)=>{const t=setTimeout(f,n);t.unref();return t;},clearTimeout,AbortController,console,store:{get:(k,d)=>k in db?db[k]:d,set:(k,v)=>db[k]=v,del:k=>delete db[k]},allowed:()=>ready,aiReady:()=>ready,aiCfg:()=>({key:'fake'}),AI_HOST:'https://example.invalid',logError(){},$:()=>null,esc:x=>String(x??''),fetch:async(u,opt)=>{requests.push(JSON.parse(opt.body));const body=replies.shift();if(!body)throw Error('unexpected');return {ok:true,json:async()=>body};}};
 vm.createContext(ctx);vm.runInContext(ui+'\n'+engine+'\nthis.api={chatSend,chatState,chatRegisterTool}',ctx);
 return {api:ctx.api,requests};
}
test('기능 안내 다음 문장 형식 요청은 버튼 대신 문장으로 답한다',async()=>{
 const a=setup();a.api.chatRegisterTool({name:'get_capabilities',kind:'read',run:async()=>({ok:true,text:'아래 예시를 누르세요',llm:'일정 조회와 신청 준비를 지원한다.',cards:[{type:'chips',items:['일정']} ]})});
 await a.api.chatSend('너가 할 수 있는 일을 말해봐');await a.api.chatSend('너가 할 수 있는 일을 문장으로 말해봐');
 const m=a.api.chatState().msgs.at(-1);assert.match(m.text,/아래 예시를 누르세요/);assert.equal(m.cards.length,0);
});
test('안전하게 전달할 직전 답변이 없으면 임의의 맥락을 만들어내지 않는다',async()=>{
 const a=setup([reply([{text:'먼저 답합니다.'}])]);
 await a.api.chatSend('안녕하세요');await a.api.chatSend('방금 답을 문장으로 다시 말해줘');
 assert.equal(a.requests.length,1);assert.match(a.api.chatState().msgs.at(-1).text,/직전 답변을 안전하게 이어받을 수 없습니다/);
});
test('결재 질문에 일정 도구만 성공해도 결재 조회라고 허위 답하지 않는다',async()=>{
 const a=setup([reply([{functionCall:{name:'get_overview',args:{}}}]),reply([{text:'결재 문서가 없습니다.'}])]);
 a.api.chatRegisterTool({name:'get_overview',kind:'read',run:async()=>({ok:true,text:'요약'})});
 await a.api.chatSend('결재 목록을 자세히 설명해줘');assert.match(a.api.chatState().msgs.at(-1).text,/아직 조회하지 않았습니다/);assert.doesNotMatch(a.api.chatState().msgs.at(-1).text,/결재 문서가 없습니다/);
});
test('Gemini가 현재 요청에 없는 쓰기를 준비하지 못한다',async()=>{
 const a=setup([reply([{functionCall:{name:'reserve_vehicle',args:{}}}]),reply([{text:'예약했습니다.'}])]);let n=0;
 a.api.chatRegisterTool({name:'reserve_vehicle',kind:'act',run:async()=>{n++;return {ok:true,text:'예약'};}});
 await a.api.chatSend('오늘 차가 필요한 이유를 설명해줘');assert.equal(n,0);assert.doesNotMatch(a.api.chatState().msgs.at(-1).text,/예약했습니다/);
});
test('메일 도구의 제목 uid URL 본문은 Gemini 요청에 포함되지 않는다',async()=>{
 const a=setup([reply([{functionCall:{name:'list_mail',args:{}}}]),reply([{text:'메일을 확인했습니다.'}])]);
 a.api.chatRegisterTool({name:'list_mail',kind:'read',run:async()=>({ok:true,text:'메일 1건',llm:'메일 1건',data:{count:1,items:[{title:'비밀제목XYZ',uid:'uidsecretXYZ',url:'https://secret.invalid',body:'비밀본문XYZ'}]}})});
 await a.api.chatSend('메일 목록을 자세히 설명해줘');const wire=JSON.stringify(a.requests);for(const secret of ['비밀제목XYZ','uidsecretXYZ','https://secret.invalid','비밀본문XYZ'])assert.ok(!wire.includes(secret),secret);assert.match(wire,/메일 1건/);
});
test('검토되지 않은 도구는 llm과 text도 보내지 않으며 로컬 결과를 보존한다',async()=>{
 const a=setup([reply([{functionCall:{name:'get_schedule',args:{}}}]),reply([{text:'근거 없는 요약'}])]);
 a.api.chatRegisterTool({name:'get_schedule',kind:'read',run:async()=>({ok:true,text:'로컬일정비밀',llm:'민감요약',data:{title:'민감제목'}})});
 await a.api.chatSend('오늘 일정 자세히 설명해줘');const wire=JSON.stringify(a.requests);assert.doesNotMatch(wire,/로컬일정비밀|민감요약|민감제목/);assert.match(a.api.chatState().msgs.at(-1).text,/로컬일정비밀/);
});

test('로컬 규칙에 없는 업무 요청도 확인된 도구 결과를 그대로 표시한다',async()=>{
 const a=setup([reply([{functionCall:{name:'get_overview',args:{}}}]),reply([{text:'요약입니다.'}])]);
 a.api.chatRegisterTool({name:'get_overview',kind:'read',run:async()=>({ok:true,text:'수집된 업무 3건'})});
 await a.api.chatSend('업무가 어떻게 돌아가는지 설명해줘');assert.match(a.api.chatState().msgs.at(-1).text,/수집된 업무 3건/);
});

test('직전 대답 재서술은 과거 주제와 무관한 도구를 호출하지 않는다',async()=>{
 const a=setup([reply([{text:'두 문장으로 요약했습니다.'}])]);let runs=0;
 a.api.chatRegisterTool({name:'get_capabilities',kind:'read',run:async()=>({ok:true,text:'일정과 메일을 조회할 수 있습니다.',llm:'일정과 메일을 조회할 수 있습니다.',cards:[]})});
 a.api.chatRegisterTool({name:'get_budget',kind:'read',run:async()=>{runs++;return {ok:true,text:'예산'};}});
 await a.api.chatSend('너가 할 수 있는 일을 문장으로 말해봐');await a.api.chatSend('방금 말한 내용을 두 문장으로 간결하게 다시 설명해줘');
 assert.equal(runs,0);assert.ok(!a.requests[0].tools);assert.match(JSON.stringify(a.requests[0].contents),/일정과 메일/);
});

test('민감한 근태 신청 상세는 AI 요청으로 전송하지 않는다',async()=>{
 const a=setup([reply([{functionCall:{name:'list_my_requests',args:{}}}]),reply([{text:'확인했습니다'}])]);
 a.api.chatRegisterTool({name:'list_my_requests',kind:'read',run:async()=>({ok:true,text:'내 휴가 3건',llm:'개인휴가비밀 3건',data:{name:'비밀이름'}})});
 await a.api.chatSend('나의 신청 현황을 자세히 알려줘');assert.doesNotMatch(JSON.stringify(a.requests),/개인휴가비밀|비밀이름/);
});
