import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createLibrary, documentLimit} from '../src/library.mjs';
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

test('failed original deletion restores the persistent entry and can be retried', async t => {
  const {library, dir} = await fixture(t);
  const added = await library.add('locked.xlsx', Buffer.from('locked'));
  const original = path.join(dir, 'files', added.id + '.xlsx');
  const rm = fs.rm;
  let fail = true;
  t.mock.method(fs, 'rm', async (file, options) => {
    if (file === original && fail) { fail = false; throw new Error('synthetic delete failure'); }
    return rm(file, options);
  });
  await assert.rejects(library.remove(added.id, added.revision), /delete failure/);
  assert.equal(library.list().documents[0].id, added.id);
  assert.equal((await library.original(added.id)).content.toString(), 'locked');
  const restarted = await createLibrary(dir);
  assert.equal(restarted.list().documents[0].id, added.id);
  await library.remove(added.id, library.list().revision);
  assert.deepEqual(await fs.readdir(path.join(dir, 'files')), []);
});

test('completion audit failure retains a published upload but cleans a committed deletion', async t => {
  const {library, dir} = await fixture(t);
  const appendFile = fs.appendFile;
  t.mock.method(fs, 'appendFile', async (file, data, options) => {
    if (file === path.join(dir, 'audit.jsonl') && JSON.parse(data).outcome === 'completed') {
      throw new Error('synthetic completion audit failure');
    }
    return appendFile(file, data, options);
  });
  await assert.rejects(library.add('audit.xlsx', Buffer.from('audit')), /completion audit failure/);
  const {documents, revision} = library.list();
  assert.equal(documents.length, 1);
  assert.equal((await library.original(documents[0].id)).content.toString(), 'audit');
  assert.equal((await createLibrary(dir)).list().documents.length, 1);
  await assert.rejects(library.remove(documents[0].id, revision), /completion audit failure/);
  assert.equal(library.list().documents.length, 0);
  assert.deepEqual(await fs.readdir(path.join(dir, 'files')), []);
  assert.equal((await createLibrary(dir)).list().documents.length, 0);
});

test('audit failure before publication retains a deletion target and cleans an unpublished upload', async t => {
  const {library, dir} = await fixture(t);
  const added = await library.add('retained.xlsx', Buffer.from('retained'));
  const appendFile = fs.appendFile;
  t.mock.method(fs, 'appendFile', async (file, ...args) => {
    if (file === path.join(dir, 'audit.jsonl')) throw new Error('synthetic audit failure');
    return appendFile(file, ...args);
  });
  await assert.rejects(library.remove(added.id, added.revision), /audit failure/);
  await assert.rejects(library.add('unpublished.xlsx', Buffer.from('unpublished')), /audit failure/);
  assert.equal(library.list().revision, added.revision);
  assert.deepEqual(await fs.readdir(path.join(dir, 'files')), [added.id + '.xlsx']);
  assert.equal((await library.original(added.id)).content.toString(), 'retained');
});

test('startup recovers abandoned uploads and originals without deleting retained or unknown files', async t => {
  const {library, dir} = await fixture(t);
  const added = await library.add('retained.xlsx', Buffer.from('retained'));
  const files = path.join(dir, 'files');
  for (const name of ['upload-' + randomUUID() + '.pdf', 'local-' + randomUUID() + '.xlsx', 'notes.txt']) {
    await fs.writeFile(path.join(files, name), 'abandoned');
  }
  const restarted = await createLibrary(dir);
  assert.deepEqual((await fs.readdir(files)).sort(), [added.id + '.xlsx', 'notes.txt'].sort());
  assert.equal((await restarted.original(added.id)).content.toString(), 'retained');
});

test('failed cleanup after failed rollback is recovered before the next upload', async t => {
  const {library, dir} = await fixture(t);
  const added = await library.add('orphan.xlsx', Buffer.from('orphan'));
  const original = path.join(dir, 'files', added.id + '.xlsx');
  const rm = fs.rm, appendFile = fs.appendFile;
  let failed = false;
  const removeMock = t.mock.method(fs, 'rm', async (file, options) => {
    if (file === original && !failed) { failed = true; throw new Error('synthetic delete failure'); }
    return rm(file, options);
  });
  const auditMock = t.mock.method(fs, 'appendFile', async (file, ...args) => {
    if (file === path.join(dir, 'audit.jsonl') && failed) throw new Error('synthetic rollback failure');
    return appendFile(file, ...args);
  });
  await assert.rejects(library.remove(added.id, added.revision), /rollback failure/);
  assert.equal(library.list().documents.length, 0);
  await fs.access(original);
  removeMock.mock.restore(); auditMock.mock.restore();
  await library.add('next.xlsx', Buffer.from('next'));
  await assert.rejects(fs.access(original), {code: 'ENOENT'});
});

test('original reads reject oversized and missing files', async t => {
  const {library, dir} = await fixture(t);
  const added = await library.add('bounded.xlsx', Buffer.from('bounded'));
  const original = path.join(dir, 'files', added.id + '.xlsx');
  await fs.truncate(original, documentLimit + 1);
  await assert.rejects(library.original(added.id), error => error.status === 409);
  await fs.rm(original);
  await assert.rejects(library.original(added.id), error => error.status === 409);
});

test('original reads remain bounded if the file grows after stat, including partial reads', async t => {
  const {library, dir} = await fixture(t);
  const added = await library.add('growing.xlsx', Buffer.from('x'));
  const original = path.join(dir, 'files', added.id + '.xlsx');
  const open = fs.open;
  let totalRead = 0, closed = false;
  t.mock.method(fs, 'open', async (file, ...args) => {
    const handle = await open(file, ...args);
    if (file !== original) return handle;
    return {
      async stat() {
        const stat = await handle.stat();
        await fs.truncate(original, documentLimit * 2);
        return stat;
      },
      async read(buffer, offset, length, position) {
        const result = await handle.read(buffer, offset, Math.min(length, 1), position);
        totalRead += result.bytesRead;
        return result;
      },
      async close() { closed = true; await handle.close(); },
    };
  });
  await assert.rejects(library.original(added.id), error => error.status === 409);
  assert.equal(totalRead, 2);
  assert.equal(closed, true);
});

test('persistent library-specific corruption is rejected before orphan cleanup', async t => {
  const {library, dir} = await fixture(t);
  await library.add('retained.xlsx', Buffer.from('retained'));
  const baseline = library.snapshot().dataset;
  const orphan = path.join(dir, 'files', 'local-' + randomUUID() + '.xlsx');
  await fs.writeFile(orphan, 'preserve during corruption');
  for (const change of [
    item => { delete item.attachments; },
    item => { item.attachments = []; },
    item => { item.id = 'unsafe:windows'; },
    item => { item.attachments[0].id = 'other'; },
  ]) {
    const dataset = structuredClone(baseline);
    change(dataset.items[0]);
    const serialized = JSON.stringify(dataset);
    await fs.writeFile(path.join(dir, 'dataset.json'), serialized);
    await assert.rejects(createLibrary(dir), /손상/);
    assert.equal(await fs.readFile(path.join(dir, 'dataset.json'), 'utf8'), serialized);
    await fs.access(orphan);
  }
  await fs.writeFile(path.join(dir, 'dataset.json'), '{invalid');
  await assert.rejects(createLibrary(dir), /손상/);
  await fs.access(orphan);
});
