import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as R from '../src/live/briefing.mjs';

const source = readFileSync(new URL('../src/live/wc/24-resource.js', import.meta.url), 'utf8');
const day = '20261124', next = '20261125';
const list = [{resSeq: '1', name: 'LED 패널'}, {resSeq: '2', name: '회의실'}];
const booking = (start, end, title = 'LED 점검', resSeq = '1') => ({start, end, title, resSeq, who: '예약자'});
const timeline = html => html.split('<h2>예약하기</h2>')[0];
const flush = () => new Promise(setImmediate);

function setup() {
  const requests = [], errors = [];
  let renders = 0;
  const c = {currentKey: 'A', sessionKey: 'A', S: {view: 'resource'}, allowed: () => true, esc: String, ic: () => '', pgh: () => '', $: () => null,
    getUserKey: () => c.sessionKey, renderMain: () => { renders++; c.resEnsure(); }, logError: (...e) => errors.push(e),
    GW: {links: {route: () => ''}, resourceList: async () => list, resourceBookings: q => new Promise((resolve, reject) => requests.push({q, resolve, reject}))},
    R: {...R, kstNow: () => ({date: '2026-11-24'})}};
  vm.createContext(c);
  vm.runInContext(source, c);
  return {c, requests, errors, renders: () => renders, timeline: () => timeline(c.vResource())};
}

test('resource availability is unknown while pending and a verified empty day is free', async () => {
  const h = setup();
  const done = h.c.resLoad();
  await flush();
  assert.deepEqual(h.requests.map(r => JSON.parse(JSON.stringify(r.q))), [
    {from: day, to: day, resSeqs: ['1']}, {from: day, to: '20261224', resSeqs: ['1']},
  ]);
  assert.match(h.timeline(), /예약 현황을 조회하는 중/);
  assert.doesNotMatch(h.timeline(), /비어 있음|예약이 없습니다|빈 시간이 없습니다/);
  h.requests[0].resolve([]);
  await flush();
  assert.match(h.timeline(), /예약이 없습니다/);
  assert.match(h.timeline(), /09:00~18:00<\/b> · 비어 있음/);
  assert.match(h.c.vResource(), /다가오는 예약을 조회하는 중/);
  h.requests[1].resolve([]);
  await done;
  assert.match(h.c.vResource(), /다가오는 예약이 없습니다/);
});

test('one 09:00–10:00 LED booking leaves a gap and cannot repeat on the next day', async () => {
  const h = setup();
  const first = h.c.resLoad();
  await flush();
  const sameDay = booking(day + '0900', day + '1000');
  const otherResource = booking(day + '1000', day + '1800', '다른 자원', '2');
  for (const r of h.requests.slice(0, 2)) r.resolve([sameDay, otherResource]);
  await first;
  assert.match(h.timeline(), /09:00~10:00<\/b> · 예약됨 · LED 점검[\s\S]*10:00~18:00<\/b> · 비어 있음/);
  assert.doesNotMatch(h.timeline(), /빈 시간이 없습니다|다른 자원/);
  const second = h.c.resDay(1);
  assert.equal(h.requests[2].q.from, next);
  assert.equal(h.requests[2].q.to, next);
  assert.doesNotMatch(h.c.vResource(), /LED 점검/);
  for (const r of h.requests.slice(2)) r.resolve([sameDay]); // Ignore out-of-range rows even when the endpoint returns them.
  await second;
  assert.match(h.timeline(), /09:00~18:00<\/b> · 비어 있음/);
  assert.doesNotMatch(h.c.vResource(), /LED 점검/);
});

test('fully booked, cross-midnight and short off-grid gaps remain distinguishable', async () => {
  const h = setup();
  const first = h.c.resLoad();
  await flush();
  h.requests[0].resolve([booking('202611231500', day + '0940'), booking(day + '0941', next + '1015', '연속 예약')]);
  h.requests[1].resolve([]);
  await first;
  assert.match(h.timeline(), /00:00~09:40<\/b> · 예약됨/);
  assert.match(h.timeline(), /09:40~09:41<\/b> · 비어 있음[\s\S]*30분 단위 선택 불가/);
  assert.match(h.timeline(), /09:41~24:00<\/b> · 예약됨/);
  assert.match(h.timeline(), /원래 예약 기간 2026-11-24 09:41 ~ 2026-11-25 10:15/);
  assert.doesNotMatch(h.timeline(), /빈 시간이 없습니다|data-act="resFree"/);
  const second = h.c.resReload();
  h.requests[2].resolve([booking(day + '0900', day + '1800')]);
  h.requests[3].resolve([]);
  await second;
  assert.match(h.timeline(), /빈 시간이 없습니다/);
  assert.doesNotMatch(h.timeline(), /비어 있음|data-act="resFree"/);
});

