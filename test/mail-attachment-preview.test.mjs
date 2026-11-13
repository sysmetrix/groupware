import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const detail = readFileSync(new URL('../src/live/wc/13-detail-pane.js', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8');
const helpers = detail.slice(detail.indexOf('  // Keep the original mail iframe mounted'), detail.indexOf('  // Would opening this item record'));
const leavePane = detail.slice(detail.indexOf('  function leavePane()'), detail.indexOf('  // After the user opens a document'));

test('attachment preview retains the original mail iframe and restores its dirty state', () => {
  const original = {hidden: false};
  const preview = {removed: false, remove() { this.removed = true; }};
  let stage = 'original';
  const frame = {querySelector: selector => selector === 'iframe' ? (stage === 'original' ? original : preview) : preview};
  const S = {pane: {url: 'mail-read', mounted: 'mail-read', expanded: false, dirty: true, extract: {mail: true}}};
  let renders = 0;
  const context = {S, $: id => id === '#frame' ? frame : null, renderPane: () => { renders++; }};
  vm.createContext(context);
  vm.runInContext(`${helpers}\nthis.enter = enterAttachmentPreview; this.back = returnFromAttachmentPreview;`, context);

  assert.equal(context.enter('attachment-preview'), true);
  assert.equal(original.hidden, true, 'the mail iframe stays mounted instead of being discarded');
  assert.equal(S.pane.url, 'attachment-preview');
  assert.equal(S.pane.dirty, true, 'the original dirty state is retained for restoration');
  assert.equal(S.pane.expanded, true);

  stage = 'preview';
  assert.equal(context.back(), true);
  assert.equal(preview.removed, true);
  assert.equal(original.hidden, false);
  assert.deepEqual(S.pane, {url: 'mail-read', mounted: 'mail-read', expanded: false, dirty: true, extract: null});
  assert.equal(renders, 2);
});

test('preview UI exposes an explicit return action and event handler', () => {
  assert.match(detail, /data-act="returnAttachmentPreview"[^`]*이전 메일 처리 화면으로/);
  assert.match(detail, /if \(!S\.pane\.previewBack \|\| !S\.pane\.previewBack\.frame\) frame\.innerHTML = ''/);
  assert.match(detail, /f\.dataset\.panePreview = '1'/);
  assert.match(events, /case 'pvFile':[\s\S]*?S\.sel === source\.sel && S\.pane\.url === source\.url[\s\S]*?enterAttachmentPreview\(u\)/);
  assert.match(events, /case 'returnAttachmentPreview': returnFromAttachmentPreview\(\); break;/);
});

test('leaving an attachment preview protects dirty input in the hidden mail screen', () => {
  const S = {pane: {url: 'attachment-preview', dirty: false, previewBack: {dirty: true}}};
  const declined = {S, confirm: () => false};
  vm.createContext(declined);
  vm.runInContext(`${leavePane}\nthis.leave = leavePane;`, declined);
  assert.equal(declined.leave(), false);
  assert.equal(S.pane.previewBack.dirty, true);

  const acceptedS = {pane: {url: 'attachment-preview', dirty: false, previewBack: {dirty: true}}};
  const accepted = {S: acceptedS, confirm: () => true};
  vm.createContext(accepted);
  vm.runInContext(`${leavePane}\nthis.leave = leavePane;`, accepted);
  assert.equal(accepted.leave(), true);
  assert.equal(acceptedS.pane.dirty, false);
  assert.equal(acceptedS.pane.previewBack, undefined);
});