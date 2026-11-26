// 근무시간 도구의 '이번 주' 답: 확정(승인)된 날의 인정 시간만 더하고, 빠진 날을 밝히며, 월 집계로 대신 답하지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/live/wc/36-chat-tools-more.js', import.meta.url), 'utf8');
const pick = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
const code = pick('  const chatModuleOk', '  const chatLim') + pick('  /** 이번 주(월~오늘) 답', "  chatRegisterTool({\n    name: 'list_mail'");

/** 조각에서 근무시간 도구만 떼어 돌린다. */
function run(attendance, {today = '2026-11-19', args = {week: true}, now = ''} = {}) {
  let tool;
  const S = {raw: {data: {attendance}, status: {}}};
  const addDays = (iso, k) => new Date(Date.parse(iso + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
  new Function('S', 'today', 'chatAddDays', 'chatMd', 'chatNotReady', 'chatRegisterTool', 'attTodayText', 'R', code)(
    S, () => today, addDays, iso => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`, () => ({ok: false}), def => { tool = def; }, () => now, {});
  return tool.run(args, {});
}
const day = (date, extra = {}) => ({date, result: '정상', item: '', status: '승인', come: '0900', leave: '1800', recognizedMin: 480, holiday: false, ...extra});
const month = {from: '20261101', recognizedMin: 9999, basicMin: 9999, overtimeMin: 0, nightMin: 0};

test('the week total adds only approved days and says how many were left out', async () => {
  const r = await run({month, days: [day('20261113'), day('20261116'), day('20261117', {recognizedMin: 450}), day('20261118', {status: '대기'}), day('20261119', {recognizedMin: null, leave: ''})]}, {now: '출근 09:00 · 출근 후 2시간'});
  assert.equal(r.ok, true);
  assert.match(r.text.split('\n')[0], /^이번 주\(11\/16~11\/19\) 인정 근무시간 합계는 15시간 30분입니다\(확정된 2일\)\. 합계에서 빠진 날: 미확정 1일, 인정 시간 없음 1일\.$/);
  assert.match(r.text, /머문 시간은 27시간/);
  assert.match(r.text, /오늘: 출근 09:00 · 출근 후 2시간/);
  assert.ok(!r.text.includes('166시간'), 'the month total is never used for a week question');
});

test('a weekday with no row is counted as missing, a day off is not', async () => {
  const r = await run({month, days: [day('20261116'), day('20261118', {result: '휴일', holiday: true, recognizedMin: 0, come: '', leave: ''})]});
  assert.match(r.text, /합계는 8시간입니다\(확정된 1일\)\. 합계에서 빠진 날: 인정 시간 없음 2일\./);
});

test('with nothing to add up it says so first, with the reason, and gives no month figure', async () => {
  const pending = await run({month, days: [day('20261116', {status: '대기'})]}, {today: '2026-11-16'});
  assert.equal(pending.ok, false);
  assert.match(pending.text, /^이번 주 합계는 계산할 수 없습니다\. .*미확정 1일/);
  for (const at of [{month, days: [], daysError: '조회 실패'}, undefined]) {
    const r = await run(at);
    assert.match(r.text, /^이번 주 합계는 계산할 수 없습니다\. /);
    assert.ok(!r.text.includes('166시간'));
  }
});

test('days of the week that fall in last month are reported as not read', async () => {
  const r = await run({month, days: [day('20261201')]}, {today: '2026-12-01'});
  assert.match(r.text, /합계는 8시간입니다\(확정된 1일\)\. 합계에서 빠진 날: 지난달이라 조회되지 않은 1일\./);
});

test('without the week argument the month answer is unchanged', () => {
  assert.match(src, /if \(a\.week\) return chatWeekHours\(at, nav\);/);
});
