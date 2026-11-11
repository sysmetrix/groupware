/*
 * GW 비서 둘러보기(데모) 수집기.
 *
 * 실제 수집기(collector.browser.js)와 같은 모양의 window.BWYFGW를 만들지만, 그룹웨어에는 한 번도 요청하지 않는다.
 * 모든 값은 오늘 날짜를 기준으로 만든 지어낸 자료다(기관·사람·문서·금액 모두 실재하지 않는다).
 * 로그인 없이 화면을 살펴보고, 디자인·사용성 점검과 화면 캡처에 쓴다. 빌드: npm run live:demo
 */
(() => {
  'use strict';
  const VERSION = '/*@DEMO_VERSION@*/';
  const ORIGIN = location.origin;
  const PANE = new URL('pane.html', location.href).href;

  // ---------- 날짜 도우미 (KST 기준) ----------
  const DAY = 86400000;
  const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600000);
  const ymd = (d = new Date()) => kst(d).toISOString().slice(0, 10).replace(/-/g, '');
  const dash = (d = new Date()) => kst(d).toISOString().slice(0, 10);
  const at = (offsetDays, hm = '09:00') => `${dash(new Date(Date.now() + offsetDays * DAY))} ${hm}:00`;
  const day = offsetDays => ymd(new Date(Date.now() + offsetDays * DAY));
  const md = offsetDays => { const p = dash(new Date(Date.now() + offsetDays * DAY)).split('-'); return `${+p[1]}.${+p[2]}.`; };
  const dow = offsetDays => kst(new Date(Date.now() + offsetDays * DAY)).getUTCDay();
  // 주말을 피해 가장 가까운 근무일 오프셋
  const workday = (offset, dir = 1) => { let o = offset; while ([0, 6].includes(dow(o))) o += dir; return o; };
  const wait = (ms = 120) => new Promise(r => setTimeout(r, ms + Math.random() * 80));
  const pane = (title, kind = '문서', extra = {}) => `${PANE}#${new URLSearchParams({title, kind, ...extra})}`;

  const ME = {empSeq: 'D1001', loginId: 'demo', erp: '26017', name: '김하늘', deptName: '청소년사업팀', compName: '한빛청소년재단', position: '대리', duty: '팀원'};
  const PEOPLE = [
    ['26003', '박서준', '경영지원팀'], ['26005', '이도윤', '경영지원팀'], ['26008', '최유나', '청소년사업팀'], ['26011', '정민재', '청소년사업팀'],
    ['26014', '한지우', '정책연구팀'], ['26019', '오세린', '정책연구팀'], ['26021', '윤태호', '시설운영팀'], ['26024', '서가은', '시설운영팀'], [ME.erp, ME.name, ME.deptName],
  ];

  // ---------- 화면 주소 (데모용 안내 화면으로 연결) ----------
  const ROUTES = {
    mail: '#/UD/UDA/UDA0000', approvalHome: '#/UC/UCA/UCA0000', approvalPage: page => `#/UC/UCA/UCA0000?pageCode=${page}`, notice: '#/UF/UFA/UFA0000',
    schedule: '#/UE/UEA/UEA0000', worktime: '#/HP/HPD0220/HPD0220', attendanceRequest: '#/HP/HPD0110/HPD0110', leave: '#/HP/HPD0550/HPD0550',
    budget: '#/HP/NPC2040/NCC0610', draft: '#/UC/UCA/UCA0000?pageCode=UCA7000', expenseEntry: '#/HP/NPC1030/NCA0020',
  };
  const ROUTE_NAMES = {UD: '메일', UC: '전자결재', UF: '게시판', UE: '일정', HPD0220: '근무시간', HPD0110: '근태신청', HPD0550: '연차 현황', NCC0610: '예산 집행 현황', NCA0020: '지출결의 입력'};
  const LINKS = {
    doc: (doc, kind = '') => pane(doc.title || '결재문서', {deptWaiting: '부서 접수', distWaiting: '배부', sendWaiting: '발송', pending: '결재'}[kind] || '결재문서', {no: doc.docNo || ''}),
    compose: (kind, mail) => pane(mail && mail.subject ? `${kind === 'fw' ? 'FW' : 'Re'}: ${mail.subject}` : '새 메일', {re: '답장 쓰기', reall: '전체 답장', fw: '전달', plain: '새 메일'}[kind] || '메일 쓰기'),
    draft: (formId, name = '') => pane(name || '새 기안', '새 기안'),
    article: a => pane(a.title || '게시글', '게시글'),
    file: () => pane('첨부파일', '파일 미리보기'),
    route: r => { const hit = Object.keys(ROUTE_NAMES).find(k => String(r).includes(k)); return pane(hit ? ROUTE_NAMES[hit] : '그룹웨어 화면', '그룹웨어 화면'); },
  };

  // ---------- 지어낸 자료 ----------
  let docSeq = 5000;
  const doc = (kind, title, extra = {}) => {
    const d = {kind, docId: String(++docSeq), tiKeyCode: 'F100', diSeqNum: '1', form: '일반기안문', title, status: '진행중', statusCode: '002', drafter: '', drafterDept: '', approver: '', sender: '', sendOrg: '', sendDept: '', sendDeptCode: '',
      docNo: `청소년사업팀-${docSeq - 3800}`, toDept: '', toEmp: '', date: at(-1, '10:20'), attachments: 0, comments: 0, unread: false, ...extra};
    d.url = LINKS.doc(d, kind);
    return d;
  };
  const list = (label, menu, docs, total = docs.length) => ({label, menu, total, fetched: docs.length, from: day(-92), to: day(0), docs, url: LINKS.route(ROUTES.approvalHome)});

  function approval() {
    const pending = [
      doc('pending', `「찾아가는 진로교실」 강사비 지급 품의`, {drafter: '최유나', drafterDept: '청소년사업팀', form: '지출품의서', date: at(workday(-4, -1), '14:10'), attachments: 2, status: '결재중', docNo: '청소년사업팀-1482'}),
      doc('pending', `청소년 동아리 연합 발표회 운영 계획(안)`, {drafter: '정민재', drafterDept: '청소년사업팀', date: at(workday(-1, -1), '16:40'), attachments: 1, comments: 1, status: '결재중', docNo: '청소년사업팀-1490'}),
      doc('pending', `시설 안전점검 결과 보고 (긴급 보수 필요)`, {drafter: '윤태호', drafterDept: '시설운영팀', date: at(0, '08:55'), attachments: 3, status: '결재중', docNo: '시설운영팀-0611'}),
    ];
    const deptWaiting = [
      doc('deptWaiting', `2026년 청소년 정책 참여기구 운영 실적 제출 요청 (${md(workday(3))}까지 회신)`, {sender: '경기도교육청', sendOrg: '경기도교육청', sendDept: '학생생활교육과', date: at(workday(-2, -1), '11:05'), attachments: 1, status: '접수대기', statusCode: '001', docNo: '학생생활교육과-20931'}),
      doc('deptWaiting', `지역 청소년 안전망 실무협의회 개최 알림`, {sender: '여성가족부', sendOrg: '여성가족부', sendDept: '청소년정책과', date: at(-1, '15:30'), status: '접수대기', statusCode: '001', docNo: '청소년정책과-8842'}),
    ];
    const distWaiting = [
      doc('distWaiting', `겨울방학 청소년 프로그램 공동 홍보 협조 요청`, {sender: '한빛시청', sendOrg: '한빛시청', sendDept: '교육청소년과', date: at(0, '09:40'), attachments: 2, status: '배부대기', statusCode: '001', docNo: '교육청소년과-15507'}),
    ];
    const sendWaiting = [
      doc('sendWaiting', `청소년 운영위원회 위촉 결과 알림`, {drafter: ME.name, drafterDept: ME.deptName, date: at(-1, '17:20'), status: '발송대기', statusCode: '001', docNo: '청소년사업팀-1487'}),
    ];
    const submitted = [
      doc('submitted', `11월 청소년 자치활동 지원금 교부 신청`, {drafter: ME.name, drafterDept: ME.deptName, status: '결재중(팀장)', statusCode: '002', date: at(workday(-5, -1), '10:00'), form: '일반기안문', tiKeyCode: 'F100', docNo: '청소년사업팀-1471'}),
      doc('submitted', `관내 출장 신청 (한빛중학교 진로교실)`, {drafter: ME.name, drafterDept: ME.deptName, status: '결재중(팀장)', statusCode: '002', date: at(-1, '09:15'), form: '출장신청서', tiKeyCode: '40'}),
      doc('submitted', `진로체험 물품 구입 지출결의`, {drafter: ME.name, drafterDept: ME.deptName, status: '반려(사무국장)', statusCode: '007', date: at(workday(-3, -1), '13:30'), form: '지출결의서', tiKeyCode: '1007', comments: 1, docNo: '청소년사업팀-1476'}),
      doc('submitted', `10월 사업 추진 실적 보고`, {drafter: ME.name, drafterDept: ME.deptName, status: '결재완료(대표이사)', statusCode: '008', date: at(-8, '11:00'), docNo: '청소년사업팀-1455'}),
      doc('submitted', `청소년 참여예산 설명회 결과 보고`, {drafter: ME.name, drafterDept: ME.deptName, status: '결재완료(사무국장)', statusCode: '008', date: at(-12, '15:00'), docNo: '청소년사업팀-1441'}),
      doc('submitted', `연가 신청`, {drafter: ME.name, drafterDept: ME.deptName, status: '결재완료(팀장)', statusCode: '008', date: at(-15, '09:00'), form: '휴가신청서', tiKeyCode: '36'}),
    ];
    const viewing = [
      doc('viewing', `2027년도 예산 편성 지침 알림`, {drafter: '박서준', drafterDept: '경영지원팀', unread: true, date: at(-1, '13:00'), attachments: 1, docNo: '경영지원팀-0920', status: '결재완료'}),
      doc('viewing', `개인정보 보호 교육 이수 안내 (${md(workday(6))}까지)`, {drafter: '이도윤', drafterDept: '경영지원팀', unread: true, date: at(-2, '10:00'), docNo: '경영지원팀-0915', status: '결재완료'}),
      doc('viewing', `직원 건강검진 실시 계획`, {drafter: '이도윤', drafterDept: '경영지원팀', unread: false, date: at(-6, '10:00'), docNo: '경영지원팀-0902', status: '결재완료'}),
    ];
    return {
      url: LINKS.route(ROUTES.approvalHome),
      counts: [['11000200', '임시보관문서', 2], ['11000300', '상신문서', 3], ['11000400', '반려/회수문서', 1], ['11000500', '열람문서', 2, 38], ['11000700', '대기문서', pending.length], ['11000900', '완료문서', 0],
        ['11001700', '발송대기문서', sendWaiting.length], ['11002300', '부서대기문서', deptWaiting.length], ['11002700', '배부대기문서', distWaiting.length]].map(([menu, name, count, total = null]) => ({menu, name, count, total})),
      lists: {
        pending: list('결재 대기', '11000700', pending), deptWaiting: list('부서 접수 대기', '11002300', deptWaiting), distWaiting: list('배부 대기', '11002700', distWaiting),
        sendWaiting: list('발송 대기', '11001700', sendWaiting), submitted: list('내 상신문서', '11000300', submitted, 41), viewing: list('열람문서', '11000500', viewing, 38),
      },
    };
  }

  function mail() {
    let uid = 900;
    const m = (subject, from, when, extra = {}) => ({uid: String(++uid), box: 'INBOX', subject, from, fromEmail: 'sample@example.org', date: when, shortDate: when.slice(5, 16), seen: true, flagged: false, answered: false, forwarded: false, attach: false, size: 18000, preview: '', ...extra});
    const records = [
      m(`[요청] 청소년 프로그램 만족도 조사 결과 제출 (~${md(workday(1))})`, '한지우', at(0, '09:12'), {seen: false, attach: true, preview: `안녕하세요. 정책연구팀 한지우입니다. 하반기 프로그램 만족도 조사 결과를 ${md(workday(1))}까지 첨부 양식에 맞춰 보내 주시기 바랍니다.`}),
      m(`진로교실 강사 섭외 관련 회신 부탁드립니다`, '한빛중학교 이선생', at(0, '08:40'), {seen: false, preview: '11월 셋째 주 진로교실 일정과 강사 섭외 여부를 알려 주시면 학사 일정에 반영하겠습니다.'}),
      m(`운영위원회 회의 자료 검토 요청 (${md(workday(2))} 기한)`, '오세린', at(-1, '17:25'), {attach: true, preview: `첨부한 회의 자료 초안을 검토하시고 의견을 ${md(workday(2))}까지 주시기 바랍니다.`}),
      m(`Re: 동아리 연합 발표회 대관 가능 여부`, '윤태호', at(-1, '14:02'), {seen: false, preview: '문의하신 날짜에 다목적홀 대관 가능합니다. 음향 장비는 별도 신청이 필요합니다.'}),
      m(`[안내] 11월 직원 정기교육 일정`, '이도윤', at(-1, '10:30'), {preview: '이번 달 정기교육은 셋째 주 목요일 15시에 진행합니다.'}),
      m(`청소년 참여예산 제안서 양식 송부`, '한빛시청 교육청소년과', at(-2, '16:15'), {attach: true, answered: true, preview: '요청하신 제안서 양식을 보내드립니다.'}),
      m(`[한빛소식] 11월 둘째 주 뉴스레터`, '한빛시 소식지', at(-2, '08:00'), {seen: false, preview: '이번 주 주요 소식을 전해드립니다.'}),
      m(`출장 여비 정산 서류 보완 요청`, '박서준', at(-3, '11:45'), {flagged: true, preview: '지난달 관외 출장 영수증 원본이 누락되었습니다. 이번 주 안에 제출 부탁드립니다.'}),
      m(`겨울 캠프 숙소 견적서`, '새봄여행사', at(-4, '13:20'), {attach: true, answered: true, preview: '요청하신 2박 3일 견적서를 첨부합니다.'}),
      m(`FW: 청소년 활동 안전 매뉴얼 개정판`, '정민재', at(-5, '09:50'), {attach: true, forwarded: false, preview: '개정된 안전 매뉴얼을 공유드립니다.'}),
    ];
    const unseen = records.filter(r => !r.seen).length;
    return {
      boxes: [{seq: 571, name: 'INBOX', total: 248, unseen}, {seq: 572, name: 'SENT', total: 131, unseen: 0}, {seq: 573, name: 'DRAFTS', total: 2, unseen: 0}, {seq: 580, name: '외부기관', total: 44, unseen: 1}],
      inbox: {total: 248, unseen, fetched: records.length, records},
      otherUnseen: [{...m('2026 청소년 정책 포럼 초청장', '청소년정책연구원', at(-1, '11:00'), {seen: false, attach: true}), box: '외부기관'}],
      url: LINKS.route(ROUTES.mail),
    };
  }

  function notice() {
    let id = 300;
    const a = (title, writer, dept, when, extra = {}) => { const art = {id: String(++id), cat: '223', catType: 'L', catTitle: '공지사항', title, writer, dept, date: when, read: true, top: false, files: 0, mine: false, reserved: false, reserveStart: '', ...extra}; art.url = LINKS.article(art); return art; };
    const articles = [
      a(`[필독] 연말정산 간소화 자료 제출 안내 (~${md(workday(8))})`, '박서준', '경영지원팀', at(-1, '09:00'), {read: false, top: true, files: 2}),
      a(`11월 구내식당 식단표`, '서가은', '시설운영팀', at(-1, '08:30'), {read: false, files: 1}),
      a(`직원 독감 예방접종 신청 (${md(workday(4))} 마감)`, '이도윤', '경영지원팀', at(-2, '14:00'), {read: false}),
      a(`주차장 도색 공사에 따른 이용 제한 안내`, '윤태호', '시설운영팀', at(-3, '10:00')),
      a(`2026년 하반기 우수 직원 추천`, '이도윤', '경영지원팀', at(-5, '11:00'), {files: 1}),
      a(`청소년 동아리 연합 발표회 자원봉사자 모집`, ME.name, ME.deptName, at(-6, '15:00'), {mine: true}),
    ];
    return {board: '223', total: 412, unread: articles.filter(x => !x.read).length, fetched: articles.length, articles, url: LINKS.route(ROUTES.notice)};
  }

  function schedule() {
    const ev = (title, off, s, e, extra = {}) => ({id: String(700 + Math.abs(off) * 7 + title.length), title, calendar: '개인', start: day(off) + s.replace(':', ''), end: day(off) + e.replace(':', ''), allDay: false, place: '', people: ME.name, ...extra});
    const events = [
      ev('주간 팀 회의', 0, '10:00', '11:00', {calendar: '청소년사업팀', place: '2층 회의실'}),
      ev('진로교실 강사 사전 협의', 0, '14:00', '15:00', {place: '상담실 1'}),
      ev('운영위원회 자료 마감', 0, '17:00', '17:30'),
      ev('한빛중학교 진로교실 (관내 출장)', workday(1), '13:00', '17:00', {place: '한빛중학교'}),
      ev('청소년 운영위원회 정기회의', workday(2), '16:00', '18:00', {calendar: '청소년사업팀', place: '다목적홀'}),
      ev('동아리 연합 발표회 리허설', workday(4), '15:00', '18:00', {place: '다목적홀'}),
      ev('직원 정기교육', workday(7), '15:00', '17:00', {calendar: '전체', place: '대강당'}),
      ev('겨울 캠프 사전답사', workday(9), '09:00', '18:00', {allDay: true, place: '강원 평창'}),
    ].sort((p, q) => p.start.localeCompare(q.start));
    return {start: day(0), end: day(14), calendars: [{seq: '1', type: 'E', title: '개인', writable: true}, {seq: '2', type: 'T', title: '청소년사업팀', writable: true}, {seq: '3', type: 'C', title: '전체', writable: false}], events, holidays: [], url: LINKS.route(ROUTES.schedule)};
  }

  // 이번 달 근무일마다 정상 출퇴근, 며칠은 휴가·출장·확인 필요로 만든다.
  function attendanceRows(from, to) {
    const rows = [];
    const f = new Date(Date.UTC(+from.slice(0, 4), +from.slice(4, 6) - 1, +from.slice(6, 8)));
    const t = new Date(Date.UTC(+to.slice(0, 4), +to.slice(4, 6) - 1, +to.slice(6, 8)));
    const today = day(0);
    const odd = {[day(workday(-6, -1))]: 'leave', [day(workday(-3, -1))]: 'late', [day(workday(-9, -1))]: 'trip', [day(workday(-2, -1))]: 'absent'};
    for (let d = f; d <= t; d = new Date(d.getTime() + DAY)) {
      const date = d.toISOString().slice(0, 10).replace(/-/g, ''), wd = d.getUTCDay();
      if (date > today) break;
      const holiday = wd === 0 || wd === 6;
      const base = {date, weekday: wd, workType: '주간근무', result: holiday ? '휴일' : '정상', item: '', status: '확정', come: holiday ? '' : '0852', leave: holiday ? '' : (date === today ? '' : '1806'), recognizedMin: holiday ? 0 : (date === today ? null : 480), holiday, applied: false, lateMin: 0, earlyLeaveMin: 0};
      const kind = odd[date];
      if (kind === 'leave') Object.assign(base, {result: '휴가', item: '연차', come: '', leave: '', recognizedMin: 480, applied: true});
      if (kind === 'trip') Object.assign(base, {result: '정상', item: '관내출장', applied: true});
      if (kind === 'late') Object.assign(base, {result: '지각', come: '0917', lateMin: 17, recognizedMin: 463});
      if (kind === 'absent') Object.assign(base, {result: '결근', come: '', leave: '', recognizedMin: 0, status: '대기'});
      rows.push(base);
    }
    return rows;
  }
  function attendance() {
    const from = day(0).slice(0, 6) + '01', to = day(0).slice(0, 6) + String(new Date(Date.UTC(+day(0).slice(0, 4), +day(0).slice(4, 6), 0)).getUTCDate()).padStart(2, '0');
    const days = attendanceRows(from, day(0));
    const rec = days.reduce((s, r) => s + (r.recognizedMin || 0), 0);
    return {today: {date: day(0), come: '0852', leave: '', error: ''}, month: {from, to, recognizedMin: rec, basicMin: rec - 180, overtimeMin: 180, exceptMin: 0, nightMin: 0, error: ''}, days, daysError: '', url: LINKS.route(ROUTES.worktime), requestUrl: LINKS.route(ROUTES.attendanceRequest)};
  }
  function leave() {
    const use = (off, kind, days, approved = true, st = '', et = '') => ({start: day(off), end: day(off), startTime: st, endTime: et, kind, days, title: kind, approved, applied: day(off - 7)});
    const history = [use(workday(5), '연차', 1), use(workday(11), '오후반차', 0.5, false, '1400', '1800'), use(workday(-6, -1), '연차', 1), use(-24, '오전반차', 0.5, true, '0900', '1300'), use(-41, '연차', 1), use(-66, '대체휴가', 1), use(-93, '연차', 2)];
    return {year: day(0).slice(0, 4), granted: 17, used: 10.5, remaining: 6.5, breakdown: {basic: 15, add: 1, reward: 1, change: 0, etc: 0, usedBasic: 9.5, usedReward: 1, usedChange: 0, inApproval: 0.5},
      upcoming: history.filter(u => u.end >= day(0)).sort((p, q) => p.start.localeCompare(q.start)), usedCount: history.length, history: [...history].sort((p, q) => q.start.localeCompare(p.start)), url: LINKS.route(ROUTES.leave)};
  }

  const BUDGETS = {
    Y101: {name: '청소년 자치활동 지원', rows: [['사11', '사업비', '관', '사11|', 86000000, 61240000], ['사111', '자치활동 운영', '항', '사11|사111|', 52000000, 39870000], ['사1111110', '강사수당', '세목', '사11|사111|사1111110|', 18000000, 14400000], ['사1111120', '행사운영비', '세목', '사11|사111|사1111120|', 22000000, 17950000], ['사1111130', '홍보물 제작', '세목', '사11|사111|사1111130|', 12000000, 7520000], ['사112', '진로체험 지원', '항', '사11|사112|', 34000000, 21370000], ['사1121110', '체험 재료비', '세목', '사11|사112|사1121110|', 20000000, 15120000], ['사1121120', '국내여비', '세목', '사11|사112|사1121120|', 14000000, 6250000]]},
    Y102: {name: '청소년 참여기구 운영', rows: [['사21', '사업비', '관', '사21|', 41000000, 22530000], ['사211', '운영위원회', '항', '사21|사211|', 23000000, 15630000], ['사2111110', '회의비', '세목', '사21|사211|사2111110|', 9000000, 7310000], ['사2111120', '활동 지원비', '세목', '사21|사211|사2111120|', 14000000, 8320000], ['사212', '참여예산', '항', '사21|사212|', 18000000, 6900000], ['사2121110', '제안사업비', '세목', '사21|사212|사2121110|', 18000000, 6900000]]},
    Y201: {name: '시설 운영·관리', rows: [['운11', '운영비', '관', '운11|', 120000000, 96400000], ['운111', '시설 유지', '항', '운11|운111|', 120000000, 96400000], ['운1111110', '수선유지비', '세목', '운11|운111|운1111110|', 70000000, 61200000], ['운1111120', '공공요금', '세목', '운11|운111|운1111120|', 50000000, 35200000]]},
  };
  const bRow = ([code, name, level, path, budget, executed]) => ({code, name, level, path, budget, executed, balance: budget - executed, rate: +(executed / budget * 100).toFixed(3)});
  function budgetTable(t, opt = {}) {
    const b = BUDGETS[t.project] || BUDGETS.Y101;
    const all = b.rows.map(bRow);
    const rows = t.filter ? all.filter(r => r.path.split('|').includes(t.filter)) : all;
    const top = all.filter(r => r.level === '관');
    const budget = top.reduce((s, r) => s + r.budget, 0), executed = top.reduce((s, r) => s + r.executed, 0);
    const year = Number(opt.year || t.year || day(0).slice(0, 4));
    return {project: t.project, label: t.label || b.name, filter: t.filter || '', year, gisu: String(year - 2014), period: '누계', total: {code: t.project, name: '합계', level: '계', path: '', budget, executed, balance: budget - executed, rate: +(executed / budget * 100).toFixed(3)}, rows, rowCount: all.length};
  }
  const DEFAULTS = {
    modules: ['mail', 'approval', 'notice', 'schedule', 'attendance', 'leave', 'budget', 'alerts'], mailCount: 100, days: 14, approvalDays: 92, approvalPageSize: 30, noticeCount: 20, noticeBoard: '223', alertCount: 20,
    budget: [{project: 'Y101', label: '청소년 자치활동 지원', filter: '사111'}],
  };

  async function collect(options = {}) {
    const opt = {...DEFAULTS, ...options};
    const started = performance.now();
    await wait(260);
    const targets = (Array.isArray(opt.budget) ? opt.budget : []).filter(t => t && t.project);
    const data = {
      mail: mail(), approval: approval(), notice: notice(), schedule: schedule(), attendance: attendance(), leave: leave(),
      budget: {projects: targets.map(t => { const p = budgetTable(BUDGETS[t.project] ? t : DEFAULTS.budget[0]); return t.filter ? p : {...p, rows: p.rows.filter(r => ['관', '항'].includes(r.level))}; }), skipped: !targets.length || undefined, url: LINKS.route(ROUTES.budget)},
      alerts: {alerts: [
        {type: 'EAPPROVAL', subType: 'EA101', head: '결재 요청', title: '시설 안전점검 결과 보고 (긴급 보수 필요)', docNo: '시설운영팀-0611', who: '윤태호', dept: '시설운영팀', time: at(0, '08:55'), read: false, url: ''},
        {type: 'MAIL', subType: 'MA001', head: '새 메일', title: '[요청] 청소년 프로그램 만족도 조사 결과 제출', docNo: '', who: '한지우', dept: '정책연구팀', time: at(0, '09:12'), read: false, url: ''},
        {type: 'BOARD', subType: 'BO001', head: '새 공지', title: '[필독] 연말정산 간소화 자료 제출 안내', docNo: '', who: '박서준', dept: '경영지원팀', time: at(-1, '09:00'), read: true, url: ''},
      ]},
    };
    const status = Object.fromEntries(Object.keys(data).map((k, i) => [k, {ok: true, ms: 40 + i * 17}]));
    return {schemaVersion: 1, collector: VERSION, origin: ORIGIN, collectedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started), sessionExpired: false,
      principal: {empSeq: ME.empSeq, loginId: ME.loginId, name: ME.name, deptSeq: 'D10', deptName: ME.deptName, compSeq: 'C1', compName: ME.compName, position: ME.position, duty: ME.duty},
      options: {modules: opt.modules, mailCount: opt.mailCount, days: opt.days, approvalDays: opt.approvalDays, noticeCount: opt.noticeCount, budget: opt.budget}, status, data};
  }

  // ---------- 그 밖의 조회 ----------
  async function search(keyword, {types = ['doc', 'mail', 'board', 'file', 'schedule', 'person', 'contact'], page = 1, pageSize = 10} = {}) {
    const kw = String(keyword || '').trim();
    if (kw.length < 2) throw Object.assign(new Error('검색어를 두 글자 이상 입력하세요.'), {code: 'BAD_QUERY'});
    await wait(200);
    const has = s => String(s || '').toLowerCase().includes(kw.toLowerCase());
    const ap = approval(), ml = mail(), nt = notice(), sc = schedule();
    const body = t => `${t} 관련 내용입니다. 추진 배경과 세부 계획, 소요 예산을 붙임과 같이 보고합니다. (둘러보기용으로 지어낸 본문)`;
    const all = {
      doc: Object.entries(ap.lists).flatMap(([k, l]) => l.docs.map(d => [k, d])).filter(([, d]) => has(d.title) || has(d.docNo) || has(d.drafterDept)).map(([k, d]) => { const recv = k === 'deptWaiting' || k === 'distWaiting', head = recv ? '' : `수신자 ${k === 'sendWaiting' ? '한빛시장(청소년과장)' : '내부결재'} (경유) 제목 `; return {type: 'doc', docId: d.docId, docNo: d.docNo, title: d.title, form: recv ? '접수문서' : d.form, date: d.date.slice(0, 10), drafter: d.drafter || d.sender, dept: recv ? (d.toDept || ME.deptName || d.sendDept) : (d.drafterDept || d.sendDept), files: [], snippet: body(d.title), text: head + body(d.title), url: d.url}; }),
      mail: ml.inbox.records.filter(r => has(r.subject) || has(r.from) || has(r.preview)).map(r => ({type: 'mail', uid: r.uid, box: r.box, subject: r.subject, from: r.from, to: ME.name, date: r.date.slice(0, 16), size: r.size, snippet: r.preview})),
      board: nt.articles.filter(a => has(a.title)).map(a => ({type: 'board', id: a.id, cat: a.cat, catType: 'L', catTitle: '공지사항', title: a.title, writer: a.writer, date: a.date.slice(0, 10), files: [], snippet: body(a.title), text: body(a.title), url: a.url})),
      file: [], schedule: sc.events.filter(e => has(e.title)).map(e => ({type: 'schedule', id: e.id, title: e.title, start: e.start, end: e.end, snippet: e.place})),
      person: PEOPLE.filter(p => has(p[1]) || has(p[2])).map(p => ({type: 'person', name: p[1], dept: p[2], duty: '팀원', position: '주임', tel: '032-000-0000', email: 'sample@example.org'})),
      contact: [],
    };
    const labels = SEARCH_LABELS, groups = {};
    for (const t of types) if (all[t]) groups[t] = {label: labels[t], total: all[t].length, items: all[t].slice((page - 1) * pageSize, page * pageSize)};
    return {keyword: kw, page, pageSize, groups, searchedAt: new Date().toISOString()};
  }
  const SEARCH_LABELS = {doc: '전자결재 문서', mail: '메일', board: '게시판', file: '첨부파일', schedule: '일정', person: '인물', contact: '연락처', note: '노트'};

  async function teamAttendance({from, to} = {}) {
    await wait();
    const rows = [];
    const add = (emp, off, item, result, extra = {}) => { const d = day(off); if (d < from || d > to) return; const p = PEOPLE.find(x => x[0] === emp); rows.push({emp, name: p[1], dept: p[2], date: d, item, result, appStart: '', appEnd: '', come: '', leave: '', otMin: 0, holiOtMin: 0, recognizedMin: 480, holiday: false, mine: emp === ME.erp, ...extra}); };
    add('26008', 0, '연차', '휴가'); add('26014', 0, '관외출장', '정상', {appStart: '0900', appEnd: '1800'}); add('26021', 0, '오후반차', '휴가', {appStart: '1400', appEnd: '1800'});
    add('26019', 0, '교육', '정상', {appStart: '1300', appEnd: '1800'}); add('26005', workday(1), '연차', '휴가'); add('26011', workday(1), '관내출장', '정상', {appStart: '1300', appEnd: '1700'});
    add(ME.erp, workday(-6, -1), '연차', '휴가'); add('26003', workday(-1, -1), '연장근무', '정상', {appStart: '1800', appEnd: '2000', otMin: 120});
    return rows.sort((p, q) => p.date.localeCompare(q.date) || p.name.localeCompare(q.name, 'ko'));
  }
  async function teamPlanned() {
    await wait();
    let sq = 0;
    const app = (emp, atNm, s, e, extra = {}) => { const p = PEOPLE.find(x => x[0] === emp); return {empCd: emp, korNm: p[1], deptNm: p[2], atNm, atItemNm: atNm, startDt: day(s), endDt: day(e), startTm: '', endTm: '', appDt: day(s - 5), appSq: String(++sq), approState: '1', deleteReqYn: 'N', docdelYn: '', appTm: 0, appDy: e - s + 1, title: `${atNm} 신청`, noDoc: '', reason: '', place: '', depart: '', stop: '', arrive: '', transport: '', ...extra}; };
    return {me: ME.erp, apps: [
      app('26008', '연차', 0, 0, {reason: '개인 사정'}), app('26014', '관외출장', 0, 0, {startTm: '0900', endTm: '1800', place: '세종 청소년정책연구원', reason: '정책 포럼 참석', transport: '철도'}),
      app('26021', '오후반차', 0, 0, {startTm: '1400', endTm: '1800'}), app('26019', '교육', 0, 0, {startTm: '1300', endTm: '1800', place: '경기도인재개발원', reason: '직무 교육'}),
      app('26005', '연차', workday(1), workday(1)), app('26011', '관내출장', workday(1), workday(1), {startTm: '1300', endTm: '1700', place: '한빛중학교', reason: '진로교실 운영'}),
      app(ME.erp, '관내출장', workday(1), workday(1), {startTm: '1300', endTm: '1700', place: '한빛중학교', reason: '진로교실 운영', approState: '0'}), app(ME.erp, '연차', workday(5), workday(5)),
      app('26024', '연차', workday(3), workday(4)), app('26003', '관외출장', workday(6), workday(6), {startTm: '0900', endTm: '1800', place: '서울', reason: '회계 실무 교육'}),
    ]};
  }

  const RES = [{resSeq: '11', name: '2층 회의실', attr: '회의실', attrSeq: 'A1', apprYn: 'N', desc: '12인 · 빔프로젝터', useYn: 'Y'}, {resSeq: '12', name: '다목적홀', attr: '회의실', attrSeq: 'A1', apprYn: 'Y', desc: '80인 · 음향 장비', useYn: 'Y'}, {resSeq: '13', name: '상담실 1', attr: '회의실', attrSeq: 'A1', apprYn: 'N', desc: '4인', useYn: 'Y'},
    {resSeq: '21', name: '업무용 승합차 (12가 3456)', attr: '차량', attrSeq: 'A2', apprYn: 'Y', desc: '11인승', useYn: 'Y'}, {resSeq: '22', name: '업무용 승용차 (34나 5678)', attr: '차량', attrSeq: 'A2', apprYn: 'Y', desc: '5인승 · 전기차', useYn: 'Y'}];
  const booked = [];
  async function resourceBookings({from, to, resSeqs = []} = {}) {
    await wait();
    const b = (resSeq, off, s, e, title, who, mine) => ({resSeq, seqNum: `${resSeq}${off}${s}`, name: RES.find(r => r.resSeq === resSeq).name, title, start: day(off) + s, end: day(off) + e, status: '20', who, mine: mine || undefined});
    const rows = [b('11', 0, '1000', '1100', '주간 팀 회의', ME.name, true), b('11', 0, '1500', '1630', '예산 실무 협의', '박서준'), b('12', workday(2), '1600', '1800', '청소년 운영위원회', ME.name, true), b('12', workday(4), '1500', '1800', '발표회 리허설', '정민재'),
      b('13', 0, '1400', '1500', '강사 사전 협의', ME.name, true), b('21', workday(1), '1230', '1730', '한빛중학교 진로교실', ME.name, true), b('22', 0, '0900', '1800', '정책 포럼 참석', '한지우'), b('22', workday(3), '1300', '1600', '시설 점검', '윤태호'), ...booked];
    return rows.filter(r => r.start.slice(0, 8) >= from && r.start.slice(0, 8) <= to && (!resSeqs.length || resSeqs.map(String).includes(r.resSeq)));
  }

  const ledger = (project, bgtCd) => {
    const b = BUDGETS[project] || BUDGETS.Y101, rows = [];
    const leafs = b.rows.map(bRow).filter(r => r.level === '세목' && r.path.split('|').includes(bgtCd));
    const names = ['강사수당 지급', '행사 물품 구입', '현수막 제작', '간담회 다과', '체험 재료 구입', '차량 임차', '인쇄물 제작', '회의 운영비'];
    for (const leaf of leafs) {
      let left = leaf.executed, i = 0;
      while (left > 0) { const amt = Math.min(left, Math.round(leaf.executed / 6 / 1000) * 1000 + i * 37000); const off = -(12 + i * 23 + rows.length * 3) % 300; rows.push({date: day(-Math.abs(off) - 3), desc: `${names[(rows.length + i) % names.length]} (${leaf.name})`, amount: amt, docNo: `청소년사업팀-${1200 + rows.length * 7}`, writer: PEOPLE[(rows.length + 2) % PEOPLE.length][1], dept: ME.deptName, slip: `S${20260000 + rows.length}`, fillDate: day(-Math.abs(off) - 3), code: leaf.code, name: leaf.name, authorized: true}); left -= amt; i++; }
    }
    rows.sort((p, q) => q.date.localeCompare(p.date));
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    return {project, bgtCd, year: +day(0).slice(0, 4), rows, sum, checkSum: sum};
  };

  const notHere = what => async () => { await wait(60); throw Object.assign(new Error(`둘러보기에서는 ${what} 수 없습니다. 실제 그룹웨어에서 사용하세요.`), {code: 'DEMO'}); };

  window.BWYFGW_DEMO = true;
  window.BWYFGW = Object.freeze({
    version: VERSION, collect, search,
    call: notHere('그룹웨어 API를 부를'),
    budgetCatalog: async () => { await wait(); return Object.entries(BUDGETS).map(([project, b]) => ({project, name: b.name})); },
    budgetProject: async (t, opt = {}) => { await wait(); return budgetTable(t, opt); },
    budgetAll: async ({year} = {}) => { await wait(300); return {year: Number(year || day(0).slice(0, 4)), projects: Object.entries(BUDGETS).map(([project, b]) => ({project, name: b.name, rows: b.rows.map(bRow)})), empty: [bRow(['사1111140', '국외여비', '세목', '사11|사111|사1111140|', 1, 0])].map(r => ({...r, budget: 0, balance: 0, rate: 0})), names: Object.fromEntries(Object.values(BUDGETS).flatMap(b => b.rows.map(r => [r[0], r[1]]))), emptyError: '', at: Date.now()}; },
    budgetLedger: async ({project, bgtCd} = {}) => { await wait(240); return ledger(project, bgtCd); },
    budgetMonthly: async ({project, code, year} = {}) => {
      await wait(240);
      const b = (BUDGETS[project] || BUDGETS.Y101).rows.map(bRow), sel = code ? b.filter(r => r.path.split('|').includes(code)) : b, cur = +day(0).slice(4, 6);
      const weight = [3, 5, 9, 8, 11, 7, 6, 4, 12, 14, 10, 0].slice(0, cur), wsum = weight.reduce((s, w) => s + w, 0) || 1;
      return {project, code, year: Number(year || day(0).slice(0, 4)), months: Array.from({length: 12}, (_, i) => ({month: String(i + 1).padStart(2, '0'), rows: i < cur ? sel.map(r => ({...r, executed: Math.round(r.executed * weight[i] / wsum)})) : []}))};
    },
    attendanceDays: async ({from, to} = {}) => { await wait(); const f = from || day(0).slice(0, 6) + '01'; return attendanceRows(f, to || day(0)); },
    teamAttendance, teamPlanned,
    resourceList: async () => { await wait(); return RES.map(r => ({...r})); },
    resourceBookings,
    resourceDetail: async resSeq => { await wait(60); const r = RES.find(x => x.resSeq === String(resSeq)) || RES[0]; return {resSeq: String(resSeq), name: r.name, apprYn: r.apprYn, limitMin: 0}; },
    resourceCheck: async ({resSeq, start, end} = {}) => { const rows = await resourceBookings({from: String(start).slice(0, 8), to: String(end).slice(0, 8), resSeqs: [resSeq]}); return {conflict: rows.some(r => r.start < end && r.end > start), limit: false}; },
    // 둘러보기의 예약은 이 탭의 메모리에만 남는다(새로고침하면 사라진다).
    reserveResource: async ({resSeq, title, start, end} = {}) => { await wait(300); const r = RES.find(x => x.resSeq === String(resSeq)) || RES[0]; booked.push({resSeq: r.resSeq, seqNum: `D${booked.length}`, name: r.name, title, start, end, status: r.apprYn === 'Y' ? '10' : '20', who: ME.name, mine: true}); return {ok: true, resSeq: r.resSeq, start, end, title, needsApproval: r.apprYn === 'Y', demo: true}; },
    routingHistory: async () => { await wait(); const r = (title, sendOrg, toDept, toEmp, off) => ({title, sendOrg, sendDept: '', sendDeptCode: '', toDept, toEmp, date: at(off)}); return {from: day(-180), to: day(0), fetchedAt: new Date().toISOString(),
      dist: [r('여름방학 청소년 프로그램 공동 홍보 협조 요청', '한빛시청', '청소년사업팀', '', -120), r('청소년 프로그램 홍보 자료 배포 협조', '한빛시청', '청소년사업팀', '', -75), r('청소년 축제 공동 홍보 요청', '한빛시청', '청소년사업팀', '', -40), r('시설 안전 점검 계획 알림', '한빛시청', '시설운영팀', '', -30)],
      dept: [r('2025년 청소년 정책 참여기구 운영 실적 제출 요청', '경기도교육청', '청소년사업팀', ME.name, -160), r('청소년 참여기구 운영 실적 제출', '경기도교육청', '청소년사업팀', ME.name, -90), r('지역 청소년 안전망 실무협의회 개최', '여성가족부', '청소년사업팀', '정민재', -60)]}; },
    submittedRange: async () => { await wait(); return {from: day(-7), to: day(0), docs: approval().lists.submitted.docs}; },
    approvalPage: async (kind, page = 2) => { await wait(); const names = ['청소년 방과후 아카데미 운영 보고', '자원봉사 활동 확인서 발급 대장', '상반기 사업 평가 결과 보고', '청소년증 발급 현황 보고', '프로그램 참가자 보험 가입']; return {kind, page, total: 41, docs: page > 3 ? [] : names.map((t, i) => doc(kind, `${t} (${page}쪽-${i + 1})`, {drafter: ME.name, drafterDept: ME.deptName, status: '결재완료(팀장)', statusCode: '008', date: at(-20 * page - i)}))}; },
    docPreview: async ({docNo = '', title = ''} = {}) => { await wait(); return {found: true, type: 'doc', docNo, title, form: '일반기안문', date: dash(), drafter: '', dept: '', files: [], snippet: '', text: `1. 관련: ${docNo || '내부 계획'}\n2. ${title} 건에 대하여 아래와 같이 보고합니다.\n  가. 일시: ${md(workday(3))} 14:00\n  나. 장소: 다목적홀\n  다. 소요 예산: 금 1,250,000원\n3. 회신 기한: ${md(workday(3))}까지\n\n(둘러보기용으로 지어낸 본문입니다.)`}; },
    frequentForms: async () => { await wait(); return [['F100', '일반기안문', 14], ['1007', '지출결의서', 9], ['40', '출장신청서', 6], ['36', '휴가신청서', 5], ['F210', '행사 결과 보고', 3], ['F220', '물품 구입 품의', 2]].map(([formId, name, count]) => { const isHr = /휴가|출장/.test(name), isErp = /지출결의/.test(name); return {formId, name, count, last: at(-count), isHr, isErp, isStandalone: !isHr && !isErp, url: LINKS.draft(formId, name)}; }); },
    findReply: async () => { await wait(200); return {checked: true, found: false, uid: null, subject: '', date: '', to: '', hasAttach: false, size: 0}; },
    mailDetail: async ({uid, seen} = {}) => { await wait(180); const m = mail().inbox.records.find(r => r.uid === String(uid)) || mail().inbox.records[0]; return {uid: String(uid), subject: m.subject, from: `${m.from} <sample@example.org>`, to: `${ME.name} <demo@example.org>`, cc: '', date: m.date.slice(0, 16), readUrl: '', account: 'demo@example.org', files: m.attach ? [{name: '제출 양식.hwpx', size: 48211, ext: 'hwpx', sn: '1'}, {name: '참고 자료.pdf', size: 312440, ext: 'pdf', sn: '2'}] : [], bigFiles: [], bigUntil: '', text: `${m.preview}\n\n자세한 내용은 첨부 파일을 참고해 주세요. 감사합니다.\n\n(둘러보기용으로 지어낸 메일입니다.)`, wasUnread: seen !== true}; },
    mailAttachment: notHere('첨부 파일을 받을'), mailAttachmentPreview: notHere('첨부 파일을 미리 볼'),
    saveBlob: notHere('파일을 저장할'),
    context: () => ({name: ME.name, deptName: ME.deptName, compName: ME.compName, duty: ME.duty, position: ME.position}),
    readOnlyEndpoints: () => [], routes: ROUTES, links: LINKS, searchLabels: SEARCH_LABELS, defaults: DEFAULTS,
  });
})();
