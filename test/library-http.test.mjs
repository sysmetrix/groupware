import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createApp} from '../src/server.mjs';
import {createDemoDataset} from '../src/demo.mjs';

test('real PDF/XLSX/HWPX upload → preview → search → comparison → download → delete', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-document-http-'));
  const bundled = fileURLToPath(new URL(process.platform === 'win32' ? '../.venv-attachments/Scripts/python.exe' : '../.venv-attachments/bin/python', import.meta.url));
  const python = process.env.ATTACHMENT_PYTHON || await fs.access(bundled).then(() => bundled, () => 'python');
  execFileSync(python, [fileURLToPath(new URL('./document-fixtures.py', import.meta.url)), directory], {windowsHide: true});
  const server = await createApp({dataDir: path.join(directory, 'data'), configFile: path.join(directory, 'no-config.json')});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { const closed = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await closed; await fs.rm(directory, {recursive: true, force: true}); });
  const base = `http://127.0.0.1:${server.address().port}`, status = await (await fetch(base + '/api/status')).json();
  const post = (route, body) => fetch(base + route, {method: 'POST', headers: {'content-type': 'application/json', 'x-csrf-token': status.csrf}, body: JSON.stringify(body)});
  const upload = (name, bytes, token = status.csrf) => fetch(base + '/api/documents/upload', {method: 'POST', headers: {'content-type': 'application/octet-stream', 'x-csrf-token': token, 'x-document-name': encodeURIComponent(name)}, body: bytes});
  assert.equal((await upload('../x.xlsx', Buffer.from('x'))).status, 400);
  assert.equal((await upload('x.pdf', Buffer.from('x'), '')).status, 403);
  assert.equal((await upload('broken.pdf', Buffer.from('bad pdf'))).status, 400);
  const ids = [];
  for (const [format, query] of [['pdf', 'Synthetic'], ['xlsx', '1000'], ['hwpx', '먼저']]) {
    const raw = await fs.readFile(path.join(directory, 'fixture.' + format));
    const response = await upload(`합성자료.${format}`, raw);
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json(); ids.push(result.id);
    const preview = await (await fetch(`${base}/api/documents/${result.id}/text`)).json();
    assert.ok(preview.units.length > 0);
    const search = await (await post('/api/run', {task: 'search', scope: 'library', query})).json();
    const hit = search.hits.find(item => item.documentId === result.id);
    assert.ok(hit); assert.match(hit.url, /^\/api\/documents\//);
    assert.deepEqual(Buffer.from(await (await fetch(base + hit.url)).arrayBuffer()), raw);
    if (format === 'xlsx') {
      const checked = await (await post('/api/run', {task: 'validate', scope: 'library', expectedRevision: search.datasetRevision, attachmentEvidence: {...hit.selection, confirmed: true}, draft: {title: '합성', purpose: '합성 검사', businessDate: '2026-10-23', amount: '900', attachmentNames: '합성자료.xlsx'}})).json();
      assert.equal(checked.evidenceAmount, 1000); assert.ok(checked.findings.some(item => item.code === 'AMOUNT_MISMATCH'));
    }
    const duplicate = await (await upload(`합성자료.${format}`, raw)).json(); assert.equal(duplicate.duplicate, true);
  }
  await post('/api/import', createDemoDataset());
  const listing = await (await fetch(base + '/api/documents')).json();
  assert.equal(listing.documents.length, 3, 'groupware replacement must not delete the personal library');
  assert.equal((await post('/api/run', {task: 'briefing', scope: 'library'})).status, 400);
  assert.equal((await post('/api/documents/remove', {id: ids[0], expectedRevision: 0})).status, 409);
  assert.equal((await post('/api/documents/remove', {id: ids[0], expectedRevision: listing.revision})).status, 200);
  assert.equal((await fetch(`${base}/api/documents/${ids[0]}/file`)).status, 404);
  const log = await fs.readFile(path.join(directory, 'data', 'audit.jsonl'), 'utf8');
  assert.equal(log.includes('합성자료'), false); assert.equal(log.includes('Synthetic'), false);
});
