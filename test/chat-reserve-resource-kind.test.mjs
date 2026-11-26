// v1.28 자원 종류 한 기준(briefing.mjs resKindOf·resPick): 현황 조회(32)와 예약 준비(33)가 같은 자원에 같은 종류를 답한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as B from '../src/live/briefing.mjs';
import * as CH from '../src/live/chat.mjs';
import * as CU from '../src/live/chat-understand.mjs';

const R = {...B, ...CH, cuJosa: CU.cuJosa};
const src = f => readFile(new URL('../src/live/wc/' + f, import.meta.url), 'utf8');
const [read32, act33] = await Promise.all([src('32-chat-tools-read.js'), src('33-chat-tools-act.js')]);
const DATE = '2099-03-10';
// 둘러보기 자료 모양(지어낸 자원)과 실제 그룹웨어 응답 모양(이름·분류)을 섞은 목록
const DEMO = [
  {resSeq: '11', name: '2층 회의실', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '12', name: '다목적홀', attr: '회의실', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '13', name: '상담실 1', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '21', name: '업무용 승합차 (12가 3456)', attr: '차량', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '22', name: '업무용 승용차 (34나 5678)', attr: '차량', apprYn: 'Y', useYn: 'Y'},
];
const REAL_SHAPE = [
  {resSeq: '5', name: '관용차량(니로EV)', attr: '예시재단|공용차량', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '7', name: '1층 LED패널(1)', attr: '예시센터 LED패널(1층)', apprYn: 'N', useYn: 'Y'},
  {resSeq: '8', name: '1층 LED패널(2)', attr: '', apprYn: 'N', useYn: 'Y'},
];
// 예약 대상이 아닌 물건(분류가 회의실·차량이어도)
const GEAR = [
  {resSeq: '61', name: '회의용 빔프로젝터', attr: '기자재', apprYn: 'N', useYn: 'Y'},
  {resSeq: '62', name: '화상회의 장비', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '63', name: '하이패스 카드', attr: '공용차량', apprYn: 'N', useYn: 'Y'},
  {resSeq: '64', name: '차량용 블랙박스', attr: '차량', apprYn: 'N', useYn: 'Y'},
];

function tools(list) {
  const t = new Map(), GW = {
    resourceList: async () => list.map(r => ({...r})),
    resourceBookings: async () => [],
    resourceDetail: async seq => ({resSeq: seq, apprYn: (list.find(r => r.resSeq === seq) || {}).apprYn, limitMin: 0}),
    resourceCheck: async () => ({conflict: false, limit: false}),
    reserveResource: async () => { throw new Error('확인 카드를 누르지 않았는데 예약 요청이 나갔습니다'); },
  };
  const base = {S: {}, GW, R, chatRegisterTool: d => t.set(d.name, d), allowed: () => true, resState: () => ({}), today: () => '2099-03-01', logError: () => {}, logActionRecord: () => {}};
  vm.runInNewContext(read32, base);
  // 33은 32가 정의한 chatDateArg·chatMd를 쓴다(번들에서는 같은 boot() 범위)
  vm.runInNewContext(act33, {...base, chatDateArg: v => v, chatMd: iso => iso});
  return {status: a => t.get('get_resource_status').run({date: DATE, ...a}), reserve: a => t.get('reserve_vehicle').run({date: DATE, start: '15:00', end: '16:00', ...a}, {userText: ''})};
}
// 32가 고른 자원 번호(자원 예약 화면 열기 카드의 v = 'resSeq,YYYYMMDD')
const seq32 = s => ((s.cards || []).find(c => c.type === 'nav' && c.v) || {v: ''}).v.split(',')[0];

test('resKindOf: 이름이 먼저, 이름으로 모르면 자원 분류(attr)', () => {
  assert.deepEqual([...DEMO, ...REAL_SHAPE].map(R.resKindOf), ['room', 'room', 'room', 'car', 'car', 'car', 'led', 'led']);
  assert.equal(R.resKindOf({name: '9인승 1호', attr: '공용차량'}), 'car', '이름에 종류 말이 없으면 분류로');
  assert.equal(R.resKindOf({name: '관용차량', attr: '회의실'}), 'car', '이름이 분류보다 앞선다');
  assert.equal(R.resKindOf({name: '빔프로젝터', attr: '기자재'}), '');
  assert.equal(R.resKindOf(null), '');
});

