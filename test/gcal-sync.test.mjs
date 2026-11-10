import test from 'node:test';
import assert from 'node:assert/strict';
import {gsyncTitle, gsyncKindOfTitle, gsyncParseDayText, gsyncNormalizeExisting, gsyncNeedDates, gsyncMatch, gsyncKind, gsyncHours, gsyncDates, gsyncAttendMemo, gsyncDeadlineMemo, gsyncCalendarId, gsyncUrl, gsyncPlan, GSYNC_LAYERS} from '../src/live/gcal-sync.mjs';

const NOW = new Date('2026-11-10T12:00:00+09:00');
const CALS = [{id: 'a@gmail.com', name: '1 Daily'}, {id: 'att@group.calendar.google.com', name: '5 BWYF 근태'}, {id: 'per@group.calendar.google.com', name: '4 BWYF 개인'}];
const app = o => ({empCd: '016025', korNm: '서원하', atNm: '관내출장', startDt: '20261110', endDt: '20261110', startTm: '0900', endTm: '1800', appDt: '20261105', appSq: '1', approState: '1', deleteReqYn: 'N', docdelYn: 'Y', title: '(11-10)관내출장(서원하)', noDoc: '전략경영실-8000', reason: '업무 협의', place: '부천시청', appTm: 480, ...o});

test('gsyncKind maps attendance names, ignores unknown', () => {
  assert.equal(gsyncKind('관내출장'), 'trip'); assert.equal(gsyncKind('사외교육'), 'trip');
  assert.equal(gsyncKind('연장근무(보상)'), 'ot'); assert.equal(gsyncKind('근무일대체'), 'ot');
  for (const n of ['연차', '오전반차', '대체휴가', '외출', '조퇴', '공가_건강검진', '생일특별휴가']) assert.equal(gsyncKind(n), 'leave', n);
  assert.equal(gsyncKind('기타'), ''); assert.equal(gsyncKind(''), '');
});

test('gsyncHours: appTm, time span, day fallback, half hours', () => {
  assert.equal(gsyncHours({appTm: 480}), '8'); assert.equal(gsyncHours({appTm: 210}), '3.5');
  assert.equal(gsyncHours({startTm: '1400', endTm: '1800'}), '4'); assert.equal(gsyncHours({startTm: '1800', endTm: '0100'}), '7');
  assert.equal(gsyncHours({appDy: 2}), '16'); assert.equal(gsyncHours({}), '8');
});

test('gsyncDates: timed, all-day, multi-day, midnight, invalid', () => {
  assert.deepEqual(gsyncDates('20261110', '20261110', '0900', '1800'), {allDay: false, dates: '20261110T090000/20261110T180000'});
  assert.deepEqual(gsyncDates('20261110', '20261110', '0000', '0000'), {allDay: true, dates: '20261110/20261111'});
  assert.deepEqual(gsyncDates('20261110', '20261112', '0900', '1800'), {allDay: true, dates: '20261110/20261113'});
  assert.equal(gsyncDates('20261110', '20261110', '2000', '2400').dates, '20261110T200000/20261111T000000');
  assert.equal(gsyncDates('20261110', '20261110', '2200', '0100').dates, '20261110T220000/20261111T010000');
  assert.equal(gsyncDates('20261231', '20261231', '', '').dates, '20261231/20270101');
  assert.equal(gsyncDates('20261302', '20261302'), null); assert.equal(gsyncDates('20261112', '20261110'), null); assert.equal(gsyncDates('', ''), null);
});

test('gsyncAttendMemo follows the skill format per kind', () => {
  assert.equal(gsyncAttendMemo(app({}), 'trip'), '(11-10)관내출장(서원하), 전략경영실-8000\n- 출장목적: 업무 협의\n- 행선지: 부천시청');
  assert.equal(gsyncAttendMemo(app({atNm: '연장근무', title: '(10-14)시간외근무신청(서원하)', noDoc: '전략경영실-7421', reason: '마감 작업', place: ''}), 'ot'), '(10-14)시간외근무신청(서원하), 전략경영실-7421\n- 근무내용: 마감 작업');
  assert.equal(gsyncAttendMemo(app({atNm: '대체휴가', title: '(10-26)대체휴가(서원하)', noDoc: '전략경영실-7661', reason: '보상 대체휴가 사용', place: ''}), 'leave'), '(10-26)대체휴가(서원하), 전략경영실-7661\n- 휴고사유: 보상 대체휴가 사용');
  assert.equal(gsyncAttendMemo(app({reason: '', place: '', title: '', noDoc: ''}), 'leave').startsWith('(11-10)관내출장(서원하)'), true); // 제목·문서번호가 없어도 깨지지 않는다
  assert.equal(gsyncAttendMemo(app({reason: '줄\n바꿈   공백'}), 'trip').includes('- 출장목적: 줄 바꿈 공백'), true);
});

