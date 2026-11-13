// v0.52 regressions: the installed version is always visible, and mail reply helpers work from the
// read view and keep the reply inside the work-center pane. Real fragment source, mocked browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = f => fs.readFileSync(new URL(`../src/live/wc/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function pick(file, head) {
  const s = read(file);
  const i = s.indexOf(`\n  ${head}`);
  assert.ok(i >= 0, `${head} not found in ${file}`);
  const end = head.startsWith('const ') ? s.indexOf('\n', i + 1) : s.indexOf('\n  }\n', i) + 4;
  return s.slice(i + 1, end);
}
const run = (globals, parts, out) => vm.runInContext(`${parts.join('\n')}\n;(${out})`, vm.createContext({setTimeout, clearTimeout, Promise, Date, URL, JSON, String, ...globals}));
const spy = (impl = () => {}) => { const f = (...a) => { f.calls.push(a); return impl(...a); }; f.calls = []; return f; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; };

const READ = 'https://gw.example/#/popup?callComp=UDAP007&muid=abc&keep=false&MicroModuleCode=mail';
const REPLY = 'https://gw.example/#popup?MicroModuleCode=mail&callComp=UDAP001&mailKind=re&uid=7&mbox=INBOX&popType=Y';
const PLAIN = 'https://gw.example/#popup?MicroModuleCode=mail&callComp=UDAP001&mailKind=plain&popType=Y';

