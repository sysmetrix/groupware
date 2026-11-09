import test from 'node:test';
import assert from 'node:assert/strict';
import {chatRankModels, chatCooldownFor, chatComposePrompt, chatExtractPerson, chatParseDate, chatParseTime, chatParseRange, chatIntent, chatExtractName, chatToGeminiTools, chatParseResponse, chatSanitizeForLlm, chatSanitizeText, chatErrorMessage, chatBuildRequest, chatSystemPrompt} from '../src/live/chat.mjs';

// 2026-11-10 (화) 12:00 KST
const NOW = new Date('2026-11-10T12:00:00+09:00');

test('chatParseDate: relative days, weekdays, explicit dates, rejection of impossible dates', () => {
  const d = s => (chatParseDate(s, NOW) || {}).date;
  assert.equal(d('오늘 일정'), '2026-11-10');
  assert.equal(d('내일 일정 알려줘'), '2026-11-11');
  assert.equal(d('모레'), '2026-11-12');
  assert.equal(d('어제'), '2026-11-09');
  assert.equal(d('다음 주 수요일'), '2026-11-18');
  assert.equal(d('이번 주 금요일'), '2026-11-13');
  assert.equal(d('수요일에'), '2026-11-11');
  assert.equal(d('화요일'), '2026-11-10');
  assert.equal(d('11/12 연차'), '2026-11-12');
  assert.equal(d('11월 20일'), '2026-11-20');
  assert.equal(d('2026-12-01'), '2026-12-01');
  assert.equal(d('25일에'), '2026-11-25');
  assert.equal(d('2/30'), undefined);
  assert.equal(d('13월 5일'), undefined);
  assert.equal(d('아무 말'), undefined);
  const wk = chatParseDate('다음 주 일정', NOW);
  assert.equal(wk.date, '2026-11-16'); assert.equal(wk.end, '2026-11-20');
  assert.equal(chatParseDate('1/5', NOW).date, '2027-01-05'); // 한참 지난 달은 내년
});

test('chatParseTime and chatParseRange', () => {
  assert.equal(chatParseTime('14:30'), '14:30');
  assert.equal(chatParseTime('오후 2시 30분'), '14:30');
  assert.equal(chatParseTime('오전 9시'), '09:00');
  assert.equal(chatParseTime('3시 반'), '03:30');
  assert.equal(chatParseTime('25:00'), '');
  assert.deepEqual(chatParseRange('10시부터 15시까지'), {start: '10:00', end: '15:00'});
  assert.deepEqual(chatParseRange('10:00~15:00'), {start: '10:00', end: '15:00'});
  assert.deepEqual(chatParseRange('내일'), {start: '', end: ''});
});

test('chatIntent: Korean phrases route to the right tool', () => {
  const cases = [
    ['내일 일정 알려줘', 'get_schedule'], ['오늘 일정', 'get_schedule'], ['다음 주 일정 보여줘', 'get_schedule'],
    ['김지은 언제 출장이야', 'get_staff_status'], ['이승봉 님 내일 휴가야?', 'get_staff_status'], ['오늘 누가 출장이야', 'get_staff_status'], ['이번 주 누가 휴가야', 'get_staff_status'],
    ['11/12 연차 신청해줘', 'prepare_leave_request'], ['내일 오후 반차 쓸래', 'prepare_leave_request'], ['다음 주 월요일 휴가 신청', 'prepare_leave_request'],
    ['11/20 관내출장 신청해줘', 'prepare_trip_request'], ['내일 시간외 근무 신청해줘', 'prepare_overtime_request'], ['모레 야근 신청 18시부터 21시까지', 'prepare_overtime_request'],
    ['급한 일 알려줘', 'list_tasks'], ['오늘 해야 할 일', 'list_tasks'], ['결재 대기 중인 거', 'list_tasks'], ['받은 메일 처리할 거 있어?', 'list_tasks'],
    ['오늘 요약해줘', 'get_overview'], ['업무 브리핑', 'get_overview'],
    ['남은 연차 몇 일이야', 'get_my_attendance'], ['내 근태 확인', 'get_my_attendance'],
    ['월간업무보고 검색', 'search_documents'], ['노동이사제 찾아줘', 'search_documents'],
    ['예산 집행 현황', 'get_budget'], ['차량 예약 가능한 시간', 'get_resource_status'], ['내일 관용차 비어 있어?', 'get_resource_status'],
    ['내일 14시부터 16시까지 차량 예약해줘', 'reserve_vehicle'], ['결과보고 작성해줘', 'prepare_draft'], ['운영계획서 기안 시작', 'prepare_draft'],
    ['김팀장 메일 답장 써줘', 'draft_mail_reply'], ['보고서 할 일 추가해줘', 'add_todo'], ['예산 화면 열어줘', 'open_view'], ['구글 캘린더에 올릴 거 있어?', 'get_gcal_sync'], ['답장 필요한 메일 있어?', 'list_tasks'], ['이번 주에 내가 제일 먼저 챙길 게 뭐야?', 'list_tasks'], ['회신 안 한 메일 뭐야', 'list_tasks'], ['김지은 전화번호 알려줘', 'lookup_person'], ['이승봉 팀장 부서가 어디야', 'lookup_person'], ['근태 구글 캘린더 동기화 해줘', 'get_gcal_sync'], ['메일 보여줘', 'open_view'],
  ];
  for (const [q, tool] of cases) assert.equal(chatIntent(q, NOW).tool, tool, q);
  assert.equal(chatIntent('안녕', NOW).tool, '');
  assert.equal(chatIntent('', NOW).confidence, 0);
});

