import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {cleanTitle, fmtDays, analyze, nextState, renderHtml, renderMarkdown, toDataset, extractDeadline, extractAllDeadlines, attendanceAnomalies, recommendRouting, weeklyReport, toCsv} from '../src/live/briefing.mjs';
import {validateDataset} from '../src/schema.mjs';
import {buildReport} from '../scripts/live-report.mjs';

const NOW = new Date('2026-11-09T00:30:00Z'); // 2026-11-09 09:30 KST
const ORIGIN = 'https://gw.bwyf.or.kr';

function fixture(overrides = {}) {
  const doc = (id, title, extra = {}) => ({docId: id, title, status: '접수중', statusCode: '001', drafter: '', drafterDept: '', approver: '', sender: '테스트기관', docNo: `테스트-${id}`, date: '2026-11-06 10:00:00', attachments: 1, comments: 0, unread: false, ...extra});
  const list = (label, docs, total = docs.length) => ({label, menu: '1', total, fetched: docs.length, docs, url: `${ORIGIN}/#/UC/UCA/UCA0000?pageCode=UCA0000`});
  return {
    schemaVersion: 1, collector: '1.0.0', origin: ORIGIN, collectedAt: '2026-11-09T00:29:00.000Z', durationMs: 300, sessionExpired: false,
    principal: {empSeq: '1', loginId: 'u1', name: '홍길동', deptName: '시험부서', compName: '시험재단'},
    options: {approvalDays: 92},
    status: {mail: {ok: true, ms: 10}, approval: {ok: true, ms: 10}, notice: {ok: true, ms: 10}, schedule: {ok: true, ms: 10}, leave: {ok: true, ms: 10}, attendance: {ok: true, ms: 10}, budget: {ok: true, ms: 10}, alerts: {ok: true, ms: 10}},
    data: {
      mail: {boxes: [{seq: 1, name: 'INBOX', total: 3, unseen: 1}], url: `${ORIGIN}/#/UD`, otherUnseen: [{uid: '9', box: '외부', subject: 'Weekly 뉴스 모음', from: '뉴스', date: '2026-11-08 08:00:00', seen: false, answered: false, forwarded: false, attach: false, preview: ''}],
        inbox: {total: 3, unseen: 1, fetched: 3, records: [
          {uid: '3', box: 'INBOX', subject: '자료 제출 요청(~11/12)', from: '김시험', date: '2026-11-08 18:00:00', seen: false, answered: false, forwarded: false, attach: true, preview: '비밀번호: [MASKED]'},
          {uid: '2', box: 'INBOX', subject: '회의 참석 확인 부탁드립니다', from: '이시험', date: '2026-11-07 12:00:00', seen: true, answered: false, forwarded: false, attach: false, preview: ''},
          {uid: '1', box: 'INBOX', subject: '<script>alert(1)</script> 안내', from: '박시험', date: '2026-10-01 12:00:00', seen: true, answered: true, forwarded: false, attach: false, preview: ''},
        ]}},
      approval: {url: `${ORIGIN}/#/UC`, counts: [{menu: '11000700', name: '대기문서', count: 1, total: null}, {menu: '11002300', name: '부서대기문서', count: 1, total: null}, {menu: '11002700', name: '배부대기문서', count: 0, total: null}, {menu: '11000500', name: '열람문서', count: 1, total: 10}],
        lists: {
          pending: list('결재 대기', [doc('100', '예산 집행 품의', {sender: '', drafter: '최기안'})]),
          deptWaiting: list('부서 접수 대기', [doc('200', '협조 요청 공문 (11월 20일까지 회신)')]),
          distWaiting: list('배부 대기', []),
          sendWaiting: list('발송 대기', []),
          submitted: list('내 상신문서', [doc('300', '출장신청', {status: '결재중(부장)', statusCode: '002'}), doc('301', '연가신청', {status: '반려(부장)', statusCode: '007'}), doc('302', '보고', {status: '결재완료(부장)', statusCode: '008'})], 50),
          viewing: list('열람문서', [doc('400', '열람 안내', {unread: true}), doc('401', '읽은 열람', {unread: false})], 10),
        }},
      notice: {total: 100, unread: 1, fetched: 2, url: `${ORIGIN}/#/UF`, articles: [
        {id: '10', title: '[공지] 설문 참여 (~11.20.)', writer: '정작성', dept: '시험부서', date: '2026-11-05 09:00:00', read: false, top: false, files: 0, mine: false, reserved: false},
        {id: '11', title: '예약된 글', writer: '홍길동', dept: '시험부서', date: '2026-11-01 09:00:00', read: true, top: false, files: 0, mine: true, reserved: true},
      ]},
      schedule: {start: '20261109', end: '20261123', calendars: [{seq: '1', type: 'E', title: '개인', writable: true}], events: [{id: '5', title: '외부 회의', calendar: '개인', start: '202611101400', end: '202611101500', allDay: false, place: '회의실', people: '홍길동'}], holidays: [], url: `${ORIGIN}/#/UE`},
      attendance: {today: {date: '20261109', come: '0855', leave: '', error: ''}, month: {from: '20261101', to: '20261130', recognizedMin: 480, basicMin: 480, overtimeMin: 0, exceptMin: 0, nightMin: 0, error: ''}, url: `${ORIGIN}/#/HP`},
      leave: {year: '2026', granted: 20, used: 12.5, remaining: 7.5, breakdown: {}, upcoming: [{start: '20261111', end: '20261111', kind: '연차', days: 1, title: '연차', approved: true}], usedCount: 10, url: `${ORIGIN}/#/HP/HPD0550/HPD0550`},
      budget: {url: `${ORIGIN}/#/HP/NPC2040/NCC0610`, projects: [{project: 'P1', label: '시험사업', filter: '항1', year: 2026, gisu: '12', period: '누계', total: {code: 'P1', name: '합계', level: '계', budget: 1000, executed: 500, balance: 500, rate: 50}, rows: [{code: '항1', name: '항 이름', level: '항', path: '관1|항1|', budget: 100, executed: 60, balance: 40, rate: 60}], rowCount: 5}]},
      alerts: {alerts: []},
    },
    ...overrides,
  };
}

test('extractDeadline reads common Korean deadline notations', () => {
  assert.equal(extractDeadline('설문 (~11.20.)', NOW), '2026-11-20');
  assert.equal(extractDeadline('자료 제출(~11/12)', NOW), '2026-11-12');
  assert.equal(extractDeadline('공문 11월 20일까지 회신', NOW), '2026-11-20');
  assert.equal(extractDeadline('제출기한: 1/5', NOW), '2027-01-05');
  assert.equal(extractDeadline('2026년 계획 보고', NOW), '');
});

test('analyze ranks actions, filters noise and finds deadlines', () => {
  const a = analyze(fixture(), null, NOW);
  assert.equal(a.summary.approvalAction, 2);
  assert.equal(a.summary.rejectedSubmitted, 1);
  assert.equal(a.summary.inProgressSubmitted, 1);
  assert.equal(a.summary.mailUnread, 1, 'newsletter excluded');
  assert.equal(a.actions[0].priority, 'high');
  assert.ok(a.actions.some(x => x.kind === '열람문서' && x.title === '열람 안내'));
  assert.ok(!a.actions.some(x => x.title === '읽은 열람'));
  assert.ok(a.actions.some(x => x.kind === '답장했는지 확인' && x.title.startsWith('회의 참석')));
  assert.ok(!a.actions.some(x => x.title === '예약된 글'), 'reserved own post is not an unread notice');
  assert.deepEqual(a.deadlines.map(x => x.date), ['2026-11-12', '2026-11-20', '2026-11-20']);
  assert.equal(a.newSince, null);
});

test('diff state marks only new items and survives failed modules', () => {
  const raw = fixture();
  const state = nextState(raw);
  const later = fixture({collectedAt: '2026-11-09T03:00:00.000Z'});
  later.data.mail.inbox.records.unshift({uid: '4', box: 'INBOX', subject: '새 요청', from: '새사람', date: '2026-11-09 11:00:00', seen: false, answered: false, forwarded: false, attach: false, preview: ''});
  const a = analyze(later, state, NOW);
  assert.equal(a.newSince.mails, 1);
  assert.ok(a.actions.find(x => x.title === '새 요청').isNew);
  assert.ok(!a.actions.find(x => x.title === '자료 제출 요청(~11/12)').isNew);
  const failed = fixture({status: {...raw.status, mail: {ok: false, error: 'TIMEOUT'}}});
  failed.data.mail = undefined;
  assert.deepEqual(nextState(failed, state).mailUids, state.mailUids, 'failed module keeps previous baseline');
});

