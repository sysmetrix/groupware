import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {analyze, nextState, renderHtml, renderMarkdown, toDataset, extractDeadline, extractAllDeadlines, attendanceAnomalies, recommendRouting, weeklyReport, toCsv} from '../src/live/briefing.mjs';
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
  for (const s of ['오늘 할 일', '전자결재·문서유통', '예산 집행', '제목에서 찾은 기한']) assert.ok(html.includes(s), s);
  const md = renderMarkdown(analyze(fixture(), null, NOW));
  assert.match(md, /결재·문서유통 처리 필요: \*\*2건\*\*/);
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
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/live-build.mjs', import.meta.url))], {stdio: 'pipe'});
  const bundle = await fs.readFile(new URL('../build/live/gw-live.js', import.meta.url), 'utf8');
  for (const s of ['window.BWYFGW =', 'window.BWYFGW_REPORT', 'window.BWYFGW_WC', 'recommendRouting']) assert.ok(bundle.includes(s), s);
  const mini = await fs.readFile(new URL('../build/live/bookmarklet-mini.txt', import.meta.url), 'utf8');
  assert.ok(mini.length < 2000, 'launch bookmark stays small');
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