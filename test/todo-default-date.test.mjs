import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as R from '../src/live/todo-plan.mjs';
const src = fs.readFileSync(new URL('../src/live/wc/51-todo.js', import.meta.url), 'utf8');
const bulk = fs.readFileSync(new URL('../src/live/wc/55-todo-views.js', import.meta.url), 'utf8');
function harness(text, date, chosen = false) {
  const inputs = {tdQuick: {value: text, focus() {}}, tdQuickDue: {value: date, dataset: chosen ? {userSet:'1'} : {}}, tdQuickImp: {value: '0'}};
  let created;
  const c = {R, TD: {}, root: {querySelector: () => null}, today: () => '2026-11-24', $: s => inputs[s.slice(1)], todoSplitQuick: s => R.tdParseQuick(s, new Date('2026-11-24T03:00:00Z')), todoCreate: async o => { created = o; return {ok:true}; }, toast() {}, todoMd: x => x, setTimeout() {}};
  vm.createContext(c);
  vm.runInContext(src.slice(src.indexOf('  async function todoQuickAdd()'), src.indexOf('  // 다른 화면의 "할 일로"')), c);
  return {run: () => c.todoQuickAdd(), result: () => created, inputs};
}
test('빠른 추가: 기본 오늘, 문장 날짜, 기간, 직접 선택과 초기화', async () => {
  for (const [text, date, chosen, start, due] of [
    ['자료 준비', '2026-11-24', false, '2026-11-24','2026-11-24'],
    ['자료 준비 11/28', '2026-11-24', false, '2026-11-28','2026-11-28'],
    ['자료 준비 11/25~11/28', '2026-11-24', false, '2026-11-25','2026-11-28'],
    ['자료 준비 11/28', '2026-11-24', true, '2026-11-24','2026-11-24'],
    ['자료 준비 11/28', '2026-11-26', true, '2026-11-26','2026-11-26'],
    ['자료 준비', '', true, '', ''],
  ]) { const h = harness(text,date,chosen); await h.run(); assert.equal(h.result().start,start); assert.equal(h.result().due,due); assert.equal(h.inputs.tdQuickDue.value,'2026-11-24'); }
});
test('자세히 쓰기 날짜 표시 및 일괄 추가의 기본 날짜가 연결된다', () => {
  assert.ok(src.includes("todoDateField('tdeStart', t.start || t.due || ''"));
  assert.match(src, /HOME_ACTS\.tdNew = .*sp\.due \|\| today\(\)/);
  assert.equal((bulk.match(/due: r\.due \|\| today\(\), start: r\.start \|\| r\.due \|\| today\(\)/g) || []).length, 2);
});
