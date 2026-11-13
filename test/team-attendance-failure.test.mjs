import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const calendar = readFileSync(new URL('../src/live/wc/10-calendar-budget.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('../src/live/wc/29-home-view.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function failedTeam({attendanceFails = false, plannedFails = false} = {}) {
  const S = {cal: {offset: 0}, team: {}, view: 'home'};
  const context = {
    S, currentKey: 'tester', Date, Promise,
    allowed: () => true,
    GW: {
      teamAttendance: () => attendanceFails ? Promise.reject(new Error('근태 실패')) : Promise.resolve([]),
      teamPlanned: () => plannedFails ? Promise.reject(new Error('신청 실패')) : Promise.resolve({apps: [], me: 'tester'}),
    },
    R: {
      kstNow: () => ({date: '2026-11-14'}),
      appInfoIndex: () => ({}), expandPlanned: () => [], buildTeamCalendar: () => ({byDate: {}, depts: [], problems: []}),
    },
    logError: () => {}, renderMain: () => {},
  };
  vm.runInNewContext(calendar, context);
  context.ensureTeam('202611');
  await flush(); await flush();
  return S.team['202611'];
}

test('직원 근태 또는 신청 조회 실패는 빈 직원 달력으로 완료 처리하지 않는다', async () => {
  for (const failure of [{attendanceFails: true}, {plannedFails: true}]) {
    const team = await failedTeam(failure);
    assert.equal(team.busy, false);
    assert.equal(team.rows, null);
    assert.equal('cal' in team, false);
    assert.match(team.err, /실패/);
  }
});

test('직원 근태 오류는 홈 자리 비움 현황에서 조회 실패로 표시한다', () => {
  const context = {
    S: {a: {}, raw: {data: {schedule: {events: []}}}, team: {202611: {busy: false, rows: null, err: '신청 실패'}}, homeRes: {items: []}},
    Date, ensureTeam: () => {}, homeResEnsure: () => {}, logError: () => {},
    mineVisible: () => [], visibleActions: () => [], isMine: () => true, stateOf: () => '',
    esc: x => String(x),
    R: {
      kstNow: () => ({date: '2026-11-14'}),
      homeTiles: () => [{id: 'away', tone: 'normal', label: '자리 비움', value: '0', sub: '정상'}],
      homeNextAction: () => null, homeTimelineCompact: () => ({rows: [], more: 0}), homeAwayLine: () => '',
    },
  };
  vm.runInNewContext(home, context);
  const data = context.homeData();
  assert.equal(data.teamError, '신청 실패');
  assert.match(context.homeTopHtml(data), /조회 실패/);
  assert.match(context.homeDashHtml(data), /직원 근태를 조회하지 못해/);
});