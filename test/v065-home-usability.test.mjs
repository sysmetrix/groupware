import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function setup() {
  const src = await readFile(new URL('../src/live/wc/30-chat-ui.js', import.meta.url), 'utf8');
  const st = {msgs: [], busy: false, draft: ''};
  const listeners = {};
  const root = {activeElement: null, addEventListener(name, fn) { listeners[name] = fn; }};
  const input = {value:'old', style:{}, scrollHeight:30};
  const log = {id:'chLog', scrollHeight:1000, scrollTop:100, clientHeight:200, innerHTML:'', querySelectorAll() { return []; }, querySelector() { return null; }};
  const els = {'#chLog':log, '#chInput':input};
  const ctx = {HOME_ACTS:{}, root, setInterval: () => 123, queueMicrotask: fn => fn(), esc: s => String(s ?? ''), ic: () => '', chatState:()=>st, chatSuggestions:()=>[], chatMode:()=>({}), $: s=>els[s], chatClear:()=>{st.msgs=[];st.draft='';}, Date};
  vm.runInNewContext(src + '\nthis.card=chatCardHtml;this.refresh=chatRefresh;this.view=chatView;this.timer=chatDayTimer;', ctx);
  return {ctx,st,log,input,listeners};
}

test('실행 중 확인 카드에는 재실행 버튼 대신 진행 상태를 표시한다', async () => {
  const {ctx} = await setup();
  const html = ctx.card({type:'confirm', state:'running', title:'처리', result:'진행 중…', id:'x'});
  assert.match(html, /진행 중/); assert.doesNotMatch(html, /data-act="chatConfirm"|data-act="chatCancel"/);
  assert.equal(ctx.timer, 123);
});

test('답변 갱신과 화면 복귀 시 읽던 스크롤을 유지하고 새 대화는 입력을 비운다', async () => {
  const {ctx,st,log,input,listeners} = await setup();
  st.msgs = [{role:'user', text:'질문', at:Date.now()}];
  ctx.refresh(); assert.equal(log.scrollTop, 100);
  log.scrollTop=72; listeners.scroll({target:log});
  log.scrollTop=0; ctx.view(); assert.equal(log.scrollTop,72);
  ctx.HOME_ACTS.chatClear(); assert.equal(input.value,''); assert.equal(st.logTop,0);
});