test('budget delta is computed against previous executed amounts', () => {
  const state = nextState(fixture());
  const later = fixture({collectedAt: '2026-11-10T00:00:00.000Z'});
  later.data.budget.projects[0].rows[0].executed = 75;
  const a = analyze(later, state, NOW);
  assert.equal(a.budget.projects[0].rows[0].executedDelta, 15);
});

test('rendered HTML escapes groupware text and keeps sections', () => {
  const html = renderHtml(analyze(fixture(), null, NOW));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  for (const s of ['내 처리할 일', '전자결재·문서유통', '예산 집행', '제목에서 찾은 기한']) assert.ok(html.includes(s), s);
  const md = renderMarkdown(analyze(fixture(), null, NOW));
  assert.match(md, /내 처리할 일 \*\*\d+건\*\*/);
});

test('assistant dataset passes the browser-snapshot contract', () => {
  const scope = {userId: 'local-browser-user', displayName: '홍길동', organizationId: 'local-browser-organization'};
  const dataset = validateDataset(toDataset(fixture(), scope));
  assert.equal(dataset.source.kind, 'browser-snapshot');
  assert.equal(dataset.items.filter(i => i.type === 'approval').length, 2);
  assert.equal(dataset.items.filter(i => i.type === 'notice').length, 1);
  assert.equal(dataset.items.filter(i => i.type === 'schedule').length, 1);
  assert.equal(dataset.source.coverage.find(c => c.type === 'approval').state, 'complete');
});

test('buildReport writes latest/history files and a state baseline', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-live-'));
  const rawPath = path.join(dir, 'raw.json');
  await fs.writeFile(rawPath, JSON.stringify(fixture()));
  const r = await buildReport({rawPath, outDir: path.join(dir, 'out'), scopePath: path.join(dir, 'missing.json'), now: NOW});
  for (const f of ['latest.html', 'latest.md', 'latest.json', 'state.json', 'dataset.json', 'history/2026-11-09.html', 'raw/2026-11-09.json']) await fs.access(path.join(dir, 'out', f));
  assert.equal(r.analysis.summary.approvalAction, 2);
  await assert.rejects(buildReport({rawPath: path.join(dir, 'missing.json'), outDir: path.join(dir, 'out')}), /형식/);
  await fs.rm(dir, {recursive: true, force: true});
});

// ---------- collector (browser script) in a sandbox ----------
async function loadCollector({respond, userInfo = {ucUserInfo: {empSeq: '1', groupSeq: 'g', compSeq: 'c', deptSeq: 'd', loginId: 'u', empName: '홍길동'}}}) {
  const src = await fs.readFile(new URL('../src/live/collector.browser.js', import.meta.url), 'utf8');
  const calls = [];
  const client = {call() {}, post: (p, body) => { calls.push(p); return respond(p, body); }};
  const moduleFactory = function signer() { return 'wehago-sign getTransactionId'; };
  const req = id => ({A: client});
  req.m = {42: moduleFactory};
  const window = {webpackChunkklago_ui_gw: {push: ([, , cb]) => cb(req)}};
  const sandbox = {window, location: {origin: ORIGIN}, sessionStorage: {getItem: () => JSON.stringify(userInfo)}, performance: {now: () => 0}, Intl, Date, JSON, Promise, setTimeout, clearTimeout, Object, Array, String, Number, Set, Map, Math, Function, Error};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return {api: window.BWYFGW, calls};
}

test('collector only calls allow-listed read endpoints', async () => {
  const {api, calls} = await loadCollector({respond: () => Promise.resolve({resultCode: 0, resultData: {}})});
  await assert.rejects(api.call('/human/openapi/commute/register', {}), e => e.code === 'NOT_ALLOWED');
  await assert.rejects(api.call('/board/APIHandler/PutVisitStat', {}), e => e.code === 'NOT_ALLOWED');
  assert.equal(calls.length, 0);
  for (const p of api.readOnlyEndpoints()) assert.doesNotMatch(p, /register|save|insert|update|delete|write|send|PutVisit|iniWrite/i, p);
});

test('collector maps session expiry and isolates module failures', async () => {
  const {api} = await loadCollector({respond: p => p.startsWith('/mail/') ? Promise.reject(JSON.stringify({errors: {code: 'E002', message: 'Token is not exists'}})) : Promise.resolve({resultCode: 0, resultData: {}})});
  const raw = await api.collect({modules: ['mail', 'leave']});
  assert.equal(raw.status.mail.ok, false);
  assert.equal(raw.status.mail.error, 'SESSION_EXPIRED');
  assert.equal(raw.sessionExpired, true);
  assert.equal(raw.status.leave.ok, true);
});

test('collector refuses to run outside a logged-in groupware page', async () => {
  const {api} = await loadCollector({respond: () => Promise.resolve({resultCode: 0, resultData: {}}), userInfo: null});
  await assert.rejects(api.collect({modules: ['leave']}), e => e.code === 'NOT_LOGGED_IN');
});

// ---------- v2: work center engine ----------
test('extractAllDeadlines finds every deadline in a document body', () => {
  const body = '■ 12월 월간업무보고 계획 ○ 자료 제출기한: ~ 11. 25.(수) ▶부서별 자료 제출기한: ~ 11. 19.(목) ○ 보고회: 11. 30.(월) 09:30';
  const found = extractAllDeadlines(body, NOW).map(x => x.date);
  assert.deepEqual(found, ['2026-11-19', '2026-11-25']);
  assert.deepEqual(extractAllDeadlines('2026. 12. 3.(목)까지 회신 바랍니다', NOW).map(x => x.date), ['2026-12-03']);
  assert.deepEqual(extractAllDeadlines('행사일 11. 30.(월) 개최', NOW), [], 'plain event dates are not deadlines');
});

test('attendanceAnomalies flags unexplained absences only', () => {
  const rows = [
    {date: '20261102', result: '결근', status: '대기', holiday: false, applied: false},
    {date: '20261103', result: '조퇴', item: '외출', status: '승인', holiday: false, applied: true},
    {date: '20261106', result: '미인정', item: '관내출장', status: '대기', holiday: false, applied: true},
    {date: '20261107', result: '휴일', status: '승인', holiday: true},
  ];
  const a = attendanceAnomalies(rows);
  assert.deepEqual(a.map(x => [x.date, x.priority]), [['20261102', 'high'], ['20261106', 'medium']]);
});

test('analyze turns attendance anomalies into actions with stable keys', () => {
  const raw = fixture();
  raw.data.attendance.days = [{date: '20261102', result: '결근', status: '대기', holiday: false, applied: false}];
  const a = analyze(raw, null, NOW);
  const x = a.actions.find(y => y.type === 'attendance');
  assert.equal(x.key, 'att:20261102');
  assert.equal(x.kind, '근태 확인 필요');
  assert.ok(['high', 'medium'].includes(x.priority));
  assert.ok(a.actions.every(y => typeof y.key === 'string' && y.key.length > 3), 'every action has a key');
});

test('recommendRouting ranks departments and detects simultaneous distribution', () => {
  const hist = [
    {title: '2026년 공중화장실 관리인 교육 참석 안내', sendOrg: '부천시장', sendDept: '자원순환과', sendDeptCode: '3860816', toDept: '고리울청소년센터', date: '2026-10-01 10:00:00'},
    {title: '2026년 공중화장실 관리인 교육 참석 안내', sendOrg: '부천시장', sendDept: '자원순환과', sendDeptCode: '3860816', toDept: '소사청소년센터', date: '2026-10-01 10:00:00'},
    {title: '2026년 공중화장실 관리인 교육 참석 안내', sendOrg: '부천시장', sendDept: '자원순환과', sendDeptCode: '3860816', toDept: '산울림청소년센터', date: '2026-10-01 10:00:00'},
    {title: '청소년지도사 만족도 설문', sendOrg: '부천시장', sendDept: '청년청소년과', sendDeptCode: '3860700', toDept: '부천시청소년센터', date: '2026-09-01 10:00:00'},
  ];
  const rec = recommendRouting({title: '공중화장실 관리인 교육 결과 제출', sendOrg: '부천시장', sendDeptCode: '3860816'}, hist);
  assert.equal(rec.length, 3);
  assert.ok(rec[0].reasons.includes('같은 발송 부서'));
  assert.equal(rec.group.targets.length, 3);
  assert.deepEqual([...recommendRouting({title: '전혀 다른 제목'}, hist)], []);
});

