import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const detail = readFileSync(new URL('../src/live/wc/13-detail-pane.js', import.meta.url), 'utf8');
const draft = readFileSync(new URL('../src/live/wc/19-draft-engine.js', import.meta.url), 'utf8');
const chunk = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
function dirtyHarness() {
  const listeners = {}, note = {style: {}}, input = {tagName: 'INPUT', type: 'text', value: 'original', checked: false};
  let hwp = 'body';
  const ctrl = {GetFieldText: () => hwp};
  const doc = {querySelectorAll: s => s === 'iframe' ? [] : [input], querySelector: () => ({contentWindow: {HwpCtrl: ctrl}}), addEventListener: (n, fn) => listeners[n] = fn};
  const frame = {isConnected: true, contentDocument: doc};
  const S = {pane: {url: '/draft', dirty: false}};
  let confirms = 0;
  const api = runInNewContext(chunk(detail, '  function markPaneDirty', '  // 메일 쓰기') + chunk(detail, '  function leavePane()', '  // After the user') + ';({watchDirty,leavePane,markPaneDirty})', {S, $: s => s === '#dirtyNote' ? note : frame, setInterval: () => 1, clearInterval() {}, confirm: () => { confirms++; return false; }});
  api.watchDirty(frame, '/draft');
  return {api, S, frame, input, listeners, note, setHwp: v => hwp = v, confirms: () => confirms};
}
for (const event of ['input', 'change', 'paste', 'drop']) test('trusted ' + event + ' protects edits', () => {
  const h = dirtyHarness(); h.listeners[event]({isTrusted: true, target: h.input});
  assert.equal(h.S.pane.dirty, true); assert.equal(h.api.leavePane(), false);
});
for (const key of ['Backspace', 'Delete']) test(key + ' deletion protects edits', () => {
  const h = dirtyHarness(); h.listeners.keydown({isTrusted: true, key, target: h.input}); assert.equal(h.S.pane.dirty, true);
});
test('synthetic initialization event alone does not dirty the pane', () => {
  const h = dirtyHarness(); h.listeners.input({isTrusted: false, target: h.input}); assert.equal(h.S.pane.dirty, false); assert.equal(h.api.leavePane(), true);
});
test('silent value setter and HWP changes are checked before leaving', () => {
  for (const change of [h => h.input.value = '', h => h.setHwp('edited')]) {
    const h = dirtyHarness(); change(h); assert.equal(h.api.leavePane(), false); assert.equal(h.confirms(), 1);
  }
});
test('programmatic autofill explicitly marks dirty and ignores stale frames', () => {
  const h = dirtyHarness(); h.api.markPaneDirty(h.frame, '/old'); assert.equal(h.S.pane.dirty, false);
  h.api.markPaneDirty(h.frame, '/draft'); assert.equal(h.S.pane.dirty, true);
});
function mailHarness() {
  const pending = [], S = {apEpoch: 1, sel: null};
  const ctx = {S, currentKey: 'a', GW: {mailDetail: () => new Promise((resolve, reject) => pending.push({resolve, reject}))}, renderPane() {}};
  const fn = runInNewContext(chunk(detail, '  async function loadMailDetail', '  // The groupware') + ';loadMailDetail', ctx);
  return {ctx, S, pending, load: fn};
}
test('detail epoch invalidation releases busy without swallowing the response', async () => {
  const h = mailHarness(), p = h.load({uid: '1', seen: true}); await Promise.resolve(); h.S.apEpoch++;
  const response = {files: []}; h.pending[0].resolve(response);
  assert.equal(await p, response); assert.equal(h.S.mailDetBusy['1'], undefined); assert.equal(h.S.mailDet['1'], undefined);
});
test('old account detail cleanup cannot delete a newer busy request', async () => {
  const h = mailHarness(), p = h.load({uid: '1'}); await Promise.resolve(); const oldBusy = h.S.mailDetBusy;
  h.ctx.currentKey = 'b'; h.S.mailDetBusy = {}; const p2 = h.load({uid: '1'}); await Promise.resolve();
  h.pending[0].resolve({old: true}); await p; assert.equal(oldBusy['1'], undefined); assert.ok(h.S.mailDetBusy['1']);
  h.pending[1].resolve({fresh: true}); assert.equal((await p2).fresh, true);
});
test('detail rejection releases busy on stale epochs', async () => {
  const h = mailHarness(), p = h.load({uid: '1'}); await Promise.resolve(); h.S.apEpoch++; h.pending[0].reject(new Error('offline'));
  assert.equal((await p).error, 'offline'); assert.equal(h.S.mailDetBusy['1'], undefined);
});
test('result body uses actual facts, never planned figures', () => {
  const make = runInNewContext(chunk(draft, '  function buildConfirmedResultBody', '  // ---------- 결과보고:') + ';buildConfirmedResultBody');
  const body = make({docNo: 'A-12', body: 'planned 100명 999,000원'}, ['today', '', '32명', '450,000원']);
  assert.match(body.text, /32명/); assert.match(body.text, /450,000원/); assert.match(body.text, /실적 확인 필요/);
  assert.doesNotMatch(body.text, /100명|999,000원/); assert.equal(body.lines.length, body.hang.length);
});
function fillHarness(confirmValue, failDialog = false) {
  const S = {pane: {url: '/draft'}}, calls = [], input = {value: ''};
  const ctrl = {PutFieldText() {}};
  const doc = {querySelector: s => s.includes('input[') ? input : {contentWindow: {HwpCtrl: ctrl}}};
  const frame = {isConnected: true, contentDocument: doc, contentWindow: {}}, AUTO = {};
  let dialogCalls = 0;
  const ctx = {S, currentKey: 'a', getUserKey: () => 'a', preflight: () => '', confirm: () => confirmValue, installGuard() {}, AUTO, window: {addEventListener() {}}, setTimeout() {}, allDlgs: () => {if (failDialog && ++dialogCalls === 1) throw new Error('dialog failed'); return [];}, markPaneDirty: () => {S.pane.dirty = true;}, setNative: (w, el, v) => el.value = v, wait: async () => {}, setRadioByLabel: (d, v) => {calls.push(v); return true;}, pickBinder: async (f, v) => {calls.push(v); return {ok: true};}, applyMyApprovalLine: async () => ({ok: true}), btnIn() {}};
  const fill = runInNewContext(chunk(draft, '  async function fillDraft', '  function showDraftReport') + ';fillDraft', ctx);
  return {S, calls, frame, AUTO, fill};
}
test('unconfirmed inferred classifications and binder are never applied', async () => {
  const h = fillHarness(false); const steps = await h.fill(h.frame, {title: 'title', meta: {open: '공개', sec: '일반', binder: '추정철'}});
  assert.deepEqual(h.calls, []); assert.equal(h.S.pane.dirty, true); assert.equal(h.AUTO.running, false); assert.ok(steps.some(s => !s.ok));
});
test('confirmed values alone can be applied; missing classification remains incomplete', async () => {
  const h = fillHarness(true); const steps = await h.fill(h.frame, {title: 'title', meta: {open: '비공개'}});
  assert.deepEqual(h.calls, ['비공개']); assert.equal(steps.find(s => s.name.includes('공개')).ok, false);
});
test('autofill guard releases even when dialog inspection throws', async () => {
  const h = fillHarness(false, true); await assert.rejects(h.fill(h.frame, {title: 'title', meta: {}}), /dialog failed/); assert.equal(h.AUTO.running, false); assert.equal(h.S.pane.dirty, true);
});
test('assigned fragments remain valid JavaScript', () => { new Function(detail); new Function(draft); });
