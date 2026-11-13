import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const events = readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('../src/live/wc/29-home-view.js', import.meta.url), 'utf8');
test('home and chat actions dispatch to their own registered handlers, not document search', () => {
  const switchBody = events.match(/switch \(act\) \{([\s\S]*?)\n    \}\n  \}\);/)[1];
  const grouped = [...switchBody.matchAll(/((?:\s*case '[^']+':)+)\s*([^\n]*?break;)/g)];
  for (const name of ['homeTile','homeNext','homeOpenToday','chatChip','chatSend','chatStop','chatClear','chatConfirm','chatCancel','chatSetupAi','chatFocus','chatOpenItem','chatNav']) {
    const blocks = grouped.filter(m => m[1].includes(`case '${name}':`));
    assert.equal(blocks.length, 1, `${name} appears exactly once`);
    assert.match(blocks[0][2], /HOME_ACTS\[act\]/, `${name} dispatches to home`);
  }
  const docs = grouped.find(m => m[1].includes("case 'dfSearch':"));
  assert.match(docs[2], /dfAct\(/);
});
test('home cards reset old filters and open the correct views', () => {
  const fn = home.match(/HOME_ACTS\.homeTile = \(el, v\) => \{([\s\S]*?)\n  \};/)[0];
  const S = {filter: {showHidden:true, onlyNew:true}, cal: {offset: -2}};
  const calls = [];
  const context = {HOME_ACTS: {}, S, go: v => calls.push(v), teamCfg: () => S.cal, today: () => '2026-11-14'};
  vm.createContext(context); vm.runInContext(fn, context);
  for (const [id, view, level] of [['urgent','today','urgent'],['todo','today','all'],['wait','today','wait']]) {
    context.HOME_ACTS.homeTile(null,id);
    assert.equal(calls.pop(),view); assert.equal(S.filter.level,level);
    assert.equal(S.filter.onlyNew,false); assert.equal(S.filter.showHidden,false);
  }
  context.HOME_ACTS.homeTile(null,'schedule'); assert.equal(calls.pop(),'calendar'); assert.equal(S.cal.offset,0);
  context.HOME_ACTS.homeTile(null,'away'); assert.equal(calls.pop(),'calendar'); assert.equal(S.cal.day,'20261114');
});
