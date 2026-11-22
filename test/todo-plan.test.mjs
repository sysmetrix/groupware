import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/live/todo-plan.mjs';

const NOW = new Date('2026-11-21T03:00:00Z'); // 2026-11-21(토) 12:00 KST

test('정보 묶음: 메모와 정보를 나눠 읽고 다시 써도 같다', () => {
  const meta = {rp: {f: 'w', wd: [1]}, sid: 's1', b: {p: 'A1', h: '가100', c: '가1001010', n: '회의비', a: 300000, d: '2026-12-05', st: 'plan'}};
  const c = T.tdMetaCompose('첫 줄\n둘째 줄', meta);
  assert.ok(c.ok);
  assert.match(c.text, /반복: 매주 월요일/);
  assert.match(c.text, /예산: 가100 회의비 300,000원 \(12\/5 예정\)/);
  const p = T.tdMetaParse(c.text);
  assert.equal(p.memo, '첫 줄\n둘째 줄');
  assert.deepEqual(p.meta.b, meta.b);
  assert.equal(p.meta.v, 1);
  // 그룹웨어에서 메모 위쪽만 고친 경우
  const edited = c.text.replace('첫 줄', '고친 줄');
  assert.equal(T.tdMetaParse(edited).memo, '고친 줄\n둘째 줄');
});

test('정보 묶음: 정보가 없으면 메모만, 깨진 묶음은 일반 할 일', () => {
  assert.equal(T.tdMetaCompose('메모만', {}).text, '메모만');
  const p = T.tdMetaParse('메모\n\n— GW 비서 정보(이 아래는 고치지 마세요) —\n⟦gwb:{깨짐}⟧');
  assert.equal(p.memo, '메모');
  assert.equal(p.broken, true);
  assert.deepEqual(p.meta, {});
  assert.equal(T.tdMetaCompose('x'.repeat(1600), {}).ok, false);
});

test('정보 묶음: 뒤에 덧붙인 글은 메모로 살리고, 표시줄만 남아 있으면 broken', () => {
  const c = T.tdMetaCompose('메모', {rp: {f: 'wd'}, sid: 's'}).text + '\n모바일에서 덧붙임';
  const p = T.tdMetaParse(c);
  assert.deepEqual(p.meta.rp, {f: 'wd'});
  assert.equal(p.memo, '메모\n모바일에서 덧붙임');
  assert.equal(T.tdMetaParse('메모\n\n— GW 비서 정보(이 아래는 고치지 마세요) —\n반복: 매주').broken, true);
});

test('반복: 묶음의 마지막 회차만 보고, 멈춤·다음 회차 표시가 있으면 만들지 않는다', () => {
  const rp = {f: 'w', wd: [1]};
  assert.deepEqual(T.tdRepeatDue([{id: 'a', done: true, due: '2026-11-16', meta: {rp, sid: 's'}}, {id: 'b', done: true, due: '2026-11-23', meta: {rp, sid: 's', nx: 'td9'}}]), []);
  assert.deepEqual(T.tdRepeatDue([{id: 'a', done: true, due: '2026-11-16', meta: {rp, sid: 's'}}, {id: 'b', done: true, due: '2026-11-23', meta: {sid: 's', stop: 1}}]), []);
});

test('그룹웨어 행 정규화: 완료·중요·하위 체크리스트', () => {
  const t = T.tdFromGw({todoSeq: 'td9', todoName: ' 보고서 ', endDate: '20261125', startDate: '20261124', todoStatus: '0', importDegree: '1', contents: '', createDate: '20261121', loginUserTodoOwnerYn: 'Y', loginUserTodoCreateYn: 'Y',
    children: [{todoSeq: 'td10', todoName: '자료', todoStatus: '2'}, {todoSeq: 'td11', todoName: '검토', processRate: 0}]});
  assert.equal(t.title, '보고서');
  assert.equal(t.due, '2026-11-25');
  assert.equal(t.important, true);
  assert.equal(t.done, false);
  assert.equal(t.mine, true);
  assert.deepEqual(t.checklist.map(c => c.done), [true, false]);
});

