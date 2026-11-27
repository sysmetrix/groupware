// 사용 기록 보고서: 지어낸 기록으로 메뉴 묶기, 기간 자르기, 오류율, 0회 후보, 합치기, 깨진 입력을 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildUsageReport, codeNames, formatUsageReport, parseUsageInput} from '../scripts/lib/usage-report.mjs';
import {loadWc, analyze} from '../scripts/lib/wc-analyze.mjs';
import {usageReport} from '../src/live/usage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.parse('2026-11-26T03:00:00Z'); // 한국 시간 11-26

const NAMES = {
  views: [['home', '홈'], ['today', '할 일'], ['calendar', '일정·예약'], ['attendance', '근태·연차'], ['budget', '예산 집행'], ['approval', '결재·메일'], ['search', '찾기'], ['report', '보고'], ['settings', '설정'], ['mail', '메일'], ['board', '보드'], ['resource', '자원 예약']].map(([id, label]) => ({id, label})),
  viewParent: {mail: 'approval', board: 'today', resource: 'calendar'},
  acts: ['chatSend', 'ledger', 'tdAdd'], uncountedActs: [],
  tools: ['add_todo', 'get_budget', 'list_mail'], aiOnly: ['vision'],
};
const logOf = days => parseUsageInput(JSON.stringify({v: 1, days}));
const report = (sources, opt) => buildUsageReport(sources, NAMES, {now: NOW, ...opt});
const menuOf = (r, id) => r.menus.find(m => m.id === id);

test('old view ids are grouped under their parent menu, with counts, share and days used', () => {
  const r = report([logOf({
    '2026-11-25': {view: {board: 2, today: 1, mail: 1}},
    '2026-11-26': {view: {board: 1, resource: 3}},
  })]);
  assert.deepEqual(r.menus.map(m => m.id), ['today', 'calendar', 'attendance', 'budget', 'approval', 'search', 'report', 'settings', 'home']);
  assert.deepEqual([menuOf(r, 'today').count, menuOf(r, 'today').days, menuOf(r, 'today').share], [4, 2, 0.5]);
  assert.deepEqual([menuOf(r, 'calendar').count, menuOf(r, 'calendar').days], [3, 1]);
  assert.equal(menuOf(r, 'approval').count, 1);
  assert.equal(menuOf(r, 'budget').count, 0);
});

test('only days inside the period are counted, 28 days by default', () => {
  const src = logOf({
    '2026-10-29': {view: {budget: 100}}, // 29일 전: 밖
    '2026-10-30': {view: {budget: 1}}, // 28일째: 안
    '2026-11-26': {view: {budget: 2}},
    '2026-11-27': {view: {budget: 50}}, // 미래: 밖
  });
  assert.deepEqual([report([src]).from, menuOf(report([src]), 'budget').count], ['2026-10-30', 3]);
  assert.equal(menuOf(report([src], {days: 7}), 'budget').count, 2);
  assert.equal(menuOf(report([src], {days: 29}), 'budget').count, 103);
});

test('error rate compares failures with successes of the same name and kind', () => {
  const r = report([logOf({'2026-11-26': {tool: {get_budget: 3, 'get_budget:err': 1, 'list_mail:err': 2}, toolAi: {get_budget: 4}}})]);
  assert.deepEqual(r.errors, [
    {kind: 'tool', name: 'list_mail', errors: 2, ok: 0, rate: 1},
    {kind: 'tool', name: 'get_budget', errors: 1, ok: 3, rate: 0.25},
  ]);
  assert.deepEqual(r.tools.local, [['get_budget', 3]]);
  assert.deepEqual(r.tools.ai, [['get_budget', 4]]);
  assert.deepEqual([r.tools.chat.local, r.tools.chat.ai], [6, 4]);
});

