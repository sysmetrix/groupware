import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as model from '../src/live/home-model.mjs';
const home = readFileSync(new URL('../src/live/wc/29-home-view.js', import.meta.url), 'utf8');
function setup(overrides = {}) {
  const S = {a: {failed: [], approval: {lists: {submitted: {docs: []}}, inProgress: [{}, {}]}}, raw: {data: {schedule: {start: '20261114', end: '20261130', events: [], holidays: []}}, status: {}}, team: {202611: {busy: false, cal: {byDate: {}, depts: []}}}, homeRes: {day: '20261114', items: [], busy: false, partial: false}, ...overrides};
  const c = {S, Date, fmtDays: x => String(x) + '일', ensureTeam() {}, homeResEnsure() {}, logError() {}, mineVisible: () => [], visibleActions: () => [], isMine: () => true, stateOf: x => x.state, esc: x => String(x), STATE_NAME: {}, R: {...model, kstNow: () => ({date:'2026-11-14'}), teamHomeSummary: () => ({leave: [], trip: []})}, go: v => {S.view = v;}};
  vm.runInNewContext(home + '\nthis.acts = HOME_ACTS;', c); return c;
}
test('대기 항목은 상신문서로 단정하지 않고 기존 대기 필터로 연결된다', () => {
  const c=setup(); c.S.filter={}; c.visibleActions=() => [{state:'wait'}, {state:'wait'}, {state:'todo'}]; const d=c.homeData(); assert.equal(d.wait, 2); assert.match(c.homeTopHtml(d), /기다리는 중/); c.acts.homeTile(null,'wait'); assert.equal(c.S.view,'today'); assert.equal(c.S.filter.level,'wait');
});
test('상신 조회 실패와 일부 자료 실패가 0건 확정으로 보이지 않는다', () => {
  const c=setup(); c.S.a.approval.lists.submitted.error='실패'; c.S.raw.status.mail={ok:false}; const d=c.homeData(); const h=c.homeTopHtml(d); assert.match(h,/일부 자료 누락 가능/); assert.match(h,/전체 할 일을 확인할 수 없습니다/); assert.match(c.homeHeadHtml(d),/불완전/);
});
test('근태 오류나 미조회, 예약 조회 중·실패·범위 제한을 구분한다', () => {
  const c=setup(); c.S.team['202611']={busy:false,err:'실패',cal:{byDate:{},depts:[]}}; c.S.homeRes={day:'20261114',busy:true,items:[{start:'202611140900',end:'202611141000',label:'오래된 예약'}]}; let d=c.homeData(); let html=c.homeDashHtml(d); assert.match(html,/직원 근태를 조회하지 못해/); assert.match(html,/자원 예약을 확인하는 중/); assert.doesNotMatch(html,/오래된 예약/); c.S.homeRes={day:'20261114',err:'실패',items:[]}; assert.match(c.homeDashHtml(c.homeData()),/자원 예약을 조회하지 못했습니다/); c.S.homeRes={day:'20261114',items:[],partial:true}; assert.match(c.homeDashHtml(c.homeData()),/일부 자원만 조회/); c.S.homeRes={day:'20261113',items:[]}; assert.match(c.homeDashHtml(c.homeData()),/조회 여부를 확인할 수 없습니다/);
});
test('일정 오류와 미확인 휴일을 과신하지 않는다', () => {
  const c=setup(); c.S.raw.status.schedule={ok:false}; c.S.raw.data.schedule.holidays=[{date:'20261114',title:'휴일 기록'}]; let d=c.homeData(); let h=c.homeDashHtml(d); assert.match(h,/일정 조회 또는 오늘 날짜 범위/); assert.doesNotMatch(h,/휴일 기록/); delete c.S.raw.status.schedule; d=c.homeData(); h=c.homeDashHtml(d); assert.match(h,/근무 여부는 별도 확인/); assert.doesNotMatch(h,/모두 근무/); assert.match(model.homeTiles({away:0})[4].sub,/조회된 부재 신청 없음/);
});
test('초기 자료 조회 실패를 무한 로딩으로 보이지 않는다', () => { const c=setup({a:null,raw:null,error:'실패'}); const d=c.homeData(); assert.match(c.homeTopHtml(d),/읽지 못했습니다/); assert.match(c.homeHeadHtml(d),/읽지 못했습니다/); });

test('다른 직원 자원 예약은 개인 일정 건수에서 제외하고 별도 표시한다', () => { const c=setup(); c.S.homeRes.items=[{start:'202611140900',end:'202611141000',label:'회의실 김직원'}]; const d=c.homeData(); assert.equal(d.events.length,0); assert.equal(d.resources.length,1); const html=c.homeDashHtml(d); assert.ok(html.indexOf('오늘 자원 예약 (직원 전체)') < html.indexOf('회의실 김직원')); });

test('홈 메일·연차 신호는 조회 범위와 실패를 구분하고 대상 화면으로 이동한다', () => {
 const c=setup(); c.S.raw.data.mail={inbox:{records:[{seen:false},{seen:true}]},otherUnseen:[{seen:false}]}; c.S.raw.data.leave={remaining:6};
 let d=c.homeData(); assert.equal(d.unread,2); assert.equal(d.leave,'6일'); assert.match(c.homeDashHtml(d),/안 읽은 메일<\/span><b class="hm-sig-v">조회분 2건/);
 c.acts.homeTile(null,'mail'); assert.equal(c.S.view,'mail'); c.acts.homeTile(null,'leave'); assert.equal(c.S.view,'attendance'); c.S.filter={}; c.acts.homeTile(null,'ref'); assert.equal(c.S.todayTab,'ref'); assert.equal(c.S.view,'today');
 c.S.raw.status.mail={ok:false}; c.S.raw.status.leave={error:'failed'}; d=c.homeData(); assert.equal(d.unread,null); assert.equal(d.leave,''); assert.match(c.homeDashHtml(d),/안 읽은 메일<\/span><b class="hm-sig-v">확인 불가/);
});
