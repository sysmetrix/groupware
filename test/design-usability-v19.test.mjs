import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weeklyDraftPeriod, isNoiseMail} from '../src/live/briefing.mjs';

const read = p => readFileSync(new URL('../src/live/' + p, import.meta.url), 'utf8');
const NOW = new Date('2026-11-21T02:00:00Z'); // 11/21(토) 11:00 KST

test('주간 초안 기간: 끝난 지 7일이 넘으면 지난 초안으로 본다', () => {
  const old = weeklyDraftPeriod('[자료 범위: 상신 3건]\n\n□ 주간 업무 실적 (11.1. ~ 11.8.) — 전략경영실 홍길동\n', NOW);
  assert.deepEqual(old, {label: '11/1~11/8', ageDays: 13, stale: true});
  const fresh = weeklyDraftPeriod('□ 주간 업무 실적 (11.16. ~ 11.20.)', NOW);
  assert.equal(fresh.stale, false); assert.equal(fresh.ageDays, 1);
  assert.equal(weeklyDraftPeriod('직접 쓴 메모', NOW), null);
  assert.equal(weeklyDraftPeriod('', NOW), null);
});

test('주간 초안 기간: 오늘보다 뒤의 날짜는 지난해로 본다(1월에 본 12월 초안)', () => {
  const p = weeklyDraftPeriod('□ 주간 업무 실적 (12.22. ~ 12.26.)', new Date('2027-01-05T01:00:00Z'));
  assert.equal(p.ageDays, 10); assert.equal(p.stale, true);
});

