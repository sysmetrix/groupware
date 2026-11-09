// scripts/live-build.mjs: reproducible output, isolated --out-dir, admin policy preservation, launcher rules, syntax CI.
// Every build here goes to a temporary folder; build/live (the real bundle and its policy.js) must stay untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkLiveSyntax, assemble, evaluatePolicy, parseArgs, DEFAULT_POLICY, MOUNT_JS, DEFAULT_OUT_DIR} from '../scripts/live-build.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = path.join(root, 'scripts', 'live-build.mjs');
const runBuild = (...args) => spawnSync(process.execPath, [script, ...args], {cwd: root, encoding: 'utf8'});
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'gw-live-build-test-'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const fingerprint = async f => { try { const st = await fs.stat(f); return {hash: sha(await fs.readFile(f)), mtime: st.mtimeMs}; } catch { return null; } };

const realFiles = ['gw-live.js', 'gw-live.sha256', path.join('extension', 'policy.js'), path.join('extension', 'gw-live.js')].map(f => path.join(DEFAULT_OUT_DIR, f));
let realBefore;
test.before(async () => { realBefore = await Promise.all(realFiles.map(fingerprint)); });
test.after(async () => {
  assert.deepEqual(await Promise.all(realFiles.map(fingerprint)), realBefore, 'build/live must not be touched by tests');
});

test('two builds of identical sources are byte-identical (no build timestamp in code or hash)', async () => {
  const dir = await tmp();
  try {
    const a = runBuild('--out-dir', path.join(dir, 'a'));
    assert.equal(a.status, 0, a.stderr);
    await new Promise(r => setTimeout(r, 20));
    const b = runBuild(`--out-dir=${path.join(dir, 'b')}`);
    assert.equal(b.status, 0, b.stderr);
    for (const f of ['gw-live.js', 'gw-live.sha256', 'bookmarklet.txt', 'bookmarklet-mini.txt', 'install.html', 'extension/manifest.json', 'extension/mount.js', 'extension/policy.js', 'extension/gw-live.js']) {
      assert.equal(sha(await fs.readFile(path.join(dir, 'a', f))), sha(await fs.readFile(path.join(dir, 'b', f))), f);
    }
    const bundle = await fs.readFile(path.join(dir, 'a', 'gw-live.js'), 'utf8');
    assert.equal((await fs.readFile(path.join(dir, 'a', 'gw-live.sha256'), 'utf8')).trim(), sha(bundle), 'sha256 file matches bundle');
    const header = bundle.split('\n')[0];
    assert.doesNotMatch(header, /\d{4}-\d{2}-\d{2}/, 'no date in bundle header');
    assert.doesNotMatch(bundle, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/, 'no ISO build timestamp anywhere in the bundle');
    assert.match(header, new RegExp(`v${JSON.parse(a.stdout).version.replace(/\./g, '\\.')} `), 'header shows the real work center version');
    assert.equal(JSON.parse(a.stdout).sha256, JSON.parse(b.stdout).sha256);
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});

test('assemble is pure and line endings do not change the hash', async () => {
  const part = i => ({file: `${String(i).padStart(2, '0')}-p.js`, src: `  function f${i}() { return ${i}; }`});
  const src = {
    collector: 'window.BWYFGW = {};', css: ':host{all:initial}\n\n.a{color:red}', template: "(() => {\n  const VERSION = '9.9.9';\n  function boot() {\n  const WC_CSS = '/*@WC_CSS@*/';\n  /*@WC_PARTS@*/\n  }\n})();",
    briefing: 'export function x() { return 1; }', parts: Array.from({length: 10}, (_, i) => part(i + 1)),
  };
  const one = assemble(src), two = assemble(structuredClone(src));
  assert.equal(one.bundle, two.bundle);
  assert.equal(one.version, '9.9.9');
  assert.ok(!one.bundle.includes('/*@WC_PARTS@*/') && one.bundle.includes('f10()'));
  assert.throws(() => assemble({...src, template: src.template + '\n  /*@WC_PARTS@*/'}), /exactly one/);
});

test('--out-dir isolates output; unknown options fail instead of writing to build/live', async () => {
  assert.equal(parseArgs([]).outDir, DEFAULT_OUT_DIR);
  assert.equal(parseArgs(['--out-dir', 'x']).outDir, path.resolve('x'));
  assert.equal(parseArgs(['--out-dir=y']).outDir, path.resolve('y'));
  assert.throws(() => parseArgs(['--outdir', 'x']), /알 수 없는 옵션/);
  assert.throws(() => parseArgs(['--out-dir']), /폴더/);
  const r = runBuild('--outdir', 'nowhere');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /알 수 없는 옵션/);
});

