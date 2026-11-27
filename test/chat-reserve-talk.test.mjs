// v1.28 대화에서 자원 예약 말 읽기(chat.mjs chatResourceAsk·chatIntent)와 예약 도구(33)가 함께 지키는 것:
// 축소(운영자 결정): 대화에서는 차량만 예약을 준비하고, 회의실·LED 등은 날짜가 있으면 그 종류 현황(화면 안내), 없으면 넘긴다.
// 차량: 빼거나 부정하는 말이 있거나 차 이름이 목록과 꼭 하나로 맞지 않으면 카드 없이 묻는다. 예약이 아닌 말(하지 마·해 뒀어·바꿔)은 예약 준비가 아니다.
// 말 읽기(chatResourceAsk)는 회의실 이름·수식어·번호를 그대로 읽는다(현황 조회와 이어 말이 쓴다).
// eval/chat-questions.json p24~p31과 다른 말투로 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as B from '../src/live/briefing.mjs';
import * as CH from '../src/live/chat.mjs';
import * as CU from '../src/live/chat-understand.mjs';

const NOW = new Date('2026-11-27T01:00:00Z');
const it = q => CH.chatIntent(q, NOW);
const ka = q => { const r = it(q); return [r.tool, r.args.kind || '', r.args.resource || '']; };

const ra = q => { const r = CH.chatResourceAsk(q); return [r.kind, r.resource]; };
const noCard = q => assert.ok(['get_resource_status', ''].includes(it(q).tool), q); // 회의실 등은 예약 준비로 가지 않는다
test('말고·빼고·아니고·대신: 앞의 자원은 빼고 뒤의 자원을 읽는다(차량만 예약 준비)', () => {
  assert.deepEqual(ra('2층 회의실 빼고 3층 회의실로 다음 주 월요일 10시 잡아 줄래'), ['room', '3층 회의실']);
  assert.deepEqual(ka('2층 회의실 빼고 3층 회의실로 다음 주 월요일 10시 잡아 줄래'), ['get_resource_status', 'room', '']);
  assert.deepEqual(ka('카니발 대신 스타리아 모레 오전 9시부터 빌려 주세요'), ['reserve_vehicle', 'car', '스타리아']);
  assert.deepEqual(ka('니로 아니고 다른 차로 내일 4시 예약 부탁해'), ['reserve_vehicle', 'car', '']);
  assert.deepEqual(ka('차는 말고 회의실로 목요일 1시부터 잡아줘'), ['get_resource_status', 'room', '']);
  assert.deepEqual(ka('회의실 말고 승합차로 다음 주 화요일 예약할게요'), ['reserve_vehicle', 'car', '승합차']);
  assert.deepEqual(CH.chatResourceAsk('회의실 3 말고 회의실 1 잡아줘').drop, ['회의실 3']);
  assert.deepEqual(CH.chatResourceAsk('소회의실 말고 대회의실 예약').drop, ['소회의실']);
  assert.equal(CH.chatResourceAsk('내일 니로 말고 승합차').keep.includes('니로'), false);
  assert.equal(CH.chatResourceAsk('내일 니로 말고 승합차').keep.includes('내일'), true, '빼는 말 앞의 날짜는 남긴다');
});