test('weeklyReport separates work documents from personal requests and groups repeats', () => {
  const text = weeklyReport({
    submitted: [
      {title: '수능 이후 프로그램 제출', status: '결재완료', statusCode: '008', docNo: 'A-1'},
      {title: '수능 이후 프로그램 제출', status: '결재완료', statusCode: '008', docNo: 'A-2'},
      {title: '사업 계획', status: '결재중(부장)', statusCode: '002'},
      {title: '(11-09)대체휴가(홍길동)', status: '결재완료', statusCode: '008'},
    ],
    me: '시험부서 홍길동', from: '20261102', to: '20261108', now: NOW,
  });
  assert.match(text, /기안·보고 3건 \(결재완료 2, 진행 1\)/);
  assert.match(text, /수능 이후 프로그램 제출 \(2건: A-1, A-2\)/);
  assert.match(text, /복무 신청 1건/);
});

test('toCsv writes a BOM and escapes cells', () => {
  const csv = toCsv([{a: 'x,"y"', b: 1}], [{label: 'A', key: 'a'}, {label: 'B', value: r => r.b + 1}]);
  assert.equal(csv, '\uFEFFA,B\r\n"x,""y""",2');
});

test('collector v2 builds native popup links and normalizes search results', async () => {
  const {api, calls} = await loadCollector({respond: (p, body) => {
    if (p === '/gw/APIHandler/gw018A02') return Promise.resolve({resultCode: 0, resultData: {totalcount: 1, resultgrid: [{docId: '9', docNo: 'X-1', docTitle: '예산 보고', formNm: {kr: 'temporary'}, userNm: {kr: '김시험'}, deptNm: {kr: '시험부서'}, docContents: '앞부분 예산 집행 비밀번호: abc123 뒷부분', docDate: '20261101', fileList: []}]}});
    if (p === '/nonprofit/popup/0BN00001') { assert.deepEqual([...body.mgtCd], ['P1']); assert.deepEqual([...body.bgtCd], ['B1']); return Promise.resolve({resultCode: 0, resultData: {result: [{gisuDt: '20260310', rmkDc: '물품비', unitAm: 300, noDoc: 'D-1', korNm: '홍'}], unitAmSum: 300}}); }
    return Promise.resolve({resultCode: 0, resultData: {}});
  }});
  const s = await api.search('예산', {types: ['doc']});
  const doc = s.groups.doc.items[0];
  assert.equal(doc.form, '접수문서');
  assert.equal(doc.drafter, '김시험');
  assert.match(doc.snippet, /\[MASKED\]/);
  assert.match(doc.url, /#popup\?MicroModuleCode=ea&callComp=UCAP001&diKeyCode=9$/);
  assert.match(api.links.doc({docId: '5', diSeqNum: '2'}, 'distWaiting'), /recvOpenYN=Y&isBaebu=Y&diSeqNum=2/);
  const l = await api.budgetLedger({project: 'P1', bgtCd: 'B1', year: 2026});
  assert.equal(l.checkSum, 300);
  assert.equal(l.rows[0].docNo, 'D-1');
  await assert.rejects(api.search('a'), e => e.code === 'BAD_QUERY');
  assert.ok(!calls.some(p => /gw018A04|gw032A01|PutVisitStat|iniWrite/.test(p)), 'no search-history or visit writes');
});

test('bundle build includes collector, analysis and lazy work center', async () => {
  const {execFileSync} = await import('node:child_process');
  const {fileURLToPath} = await import('node:url');
  // Isolated output: never touch build/live (the real bundle and the administrator's extension/policy.js).
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-live-build-'));
  try {
    execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/live-build.mjs', import.meta.url)), '--out-dir', out], {stdio: 'pipe'});
    const bundle = await fs.readFile(path.join(out, 'gw-live.js'), 'utf8');
    for (const s of ['window.BWYFGW =', 'window.BWYFGW_REPORT', 'window.BWYFGW_WC', 'recommendRouting']) assert.ok(bundle.includes(s), s);
    const mini = await fs.readFile(path.join(out, 'bookmarklet-mini.txt'), 'utf8');
    assert.ok(mini.length < 2000, 'launch bookmark stays small');
  } finally { await fs.rm(out, {recursive: true, force: true}); }
});

test('deadline mails: unanswered ones rise, answered ones stay low, leave-day conflicts are flagged', () => {
  const raw = fixture();
  raw.data.leave.upcoming = [{start: '20261112', end: '20261112', kind: '대체휴가', days: 1, title: '대체휴가', approved: true}];
  raw.data.mail.inbox.records.push({uid: '7', box: 'INBOX', subject: '자료 회신 요청(~11/12)', from: '정답장', date: '2026-11-08 09:00:00', seen: true, answered: true, forwarded: false, attach: false, preview: ''});
  const a = analyze(raw, null, NOW);
  const open = a.actions.find(x => x.type === 'mail' && x.title === '자료 제출 요청(~11/12)');
  const answered = a.actions.find(x => x.ref && x.ref.uid === '7');
  assert.equal(open.kind, '기한 있는 메일');
  assert.match(answered.kind, /제출까지/);
  assert.match(answered.detail, /답장함/);
  assert.notEqual(answered.priority, 'high');
  assert.ok(answered.score < open.score);
  assert.ok(open.leaveConflict, 'deadline on a leave day is flagged on the item itself');
  assert.ok(open.why.includes('휴가일 마감'));
  assert.equal(open.leaveConflict.before, '2026-11-11', 'real deadline is the working day before the leave');
  assert.ok(!a.actions.some(x => x.type === 'conflict' && x.title === open.title), 'no duplicate conflict row');
  assert.ok(a.actions.filter(x => x.priority === 'high').length <= 6);
});

test('v3.1 rules: Re: mails are not my deadline, one swap explains one absence, plain negatives stay numeric', () => {
  const raw = fixture();
  raw.data.mail.inbox.records.push({uid: '8', box: 'INBOX', subject: 'Re: 「지침」검토 요청(~11/13)', from: '동료', date: '2026-11-08 10:00:00', seen: true, answered: false, forwarded: false, attach: false, preview: ''});
  const a = analyze(raw, null, NOW);
  assert.ok(!a.actions.some(x => x.ref && x.ref.uid === '8'), 'read Re: mail is not an action');
  assert.ok(!a.deadlines.some(x => x.title.startsWith('Re:')), 'Re: mail is not a deadline');
  const days = [
    {date: '20261101', workType: '근무일대체', result: '정상근무', holiday: true},
    {date: '20261102', result: '결근', status: '대기', holiday: false, applied: false},
    {date: '20261104', result: '결근', status: '대기', holiday: false, applied: false},
  ];
  const an = attendanceAnomalies(days, {now: NOW});
  assert.equal(an.find(x => x.date === '20261102').nearSwap, '20261101');
  assert.equal(an.find(x => x.date === '20261104').nearSwap, '');
  assert.equal(an.find(x => x.date === '20261104').priority, 'high');
  assert.equal(toCsv([{a: -1500, b: '=1+1'}], [{label: 'A', key: 'a'}, {label: 'B', key: 'b'}]), '\uFEFFA,B\r\n-1500,\'=1+1');
});

test('routing ignores common place words and needs a meaningful topic match', () => {
  const hist = [
    {title: '2026 부천 교육 대토론회 협조 요청', sendOrg: '부천시지속가능발전협의회', sendDeptCode: '1', toDept: '소사청소년센터', date: '2026-10-30 10:00:00'},
    {title: '2026 부천 교육 대토론회 협조 요청', sendOrg: '부천시지속가능발전협의회', sendDeptCode: '1', toDept: '산울림청소년센터', date: '2026-10-30 10:00:00'},
  ];
  const rec = recommendRouting({title: '[협조] 2026 부천 미래+클 공유학교 성과 공유회 운영계획 안내 및 참여 협조', sendOrg: '경기도부천교육지원청', sendDeptCode: '9'}, hist);
  assert.equal(rec.length, 0);
  assert.equal(rec.group, null);
});
test('routing ignores organisation names in titles', () => {
  const hist = ['9월 수입내역 보고', '청소년 동아리 발표회 안내', '시설 안전점검 결과'].map((t, i) => ({title: `부천시청소년센터 ${t}`, sendOrg: '부천여성청소년재단', sendDeptCode: '5', toDept: '청소년정책팀', date: `2026-10-0${i + 1} 10:00:00`}));
  const rec = recommendRouting({title: '2026년 10월 부천시청소년센터 4DAY 실시 결과 보고', sendOrg: '부천여성청소년재단', sendDeptCode: '5'}, hist);
  assert.equal(rec.length, 0, 'same centre name alone is not a topic match');
});
test('relevance: department work and shared material go to reference, self mail is dropped', () => {
  const raw = fixture();
  raw.principal = {...(raw.principal || {}), name: '서원하', loginId: 'sysmetrix'};
  raw.data.mail.inbox.records.push(
    {uid: '901', box: 'INBOX', subject: '[정리] 내게 쓴 메모', from: '서원하', fromEmail: 'sysmetrix@bwyf.or.kr', date: '2026-11-08 10:00:00', seen: false, answered: false, forwarded: false, attach: false, preview: ''},
    {uid: '902', box: 'INBOX', subject: '3개년 결과보고서 드립니다.', from: '장지숙', fromEmail: '016023@bwyf.or.kr', date: '2026-11-07 10:00:00', seen: true, answered: false, forwarded: false, attach: false, preview: '대용량 파일첨부 2개'},
  );
  const a = analyze(raw, null, NOW);
  assert.ok(!a.actions.some(x => x.ref && x.ref.uid === '901'), 'self mail dropped');
  const shared = a.actions.find(x => x.ref && x.ref.uid === '902');
  assert.equal(shared.scope, 'ref');
  assert.equal(shared.kind, '받은 자료');
  for (const x of a.actions.filter(x => ['deptWaiting', 'distWaiting', 'notice', 'viewing'].includes(x.base))) { assert.equal(x.scope, 'ref', x.key); assert.notEqual(x.priority, 'high'); }
  const b = analyze(raw, null, NOW, {roles: {deptReceiver: true, distributor: true}});
  for (const x of b.actions.filter(x => ['deptWaiting', 'distWaiting'].includes(x.base))) assert.equal(x.scope, 'mine', x.key);
});

const mailRec = (uid, subject, extra = {}) => ({uid, box: 'INBOX', subject, from: '동료', fromEmail: 'p@x.kr', date: '2026-11-03 10:00:00', seen: true, answered: false, forwarded: false, attach: false, preview: '', ...extra});
test('state contract: answered/unanswered deadline mails with leave-advanced deadlines', () => {
  const raw = fixture();
  raw.data.leave.upcoming = [{start: '20261109', end: '20261109', kind: '대체휴가', days: 1, title: '대체휴가', approved: true}];
  raw.data.mail.inbox.records.push(
    mailRec('a1', '시간외근무 작성 요청(~11/9)', {answered: true}),
    mailRec('a2', '자료 작성 요청(~11/9 16:00)'),
    mailRec('a3', '의견 제출 요청(~11/10)'),
    mailRec('a4', '검토 요청(~11/20)', {date: '2026-11-08 10:00:00'}));
  const a = analyze(raw, null, NOW);
  const by = u => a.actions.find(x => x.ref && x.ref.uid === u);
  assert.equal(by('a1').state, 'confirm'); assert.notEqual(by('a1').priority, 'high');
  assert.match(by('a1').headline, /11-06\(금\)까지였음 · 답장함/);
  assert.equal(by('a2').state, 'overdue'); assert.equal(by('a2').priority, 'high');
  assert.equal(by('a3').state, 'urgent');
  assert.equal(by('a4').state, 'todo');
  for (const x of a.actions) { assert.ok(x.headline && x.headline.length <= 40, x.key); assert.ok(Array.isArray(x.facts) && x.facts.length <= 4); if (x.scope === 'ref') assert.equal(x.state, 'info'); }
  const order = {overdue: 0, urgent: 1, todo: 2, check: 3, confirm: 4, info: 5};
  for (let i = 1; i < a.actions.length; i++) assert.ok(order[a.actions[i - 1].state] <= order[a.actions[i].state]);
  const mine = a.actions.filter(x => x.scope !== 'ref');
  assert.equal(a.summary.mine.total, mine.length);
  assert.equal(a.summary.ref, a.actions.length - mine.length);
  assert.equal(a.summary.mine.urgent, mine.filter(x => ['overdue', 'urgent'].includes(x.state)).length);
  assert.equal(Object.values(a.summary.mine.byArea).reduce((p, q) => p + q, 0), mine.filter(x => ['결재', '메일', '기한', '근태', '공지'].includes(x.area)).length);
});

test('attendance items are checks without guesses in the headline; today workday flag', () => {
  const raw = fixture();
  raw.data.attendance.days = [
    {date: '20261101', workType: '근무일대체', result: '정상근무', holiday: true},
    {date: '20261102', result: '결근', status: '대기', holiday: false, applied: false},
    {date: '20261106', result: '미인정', status: '대기', item: '관내출장', holiday: false, applied: true},
  ];
  const a = analyze(raw, null, NOW);
  const d2 = a.actions.find(x => x.key === 'att:20261102'), d6 = a.actions.find(x => x.key === 'att:20261106');
  assert.equal(d2.state, 'check'); assert.match(d2.headline, /출근 기록 없음/); assert.ok(!/수 있음/.test(d2.headline));
  assert.ok(!d2.facts.some(f => /수 있음/.test(f)), 'no guesses in facts'); assert.match(d2.context, /11\/01에 휴일근무/); assert.match(d2.title, /^11\/02\(월\) 근태 확인/);
  assert.equal(d6.headline, '근태신청 결재를 기다리는 중'); assert.equal(d6.state, 'wait'); assert.ok(!a.actions.filter(x => x.scope !== 'ref' && x.state !== 'wait').includes(d6));
  assert.deepEqual(a.today, {date: '2026-11-09', isWorkday: true});
  assert.equal(analyze(raw, null, new Date('2026-11-08T03:00:00Z')).today.isWorkday, false);
});

test('titles are cleaned and reports carry no ms or raw decimals', () => {
  assert.equal(cleanTitle('?2026년  연합캠프\u0007 추천'), '2026년 연합캠프 추천');
  assert.equal(fmtDays(6.59375), '6일 4시간 45분');
  const raw = fixture();
  raw.data.leave.remaining = 6.59375; raw.data.leave.granted = 38.15625; raw.data.leave.used = 31.5625;
  raw.data.approval.lists.pending.docs[0].title = '?급한 결재';
  const a = analyze(raw, null, NOW);
  assert.ok(a.actions.some(x => x.title === '급한 결재'));
  for (const text of [renderHtml(a), renderMarkdown(a)]) {
    assert.ok(!/\d+ms\b/.test(text), 'no ms');
    assert.ok(!text.includes('6.59375') && !text.includes('38.15625'));
    assert.ok(text.includes(`내 처리할 일 ${a.summary.mine.total}건`));
  }
});

test('work center: every clickable data-act has a handler, CSS is a separate design-system file', async () => {
  const fs = await import('node:fs/promises');
  const dir = new URL('../src/live/wc/', import.meta.url);
  const names = (await fs.readdir(dir)).filter(n => n.endsWith('.js')).sort();
  const src = (await fs.readFile(new URL('../src/live/workcenter.browser.js', import.meta.url), 'utf8')) + (await Promise.all(names.map(n => fs.readFile(new URL(n, dir), 'utf8')))).join('\n');
  const css = (await fs.readFile(new URL('../src/live/wc-style.css', import.meta.url), 'utf8')) + (await fs.readFile(new URL('../src/live/wc-theme.css', import.meta.url), 'utf8'));
  const acts = new Set([...src.matchAll(/data-act=\\?"([A-Za-z]+)\\?"/g)].map(m => m[1]));
  const handled = new Set([...src.matchAll(/case '([A-Za-z]+)'/g)].map(m => m[1]));
  const special = new Set(['closeOverlay', 'toastUndo']);
  const missing = [...acts].filter(a => !handled.has(a) && !special.has(a));
  assert.deepEqual(missing, [], `unhandled actions: ${missing.join(', ')}`);
  assert.ok(src.includes("'/*@WC_CSS@*/'") && src.includes('/*@WC_PARTS@*/'));
  const {execFileSync} = await import('node:child_process');
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-live-build-'));
  try {
    execFileSync(process.execPath, ['scripts/live-build.mjs', '--out-dir', out], {cwd: new URL('..', import.meta.url)});
    execFileSync(process.execPath, ['--check', path.join(out, 'gw-live.js')], {cwd: new URL('..', import.meta.url)});
  } finally { await fs.rm(out, {recursive: true, force: true}); }
  assert.ok(/word-break:keep-all/.test(css), 'Korean words must not break mid-word');
  assert.ok(!/font-size:(?:[0-9]|1[01])(?:\.\d+)?px/.test(css), 'no text smaller than 12px');
  assert.ok(/:focus-visible/.test(css), 'keyboard focus ring');
});
test('multi-user: storage keys are partitioned per user (empSeq/loginId)', async () => {
  const fs = await import('node:fs/promises');
  const dir = new URL('../src/live/wc/', import.meta.url);
  const src = await fs.readFile(new URL('01-storage.js', dir), 'utf8');
  assert.ok(src.includes('bwyfgw:wc:'), 'base prefix');
  assert.ok(src.includes('getUserKey()'), 'dynamic user key function');
  assert.ok(src.includes('switchUserStorage'), 'switch user function');
});

test('multi-user: briefing analysis adapts to whatever principal is passed', () => {
  const raw1 = fixture();
  raw1.principal = {empSeq: '999001', loginId: 'userA', name: '김철수', deptName: '청소년활동팀'};
  raw1.data.approval.lists.deptWaiting.docs[0].toEmp = '김철수';
  const a1 = analyze(raw1, null, NOW);
  const mineA = a1.actions.filter(x => x.scope !== 'ref');
  assert.ok(mineA.some(x => x.title.includes('협조 요청 공문')), 'dept doc assigned to 김철수 is mine');

  const raw2 = fixture();
  raw2.principal = {empSeq: '999002', loginId: 'userB', name: '이영희', deptName: '경영지원부'};
  const a2 = analyze(raw2, null, NOW);
  const mineB = a2.actions.filter(x => x.scope !== 'ref');
  assert.ok(!mineB.some(x => x.title.includes('협조 요청 공문')), 'dept doc not assigned to 이영희 is ref');
});
test('safe draft links: interlocked forms (36, 40, 1007, 1012) route to safe modules, not raw tiKeyCode', async () => {
  const {api} = await loadCollector({});
  // Raw tiKeyCode on interlocked forms causes Amaranth 10 error "연동본문 데이터 조회 실패하였습니다."
  const hrUrl = api.links.draft('36', '연차휴가신청서');
  assert.ok(hrUrl.includes(api.routes.attendanceRequest), 'leave draft routes to attendance request');

  const tripUrl = api.links.draft('40', '출장신청서');
  assert.ok(tripUrl.includes(api.routes.attendanceRequest), 'biztrip draft routes to attendance request');

  const expUrl = api.links.draft('1007', '지출결의서');
  assert.ok(expUrl.includes(api.routes.expenseEntry), 'accounting draft routes to 결의서입력 (예산집행)');

  const stdUrl = api.links.draft('mg_20160303185413307', '일반기안문');
  assert.ok(stdUrl.includes('tiKeyCode=mg_20160303185413307'), 'general form opens direct draft popup');
});
// ---- 기안 패턴(조직 서식 학습) ----
import {patternTokens, buildPatternModel, predictDraftMeta, formatRunRef, planToResultTitle, buildResultBody, textWidthPt, buildPlanSkeleton, moneyKo, buildPaymentProposalBody, pendingPayments, sha256Hex, chainAudit, verifyAudit, normalizePolicy, featureAllowed, purgeExpired, compareVersions, maskSensitive, classifyTeamRow, buildTeamCalendar, checkPaymentEntry, maskAccount, isGeminiKey, buildAiContext, expandPlanned, freeSlots, validateBooking, timeOptions, bookingSpanOnDay, buildDayTimeline, stalledSubmitted, wrapUpModel} from '../src/live/briefing.mjs';

const PLAN_BODY = ['1. 가나부-1613(2026. 3. 4.)호와 관련입니다.', '2. 2026년『시험 사업』을 다음과 같이 운영하고자 합니다.', '  가. 사 업 명: 2026년『시험 사업』', '  나. 운영일정: 2026. 11. 1.(일) 14:00~16:30', '  다. 운영장소: 시험센터 2층', '  라. 참가인원: 연 40명(실 40명) ※ 선착순 접수', '  마. 주요내용: 아주 긴 설명이 이어지는 항목입니다 아주 긴 설명이 이어지는 항목입니다 아주 긴 설명이 이어지는 항목입니다 아주 긴 설명이 이어지는 항목입니다', '  바. 소요예산: 비예산', '', '붙임  운영계획서 1부.  끝.'].join('\r\n');

test('org pattern: result body follows real plan->result conversion rules', () => {
  const r = buildResultBody(PLAN_BODY, {runday: '가나부-7679 (2026.10.03)', planTitle: '2026년『시험 사업』 운영계획'});
  assert.equal(r.lines[0], '1. 가나부-7679(2026. 10. 3.)호와 관련입니다.');
  assert.equal(r.lines[1], '2. 2026년『시험 사업』 운영 결과를 다음과 같이 보고합니다.');
  assert.equal(r.lines[2], '  가. 사 업 명: 2026년『시험 사업』');
  assert.equal(r.lines[5], '  라. 참가인원: 연 40명(실 40명)'); // ※ 비고 삭제
  assert.equal(r.lines[r.lines.length - 2], '');
  assert.equal(r.lines[r.lines.length - 1], '붙임  결과보고서 1부.  끝.');
  assert.deepEqual(r.notes, ['참가인원 실적 확인']);
  assert.equal(r.text.includes('\r\n'), true);
  // 긴 항목만 내어쓰기 대상
  assert.equal(r.hang[6], true);
  assert.equal(r.hang[2], false);
});
test('org pattern: numbered plan items are re-lettered and 참가 wording is used', () => {
  const plan = ['재단의 역량 강화를 위해 다음과 같이 교육에 참가하고자 합니다.', '  1. 교 육 명: 2026년 시험교육 2기', '  2. 일    시: 2026. 8. 24.(월)', '  3. 참 가 비: 없음', '', '붙임  안내문 1부.  끝.'].join('\r\n');
  const r = buildResultBody(plan, {runday: '가나부-5967 (2026.08.18)', planTitle: '2026년 시험교육 2기 참가 계획'});
  assert.deepEqual(r.lines, ['1. 가나부-5967(2026. 8. 18.)호와 관련입니다.', '2. 2026년 시험교육 참가 결과를 다음과 같이 보고합니다.', '  가. 교 육 명: 2026년 시험교육 2기', '  나. 일    시: 2026. 8. 24.(월)', '  다. 참 가 비: 없음', '', '붙임  결과보고서 1부.  끝.']);
});
test('org pattern: titles, run refs and width model', () => {
  assert.equal(planToResultTitle('2026년『A』 운영계획'), '2026년『A』 운영 결과보고');
  assert.equal(planToResultTitle('2026년 B 참가 계획'), '2026년 B 참가 결과보고');
  assert.equal(planToResultTitle('2026년 C 운영 계획(안)'), '2026년 C 운영 결과보고');
  assert.equal(formatRunRef('가나부-7679 (2026.08.03)'), '가나부-7679(2026. 8. 3.)');
  assert.equal(textWidthPt('  가. 사 업 명: AB'), 12 + 12 + 6 + 6 + 12 + 6 + 12 + 6 + 12 + 6 + 6 + 6 + 12 - 6); // 한글 12pt, 영문/공백/기호 6pt
});
test('org pattern: binder/meta prediction prefers the source document, then the same business', () => {
  const docs = [
    {id: '1', docNo: 'X-1', title: '2026년『소셜리빙랩 시험』 운영계획', form: '일반기안문', binder: 'ESG 경영', open: '공개', urgent: '일반문서', sec: '일반문서', docKind: '내부결재'},
    {id: '2', docNo: 'X-2', title: '2026년 참여기구 워크숍 운영계획', form: '일반기안문', binder: '유스 거버넌스 운영', open: '공개', urgent: '일반문서', sec: '일반문서', docKind: '내부결재'},
    {id: '3', docNo: 'X-3', title: '2026년 AX 챌린저 시험교육 참가계획', form: '일반기안문', binder: '직원교육', open: '공개', urgent: '일반문서', sec: '일반문서', docKind: '내부결재'},
    {id: '4', docNo: 'X-4', title: '접수받은 문서', form: '-', binder: '접수문서(외부)'},
  ];
  const m = buildPatternModel(docs);
  assert.equal(m.entries.length, 3); // 접수문서는 본인 생산 패턴이 아니므로 제외
  assert.equal(predictDraftMeta(m, {title: '아무 제목', sourceDocNo: 'X-1'}).binder, 'ESG 경영');
  assert.equal(predictDraftMeta(m, {title: '2026년『소셜리빙랩 시험』 발대식 예산 지급 건의'}).binder, 'ESG 경영');
  assert.equal(predictDraftMeta(m, {title: '2026년 완전히 새로운 사업 참가계획'}).binder, '직원교육');
  const d = predictDraftMeta(m, {title: '2026년 완전히 새로운 사업 운영계획'});
  assert.equal(d.confidence, 'default');
  assert.equal(d.docKind, '내부결재');
  assert.deepEqual(patternTokens('2026년『소셜리빙랩 시험』 운영계획'), ['소셜리빙랩', '시험']);
});
test('org pattern: plan skeleton reuses the labels and reference line of the closest past plan', () => {
  const m = buildPatternModel([{id: '1', docNo: 'X-1', title: '2026년『시험 사업』 운영계획', form: '일반기안문', binder: 'ESG 경영', date: '2026-10-22', body: PLAN_BODY}]);
  const s = buildPlanSkeleton(m, {title: '2026년『시험 사업 2차』 운영계획'});
  assert.equal(s.lines[0], '1. 가나부-1613(2026. 3. 4.)호와 관련입니다.');
  assert.equal(s.lines[1], '2. 2026년『시험 사업 2차』를 다음과 같이 운영하고자 합니다.');
  assert.equal(s.lines[2], '  가. 사 업 명: ');
  assert.equal(s.lines[s.lines.length - 1], '붙임  운영계획서 1부.  끝.');
});

test('payment pattern: money in korean, proposal body from a past proposal, pending expense docs', () => {
  assert.equal(moneyKo(200000), '금200,000원(금이십만원)');
  assert.equal(moneyKo(1300000), '금1,300,000원(금일백삼십만원)');
  assert.equal(moneyKo(463000), '금463,000원(금사십육만삼천원)');
  assert.equal(moneyKo(150000), '금150,000원(금일십오만원)');
  assert.equal(moneyKo(60000), '금60,000원(금육만원)');
  assert.equal(moneyKo(10000), '금10,000원(금일만원)');
  assert.equal(moneyKo(1234567), '금1,234,567원(금일백이십삼만사천오백육십칠원)');
  const base = ['1. 가나부-1(2026. 3. 4.)호와 관련입니다.', '2. 2026년 옛사업 회의비 지급을 다음과 같이 건의합니다.', '  가. 지급예정금액: 금900,000원(금구십만원)', '  나. 지급계획', '', '  다. 결제방법: 카드결제', '  라. 예산과목: 정책)가 단위)나 세부)다 편성목)경비 통계목)회의비 부기)다 회의비(자).  끝.'].join('\r\n');
  const b = buildPaymentProposalBody(base, {ref: '가나부-9(2026. 10. 3.)', title: '2026년 새사업 회의비 지급 건의', amount: 450000});
  assert.equal(b.lines[0], '1. 가나부-9(2026. 10. 3.)호와 관련입니다.');
  assert.equal(b.lines[1], '2. 2026년 새사업 회의비 지급을 다음과 같이 건의합니다.');
  assert.equal(b.lines[2], '  가. 지급예정금액: 금450,000원(금사십오만원)');
  assert.equal(b.lines[b.lines.length - 1], base.split('\r\n').pop());
  const docs = [
    {id: '1', docNo: 'A-1', title: '2026년 갑 회의비 지급 건의', form: '일반기안문', binder: 'X', date: '2026-03-01'},
    {id: '2', docNo: 'A-2', title: '2026년 을 회의비 지급 건의', form: '일반기안문', binder: 'X', date: '2026-04-01'},
    {id: '3', docNo: 'A-3', title: '2026년 갑 회의비 지급', form: '지출결의서(기안포함)(A10)', binder: 'X', refs: ['A-1(2026. 3. 1., "2026년 갑 회의비 지급 건의")']},
    {id: '4', docNo: 'A-4', title: '2026년 병 현수막 제작', form: '물품매입(수리제조)품의 및 요구서', binder: 'X', date: '2026-05-01'},
  ];
  const p = pendingPayments(docs);
  assert.deepEqual(p.map(x => x.docNo), ['A-4', 'A-2']);
  assert.equal(p[0].expenseTitle, '2026년 병 현수막 제작비 지급');
  assert.equal(p[0].expenseForm, '지출결의서(기안미포함)(A10)');
  assert.equal(p[1].expenseTitle, '2026년 을 회의비 지급');
});

test('governance: audit hash chain detects tampering, policy normalization, retention, versions', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  let list = [];
  for (let i = 0; i < 4; i++) list = [chainAudit(list, {id: 'a' + i, at: i, command: 'c', type: '기안', target: 't', summary: 's' + i, steps: ['x'], verified: true}), ...list];
  assert.equal(verifyAudit(list).ok, true);
  const tam = JSON.parse(JSON.stringify(list)); tam[2].summary = '바꿈';
  assert.equal(verifyAudit(tam).ok, false);
  const cut = list.filter((_, i) => i !== 1);
  assert.equal(verifyAudit(cut).ok, false);
  assert.equal(verifyAudit(list.slice(0, 3)).ok, true);
  const pol = normalizePolicy({enabled: true, features: {recorder: false, bogus: false}, retentionDays: 9999, recorderPlayConfirm: false});
  assert.equal(pol.features.recorder, false); assert.equal(pol.features.draftPay, true); assert.equal(pol.retentionDays, 365); assert.equal(pol.recorderPlayConfirm, true);
  assert.equal(featureAllowed({enabled: false}, 'briefing'), false); assert.equal(featureAllowed(null, 'recorder'), true);
  const now = 100 * 86400000;
  const r = purgeExpired({v: 1, at: now, docs: {a: {learnedAt: now - 95 * 86400000}, b: {learnedAt: now - 10 * 86400000}, c: {}}}, now, 90);
  assert.deepEqual(Object.keys(r.patterns.docs).sort(), ['b', 'c']); assert.equal(r.removed, 1);
  assert.equal(compareVersions('4.10.0', '4.9.0'), 1); assert.equal(compareVersions('4.9.0', '4.9'), 0);
  assert.ok(!/a@b|1234-5678|202030/.test(maskSensitive('a@b.com 010-1234-5678 empSeq: 202030')));
});

