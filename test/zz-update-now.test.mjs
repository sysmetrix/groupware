// v0.71~0.73: 자동 최신화. 업데이트 확인은 배포 사이트(current.json)를 기준으로 하고, 새 묶음은 무결성이 맞을 때만 실행한다.
// 쓰는 중에는 바꾸지 않는다. Real fragment source, mocked browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash, webcrypto} from 'node:crypto';
import {MOUNT_JS} from '../scripts/live-build.mjs';

const read = f => fs.readFileSync(new URL(`../src/live/wc/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function pick(file, head) {
  const s = read(file);
  const i = s.indexOf(`\n  ${head}`);
  assert.ok(i >= 0, `${head} not found in ${file}`);
  const end = head.startsWith('const ') ? s.indexOf('\n', i + 1) : s.indexOf('\n  }\n', i) + 4;
  return s.slice(i + 1, end);
}
const spy = (impl = () => {}) => { const f = (...a) => { f.calls.push(a); return impl(...a); }; f.calls = []; return f; };
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; };
const sha = s => createHash('sha256').update(s).digest('hex');
const res = (body, ok = true) => ({ok, status: ok ? 200 : 404, json: async () => JSON.parse(body), text: async () => body});
const BASE = 'https://sysmetrix.github.io/groupware/';
const GOV = ['const UPDATE_BASE', 'const UPDATE_CACHE', 'async function updateFetch(', 'async function updateStore(', 'function updateApply(', 'async function updateNow(', 'async function autoUpdate(', 'function autoUpdateApply('];

function fakeCaches() {
  const map = new Map();
  const cache = {keys: async () => [...map.keys()], delete: async k => map.delete(k), put: async (k, r) => { map.set(k, r); }, match: async k => map.get(k)};
  return {map, open: async () => cache};
}
function env({bundle = '/*! BWYF groupware live bundle v0.99.0 */window.NEW = 1;'.padEnd(1200, ' '), claimed, demo = false, policy = true, leave = true, ext = false, open = false, settings = {}, latest = '0.99.0', fetchImpl} = {}) {
  const hash = claimed || sha(bundle);
  const ls = new Map(), ss = new Map(), caches = fakeCaches();
  const g = {
    VERSION: '0.71.0', R: {compareVersions: cmp}, S: {open, settings}, allowed: f => f !== 'updateCheck' || policy, toast: spy(), logError: spy(), leavePane: spy(() => leave), renderNav: spy(),
    checkUpdate: spy(async () => (latest ? {latest} : {latest: '', err: 'x'})),
    crypto: webcrypto, TextEncoder, Uint8Array, Array, Error, Response,
    localStorage: {getItem: k => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v)}, sessionStorage: {getItem: k => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, v)},
    fetch: spy(fetchImpl || (async url => (url === BASE + 'current.json' ? res(JSON.stringify({sha256: hash, file: `gw-live-${hash}.js`, version: '0.99.0'})) : url === `${BASE}gw-live-${hash}.js` ? res(bundle) : res('', false)))),
  };
  g.window = {BWYFGW_DEMO: demo, BWYFGW_EXT: ext ? 1 : undefined, caches, BWYFGW_WC: {open: spy(), mount: spy()}};
  const ctx = vm.createContext({setTimeout, clearTimeout, Promise, Date, URL, JSON, String, ...g});
  ctx.eval = spy();
  const api = vm.runInContext(`${GOV.map(h => pick('21-governance.js', h)).join('\n')}\n;({updateNow, autoUpdate, autoUpdateApply})`, ctx);
  return {g, ctx, fn: api.updateNow, api, bundle, ls, ss, caches, hash};
}

test('updateNow runs the new bundle only after the SHA-256 matches, then opens it', async () => {
  const e = env();
  await e.fn();
  assert.deepEqual(e.g.fetch.calls.map(c => c[0]), [BASE + 'current.json', `${BASE}gw-live-${sha(e.bundle)}.js`]);
  for (const c of e.g.fetch.calls) assert.deepEqual({...c[1]}, {cache: 'no-store', credentials: 'omit', redirect: 'error'}, 'no cookies, no redirects');
  assert.equal(e.ctx.eval.calls.length, 1);
  assert.equal(e.ctx.eval.calls[0][0], e.bundle);
  assert.equal(e.g.window.BWYFGW_WC.open.calls.length, 1);
  assert.equal(e.caches.map.size, 0, 'nothing is kept in the browser unless the extension is the launcher');
  assert.equal(e.ls.size, 0);
});

test('updateNow refuses a bundle whose hash differs and leaves the running screen alone', async () => {
  const e = env({claimed: 'a'.repeat(64)});
  await e.fn();
  assert.equal(e.ctx.eval.calls.length, 0, 'a tampered or truncated file is never executed');
  assert.equal(e.g.window.BWYFGW_WC.open.calls.length, 0);
  assert.match(e.g.toast.calls.at(-1)[0], /바꾸지 못했습니다\(실행 파일 무결성 확인 실패\)/);
  assert.equal(e.g.S.updBusy, false, 'the button works again after a failure');
  // 버전 정보의 파일 이름이 해시와 다르면 받지도 않는다
  const odd = env({fetchImpl: async () => res(JSON.stringify({sha256: 'b'.repeat(64), file: 'evil.js'}))});
  await odd.fn();
  assert.equal(odd.g.fetch.calls.length, 1);
  assert.equal(odd.ctx.eval.calls.length, 0);
});

test('updateNow does nothing in the demo, when the policy turns it off, or while the user keeps unsaved work', async () => {
  for (const [opt, msg] of [[{demo: true}, /둘러보기/], [{policy: false}, /관리자 설정/], [{leave: false}, null]]) {
    const e = env(opt);
    await e.fn();
    assert.equal(e.g.fetch.calls.length, 0);
    assert.equal(e.ctx.eval.calls.length, 0);
    if (msg) assert.match(e.g.toast.calls[0][0], msg);
  }
});

test('autoUpdate swaps quietly while only the launcher button is showing, and keeps the copy for the extension', async () => {
  const e = env({ext: true});
  await e.api.autoUpdate();
  assert.equal(e.ctx.eval.calls.length, 1);
  assert.equal(e.g.window.BWYFGW_WC.mount.calls.length, 1, 'the launcher comes back; the work center is not forced open');
  assert.equal(e.g.window.BWYFGW_WC.open.calls.length, 0);
  assert.deepEqual([...e.caches.map.keys()], ['/bwyfgw-wc/' + e.hash]);
  const meta = JSON.parse(e.ls.get('bwyfgw:wc:auto'));
  assert.deepEqual([meta.sha256, meta.version], [e.hash, '0.99.0']);
  // 같은 묶음은 한 탭에서 다시 시도하지 않는다(문제가 있는 배포가 화면을 계속 다시 그리지 않게)
  e.g.S.updReady = {src: e.bundle, sha256: e.hash, version: '0.99.0'};
  assert.equal(e.api.autoUpdateApply(), false);
  assert.equal(e.ctx.eval.calls.length, 1);
});

test('autoUpdate never interrupts an open work center: it waits, then applies on close or on the next open', async () => {
  const e = env({open: true});
  await e.api.autoUpdate();
  assert.equal(e.ctx.eval.calls.length, 0, 'in use: not swapped');
  assert.equal(e.g.S.updReady.version, '0.99.0');
  assert.match(e.g.toast.calls.at(-1)[0], /받아 두었습니다.*닫으면 자동으로/);
  await e.api.autoUpdate();
  assert.equal(e.g.fetch.calls.length, 2, 'the downloaded copy is reused, not fetched again');
  assert.equal(e.g.toast.calls.length, 1, 'told once');
  e.g.S.open = false;
  assert.equal(e.api.autoUpdateApply(), true);
  assert.equal(e.g.window.BWYFGW_WC.mount.calls.length, 1);
  // 다음에 열 때: 받아 둔 것으로 연다
  const again = env({open: true});
  await again.api.autoUpdate();
  assert.equal(again.api.autoUpdateApply(true), true);
  assert.equal(again.g.window.BWYFGW_WC.open.calls.length, 1);
});

test('autoUpdate stays off in the demo, under a blocking policy, when the user turned it off, and when nothing newer exists', async () => {
  for (const opt of [{demo: true}, {policy: false}, {settings: {autoUpdate: false}}, {latest: '0.71.0'}, {latest: ''}]) {
    const e = env(opt);
    await e.api.autoUpdate();
    assert.equal(e.g.fetch.calls.length, 0, JSON.stringify(opt));
    assert.equal(e.ctx.eval.calls.length, 0);
  }
  // 받은 파일이 깨졌으면 조용히 그만둔다(쓰던 화면은 그대로)
  const bad = env({claimed: 'a'.repeat(64)});
  await bad.api.autoUpdate();
  assert.equal(bad.ctx.eval.calls.length, 0);
  assert.equal(bad.g.S.updBusy, false);
  assert.equal(bad.g.toast.calls.length, 0);
});

// ---------- 확장 프로그램의 시작 스크립트 ----------
async function runExtMount({stored, metaVersion = '0.99.0', running = '0.71.0', policyOff = false, corrupt = false, broken = false} = {}) {
  const calls = [], timers = [], ls = new Map(), caches = fakeCaches();
  const src = broken ? 'window.BWYFGW_WC = {version: "0.99.0", mount: () => { calls.push("mount-fail"); throw new Error("boom"); }};' : 'window.BWYFGW_WC = {version: "0.99.0", mount: () => { calls.push("mount-new"); }};';
  if (stored) { ls.set('bwyfgw:wc:auto', JSON.stringify({sha256: sha(src), version: metaVersion})); await (await caches.open()).put('/bwyfgw-wc/' + sha(src), new Response(corrupt ? src + ' ' : src)); }
  const window = {BWYFGW_WC: {version: running, mount: () => { calls.push('mount-bundled'); }}, webpackChunk_app: []};
  if (policyOff) window.BWYFGW_POLICY = {features: {updateCheck: false}};
  window.top = window;
  const document = {visibilityState: 'visible', body: {append() {}}, addEventListener() {}, removeEventListener() {}, createElement: () => ({style: {}, remove() {}})};
  const ctx = vm.createContext({window, document, calls, location: {hash: ''}, setTimeout: f => { timers.push(f); return 0; }, localStorage: {getItem: k => ls.get(k) ?? null, removeItem: k => ls.delete(k)}, caches, crypto: webcrypto, TextEncoder, Uint8Array, Array, JSON, String, Promise, Object});
  ctx.eval = code => vm.runInContext(code, ctx);
  vm.runInContext(MOUNT_JS, ctx);
  await new Promise(r => setTimeout(r, 30));
  return {calls, ls, timers, ext: window.BWYFGW_EXT};
}

test('extension start: uses a newer verified copy kept by auto-update, otherwise the bundled one', async () => {
  assert.deepEqual((await runExtMount()).calls, ['mount-bundled'], 'nothing kept: bundled copy');
  const fresh = await runExtMount({stored: true});
  assert.deepEqual(fresh.calls, ['mount-new']);
  assert.equal(fresh.ext, 1, 'tells the work center it runs from the extension');
  assert.deepEqual((await runExtMount({stored: true, metaVersion: '0.71.0'})).calls, ['mount-bundled'], 'a kept copy that is not newer is ignored');
  assert.deepEqual((await runExtMount({stored: true, policyOff: true})).calls, ['mount-bundled'], 'policy can pin the bundled version');
  const bad = await runExtMount({stored: true, corrupt: true});
  assert.deepEqual(bad.calls, ['mount-bundled'], 'a copy that fails the hash check is never run');
  assert.equal(bad.ls.has('bwyfgw:wc:auto'), false, 'and is forgotten');
  // 받아 둔 묶음이 실행은 되지만 버튼을 띄우지 못하면, 끝내 잊어서 다음 새로고침에는 함께 설치된 묶음으로 돌아간다
  const broken = await runExtMount({stored: true, broken: true});
  for (let i = 0; i < 40; i++) broken.timers[i]();
  assert.equal(broken.ls.has('bwyfgw:wc:auto'), false);
});

test('extension start: the launcher still appears when the groupware app is not recognised in time', () => {
  const calls = [], timers = [], notes = [];
  const window = {BWYFGW_WC: {mount: () => { calls.push('mount'); }}};
  window.top = window;
  const document = {visibilityState: 'visible', body: {append: d => notes.push(d.textContent)}, addEventListener() {}, removeEventListener() {}, createElement: () => ({style: {}, remove() {}})};
  vm.runInContext(MOUNT_JS, vm.createContext({window, document, location: {hash: ''}, setTimeout: f => { timers.push(f); return timers.length; }, Object, String}));
  assert.deepEqual(calls, []);
  for (let i = 0; i < 40; i++) timers[i]();
  assert.deepEqual(calls, ['mount'], 'after ~20 s the button is mounted anyway');
  assert.deepEqual(notes, []);
});

test('checkUpdate trusts the published site first and falls back to the GitHub release', async () => {
  const make = fetchImpl => {
    const saved = [];
    const g = {VERSION: '0.71.0', R: {compareVersions: cmp}, allowed: () => true, store: {get: () => null, set: (k, v) => saved.push(v)}, AbortController, fetch: spy(fetchImpl)};
    const fn = vm.runInContext(`${pick('21-governance.js', 'const UPDATE_BASE')}\n${pick('21-governance.js', 'async function checkUpdate(')}\n;(checkUpdate)`, vm.createContext({setTimeout, clearTimeout, Promise, Date, URL, JSON, String, ...g}));
    return {g, fn, saved};
  };
  const pages = make(async () => res(JSON.stringify({sha256: 'c'.repeat(64), file: 'x', version: '0.72.0'})));
  const a = await pages.fn(true);
  assert.equal(a.latest, '0.72.0'); assert.equal(a.src, 'pages');
  assert.equal(pages.g.fetch.calls.length, 1, 'no GitHub request when the site answered');
  // 배포 사이트가 버전을 알려 주지 않으면(예전 배포) 릴리스로 확인한다
  const fallback = make(async url => (String(url).startsWith(BASE) ? res(JSON.stringify({sha256: 'c'.repeat(64), file: 'x'})) : res(JSON.stringify({tag_name: 'v0.68.0', html_url: 'https://github.com/sysmetrix/groupware/releases/tag/v0.68.0'}))));
  const b = await fallback.fn(true);
  assert.equal(b.latest, '0.68.0');
  assert.equal(fallback.g.fetch.calls.length, 2);
  // 둘 다 실패하면 "최신"이라고 하지 않는다
  const down = make(async () => { throw new Error('network'); });
  const c = await down.fn(true);
  assert.equal(c.latest, ''); assert.match(c.err, /network/);
});
