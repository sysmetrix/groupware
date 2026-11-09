// Authoring safety regressions for the work center fragments (no live API, no build).
// Each test pulls the real function source out of src/live/wc/*.js and runs it in a vm with mocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = f => fs.readFileSync(new URL(`../src/live/wc/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Top-level fragment functions are indented 2 spaces and end at the first "\n  }\n"; one-line consts end at the line break.
function pick(file, head) {
  const s = read(file);
  const i = s.indexOf(`\n  ${head}`);
  assert.ok(i >= 0, `${head} not found in ${file}`);
  const end = head.startsWith('const ') ? s.indexOf('\n', i + 1) : s.indexOf('\n  }\n', i) + 4;
  return s.slice(i + 1, end);
}
function run(globals, parts, out) {
  const ctx = vm.createContext({...globals});
  return vm.runInContext(`${parts.join('\n')}\n;(${out})`, ctx);
}
const spy = (impl = () => {}) => { const f = (...a) => { f.calls.push(a); return impl(...a); }; f.calls = []; return f; };
const answers = list => spy(() => list.shift());

const BASE = new Date('2026-11-10T03:00:00Z'); // 2026-11-10 12:00 KST
const PARSE = pick('18-command-console.js', 'function parseKoreanDate(');
const parseAt = base => { const p = run({}, [PARSE], 'parseKoreanDate'); return t => p(t, base); };

test('parseKoreanDate rejects impossible dates instead of rolling them over', () => {
  const p = parseAt(BASE);
  for (const t of ['2026-02-30', '2월 30일', '2/29', '2026.02.29', '4/31', '13/1', '0/5', '2026-13-01']) assert.equal(p(t), null, t);
  assert.equal(p('2028-02-29').iso, '2028-02-29');
});

test('parseKoreanDate honours an explicit year, past or future', () => {
  const p = parseAt(BASE);
  assert.equal(p('2027년 1월 5일 연차').iso, '2027-01-05');
  assert.equal(p('2027.1.5').iso, '2027-01-05');
  assert.equal(p('2025-12-31').iso, '2025-12-31');
  assert.equal(p('2026년 11월 20일 금요일').iso, '2026-11-20'); // explicit date beats the weekday word
});

test('parseKoreanDate without a year picks the nearest year, keeping recent past dates', () => {
  assert.equal(parseAt(BASE)('11/3').iso, '2026-11-03'); // last week stays this year (retroactive attendance)
  assert.equal(parseAt(BASE)('11월 20일').iso, '2026-11-20');
  assert.equal(parseAt(BASE)('3/5').iso, '2027-03-05');
  assert.equal(parseAt(new Date('2026-12-28T03:00:00Z'))('1/5').iso, '2027-01-05');
  assert.equal(parseAt(new Date('2026-01-03T03:00:00Z'))('12/28').iso, '2025-12-28');
  assert.equal(parseAt(BASE)('내일').iso, '2026-11-11');
  assert.equal(parseAt(BASE)('다음 주 수요일').iso, '2026-11-18');
});

test('attendance attYmd uses the validated parser', () => {
  const attYmd = run({BASE}, [`const parseKoreanDate = (t, b = BASE) => (${PARSE})(t, b);`, pick('27-attendance-request.js', 'const attYmd =')], 'attYmd');
  assert.equal(attYmd('2026-02-30'), '');
  assert.equal(attYmd('2/31'), '');
  assert.equal(attYmd(''), '');
  assert.equal(attYmd('2026-11-20'), '2026-11-20');
  assert.equal(attYmd('11-20'), '2026-11-20');
  assert.equal(attYmd('2027.01.05'), '2027-01-05');
});

// ---- navigation guard ----
const U = 'https://gw.example/#/popup?MicroModuleCode=ea&tiKeyCode=mg_1';
const PANE = [pick('13-detail-pane.js', 'function leavePane('), pick('13-detail-pane.js', 'function openUrl(')];
const paneEnv = (pane, confirmAnswers) => ({S: {sel: null, pane: {url: U, mounted: U, dirty: false, expanded: false, ...pane}}, confirm: answers(confirmAnswers), renderPane: spy()});

