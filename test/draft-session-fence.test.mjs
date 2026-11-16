import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../src/live/wc/19-draft-engine.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('  const guardStopped'), source.indexOf('  // 본문:'));
const load = (name, ctx) => runInNewContext(helpers + ';' + name, ctx);

test('pickBinder stops after its await when the draft session changes', async () => {
  let live = true, openerClicks = 0, leafEvents = 0;
  const opener = {click() { openerClicks++; }};
  const leaf = {children: [], innerText: '대상철', dispatchEvent() { leafEvents++; }};
  const dlg = {querySelectorAll() { return [leaf];}};
  const inp = {value: '', parentElement: {querySelector() { return opener;}}};
  const doc = {querySelector() { return inp;}};
  const pickBinder = load('pickBinder', {wait: async () => { live = false; }, waitFor: async () => null, dlgOf: () => dlg});
  const result = await pickBinder({contentDocument: doc, contentWindow: {MouseEvent: class {}}}, '대상철', () => live);
  assert.equal(result.ok, false); assert.match(result.detail, /변경되어 중단/);
  assert.equal(openerClicks, 1); assert.equal(leafEvents, 0);
});

test('applyMyApprovalLine does not continue to basic or cleanup after a stale session', async () => {
  let live = true, waits = 0, lineClicks = 0, tabClicks = 0, basicClicks = 0, cleanupClicks = 0;
  const line = {innerText: '결재라인지정', click() { lineClicks++; }};
  const tab = {children: [], innerText: '내결재라인', click() { tabClicks++; }};
  const basic = {children: [], innerText: '기본', click() { basicClicks++; }, dispatchEvent() { basicClicks++; }};
  const cleanup = {innerText: '취소', click() { cleanupClicks++; }};
  const dlg = {innerText: '', querySelectorAll(sel) { return sel === '*' ? [tab, basic] : [cleanup]; }};
  const doc = {querySelectorAll() { return [line];}, querySelector() { return {contentWindow: {HwpCtrl: {GetFieldText() { return ''; }}}}; }};
  const apply = load('applyMyApprovalLine', {
    wait: async () => { if (++waits === 2) live = false; }, waitFor: async () => null,
    dlgOf: () => dlg, allDlgs: () => [dlg], btnIn: () => cleanup
  });
  const result = await apply({contentDocument: doc, contentWindow: {MouseEvent: class {}}}, () => live);
  assert.equal(result.ok, false); assert.equal(lineClicks, 1); assert.equal(tabClicks, 1);
  assert.equal(basicClicks, 0); assert.equal(cleanupClicks, 0);
});

test('pickRefDoc reports interruption without cancelling a dialog after its open wait', async () => {
  let live = true, openClicks = 0, cancelClicks = 0;
  const open = {click() { openClicks++; }};
  const cancel = {click() { cancelClicks++; }};
  const doc = {querySelectorAll() { return []; }};
  const pickRefDoc = load('pickRefDoc', {
    waitFor: async () => open, wait: async () => { live = false; }, dlgOf: () => ({querySelectorAll() { return []; }}), btnIn: () => cancel,
    setNative() {}
  });
  const result = await pickRefDoc({contentDocument: doc, contentWindow: {MouseEvent: class {}, KeyboardEvent: class {}}}, '계획', 'A-1', () => live);
  assert.equal(result.ok, false); assert.match(result.detail, /변경되어 중단/);
  assert.equal(openClicks, 1); assert.equal(cancelClicks, 0);
});

test('fillDraft passes its live guard to every async draft helper', () => {
  assert.match(source, /pickBinder\(f, m\.binder, guard\)/);
  assert.match(source, /applyMyApprovalLine\(f, guard\)/);
  assert.match(source, /pickRefDoc\(f, spec\.ref\.title, spec\.ref\.docNo, guard\)/);
  assert.match(source, /const r = await fn\(live\)/);
});
