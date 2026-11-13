import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../src/live/wc/12-report-settings.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('  function saveBudgetRows()'), source.indexOf('\n  }', source.indexOf('  function saveBudgetRows()')) + 4);
function fixture(rows, result = true) {
  const inputs = rows.flatMap((row, i) => Object.entries(row).map(([b, value]) => ({dataset: {i: String(i), b}, value})));
  const original = [{project: 'OLD', label: '기존', filter: '1'}, {project: 'KEEP', label: '', filter: ''}];
  const S = {settings: {budget: original}, budget: {table: {cached: true}}};
  const messages = [], flags = new Set(['on']); let calls = 0;
  const saved = {classList: {add: v => flags.add(v), remove: v => flags.delete(v)}};
  const context = {S, root: {querySelectorAll: () => inputs}, $: () => saved, toast: v => messages.push(v), saveLocal: () => { calls++; return result; }, setTimeout: () => 1};
  const save = runInNewContext(`(function() { ${fn}; return saveBudgetRows; })()`, context);
  return {save, S, original, inputs, messages, flags, get calls() { return calls; }};
}
test('invalid or blank project preserves every existing row and input without saving', () => {
  for (const project of ['', '  ', 'bad-code', '코드!']) {
    const f = fixture([{project: 'NEW', label: '변경', filter: ''}, {project, label: '입력 중', filter: 'x'}]);
    const before = JSON.stringify(f.inputs); f.save();
    assert.strictEqual(f.S.settings.budget, f.original);
    assert.deepEqual(f.S.budget.table, {cached: true});
    assert.equal(JSON.stringify(f.inputs), before);
    assert.equal(f.calls, 0); assert.equal(f.flags.has('on'), false);
    assert.match(f.messages[0], /사업 코드/);
  }
});
test('valid rows save together and trim fields', () => {
  const f = fixture([{project: ' A201 ', label: ' 이름 ', filter: ' 1 '}, {project: '사업2', label: '', filter: ''}]);
  f.save(); assert.equal(f.calls, 1); assert.equal(f.S.budget.table, null);
  assert.equal(JSON.stringify(f.S.settings.budget), JSON.stringify([{project:'A201', filter:'1', label:'이름'}, {project:'사업2', filter:'', label:''}]));
  assert.equal(f.flags.has('on'), true); assert.equal(f.messages.length, 0);
});
test('storage failure is reported without a saved indicator or clearing input', () => {
  const f = fixture([{project: 'A201', label: '입력', filter: ''}], false); const before = JSON.stringify(f.inputs);
  f.save(); assert.equal(f.calls, 1); assert.equal(f.flags.has('on'), false);
  assert.match(f.messages[0], /저장하지 못/); assert.equal(JSON.stringify(f.inputs), before);
});
test('zero rows are deliberately saved as empty', () => {
  const f = fixture([]); f.save(); assert.equal(f.calls, 1); assert.equal(f.S.settings.budget.length, 0);
});
const importFn = source.slice(source.indexOf('  async function settingsImport('), source.indexOf('\n  function saveBudgetRows()'));
function importFixture(read, saveResult = true, initialKey = 'A') {
  const messages = []; let key = initialKey, calls = 0, parsed = 0;
  const context = {currentKey: 'A', getUserKey: () => key, S: {settings: {}, raw: false}, R: {setxParse: () => { parsed++; return {ok: true, changed: [{label: '설정'}], skipped: [], patch: {theme: 'dark'}}; }}, toast: m => messages.push(m), confirm: () => true, saveLocal: () => {calls++; return saveResult;}, applyLook() {}, schedule() {}, renderNav() {}, renderHead() {}, renderMain() {}};
  const run = runInNewContext(`(function() { ${importFn}; return settingsImport; })()`, context);
  return {run, messages, context, setKey: v => {key = v;}, get calls() {return calls;}, get parsed() {return parsed;}};
}
test('settings import stops if account changes during file read', async () => {
  let resolve; const promise = new Promise(r => { resolve = r; });
  const f = importFixture(); const run = f.run({files: [{size: 1, text: () => promise}], value: 'file'});
  f.setKey('B'); resolve('{}'); await run;
  assert.equal(f.parsed, 0); assert.equal(f.calls, 0); assert.match(f.messages[0], /계정이 변경/);
});
test('settings import refuses an already mismatched account', async () => {
  const f = importFixture(null, true, 'B'); await f.run({files: [{size: 1, text: () => '{}'}], value: 'file'});
  assert.equal(f.parsed, 0); assert.equal(f.calls, 0); assert.match(f.messages[0], /계정이 변경/);
});
test('settings import does not report success when save fails', async () => {
  const f = importFixture(null, false); await f.run({files: [{size: 1, text: async () => '{}'}], value: 'file'});
  assert.equal(f.calls, 1); assert.match(f.messages[0], /저장하지 못/); assert.equal(f.messages.some(m => /가져왔습니다/.test(m)), false);
});