test('반복: 매주·평일·매월·말일, 주말과 휴일은 앞 평일', () => {
  assert.equal(T.tdNextDue({f: 'w', wd: [1]}, '2026-11-23'), '2026-11-30');
  assert.equal(T.tdNextDue({f: 'w', wd: [1, 3]}, '2026-11-23'), '2026-11-25');
  assert.equal(T.tdNextDue({f: 'wd'}, '2026-11-20'), '2026-11-23'); // 금 → 월
  assert.equal(T.tdNextDue({f: 'm', md: 10}, '2026-11-10'), '2026-12-10');
  assert.equal(T.tdNextDue({f: 'm', md: -1}, '2026-11-30'), '2026-12-31');
  assert.equal(T.tdNextDue({f: 'm', md: 31}, '2026-01-30'), '2026-02-27'); // 2/28은 토요일 → 금
  assert.equal(T.tdNextDue({f: 'm', md: 25}, '2026-11-25', ['2026-12-25']), '2026-12-24'); // 성탄절
  assert.equal(T.tdNextDue({f: 'x'}, '2026-11-25'), '');
});

test('반복: 완료한 회차 중 다음 회차가 없는 것만', () => {
  const list = [
    {id: 'a', done: true, due: '2026-11-16', meta: {rp: {f: 'w', wd: [1]}, sid: 's1'}},
    {id: 'b', done: true, due: '2026-11-23', meta: {rp: {f: 'w', wd: [1]}, sid: 's1'}},
    {id: 'c', done: true, due: '2026-11-10', meta: {rp: {f: 'm', md: 10}, sid: 's2', nx: 'd'}},
    {id: 'd', done: false, due: '2026-12-10', meta: {rp: {f: 'm', md: 10}, sid: 's2'}},
    {id: 'e', done: true, due: '2026-11-20', meta: {rp: {f: 'wd'}, sid: 's3'}},
    {id: 'f', done: false, due: '2026-11-23', meta: {rp: {f: 'wd'}, sid: 's3'}},
  ];
  assert.deepEqual(T.tdRepeatDue(list).map(t => t.id), ['b']);
});

test('점검: 분류, 알림, 퇴근 전 대상, 요약', () => {
  const list = [
    {id: '1', title: '지난', due: '2026-11-19', done: false},
    {id: '2', title: '오늘', due: '2026-11-21', done: false, important: true},
    {id: '3', title: '내일', due: '2026-11-22', done: false},
    {id: '4', title: '사흘', due: '2026-11-24', done: false},
    {id: '5', title: '기한없음', due: '', done: false},
    {id: '6', title: '끝', due: '2026-11-20', done: true, doneDate: '2026-11-20'},
  ];
  assert.deepEqual(list.map(t => T.tdBucketOf(t, NOW)), ['late', 'today', 'tomorrow', 'week', 'nodate', 'done']);
  assert.deepEqual(T.tdAlerts(list, NOW).map(a => a.stage), ['late', 'd0', 'd1', 'd3']);
  assert.equal(T.tdAlerts(list, NOW)[0].label, '기한 2일 지남');
  assert.deepEqual(T.tdWrapUp(list, NOW).map(t => t.id), ['2', '1']);
  const s = T.tdSummary(list, NOW);
  assert.equal(s.total, 5); assert.equal(s.late, 1); assert.equal(s.today, 1); assert.equal(s.done, 1);
});

test('주간 실적 줄: 기간 안에 끝낸 할 일', () => {
  const list = [{title: 'A 정리', done: true, doneDate: '2026-11-18'}, {title: 'B', done: true, doneDate: '2026-11-10'}, {title: 'C 결의', done: true, doneDate: '2026-11-19', meta: {b: {c: 'x', n: '회의비', a: 50000}}}];
  assert.deepEqual(T.tdWeeklyLines(list, '20261116', '20261121'), ['○ 처리한 할 일 2건', '  - A 정리', '  - C 결의 (회의비 50,000원)']);
  assert.deepEqual(T.tdWeeklyLines([], '20261116', '20261121'), []);
});

