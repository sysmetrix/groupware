// v1.28 비서 자원 예약 준비: 요청한 종류(차량·회의실·그 밖의 종류)만 고르고, 없으면 대신하지 않으며, 확인 카드는 누르기 전까지 아무것도 올리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as B from '../src/live/briefing.mjs';
import * as CU from '../src/live/chat-understand.mjs';

const source = await readFile(new URL('../src/live/wc/33-chat-tools-act.js', import.meta.url), 'utf8');
const DATE = '2099-03-10', D8 = '20990310';
// 지어낸 자원 목록(둘러보기 자료와 같은 모양)
const LIST = [
  {resSeq: '11', name: '2층 회의실', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '12', name: '다목적홀', attr: '회의실', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '21', name: '업무용 승합차 (12가 3456)', attr: '차량', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '22', name: '업무용 승용차 (34나 5678)', attr: '차량', apprYn: 'N', useYn: 'Y'},
  {resSeq: '23', name: '예전 승용차', attr: '차량', apprYn: 'N', useYn: 'N'},
];

function setup({list = LIST, busy = [], detail = {}, reserve} = {}) {
  const tools = new Map(), calls = [], logs = [];
  const GW = {
    resourceList: async () => { calls.push(['list']); return list.map(r => ({...r})); },
    resourceDetail: async seq => { calls.push(['detail', seq]); const r = list.find(x => x.resSeq === seq); return {resSeq: seq, apprYn: r.apprYn, limitMin: 0, ...(detail[seq] || {})}; },
    resourceCheck: async ({resSeq, start, end}) => { calls.push(['check', resSeq, start, end]); return {conflict: busy.includes(resSeq), limit: false}; },
    resourceBookings: async ({resSeqs}) => { calls.push(['bookings', resSeqs[0]]); return busy.includes(resSeqs[0]) ? [{resSeq: resSeqs[0], start: D8 + '1400', end: D8 + '1700', title: '회의'}] : []; },
    reserveResource: async body => { calls.push(['reserve', body]); return reserve ? reserve(body) : {ok: true, needsApproval: false}; },
  };
  const c = {S: {}, GW, R: {...B, cuJosa: CU.cuJosa}, chatRegisterTool: t => tools.set(t.name, t), allowed: () => true,
    chatDateArg: v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : ''), chatMd: iso => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`,
    logActionRecord: x => logs.push(x), logError: () => {}};
  vm.runInNewContext(source, c);
  const run = a => tools.get('reserve_vehicle').run({date: DATE, start: '15:00', end: '16:00', ...a});
  return {tools, calls, logs, run, c};
}
const J = x => JSON.parse(JSON.stringify(x)); // vm 안에서 만든 값은 다른 realm이라 구조만 비교한다
const writes = calls => calls.filter(x => x[0] === 'reserve');
const row = (card, k) => (card.rows.find(r => r[0] === k) || [])[1];

test('도구 이름은 그대로, 종류(kind)와 자원 이름(resource) 인자를 받는다', () => {
  const {tools} = setup(), t = tools.get('reserve_vehicle');
  assert.ok(t.params.properties.kind && t.params.properties.resource);
  assert.deepEqual(J(t.params.required), ['date', 'start', 'end']);
});

test('종류 고르기: 회의실은 회의실만, 기본은 차량, 자원 이름에 종류가 있으면 그 종류', async () => {
  let s = setup(), res = await s.run({kind: 'room', title: '주간 회의'});
  assert.equal(res.ok, true);
  let card = res.cards.find(x => x.type === 'confirm');
  assert.equal(card.title, '회의실 예약 확정'); assert.equal(row(card, '종류'), '회의실'); assert.equal(row(card, '자원'), '2층 회의실');
  assert.equal(res.data.resource, '2층 회의실');

  s = setup(); res = await s.run({});
  card = res.cards.find(x => x.type === 'confirm');
  assert.equal(row(card, '종류'), '차량'); assert.match(row(card, '자원'), /승합차|승용차/);

  // 로컬 규칙·AI가 kind 없이 이름만 넘겨도 회의실로 읽는다(차량으로 바꾸지 않음)
  s = setup(); res = await s.run({resource: '2층 회의실'});
  card = res.cards.find(x => x.type === 'confirm');
  assert.equal(row(card, '종류'), '회의실'); assert.equal(row(card, '자원'), '2층 회의실');

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
    assert.ok(!res.cards.some(x => x.type === 'confirm'));
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

test('이름 단서에 맞는 자원이 없으면 같은 종류의 다른 자원으로 바꾸지 않는다', async () => {
  const s = setup(), res = await s.run({kind: 'room', resource: '3층 회의실'});
  assert.equal(res.ok, false); assert.match(res.text, /3층 회의실”에 맞는 회의실이 없습니다\. 있는 회의실: 2층 회의실/);
  assert.deepEqual(s.calls, [['list']]);
});

test('같은 종류가 여럿이면 빈 자원을 먼저 고르고 다른 후보를 카드에 보인다', async () => {
  const s = setup({busy: ['21']}), res = await s.run({kind: 'car'});
  const card = res.cards.find(x => x.type === 'confirm');
  assert.equal(row(card, '자원'), '업무용 승용차');
  assert.equal(row(card, '다른 후보'), '업무용 승합차(예약 있음)');
  // 첫 자원이 비어 있으면 그것을 고르고, 확인하지 않은 후보는 표시 없이 보인다
  const s2 = setup(), res2 = await s2.run({kind: 'car'}), card2 = res2.cards.find(x => x.type === 'confirm');
  assert.equal(row(card2, '자원'), '업무용 승합차'); assert.equal(row(card2, '다른 후보'), '업무용 승용차');
  assert.ok(!s2.calls.some(x => x[0] === 'check' && x[1] === '22'), '빈 자원을 찾으면 더 확인하지 않는다');
});

test('같은 종류가 모두 차 있으면 확인 카드 없이 빈 시간을 알려 준다', async () => {
  const s = setup({busy: ['21', '22']}), res = await s.run({kind: 'car'});
  assert.equal(res.ok, true);
  assert.ok(!res.cards.some(x => x.type === 'confirm'));
  assert.match(res.text, /^차량 2곳 모두 안 됩니다\(업무용 승합차: 그 시간에는 이미 예약이 있습니다\. 업무용 승용차: 그 시간에는 이미 예약이 있습니다\.\)\. 업무용 승합차의 /);
  assert.match(res.text, /비어 있는 시간: 09:00~14:00, 17:00~18:00/);
  assert.equal(writes(s.calls).length, 0);
  // 한 곳뿐이면 예전처럼 짧게
  const s1 = setup({busy: ['11'], list: LIST.filter(r => r.resSeq !== '12')}), r1 = await s1.run({kind: 'room'});
  assert.match(r1.text, /^그 시간에는 이미 예약이 있습니다\. 비어 있는 시간:/);
});

test('확인 카드는 실행하지 않는다: 누르기 전에는 예약 요청이 없고, 누르면 자원 화면과 같은 값으로 한 번 올린다', async () => {
  const s = setup(), res = await s.run({kind: 'room', title: '주간 회의'});
  assert.equal(writes(s.calls).length, 0, 'onConfirm 전에는 예약 요청이 없다');
  assert.ok(s.calls.every(x => ['list', 'detail', 'check'].includes(x[0])));
  assert.equal(s.logs.length, 0);
  const card = res.cards.find(x => x.type === 'confirm');
  assert.equal(card.risk, 'high'); assert.equal(card.confirmLabel, '예약 확정');
  assert.match(res.text, /예약할 수 있습니다\. 확정하면 실제로 예약이 올라갑니다\.$/);
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

test('확정 결과를 확인하지 못하면 했다고 하지 않는다', async () => {
  for (const reserve of [() => ({ok: false}), () => null, () => ({ok: true, verifiedAfterTimeout: true})]) {
    const s = setup({reserve}), res = await s.run({kind: 'room'}), out = await res.cards[0].onConfirm();
    assert.equal(out.ok, false); assert.match(out.text, /저장 여부를 확인하지 못했습니다/); assert.equal(s.logs.length, 0);
  }
  const s = setup({reserve: () => { throw Object.assign(new Error('같은 시간에 이미 예약이 있습니다'), {code: 'CONFLICT'}); }});
  const out = await (await s.run({kind: 'room'})).cards[0].onConfirm();
  assert.equal(out.ok, false); assert.match(out.text, /^예약하지 못했습니다: 같은 시간에/);
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

test('확정 요청 값이 자원 예약 화면(24-resource.js)과 같은 모양이다', async () => {
  const res24 = await readFile(new URL('../src/live/wc/24-resource.js', import.meta.url), 'utf8');
  assert.match(res24, /GW\.reserveResource\(\{resSeq: p\.resSeq, title: p\.title, start: p\.date \+ p\.start\.replace\(':', ''\), end: p\.date \+ p\.end\.replace\(':', ''\), desc: p\.desc\}\)/);
  assert.match(res24, /out\.ok !== true \|\| \(out\.verifiedAfterTimeout && out\.identityVerified !== true\)/);
  assert.match(source, /GW\.reserveResource\(\{resSeq: r\.resSeq, title, start: v\.start12, end: v\.end12, desc: ''\}\)/);
  assert.match(source, /out\.ok !== true \|\| \(out\.verifiedAfterTimeout && out\.identityVerified !== true\)/);
});