test('openUrl asks before reusing the same URL while the user is typing; decline changes nothing', () => {
  const g = paneEnv({dirty: true}, [false]);
  const openUrl = run(g, PANE, 'openUrl');
  assert.equal(openUrl(U, {title: 't'}), false);
  assert.equal(g.confirm.calls.length, 1);
  assert.equal(g.renderPane.calls.length, 0);
  assert.equal(g.S.pane.dirty, true);
  assert.equal(g.S.pane.mounted, U);
});

test('openUrl same URL: accepting discard remounts a fresh screen; clean pane is a silent no-op', () => {
  const g = paneEnv({dirty: true}, [true]);
  assert.equal(run(g, PANE, 'openUrl')(U), true);
  assert.equal(g.S.pane.mounted, '', 'forces renderPane to recreate the iframe');
  assert.equal(g.renderPane.calls.length, 1);
  const c = paneEnv({}, []);
  assert.equal(run(c, PANE, 'openUrl')(U), true);
  assert.equal(c.confirm.calls.length, 0);
  assert.equal(c.S.pane.mounted, U, 'no reload when nothing was typed');
  const u = paneEnv({url: '', mounted: ''}, [false]);
  assert.equal(run(u, PANE, 'openUrl')(U, {unread: true}), false, 'declined read receipt');
});

test('openDraftFrame aborts on declined same-URL navigation without waiting or touching the frame', async () => {
  const g = {...paneEnv({dirty: true}, [false]), GW: {links: {draft: () => U}}, wait: spy(async () => {}), $: spy()};
  const openDraftFrame = run(g, [...PANE, pick('19-draft-engine.js', 'async function openDraftFrame(')], 'openDraftFrame');
  assert.equal(await openDraftFrame('mg_1', '일반기안문', 't'), null);
  assert.equal(g.wait.calls.length + g.$.calls.length + g.renderPane.calls.length, 0);
  assert.equal(g.S.pane.expanded, false);
});

// ---- attendance ----
const AU = 'https://gw.example/#/HP/HPD0110';
const ATT = [...PANE, pick('27-attendance-request.js', 'const ATT_FORM ='), pick('27-attendance-request.js', 'async function fillAttendanceForm(')];
const attEnv = (pane, confirmAnswers, frame = null) => ({...paneEnv({url: AU, mounted: AU, ...pane}, confirmAnswers), GW: {links: {route: () => AU}, routes: {attendanceRequest: 'HPD0110'}},
  wait: spy(async () => {}), waitFor: spy(async () => null), toast: spy(), installGuard: spy(), AUTO: {running: false, blocked: []}, $: spy(() => frame), logActionRecord: spy()});

test('fillAttendanceForm: declined same-URL navigation writes nothing', async () => {
  const g = attEnv({dirty: true}, [false]);
  await run(g, ATT, 'fillAttendanceForm')({type: 'leave', kind: '연차', from: '2026-11-20', to: '2026-11-20'});
  assert.equal(g.installGuard.calls.length + g.$.calls.length + g.logActionRecord.calls.length, 0);
  assert.equal(g.AUTO.running, false);
});

test('fillAttendanceForm: an already open application is not overwritten without consent (single prompt)', async () => {
  const el = t => ({children: [], textContent: t, getBoundingClientRect: () => ({width: 10, height: 10})});
  const doc = {querySelectorAll: () => [el('연차휴가신청서'), el('신청정보')]};
  const g = attEnv({}, [false], {contentDocument: doc, contentWindow: {}});
  await run(g, ATT, 'fillAttendanceForm')({type: 'leave', kind: '연차', from: '2026-11-20', to: '2026-11-20'});
  assert.equal(g.confirm.calls.length, 1);
  assert.match(g.confirm.calls[0][0], /이미 열려 있는 신청서/);
  assert.equal(g.installGuard.calls.length + g.logActionRecord.calls.length, 0);
  assert.equal(g.AUTO.running, false);
});

