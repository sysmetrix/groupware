import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const ui = await readFile(new URL('../src/live/wc/30-chat-ui.js', import.meta.url), 'utf8');
const engine = await readFile(new URL('../src/live/wc/31-chat-engine.js', import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-10T15:01:00Z');
function setup(history = []) {
  class Clock extends Date { static now() { return NOW; } }
  const data = {chatHistV: 3, chatHist: history};
  const context = {Date: Clock, S: {settings: {}}, HOME_ACTS: {}, root: {addEventListener() {}},
    store: {get: (k, d) => k in data ? data[k] : d, set: (k, v) => { data[k] = v; }, del: k => { delete data[k]; }},
    esc: x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])),
    logError() {}, setInterval() {}, console};
  vm.createContext(context);
  vm.runInContext(ui + '\n' + engine + '\nthis.api = {chatState, chatSave, chatMsgHtml, chatHistoryCurrent};', context);
  return {api: context.api, data};
}

test('저장된 어제 답변은 KST 시각과 이전 기록 경고가 나타나고 기록을 보존한다', () => {
  const at = Date.parse('2026-11-10T14:59:00Z');
  const {api, data} = setup([{id:'old', role:'ai', text:'오늘 일정이 없습니다', at, cards:[]}]);
  const m = api.chatState().msgs[0];
  const html = api.chatMsgHtml(m);
  assert.match(html, /2026-11-10 23:59 KST/);
  assert.match(html, /이전 기록: 당시 기준 응답/);
  assert.match(html, /오늘 일정이 없습니다/);
  api.chatSave(); assert.equal(data.chatHist[0].at, at);
});

test('같은 날과 날짜 미상, 잘못된 미래 시각을 구분한다', () => {
  const {api} = setup();
  const current = {role:'ai', text:'현재', at:Date.parse('2026-11-10T15:00:00Z')};
  assert.match(api.chatMsgHtml(current), /2026-11-11 00:00 KST/);
  assert.doesNotMatch(api.chatMsgHtml(current), /이전 기록/);
  for (const at of [0, undefined, 'bad', Infinity, NOW + 86400000]) {
    const html = api.chatMsgHtml({role:'ai', text:'과거', at});
    assert.match(html, /시각 확인 불가/); assert.match(html, /이전 기록/);
    assert.equal(api.chatHistoryCurrent(at), false);
  }
  assert.match(api.chatMsgHtml({role:'user', text:'<오늘>', at:0}), /&lt;오늘&gt;/);
  assert.equal(api.chatHistoryCurrent(current.at), true);
  assert.equal(api.chatHistoryCurrent(Date.parse('2026-11-10T14:59:00Z')), false);
});

test('AI 맥락에 날짜 미상 및 지난 날짜 기록을 전달하지 않는다', () => {
  assert.match(engine, /m\.state === 'done' && chatHistoryCurrent\(m\.at\)/);
});