test('수식어·번호가 붙은 회의실 이름을 그대로 넘긴다(종류 말만이면 넘기지 않음)', () => {
  for (const [q, r] of [['회의실 3 목요일 2시부터 예약 부탁해', '회의실 3'], ['3번 회의실 다음 주 수요일 잡아 주세요', '3번 회의실'], ['화상회의실 내일 오후 4시 잡아줘', '화상회의실'], ['B회의실 모레 예약', 'B회의실'],
    ['별관 회의실 금요일 10시 예약해 주세요', '별관 회의실'], ['제2회의실 모레 예약', '제2회의실'], ['중회의실 예약 좀', '중회의실'], ['4층 대회의실 잡아줘', '4층 대회의실'], ['회의실 B 내일 예약', '회의실 B'], ['본관의 회의실 예약해줘', '본관 회의실']])
  { assert.deepEqual(ra(q), ['room', r], q); noCard(q); }
  for (const q of ['다음 주 월요일 회의실 예약해줘', '회의실 하나만 잡아줘', '두 시간 회의실 예약해줘', '금요일 회의실 잡아 줄래', '회의실 10시부터 예약해줘'])
  { assert.deepEqual(ra(q), ['room', ''], q); noCard(q); }
  // 서로 다른 회의실 둘은 하나로 정하지 않는다
  assert.deepEqual(ra('2층 회의실이나 3층 회의실 모레 예약'), ['room', '']);
});

test('승합차·승용차·차종, 다목적홀·상담실 같은 이름으로도 예약 준비에 닿는다(일정 말과 구분)', () => {
  for (const [q, r] of [['승합차 다음 주 화요일 빌릴게요', '승합차'], ['승용차 목요일 오전에 예약 부탁', '승용차'], ['업무용 승합차 모레 잡아 주세요', '승합차'], ['그랜저 금요일 빌려 줘', '그랜저']])
    assert.deepEqual(ka(q), ['reserve_vehicle', 'car', r], q);
  for (const [q, k, r] of [['다목적홀 다음 주 목요일 예약해 주세요', '', '다목적홀'], ['상담실 2 모레 잡아줘', '', '상담실 2'], ['강의실 내일 예약', 'room', '강의실'], ['다목적홀 회의실 모레 예약', 'room', '다목적홀']])
  { assert.deepEqual(ra(q), [k, r], q); assert.deepEqual(ka(q), ['get_resource_status', 'room', ''], q); assert.equal(it(q).args.reserve_ask, true, q); }
  assert.notEqual(it('다목적홀에서 팀 회의 일정 잡아줘').tool, 'reserve_vehicle');
  assert.notEqual(it('상담실에서 미팅 잡아줘').tool, 'reserve_vehicle');
});

test('예약이 아닌 말: 하지 마·해 뒀어·바꿔·취소, 1차·2차, 패널 토의', () => {
  for (const q of ['회의실은 예약하지 말아 줘', '차량 예약 안 해도 돼', '회의실 예약해 두었어', '차량 예약해 놓았어', '회의실 어제 예약했어', '회의실 예약 시간 바꿔줘', '차량 예약 취소해줘', '회의실 예약 다음 주로 옮겨줘'])
    assert.notEqual(it(q).tool, 'reserve_vehicle', q);
  for (const q of ['회의실은 예약하지 말아 줘', '차량 예약 안 해도 돼']) assert.equal(it(q).tool, '', q);
  for (const q of ['2차 면접 장소 예약해줘', '3차 회의 예약해줘']) { const r = it(q); assert.ok(!(r.tool === 'reserve_vehicle' && r.args.kind === 'car') && r.tool !== 'get_resource_status', q); }
  for (const q of ['패널 토의 장소 잡아줘', '패널 발표 자리 예약']) { const r = it(q); assert.ok(r.tool !== 'reserve_vehicle' && r.tool !== 'get_resource_status', q); }
  assert.deepEqual(ka('LED 패널 모레 예약해줘'), ['get_resource_status', 'led', '']);
});

test('목적 말(상담 때문에·교육하려고)은 자원 이름 단서가 아니다', () => {
  assert.equal(CH.chatResourceAsk('학부모 상담 때문에 회의실 잡아줘').keep, '학부모 회의실 잡아줘');
  assert.equal(CH.chatResourceAsk('교육하려고 회의실 예약').keep, '회의실 예약');
  assert.deepEqual(ra('상담 때문에 회의실 잡아줘'), ['room', '']); noCard('상담 때문에 회의실 잡아줘');
});

