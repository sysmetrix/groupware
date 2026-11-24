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

test('recovery does not replace a draft that could not be backed up', () => {
  const handlers = readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8');
  const branch = handlers.split('\n').find(line => line.includes("case 'recoverWeekly':"));
  for (const [backup, saved] of [[false,false],[true,false],[true,true]]) {
    const S = {weekly: 'current'}; let record = {text: 'previous'}, writes = 0;
    runInNewContext(`switch ('recoverWeekly') {${branch}}`, {S, store: {get: () => record, set: (_,v) => {if (backup) record = v; return backup;}}, confirm: () => true, saveLocal: () => {writes++; return saved;}, renderMain() {}, toast() {}});
    assert.equal(writes, Number(backup));
    assert.equal(S.weekly, saved ? 'previous' : 'current');
    assert.equal(record.text, saved ? 'current' : 'previous');
  }
});
