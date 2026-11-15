// v0.71: 업데이트 확인은 배포 사이트(current.json)를 기준으로 하고, "지금 바꾸기"는 무결성이 맞을 때만 새 묶음을 실행한다.
// Real fragment source, mocked browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash, webcrypto} from 'node:crypto';

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

function env({bundle = 'window.NEW = 1;'.padEnd(1200, ' '), claimed, demo = false, policy = true, leave = true, stored = null, fetchImpl} = {}) {
  const hash = claimed || sha(bundle);
  const installed = [];
  const g = {
    S: {}, allowed: f => f !== 'updateCheck' || policy, toast: spy(), logError: spy(), leavePane: spy(() => leave),
    crypto: webcrypto, TextEncoder, Uint8Array, Array, Error,
    localStorage: {getItem: k => (k === 'bwyfgw:wc:src' ? stored : null)},
    fetch: spy(fetchImpl || (async url => (url === BASE + 'current.json' ? res(JSON.stringify({sha256: hash, file: `gw-live-${hash}.js`, version: '0.99.0'})) : url === `${BASE}gw-live-${hash}.js` ? res(bundle) : res('', false)))),
  };
  g.window = {BWYFGW_DEMO: demo, BWYFGW_WC: {open: spy(), install: spy(src => { installed.push(src); return true; })}};
  const ctx = vm.createContext({setTimeout, clearTimeout, Promise, Date, URL, JSON, String, ...g});
  ctx.eval = spy();
  const fn = vm.runInContext(`${pick('21-governance.js', 'const UPDATE_BASE')}\n${pick('21-governance.js', 'async function updateNow(')}\n;(updateNow)`, ctx);
  return {g, ctx, fn, bundle, installed};
}

test('updateNow runs the new bundle only after the SHA-256 matches, then opens it', async () => {
  const e = env();
  await e.fn();
  assert.deepEqual(e.g.fetch.calls.map(c => c[0]), [BASE + 'current.json', `${BASE}gw-live-${sha(e.bundle)}.js`]);
  for (const c of e.g.fetch.calls) assert.deepEqual({...c[1]}, {cache: 'no-store', credentials: 'omit', redirect: 'error'}, 'no cookies, no redirects');
  assert.equal(e.ctx.eval.calls.length, 1);
  assert.equal(e.ctx.eval.calls[0][0], e.bundle);
  assert.equal(e.g.window.BWYFGW_WC.open.calls.length, 1);
  assert.equal(e.installed.length, 0, 'nothing is stored unless an installed copy already exists');
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

test('updateNow refreshes the copy kept by the old install bookmark so the next launch is also new', async () => {
  const e = env({stored: 'old bundle'});
  await e.fn();
  assert.deepEqual(e.installed, [e.bundle]);
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