test('gsyncCalendarId and gsyncUrl', () => {
  assert.equal(gsyncCalendarId(CALS, GSYNC_LAYERS.attend), 'att@group.calendar.google.com');
  assert.equal(gsyncCalendarId(CALS, '3 BWYF 부서'), ''); assert.equal(gsyncCalendarId(null, 'x'), '');
  const u = gsyncUrl({title: '관내출장(8)', dates: '20261110T090000/20261110T180000', details: '줄1\n- 줄2', location: '부천시청'}, 'att@group.calendar.google.com');
  assert.match(u, /^https:\/\/calendar\.google\.com\/calendar\/u\/0\/r\/eventedit\?text=/); assert.ok(u.includes('details=%EC%A4%841%0A-%20%EC%A4%842'));
  assert.ok(u.includes('src=att%40group.calendar.google.com')); assert.ok(u.includes('ctz=Asia%2FSeoul')); assert.ok(!gsyncUrl({title: 't', dates: 'd'}).includes('src='));
});

test('gsyncPlan: mine only, approved ready/pending hold, dedupe, synced, layers, titles, old ones dropped', () => {
  const apps = [
    app({}), app({}), // 중복
    app({atNm: '연장근무(보상)', startDt: '20261111', endDt: '20261111', startTm: '1800', endTm: '2100', appTm: 180, noDoc: 'A-1', place: '', title: '(11-11)시간외근무신청(서원하)', appSq: '2'}),
    app({atNm: '오전반차', startDt: '20261112', endDt: '20261112', startTm: '0900', endTm: '1300', appTm: 240, noDoc: 'A-2', appSq: '3', approState: '0', place: ''}),
    app({empCd: '999', noDoc: 'X-9', appSq: '4'}), // 남의 것
    app({deleteReqYn: 'Y', noDoc: 'D-1', appSq: '5'}), app({atNm: '모름', noDoc: 'U-1', appSq: '6'}),
    app({startDt: '20260101', endDt: '20260101', noDoc: 'OLD-1', appSq: '7'}), // 너무 오래됨
    app({atNm: '대체휴가', startDt: '20261120', endDt: '20261121', startTm: '0000', endTm: '0000', appTm: 960, noDoc: 'A-3', appSq: '8', place: ''}),
  ];
  const first = gsyncPlan({apps, me: '016025', cals: CALS, now: NOW});
  assert.equal(first.items.length, 4);
  assert.deepEqual(first.items.map(i => i.title), ['관내출장(8)', '시간외(보상3)', '오전반차(4)', '대체휴가']);
  assert.deepEqual(first.counts, {ready: 0, hold: 1, synced: 0, similar: 0, unverified: 3}); // 구글과 대조하기 전에는 "등록 전"이라고 단정하지 않는다
  assert.equal(first.items[2].state, 'hold'); assert.equal(first.items[2].pending, true);
  assert.equal(first.items[0].calId, 'att@group.calendar.google.com'); assert.equal(first.items[0].layer, '5 BWYF 근태'); assert.equal(first.items[0].location, '부천시청');
  assert.equal(first.items[3].allDay, true); assert.equal(first.items[3].dates, '20261120/20261122');
  const again = gsyncPlan({apps, me: '016025', cals: CALS, now: NOW, synced: {[first.items[0].key]: 1}});
  assert.equal(again.items[0].state, 'synced'); assert.equal(again.items[0].verified, 'user'); assert.deepEqual(again.counts, {ready: 0, hold: 1, synced: 1, similar: 0, unverified: 2});
  assert.deepEqual(gsyncPlan({apps, me: '', now: NOW}).items, []); assert.deepEqual(gsyncPlan({}).items, []);
});

test('gsyncPlan: deadlines go to the personal layer with provenance, invalid ones are skipped', () => {
  const p = gsyncPlan({apps: [], me: '1', cals: CALS, now: NOW, deadlines: [
    {date: '2026-11-20', time: '16:00', title: '2027년 예산(안) 세부사업별 설명서 제출', source: '전자결재', key: 'doc:1'},
    {date: '2026-11-25', title: '결과 제출', source: '메일', key: 'mail:2'},
    {date: '2026-11-31', title: '불가능한 날짜'}, {date: '2026-11-22'}, null]});
  assert.equal(p.items.length, 2);
  const a = p.items[0]; assert.equal(a.layer, '4 BWYF 개인'); assert.equal(a.title.startsWith('[마감] 2027년 예산'), true); assert.equal(a.calId, 'per@group.calendar.google.com');
  assert.equal(a.dates, '20261120T160000/20261120T163000'); assert.match(a.details, /\[출처 메타데이터\]/); assert.match(a.details, /출처 시스템: 그룹웨어 전자결재/); assert.match(a.details, /2026\.11\.20\(금\) 16:00/);
  assert.equal(p.items[1].allDay, true);
  assert.match(gsyncDeadlineMemo({date: '2026-11-25', title: 't', source: ''}, NOW), /출처 시스템: 그룹웨어 문서/);
});