// ---------- version is always on screen ----------
test('header, side menu and launcher button all carry the installed version', () => {
  assert.match(read('02-shell.js'), /<button class="verchip" id="verChip" data-act="openChangelog"/);
  const views = read('05-views.js');
  assert.match(views, /class="navver \$\{v\.state\}"/);
  assert.match(views, /<span class="v" title="설치된 버전">v\$\{esc\(VERSION\)\}<\/span>/);
  const css = fs.readFileSync(new URL('../src/live/wc-premium.css', import.meta.url), 'utf8');
  assert.match(css, /\.wc header \.verchip\{display:inline-flex/);
  // the chip itself is never hidden by a narrow-screen rule (only its state word may be)
  assert.doesNotMatch(css, /\.verchip\{[^}]*display:none/);
});

function versionEnv({VERSION = '0.52.0', up = null, updateCheck = true, settings = {}} = {}) {
  const chip = {className: '', innerHTML: '', title: '', setAttribute: spy()};
  const g = {VERSION, S: {settings}, store: {get: () => up}, allowed: f => f !== 'updateCheck' || updateCheck, R: {compareVersions: cmp}, esc, hhmm: () => '09:10', $: sel => (sel === '#verChip' ? chip : null)};
  return {chip, api: run(g, [pick('05-views.js', 'function versionInfo('), pick('05-views.js', 'function renderVersion(')], '({versionInfo, renderVersion})')};
}

test('version chip tells latest / newer release / not checked / check disabled apart', () => {
  const at = new Date(2026, 10, 14, 9, 5).getTime();
  const ok = versionEnv({up: {latest: '0.52.0', at: 1}, settings: {verOf: '0.52.0', verAt: at, verFrom: '0.51.0'}});
  assert.deepEqual({...ok.api.versionInfo()}, {state: 'ok', label: '최신', applied: '11/14 09:05', checked: '09:10', from: '0.51.0', latest: '0.52.0'});
  ok.api.renderVersion();
  assert.equal(ok.chip.className, 'verchip ok');
  assert.match(ok.chip.innerHTML, /<b>v0\.52\.0<\/b><span>최신<\/span>/);
  assert.match(ok.chip.title, /설치된 버전 v0\.52\.0 · 이 브라우저에 11\/14 09:05 적용 \(이전 v0\.51\.0\)/);

  const newer = versionEnv({up: {latest: '0.53.0', at: 1}}).api.versionInfo();
  assert.equal(newer.state, 'new');
  assert.equal(newer.label, '새 버전 v0.53.0 있음');

  // a failed or missing check is never shown as "최신"
  for (const up of [null, {latest: '', err: 'HTTP 403', at: 1}]) {
    const v = versionEnv({up}).api.versionInfo();
    assert.equal(v.state, 'unknown');
    assert.equal(v.label, '최신 여부 확인 전');
  }
  assert.equal(versionEnv({up: {latest: '0.52.0', at: 1}, updateCheck: false}).api.versionInfo().state, 'off');
  // releases beyond 0.x are understood too
  assert.equal(versionEnv({up: {latest: '1.0.0', at: 1}}).api.versionInfo().state, 'new');
  // the applied time belongs to the running version only
  assert.equal(versionEnv({up: null, settings: {verOf: '0.51.0', verAt: at}}).api.versionInfo().applied, '');
});

test('update check never reports "최신" when it could not check, and stays on the screen it was pressed from', async () => {
  const make = (result, fromLog) => {
    const g = {VERSION: '0.52.0', S: {paletteOpen: false}, R: {compareVersions: cmp}, checkUpdate: spy(async () => result), renderHead: spy(), renderNav: spy(), toast: spy(), openChangelog: spy(), closeOverlay: spy(), drawDiag: spy(),
      $: sel => (/업데이트 내역/.test(sel) && fromLog ? {} : null)};
    return {g, fn: run(g, [pick('21-governance.js', 'async function govUpdate(')], 'govUpdate')};
  };
  const off = make(null, false); await off.fn();
  assert.match(off.g.toast.calls[0][0], /꺼져 있어 확인하지 않았습니다/);
  const fail = make({latest: '', err: 'HTTP 403'}, true); await fail.fn();
  assert.match(fail.g.toast.calls[0][0], /확인하지 못했습니다\(HTTP 403\)/);
  assert.equal(fail.g.openChangelog.calls.length, 1); // pressed in 업데이트 내역 → stays there
  assert.equal(fail.g.drawDiag.calls.length, 0);
  const same = make({latest: '0.52.0'}, false); await same.fn();
  assert.match(same.g.toast.calls[0][0], /최신 버전입니다\(v0\.52\.0\)/);
  assert.equal(same.g.drawDiag.calls.length, 1);
  const newer = make({latest: '0.53.0'}, false); await newer.fn();
  assert.match(newer.g.toast.calls[0][0], /새 버전 v0\.53\.0/);
  for (const t of [off, fail]) assert.doesNotMatch(t.g.toast.calls[0][0], /최신 버전입니다/);
  const gov = read('21-governance.js');
  assert.match(gov, /Date\.now\(\) - cached\.at < 3600e3 && R\.compareVersions\(cached\.latest, VERSION\) >= 0/); // hourly, and re-check right after an update
});

// ---------- mail: read view vs compose ----------
const MAILREF = [pick('13-detail-pane.js', 'const isMailCompose ='), pick('13-detail-pane.js', 'function paneMailRef(')];
const mailEnv = (over = {}) => ({S: {sel: null, pane: {url: ''}}, findMail: (box, uid) => (uid === '7' ? {uid: '7', box: 'INBOX', subject: '자료 요청', seen: true} : undefined), selectedAction: () => null, ...over});

test('isMailCompose separates the compose screen from the mail read view', () => {
  const is = run({}, [MAILREF[0]], 'isMailCompose');
  assert.equal(is(REPLY), true);
  assert.equal(is(PLAIN), true);
  assert.equal(is(READ), false);
  assert.equal(is('https://gw.example/#popup?MicroModuleCode=ea&callComp=UDAP001'), false);
  assert.equal(is(''), false);
});

test('paneMailRef resolves the mail from a list pick, a to-do and a search result', () => {
  const g = mailEnv();
  const ref = run(g, MAILREF, 'paneMailRef');
  assert.equal(ref(), null);
  g.S.sel = {type: 'mail', box: 'INBOX', uid: '7'};
  assert.equal(ref().subject, '자료 요청');
  g.S.sel = {type: 'search', item: {type: 'mail', uid: '9', box: 'SENT', subject: '검색된 메일'}};
  assert.equal(ref().subject, '검색된 메일');
  g.S.sel = {type: 'frame', url: READ};
  assert.equal(ref(), null);
  const todo = mailEnv({selectedAction: () => ({type: 'mail', title: '할 일 메일', ref: {box: 'INBOX', uid: '8'}})});
  todo.S.sel = {type: 'action', key: 'k'};
  assert.equal(run(todo, MAILREF, 'paneMailRef')().subject, '할 일 메일');
});

test('reply-template bar: opens the reply first on the read view, hidden when there is nothing to reply to', () => {
  const bar = (url, sel) => { const g = mailEnv({ic: () => '', esc}); g.S.pane.url = url; g.S.sel = sel; return run(g, [...MAILREF, pick('13-detail-pane.js', 'function autoFillBar(')], 'autoFillBar')(); };
  const picked = {type: 'mail', box: 'INBOX', uid: '7'};
  assert.match(bar(READ, picked), /답장 화면을 열고 회신문 넣기:/);
  assert.match(bar(READ, picked), /data-act="autoFillMail" data-v="confirm"/);
  assert.equal(bar(READ, {type: 'frame', url: READ}), ''); // no known mail: no buttons that cannot work
  assert.match(bar(REPLY, picked), /회신 자동 기입:/);
  assert.equal(bar(PLAIN, null), ''); // a brand-new mail has no "보내주신 … 건" to answer
  assert.equal(bar(REPLY.replace('mailKind=re', 'mailKind=fw'), picked), ''); // forwarding is not answering
});

// ---------- mail: the groupware's own 답장 stays in the pane ----------
function frameEnv(url = READ) {
  const win = {open: spy(() => 'native-window'), close: spy()};
  const f = {contentWindow: win, isConnected: true};
  const g = {S: {pane: {url, dirty: true, expanded: true}}, location: {origin: 'https://gw.example'}, openUrl: spy(() => true), toast: spy(), render: spy(), refresh: spy(), recorder: null, setTimeout: fn => { fn(); return 0; }};
  run(g, [MAILREF[0], pick('13-detail-pane.js', 'function hookFrameWindow(')], 'hookFrameWindow')(f, url);
  return {g, f, win};
}

test('a 답장/전달 popup requested by the embedded mail screen opens in the pane, not a new window', () => {
  const {g, win} = frameEnv();
  const popup = win.open('/#popup?MicroModuleCode=mail&domainSeq=10&mailKind=re&mbox=LINK&moduleSeq=700&popType=Y&uid=7&callComp=UDAP001&popupUUID=u1', '', 'width=1100,height=850');
  assert.equal(g.openUrl.calls.length, 1);
  assert.equal(g.openUrl.calls[0][0], 'https://gw.example/#popup?MicroModuleCode=mail&domainSeq=10&mailKind=re&mbox=LINK&moduleSeq=700&popType=Y&uid=7&callComp=UDAP001&popupUUID=u1');
  assert.equal(typeof popup.focus, 'function'); // the groupware gets a harmless stand-in window
  assert.equal(popup.closed, false);
  assert.match(g.toast.calls[0][0], /새 창 대신 이 처리 창에 열었습니다/);
});

test('other popups keep the groupware behaviour, and a stale frame is left alone', () => {
  const a = frameEnv();
  const original = spy(() => 'native-window');
  // re-hook a fresh frame whose native open we can observe
  const win = {open: original, close: spy()};
  const f = {contentWindow: win, isConnected: true};
  const g = {...a.g, openUrl: spy(() => true), toast: spy()};
  const hook = run(g, [MAILREF[0], pick('13-detail-pane.js', 'function hookFrameWindow(')], 'hookFrameWindow');
  hook(f, READ);
  assert.equal(win.open('/#popup?MicroModuleCode=ea&callComp=UBAP001&diKeyCode=1', '', ''), 'native-window'); // 결재 문서 팝업
  assert.equal(win.open('https://example.org/', '_blank'), 'native-window');
  assert.equal(win.open(READ.replace('https://gw.example', ''), '', ''), 'native-window'); // mail read popup
  assert.equal(original.calls.length, 3);
  assert.equal(g.openUrl.calls.length, 0);
  // once the pane shows something else, this frame no longer redirects
  g.S.pane.url = 'other';
  assert.equal(win.open('/#popup?MicroModuleCode=mail&callComp=UDAP001&mailKind=re&uid=7', '', ''), 'native-window');
  assert.equal(g.openUrl.calls.length, 0);
  // hooking twice does not stack wrappers
  const wrapped = win.open; hook(f, READ); assert.equal(win.open, wrapped);
});

test('when the embedded groupware screen closes itself the pane closes and the lists are re-read', () => {
  const {g, win} = frameEnv(REPLY);
  win.close();
  assert.equal(g.S.pane.url, '');
  assert.equal(g.S.pane.dirty, false);
  assert.equal(g.render.calls.length, 1);
  assert.match(g.toast.calls[0][0], /그룹웨어 화면이 닫혔습니다/);
  assert.equal(g.refresh.calls.length, 1);
});

// ---------- mail: template buttons work from the read view ----------
const FILL = [...MAILREF, pick('13-detail-pane.js', 'function mailEditorBody('), pick('13-detail-pane.js', 'async function waitMailEditorSettled('), pick('13-detail-pane.js', 'async function autoFillMail('), pick('13-detail-pane.js', 'async function autoFillMailRun(')];

function editorBody(text = '원문 인용') {
  const body = {isContentEditable: true, innerHTML: `<p>${text}</p>`, innerText: text, tpl: null, events: 0,
    querySelector: sel => (sel === '[data-bwyfgw-tpl]' && body.tpl ? {remove: () => { body.tpl = null; }} : null),
    insertAdjacentHTML: (pos, html) => { assert.equal(pos, 'afterbegin'); body.tpl = html; },
    dispatchEvent: () => { body.events++; }};
  return body;
}
function fillEnv({url, sel, body = null, openOk = true, subjectInput = ''} = {}) {
  const editorDoc = body ? {body, designMode: 'off', querySelectorAll: () => []} : null;
  const doc = {querySelectorAll: sel0 => (sel0 === 'iframe' ? (editorDoc ? [{contentDocument: editorDoc}] : []) : /input/.test(sel0) ? (subjectInput ? [{value: subjectInput}] : []) : []), querySelector: () => null};
  const frame = {contentDocument: doc};
  const g = mailEnv({toast: spy(), esc, confirm: spy(() => true), Event: class { constructor(t) { this.type = t; } }, R: {kstNow: () => ({date: '2026-11-14'})}, GW: {links: {compose: (kind, m) => `${REPLY}#${kind}:${m.uid}`}}, $: () => frame});
  g.S = {sel, pane: {url, fillBusy: false}, raw: {principal: {name: '홍길동', deptName: '기획팀', duty: '대리'}}};
  g.openUrl = spy((u) => { if (openOk) g.S.pane.url = u; return openOk; });
  return {g, fn: run(g, FILL, 'autoFillMail')};
}

test('template button without a chosen mail explains what to do and opens nothing', async () => {
  const {g, fn} = fillEnv({url: READ, sel: {type: 'frame', url: READ}});
  assert.equal(await fn('confirm'), false);
  assert.equal(g.openUrl.calls.length, 0);
  assert.match(g.toast.calls[0][0], /답장할 메일을 먼저 고르세요/);
});

test('template button on the read view opens the reply for the chosen mail, then stops if the user keeps their screen', async () => {
  const {g, fn} = fillEnv({url: READ, sel: {type: 'mail', box: 'INBOX', uid: '7'}, openOk: false});
  assert.equal(await fn('confirm'), false);
  assert.equal(g.openUrl.calls.length, 1);
  assert.equal(g.openUrl.calls[0][0], `${REPLY}#re:7`);
  assert.equal(g.openUrl.calls[0][1].unread, false);
  assert.equal(g.S.pane.fillBusy, false); // the guard is released for the next press
});

test('template is inserted only after the editor has settled, with the mail title, and is verified', async () => {
  const body = editorBody();
  const {g, fn} = fillEnv({url: READ, sel: {type: 'mail', box: 'INBOX', uid: '7'}, body});
  assert.equal(await fn('confirm'), true);
  assert.match(body.tpl, /data-bwyfgw-tpl="1"/);
  assert.match(body.tpl, /기획팀 홍길동 대리/);
  assert.match(body.tpl, /“자료 요청”/);
  assert.match(body.tpl, /확인 일자: 2026-11-14/);
  assert.equal(body.events, 1);
  assert.match(g.toast.calls.at(-1)[0], /회신 문구를 본문 맨 위에 넣었습니다/);
});

test('with no list selection the title comes from the reply subject, never an empty quote', async () => {
  const body = editorBody();
  const {fn} = fillEnv({url: REPLY, sel: {type: 'frame', url: REPLY}, body, subjectInput: 'Re: FW: 예산 자료 제출 요청'});
  assert.equal(await fn('submit'), true);
  assert.match(body.tpl, /“예산 자료 제출 요청”/);
  assert.doesNotMatch(body.tpl, /“”/);
});

// ---------- other repaired buttons ----------
test('google tabs are opened without noopener so a real block is told apart from success', () => {
  const gcal = read('28-gcal.js'), gsync = read('34-gsync.js');
  assert.doesNotMatch(gcal + gsync, /window\.open\([^)]*'noopener'\)/);
  const g = {window: {open: spy(() => ({opener: {}}))}, toast: spy()};
  const open = run(g, [pick('28-gcal.js', 'const openExternalTab =')], 'openExternalTab');
  assert.equal(open('https://calendar.google.com/'), true);
  g.window.open = spy(() => null);
  assert.equal(open('https://calendar.google.com/'), false);
});

