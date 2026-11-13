import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const views = readFileSync(new URL('../src/live/wc/05-views.js', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8');
test('cancelled navigation preserves current view and selection', () => {
  const code = views.match(/const go = v => \{[^\n]+/)[0];
  const S = {view:'mail', sel:{key:'draft'}, pane:{url:'draft',expanded:true}, multi:new Set(['a'])};
  const context = {S, leavePane:()=>false, render:()=>{throw Error('must not render')}, $:()=>null};
  vm.createContext(context); vm.runInContext(code + '\nthis.go=go;', context);
  assert.equal(context.go('budget'), false); assert.equal(S.view, 'mail'); assert.equal(S.pane.url,'draft'); assert.equal(S.sel.key,'draft');
});
test('explicit overlay close works while backdrop does not close through protected content', () => {
  assert.match(events, /act === 'closeOverlay' && hasStop && !actEl\.closest\('\[data-stop\]'\)/);
});
test('budget export uses the displayed month filter', () => {
  const line = events.match(/case 'csvLedger':[^\n]+/)[0];
  assert.match(line, /l\.rows\.filter\(r => !month \|\| r\.date\.slice\(4, 6\) === month\)/);
  assert.match(line, /R\.toCsv\(rows,/);
});
