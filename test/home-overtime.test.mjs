import test from 'node:test';
import assert from 'node:assert/strict';
import {homeOvertime, homeDayRail} from '../src/live/home-model.mjs';

const app = (x = {}) => ({empCd: 'me', atNm: '시간외근무', approState: '1', startDt: '20261127', endDt: '20261127', startTm: '1800', endTm: '2000', ...x});
test('승인된 본인 시간외만 표시하고 중복을 제거한다', () => {
  const xs = [app(), app(), app({empCd:'other'}), app({approState:'0'}), app({deleteReqYn:'Y'}), app({docdelYn:'N'}), app({startTm:'1875'}), app({atNm:'휴가'})];
  const r = homeOvertime(xs, {date:'2026-11-27', me:'me'});
  assert.equal(r.length, 1); assert.equal(r[0].end, 1200);
  assert.equal(homeOvertime(xs, {date:'2026-11-28', me:'me'}).length, 0);
  assert.equal(homeOvertime(xs, {date:'2026-11-27'}).length, 0);
});
test('복수 시간외 및 자정 경계의 종료 시각을 보존한다', () => {
  const r = homeOvertime([app(), app({startTm:'2200',endTm:'0130'})], {date:'20261127',me:'me'});
  assert.deepEqual(r.map(x => x.end), [1200,1530]);
  const next = homeOvertime([app({startTm:'2200',endTm:'0130'})], {date:'20261128',me:'me'});
  assert.deepEqual(next.map(x => [x.from, x.end]), [[0,90]]);
  const spanning = homeOvertime([app({startTm:'2200',endTm:'0130',endDt:'20261128'})], {date:'20261127',me:'me'});
  assert.equal(spanning[0].end,1530);
  const rail = homeDayRail([{from:'18:00',to:'20:00',label:'시간외',kind:'ot'}], {nowMin: 19*60, endH:20, workEndMin:1200});
  assert.equal(rail.leftMin, 60); assert.equal(rail.blocks[0].kind, 'ot'); assert.equal(rail.blocks[0].width > 0, true);
  assert.equal(homeDayRail([], {nowMin: 17*60}).leftMin, 60);
  assert.equal(homeDayRail([], {nowMin: 30, workEndMin:90}).leftMin, 60);
  assert.equal(homeDayRail([], {nowMin: 30}).leftMin, 0);
});