const DAYTXT = {
  trip: '09:00~18:00, 관내출장(8), 캘린더: 5 BWYF 근태, 위치 없음, 2026년 7월 4일 관내출장(8) 09:00~18:00',
  ot: '18:00~21:00, 시간외(3, 보상), 캘린더: 5 BWYF 근태, 위치 없음, 2026년 6월 24일 시간외(3, 보상) 18:00~21:00',
  allday: '성과계획서 제출 종일, 성과계획서 제출, 캘린더: 4 BWYF 개인, 위치 없음, 2026년 6월 24일',
  daily: '09:00~10:00, 대체휴일, 1 Daily, 위치 없음, 2026년 11월 9일 대체휴일 09:00~10:00',
  place: '09:30~14:00, 청소년 네트워크, 캘린더: 3 BWYF 부서, 위치: 부천시청, 2026년 7월 9일 청소년 네트워크 09:30~14:00',
  multi: '2026년 7월 4일 14:00~2026년 7월 5일 13:00, 청소년 참여기구 연합캠프, 캘린더: 3 BWYF 부서, 위치: 인천청소년수련관, 청소년 참여기구 연합캠프 14:00~13:00 인천',
};
test('gsyncParseDayText parses real Google day-view sentences, skips tasks and birthdays', () => {
  assert.deepEqual(gsyncParseDayText(DAYTXT.trip, '20260704'), {date: '20260704', cal: '5 BWYF 근태', title: '관내출장(8)', from: '09:00', to: '18:00'});
  assert.equal(gsyncParseDayText(DAYTXT.ot, '20260624').title, '시간외(3, 보상)'); // 제목 안의 쉼표
  const a = gsyncParseDayText(DAYTXT.allday, '20260624'); assert.equal(a.title, '성과계획서 제출'); assert.equal(a.cal, '4 BWYF 개인'); assert.equal(a.from, '');
  const d = gsyncParseDayText(DAYTXT.daily, '20261109'); assert.equal(d.cal, '1 Daily'); assert.equal(d.title, '대체휴일');
  assert.equal(gsyncParseDayText(DAYTXT.place, '20260709').cal, '3 BWYF 부서');
  assert.equal(gsyncParseDayText(DAYTXT.multi, '20260704').title, '청소년 참여기구 연합캠프');
  assert.equal(gsyncParseDayText('할 일: 연간계획 송부, 완료됨, 2026년 6월 24일, 14:00~15:00', '20260624'), null);
  assert.equal(gsyncParseDayText('cake 부천여성청소년재단님의 생일 생일:', '20261105'), null); assert.equal(gsyncParseDayText('', 'x'), null);
  assert.equal(gsyncKindOfTitle('시간외보상(3)'), 'ot'); assert.equal(gsyncKindOfTitle('대체휴일(2월7일 건)'), 'leave'); assert.equal(gsyncKindOfTitle('제12회 포럼'), '');
});

