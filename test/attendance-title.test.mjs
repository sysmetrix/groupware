// 근태신청 제목: 내 지난 근태 문서 제목에서 규칙을 읽어 새 신청의 제목을 정한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {learnAttendanceTitles, predictAttendanceTitle, attendanceCategory} from '../src/live/briefing.mjs';

const ME = '000001', NAME = '담당자';
const app = (atNm, atItemNm, title, extra = {}) => ({empCd: ME, korNm: NAME, atNm, atItemNm, title, appTm: 480, ...extra});
const APPS = [
  app('대체휴가', '연차휴가', '(11-09)대체휴가(담당자)'), app('대체휴가', '연차휴가', '(10-26)대체휴가(담당자)'),
  app('오후반차(보상)', '연차휴가', '(10-30)오후반차(보상)(담당자)'),
  app('외출', '연차휴가', '(11-03)외출(담당자)'),
  app('관내출장', '출장', '(11-06)관내출장(담당자)'), app('관내출장', '출장', '(10-27)관내출장(담당자 외 3명)'), app('관외출장', '출장', '(10-08~10-09)관외출장(담당자)'),
  app('연장근무', '초과근무', '(10-21)시간외근무신청(담당자)'), app('휴일근무', '초과근무', '(10-25)시간외근무신청(담당자)'), app('연장근무(보상)', '초과근무', '(09-29)시간외근무신청(담당자)'),
  app('근무일대체', '근무일대체', '(11-05)휴일대체근무신청(담당자)'),
  app('근무일대체', '근무일대체', '(10-03)휴일대체근무신청(담당자) 취소신청', {appTm: -480}),
  {empCd: '999999', korNm: '다른사람', atNm: '연차', atItemNm: '연차휴가', title: '(01-02)연차(다른사람)', appTm: 480},
];

test('attendanceCategory separates trip, overtime, leave and work-day swap', () => {
  assert.equal(attendanceCategory({atNm: '관내출장', atItemNm: '출장'}), 'trip');
  assert.equal(attendanceCategory({atNm: '연장근무(보상)', atItemNm: '초과근무'}), 'overtime');
  assert.equal(attendanceCategory({atNm: '오전반차', atItemNm: '연차휴가'}), 'leave');
  assert.equal(attendanceCategory({atNm: '근무일대체', atItemNm: '근무일대체'}), 'swap');
});

test('learnAttendanceTitles reads only my own documents and ignores cancellations and swaps', () => {
  const m = learnAttendanceTitles(APPS, ME);
  assert.equal(m.name, NAME);
  assert.equal(m.n, 10);
  assert.deepEqual(m.kind['대체휴가'], {mid: '대체휴가', count: 2});
  assert.deepEqual(m.kind['휴일근무'], {mid: '시간외근무신청', count: 1});
  assert.equal(m.kind['근무일대체'], undefined);
  assert.equal(m.cat.overtime.mid, '시간외근무신청');
});

test('predictAttendanceTitle follows the learned format per kind', () => {
  const m = learnAttendanceTitles(APPS, ME);
  const p = (type, kind, from, to = '') => predictAttendanceTitle(m, {type, kind, from, to});
  assert.equal(p('leave', '대체휴가', '2026-11-12').title, '(11-12)대체휴가(담당자)');
  assert.equal(p('leave', '오후반차(보상)', '2026-11-13').title, '(11-13)오후반차(보상)(담당자)');
  assert.equal(p('trip', '관내출장', '2026-11-12').title, '(11-12)관내출장(담당자)');
  assert.equal(p('trip', '관외출장', '2026-11-12', '2026-11-13').title, '(11-12~11-13)관외출장(담당자)');
  assert.equal(p('overtime', '연장근무(보상)', '2026-11-12').title, '(11-12)시간외근무신청(담당자)');
  assert.equal(p('overtime', '휴일근무', '2026-11-14').title, '(11-14)시간외근무신청(담당자)');
  assert.match(p('leave', '대체휴가', '2026-11-12').basis, /2건/);
});

test('predictAttendanceTitle falls back to the category, then to a plain default', () => {
  const m = learnAttendanceTitles(APPS, ME);
  const a = predictAttendanceTitle(m, {type: 'leave', kind: '조퇴', from: '2026-11-12'});
  assert.equal(a.title, '(11-12)조퇴(담당자)'); assert.equal(a.confidence, 'category');
  const b = predictAttendanceTitle(m, {type: 'overtime', kind: '조기근무', from: '2026-11-12'});
  assert.equal(b.title, '(11-12)시간외근무신청(담당자)');
  const c = predictAttendanceTitle(null, {type: 'trip', kind: '관내출장', from: '2026-11-12'});
  assert.equal(c.title, '(11-12)관내출장'); assert.equal(c.confidence, 'default');
  assert.equal(predictAttendanceTitle(m, {type: 'leave', kind: '연차', from: ''}), null);
  assert.equal(predictAttendanceTitle(m, {type: 'leave', kind: '연차', from: '2026-11-12', to: '2026-11-10'}).title, '(11-12)연차(담당자)'); // 거꾸로 된 기간은 하루로
});