test('team calendar: classify leave/trip/overtime and check leave-work fingerprint against requested end', () => {
  const now = new Date('2026-11-09T09:00:00+09:00');
  const row = o => ({name: '가나', dept: '전략경영실', date: '20261105', item: '연장근무', appStart: '1800', appEnd: '2100', come: '', leave: '2102', ...o});
  assert.equal(classifyTeamRow(row(), now).state, 'ok');                       // 출근 지문 없어도 퇴근만 보면 정상
  assert.equal(classifyTeamRow(row({leave: '2043'}), now).state, 'short');
  assert.match(classifyTeamRow(row({leave: '2043'}), now).detail, /17분 일찍/);
  assert.equal(classifyTeamRow(row({leave: ''}), now).state, 'miss');
  assert.equal(classifyTeamRow(row({date: '20261110'}), now).state, 'wait');
  assert.equal(classifyTeamRow(row({item: '관내출장'}), now).kind, 'trip');
  assert.equal(classifyTeamRow(row({item: '사외교육'}), now).kind, 'trip');
  assert.equal(classifyTeamRow(row({item: '오후반차'}), now).kind, 'leave');
  assert.equal(classifyTeamRow(row({item: '외출'}), now), null);                // 외출·조퇴는 표시하지 않음
  assert.equal(classifyTeamRow(row({item: '조기근무', appStart: '0700', appEnd: '0900', come: '', leave: '1805'}), now).state, 'ok'); // 출근 지문 없이도 퇴근만 본다
  assert.equal(classifyTeamRow(row({item: '조기근무', appStart: '0700', appEnd: '0900', come: '', leave: ''}), now).state, 'miss');
  const cal = buildTeamCalendar([row({leave: '2000', mine: true}), row({name: '다라', item: '연차', date: '20261105'}), row({name: '남', leave: '', mine: false})], now);
  assert.equal(cal.problems.length, 1); assert.equal(cal.byDate['20261105'].length, 2); // 다른 직원의 시간외는 제외 assert.equal(cal.byDate['20261105'][0].mine, true);
});

