import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const attendance = readFileSync(new URL('../src/live/wc/11-attendance.js', import.meta.url), 'utf8');
const overlays = readFileSync(new URL('../src/live/wc/15-overlays-palette-help-menus.js', import.meta.url), 'utf8');
const makeWeeklyCode = 'let weeklyRequestSeq = 0;\n' + overlays.slice(overlays.indexOf('  async function makeWeekly()'));

function attendanceHtml(history) {
  const S = {raw: {data: {attendance: {overtime: {me: 'me', apps: [], days: []}, today: {}, month: {}}, leave: {year: 2026, history}}}, att: {month: '202611', rows: [], day: '', error: false, busy: false}, a: {actions: [], today: {isWorkday: true}}};
  const ctx = {S, Date, WD: ['일', '월', '화', '수', '목', '금', '토'], today: () => '2026-11-14', esc: String, hm4: x => x || '', mins: x => String(x ?? ''), fmtDays: String, ymd8: x => String(x), pgh: () => '', ic: () => '', myAppInfos: () => [], appsReady: () => true, actionRow: () => '', R: {kstNow: () => ({y: 2026, m: 11, d: 14}), attendanceAnomalies: () => [], appInfoLine: () => ''}};
  vm.createContext(ctx); vm.runInContext(attendance + '\nthis.runAttendance = vAttendance;', ctx);
  return ctx.runAttendance();
}

test('approved multi-day leave marks every date, including dates without attendance rows', () => {
  const html = attendanceHtml([{approved: true, days: 3, start: '20261105', end: '20261107', kind: '연차'}]);
  for (const day of ['20261105', '20261106', '20261107']) assert.match(html, new RegExp(`<div class="c lv[^>]*data-v="${day}"[^>]*>[\\s\\S]*?<div class="muted" style="font-size:12px">휴가</div>`));
});

test('unapproved or malformed leave periods do not color unrelated calendar dates as approved leave', () => {
  const html = attendanceHtml([{approved: false, days: 3, start: '20261105', end: '20261107'}, {approved: true, days: 2, start: '20261109', end: '20261108'}]);
  assert.doesNotMatch(html, /class="c lv[^"]*"[^>]*data-v="20261106"/);
});

const deferred = () => { let resolve; return {promise: new Promise(r => { resolve = r; }), resolve}; };
function weeklyHarness({periods, submittedRange, routing} = {}) {
  const toasts = [], renders = [];
  const S = {weekly: '', settings: {}, raw: {principal: {name: '홍길동', deptName: '전략경영실'}}, view: 'report'};
  const ctx = {S, currentKey: 'u1', Date, Promise, confirm: () => true, askText: async () => periods.shift(), toast: x => toasts.push(x), renderMain: () => renders.push(true), saveLocal: () => true, loadRouting: routing, GW: {submittedRange}, R: {kstNow: () => ({y: 2026, m: 11, d: 14}), weeklyReport: ({from, to}) => `REPORT ${from}-${to}`}, routingFailedRecently: () => false};
  vm.createContext(ctx); vm.runInContext(makeWeeklyCode + '\nthis.runWeekly = makeWeekly;', ctx);
  return {S, ctx, toasts, renders};
}

test('weekly report names the actual cap and missing routing coverage instead of implying completeness', async () => {
  const h = weeklyHarness({periods: ['11/2~11/6'], submittedRange: async () => ({from: '20261102', to: '20261106', docs: Array.from({length: 100}, (_, i) => ({date: `202611${String((i % 5) + 2).padStart(2, '0')}`}))}), routing: async () => null});
  await h.ctx.runWeekly();
  assert.match(h.S.weekly, /^\[자료 범위: 상신 100건 \(최대 100건 조회\) · 접수 이력은 조회되지 않았거나 기간이 일부여서 접수 실적이 일부일 수 있음 · 원본과 대조 필요\]/);
  assert.match(h.S.weekly, /REPORT 20261102-20261106/);
});

test('a slower earlier weekly generation cannot overwrite the newer request', async () => {
  const first = deferred(), second = deferred(); let call = 0;
  const h = weeklyHarness({periods: ['11/2~11/6', '11/9~11/13'], submittedRange: () => (++call === 1 ? first.promise : second.promise), routing: async () => ({from: '20260101', to: '20261231', dept: []})});
  const oldRun = h.ctx.runWeekly(); await new Promise(resolve => setImmediate(resolve));
  const newRun = h.ctx.runWeekly(); await new Promise(resolve => setImmediate(resolve));
  second.resolve({from: '20261109', to: '20261113', docs: []}); await newRun;
  first.resolve({from: '20261102', to: '20261106', docs: []}); await oldRun;
  assert.match(h.S.weekly, /REPORT 20261109-20261113/);
  assert.doesNotMatch(h.S.weekly, /REPORT 20261102-20261106/);
  assert.equal(h.renders.length, 1);
});
