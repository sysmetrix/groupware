import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeStatus} from '../src/runtime-status.mjs';
const config = {model: 'local-test', baseUrl: 'http://127.0.0.1:11434'};
test('runtime distinguishes unconfigured, unreachable and installed-but-unloaded without inference', async () => {
  let calls = [];
  assert.equal((await createRuntimeStatus({model: ''}, {fetchImpl: () => { throw new Error('must not call'); }})()).service, 'not-configured');
  assert.equal((await createRuntimeStatus(config, {fetchImpl: async () => { throw new Error('offline'); }})()).service, 'unavailable');
  const status = await createRuntimeStatus(config, {fetchImpl: async (url, options) => {
    calls.push(url); assert.equal(options.method, undefined); assert.equal(options.body, undefined);
    return Response.json({models: url.endsWith('/tags') ? [{name: 'local-test:latest'}] : []});
  }})();
  assert.equal(status.installed, true); assert.equal(status.loaded, false); assert.equal(status.gpuBytes, null);
  assert.deepEqual(calls, [config.baseUrl + '/api/tags', config.baseUrl + '/api/ps']);
});
test('runtime deduplicates pending requests, caches briefly and does not expose other model names', async () => {
  let time = 1000, calls = 0;
  const inspect = createRuntimeStatus(config, {now: () => time, fetchImpl: async url => {
    calls++; return Response.json({models: url.endsWith('/tags') ? [{name: 'local-test'}, {name: 'private-other'}] : [{name: 'local-test', size_vram: 12345}]});
  }});
  const [a, b] = await Promise.all([inspect(), inspect()]);
  assert.equal(calls, 2); assert.equal(a.gpuBytes, 12345); a.gpuBytes = 9;
  assert.equal(b.gpuBytes, 12345); assert.equal((await inspect()).gpuBytes, 12345);
  assert.equal(JSON.stringify(b).includes('private-other'), false);
  time += 11000; await inspect(); assert.equal(calls, 4);
});
test('malformed and oversized catalog remain unknown; ps failure does not claim model is unloaded', async () => {
  for (const data of [{}, {models: [null]}, {models: [{name: 5}]}, {padding: 'x'.repeat(260000)}]) {
    assert.equal((await createRuntimeStatus(config, {fetchImpl: async () => Response.json(data)})()).service, 'unavailable');
  }
  const status = await createRuntimeStatus(config, {fetchImpl: async url => url.endsWith('/tags') ? Response.json({models: [{name: 'local-test'}]}) : new Response('', {status: 500})})();
  assert.equal(status.service, 'running'); assert.equal(status.installed, true); assert.equal(status.loaded, null);
  assert.throws(() => createRuntimeStatus({...config, baseUrl: 'https://external.example'}));
});
