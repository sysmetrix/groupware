import * as R from '../src/live/briefing.mjs';
import test from 'node:test'; import assert from 'node:assert/strict';
test('ordKo continues past 14 and never undefined', () => { assert.equal(R.ordKo(0),'가'); assert.equal(R.ordKo(13),'하'); assert.equal(R.ordKo(14),'거'); assert.ok(R.ordKo(80) !== 'undefined'); });
test('teamHomeSummary picks today absences and 7-day problems', () => {
  const now = new Date('2026-11-09T10:00:00+09:00');
  const cal = {byDate: {'20261109': [{kind:'leave',name:'a'},{kind:'trip',name:'b'}]}, problems: [{date:'20261107',name:'c',state:'miss'},{date:'20261020',name:'d',state:'miss'}]};
  const s = R.teamHomeSummary(cal, now);
  assert.equal(s.leave.length,1); assert.equal(s.trip.length,1); assert.equal(s.problems.length,1);
});
