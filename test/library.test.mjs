import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createLibrary} from '../src/library.mjs';
import {runTask} from '../src/tasks.mjs';

async function fixture(t, extract) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-library-'));
  t.after(() => fs.rm(dir, {recursive: true, force: true}));
  const extractor = extract || (async file => {
    const bytes = await fs.readFile(file);
    return {schemaVersion: 1, filename: path.basename(file), format: 'xlsx', sha256: createHash('sha256').update(bytes).digest('hex'), warnings: ['XLSX_RAW_CELL_VALUES'], units: [{id: 'B2', location: {sheet: '합성', cell: 'B2'}, text: '1000'}]};
  });
  return {dir, library: await createLibrary(dir, {extract: extractor})};
}
test('personal library starts empty, deduplicates, survives restart, and removes original/evidence', async t => {
  const {library, dir} = await fixture(t);
  assert.equal(library.list().documents.length, 0);
  const first = await library.add('예산.xlsx', Buffer.from('synthetic'));
  assert.equal(first.documents.length, 1);
  const duplicate = await library.add('renamed.xlsx', Buffer.from('synthetic'));
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.revision, first.revision);
  assert.equal((await library.original(first.id)).content.toString(), 'synthetic');
  assert.equal(library.preview(first.id).units[0].text, '1000');
  const restarted = await createLibrary(dir);
  const result = runTask(restarted.snapshot().dataset, {task: 'search', query: '1000'});
  assert.equal(result.hits[0].selection.documentId, first.id);
  await assert.rejects(library.remove(first.id, 0), /변경/);
  await library.remove(first.id, first.revision);
  assert.equal(runTask(library.snapshot().dataset, {task: 'search', query: '1000'}).hits.length, 0);
  await assert.rejects(library.original(first.id), /찾을/);
  assert.deepEqual(await fs.readdir(path.join(dir, 'files')), []);
});
test('parser failure and invalid filename cannot publish or retain a document', async t => {
  const {library, dir} = await fixture(t, async () => { throw new Error('synthetic parse failure'); });
  for (const filename of ['../secret.xlsx', 'x.pdf\r\ninject', 'x.hwp']) await assert.rejects(library.add(filename, Buffer.from('x')));
  await assert.rejects(library.add('broken.pdf', Buffer.from('x')), /parse failure/);
  assert.equal(library.list().documents.length, 0);
  assert.deepEqual(await fs.readdir(path.join(dir, 'files')), []);
});
test('concurrent extraction is rejected and tampered original is never downloaded', async t => {
  let release, entered;
  const wait = new Promise(resolve => { release = resolve; });
  const arrival = new Promise(resolve => { entered = resolve; });
  const {library, dir} = await fixture(t, async file => {
    entered(); await wait;
    return {schemaVersion: 1, filename: path.basename(file), format: 'xlsx', sha256: createHash('sha256').update('x').digest('hex'), warnings: [], units: [{id: 'a', location: {sheet: '합성', cell: 'A1'}, text: '1000'}]};
  });
  const pending = library.add('x.xlsx', Buffer.from('x')); await arrival;
  await assert.rejects(library.add('y.xlsx', Buffer.from('y')), error => error.status === 429);
  release(); const result = await pending;
  await fs.writeFile(path.join(dir, 'files', result.id + '.xlsx'), 'tampered');
  await assert.rejects(library.original(result.id), error => error.status === 409);
});
