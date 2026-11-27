// 화면 전후 비교 도구: 둘러보기(지어낸 자료)를 창 없는 브라우저에 띄워 메뉴·탭·주요 창을 밝게·어둡게 × 넓은·좁은 창으로 찍는다.
// Usage:
//   node scripts/visual-snap.mjs --out <dir>              찍어서 <dir>/*.png 와 <dir>/manifest.json 을 남긴다
//   node scripts/visual-snap.mjs --compare <dirA> <dirB>   두 폴더를 바이트 단위로 비교해 다른 화면 목록을 낸다(다르면 종료 코드 1)
//   node scripts/visual-snap.mjs --twice --out <dir>       같은 코드로 두 번 찍어(<dir>/a, <dir>/b) 차이가 0인지 확인한다
//   옵션: --only <이름 일부> · --themes light,dark · --widths 1366,760 · --jobs 4 · --headed
// 화면마다 새 브라우저 저장소에서 시작하고, 시각(2026-11-25 수 10:00 KST에서 출발)·난수·애니메이션·커서 깜빡임을 고정한다.
// 화면을 여는 데에만 누르며, 확인 카드·실행 버튼(상신·결재·삭제·발송·예약·신청 등)은 누르지 않는다.
// 번들 밖 개발 도구다. 실제 그룹웨어 화면의 모양은 증명하지 않는다.
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import os from 'node:os';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ROOT} from './live-build.mjs';
import {buildDemo, serveDemo} from './live-demo.mjs';
import {findBrowser} from './e2e.mjs';

export const THEMES = ['light', 'dark'];
export const WIDTHS = [1366, 760];
export const HEIGHT = 900;
const MAX_SLICES = 4;

// 누르지 않는 것: 실행·삭제·확정류. 화면을 여는 버튼만 누른다.
export const DENY_ACTS = new Set(['chatConfirm', 'tdDelYes', 'resetAll', 'resetDone', 'resetRouting', 'goodsRun', 'recPlay', 'expDel', 'delRule', 'usageClear', 'updateNow', 'relogin', 'cleanSynap', 'markDone', 'close']);
export const DENY_TEXT = /^(상신|결재|임시저장|삭제|발송|보내기 실행|예약 확정|예약하기|신청하기|신청)$/;

const C = sel => ({click: sel});
const view = (name, v, extra = {}) => ({name, view: v, scroll: true, ...extra});
const over = (name, v, steps, extra = {}) => ({name, view: v, steps, scroll: false, ...extra});
const MENU_VIEW = '[data-act="menuView"]';

/**
 * 찍을 화면 목록. view: 주소의 gw-view 값(그 화면에서 시작), steps: 차례로 누를 것, scroll: 본문을 내려 가며 여러 장 찍을지,
 * each: 이 선택자에 걸리는 버튼마다(data-v 값으로) 화면을 하나씩 만든다, query: gw-view 대신 쓸 주소 꼬리.
 */
