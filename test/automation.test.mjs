import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../src/store.mjs';
import {createDemoDataset} from '../src/demo.mjs';
import {createAutomation, defaultAutomation, atomicJson, validateAutomation, readJsonFile} from '../src/automation.mjs';

async function fixture(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'groupware-auto-'));
  let time = new Date('2026-10-22T00:05:00Z');
  const dataset = createDemoDataset(time); dataset.source.kind = 'manual-export';
  const configFile = path.join(root, 'automation.json'), inputFile = path.join(root, 'inbox.json'), dataDir = path.join(root, 'store');
  await atomicJson(configFile, {...defaultAutomation, enabled: true, expectedPrincipal: {userId: dataset.principal.userId, organizationId: dataset.principal.organizationId}, inputFile, ...overrides});
  await atomicJson(inputFile, dataset);
  const store = await createStore(dataDir);
  const args = {store, dataDir, configFile, root, now: () => time};
  const automation = await createAutomation(args);
  t.after(async () => { automation.stop(); await fs.rm(root, {recursive: true, force: true}); });
  return {root, inputFile, dataset, store, automation, args, setTime: value => { time = new Date(value); }};
}
test('automation imports, filters report evidence, deduplicates and survives restart', async t => {
  const f = await fixture(t);
  assert.equal((await f.automation.run()).reportAvailable, true);
  assert.equal(f.store.snapshot().revision, 1);
  assert.equal(f.automation.latest().briefing.counts.pending, 2);
  assert.equal(JSON.stringify(f.automation.latest()).includes('hidden-doc'), false);
  const first = await fs.readFile(path.join(f.args.dataDir, 'reports/latest.json'), 'utf8');
  await f.automation.run(); assert.equal(f.store.snapshot().revision, 1);
  assert.equal(await fs.readFile(path.join(f.args.dataDir, 'reports/latest.json'), 'utf8'), first);
  const restarted = await createAutomation({...f.args, store: await createStore(f.args.dataDir)});
  await restarted.run(); assert.deepEqual(restarted.latest(), f.automation.latest());
});
test('changed data is processed after the daily deadline and invalidates an earlier report', async t => {
  const f = await fixture(t); await f.automation.run();
  f.dataset.items[0].status = 'completed'; await atomicJson(f.inputFile, f.dataset);
  await f.automation.run(); assert.equal(f.automation.latest().briefing.counts.pending, 1);
  await f.store.replace(createDemoDataset());
  assert.equal(f.automation.status().reportAvailable, false); assert.throws(() => f.automation.latest(), /보고서/);
});
test('missing, malformed, stale, future and wrong-principal input preserve the last dataset', async t => {
  const f = await fixture(t); await f.automation.run(); const revision = f.store.snapshot().revision;
  const variants = [
    {...f.dataset, principal: {...f.dataset.principal, userId: 'other-user'}},
    {...f.dataset, principal: {...f.dataset.principal, organizationId: 'other-org'}},
    {...f.dataset, source: {...f.dataset.source, exportedAt: '2026-01-01T00:00:00Z'}},
    {...f.dataset, source: {...f.dataset.source, exportedAt: '2027-01-01T00:00:00Z'}},
    {...f.dataset, source: {...f.dataset.source, kind: 'demo'}}, {bad: true},
  ];
  for (const data of variants) { await atomicJson(f.inputFile, data); assert.equal((await f.automation.run()).outcome, 'failed'); assert.equal(f.store.snapshot().revision, revision); assert.equal(f.automation.status().reportAvailable, false); }
  await fs.unlink(f.inputFile); assert.equal((await f.automation.run()).outcome, 'failed');
  await fs.writeFile(f.inputFile, '{'); assert.equal((await f.automation.run()).outcome, 'failed');
});
test('daily schedule uses KST, catches missed runs, and refuses yesterday report', async t => {
  const f = await fixture(t); f.dataset.source.exportedAt = '2026-10-21T23:00:00Z'; await atomicJson(f.inputFile, f.dataset); f.setTime('2026-10-21T23:59:00Z');
  const before = await f.automation.run(); assert.equal(before.outcome, 'completed'); assert.equal(before.reportAvailable, false);
  f.setTime('2026-10-22T00:00:00Z'); assert.equal((await f.automation.run()).reportAvailable, true);
  f.setTime('2026-10-22T15:01:00Z'); assert.equal(f.automation.status().reportAvailable, false);
  f.setTime('2026-10-23T02:00:00Z'); assert.equal((await f.automation.run()).reportAvailable, true);
  f.setTime('2026-11-01T02:00:00Z'); assert.equal(f.automation.status().reportAvailable, false);
});
test('forced report before scheduled time and concurrent runs produce one replacement', async t => {
  const f = await fixture(t, {briefingTime: '23:00'});
  const results = await Promise.all(Array.from({length: 8}, () => f.automation.run({forceReport: true})));
  assert.ok(results.every(x => x.reportAvailable)); assert.equal(f.store.snapshot().revision, 1);
  assert.equal((await f.store.history()).filter(x => x.action === 'automation.briefing').length, 1);
});
test('disabled and invalid automation settings fail explicitly', async t => {
  const f = await fixture(t, {enabled: false}); await assert.rejects(f.automation.run(), /설정/);
  for (const override of [{intervalSeconds: 0}, {briefingTime: '25:00'}, {maxAgeHours: 0}, {expectedPrincipal: {userId: '', organizationId: ''}, enabled: true}, {extra: true}]) assert.throws(() => validateAutomation({...defaultAutomation, ...override}, f.root));
  const huge = path.join(f.root, 'huge.json'); await fs.writeFile(huge, 'x'.repeat(100)); await assert.rejects(readJsonFile(huge, 10), /최대/);
});
