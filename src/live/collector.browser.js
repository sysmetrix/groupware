/*
 * BWYF groupware live collector v2 (runs inside a logged-in https://gw.bwyf.or.kr page).
 *
 * - Reuses the groupware's own signed API client (the webpack module that adds
 *   Authorization / timestamp / wehago-sign headers). Cookie, token and signing-key
 *   values are never read, copied or printed by this script.
 * - Only endpoints in READ_ONLY are callable. Writes (approve, receive, distribute,
 *   send, commute registration, visit statistics, search-history and preference
 *   saves) are rejected before any request is made.
 * - List/search APIs do not open mails or documents, so unread states stay intact.
 *
 * Page context:  await BWYFGW.collect()            snapshot of all work areas
 *                await BWYFGW.search('예산')       full-text search across modules
 *                await BWYFGW.budgetLedger({project:'A201', bgtCd:'노1211110'})
 */
(() => {
  'use strict';
  const VERSION = '0.31.0';
  const ORIGIN = 'https://gw.bwyf.or.kr';

  // Endpoints verified on 2026-11-08 as list/read/search calls issued by the app itself.
  const READ_ONLY = new Set([
  // 자원(회의실·차량) 조회: 목록, 예약 현황, 자원 상세, 중복·한도 확인(POST지만 읽기 전용), 속성/옵션
  '/schres/rs121A01', '/schres/rs121A04', '/schres/rs121A05', '/schres/rs121A42', '/schres/rs121A49', '/schres/rs121A24', '/schres/rs121A10',
    '/mail/mail000A01', '/mail/mail000A03', '/mail/mail003A01', '/mail/mail002A01', '/mail/mail002A37', '/ecm/ecm001A07',
    '/ea/api/getMenuCountInfo', '/ea/ea036A02', '/ea/ea025A04', '/ea/ea023A02', '/ea/ea027A02',
    '/ea/ea038A09', '/ea/ea038A15',
    '/board/APIHandler/ViewBoardArtList', '/board/APIHandler/getBoardReadCnt',
    '/schres/sc111A02', '/schres/sc111A03', '/gw/APIHandler/gw114A14',
    '/human/common/judgeTimeManagement/getTodayComeLeaveInfo', '/personal/hpd0220/0hr00001', '/human/hrd0410/selectTab2', '/human/hrd1130/0hr00004', '/human/hrd0220/0hr00001',
    '/personal/hpd0550/0hp00002', '/personal/hpd0550/0hp00003',
    '/nonprofit/NCC0610/0BN00002', '/nonprofit/popup/0BN00001', '/system/codepickers/CP0001A0001',
    '/event/event02A01',
    '/gw/APIHandler/gw018A02',
    '/ea/ea059A02',
  ]);

  // Left-menu ids of 전자결재(비영리) observed in getMenuCountInfo (2026-11-08).
  const APPROVAL_MENUS = {
    '11000200': '임시보관문서', '11000300': '상신문서', '11000400': '반려/회수문서', '11000500': '열람문서',
    '11000700': '대기문서', '11000800': '예결문서', '11000900': '완료문서', '11001200': '반려문서',
    '11001700': '발송대기문서', '11001800': '발송진행문서', '11002200': '내접수문서', '11002300': '부서대기문서',
    '11002400': '부서진행문서', '11002700': '배부대기문서', '11002800': '배부진행문서',
  };

  const APPROVAL_LISTS = [
    {key: 'pending', label: '결재 대기', menu: '11000700', page: 'UCA2010', api: '/ea/ea036A02', period: 'diWriteDate', extra: {searchSts: '001', sortType: 'ASC', topSort: false, isAfterYn: ''}},
    {key: 'deptWaiting', label: '부서 접수 대기', menu: '11002300', page: 'UCA3022', api: '/ea/ea025A04', period: 'riArriveDate'},
    {key: 'distWaiting', label: '배부 대기', menu: '11002700', page: 'UCA3031', api: '/ea/ea023A02', period: 'riArriveDate'},
    {key: 'sendWaiting', label: '발송 대기', menu: '11001700', page: 'UCA3011', api: '/ea/ea027A02', period: 'diWriteDate'},
    {key: 'submitted', label: '내 상신문서', menu: '11000300', page: 'UCA1020', api: '/ea/ea038A09', period: 'diWriteDate', extra: {searchSts: '002'}},
    {key: 'viewing', label: '열람문서', menu: '11000500', page: 'UCA1040', api: '/ea/ea038A15', period: 'rsReceiveDate'},
  ];

  // 통합검색(gw018A02) boardType codes observed on the portal search screen.
  const SEARCH_TYPES = {doc: '7', mail: '0', board: '9', file: '10', schedule: '3', person: '11', contact: '16', note: '12'};
  const SEARCH_LABELS = {doc: '전자결재 문서', mail: '메일', board: '게시판', file: '첨부파일', schedule: '일정', person: '인물', contact: '연락처', note: '노트'};

  const ROUTES = {
    mail: '#/UD/UDA/UDA0000?specialLnb=Y&moduleCode=UD&menuCode=UDA&pageCode=UDA0020',
    approvalHome: '#/UC/UCA/UCA0000?specialLnb=Y&moduleCode=UC&menuCode=UCA&pageCode=UCA8000',
    approvalPage: page => `#/UC/UCA/UCA0000?specialLnb=Y&moduleCode=UC&menuCode=UCA&pageCode=${page}`,
    notice: '#/UF/UFA/UFA0000?specialLnb=Y&moduleCode=UF&menuCode=3000300_001008&pageCode=UFA3000',
    schedule: '#/UE/UEA/UEA0000?specialLnb=Y&moduleCode=UE&menuCode=UEA&pageCode=UEA0000',
    worktime: '#/HP/HPD0220/HPD0220',
    attendanceRequest: '#/HP/HPD0110/HPD0110',
    leave: '#/HP/HPD0550/HPD0550',
    budget: '#/HP/NPC2040/NCC0610',
    draft: '#/UC/UCA/UCA0000?specialLnb=Y&moduleCode=UC&menuCode=UCA&pageCode=UCA7000',
    expenseEntry: '#/HP/NPC1030/NCA0020',
  };

  // Native screens that the groupware itself opens as popups (same origin, embeddable in an iframe).
  const qs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const LINKS = {
    doc(doc, kind = '') {
      const p = {MicroModuleCode: 'ea', callComp: 'UCAP001', diKeyCode: doc.docId, tiKeyCode: doc.tiKeyCode};
      if (kind === 'deptWaiting') Object.assign(p, {pageCode: 'UCA3022', recvOpenYN: 'Y', diSeqNum: doc.diSeqNum});
      if (kind === 'distWaiting') Object.assign(p, {recvOpenYN: 'Y', isBaebu: 'Y', diSeqNum: doc.diSeqNum});
      if (kind === 'sendWaiting') Object.assign(p, {isSend: 'Y'});
      return `${ORIGIN}/#popup?${qs(p)}`;
    },
    // Mail compose (re = 답장, reall = 전체 답장, fw = 전달, plain = 새 메일). Nothing is sent until the user presses 보내기.
    compose: (kind, mail) => `${ORIGIN}/#popup?${qs({MicroModuleCode: 'mail', callComp: 'UDAP001', mailKind: kind, uid: mail && mail.uid, mbox: mail && mail.box, popType: 'Y', moduleSeq: '700'})}`,
    // New approval draft with a given form (nothing is saved until 임시저장/상신).
    draft: (formId, name = '') => {
      const fid = String(formId || '');
      // Interlocked forms (근태 36, 출장 40, 연장 43, 대체 1012/1021, 지출결의 1007/1009/1011) must NOT be opened via raw tiKeyCode.
      // Amaranth 10 fails with "연동본문 데이터 조회 실패하였습니다." unless opened from their originating modules.
      if (/^(36|40|43|1012|1021)$/.test(fid) || /휴가|출장|근태|연장|대체/.test(name)) return `${ORIGIN}/${ROUTES.attendanceRequest}`;
      if (/^(1007|1009|1011|1013)$/.test(fid) || /지출결의|구입과지출/.test(name)) return `${ORIGIN}/${ROUTES.expenseEntry}`;
      return `${ORIGIN}/#popup?${qs({MicroModuleCode: 'ea', tiKeyCode: fid, callComp: 'UCAP001'})}`;
    },
    article: a => `${ORIGIN}/#/popup?${qs({callComp: 'UFAP003', art_seq_no: a.id, cat_seq_no: a.cat, cat_type: a.catType || 'L', alarm_yn: 'Y', MicroModuleCode: 'board', externalYn: 'Y'})}`,
    file: fileId => `${ORIGIN}/#/popup?${qs({MicroModuleCode: 'ecm', callComp: 'UQAP001', pageCode: 'UQAP029', uid: fileId, targetObjectType: 'FL'})}`,
    route: r => ORIGIN + '/' + r,
  };

  class GwError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }

  // ---------- client discovery ----------
  let cachedClient = null;
  function findClient() {
    if (cachedClient) return cachedClient;
    if (location.origin !== ORIGIN) throw new GwError('WRONG_ORIGIN', `그룹웨어(${ORIGIN}) 페이지에서 실행해야 합니다.`);
    const chunkName = Object.keys(window).find(k => k === 'webpackChunkklago_ui_gw') || Object.keys(window).find(k => k.startsWith('webpackChunk'));
    if (!chunkName) throw new GwError('APP_NOT_LOADED', '그룹웨어 화면이 아직 로드되지 않았습니다. 로그인 후 메인 화면에서 다시 실행하세요.');
    let req = null;
    window[chunkName].push([[`bwyfgw-${Date.now()}`], {}, r => { req = r; }]);
    if (!req || !req.m) throw new GwError('APP_NOT_LOADED', '그룹웨어 모듈 로더를 찾지 못했습니다.');
    for (const id of Object.keys(req.m)) {
      let src = '';
      try { src = Function.prototype.toString.call(req.m[id]); } catch { continue; }
      if (!src.includes('wehago-sign') || !src.includes('getTransactionId')) continue;
      let exp;
      try { exp = req(id); } catch { continue; }
      const client = [exp && exp.A, exp && exp.default, ...Object.values(exp || {})].find(v => v && typeof v.post === 'function' && typeof v.call === 'function');
      if (client) { cachedClient = client; return client; }
    }
    throw new GwError('CLIENT_NOT_FOUND', '그룹웨어 API 클라이언트를 찾지 못했습니다. 그룹웨어 업데이트로 구조가 바뀌었을 수 있습니다.');
  }

  function parseRejection(reason) {
    if (reason instanceof GwError) return reason;
    const text = typeof reason === 'string' ? reason : (reason && reason.message) || (reason && typeof reason === 'object' ? JSON.stringify(reason) : String(reason));
    try {
      const j = JSON.parse(text);
      const code = j && (j.errors && j.errors.code || j.resultCode || j.errorCode || j.status);
      const msg = j && (j.errors && j.errors.message || j.resultMsg || j.errorMsg || j.error) || '';
      if (code === 'E002' || /Token is not exists|Session is not exists/i.test(msg)) return new GwError('SESSION_EXPIRED', '그룹웨어 로그인 세션이 만료되었습니다.');
      if (code === 601) return new GwError('ORIGIN_REJECTED', '허용된 쿠키 인증 URL이 아닙니다(601).');
      return new GwError('API_ERROR', `${code || ''} ${msg}`.trim() || 'API 오류');
    } catch { return new GwError('API_ERROR', text.slice(0, 200)); }
  }

  // 쓰기는 이 목록의 주소만, 전용 함수(reserveResource)에서만 허용한다. 상신·결재·삭제·발송 계열은 여기에 절대 넣지 않는다.
  const WRITE_ALLOWED = new Set(['/schres/rs121A06']);
  async function call(path, body = {}, opts = {}) {
    if (!READ_ONLY.has(path)) throw new GwError('NOT_ALLOWED', `읽기 전용 허용 목록에 없는 API입니다: ${path}`);
    return transport(path, body, opts);
  }
  async function transport(path, body = {}, {timeoutMs = 15000} = {}) {
    const client = findClient();
    let timer;
    try {
      const res = await Promise.race([
        client.post(path, body, {contextType: 'application/json'}),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new GwError('TIMEOUT', `${path} 응답 시간 초과`)), timeoutMs); }),
      ]);
      const r = typeof res === 'string' ? JSON.parse(res) : res;
      if (!r || (r.resultCode !== 0 && r.resultCode !== 200 && r.resultCode !== 'SUCCESS')) throw new GwError('API_ERROR', `${path}: ${r && r.resultCode} ${r && r.resultMsg || ''}`.trim());
      return r.resultData;
    } catch (e) { throw parseRejection(e); }
    finally { clearTimeout(timer); }
  }

  // ---------- helpers ----------
  const kstParts = (d = new Date()) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(d).map(x => [x.type, x.value]));
    return {y: p.year, m: p.month, d: p.day};
  };
  const ymd = (d = new Date()) => { const p = kstParts(d); return `${p.y}${p.m}${p.d}`; };
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const lastDayOfMonth = (y, m) => new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  const str = (v, max = 300) => (v === null || v === undefined) ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, max);
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const SECRET = /((?:비밀\s*번호|비번|패스워드|password|passwd|pwd|pw|임시\s*번호|인증\s*번호|OTP)\s*[:：=]?\s*)(\S+)/gi;
  const mask = (s, max = 1000) => str(s, max).replace(SECRET, '$1[MASKED]');
  const arr = v => Array.isArray(v) ? v : [];
  const firstList = obj => {
    if (!obj || typeof obj !== 'object') return {list: [], total: null};
    if (Array.isArray(obj.list)) return {list: obj.list, total: obj.totalCount !== undefined ? num(obj.totalCount) : (obj.startCount !== undefined ? num(obj.startCount) : null)};
    for (const k of ['map', 'list', 'result']) if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) return firstList(obj[k]);
    return {list: [], total: null};
  };
  const snippetAround = (text, keyword, size = 160) => {
    const t = mask(text, 20000);
    if (!keyword) return t.slice(0, size);
    const i = t.toLowerCase().indexOf(String(keyword).toLowerCase());
    if (i < 0) return t.slice(0, size);
    const start = Math.max(0, i - Math.floor(size / 3));
    return (start ? '…' : '') + t.slice(start, start + size) + (start + size < t.length ? '…' : '');
  };

  function context() {
    let ui;
    try { ui = JSON.parse(sessionStorage.getItem('userInfo') || 'null'); } catch { ui = null; }
    let u = ui && ui.ucUserInfo;
    if (typeof u === 'string') { try { u = JSON.parse(u); } catch { u = null; } }
    if (!u || !u.empSeq) throw new GwError('NOT_LOGGED_IN', '그룹웨어에 로그인되어 있지 않습니다.');
    return {
      groupSeq: u.groupSeq, compSeq: u.compSeq, bizSeq: u.bizSeq, deptSeq: u.deptSeq, empSeq: u.empSeq,
      loginId: u.loginId, erpEmpSeq: u.erpEmpSeq || u.loginId, erpCompSeq: u.erpCompSeq || u.compSeq,
      userSe: u.userSe, langCode: u.langCode || 'kr', emailAddr: u.emailAdd, emailDomain: u.emailDomain,
      name: u.empName, deptName: u.deptName, compName: u.compName, position: u.positionName, duty: u.dutyName,
    };
  }

  const approvalBase = (ctx, from, to, pageSize) => ({fDocSts: '', sDocSts: '', readYn: '', selectFlag: '', riKind: '', c_aiokflag: '', allDocSts: '', sortType: 'DESC', page: '1', pageSize: String(pageSize), menuAuthType: 'USER', searchAuthType: 'U', sfrDt: from, stoDt: to, fromDate: from, toDate: to, multiDeptSeq: [], multiKlUserName: [], multiTxtDrafters: [], multiReceiveSendUsers: [], multiRiEmpNames: [], multiLastKlEmps: [], multiaiUserNames: [], co_id: ctx.compSeq, searchType: ''});

  const toDoc = (r, kind = '') => {
    const doc = {
      kind, docId: str(r.diKeyCode, 30), tiKeyCode: str(r.tiKeyCode, 30), diSeqNum: str(r.diSeqNum, 30), form: str(r.tiName, 60),
      title: mask(r.diTitle, 300), status: str(r.diStatusName || r.rsStatusName || r.rsFlagName, 60), statusCode: str(r.diStatus || r.rsStatus, 10),
      drafter: str(r.diEmpName, 40), drafterDept: str(r.diDeptName, 60), approver: str(r.diKyulJaeUserName, 40),
      sender: str(r.riSendOrgName || r.orgDept || r.riSendDeptName, 100), sendOrg: str(r.riSendOrgName, 60), sendDept: str(r.riSendDeptName, 60), sendDeptCode: str(r.riSendDeptCode, 20),
      docNo: str(r.riSendDocNum || r.riDocFullNum || r.diDocNum || r.docNo, 60), toDept: str(r.rsDeptName, 60), toEmp: str(r.rsEmpName || r.empName, 40),
      date: str(r.diWriteDate || r.riArriveDate || r.rsReceiveDate || r.rsReadDate, 25), attachments: num(r.attachCount), comments: num(r.commentCount),
      // 열람문서 rows carry the reader's empSeq in riReadYn once read and '' before.
      unread: r.riReadYn === 'N' || r.readYn === 'N' || r.rsReadYn === 'N' || (kind === 'viewing' && !r.riReadYn),
    };
    doc.url = LINKS.doc(doc, kind);
    return doc;
  };

  // ---------- snapshot modules ----------
  async function collectMail(ctx, opt) {
    const boxesRaw = await call('/mail/mail000A01');
    const boxes = arr(boxesRaw && boxesRaw.mailboxList).map(b => ({seq: b.mboxSeq, name: str(b.name, 60), total: num(b.exists), unseen: num(b.unseen)}));
    const inbox = boxes.find(b => b.name === 'INBOX') || {seq: 571, name: 'INBOX'};
    const toMail = (r, box) => ({
      uid: str(r.muid, 40), box, subject: mask(r.subject, 300), from: str(r.fromAddrName || r.from, 80), fromEmail: str(r.fromAddrEmail, 120),
      date: str(r.tooltipDate || r.rfc822date, 40), shortDate: str(r.rfc822date, 20), seen: num(r.seen) === 1, flagged: num(r.flagged) === 1,
      answered: num(r.answered) === 1, forwarded: num(r.forward) === 1, attach: num(r.attach) > 0, size: num(r.size), preview: mask(r.context, 400),
    });
    const list = async (box, size, unseenOnly) => {
      const d = await call('/mail/mail003A01', {boxName: box.name, mainApiCode: 'mail003A01', mboxSeq: box.seq, page: 1, pageSize: size, sort: 'rfc822date', sortType: 'desc', listType: '', showType: '', seen: false});
      const records = arr(d && d.Records).map(r => toMail(r, box.name));
      return {total: num(d && d.TotalRecordCount), unseen: num(d && d.TotalUnseenCount), records: unseenOnly ? records.filter(r => !r.seen) : records};
    };
    const inboxData = await list(inbox, Math.min(Math.max(opt.mailCount, 10), 200));
    const extra = boxes.filter(b => !['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM'].includes(b.name) && b.unseen > 0);
    const others = await Promise.all(extra.map(b => list(b, 30, true).then(x => x.records).catch(() => [])));
    return {boxes, inbox: {total: inboxData.total, unseen: inboxData.unseen, fetched: inboxData.records.length, records: inboxData.records}, otherUnseen: others.flat(), url: LINKS.route(ROUTES.mail)};
  }

  async function collectApproval(ctx, opt) {
    const countsRaw = await call('/ea/api/getMenuCountInfo', {groupSeq: ctx.groupSeq, compSeq: ctx.compSeq, bizSeq: ctx.bizSeq, deptSeq: ctx.deptSeq, empSeq: ctx.empSeq, userSe: ctx.userSe, langCode: ctx.langCode, leftMenuCntYn: 'Y'});
    const counts = Object.entries(countsRaw || {}).map(([menu, value]) => {
      const [a, b] = String(value).split('/');
      return {menu, name: APPROVAL_MENUS[menu] || menu, count: num(a), total: b !== undefined ? num(b) : null};
    });
    const now = new Date();
    const from = ymd(addDays(now, -opt.approvalDays)), to = ymd(now);
    const base = approvalBase(ctx, from, to, opt.approvalPageSize);
    const lists = {};
    await Promise.all(APPROVAL_LISTS.map(async def => {
      const body = {...base, nMenuID: def.menu, pageCode: def.page, periodPicker: def.period, sortField: def.period, topSort: def.period, ...(def.extra || {})};
      const url = LINKS.route(ROUTES.approvalPage(def.page));
      try {
        const {list, total} = firstList(await call(def.api, body));
        lists[def.key] = {label: def.label, menu: def.menu, total, fetched: list.length, from, to, docs: list.map(r => toDoc(r, def.key)), url};
      } catch (e) {
        lists[def.key] = {label: def.label, menu: def.menu, error: e.code || 'ERROR', message: e.message, docs: [], url};
      }
    }));
    return {counts, lists, url: LINKS.route(ROUTES.approvalHome)};
  }

  async function collectNotice(ctx, opt) {
    const boardNo = String(opt.noticeBoard || '223');
    const body = {adminPage: 'N', searchAuthType: '', boardNo, searchTotal: '', searchTitle: '', searchNick: '', searchDesc: '', searchBoard: '', searchRemarkNo: '', searchEtcValue: '', searchStartDate: '', searchEndDate: '', searchStartTerm: '', searchEndTerm: '', eventStatus: '', reserveStatus: '', counselingOk: '', searchMailFrom: '', sort: 'write_date', project_id: null, page: 1, pageSize: String(opt.noticeCount), sortType: 'desc', menuCode: 'UFA', pageCode: 'UFA3000', moduleCode: 'UF', noticeYn: '', apiName: 'ViewBoardArtList', use_list_art_content: 'N'};
    const [d, readCnt] = await Promise.all([call('/board/APIHandler/ViewBoardArtList', body), call('/board/APIHandler/getBoardReadCnt', {cat_seq_no: boardNo}).catch(() => null)]);
    const articles = arr(d && d.articleList).map(a => {
      const art = {
        id: str(a.art_seq_no, 20), cat: str(a.cat_seq_no || boardNo, 20), catType: str(a.cat_type || 'L', 4), catTitle: str(a.cat_title, 40),
        title: mask(a.art_title, 300), writer: str(a.mbr_nick, 40), dept: str(a.deptname || a.dept_name, 60),
        date: str(a.write_date_origin || a.write_date, 25), read: a.art_read_yn === 'Y', top: a.notice_yn === 'Y' || a.notice_yn_top === 'Y',
        files: num(a.file_cnt), mine: a.my_yn === 'Y', reserved: a.reserve_yn === 'Y' && String(a.reserve_state) === '0', reserveStart: str(a.reserve_start, 25),
      };
      art.url = LINKS.article(art);
      return art;
    });
    return {board: boardNo, total: num(d && d.totalCnt), unread: readCnt ? num(String(readCnt.not_read_cnt || '0').split('/')[0]) : null, fetched: articles.length, articles, url: LINKS.route(ROUTES.notice)};
  }

  async function collectSchedule(ctx, opt) {
    const companyInfo = {compSeq: ctx.compSeq, groupSeq: ctx.groupSeq, deptSeq: ctx.deptSeq, emailAddr: ctx.emailAddr, emailDomain: ctx.emailDomain};
    const now = new Date();
    const start = ymd(now), end = ymd(addDays(now, opt.days));
    const cals = await call('/schres/sc111A02', {companyInfo, calType: '', langCode: ctx.langCode});
    const calendars = arr(cals && cals.resultList).filter(c => c.displayYn !== 'N').map(c => ({seq: str(c.mcalSeq, 20), type: str(c.calType, 4), title: str(c.calTitle, 60), writable: c.calRwGbn === 'w'}));
    const calList = calendars.map(c => ({mcalSeq: c.seq, calType: c.type, adminYn: c.writable ? 'Y' : 'N', color: ''}));
    const [rows, holidays] = await Promise.all([
      calList.length ? call('/schres/sc111A03', {companyInfo, startDate: start, endDate: end, mySchYn: 'N', calList, tcalList: [], acalList: [], searchEmpSeq: '', excelYn: null, abUID: '', sortDate: 'Y', langCode: ctx.langCode}) : {resultList: []},
      call('/gw/APIHandler/gw114A14', {startDate: start, endDate: end, compSeq: ctx.compSeq}).catch(() => []),
    ]);
    const events = arr(rows && rows.resultList).filter(r => r.delYn !== 'Y').map(r => ({
      id: str(r.schSeq, 20), title: mask(r.schTitle, 200), calendar: str(r.calTitle, 60), start: str(r.startDate, 12), end: str(r.endDate, 12),
      allDay: r.alldayYn === 'Y', place: str(r.schPlace, 100), people: str(r.schUserList, 200),
    })).sort((a, b) => a.start.localeCompare(b.start));
    return {start, end, calendars, events, holidays: arr(holidays).map(h => ({date: str(h.h_day, 8), title: str(h.title, 60)})), url: LINKS.route(ROUTES.schedule)};
  }

  async function attendanceDays({from, to} = {}) {
    const ctx = context();
    const p = kstParts();
    const f = from || `${p.y}${p.m}01`, t = to || `${p.y}${p.m}${String(lastDayOfMonth(p.y, p.m)).padStart(2, '0')}`;
    const rows = await call('/human/hrd0410/selectTab2', {admin: true, appWorkTm: -1, appWorkTmFlag: '1', atDtTo: t, atDtFrom: f, empArr: [ctx.erpEmpSeq], isIncludeHoliday: true, searchType: '1'});
    return arr(rows).map(r => ({
      date: str(r.atDt, 8), weekday: num(r.weekDc), workType: str(r.workTpNm, 20), result: str(r.attresultNm, 20), item: str(r.atNm, 30), status: str(r.worktmStNm, 10),
      come: str(r.comeTm, 4), leave: str(r.leaveTm, 4), recognizedMin: r.appworkTm === null || r.appworkTm === undefined ? null : num(r.appworkTm),
      holiday: r.holiFg ? String(r.holiFg) !== '1' : /휴일/.test(r.attresultNm || ''), applied: r.appformYn === 'Y', lateMin: num(r.latecomeworkTm), earlyLeaveMin: num(r.fastleaveworkTm),
    })).sort((a, b) => a.date.localeCompare(b.date));
  }


  // 직원 근태(조회 전용): 같은 사번 체계(앞자리 + 3자리 순번)를 병렬 조회해 휴가·출장·시간외 판정에 필요한 필드만 돌려준다.
  async function teamAttendance({from, to} = {}) {
    const ctx = context();
    const me = String(ctx.erpEmpSeq || '');
    const m = me.match(/^(\D*\d*?)(\d{3})$/);
    if (!m) throw Object.assign(new Error('사번 형식을 알 수 없습니다'), {code: 'EMP_FORMAT'});
    const prefix = m[1];
    const chunks = [];
    for (let s = 1; s <= 400; s += 100) { const ids = []; for (let i = s; i < s + 100 && i <= 999; i++) ids.push(prefix + String(i).padStart(3, '0')); chunks.push(ids); }
    const lists = await Promise.all(chunks.map(ids => call('/human/hrd0410/selectTab2', {admin: true, appWorkTm: -1, appWorkTmFlag: '1', atDtTo: to, atDtFrom: from, empArr: ids, isIncludeHoliday: true, searchType: '1'}).catch(() => [])));
    return lists.flatMap(arr).map(r => ({
      emp: str(r.empCd, 12), name: str(r.korNm, 20), dept: str(r.deptNm, 30), date: str(r.atDt, 8), item: str(r.atNm, 30), result: str(r.attresultNm, 20),
      appStart: str(r.appStartTm, 4), appEnd: str(r.appEndTm, 4), come: str(r.comeTm, 4), leave: str(r.leaveTm, 4),
      otMin: num(r.overworkTm), holiOtMin: num(r.holioverworkTm), recognizedMin: num(r.appworkTm), holiday: /휴일/.test(r.attresultNm || '') && !r.atNm,
      mine: str(r.empCd, 12) === me,
    })).filter(r => r.item && r.item !== '-').sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ko'));
  }
  // ---------- 자원 ----------
  async function resourceList() {
    const attrs = await call('/schres/rs121A24', {menuAuth: 'USER'}).catch(() => ({}));
    const attrList = [...arr(attrs && attrs.resAttrList).map(a => str(a.attrSeq, 20)).filter(Boolean), 'ETC'];
    const d = await call('/schres/rs121A01', {searchText: '', attrUseYn: '', attrList, propList: []});
    const out = [];
    for (const g of arr(d && (d.resultList || d.attrList))) for (const r of arr(g.resList || [g])) if (r && r.resSeq) out.push({resSeq: str(r.resSeq, 12), name: str(r.resName, 60), attr: str(g.attrName || r.attrName, 30), attrSeq: str(g.attrSeq || r.attrSeq, 20), apprYn: str(r.apprYn, 1), desc: str(r.descText, 120), useYn: str(r.useYn, 1)});
    return out;
  }
  // 하루 이상 구간의 예약 현황 (YYYYMMDD). statusType 10=신청, 20=승인
  async function resourceBookings({from, to, resSeqs = []}) {
    const d = await call('/schres/rs121A05', {startDate: from, endDate: to, statusType: ['10', '20'], resList: resSeqs.map(s => ({resSeq: String(s)})), statusCode: '', searchType: '', sechType: '', menuAuth: 'USER'});
    return arr(d && d.resultList).map(r => ({resSeq: str(r.resSeq, 12), seqNum: str(r.seqNum, 12), name: str(r.resName, 60), title: str(r.reqText || r.resTitleDisplay, 120), start: str(r.resStartDate || r.startDate, 12), end: str(r.resEndDate || r.endDate, 12), status: str(r.statusCode, 4), who: str(r.empName || r.createName || r.reqEmpName, 20), mine: !!r.mineYn || undefined, raw: undefined}));
  }
  async function resourceDetail(resSeq) {
    const d = await call('/schres/rs121A42', {resSeq: String(resSeq)});
    return {resSeq: String(resSeq), name: str(d && d.resName, 60), apprYn: str(d && d.apprYn, 1), limitMin: num(String((d && d.limitReservationRange) || '').replace(/,/g, '')), raw: undefined};
  }
  async function resourceCheck({resSeq, start, end}) {
    const d = await call('/schres/rs121A04', {resSeq: String(resSeq), startDate: start, endDate: end, alldayYn: 'N', resStartDate: start.slice(0, 8)});
    return {conflict: d && d.reservationYn === 'Y', limit: d && d.limitYn === 'Y'};
  }
  // 예약 등록: 입력 검증, 과거 시간 거부, 중복·한도 확인 후에만 저장한다. 성공 여부는 서버 응답(successTf)으로 판단한다.
  const loadedEmpSeq = (() => { try { return context().empSeq; } catch { return ''; } })();
  let reserveBusy = false;
  async function reserveResource({resSeq, title, start, end}) {
    // 사용자가 방금 직접 클릭한 경우에만 실행한다(페이지 스크립트가 몰래 부르는 것을 막는다). 동시에 두 번 실행되지 않게 잠근다.
    if (!(navigator.userActivation && navigator.userActivation.isActive)) throw new GwError('NO_GESTURE', '화면에서 직접 누른 경우에만 예약할 수 있습니다');
    if (reserveBusy) throw new GwError('BUSY', '이미 예약을 처리하고 있습니다');
    reserveBusy = true;
    try { return await reserveResourceInner({resSeq, title, start, end}); } finally { reserveBusy = false; }
  }
  async function reserveResourceInner({resSeq, title, start, end}) {
    const ctx = context();
    if (!/^\d+$/.test(String(resSeq))) throw new GwError('BAD_INPUT', '자원 번호가 올바르지 않습니다');
    if (!/^\d{8}(?:[01]\d|2[0-3])[0-5]\d$/.test(String(start)) || !/^\d{8}(?:[01]\d|2[0-3])[0-5]\d$/.test(String(end)) || end <= start || start.slice(0, 8) !== end.slice(0, 8)) throw new GwError('BAD_INPUT', '시작·종료 시각이 올바르지 않습니다(같은 날, 종료가 시작보다 뒤)');
    { const d = new Date(Date.UTC(+start.slice(0, 4), +start.slice(4, 6) - 1, +start.slice(6, 8))); if (d.toISOString().slice(0, 10).replace(/-/g, '') !== start.slice(0, 8)) throw new GwError('BAD_INPUT', '존재하지 않는 날짜입니다'); if (d.getTime() - Date.now() > 90 * 86400000) throw new GwError('BAD_INPUT', '90일 이후는 예약할 수 없습니다'); }
    const known = await resourceList().catch(() => []);
    if (!known.some(r => r.resSeq === String(resSeq) && r.useYn !== 'N')) throw new GwError('BAD_INPUT', '예약할 수 없는 자원입니다');
    const nowK = ymd() + new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date()).replace(':', '');
    if (start < nowK) throw new GwError('BAD_INPUT', '이미 지난 시각은 예약할 수 없습니다');
    const name = str(title, 100);
    if (!name) throw new GwError('BAD_INPUT', '예약명을 입력하세요');
    const detail = await resourceDetail(resSeq);
    if (detail.limitMin > 0 && (Number(end.slice(8, 10)) * 60 + Number(end.slice(10)) - (Number(start.slice(8, 10)) * 60 + Number(start.slice(10)))) > detail.limitMin) throw new GwError('LIMIT', `최대 ${detail.limitMin / 60}시간까지만 예약할 수 있습니다`);
    const chk = await resourceCheck({resSeq, start, end});
    if (chk.conflict) throw new GwError('CONFLICT', '같은 시간에 이미 예약이 있습니다');
    if (chk.limit) throw new GwError('LIMIT', '예약 한도를 넘었습니다');
    const u = ctx;
    if (!u.empSeq || String(u.empSeq) !== String(loadedEmpSeq)) throw new GwError('IDENTITY', '로그인 정보가 바뀌었습니다. 새로고침 후 다시 시도하세요');
    const body = {resSeq: String(resSeq), reqText: name, apprYn: detail.apprYn, alldayYn: 'N', startDate: start, endDate: end, descText: '', resSubscriberList: [{groupSeq: u.groupSeq, compSeq: u.compSeq, deptSeq: u.deptSeq, empSeq: u.empSeq}], uidList: '', repeatType: '10', repeatEndDay: '', linkSchList: [], newSchList: []};
    if (!WRITE_ALLOWED.has('/schres/rs121A06')) throw new GwError('NOT_ALLOWED', '쓰기 허용 목록 오류');
    let r;
    try { r = await transport('/schres/rs121A06', body, {timeoutMs: 20000}); }
    catch (e) {
      // 응답이 늦어도 서버에는 저장됐을 수 있다: 같은 시간·제목의 내 예약이 있는지 다시 조회해 확인한다(다시 눌러 중복 예약하지 않도록)
      if (e && e.code === 'TIMEOUT') {
        const chk = await resourceBookings({from: start.slice(0, 8), to: start.slice(0, 8), resSeqs: [resSeq]}).catch(() => []);
        if (chk.some(b => b.start === start && b.end === end && b.title === name)) return {ok: true, resSeq: String(resSeq), start, end, title: name, needsApproval: detail.apprYn === 'Y', verifiedAfterTimeout: true};
        throw new GwError('UNKNOWN', '응답이 늦어 저장 여부를 확인하지 못했습니다. 그룹웨어 자원 화면에서 확인한 뒤 다시 시도하세요');
      }
      throw e;
    }
    if (!r || Number(r.successTf) !== 1) throw new GwError('SAVE_FAILED', '서버가 예약을 저장하지 못했습니다');
    return {ok: true, resSeq: String(resSeq), start, end, title: name, needsApproval: detail.apprYn === 'Y'};
  }
  // 앞으로 예정된 휴가·출장·연장근무: 근태/출장 신청 현황(결재 중 포함)을 읽는다. 신청일 기준 최근 150일 안의 신청만 본다.
  async function teamPlanned() {
    const ctx = context();
    const now = new Date(), to = ymd(now), from = ymd(addDays(now, -150));
    const [leave, trip] = await Promise.all([
      call('/human/hrd0220/0hr00001', {coCd: ctx.erpCompSeq, dateFg: '1', appDtFrom: from, appDtTo: to, approStateList: ['0', '1', '5'], deleteRequest: false, noDoc: '', divCdList: [], deptCdList: [], empCdList: [], atItemCdList: [], atCdList: [], htypCdList: [], prtyCdList: [], keyword: '', administrator: false, searchType: 'deptCd'}).catch(() => []),
      call('/human/hrd1130/0hr00004', {coCd: ctx.erpCompSeq, appDtFrom: from, appDtTo: to, startDt: '', endDt: '', divCdList: [], deptCdList: [], empCdList: [], approvalStatusCdList: ['0', '1', '2', '3', '5']}).catch(() => []),
    ]);
    const pick = r => ({empCd: str(r.empCd, 12), korNm: str(r.korNm || r.empNm, 20), deptNm: str(r.deptNm, 30), atNm: str(r.atNm, 30), atItemNm: str(r.atItemNm, 20), startDt: str(r.startDt, 8), endDt: str(r.endDt, 8), startTm: str(r.startTm, 4), endTm: str(r.endTm, 4), appDt: str(r.appDt, 8), appSq: str(r.appSq, 12), approState: str(r.approState, 2), deleteReqYn: str(r.deleteReqYn, 1), docdelYn: str(r.docdelYn, 1)});
    return {apps: [...arr(leave), ...arr(trip)].map(pick), me: String(ctx.erpEmpSeq || '')};
  }
  async function collectAttendance(ctx) {
    const p = kstParts();
    const today = `${p.y}${p.m}${p.d}`;
    const monthFrom = `${p.y}${p.m}01`, monthTo = `${p.y}${p.m}${String(lastDayOfMonth(p.y, p.m)).padStart(2, '0')}`;
    const [todayInfo, month, days] = await Promise.all([
      call('/human/common/judgeTimeManagement/getTodayComeLeaveInfo', {empCd: ctx.erpEmpSeq, coCd: ctx.erpCompSeq, workDt: today}).catch(e => ({error: e.code})),
      call('/personal/hpd0220/0hr00001', {atDtFrom: monthFrom, atDtTo: monthTo}).catch(e => ({error: e.code})),
      attendanceDays({from: monthFrom, to: today}).catch(e => ({error: e.code})),
    ]);
    const mins = v => (v === null || v === undefined || v === '') ? null : num(v);
    return {
      today: {date: today, come: str(todayInfo && todayInfo.comeTm, 12), leave: str(todayInfo && todayInfo.leaveTm, 12), error: todayInfo && todayInfo.error || ''},
      month: {from: monthFrom, to: monthTo, recognizedMin: mins(month.appworkTm), basicMin: mins(month.basicworkTm), overtimeMin: mins(month.overworkTm), exceptMin: mins(month.exceptworkTm), nightMin: mins(month.nightworkTm), error: month.error || ''},
      days: Array.isArray(days) ? days : [], daysError: Array.isArray(days) ? '' : days.error,
      url: LINKS.route(ROUTES.worktime), requestUrl: LINKS.route(ROUTES.attendanceRequest),
    };
  }

  async function collectLeave(ctx) {
    const year = kstParts().y;
    const [sumRaw, usesRaw] = await Promise.all([
      call('/personal/hpd0550/0hp00002', {ycYy: year}),
      call('/personal/hpd0550/0hp00003', {ycYy: year, applyStDt: `${year}0101`, applyEdDt: `${year}1231`}).catch(() => []),
    ]);
    const s = (Array.isArray(sumRaw) ? sumRaw[0] : null) || {};
    // Same formula as the 개인연차현황 screen (checked 2026-11-08: 38.15625 - 31.5625 = 6.59375).
    const granted = num(s.basicDy) + num(s.belowBasicDy) + num(s.basicAdjustDy) + num(s.addDy) + num(s.etcDy) + num(s.rewDy) + num(s.changeDy) + num(s.boBasicDy) + num(s.boRewDy) + num(s.boChangeDy);
    const used = num(s.useDy) + num(s.useRewDy) + num(s.useChangeDy) + num(s.appProcessDy);
    const today = ymd();
    const uses = arr(usesRaw).map(u => ({start: str(u.startDt, 8), end: str(u.endDt, 8), startTime: str(u.startTm, 4), endTime: str(u.endTm, 4), kind: str(u.atNm, 30), days: num(u.ycUseCnt), title: mask(u.titleDc, 120), approved: String(u.approState) === '1', applied: str(u.appDt, 8)}));
    return {
      year, granted: +granted.toFixed(5), used: +used.toFixed(5), remaining: +(granted - used).toFixed(5),
      breakdown: {basic: num(s.basicDy), add: num(s.addDy), reward: num(s.rewDy), change: num(s.changeDy), etc: num(s.etcDy), usedBasic: num(s.useDy), usedReward: num(s.useRewDy), usedChange: num(s.useChangeDy), inApproval: num(s.appProcessDy)},
      upcoming: uses.filter(u => u.end >= today).sort((a, b) => a.start.localeCompare(b.start)), usedCount: uses.length,
      history: uses.sort((a, b) => b.start.localeCompare(a.start)).slice(0, 120),
      url: LINKS.route(ROUTES.leave),
    };
  }

  const budgetRow = r => ({code: str(r.bgtCd, 30), name: str(r.bgtNm, 120), level: str(r.divFgNm, 6), path: str(r.bglistCd, 160), budget: num(r.abgtSumAm), executed: num(r.unitAm), balance: num(r.subAm), rate: num(r.sumRt)});
  async function budgetTable(ctx, t, opt = {}) {
    const year = Number(opt.year || t.year || kstParts().y);
    // 기수(회계기수): 2026년 = 12기 (observed). Override with opt.gisu if the foundation renumbers.
    const gisu = String(opt.gisu || t.gisu || year - 2014);
    const body = {bgtFrYm: `${year}01`, bgtToYm: `${year}12`, bgtBeforeFrYm: '', bgtBeforeToYm: '', bgtStartFrYm: `${year}0101`, summaryYn: 'Y', abgtFg: '1', divCds: `${ctx.erpCompSeq}|`, mgtCds: `${t.project}|`, bottomCds: '', mgtBottomList: [], bgtCnt: '1', abdocuFg: '1', acctdefFg: 'N001', abdocuDtFg: '1', grFg: '0', zeroFg: '2', divFg: '8', sumRtFg: '2', ctrCd05: '3', ctrCd10: '1', optionBN03: '1', optionBN10: '1', optionBN11: '0', optionBN14: '0', pOptionBn15: '0', coCd: ctx.erpCompSeq, gisu, empCd: ctx.erpEmpSeq, gisuFrDt: `${year}0101`, gisuToDt: `${year}1231`};
    const d = await call('/nonprofit/NCC0610/0BN00002', body, {timeoutMs: 30000});
    const all = arr(d && d.printList).map(budgetRow);
    const rows = t.filter ? all.filter(r => r.path.split('|').includes(t.filter)) : all;
    const total = d && d.expendSum ? budgetRow({...d.expendSum, bgtCd: t.project, bgtNm: '합계', divFgNm: '계'}) : null;
    return {project: t.project, label: t.label || '', filter: t.filter || '', year, gisu, period: '누계', total, rows, rowCount: all.length};
  }

  async function collectBudget(ctx, opt) {
    const targets = arr(opt.budget).filter(t => t && t.project);
    if (!targets.length) return {projects: [], skipped: true, url: LINKS.route(ROUTES.budget)};
    const projects = await Promise.all(targets.map(t => budgetTable(ctx, t, {year: opt.budgetYear, gisu: opt.budgetGisu}).then(p => (t.filter ? p : {...p, rows: p.rows.filter(r => ['관', '항'].includes(r.level))})).catch(e => ({project: t.project, label: t.label || '', filter: t.filter || '', error: e.code || 'ERROR', message: e.message, rows: []}))));
    return {projects, url: LINKS.route(ROUTES.budget)};
  }

  async function collectAlerts(ctx, opt) {
    const d = await call('/event/event02A01', {header: {groupSeq: ctx.groupSeq, empSeq: ctx.empSeq}, body: {reqType: '2', reqSubType: 'N', pageSize: String(opt.alertCount), newYn: 'N', mentionYn: 'N', langCode: ctx.langCode, eventType: '', searchType: 'received', timeStamp: Date.now()}});
    const alerts = arr(d && d.alertList).map(a => {
      let data = {};
      try { data = typeof a.data === 'string' ? JSON.parse(a.data) : (a.data || {}); } catch { data = {}; }
      const msg = a.message || {};
      return {type: str(a.eventType, 20), subType: str(a.eventSubType, 20), head: str(msg.alertTitle, 80), title: mask(data.title || msg.alertContent || a.title, 200), docNo: str(data.doc_no, 60), who: str(data.drafter_nm || data.userName || a.senderName, 40), dept: str(data.deptName, 60), time: str(data.rep_dt || a.createDate, 25), read: !!a.readDate, url: a.url && String(a.url).startsWith('/#') ? ORIGIN + a.url : ''};
    });
    return {alerts};
  }

  // ---------- on-demand functions ----------
  async function search(keyword, {types = ['doc', 'mail', 'board', 'file', 'schedule', 'person', 'contact'], pageSize = 10, page = 1, from = '', to = ''} = {}) {
    const kw = String(keyword || '').trim();
    if (kw.length < 2) throw new GwError('BAD_QUERY', '검색어를 두 글자 이상 입력하세요.');
    context();
    const groups = {};
    // The search API filters by date only with YYYY-MM-DD (checked 2026-11-08).
    const dash = s => /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || '');
    const fromD = dash(from), toD = dash(to) || (fromD ? `${kstParts().y}-${kstParts().m}-${kstParts().d}` : '');
    await Promise.all(types.filter(t => SEARCH_TYPES[t]).map(async type => {
      const body = {header: {}, body: {tsearchKeyword: kw, tsearchSubKeyword: '', boardType: SEARCH_TYPES[type], fromDate: fromD, toDate: toD, dateDiv: '', detailSearchYn: fromD ? 'Y' : 'N', selectDiv: 'S', orderDiv: 'B', syncTime: 'N', pageIndex: page, hrSearchYn: 'N', hrEmpSeq: '', pageSize, webMobileDiv: 'W'}};
      try {
        const d = await call('/gw/APIHandler/gw018A02', body, {timeoutMs: 20000});
        const items = arr(d && d.resultgrid).map(x => normalizeSearch(type, x, kw)).filter(Boolean);
        groups[type] = {label: SEARCH_LABELS[type], total: num(d && d.totalcount), items};
      } catch (e) { groups[type] = {label: SEARCH_LABELS[type], total: 0, items: [], error: e.code || 'ERROR', message: e.message}; }
    }));
    return {keyword: kw, page, pageSize, groups, searchedAt: new Date().toISOString()};
  }

  // Search results carry names as {kr, en, ...} objects.
  const ml = v => (v && typeof v === 'object') ? (v.kr || v.ko || Object.values(v).find(x => typeof x === 'string' && x) || '') : v;
  function normalizeSearch(type, x, kw) {
    if (type === 'doc') {
      const form = str(ml(x.formNm), 60);
      const doc = {type, docId: str(x.docId || x.pkSeq, 30), docNo: str(x.docNo, 60), title: mask(x.docTitle, 300), form: form === 'temporary' ? '접수문서' : form, date: str(x.docDate, 20), drafter: str(ml(x.userNm), 40), dept: str(ml(x.deptNm), 60), files: arr(x.fileList).map(f => ({id: str(f.filePath || f.fileId, 60), name: str(f.orignlFileName || f.fileName, 160)})), snippet: snippetAround(x.docContents, kw), text: mask(x.docContents, 6000)};
      doc.url = LINKS.doc(doc);
      return doc;
    }
    if (type === 'mail') return {type, uid: str(x.muid, 30), box: str(x.boxName, 30), subject: mask(x.subject, 300), from: str(x.fromAddrName, 60), to: str(x.toAddrName, 60), date: str(x.rfc822date, 20), size: num(x.size), snippet: snippetAround(x.mailBody, kw)};
    if (type === 'board') {
      const a = {type, id: str(x.artSeqNo || x.pkSeq, 20), cat: str(x.catSeqNo, 20), catType: str(x.catType || 'L', 4), catTitle: str(ml(x.catTitle), 60), title: mask(x.artTitle, 300), writer: str(ml(x.mbrNick), 40), date: str(x.writeDate, 20), files: arr(x.fileList).map(f => ({id: str(f.fileId || f.filePath, 60), name: str(f.orignlFileName || f.fileName, 160)})), snippet: snippetAround(x.artContent, kw), text: mask(x.artContent, 6000)};
      a.url = LINKS.article(a);
      return a;
    }
    if (type === 'file') return {type, fileId: str(x.fileId, 60), name: str(x.fileName, 200), ext: str(x.fileExtsn, 10), size: num(x.fileSize), parent: mask(ml(x.title), 200), owner: str(ml(x.empName) || ml(x.createName), 40), date: str(x.createDate, 20), source: str(x.jobType, 20), url: x.fileId ? LINKS.file(x.fileId) : ''};
    if (type === 'schedule') return {type, id: str(x.schSeq || x.pkSeq, 20), title: mask(x.schTitle, 200), start: str(x.startDate, 20), end: str(x.endDate, 20), snippet: snippetAround(x.contents, kw)};
    if (type === 'person') return {type, name: str(ml(x.empName), 40), dept: str(ml(x.deptName) || ml(x.compDeptName), 80), duty: str(ml(x.dutyName), 30), position: str(ml(x.positionName), 30), tel: str(x.telNum, 30), email: str(x.emailAddr || x.email, 80)};
    if (type === 'contact') return {type, name: str(ml(x.empName) || ml(x.title), 60), company: str(ml(x.compName), 80), dept: str(ml(x.division), 60), rank: str(ml(x.rank), 30), email: str(Array.isArray(x.emailAddress) ? x.emailAddress[0] : x.emailAddress, 80), tel: str(arr(x.compNumberList)[0] && (x.compNumberList[0].number || x.compNumberList[0]), 30)};
    if (type === 'note') return {type, title: mask(x.docName, 200), owner: str(x.ownerName, 40), date: str(x.modDate, 20), snippet: snippetAround(x.content, kw)};
    return null;
  }

  // Foundation budget projects (예: A201 전략경영실운영, A600 산울림청소년센터운영 …).
  async function budgetCatalog() {
    const ctx = context();
    const d = await call('/system/codepickers/CP0001A0001', {helpTy: 'SPJT_CODE', langKind: 'kr', coCd: ctx.erpCompSeq, useYn: '1', name: '', searchText: ''});
    const list = Array.isArray(d) ? d : arr(d && (d.resultList || d.list));
    return list.map(x => ({project: str(x.pjtCd || x.mgtCd, 20), name: str(x.pjtNm || x.mgtNm, 80)})).filter(x => x.project);
  }
  async function budgetProject(t, opt = {}) { return budgetTable(context(), t, opt); }

  async function budgetLedger({project, bgtCd, year, gisu, from, to} = {}) {
    if (!project || !bgtCd) throw new GwError('BAD_QUERY', '프로젝트 코드와 예산과목 코드가 필요합니다.');
    const ctx = context();
    const y = Number(year || kstParts().y);
    const body = {targetDivCd: [ctx.erpCompSeq], searchPeriodFg: '1', searchPeriod: {frDt: from || `${y}0101`, toDt: to || `${y}1231`}, excutionFg: '1', mgtCd: [project], bottomCds: '', mgtBottomList: null, bgtCd: [bgtCd], optionBN01: '2', optionBN02: '1', optionBN03: '1', optionBN11: '0', optionBN14: '0', fgTy02: '', gisu: String(gisu || y - 2014), grFg: '0', printFg: '3'};
    const d = await call('/nonprofit/popup/0BN00001', body, {timeoutMs: 30000});
    const rows = arr(d && d.result).map(r => ({
      date: str(r.gisuDt, 8), desc: mask(r.rmkDc || r.subject, 300), amount: num(r.unitAm), docNo: str(r.noDoc, 60), writer: str(r.korNm, 40), dept: str(r.deptNm, 60),
      slip: str(r.abdIsuNumber || r.slipApprovNum, 40), fillDate: str(r.docuFillDt, 8), code: str(r.bgtCd, 30), name: str(r.bgtNm, 120), authorized: r.isAuthorized !== 'N',
    }));
    return {project, bgtCd, year: y, rows, sum: num(d && d.unitAmSum), checkSum: rows.reduce((s, r) => s + r.amount, 0)};
  }

  // Mail detail: attachments, big-file links and the groupware read-view URL.
  // WARNING: the groupware marks a mail as read when its detail is fetched, so this refuses
  // unread mails unless the caller explicitly accepts that (after asking the user).
  async function mailDetail({uid, seen, allowMarkRead = false} = {}) {
    if (!uid) throw new GwError('BAD_ARG', 'uid가 필요합니다.');
    if (seen !== true && !allowMarkRead) throw new GwError('WOULD_MARK_READ', '안 읽은 메일은 상세를 열면 읽음으로 바뀝니다.');
    const d = await call('/mail/mail002A01', {uid: String(uid)});
    const mime = d.mime || {}, dm = d.decodeMime || {};
    const html = String(mime.body?.html || '');
    const dec = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const bigFiles = [...html.matchAll(/<a[^>]+href="([^"]*mail002A31[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(x => {
      const label = dec(x[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      const m = label.match(/^(.*?)\s*\(([\d.,]+\s*[KMG]?B)\)\s*$/i);
      return {name: m ? m[1] : label, size: m ? m[2] : '', href: dec(x[1])};
    }).filter(f => /^https:\/\/[a-z0-9.-]+\.amaranth10\.co\.kr\//i.test(f.href));
    const bigUntil = (html.replace(/<[^>]+>/g, ' ').match(/다운로드 기간\s*:\s*[\d-]+\s*~\s*([\d-]+)/) || [])[1] || '';
    const files = arr(mime.fileList).map(f => ({name: str(f.originalFileName, 200) + (f.fileExtsn && !String(f.originalFileName || '').toLowerCase().endsWith('.' + String(f.fileExtsn).toLowerCase()) ? '.' + f.fileExtsn : ''), size: num(f.fileSize), ext: str(f.fileExtsn, 10), sn: String(f.fileSn || '')}));
    const plain = dec(String(mime.body?.plain || '').replace(/&nbsp;/g, ' ')).replace(/<\/?[a-z][a-z0-9]*(?:\s[^<>@]{0,200})?\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
    return {uid: String(uid), subject: str(dm.subject, 300), from: dec(str(dm.from, 200)), to: dec(str(dm.to, 2000)), cc: dec(str(dm.cc, 2000)), date: str(dm.date, 20),
      readUrl: str(dm.url, 500), account: str(dm.email, 120), files, bigFiles, bigUntil, text: mask(plain, 4000), wasUnread: seen !== true};
  }
  // Download one normal mail attachment (the same request the groupware read view makes; no state change).
  // Convert one mail attachment into a Synap document-viewer URL (HWP, PDF, xlsx …; read-only).
  async function mailAttachmentPreview({uid, sn, account = ''} = {}) {
    if (!uid || !sn || !account) throw new GwError('BAD_ARG', '미리보기 정보가 없습니다.');
    const ctx = context();
    const client = findClient();
    const res = await client.post('/ecm/ecm001A07', {fileSn: sn, authKeyMap: JSON.stringify({email: account, muid: String(uid), empSeq: String(ctx.empSeq)}), moduleGbn: 'MAIL'});
    const r = typeof res === 'string' ? JSON.parse(res) : res;
    if (!r || r.resultCode !== 0 || !r.resultData) throw new GwError('API_ERROR', (r && r.resultMsg) || '문서 변환 실패');
    return String(r.resultData);
  }
  async function mailAttachment({uid, sn, account = ''} = {}) {
    if (!uid || !sn) throw new GwError('BAD_ARG', '첨부 정보가 없습니다.');
    const ctx = context();
    if (!account) throw new GwError('BAD_ARG', '메일 계정 정보가 없습니다. 메일 상세를 먼저 불러오세요.');
    const client = findClient();
    let timer;
    try {
      const res = await Promise.race([
        client.post('/mail/mail002A37', {fileSn: sn, authKeyMap: JSON.stringify({email: account, muid: String(uid), empSeq: String(ctx.empSeq)}), moduleGbn: 'MAIL'}, {filedownload: true, contextType: 'application/x-www-form-urlencoded'}),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new GwError('TIMEOUT', '첨부 받기 시간 초과')), 120000); }),
      ]);
      if (!(res instanceof ArrayBuffer) || res.byteLength < 1) throw new GwError('API_ERROR', '첨부를 받지 못했습니다.');
      const head = new Uint8Array(res.slice(0, 1))[0];
      if (head === 0x7b && res.byteLength < 2000) { const txt = new TextDecoder().decode(res); if (/resultCode|errors/.test(txt)) throw parseRejection(txt); }
      return new Blob([res]);
    } catch (e) { throw parseRejection(e); }
    finally { clearTimeout(timer); }
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name || 'download';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  async function routingHistory({days = 180, size = 500} = {}) {
    const ctx = context();
    const now = new Date();
    const from = ymd(addDays(now, -days)), to = ymd(now);
    const base = approvalBase(ctx, from, to, Math.min(size, 1000));
    const pick = r => ({title: mask(r.diTitle, 200), sendOrg: str(r.riSendOrgName, 60), sendDept: str(r.riSendDeptName, 60), sendDeptCode: str(r.riSendDeptCode, 20), toDept: str(r.rsDeptName, 60), toEmp: str(r.rsEmpName || r.empName, 40), date: str(r.riArriveDate, 25)});
    const [dist, dept] = await Promise.all([
      call('/ea/ea023A02', {...base, nMenuID: '11002800', pageCode: 'UCA3033', periodPicker: 'riArriveDate', sortField: 'riArriveDate', topSort: 'riArriveDate'}, {timeoutMs: 30000}).then(d => firstList(d).list.map(pick)).catch(() => []),
      call('/ea/ea025A04', {...base, nMenuID: '11002400', pageCode: 'UCA3024', periodPicker: 'riArriveDate', sortField: 'riArriveDate', topSort: 'riArriveDate'}, {timeoutMs: 30000}).then(d => firstList(d).list.map(pick)).catch(() => []),
    ]);
    return {from, to, dist: dist.filter(r => r.toDept), dept: dept.filter(r => r.toEmp), fetchedAt: new Date().toISOString()};
  }

  // Next pages of an approval list (더 보기).
  async function approvalPage(kind, page = 2, {days = 92, size = 30} = {}) {
    const def = APPROVAL_LISTS.find(d => d.key === kind);
    if (!def) throw new GwError('BAD_QUERY', `알 수 없는 목록: ${kind}`);
    const ctx = context();
    const now = new Date();
    const from = ymd(addDays(now, -days)), to = ymd(now);
    const body = {...approvalBase(ctx, from, to, size), page: String(page), nMenuID: def.menu, pageCode: def.page, periodPicker: def.period, sortField: def.period, topSort: def.period, ...(def.extra || {})};
    const {list, total} = firstList(await call(def.api, body));
    return {kind, page, total, docs: list.map(r => toDoc(r, kind))};
  }

  // Preview of an approval document from the search index: no popup is opened, so no 열람 record.
  async function docPreview({docNo = '', title = ''} = {}) {
    // Search by document number when there is one (fast and exact); otherwise by title.
    const tries = (docNo ? [docNo] : [title && title.replace(/[\[\]()「」『』]/g, ' ').trim().slice(0, 40)]).filter(t => t && t.length >= 2);
    for (const q of tries) {
      const r = await search(q, {types: ['doc'], pageSize: 10}).catch(() => null);
      const items = r && r.groups.doc ? r.groups.doc.items : [];
      const hit = items.find(x => docNo && x.docNo === docNo) || items.find(x => title && x.title.replace(/\s/g, '') === title.replace(/\s/g, ''));
      if (hit) return {found: true, ...hit};
    }
    return {found: false};
  }

  // Forms I actually use (from my submitted documents) + the foundation's recommended forms.
  async function frequentForms({days = 180} = {}) {
    const ctx = context();
    const now = new Date();
    const from = ymd(addDays(now, -days)), to = ymd(now);
    const [mine, rec] = await Promise.all([
      call('/ea/ea038A09', {...approvalBase(ctx, from, to, 200), nMenuID: '11000300', pageCode: 'UCA1020', periodPicker: 'diWriteDate', sortField: 'diWriteDate', topSort: 'diWriteDate', searchSts: '002'}).then(d => firstList(d).list).catch(() => []),
      call('/ea/ea059A02', {}).catch(() => []),
    ]);
    const count = new Map();
    for (const r of mine) {
      const id = str(r.tiKeyCode, 40), name = str(r.tiName, 60);
      if (!id || !name || name === '-' || id === '0000000001') continue;
      const e = count.get(id) || {formId: id, name, count: 0, last: ''};
      e.count++; if (str(r.diWriteDate, 20) > e.last) e.last = str(r.diWriteDate, 20);
      count.set(id, e);
    }
    for (const f of arr(rec)) { const id = str(f.form_id, 40); if (id && !count.has(id)) count.set(id, {formId: id, name: str(f.form_name, 60), count: 0, last: '', recommended: true}); }
    return [...count.values()].sort((a, b) => b.count - a.count).map(f => {
      const fid = String(f.formId || '');
      const isHr = /^(36|40|43|1012|1021)$/.test(fid) || /휴가|출장|근태|연장|대체/.test(f.name);
      const isErp = /^(1007|1009|1011|1013)$/.test(fid) || /지출결의|구입과지출/.test(f.name);
      return {
        ...f,
        isHr, isErp,
        isStandalone: !isHr && !isErp,
        url: LINKS.draft(f.formId, f.name)
      };
    });
  }

  // Executed amount per month for one budget code (and its children) — 12 parallel calls.
  async function budgetMonthly({project, code, year} = {}) {
    if (!project) throw new GwError('BAD_QUERY', '프로젝트 코드가 필요합니다.');
    const ctx = context();
    const y = Number(year || kstParts().y);
    const months = Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0'));
    const res = await Promise.all(months.map(m => call('/nonprofit/NCC0610/0BN00002', {bgtFrYm: `${y}${m}`, bgtToYm: `${y}${m}`, bgtBeforeFrYm: '', bgtBeforeToYm: '', bgtStartFrYm: `${y}0101`, summaryYn: 'N', abgtFg: '1', divCds: `${ctx.erpCompSeq}|`, mgtCds: `${project}|`, bottomCds: '', mgtBottomList: [], bgtCnt: '1', abdocuFg: '1', acctdefFg: 'N001', abdocuDtFg: '1', grFg: '0', zeroFg: '2', divFg: '8', sumRtFg: '2', ctrCd05: '3', ctrCd10: '1', optionBN03: '1', optionBN10: '1', optionBN11: '0', optionBN14: '0', pOptionBn15: '0', coCd: ctx.erpCompSeq, gisu: String(y - 2014), empCd: ctx.erpEmpSeq, gisuFrDt: `${y}0101`, gisuToDt: `${y}1231`}, {timeoutMs: 30000})
      .then(d => { const rows = arr(d && d.printList).map(budgetRow); const sel = code ? rows.filter(r => r.path.split('|').includes(code)) : rows; return {month: m, rows: sel}; })
      .catch(e => ({month: m, error: e.code}))));
    return {project, code, year: y, months: res};
  }

  // Did I send a reply to this mail? Looks for "Re:/RE:/회신:" + same subject in 보낸메일함 after `since`.
  async function findReply({subject = '', since = ''} = {}) {
    const boxes = arr((await call('/mail/mail000A01')).mailboxList);
    const sent = boxes.find(b => b.name === 'SENT');
    if (!sent) return {checked: false};
    const d = await call('/mail/mail003A01', {boxName: 'SENT', mainApiCode: 'mail003A01', mboxSeq: sent.mboxSeq, page: 1, pageSize: 50, sort: 'rfc822date', sortType: 'desc', listType: '', showType: '', seen: false});
    const norm = s => String(s || '').replace(/^\s*((re|fw|fwd|회신|답장|전달)\s*[:：]\s*)+/i, '').replace(/\s+/g, '').toLowerCase();
    const want = norm(subject);
    const hit = arr(d && d.Records).find(r => norm(r.subject) === want && (!since || str(r.tooltipDate || r.rfc822date, 25) >= since));
    return {
      checked: true,
      found: !!hit,
      uid: hit ? hit.muid : null,
      subject: hit ? mask(hit.subject, 200) : '',
      date: hit ? str(hit.tooltipDate || hit.rfc822date, 25) : '',
      to: hit ? str(hit.toAddrName, 60) : '',
      hasAttach: hit ? !!hit.attach : false,
      size: hit ? num(hit.size) : 0
    };
  }

  async function submittedRange({days = 7, size = 100, from: f0 = '', to: t0 = ''} = {}) {
    const ctx = context();
    const now = new Date();
    const ok8 = s => /^\d{8}$/.test(String(s || ''));
    const from = ok8(f0) ? f0 : ymd(addDays(now, -days)), to = ok8(t0) ? t0 : ymd(now);
    const d = await call('/ea/ea038A09', {...approvalBase(ctx, from, to, size), nMenuID: '11000300', pageCode: 'UCA1020', periodPicker: 'diWriteDate', sortField: 'diWriteDate', topSort: 'diWriteDate', searchSts: '002'});
    return {from, to, docs: firstList(d).list.map(r => toDoc(r, 'submitted'))};
  }

  const MODULES = {mail: collectMail, approval: collectApproval, notice: collectNotice, schedule: collectSchedule, attendance: collectAttendance, leave: collectLeave, budget: collectBudget, alerts: collectAlerts};
  const DEFAULTS = {
    modules: Object.keys(MODULES), mailCount: 100, days: 14, approvalDays: 92, approvalPageSize: 30, noticeCount: 20, noticeBoard: '223', alertCount: 20,
    budget: [{project: 'A201', label: '젠더유스 거버넌스운영', filter: '노121'}],
  };

  async function collect(options = {}) {
    const opt = {...DEFAULTS, ...options};
    const started = performance.now();
    const ctx = context();
    findClient();
    const data = {}, status = {};
    await Promise.all(opt.modules.filter(m => MODULES[m]).map(async name => {
      const t0 = performance.now();
      try { data[name] = await MODULES[name](ctx, opt); status[name] = {ok: true, ms: Math.round(performance.now() - t0)}; }
      catch (e) { const err = parseRejection(e); status[name] = {ok: false, ms: Math.round(performance.now() - t0), error: err.code, message: err.message}; }
    }));
    const expired = Object.values(status).some(s => s.error === 'SESSION_EXPIRED');
    return {
      schemaVersion: 1, collector: VERSION, origin: ORIGIN, collectedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started),
      sessionExpired: expired,
      principal: {empSeq: ctx.empSeq, loginId: ctx.loginId, name: ctx.name, deptSeq: ctx.deptSeq, deptName: ctx.deptName, compSeq: ctx.compSeq, compName: ctx.compName, position: ctx.position, duty: ctx.duty},
      options: {modules: opt.modules, mailCount: opt.mailCount, days: opt.days, approvalDays: opt.approvalDays, noticeCount: opt.noticeCount, budget: opt.budget},
      status, data,
    };
  }

  window.BWYFGW = Object.freeze({
    version: VERSION, collect, call, search, budgetCatalog, budgetProject, budgetLedger, budgetMonthly, attendanceDays, teamAttendance, teamPlanned, resourceList, resourceBookings, resourceDetail, resourceCheck, reserveResource, routingHistory, submittedRange, approvalPage, docPreview, frequentForms, findReply, mailDetail, mailAttachment, mailAttachmentPreview, saveBlob,
    context: () => { const c = context(); return {name: c.name, deptName: c.deptName, compName: c.compName, duty: c.duty, position: c.position}; },
    readOnlyEndpoints: () => [...READ_ONLY], routes: ROUTES, links: LINKS, searchLabels: SEARCH_LABELS, defaults: DEFAULTS,
  });
})();