export const SCREENS = [
  // 왼쪽 메뉴 9개
  view('home', 'home'), view('today', 'today'), view('calendar', 'calendar'), view('attendance', 'attendance'), view('budget', 'budget'),
  view('approval', 'approval'), view('search', 'search'), view('report', 'report'), view('settings', 'settings'),
  // 메뉴 안의 탭
  view('mytodo', 'mytodo', {onSel: '[data-act="view"][data-v="today"][aria-selected="true"]'}), view('board', 'board'), view('gcal', 'gcal'), view('resource', 'resource'), view('mail', 'mail'), view('notifications', 'notifications'),
  view('docs', 'docs'), view('people', 'people'), view('overview', 'overview'), view('gsync', 'gsync'),
  // 화면 안의 작은 탭과 거르기
  view('today-src', 'today', {each: '#main [data-act="todoSrc"]'}),
  view('mytodo-view', 'mytodo', {each: '#main [data-act="tdView"]', onSel: '[data-act="view"][data-v="today"][aria-selected="true"]'}),
  view('approval-tab', 'approval', {each: '#main [data-act="apTab"]'}),
  view('mail-filter', 'mail', {each: '#main [data-act="mailFilter"]'}),
  view('budget-tab', 'budget', {each: '#main [data-act="budgetTab"]'}),
  view('settings-today', 'settings', {each: '#main [data-act="setTodayTab"]'}),
  view('search-example', 'search', {steps: [C('#main [data-act="searchExample"]'), {wait: 600}]}),
  view('nav-mini', 'home', {steps: [C('#navTg')]}),
  // 머리 줄의 창과 메뉴
  over('menu-new', 'home', [C('[data-act="menuNew"]')]),
  over('menu-bell', 'home', [C('#bell'), {wait: 500}]),
  over('menu-view', 'home', [C(MENU_VIEW)]),
  over('palette', 'home', [C(MENU_VIEW), C('#overlay [data-act="openPalette"]')]),
  over('help', 'home', [C(MENU_VIEW), C('#overlay [data-act="help"]')]),
  over('history', 'home', [C(MENU_VIEW), C('#overlay [data-act="openHistory"]')]),
  over('changelog', 'home', [C(MENU_VIEW), C('#overlay [data-act="openChangelog"]')]),
  over('ai-cmd', 'home', [C('[data-act="openCmd"]')]),
  over('notice', 'home', [{until: '[data-act="govAck"]'}], {notice: true}),
  over('coach', 'home', [C(MENU_VIEW), C('#overlay [data-act="coach"]'), {until: '[data-act="coachNext"], [data-act="coachEnd"]', ms: 4000}, {wait: 400}]),
  over('toast', 'home', [{until: '.toast', ms: 8000}, {wait: 300}], {toast: true}),
  // 설정 안의 창
  over('settings-data', 'settings', [C('#main [data-act="openData"]')]),
  over('settings-diag', 'settings', [C('#main [data-act="openDiag"]')]),
  over('settings-usage', 'settings', [C('#main [data-act="openUsage"]')]),
  // 처리 창·준비 창·줄 메뉴·날짜 고르기
  over('home-next-pane', 'home', [C('.hm-next [data-act="homeNext"]'), {wait: 600}]),
  over('leave-prep', 'home', [C('.hm3-core [data-act="quickAtt"][data-t="leave"]'), {until: '[role="dialog"]'}]),
  over('leave-prep-date', 'home', [C('.hm3-core [data-act="quickAtt"][data-t="leave"]'), {until: '[role="dialog"]'}, C('[role="dialog"] [data-act="dpOpen"]')]),
  over('approval-pane', 'approval', [C('#main [data-act="selDoc"]'), {wait: 600}]),
  over('mail-pane', 'mail', [C('#main [data-act="mailOpenItem"], #main [data-act="selMail"]'), {wait: 600}]),
  over('today-rowmenu', 'today', [C('#main [data-act="rowMenu"]')]),
  // 비서에게 묻기(읽기 질문만. 확인 카드는 누르지 않는다)
  over('chat-today', 'home', [{ask: '오늘 할 일 알려 줘'}]),
  over('chat-budget', 'home', [{ask: '이번 달 예산 얼마 남았어'}]),
  over('chat-leave', 'home', [{ask: '내일 연차 쓰고 싶어'}]),
];

/** each 가 달린 화면을 찾아낸 값으로 펼친다. found: {이름: [data-v 값]} */
export function expandScreens(screens, found = {}) {
  const out = [];
  for (const s of screens) {
    if (!s.each) { out.push(s); continue; }
    for (const v of found[s.name] || []) {
      const safe = String(v).replace(/[^\w-]/g, '_');
      out.push({...s, each: undefined, name: `${s.name}-${safe}`, steps: [...(s.steps || []), {click: `${s.each}[data-v="${String(v).replace(/"/g, '\\"')}"]`}, {wait: 400}]});
    }
  }
  return out;
}

export const fileName = (theme, width, name, slice = 0) => `${theme}-${width}-${name}${slice ? `-s${slice}` : ''}.png`;

/** 두 manifest({files: {이름: sha256}})를 견준다. */
export function compareManifests(a, b) {
  const fa = a.files || {}, fb = b.files || {};
  const changed = [], onlyA = [], onlyB = [];
  for (const k of Object.keys(fa).sort()) { if (!(k in fb)) onlyA.push(k); else if (fa[k] !== fb[k]) changed.push(k); }
  for (const k of Object.keys(fb).sort()) if (!(k in fa)) onlyB.push(k);
  return {same: Object.keys(fa).filter(k => fb[k] === fa[k]).length, changed, onlyA, onlyB};
}

