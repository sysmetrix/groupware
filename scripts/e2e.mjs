// 핵심 여정 자동 검사: 둘러보기(지어낸 자료)를 실제 브라우저에 띄워 scripts/journeys.browser.js 를 돌린다.
// Usage: node scripts/e2e.mjs [--json] [--headed] [--script <file>] [--keep]
//   설치된 Chrome·Edge·Chromium 을 찾아 쓴다(패키지 설치 없음). 못 찾으면 종료 코드 2.
//   다른 브라우저를 쓰려면 환경 변수 BROWSER_PATH 에 실행 파일 경로를 준다.
// 그룹웨어에는 요청을 보내지 않는다. 실제 그룹웨어 화면의 동작은 이 검사가 증명하지 않는다(실화면 스모크가 따로 있다).
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROOT} from './live-build.mjs';
import {buildDemo, serveDemo} from './live-demo.mjs';

/** 설치된 Chromium 계열 브라우저의 실행 파일 경로. 없으면 ''. */
export function findBrowser(env = process.env, platform = process.platform) {
  if (env.BROWSER_PATH) return existsSync(env.BROWSER_PATH) ? env.BROWSER_PATH : '';
  const list = [];
  if (platform === 'win32') {
    for (const base of [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean)) {
      list.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
  } else if (platform === 'darwin') {
    list.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      const r = spawnSync('which', [name], {encoding: 'utf8'});
      if (r.status === 0 && r.stdout.trim()) list.push(r.stdout.trim().split('\n')[0]);
    }
  }
  return list.find(p => existsSync(p)) || '';
}