test('기한 입력 해석', () => {
  assert.equal(T.tdParseDue('11/25', NOW), '2026-11-25');
  assert.equal(T.tdParseDue('2026-12-01', NOW), '2026-12-01');
  assert.equal(T.tdParseDue('내일', NOW), '2026-11-22');
  assert.equal(T.tdParseDue('다음주 월요일', NOW), '2026-11-23');
  assert.equal(T.tdParseDue('금요일', NOW), '2026-11-27');
  assert.equal(T.tdParseDue('1/5', NOW), '2027-01-05');
  assert.equal(T.tdParseDue('2/30', NOW), null);
  assert.equal(T.tdParseDue('', NOW), '');
  assert.equal(T.tdParseDue('언젠가', NOW), null);
});

const ROWS = [
  {level: '항', code: '가100', name: '시민 거버넌스운영', budget: 10000000, executed: 6500000},
  {level: '세', code: '가1001010', name: '○ 시민 거버넌스 회의 참석수당(출)', budget: 2000000, executed: 1200000},
  {level: '세', code: '가1001110', name: '○ 시민 거버넌스 운영비(출)', budget: 5400000, executed: 3400000},
  {level: '세', code: '가1001211', name: '○ 시민 거버넌스 회의비(자)', budget: 900000, executed: 800000},
  {level: '세', code: '가1001311', name: '○ 시민 거버넌스 보상금(자)', budget: 1700000, executed: 1100000},
];
const DOC = {docNo: '기획실-100', title: '2026년 청소년 성장 자문회의 운영계획', date: '2026-11-18 14:55:28',
  body: '  나. 운영일정: 2026. 11. 22.(일) 14:00\r\n  사. 소요예산: 금1,300,000원(금일백삼십만원)\r\n  아. 예산과목: 정책)기획실 단위)참여 세부)시민·거버넌스 운영편성목)경비 통계목)사무관리비 부기)시민·거버넌스 회의 참석수당(출)편성목)경비 통계목)행사운영비 부기)시민·거버넌스 운영비(출)\r\n'};

test('계획서 읽기: 금액·부기 세목·행사일', () => {
  const p = T.bpParsePlanDoc(DOC);
  assert.equal(p.amount, 1300000);
  assert.deepEqual(p.subjects, ['시민·거버넌스 회의 참석수당(출)', '시민·거버넌스 운영비(출)']);
  assert.equal(p.eventDate, '2026-11-22');
  assert.equal(p.date, '2026-11-18');
  assert.deepEqual(T.bpMapSubjects(p.subjects, ROWS.filter(r => r.level === '세')), ['가1001010', '가1001110']);
});

test('계획서 후보: 이미 결의된 금액을 빼고 남은 금액', () => {
  const ledger = [{date: '20261118', desc: '2026. 청소년 성장 자문회의 참석수당 지급', amount: 1200000, code: '가1001010'}, {date: '20260310', desc: '자문회의 다과', amount: 50000, code: '가1001110'}];
  const c = T.bpPlanCandidates({docs: [DOC, {title: '다른 결과보고', body: ''}], rows: ROWS, ledger, year: 2026, taken: []});
  assert.equal(c.length, 1);
  assert.equal(c[0].spent, 1200000);
  assert.equal(c[0].remain, 100000);
  assert.equal(c[0].taken, false);
  assert.equal(c[0].code, '가1001110'); // 결의가 아직 없는 운영비를 기본으로
  assert.equal(c[0].stale, false);
  // 행사가 30일 넘게 지나고 일부 결의된 계획서는 남은 금액을 집행 잔액으로 본다
  assert.equal(T.bpPlanCandidates({docs: [DOC], rows: ROWS, ledger, year: 2026, now: new Date('2027-01-10T03:00:00Z')})[0].stale, true);
  assert.deepEqual(T.bpPlanCandidates({docs: [DOC], rows: ROWS, ledger, year: 2026, taken: ['기획실-100']})[0].taken, true);
});

