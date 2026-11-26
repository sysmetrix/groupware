// v1.25.1 예산 표 도장: 잔액 0은 '거의 다 씀'이 아니라 '다 씀'(보통 도장)
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {budgetFlag} from '../src/live/briefing.mjs';

test('잔액 0 → 다 씀(보통), 잔액이 남은 95% 이상 → 거의 다 씀(주의), 초과 → 초과', () => {
  assert.deepEqual(budgetFlag({budget: 344356000, executed: 344356000, balance: 0, rate: 100}), {label: '다 씀', tone: 'tag'});
  assert.deepEqual(budgetFlag({budget: 69243000, executed: 69232310, balance: 10690, rate: 99.98}), {label: '거의 다 씀', tone: 'check'});
  assert.deepEqual(budgetFlag({budget: 100, executed: 120, balance: -20, rate: 120}), {label: '초과', tone: 'urgent'});
  assert.equal(budgetFlag({budget: 100, executed: 50, balance: 50, rate: 50}), null);
  assert.equal(budgetFlag({budget: 0, executed: 0, balance: 0, rate: 0}), null, '예산이 없는 과목은 다 씀이 아니다');
  assert.deepEqual(budgetFlag({budget: 100, executed: 100, rate: 100}), {label: '다 씀', tone: 'tag'}, '잔액 칸이 없으면 예산-집행으로 본다');
  assert.deepEqual(budgetFlag({budget: 100, executed: 10, balance: 90, rate: 10, level: '세'}, 90), {label: '덜 씀', tone: 'tag'});
  assert.equal(budgetFlag({budget: 100, executed: 10, balance: 90, rate: 10, level: '항'}, 90), null);
  assert.equal(budgetFlag({budget: 100, executed: 10, balance: 90, rate: 10, level: '세'}, null), null);
});

test('사업 상세 표와 재단 전체 표가 같은 판정을 쓴다', () => {
  for (const f of ['10-calendar-budget.js', '54-budget-home.js']) {
    const s = readFileSync(new URL('../src/live/wc/' + f, import.meta.url), 'utf8');
    assert.match(s, /R\.budgetFlag\(r, el\)/, f);
    assert.doesNotMatch(s, /r\.rate >= 95\) \? '<span class="bdg check">거의 다 씀/, f);
  }
});