test('review fixes: midnight overtime, combined items, amount safety, docNo priority, spaced refs', () => {
  const now = new Date('2026-11-09T20:00:00+09:00');
  const row = o => ({date: '20261108', name: '가나', dept: 'X', item: '연장근무', appStart: '2200', appEnd: '0200', come: '', leave: '2300', ...o});
  assert.equal(classifyTeamRow(row(), now).state, 'short');                               // 자정 넘김: 02:00 전에 퇴근
  assert.equal(classifyTeamRow(row({date: '20261109', leave: ''}), now).state, 'wait');    // 아직 끝나지 않음
  assert.equal(classifyTeamRow(row({appEnd: '2400', leave: '0010'}), now).state, 'ok');
  assert.notEqual(classifyTeamRow(row({appEnd: ''}), now).state, 'ok');                    // 종료 시각 없으면 정상으로 보지 않음
  const c = buildTeamCalendar([row({mine: true, item: '오후반차(보상), 연장근무', appStart: '1800', appEnd: '2100', leave: ''})], now);
  assert.deepEqual(c.byDate['20261108'].map(z => z.kind).sort(), ['leave', 'ot']);
  assert.equal(c.problems.length, 1);
  const base = '1. a호와 관련입니다.\r\n2. x\r\n  가. 지급예정금액 : 금900,000원(금구십만원)\r\n  나. 지급계획';
  assert.match(buildPaymentProposalBody(base, {amount: 450000}).text, /금450,000원/);
  assert.equal(buildPaymentProposalBody(base, {amount: 0}), null);
  assert.equal(buildPaymentProposalBody('  가. 결제방법: 카드', {amount: 1000}), null);
  const m = buildPatternModel([{docNo: 'A-1', title: '동명', binder: '오답철'}, {docNo: 'A-2', title: '동명', binder: '정답철'}]);
  assert.equal(predictDraftMeta(m, {sourceDocNo: 'A-2', sourceTitle: '동명'}).binder, '정답철');
  assert.equal(pendingPayments([{docNo: 'A-1', title: '회의비 지급 건의', form: '일반기안문', binder: 'X'}, {binder: 'X', form: '지출결의서(기안포함)', refs: ['A-1 (2026. 11. 8.)']}]).length, 0);
  assert.equal(attendanceAnomalies([{date: '20261108', result: '미출근', come: '', leave: '1800', holiday: false}], {now}).length, 0);
});

