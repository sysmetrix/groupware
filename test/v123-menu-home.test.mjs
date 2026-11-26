// v1.23 메뉴 통폐합·홈 리뉴얼: 핵심 4(할 일·일정·예약·근태·연차·예산 집행) 중심 메뉴, 할 일 한 목록, 홈 '오늘 현황'과 맨 아래 비서 대화
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as home from '../src/live/home-model.mjs';

const read = f => readFileSync(new URL('../src/live/' + f, import.meta.url), 'utf8');

test('예산 한 줄: 수집기가 읽은 관심 사업 합계만 쓰고, 실패한 사업은 합계에서 빼고 따로 센다', () => {
  assert.match(home.homeBudgetLine([], 90).text, /관심 사업을 정하면/);
  const ok = {project: 'A1', rows: [{budget: 1000, executed: 400}]}, ok2 = {project: 'A2', rows: [{budget: 1000, executed: 100}]};
  const r = home.homeBudgetLine([ok, ok2], 90.4);
  assert.equal(r.rate, 25);
  assert.equal(r.text, '관심 사업 2개 집행률 25% · 올해 경과 90.4%');
  const f = home.homeBudgetLine([ok, {project: 'B', error: true, message: 'x'}], null);
  assert.equal(f.text, '관심 사업 1개 집행률 40% · 1개 조회 실패');
  assert.equal(f.tone, 'warn');
  assert.match(home.homeBudgetLine([{project: 'B', error: true}]).text, /모두 조회 실패/);
});

test('근태 한 줄: 확인하지 못한 값은 확인 불가로 남기고, 근무일이 아니면 출퇴근을 말하지 않는다', () => {
  // v1.25: 출근 지문이 없으면 말하지 않고, 출근 뒤 지난 시간은 nowMin으로 센다(홈에서 30초마다 다시 셈)
  assert.equal(home.homeAttendanceLine({come: '08:52', leave: '', remaining: '6일', check: 0, nowMin: 14 * 60 + 2}).text, '출근 08:52 · 출근 후 5시간 10분 · 남은 연차 6일');
  assert.equal(home.homeAttendanceLine({come: '08:52', leave: '', remaining: '6일'}).live, true);
  assert.equal(home.homeAttendanceLine({come: '', leave: '', remaining: '6일', nowMin: 600}).text, '남은 연차 6일', '출근 기록 없음은 쓰지 않는다');
  assert.equal(home.homeAttendanceLine({come: '08:50', leave: '18:20', remaining: null}).text, '출근 08:50 · 퇴근 18:20 · 출근부터 9시간 30분');
  assert.equal(home.homeAttendanceLine({error: true, remaining: ''}).text, '오늘 출퇴근 기록 확인 불가 · 남은 연차 확인 불가');
  const w = home.homeAttendanceLine({workday: false, remaining: '3일', check: 2});
  assert.equal(w.text, '오늘은 근무일이 아닙니다 · 남은 연차 3일 · 확인할 근태 2건');
  assert.equal(w.tone, 'todo');
});

