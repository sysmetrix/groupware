import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const attendance = readFileSync(new URL('../src/live/wc/11-attendance.js', import.meta.url), 'utf8');
const overlays = readFileSync(new URL('../src/live/wc/15-overlays-palette-help-menus.js', import.meta.url), 'utf8');
const report = readFileSync(new URL('../src/live/wc/12-report-settings.js', import.meta.url), 'utf8');
const reportTimeCode = report.slice(report.indexOf('  function reportCollectedAt'), report.indexOf('  function briefCoverage'));
const makeWeeklyCode = reportTimeCode + 'let report;\n' + overlays.slice(overlays.indexOf('  function reportRange('));

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
function weeklyHarness({submittedRange, routing = async () => null, weekly = '', backup = true, save = true} = {}) {
  const toasts = [], renders = [], recovered = [];
  const S = {weekly, settings: {}, raw: {principal: {name: '홍길동', deptName: '전략경영실'}}, view: 'report'};
  const ctx = {S, currentKey: 'u1', getUserKey: () => ctx.currentKey, root: {querySelector: () => null}, $: () => null,
    Date, Promise, confirm: () => true, toast: x => toasts.push(x), renderMain: () => renders.push(true), saveLocal: () => save,
    store: {set: (k,v) => { if (backup) recovered.push(v.text); return backup; }}, loadRouting: routing, GW: {submittedRange},
    R: {kstNow: () => ({y: 2026, m: 11, d: 14}), weeklyReport: ({from,to}) => 'REPORT ' + from + '-' + to}, routingFailedRecently: () => false};
  vm.createContext(ctx); vm.runInContext(makeWeeklyCode + '\nObject.assign(this, {runWeekly: makeWeekly, reportState, reportRange});', ctx);
  ctx.reportState().range = {from: '2026-11-02', to: '2026-11-06'};
  return {S, ctx, toasts, renders, recovered};
}

test('weekly report names the actual cap and missing routing coverage instead of implying completeness', async () => {
  const h = weeklyHarness({submittedRange: async () => ({from: '20261102', to: '20261106', docs: Array.from({length: 100}, (_, i) => ({date: `202611${String((i % 5) + 2).padStart(2, '0')}`}))}), routing: async () => null});
  await h.ctx.runWeekly();
  assert.match(h.S.weekly, /^\[자료 범위: 상신 100건 \(최대 100건 조회\) · 접수 이력은 조회되지 않았거나 기간이 일부여서 접수 실적이 일부일 수 있음 · 원본과 대조 필요\]/);
  assert.match(h.S.weekly, /REPORT 20261102-20261106/);
});

test('preset periods are based on the KST calendar, and invalid and future dates stay local', async () => {
  const h = weeklyHarness({submittedRange: () => assert.fail('must not query')});
  assert.equal(h.ctx.reportRange('week').from, '2026-11-09');
  assert.equal(h.ctx.reportRange('last').to, '2026-11-06');
  h.ctx.reportState().range = {from: '2026-11-31', to: '2026-11-05'};
  await h.ctx.runWeekly();
  assert.match(h.ctx.reportState().note, /날짜 순서/);
  h.ctx.reportState().range = {from: '2026-11-13', to: '2026-11-15'};
  await h.ctx.runWeekly();
  assert.match(h.ctx.reportState().note, /오늘까지/);
});

test('an in-flight request cannot replace edits, duplicate requests, or cross an account switch', async () => {
  for (const switched of [false, true]) {
    const pending = deferred(); let calls = 0;
    const h = weeklyHarness({weekly: '기존', submittedRange: () => { calls++; return pending.promise; }});
    const work = h.ctx.runWeekly();
    await h.ctx.runWeekly();
    if (switched) h.ctx.currentKey = 'u2'; else h.S.weekly = '편집 중';
    pending.resolve({from: '20261102', to: '20261106', docs: []}); await work;
    assert.equal(calls, 1);
    assert.equal(h.S.weekly, switched ? '기존' : '편집 중');
    assert.equal(h.recovered.length, 0);
  }
});

test('successful generation retains a recovery copy, and a failed backup or save preserves the draft', async () => {
  for (const [backup, save] of [[true,true],[false,true],[true,false]]) {
    const h = weeklyHarness({weekly: '기존', backup, save, submittedRange: async () => ({from: '20261102', to: '20261106', docs: []})});
    await h.ctx.runWeekly();
    assert.deepEqual(h.recovered, backup ? ['기존'] : []);
    if (backup && save) assert.match(h.S.weekly, /REPORT 20261102-20261106/);
    else assert.equal(h.S.weekly, '기존');
  }
});
