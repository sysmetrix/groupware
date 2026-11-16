// 수집 자료 모양 검사: 그룹웨어가 바뀌어 조회는 성공인데 값이 빈 줄이 들어오는 경우를 알아챈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {contractCheck, contractMessage, CONTRACT_AREA_LABEL} from '../src/live/contract.mjs';

const mails = n => Array.from({length: n}, (_, i) => ({uid: String(100 + i), subject: `제목 ${i}`, date: '2026-11-16 09:00', from: '보낸이'}));
const docs = n => Array.from({length: n}, (_, i) => ({docId: String(i + 1), title: `문서 ${i}`, date: '2026-11-16'}));
const healthy = () => ({
  status: {mail: {ok: true}, approval: {ok: true}, notice: {ok: true}, schedule: {ok: true}, attendance: {ok: true}, leave: {ok: true}, budget: {ok: true}, alerts: {ok: true}},
  data: {
    mail: {boxes: [{name: 'INBOX'}], inbox: {total: 5, records: mails(5)}},
    approval: {lists: {pending: {label: '결재할 문서', total: 4, docs: docs(4)}, viewing: {label: '열람', total: 0, docs: []}}},
    notice: {total: 3, articles: [1, 2, 3].map(i => ({id: String(i), title: `공지 ${i}`, date: '2026-11-15'}))},
    schedule: {events: [1, 2, 3].map(i => ({id: String(i), title: `일정 ${i}`, start: '202611161000'}))},
    attendance: {today: {date: '20261116'}, month: {recognizedMin: 600, basicMin: 600, overtimeMin: 0, error: ''}},
    leave: {granted: 15, used: 3, remaining: 12, history: [1, 2, 3].map(i => ({start: `2026030${i}`, kind: '연차'}))},
    budget: {projects: [{project: 'P1', label: '사업 하나', rowCount: 3, rows: [1, 2, 3].map(i => ({code: `C${i}`, name: `과목 ${i}`, budget: 1000, executed: 100 * i, balance: 1000 - 100 * i}))}]},
    alerts: {alerts: [1, 2, 3].map(i => ({title: `알림 ${i}`}))},
  },
});

test('a normal snapshot passes with no issues', () => {
  const r = contractCheck(healthy());
  assert.deepEqual(r, {ok: true, issues: [], areas: []});
  assert.equal(contractMessage(r), '');
});

test('the built-in demo data passes, so the check does not cry wolf on realistic data', async () => {
  const src = await fs.readFile(new URL('../src/live/demo/demo-collector.browser.js', import.meta.url), 'utf8');
  const store = new Map();
  const ctx = {window: {}, console, performance: {now: () => 0}, setTimeout, clearTimeout, Date, Math, JSON, URL, URLSearchParams, location: {origin: 'http://127.0.0.1:3220', href: 'http://127.0.0.1:3220/'},
    sessionStorage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)}, localStorage: {getItem: () => null, setItem() {}, removeItem() {}}};
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.runInNewContext(src.replace('/*@DEMO_VERSION@*/', '0.0.0'), ctx);
  const raw = await ctx.BWYFGW.collect({budget: ctx.BWYFGW.defaults && ctx.BWYFGW.defaults.budget});
  const r = contractCheck(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(r.issues, []);
});

test('renamed fields show up as mostly-empty values in that area only', () => {
  const raw = healthy();
  raw.data.mail.inbox.records = raw.data.mail.inbox.records.map(m => ({...m, subject: ''}));
  const r = contractCheck(raw);
  assert.equal(r.ok, false);
  assert.deepEqual(r.areas, ['mail']);
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].field, 'subject');
  assert.match(contractMessage(r), /^그룹웨어 화면이 바뀐 것으로 보입니다\. 메일 자료가/);
});

test('a few empty values are normal and do not raise an issue', () => {
  const raw = healthy();
  raw.data.mail.inbox.records[0].subject = '';
  raw.data.mail.inbox.records[1].subject = '';
  assert.equal(contractCheck(raw).ok, true, '2 of 5 is below the threshold');
  raw.data.notice.articles = [{id: '', title: '', date: ''}];
  assert.equal(contractCheck(raw).ok, true, 'too few rows to judge');
});

test('the server says there are items but none were read: the list key probably changed', () => {
  const raw = healthy();
  raw.data.approval.lists.pending.docs = [];
  raw.data.notice.articles = [];
  const r = contractCheck(raw);
  assert.deepEqual(r.areas, ['approval', 'notice']);
  assert.ok(r.issues.every(i => i.kind === 'empty-list'));
});

test('areas whose query already failed are left to the existing failure notice', () => {
  const raw = healthy();
  raw.status.mail = {ok: false, error: 'TIMEOUT'};
  raw.data.mail = {boxes: [], inbox: {total: 9, records: []}};
  raw.data.approval.lists.pending = {label: '결재할 문서', error: 'API_ERROR', docs: []};
  assert.equal(contractCheck(raw).ok, true);
});

test('numbers that turned into blanks or zeros are caught for leave, attendance and budget', () => {
  const raw = healthy();
  raw.data.leave.granted = NaN;
  raw.data.attendance.today.date = '';
  raw.data.attendance.month = {recognizedMin: null, basicMin: null, overtimeMin: null, error: ''};
  raw.data.budget.projects[0].rows = raw.data.budget.projects[0].rows.map(r => ({...r, budget: 0, executed: 0, balance: 0}));
  raw.data.schedule.events = raw.data.schedule.events.map(e => ({...e, start: '2026-11-16T10:00'}));
  const r = contractCheck(raw);
  assert.deepEqual(r.areas.sort(), ['attendance', 'budget', 'leave', 'schedule']);
  assert.equal(r.issues.filter(i => i.area === 'attendance').length, 2);
});

test('odd inputs never throw', () => {
  for (const bad of [null, undefined, {}, {data: null}, {data: {mail: null, approval: {lists: null}, budget: {projects: 'x'}, leave: {}}}, 'text', 42]) assert.doesNotThrow(() => contractCheck(bad));
  assert.equal(contractMessage(null), '');
  assert.equal(contractCheck({data: {budget: {skipped: true, projects: []}}}).ok, true);
  assert.equal(Object.keys(CONTRACT_AREA_LABEL).length, 8);
});