test('payment entry check: cards/transfers vs planned amount, duplicates, bad input', () => {
  const now = new Date('2026-11-09T10:00:00+09:00');
  const card = {date: '20261105', merchant: 'A마트', amount: '120,000', approval: '123456'};
  const ok = checkPaymentEntry({cards: [card], transfers: [{payee: '홍길동', bank: '국민', account: '123-4567-8901', amount: '80000', date: '20261106'}]}, 200000, now);
  assert.equal(ok.ok, true); assert.equal(ok.total, 200000); assert.equal(ok.diff, 0);
  const over = checkPaymentEntry({cards: [{...card, amount: '300000'}]}, 200000, now);
  assert.equal(over.ok, false); assert.match(over.errors.join(' '), /초과 집행/);
  const less = checkPaymentEntry({cards: [card]}, 200000, now);
  assert.equal(less.ok, true); assert.match(less.warns.join(' '), /잔액/);
  assert.equal(checkPaymentEntry({}, 1000, now).ok, false);
  assert.match(checkPaymentEntry({cards: [{...card, date: '20261201'}]}, 0, now).errors.join(' '), /오늘 이후/);
  assert.match(checkPaymentEntry({cards: [card, card]}, 999999, now).errors.join(' '), /중복/);
  assert.equal(maskAccount('123-4567-8901'), '*******8901');
});

