// 사용 기록: 이름과 횟수만 세고, 그 밖의 글자는 한 글자도 남기지 않는다는 약속.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {usageBump, usageNormalize, usageSummary, usageReport, usageDay, USAGE_KEEP_DAYS, USAGE_JOURNEYS} from '../src/live/usage.mjs';

const T0 = Date.parse('2026-11-16T01:00:00Z'); // 한국 시간 11-16 10:00

test('usageDay uses Korean time, so late evening UTC is already the next day', () => {
  assert.equal(usageDay(Date.parse('2026-11-16T14:59:00Z')), '2026-11-16');
  assert.equal(usageDay(Date.parse('2026-11-16T15:00:00Z')), '2026-11-17');
});

test('usageBump counts per day and kind without changing the log it was given', () => {
  const a = usageBump(null, 'view', 'home', T0);
  const b = usageBump(a, 'view', 'home', T0);
  const c = usageBump(b, 'act', 'chatSend', T0 + 86400000);
  assert.deepEqual(a, {v: 1, days: {'2026-11-16': {view: {home: 1}}}});
  assert.equal(b.days['2026-11-16'].view.home, 2);
  assert.equal(a.days['2026-11-16'].view.home, 1, 'the earlier log is untouched');
  assert.deepEqual(c.days['2026-11-17'], {act: {chatSend: 1}});
});

test('only code-defined names are stored: titles, names, sentences and unknown kinds are dropped', () => {
  let log = null;
  for (const bad of ['한지우 팀장', '결과보고 기안', 'a b', 'x'.repeat(41), '', '<script>', '2026-11-16', 'mail:123', 'get_budget:error', null, undefined, 42]) log = usageBump(log, 'tool', bad, T0);
  log = usageBump(log, 'secret', 'home', T0);
  assert.deepEqual(log, {v: 1, days: {}});
  log = usageBump(log, 'tool', 'get_budget:err', T0);
  assert.deepEqual(log.days['2026-11-16'], {tool: {'get_budget:err': 1}});
});

test('a damaged or tampered stored value is cleaned instead of trusted', () => {
  const dirty = {days: {'2026-11-16': {view: {home: 3, '이름 있는 키': 5, ok_key: -1, big: 1e99}, memo: {x: 1}}, 'not-a-day': {view: {home: 1}}, '2026-11-15': 'text'}, extra: '본문'};
  assert.deepEqual(usageNormalize(dirty), {v: 1, days: {'2026-11-16': {view: {home: 3, big: 1e6}}}});
  assert.deepEqual(usageNormalize('garbage'), {v: 1, days: {}});
  assert.deepEqual(usageNormalize(null), {v: 1, days: {}});
});

test('days older than the keep window are removed on the next write', () => {
  let log = usageBump(null, 'view', 'home', T0 - (USAGE_KEEP_DAYS + 1) * 86400000);
  log = usageBump(log, 'view', 'mail', T0 - USAGE_KEEP_DAYS * 86400000);
  log = usageBump(log, 'view', 'today', T0);
  assert.deepEqual(Object.keys(log.days).sort(), [usageDay(T0 - USAGE_KEEP_DAYS * 86400000), '2026-11-16']);
});

test('one day cannot grow without bound', () => {
  let log = null;
  for (let i = 0; i < 450; i++) log = usageBump(log, 'act', 'k' + i, T0);
  assert.equal(Object.keys(log.days['2026-11-16'].act).length, 400);
  log = usageBump(log, 'act', 'k0', T0);
  assert.equal(log.days['2026-11-16'].act.k0, 2, 'existing names still count');
});

test('usageSummary ranks, adds up the core journeys and lists screens never opened', () => {
  let log = null;
  const add = (kind, key, n, at = T0) => { for (let i = 0; i < n; i++) log = usageBump(log, kind, key, at); };
  add('view', 'home', 5); add('view', 'approval', 3); add('view', 'budget', 1, T0 - 86400000);
  add('act', 'focusStart', 2); add('act', 'chatSend', 4); add('act', 'quickAtt', 1);
  add('tool', 'get_budget', 2); add('toolAi', 'get_budget', 1); add('tool', 'prepare_leave_request', 1); add('tool', 'get_schedule:err', 1);
  add('view', 'mail', 9, T0 - 40 * 86400000); // 기간 밖
  const s = usageSummary(log, {now: T0, days: 28, views: ['home', 'approval', 'budget', 'mail', 'people']});
  assert.equal(s.from, '2026-10-20'); assert.equal(s.to, '2026-11-16'); assert.equal(s.activeDays, 2);
  assert.deepEqual(s.views, [['home', 5], ['approval', 3], ['budget', 1]]);
  assert.deepEqual(s.unusedViews, ['mail', 'people']);
  assert.deepEqual(s.chat, {local: 4, ai: 1});
  assert.deepEqual(s.toolErrors, [['get_schedule:err', 1]]);
  const j = Object.fromEntries(s.journeys.map(x => [x.id, x.total]));
  assert.deepEqual(j, {approval: 5, attendance: 2, draft: 0, budget: 4, chat: 8});
  assert.equal(USAGE_JOURNEYS.length, 5);
});

test('usageReport is readable text that carries no error message bodies', () => {
  let log = usageBump(null, 'view', 'home', T0);
  const text = usageReport(log, {now: T0, days: 28, views: ['home', 'mail'], version: '0.78.0', errors: [
    {at: T0 - 1000, where: '자료 읽기', msg: '한지우 팀장 결재문서 본문을 읽지 못함'},
    {at: T0 - 2000, where: '자료 읽기', msg: 'x'},
    {at: T0 - 90 * 86400000, where: '오래된 것', msg: 'y'},
  ]});
  assert.match(text, /^# GW 비서 사용 기록 2026-10-20 ~ 2026-11-16/);
  assert.match(text, /버전 0\.78\.0 · 쓴 날 1일/);
  assert.match(text, /- home: 1/);
  assert.match(text, /- mail\n/, 'never-opened screens are listed');
  assert.match(text, /- 자료 읽기: 2/);
  assert.ok(!text.includes('한지우') && !text.includes('본문을'), 'error messages are counted by place, never copied');
  assert.ok(!text.includes('오래된 것'));
});

test('the screen code only ever passes names: view ids, data-act names and tool names', async () => {
  const read = f => fs.readFile(new URL('../src/live/wc/' + f, import.meta.url), 'utf8');
  const calls = [];
  for (const f of ['16-events.js', '31-chat-engine.js', '40-usage.js']) for (const m of (await read(f)).matchAll(/usageNote\(([^;]*?)\);/g)) calls.push(m[1]);
  assert.deepEqual(calls.filter(x => !x.startsWith('kind')).sort(), ["'act', act", "'view', S.view", "ctx.viaAi ? 'toolAi' : 'tool', name + (res.ok ? '' : ':err')"]);
  const usage = await read('40-usage.js');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(usage), 'the usage log is never sent anywhere');
});
