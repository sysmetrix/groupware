// v1.28 비서 자원 예약 준비: 요청한 종류(차량·회의실·그 밖의 종류)만 고르고, 콕 집은 자원은 그 자원만 보며, 없거나 차 있으면 대신하지 않고,
// 확인 카드는 누르기 전까지 아무것도 올리지 않는다. 카드·결과·기록에는 자원 이름 전체를 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as B from '../src/live/briefing.mjs';
import * as CU from '../src/live/chat-understand.mjs';

const source = await readFile(new URL('../src/live/wc/33-chat-tools-act.js', import.meta.url), 'utf8');
const res24 = await readFile(new URL('../src/live/wc/24-resource.js', import.meta.url), 'utf8');
const DATE = '2099-03-10', D8 = '20990310';
// 지어낸 자원 목록(둘러보기 자료와 같은 모양)
const LIST = [
  {resSeq: '11', name: '2층 회의실', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '12', name: '다목적홀', attr: '회의실', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '21', name: '업무용 승합차 (12가 3456)', attr: '차량', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '22', name: '업무용 승용차 (34나 5678)', attr: '차량', apprYn: 'N', useYn: 'Y'},
  {resSeq: '23', name: '예전 승용차', attr: '차량', apprYn: 'N', useYn: 'N'},
];
const VAN = LIST[2].name, SEDAN = LIST[3].name;