test('ai helpers: key format and context excludes mail bodies, clips long text', () => {
  assert.equal(isGeminiKey('AIzaSyD-abcdefghijklmnopqrstuvwxyz012345'), true);
  assert.equal(isGeminiKey('AQ.Ab8RN6Jabcdefghijklmnopqrstuvwxyz0123456789'), true); assert.equal(isGeminiKey('AQ.short'), false); assert.equal(isGeminiKey('sk-abc'), false); assert.equal(isGeminiKey(''), false);
  const ctx = buildAiContext({name: '서원하', mine: [{state: '급함', title: 'x'.repeat(200), headline: '답장 필요', deadline: '11/09 16:00'}], todayAway: [{name: '김', label: '연차'}], now: new Date('2026-11-09T10:00:00+09:00')});
  assert.match(ctx, /2026-11-09 10:00/); assert.match(ctx, /김\(연차\)/); assert.ok(ctx.split('\n').every(l => l.length < 220));
});

test('expandPlanned: future-only day rows, weekends skipped in ranges, own overtime kept, duplicates removed', () => {
  const apps = [
    {empCd: '1', korNm: '가', deptNm: '전략경영실', atNm: '연차', startDt: '20261112', endDt: '20261117', approState: '1', appDt: 'a', appSq: '1'},
    {empCd: '1', korNm: '가', deptNm: '전략경영실', atNm: '연차', startDt: '20261112', endDt: '20261117', approState: '1', appDt: 'a', appSq: '1'},
    {empCd: '2', korNm: '나', deptNm: '전략경영실', atNm: '관내출장', startDt: '20261108', endDt: '20261108', approState: '0', appDt: 'b', appSq: '2'},
    {empCd: '9', korNm: '나', deptNm: '전략경영실', atNm: '연장근무', startDt: '20261110', endDt: '20261110', startTm: '1800', endTm: '2100', approState: '1', appDt: 'c', appSq: '3'},
  ];
  const rows = expandPlanned(apps, {fromYmd: '20261101', toYmd: '20261130', todayYmd: '20261109', meCd: '9'});
  assert.deepEqual(rows.filter(r => r.item === '연차').map(r => r.date), ['20261112', '20261113', '20261116', '20261117']); // 토·일 제외, 중복 제거
  assert.equal(rows.some(r => r.item === '관내출장'), false); // 어제까지는 지문 기반 자료 사용                                                                 // 오늘 이전은 지문 기반 자료 사용
  assert.equal(rows.find(r => r.item === '연장근무').mine, true);
  const cal = buildTeamCalendar(rows, new Date('2026-11-09T10:00:00+09:00'));
  assert.equal(cal.byDate['20261112'].length, 1); assert.equal(cal.byDate['20261110'][0].state, 'wait');
});

test('resource booking helpers: free slots, multi-day spans, validation', () => {
  const day = '20261116';
  const bk = [{start: '202611161300', end: '202611161800'}, {start: '202611160900', end: '202611161030'}, {start: '202611150900', end: '202611160800'}];
  assert.deepEqual(freeSlots(bk, day).map(s => s.start + '-' + s.end), ['10:30-13:00']);
  assert.deepEqual(freeSlots([], day).map(s => s.start + '-' + s.end), ['09:00-18:00']);
  assert.deepEqual(bookingSpanOnDay({start: '202611151000', end: '202611171000'}, day), [0, 1440]);
  assert.equal(bookingSpanOnDay({start: '202611171000', end: '202611171100'}, day), null);
  const now = new Date('2026-11-09T10:00:00+09:00');
  assert.equal(validateBooking({title: '', date: '2026-11-10', start: '09:00', end: '10:00', now}).ok, false);
  assert.equal(validateBooking({title: 'a', date: '2026-11-09', start: '09:00', end: '10:30', now}).ok, false);      // 과거
  assert.equal(validateBooking({title: 'a', date: '2026-11-10', start: '10:00', end: '09:00', now}).ok, false);
  const ok = validateBooking({title: '출장', date: '2026-11-10', start: '09:00', end: '12:00', now});
  assert.equal(ok.ok, true); assert.equal(ok.start12, '202611100900'); assert.equal(ok.end12, '202611101200');
  assert.equal(validateBooking({title: 'a', date: '2026-11-10', start: '09:00', end: '14:00', now, limitMin: 240}).ok, false);
  assert.equal(timeOptions({from: '09:00', to: '10:00', step: 30}).join(','), '09:00,09:30,10:00');
});

test('review v5.6 fixes: planned range clip, half-day keys, strict amounts, real dates, ai deadline object, null safety', () => {
  const nov = {fromYmd: '20261101', toYmd: '20261130', todayYmd: '20261109'};
  const am = {empCd: '1', korNm: '가', atNm: '오전반차', startDt: '20261110', endDt: '20261110', startTm: '0900', endTm: '1300', appDt: 'a', appSq: '1', approState: '1'};
  const pm = {...am, atNm: '오후반차', startTm: '1400', endTm: '1800'};
  assert.equal(expandPlanned([am, pm], nov).length, 2);
  assert.ok(expandPlanned([{empCd: '1', korNm: '가', atNm: '연차', startDt: '20260901', endDt: '20261231', appDt: 'b', appSq: '2', approState: '1'}], nov).length > 0);
  const trip = expandPlanned([{empCd: '1', korNm: '가', atNm: '관외출장', startDt: '20261113', endDt: '20261116', appDt: 'c', appSq: '3', approState: '1'}], nov);
  assert.deepEqual(trip.map(x => x.date), ['20261113', '20261114', '20261115', '20261116']);
  const now = new Date('2026-11-09T10:00:00+09:00');
  for (const amount of ['-100', '1e6', '1.5']) assert.equal(checkPaymentEntry({cards: [{merchant: 'A', approval: '1', date: '20261105', amount}]}, 0, now).ok, false);
  assert.equal(checkPaymentEntry({cards: [{merchant: 'A', amount: '100', date: '20260230'}]}, 0, now).ok, false);
  assert.equal(validateBooking({title: 'x', date: '2026-11-31', start: '10:00', end: '11:00', now}).ok, false);
  assert.equal(validateBooking({title: 'x', date: '2026-11-20', start: '25:00', end: '26:00', now}).ok, false);
  assert.match(buildAiContext({mine: [{deadline: {date: '2026-11-10', time: '16:00'}}]}), /2026-11-10 16:00/);
  assert.doesNotThrow(() => { expandPlanned([null]); bookingSpanOnDay(null, '20261109'); buildAiContext({mine: null}); buildTeamCalendar([{item: '연차', date: '20261109'}, {item: '연차', date: '20261109'}]); });
  assert.equal(classifyTeamRow({item: '시간외근무', mine: true, date: '20261110', appStart: '1800', appEnd: '2000'}, now).kind, 'ot');
});

