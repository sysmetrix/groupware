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
  assert.equal(restarted.status().reportAvailable, false);
  assert.throws(() => restarted.latest(), /보고서/);
  await restarted.run(); assert.deepEqual(restarted.latest(), f.automation.latest());
});

test('restart cannot expose a saved report when the current input is missing', async t => {
  const f = await fixture(t); await f.automation.run(); await fs.unlink(f.inputFile);
  const restarted = await createAutomation({...f.args, store: await createStore(f.args.dataDir)});
  const state = await restarted.run();
  assert.equal(state.errorCode, 'INPUT_MISSING'); assert.equal(state.reportAvailable, false);
  assert.throws(() => restarted.latest(), /보고서/);
});

test('older but fresh export cannot replace persisted newer data and a corrected file recovers', async t => {
  const f = await fixture(t); await f.automation.run();
  const current = f.store.snapshot();
  f.dataset.source.exportedAt = '2026-10-21T23:00:00Z'; await atomicJson(f.inputFile, f.dataset);
  const restoredStore = await createStore(f.args.dataDir);
  const restarted = await createAutomation({...f.args, store: restoredStore});
  const state = await restarted.run();
  assert.equal(state.errorCode, 'SOURCE_ROLLBACK'); assert.equal(state.retryable, false);
  assert.deepEqual(restoredStore.snapshot().dataset, current.dataset);
  await restarted.run();
  const failures = (await restoredStore.history()).filter(x => x.action === 'automation.sync');
  assert.equal(failures.length, 1); assert.equal(failures[0].errorCode, 'SOURCE_ROLLBACK'); assert.match(failures[0].runId, /^[a-f0-9-]{36}$/);
  await atomicJson(f.inputFile, current.dataset);
  const recovered = await restarted.run();
  assert.equal(recovered.reportAvailable, true); assert.equal(recovered.consecutiveFailures, 0);
  assert.equal(recovered.errorCode, null); assert.equal(recovered.retryDelaySeconds, 60);
});

async function untilScheduled(queue) {
  for (let i = 0; i < 200 && !queue.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(queue.length, 1, 'one next check must be scheduled');
}

test('scheduler waits for each run, backs off on transient IO, then returns to normal after recovery', async t => {
  const f = await fixture(t), queue = [];
  let failures = 2;
  const store = {...f.store, replace: async data => {
    if (failures-- > 0) throw Object.assign(new Error('private path'), {code: 'EBUSY'});
    return f.store.replace(data);
  }};
  const timers = {setTimeout: (callback, delay) => { const entry = {callback, delay}; queue.push(entry); return entry; }, clearTimeout: entry => { const at = queue.indexOf(entry); if (at >= 0) queue.splice(at, 1); }};
  const automation = await createAutomation({...f.args, store, timers}); t.after(() => automation.stop());
  automation.start(); automation.start();
  await untilScheduled(queue); assert.equal(queue[0].delay, 120000);
  assert.equal(automation.status().errorCode, 'IO_TEMPORARY'); assert.equal(automation.status().reportAvailable, false);
  await queue.shift().callback(); assert.equal(queue[0].delay, 240000);
  await queue.shift().callback(); assert.equal(queue[0].delay, 60000);
  assert.equal(automation.status().consecutiveFailures, 0); assert.equal(automation.status().reportAvailable, true);
  automation.stop(); assert.equal(queue.length, 0); assert.equal(automation.status().nextCheckAt, null);
});

test('stop and restart while a run is in flight create only one next timer', async t => {
  const f = await fixture(t), queue = [];
  let entered, release;
  const gate = new Promise(resolve => { release = resolve; });
  const inside = new Promise(resolve => { entered = resolve; });
  const store = {...f.store, replace: async data => { entered(); await gate; return f.store.replace(data); }};
  const timers = {setTimeout: (callback, delay) => { const entry = {callback, delay}; queue.push(entry); return entry; }, clearTimeout: () => { queue.length = 0; }};
  const automation = await createAutomation({...f.args, store, timers}); t.after(() => automation.stop());
  automation.start(); await inside; assert.equal(queue.length, 0);
  automation.stop(); automation.start(); release();
  await untilScheduled(queue); assert.equal(f.store.snapshot().revision, 1);
  automation.stop(); assert.equal(queue.length, 0);
});

test('a report whose completion audit failed is withheld and retried on the next run', async t => {
  const f = await fixture(t); let fail = true;
  const store = {...f.store, audit: async event => {
    if (event.action === 'automation.briefing' && fail) { fail = false; throw Object.assign(new Error('private'), {code: 'EBUSY'}); }
    return f.store.audit(event);
  }};
  const automation = await createAutomation({...f.args, store});
  assert.equal((await automation.run()).reportAvailable, false);
  assert.equal((await automation.run()).reportAvailable, true);
  assert.equal((await f.store.history()).filter(x => x.action === 'automation.briefing').length, 1);
});
test('changed data is processed after the daily deadline and invalidates an earlier report', async t => {
  const f = await fixture(t); await f.automation.run();
  f.dataset.items[0].status = 'completed'; await atomicJson(f.inputFile, f.dataset);
  await f.automation.run(); assert.equal(f.automation.latest().briefing.counts.pending, 1);
  await f.store.replace(createDemoDataset());
  assert.equal(f.automation.status().reportAvailable, false); assert.throws(() => f.automation.latest(), /보고서/);
  const concurrent = await createAutomation({...f.args, store: {...f.store, audit: async event => {
    await f.store.audit(event);
    if (event.action === 'automation.briefing') await f.store.replace(createDemoDataset());
  }}});
  const result = await concurrent.run({forceReport: true});
  assert.equal(result.errorCode, 'SNAPSHOT_CHANGED'); assert.equal(result.reportAvailable, false);
  assert.equal(result.retryable, true);
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