/** 브라우저를 창 없이 띄우고 DevTools 주소를 돌려준다. */
async function launch(exe, userDir, headed) {
  const args = [`--user-data-dir=${userDir}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-gpu', '--window-size=1440,900', '--lang=ko-KR'];
  if (!headed) args.push('--headless=new');
  if (process.platform === 'linux') args.push('--no-sandbox'); // CI 컨테이너에서는 샌드박스를 쓸 수 없다. 여는 주소는 127.0.0.1 의 둘러보기뿐이다.
  args.push('about:blank');
  const child = spawn(exe, args, {stdio: ['ignore', 'ignore', 'pipe']});
  const ws = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('브라우저가 20초 안에 준비되지 않았습니다')), 20000);
    child.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`브라우저가 바로 끝났습니다(코드 ${code}): ${buf.slice(-300)}`)); });
    child.once('error', e => { clearTimeout(timer); reject(e); });
  });
  return {child, ws};
}

/** DevTools 프로토콜 연결(가장 작은 구현). send(method, params, sessionId) → 결과. */
function cdp(wsUrl) {
  const sock = new WebSocket(wsUrl);
  let id = 0;
  const waiting = new Map(), listeners = [];
  sock.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { const {resolve, reject} = waiting.get(m.id); waiting.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    else if (m.method) for (const fn of listeners) fn(m);
  });
  return {
    ready: new Promise((resolve, reject) => { sock.addEventListener('open', resolve, {once: true}); sock.addEventListener('error', () => reject(new Error('DevTools 연결 실패')), {once: true}); }),
    send: (method, params = {}, sessionId) => new Promise((resolve, reject) => { const i = ++id; waiting.set(i, {resolve, reject}); sock.send(JSON.stringify({id: i, method, params, ...(sessionId ? {sessionId} : {})})); }),
    on: fn => listeners.push(fn),
    close: () => { try { sock.close(); } catch {} },
  };
}

/**
 * 둘러보기를 띄우고 스크립트를 실행한다. 스크립트는 값을 돌려주는 식(보통 async 즉시 실행 함수)이어야 한다.
 * 돌려주는 값: {result, pageErrors: [문자열], browser}
 */
export async function runInDemo(script, {headed = false, timeoutMs = 120000, query = ''} = {}) {
  const exe = findBrowser();
  if (!exe) { const e = new Error('Chrome·Edge·Chromium 을 찾지 못했습니다. BROWSER_PATH 로 경로를 알려 주세요.'); e.code = 'NO_BROWSER'; throw e; }
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-e2e-'));
  const outDir = path.join(tmp, 'demo'), userDir = path.join(tmp, 'profile');
  await buildDemo(outDir);
  const server = await serveDemo({outDir, port: 0, rebuild: false});
  const url = `http://127.0.0.1:${server.address().port}/${query}`;
  let child, conn;
  try {
    const l = await launch(exe, userDir, headed);
    child = l.child;
    conn = cdp(l.ws);
    await conn.ready;
    const {targetId} = await conn.send('Target.createTarget', {url: 'about:blank'});
    const {sessionId} = await conn.send('Target.attachToTarget', {targetId, flatten: true});
    const pageErrors = [];
    conn.on(m => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; pageErrors.push(String((d.exception && d.exception.description) || d.text).slice(0, 300)); }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    });
    await conn.send('Runtime.enable', {}, sessionId);
    await conn.send('Page.enable', {}, sessionId);
    const loaded = new Promise(resolve => conn.on(m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') resolve(); }));
    await conn.send('Page.navigate', {url}, sessionId);
    await Promise.race([loaded, new Promise((_, rej) => setTimeout(() => rej(new Error('둘러보기가 15초 안에 열리지 않았습니다')), 15000))]);
    const r = await Promise.race([
      conn.send('Runtime.evaluate', {expression: script, awaitPromise: true, returnByValue: true, userGesture: true}, sessionId),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`검사가 ${timeoutMs / 1000}초 안에 끝나지 않았습니다`)), timeoutMs)),
    ]);
    if (r.exceptionDetails) throw new Error('검사 스크립트 오류: ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 500));
    return {result: r.result.value, pageErrors, browser: path.basename(exe)};
  } finally {
    if (conn) { try { await Promise.race([conn.send('Browser.close'), new Promise(r => setTimeout(r, 2000))]); } catch {} conn.close(); }
    if (child && child.exitCode === null) { await new Promise(r => { const t = setTimeout(() => { try { child.kill(); } catch {} r(); }, 3000); child.once('exit', () => { clearTimeout(t); r(); }); }); }
    await new Promise(r => server.close(r));
    for (let i = 0; i < 5; i++) { try { await fs.rm(tmp, {recursive: true, force: true}); break; } catch { await new Promise(r => setTimeout(r, 400)); } }
  }
}

export const JOURNEYS_FILE = path.join(ROOT, 'scripts', 'journeys.browser.js');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const script = await fs.readFile(arg('--script') ? path.resolve(arg('--script')) : JOURNEYS_FILE, 'utf8');
    const {result, pageErrors, browser} = await runInDemo(script, {headed: argv.includes('--headed'), query: arg('--query') || '?at=10:00'});
    const steps = (result && result.steps) || [];
    const failed = steps.filter(s => !s.ok);
    const ok = !!result && result.ok !== false && failed.length === 0 && pageErrors.length === 0;
    if (argv.includes('--json')) console.log(JSON.stringify({ok, browser, result, pageErrors}, null, 2));
    else {
      if (!steps.length) console.log(JSON.stringify(result, null, 2));
      let journey = '';
      for (const s of steps) { if (s.journey !== journey) { journey = s.journey; console.log(`\n${journey}`); } console.log(`  ${s.ok ? '통과' : '실패'}  ${s.name}${s.detail ? ` — ${s.detail}` : ''}`); }
      for (const e of pageErrors) console.log(`  페이지 오류  ${e}`);
      console.log(`\n${ok ? '핵심 여정 통과' : '핵심 여정 실패'} · ${steps.length - failed.length}/${steps.length} 단계 · ${browser}`);
    }
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.error((e && e.message) || e);
    process.exit(e && e.code === 'NO_BROWSER' ? 2 : 1);
  }
}