// ---------- 페이지에 넣는 코드 ----------
// 시각·난수 고정(문서가 만들어질 때마다 앱보다 먼저 돈다).
const FREEZE = `(() => {
  const RD = Date, T0 = RD.UTC(2026, 10, 25, 1, 0, 0), p0 = performance.now();
  const now = () => T0 + Math.floor(performance.now() - p0);
  function FD(...a) { if (!new.target) return new RD(now()).toString(); return a.length ? new RD(...a) : new RD(now()); }
  FD.prototype = RD.prototype; FD.now = now; FD.parse = RD.parse; FD.UTC = RD.UTC;
  window.Date = FD;
  let s = 20261125; Math.random = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
})();`;
const STILL_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
const HIDE_TOAST_CSS = '.toast{visibility:hidden!important}';

// 화면을 여는 코드. steps 를 차례로 하고 {ok, detail, found, slices} 를 돌려준다.
const pageOpen = (screen, theme, deny, phase = 'open') => `(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 5000) => { const t0 = performance.now(); for (;;) { let v; try { v = fn(); } catch { v = null; } if (v) return v; if (performance.now() - t0 > ms) return null; await wait(80); } };
  const host = await until(() => { const h = document.querySelector('#bwyfgw-workcenter'); return h && h.shadowRoot && h.shadowRoot.querySelector('#main') ? h : null; }, 10000);
  if (!host) return {ok: false, detail: 'GW 비서가 열리지 않음'};
  const root = host.shadowRoot, $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const sc = ${JSON.stringify(screen)};
  const still = () => { for (const r of [root, document]) { if (r.querySelector('style[data-snap]')) continue; const st = document.createElement('style'); st.dataset.snap = '1'; st.textContent = ${JSON.stringify(STILL_CSS)} + (sc.toast ? '' : ${JSON.stringify(HIDE_TOAST_CSS)}); (r === document ? document.head : r).append(st); } };
  still();
  await until(() => $('#main').innerText.trim().length > 20, 8000);
  await wait(900);
  const deny = new Set(${JSON.stringify([...deny.acts])}), denyText = new RegExp(${JSON.stringify(deny.text)});
  const click = async (sel, ms = 3000) => {
    const el = await until(() => $$(sel).find(e => e.offsetParent !== null || e.getClientRects().length) || null, ms);
    if (!el) return '못 찾음: ' + sel;
    if (deny.has(el.dataset.act) || denyText.test((el.innerText || '').trim())) return '누르지 않는 버튼: ' + sel;
    el.click(); await wait(350); return '';
  };
  const clearToast = () => { if (!sc.toast) for (const t of $$('.toast')) t.remove(); };
  // 어두운 화면: 1단계에서 메뉴로 바꿔 저장해 두고, 다시 읽어 들인 2단계는 처음부터 어두운 화면으로 시작한다(메뉴를 누른 흔적이 남지 않게).
  if (${JSON.stringify(phase)} === 'theme') {
    let e = await click('[data-act="menuView"]'); if (!e) e = await click('#overlay [data-act="theme"]');
    if (e) return {ok: false, detail: '어두운 화면으로 바꾸지 못함: ' + e};
    await wait(300);
    return $('#wc').classList.contains('dark') ? {ok: true} : {ok: false, detail: '어두운 화면이 적용되지 않음'};
  }
  if ($('#wc').classList.contains('dark') !== (${JSON.stringify(theme)} === 'dark')) return {ok: false, detail: '테마가 맞지 않음'};
  // 늦게 채워지는 메뉴 배지·할 일 개수까지 기다린다.
  await wait(1600);
  if (!sc.notice) { const ack = $('[data-act="govAck"]'); if (ack) { ack.click(); await wait(300); } }
  if (sc.view) {
    const v = sc.view;
    const on = await until(() => (sc.onSel && $(sc.onSel)) || $('#nav a[data-v="' + v + '"][aria-current="page"]') || $('[data-act="view"][data-v="' + v + '"][aria-selected="true"]') || $('[data-act="view"][data-v="' + v + '"][aria-pressed="true"]'), 3000);
    if (!on) return {ok: false, detail: '화면이 열리지 않음(쓸 수 없는 화면일 수 있음): ' + v};
  }
  for (const st of sc.steps || []) {
    if (st.click) { const e = await click(st.click); if (e) return {ok: false, detail: e}; }
    else if (st.wait) await wait(st.wait);
    else if (st.until) { if (!await until(() => $(st.until), st.ms || 4000)) return {ok: false, detail: '나타나지 않음: ' + st.until}; }
    else if (st.ask) {
      const input = await until(() => $('#chInput'), 4000); if (!input) return {ok: false, detail: '입력칸 없음'};
      const before = $$('.ch-msg').length;
      input.focus(); input.value = st.ask; input.dispatchEvent(new Event('input', {bubbles: true}));
      const e = await click('[data-act="chatSend"]'); if (e) return {ok: false, detail: e};
      await until(() => $$('.ch-msg').length > before + 1, 6000);
      await until(() => !$('.ch-dots') && !$$('.ch-tool').some(t => /run/.test(t.className)), 12000);
      await wait(400);
    }
  }
  if (sc.each) return {ok: true, found: [...new Set($$(sc.each).map(e => e.dataset.v).filter(Boolean))]};
  clearToast();
  still();
  if (root.activeElement && root.activeElement.blur && !sc.keepFocus && !(sc.steps || []).some(s => s.ask)) { /* 누른 버튼의 초점 표시는 그대로 둔다: 화면마다 같다 */ }
  const m = $('#main');
  const slices = sc.scroll && m ? Math.max(1, Math.min(${MAX_SLICES}, Math.ceil((m.scrollHeight - 2) / Math.max(1, m.clientHeight)))) : 1;
  return {ok: true, slices};
})()`;

