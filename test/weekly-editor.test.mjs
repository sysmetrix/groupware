import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../src/live/wc/12-report-settings.js', import.meta.url), 'utf8');
const render = runInNewContext(`(S, recovery = null) => { const pgh = () => '', briefCoverage = () => '', reportState = () => ({note:'', range: {from:'2026-11-23',to:'2026-11-25'}}), R = {weeklyDraftPeriod: () => null}, esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); const store = {get: () => recovery}; ${source.slice(source.indexOf('function vReport()'), source.indexOf('  const weeklyHtml'))} return vReport(); }`);

test('weekly editor stays available for empty and populated drafts', () => {
  for (const weekly of ['', '첫 줄\n<둘째 줄>']) {
    const html = render({weekly, a: {summary: {}}});
    assert.match(html, /<textarea id="weekly"/);
    assert.ok(html.includes(weekly ? '첫 줄\n&lt;둘째 줄&gt;' : '></textarea>'));
    assert.ok(html.includes('data-act="richWeekly"'));
    assert.ok(html.includes('data-act="dlWeekly"'));
  }
  assert.match(render({weekly: '', a: {summary: {}}}, {text: '보관 초안'}), /data-act="recoverWeekly"/);
});