// ---- 예약 도구(33)가 사용자 문장을 어떻게 쓰는가 ----
const source = await readFile(new URL('../src/live/wc/33-chat-tools-act.js', import.meta.url), 'utf8');
const LIST = [
  {resSeq: '11', name: '2층 회의실', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '12', name: '다목적홀', attr: '회의실', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '13', name: '상담실 1', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '14', name: '회의실 1', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '15', name: '회의실 2', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '21', name: '업무용 승합차 (12가 3456)', attr: '차량', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '22', name: '업무용 승용차 (34나 5678)', attr: '차량', apprYn: 'N', useYn: 'Y'},
];
function tool(list = LIST, busy = []) {
  const t = new Map(), calls = [];
  const GW = {
    resourceList: async () => list.map(r => ({...r})),
    resourceDetail: async seq => ({resSeq: seq, apprYn: 'N', limitMin: 0}),
    resourceCheck: async ({resSeq}) => { calls.push(resSeq); return {conflict: busy.includes(resSeq), limit: false}; },
    resourceBookings: async () => [],
    reserveResource: async () => { throw new Error('확인 카드를 누르지 않았는데 예약 요청이 나갔습니다'); },
  };
  vm.runInNewContext(source, {S: {}, GW, R: {...B, ...CH, cuJosa: CU.cuJosa}, chatRegisterTool: d => t.set(d.name, d), allowed: () => true, chatDateArg: v => v, chatMd: v => v, logError: () => {}, logActionRecord: () => {}});
  return {calls, run: (a, userText = '') => t.get('reserve_vehicle').run({date: '2099-03-10', start: '15:00', end: '16:00', ...a}, {userText})};
}
const picked = r => { const c = (r.cards || []).find(x => x.type === 'confirm'); return c ? c.rows.find(x => x[0] === '자원')[1] : ''; };

// v1.28 보수 규칙(원칙 1): 빼거나 부정하는 말이 차량 말과 함께 있으면 차를 추리지 않고 묻는다. 카드·확인·예약 요청 0건.
// R2C 마지막 검토에서 카드가 나왔던 말(뺀·안 돼·외·이외·아님·안 되니까·제끼고·못 타니까·고장이라·없이)을 포함한다.
const NEG_TALK = ['승합차만 빼고 차 예약해줘', '승합차 말고 다른 차로 예약', '니로만 빼고 차 예약', '니로 제외하고 차 잡아줘', '차 예약하는데 니로는 빼 줘', '니로 아닌 차로 예약',
  '니로 말고는 다 괜찮아 차 예약', '니로 말고요 차 예약해줘', '니로 말구 차 예약', '승합차 대신 승용차로 예약', '승합차는 싫고 차 예약해줘',
  '승합차 뺀 차 예약해줘', '승합차는 안 돼 차 예약해줘', '승합차 외 차 예약해줘', '승합차 이외의 차 예약', '승합차 아님 차 예약', '승합차 안 되니까 차 예약해줘',
  '승합차 제끼고 차 예약', '승합차 못 타니까 차 예약해줘', '승합차 고장이라 차 예약해줘', '승합차 없이 차 예약해줘', '승용차 뺄게 차 예약해줘'];
