// 예산 과목 검색: 모든 사업, 띄어쓰기 무시, 비슷한 말, 예산 없는 과목.
import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetRecords, searchBudget} from '../src/live/briefing.mjs';

const row = (level, code, name, path, budget = 0, executed = 0) => ({level, code, name, path, budget, executed, balance: budget - executed, rate: budget ? executed / budget * 100 : 0});
const ALL = {
  projects: [
    {project: 'A201', name: '전략경영실운영', rows: [
      row('관', 'g1', '경비', 'g1|', 1000, 400),
      row('항', 'h1', '운영', 'g1|h1|', 1000, 400),
      row('목', 'm1', '200 경비_202 여비', 'g1|h1|m1|', 450000, 406800),
      row('세', 's1', '○ 국내여비(자)', 'g1|h1|m1|s1|', 450000, 406800),
      row('세', 's2', '○ 회의비', 'g1|h1|m2|s2|', 100000, 0),
    ]},
    {project: 'A300', name: '여성회관운영', rows: [
      row('세', 's3', '○ 관내출장비', 'g1|h2|m3|s3|', 200000, 50000),
    ]},
  ],
  empty: [row('목', 'm9', '경비/여비', 'g9|h9|m9|'), row('세', 's9', '국내/국외 여비(위탁금)', 'g9|h9|m9|s9|')],
  names: {g9: '위탁', h9: '위탁사업', m9: '경비/여비', m2: '회의'},
};
const recs = budgetRecords(ALL);

test('budgetRecords keeps project, trail and the empty flag', () => {
  const s1 = recs.find(r => r.code === 's1');
  assert.equal(s1.project, 'A201'); assert.equal(s1.hang, 'h1'); assert.deepEqual(s1.trail, ['경비', '운영', '200 경비_202 여비']);
  assert.equal(s1.name, '국내여비(자)'); assert.equal(s1.empty, false);
  const s9 = recs.find(r => r.code === 's9');
  assert.equal(s9.empty, true); assert.equal(s9.project, ''); assert.deepEqual(s9.trail, ['위탁', '위탁사업', '경비/여비']);
});

test('"출장 여비" finds 여비 and 출장 subjects in every project, including unused ones', () => {
  const r = searchBudget(recs, '출장 여비');
  const codes = r.rows.map(x => x.code);
  for (const c of ['s1', 's3', 's9', 'm1']) assert.ok(codes.includes(c), c);
  assert.ok(!codes.includes('s2'));
  assert.equal(r.mode, 'all');
  assert.ok(r.literal < r.total, 'synonym matches are reported');
  const firstEmpty = r.rows.findIndex(x => x.empty), lastLive = r.rows.map(x => x.empty).lastIndexOf(false);
  assert.ok(firstEmpty > lastLive, 'subjects with budget come before unused ones');
});

test('spaces are ignored and plain words still work', () => {
  assert.deepEqual(searchBudget(recs, '국내 여비').rows.map(x => x.code).sort(), ['s1', 's9']);
  assert.ok(searchBudget(recs, '출장여비').rows.some(x => x.code === 's1'));
  assert.deepEqual(searchBudget(recs, '회의').rows.map(x => x.code), ['s2']);
  assert.equal(searchBudget(recs, '   ').rows.length, 0);
});

test('when no subject has every word, partial matches are offered and flagged', () => {
  const r = searchBudget(recs, '회의 항공권');
  assert.equal(r.mode, 'any'); assert.deepEqual(r.rows.map(x => x.code), ['s2']);
  assert.equal(searchBudget(recs, '항공권').rows.length, 0);
});