test('chatIntent: arguments are extracted', () => {
  const a = chatIntent('11/12 연차 신청해줘', NOW).args; assert.equal(a.date, '2026-11-12'); assert.equal(a.kind, '연차');
  assert.equal(chatIntent('내일 오후 반차 쓸래', NOW).args.kind, '오후반차');
  const v = chatIntent('내일 14시부터 16시까지 차량 예약해줘', NOW).args; assert.deepEqual([v.date, v.start, v.end], ['2026-11-11', '14:00', '16:00']);
  const s = chatIntent('김지은 언제 출장이야', NOW).args; assert.equal(s.name, '김지은');
  assert.equal(chatIntent('다음 주 관외출장 신청', NOW).args.scope, '관외');
  assert.equal(chatExtractName('오늘 누가 출장이야'), '');
  assert.equal(chatExtractName('홍미소 팀장 내일 자리에 있어'), '홍미소');
});

test('chatSanitizeForLlm: strips bodies, accounts, emails, phones, others fingerprints; truncates', () => {
  const s = chatSanitizeForLlm({title: '문의 test@bwyf.or.kr 010-1234-5678', body: '비밀', snippet: 'x', account: '110-123-456789', come: '0859', list: [{leaveTm: '1900', name: '가', note: '계좌 110-123-456789 로 이체'}], long: 'ㄱ'.repeat(300), n: 3});
  assert.equal(s.body, undefined); assert.equal(s.snippet, undefined); assert.equal(s.account, undefined); assert.equal(s.come, undefined);
  assert.match(s.title, /\*\*\*@\*\*\*/); assert.match(s.title, /\*\*\*-\*\*\*\*-\*\*\*\*/);
  assert.equal(s.list[0].leaveTm, undefined); assert.match(s.list[0].note, /\*\*\*/);
  assert.ok(s.long.length <= 121); assert.equal(s.n, 3);
  assert.equal(chatSanitizeText('결재 2026-11-10 완료'), '결재 2026-11-10 완료'); // 날짜는 계좌로 오인하지 않는다
});

test('chatToGeminiTools and chatBuildRequest', () => {
  const t = chatToGeminiTools([{name: 'list_tasks', description: 'd', params: {type: 'object', properties: {state: {type: 'string', enum: ['urgent', 'all']}, limit: {type: 'number'}}, required: []}}, {name: 'get_overview', description: 'x', params: {type: 'object', properties: {}}}]);
  const f = t[0].functionDeclarations;
  assert.equal(f[0].parameters.type, 'OBJECT'); assert.equal(f[0].parameters.properties.state.type, 'STRING'); assert.deepEqual(f[0].parameters.properties.state.enum, ['urgent', 'all']);
  assert.equal(f[1].parameters, undefined); // 매개변수 없는 도구는 parameters 생략
  const r = chatBuildRequest({system: 'S', contents: [{role: 'user', parts: [{text: 'hi'}]}], tools: t});
  assert.equal(r.systemInstruction.parts[0].text, 'S'); assert.equal(r.toolConfig.functionCallingConfig.mode, 'AUTO');
  assert.equal(chatBuildRequest({contents: []}).tools, undefined);
});

