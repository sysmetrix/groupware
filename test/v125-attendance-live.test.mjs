// v1.25 근태: 평일 시간외는 퇴근 지문, 근무일이 아닌 날의 휴일근무·시간외는 출근·퇴근 지문을 본다. 출근 기록이 없는 보통 날은 보지 않는다.
// 근무시간 표시(출근 후 지난 시간, 다음 일정·퇴근까지)는 홈을 다시 그리지 않고 30초마다 다시 센다. 홈 대화 칸은 눌려 사라지지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attendanceAnomalies, attNonWorkday} from '../src/live/briefing.mjs';

const read = f => readFileSync(new URL('../src/live/' + f, import.meta.url), 'utf8');
const now = new Date('2026-11-26T06:00:00Z');
const app = o => ({empCd: '7', approState: '1', atNm: '연장근무', startDt: '20261120', endDt: '20261120', startTm: '1800', endTm: '2100', ...o});

test('근무일이 아닌 날 판정: 주말·그룹웨어 휴일·휴일근무 신청', () => {
  assert.equal(attNonWorkday('20261121'), true); // 토
  assert.equal(attNonWorkday('20261122'), true); // 일
  assert.equal(attNonWorkday('20261120'), false); // 금
  assert.equal(attNonWorkday('20261120', {rows: [{holiday: true}]}), true);
  assert.equal(attNonWorkday('20261120', {item: '휴일근무'}), true);
});

test('평일 시간외: 퇴근 지문만 본다(출근 지문이 없어도 퇴근이 있으면 정상)', () => {
  const ok = attendanceAnomalies([{date: '20261120', come: '', leave: '2105'}], {now, apps: [app()], me: '7'});
  assert.equal(ok.length, 0);
  const miss = attendanceAnomalies([{date: '20261120', come: '0850', leave: ''}], {now, apps: [app()], me: '7'});
  assert.deepEqual(miss.map(x => [x.result, x.nonWork]), [['퇴근 지문 누락', false]]);
});

test('근무일이 아닌 날의 휴일근무·시간외: 출근과 퇴근 지문을 모두 본다', () => {
  const sat = app({atNm: '휴일근무', startDt: '20261121', endDt: '20261121', startTm: '1000', endTm: '1500'});
  assert.equal(attendanceAnomalies([{date: '20261121', come: '0955', leave: '1510'}], {now, apps: [sat], me: '7'}).length, 0);
  const noCome = attendanceAnomalies([{date: '20261121', come: '', leave: '1510'}], {now, apps: [sat], me: '7'});
  assert.deepEqual(noCome.map(x => [x.result, x.missing.join(',')]), [['출근 지문 누락', '출근']]);
  const none = attendanceAnomalies([{date: '20261121', come: '', leave: ''}], {now, apps: [sat], me: '7'});
  assert.equal(none[0].result, '출근·퇴근 지문 누락');
  assert.match(none[0].advice, /근무일이 아닌 날/);
  // 평일이어도 그룹웨어가 휴일로 표시한 날(공휴일)은 근무일이 아니다
  const holiday = attendanceAnomalies([{date: '20261120', come: '', leave: '2105', holiday: true}], {now, apps: [app()], me: '7'});
  assert.equal(holiday[0].result, '출근 지문 누락');
  // 지문을 조회하지 못한 날은 판정하지 않는다
  assert.equal(attendanceAnomalies([{date: '20261121', fingerprintChecked: false}], {now, apps: [sat], me: '7'}).length, 0);
});

test('근태 화면: 출퇴근 기록 없는 보통 날은 표시하지 않고, 확인 기준을 화면에 밝힌다', () => {
  const att = read('wc/11-attendance.js');
  assert.doesNotMatch(att, /'출퇴근 기록 없음'/);
  assert.match(att, /평일 시간외근무는 퇴근 지문을, 근무일이 아닌 날의 휴일근무·시간외근무는 출근과 퇴근 지문을 확인합니다/);
  assert.match(att, /\(bad\.get\(d8\)\.missing \|\| \['퇴근'\]\)\.join\('·'\) \+ ' 지문 확인 필요'/);
  assert.match(att, /data-live="att-today"/);
  assert.match(read('briefing.mjs'), /noCome = nonWork && hmMin\(r\.come\) === null/, '직원 근태 달력의 내 시간외도 같은 기준');
});

test('실시간 표시: 30초 주기로 하루 띠·근태 줄·오늘 근태를 다시 센다', () => {
  const hv = read('wc/29-home-view.js');
  assert.match(hv, /function homeLiveTick\(\)/);
  assert.match(hv, /<div id="hmRailBox">\$\{homeRailHtml\(d, dayInfo\)\}<\/div>/);
  assert.match(hv, /data-live="att"/);
  assert.match(hv, /!\(a && box\.contains\(a\)\)/, '키보드 포커스가 띠 안에 있으면 그 주기는 건너뛴다');
  assert.match(read('wc/39-motion.js'), /if \(typeof homeLiveTick === 'function'\) homeLiveTick\(\);/);
});

test('홈 대화 칸: 늘어나는 상자 안에서 눌려 사라지지 않게 높이를 준다', () => {
  const css = read('wc.css');
  assert.match(css, /\.wc \.hm3 #chLog\{flex:none;height:auto;min-height:0;max-height:none\}/);
  assert.match(css, /\.wc \.hm3 #chLog:has\(\.ch-msg:not\(\.ch-brief\)\)\{height:clamp\(280px,calc\(100vh - 420px\),560px\);overflow-y:auto\}/);
  assert.match(read('wc/30-chat-ui.js'), /sec\.contains\(root\.activeElement\)[^\n]*scrollIntoView\(\{block: 'nearest'\}\)/);
});
