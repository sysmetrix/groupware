import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import http from 'node:http';
import {createApp} from '../src/server.mjs';
import {createDemoDataset} from '../src/demo.mjs';

async function fixture(t, options = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'groupware-test-'));
  const server = await createApp({dataDir, ...options}); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { const closed = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await closed; await fs.rm(dataDir, {recursive: true, force: true}); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = await (await fetch(base + '/api/status')).json();
  const post = (route, body, headers = {}) => fetch(base + route, {method: 'POST', headers: {'content-type': 'application/json', 'x-csrf-token': status.csrf, ...headers}, body: JSON.stringify(body)});
  return {server, base, status, post, dataDir};
}
test('HTTP status, assets, briefing and audit form a usable workflow', async t => {
  const f = await fixture(t);
  assert.equal(f.status.liveConnected, false); assert.equal(f.status.capabilities.mutations, false);
  for (const asset of ['/', '/app.js', '/styles.css']) { const r = await fetch(f.base + asset); assert.equal(r.status, 200); assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/); }
  const r = await f.post('/api/run', {task: 'briefing'}); assert.equal(r.status, 200);
  const body = await r.json(); assert.equal(body.counts.pending, 2); assert.equal(body.references.some(x => x.id === 'hidden-doc'), false);
  const audit = await (await fetch(f.base + '/api/audit')).json(); assert.equal(audit.events[0].action, 'task.briefing');
});
test('CSRF, cross-site requests and arbitrary paths fail closed', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('/api/run', {task: 'briefing'}, {'x-csrf-token': ''})).status, 403);
  assert.equal((await f.post('/api/run', {task: 'briefing'}, {origin: 'https://attacker.example'})).status, 403);
  assert.equal((await fetch(f.base + '/api/status', {headers: {'sec-fetch-site': 'cross-site'}})).status, 403);
  assert.equal((await fetch(f.base + '/data/dataset.json')).status, 404);
  assert.equal((await f.post('/api/run', {task: 'approve'})).status, 400);
});
test('import is validated, persists locally, and replaces scoped data', async t => {
  const f = await fixture(t); const dataset = createDemoDataset(); dataset.source.kind = 'manual-export'; dataset.principal.userId = 'different-user';
  const result = await f.post('/api/import', dataset); assert.equal(result.status, 200);
  const status = await (await fetch(f.base + '/api/status')).json(); assert.equal(status.visibleCount, 1); assert.equal(status.revision, 1);
  const persisted = JSON.parse(await fs.readFile(path.join(f.dataDir, 'dataset.json'), 'utf8')); assert.equal(persisted.principal.userId, 'different-user');
  const invalid = {...dataset, secret: 'never-save'}; assert.equal((await f.post('/api/import', invalid)).status, 400);
  assert.equal((await (await fetch(f.base + '/api/status')).json()).revision, 1);
});
test('audit omits queries and draft bodies', async t => {
  const f = await fixture(t);
  await f.post('/api/run', {task: 'search', query: 'private-query-marker'});
  await f.post('/api/run', {task: 'validate', draft: {title: 'private-draft-marker'}});
  const log = await fs.readFile(path.join(f.dataDir, 'audit.jsonl'), 'utf8'); assert.equal(log.includes('private-'), false);
});
test('AI unavailability returns evidence and a partial audit outcome', async t => {
  const f = await fixture(t);
  const result = await (await f.post('/api/run', {task: 'briefing', useModel: true})).json();
  assert.equal(result.ai.mode, 'unavailable'); assert.equal(result.counts.pending, 2);
  assert.equal((await (await fetch(f.base + '/api/audit')).json()).events[0].outcome, 'partial');
});
test('bad content type and JSON are user errors', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('/api/import', {}, {'content-type': 'text/plain'})).status, 415);
  const response = await fetch(f.base + '/api/import', {method: 'POST', headers: {'content-type': 'application/json', 'x-csrf-token': f.status.csrf}, body: '{'});
  assert.equal(response.status, 400);
});

test('Host header rejects DNS rebinding to a non-loopback name', async t => {
  const f = await fixture(t);
  const status = await new Promise((resolve, reject) => {
    const request = http.get(f.base + '/api/status', {headers: {host: 'attacker.example'}}, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
  });
  assert.equal(status, 403);
});

test('a data replacement invalidates an in-flight model result', async t => {
  let release, entered;
  const arrived = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const model = http.createServer(async (req, res) => {
    for await (const chunk of req) { void chunk; }
    entered(); await gate;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({message: {content: JSON.stringify({claims: [{text: '예제 결과', sourceIds: ['doc-001']}]})}}));
  });
  model.listen(0, '127.0.0.1'); await once(model, 'listening');
  t.after(async () => { release(); const closed = new Promise(resolve => model.close(resolve)); model.closeAllConnections(); await closed; });
  const f = await fixture(t, {model: {model: 'local-test', baseUrl: `http://127.0.0.1:${model.address().port}`}});
  const pending = f.post('/api/run', {task: 'search', query: '운영계획', useModel: true});
  await arrived;
  assert.equal((await f.post('/api/import', createDemoDataset())).status, 200);
  release();
  const response = await pending;
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /데이터가 변경/);
});

test('oversized import fails before reading an unbounded body', async t => {
  const f = await fixture(t);
  const response = await fetch(f.base + '/api/import', {method: 'POST', headers: {'content-type': 'application/json', 'x-csrf-token': f.status.csrf}, body: JSON.stringify({padding: 'x'.repeat(5 * 1024 * 1024)})});
  assert.equal(response.status, 413);
});