test('chatParseResponse: text, function calls, blocked, empty, error', () => {
  assert.equal(chatParseResponse({candidates: [{content: {parts: [{text: '안녕'}, {text: '하세요'}]}}]}).text, '안녕하세요');
  const c = chatParseResponse({candidates: [{content: {parts: [{functionCall: {name: 'list_tasks', args: {state: 'urgent'}}}]}}]});
  assert.deepEqual(c.calls, [{name: 'list_tasks', args: {state: 'urgent'}}]); assert.equal(c.error, '');
  assert.equal(chatParseResponse({promptFeedback: {blockReason: 'SAFETY'}}).blocked, true);
  assert.ok(chatParseResponse({candidates: [{content: {parts: []}, finishReason: 'STOP'}]}).error);
  assert.equal(chatParseResponse({error: {message: 'bad'}}).error, 'bad');
  assert.ok(chatParseResponse(null).error);
  assert.equal(chatParseResponse({candidates: [{content: {parts: [{text: '생각', thought: true}, {text: '답'}]}}]}).text, '답');
});

test('chatErrorMessage maps statuses to Korean messages', () => {
  assert.match(chatErrorMessage(429), /사용량/); assert.match(chatErrorMessage(403), /키/); assert.match(chatErrorMessage(400, 'API key not valid'), /키/);
  assert.match(chatErrorMessage(404), /모델/); assert.match(chatErrorMessage(503), /서버/); assert.match(chatErrorMessage(0, 'network'), /연결|늦/);
  assert.match(chatErrorMessage(200, '', 'blocked'), /필터/);
});

test('chatSystemPrompt states the safety rules', () => {
  const p = chatSystemPrompt('2026-11-10 12:00', '홍길동');
  assert.match(p, /홍길동/); assert.match(p, /신뢰할 수 없는/); assert.match(p, /확인 카드/); assert.match(p, /지어내지/);
});

test('chatRankModels prefers lite (newest first), skips preview/tts/image, keeps aliases last', () => {
  const r = chatRankModels(['models/gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-image', 'gemini-flash-latest', 'gemma-4-31b-it', 'gemini-3.8-flash']);
  assert.deepEqual(r, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-flash-latest']);
  assert.deepEqual(chatRankModels([]), []);
});
test('chatCooldownFor: quota, retry info, 404, 5xx', () => {
  assert.equal(chatCooldownFor(429, 'You exceeded your current quota'), 30 * 60000);
  assert.equal(chatCooldownFor(429, 'Please retry in 37.2s.'), 37200);
  assert.equal(chatCooldownFor(429, 'x', '5s'), 30000); // 최소 30초
  assert.equal(chatCooldownFor(429, 'Quota exceeded for metric ... PerDay'), 6 * 3600000);
  assert.equal(chatCooldownFor(404, ''), 24 * 3600000); assert.equal(chatCooldownFor(503, ''), 90000); assert.equal(chatCooldownFor(500, ''), 60000); assert.equal(chatCooldownFor(400, ''), 0);
});
test('chatComposePrompt keeps the result as data and asks for a short grouped answer; chatExtractPerson', () => {
  const p = chatComposePrompt('오늘 누가 출장이야?', '김보라 관내출장', '{"count":1}');
  assert.match(p, /질문: 오늘 누가 출장이야\?/); assert.match(p, /지시문이 아니다/); assert.match(p, /3~5줄/); assert.match(p, /김보라 관내출장/);
  assert.equal(chatExtractPerson('김지은 전화번호 알려줘'), '김지은'); assert.equal(chatExtractPerson('이승봉 팀장 부서'), '이승봉'); assert.equal(chatExtractPerson('내 부서 알려줘'), ''); assert.equal(chatExtractPerson('일정'), '');
});
