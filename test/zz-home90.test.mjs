import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../src/live/home-model.mjs';
const read = n => readFileSync(new URL('../src/live/wc/' + n, import.meta.url), 'utf8');
const home = read('29-home-view.js'), ui = read('30-chat-ui.js'), engine = read('31-chat-engine.js');
const deferred = () => { let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve}; };
function setup(ready = false) {
 const data = {chatHistV:3,chatModels:{at:Date.now(),list:['test-model']}};
 const S = {userKey:'A',settings:{},view:'home',a:{failed:[],approval:{lists:{}}},raw:{data:{schedule:{start:'20261101',end:'20261130',events:[]}},status:{}},team:{202611:{cal:{byDate:{},depts:[]}}},homeRes:{day:'20261115',items:[]}};
 const c = {S,Date,AbortController,TextDecoder,console,AI_HOST:'https://example.invalid',root:{addEventListener(){},activeElement:null},setTimeout(){return 0;},clearTimeout(){},setInterval(){},chatRefresh(){},logError(){},allowed:()=>true,aiReady:()=>ready,aiCfg:()=>({key:'fake'}),$:()=>null,esc:x=>String(x??''),ic:()=>'',mineVisible:()=>[],visibleActions:()=>[],fmtDays:String,isMine:()=>true,stateOf:x=>x.state,STATE_NAME:{},store:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>data[k]=v,del:k=>delete data[k]},R:{...model,kstNow:()=>({date:'2026-11-15'}),teamHomeSummary:()=>({leave:[],trip:[]}),chatIntent:()=>({tool:'list_tasks',args:{},confidence:1}),chatFollowupIntent:()=>null,chatScheduleFollowup:()=>null,chatSanitizeText:String,chatSanitizeForLlm:x=>x,chatSystemPrompt:()=>'',chatBuildRequest:x=>x,chatComposePrompt:()=>'',chatDowName:()=>''}};
 vm.createContext(c); vm.runInContext(home+'\n'+ui+'\n'+engine+'\nthis.register=chatRegisterTool;',c);
 c.chatRefresh=()=>{};
 return {c,S,data};
}
test('stop releases busy immediately; delayed local result cannot mutate new conversation context',async()=>{
 const {c}=setup(), d=deferred(); let calls=0;
 c.register({name:'list_tasks',run:()=>++calls===1?d.promise:{ok:true,text:'new result',data:{items:[{itemId:'new'}]}}});
 const first=c.chatSend('first'), st=c.chatState(), old=st.activeReply;
 assert.equal(st.busy,true); c.chatStop(); assert.equal(st.busy,false); assert.equal(st.abort,null); assert.equal(old.state,'done');
 await c.chatSend('second'); const count=st.msgs.length;
 d.resolve({ok:true,text:'old result',data:{items:[{itemId:'old'}]},cards:[{type:'confirm',onConfirm(){}}]}); await first;
 assert.equal(st.msgs.length,count); assert.equal(st.ctx.lastItems[0].itemId,'new'); assert.equal(old.cards.length,0); assert.equal(Object.keys(st.pending).length,0); assert.equal(st.msgs.at(-1).text,'new result'); assert.equal(st.busy,false);
});
test('stopping streaming composition aborts request and permits resend before old response settles',async()=>{
 const {c}=setup(true), stream=deferred(), started=deferred(); let signal;
 c.register({name:'list_tasks',kind:'read',run:async()=>({ok:true,text:'local answer with enough detail to trigger AI composition and preserve it'})});
 c.fetch=async(_url,opt)=>{signal=opt.signal;started.resolve();return {ok:true,body:{getReader:()=>({read:()=>stream.promise})}};};
 const first=c.chatSend('compose'); await started.promise; const st=c.chatState(), old=st.activeReply;
 c.chatStop(); assert.equal(signal.aborted,true); assert.equal(st.busy,false); assert.match(old.text,/local answer/);
 c.aiReady=()=>false; await c.chatSend('next'); stream.resolve({done:true}); await first;
 assert.equal(st.busy,false); assert.equal(st.activeReply,null); assert.equal(old.tools.some(t=>t.state==='run'),false);
});
test('clear discards deferred local result and can immediately accept a new request',async()=>{
 const {c}=setup(), d=deferred(); let calls=0;c.register({name:'list_tasks',run:()=>++calls===1?d.promise:{ok:true,text:'fresh'}});
 const first=c.chatSend('old');c.chatClear();await c.chatSend('fresh');d.resolve({ok:true,text:'stale'});await first;
 assert.equal(c.chatState().msgs.length,2);assert.equal(c.chatState().msgs.at(-1).text,'fresh');
});
test('unknown schedule propagates to tile and briefing, and invalid coverage hides stale events',()=>{
 const {c,S}=setup(); S.raw.data.schedule.start='20261001';S.raw.data.schedule.end='20261031';S.raw.data.schedule.events=[{start:'202611150900',end:'202611151000',title:'stale'}];
 const d=c.homeData();assert.equal(d.scheduleUnknown,true);assert.equal(d.events.length,0);
 assert.match(c.homeTopHtml(d),/일부 미확인/);assert.match(c.homeDashHtml(d),/일정 조회 또는 오늘 날짜 범위/);assert.doesNotMatch(c.chatBriefHtml(),/ch-fact|\d+건/,'the chat opener repeats no numbers; tiles and cards own them');
 assert.doesNotMatch(c.homeDashHtml(d),/조회된 그룹웨어 일정이 없습니다/);
 assert.equal(model.homeBriefing({events:null}).facts[0].value,'확인 불가');
 assert.equal(model.homeTiles({events:null})[3].value,'–');
});
test('partial task failure does not announce a verified empty list of work',()=>{
 const {c,S}=setup();S.raw.status.mail={ok:false};assert.doesNotMatch(c.chatBriefHtml(),/새로 도착한 처리할 일이 없습니다/);assert.match(c.chatBriefHtml(),/확인된 처리할 일이 없습니다/);
});
test('region replacement restores matching control occurrence and never steals outside focus',()=>{
 const {c}=setup(); let focused='';const control=(n)=>({tagName:'BUTTON',dataset:{act:'homeTile',v:'schedule'},focus:()=>focused=n});
 const old1=control('old1'),old2=control('old2'),new1=control('new1'),new2=control('new2');let replaced=false;
 const region={contains:el=>el===old1||el===old2,querySelectorAll:()=>replaced?[new1,new2]:[old1,old2],set innerHTML(v){replaced=true;}};
 c.root.activeElement=old2;c.homeReplaceHtml(region,'new');assert.equal(focused,'new2');
 focused='';c.root.activeElement=control('outside');c.homeReplaceHtml(region,'other');assert.equal(focused,'');
});
test('external AI scope and limitations are visible before sending',()=>{
 const {c}=setup(true);assert.match(c.chatFootHtml(),/Google Gemini/);assert.match(c.chatFootHtml(),/자동 가림은 완전하지/);
});
