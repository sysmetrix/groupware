import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as R from '../src/live/chat.mjs';
const ui=await readFile(new URL('../src/live/wc/30-chat-ui.js',import.meta.url),'utf8');
const engine=await readFile(new URL('../src/live/wc/31-chat-engine.js',import.meta.url),'utf8');
test('내일 일정 다음 행사 질문은 날짜를 이어 받아 같은 제목을 찾는다',async()=>{
 const db={chatHistV:3}; const calls=[];
 const ctx={R,S:{settings:{},userKey:'test'},HOME_ACTS:{},root:{addEventListener(){}},setInterval(){},setTimeout:(f,n)=>{const t=setTimeout(f,n);t.unref();return t;},clearTimeout,console,
 store:{get:(k,d)=>k in db?db[k]:d,set:(k,v)=>db[k]=v,del:k=>delete db[k]},allowed:()=>false,logError(){},$:()=>null,esc:x=>String(x??'')};
 vm.createContext(ctx);vm.runInContext(ui+'\n'+engine+'\nthis.api={chatSend,chatState,chatRegisterTool}',ctx);
 ctx.api.chatRegisterTool({name:'get_schedule',kind:'read',run:async a=>{calls.push(a);return {ok:true,text:'조회 완료'};}});
 await ctx.api.chatSend('내일 일정'); await ctx.api.chatSend('이주배경 일정 있잖아');
 assert.equal(calls.length,2);assert.equal(calls[1].date,calls[0].date);assert.equal(calls[1].query,'이주배경');
});
