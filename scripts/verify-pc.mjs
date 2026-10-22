import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
import {createRuntimeStatus} from '../src/runtime-status.mjs';

// Each run owns a fresh directory and ephemeral HTTP port; never uses the user's library.
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'data', 'verification');
await fs.mkdir(directory, {recursive: true});
const run = await fs.mkdtemp(path.join(directory, 'pc-'));
const checks = [];
async function check(name, work, guidance) {
  try { const detail = await work(); checks.push({name, status: detail?.skipped ? 'SKIP' : 'PASS', detail: detail?.detail || detail || '확인 완료'}); }
  catch { checks.push({name, status: 'FAIL', detail: guidance}); }
  console.log(`${checks.at(-1).status}: ${name}`);
}
function command(exe, args) {
  const result = spawnSync(exe, args, {cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true});
  assert.equal(result.status, 0); return result.stdout.trim();
}
await check('Node.js 24 이상', () => { assert.ok(Number(process.versions.node.split('.')[0]) >= 24); return process.version; }, 'Node.js 24 이상을 설치하세요.');
await check('기본 설정과 자료 쓰기', async () => {
  command(process.execPath, ['--env-file-if-exists=.env', 'scripts/doctor.mjs']);
}, 'npm run setup 및 npm run doctor 결과를 확인하세요.');
await check('문서 추출용 프로젝트 Python 환경', () => {
  const python = path.join(root, '.venv-attachments', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return command(python, ['-c', 'import sys,pypdf; print("Python " + sys.version.split()[0] + " / pypdf " + pypdf.__version__)']);
}, 'npm run setup:documents를 실행하세요.');
if (process.platform === 'win32') {
  await check('데스크톱 실행 파일과 아이콘', async () => {
    const exe = await fs.open(path.join(root, 'data/control-panel/GroupwareControl.exe'));
    try { const bytes = Buffer.alloc(2); await exe.read(bytes, 0, 2, 0); assert.equal(bytes.toString(), 'MZ'); } finally { await exe.close(); }
    const icon = await fs.readFile(path.join(root, 'desktop/assets/groupware-control.ico'));
    assert.equal(icon.readUInt16LE(2), 1); assert.equal(icon.readUInt16LE(4), 7);
    return '실행 파일 존재·형식 및 7개 아이콘 크기 확인 (GUI 조작은 별도)';
  }, 'npm run setup:control을 실행하세요.');
}
await check('분리된 앱 실행·파비콘·브리핑·검색·감사 기록', async () => {
  const server = await createApp({root, dataDir: path.join(run, 'synthetic-data'), configFile: path.join(run, 'disabled-automation.json')});
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async url => { const res = await fetch(base + url, {signal: AbortSignal.timeout(10000)}); assert.equal(res.status, 200); return res; };
    for (const url of ['/', '/app.js', '/styles.css', '/favicon.svg', '/favicon.ico']) await (await get(url)).arrayBuffer();
    const status = await (await get('/api/status')).json(); assert.equal(status.liveConnected, false);
    const documents = await (await get('/api/documents')).json(); assert.equal(documents.documents.length, 0);
    for (const request of [{task: 'briefing'}, {task: 'search', query: '운영계획'}]) {
      const res = await fetch(base + '/api/run', {method: 'POST', signal: AbortSignal.timeout(10000), headers: {'content-type': 'application/json', 'x-csrf-token': status.csrf}, body: JSON.stringify(request)});
      assert.equal(res.status, 200); const body = await res.json();
      if (request.task === 'briefing') assert.equal(body.counts.pending, 2);
      else assert.ok(body.hits.length > 0);
    }
    const audit = await (await get('/api/audit')).json(); assert.equal(audit.events.length, 2);
    return '새 자료 폴더·임의 포트에서 합성 예제만 사용. 기존 서버와 업무자료는 유지.';
  } finally {
    if (server.listening) { const closed = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await closed; }
  }
}, 'npm test와 npm run check의 오류를 확인하세요.');
let model;
await check('로컬 모델 설정·설치 상태 관찰', async () => {
  model = await createRuntimeStatus({model: process.env.OLLAMA_MODEL || '', baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'})();
  if (!model.configured) return {skipped: true, detail: '선택 기능 미설정. AI 추론 준비 완료를 의미하지 않음.'};
  assert.equal(model.service, 'running'); assert.equal(model.installed, true);
  return model.loaded === true ? '서버·모델 설치·메모리 로딩 확인. 추론 품질 검사는 별도.' : '서버·모델 설치 확인. 메모리 로딩과 추론 품질 검사는 별도.';
}, '실행 관리자에서 로컬 LLM을 시작하고 .env의 모델 이름과 설치 상태를 확인하세요.');
const report = {checkedAt: new Date().toISOString(), platform: process.platform, architecture: process.arch, passed: checks.every(x => x.status !== 'FAIL'), checks,
  scope: '이 명령을 실행한 PC에서만 확인. 다른 물리 PC·로그인·기관 문서·실제 그룹웨어 연결·GUI E2E·모델 추론은 미검증.'};
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const time = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', dateStyle: 'full', timeStyle: 'medium'}).format(new Date(report.checkedAt));
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PC 설치 검증</title><style>body{font:16px/1.7 system-ui,sans-serif;background:#f3f5f4;color:#182c26;margin:0;padding:32px}main{max-width:960px;margin:auto}header{background:#18392e;color:white;padding:28px;border-radius:18px}h1{margin:0}table{width:100%;border-collapse:collapse;background:white;margin:24px 0}td,th{padding:16px;text-align:left;border-bottom:1px solid #dfe7e2}.PASS{color:#216b55}.FAIL{color:#a03127}small{color:#c7dbd0}@media(max-width:650px){body{padding:12px}td,th{padding:8px}table{font-size:14px}}@media print{body{background:white;padding:0}header{background:white;color:black}}</style><main><header><h1>이 PC의 설치 검증 · ${report.passed ? '통과' : '확인 필요'}</h1><small>${escape(time)} · ${escape(report.platform)} / ${escape(report.architecture)}</small></header><p>${escape(report.scope)}</p><table><thead><tr><th>검사</th><th>결과</th><th>근거 / 다음 행동</th></tr></thead><tbody>${checks.map(x => `<tr><td>${escape(x.name)}</td><td class="${x.status}">${x.status}</td><td>${escape(x.detail)}</td></tr>`).join('')}</tbody></table><p>설정·문서·모델·로그인 정보는 GitHub로 전송하지 않습니다. 검증용 합성 자료와 보고서는 data/verification에 보관됩니다.</p></main></html>`;
await fs.writeFile(path.join(run, 'report.json'), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(run, 'report.html'), html);
console.log(`HTML: ${path.join(run, 'report.html')}`);
process.exitCode = report.passed ? 0 : 1;
