import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize, validateModelConfig} from '../src/model.mjs';
const config = validateModelConfig({model: 'local-test', baseUrl: 'http://127.0.0.1:11434'});
const result = {task: 'search', query: '운영', hits: [{id: 'allowed', title: '문서', excerpt: '실제 근거'}]};
const response = claims => new Response(JSON.stringify({message: {content: JSON.stringify({claims})}}));
test('only loopback local models may be configured', () => {
  for (const baseUrl of ['https://example.com', 'http://127.0.0.1.evil.test', 'http://user:pass@localhost:11434', 'http://localhost:11434/proxy']) assert.throws(() => validateModelConfig({model: 'test', baseUrl}));
  assert.throws(() => validateModelConfig({model: 'test:cloud', baseUrl: 'http://localhost:11434'}));
  assert.equal(validateModelConfig({model: '', baseUrl: 'unused'}).enabled, false);
});
test('model receives bounded evidence, not arbitrary tools', async () => {
  let payload;
  const output = await summarize(result, config, async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat'); assert.equal(options.redirect, 'error');
    payload = JSON.parse(options.body); return response([{text: '근거 요약', sourceIds: ['allowed']}]);
  });
  assert.equal(output.claims.length, 1); assert.equal(payload.stream, false); assert.equal(payload.tools, undefined);
  assert.equal(JSON.parse(payload.messages[1].content).evidence.length, 1);
});
test('fabricated citation ids and malformed responses are rejected', async () => {
  for (const claims of [[{text: '거짓 근거', sourceIds: ['hidden']}], [{text: '근거 없음', sourceIds: []}], [{text: 'bad', sourceIds: ['allowed'], command: 'send'}]]) {
    await assert.rejects(summarize(result, config, async () => response(claims)));
  }
  await assert.rejects(summarize(result, config, async () => new Response('invalid')));
});
test('no evidence skips model invocation', async () => {
  const output = await summarize({...result, hits: []}, config, async () => { throw new Error('must not fetch'); });
  assert.equal(output.mode, 'no-evidence');
});
test('upstream error does not leak its response body', async () => {
  await assert.rejects(summarize(result, config, async () => new Response('secret upstream detail', {status: 500})), error => !error.message.includes('secret'));
});
