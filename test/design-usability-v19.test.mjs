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

test('머리글 종은 통합알림 팝업을 열고, 숫자도 통합알림의 안 읽음 수다', () => {
  assert.match(read('wc/16-events.js'), /case 'menuBell': if \(S\.menuOpen === 'bell'\) closeOverlay\(\); else \{ closeOverlay\(\); openMenu\('bell', el\); \}/);
  const head = read('wc/05-views.js');
  assert.match(head, /ntfUnread\(\)/);
  assert.doesNotMatch(head, /S\.activity\.filter\(x => x\.at > S\.seenActivity\)/);
  const ntf = read('wc/38-notifications-people.js');
  assert.match(ntf, /function ntfUnread\(\) \{ try \{ return NTF\.items \? NTF\.items\.filter\(x => !x\.read\)\.length/);
  assert.match(ntf, /Date\.now\(\) - ntfBgAt < 180000/);
});
test('왼쪽 메뉴: 읽히는 이름이 보이는 메뉴 이름으로 시작하고 숫자 배지는 따로 읽히지 않는다', () => {
  const src = read('wc/05-views.js');
  assert.match(src, /aria-label="\$\{esc\(v\.label \+ /);
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
  assert.match(v, /fromNav = active\?\.closest\('#nav a'\)/);
  assert.match(v, /if \(fromNav\).*focus\(\{preventScroll: true\}\)/);
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
  assert.match(n, /if \(!wasUnread \|\| opened === false\) return;\s*x\.read = true; if \(typeof renderHead === 'function'\) renderHead\(\);/);
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
  const pane = (read('wc/13-detail-pane.js') + read('wc/13b-mail-compose.js'));
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
  assert.match(read('wc/05-views.js'), /ml = mailSnapshot\(\)\.unread;/);
  assert.match(read('wc/15-overlays-palette-help-menus.js'), /new MutationObserver\(\(\) => \{ if \(ovEl\.childElementCount\) return;/);
  assert.match(read('wc/31-chat-engine.js'), /role === 'ai' && S\.lastRefresh \? \{dataAt: S\.lastRefresh\.getTime\(\)\}/);
  assert.match(read('wc/30-chat-ui.js'), /그룹웨어 자료 \$\{da\} 기준/);
});
test('v1.14.0 실업무 흐름: 주간 실적 묶기, 메일 쓰기 넓게, 시간 범위 오후, 일정 겹침, 화면 맞춤, 입력 중 표시, 조사', async () => {
  const {weeklyReport} = await import('../src/live/briefing.mjs');
  const out = weeklyReport({submitted: [{title: 'A 『모의사업』 구입', docNo: '1', status: '결재완료'}, {title: '다른 건', docNo: '2', status: '결재완료'}, {title: 'B 『모의사업』 배너', docNo: '3', status: '결재완료'}, {title: '(11-22)시간외근무신청(홍길동)', status: '결재완료'}, {title: '(11-21)시간외근무신청(홍길동)', status: '결재완료'}], from: '20261116', to: '20261121'});
  assert.match(out, /- A 『모의사업』 구입 \(1\)\n  - B 『모의사업』 배너 \(3\)\n  - 다른 건 \(2\)/);
  assert.match(out, /복무 신청 2건: 시간외근무 2건/);
  assert.doesNotMatch(out, /홍길동\)/);
  const {chatParseRange} = await import('../src/live/chat.mjs');
  assert.deepEqual(chatParseRange('오후 2시부터 5시까지'), {start: '14:00', end: '17:00'});
  assert.deepEqual(chatParseRange('2시부터 4시 반까지'), {start: '14:00', end: '16:30'});
  assert.deepEqual(chatParseRange('오전 10시부터 12시'), {start: '10:00', end: '12:00'});
  assert.deepEqual(chatParseRange('9시부터 6시'), {start: '09:00', end: '18:00'});
  const pane = (read('wc/13-detail-pane.js') + read('wc/13b-mail-compose.js'));
  assert.match(pane, /isMailCompose\(url\) && typeof innerWidth === 'number' && innerWidth < 1600/);
  assert.match(pane, /function fitFrameWidth\(f, u\)/);
  assert.match(pane, /if \(injected && typeof markPaneDirty === 'function'\)/);
  assert.match(read('wc/47-chat-precise.js'), /그날 내 신청이 있습니다/);
  assert.doesNotMatch(read('wc/33-chat-tools-act.js'), /\}을\(를\)/);
});
test('v1.15.0 실제 실행 점검: 나에게 메일, 시제, 인사말, 내 일정 수집, 입력 중 표시 해제', async () => {
  const {chatIntent} = await import('../src/live/chat.mjs');
  const now = new Date('2026-11-21T11:00:00Z');
  const a = chatIntent('나에게 "점검 메일입니다."라고 메일 보내줘', now);
  assert.equal(a.tool, 'compose_mail'); assert.equal(a.args.to, '나'); assert.equal(a.args.body, '점검 메일입니다.');
  assert.equal(chatIntent('김지은에게 내일 회의 참석한다고 메일 보내줘', now).args.body, '11/22 회의 참석합니다.');
  assert.equal(chatIntent('나한테 테스트라고 메일 써줘', now).args.body, '테스트입니다.');
  const pane = (read('wc/13-detail-pane.js') + read('wc/13b-mail-compose.js'));
  assert.match(pane, /<p>안녕하세요\.<\/p>\n<p>\$\{esc\(greetMe\)\}입니다\.<\/p>/);
  assert.doesNotMatch(pane, /안녕하십니까/);
  assert.match(pane, /function clearDirtyWhenGone\(stillOpen\)/);
  assert.match(read('collector.browser.js'), /const events = arr\(rows && rows\.resultList\)\.map\(r => \(\{/);
  const hab = read('wc/49-chat-habits.js');
  assert.match(hab, /mails\.size === 1/);
  assert.match(hab, /OBTAutoCompleteChips_uncorrect/);
});
test('v1.15.1: 자원 현황 답의 화면 이동은 그 자원·날짜로, 여러 날 예약은 기간으로 표시', () => {
  assert.match(read('wc/32-chat-tools-read.js'), /view: 'resource', v: `\$\{car\.resSeq\},\$\{d8\}`/);
  assert.match(read('wc/30-chat-ui.js'), /view === 'resource' && \/\^\[\\w-\]\+,\\d\{8\}\$\/\.test\(param/);
  assert.match(read('wc/24-resource.js'), /b\.end\.slice\(0, 8\) !== b\.start\.slice\(0, 8\)/);
});
test('v1.16.0: 결과보고 실적 칸은 계획서 값으로 먼저 채우고 표시한다', async () => {
  const {planFacts} = await import('../src/live/briefing.mjs');
  assert.deepEqual(planFacts('  나. 참가일시: 2026. 10. 27.(화) 14:00 ~ 16:30\n  다. 참가장소: 모의 도서관\n  마. 참가인원: 총 9명\n  사. 소요예산: 금50,000원 ※ 실비\n  바. 주요내용: 발제와 토론'), ['2026. 10. 27.(화) 14:00 ~ 16:30', '모의 도서관', '총 9명', '금50,000원', '발제와 토론']);
  assert.deepEqual(planFacts('  가. 일 시: 11. 22.\n  다. 대 상: 청소년'), ['11. 22.', '', '', '', '']);
  assert.deepEqual(planFacts(''), ['', '', '', '', '']);
  const rv = read('wc/42-result-review.js');
  assert.match(rv, /R\.planFacts\(plan\.body\)/);
  assert.match(rv, /계획서 값으로 먼저 채웠습니다/);
  assert.match(rv, /계획서 값 그대로인 칸 '\+fromPlan\+'개/);
});

test('v1.16.0 유지보수: 자동 업데이트 즉시 적용·짧은 재확인, 보안메일 안내, 죽은 코드 정리', () => {
  const gov = read('wc/21-governance.js');
  assert.match(gov, /const updIdle = \(\) =>/);
  assert.match(gov, /if \(S\.open && !reopen && typeof updIdle === 'function' && updIdle\(\)\) reopen = true;/);
  assert.match(gov, /setInterval\(onUpdateVisible, 5 \* 60e3\)/);
  assert.match(gov, /autoUpdate\(true\)/);
  assert.match(gov, /Date\.now\(\) - cached\.at < 3 \* 60e3/);
  assert.match((read('wc/13-detail-pane.js') + read('wc/13b-mail-compose.js')), /보안메일은 대용량 첨부만/);
  assert.doesNotMatch(read('wc/19-draft-engine.js'), /buildConfirmedResultBody/);
});

test('v1.16.1: 예산 월 필터 해제는 화면의 전체 버튼(ledgerMonth 빈 값)으로, 따로 쓰이지 않던 처리기는 없음', () => {
  assert.doesNotMatch(read('wc/16-events.js'), /budgetMonthClear/);
  assert.match(read('wc/10-calendar-budget.js'), /data-act="ledgerMonth"/);
});
