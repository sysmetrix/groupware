// 핵심 4(할 일 · 일정·예약 · 근태·연차 · 예산 집행) 대화 규칙의 회귀 테스트.
// 평가 문항(k01~k37)과 같은 문장이 아니라 비슷한 말투로 확인한다. 문항 하나에만 맞춘 규칙이 되지 않게 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chatIntent, chatNormalize, chatNotDoing} from '../src/live/chat.mjs';

const now = new Date('2026-11-16T01:00:00Z'); // 월요일
const tool = q => chatIntent(q, now).tool;
const args = q => chatIntent(q, now).args;

test('cancelling a request or reservation is never read as preparing a new one', () => {
  for (const q of ['연차 취소하고 싶어', '모레 휴가 취소해 줘', '휴가 신청 취소해', '출장 취소할래', '시간외 신청 철회해 줘', '관용차 예약 취소', '회의실 예약 취소 좀 해 줘', '교육 신청 취소 부탁해']) {
    assert.equal(tool(q), '', q);
    assert.match(chatNotDoing(q), /취소는 GW 비서가 대신 하지 않습니다/, q);
  }
  // 되돌리기·자동화·메일 문장의 '취소'는 그대로 둔다
  assert.equal(tool('방금 거 취소해'), 'small_talk');
  assert.equal(tool('자동화 취소해줘'), 'manage_automation');
  assert.equal(tool('한도윤한테 내일 회의 취소됐다고 메일 보내줘'), 'compose_mail');
  assert.equal(chatNotDoing('내일 연차 취소됐어?'), '');
});

test('a sigh about resting is not a leave request, but a date or leave word still is', () => {
  for (const q of ['쉬고 싶다', '너무 피곤해 쉬고 싶어']) assert.notEqual(tool(q), 'prepare_leave_request', q);
  assert.deepEqual([tool('내일 쉬고 싶어'), args('내일 쉬고 싶어').date], ['prepare_leave_request', '2026-11-17']);
});

test('weekday spans and colloquial day names reach the leave request', () => {
  assert.deepEqual(args('다음 주 월화 연차 신청해줘'), {date: '2026-11-23', end_date: '2026-11-24', kind: '연차'});
  assert.deepEqual(args('이번 주 화~목 휴가 올려줘'), {date: '2026-11-17', end_date: '2026-11-19', kind: '연차'});
  assert.deepEqual(args('담주 금욜 반차 쓸래'), {date: '2026-11-27', end_date: '', kind: '오전반차'});
  assert.equal(chatNormalize('담주 화욜 대휴 쓸래'), '다음 주 화요일 대체휴가 쓸래');
  assert.equal(args('다음 주 목금 연차 써도 돼?').end, '2026-11-27');
});

test('vehicle approval questions show reservation status, and rooms are never booked as a car', () => {
  for (const q of ['차량 예약 승인됐어?', '관용차 예약 어떻게 됐어?']) assert.equal(tool(q), 'get_resource_status', q);
  assert.deepEqual(args('내일 세미나실 빌려줘'), {date: '2026-11-17', kind: 'room'});
  assert.equal(tool('회의실 예약해줘'), 'get_resource_status');
  assert.equal(tool('관용차 예약해줘'), 'reserve_vehicle');
});

test('"뭐 잡혀 있어" is a schedule question, not a person called 잡혀', () => {
  assert.deepEqual(args('목요일 회의 뭐 잡혀 있어'), {date: '2026-11-19', days: 1});
  assert.equal(args('담주 금욜 뭐 잡혀있어').date, '2026-11-27');
  assert.equal(tool('내일 뭐 잡혀 있어?'), 'get_schedule');
});

test('to-do list, add and delete wording', () => {
  assert.deepEqual(args('끝낸 할 일 보여줘'), {scope: 'done'});
  assert.deepEqual(args('별표 해 둔 할 일 보여줘'), {scope: 'important'});
  assert.deepEqual(args('집행 계획으로 넣어 둔 할 일 알려줘'), {scope: 'plan'});
  assert.equal(tool('예산 관련 할 일 추가해줘'), 'add_todo');
  assert.deepEqual(args('내일까지 견적 받기 투두 추가'), {title: '견적 받기', due: '2026-11-17'});
  assert.deepEqual(args('보고서 검토 할 일 만들어 줘'), {title: '보고서 검토', due: ''});
  assert.deepEqual(args('다음 주 금요일 마감으로 설문 정리 할 일 하나 만들어 줘'), {title: '설문 정리', due: '2026-11-27'});
  assert.equal(tool('할 일 목록 만들어줘'), 'list_tasks');
  // "목록에 … 추가/넣어/등록"은 추가이고, 목록을 보거나 묻는 말은 조회다
  assert.deepEqual(args('할일 목록에 견적 받기 등록해줘'), {title: '견적 받기', due: ''});
  assert.deepEqual(args('투두 목록에 예산 점검 넣어놔'), {title: '예산 점검', due: ''});
  for (const q of ['할 일 목록 보여줘', '할 일 목록에 뭐 추가됐어?', '할 일 목록을 만들어 줘']) assert.equal(tool(q), 'list_tasks', q);
  for (const q of ['할 일 삭제해줘', '투두 다 지워', '어제 깜빡하고 결과보고 못 올렸어']) assert.equal(tool(q), '', q);
  assert.equal(tool('까먹은 거 없나?'), 'check_risks');
  assert.equal(tool('오늘 제일 중요한 할 일 뭐야?'), 'plan_priorities');
});