test('chat cards do not claim a form was opened when it was cancelled or failed', () => {
  const ATT = 'https://gw.example/#/HP/HPD0110/HPD0110';
  const g = {S: {pane: {url: ''}}, GW: {links: {route: r => 'https://gw.example/' + r}, routes: {attendanceRequest: '#/HP/HPD0110/HPD0110'}}};
  const res = run(g, [pick('33-chat-tools-act.js', 'const chatAttResult =').replace(/\n$/, '') + '\n' + read('33-chat-tools-act.js').split('const chatAttResult =')[1].split('\n').slice(1, 3).join('\n')], 'chatAttResult');
  assert.equal(res('휴가 신청서').ok, false);
  assert.match(res('휴가 신청서').text, /열지 않았습니다/);
  g.S.pane.url = ATT;
  assert.equal(res('휴가 신청서').ok, true);
  const act = read('33-chat-tools-act.js');
  assert.doesNotMatch(act, /return \{ok: true, text: '(출장 |시간외 )?신청서 준비 창을 열었습니다/);
  assert.match(act, /if \(r !== 'filled' && r !== 'opened'\) return \{ok: false/);
  assert.match(act, /time: tripTime\}/); // the spoken trip time reaches the form
  assert.doesNotMatch(act, /\|\| list\[0\];/); // never books a non-vehicle instead
});

test('AI request uses a fresh abort signal per model so a timeout can move on to the next model', () => {
  const eng = read('31-chat-engine.js');
  assert.match(eng, /const mc = new AbortController\(\);/);
  assert.match(eng, /signal: mc\.signal/);
  assert.doesNotMatch(eng, /setTimeout\(\(\) => ctl\.abort\(\), 25000\)/);
});

test('attendance request started from the calendar keeps the picked day', () => {
  assert.match(read('27-attendance-request.js'), /const d0 = attYmd\(preset\.date\) \|\| selDate \|\| pickedDay \|\| today/);
});