test('홈: 먼저 할 일 → 오늘 현황(핵심 4 줄) | 오른쪽 일정·참고, 비서 대화는 맨 아래', () => {
  const hv = read('wc/29-home-view.js');
  const vHome = hv.slice(hv.indexOf('function vHome()'), hv.indexOf('function homeReplaceHtml'));
  assert.ok(vHome.indexOf('hm3-grid') < vHome.indexOf('hm3-chat'), '대화는 현황·일정 묶음 뒤에 온다');
  assert.ok(vHome.indexOf('hm3-rail') < vHome.indexOf('chatView()'));
  assert.doesNotMatch(vHome, /class="desk-start"|data-act="quickDraft"/, '바로 시작 버튼 묶음은 핵심 4 줄의 주 동작으로 옮겼다');
  assert.doesNotMatch(hv, /R\.homeTiles\(/, '숫자 타일은 쓰지 않는다');
  for (const [v, act] of [['todo', 'data-act="homeOpenToday"'], ['schedule', 'data-v="reserve"'], ['leave', 'data-act="quickAtt" data-t="leave"'], ['budget', 'data-act="openPay"']]) {
    assert.match(hv, new RegExp(`row\\('${v}'`), v + ' 줄');
    assert.ok(hv.includes(act), v + ' 주 동작');
  }
  // 남은 연차는 근태 줄로, 부서 참고는 할 일로 옮겨 오른쪽에서 뺐다(숫자는 한 번만)
  const dash = hv.slice(hv.indexOf('function homeDashHtml'), hv.indexOf('function homeRiskSig'));
  assert.doesNotMatch(dash, /남은 연차 합계|sig\('ref'/);
  assert.match(dash, /autoList\(\)\.length \? autoCardHtml\(\)/, '자동화는 만든 것이 있을 때만 홈에 보인다');
  assert.match(read('wc/12-report-settings.js'), /set-auto">\$\{autoCardHtml\(\)\}/, '자동화 관리는 설정에 있다');
  assert.match(hv, /HOME_ACTS\.calReserve = /);
  assert.match(hv, /v === 'reserve'\) \{ if \(go\('resource'\) === false\)/);
});

test('할 일 한 목록: 출처 눌림 버튼(전체·그룹웨어·개인), 건수는 출처별로 따로', () => {
  const today = read('wc/06-today.js');
  assert.match(today, /\[\['all', '전체'\], \['gw', '그룹웨어'\], \['mine', '개인'\]\]/);
  assert.match(today, /function todayAllRows\(all, lvl, gaps\)/);
  assert.match(today, /개인 ToDo · 내일 이후·기한 없음/);
  assert.match(today, /if \(S\.todoSrc === 'gw' && \(S\.todayTab \|\| 'mine'\) === 'ref'\)/, '부서 참고는 그룹웨어 보기에서만');
  assert.match(read('wc/51-todo.js'), /typeof todoSrcSeg === 'function' \? `<div class="bar">\$\{todoSrcSeg\(\)\}<\/div>`/);
  assert.match(read('wc/55-todo-views.js'), /HOME_ACTS\.todoSrc = \(el, v\) => \{\n    if \(v === 'mine'\) \{ go\('mytodo'\); return; \}/);
  assert.match(read('wc/16-events.js'), /case 'todoSrc': case 'calReserve':/);
});

test('메뉴 안 탭: 결재·메일 / 찾기 / 설정 > 구글 연동, 달력 출처는 같은 탭 안 눌림 버튼', () => {
  const v = read('wc/05-views.js');
  assert.match(v, /tab\('approval', '결재·문서유통'\)\}\$\{tab\('mail', '메일'\)\}\$\{tab\('notifications', '알림'\)\}/);
  assert.match(v, /tab\('search', '통합검색'\)\}\$\{tab\('docs', '결재문서 \(기안·접수·발송\)'\)\}\$\{tab\('people', '사람·조직'\)\}/);
  assert.match(v, /p === 'settings' && allowed\('googleCalendar'\)/);
  assert.match(v, /tabOf\(\['calendar', 'gcal'\], '달력'\)/);
  assert.match(v, /aria-label="달력 출처"/);
  // 결재·메일 메뉴 숫자: 결재 대기와 안 읽은 메일(조회분)을 따로 쓴다
  assert.match(v, /'결재 ' \+ ap/);
  assert.match(v, /'메일 ' \+ ml/);
});

test('일정·근태·예산 다음 단계: 달력 → 자원 예약, 근태 신청 준비, 증빙 → 지출결의 준비', () => {
  assert.match(read('wc/10-calendar-budget.js'), /data-act="calReserve"[^`]*이 날 자원 예약/);
  const att = read('wc/11-attendance.js');
  assert.match(att, /aria-label="근태 신청 준비"/);
  for (const t of ['leave', 'trip', 'overtime']) assert.match(att, new RegExp(`\\['${t}', `));
  for (const f of ['wc/56-budget-card.js', 'wc/58-budget-etax.js']) assert.match(read(f), /data-act="openPay"[^>]*>\$\{ic\('wallet'\)\}지출결의 준비/);
});
