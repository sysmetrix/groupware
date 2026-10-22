import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {AppError, object, visibleItems} from './schema.mjs';
import {createDemoDataset} from './demo.mjs';
import {createStore} from './store.mjs';
import {runTask} from './tasks.mjs';
import {summarize, validateModelConfig} from './model.mjs';
import {createAutomation} from './automation.mjs';
import {createLibrary, documentFilename, documentLimit, linkLibraryResults} from './library.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const assets = {'/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8']};
const maximumBody = 5 * 1024 * 1024;
async function jsonBody(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new AppError('Content-Type: application/json이 필요합니다.', 415);
  if (Number(req.headers['content-length']) > maximumBody) throw new AppError('가져오기 파일은 5 MB 이하여야 합니다.', 413);
  let length = 0; const chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > maximumBody) throw new AppError('요청이 5 MB를 초과했습니다.', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('올바른 JSON 파일 또는 요청이 필요합니다.'); }
}
const send = (res, status, value) => { res.writeHead(status, {'content-type': 'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
async function documentBody(req) {
  if (req.headers['content-type'] !== 'application/octet-stream') throw new AppError('문서 업로드 형식을 확인하세요.', 415);
  if (Number(req.headers['content-length']) > documentLimit) throw new AppError('문서는 20 MB 이하여야 합니다.', 413);
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > documentLimit) throw new AppError('문서는 20 MB 이하여야 합니다.', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function createApp({dataDir = path.resolve('data'), configFile = path.resolve('config/automation.json'), root = process.cwd(), model = {model: '', baseUrl: 'http://127.0.0.1:11434'}} = {}) {
  const store = await createStore(dataDir), modelConfig = validateModelConfig(model), csrf = randomBytes(32).toString('hex');
  const automation = await createAutomation({store, dataDir, configFile, root});
  const library = await createLibrary(path.join(dataDir, 'library'));
  let activeRuns = 0, uploading = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const expectedHost = `127.0.0.1:${server.address().port}`, origin = `http://${expectedHost}`;
      if (req.headers.host !== expectedHost) throw new AppError('127.0.0.1 주소로 접속하세요.', 403);
      if ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') throw new AppError('다른 사이트에서의 요청은 허용하지 않습니다.', 403);
      const url = new URL(req.url, origin);
      if (url.origin !== origin) throw new AppError('잘못된 요청 origin입니다.', 403);
      if (!['GET', 'POST'].includes(req.method)) throw new AppError('지원하지 않는 메서드입니다.', 405);
      if (req.method === 'POST') {
        const token = Buffer.from(String(req.headers['x-csrf-token'] || ''));
        if (token.length !== csrf.length || !timingSafeEqual(token, Buffer.from(csrf))) throw new AppError('페이지를 새로고침한 뒤 다시 시도하세요.', 403);
      }
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file, type] = assets[url.pathname];
        const body = await fs.readFile(path.join(publicDir, file));
        res.writeHead(200, {'content-type': type}); res.end(body); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const {dataset, revision} = store.snapshot();
        send(res, 200, {csrf, revision, source: dataset.source, principal: dataset.principal, visibleCount: visibleItems(dataset).length, liveConnected: false, capabilities: {briefing: true, search: true, validate: true, mutations: false, model: modelConfig.enabled}, model: modelConfig.enabled ? modelConfig.model : null}); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/example') { send(res, 200, createDemoDataset()); return; }
      if (req.method === 'GET' && url.pathname === '/api/documents') { send(res, 200, library.list()); return; }
      const preview = /^\/api\/documents\/(local-[a-f0-9-]{36})\/text$/.exec(url.pathname);
      if (req.method === 'GET' && preview) { send(res, 200, library.preview(preview[1], Number(url.searchParams.get('offset') || 0))); return; }
      const original = /^\/api\/documents\/(local-[a-f0-9-]{36})\/file$/.exec(url.pathname);
      if (req.method === 'GET' && original) {
        const {content, filename} = await library.original(original[1]);
        res.writeHead(200, {'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="document.${filename.split('.').at(-1).toLowerCase()}"; filename*=UTF-8''${encodeURIComponent(filename).replaceAll("'", '%27')}`, 'content-length': content.length});
        res.end(content); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/documents/upload') {
        if (uploading) throw new AppError('문서 처리 중입니다. 완료 후 다시 시도하세요.', 429);
        uploading = true;
        try {
          let filename;
          try { filename = decodeURIComponent(req.headers['x-document-name'] || ''); } catch { throw new AppError('파일 이름 인코딩을 확인하세요.'); }
          filename = documentFilename(filename);
          const result = await library.add(filename, await documentBody(req));
          await store.audit({action: 'library.import', outcome: 'completed', count: result.documents.length});
          send(res, 200, result); return;
        } finally { uploading = false; }
      }
      if (req.method === 'POST' && url.pathname === '/api/documents/remove') {
        const input = object(await jsonBody(req), 'remove', ['id', 'expectedRevision']);
        send(res, 200, await library.remove(input.id, input.expectedRevision)); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/automation') { send(res, 200, automation.status()); return; }
      if (req.method === 'GET' && url.pathname === '/api/report') { send(res, 200, automation.latest()); return; }
      if (req.method === 'POST' && url.pathname === '/api/automation/run') {
        await jsonBody(req); const result = await automation.run({forceReport: true}); send(res, result.outcome === 'failed' ? 422 : 200, result); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/audit') { send(res, 200, {events: await store.history()}); return; }
      if (req.method === 'POST' && url.pathname === '/api/import') {
        const result = await store.replace(await jsonBody(req)); send(res, 200, result); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/reset-demo') {
        await jsonBody(req); send(res, 200, await store.replace(createDemoDataset())); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/run') {
        if (activeRuns >= 2) throw new AppError('진행 중인 작업이 있습니다. 잠시 뒤 다시 시도하세요.', 429);
        activeRuns += 1;
        try {
          const {scope = 'dataset', ...input} = object(await jsonBody(req), 'request');
          if (!['dataset', 'library'].includes(scope) || (scope === 'library' && !['search', 'validate'].includes(input.task))) throw new AppError('검색·점검 자료 범위를 확인하세요.');
          const taskStore = scope === 'library' ? library : store, snapshot = taskStore.snapshot();
          if (input.expectedRevision !== undefined && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)) throw new AppError('자료 버전 번호를 확인하세요.');
          if (input.attachmentEvidence !== undefined && input.expectedRevision === undefined) throw new AppError('첨부 선택 시점의 자료 버전이 필요합니다.');
          if (input.expectedRevision !== undefined && input.expectedRevision !== snapshot.revision) throw new AppError('자료가 변경되었습니다. 다시 검색해 선택하세요.', 409);
          const result = runTask(snapshot.dataset, input);
          result.datasetRevision = snapshot.revision; result.source = snapshot.dataset.source; result.scope = scope;
          if (input.useModel) {
            try { result.ai = await summarize(result, modelConfig); result.trace.push({tool: 'model.summarize', status: 'completed'}); }
            catch { result.ai = {mode: 'unavailable', claims: [], message: 'AI 요약을 제공하지 못했습니다. 모델 설정·연결·응답을 확인하세요. 아래의 근거와 규칙 검사 결과는 그대로 사용할 수 있습니다.'}; result.trace.push({tool: 'model.summarize', status: 'failed'}); }
          }
          if (snapshot.revision !== taskStore.snapshot().revision) throw new AppError('작업 중 데이터가 변경되었습니다. 새 데이터로 다시 실행하세요.', 409);
          if (scope === 'library') linkLibraryResults(result);
          await store.audit({action: `task.${input.task}`, outcome: result.ai?.mode === 'unavailable' ? 'partial' : 'completed', count: result.references.length});
          send(res, 200, result); return;
        } finally { activeRuns -= 1; }
      }
      throw new AppError('요청한 경로를 찾을 수 없습니다.', 404);
    } catch (error) {
      if (!res.headersSent) send(res, error instanceof AppError ? error.status : 500, {error: error instanceof AppError ? error.message : '로컬 처리에 실패했습니다. 데이터 폴더 권한과 저장 공간을 확인하세요.'});
      else res.end();
    }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 10000;
  server.on('listening', () => automation.start());
  server.on('close', () => automation.stop());
  return server;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 3210);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT는 1~65535 사이 정수여야 합니다.');
  const server = await createApp({dataDir: path.resolve(process.env.DATA_DIR || 'data'), configFile: path.resolve(process.env.AUTOMATION_CONFIG || 'config/automation.json'), model: {model: process.env.OLLAMA_MODEL || '', baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'}});
  server.listen(port, '127.0.0.1', () => console.log(`Groupware Assistant: http://127.0.0.1:${port} (그룹웨어 실시간 연동 없음)`));
  server.on('error', error => { console.error(`서버를 시작할 수 없습니다: ${error.code || 'unknown'}`); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
}