test('짝짓기: 금액 같은 결의, 여러 결의 묶음, 이미 가져간 결의 제외', () => {
  const plan = {id: 'p1', title: '12월 자문회의 회의비', created: '2026-11-21', meta: {b: {c: '가1001211', a: 100000, d: '2026-12-05'}}};
  const ledger = [
    {date: '20261204', desc: '자문회의 다과 구입', amount: 100000, code: '가1001211'},
    {date: '20261101', desc: '자문회의 다과', amount: 100000, code: '가1001211'}, // 계획 전
    {date: '20261204', desc: '자문회의 다과', amount: 100000, code: '가1001110'}, // 다른 세목
  ];
  const s = T.bpSuggest(plan, ledger);
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0].d, '2026-12-04');
  assert.equal(s.full, true);
  assert.equal(T.bpSuggest(plan, ledger, new Set([T.bpLedgerKey(ledger[0])])), null);
  // '아니에요'로 뺀 결의는 다시 제안하지 않는다
  assert.equal(T.bpSuggest({...plan, meta: {b: {...plan.meta.b, x: [T.bpLedgerKey(ledger[0])]}}}, ledger), null);
  const plan2 = {id: 'p2', title: '송년 워크숍 운영비', created: '2026-11-21', meta: {b: {c: '가1001110', a: 500000}}};
  const l2 = [{date: '20261202', desc: '송년 워크숍 대관료', amount: 300000, code: '가1001110'}, {date: '20261203', desc: '송년 워크숍 식비', amount: 180000, code: '가1001110'}, {date: '20261203', desc: '복사용지', amount: 30000, code: '가1001110'}];
  const s2 = T.bpSuggest(plan2, l2);
  assert.deepEqual(s2.rows.map(r => r.a), [300000, 180000]);
  assert.equal(s2.sum, 480000);
  assert.equal(s2.full, true);
  // 낱말도 금액도 안 맞으면 제안하지 않는다
  assert.equal(T.bpSuggest(plan2, [{date: '20261203', desc: '복사용지', amount: 30000, code: '가1001110'}]), null);
});

test('예상 집행률: 남은 계획, 짝 대기 금액 제외, 경고', () => {
  const plans = [
    {id: 'a', title: '12월 회의비', done: false, meta: {b: {c: '가1001211', a: 200000, d: '2026-12-05'}}},
    {id: 'b', title: '운영비 일부', done: false, meta: {b: {c: '가1001110', a: 1000000, d: '2026-11-10', m: [{k: 'x', a: 400000}]}}},
    {id: 'c', title: '참석수당', done: false, meta: {b: {c: '가1001010', a: 800000, d: '2027-01-05'}}},
    {id: 'd', title: '끝난 계획', done: true, meta: {b: {c: '가1001311', a: 600000, st: 'done'}}},
  ];
  // 할 일만 끝내고 결의 확인 전인 계획은 결의 대기로 예상에 남는다
  const f2 = T.bpForecast({rows: ROWS, plans: [{id: 'w', title: '끝냄만', done: true, meta: {b: {c: '가1001311', a: 300000, d: '2026-11-01'}}}], now: NOW});
  assert.equal(f2.planned, 300000);
  assert.equal(f2.items[0].state, 'wait');
  assert.equal(f2.warnings.length, 0);
  const f = T.bpForecast({rows: ROWS, plans, pending: {b: 100000}, target: 100, now: NOW});
  assert.equal(f.budget, 10000000);
  assert.equal(f.executed, 6500000);
  assert.equal(f.planned, 200000 + 500000 + 800000);
  assert.equal(f.forecast, 8000000);
  assert.equal(Math.round(f.forecastRate), 80);
  assert.equal(f.gap, 2000000);
  const kinds = f.warnings.map(w => w.kind).sort();
  assert.deepEqual(kinds, ['afterclose', 'over']); // 회의비 800,000+200,000 > 900,000 · 1/5는 마감 뒤 · 운영비는 짝 대기라 지연 경고 없음
  const meeting = f.subjects.find(s => s.code === '가1001211');
  assert.equal(meeting.forecast, 1000000);
  assert.equal(f.items.find(i => i.id === 'b').state, 'check');
  assert.equal(f.items.find(i => i.id === 'd').state, 'done');
});

