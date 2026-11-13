import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/live/wc/09-search-board.js', import.meta.url), 'utf8');
const code = source.match(/  function bucketOfAction\(x\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(code, 'board classification exists');
const context = {S: {plan: {}}, isHidden: k => k === 'hidden' || k === 'old', resurfaced: k => k === 'old', isSnoozed: () => false, stateOf: x => x.state, today: () => '2026-11-14'};
vm.createContext(context);
const bucket = vm.runInContext(`(${code.trim()})`, context);
test('linked active to-do suppresses only its duplicate action card', () => {
  const linkedCode = source.match(/const boardLinked = x => ([^;]+);/)[1];
  const c = {S: {todos: [{key: 'a', status: 'todo'}]}};
  vm.createContext(c);
  const linked = vm.runInContext(`x => ${linkedCode}`, c);
  assert.equal(linked({key: 'a'}), true);
  c.S.todos[0].status = 'done';
  assert.equal(linked({key: 'a'}), false);
  assert.equal(linked({key: 'b'}), false);
});

test('board separates pending approval and resurfaces older hidden items', () => {
  assert.equal(bucket({key: 'wait', state: 'wait', type: 'attendance', when: '2026-11-10'}), 'wait');
  assert.equal(bucket({key: 'hidden', state: 'check'}), 'done');
  assert.equal(bucket({key: 'old', state: 'check', type: 'attendance', when: '2026-11-02'}), 'late');
  context.S.plan.wait = 'today';
  assert.equal(bucket({key: 'wait', state: 'wait'}), 'wait');
});