const askNeg = /^빼거나 다른 것으로 하라는 말이 있어 자원을 고르지 않았습니다\. 예약할 자원 이름을 하나만 넣어 다시 말씀해 주세요\./;
const NOT_CAR = '회의실 등 차량이 아닌 자원은 여기서 예약을 준비하지 않습니다. 자원 예약 화면에서 예약해 주세요.';
test('33 원칙 1: 차량 말에 빼기·부정 말이 있으면 카드 없이 묻는다(확인·예약 요청 0건)', async () => {
  for (const q of NEG_TALK) {
    const s = tool(), r = await s.run({kind: 'car'}, q);
    assert.equal(r.ok, false, q); assert.equal(picked(r), '', q); assert.ok(!(r.cards || []).some(c => c.type === 'confirm'), q);
    assert.match(r.text, askNeg, q); assert.deepEqual(s.calls, [], '자원 확인도 하지 않는다 ' + q);
    assert.ok(CH.chatResourceAsk(q).neg, q);
  }
  // 날짜·시간이 없어도 먼저 묻고(날짜를 되묻지 않음), 묻는 말에 날짜·시간 낱말이 없어 이어 말 슬롯이 남지 않는다
  const r = await tool().run({date: '', start: '', end: '', kind: 'car'}, '니로 말고 차 예약해줘');
  assert.match(r.text, askNeg); assert.doesNotMatch(r.text, /날짜|시간/);
  assert.match((await tool().run({kind: 'car'}, '니로 말고 차 예약해줘')).text, /있는 차량: 업무용 승합차 \(12가 3456\), 업무용 승용차 \(34나 5678\)$/);
  // 목록 이름을 그대로 말해도 빼기 말이 있으면 묻는다
  const niro = [{resSeq: '5', name: '관용차량(니로EV)', attr: '공용차량', apprYn: 'N', useYn: 'Y'}, ...LIST];
  for (const q of ['관용차량(니로EV)는 안 돼 차 예약', '관용차량(니로EV) 빼고 차 예약', '관용차량(니로EV) 말고 업무용 승용차 (34나 5678)'])
    assert.match((await tool(niro).run({kind: 'car'}, q)).text, askNeg, q);
  // 회의실 등의 빼기 말은 대화 규칙에서 예약 준비로 가지 않는다
  for (const q of ['2층 회의실 제외하고 회의실 잡아줘', '2층 회의실 빼고 아무 회의실이나 잡아줘', '3층만 빼고 회의실 잡아줘', '3층 아닌 회의실 예약', '다른 회의실로 잡아줘', '회의실 아니면 다목적홀 예약'])
    assert.notEqual(CH.chatIntent(q, NOW).tool, 'reserve_vehicle', q);
  // 자원 말이 없는 부정(다른 날)은 이 규칙이 아니다
  assert.equal(CH.chatResourceAsk('다른 날로 할게').neg, false);
});

test('33 원칙 2: 차 이름은 목록과 꼭 하나로 맞을 때만. 차 이름 뒤에 다른 말이 붙거나 일부만 맞으면 묻는다', async () => {
  for (const [a, text, want] of [[{kind: 'car', resource: '승용차'}, '', '업무용 승용차 (34나 5678)'], [{kind: 'car'}, '승용차로 모레 잡아줘', '업무용 승용차 (34나 5678)'], [{}, '업무용 승용차 (34나 5678) 예약해 주세요', '업무용 승용차 (34나 5678)'], [{kind: 'car'}, '모레 9시 승합차 예약', '업무용 승합차 (12가 3456)']]) {
    const s = tool(), r = await s.run(a, text);
    assert.equal(picked(r), want, JSON.stringify([a, text]));
  }
  for (const [a, text, re] of [[{kind: 'car', resource: '2번 승합차'}, '', /꼭 맞는 차량을 하나로 정하지 못해/], [{kind: 'car', resource: '카니발'}, '', /꼭 맞는 차량을 하나로 정하지 못해/], [{kind: 'car'}, '니로EV 모레 예약', /^말씀하신 차량을 하나로 정하지 못해/], [{kind: 'car'}, '승합차랑 승용차 중에 예약', /^말씀하신 차량을 하나로 정하지 못해/]]) {
    const s = tool(), r = await s.run(a, text), tag = JSON.stringify([a, text]);
    assert.equal(r.ok, false, tag); assert.equal(picked(r), '', tag); assert.deepEqual(s.calls, [], tag); assert.match(r.text, re, tag);
    assert.match(r.text, /예약할 차량 이름을 하나만 넣어 다시 말씀해 주세요\. 있는 차량: 업무용 승합차 \(12가 3456\), 업무용 승용차 \(34나 5678\)$/, tag);
  }
  // 회의실 등은 인자·문장 어느 쪽으로 와도 카드 없이 화면 안내(AI·이어 말 경로)
  for (const [a, text] of [[{kind: 'room', resource: '회의실 2'}, ''], [{kind: 'room'}, '회의실 2로 잡아줘'], [{}, '회의실 1 예약해 주세요'], [{kind: 'led'}, ''], [{}, '다목적홀 모레 예약']]) {
    const s = tool(), r = await s.run(a, text), tag = JSON.stringify([a, text]);
    assert.equal(r.text, NOT_CAR, tag); assert.equal(picked(r), '', tag); assert.deepEqual(s.calls, [], tag);
  }
});