// ---------- 브라우저 ----------
// 그리기 스레드 하나·부분 다시 그리기 끔: 둥근 모서리 가장자리가 찍을 때마다 몇 픽셀씩 달라지는 것을 막는다.
async function launch(exe, userDir, headed) {
  const args = [`--user-data-dir=${userDir}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-gpu', '--num-raster-threads=1', '--disable-partial-raster', '--force-device-scale-factor=1', ...(process.env.SNAP_FLAGS ? process.env.SNAP_FLAGS.split(' ') : []), '--font-render-hinting=none', '--disable-lcd-text', '--window-size=1440,1000', '--lang=ko-KR'];
  if (!headed) args.push('--headless=new');
  if (process.platform === 'linux') args.push('--no-sandbox');
  args.push('about:blank');
  const child = spawn(exe, args, {stdio: ['ignore', 'ignore', 'pipe']});
  const ws = await new Promise((resolve, reject0) => {
    const reject = e => { try { child.kill(); } catch {} reject0(e); };
    let buf = '';
    const timer = setTimeout(() => reject(new Error('브라우저가 20초 안에 준비되지 않았습니다')), 20000);
    child.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`브라우저가 바로 끝났습니다(코드 ${code}): ${buf.slice(-300)}`)); });
    child.once('error', e => { clearTimeout(timer); reject(e); });
  });
  return {child, ws};
}

function cdp(wsUrl) {
  const sock = new WebSocket(wsUrl);
  let id = 0;
  const waiting = new Map(), listeners = new Set();
  sock.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { const {resolve, reject} = waiting.get(m.id); waiting.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    else if (m.method) for (const fn of listeners) fn(m);
  });
  return {
    ready: new Promise((resolve, reject) => { sock.addEventListener('open', resolve, {once: true}); sock.addEventListener('error', () => reject(new Error('DevTools 연결 실패')), {once: true}); }),
    send: (method, params = {}, sessionId) => new Promise((resolve, reject) => { const i = ++id; waiting.set(i, {resolve, reject}); sock.send(JSON.stringify({id: i, method, params, ...(sessionId ? {sessionId} : {})})); }),
    on: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    close: () => { try { sock.close(); } catch {} },
  };
}

const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} ${ms / 1000}초 초과`)), ms))]);
const sha = buf => createHash('sha256').update(buf).digest('hex');

