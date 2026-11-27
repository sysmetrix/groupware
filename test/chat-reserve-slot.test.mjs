// 31-chat-engine.js 이어 말 슬롯(v1.28): 자원 예약 되묻기 뒤 이어 말을 어떻게 잇는지 고정한다.
// - 이어 말에 자원 이름이 있으면 그 자원으로, 종류 말만 있으면 앞에서 정한 자원은 두고 종류만 따른다(그 종류에 없으면 도구가 묻는다)
// - 앞에 이름 없이 종류만 있었고 이어 말의 종류가 다르면 이어 말의 종류로, 빼기·부정 말이 있으면 바꾸지 않는다(도구가 묻는다)
// - 앞 문장과 이어 말을 함께 도구에 넘기고, 날짜·시간을 묻지 않은 실패(그 자원이 없음)나 "하지 마"면 슬롯을 지운다
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

test('하지 마: 날짜를 되물은 뒤 "모레 9시는 하지 마"면 슬롯을 지우고 도구를 부르지 않는다', async () => {
  const {send, st, calls} = setup();
  await send('회의실 예약해 줘');
  assert.equal(st().ctx.pendingSlot.tool, 'reserve_vehicle');
  await send('모레 9시는 하지 마');
  assert.equal(calls.length, 1, '하지 말라는 이어 말로 도구를 부르지 않는다');
  assert.equal(st().ctx.pendingSlot, null);
  await send('모레 9시부터 10시까지');
  assert.equal(calls.length, 1, '지운 슬롯이 다음 말에 이어지지 않는다');
});

// ---- 31 이어 말 + 실제 예약 도구(33): chatIntent도 실제 규칙. 그룹웨어 호출만 가짜다. ----
// v1.28 보수 규칙(원칙 1~3)과 축소(대화에서는 차량만): 모르면 묻고, 앞에서 정한 차를 종류 말만으로 조용히 바꾸지 않으며, 회의실 등은 현황과 화면 안내. 확인 카드는 누르지 않는다.
import * as B from '../src/live/briefing.mjs';
import * as CU from '../src/live/chat-understand.mjs';
const act = await readFile(new URL('../src/live/wc/33-chat-tools-act.js', import.meta.url), 'utf8');
const read32 = await readFile(new URL('../src/live/wc/32-chat-tools-read.js', import.meta.url), 'utf8');
const LIST = [
  {resSeq: '11', name: '2층 회의실', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '12', name: '다목적홀', attr: '회의실', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '13', name: '상담실 1', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '21', name: '업무용 승합차 (12가 3456)', attr: '차량', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '22', name: '업무용 승용차 (34나 5678)', attr: '차량', apprYn: 'Y', useYn: 'Y'},
];
function setupReal() {
  const db = {chatHistV: 3}, gw = [];
  const GW = {
    resourceList: async () => { gw.push('list'); return LIST.map(r => ({...r})); },
    resourceDetail: async seq => { gw.push('detail'); const r = LIST.find(x => x.resSeq === seq); return {resSeq: seq, apprYn: r.apprYn, limitMin: 0}; },
    resourceCheck: async () => { gw.push('check'); return {conflict: false, limit: false}; },
    resourceBookings: async () => { gw.push('bookings'); return []; },
    reserveResource: async () => { gw.push('reserve'); throw new Error('확인 카드를 누르지 않았는데 예약 요청이 나갔습니다'); },
  };
  const ctx = {R: {...B, ...real, cuJosa: CU.cuJosa}, S: {settings: {}, userKey: 'test'}, GW, HOME_ACTS: {}, root: {addEventListener() {}}, setInterval() {},
    setTimeout: (f, n) => { const t = setTimeout(f, n); t.unref(); return t; }, clearTimeout, console,
    store: {get: (k, d) => k in db ? db[k] : d, set: (k, v) => db[k] = v, del: k => delete db[k]}, allowed: k => k === 'resource', logError() {}, logActionRecord() {}, $: () => null, esc: x => String(x ?? ''),
    resState: () => ({}), today: () => new Date().toISOString().slice(0, 10)};
  vm.createContext(ctx);
  vm.runInContext(ui + '\n' + engine + '\n' + read32 + '\n' + act + '\nthis.api={chatSend,chatState}', ctx);
  const last = () => ctx.api.chatState().msgs.filter(m => m.role === 'ai').at(-1);
  const cards = () => ctx.api.chatState().msgs.flatMap(m => m.cards || []).filter(c => c && c.type === 'confirm');
  const picked = () => { const c = cards().at(-1); return c ? c.rows.find(r => r[0] === '자원')[1] : ''; };
  return {send: t => ctx.api.chatSend(t), st: () => ctx.api.chatState(), gw, last, cards, picked};
}