test('rebuild keeps an administrator-edited policy.js; default policy is refreshed; broken policy stops the build', async () => {
  const dir = await tmp();
  const policy = path.join(dir, 'extension', 'policy.js');
  try {
    let r = runBuild('--out-dir', dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).policy, 'created');
    assert.equal(await fs.readFile(policy, 'utf8'), DEFAULT_POLICY);

    r = runBuild('--out-dir', dir);
    assert.equal(JSON.parse(r.stdout).policy, 'default');

    // Same values as the default, different formatting: treated as not configured, template rewritten.
    await fs.writeFile(policy, `window.BWYFGW_POLICY = ${JSON.stringify(evaluatePolicy(DEFAULT_POLICY).value)};\n`);
    r = runBuild('--out-dir', dir);
    assert.equal(JSON.parse(r.stdout).policy, 'default');
    assert.equal(await fs.readFile(policy, 'utf8'), DEFAULT_POLICY);

    const configured = DEFAULT_POLICY.replace("orgName: ''", "orgName: '부천여성청소년재단'").replace('enabled: true', 'enabled: false').replace('recorder: true', 'recorder: false');
    assert.notEqual(configured, DEFAULT_POLICY);
    await fs.writeFile(policy, configured);
    r = runBuild('--out-dir', dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).policy, 'preserved');
    assert.equal(await fs.readFile(policy, 'utf8'), configured, 'admin policy kept byte-for-byte');
    assert.equal(evaluatePolicy(configured).value.enabled, false);

    const bundleBefore = await fs.readFile(path.join(dir, 'gw-live.js'));
    const broken = "window.BWYFGW_POLICY = { enabled: false,, };\n";
    await fs.writeFile(policy, broken);
    await fs.writeFile(path.join(dir, 'gw-live.js'), 'sentinel');
    r = runBuild('--out-dir', dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /관리자 정책/);
    assert.equal(await fs.readFile(policy, 'utf8'), broken, 'broken admin policy is not replaced by defaults');
    assert.equal(await fs.readFile(path.join(dir, 'gw-live.js'), 'utf8'), 'sentinel', 'nothing written when the build stops');
    assert.ok(bundleBefore.length > 1000);

    assert.equal(evaluatePolicy('window.BWYFGW_POLICY = 3;').ok, false);
    assert.equal(evaluatePolicy('while (true) {}').ok, false, 'runaway policy code times out');
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});

function runMount({hash = '', visibility = 'visible', top = true, appLoaded = true} = {}) {
  const calls = [], listeners = {}, timers = [];
  const document = {
    visibilityState: visibility, body: {append() {}},
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter(x => x !== f); },
    createElement: () => ({style: {}, remove() {}}),
  };
  const window = {BWYFGW_WC: {mount: () => { calls.push('mount'); return true; }}};
  if (appLoaded) window.webpackChunk_app = [];
  window.top = top ? window : {};
  const ctx = vm.createContext({window, document, location: {hash}, setTimeout: f => { timers.push(f); return timers.length; }});
  for (const k of Object.keys(window)) ctx[k] = window[k];
  vm.runInContext(MOUNT_JS, ctx);
  return {calls, timers, show() { document.visibilityState = 'visible'; for (const f of listeners.visibilitychange || []) f(); }, listeners};
}