/** 새 브라우저 문맥(저장소 따로)에서 화면 하나를 열고 찍는다. 돌려주는 값: {shots: [{file, buf}], found, error} */
async function shootOne(conn, baseUrl, screen, theme, width, deny) {
  const {browserContextId} = await conn.send('Target.createBrowserContext', {disposeOnDetach: true});
  let targetId;
  try {
    ({targetId} = await conn.send('Target.createTarget', {url: 'about:blank', browserContextId}));
    const {sessionId} = await conn.send('Target.attachToTarget', {targetId, flatten: true});
    const S = (m, p) => conn.send(m, p, sessionId);
    await S('Page.enable');
    await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', {width, height: HEIGHT, deviceScaleFactor: 1, mobile: false});
    await S('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}, {name: 'prefers-color-scheme', value: 'light'}]});
    await S('Emulation.setTimezoneOverride', {timezoneId: 'Asia/Seoul'}).catch(() => {});
    await S('Emulation.setLocaleOverride', {locale: 'ko-KR'}).catch(() => {});
    await S('Emulation.setFocusEmulationEnabled', {enabled: true}).catch(() => {});
    await S('Page.addScriptToEvaluateOnNewDocument', {source: FREEZE});
    const loaded = new Promise(resolve => { const off = conn.on(m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { off(); resolve(); } }); });
    const q = screen.query != null ? screen.query : `?gw-view=${encodeURIComponent(screen.view || 'home')}`;
    await S('Page.navigate', {url: baseUrl + q});
    await timeout(loaded, 15000, '둘러보기 열기');
    const run = phase => timeout(S('Runtime.evaluate', {expression: pageOpen(screen, theme, deny, phase), awaitPromise: true, returnByValue: true, userGesture: true}), 60000, '화면 열기');
    const loadedOnce = () => new Promise(resolve => { const off = conn.on(m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { off(); resolve(); } }); });
    if (theme === 'dark') {
      const t = await run('theme');
      const tv = t.result && t.result.value;
      if (t.exceptionDetails || !tv || !tv.ok) return {error: (tv && tv.detail) || '어두운 화면으로 바꾸지 못함'};
      const again = loadedOnce();
      await S('Page.reload', {ignoreCache: false});
      await timeout(again, 15000, '다시 읽기');
    }
    const r = await run('open');
    if (r.exceptionDetails) return {error: '스크립트 오류: ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300)};
    const v = r.result.value || {};
    if (!v.ok) return {error: v.detail || '열지 못함'};
    if (screen.each) return {found: v.found || []};
    await S('Runtime.evaluate', {expression: 'document.fonts.ready.then(() => 1)', awaitPromise: true});
    const shots = [];
    for (let i = 0; i < (v.slices || 1); i++) {
      if (i) {
        await S('Runtime.evaluate', {expression: `(() => { const m = document.querySelector('#bwyfgw-workcenter').shadowRoot.querySelector('#main'); m.scrollTop = ${i} * m.clientHeight; return m.scrollTop; })()`, returnByValue: true});
      }
      // 두 번 연속 같은 그림이 나올 때까지 찍는다(늦게 그려지는 것 기다리기).
      let prev = null, buf = null, stable = false, same = 0;
      for (let k = 0; k < 12; k++) {
        await new Promise(res => setTimeout(res, k ? 250 : 200));
        buf = Buffer.from((await S('Page.captureScreenshot', {format: 'png'})).data, 'base64');
        same = prev && prev.equals(buf) ? same + 1 : 0;
        if (same >= 2) { stable = true; break; }
        prev = buf;
      }
      shots.push({file: fileName(theme, width, screen.name, i), buf, stable});
    }
    return {shots};
  } finally {
    if (targetId) await conn.send('Target.closeTarget', {targetId}).catch(() => {});
    await conn.send('Target.disposeBrowserContext', {browserContextId}).catch(() => {});
  }
}

async function pool(items, jobs, fn) {
  let next = 0;
  await Promise.all(Array.from({length: Math.min(jobs, items.length)}, async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } }));
}

