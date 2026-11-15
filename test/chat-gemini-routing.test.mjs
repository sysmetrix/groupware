import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as R from '../src/live/chat.mjs';
const ui=await readFile(new URL('../src/live/wc/30-chat-ui.js',import.meta.url),'utf8');
const engine=await readFile(new URL('../src/live/wc/31-chat-engine.js',import.meta.url),'utf8');
function setup(replies) {
 const requests=[], calls=[], db={chatHistV:3,chatModels:{at:Date.now(),list:['gemini-test']}};
 const ctx={R:{...R,kstNow:()=>({date:'2026-11-16'})},S:{settings:{},userKey:'test'},HOME_ACTS:{},root:{addEventListener(){}},setInterval(){},setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;},clearTimeout,AbortController,console,
 store:{get:(k,d)=>k in db?db[k]:d,set:(k,v)=>db[k]=v,del:k=>delete db[k]},allowed:()=>true,aiReady:()=>true,aiCfg:()=>({key:'fake'}),AI_HOST:'https://example.invalid',
 logError(){},$:()=>null,esc:x=>String(x??''),fetch:async(u,opt)=>{requests.push(JSON.parse(opt.body));const body=replies.shift();if(!body) throw Error('unexpected request');return {ok:true,json:async()=>body};}};
 vm.createContext(ctx);vm.runInContext(ui+'\n'+engine+'\nthis.api={chatSend,chatState,chatRegisterTool};',ctx);
 ctx.api.chatRegisterTool({name:'get_staff_status',kind:'read',params:{type:'object',properties:{name:{type:'string'}}},run:async a=>{calls.push(a);return {ok:true,text:'근태 조회됨'};}});
 return {api:ctx.api,requests,calls};
}
const response=parts=>({candidates:[{content:{parts},finishReason:'STOP'}]});
test('Gemini가 모호한 일정에 확인 질문을 할 수 있다',async()=>{
 const a=setup([response([{text:'행사 일정인가요, 직원 근태 일정인가요?'}])]);
 await a.api.chatSend('이주배경 일정 있잖아');
 assert.equal(a.requests[0].toolConfig.functionCallingConfig.mode,'AUTO');
 assert.match(a.api.chatState().msgs.at(-1).text,/아직 일정을 조회하지 않았습니다/);assert.equal(a.calls.length,0);
});
test('Gemini의 잘못된 직원 조회 호출은 실행 경계에서 차단한다',async()=>{
 const a=setup([response([{functionCall:{name:'get_staff_status',args:{name:'이주배경'}}}]),response([{text:'행사 일정인지 직원 일정인지 알려 주세요.'}])]);
 await a.api.chatSend('이주배경 일정 있잖아');
 assert.equal(a.calls.length,0); assert.match(JSON.stringify(a.requests[1]),/조회하지 않았습니다/);
 assert.match(a.api.chatState().msgs.at(-1).text,/조회하지 않았습니다/);
});
test('직원 근태를 명시하면 정상 조회를 차단하지 않는다',async()=>{
 const a=setup([]); await a.api.chatSend('김지은 님 내일 출장 일정'); assert.equal(a.calls.length,1);assert.equal(a.calls[0].name,'김지은');
});


test('행사 조건을 무시하고 일반 일정 조회로 없다고 답하지 않는다',async()=>{
 const a=setup([response([{functionCall:{name:'get_schedule',args:{date:'tomorrow'}}}]),response([{text:'행사 일정의 날짜와 출처를 알려 주세요.'}])]);
 let n=0;a.api.chatRegisterTool({name:'get_schedule',kind:'read',params:{type:'object',properties:{date:{type:'string'}}},run:async()=>{n++;return {ok:true,text:'일정이 없습니다'};}});
 await a.api.chatSend('이주배경 일정 있잖아');assert.equal(n,0);assert.match(JSON.stringify(a.requests[1]),/특정 행사/);
});

test('복합 사업·행사 표현은 직원 근태와 일반 일정으로 우회하지 못한다',async()=>{
 for(const text of ['리빙랩 행사 일정 알려줘','이주배경 사업 일정 언제야']) {
  const a=setup([response([{functionCall:{name:'get_staff_status',args:{name:'리빙랩'}}}]),response([{text:'행사 일정을 말씀하시나요?'}])]);
  await a.api.chatSend(text); assert.equal(a.calls.length,0);assert.match(JSON.stringify(a.requests[1]),/조회하지 않았습니다/);
 }
});

test('도구 미호출 Gemini의 허위 조회 주장은 표시하지 않는다',async()=>{
 const a=setup([response([{text:'그룹웨어를 검색했지만 일정을 찾지 못했습니다.'}])]);
 await a.api.chatSend('이주배경 사업 일정 언제야');
 assert.match(a.api.chatState().msgs.at(-1).text,/아직 일정을 조회하지 않았습니다/);
 assert.doesNotMatch(a.api.chatState().msgs.at(-1).text,/검색했지만/);
});

test('차단된 도구 이후 Gemini의 허위 검색 주장을 차단한다',async()=>{
 const a=setup([response([{functionCall:{name:'get_staff_status',args:{name:'이주배경'}}}]),response([{text:'그룹웨어 일정에서 찾지 못했습니다.'}])]);
 await a.api.chatSend('이주배경 사업 일정 언제야');assert.match(a.api.chatState().msgs.at(-1).text,/아직 일정을 조회하지 않았습니다/);
});

test('모델이 임의의 할 일을 직접 저장하지 못한다',async()=>{
 const a=setup([response([{functionCall:{name:'add_todo',args:{title:'임의 메모'}}}]),response([{text:'추가했습니다.'}])]);let writes=0;
 a.api.chatRegisterTool({name:'add_todo',kind:'act',run:async()=>{writes++;return {ok:true,text:'저장됨'};}});
 await a.api.chatSend('오늘 해야 할 것을 알려줘'); assert.equal(writes,0);assert.match(JSON.stringify(a.requests[1]),/자동 저장하지 않았습니다/);assert.match(a.api.chatState().msgs.at(-1).text,/자동 저장하지 않았습니다/);assert.doesNotMatch(a.api.chatState().msgs.at(-1).text,/추가했습니다/);
});

test('무관한 도구 성공으로 일정 검색을 했다고 말하지 않는다',async()=>{
 const a=setup([response([{functionCall:{name:'get_overview',args:{}}}]),response([{text:'그룹웨어 일정을 검색했지만 없습니다.'}])]);
 a.api.chatRegisterTool({name:'get_overview',kind:'read',run:async()=>({ok:true,text:'요약 조회'})});
 await a.api.chatSend('이주배경 사업 일정 언제야');assert.match(a.api.chatState().msgs.at(-1).text,/아직 일정을 조회하지 않았습니다/);
});
