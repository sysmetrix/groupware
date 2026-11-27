// 31-chat-engine.js 이어 말 슬롯(v1.28): 자원 예약 되묻기 뒤 이어 말을 어떻게 잇는지 고정한다.
// - 이어 말에 다른 종류·자원이 있으면 앞 슬롯의 kind·resource를 버린다
// - 없으면 앞 문장과 이어 말을 함께 도구에 넘긴다
// - 날짜·시간을 묻지 않은 실패(그 자원이 없음)면 슬롯을 지운다
// chatIntent는 채팅창에서 본 규칙 결과를 표로 둔 가짜이고, 예약 도구 run도 가짜다(그룹웨어를 부르지 않는다).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as real from '../src/live/chat.mjs';
const ui = await readFile(new URL('../src/live/wc/30-chat-ui.js', import.meta.url), 'utf8');
const engine = await readFile(new URL('../src/live/wc/31-chat-engine.js', import.meta.url), 'utf8');

const ASK = '날짜와 시간을 알려 주세요. 예) 내일 14시부터 16시까지 차량 예약해줘';
const INTENT = {
  '승용차 예약해 줘': {tool: 'reserve_vehicle', args: {date: '', start: '', end: '', title: '', kind: 'car', resource: '승용차'}, confidence: 1},
  '회의실 예약해 줘': {tool: 'reserve_vehicle', args: {date: '', start: '', end: '', title: '', kind: 'room'}, confidence: 1},
  '강당 예약해 줘': {tool: 'reserve_vehicle', args: {date: '', start: '', end: '', title: '', kind: 'room', resource: '강당'}, confidence: 1},
};

function setup() {
  const db = {chatHistV: 3}, calls = [];
  const R = {...real, chatIntent: t => INTENT[t] || {tool: '', args: {}, confidence: 0}};
  const ctx = {R, S: {settings: {}, userKey: 'test'}, HOME_ACTS: {}, root: {addEventListener() {}}, setInterval() {},
    setTimeout: (f, n) => { const t = setTimeout(f, n); t.unref(); return t; }, clearTimeout, console,
    store: {get: (k, d) => k in db ? db[k] : d, set: (k, v) => db[k] = v, del: k => delete db[k]}, allowed: () => false, logError() {}, $: () => null, esc: x => String(x ?? '')};
  vm.createContext(ctx);
  vm.runInContext(ui + '\n' + engine + '\nthis.api={chatSend,chatState,chatRegisterTool}', ctx);
  ctx.api.chatRegisterTool({name: 'reserve_vehicle', kind: 'act', run: async (a, c) => {
    calls.push({args: {...a}, userText: c.userText});
    if (!a.date || !a.start || !a.end) return {ok: false, text: ASK};
    if (a.resource === '강당') return {ok: false, text: '그룹웨어 자원에 강당이 없어 다른 자원으로 대신 예약하지 않습니다. 있는 자원: 3층 회의실, LED 패널'};
    return {ok: true, text: '예약할 수 있습니다.'};
  }});
  return {send: t => ctx.api.chatSend(t), st: () => ctx.api.chatState(), calls};
}

test('승용차 되묻기 뒤 시간만 말하면 승용차를 그대로 쓰고 앞 문장도 함께 넘긴다', async () => {
  const {send, calls} = setup();
  await send('승용차 예약해 줘');
  await send('내일 10시부터 12시');
  assert.equal(calls.length, 2);
  const last = calls[1];
  assert.equal(last.args.kind, 'car');
  assert.equal(last.args.resource, '승용차');
  assert.equal(last.args.start, '10:00');
  assert.equal(last.args.end, '12:00');
  assert.match(last.userText, /승용차/, '앞 문장(승용차)이 도구에 넘어가야 한다');
  assert.match(last.userText, /내일 10시부터 12시/);
});

test('회의실 되묻기 뒤 LED 패널을 말하면 앞의 회의실을 버리고 LED 패널로 바꾼다', async () => {
  const {send, calls} = setup();
  await send('회의실 예약해 줘');
  await send('LED 패널 모레 9시부터 한 시간');
  assert.equal(calls.length, 2);
  const last = calls[1];
  assert.equal(last.args.kind, 'led');
  assert.equal(last.args.resource, undefined);
  assert.equal(last.args.start, '09:00');
  assert.equal(last.args.end, '10:00');
  assert.doesNotMatch(last.userText, /회의실/, '바뀐 자원이면 앞 문장을 붙이지 않는다');
});

test('강당이 없다는 답 뒤에는 슬롯이 지워져 다음 말에 강당이 남지 않는다', async () => {
  const {send, st, calls} = setup();
  await send('강당 예약해 줘');
  assert.equal(st().ctx.pendingSlot.tool, 'reserve_vehicle');
  await send('내일 10시부터 한 시간');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].args.resource, '강당');
  assert.equal(st().ctx.pendingSlot, null, '날짜·시간을 묻지 않은 실패면 슬롯을 지운다');
  await send('LED 패널 내일 9시부터 한 시간');
  assert.ok(calls.slice(2).every(c => c.args.resource !== '강당' && c.args.kind !== 'room' && !/강당/.test(c.userText)), '강당 슬롯이 다음 말에 남으면 안 된다');
});

test('날짜만 답해 다시 시간을 물은 뒤 시간만 말해도 앞 자원과 앞 문장을 이어 간다', async () => {
  const {send, st, calls} = setup();
  await send('승용차 예약해 줘');
  await send('내일');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].args.date, '날짜는 채워진다');
  assert.equal(calls[1].args.resource, '승용차');
  assert.equal(st().ctx.pendingSlot.args.date, calls[1].args.date, '다시 물을 때 슬롯은 날짜까지 기억한다');
  await send('10시부터 11시');
  assert.equal(calls.length, 3);
  const last = calls[2];
  assert.equal(last.args.kind, 'car');
  assert.equal(last.args.resource, '승용차');
  assert.equal(last.args.date, calls[1].args.date);
  assert.equal(last.args.start, '10:00');
  assert.equal(last.args.end, '11:00');
  assert.match(last.userText, /승용차/, '두 번 되물어도 처음 문장이 남아야 한다');
});
