// v1.28 대화에서 자원 예약 말 읽기(chat.mjs chatResourceAsk·chatIntent)와 예약 도구(33)가 함께 지키는 것:
// 빼라고 한 자원은 고르지 않는다, 수식어·번호가 붙은 이름은 버리지 않는다(맞는 것이 없으면 거절), 장비 말이 진짜 자원을 지우지 않는다,
// 예약이 아닌 말(하지 마·해 뒀어·바꿔·1차·패널 토의)은 예약 준비가 아니다, 목적 말(상담 때문에)은 자원을 좁히지 않는다.
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

test('말고·빼고·아니고·대신: 앞의 자원은 빼고 뒤의 자원을 읽는다', () => {
  assert.deepEqual(ka('2층 회의실 빼고 3층 회의실로 다음 주 월요일 10시 잡아 줄래'), ['reserve_vehicle', 'room', '3층 회의실']);
  assert.deepEqual(ka('카니발 대신 스타리아 모레 오전 9시부터 빌려 주세요'), ['reserve_vehicle', 'car', '스타리아']);
  assert.deepEqual(ka('니로 아니고 다른 차로 내일 4시 예약 부탁해'), ['reserve_vehicle', 'car', '']);
  assert.deepEqual(ka('차는 말고 회의실로 목요일 1시부터 잡아줘'), ['reserve_vehicle', 'room', '']);
  assert.deepEqual(ka('회의실 말고 승합차로 다음 주 화요일 예약할게요'), ['reserve_vehicle', 'car', '승합차']);
  assert.deepEqual(CH.chatResourceAsk('회의실 3 말고 회의실 1 잡아줘').drop, ['회의실 3']);
  assert.deepEqual(CH.chatResourceAsk('소회의실 말고 대회의실 예약').drop, ['소회의실']);
  assert.equal(CH.chatResourceAsk('내일 니로 말고 승합차').keep.includes('니로'), false);
  assert.equal(CH.chatResourceAsk('내일 니로 말고 승합차').keep.includes('내일'), true, '빼는 말 앞의 날짜는 남긴다');
});

test('수식어·번호가 붙은 회의실 이름을 그대로 넘긴다(종류 말만이면 넘기지 않음)', () => {
  for (const [q, r] of [['회의실 3 목요일 2시부터 예약 부탁해', '회의실 3'], ['3번 회의실 다음 주 수요일 잡아 주세요', '3번 회의실'], ['화상회의실 내일 오후 4시 잡아줘', '화상회의실'], ['B회의실 모레 예약', 'B회의실'],
    ['별관 회의실 금요일 10시 예약해 주세요', '별관 회의실'], ['제2회의실 모레 예약', '제2회의실'], ['중회의실 예약 좀', '중회의실'], ['4층 대회의실 잡아줘', '4층 대회의실'], ['회의실 B 내일 예약', '회의실 B'], ['본관의 회의실 예약해줘', '본관 회의실']])
    assert.deepEqual(ka(q), ['reserve_vehicle', 'room', r], q);
  for (const q of ['다음 주 월요일 회의실 예약해줘', '회의실 하나만 잡아줘', '두 시간 회의실 예약해줘', '금요일 회의실 잡아 줄래', '회의실 10시부터 예약해줘'])
    assert.deepEqual(ka(q), ['reserve_vehicle', 'room', ''], q);
  // 서로 다른 회의실 둘은 하나로 정하지 않는다(도구가 되묻는다)
  assert.deepEqual(ka('2층 회의실이나 3층 회의실 모레 예약'), ['reserve_vehicle', 'room', '']);
});

test('승합차·승용차·차종, 다목적홀·상담실 같은 이름으로도 예약 준비에 닿는다(일정 말과 구분)', () => {
  for (const [q, k, r] of [['승합차 다음 주 화요일 빌릴게요', 'car', '승합차'], ['승용차 목요일 오전에 예약 부탁', 'car', '승용차'], ['업무용 승합차 모레 잡아 주세요', 'car', '승합차'], ['그랜저 금요일 빌려 줘', 'car', '그랜저'],
    ['다목적홀 다음 주 목요일 예약해 주세요', '', '다목적홀'], ['상담실 2 모레 잡아줘', '', '상담실 2'], ['강의실 내일 예약', 'room', '강의실'], ['다목적홀 회의실 모레 예약', 'room', '다목적홀']])
    assert.deepEqual(ka(q), ['reserve_vehicle', k, r], q);
  assert.notEqual(it('다목적홀에서 팀 회의 일정 잡아줘').tool, 'reserve_vehicle');
  assert.notEqual(it('상담실에서 미팅 잡아줘').tool, 'reserve_vehicle');
});