// ---- draft preflight ----
const DRAFT = [pick('19-draft-engine.js', 'const dlgOf ='), pick('19-draft-engine.js', 'const allDlgs ='), pick('19-draft-engine.js', 'function preflight('), pick('19-draft-engine.js', 'async function fillDraft(')];
function draftEnv({title = '', body = '', filled, answers: a = []}) {
  const input = {value: title};
  const ctrl = {GetFieldText: () => body, PutFieldText: spy()};
  const f = {contentWindow: {__wcFilled: filled}, contentDocument: {querySelectorAll: () => [], querySelector: s => (/hwpBuild/.test(s) ? {contentWindow: {HwpCtrl: ctrl}} : /제목/.test(s) ? input : null)}};
  const g = {confirm: answers(a), installGuard: spy(), setNative: spy(), AUTO: {running: false, blocked: []}, window: {addEventListener() {}}, setTimeout() {}, wait: async () => {}};
  return {g, f, input, ctrl, api: run(g, DRAFT, '{preflight, fillDraft}')};
}
const SPEC = {title: '새 기안', meta: {}, body: {text: '1. 새 본문\r\n2. 둘째 줄', lines: ['1. 새 본문', '2. 둘째 줄'], hang: [false, false]}};

test('preflight asks before replacing an existing HWP body with a new one; decline stops before any write', async () => {
  const t = draftEnv({body: '사용자가 쓴 본문', answers: [false]});
  const steps = await t.api.fillDraft(t.f, SPEC);
  assert.equal(t.g.confirm.calls.length, 1);
  assert.equal(JSON.stringify(steps.map(s => [s.name, s.ok])), JSON.stringify([['사전점검', false]])); // vm realm arrays: compare by value
  assert.equal(t.g.installGuard.calls.length + t.g.setNative.calls.length + t.ctrl.PutFieldText.calls.length, 0);
  assert.equal(t.input.value, '');
});

test('preflight keeps existing protections and stays quiet on a fresh or identical form', () => {
  const fresh = draftEnv({});
  assert.equal(fresh.api.preflight(fresh.f, SPEC), '');
  assert.equal(fresh.g.confirm.calls.length, 0, 'fresh form: no prompt');
  const noBody = draftEnv({body: '내 본문', answers: [false]});
  assert.notEqual(noBody.api.preflight(noBody.f, {...SPEC, body: null}), '');
  const typedTitle = draftEnv({title: '내가 쓴 제목', answers: [false]});
  assert.notEqual(typedTitle.api.preflight(typedTitle.f, SPEC), '');
  const again = draftEnv({title: '새 기안', body: '1. 새 본문\r2. 둘째 줄'});
  assert.equal(again.api.preflight(again.f, SPEC), '');
  assert.equal(again.g.confirm.calls.length, 0);
  const refill = draftEnv({title: '새 기안', filled: 1, answers: [false]});
  assert.notEqual(refill.api.preflight(refill.f, SPEC), '');
});

// ---- mail reply autofill ----
test('cmdMailReplyTo does not autofill when the user keeps the reply they are typing', async () => {
  const CU = 'https://gw.example/#/popup?MicroModuleCode=mail&re=3';
  const g = {...paneEnv({url: CU, mounted: CU, dirty: true}, [false]), GW: {links: {compose: () => CU}}, closeOverlay: spy(), selectAction: spy(), toast: spy(), waitMailEditor: spy(async () => true), autoFillMail: spy(), logActionRecord: spy()};
  g.S.sel = {type: 'action', key: 'k'};
  await run(g, [...PANE, pick('18-command-console.js', 'async function cmdMailReplyTo(')], 'cmdMailReplyTo')('회신', 'confirm', {key: 'k', ref: {box: 'INBOX', uid: '3'}, title: 't'});
  assert.equal(g.autoFillMail.calls.length + g.waitMailEditor.calls.length, 0);
  assert.equal(g.confirm.calls.length, 1);
});