test('수량·인원·시각·시간 길이 말은 회의실 이름 단서가 아니다(말 읽기), 대화에서는 예약 준비로 가지 않는다', () => {
  for (const q of ['회의실 1개 예약해줘', '회의실 4명 쓸 거 예약해줘', '4명 회의실 예약해줘', '10인 회의실 잡아줘', '2시반 회의실 예약해줘', '1시간짜리 회의실 예약해줘', '한번 회의실 잡아줘', '운동 회의실 예약해줘']) {
    assert.deepEqual(ra(q), ['room', ''], q); noCard(q);
  }
  // 앞에 띄어 쓴 자리 말(2층·B동·본관·3번)과 뒤 번호(회의실 2로)는 이름 단서로 읽는다
  for (const [q, r] of [['2층 회의실 4명 예약해줘', '2층 회의실'], ['B동 회의실 예약', 'B동 회의실'], ['3번 회의실 잡아줘', '3번 회의실'], ['회의실 2로 잡아줘', '회의실 2']]) assert.equal(CH.chatResourceAsk(q).resource, r, q);
});

test('33: 목적 말은 차를 좁히지 않는다(학교 방문 때문에 → 빈 차)', async () => {
  const r = await tool(LIST, ['21']).run({kind: 'car'}, '학교 방문 때문에 모레 차량 잡아줘');
  assert.equal(picked(r), '업무용 승용차 (34나 5678)', '승합차가 차 있으면 다음 차');
});

test('C 보완: 괄호 안 설명·마이크로버스 때문에 진짜 회의실·차량이 장비로 빠지지 않는다', () => {
  for (const [name, k] of [['대회의실(빔프로젝터 있음)', 'room'], ['마이크로버스', 'car'], ['스타리아(하이패스 장착)', 'car'], ['관용차량(니로, 내비)', 'car'], ['회의실 빔프로젝터 완비', 'room'],
    ['회의용 빔프로젝터', ''], ['화상회의 장비', ''], ['차량용 블랙박스', ''], ['하이패스 카드', ''], ['무선 마이크', '']])
    assert.equal(B.resKindOf({name, attr: k === '' ? '회의실' : ''}), k, name);
  assert.deepEqual(B.resPick([{resSeq: '1', name: '대회의실(빔프로젝터)', attr: ''}, {resSeq: '2', name: '마이크로버스', attr: ''}], 'room').of.map(r => r.resSeq), ['1']);
  assert.deepEqual(B.resPick([{resSeq: '1', name: '대회의실(빔프로젝터)', attr: ''}, {resSeq: '2', name: '마이크로버스', attr: ''}], 'car').of.map(r => r.resSeq), ['2']);
});

test('D 보완: 번호만 말한 단서는 층 번호에 맞지 않는다(회의실 2 ≠ 2층 회의실)', () => {
  assert.equal(B.resNameScore({name: '2층 회의실'}, '회의실 2'), 0);
  assert.equal(B.resNameScore({name: '2층 회의실'}, '2번 회의실'), 0);
  assert.equal(B.resNameScore({name: '회의실 2'}, '2번 회의실'), 1);
  assert.equal(B.resNameScore({name: '2층 회의실'}, '2층'), 2);
});
