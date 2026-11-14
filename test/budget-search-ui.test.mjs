import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../src/live/wc/10-calendar-budget.js',import.meta.url),'utf8');
const events=readFileSync(new URL('../src/live/wc/16-events.js',import.meta.url),'utf8');
test('budget search and picker expose explicit controls and separate searching state',()=>{
 assert.match(ui,/data-act="bSearch"/); assert.match(ui,/data-act="bSearchClear"/);
 assert.match(ui,/b\.pickOpen\s*&&\s*!searching/); assert.match(ui,/id="bPickFilter"/);
 assert.match(events,/case 'bPick':[\s\S]{0,150}pickOpen\s*=\s*false/);
 assert.match(events,/t\.id === 'bPickFilter'/);
});