test('weekly hour limits are a work-hours question', () => {
  assert.deepEqual([tool('이번 주 40시간 채웠어?'), args('이번 주 40시간 채웠어?').week], ['get_work_hours', true]);
  assert.equal(tool('52시간 넘는 시간외 신청해줘'), 'prepare_overtime_request');
});

test('budget: corporate card slang, payment drafts, subject search and comparing projects', () => {
  assert.equal(chatNormalize('법카 내역'), '법인카드 내역');
  assert.deepEqual(args('지난달 법카 사용 내역 보여줘'), {kind: 'card', period: 'last', state: 'all'});
  for (const q of ['지출결의서 써줘', '지급결의 준비 좀']) assert.deepEqual(args(q), {kind: 'payment', hint: ''}, q);
  assert.equal(tool('결과보고 준비해야 할 거 있어?'), 'list_tasks');
  assert.equal(tool('결의서 상신해줘'), '');
  assert.deepEqual([tool('출장비 과목 어디 있어?'), args('출장비 과목 어디 있어?').query], ['search_budget', '출장비']);
  assert.equal(tool('사업별로 집행률 제일 낮은 데 어디야'), 'budget_forecast');
  assert.equal(tool('가장 많이 남은 과목 뭐야'), 'get_budget');
  assert.equal(tool('연말까지 목표 달성 가능해?'), 'budget_forecast');
});

test('hours already worked is a work-hours question, however it is said', () => {
  for (const q of ['지금까지 일한 시간 얼마야', '이번 달 근무한 시간 보여줘', '오늘 얼마나 일했지', '몇 시간 근무했어 오늘', '휴일에 일한 시간 알려줘', '내가 올해 일한 시간 총 몇이야']) assert.equal(tool(q), 'get_work_hours', q);
  for (const q of ['이번주 내가 일한 시간', '금주 근로한 시간 확인', '이번 주 근무시간 어떻게 돼']) assert.deepEqual([tool(q), args(q).week], ['get_work_hours', true], q);
  assert.equal(args('이번 달 근무시간 알려줘').week, undefined);
  for (const q of ['내일 한 시간 비어?', '한도윤 과장 이번 주 근무한 시간', '근무한 시간 수정 신청해줘']) assert.notEqual(tool(q), 'get_work_hours', q);
  assert.equal(tool('초과해서 일한 시간만큼 시간외 신청해줘'), 'prepare_overtime_request');
});

test('sighs and forgetful mutterings get a short local answer only when no AI is connected', () => {
  const kind = q => { const r = chatIntent(q, now); return [r.tool, r.args.kind, r.confidence >= 0.6 && r.confidence < 0.9]; };
  for (const q of ['일하기 싫다', '오늘 진짜 지친다', '아 답답해', '힘들어 죽겠네', '졸려 ㅠㅠ', '너무 피곤해 쉬고 싶어']) assert.deepEqual(kind(q), ['small_talk', 'vent', true], q);
  for (const q of ['깜빡했네', '아 또 깜빡했다', '요즘 자꾸 잊어버려', '그 일 자꾸 까먹어']) assert.deepEqual(kind(q), ['small_talk', 'forget', true], q);
  // 질문·지시, 뒤에 다른 말이 이어지는 문장은 넘긴다
  for (const q of ['오늘 왜 이렇게 힘들지', '피곤해?', '어제 깜빡하고 결과보고 못 올렸어', '결재 승인해 줘 힘들어', '이 일은 힘들어 보이니까 나눠서 하자']) assert.equal(tool(q), '', q);
  assert.equal(tool('까먹은 거 없나?'), 'check_risks');
  assert.equal(tool('내일 쉬고 싶어'), 'prepare_leave_request');
});

test('mood words before a request are neither a person name nor a schedule question', () => {
  for (const q of ['피곤하면 연차 며칠 남았어', '너무 힘들어서 남은 연차 확인', '지치는데 연차 현황 보여줘', '답답해 연차 얼마 남았지', '지치면 휴가 좀 알려줘']) assert.equal(tool(q), 'get_leave_status', q);
  assert.equal(tool('피곤하니까 내일 일정 알려줘'), 'get_schedule');
  assert.equal(tool('너무 지쳐서 모레 연차 쓰고 싶어'), 'prepare_leave_request');
  for (const q of ['보고서 때문에 진짜 힘들다', '일정이 많아서 너무 피곤하네', '오늘 회의 하다가 지쳤어', '아 결재 올리는 거 또 깜빡했네']) assert.equal(tool(q), 'small_talk', q);
});

