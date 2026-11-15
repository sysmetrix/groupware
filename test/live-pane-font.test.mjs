import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = p => readFile(new URL('../src/live/wc/' + p, import.meta.url), 'utf8');
test('font registration loads Pretendard with safe system fallback', async () => {
 const s = await read('02-shell.js');
 assert.match(s, /new FontFace\('Pretendard Variable'/);
 assert.match(s, /face\.load\(\)\.catch/);
 assert.match(s, /document\.fonts\.delete\(face\)/);
});
test('detail retains a fallback opener only when original opener is absent', async () => {
 const s = await read('13-detail-pane.js');
 assert.match(s, /const hasInlineOpen = !!ph\.querySelector/);
 assert.match(s, /hasInlineOpen \? '[^']+' : '<button class="btn primary" data-act="paneOpenMain">/);
 assert.match(s, /data-act="mailOpenItem"/);
});
