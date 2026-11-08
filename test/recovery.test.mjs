import test from 'node:test';
import assert from 'node:assert/strict';
import {AppError} from '../src/schema.mjs';
import {AutomationError, classifyFailure, nextDelaySeconds} from '../src/recovery.mjs';

test('recovery distinguishes correctable input from transient IO without leaking raw errors', () => {
  for (const code of ['SCOPE_MISMATCH', 'SOURCE_KIND', 'STALE_SOURCE', 'SOURCE_ROLLBACK']) {
    const result = classifyFailure(new AutomationError(code, 'safe message'));
    assert.equal(result.errorCode, code); assert.equal(result.retryable, false); assert.ok(result.recoveryAction);
  }
  assert.equal(classifyFailure(new AutomationError('SNAPSHOT_CHANGED', 'safe')).retryable, true);
  assert.equal(classifyFailure(new AppError('safe')).errorCode, 'INVALID_INPUT');
  for (const [code, expected, retryable] of [['ENOENT', 'INPUT_MISSING', false], ['EBUSY', 'IO_TEMPORARY', true], ['EIO', 'IO_TEMPORARY', true], ['EACCES', 'STORAGE_UNAVAILABLE', false], ['ENOSPC', 'STORAGE_UNAVAILABLE', false], ['unknown', 'PROCESSING_FAILED', false]]) {
    const result = classifyFailure(Object.assign(new Error('secret path and document'), {code}));
    assert.equal(result.errorCode, expected); assert.equal(result.retryable, retryable);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});

test('retry delay backs off to 15 minutes without shortening longer configured intervals', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10000].map(n => nextDelaySeconds(60, n, true)), [60, 120, 240, 480, 900, 900]);
  assert.equal(nextDelaySeconds(3600, 100, true), 3600);
  assert.equal(nextDelaySeconds(60, 100, false), 60);
});