test('머리글 종은 통합알림을 열고, 숫자도 통합알림의 안 읽음 수다', () => {
  assert.match(read('wc/16-events.js'), /case 'menuBell': closeOverlay\(\); if \(go\('notifications'\)\)/);
  const head = read('wc/05-views.js');
  assert.match(head, /ntfUnread\(\)/);
  assert.doesNotMatch(head, /S\.activity\.filter\(x => x\.at > S\.seenActivity\)/);
  const ntf = read('wc/38-notifications-people.js');
  assert.match(ntf, /function ntfUnread\(\) \{ try \{ return NTF\.items \? NTF\.items\.filter\(x => !x\.read\)\.length/);
  assert.match(ntf, /Date\.now\(\) - ntfBgAt < 180000/);
});
test('왼쪽 메뉴: 읽히는 이름이 보이는 메뉴 이름으로 시작하고 숫자 배지는 따로 읽히지 않는다', () => {
  const src = read('wc/05-views.js');
  assert.match(src, /aria-label="\$\{esc\(v\.label\)\}/);
  assert.match(src, /<span class="n [^`]*aria-hidden="true">/);
  assert.doesNotMatch(src, /tip: '퇴근 지문 확인'\}/);
});

test('광고성 메일은 업무 메일보다 아래 접힌 묶음으로 간다', () => {
  assert.equal(isNoiseMail({subject: '(광고) 겨울 특가 안내', fromEmail: 'shop@example.com'}), true);
  const src = read('wc/08-approval-mail.js');
  assert.match(src, /<details class="mail-ads"/);
  assert.match(src, /work\.map\(rowHtml\)[\s\S]*ads\.map\(rowHtml\)/);
});

test('설정 화면에는 진한 주 버튼을 두지 않고, 머리글 AI 지시도 테두리 버튼이다', () => {
  const settings = read('wc/12-report-settings.js').split('function vSettings')[1].split('function budgetSettingRows')[0];
  assert.doesNotMatch(settings, /btn sm primary/);
  assert.match(read('wc/02-shell.js'), /<button class="hb" data-act="openCmd"/);
});

test('일정 목록은 앞으로 7일의 직원 휴가·출장도 날짜순으로 함께 보인다', () => {
  const src = read('wc/10-calendar-budget.js');
  assert.match(src, /teamSoon/);
  assert.match(src, /\[\.\.\.teamRows, \.\.\.upcoming\.map/);
  assert.doesNotMatch(src, /다가오는 일정이 없습니다/);
});

test('자동화 켜기 스위치는 24px 이상, 좁은 화면 머리글은 한 줄', () => {
  const css = read('wc.css');
  assert.match(css, /\.wc \.hm-sw\{width:40px;height:24px\}/);
  assert.match(css, /@media \(max-width:640px\)\{\.wc header\{flex-wrap:nowrap/);
});

test('v1.9.1 검수: 근태 칸은 그룹웨어 판정 대신 지문 기록 유무, 시간외 예정은 말줄임표로 보이지 않는다', () => {
  const att = read('wc/11-attendance.js');
  assert.match(att, /'출퇴근 기록 없음'/);
  assert.doesNotMatch(att, /: '그룹웨어 기록';/);
  const cal = read('wc/10-calendar-budget.js');
  assert.match(cal, /wait: \['예정', '아직 진행 전'\]/);
  assert.match(read('wc/08-approval-mail.js'), /<div class="nowrap">\$\{esc\(r\.name\)\} <span class="muted"[^>]*>· \$\{r\.of\}건 중 \$\{r\.count\}건<\/span>/);
});
test('v1.10.0: 글자 크기 설정은 화면 전체 배율로, 분할창 끌기는 배율을 나눠 계산', () => {
  const css = read('wc.css');
  assert.match(css, /\.wc\[data-fs="xl"\]\{zoom:1\.28\}/);
  assert.match(css, /\.wc\[data-fs\]\{--fs:14px\}/);
  assert.match(read('wc/16-events.js'), /getComputedStyle\(wcEl\)\.zoom\) \|\| 1;[^\n]*\/ z\)\)/);
});

test('v1.10.0: 메뉴로 화면을 바꾸면 포커스를 같은 메뉴에 돌려주고 화면 이름을 읽어 준다', () => {
  const v = read('wc/05-views.js');
  assert.match(v, /fromNav = !!\(root\.activeElement/);
  assert.match(v, /\$\('#srAnnounce'\)/);
  assert.match(read('wc/02-shell.js'), /<div class="vh" id="srAnnounce" role="status" aria-live="polite"><\/div>/);
});

test('v1.10.0: 홈 오른쪽 묶음 제목은 h3, 예산 빼기 버튼은 무엇을 빼는지 읽히고 24px', () => {
  const home = read('wc/29-home-view.js');
  assert.match(home, /<h3 class="hm-card-k hm-today-k">챙겨 둘 것<\/h3>/);
  assert.match(read('wc/37-automation.js'), /<h3 class="hm-card-k">자동화<\/h3>/);
  assert.match(read('wc/10-calendar-budget.js'), /style="height:24px;width:24px;margin-left:2px" data-act="bUnpin"[^>]*관심 사업에서 빼기'\)\}"/);
});

test('v1.10.0: 통합알림 원문을 열면 종 숫자에서 바로 빠진다', () => {
  const n = read('wc/38-notifications-people.js');
  assert.match(n, /if \(wasUnread\) \{ x\.read = true; if \(typeof renderHead === 'function'\) renderHead\(\);/);
  assert.match(n, /visibilitychange/);
});

test('v1.10.0: 좁은 화면 리플로 규칙(카드 격자·근태 달력·표)', () => {
  const css = read('wc.css');
  assert.match(css, /\.wc main \.cards\{grid-template-columns:repeat\(auto-fit,minmax\(min\(320px,100%\),1fr\)\)\}/);
  assert.match(css, /\.wc \.att\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\)\}/);
  assert.match(css, /\.wc main table:not\(\.apt\)\{display:block;max-width:100%;overflow-x:auto\}/);
});
test('v1.10.1: 큰 글자에서 머리글 시각·버튼은 줄어들지 않고 검색칸이 줄어든다', () => {
  assert.match(read('wc.css'), /\.wc header \.stat,\.wc header \.hb\{flex-shrink:0;white-space:nowrap\}\.wc header \.srch\{min-width:0;flex-shrink:1\}/);
});
test('v1.11.0: 노트북 화면 결재 연속 처리 — 원문을 넓게 열고 첨부 목록을 접어 본문을 키운다', () => {
  assert.match(read('wc/14-hide-snooze-undo-to-do.js'), /innerWidth < 1600\)\)\);/);
  const pane = read('wc/13-detail-pane.js');
  assert.match(pane, /roomyDocFrame\(f, u\)/);
  assert.match(pane, /function roomyDocFrame\(f, u\) \{\n    if \(!\/MicroModuleCode=ea\/\.test\(u\)\) return;/);
  assert.match(pane, /getBoundingClientRect\(\)\.height >= 760\) return;/);
  assert.match(read('wc.css'), /\.wc \.toast\{left:calc\(var\(--navW,172px\) \+ 20px\);transform:none/);
});

test('v1.11.0: 주말에 휴가·출장 준비를 열면 다음 평일, 주말 날짜는 경고, 조사는 받침에 맞게', () => {
  const att = read('wc/27-attendance-request.js');
  assert.match(att, /wkNext = type !== 'overtime'/);
  assert.match(att, /pickedDay \|\| wkNext \|\| today/);
  assert.match(att, /josa\(st\.kind, '은', '는'\)/);
  assert.match(att, /id="att_note" role="status"/);
});

test('v1.11.0: 결재함 답은 물은 기간(이번 주 등)과 급한 것부터', () => {
  const t = read('wc/36-chat-tools-more.js');
  assert.match(t, /name: 'list_approvals'[\s\S]*?run: async \(a, ctx\) =>/);
  assert.match(t, /R\.cuPeriod\(ut, td\)/);
  assert.match(t, /제목에 긴급 표시나 3일 안 기한/);
});
test('v1.11.1: 연속 처리 안내는 위쪽 알림이 아니라 진행 막대에(처리 창 버튼을 가리지 않게)', () => {
  const s = read('wc/14-hide-snooze-undo-to-do.js');
  assert.doesNotMatch(s, /toast\('연속 처리: 그룹웨어 원래 화면에서/);
  assert.match(s, /원래 화면에서 처리한 뒤 초록 버튼을 누르면 처리됐는지 확인합니다/);
});
test('v1.12.0 실제 실행 점검: 결과보고 검토 본문 칸, 자동 기입 뒤 입력 중 표시, 제목 다시 읽기', () => {
  assert.match(read('wc.css'), /\.wc \.dlg\.rpt-review textarea#rptBody\{min-height:240px;height:auto\}/);
  const de = read('wc/19-draft-engine.js');
  assert.match(de, /function showDraftReport\(title, steps, notes = \[\]\) \{\n    if \(typeof markPaneDirty === 'function'\)/);
  assert.match(de, /await ctrl\.GetFieldText\('doc_name'\)/);
  assert.match(de, /kindOf\(b\.title\) === kindOf\(plan\.title\)/);
});

test('v1.12.0 실제 실행 점검: 출장·휴가 준비는 같은 기간의 내 신청을 알리고, 채운 뒤 [신청완료]가 보이게(누르지 않음)', () => {
  const at = read('wc/27-attendance-request.js');
  assert.match(at, /function attOverlapNote\(st\)/);
  assert.match(at, /const note = attOverlapNote\(st\) \+ wkWarn/);
  assert.match(at, /done\.scrollIntoView\(\{block: 'center'/);
  assert.doesNotMatch(at, /done\.click\(\)/);
  assert.match(at, /finally \{ AUTO\.running = false; [^\n]*markPaneDirty/);
});

test('v1.12.0: 날짜를 물은 내 근태 신청 질문은 그날 것부터 답한다', () => {
  const t = read('wc/36-chat-tools-more.js');
  assert.match(t, /name: 'list_my_requests'[\s\S]*?run: async \(a, ctx\) =>/);
  assert.match(t, /에 올린 내 근태 신청은 없습니다\./);
});
test('v1.12.2: 결과보고는 계획서의 기록물철을 이어받고, 제목 칸은 떠날 때까지 입력해 그룹웨어가 읽게 한다', () => {
  const de = read('wc/19-draft-engine.js');
  assert.match(de, /if \(plan\.binder && !\/\^접수문서\/\.test\(plan\.binder\)\) \{ meta\.binder = plan\.binder;/);
  assert.match(de, /const ks = keys\.filter\(k => classification\.includes\(k\)\);\n      if \(!ks\.length\) return \{ok: true/);
  assert.match(de, /setNative\(w, inp, spec\.title\);\n      try \{ inp\.blur\(\);/);
  assert.match(read('wc/42-result-review.js'), /기록물철은 계획서와 같게 이어받음/);
});
test('v1.13.0 계획 이행: 숫자→같은 목록, 버튼 이름, 빈 상태 조회 시각, 포커스 복원, 답의 자료 기준 시각', () => {
  const hv = read('wc/29-home-view.js');
  assert.match(hv, /v === 'approval'\) \{ if \(go\('approval'\)\) \{ S\.apTab = 'pending'; S\.apTabPinned = true; renderMain\(\); \} \}/);
  assert.match(hv, /picked\?\.type === 'mail' \? '메일 읽기'/);
  assert.match(hv, /현재 확인된 내 일 없음/);
  assert.match(hv, /hhmm\(S\.lastRefresh\)\) \+ ' 조회 기준 · '/);
  // 같은 것을 가리키는 숫자는 같은 원천(메뉴와 홈의 안 읽은 메일)
  assert.match(hv, /out\.unread = mailSnapshot\(\)\.unread;/);
  assert.match(read('wc/05-views.js'), /const n = mailSnapshot\(\)\.unread;/);
  assert.match(read('wc/15-overlays-palette-help-menus.js'), /new MutationObserver\(\(\) => \{ if \(ovEl\.childElementCount\) return;/);
  assert.match(read('wc/31-chat-engine.js'), /role === 'ai' && S\.lastRefresh \? \{dataAt: S\.lastRefresh\.getTime\(\)\}/);
  assert.match(read('wc/30-chat-ui.js'), /그룹웨어 자료 \$\{da\} 기준/);
});