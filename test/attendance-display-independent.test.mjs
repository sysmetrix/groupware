import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const file = name => readFileSync(new URL('../src/live/wc/' + name, import.meta.url), 'utf8');
const chatSource = file('32-chat-tools-read.js');
function chat({fail = false, anomalies = [], attendance = {today: {come: '0900', leave: '1800'}, overtime: {me: '1', days: [], apps: []}}} = {}) {
  const tools = {};
  const ctx = {chatRegisterTool: tool => { tools[tool.name] = tool; }, S: {a: {}, raw: {data: {attendance}}},
    R: {kstNow: () => ({date: '2026-11-14'}), attendanceAnomalies: () => anomalies},
    GW: {attendanceDays: async () => { if (fail) throw new Error('실패'); return []; }},
    fmtDays: String, hm4: x => x || '', ymd8: x => x, Date};
  vm.runInNewContext(chatSource, ctx);
  return tools.get_my_attendance.run({month: '2026-11'});
}
test('AI 응답은 출근 지문을 표시하지 않고 시간외 퇴근 지문만 안내', async () => {
  const r = await chat({anomalies: [{date: '20261101', item: '시간외', advice: '결근'}]});
  assert.equal(r.ok, true); assert.match(r.text, /시간외 신청일 중 퇴근 지문/); assert.doesNotMatch(r.text, /출근/);
  assert.doesNotMatch(JSON.stringify(r.cards), /결근/);
});
test('조회 실패는 정상으로 판정하지 않음', async () => {
  const r = await chat({fail: true}); assert.equal(r.ok, false); assert.match(r.text, /읽지 못했습니다/); assert.doesNotMatch(r.text, /없습니다|정상/);
  const missing = await chat({attendance: {today: {error: 'FAIL'}, overtime: {me: '1', days: [], apps: []}}}); assert.match(missing.text, /어제까지/); assert.doesNotMatch(missing.text, /오늘 퇴근/);
  const noApps = await chat({attendance: null}); assert.equal(noApps.ok, false); assert.match(noApps.text, /판단할 수 없습니다/);
});
test('달력과 상세는 근태 대기를 결재 대기로 단정하지 않음', () => {
  const a = file('11-attendance.js'), d = file('13-detail-pane.js');
  assert.doesNotMatch(a, /waitDays|결재 대기/); assert.match(a, /st\.error/); assert.match(a, /rows = null; error = true/);
  assert.match(d, /시간외 신청일의 퇴근 지문/); assert.doesNotMatch(d, /근태신청 결재가 끝나면 그룹웨어 기록이 바뀌고 이 항목은 저절로 사라집니다/);
});
