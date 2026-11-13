// Mail list ordering is isolated from the browser and raw-data collector.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/live/wc/08-approval-mail.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function pickFunction(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  let depth = 0, end = start, opened = false;
  for (; end < source.length; end++) {
    if (source[end] === '{') { depth++; opened = true; }
    if (source[end] === '}' && opened && --depth === 0) return source.slice(start + 2, end + 1);
  }
  throw new Error(`${name} is not closed`);
}
const api = vm.runInNewContext(`${pickFunction('mailDateValue')}\n${pickFunction('sortMailNewest')}\n;({mailDateValue, sortMailNewest})`, {Date, String, Number, Infinity});

test('mailDateValue accepts collected numeric and RFC dates without rolling invalid dates', () => {
  assert.equal(api.mailDateValue('2026-11-14 09:30:15'), Date.UTC(2026, 10, 14, 9, 30, 15));
  assert.equal(api.mailDateValue('2026년 11월 14일 오후 9:30'), Date.UTC(2026, 10, 14, 21, 30, 0));
  assert.equal(api.mailDateValue('Fri, 14 Nov 2026 09:30:00 +0900'), Date.UTC(2026, 10, 14, 0, 30, 0));
  for (const value of ['', '2026-02-30 09:00', '2026-13-01', '2026년 11월 14일 오후 13:00', 'Fri, 30 Feb 2026 09:00:00 +0900', '2026-11-14 unknown', '날짜 없음']) assert.equal(api.mailDateValue(value), null, value || '(empty)');
});

test('sortMailNewest is newest-first, keeps equal dates stable, and puts unknown dates last', () => {
  const records = [
    {uid: 'old', date: '2026-11-13 09:00'},
    {uid: 'unknown-a', date: '날짜 없음'},
    {uid: 'new', date: '2026-11-14 09:00'},
    {uid: 'same-time', date: '2026-11-14 09:00'},
    {uid: 'unknown-b', date: ''},
  ];
  const sorted = api.sortMailNewest(records);
  assert.deepEqual(sorted.map(x => x.uid), ['new', 'same-time', 'old', 'unknown-a', 'unknown-b']);
  assert.deepEqual(records.map(x => x.uid), ['old', 'unknown-a', 'new', 'same-time', 'unknown-b']);
});

test('mail view labels the default ordering and scopes the selected row to mailbox and uid', () => {
  assert.match(source, /최근 메일 · 최신순/);
  assert.match(source, /S\.sel\.box === x\.box && S\.sel\.uid === x\.uid/);
  assert.match(source, /mailWhen\(x\.date\)/);
});