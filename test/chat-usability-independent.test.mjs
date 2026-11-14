import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as R from '../src/live/chat.mjs';
const ui = await readFile(new URL('../src/live/wc/30-chat-ui.js', import.meta.url), 'utf8');
const engine = await readFile(new URL('../src/live/wc/31-chat-engine.js', import.meta.url), 'utf8');
const read = await readFile(new URL('../src/live/wc/32-chat-tools-read.js', import.meta.url), 'utf8');
function harness(history = [], overrides = {}) {
 const db = {chatHistV: 3, chatHist: history};
 const ctx = {R, S: {settings:{}, a:{deadlines:[]}, raw:{data:{schedule:{start:'20260101',end:'20261231',events:[]}}}, team:{202611:{cal:{byDate:{}}}}}, HOME_ACTS:{}, root:{addEventListener(){}}, setInterval(){}, queueMicrotask(){}, console,
 store:{get:(k,d)=>k in db?db[k]:d,set:(k,v)=>db[k]=v,del:k=>delete db[k]}, esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
 today:()=> '2026-11-14', ensureTeam(){}, logError(){}, $:()=>null, allowed:()=>false, ic:()=>'', mineVisible:()=>[{title:'업무 A',key:'a',area:'결재'},{title:'업무 B',key:'b',area:'메일'}], stateOf:()=> 'todo', STATE_NAME:{todo:'할 일'}};
 Object.assign(ctx, overrides);
 vm.createContext(ctx); vm.runInContext(ui+'\n'+engine+'\n'+read+'\nthis.api={chatState,chatLogHtml,chatView,chatSend,CHAT_TOOLS};',ctx); return ctx.api;
}
test('복원 대화는 접고 새 대화는 표시하며 펼침 상태를 유지한다',()=>{
 const a=harness([{role:'user',text:'이전 <질문>',at:1}]); let h=a.chatLogHtml();
 assert.match(h,/<details[^>]*data-chat-history/); assert.doesNotMatch(h,/<details[^>]* open/); assert.match(h,/이전 &lt;질문&gt;/);
 a.chatState().historyExpanded=true; a.chatState().msgs.push({role:'user',text:'새 질문',at:1}); h=a.chatLogHtml(); assert.match(h,/<details[^>]* open/); assert.ok(h.indexOf('</details>')<h.indexOf('새 질문'));
 assert.match(a.chatView(),/aria-describedby="chInputHelp"/); assert.match(a.chatView(),/Shift\+Enter/);
});
test('요일 도구는 날짜와 요일을 제공하고 잘못된 날짜는 거절한다',async()=>{
 const a=harness(), t=a.CHAT_TOOLS.get('get_weekday'); const r=await t.run({date:'2026-11-14'}); assert.equal(r.text,'2026-11-14은 토요일입니다.'); assert.equal((await t.run({date:'2026-02-30'})).ok,false);
});
test('가장 먼저 질문은 기존 순서의 첫 항목을 표시한다',async()=>{
 const a=harness(); await a.chatSend('제일 먼저 할 일은 뭐야?'); const m=a.chatState().msgs.at(-1); assert.equal(m.cards[0].items.length,1); assert.equal(m.cards[0].items[0].title,'업무 A'); assert.match(m.text,/2건/);
});
test('일정 조회는 자원 예약을 섞지 않고 제외 사실을 명시한다',async()=>{
 const a=harness(); const result=await a.CHAT_TOOLS.get('get_schedule').run({date:'2026-11-14'}); assert.match(result.text,/자원 예약은 포함되지 않습니다/); assert.equal(result.data.days.length,0);
});

test('요일 질문은 로컬에서 처리하고 유효하지 않은 날짜를 오늘로 추정하지 않는다',async()=>{
 const a=harness(); await a.chatSend('2026-11-14는 무슨 요일이야?'); assert.equal(a.chatState().msgs.at(-1).text,'2026-11-14은 토요일입니다.');
 await a.chatSend('2026-02-30은 무슨 요일이야?'); assert.match(a.chatState().msgs.at(-1).text,/날짜를 알아보지 못했습니다/);
});

test('요약은 조회 실패를 0건 정상으로 단정하지 않는다',async()=>{
 const a=harness([], {homeData:()=>({loaded:true,urgent:0,todo:0,check:0,wait:0,mine:[],events:[],away:[],taskGaps:true,scheduleUnknown:true,teamError:'offline'})});
 const r=await a.CHAT_TOOLS.get('get_overview').run({});
 assert.match(r.text,/확인 제한/); assert.match(r.text,/자리 비움 확인 불가/); assert.equal(r.data.task_complete,false); assert.equal(r.data.schedule_complete,false); assert.equal(r.data.away_today,null); assert.equal(r.cards[0].items[1].label,'할 일(확인분)');
});

test('미래 날짜의 첫 할 일은 현재 기준이라고 표시한다',async()=>{
 const a=harness(); const r=await a.CHAT_TOOLS.get('list_tasks').run({limit:1,requested_date:'2026-11-16'});
 assert.match(r.text,/현재 수집된 목록의 우선순위/); assert.match(r.text,/2026-11-16/); assert.equal(r.cards[0].items.length,1);
});
