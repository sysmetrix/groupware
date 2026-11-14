import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const detail = readFileSync(new URL('../src/live/wc/13-detail-pane.js', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8');
const code = detail.slice(detail.indexOf('  function openUrl('), detail.indexOf('  // Would opening this item record'));
const leave = detail.slice(detail.indexOf('  function leavePane()'), detail.indexOf('  // After the user opens a document'));
function setup({sel = null, view = 'mail', url = '', dirty = false, confirm = () => true} = {}) {
  const S = {sel, view, pane: {url, mounted: url, dirty, expanded: false, extract: null}};
  const original = {hidden: false}, preview = {removed: false, remove() { this.removed = true; }};
  const frame = {querySelector: q => q === 'iframe' ? original : preview};
  let renders = 0;
  const c = {S, confirm, $: () => frame, render: () => renders++, renderPane: () => renders++};
  vm.runInNewContext(leave + code + '\nthis.open = openUrl; this.back = returnFromOriginalScreen; this.preview = enterAttachmentPreview;', c);
  return {S, c, original, preview, get renders() {return renders;}};
}
test('returns to previous selection and view; repeated opens preserve the first origin', () => {
 const sel = {type:'mail',uid:'123'}; const t = setup({sel});
 assert.equal(t.c.open('/first'), true); t.S.view = 'budget'; t.S.sel = {type:'doc'};
 assert.equal(t.c.open('/second'), true); assert.equal(t.c.back(), true);
 assert.equal(t.S.sel, sel); assert.equal(t.S.view, 'mail'); assert.equal(t.S.pane.url, '');
 assert.equal(t.S.pane.expanded, false); assert.equal(t.S.pane.originalBack, undefined);
});
test('returns to a previously selected frame or to the list when no selection existed', () => {
 const sel = {type:'frame',title:'previous'}; const a = setup({sel}); a.c.open('/one'); a.c.back(); assert.equal(a.S.sel, sel);
 const b = setup(); b.c.open('/one'); assert.equal(b.S.sel.type, 'frame'); b.c.back(); assert.equal(b.S.sel, null);
});
test('declining dirty confirmation leaves iframe and all state intact', () => {
 const t = setup({sel:{type:'mail'}, confirm:()=>false}); t.c.open('/one'); t.S.pane.dirty=true;
 const before = {...t.S.pane}; const sel=t.S.sel; const renders=t.renders;
 assert.equal(t.c.back(), false); assert.deepEqual(t.S.pane,before); assert.equal(t.S.sel,sel); assert.equal(t.renders,renders);
});
test('attachment return keeps original iframe and dirty input, later departure asks', () => {
 let allow=false; const t=setup({sel:{type:'mail'},confirm:()=>allow}); t.c.open('/mail'); t.S.pane.dirty=true;
 t.c.preview('/preview'); assert.equal(t.original.hidden,true); assert.equal(t.c.back(),true);
 assert.equal(t.preview.removed,true); assert.equal(t.original.hidden,false); assert.equal(t.S.pane.dirty,true); assert.equal(t.S.pane.url,'/mail');
 assert.equal(t.c.back(),false); allow=true; assert.equal(t.c.back(),true); assert.equal(t.S.pane.url,'');
});
test('declining unread prompt does not clear preview or dirty state', () => {
 const t=setup({sel:{type:'mail'},confirm:()=>false}); t.c.open('/mail'); t.S.pane.dirty=true; t.c.preview('/preview');
 const back=t.S.pane.previewBack; assert.equal(t.c.open('/other',{unread:true}),false);
 assert.equal(t.S.pane.previewBack,back); assert.equal(t.original.hidden,true); assert.equal(back.dirty,true);
});
test('explicit event and wrapping header remain available on narrow layouts', () => {
 assert.match(events,/case 'returnOriginalScreen': returnFromOriginalScreen\(\); break;/);
 assert.match(detail,/class="top" style="flex-wrap:wrap"/);
 assert.match(detail,/data-act="returnOriginalScreen"/);
 assert.match(detail,/!S\.pane\.previewBack \? `\<button/);
});