test('extension launcher: skips groupware popups and iframes, defers mount (and its data read) in background tabs', () => {
  assert.deepEqual(runMount().calls, ['mount'], 'normal visible app tab mounts');
  for (const hash of ['#popup?MicroModuleCode=ea&callComp=UCAP001&diKeyCode=9', '#/popup?callComp=UFAP003', '#popup']) {
    const r = runMount({hash});
    assert.deepEqual(r.calls, [], hash);
    assert.equal(r.timers.length, 0, `no retries in ${hash}`);
  }
  assert.deepEqual(runMount({hash: '#/UC/UCA/UCA0000?pageCode=UCA0000'}).calls, ['mount'], 'normal app routes still mount');
  assert.deepEqual(runMount({top: false}).calls, [], 'not in frames');
  const bg = runMount({visibility: 'hidden'});
  assert.deepEqual(bg.calls, [], 'hidden tab: no eager mount/refresh');
  assert.equal(bg.timers.length, 0);
  bg.show();
  assert.deepEqual(bg.calls, ['mount'], 'mounts once the tab becomes visible');
  bg.show();
  assert.deepEqual(bg.calls, ['mount'], 'only once');
  const slow = runMount({appLoaded: false});
  assert.deepEqual(slow.calls, []);
  assert.equal(slow.timers.length, 1, 'waits for the groupware app');
});

async function fakeRoot(parts) {
  const dir = await tmp();
  const live = path.join(dir, 'src', 'live');
  await fs.mkdir(path.join(live, 'wc'), {recursive: true});
  await fs.writeFile(path.join(live, 'collector.browser.js'), 'window.BWYFGW = {};\n');
  await fs.writeFile(path.join(live, 'wc-style.css'), ':host{all:initial}\n');
  await fs.writeFile(path.join(live, 'wc-theme.css'), '.a{color:red}\n');
  await fs.writeFile(path.join(live, 'briefing.mjs'), 'export function x() { return 1; }\n');
  await fs.writeFile(path.join(live, 'workcenter.browser.js'), "(() => {\n  'use strict';\n  const VERSION = '9.9.9';\n  function boot() {\n  const WC_CSS = '/*@WC_CSS@*/';\n  /*@WC_PARTS@*/\n  return {};\n  }\n})();\n");
  for (const [name, src] of Object.entries(parts)) await fs.writeFile(path.join(live, 'wc', name), src);
  return dir;
}
const okParts = () => Object.fromEntries(Array.from({length: 10}, (_, i) => [`${String(i + 1).padStart(2, '0')}-p.js`, `  function f${i + 1}() { return f${(i + 1) % 10 + 1}; }\n`]));

test('syntax CI: real fragments and assembled bundle parse', async () => {
  const r = await checkLiveSyntax(root);
  assert.deepEqual(r.errors, []);
  const wc = (await fs.readdir(path.join(root, 'src', 'live', 'wc'))).filter(n => n.endsWith('.js'));
  assert.equal(r.fragments, wc.length, 'every fragment is checked');
});

test('syntax CI: fragment may call other fragments, but a broken fragment or a cross-fragment clash fails with its location', async () => {
  let dir = await fakeRoot(okParts());
  try { assert.deepEqual((await checkLiveSyntax(dir)).errors, [], 'cross-fragment references are fine'); } finally { await fs.rm(dir, {recursive: true, force: true}); }

  dir = await fakeRoot({...okParts(), '05-p.js': '  function f5() {\n    return 1;\n  if (\n}\n'});
  try {
    const {errors} = await checkLiveSyntax(dir);
    const e = errors.find(x => x.file === 'src/live/wc/05-p.js');
    assert.ok(e, JSON.stringify(errors));
    assert.ok(e.line >= 3 && e.line <= 5, `line ${e.line} points into the fragment`);
  } finally { await fs.rm(dir, {recursive: true, force: true}); }

  // Each fragment is valid alone; together they declare the same name twice -> only the assembled check sees it.
  dir = await fakeRoot({...okParts(), '03-p.js': '  let shared = 1;\n', '07-p.js': '  let shared = 2;\n'});
  try {
    const {errors} = await checkLiveSyntax(dir);
    assert.equal(errors.length, 1, JSON.stringify(errors));
    assert.equal(errors[0].file, 'gw-live.js (assembled)');
    assert.match(errors[0].message, /shared/);
    assert.match(errors[0].message, /wc\/07-p\.js/);
  } finally { await fs.rm(dir, {recursive: true, force: true}); }

  // Top-level `return` inside a fragment is legal in boot() and must not be flagged (fragments are not modules).
  dir = await fakeRoot({...okParts(), '10-p.js': '  if (globalThis.x) return {};\n'});
  try { assert.deepEqual((await checkLiveSyntax(dir)).errors, []); } finally { await fs.rm(dir, {recursive: true, force: true}); }
});