function setup({list = LIST, busy = [], limit = [], detail = {}, reserve} = {}) {
  const tools = new Map(), calls = [], logs = [];
  const GW = {
    resourceList: async () => { calls.push(['list']); return list.map(r => ({...r})); },
    resourceDetail: async seq => { calls.push(['detail', seq]); const r = list.find(x => x.resSeq === seq); return {resSeq: seq, apprYn: r.apprYn, limitMin: 0, ...(detail[seq] || {})}; },
    resourceCheck: async ({resSeq, start, end}) => { calls.push(['check', resSeq, start, end]); return {conflict: busy.includes(resSeq), limit: limit.includes(resSeq)}; },
    resourceBookings: async ({resSeqs}) => { calls.push(['bookings', resSeqs[0]]); return busy.includes(resSeqs[0]) ? [{resSeq: resSeqs[0], start: D8 + '1400', end: D8 + '1700', title: '회의'}] : []; },
    reserveResource: async body => { calls.push(['reserve', body]); return reserve ? reserve(body) : {ok: true, needsApproval: false}; },
  };
  const c = {S: {}, GW, R: {...B, cuJosa: CU.cuJosa}, chatRegisterTool: t => tools.set(t.name, t), allowed: () => true,
    chatDateArg: v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : ''), chatMd: iso => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`,
    logActionRecord: x => logs.push(x), logError: () => {}};
  vm.runInNewContext(source, c);
  const run = (a, userText = '') => tools.get('reserve_vehicle').run({date: DATE, start: '15:00', end: '16:00', ...a}, {userText});
  return {tools, calls, logs, run, c};
}
const J = x => JSON.parse(JSON.stringify(x)); // vm 안에서 만든 값은 다른 realm이라 구조만 비교한다
const writes = calls => calls.filter(x => x[0] === 'reserve');
const row = (card, k) => (card.rows.find(r => r[0] === k) || [])[1];
const confirmOf = res => (res.cards || []).find(x => x.type === 'confirm');

test('도구 이름은 그대로, 종류(kind)와 자원 이름(resource) 인자를 받는다', () => {
  const {tools} = setup(), t = tools.get('reserve_vehicle');
  assert.ok(t.params.properties.kind && t.params.properties.resource);
  assert.deepEqual(J(t.params.required), ['date', 'start', 'end']);
});

test('종류 고르기: 회의실은 회의실만, 기본은 차량, 자원 이름만 오면 전체에서 찾아 그 종류', async () => {
  let s = setup(), res = await s.run({kind: 'room', title: '주간 회의'});
  assert.equal(res.ok, true);
  let card = confirmOf(res);
  assert.equal(card.title, '회의실 예약 확정'); assert.equal(row(card, '종류'), '회의실'); assert.equal(row(card, '자원'), '2층 회의실');
  assert.equal(res.data.resource, '2층 회의실');

  s = setup(); res = await s.run({});
  card = confirmOf(res);
  assert.equal(row(card, '종류'), '차량'); assert.equal(row(card, '자원'), VAN);

  // 로컬 규칙·AI가 kind 없이 이름만 넘겨도 그 자원의 종류로 읽는다(차량으로 바꾸지 않음)
  for (const [resource, want] of [['2층 회의실', '2층 회의실'], ['다목적홀', '다목적홀'], ['승용차', SEDAN]]) {
    s = setup(); res = await s.run({resource});
    card = confirmOf(res);
    assert.equal(row(card, '자원'), want, resource); assert.equal(row(card, '종류'), want === SEDAN ? '차량' : '회의실', resource);
  }
  s = setup(); res = await s.run({resource: '대강당'});
  assert.equal(res.ok, false); assert.match(res.text, /^“대강당”에 꼭 맞는 회의실을 찾지 못해 고르지 않았습니다\. 예약할 회의실 이름을 하나만 넣어 다시 말씀해 주세요\. 있는 회의실: 2층 회의실, 다목적홀$/);
  s = setup(); res = await s.run({resource: '체육관'});
  assert.equal(res.ok, false); assert.match(res.text, /“체육관”에 꼭 맞는 자원을 찾지 못해 고르지 않았습니다/);

  for (const kind of ['회의실', 'meeting room']) { s = setup(); res = await s.run({kind}); assert.equal(row(res.cards[0], '종류'), '회의실', kind); }
  for (const kind of ['차량', '관용차', 'car', 'vehicle']) { s = setup(); res = await s.run({kind}); assert.equal(row(res.cards[0], '종류'), '차량', kind); }
});

test('그 밖의 종류는 자원 이름·분류에 그 말이 든 자원만 고른다', async () => {
  const s = setup({list: [...LIST, {resSeq: '31', name: '상담실 1', attr: '상담실', apprYn: 'N', useYn: 'Y'}]});
  const res = await s.run({kind: '상담실'});
  assert.equal(res.ok, true); assert.equal(row(res.cards[0], '자원'), '상담실 1'); assert.equal(row(res.cards[0], '종류'), '상담실');
});

test('종류 없음: 다른 자원으로 대신하지 않고 없다고 답하며 자원 예약 화면 열기를 준다', async () => {
  for (const [a, label] of [[{kind: 'led'}, 'LED 패널'], [{kind: '프로젝터'}, '프로젝터']]) {
    const s = setup(), res = await s.run(a);
    assert.equal(res.ok, false, label);
    assert.match(res.text, new RegExp(`자원에 ${label}[이가] 없어`));
    assert.match(res.text, /대신 예약하지 않습니다/);
    assert.ok(!confirmOf(res));
    assert.deepEqual(J(res.cards), [{type: 'nav', label: '자원 예약 화면 열기', view: 'resource'}]);
    assert.deepEqual(s.calls, [['list']], '목록 말고는 아무것도 조회·저장하지 않는다');
  }
  // 차량이 없는 목록에서 차량을 청하면 회의실로 대신하지 않는다
  const s = setup({list: LIST.filter(r => r.attr !== '차량')}), res = await s.run({});
  assert.equal(res.ok, false); assert.match(res.text, /차량이 없어 다른 자원으로 대신 예약하지 않습니다/); assert.deepEqual(s.calls, [['list']]);
  // 쓰지 않는 자원(useYn N)은 후보가 아니다
  const s2 = setup({list: LIST.filter(r => r.resSeq === '23' || r.attr === '회의실')}), res2 = await s2.run({kind: 'car'});
  assert.equal(res2.ok, false);
});

test('A: 콕 집은 자원(이름 단서·좁은 종류 말)이 꼭 맞지 않으면 다른 자원으로 바꾸지 않고 그 종류의 목록을 보이며 묻는다', async () => {
  for (const a of [{kind: 'room', resource: '3층 회의실'}, {kind: '강당'}, {kind: 'room', resource: '강당'}, {kind: '소회의실'}, {kind: '카니발'}, {kind: 'car', resource: '카니발'}]) {
    const s = setup(), res = await s.run(a);
    assert.equal(res.ok, false, JSON.stringify(a)); assert.ok(!confirmOf(res), JSON.stringify(a));
    assert.match(res.text, /”에 꼭 맞는 (회의실|차량)을 찾지 못해 고르지 않았습니다\. 예약할 (회의실|차량) 이름을 하나만 넣어 다시 말씀해 주세요\. 있는 (회의실|차량): /, JSON.stringify(a));
    assert.deepEqual(s.calls, [['list']]);
  }
  const s = setup(), res = await s.run({kind: 'room', resource: '3층 회의실'});
  assert.match(res.text, /“3층 회의실”에 꼭 맞는 회의실을 찾지 못해 고르지 않았습니다\. 예약할 회의실 이름을 하나만 넣어 다시 말씀해 주세요\. 있는 회의실: 2층 회의실, 다목적홀$/);
  // v1.28 보수 규칙: 이름 일부만 겹치는 자원(강당 ↔ 대강당)은 고르지 않고 묻는다. 이름 전체(괄호 설명은 빼고)가 맞으면 그 자원.
  const big = [...LIST, {resSeq: '13', name: '대강당', attr: '회의실', apprYn: 'N', useYn: 'Y'}];
  let s2 = setup({list: big}), r2 = await s2.run({kind: '강당'});
  assert.ok(!confirmOf(r2)); assert.match(r2.text, /꼭 맞는 회의실을 찾지 못해 고르지 않았습니다.* 있는 회의실: 2층 회의실, 대강당, 다목적홀$/);
  s2 = setup({list: big}); r2 = await s2.run({kind: 'room', resource: '대강당'});
  assert.equal(row(confirmOf(r2), '자원'), '대강당'); assert.equal(row(confirmOf(r2), '종류'), '회의실');
});

test('A: 콕 집은 자원이 그 시간에 차 있으면 다른 자원으로 대신하지 않고 빈 시간·다른 후보만 알린다', async () => {
  for (const [a, text] of [[{kind: '승합차'}, ''], [{kind: 'car', resource: '승합차'}, ''], [{kind: 'car'}, '내일 3시 승합차 예약해줘'], [{}, '내일 15시 승합차로 잡아줘']]) {
    const s = setup({busy: ['21']}), res = await s.run(a, text), tag = JSON.stringify([a, text]);
    assert.equal(res.ok, true, tag); assert.ok(!confirmOf(res), tag);
    assert.equal(writes(s.calls).length, 0);
    assert.ok(!s.calls.some(x => x[0] === 'check' && x[1] === '22'), '다른 차는 확인하지도 않는다 ' + tag);
    assert.match(res.text, new RegExp(`^${VAN.replace(/[()]/g, '\\$&')}: 그 시간에는 이미 예약이 있습니다\\. 비어 있는 시간: 09:00~14:00, 17:00~18:00\\. 다른 자원으로 대신 예약하지 않았습니다\\. 다른 차량: ${SEDAN.replace(/[()]/g, '\\$&')}$`), tag);
  }
  // 비어 있으면 그 자원의 확인 카드(다른 후보 없이)
  const s = setup({busy: ['22']}), res = await s.run({kind: 'car'}, '승합차 예약');
  assert.equal(row(confirmOf(res), '자원'), VAN); assert.equal(row(confirmOf(res), '다른 후보'), undefined);
});

test('A: 사용자 문장의 자원 이름이 꼭 맞을 때만 좁히고, 이름 일부만 겹치면(니로 ↔ 관용차량(니로EV)) 고르지 않고 묻는다', async () => {
  const list = [{resSeq: '5', name: '관용차량(니로EV)', attr: '예시재단|공용차량', apprYn: 'Y', useYn: 'Y'}, ...LIST];
  for (const [a, text] of [[{kind: 'car'}, '내일 15~16시 니로 예약해줘'], [{kind: 'car', resource: '니로'}, ''], [{kind: 'car'}, '니로 말고 승합차 예약']]) {
    const s = setup({list}), res = await s.run(a, text), tag = JSON.stringify([a, text]);
    assert.equal(res.ok, false, tag); assert.ok(!confirmOf(res), tag); assert.deepEqual(s.calls, [['list']], tag);
    assert.match(res.text, /꼭 맞는 차량을 찾지 못해 고르지 않았습니다\. 예약할 차량 이름을 하나만 넣어 다시 말씀해 주세요\. 있는 차량: 관용차량\(니로EV\), /, tag);
  }
  let s, res;
  // 종류 말·시간·날짜는 단서로 쓰지 않는다. 모든 후보에 든 낱말도 좁히지 않는다.
  s = setup({list}); res = await s.run({kind: 'car'}, '11/20 내일 15시부터 16시까지 관용차량 예약해줘');
  assert.equal(row(confirmOf(res), '자원'), '관용차량(니로EV)'); assert.equal(row(confirmOf(res), '다른 후보'), `${VAN}, ${SEDAN}`);
  s = setup(); res = await s.run({kind: 'car'}, '업무용 차 예약해줘');
  assert.equal(row(confirmOf(res), '자원'), VAN); assert.equal(row(confirmOf(res), '다른 후보'), SEDAN);
  // 이름 일부(업무용)가 몇 대에만 있으면 그 차들 안에서만 고른다
  s = setup({list, busy: ['21']}); res = await s.run({kind: 'car'}, '업무용 차량 예약해줘');
  assert.equal(row(confirmOf(res), '자원'), SEDAN); assert.equal(row(confirmOf(res), '다른 후보'), `${VAN}(예약 있음)`);
});

test('D: 번호가 든 단서는 이름 전체가 맞을 때만(1층 → 묻기, 1층 회의실 → 1층 회의실, 상담실 1 ≠ 상담실 10)', async () => {
  const rooms = [{resSeq: '41', name: '11층 회의실', attr: '회의실', apprYn: 'N', useYn: 'Y'}, {resSeq: '42', name: '1층 회의실', attr: '회의실', apprYn: 'N', useYn: 'Y'}];
  let s = setup({list: rooms, busy: ['42']}), res = await s.run({kind: 'room', resource: '1층'});
  assert.ok(!confirmOf(res)); assert.match(res.text, /^“1층”에 꼭 맞는 회의실을 찾지 못해 고르지 않았습니다/); assert.deepEqual(s.calls, [['list']]);
  s = setup({list: rooms, busy: ['42']}); res = await s.run({kind: 'room', resource: '1층 회의실'});
  assert.ok(!confirmOf(res)); assert.match(res.text, /^1층 회의실: 그 시간에는 이미 예약이 있습니다/); assert.match(res.text, /다른 회의실: 11층 회의실$/);
  const talks = [{resSeq: '51', name: '상담실 10', attr: '상담실', apprYn: 'N', useYn: 'Y'}, {resSeq: '52', name: '상담실 1', attr: '상담실', apprYn: 'N', useYn: 'Y'}];
  s = setup({list: talks}); res = await s.run({kind: '상담실', resource: '상담실 1'});
  assert.equal(row(confirmOf(res), '자원'), '상담실 1');
});

test('B: 확인 카드·결과·기록에 자원 이름 전체를 쓴다(괄호로 자르지 않음)', async () => {
  const leds = [{resSeq: '7', name: '1층 LED패널(1)', attr: '', apprYn: 'N', useYn: 'Y'}, {resSeq: '8', name: '1층 LED패널(2)', attr: '', apprYn: 'N', useYn: 'Y'}];
  let s = setup({list: leds, busy: ['7']}), res = await s.run({kind: 'led'});
  let card = confirmOf(res);
  assert.equal(row(card, '자원'), '1층 LED패널(2)'); assert.equal(row(card, '다른 후보'), '1층 LED패널(1)(예약 있음)');
  s = setup({list: leds}); res = await s.run({kind: 'led', resource: '1층 LED패널(2)'});
  card = confirmOf(res);
  assert.equal(row(card, '자원'), '1층 LED패널(2)'); assert.equal(res.data.resSeq, '8'); assert.equal(row(card, '다른 후보'), undefined);
  const out = await card.onConfirm();
  assert.match(out.text, /^1층 LED패널\(2\) 2099-03-10 15:00~16:00 예약을 올렸습니다/);
  assert.equal(s.logs[0].command, '채팅 자원 예약: 1층 LED패널(2)'); assert.match(s.logs[0].summary, /^1층 LED패널\(2\) /);
  assert.deepEqual(J(writes(s.calls))[0][1].resSeq, '8');
  // 차량 번호도 그대로 보인다
  s = setup(); res = await s.run({kind: 'car'});
  assert.equal(row(confirmOf(res), '자원'), VAN); assert.equal(row(confirmOf(res), '다른 후보'), SEDAN);
});

test('C: 예약 대상이 아닌 장비는 회의실·차량으로 고르지 않고, 이름으로 판정한 자원이 앞선다', async () => {
  const list = [
    {resSeq: '61', name: '회의용 빔프로젝터', attr: '기자재', apprYn: 'N', useYn: 'Y'},
    {resSeq: '62', name: '화상회의 장비', attr: '회의실', apprYn: 'N', useYn: 'Y'},
    {resSeq: '63', name: '하이패스 카드', attr: '공용차량', apprYn: 'N', useYn: 'Y'},
    {resSeq: '64', name: '차량용 블랙박스', attr: '차량', apprYn: 'N', useYn: 'Y'},
    {resSeq: '12', name: '다목적홀', attr: '회의실', apprYn: 'N', useYn: 'Y'},
    {resSeq: '11', name: '2층 회의실', attr: '회의실', apprYn: 'N', useYn: 'Y'},
    {resSeq: '5', name: '관용차량(니로EV)', attr: '예시재단|공용차량', apprYn: 'N', useYn: 'Y'},
  ];
  let s = setup({list}), res = await s.run({kind: 'room'});
  assert.equal(row(confirmOf(res), '자원'), '2층 회의실'); assert.equal(row(confirmOf(res), '다른 후보'), '다목적홀');
  s = setup({list}); res = await s.run({kind: 'car'});
  assert.equal(row(confirmOf(res), '자원'), '관용차량(니로EV)'); assert.equal(row(confirmOf(res), '다른 후보'), undefined);
  s = setup({list: list.slice(0, 4)}); res = await s.run({kind: 'room'});
  assert.equal(res.ok, false); assert.match(res.text, /회의실이 없어 다른 자원으로 대신 예약하지 않습니다/);
  s = setup({list: list.slice(0, 4)}); res = await s.run({kind: 'car'});
  assert.equal(res.ok, false); assert.match(res.text, /차량이 없어 다른 자원으로 대신 예약하지 않습니다/);
});

test('같은 종류가 여럿이면 빈 자원을 먼저 고르고 다른 후보를 카드에 보인다', async () => {
  const s = setup({busy: ['21']}), res = await s.run({kind: 'car'});
  const card = confirmOf(res);
  assert.equal(row(card, '자원'), SEDAN);
  assert.equal(row(card, '다른 후보'), `${VAN}(예약 있음)`);
  // 첫 자원이 비어 있으면 그것을 고르고, 확인하지 않은 후보는 표시 없이 보인다
  const s2 = setup(), res2 = await s2.run({kind: 'car'}), card2 = confirmOf(res2);
  assert.equal(row(card2, '자원'), VAN); assert.equal(row(card2, '다른 후보'), SEDAN);
  assert.ok(!s2.calls.some(x => x[0] === 'check' && x[1] === '22'), '빈 자원을 찾으면 더 확인하지 않는다');
});

test('같은 종류가 모두 차 있으면 확인 카드 없이 빈 시간을 알려 준다', async () => {
  const s = setup({busy: ['21', '22']}), res = await s.run({kind: 'car'});
  assert.equal(res.ok, true);
  assert.ok(!confirmOf(res));
  assert.equal(res.text.indexOf(`차량 2곳 모두 안 됩니다(${VAN}: 그 시간에는 이미 예약이 있습니다. ${SEDAN}: 그 시간에는 이미 예약이 있습니다.). ${VAN}의 `), 0);
  assert.match(res.text, /비어 있는 시간: 09:00~14:00, 17:00~18:00$/);
  assert.equal(writes(s.calls).length, 0);
  // 한 곳뿐이면 예전처럼 짧게
  const s1 = setup({busy: ['11'], list: LIST.filter(r => r.resSeq !== '12')}), r1 = await s1.run({kind: 'room'});
  assert.match(r1.text, /^그 시간에는 이미 예약이 있습니다\. 비어 있는 시간:/);
});

test('G: 예약 한도(c.limit)와 자원 상세의 최대 시간(limitMin)을 넘으면 그 자원을 고르지 않는다', async () => {
  let s = setup({limit: ['21']}), res = await s.run({kind: 'car'});
  assert.equal(row(confirmOf(res), '자원'), SEDAN); assert.equal(row(confirmOf(res), '다른 후보'), `${VAN}(예약 있음)`);
  s = setup({limit: ['21', '22']}); res = await s.run({kind: 'car'});
  assert.ok(!confirmOf(res)); assert.match(res.text, new RegExp(`${VAN.replace(/[()]/g, '\\$&')}: 예약 한도를 넘습니다\\.`));
  s = setup({detail: {21: {limitMin: 30}, 22: {limitMin: 30}}}); res = await s.run({kind: 'car'});
  assert.ok(!confirmOf(res)); assert.match(res.text, /최대 0\.5시간까지만 예약할 수 있습니다/);
  assert.ok(!s.calls.some(x => x[0] === 'check'), '최대 시간을 넘으면 겹침 확인도 하지 않는다');
  s = setup({detail: {21: {limitMin: 30}}}); res = await s.run({kind: 'car'});
  assert.equal(row(confirmOf(res), '자원'), SEDAN);
});

test('확인 카드는 실행하지 않는다: 누르기 전에는 예약 요청이 없고, 누르면 한 번 올린다', async () => {
  const s = setup(), res = await s.run({kind: 'room', title: '주간 회의'});
  assert.equal(writes(s.calls).length, 0, 'onConfirm 전에는 예약 요청이 없다');
  assert.ok(s.calls.every(x => ['list', 'detail', 'check'].includes(x[0])));
  assert.equal(s.logs.length, 0);
  const card = confirmOf(res);
  assert.equal(card.risk, 'high'); assert.equal(card.confirmLabel, '예약 확정');
  assert.match(res.text, /^2층 회의실, 3\/10 15:00~16:00에 예약할 수 있습니다\. 확정하면 실제로 예약이 올라갑니다\.$/);
  const out = await card.onConfirm();
  assert.equal(out.ok, true); assert.match(out.text, /2층 회의실 2099-03-10 15:00~16:00 예약을 올렸습니다/);
  assert.deepEqual(J(writes(s.calls)), [['reserve', {resSeq: '11', title: '주간 회의', start: D8 + '1500', end: D8 + '1600', desc: ''}]]);
  assert.equal(s.logs.length, 1);
});

test('승인 여부를 정확히 보인다(자원 상세의 값이 우선, 모르면 모른다고)', async () => {
  let s = setup(), res = await s.run({kind: 'room'});
  assert.equal(row(res.cards[0], '승인'), '승인 없이 확정');
  s = setup({busy: ['22']}); res = await s.run({kind: 'car'});
  assert.equal(row(res.cards[0], '승인'), '관리자 승인 필요'); assert.match(res.cards[0].warn, /실제로 예약 신청이 올라가고/); assert.match(res.text, /실제로 예약 신청이 올라갑니다/);
  assert.equal(res.data.approval, 'Y');
  s = setup({detail: {11: {apprYn: 'Y'}}}); res = await s.run({kind: 'room'});
  assert.match(row(res.cards[0], '승인'), /^관리자 승인 필요/, '저장할 때 쓰는 상세 값을 따른다');
  s = setup({list: [{resSeq: '11', name: '2층 회의실', useYn: 'Y'}], detail: {11: {apprYn: ''}}}); res = await s.run({kind: 'room'});
  assert.equal(row(res.cards[0], '승인'), '확인하지 못함'); assert.equal(res.data.approval, '?');
  // 저장 결과가 승인 대기이면 그대로 알린다
  s = setup({reserve: () => ({ok: true, needsApproval: true})}); res = await s.run({kind: 'room'});
  assert.match((await res.cards[0].onConfirm()).text, /예약을 신청했습니다\(관리자 승인 대기\)/);
});

test('G·H: 확정 결과를 확인하지 못하면 했다고도, 못 했다고도 단정하지 않는다', async () => {
  for (const reserve of [() => ({ok: false}), () => null, () => ({ok: true, verifiedAfterTimeout: true})]) {
    const s = setup({reserve}), res = await s.run({kind: 'room'}), out = await res.cards[0].onConfirm();
    assert.equal(out.ok, false); assert.match(out.text, /저장 여부를 확인하지 못했습니다/); assert.equal(s.logs.length, 0);
  }
  // 저장 요청 뒤의 시간 초과·모르는 오류·통신 오류는 실패로 단정하지 않는다
  for (const code of ['UNKNOWN', 'TIMEOUT', 'API_ERROR', undefined]) {
    const s = setup({reserve: () => { throw Object.assign(new Error('연결이 끊겼습니다'), {code}); }});
    const out = await (await s.run({kind: 'room'})).cards[0].onConfirm();
    assert.equal(out.ok, false, String(code)); assert.match(out.text, /^저장 여부를 확인하지 못했습니다\. 다시 예약하기 전에 그룹웨어 나의예약현황에서 확인하세요\. 연결이 끊겼습니다$/, String(code));
    assert.doesNotMatch(out.text, /예약하지 못했습니다/, String(code)); assert.equal(s.logs.length, 0);
  }
  // 저장 전에 거절된 오류는 못 했다고 알린다
  for (const code of ['CONFLICT', 'LIMIT', 'BAD_INPUT', 'NO_GESTURE', 'SAVE_FAILED']) {
    const s = setup({reserve: () => { throw Object.assign(new Error('같은 시간에 이미 예약이 있습니다'), {code}); }});
    const out = await (await s.run({kind: 'room'})).cards[0].onConfirm();
    assert.equal(out.ok, false); assert.match(out.text, /^예약하지 못했습니다: 같은 시간에/, code);
  }
  const s2 = setup({reserve: () => ({ok: true, verifiedAfterTimeout: true, identityVerified: true})});
  assert.match((await (await s2.run({kind: 'room'})).cards[0].onConfirm()).text, /응답이 늦었지만 저장된 것을 확인했습니다/);
});

test('관리자 설정으로 꺼져 있으면 준비도 확정도 하지 않는다', async () => {
  const s = setup(), res = await s.run({kind: 'room'});
  s.c.allowed = () => false;
  const out = await res.cards[0].onConfirm();
  assert.equal(out.ok, false); assert.equal(writes(s.calls).length, 0);
  assert.equal((await s.run({kind: 'room'})).ok, false);
});

// 자원 예약 화면(24-resource.js resBook)을 실제로 돌려 같은 자원·시간에 보내는 값과 결과 판정을 비교한다.
async function book24(r, title, out) {
  const sent = [], S = {view: 'other', userKey: 'u1'};
  const GW = {
    resourceList: async () => [r], resourceBookings: async () => [],
    reserveResource: async body => { sent.push(body); if (out instanceof Error) throw out; return typeof out === 'function' ? out() : out; },
  };
  const c = {S, R: B, GW, $: () => null, gated: () => false, renderMain: () => {}, toast: () => {}, logError: () => {}, logActionRecord: () => {}, esc: s => String(s)};
  vm.runInNewContext(res24, c);
  const s = c.resState();
  Object.assign(s, {list: [r], sel: r.resSeq, date: D8, bookings: [], request: {owner: 'u1', date: D8, sel: r.resSeq}});
  Object.assign(s.form, {title, start: '15:00', end: '16:00', desc: '', auto: false});
  await c.resBook({isTrusted: true});
  return {sent: J(sent), ok: !!s.done, unsure: !s.done && !!s.check && /저장 여부 미확인/.test(s.check.errors[0])};
}

test('확정 요청 값과 결과 판정이 자원 예약 화면(24-resource.js resBook)과 같다', async () => {
  const room = LIST[0];
  const cases = [{ok: true}, {ok: true, needsApproval: true}, {ok: false}, null, {ok: true, verifiedAfterTimeout: true}, {ok: true, verifiedAfterTimeout: true, identityVerified: true},
    Object.assign(new Error('응답이 늦었습니다'), {code: 'TIMEOUT'}), Object.assign(new Error('모름'), {code: 'UNKNOWN'})];
  for (const out of cases) {
    const a = await book24(room, '주간 회의', out);
    const s = setup({reserve: () => { if (out instanceof Error) throw out; return out; }}), card = confirmOf(await s.run({kind: 'room', title: '주간 회의'}));
    const b = await card.onConfirm(), sent33 = J(writes(s.calls)).map(x => x[1]);
    const tag = JSON.stringify(out instanceof Error ? out.code : out);
    assert.deepEqual(sent33, a.sent, '보내는 값 ' + tag);
    assert.equal(b.ok, a.ok, '성공 판정 ' + tag);
    if (a.unsure) assert.match(b.text, /저장 여부를 확인하지 못했습니다/, '모름 판정 ' + tag);
  }
});
