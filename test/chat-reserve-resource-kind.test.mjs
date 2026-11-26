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
  return {status: a => t.get('get_resource_status').run({date: DATE, ...a}), reserve: a => t.get('reserve_vehicle').run({date: DATE, start: '15:00', end: '16:00', ...a})};
}
const bare = s => String(s || '').trim();

test('resKindOf: 이름이 먼저, 이름으로 모르면 자원 분류(attr)', () => {
  assert.deepEqual([...DEMO, ...REAL_SHAPE].map(R.resKindOf), ['room', 'room', 'room', 'car', 'car', 'car', 'led', 'led']);
  assert.equal(R.resKindOf({name: '스타렉스', attr: '공용차량'}), 'car', '이름에 종류 말이 없으면 분류로');
  assert.equal(R.resKindOf({name: '관용차량', attr: '회의실'}), 'car', '이름이 분류보다 앞선다');
  assert.equal(R.resKindOf({name: '빔프로젝터', attr: '기자재'}), '');
  assert.equal(R.resKindOf(null), '');
});

test('resKindOfText: 인자·이름 단서의 말을 종류로', () => {
  for (const [v, k] of [['car', 'car'], ['room', 'room'], ['led', 'led'], ['회의실', 'room'], ['2층 회의실', 'room'], ['meeting room', 'room'], ['세미나실', 'room'], ['LED 패널', 'led'], ['전광판', 'led'], ['차량', 'car'], ['관용차', 'car'], ['차', 'car'], ['vehicle', 'car'], ['상담실', ''], ['', ''], ['constructor', ''], [undefined, '']]) assert.equal(R.resKindOfText(v), k, String(v));
});

test('resPick: 알려진 종류·그 밖의 말·이름 단서', () => {
  const list = [...DEMO, ...REAL_SHAPE];
  assert.deepEqual(R.resPick(list, 'room').of.map(r => r.resSeq), ['11', '12', '13']);
  assert.equal(R.resPick(list, 'room').label, '회의실');
  assert.deepEqual(R.resPick(list, '상담실').of.map(r => r.resSeq), ['13']);
  assert.equal(R.resPick(list, '상담실').kind, '');
  assert.deepEqual(R.resPick(list, 'room', '2층 회의실').pool.map(r => r.resSeq), ['11']);
  assert.deepEqual(R.resPick(list, 'room', '회의실').pool.map(r => r.resSeq), ['11', '12', '13'], '종류 말만 있는 단서는 좁히지 않는다');
  assert.deepEqual(R.resPick(list, 'room', '3층 회의실').pool, []);
  assert.deepEqual(R.resPick(DEMO, 'led').of, []);
  assert.deepEqual(R.resPick(list, 'x').of, [], '한 글자 말로는 고르지 않는다');
  assert.deepEqual(R.resPick(null, 'car').of, []);
});

test('현황 조회(32)와 예약 준비(33)는 같은 종류에 같은 자원을 고른다', async () => {
  for (const list of [DEMO, REAL_SHAPE, [...DEMO, ...REAL_SHAPE], [...REAL_SHAPE].reverse()]) {
    const {status, reserve} = tools(list);
    for (const kind of ['car', 'room', 'led']) {
      const s = await status({kind}), r = await reserve({kind});
      const want = R.resPick(list, kind).of[0];
      if (!want) {
        assert.equal(r.ok, false, kind); assert.ok(!(r.cards || []).some(c => c.type === 'confirm'));
        if (kind !== 'car') assert.match(s.text, /등록되어 있지 않아/, kind); else assert.equal(s.ok, false);
        continue;
      }
      assert.equal(bare(s.data.resource), bare(want.name.replace(/\(.*$/, '')), `32 ${kind}`);
      assert.equal(r.data.resource, bare(s.data.resource), `33 ${kind}`);
      assert.equal(r.data.kind, R.resPick(list, kind).label);
    }
  }
});

test('자원 하나하나: 두 도구가 그 자원의 종류로 물었을 때 그 자원을 고른다', async () => {
  for (const one of [...DEMO, ...REAL_SHAPE]) {
    const kind = R.resKindOf(one), {status, reserve} = tools([one]);
    const s = await status({kind}), r = await reserve({kind});
    assert.equal(bare(s.data.resource), bare(one.name.replace(/\(.*$/, '')), one.name);
    assert.equal(r.data.resource, bare(s.data.resource), one.name);
  }
});

test('32의 기존 동작: 없는 종류는 없다고 답하고 다른 자원으로 대신하지 않는다', async () => {
  const {status} = tools(DEMO);
  const led = await status({kind: 'led'});
  assert.equal(led.ok, true); assert.equal(led.data.count, 0);
  assert.match(led.text, /^그룹웨어 자원 예약에는 LED 패널이 등록되어 있지 않아 비어 있는지 확인할 수 없습니다\. 등록된 자원: 2층 회의실, 다목적홀/);
  const noCar = await tools(DEMO.filter(r => r.attr === '회의실')).status({});
  assert.equal(noCar.ok, false); assert.match(noCar.text, /차량을 찾지 못했습니다/);
  // 분류로 회의실인 다목적홀도 이제 회의실 현황으로 답한다
  const hall = await tools([DEMO[1]]).status({kind: 'room'});
  assert.equal(bare(hall.data.resource), '다목적홀');
});