test('월별 예상 곡선: 이번 달 결의에서 출발하고 지난 예정은 다음 달 점에', () => {
  const monthly = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 50, 0];
  const p = T.bpProjection({monthly, items: [{state: 'plan', eff: 200, date: '2026-12-05'}, {state: 'plan', eff: 30, date: '2026-10-01'}, {state: 'done', eff: 0}], budget: 1500, now: NOW});
  assert.equal(p.actual[10], 1050);
  assert.equal(p.actual[11], null);
  assert.equal(p.projected[10], 1050); // 예상선은 이번 달 결의 누계에서 출발
  assert.equal(p.projected[11], 1280); // 지난 예정(10월)과 12월 계획이 12월 점에 더해짐
  assert.equal(p.goal, 1500);
});

test('v1.20 중요도: 그룹웨어 값(1 즉시, 3 긴급, 2 중요, 0 일반)을 그대로 읽고 순위를 매긴다', () => {
  const a = T.tdFromGw({todoSeq: 'td1', todoName: '가', importDegree: '3', processRate: 40, todoStatus: '1', fileCount: '2', replyCount: 1, dDayYn: 'Y', loginUserTodoOwnerYn: 'Y', loginUserTodoCreateYn: 'N', createEmpName: '홍담당', proccessYn: 'Y'});
  assert.equal(a.imp, '3'); assert.equal(a.important, true); assert.equal(a.rate, 40); assert.equal(a.files, 2); assert.equal(a.replies, 1); assert.equal(a.dday, true);
  assert.equal(a.mine, false); assert.equal(a.canProgress, true); assert.equal(a.creatorName, '홍담당');
  assert.equal(T.tdImpLabel('1'), '즉시'); assert.equal(T.tdImpLabel('2'), '중요'); assert.equal(T.tdImpLabel('x'), '일반');
  assert.ok(T.tdImpRank('1') > T.tdImpRank('3') && T.tdImpRank('3') > T.tdImpRank('2') && T.tdImpRank('2') > T.tdImpRank('0'));
  assert.equal(T.tdFromGw({todoSeq: 'td2', todoStatus: '2', processRate: 30}).rate, 100);
  assert.equal(T.tdFromGw({todoSeq: 'td3', loginUserTodoOwnerYn: 'Y', proccessYn: 'N'}).canProgress, false);
});

test('v1.20 상태: 예정·진행·지연·완료를 그룹웨어와 같게 나눈다', () => {
  const L = [{id: 'a', due: '2026-11-20', rate: 0}, {id: 'b', due: '2026-11-25', rate: 30}, {id: 'c', due: '2026-11-25', rate: 0}, {id: 'd', done: true, rate: 100, doneDate: '2026-11-20'}, {id: 'e', due: '2026-11-19', rate: 50}];
  assert.deepEqual(L.map(t => T.tdState(t, NOW)), ['late', 'doing', 'todo', 'done', 'late']);
  assert.deepEqual(T.tdStateCounts(L, NOW), {todo: 1, doing: 1, late: 2, done: 1});
  assert.equal(T.tdDoneWithin(L[3], 'week', NOW), true);
  assert.equal(T.tdDoneWithin({done: true, doneDate: '2026-10-01'}, 'month', NOW), false);
  assert.equal(T.tdDoneWithin({done: true, doneDate: '2026-10-01'}, 'all', NOW), true);
});

