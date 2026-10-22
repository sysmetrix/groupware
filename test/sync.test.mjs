import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDemoDataset} from '../src/demo.mjs';
import {collectPages, validateSyncState} from '../src/sync.mjs';
import {atomicJson, createAutomation, defaultAutomation} from '../src/automation.mjs';
import {createStore} from '../src/store.mjs';
import {syncPageFile} from '../scripts/sync-pages.mjs';

const now = new Date('2026-10-22T00:05:00Z');
function fixture() {
  const data = createDemoDataset(now); data.source.kind = 'manual-export'; data.source.baseUrl = 'https://example.invalid';
  const scope = {connectorId: 'fixture', contractVersion: '1', userId: data.principal.userId, organizationId: data.principal.organizationId, baseUrl: data.source.baseUrl, queryKey: 'all'};
  const page = {cursor: null, nextCursor: null, checkpoint: 'v1', total: data.items.length, items: data.items, deletedIds: []};
  const input = {scope, expectedScope: scope, mode: 'full', fromCheckpoint: null, source: data.source, principal: data.principal, pages: [page], now};
  return {data, scope, page, input};
}
const code = expected => error => error.code === expected;

test('complete full sync follows an empty middle page and filters out-of-scope content', async () => {
  const f = fixture();
  f.input.pages = [{...f.page, items: f.data.items.slice(0, 2), nextCursor: 'p2', checkpoint: null}, {...f.page, cursor: 'p2', items: [], nextCursor: 'p3', checkpoint: null}, {...f.page, cursor: 'p3', items: f.data.items.slice(2)}];
  const result = await collectPages(f.input);
  assert.equal(result.summary.pageCount, 3); assert.equal(result.state.checkpoint, 'v1');
  assert.ok(result.state.dataset.items.length < f.data.items.length);
  assert.ok(result.state.dataset.items.every(x => x.allowedUserIds.includes(f.scope.userId) && x.organizationId === f.scope.organizationId));
  assert.deepEqual(validateSyncState(result.state), result.state);
});

test('missing final, premature checkpoint, repeated cursor and inconsistent total cannot publish', async () => {
  const f = fixture();
  for (const [pages, expected] of [
    [[], 'INCOMPLETE'],
    [[{...f.page, nextCursor: 'p2', checkpoint: null}], 'INCOMPLETE'],
    [[{...f.page, nextCursor: 'p2'}], 'EARLY_CHECKPOINT'],
    [[{...f.page, nextCursor: 'p2', checkpoint: null}, {...f.page, cursor: 'p2', items: [], nextCursor: 'p2', checkpoint: null}], 'CURSOR_MISMATCH'],
    [[{...f.page, total: f.page.total + 1}], 'TOTAL_MISMATCH'],
    [[{...f.page, nextCursor: 'p2', checkpoint: null}, {...f.page, cursor: 'p2', items: [], total: f.page.total + 1}], 'TOTAL_MISMATCH'],
    [[f.page, f.page], 'EXTRA_PAGE'],
  ]) await assert.rejects(collectPages({...f.input, pages}), code(expected));
});

test('duplicate IDs across pages and update/delete conflicts are rejected', async () => {
  const f = fixture(), item = f.data.items[0];
  await assert.rejects(collectPages({...f.input, pages: [{...f.page, items: [item], total: 2, nextCursor: 'p2', checkpoint: null}, {...f.page, cursor: 'p2', items: [item], total: 2}]}), code('DUPLICATE_CHANGE'));
  const {state: previous} = await collectPages(f.input);
  await assert.rejects(collectPages({...f.input, previous, mode: 'delta', fromCheckpoint: 'v1', pages: [{...f.page, items: [item], deletedIds: [item.id], total: 2, checkpoint: 'v2'}]}), code('DUPLICATE_CHANGE'));
});

test('delta removes deletions and revoked permissions while retaining untouched records', async () => {
  const f = fixture(), {state: previous} = await collectPages(f.input);
  const [deleted, revoked, updated, retained] = previous.dataset.items;
  const delta = {...f.input, previous, mode: 'delta', fromCheckpoint: 'v1', pages: [{...f.page, checkpoint: 'v2', total: 3, items: [{...revoked, allowedUserIds: []}, {...updated, title: '수정된 합성 자료'}], deletedIds: [deleted.id]}]};
  const {state} = await collectPages(delta);
  assert.equal(state.dataset.items.some(x => [deleted.id, revoked.id].includes(x.id)), false);
  assert.equal(state.dataset.items.find(x => x.id === updated.id).title, '수정된 합성 자료');
  assert.deepEqual(state.dataset.items.find(x => x.id === retained.id), retained);
  assert.equal(previous.dataset.items.length - state.dataset.items.length, 2);
  assert.equal(previous.checkpoint, 'v1');
});