test('gsyncMatch and plan with existing Google events: exact / similar / none / unknown', () => {
  const existing = gsyncNormalizeExisting({at: 1, days: {
    '20261110': [DAYTXT.trip.replace('2026년 7월 4일', '2026년 11월 10일').replace('09:00~18:00, 관내출장(8)', '09:00~18:00, 관내출장(8)')],
    '20261109': [DAYTXT.daily],
    '20261111': ['09:00~10:00, 회의, 캘린더: 3 BWYF 부서, 위치 없음, 2026년 11월 11일'],
  }});
  assert.equal(existing.records.length, 3); assert.deepEqual(existing.dates, ['20261109', '20261110', '20261111']);
  const apps = [
    app({}), // 11/10 관내출장 09:00~18:00 -> 근태 레이어에 있음
    app({atNm: '대체휴가', startDt: '20261109', endDt: '20261109', startTm: '0900', endTm: '1000', appTm: 60, noDoc: 'L-1', appSq: '2', place: ''}), // 다른 캘린더·다른 이름
    app({startDt: '20261111', endDt: '20261111', noDoc: 'N-1', appSq: '3'}), // 그 날에 근태 일정 없음
    app({startDt: '20261112', endDt: '20261112', noDoc: 'U-1', appSq: '4'}), // 읽지 않은 날
    app({startDt: '20261113', endDt: '20261113', noDoc: 'H-1', appSq: '5', approState: '0'}),
  ];
  const p = gsyncPlan({apps, me: '016025', cals: CALS, now: NOW, existing});
  assert.deepEqual(p.items.map(i => [i.docNo, i.state]), [['L-1', 'similar'], ['전략경영실-8000', 'synced'], ['N-1', 'ready'], ['U-1', 'unverified'], ['H-1', 'hold']]);
  assert.equal(p.items[0].match.cal, '1 Daily'); assert.equal(p.items[1].verified, 'google'); assert.equal(p.compared, true);
  assert.deepEqual(p.counts, {ready: 1, hold: 1, synced: 1, similar: 1, unverified: 1});
  assert.deepEqual(gsyncNeedDates(p.items), ['20261109', '20261110', '20261111', '20261112']); // 보류 건의 날은 제외
  assert.equal(gsyncMatch({startYmd: '20261110', endYmd: '20261110', layer: '5 BWYF 근태', kind: 'trip', time: '', source: 'attend'}, null).level, 'unknown');
  // 같은 시간 정확히 일치하는 근태 레이어 일정은 종류가 달라도 비슷한 일정으로 본다(근무일대체를 관내출장으로 올린 경우)
  const ex2 = gsyncNormalizeExisting({days: {'20260704': [DAYTXT.trip]}});
  assert.equal(gsyncMatch({startYmd: '20260704', endYmd: '20260704', layer: '5 BWYF 근태', kind: 'ot', time: '09:00~18:00', source: 'attend'}, ex2).level, 'similar');
  assert.equal(gsyncMatch({startYmd: '20260704', endYmd: '20260704', layer: '5 BWYF 근태', kind: 'ot', time: '10:00~12:00', source: 'attend'}, ex2).level, 'none');
});

test('gsyncMatch for deadlines: personal layer title match', () => {
  const ex = gsyncNormalizeExisting({days: {'20260624': [DAYTXT.allday]}});
  const p = gsyncPlan({apps: [], me: '1', cals: CALS, now: new Date('2026-06-20T09:00:00+09:00'), existing: ex, deadlines: [{date: '2026-06-24', title: '성과계획서 제출', source: '전자결재', key: 'd1'}]});
  assert.equal(p.items[0].state, 'synced');
});

test('gsyncTitle follows the user calendar conventions', () => {
  assert.equal(gsyncTitle({atNm: '연장근무', appTm: 180}, 'ot'), '시간외(3)'); assert.equal(gsyncTitle({atNm: '연장근무(보상)', appTm: 180}, 'ot'), '시간외(보상3)');
  assert.equal(gsyncTitle({atNm: '휴일근무', appTm: 480}, 'ot'), '휴일근무(8)'); assert.equal(gsyncTitle({atNm: '근무일대체', appTm: 480}, 'ot'), '휴일근무(8)');
  assert.equal(gsyncTitle({atNm: '외출', appTm: 90}, 'leave'), '외출(1.5)'); assert.equal(gsyncTitle({atNm: '조퇴', appTm: 120}, 'leave'), '조퇴(2)');
  assert.equal(gsyncTitle({atNm: '오후반차(보상)', appTm: 240}, 'leave'), '오후반차(4)'); assert.equal(gsyncTitle({atNm: '대체휴가', appTm: 480}, 'leave'), '대체휴가');
  assert.equal(gsyncTitle({atNm: '관외출장', appTm: 540}, 'trip'), '관외출장(9)');
});

test('invalid 24-hour times do not create calendar dates', () => {
  assert.equal(gsyncDates('20261110', '20261110', '2401', '2402'), null);
  assert.equal(gsyncDates('20261110', '20261110', '2400', '0100'), null);
  assert.equal(gsyncDates('20261110', '20261110', '2300', '2400').dates, '20261110T230000/20261111T000000');
});
test('indistinguishable attendance records require review instead of false synced status', () => {
  const existing = {dates: ['20261110'], records: [{date:'20261110', cal:'5 BWYF 근태', title:'관내출장(8)', from:'09:00', to:'18:00'}]};
  const result = gsyncPlan({apps:[app({noDoc:'doc1'}),app({noDoc:'doc2'})],me:'016025',existing,now:NOW});
  assert.deepEqual(result.items.map(x => x.state), ['similar','similar']);
  const confirmed = gsyncPlan({apps:[app({noDoc:'doc1'}),app({noDoc:'doc2'})],me:'016025',existing,now:NOW,synced:{'gs:doc1:20261110:관내출장':1}});
  assert.equal(confirmed.items.find(x => x.docNo === 'doc1').state, 'synced');
});