test('freeze candidates are code names with zero use; a failed attempt still counts as use', () => {
  const r = report([logOf({'2026-11-26': {view: {board: 1}, act: {chatSend: 1, oldButton: 2}, tool: {'list_mail:err': 1}, toolAi: {vision: 1}}, '2026-09-01': {act: {ledger: 9}}})]);
  assert.deepEqual(r.freeze.acts, ['ledger', 'tdAdd']);
  assert.deepEqual(r.freeze.tools, ['add_todo', 'get_budget']);
  assert.ok(r.freeze.views.includes('today') && !r.freeze.views.includes('board'));
  assert.deepEqual(r.unknown, {views: 0, acts: 1, tools: 0});
});

test('several files are added together, and the same day copied twice is pointed out', () => {
  const a = logOf({'2026-11-25': {view: {budget: 1, home: 1}, act: {ledger: 1}}});
  const b = logOf({'2026-11-25': {view: {budget: 4}}, '2026-11-26': {view: {today: 1}}});
  const r = report([a, b]);
  assert.deepEqual([r.used, r.activeDates, r.personDays], [2, 2, 3]);
  assert.deepEqual([menuOf(r, 'budget').count, menuOf(r, 'budget').days, menuOf(r, 'budget').fileDays], [5, 1, 2]);
  assert.deepEqual(r.overlaps, []);
  assert.deepEqual(report([a, a]).overlaps, ['1·2']);
});

test('keys outside the name rule are dropped and only their number is reported', () => {
  const src = logOf({
    '2026-11-26': {view: {home: 1, '한지우 팀장': 3, 'a b': 1, ledger: -2}, memo: {secretText: 1}},
    'not-a-day': {act: {hidden: 1}},
  });
  assert.equal(src.dropped, 5);
  const text = formatUsageReport(report([src]));
  assert.match(text, /맞지 않아 버린 항목: 5개/);
  for (const leak of ['한지우', 'a b', 'secretText', 'hidden', 'not-a-day']) assert.ok(!text.includes(leak), leak);
});

test('broken input is reported as unreadable and never crashes or becomes zero use', () => {
  for (const bad of ['', '   ', '{oops', '[]', '{"days": 3}', '{"v":1}', 'hello', null, '# GW 비서 사용 기록 2026-11-01 ~ 2026-11-26\n\n## 화면\n- home: 1\n']) assert.equal(parseUsageInput(bad).type, 'bad', String(bad));
  const r = report([parseUsageInput('{oops')]);
  assert.deepEqual([r.used, r.freeze.views, r.freeze.acts, r.freeze.tools], [0, null, null, null]);
  const text = formatUsageReport(r);
  assert.match(text, /판단할 수 없습니다/);
  assert.ok(!text.includes('## 동결 후보'));
});

test('a wrapped log and a byte order mark are accepted', () => {
  const src = parseUsageInput(String.fromCharCode(0xFEFF) + JSON.stringify({usage: {days: {'2026-11-26': {view: {home: 1}}}}}));
  assert.equal(menuOf(report([src]), 'home').count, 1);
});

test('the Markdown file the app exports is read as a total, without pretending to know days', () => {
  const log = {days: {'2026-11-26': {view: {board: 2}, act: {chatSend: 3}, tool: {get_budget: 2, 'get_budget:err': 2}, toolAi: {list_mail: 1}}}};
  const md = usageReport(log, {now: NOW, days: 60, views: NAMES.views.map(v => v.id), errors: [{at: NOW, where: '지어낸 오류 위치'}]});
  const src = parseUsageInput(md.replace(/\n/g, '\r\n'));
  assert.deepEqual([src.type, src.activeDays, src.dropped], ['summary', 1, 0]);
  const r = report([src]);
  assert.deepEqual([menuOf(r, 'today').count, menuOf(r, 'today').daysPartial], [2, true]);
  assert.deepEqual(r.errors, [{kind: 'mixed', name: 'get_budget', errors: 2, ok: 2, rate: 0.5}]);
  assert.deepEqual(r.freeze.acts, ['ledger', 'tdAdd']);
  assert.deepEqual(r.freeze.tools, ['add_todo', 'vision']);
  const text = formatUsageReport(r);
  assert.match(text, /날짜별 값이 없어/);
  assert.ok(!text.includes('지어낸 오류 위치'));
});