/** 둘러보기를 빌드해 모든 화면을 찍어 outDir 에 저장한다. 돌려주는 값: manifest */
export async function snap({outDir, themes = THEMES, widths = WIDTHS, only = '', jobs = 4, headed = false, log = () => {}} = {}) {
  const exe = findBrowser();
  if (!exe) { const e = new Error('Chrome·Edge·Chromium 을 찾지 못했습니다. BROWSER_PATH 로 경로를 알려 주세요.'); e.code = 'NO_BROWSER'; throw e; }
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-snap-'));
  const deny = {acts: DENY_ACTS, text: DENY_TEXT.source};
  let child, conn, server;
  const t0 = Date.now();
  try {
    const demo = await buildDemo(path.join(tmp, 'demo'));
    server = await serveDemo({outDir: path.join(tmp, 'demo'), port: 0, rebuild: false});
    const baseUrl = `http://127.0.0.1:${server.address().port}/`;
    const l = await launch(exe, path.join(tmp, 'profile'), headed);
    child = l.child; conn = cdp(l.ws); await conn.ready;
    // each 화면 펼치기: 넓은 밝은 화면에서 버튼 값을 찾는다.
    const picked = SCREENS.filter(s => !only || s.name.includes(only) || (s.each && only.startsWith(s.name)));
    const found = {};
    await pool(picked.filter(s => s.each), jobs, async s => { const r = await shootOne(conn, baseUrl, s, 'light', 1366, deny).catch(e => ({error: e.message})); found[s.name] = r.found || []; if (r.error) log(`  펼치지 못함 ${s.name}: ${r.error}`); });
    const screens = expandScreens(picked, found).filter(s => !only || s.name.includes(only));
    await fs.rm(outDir, {recursive: true, force: true});
    await fs.mkdir(outDir, {recursive: true});
    const tasks = [];
    for (const theme of themes) for (const width of widths) for (const s of screens) tasks.push({theme, width, s});
    const manifest = {version: demo.version, browser: path.basename(exe), at: new Date().toISOString(), themes, widths, screens: screens.map(s => s.name), files: {}, skipped: [], unstable: []};
    let done = 0;
    await pool(tasks, jobs, async ({theme, width, s}) => {
      let r;
      for (let attempt = 0; attempt < 2; attempt++) { r = await shootOne(conn, baseUrl, s, theme, width, deny).catch(e => ({error: e.message})); if (!r.error || !/초과|연결/.test(r.error)) break; }
      done++;
      if (r.error) { manifest.skipped.push({screen: s.name, theme, width, reason: r.error}); log(`  [${done}/${tasks.length}] 건너뜀 ${theme}-${width}-${s.name}: ${r.error}`); return; }
      for (const sh of r.shots) {
        await fs.writeFile(path.join(outDir, sh.file), sh.buf);
        manifest.files[sh.file] = sha(sh.buf);
        if (!sh.stable) manifest.unstable.push(sh.file);
      }
      if (done % 20 === 0) log(`  [${done}/${tasks.length}] …`);
    });
    manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
    manifest.skipped.sort((a, b) => `${a.theme}${a.width}${a.screen}`.localeCompare(`${b.theme}${b.width}${b.screen}`));
    manifest.unstable.sort();
    manifest.seconds = Math.round((Date.now() - t0) / 1000);
    await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return manifest;
  } finally {
    if (conn) { try { await Promise.race([conn.send('Browser.close'), new Promise(r => setTimeout(r, 2000))]); } catch {} conn.close(); }
    if (child && child.exitCode === null) { await new Promise(r => { const t = setTimeout(() => { try { child.kill(); } catch {} r(); }, 3000); child.once('exit', () => { clearTimeout(t); r(); }); }); }
    if (server) await new Promise(r => server.close(r));
    for (let i = 0; i < 5; i++) { try { await fs.rm(tmp, {recursive: true, force: true}); break; } catch { await new Promise(r => setTimeout(r, 400)); } }
  }
}


/** PNG(8비트, 비월 없음)를 풀어 {w, h, ch, px} 로 돌려준다. 차이 영역을 알려 주는 데에만 쓴다. */
export function decodePng(buf) {
  let p = 8, w = 0, h = 0, ch = 4; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[12]) throw new Error('지원하지 않는 PNG'); ch = {0: 1, 2: 3, 4: 2, 6: 4}[data[9]]; }
    else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[o + x - ch] : 0, b = y ? px[o - stride + x] : 0, c = x >= ch && y ? px[o - stride + x - ch] : 0;
      let v = src[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v & 255;
    }
  }
  return {w, h, ch, px};
}

