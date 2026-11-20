import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('../src/live/wc/10-calendar-budget.js', import.meta.url), 'utf8');
const panel = src.slice(src.indexOf('  const hasTarget'), src.indexOf('  function calendarItems()')) + src.slice(src.indexOf('  function teamDayPanel(items)'), src.indexOf('  // ----- 예산 집행'));
function render(day, entries, items, team) {
  const S = {cal: {day}, team: {'202611': team}, a: {actions: [{key: 'doc1'}]}};
  const ctx = {S, Date, WD: ['일', '월', '화', '수', '목', '금', '토'], teamCfg: () => S.cal, teamOf: () => entries, TEAM_STATE: {info: ['', '']}, esc: s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')};
  vm.createContext(ctx); vm.runInContext(panel + '; this.run=teamDayPanel;', ctx); return ctx.run(items);
}
test('날짜 패널은 그날 일정의 시간·장소·참석자와 직원 근태를 모두 보여 준다', () => {
  const html = render('20261117', [{kind: 'trip', name: '직원', dept: '부서', label: '출장', detail: '09:00 장소'}],
    [{date: '2026-11-17', tag: '기한', text: '<제목>', key: 'doc1'}, {date: '2026-11-17', tag: '운영회의', text: '14:00 회의', title: '회의', when: '14:00 ~ 15:30', place: '3층 회의실', people: '가나다'}, {date: '2026-11-18', tag: '기한', text: '다른 날'}], {cal: {}});
  assert.match(html, /표시 중인 내역 3건/); assert.match(html, /&lt;제목&gt;/); assert.match(html, /data-act="calItem"/);
  assert.match(html, /14:00 ~ 15:30/); assert.match(html, /3층 회의실/); assert.match(html, /가나다/); assert.match(html, /09:00 장소/); assert.doesNotMatch(html, /다른 날/);
  assert.equal((html.match(/data-act="calItem"/g) || []).length, 1, '연결 대상이 없는 일정은 링크로 만들지 않는다');
});
test('내역 없음과 직원 근태 조회 실패를 구분한다', () => {
  assert.match(render('20261101', [], [], {cal: {}}), /표시할 내역이 없습니다/);
  const failed = render('20261101', [], [], {err: 'offline'}); assert.match(failed, /직원 근태를 읽지 못했습니다/); assert.doesNotMatch(failed, /표시할 내역이 없습니다/);
});
test('달력 칸·칩·다음 일정은 날짜 상세로 연결된다', () => {
  assert.match(src, /data-drop-date="\$\{iso\}" data-act="calDay" data-v="\$\{d8\}"/);
  assert.match(src, /data-act="\$\{hasTarget\(it\) \? 'calItem' : 'calDay'\}"/);
  assert.match(readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8'), /case 'calPrev': S\.cal\.offset--; teamCfg\(\)\.day = ''/);
});