test('예약이 아닌 말: 하지 마·해 뒀어·바꿔·취소, 1차·2차, 패널 토의', () => {
  for (const q of ['회의실은 예약하지 말아 줘', '차량 예약 안 해도 돼', '회의실 예약해 두었어', '차량 예약해 놓았어', '회의실 어제 예약했어', '회의실 예약 시간 바꿔줘', '차량 예약 취소해줘', '회의실 예약 다음 주로 옮겨줘'])
    assert.notEqual(it(q).tool, 'reserve_vehicle', q);
  for (const q of ['회의실은 예약하지 말아 줘', '차량 예약 안 해도 돼']) assert.equal(it(q).tool, '', q);
  for (const q of ['2차 면접 장소 예약해줘', '3차 회의 예약해줘']) { const r = it(q); assert.ok(!(r.tool === 'reserve_vehicle' && r.args.kind === 'car') && r.tool !== 'get_resource_status', q); }
  for (const q of ['패널 토의 장소 잡아줘', '패널 발표 자리 예약']) { const r = it(q); assert.ok(r.tool !== 'reserve_vehicle' && r.tool !== 'get_resource_status', q); }
  assert.deepEqual(ka('LED 패널 모레 예약해줘'), ['reserve_vehicle', 'led', '']);
});

test('목적 말(상담 때문에·교육하려고)은 자원 이름 단서가 아니다', () => {
  assert.equal(CH.chatResourceAsk('학부모 상담 때문에 회의실 잡아줘').keep, '학부모 회의실 잡아줘');
  assert.equal(CH.chatResourceAsk('교육하려고 회의실 예약').keep, '회의실 예약');
  assert.deepEqual(ka('상담 때문에 회의실 잡아줘'), ['reserve_vehicle', 'room', '']);
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

test('33: 빼라고 한 자원은 비어 있어도 고르지 않는다', async () => {
  let s = tool(), r = await s.run({kind: 'room'}, '2층 회의실 빼고 아무 회의실이나 잡아줘');
  assert.notEqual(picked(r), '2층 회의실'); assert.ok(!s.calls.includes('11'), '빼라고 한 자원은 확인하지도 않는다');
  s = tool(); r = await s.run({kind: 'car'}, '승합차 말고 다른 차로 예약');
  assert.equal(picked(r), '업무용 승용차 (34나 5678)');
  s = tool(LIST.filter(x => x.resSeq !== '22')); r = await s.run({kind: 'car'}, '승합차 말고 다른 차로 예약');
  assert.equal(r.ok, false); assert.equal(picked(r), ''); assert.match(r.text, /^빼라고 하신 업무용 승합차 \(12가 3456\) 말고는 예약할 차량이 없어/);
});

test('33: 번호·수식어 단서(2번 회의실, 본관 회의실)는 맞는 자원만, 없으면 거절. 인자를 덜 받아도 문장에서 읽는다', async () => {
  for (const [a, text, want] of [[{kind: 'room', resource: '2번 회의실'}, '', '회의실 2'], [{kind: 'room', resource: '회의실 2'}, '', '회의실 2'], [{kind: 'room'}, '회의실 2로 잡아줘', '회의실 2'], [{}, '회의실 1 예약해 주세요', '회의실 1']]) {
    const r = await tool().run(a, text);
    assert.equal(picked(r), want, JSON.stringify([a, text]));
  }
  for (const [a, text] of [[{kind: 'room', resource: '본관 회의실'}, ''], [{kind: 'room'}, '본관 회의실 잡아줘'], [{kind: 'room'}, '화상회의실 예약'], [{kind: 'room', resource: '회의실 3'}, '']]) {
    const r = await tool().run(a, text);
    assert.equal(r.ok, false, JSON.stringify([a, text])); assert.equal(picked(r), ''); assert.match(r.text, /에 맞는 회의실이 없어 다른 자원으로 대신 예약하지 않습니다/);
  }
});

test('33: 목적 말은 자원을 좁히지 않는다(상담 때문에 → 상담실만 고르지 않음)', async () => {
  const r = await tool(LIST, ['11']).run({kind: 'room'}, '학부모 상담 때문에 회의실 잡아줘');
  assert.equal(picked(r), '회의실 1', '2층 회의실이 차 있으면 다음 회의실(상담실로 좁히지 않음)');
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