test('scope, checkpoint, timestamp, resource limits and corrupted prior state fail closed', async () => {
  const f = fixture(), {state: previous} = await collectPages(f.input);
  for (const key of ['userId', 'organizationId', 'connectorId', 'contractVersion', 'queryKey']) {
    await assert.rejects(collectPages({...f.input, scope: {...f.scope, [key]: 'changed'}}), code('SCOPE_CHANGED'));
  }
  await assert.rejects(collectPages({...f.input, previous, mode: 'delta', fromCheckpoint: 'expired'}), code('CHECKPOINT_MISMATCH'));
  await assert.rejects(collectPages({...f.input, mode: 'delta', fromCheckpoint: 'v1'}), code('CHECKPOINT_MISMATCH'));
  await assert.rejects(collectPages({...f.input, previous, source: {...f.data.source, exportedAt: '2026-10-22T00:00:00Z'}}), code('SOURCE_ROLLBACK'));
  await assert.rejects(collectPages({...f.input, source: {...f.data.source, exportedAt: '2026-10-01T00:00:00Z'}}), code('STALE_SOURCE'));
  await assert.rejects(collectPages({...f.input, maxPages: 1, pages: [{...f.page, nextCursor: 'p2', checkpoint: null}, {...f.page, cursor: 'p2', items: []}]}), code('PAGE_LIMIT'));
  assert.throws(() => validateSyncState({...previous, dataset: f.data}), code('INVALID_STATE'));
});

test('adapter failure after a page leaves caller state untouched', async () => {
  const f = fixture(), {state: previous} = await collectPages(f.input), before = structuredClone(previous);
  async function* pages() { yield {...f.page, nextCursor: 'p2', checkpoint: null}; throw new Error('adapter unavailable'); }
  await assert.rejects(collectPages({...f.input, previous, pages: pages()}), /adapter unavailable/);
  assert.deepEqual(previous, before);
});

test('full refresh removes records absent from the complete new snapshot, including an empty collection', async () => {
  const f = fixture(), {state: previous} = await collectPages(f.input);
  const {state} = await collectPages({...f.input, previous, pages: [{...f.page, items: [], total: 0, checkpoint: 'v2'}]});
  assert.deepEqual(state.dataset.items, []); assert.equal(state.checkpoint, 'v2');
});

test('file sync publishes a compatible dataset and retains output/checkpoint on incomplete collection', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'groupware-sync-')); t.after(() => fs.rm(root, {recursive: true, force: true}));
  const f = fixture(), {expectedScope, now: clock, ...bundle} = f.input;
  const args = {inputFile: path.join(root, 'pages.json'), scopeFile: path.join(root, 'scope.json'), stateFile: path.join(root, 'state.json'), outputFile: path.join(root, 'dataset.json'), now};
  await atomicJson(args.inputFile, {schemaVersion: 1, ...bundle}); await atomicJson(args.scopeFile, expectedScope);
  const summary = await syncPageFile(args); assert.equal(summary.pageCount, 1);
  const output = await fs.readFile(args.outputFile, 'utf8'), state = await fs.readFile(args.stateFile, 'utf8');
  assert.deepEqual(JSON.parse(output), JSON.parse(state).dataset);
  const configFile = path.join(root, 'automation.json'), dataDir = path.join(root, 'store');
  await atomicJson(configFile, {...defaultAutomation, enabled: true, inputFile: args.outputFile, expectedPrincipal: {userId: f.scope.userId, organizationId: f.scope.organizationId}});
  const automation = await createAutomation({store: await createStore(dataDir), dataDir, configFile, root, now: () => now});
  assert.equal((await automation.run({forceReport: true})).reportAvailable, true);
  assert.equal(automation.latest().briefing.counts.pending, 2);
  await atomicJson(args.inputFile, {schemaVersion: 1, ...bundle, pages: [{...f.page, nextCursor: 'missing', checkpoint: null}]});
  await assert.rejects(syncPageFile(args), code('INCOMPLETE'));
  assert.equal(await fs.readFile(args.outputFile, 'utf8'), output); assert.equal(await fs.readFile(args.stateFile, 'utf8'), state);
  await fs.writeFile(args.stateFile + '.lock', '{}'); await assert.rejects(syncPageFile(args), code('SYNC_LOCKED'));
  await fs.unlink(args.stateFile + '.lock');
  await assert.rejects(syncPageFile({...args, outputFile: args.inputFile}), code('PATH_CONFLICT'));
  await assert.rejects(syncPageFile({...args, outputFile: args.stateFile + '.lock'}), code('PATH_CONFLICT'));
});

test('output write failure does not advance the checkpoint and the same bundle can recover', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'groupware-sync-failure-')); t.after(() => fs.rm(root, {recursive: true, force: true}));
  const f = fixture(), {expectedScope, now: clock, ...bundle} = f.input;
  const args = {inputFile: path.join(root, 'pages.json'), scopeFile: path.join(root, 'scope.json'), stateFile: path.join(root, 'state.json'), outputFile: path.join(root, 'is-a-directory'), now};
  await atomicJson(args.inputFile, {schemaVersion: 1, ...bundle}); await atomicJson(args.scopeFile, expectedScope); await fs.mkdir(args.outputFile);
  await assert.rejects(syncPageFile(args));
  await assert.rejects(fs.access(args.stateFile)); await assert.rejects(fs.access(args.stateFile + '.lock'));
  await fs.rmdir(args.outputFile);
  await syncPageFile(args); assert.equal(JSON.parse(await fs.readFile(args.stateFile)).checkpoint, 'v1');
});