test('C: 장비·소모품 이름은 분류가 회의실·차량이어도 어느 종류도 아니다', () => {
  assert.deepEqual(GEAR.map(R.resKindOf), ['', '', '', '']);
  assert.equal(R.resKindOf({name: '화상회의실', attr: ''}), 'room', '장비 말이 없는 회의실 이름은 그대로');
  assert.equal(R.resKindOf({name: '업무용 승합차', attr: ''}), 'car', '업무용은 장비 말이 아니다');
  // 이름으로 판정한 자원이 분류로만 판정한 자원보다 앞선다
  assert.deepEqual(R.resPick([{resSeq: '1', name: '9인승 1호', attr: '공용차량'}, ...REAL_SHAPE], 'car').of.map(r => r.resSeq), ['5', '1']);
  assert.deepEqual(R.resPick([...GEAR, ...DEMO], 'room').of.map(r => r.resSeq), ['11', '12', '13'], '장비는 빠지고 2층 회의실(이름)이 다목적홀·상담실 1(분류)보다 앞');
});

test('I: 말(resKindOfText)과 자원(resKindOf)의 종류 판정 순서가 같다(LED → 회의실 → 차량)', () => {
  for (const name of ['회의실 전광판', '세미나실 LED', '회의실 앞 차량', '강당 LED패널', '승합차', '2층 회의실', '1층 LED패널(1)', '관용차량(니로EV)', '회의용 빔프로젝터', '하이패스 카드'])
    assert.equal(R.resKindOfText(name), R.resKindOf({name, attr: ''}), name);
  assert.equal(R.resKindOf({name: '회의실 전광판'}), 'led');
});

test('resKindOfText: 인자·이름 단서의 말을 종류로', () => {
  for (const [v, k] of [['car', 'car'], ['room', 'room'], ['led', 'led'], ['회의실', 'room'], ['2층 회의실', 'room'], ['meeting room', 'room'], ['세미나실', 'room'], ['LED 패널', 'led'], ['전광판', 'led'], ['차량', 'car'], ['관용차', 'car'], ['차', 'car'], ['vehicle', 'car'], ['상담실', ''], ['', ''], ['constructor', ''], [undefined, ''], ['빔프로젝터', '']]) assert.equal(R.resKindOfText(v), k, String(v));
});

test('D: resNameScore — 전체 이름 3, 이어진 일부 2, 낱말마다 1, 숫자 경계', () => {
  const S = (name, clue) => R.resNameScore({name, attr: ''}, clue);
  assert.equal(S('상담실 1', '상담실 1'), 3); assert.equal(S('상담실 10', '상담실 1'), 0);
  assert.equal(S('1층 회의실', '1층'), 2); assert.equal(S('11층 회의실', '1층'), 0);
  assert.equal(S('관용차량(니로EV)', '관용차량'), 3, '괄호 앞까지가 이름 전체'); assert.equal(S('관용차량(니로EV)', '니로'), 2);
  assert.equal(S('1층 LED패널(2)', '1층 LED패널(2)'), 3); assert.equal(S('1층 LED패널(1)', '1층 LED패널(2)'), 0);
  assert.equal(S('제1회의실', '1회의실'), 2); assert.equal(S('제11회의실', '1회의실'), 0);
  assert.equal(S('3층 소회의실', '3층 회의실'), 1, '종류 말은 그 종류면 맞는다'); assert.equal(S('2층 회의실', '3층 회의실'), 0);
  assert.equal(S('대회의실', '소회의실'), 0); assert.equal(S('x', ''), 0);
});