/** 두 PNG에서 다른 픽셀 수와 그 영역(x, y, 너비, 높이). 크기가 다르면 size 를 적는다. */
export function pngDiff(a, b) {
  const A = decodePng(a), B = decodePng(b);
  if (A.w !== B.w || A.h !== B.h || A.ch !== B.ch) return {size: `${A.w}x${A.h} / ${B.w}x${B.h}`};
  let n = 0, x0 = A.w, y0 = A.h, x1 = -1, y1 = -1;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * A.ch;
    if (A.px.compare(B.px, i, i + A.ch, i, i + A.ch)) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return n ? {pixels: n, box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1]} : {pixels: 0};
}

export async function compareDirs(a, b) {
  const read = async d => JSON.parse(await fs.readFile(path.join(d, 'manifest.json'), 'utf8'));
  const [ma, mb] = [await read(a), await read(b)];
  return {...compareManifests(ma, mb), skippedA: ma.skipped || [], skippedB: mb.skipped || []};
}

function printCompare(r, a, b) {
  console.log(`같은 화면 ${r.same}장 · 다른 화면 ${r.changed.length}장 · ${path.basename(a)}에만 ${r.onlyA.length}장 · ${path.basename(b)}에만 ${r.onlyB.length}장`);
  for (const f of r.changed) { let d = ''; try { const x = pngDiff(readFileSync(path.join(a, f)), readFileSync(path.join(b, f))); d = x.size ? ` (크기 ${x.size})` : ` (${x.pixels}픽셀, 영역 x${x.box[0]} y${x.box[1]} ${x.box[2]}×${x.box[3]})`; } catch {} console.log(`  다름  ${f}${d}`); }
  for (const f of r.onlyA) console.log(`  ${path.basename(a)}에만  ${f}`);
  for (const f of r.onlyB) console.log(`  ${path.basename(b)}에만  ${f}`);
  return r.changed.length + r.onlyA.length + r.onlyB.length === 0;
}

function printManifest(m, dir) {
  console.log(`찍은 그림 ${Object.keys(m.files).length}장 · 화면 ${m.screens.length}개 × ${m.themes.join('/')} × ${m.widths.join('/')}px · ${m.seconds}초 → ${path.relative(ROOT, dir) || dir}`);
  if (m.skipped.length) { console.log(`찍지 못한 화면 ${m.skipped.length}건:`); for (const s of m.skipped) console.log(`  ${s.theme}-${s.width}-${s.screen}: ${s.reason}`); }
  if (m.unstable.length) console.log(`안정되지 않은 그림 ${m.unstable.length}장: ${m.unstable.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const list = (v, d) => v ? v.split(',').map(x => x.trim()).filter(Boolean) : d;
  try {
    if (argv.includes('--compare')) {
      const i = argv.indexOf('--compare'), a = path.resolve(argv[i + 1]), b = path.resolve(argv[i + 2]);
      process.exit(printCompare(await compareDirs(a, b), a, b) ? 0 : 1);
    }
    const out = path.resolve(arg('--out') || path.join(ROOT, 'build', 'snap', 'latest'));
    const opts = {themes: list(arg('--themes'), THEMES), widths: list(arg('--widths'), WIDTHS).map(Number), only: arg('--only') || '', jobs: Number(arg('--jobs') || 4), headed: argv.includes('--headed'), log: s => console.log(s)};
    if (argv.includes('--twice')) {
      const [da, db] = [path.join(out, 'a'), path.join(out, 'b')];
      printManifest(await snap({...opts, outDir: da}), da);
      printManifest(await snap({...opts, outDir: db}), db);
      process.exit(printCompare(await compareDirs(da, db), da, db) ? 0 : 1);
    }
    printManifest(await snap({...opts, outDir: out}), out);
    process.exit(0);
  } catch (e) {
    console.error((e && e.message) || e);
    process.exit(e && e.code === 'NO_BROWSER' ? 2 : 1);
  }
}