test('v1.20 정렬: 등록순·수정순·종료일순·중요도순, 끝낸 일은 늘 뒤', () => {
  const L = [{id: 'td1', title: '가', created: '2026-11-01', modified: '2026-11-20', due: '2026-11-30', imp: '0'}, {id: 'td2', title: '나', created: '2026-11-10', modified: '2026-11-11', due: '2026-11-22', imp: '1'}, {id: 'td3', title: '다', created: '2026-11-15', modified: '2026-11-15', due: '', imp: '2', done: true}];
  assert.deepEqual(T.tdSortBy(L, 'created').map(t => t.id), ['td2', 'td1', 'td3']);
  assert.deepEqual(T.tdSortBy(L, 'modified').map(t => t.id), ['td1', 'td2', 'td3']);
  assert.deepEqual(T.tdSortBy(L, 'due').map(t => t.id), ['td2', 'td1', 'td3']);
  assert.deepEqual(T.tdSortBy(L, 'imp').map(t => t.id), ['td2', 'td1', 'td3']);
  assert.deepEqual(T.tdSortBy(L, 'smart').map(t => t.id), ['td2', 'td1', 'td3']);
});

test('v1.20 빠른 추가: 기간·중요도·날짜 말을 읽는다', () => {
  assert.deepEqual(T.tdParseQuick('결과보고서 초안 11/24~11/28 !긴급', NOW), {title: '결과보고서 초안', start: '2026-11-24', due: '2026-11-28', imp: '3'});
  assert.deepEqual(T.tdParseQuick('자문회의 준비 금요일까지', NOW), {title: '자문회의 준비', start: '', due: '2026-11-27', imp: '0'});
  assert.deepEqual(T.tdParseQuick('!회의록 정리 내일', NOW), {title: '회의록 정리', start: '', due: '2026-11-22', imp: '2'});
  assert.deepEqual(T.tdParseQuick('!즉시 전화 회신', NOW), {title: '전화 회신', start: '', due: '', imp: '1'});
  assert.deepEqual(T.tdParseQuick('예산 점검 12월 1일부터 12월 3일까지', NOW), {title: '예산 점검', start: '2026-12-01', due: '2026-12-03', imp: '0'});
  assert.equal(T.tdParseQuick('11/28', NOW).title, '11/28'); // 제목이 날짜뿐이면 그대로 둔다
  assert.deepEqual(T.tdParseQuick('보고 11/28~11/24', NOW), {title: '보고 11/28~11/24', start: '', due: '', imp: '0'}); // 거꾸로 쓴 기간은 짐작하지 않고 제목에 남긴다
});

test('v1.20 여러 개 추가: 글머리를 떼고 빈 줄을 건너뛰며 30줄까지', () => {
  const r = T.tdParseBulk('- 자료 준비 금요일\n\n• 결과보고 11/24~11/28 !긴급\n1. 견적 받기\n☐ 품의\n[ ] 다과', NOW);
  assert.deepEqual(r.rows.map(x => x.title), ['자료 준비', '결과보고', '견적 받기', '품의', '다과']);
  assert.equal(r.rows[1].imp, '3'); assert.equal(r.rows[0].due, '2026-11-27');
  const many = T.tdParseBulk(Array.from({length: 33}, (_, i) => `일 ${i + 1}`).join('\n'), NOW);
  assert.equal(many.rows.length, 30); assert.equal(many.more, 3);
});

test('v1.20 일정표: 기간 막대를 보이는 칸에 맞춰 자른다', () => {
  const L = [{id: 'a', title: 'A', start: '2026-11-20', due: '2026-11-25'}, {id: 'b', title: 'B', due: '2026-11-30'}, {id: 'c', title: 'C'}, {id: 'd', title: 'D', start: '2026-12-20', due: '2026-12-30'}];
  const bars = T.tdTimeline(L, '2026-11-23', 14);
  assert.deepEqual(bars.map(b => [b.t.id, b.col, b.span, b.cutL, b.cutR]), [['a', 0, 3, true, false], ['b', 7, 1, false, false]]);
  assert.deepEqual(T.tdTimeline(L, 'bad'), []);
});