test('resPick: 알려진 종류·좁은 종류 말·그 밖의 말·이름 단서·문장 단서', () => {
  const list = [...DEMO, ...REAL_SHAPE];
  assert.deepEqual(R.resPick(list, 'room').of.map(r => r.resSeq), ['11', '12', '13'], '이름으로 판정한 회의실이 앞');
  assert.equal(R.resPick(list, 'room').label, '회의실');
  assert.deepEqual(R.resPick(list, '상담실').of.map(r => r.resSeq), ['13']);
  assert.equal(R.resPick(list, '상담실').kind, '');
  assert.deepEqual(R.resPick(list, 'room', '2층 회의실').pool.map(r => r.resSeq), ['11']);
  assert.deepEqual(R.resPick(list, 'room', '회의실').pool.map(r => r.resSeq), ['11', '12', '13'], '종류 말만 있는 단서는 좁히지 않는다');
  assert.deepEqual(R.resPick(list, 'room', '3층 회의실').pool, []);
  assert.equal(R.resPick(list, 'room', '3층 회의실').clue, '3층 회의실');
  // A: 좁은 종류 말은 이름 단서이기도 하다
  assert.deepEqual(R.resPick(list, '승합차').pool.map(r => r.resSeq), ['21']);
  assert.equal(R.resPick(list, '승합차').label, '차량');
  assert.deepEqual(R.resPick(list, '카니발').pool, []);
  assert.deepEqual(R.resPick(list, '강당').pool, []);
  assert.deepEqual(R.resPick(list, 'car', '니로').pool.map(r => r.resSeq), ['5']);
  assert.deepEqual(R.resPick(list, 'led', '1층 LED패널(2)').pool.map(r => r.resSeq), ['8']);
  assert.deepEqual(R.resPick(list, 'led', '1층 LED 패널').pool.map(r => r.resSeq), ['7', '8'], '둘 다 맞으면 둘 다 후보');
  // 문장 단서
  assert.deepEqual(R.resPick(list, 'car', '', '내일 15~16시 니로 예약해줘').pool.map(r => r.resSeq), ['5']);
  assert.deepEqual(R.resPick(list, 'car', '', '승합차로 잡아줘').pool.map(r => r.resSeq), ['21']);
  assert.equal(R.resPick(list, 'car', '', '니로 말고 승합차').ambiguous, true);
  assert.deepEqual(R.resPick(list, 'room', '', '내일 3시 회의실 예약').pool.length, 3);
  // F: 종류 없이 이름만 오면 전체에서 찾아 그 종류를 따른다
  let p = R.resPick(list, '', '다목적홀');
  assert.equal(p.kind, 'room'); assert.equal(p.label, '회의실'); assert.deepEqual(p.pool.map(r => r.resSeq), ['12']);
  p = R.resPick(list, '', '체육관');
  assert.equal(p.kind, ''); assert.equal(p.label, '자원'); assert.deepEqual(p.pool, []); assert.equal(p.of.length, list.length);
  assert.deepEqual(R.resPick(DEMO, 'led').of, []);
  assert.deepEqual(R.resPick(list, 'x').of, [], '한 글자 말로는 고르지 않는다');
  assert.deepEqual(R.resPick(null, 'car').of, []);
});

test('현황 조회(32)와 예약 준비(33)는 같은 종류에 같은 자원을 고른다', async () => {
  for (const list of [DEMO, REAL_SHAPE, [...DEMO, ...REAL_SHAPE], [...REAL_SHAPE].reverse(), [...GEAR, ...DEMO, ...REAL_SHAPE], GEAR]) {
    const {status, reserve} = tools(list);
    for (const kind of ['car', 'room', 'led']) {
      const s = await status({kind}), r = await reserve({kind});
      const want = R.resPick(list, kind).of[0];
      if (!want) {
        assert.equal(r.ok, false, kind); assert.ok(!(r.cards || []).some(c => c.type === 'confirm'));
        if (kind !== 'car') assert.match(s.text, /등록되어 있지 않아/, kind); else assert.equal(s.ok, false);
        continue;
      }
      assert.equal(seq32(s), want.resSeq, `32 ${kind}`);
      assert.equal(r.data.resSeq, want.resSeq, `33 ${kind}`);
      assert.equal(r.data.resource, want.name, '33은 이름 전체');
      assert.equal(r.data.kind, R.resPick(list, kind).label);
    }
  }
});

test('자원 하나하나: 두 도구가 그 자원의 종류로 물었을 때 그 자원을 고른다', async () => {
  for (const one of [...DEMO, ...REAL_SHAPE]) {
    const kind = R.resKindOf(one), {status, reserve} = tools([one]);
    const s = await status({kind}), r = await reserve({kind});
    assert.equal(seq32(s), one.resSeq, one.name);
    assert.equal(r.data.resSeq, one.resSeq, one.name);
  }
});

test('C: 장비만 있으면 32도 33도 회의실·차량으로 답하지 않는다', async () => {
  const {status, reserve} = tools(GEAR);
  const room = await status({kind: 'room'});
  assert.match(room.text, /^그룹웨어 자원 예약에는 회의실이 등록되어 있지 않아/);
  const car = await status({});
  assert.equal(car.ok, false); assert.match(car.text, /차량을 찾지 못했습니다/);
  for (const kind of ['room', 'car']) assert.equal((await reserve({kind})).ok, false, kind);
});

test('32의 기존 동작: 없는 종류는 없다고 답하고 다른 자원으로 대신하지 않는다', async () => {
  const {status} = tools(DEMO);
  const led = await status({kind: 'led'});
  assert.equal(led.ok, true); assert.equal(led.data.count, 0);
  assert.match(led.text, /^그룹웨어 자원 예약에는 LED 패널이 등록되어 있지 않아 비어 있는지 확인할 수 없습니다\. 등록된 자원: 2층 회의실, 다목적홀/);
  const noCar = await tools(DEMO.filter(r => r.attr === '회의실')).status({});
  assert.equal(noCar.ok, false); assert.match(noCar.text, /차량을 찾지 못했습니다/);
  // 분류로 회의실인 다목적홀도 회의실 현황으로 답한다
  const hall = await tools([DEMO[1]]).status({kind: 'room'});
  assert.equal(hall.data.resource, '다목적홀');
});