const NOT_CAR = '회의실 등 차량이 아닌 자원은 여기서 예약을 준비하지 않습니다. 자원 예약 화면에서 예약해 주세요.';
const VAN = '업무용 승합차 (12가 3456)', SEDAN = '업무용 승용차 (34나 5678)';
const noWrite = s => s.gw.filter(x => !['list', 'bookings'].includes(x));

test('차량 정상 요청은 확인 카드까지(누르지 않음, 예약 요청 0건)', async () => {
  const s = setupReal();
  await s.send('모레 9시부터 10시까지 차량 예약해줘');
  assert.equal(s.picked(), VAN); assert.ok(!s.gw.includes('reserve'));
});

test('원칙 3: 앞에서 정한 차는 같은 종류 말("차로", "차량으로")로 바뀌지 않는다', async () => {
  let s = setupReal();
  await s.send('승용차 예약해줘'); assert.match(s.last().text, /날짜와 시간을 알려 주세요/);
  await s.send('모레 9시부터 10시까지 차로');
  assert.equal(s.picked(), SEDAN, '승합차로 바꾸지 않는다');
  s = setupReal();
  await s.send('업무용 승합차 예약해줘');
  await s.send('차량으로 모레 9시부터 10시까지');
  assert.equal(s.picked(), VAN);
  assert.ok(!s.gw.includes('reserve'));
});

test('축소: 앞에서 정한 차 뒤에 회의실 말이 오면 카드 없이 화면으로 안내하고 슬롯을 지운다', async () => {
  const s = setupReal();
  await s.send('승용차 예약해줘');
  await s.send('회의실로 모레 9시부터 10시까지');
  assert.equal(s.cards().length, 0); assert.equal(s.last().text, NOT_CAR);
  assert.deepEqual(s.gw.filter(x => x !== 'list'), []);
  assert.equal(s.st().ctx.pendingSlot, null);
});

test('원칙 1: 첫 말이나 이어 말에 빼기·부정 말이 있으면 카드 없이 묻는다', async () => {
  for (const [a, b] of [['차 예약해줘', '니로 말고 모레 9시부터 10시까지'], ['승용차 예약해줘', '다른 차로 모레 9시부터 10시까지'], ['니로 빼고 차 예약해줘', '모레 9시부터 10시까지'],
    ['승합차 뺀 차 예약해줘', '모레 9시부터 10시까지'], ['승용차 예약해줘', '모레 9시부터 10시까지, 승합차는 안 돼'], ['차 예약해줘', '승합차 외에 모레 9시부터 10시까지']]) {
    const s = setupReal();
    await s.send(a); await s.send(b);
    assert.equal(s.cards().length, 0, a + ' / ' + b);
    assert.ok(s.st().msgs.some(m => /^빼거나 다른 것으로 하라는 말이 있어 자원을 고르지 않았습니다/.test(m.text || '')), a + ' / ' + b);
    assert.deepEqual(s.gw.filter(x => x !== 'list'), [], a + ' / ' + b);
  }
});

test('축소: 회의실·LED 예약 말은 그 종류 현황과 화면 열기로 답한다(확인 카드·예약 요청 0건)', async () => {
  for (const [q, re] of [['회의실 1개 모레 9시부터 10시까지 예약해줘', /2층 회의실 /], ['2층 회의실 모레 9시부터 10시까지 예약해줘', /2층 회의실 /], ['다목적홀 모레 9시부터 10시까지 예약해줘', /회의실|다목적홀/], ['LED 패널 모레 예약해줘', /LED 패널이 등록되어 있지 않아/]]) {
    const s = setupReal();
    await s.send(q);
    const m = s.last();
    assert.equal(s.cards().length, 0, q); assert.equal(m.text.indexOf(NOT_CAR), 0, q); assert.match(m.text, re, q);
    assert.ok((m.cards || []).some(c => c && c.type === 'nav' && c.view === 'resource'), q);
    assert.deepEqual(noWrite(s), [], q);
  }
});

test('날짜 없는 "하지 마" 뒤에는 시간만 말해도 취소한 예약 카드가 나오지 않는다', async () => {
  for (const stop of ['하지 마', '아니 예약하지 마', '예약 안 해도 돼']) {
    const s = setupReal();
    await s.send('승용차 예약해줘');
    await s.send(stop);
    assert.equal(s.last().text, '알겠습니다. 준비하던 예약은 그만뒀습니다. 아무것도 예약하지 않았습니다.', stop);
    assert.equal(s.st().ctx.pendingSlot, null, stop);
    await s.send('모레 11시부터 12시까지');
    assert.equal(s.cards().length, 0, stop); assert.deepEqual(noWrite(s), [], stop);
  }
});
