import test from 'node:test';
import assert from 'node:assert/strict';
import {gsyncKind, gsyncHours, gsyncDates, gsyncAttendMemo, gsyncDeadlineMemo, gsyncCalendarId, gsyncUrl, gsyncPlan, GSYNC_LAYERS} from '../src/live/gcal-sync.mjs';

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
  assert.deepEqual(first.items.map(i => i.title), ['관내출장(8)', '시간외(3)', '오전반차(4)', '대체휴가(16)']);
  assert.deepEqual(first.counts, {ready: 3, hold: 1, synced: 0});
  assert.equal(first.items[2].state, 'hold'); assert.equal(first.items[2].pending, true);
  assert.equal(first.items[0].calId, 'att@group.calendar.google.com'); assert.equal(first.items[0].layer, '5 BWYF 근태'); assert.equal(first.items[0].location, '부천시청');
  assert.equal(first.items[3].allDay, true); assert.equal(first.items[3].dates, '20261120/20261122');
  const again = gsyncPlan({apps, me: '016025', cals: CALS, now: NOW, synced: {[first.items[0].key]: 1}});
  assert.equal(again.items[0].state, 'synced'); assert.deepEqual(again.counts, {ready: 2, hold: 1, synced: 1});
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
