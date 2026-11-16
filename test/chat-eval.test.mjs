// 대화 평가 문항(eval/chat-questions.json): 로컬 라우터 점수가 떨어지면 실패한다.
// 문항을 고치거나 더할 때는 사용자 입장에서 "이 말에는 이 일이 일어나야 한다"를 적는다. 라우터에 맞춰 답을 바꾸지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeAll, gradeItem, loadQuestions} from '../scripts/eval-chat.mjs';
import {chatMentionsOther, chatExtractName, chatNotDoing, chatIntent} from '../src/live/chat.mjs';

test('the question set is well formed and big enough to mean something', async () => {
  const set = await loadQuestions();
  assert.ok(set.items.length >= 80, `${set.items.length} questions`);
  assert.ok(!Number.isNaN(Date.parse(set.now)));
  const ids = set.items.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(new Set(set.items.map(i => i.q)).size, set.items.length, 'questions are unique');
  for (const i of set.items) {
    assert.ok(i.id && i.cat && typeof i.q === 'string' && i.q.trim(), `${i.id} has id, cat, q`);
    assert.ok(typeof i.tool === 'string' || (Array.isArray(i.tool) && i.tool.length), `${i.id} has an expected tool`);
  }
  for (const cat of ['조회', '실행', '넘겨짚지 않기', '안전']) assert.ok(set.items.some(i => i.cat === cat), `${cat} is covered`);
});

test('no question the local router used to get right is now wrong', async () => {
  const g = gradeAll(await loadQuestions());
  assert.deepEqual(g.regressed.map(r => `${r.item.id} "${r.item.q}": ${r.reason}`), []);
  assert.deepEqual(g.fixed.map(r => r.item.id), [], 'these now pass: remove "known" from them');
});

test('grading notices a wrong tool, a forbidden tool and a wrong argument', () => {
  const now = new Date('2026-11-16T01:00:00Z');
  assert.equal(gradeItem({q: '내일 연차 신청해줘', tool: 'prepare_leave_request', args: {date: '2026-11-17'}}, now).ok, true);
  assert.match(gradeItem({q: '내일 연차 신청해줘', tool: 'get_schedule'}, now).reason, /기대 get_schedule/);
  assert.match(gradeItem({q: '내일 연차 신청해줘', tool: 'prepare_leave_request', args: {date: '2026-11-18'}}, now).reason, /date/);
  assert.match(gradeItem({q: '내일 연차 신청해줘', tool: ['', 'prepare_leave_request'], notTool: ['prepare_leave_request']}, now).reason, /가면 안 됨/);
});

test('names with a title are read as the person, and weekdays or titles are not names', () => {
  assert.equal(chatExtractName('한지우 팀장님 오늘 자리에 계셔?'), '한지우');
  assert.equal(chatExtractName('서도윤 대리 내일 출장이야?'), '서도윤');
  assert.equal(chatExtractName('다음 주 월요일 일정'), '');
  assert.equal(chatExtractName('팀장님 오늘 어디 계셔?'), '');
});

test('questions about someone else are recognised so own-data tools do not answer them', () => {
  for (const q of ['한지우 팀장 시간외 얼마나 했어?', '서도윤 대리 근무시간 알려줘', '민서연 님 출근했어?']) assert.equal(chatMentionsOther(q), true, q);
  for (const q of ['이번 달 시간외 얼마나 했지?', '오늘 몇 시에 출근했어?', '내 근무시간 알려줘', '우리 팀장 누구야', '']) assert.equal(chatMentionsOther(q), false, q);
});

test('things the assistant never does get a plain "not done here" answer instead of a list or "not understood"', () => {
  assert.match(chatNotDoing('결재 승인해줘'), /결재 승인·반려는 GW 비서가 대신 하지 않습니다/);
  assert.match(chatNotDoing('이 문서 반려 처리해'), /대신 하지 않습니다/);
  assert.match(chatNotDoing('상신까지 해줘'), /^상신은 GW 비서가 대신 하지 않습니다/);
  assert.match(chatNotDoing('문서 삭제해줘'), /^삭제는 GW 비서가 대신 하지 않습니다/);
  assert.match(chatNotDoing('한지우 팀장 시간외 얼마나 했어?'), /다른 직원의 근무시간·시간외는 조회하지 않습니다/);
  for (const q of ['결재할 문서 있어?', '반려된 문서 있나?', '내가 올린 문서 어떻게 됐어?', '이번 달 시간외 얼마나 했지?', '한지우 팀장님 오늘 자리에 계셔?', '서도윤 대리 내일 출장이야?', '내일 연차 신청해줘', '']) assert.equal(chatNotDoing(q), '', q);
  for (const q of ['결재 승인해줘', '상신까지 해줘', '문서 삭제해줘', '한지우 팀장 시간외 얼마나 했어?']) assert.equal(chatIntent(q, new Date('2026-11-16T01:00:00Z')).tool, '', q);
});
