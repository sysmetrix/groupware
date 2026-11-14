import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/live/wc/32-chat-tools-read.js', import.meta.url), 'utf8');
function setup(analysis) {
  const tools = new Map();
  const context = {S: {a: analysis}, today: () => '2026-11-14', chatRegisterTool: tool => tools.set(tool.name, tool),
    isMine: x => x.mine, stateOf: x => x.state};
  vm.runInNewContext(source, context);
  return tools.get('list_deadlines');
}
const action = (key, state = 'todo', mine = true) => ({key, state, mine});
const deadline = (key, date, title = key, time = '') => ({key, date, title, time, source: '결재'});

test('마감 도구는 내 미처리 기한만 기간과 시간순으로 표시하고 본문 검증 한계를 알린다', async () => {
  const tool = setup({actions: [action('a'), action('b', 'urgent'), action('c', 'todo', false), action('d', 'wait'), action('old')], deadlines: [
    deadline('b', '2026-11-15', '비밀 제목 B', '15:00'), deadline('a', '2026-11-15', '비밀 제목 A', '09:00'),
    deadline('c', '2026-11-14'), deadline('d', '2026-11-14'), deadline('old', '2026-11-13'), deadline('missing', '2026-11-14'), deadline('a', '2026-12-01'),
  ]});
  assert.equal(tool.kind, 'read');
  const r = await tool.run({days: 2});
  assert.equal(r.ok, true); assert.equal(r.data.count, 2);
  assert.deepEqual(Array.from(r.cards[0].items, x => x.title), ['비밀 제목 A', '비밀 제목 B']);
  assert.match(r.text, /원문에서 확인/); assert.match(r.text, /빠진 기한/);
  assert.doesNotMatch(r.llm, /비밀 제목/); assert.doesNotMatch(JSON.stringify(r.data), /비밀 제목/);
  assert.equal(r.cards[0].items[0].act.v, 'a');
});

test('지난 기한 포함과 개수 제한을 적용하고 전체 건수를 보존한다', async () => {
  const tool = setup({actions: [action('a'), action('b'), action('c')], deadlines: [deadline('c', '2026-11-16'), deadline('b', '2026-11-14'), deadline('a', '2026-01-01')]});
  const r = await tool.run({days: 3, include_overdue: true, limit: 1});
  assert.equal(r.data.count, 3); assert.equal(r.data.shown, 1); assert.equal(r.cards[0].more, 2);
  assert.equal(r.cards[0].items[0].title, 'a'); assert.equal(r.cards[0].items[0].tone, 'urgent');
});

test('자료 미준비와 빈 결과를 구분하고 기간 및 표시 수의 상한을 지킨다', async () => {
  assert.equal((await setup(null).run({})).ok, false);
  assert.equal((await setup({deadlines: [], actions: null}).run({})).ok, false);
  const empty = await setup({actions: [], deadlines: []}).run({days: 1000, limit: 1000});
  assert.equal(empty.ok, true); assert.equal(empty.data.count, 0); assert.equal(empty.data.days, 90);
  assert.match(empty.text, /수집된 내 처리 업무/); assert.equal(empty.cards.length, 0);
  const defaults = await setup({actions: [], deadlines: []}).run({days: -1});
  assert.equal(defaults.data.days, 14);
});
