import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const board = readFileSync(new URL('../src/live/wc/09-search-board.js', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8');
const parser = board.match(/  const parseDue = v => \{[\s\S]*?\n  \};/)[0];
const input = board.match(/  addTodoFromInput = function \(\) \{[\s\S]*?\n  \};/)[0];
const edit = events.match(/      case 'todoEdit':[^\n]+/)[0];
function setup() {
  const calls = []; const title = {value:' 업무 '}; const due = {value:'', focus: () => calls.push('focus')};
  const S = {todos: [{id:'1', title:'원래', due:'2026-01-01'}]};
  const c = {R:{kstNow:()=>({y:2026})}, S, calls, $: id => id === '#tdTitle' ? title : due,
    addTodo:(...a)=>calls.push(['add',...a]), addTodoFromInput:()=>{}, toast:v=>calls.push(['toast',v]),
    pushUndo:()=>calls.push('undo'), saveLocal:()=>calls.push('save'), renderMain:()=>{}, renderNav:()=>{}, toastUndo:()=>{},
    el:{dataset:{id:'1'}}, askForm:async options => { calls.push(['form',options]); return c.answers.shift(); }};
  vm.createContext(c); vm.runInContext(`${parser}\n const dueError = '잘못된 기한';\n${input}\nthis.parse = parseDue; this.runEdit = () => { switch ('todoEdit') { ${edit} } };`,c);
  return {c,calls,title,due,S};
}
test('빈 값과 유효 날짜, 윤년 및 실제 달력의 무효 날짜 구분', () => {
  const {c} = setup();
  for (const [v,expected] of [['',''],['  ',''],['1/2','2026-01-02'],['11.2','2026-11-02'],['2024-02-29','2024-02-29'],['2000-02-29','2000-02-29'],['2026-02-29',null],['1900-02-29',null],['2026-04-31',null],['13/1',null],['0/1',null],['1/0',null],['garbage',null],['2026-1-02',null],['0000-01-01',null]]) assert.equal(c.parse(v),expected,v);
});
test('추가 경로는 무효 입력에서 경고하고 입력값과 기존 할 일을 보존', () => {
  const {c,calls,due,S} = setup(); due.value='2/30'; c.addTodoFromInput();
  assert.equal(S.todos.length,1); assert.equal(due.value,'2/30'); assert.deepEqual(calls.map(x=>Array.isArray(x)?x[0]:x),['toast','focus']);
  calls.length=0; due.value=''; c.addTodoFromInput(); assert.deepEqual(calls[0],['add','업무','','직접 추가']);
  calls.length=0; due.value='2/28'; c.addTodoFromInput(); assert.deepEqual(calls[0],['add','업무','2026-02-28','직접 추가']);
});
test('수정 경로는 무효 날짜에서 이전 값을 보존하고 입력을 재표시한 뒤 유효 값 저장', async () => {
  const {c,calls,S} = setup(); c.answers=[['바뀐 제목','2/30'],null]; c.runEdit(); await new Promise(setImmediate);
  assert.equal(S.todos[0].title,'원래'); assert.equal(S.todos[0].due,'2026-01-01'); assert.ok(!calls.includes('save'));
  assert.equal(calls.filter(x=>x[0]==='form')[1][1].fields[1].value,'2/30');
  c.answers=[['새 제목','2/28']]; c.runEdit(); await new Promise(setImmediate);
  assert.equal(S.todos[0].title,'새 제목'); assert.equal(S.todos[0].due,'2026-02-28'); assert.ok(calls.includes('save'));
  c.answers=[['새 제목','']]; c.runEdit(); await new Promise(setImmediate); assert.equal(S.todos[0].due,'');
});