test('late day and resource responses cannot replace the current selection', async () => {
  const h = setup();
  const staleDate = h.c.resLoad();
  await flush();
  const staleRes = h.c.resDay(1);
  const latest = h.c.resSel('2');
  h.requests[4].resolve([booking(next + '1100', next + '1200', '현재 결과', '2')]);
  h.requests[5].resolve([]);
  await latest;
  const freshRenders = h.renders();
  h.requests[0].resolve([booking(day + '0900', day + '1000', '이전 날짜')]);
  h.requests[1].reject(new Error('늦은 이전 날짜 오류'));
  h.requests[2].resolve([booking(next + '1000', next + '1100', '이전 자원')]);
  h.requests[3].resolve([]);
  await Promise.all([staleDate, staleRes]);
  assert.equal(h.renders(), freshRenders);
  assert.equal(h.errors.length, 0);
  assert.match(h.timeline(), /현재 결과/);
  assert.doesNotMatch(h.c.vResource(), /이전 날짜|이전 자원/);
});

test('session changes hide old rows and ignore pending responses before account state refresh', async () => {
  const h = setup();
  const old = h.c.resLoad();
  await flush();
  h.requests[0].resolve([booking(day + '0900', day + '1000', 'A 비공개 예약')]);
  await flush();
  assert.match(h.timeline(), /A 비공개 예약/);
  h.c.sessionKey = 'B';
  assert.doesNotMatch(h.timeline(), /A 비공개 예약/);
  h.c.resEnsure();
  assert.equal(h.requests.length, 2);
  h.c.currentKey = 'B';
  const fresh = h.c.resLoad();
  await flush();
  h.requests[2].resolve([]); h.requests[3].resolve([]);
  await fresh;
  const freshRenders = h.renders();
  h.requests[1].resolve([booking(day + '0900', day + '1000', 'A 비공개 예약')]);
  await old;
  assert.equal(h.renders(), freshRenders);
  assert.match(h.timeline(), /예약이 없습니다/);
  assert.doesNotMatch(h.c.vResource(), /A 비공개 예약/);
});

test('timeout and malformed data stay unknown, upcoming success is independent, and retry recovers', async () => {
  const h = setup();
  const pending = h.c.resLoad();
  await flush();
  h.requests[0].reject(Object.assign(new Error('응답 시간 초과'), {code: 'TIMEOUT'}));
  h.requests[1].resolve([booking(next + '1100', next + '1200', '내일 예약')]);
  await pending;
  assert.match(h.timeline(), /빈 시간을 확인할 수 없습니다.*응답 시간 초과/);
  assert.match(h.timeline(), /다시 시도/);
  assert.doesNotMatch(h.timeline(), /예약이 없습니다|빈 시간이 없습니다|data-act="resFree"/);
  assert.match(h.c.vResource(), /내일 예약/);
  const malformed = h.c.resReload();
  h.requests[2].resolve([booking(day + '0961', day + '1100')]);
  h.requests[3].resolve(null);
  await malformed;
  assert.match(h.timeline(), /날짜·시간을 확인할 수 없는 응답/);
  assert.match(h.c.vResource(), /다가오는 예약을 확인할 수 없습니다/);
  const retry = h.c.resReload();
  h.requests[4].resolve([]); h.requests[5].reject(new Error('별도 조회 실패'));
  await retry;
  assert.match(h.timeline(), /09:00~18:00<\/b> · 비어 있음/);
  assert.doesNotMatch(h.timeline(), /별도 조회 실패/);
  assert.match(h.c.vResource(), /다가오는 예약을 확인할 수 없습니다.*별도 조회 실패/);
});
