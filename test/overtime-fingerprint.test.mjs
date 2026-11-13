import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTeamCalendar, classifyTeamRow, expandPlanned} from '../src/live/briefing.mjs';

const now = new Date('2026-11-10T09:00:00+09:00');
const row = overrides => ({date: '20261109', name: '본인', dept: '부서', mine: true, item: '연장근무', appStart: '1800', appEnd: '2100', come: '', leave: '', ...overrides});

test('시간외 퇴근 지문 누락만 문제로 분류하고 출근 지문과 이른 퇴근은 무시한다', () => {
  for (const come of ['', '0900']) {
    for (const leave of ['1750', '2043', '2100', '2200']) {
      const c = classifyTeamRow(row({come, leave}), now);
      assert.equal(c.state, 'ok');
      assert.doesNotMatch(c.detail, /일찍|출근 지문/);
    }
    assert.equal(classifyTeamRow(row({come}), now).state, 'miss');
  }
  assert.equal(classifyTeamRow(row({item: '조기근무', appStart: '0700', appEnd: '0900', leave: '0850'}), now).state, 'ok');
  const calendar = buildTeamCalendar([row({leave: '2000'}), row({}), row({mine: false}), row({item: '연차'})], now);
  assert.deepEqual(calendar.problems.map(x => x.state), ['miss']);
  assert.equal(calendar.byDate['20261109'].length, 3);
});

test('신청 종료 전에는 대기하며 자정을 넘긴 시간외도 종료 후 누락만 확인한다', () => {
  const overnight = row({appStart: '2200', appEnd: '0200'});
  assert.equal(classifyTeamRow(overnight, new Date('2026-11-10T01:59:00+09:00')).state, 'wait');
  assert.equal(classifyTeamRow(overnight, new Date('2026-11-10T02:00:00+09:00')).state, 'miss');
  assert.equal(classifyTeamRow({...overnight, leave: '2300'}, now).state, 'ok');
  for (const appEnd of ['', '2360', '2500']) assert.equal(classifyTeamRow(row({appEnd}), now).state, 'wait');
  for (const leave of ['2360', '2500', '0000', '2400']) {
    assert.equal(classifyTeamRow(row({leave}), now).state, 'wait');
    assert.equal(buildTeamCalendar([row({leave})], now).problems.length, 0);
  }
});

test('신청 현황에서 생성한 미조회 지문은 종료 후에도 누락으로 경고하지 않는다', () => {
  const planned = expandPlanned([{empCd: '1', atNm: '연장근무', startDt: '20261109', endDt: '20261109', startTm: '1800', endTm: '2100', approState: '1'}], {fromYmd: '20261109', toYmd: '20261109', todayYmd: '20261109', meCd: '1'});
  assert.equal(planned.length, 1);
  assert.equal(planned[0].fingerprintChecked, false);
  assert.equal(classifyTeamRow(planned[0], now).state, 'wait');
  assert.match(classifyTeamRow(planned[0], now).detail, /미조회/);
  assert.equal(buildTeamCalendar(planned, now).problems.length, 0);
});