test('a truncated Markdown table makes button and tool freeze candidates unknown', () => {
  const act = Object.fromEntries(Array.from({length: 30}, (_, i) => [`btn${i}`, 30 - i]));
  const tool = Object.fromEntries(Array.from({length: 30}, (_, i) => [`tool${i}:err`, 30 - i]));
  const view = Object.fromEntries(Array.from({length: 16}, (_, i) => [`extra${i}`, 100]));
  const md = usageReport({days: {'2026-11-26': {view: {...view, mail: 1}, act, tool}}}, {now: NOW, views: ['mail', 'budget']});
  const r = report([parseUsageInput(md)]);
  assert.deepEqual([r.freeze.acts, r.freeze.tools], [null, null]);
  // 표에서 잘린 화면(mail)은 연 것으로, '열지 않은 화면'(budget)은 후보로 남긴다.
  assert.ok(r.freeze.views.includes('budget') && !r.freeze.views.includes('mail'));
  assert.equal(r.errors[0].rate, null);
  assert.match(formatUsageReport(r), /확인 불가/);
});

test('a Markdown export that ends before the period is left out', () => {
  const md = usageReport({days: {'2026-08-01': {view: {home: 1}}}}, {now: Date.parse('2026-08-02T00:00:00Z')});
  const r = report([parseUsageInput(md)]);
  assert.deepEqual([r.used, r.outside, r.viewTotal], [0, 1, 0]);
});

test('names are read from the real source: views, parents, buttons and every registered tool', async () => {
  const model = await loadWc(root);
  const names = codeNames(model, analyze(model));
  assert.equal(names.views.length, new Set(names.views.map(v => v.id)).size);
  for (const [child, parent] of Object.entries(names.viewParent)) assert.ok(names.views.some(v => v.id === child) && names.views.some(v => v.id === parent), child);
  assert.deepEqual(names.views.filter(v => !names.viewParent[v.id]).map(v => v.id).sort(), ['approval', 'attendance', 'budget', 'calendar', 'home', 'report', 'search', 'settings', 'today']);
  // 정의(function chatRegisterTool)와 존재 확인(typeof)을 뺀 모든 호출. 'if (…) chatRegisterTool({' 형태도 센다.
  const calls = model.parts.reduce((a, p) => a + [...p.raw.matchAll(/(?<!function )chatRegisterTool\(/g)].length, 0);
  assert.equal(names.tools.length, calls, '등록한 도구를 모두 읽어야 한다');
  for (const a of ['chatSend', 'usageExport', 'chatOpenItem', 'tdAdd']) assert.ok(names.acts.includes(a), a);
  assert.ok(names.aiOnly.includes('vision'));
});

test('the command writes a report, skips an unreadable file and fails when nothing is readable', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-usage-report-'));
  try {
    const good = path.join(dir, 'a.json'), broken = path.join(dir, 'b.json'), out = path.join(dir, 'out', 'r.md');
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    await fs.writeFile(good, JSON.stringify({v: 1, days: {[today]: {view: {budget: 2}}}}));
    await fs.writeFile(broken, '{');
    const run = (...a) => spawnSync(process.execPath, ['scripts/usage-report.mjs', ...a], {cwd: root, encoding: 'utf8'});
    const ok = run(good, broken, '--days', '7', '--out', out);
    assert.equal(ok.status, 0, ok.stderr);
    const text = await fs.readFile(out, 'utf8');
    assert.match(text, /\| 예산 집행 \| 핵심 4 \| 2 \|/);
    assert.match(text, /2번째 파일은 읽지 못했습니다/);
    assert.ok(!text.includes('b.json'));
    assert.equal(run(broken).status, 1);
    assert.equal(run().status, 2);
    assert.equal(run(good, '--days', '0').status, 2);
    assert.equal(run(good, '--out', good).status, 2);
    assert.match(await fs.readFile(good, 'utf8'), /budget/);
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});
