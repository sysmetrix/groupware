import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../src/store.mjs';
import {createDemoDataset} from '../src/demo.mjs';

async function directory(t) {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), 'groupware-store-'));
  t.after(() => fs.rm(value, {recursive: true, force: true}));
  return value;
}
test('concurrent replacements serialize and survive restart', async t => {
  const dir = await directory(t), store = await createStore(dir);
  const first = createDemoDataset(), second = createDemoDataset(); first.source.label = '첫 번째'; second.source.label = '두 번째';
  const results = await Promise.all([store.replace(first), store.replace(second)]);
  assert.deepEqual(results.map(x => x.revision), [1, 2]);
  assert.equal(store.snapshot().dataset.source.label, '두 번째');
  assert.equal((await createStore(dir)).snapshot().dataset.source.label, '두 번째');
  assert.equal((await fs.readdir(dir)).some(name => name.endsWith('.tmp')), false);
});
test('corrupted persisted data fails startup rather than silently showing demo', async t => {
  const dir = await directory(t); await fs.writeFile(path.join(dir, 'dataset.json'), 'broken');
  await assert.rejects(createStore(dir), /손상/);
});
test('snapshot mutation cannot change the store', async t => {
  const store = await createStore(await directory(t)), snapshot = store.snapshot(); snapshot.dataset.items.length = 0;
  assert.ok(store.snapshot().dataset.items.length > 0);
});
