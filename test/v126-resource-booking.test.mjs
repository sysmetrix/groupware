// v1.26 자원 예약: 관용차량 먼저, 그룹웨어 예약 창처럼 예약명·일시·내용과 [예약하기] 한 번, 내 예약 승인 여부(나의예약현황)
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as R from '../src/live/briefing.mjs';

const read = f => readFileSync(new URL('../src/live/' + f, import.meta.url), 'utf8');
const now = new Date('2026-11-26T07:07:00Z'); // 16:07 KST

test('관용차량(속성·이름에 차량)이 첫 번째, 나머지는 그룹웨어 순서', () => {
  const list = [{resSeq: '7', name: '1층 LED패널(1)', attr: '복사골문화센터 LED패널(1층)'}, {resSeq: '5', name: '관용차량(니로EV)', attr: '부천여성청소년재단|공용차량'}, {resSeq: '8', name: '1층 LED패널(2)'}];
  assert.deepEqual(R.resSortList(list).map(r => r.resSeq), ['5', '7', '8']);
});

test('기본 시간: 오늘은 지금 뒤 30분 단위, 다른 날은 09:00, 겹치면 다음 빈 칸', () => {
  assert.deepEqual(R.resDefaultTimes({date: '20261126', bookings: [], now}), {start: '16:30', end: '17:30'});
  assert.deepEqual(R.resDefaultTimes({date: '20261127', bookings: [], now}), {start: '09:00', end: '10:00'});
  assert.deepEqual(R.resDefaultTimes({date: '20261127', bookings: [{start: '202611270900', end: '202611271030'}], now}), {start: '10:30', end: '11:30'});
  assert.equal(R.resDefaultTimes({date: '20261127', bookings: [{start: '202611270000', end: '202611280000'}], now}), null);
});

test('겹침 확인과 상태 이름(그룹웨어 자원 화면과 같은 말)', () => {
  const b = [{start: '202611271000', end: '202611271200', title: '물품 구매'}];
  assert.equal(R.resConflict(b, '20261127', '11:30', '13:00').title, '물품 구매');
  assert.equal(R.resConflict(b, '20261127', '12:00', '13:00'), null, '끝나는 시각에 시작하면 겹치지 않는다');
  for (const [c, l] of [['RE', '승인 대기'], ['CO', '승인 완료'], ['RC', '예약 완료'], ['RJ', '반려'], ['CR', '승인 취소'], ['CA', '취소'], ['AC', '자동 취소'], ['10', '승인 대기'], ['20', '승인 완료']]) assert.equal(R.resStatusLabel(c).label, l, c);
  assert.equal(R.resStatusLabel('ZZ').label, '');
});

test('수집기: 저장 값은 그룹웨어 예약 창과 같고(회사 정보·언어·내용), 나의예약현황은 읽기 전용 목록으로만 조회', () => {
  const col = read('collector.browser.js');
  assert.match(col, /const body = \{companyInfo: \{compSeq: u\.compSeq, groupSeq: u\.groupSeq, deptSeq: u\.deptSeq, emailAddr: u\.emailAddr, emailDomain: u\.emailDomain\}, resSeq: String\(resSeq\), reqText: name, apprYn: detail\.apprYn, alldayYn: 'N', startDate: start, endDate: end, descText: String\(desc \|\| ''\)/);
  assert.match(col, /newSchList: \[\], langCode: u\.langCode \|\| 'kr'\};/);
  assert.match(col, /'\/schres\/rs121A10', '\/schres\/rs121A08',/);
  assert.match(col, /async function myReservations\(\{from, to\}\) \{[\s\S]{0,400}call\('\/schres\/rs121A08'/);
  assert.match(col, /r\.myResYn === 'Y' \|\| String\(r\.createSeq \|\| ''\) === String\(c\.empSeq\)/, '내 예약만');
  assert.match(col, /reserveResource, myReservations,/);
  // 쓰기는 여전히 예약 한 곳뿐이고 사용자가 직접 누른 경우만
  assert.match(col, /if \(!\(navigator\.userActivation && navigator\.userActivation\.isActive\)\) throw new GwError\('NO_GESTURE'/);
});

test('화면: 예약 칸이 시간표 위, [예약하기] 한 번, 고르는 동안 겹침을 바로 알림, 내 예약 승인 여부', () => {
  const v = read('wc/24-resource.js');
  const html = v.slice(v.indexOf('function vResource()'), v.indexOf('function resEnsure()'));
  assert.ok(html.indexOf('${form}') < html.indexOf('이 날의 예약 시간표'), '예약 칸이 시간표보다 위');
  assert.ok(html.indexOf('이 날의 예약 시간표') < html.indexOf('${mineHtml}'));
  assert.doesNotMatch(v, /data-act="resCheck"|예약 가능한지 확인|이 내용으로 예약 확정/);
  assert.match(v, /id="resBookBtn" data-act="resBook"/);
  assert.match(v, /appr \? '예약 신청 \(승인 요청\)' : '예약하기'/);
  assert.match(v, /id="resDesc"/);
  assert.match(v, /data-act="resDur" data-v="\$\{v\}"/);
  assert.match(v, /root\.addEventListener\('input', e => \{/);
  assert.match(v, /R\.resConflict\(s\.bookings, s\.date, f\.start, f\.end\)/);
  assert.match(v, /이 시간으로 예약/);
  assert.match(v, /<h2>내 예약 현황/);
  assert.match(v, /GW\.myReservations\(\{from: resShift\(today, -30\), to: resShift\(today, 90\)\}\)/);
  const ev = read('wc/16-events.js');
  assert.match(ev, /case 'resDur': resDur\(el\.dataset\.v\); break;/);
  assert.doesNotMatch(ev, /case 'resCheck'|case 'resCancelForm'/);
});
