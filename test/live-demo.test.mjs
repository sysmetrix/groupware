// 둘러보기(데모): 지어낸 자료만 쓰고 그룹웨어에 요청하지 않으며, 실제 분석기가 그대로 받아들이는 모양이어야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {analyze} from '../src/live/briefing.mjs';
import {stripCommentLines, syntaxError} from '../scripts/live-build.mjs';
import {buildDemo, serveDemo} from '../scripts/live-demo.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const demoSrc = () => fs.readFile(path.join(root, 'src', 'live', 'demo', 'demo-collector.browser.js'), 'utf8');

async function loadDemoCollector() {
  const window = {};
  const sandbox = {window, location: {origin: 'http://127.0.0.1:3220', href: 'http://127.0.0.1:3220/'}, performance, setTimeout, URL, URLSearchParams, Date, Math, Intl};
  // fetch·XMLHttpRequest를 주지 않는다: 네트워크를 쓰려 하면 바로 ReferenceError가 난다.
  vm.runInNewContext(await demoSrc(), sandbox, {filename: 'demo-collector.browser.js'});
  return window;
}

test('demo collector never names the real groupware or a network API', async () => {
  const src = await demoSrc();
  for (const banned of ['gw.bwyf.or.kr', 'fetch(', 'XMLHttpRequest', 'webpackChunk', 'sessionStorage', 'document.cookie']) assert.ok(!src.includes(banned), `데모 수집기에 ${banned} 가 있으면 안 됩니다`);
});

test('demo collector exposes the same API names as the real collector', async () => {
  const real = await fs.readFile(path.join(root, 'src', 'live', 'collector.browser.js'), 'utf8');
  const block = real.slice(real.indexOf('window.BWYFGW = Object.freeze({') + 'window.BWYFGW = Object.freeze({'.length);
  // 최상위 키만 읽는다: 줄 맨 앞 또는 ", " 뒤의 이름 (값 안쪽의 이름은 세지 않도록 context: () => {...} 본문은 먼저 지운다)
  const body = block.slice(0, block.indexOf('\n  });')).replace(/context: \(\) => \{.*?\},\n/s, 'context,\n');
  const names = [...body.matchAll(/(?:^|, )\s*([A-Za-z]+)(?=: |,)/gm)].map(m => m[1]);
  const {BWYFGW, BWYFGW_DEMO} = await loadDemoCollector();
  assert.equal(BWYFGW_DEMO, true);
  assert.ok(names.length > 25, 'real API list was read');
  for (const n of names) assert.ok(n in BWYFGW, `데모 수집기에 ${n} 이(가) 없습니다`);
});

test('demo snapshot is accepted by the real analyzer and produces work to show', async () => {
  const {BWYFGW} = await loadDemoCollector();
  const raw = await BWYFGW.collect({budget: BWYFGW.defaults.budget});
  assert.equal(raw.sessionExpired, false);
  assert.ok(Object.values(raw.status).every(s => s.ok));
  const a = analyze(raw, null, new Date());
  assert.ok(a.actions.length >= 8, `actions: ${a.actions.length}`);
  assert.ok(a.summary.high >= 1, 'at least one urgent item to demonstrate the urgent state');
  assert.ok(a.status.every(s => s.ok));
  // 부가 조회도 실제 화면이 기대하는 모양으로 돌려준다
  const month = raw.data.attendance.month;
  const [team, planned, res, ledger, found] = await Promise.all([BWYFGW.teamAttendance({from: month.from, to: month.to}), BWYFGW.teamPlanned(), BWYFGW.resourceList(), BWYFGW.budgetLedger({project: 'Y101', bgtCd: '사111'}), BWYFGW.search('청소년')]);
  assert.ok(Array.isArray(team) && planned.apps.length > 0 && res.length > 0);
  assert.equal(ledger.sum, ledger.checkSum);
  assert.ok(found.groups.doc.total > 0);
  await assert.rejects(BWYFGW.call('/ea/ea036A02'), /둘러보기/);
});

test('buildDemo writes a parsable bundle and serveDemo only serves its three files on loopback', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-demo-test-'));
  let server;
  try {
    const r = await buildDemo(dir);
    const bundle = await fs.readFile(path.join(dir, 'gw-demo.js'), 'utf8');
    assert.equal(syntaxError(bundle, 'gw-demo.js'), null);
    assert.ok(bundle.includes('BWYFGW_DEMO = true') && !bundle.includes('wehago-sign'), 'demo bundle carries the demo collector, not the real one');
    assert.ok(bundle.includes(`const VERSION = '${r.version}'`));
    server = await serveDemo({outDir: dir, port: 0, rebuild: false});
    const {address, port} = server.address();
    assert.equal(address, '127.0.0.1');
    const get = p => fetch(`http://127.0.0.1:${port}${p}`);
    assert.equal((await get('/')).status, 200);
    assert.equal((await get('/pane.html')).status, 200);
    assert.equal((await get('/gw-demo.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal((await get('/../package.json')).status, 404);
    assert.equal((await get('/secret.txt')).status, 404);
  } finally { if (server) await new Promise(r => server.close(r)); await fs.rm(dir, {recursive: true, force: true}); }
});

test('stripCommentLines blanks full-line comments, keeps line numbers and never touches template literals', () => {
  const src = ['// head', 'const a = 1; // trailing stays', '  // indented', 'const t = `', '// inside a template', '`;', 'const u = "//not a comment";'].join('\n');
  const out = stripCommentLines(src).split('\n');
  assert.deepEqual(out, ['', 'const a = 1; // trailing stays', '', 'const t = `', '// inside a template', '`;', 'const u = "//not a comment";']);
  const odd = '// keep me\nconst broken = `never closed';
  assert.equal(stripCommentLines(odd), odd, 'unbalanced backticks: file is returned untouched');
  assert.equal(stripCommentLines('const s = `a\\`b`;\n// gone'), 'const s = `a\\`b`;\n', 'an escaped backtick does not open or close a template');
});