test('home day helpers: timeline clipping, stalled submissions, wrap-up reminder', () => {
  const now = new Date('2026-11-09T17:40:00+09:00');
  const tl = buildDayTimeline([
    {start: '202611090700', end: '202611091000', label: '일찍 시작', kind: 'etc'},
    {start: '202611091300', end: '202611091800', label: '차량', kind: 'car'},
    {start: '202611091900', end: '202611092100', label: '저녁', kind: 'etc'},
    {start: '202611080900', end: '202611080930', label: '어제', kind: 'etc'},
    {start: '202611090000', end: '202611092359', label: '종일', kind: 'etc', allDay: true},
  ], '20261109', now);
  assert.deepEqual(tl.segs.map(s => [s.a, s.z]), [[480, 600], [780, 1080]]);
  assert.equal(tl.nowMin, 17 * 60 + 40); assert.equal(tl.allDay.length, 1);
  const docs = [{title: '가', status: '결재중(이승봉)', date: '2026-11-04 10:00:00'}, {title: '나', status: '결재완료(이은경)', date: '2026-10-01 10:00:00'}, {title: '다', status: '결재중(이은경)', date: '2026-11-09 08:00:00'}, {title: '라', status: '반려(이승봉)', date: '2026-10-20 10:00:00'}];
  const s = stalledSubmitted(docs, now);
  assert.equal(s.length, 1); assert.equal(s[0].who, '이승봉'); assert.equal(s[0].age, 5);
  const w = wrapUpModel({now, ownOtToday: {from: '18:00', to: '21:00'}});
  assert.equal(w.active, true); assert.match(w.otReminder, /18:00~21:00/);
  assert.equal(wrapUpModel({now: new Date('2026-11-09T10:00:00+09:00')}).active, false);
});

test('v0.30 usability: promo mail detection, command detection, palette/keyboard wiring in the bundle', async () => {
  const B = await import('../src/live/briefing.mjs');
  assert.equal(B.isNoiseMail({subject: '🅰️ 2027년도 AI와 함께할 미래, 아이폰 속에 힌트가 있다? 📱', fromEmail: 'edu@ablearn.kr'}), true);
  assert.equal(B.isNoiseMail({subject: '[11월] 교육 안내', fromEmail: 'news@example.com'}), true);
  assert.equal(B.isNoiseMail({subject: '(전략실)10월 시간외근무 확인 및 주당근무시간 작성 요청', fromEmail: 'lee@bwyf.or.kr'}), false);
  assert.equal(B.isNoiseMail({subject: '자료 제출 요청', fromEmail: 'info@bucheon.go.kr'}), false);
  assert.equal(B.looksLikeCommand('결과보고 작성해 줘'), true);
  assert.equal(B.looksLikeCommand('시간외근무'), false);
  assert.equal(B.looksLikeCommand('주간업무보고'), false);
  assert.equal(B.looksLikeCommand('운영계획 기안'), false);
  assert.equal(B.looksLikeCommand('결과보고서 작성'), false);
  assert.equal(B.looksLikeCommand('주당근무시간 보냈는지 확인해줘'), true);
  assert.equal(B.isNoiseMail({subject: '🔔 공지 사항', fromEmail: 'hr@bwyf.or.kr'}), false);
  assert.equal(B.isNoiseMail({subject: '[요청] 실적 제출', fromEmail: 'info@korea.kr'}), false);
  assert.equal(B.isNoiseMail({subject: '⚠ 마감 안내', fromEmail: 'kim@partner.com'}), false);
  const wc = (await Promise.all((await fs.readdir('src/live/wc')).filter(f => f.endsWith('.js')).map(f => fs.readFile(path.join('src/live/wc', f), 'utf8')))).join('\n');
  assert.match(wc, /const dispTitle = /, 'palette title helper must exist');
  assert.match(wc, /S\.paletteOpen && \$\('#palq'\)/, 'palette keys only when the palette input exists');
  assert.match(wc, /c === 'KeyE'/, 'E marks done');
  assert.doesNotMatch(wc, /2026-11-14/, 'no hard-coded dates in commands');
  assert.doesNotMatch(wc, /이하림 담당자|3번째 시트/, 'no fake sent-mail verification');
  assert.match(wc, /id: 'overview'/, 'overview view reachable');
});

test('v0.32 usability: mail view does not trigger reply compose', async () => {
  const wc = (await Promise.all((await fs.readdir('src/live/wc')).filter(f => f.endsWith('.js')).map(f => fs.readFile(path.join('src/live/wc', f), 'utf8')))).join('\n');
  const openItemSrc = wc.match(/(?:async\s+)?function\s+openItem[\s\S]*?\n  \}/)?.[0] || '';
  assert.ok(openItemSrc, 'openItem function must exist');
  assert.doesNotMatch(openItemSrc, /compose\('re'/, 'openItem must not open reply compose');
  const mailPaneSrc = wc.match(/function\s+mailPane[\s\S]*?\n  \}/)?.[0] || '';
  assert.ok(mailPaneSrc, 'mailPane function must exist');
  assert.doesNotMatch(mailPaneSrc, /url:\s*GW\.links\.compose\('re'/, 'mailPane URL must not be reply compose');
  assert.match(wc, /case 'mailOpenItem'/, 'mailOpenItem event handler must exist');
});


import {appInfoIndex, appInfoLine} from '../src/live/briefing.mjs';
test('attendance detail: time/place/reason shown for past trip rows via application index; ot reason appended', () => {
  const apps = [
    {empCd: '016005', korNm: '이예재', deptNm: '전략경영실', atNm: '관내출장', startDt: '20261106', endDt: '20261106', startTm: '1400', endTm: '1600', approState: '1', appDt: '20261105', appSq: '1', place: '부천시청', reason: '조직개편 관련 협의 등', depart: '재단', arrive: '부천시청'},
    {empCd: '016005', korNm: '이예재', deptNm: '전략경영실', atNm: '연차', startDt: '20261106', endDt: '20261106', startTm: '0000', endTm: '0000', approState: '0', appDt: '20261105', appSq: '2'},
    {empCd: '016025', korNm: '서원하', deptNm: '전략경영실', atNm: '연장근무', startDt: '20261106', endDt: '20261106', startTm: '1800', endTm: '2000', approState: '1', appDt: '20261105', appSq: '3', reason: '예산 마감'},
  ];
  const idx = appInfoIndex(apps);
  assert.equal(appInfoLine(idx['016005|20261106'][0]), '14:00~16:00 · 부천시청 · 조직개편 관련 협의 등');
  assert.equal(idx['016005|20261106'][1].time, ''); // 시간이 0000~0000이면 시간 없음
  assert.ok(appInfoLine(idx['016005|20261106'][1]).endsWith('(결재 중)'));
  assert.equal(idx['016005|20261106'][0].route, '재단 → 부천시청');
  const rows = [{emp: '016005', name: '이예재', dept: '전략경영실', date: '20261106', item: '관내출장'}, {emp: '016025', name: '서원하', dept: '전략경영실', date: '20261106', item: '연장근무', appStart: '1800', appEnd: '2000', leave: '2010', mine: true}];
  const cal = buildTeamCalendar(rows, new Date('2026-11-09T10:00:00+09:00'), idx);
  const trip = cal.byDate['20261106'].find(x => x.kind === 'trip'), ot = cal.byDate['20261106'].find(x => x.kind === 'ot');
  assert.equal(trip.place, '부천시청'); assert.equal(trip.time, '14:00~16:00'); assert.match(trip.detail, /조직개편/);
  assert.match(ot.detail, /사유 예산 마감/);
});