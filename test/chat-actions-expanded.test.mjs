import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/live/wc/33-chat-tools-act.js', import.meta.url), 'utf8');
function setup() {
  const tools = new Map(), calls = [];
  const S = {a: {actions: []}, sel: null, view: 'home', apTab: 'pending'};
  const c = {S, chatRegisterTool: t => tools.set(t.name, t), chatNotReady: () => ({ok: false, text: '읽는 중'}),
    visibleActions: () => S.a.actions, chatTaskItem: x => ({title: x.title, act: {act: 'chatOpenItem', v: x.key}}),
    go: v => { calls.push(['go', v]); S.view = v; S.sel = null; return true; },
    renderMain: () => calls.push(['render']), selectAction: key => { calls.push(['select', key]); S.sel = {type: 'action', key}; }};
  vm.runInNewContext(source, c);
  return {tools, S, c, calls};
}

test('queue preparation is allowlisted, confirmation-only, and opens the requested pinned list', async () => {
  for (const queue of ['pending', 'deptWaiting', 'distWaiting', 'sendWaiting', 'viewing', 'submitted']) {
    const {tools, S, calls} = setup();
    const res = await tools.get('prepare_approval_queue').run({queue});
    assert.equal(res.ok, true); assert.equal(calls.length, 0);
    assert.equal((await res.cards[0].onConfirm()).ok, true);
    assert.equal(S.view, 'approval'); assert.equal(S.apTab, queue); assert.equal(S.apTabPinned, true);
    assert.deepEqual(calls, [['go', 'approval'], ['render']]);
  }
  const {tools, calls} = setup();
  for (const queue of ['__proto__', 'constructor', 'approve', '', undefined]) assert.equal((await tools.get('prepare_approval_queue').run({queue})).ok, false);
  assert.equal(calls.length, 0);
});

test('queue stops if data is unavailable or pane navigation is refused', async () => {
  const {tools, S, c} = setup(), run = tools.get('prepare_approval_queue').run;
  S.a = null; assert.equal((await run({queue: 'pending'})).ok, false);
  S.a = {actions: []}; const r = await run({queue: 'deptWaiting'});
  c.go = () => false; assert.equal((await r.cards[0].onConfirm()).ok, false); assert.equal(S.apTab, 'pending');
});

test('task selection never guesses and exact id does not fall back to query', async () => {
  const {tools, S, calls} = setup(), run = tools.get('prepare_task_screen').run;
  S.a.actions = [{key: 'a', title: '자료 제출 요청', area: '결재'}, {key: 'b', title: '자료 제출 요청', area: '메일'}];
  assert.equal((await run({})).ok, false);
  assert.equal((await run({itemId: 'missing', query: '자료'})).ok, false);
  const ambiguous = await run({query: '자료 제출'});
  assert.equal(ambiguous.ok, false); assert.equal(ambiguous.cards[0].items.length, 2);
  assert.equal(calls.length, 0);
  const res = await run({query: '자료 제출', area: '결재'});
  assert.equal(res.ok, true); assert.equal(calls.length, 0);
  assert.equal((await res.cards[0].onConfirm()).ok, true);
  assert.deepEqual(calls, [['go', 'today'], ['select', 'a']]);
});

test('task confirmation rechecks item identity and handles refused or failed selection', async () => {
  const {tools, S, c, calls} = setup(), run = tools.get('prepare_task_screen').run;
  S.a.actions = [{key: 'a', title: '문서', area: '결재'}];
  let res = await run({itemId: 'a'}); S.a.actions[0].title = '다른 문서';
  assert.equal((await res.cards[0].onConfirm()).ok, false); assert.equal(calls.length, 0);
  res = await run({itemId: 'a'}); c.go = () => false;
  assert.equal((await res.cards[0].onConfirm()).ok, false);
  c.go = () => true; c.selectAction = () => {};
  assert.equal((await res.cards[0].onConfirm()).ok, false);
});

test('attendance callbacks distinguish successful, partial, failed and cancelled preparation', async () => {
  for (const tool of ['prepare_leave_request', 'prepare_trip_request', 'prepare_overtime_request']) {
    for (const [status, ok, expected] of [['success', true, /자동 기입을 마쳤습니다/], ['partial', true, /일부만/], ['failed', false, /완료하지 못했습니다/], ['cancelled', false, /취소/], [undefined, false, /취소/]]) {
      const {tools, c} = setup();
      c.chatDateArg = x => x; c.today = () => '2026-11-14';
      c.quickAttendanceApplication = async () => status ? {status, total: 4, failed: status === 'partial' ? 1 : 0} : undefined;
      const result = await tools.get(tool).run({date: '2026-11-16'});
      const confirmed = await result.cards[0].onConfirm();
      assert.equal(confirmed.ok, ok, `${tool} ${status}`); assert.match(confirmed.text, expected);
      assert.match(confirmed.text, /제출하지 않았/);
    }
  }
});
