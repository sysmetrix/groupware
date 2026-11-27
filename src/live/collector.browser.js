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
  const VERSION = '1.30.0';
  const ORIGIN = 'https://gw.bwyf.or.kr';

  // Endpoints verified on 2026-11-08 as list/read/search calls issued by the app itself.
  const READ_ONLY = new Set([
  // 자원(회의실·차량) 조회: 목록, 예약 현황, 자원 상세, 중복·한도 확인(POST지만 읽기 전용), 속성/옵션, 나의예약현황(rs121A08, v1.26 승인 여부 확인)
  '/schres/rs121A01', '/schres/rs121A04', '/schres/rs121A05', '/schres/rs121A42', '/schres/rs121A49', '/schres/rs121A24', '/schres/rs121A10', '/schres/rs121A08',
    '/mail/mail000A01', '/mail/mail000A03', '/mail/mail003A01', '/mail/mail002A01', '/mail/mail002A37', '/mail/mail002A30', '/ecm/ecm001A07', '/ecm/ecm001A04',
    '/ea/api/getMenuCountInfo', '/ea/ea036A02', '/ea/ea025A04', '/ea/ea023A02', '/ea/ea027A02',
    '/ea/ea038A09', '/ea/ea038A15',
    '/board/APIHandler/ViewBoardArtList', '/board/APIHandler/getBoardReadCnt',
    '/schres/sc111A02', '/schres/sc111A03', '/gw/APIHandler/gw114A14',
    '/human/common/judgeTimeManagement/getTodayComeLeaveInfo', '/personal/hpd0220/0hr00001', '/human/hrd0410/selectTab2', '/human/hrd1130/0hr00004', '/human/hrd0220/0hr00001',
    '/personal/hpd0550/0hp00002', '/personal/hpd0550/0hp00003',
    '/nonprofit/NCC0610/0BN00002', '/nonprofit/popup/0BN00001', '/system/codepickers/CP0001A0001',
    '/event/event02A01',
    '/gw/APIHandler/gw018A02', '/gw/APIHandler/gw102A01', '/gw/APIHandler/gw102A02',
    '/ea/ea059A02',
    // v1.17 개인 ToDo(업무관리) 목록·상세. 그룹웨어 일정 화면의 ToDo 패널이 부르는 조회 주소(2026-11-21 확인).
    '/kiss/APIHandler/prj001A12', '/kiss/APIHandler/prj001A05',
    // v1.20.1 ToDo 댓글 목록. 그룹웨어 ToDo 상세의 댓글 칸이 부르는 조회 주소(2026-11-22 확인). 댓글 쓰기는 그룹웨어에서 한다.
    '/gw/api/gw026A03',
    // v1.21 카드 사용내역. 지출결의서 채주정보의 [카드승인내역] 창이 부르는 조회 주소(2026-11-25 확인). 그룹웨어가 요청·응답을 암호화하는 주소라 cardUsage()에서만 부른다.
    '/nonprofit/cardAuth/0BN00001',
  // v1.22 전자세금계산서 발행내역. 지출결의서 채주정보의 [전자(세금)계산서발행내역] 창이 부르는 조회 주소(2026-11-25 확인, 요청·응답 모두 평문).
  '/nonprofit/etaxAuth/0BN00001',
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

  const NET_ERR = /failed to fetch|network|load failed|abort|econnreset|etimedout|epipe|socket hang up|offline|네트워크|통신\s*오류|연결.*끊|\b50[234]\b|bad gateway|service unavailable|gateway timeout/i;
  const UNK_HEAD = '통신 오류 또는 응답 지연으로 ';
  const isUnk = e => !!(e && (e.code === 'TIMEOUT' || e.uncertain));
  function parseRejection(reason) {
    if (reason instanceof GwError) { if (reason.code === 'TIMEOUT') reason.uncertain = true; return reason; }
    const text = typeof reason === 'string' ? reason : (reason && reason.message) || (reason && typeof reason === 'object' ? JSON.stringify(reason) : String(reason));
    try {
      const j = JSON.parse(text);
      const code = j && (j.errors && j.errors.code || j.resultCode || j.errorCode || j.status);
      const msg = j && (j.errors && j.errors.message || j.resultMsg || j.errorMsg || j.error) || '';
      if (code === 'E002' || /Token is not exists|Session is not exists/i.test(msg)) return new GwError('SESSION_EXPIRED', '그룹웨어 로그인 세션이 만료되었습니다.');
      if (code === 601) return new GwError('ORIGIN_REJECTED', '허용된 쿠키 인증 URL이 아닙니다(601).');
      const err = new GwError('API_ERROR', `${code || ''} ${msg}`.trim() || 'API 오류');
      if (/^50[234]$/.test(String(code ?? '')) || (j && (/^50[234]$/.test(String(j.status || '')) || (j.status === 0 && j.resultCode === undefined)))) err.uncertain = true;
      return err;
    } catch {
      const st = reason && (reason.status ?? (reason.response && reason.response.status));
      const err = new GwError('API_ERROR', text.slice(0, 200));
      if (NET_ERR.test(`${reason && reason.name || ''} ${reason && reason.code || ''} ${st ?? ''} ${text}`) || st === 0 || (reason && /^(Type|Abort)Error$/.test(reason.name))) err.uncertain = true;
      return err;
    }
  }

  // 쓰기는 이 목록의 주소만, 전용 함수(reserveResource)에서만 허용한다. 상신·결재·삭제·발송 계열은 여기에 절대 넣지 않는다.
  // v1.17: 개인 ToDo 만들기(A01)·고치기(A02)·지우기(A03)·완료(A07). todo* 전용 함수에서만, 내가 만든 내 개인 ToDo에만 쓴다.
  const WRITE_ALLOWED = new Set(['/ecm/ecm001A01', '/schres/rs121A06', '/kiss/APIHandler/prj001A01', '/kiss/APIHandler/prj001A02', '/kiss/APIHandler/prj001A03', '/kiss/APIHandler/prj001A07', '/kiss/APIHandler/prj001A09', '/event/event02A03']);
  const INTERNAL_CALL = Symbol('internalCall');
  async function call(path, body = {}, opts = {}) {
    if (!READ_ONLY.has(path)) throw new GwError('NOT_ALLOWED', `읽기 전용 허용 목록에 없는 API입니다: ${path}`);
    if (path === '/mail/mail002A01' && opts[INTERNAL_CALL] !== true) throw new GwError('USE_MAIL_DETAIL', '메일 상세는 읽음 보호 확인을 위해 mailDetail()로만 조회하세요.');
    return transport(path, body, opts);
  }
  async function transport(path, body = {}, {timeoutMs = 15000, retries = 1, encrypt = false} = {}) {
    const client = findClient();
    for (let attempt = 0; attempt <= retries; attempt++) {
      let timer;
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      try {
        const res = await Promise.race([
          client.post(path, body, {contextType: path === '/ecm/ecm001A01' ? 'multipart/form-data' : 'application/json', ...(encrypt ? {encrypt: true} : {}), ...(ac ? {signal: ac.signal} : {})}),
          new Promise((_, reject) => { timer = setTimeout(() => { try { ac && ac.abort(); } catch {} reject(new GwError('TIMEOUT', `${path} 응답 시간 초과`)); }, timeoutMs); }),
        ]);
        let r;
        try { r = typeof res === 'string' ? JSON.parse(res) : res; }
        catch { const err = new GwError('API_ERROR', `${path}: 응답 형식 오류`); err.uncertain = true; throw err; }
        if (!r || (r.resultCode !== 0 && r.resultCode !== 200 && r.resultCode !== 'SUCCESS')) {
          const err = new GwError('API_ERROR', `${path}: ${r && r.resultCode} ${r && r.resultMsg || ''}`.trim());
          if (r && /^50[234]$/.test(String(r.resultCode || r.status || ''))) err.uncertain = true;
          throw err;
        }
        return r.resultData;
      } catch (e) {
        const err = parseRejection(e);
        const transient = (err.code === 'TIMEOUT' || /50[0234]|network|fetch/i.test(err.message)) && attempt < retries && !WRITE_ALLOWED.has(path);
        if (transient) { await new Promise(r => setTimeout(r, 350 * (attempt + 1))); continue; }
        throw err;
      } finally { clearTimeout(timer); }
    }
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
  // 영문 낱말은 앞뒤가 글자가 아닐 때만 본다("groupware" 안의 pw를 비밀번호로 잘못 가리지 않게).
  const SECRET = /((?:비밀\s*번호|비번|패스워드|임시\s*번호|인증\s*번호|(?<![A-Za-z])(?:password|passwd|pwd|pw|OTP)(?![A-Za-z]))\s*[:：=]?\s*)(\S+)/gi;
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

  // 이 화면에서 처음 확인한 로그인 사용자. 스크립트가 로그인 화면(같은 문서의 #/ 경로)에서 먼저 실렸다가 그대로 로그인하는 경우가 있어,
  // 실릴 때가 아니라 로그인 정보를 처음 읽은 때 기록한다. 그 뒤 다른 사용자로 바뀌면 쓰기를 막는다.
  let loadedEmpSeq = '';
  function context() {
    let ui;
    try { ui = JSON.parse(sessionStorage.getItem('userInfo') || 'null'); } catch { ui = null; }
    let u = ui && ui.ucUserInfo;
    if (typeof u === 'string') { try { u = JSON.parse(u); } catch { u = null; } }
    if (!u || !u.empSeq) throw new GwError('NOT_LOGGED_IN', '그룹웨어에 로그인되어 있지 않습니다.');
    if (!loadedEmpSeq) loadedEmpSeq = String(u.empSeq);
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
      if (!Array.isArray(d?.Records)) throw new Error('메일 목록을 확인할 수 없습니다.');
      const records = d.Records.map(r => toMail(r, box.name));
      return {total: num(d && d.TotalRecordCount), unseen: num(d && d.TotalUnseenCount), records: unseenOnly ? records.filter(r => !r.seen) : records};
    };
    const inboxData = await list(inbox, Math.min(Math.max(opt.mailCount, 10), 200));
    const extra = boxes.filter(b => !['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM'].includes(b.name) && b.unseen > 0);
    const others = await Promise.all(extra.map(b => list(b, 30, true).then(x => x.records).catch(() => null)));
    return {boxes, inbox: {total: inboxData.total, unseen: inboxData.unseen, fetched: inboxData.records.length, records: inboxData.records}, partial: others.includes(null), otherUnseen: others.filter(Boolean).flat(), url: LINKS.route(ROUTES.mail)};
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
    // delYn은 '내가 지울 수 있음'(내 일정은 'Y')이다. 지운 일정은 휴지통으로 가 목록에 오지 않으므로 거르지 않는다.
    const events = arr(rows && rows.resultList).map(r => ({
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
    const lists = await Promise.all(chunks.map(ids => call('/human/hrd0410/selectTab2', {admin: true, appWorkTm: -1, appWorkTmFlag: '1', atDtTo: to, atDtFrom: from, empArr: ids, isIncludeHoliday: true, searchType: '1'})));
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
    if (!Array.isArray(d?.resultList)) throw new GwError('API_ERROR', '자원 예약 목록 형식을 확인할 수 없습니다');
    return d.resultList.map(r => ({resSeq: str(r.resSeq, 12), seqNum: str(r.seqNum, 12), name: str(r.resName, 60), title: str(r.reqText || r.resTitleDisplay, 120), start: str(r.resStartDate || r.startDate, 12), end: str(r.resEndDate || r.endDate, 12), status: str(r.statusCode, 4), who: str(r.empName || r.createName || r.reqEmpName, 20), mine: !!r.mineYn || undefined, raw: undefined}));
  }
  async function resourceDetail(resSeq) {
    const d = await call('/schres/rs121A42', {resSeq: String(resSeq)});
    return {resSeq: String(resSeq), name: str(d && d.resName, 60), apprYn: str(d && d.apprYn, 1), limitMin: num(String((d && d.limitReservationRange) || '').replace(/,/g, '')), raw: undefined};
  }
  // v1.26 나의예약현황(그룹웨어 자원 > 나의예약현황과 같은 조회). 상태: RE 승인요청 · CO 승인완료 · RC 예약완료 · RJ 반려 · CR 승인취소 · CA 취소 · AC 자동취소
  async function myReservations({from, to}) {
    if (!/^\d{8}$/.test(String(from)) || !/^\d{8}$/.test(String(to))) throw new GwError('BAD_INPUT', '조회 기간이 올바르지 않습니다');
    const c = context();
    const d = await call('/schres/rs121A08', {companyInfo: {compSeq: c.compSeq, groupSeq: c.groupSeq, deptSeq: c.deptSeq, emailAddr: c.emailAddr, emailDomain: c.emailDomain}, menuAuth: 'USER', attrSeq: 'A', startDate: String(from), endDate: String(to), statusCode: '', sechText: '', pageNum: 1, pageSize: 50, myResYn: 'N', langCode: c.langCode});
    if (!Array.isArray(d?.resourceSearchList)) throw new GwError('API_ERROR', '나의예약현황 형식을 확인할 수 없습니다');
    return d.resourceSearchList.filter(r => r && (r.myResYn === 'Y' || String(r.createSeq || '') === String(c.empSeq))).map(r => ({resSeq: str(r.resSeq, 12), seqNum: str(r.seqNum, 12), name: str(r.resName, 60), title: str(r.reqText, 120), start: str(r.startDate, 12), end: str(r.endDate, 12), status: str(r.statusCode, 4), desc: str(r.descText, 120), createdAt: str(r.createDate, 14)}));
  }
  async function resourceCheck({resSeq, start, end}) {
    const d = await call('/schres/rs121A04', {resSeq: String(resSeq), startDate: start, endDate: end, alldayYn: 'N', resStartDate: start.slice(0, 8)});
    return {conflict: d && d.reservationYn === 'Y', limit: d && d.limitYn === 'Y'};
  }
  // 예약 등록: 입력 검증, 과거 시간 거부, 중복·한도 확인 후에만 저장한다. 성공 여부는 서버 응답(successTf)으로 판단한다.
  try { context(); } catch { /* 아직 로그인 전: 처음 로그인 정보를 읽을 때 기록한다 */ }
  let reserveBusy = false;
  async function reserveResource({resSeq, title, start, end, desc = ''}) {
    // 사용자가 방금 직접 클릭한 경우에만 실행한다(페이지 스크립트가 몰래 부르는 것을 막는다). 동시에 두 번 실행되지 않게 잠근다.
    if (!(navigator.userActivation && navigator.userActivation.isActive)) throw new GwError('NO_GESTURE', '화면에서 직접 누른 경우에만 예약할 수 있습니다');
    if (reserveBusy) throw new GwError('BUSY', '이미 예약을 처리하고 있습니다');
    reserveBusy = true;
    try { return await reserveResourceInner({resSeq, title, start, end, desc}); } finally { reserveBusy = false; }
  }
  async function reserveResourceInner({resSeq, title, start, end, desc = ''}) {
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
    // v1.26: 그룹웨어 자원 예약 창이 보내는 값과 같게 회사 정보(companyInfo)·언어(langCode)·내용(descText)을 함께 보낸다.
    const body = {companyInfo: {compSeq: u.compSeq, groupSeq: u.groupSeq, deptSeq: u.deptSeq, emailAddr: u.emailAddr, emailDomain: u.emailDomain}, resSeq: String(resSeq), reqText: name, apprYn: detail.apprYn, alldayYn: 'N', startDate: start, endDate: end, descText: String(desc || '').replace(/\r\n/g, '\n').slice(0, 1000), resSubscriberList: [{groupSeq: u.groupSeq, compSeq: u.compSeq, deptSeq: u.deptSeq, empSeq: u.empSeq}], uidList: '', repeatType: '10', repeatEndDay: '', linkSchList: [], newSchList: [], langCode: u.langCode || 'kr'};
    if (!WRITE_ALLOWED.has('/schres/rs121A06')) throw new GwError('NOT_ALLOWED', '쓰기 허용 목록 오류');
    let r;
    try { r = await transport('/schres/rs121A06', body, {timeoutMs: 20000, retries: 0}); }
    catch (e) {
      if (isUnk(e)) throw new GwError('UNKNOWN', UNK_HEAD + '저장 여부를 확인하지 못했습니다. 그룹웨어 자원 화면에서 확인한 뒤 다시 시도하세요');
      throw e;
    }
    if (!r || Number(r.successTf) !== 1) throw new GwError('SAVE_FAILED', '서버가 예약을 저장하지 못했습니다');
    return {ok: true, resSeq: String(resSeq), start, end, title: name, needsApproval: detail.apprYn === 'Y'};
  }
  // ---------- v1.17 개인 ToDo (그룹웨어 업무관리 ToDo) ----------
  // 읽기: 전체 목록(완료 포함, 하위 ToDo는 children). 쓰기: 아래 전용 함수만. 고치기·완료·지우기 전에 상세를 읽어
  // 내가 담당자이자 만든 사람인 개인 ToDo(프로젝트 없음)인지 확인한다. 폭주를 막으려고 1분에 40번까지만 쓴다.
  const TODO_P = '/kiss/APIHandler/';
  const todoWrites = [];
  function todoBudget() {
    const now = Date.now();
    while (todoWrites.length && now - todoWrites[0] > 60000) todoWrites.shift();
    if (todoWrites.length >= 40) throw new GwError('RATE', 'ToDo를 너무 자주 바꾸고 있어 잠시 멈췄습니다. 1분 뒤 다시 시도하세요');
    todoWrites.push(now);
  }
  const todoYmd = v => { const s = String(v || '').replace(/[^0-9]/g, ''); if (!s) return ''; if (!/^\d{8}$/.test(s)) throw new GwError('BAD_INPUT', '날짜가 올바르지 않습니다'); const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))); if (d.toISOString().slice(0, 10).replace(/-/g, '') !== s) throw new GwError('BAD_INPUT', '존재하지 않는 날짜입니다'); return s; };
  const todoName = v => { const s = String(v || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim(); if (!s) throw new GwError('BAD_INPUT', '할 일 제목을 입력하세요'); if (s.length > 100) throw new GwError('BAD_INPUT', '제목은 100자까지 쓸 수 있습니다'); return s; };
  const todoText = v => { const s = String(v ?? '').replace(/\r\n/g, '\n'); if (s.length > 1500) throw new GwError('BAD_INPUT', '메모와 정보가 1,500자를 넘습니다'); return s; };
  const todoId = v => { const s = String(v || ''); if (!/^td\d{1,12}$/.test(s)) throw new GwError('BAD_INPUT', 'ToDo 번호가 올바르지 않습니다'); return s; };
  // 중요도는 그룹웨어 값 그대로: 1 즉시, 3 긴급, 2 중요, 0 일반. 예전 호출의 important(참/거짓)는 '중요'(2)로 받는다.
  const todoImp = (importance, important) => { if (importance !== undefined && importance !== null && importance !== '') { const s = String(importance); if (!/^[0-3]$/.test(s)) throw new GwError('BAD_INPUT', '중요도가 올바르지 않습니다'); return s; } return important ? '2' : '0'; };
  const todoRate = v => { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 100) throw new GwError('BAD_INPUT', '진행률은 0~100 사이 정수입니다'); return n; };
  const todoHours = v => { const s = String(v ?? '').trim(); if (!s) return ''; if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(s)) throw new GwError('BAD_INPUT', '투입공수는 0 이상의 숫자로 소수 둘째 자리까지 입력하세요'); return Number(s) === 0 ? '' : s; };
  function todoRow(r) {
    return {todoSeq: str(r.todoSeq, 20), todoName: str(r.todoName, 200), startDate: str(r.startDate, 8), endDate: str(r.endDate, 8), completeDate: str(r.completeDate, 8), createDate: str(r.createDate, 8), modifyDate: str(r.modifyDate, 8),
      todoStatus: str(r.todoStatus, 2), processRate: num(r.processRate), importDegree: str(r.importDegree, 2), contents: String(r.contents || '').slice(0, 4000), todoLevel: num(r.todoLevel) || 1, prtSeq: str(r.prtSeq, 20), prjSeq: str(r.prjSeq, 30),
      ownerEmpSeq: str(r.ownerEmpSeq, 20), createEmpSeq: str(r.createEmpSeq, 20), loginUserTodoOwnerYn: str(r.loginUserTodoOwnerYn, 1), loginUserTodoCreateYn: str(r.loginUserTodoCreateYn, 1), fileCount: num(r.fileCount),
      ownerEmpName: str(r.ownerEmpName, 40), createEmpName: str(r.createEmpName, 40), prjName: str(r.prjName, 100), proccessYn: str(r.proccessYn, 1), replyCount: num(r.replyCount), dDayYn: str(r.dDayYn, 1), manHour: r.manHour === undefined ? null : String(r.manHour ?? ''), todoOrd: num(r.todoOrd),
      children: (Array.isArray(r.children) ? r.children : []).map(todoRow)};
  }
  async function todoList() {
    context();
    const d = await call(TODO_P + 'prj001A12', {startDate: '20000101', endDate: '20991231', todoName: ''}, {timeoutMs: 15000});
    const list = Array.isArray(d && d.todoList) ? d.todoList : null;
    if (!list) throw new GwError('API_ERROR', 'ToDo 목록 형식이 바뀌었습니다');
    const total = Number(d.totalCnt);
    return {todos: list.map(todoRow), total: Number.isFinite(total) ? total : list.length, complete: !Number.isFinite(total) || total <= list.length, at: new Date().toISOString(), url: LINKS.route(ROUTES.schedule)};
  }
  async function todoDetail(id) {
    const d = await call(TODO_P + 'prj001A05', {todoSeq: todoId(id)});
    if (!d || String(d.todoSeq) !== String(id)) throw new GwError('NOT_FOUND', '그룹웨어에서 이 ToDo를 찾지 못했습니다(다른 곳에서 지웠을 수 있습니다)');
    return d;
  }
  async function todoOwned(id) {
    const ctx = context();
    if (!ctx.empSeq || String(ctx.empSeq) !== String(loadedEmpSeq)) throw new GwError('IDENTITY', '로그인 정보가 바뀌었습니다. 새로고침 후 다시 시도하세요');
    const d = await todoDetail(id);
    if (d.loginUserTodoOwnerYn !== 'Y' || d.loginUserTodoCreateYn !== 'Y' || String(d.ownerEmpSeq) !== String(ctx.empSeq) || String(d.createEmpSeq) !== String(ctx.empSeq) || d.prjSeq) throw new GwError('NOT_MINE', '내가 만든 개인 ToDo만 GW 비서에서 바꿀 수 있습니다');
    return {ctx, d};
  }
  // 담당자 확인: 내가 담당자이고 그룹웨어가 진행 처리를 허용한 ToDo(다른 사람이 준 것·프로젝트 ToDo 포함). 그룹웨어 화면에서도 담당자는 진행률·완료를 바꾼다.
  async function todoAssigned(id) {
    const ctx = context();
    if (!ctx.empSeq || String(ctx.empSeq) !== String(loadedEmpSeq)) throw new GwError('IDENTITY', '로그인 정보가 바뀌었습니다. 새로고침 후 다시 시도하세요');
    const d = await todoDetail(id);
    if (d.loginUserTodoOwnerYn !== 'Y' || String(d.ownerEmpSeq) !== String(ctx.empSeq) || d.proccessYn === 'N') throw new GwError('NOT_MINE', '내가 담당자인 ToDo만 진행률을 바꿀 수 있습니다');
    return {ctx, d};
  }
  const todoWrite = async (path, body) => {
    if (!WRITE_ALLOWED.has(path)) throw new GwError('NOT_ALLOWED', '쓰기 허용 목록 오류');
    todoBudget();
    try { return await transport(path, body, {timeoutMs: 20000, retries: 0}); }
    catch (e) {
      if (isUnk(e) && !path.endsWith('A01')) throw new GwError('UNKNOWN', UNK_HEAD + '반영 여부를 확인하지 못했습니다. 목록을 새로 고쳐 확인하세요');
      throw e;
    }
  };
  // KISS fileList[].fileSn → ECM A04 → 저장용 fileId. 일부만 복원한 채 저장하면 기존 첨부가 사라진다.
  const attachError = () => new GwError('ATTACHMENT', '첨부 목록을 모두 확인하지 못해 ToDo를 저장하지 않았습니다. 그룹웨어에서 확인해 주세요');
  const validAttachId = id => (typeof id === 'string' && id.trim() === id && id !== '' && !id.includes(',')) || (Number.isSafeInteger(id) && id > 0);
  function todoFileSns(d) {
    const list = d.fileList;
    if (list != null && !Array.isArray(list) || list == null && ![0, '0'].includes(d.fileCount)) throw attachError();
    const sns = (list || []).map(x => x && x.fileSn);
    if (d.fileCount != null && (!/^\d+$/.test(String(d.fileCount)) || Number(d.fileCount) !== sns.length) || sns.some(x => !validAttachId(x)) || new Set(sns.map(String)).size !== sns.length) throw attachError();
    return sns;
  }
  function checkedFileIds(data, n) {
    const ids = Array.isArray(data?.list) ? data.list.map(row => row?.fileId) : [];
    if (ids.length !== n || ids.some(x => !validAttachId(x)) || new Set(ids.map(String)).size !== n) throw attachError();
    return ids.map(String);
  }
  async function todoExistingIds(d, ctx, sns) {
    if (!sns.length) return [];
    const authKeyMap = JSON.stringify({empSeq: ctx.empSeq, prjSeq: d.prjSeq || '', todoSeq: d.todoSeq, issueSeq: d.issueSeq || '', menuAuthType: d.menuAuthType || '', searchAuthType: d.searchAuthType || ''});
    const data = await call('/ecm/ecm001A04', {moduleGbn: 'PROJECT', authKeyMap, fileSn: sns, condition: '99'});
    const ids = checkedFileIds(data, sns.length);
    // 원본 업로더는 반환 순서에 fileSn을 매긴다. 서버가 일련번호도 보냈다면 반드시 대조한다.
    if (data.list.some((row, i) => row.fileSn != null && String(row.fileSn) !== String(sns[i]))) throw attachError();
    return ids;
  }
  // 같은 편집기의 같은 파일 선택은 업로드 결과(불확실한 실패 포함)를 메모리에만 보관한다.
  // 할 일 쓰기 실패 후 저장을 눌러도 파일이 다시 업로드되지 않는다. 파일 내용·ID는 로컬 저장하지 않는다.
  const todoUploads = new WeakMap();
  async function todoNewIds(files, scope) {
    if (!files || Array.isArray(files) && !files.length) return [];
    if (!Array.isArray(files) || files.some(f => !(f instanceof File))) throw attachError();
    if (String(context().empSeq || '') !== String(loadedEmpSeq) || !loadedEmpSeq) throw new GwError('IDENTITY', '로그인 정보가 바뀌었습니다');
    const old = todoUploads.get(files);
    if (old) { if (old.scope !== scope) throw attachError(); return old.result; }
    const seen = new Set(), form = new FormData();
    for (const f of files) {
      const key = JSON.stringify([f.name, f.size, f.lastModified, f.type]);
      if (seen.has(key)) throw new GwError('BAD_INPUT', '중복 파일이 있습니다. 한 번씩만 선택해 주세요');
      seen.add(key); form.append('file[]', f);
    }
    form.append('moduleGbn', 'PROJECT');
    const result = todoWrite('/ecm/ecm001A01', form).then(data => checkedFileIds(data, files.length)).catch(e => { if (e && e.code === 'RATE') todoUploads.delete(files); throw e; });
    todoUploads.set(files, {scope, result});
    return result;
  }
  function bindTodoFiles(body, ids) {
    const all = [...new Set(ids)]; body.uid = all.join(','); body.file = all.map(fileId => ({fileId}));
  }
  // 만들기. parent가 있으면 하위 ToDo(체크리스트 한 줄). 응답이 늦으면 목록을 다시 읽어 같은 제목의 새 항목이 있는지 본다(중복 생성 방지).
  async function todoCreate({title, start = '', due = '', contents = '', important = false, importance, dday = false, manHour = '', parent = '', files} = {}) {
    const ctx = context();
    if (!ctx.empSeq || String(ctx.empSeq) !== String(loadedEmpSeq)) throw new GwError('IDENTITY', '로그인 정보가 바뀌었습니다. 새로고침 후 다시 시도하세요');
    const name = todoName(title), end = todoYmd(due), st = todoYmd(start) || end, text = todoText(contents), imp = todoImp(importance, important);
    if (st && end && st > end) throw new GwError('BAD_INPUT', '시작일이 기한보다 뒤입니다');
    if (parent) await todoOwned(parent);
    const body = {prjSeq: '', prtSeq: parent ? todoId(parent) : '', todoLevel: parent ? '2' : '1', todoName: name, startDate: st, endDate: end, contents: text, processRate: '0', manHour: todoHours(manHour), importDegree: imp, file: [], linkYn: 'N', moduleSeq: 'kiss_prj', relWorkSeq: '', uid: '', paramData: '',
      ownerUserList: [{compSeq: ctx.compSeq, deptSeq: ctx.deptSeq, empSeq: ctx.empSeq, unitType: 'E'}], ownerCompSeq: ctx.compSeq, ownerDeptSeq: ctx.deptSeq, ownerEmpSeq: ctx.empSeq, dDayYn: dday && end ? 'Y' : 'N', portletYn: 'N', modifyYn: 'Y', deleteYn: 'Y', proccessYn: 'Y'};
    const ids = await todoNewIds(files, 'new:' + (parent || ''));
    if (String(context().empSeq) !== String(ctx.empSeq)) throw new GwError('IDENTITY', '로그인 정보가 바뀌었습니다');
    bindTodoFiles(body, ids);
    let id;
    try { id = await todoWrite(TODO_P + 'prj001A01', body); }
    catch (e) {
      if (isUnk(e)) throw new GwError('UNKNOWN', UNK_HEAD + '저장 여부를 확인하지 못했습니다. 목록을 새로 고친 뒤 확인하세요');
      throw e;
    }
    if (typeof id !== 'string' || !/^td\d+$/.test(id)) throw new GwError('UNKNOWN', '저장 응답을 확인할 수 없습니다. 목록에서 먼저 확인하세요');
    return {ok: true, id};
  }
  // 고치기: 지금 값을 읽어 바뀐 칸만 덮어 전체를 보낸다. 기존 첨부는 일련번호로 모두 복원한 뒤 함께 보낸다.
  // base: 화면이 알고 있던 내용 칸. 그 사이 다른 PC·모바일에서 바뀌었으면 덮어쓰지 않고 CONFLICT로 멈춘다.
  async function todoUpdate(id, patch = {}, {base} = {}) {
    const {ctx, d} = await todoOwned(id);
    if (base !== undefined && String(d.contents || '').replace(/\r\n/g, '\n') !== String(base || '').replace(/\r\n/g, '\n')) throw new GwError('CONFLICT', '그 사이 다른 곳에서 이 ToDo의 내용이 바뀌었습니다. 새로 읽은 뒤 다시 고쳐 주세요');
    const sns = todoFileSns(d);
    const has = k => Object.prototype.hasOwnProperty.call(patch, k);
    const name = has('title') ? todoName(patch.title) : String(d.todoName || ''); // 고치지 않은 칸은 그대로 돌려보낸다(그룹웨어에서 만든 긴 제목도 막지 않게)
    const end = has('due') ? todoYmd(patch.due) : todoYmd(d.endDate);
    let st = has('start') ? todoYmd(patch.start) : todoYmd(d.startDate);
    // 기한만 바꾸면: 하루짜리(시작=기존 기한)는 시작도 같이 옮기고, 기간이 있던 ToDo는 시작이 새 기한보다 늦을 때만 맞춘다
    if (has('due') && !has('start')) st = end ? (st && st !== todoYmd(d.endDate) && st <= end ? st : end) : '';
    if (st && !end) st = '';
    if (st && end && st > end) throw new GwError('BAD_INPUT', '시작일이 기한보다 뒤입니다');
    const text = has('contents') ? todoText(patch.contents) : String(d.contents ?? '');
    // 상세(A05)에는 중요도(importDegree)가 없다(2026-11-21 확인). 바꾸지 않을 때는 목록에서 지금 값을 읽어 그대로 보낸다(안 그러면 '즉시'가 '일반'으로 바뀜).
    let impNow = d.importDegree;
    const impChange = has('importance') || has('important');
    if (!impChange && (impNow === undefined || impNow === null || impNow === '')) { const l = await todoList(); const row = l.todos.flatMap(t => [t, ...t.children]).find(t => t.todoSeq === String(id)); if (!row) throw new GwError('NOT_FOUND', '목록에서 이 ToDo를 찾지 못해 중요도를 지킬 수 없습니다'); impNow = row.importDegree; }
    // 바꾸지 않으면 지금 값을 그대로 보낸다(예전에는 즉시가 아닌 긴급·중요가 일반으로 바뀌었다)
    const imp = impChange ? todoImp(patch.importance, patch.important) : (/^[0-3]$/.test(String(impNow)) ? String(impNow) : '0');
    const rate = String(d.todoStatus) === '2' ? '100' : String(Number.isFinite(Number(d.processRate)) ? Number(d.processRate) : 0);
    const body = {todoSeq: todoId(id), prjSeq: '', prtSeq: str(d.prtSeq, 20), todoLevel: String(Number(d.todoLevel) || 1), startDate: st, endDate: end, relWorkSeq: str(d.relWorkSeq, 40), todoName: name, contents: text, processRate: rate, uid: '', file: [], paramData: '', dDayYn: has('dday') ? (patch.dday && end ? 'Y' : 'N') : d.dDayYn === 'Y' ? 'Y' : 'N', importDegree: imp,
      ownerCompSeq: ctx.compSeq, ownerDeptSeq: ctx.deptSeq, ownerEmpSeq: ctx.empSeq};
    if (has('manHour')) body.manHour = todoHours(patch.manHour); else if (d.manHour != null) body.manHour = d.manHour;
    const existing = await todoExistingIds(d, ctx, sns);
    const added = await todoNewIds(patch.files, 'update:' + id);
    // ECM 왕복 중 다른 기기에서 파일·본문을 고치면 오래된 전체 본문을 보내지 않는다.
    {
      const {d: now} = await todoOwned(id);
      if (JSON.stringify(todoFileSns(now)) !== JSON.stringify(sns) || ['contents','todoName','startDate','endDate','manHour','todoStatus','processRate','dDayYn','modifyDate','modifyDt','importDegree'].some(k => now[k] !== d[k])) throw new GwError('CONFLICT', '다른 곳에서 ToDo가 바뀌어 저장하지 않았습니다');
    }
    bindTodoFiles(body, [...existing, ...added]);
    const r = await todoWrite(TODO_P + 'prj001A02', body);
    if (!r || String(r.todoSeq) !== String(id)) throw new GwError('SAVE_FAILED', '그룹웨어가 변경을 저장하지 못했습니다');
    return {ok: true, id, status: str(r.todoStatus, 2)};
  }
  async function todoSetDone(id, done = true) {
    const r = await todoSetProgress(id, done ? 100 : 0);
    return {ok: true, id, done: r.status === '2'};
  }
  // 진행률(0~100): 그룹웨어 화면의 진행률 바꾸기·칸반 옮기기와 같은 호출. 첨부가 있어도 다른 칸을 건드리지 않는다.
  async function todoSetProgress(id, rate) {
    const n = todoRate(rate);
    const {d} = await todoAssigned(id);
    const r = await todoWrite(TODO_P + 'prj001A07', {prjSeq: str(d.prjSeq, 30), todoSeq: todoId(id), processRate: String(n)});
    if (!r || String(r.todoSeq) !== String(id)) throw new GwError('SAVE_FAILED', '그룹웨어가 진행률을 저장하지 못했습니다');
    return {ok: true, id, rate: n, status: str(r.todoStatus, 2)};
  }
  // 중요도만 바꾸기: 그룹웨어 화면의 중요도 고르기와 같은 호출(prj001A09). 내가 만든 개인 ToDo만. 첨부가 있어도 된다.
  async function todoSetImportance(id, importance) {
    const imp = todoImp(importance);
    const {d} = await todoOwned(id);
    const rate = String(d.todoStatus) === '2' ? '100' : String(Number.isFinite(Number(d.processRate)) ? Number(d.processRate) : 0);
    const r = await todoWrite(TODO_P + 'prj001A09', {todoSeq: todoId(id), importDegree: imp, processRate: rate});
    if (r === undefined || r === null) throw new GwError('SAVE_FAILED', '그룹웨어가 중요도를 저장하지 못했습니다');
    return {ok: true, id, importance: imp};
  }
  // 지우기: 화면에서 직접 누른 경우에만(확인 창을 거친 뒤). AI·자동 실행은 지우지 못한다.
  // v1.19.1: 알림 하나를 읽음으로 표시한다(그룹웨어 종 목록에서 알림을 누를 때 부르는 것과 같은 호출). 메일·문서 자체의 읽음과는 별개다.
  async function readAlert(id) {
    const alertId = String(id || '');
    if (!/^[\w-]{6,60}$/.test(alertId)) throw new GwError('BAD_ID', '알림 ID가 올바르지 않습니다');
    if (!WRITE_ALLOWED.has('/event/event02A03')) throw new GwError('NOT_ALLOWED', '쓰기 허용 목록 오류');
    const ctx = context();
    let r;
    try { r = await transport('/event/event02A03', {header: {groupSeq: ctx.groupSeq, empSeq: ctx.empSeq, pid: '', tid: ''}, body: {companyInfo: {compSeq: ctx.compSeq, bizSeq: ctx.bizSeq, deptSeq: ctx.deptSeq, emailAddr: ctx.emailAddr, emailDomain: ctx.emailDomain}, alertIds: [alertId]}}, {timeoutMs: 10000, retries: 0}); }
    catch (e) { if (isUnk(e)) throw new GwError('UNKNOWN', UNK_HEAD + '반영 여부를 확인하지 못했습니다'); throw e; }
    return {ok: true, id: alertId, result: r == null ? null : true};
  }
  async function todoDelete(id) {
    if (!(navigator.userActivation && navigator.userActivation.isActive)) throw new GwError('NO_GESTURE', '화면에서 직접 누른 경우에만 지울 수 있습니다');
    await todoOwned(id);
    const r = await todoWrite(TODO_P + 'prj001A03', {todoSeq: todoId(id), prjSeq: ''});
    if (!r || String(r.todoSeq) !== String(id)) throw new GwError('SAVE_FAILED', '그룹웨어가 지우지 못했습니다');
    return {ok: true, id};
  }
  const todoLink = id => `${ORIGIN}/#/popup?${qs({callComp: 'UGAP012', MicroModuleCode: 'kiss', todoSeq: id})}`;
  // ToDo 댓글 읽기(읽기 전용). 지운 댓글은 내용 없이 표시만 남긴다. 접속 IP는 가져오지 않는다.
  async function todoComments(id) {
    const ctx = context();
    const d = await call('/gw/api/gw026A03', {companyInfo: {compSeq: ctx.compSeq, bizSeq: ctx.bizSeq, deptSeq: ctx.deptSeq, emailAddr: ctx.emailAddr, emailDomain: ctx.emailDomain}, langCode: ctx.langCode || 'kr', moduleGbnCode: 'project', moduleSeq: todoId(id), commentType: '200', commentSeq: '', sort: 'A', searchWay: 'D', pageSize: 200}, {timeoutMs: 12000});
    const list = Array.isArray(d && d.commentList) ? d.commentList : null;
    if (!list) throw new GwError('API_ERROR', '댓글 목록 형식이 바뀌었습니다');
    return {comments: list.map(c => ({id: str(c.commentSeq, 30), who: str(c.empName, 40), dept: str(c.deptName, 60), at: str(c.createDate, 19), deleted: c.useYn !== 'Y', reply: num(c.depth) > 1, mine: String(c.createSeq) === String(ctx.empSeq), text: c.useYn === 'Y' ? String(c.contents || '').slice(0, 2000) : '', files: Array.isArray(c.fileSnList) ? c.fileSnList.length : 0})), more: d.moreYn === 'Y'};
  }

  // 앞으로 예정된 휴가·출장·연장근무: 근태/출장 신청 현황(결재 중 포함)을 읽는다. 신청일 기준 최근 150일 안의 신청만 본다.
  async function teamPlanned() {
    const ctx = context();
    const now = new Date(), to = ymd(now), from = ymd(addDays(now, -150));
    const [leave, trip] = await Promise.all([
      call('/human/hrd0220/0hr00001', {coCd: ctx.erpCompSeq, dateFg: '1', appDtFrom: from, appDtTo: to, approStateList: ['0', '1', '5'], deleteRequest: false, noDoc: '', divCdList: [], deptCdList: [], empCdList: [], atItemCdList: [], atCdList: [], htypCdList: [], prtyCdList: [], keyword: '', administrator: false, searchType: 'deptCd'}),
      call('/human/hrd1130/0hr00004', {coCd: ctx.erpCompSeq, appDtFrom: from, appDtTo: to, startDt: '', endDt: '', divCdList: [], deptCdList: [], empCdList: [], approvalStatusCdList: ['0', '1', '2', '3', '5']}),
    ]);
    const pick = r => ({empCd: str(r.empCd, 12), korNm: str(r.korNm || r.empNm, 20), deptNm: str(r.deptNm, 30), atNm: str(r.atNm, 30), atItemNm: str(r.atItemNm, 20), startDt: str(r.startDt, 8), endDt: str(r.endDt, 8), startTm: str(r.startTm, 4), endTm: str(r.endTm, 4), appDt: str(r.appDt, 8), appSq: str(r.appSq, 12), approState: str(r.approState, 2), deleteReqYn: str(r.deleteReqYn, 1), docdelYn: str(r.docdelYn, 1), appTm: num(r.appTm), appDy: num(r.appDy),
      title: str(r.titleDc, 80), noDoc: str(r.noDoc, 40), reason: str(r.appRmkDc || r.biztrPpsDc || r.taskDc, 200), place: str(r.biztrDc, 80), depart: str(r.depatNm, 40), stop: str(r.stopvNm, 40), arrive: str(r.arrivNm, 40), transport: str(r.transCtdNm, 30)});
    // 같은 신청이 두 목록에 모두 있으면(관내출장 등) 비어 있는 칸을 서로 채워 한 건으로 합친다(출장지·목적은 출장 목록에만 있다).
    const merged = new Map();
    for (const r of [...arr(leave), ...arr(trip)]) {
      const p = pick(r), k = [p.empCd, p.appDt, p.appSq, p.atNm].join('|'), o = merged.get(k);
      if (!o) merged.set(k, p); else for (const f of Object.keys(p)) if (!o[f] && p[f]) o[f] = p[f];
    }
    return {apps: [...merged.values()], me: String(ctx.erpEmpSeq || '')};
  }
  async function collectAttendance(ctx) {
    const p = kstParts();
    const today = `${p.y}${p.m}${p.d}`;
    const monthFrom = `${p.y}${p.m}01`, monthTo = `${p.y}${p.m}${String(lastDayOfMonth(p.y, p.m)).padStart(2, '0')}`;
    const yesterday = ymd(addDays(new Date(), -1));
    const [todayInfo, month, days, fingerprintDays, planned] = await Promise.all([
      call('/human/common/judgeTimeManagement/getTodayComeLeaveInfo', {empCd: ctx.erpEmpSeq, coCd: ctx.erpCompSeq, workDt: today}).catch(e => ({error: e.code})),
      call('/personal/hpd0220/0hr00001', {atDtFrom: monthFrom, atDtTo: monthTo}).catch(e => ({error: e.code})),
      attendanceDays({from: monthFrom, to: today}).catch(e => ({error: e.code || 'QUERY_FAILED'})),
      attendanceDays({from: ymd(addDays(new Date(), -30)), to: yesterday}).catch(e => ({error: e.code || 'QUERY_FAILED'})),
      call('/human/hrd0220/0hr00001', {coCd: ctx.erpCompSeq, dateFg: '1', appDtFrom: ymd(addDays(new Date(), -150)), appDtTo: today, approStateList: ['0', '1', '5'], deleteRequest: false, noDoc: '', divCdList: [], deptCdList: [], empCdList: [], atItemCdList: [], atCdList: [], htypCdList: [], prtyCdList: [], keyword: '', administrator: false, searchType: 'deptCd'}).catch(e => ({error: e.code || 'QUERY_FAILED'})),
    ]);
    const mins = v => (v === null || v === undefined || v === '') ? null : num(v);
    return {
      today: {date: today, come: str(todayInfo && todayInfo.comeTm, 12), leave: str(todayInfo && todayInfo.leaveTm, 12), error: todayInfo && todayInfo.error || ''},
      month: {from: monthFrom, to: monthTo, recognizedMin: mins(month.appworkTm), basicMin: mins(month.basicworkTm), overtimeMin: mins(month.overworkTm), exceptMin: mins(month.exceptworkTm), nightMin: mins(month.nightworkTm), error: month.error || ''},
      days: Array.isArray(days) ? days : [], daysError: Array.isArray(days) ? '' : days.error,
      overtime: {me: String(ctx.erpEmpSeq || ''), days: Array.isArray(fingerprintDays) ? fingerprintDays : [], daysError: Array.isArray(fingerprintDays) ? '' : fingerprintDays.error,
        apps: Array.isArray(planned) ? planned.filter(r => String(r.empCd || '') === String(ctx.erpEmpSeq || '')).map(r => ({empCd: str(r.empCd, 12), atNm: str(r.atNm, 30), atItemNm: str(r.atItemNm, 20), startDt: str(r.startDt, 8), endDt: str(r.endDt, 8), startTm: str(r.startTm, 4), endTm: str(r.endTm, 4), approState: str(r.approState, 2), deleteReqYn: str(r.deleteReqYn, 1), docdelYn: str(r.docdelYn, 1)})) : [], appsError: Array.isArray(planned) ? '' : (planned.error || 'QUERY_FAILED')},
      url: LINKS.route(ROUTES.worktime), requestUrl: LINKS.route(ROUTES.attendanceRequest),
    };
  }

  async function collectLeave(ctx) {
    const year = kstParts().y;
    const [sumRaw, usesRaw] = await Promise.all([
      call('/personal/hpd0550/0hp00002', {ycYy: year}),
      call('/personal/hpd0550/0hp00003', {ycYy: year, applyStDt: `${year}0101`, applyEdDt: `${year}1231`}).catch(() => []),
    ]);
    const s = Array.isArray(sumRaw) && sumRaw.length === 1 && sumRaw[0];
    // One ledger row for this year. Never turn an absent/changed ledger into zero leave.
    const keys = 'basicDy belowBasicDy basicAdjustDy addDy etcDy rewDy changeDy boBasicDy boRewDy boChangeDy useDy useRewDy useChangeDy appProcessDy'.split(' ');
    if (!s || !keys.every(k => typeof s[k] === 'number' && Number.isFinite(s[k]) || typeof s[k] === 'string' && s[k].trim() && Number.isFinite(+s[k]))) throw new Error('개인연차현황 원장 확인 불가');
    // Same formula as the 개인연차현황 screen (checked 2026-11-08: 38.15625 - 31.5625 = 6.59375).
    const basic = +s.basicDy + +s.belowBasicDy + +s.basicAdjustDy + +s.addDy + +s.etcDy + +s.boBasicDy, reward = +s.rewDy + +s.boRewDy, change = +s.changeDy + +s.boChangeDy;
    const granted = basic + reward + change, used = +s.useDy + +s.useRewDy + +s.useChangeDy + +s.appProcessDy;
    const today = ymd();
    const uses = arr(usesRaw).map(u => ({start: str(u.startDt, 8), end: str(u.endDt, 8), startTime: str(u.startTm, 4), endTime: str(u.endTm, 4), kind: str(u.atNm, 30), days: num(u.ycUseCnt), title: mask(u.titleDc, 120), approved: String(u.approState) === '1', applied: str(u.appDt, 8)}));
    return {
      year, granted: +granted.toFixed(5), used: +used.toFixed(5), remaining: +(granted - used).toFixed(5),
      // The ledger contains a single unallocated pending deduction; never spread it across types.
      balances: {basic: basic - s.useDy, reward: reward - s.useRewDy, change: change - s.useChangeDy},
      breakdown: {basic: num(s.basicDy), add: num(s.addDy), reward: num(s.rewDy), change: num(s.changeDy), etc: num(s.etcDy), usedBasic: num(s.useDy), usedReward: num(s.useRewDy), usedChange: num(s.useChangeDy), inApproval: num(s.appProcessDy)},
      upcoming: uses.filter(u => u.end >= today).sort((a, b) => a.start.localeCompare(b.start)), usedCount: uses.length,
      history: uses.sort((a, b) => b.start.localeCompare(a.start)).slice(0, 120),
      url: LINKS.route(ROUTES.leave),
    };
  }

  // 2026-11-25: 예산구분(abgtFg) '1'은 전략경영실운영(A201)의 누계예산(abgtSumAm)을 0으로 돌려줘 예산 없는 사업으로 보였다.
  // '2'는 다른 사업 14곳과 값이 같고 A201도 바르게 준다(실제 계정으로 비교 확인).
  const budgetRow = r => ({code: str(r.bgtCd, 30), name: str(r.bgtNm, 120), level: str(r.divFgNm, 6), path: str(r.bglistCd, 160), budget: num(r.abgtSumAm), executed: num(r.unitAm), balance: num(r.subAm), rate: num(r.sumRt)});
  async function budgetTable(ctx, t, opt = {}) {
    const year = Number(opt.year || t.year || kstParts().y);
    // 기수(회계기수): 2026년 = 12기 (observed). Override with opt.gisu if the foundation renumbers.
    const gisu = String(opt.gisu || t.gisu || year - 2014);
    const body = {bgtFrYm: `${year}01`, bgtToYm: `${year}12`, bgtBeforeFrYm: '', bgtBeforeToYm: '', bgtStartFrYm: `${year}0101`, summaryYn: 'Y', abgtFg: '2', divCds: `${ctx.erpCompSeq}|`, mgtCds: `${t.project}|`, bottomCds: '', mgtBottomList: [], bgtCnt: '1', abdocuFg: '1', acctdefFg: 'N001', abdocuDtFg: '1', grFg: '0', zeroFg: opt.zero ? '1' : '2', divFg: '8', sumRtFg: '2', ctrCd05: '3', ctrCd10: '1', optionBN03: '1', optionBN10: '1', optionBN11: '0', optionBN14: '0', pOptionBn15: '0', coCd: ctx.erpCompSeq, gisu, empCd: ctx.erpEmpSeq, gisuFrDt: `${year}0101`, gisuToDt: `${year}1231`};
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
      const msg = a.message || {}, mail = a.eventType === 'MAIL';
      // v1.19.1: 메일 알림의 주소는 {0}~{3} 자리표시자라 그대로는 못 연다. 그룹웨어가 종 목록에서 여는 것과 같은 값으로 채운다.
      const recv = (Array.isArray(data.recvList) && data.recvList[0]) || {};
      const mailUrl = mail && /^\d+$/.test(String(a.mailUid || '')) && recv.email ? ORIGIN + '/#/popup?' + [['muid', a.mailUid], ['email', recv.email], ['mbodSeq', a.mailBoxSeq || recv.mboxSeq || ''], ['boxName', recv.boxName || ''], ['MicroModuleCode', 'mail'], ['print', 'false'], ['rejectFromEmail', data.sendEmail || ''], ['callComp', 'UDAP006']].map(([k, v]) => k + '=' + encodeURIComponent(String(v))).join('&') : '';
      const plain = a.url && String(a.url).startsWith('/#') && !/[{}]/.test(a.url) ? ORIGIN + a.url : '';
      const firstLine = v => String(v || '').split(/\r?\n/)[0].trim();
      const title = mail ? (data.title || '(제목 없음)') : (data.title || data.titleNm || firstLine(msg.alertContent) || a.title);
      return {id: str(a.alertId, 60), type: str(a.eventType, 20), subType: str(a.eventSubType, 20), head: str(msg.alertTitle, 80), title: mask(title, 200), docNo: str(data.doc_no, 60), who: str((mail ? data.senderName || data.sendName : data.drafter_nm || data.userName || data.senderName || data.empName) || a.senderName, 40), dept: str(data.deptName, 60), time: str(data.rep_dt || a.createDate, 25), read: !!a.readDate, url: mail ? mailUrl : plain};
    });
    return {alerts};
  }

  // The organization screen's own tree and department roster endpoints. No writes or profile changes.
  async function organizationTree() {
    context();
    const data = await call('/gw/APIHandler/gw102A01', {popupType:'main', selectedType:'', isAllCompShow:false, compFilter:'', isTreeChecked:'', isTreeAllOpen:false, isPartYn:false, parentSeq:'0', deptPath:''});
    if (!Array.isArray(data?.treeList)) throw new GwError('BAD_RESPONSE', '조직도 목록 형식을 확인할 수 없습니다.');
    return data.treeList.map(x => ({key: str(x.keySeq || x.key, 40), parent: str(x.parentKeySeq || x.parentKey || x.parentSeq, 40), name: str(x.text || x.labelText || x.name || x.deptName || x.compName, 100), count: num(x.childUserCnt), orgGubun: str(x.orgGubun, 10)}));
  }
  async function organizationMembers(key) {
    context(); const k=String(key || ''); if (!/^[dcb][0-9]+$/.test(k)) throw new GwError('BAD_ORG', '올바른 조직을 선택하세요.');
    const data = await call('/gw/APIHandler/gw102A02', {orderText:'', selectedId:k.slice(1), orgGubun:k[0], popupType:'main', selectedType:'tree', isAllCompShow:false, searchDiv:'all', searchText:'', isBdayOption:'2', isJoinDayOption:'0', isOrganizationDisplayOption:'0|5|', isGridListDisplayOption:'0', isLoginIdOption:'0'});
    if (!Array.isArray(data)) throw new GwError('BAD_RESPONSE', '구성원 목록 형식을 확인할 수 없습니다.');
    return data.map(x => ({name:str(x.empName,40), dept:str(x.deptName,80), duty:str(x.dutyName,30), position:str(x.positionName,30), tel:str(x.telNum,30), extension:str(x.extNum,30), email:str(x.emailAddr,80), work:str(x.mainWork,300)}));
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
        const rawTotal = d && d.totalcount;
        const totalNumber = rawTotal !== null && rawTotal !== undefined && String(rawTotal).trim() !== '' ? Number(rawTotal) : NaN;
        const reliableTotal = Array.isArray(d?.resultgrid) && Number.isSafeInteger(totalNumber) && totalNumber >= items.length ? totalNumber : null;
        groups[type] = {label: SEARCH_LABELS[type], total: num(rawTotal), reliableTotal, items};
      } catch (e) { groups[type] = {label: SEARCH_LABELS[type], total: 0, items: [], error: e.code || 'ERROR', message: e.message}; }
    }));
    return {keyword: kw, page, pageSize, groups, searchedAt: new Date().toISOString()};
  }

  // Preserve line breaks present in the index; formatting and missing content cannot be recovered.
  const indexText = (v, max = 6000) => (v == null ? '' : String(v)).replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').trim().slice(0, max).replace(SECRET, '$1[MASKED]');
  // Search results carry names as {kr, en, ...} objects.
  const ml = v => (v && typeof v === 'object') ? (v.kr || v.ko || Object.values(v).find(x => typeof x === 'string' && x) || '') : v;
  function normalizeSearch(type, x, kw) {
    if (type === 'doc') {
      const form = str(ml(x.formNm), 60);
      const doc = {type, docId: str(x.docId || x.pkSeq, 30), docNo: str(x.docNo, 60), title: mask(x.docTitle, 300), form: form === 'temporary' ? '접수문서' : form, date: str(x.docDate, 20), drafter: str(ml(x.userNm), 40), dept: str(ml(x.deptNm), 60), files: arr(x.fileList).map(f => ({id: str(f.filePath || f.fileId, 60), name: str(f.orignlFileName || f.fileName, 160)})), snippet: snippetAround(x.docContents, kw), text: indexText(x.docContents, 6000)};
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

  // 모든 사업의 과목표(검색용). 기본 화면은 예산·집행이 있는 과목만 주므로(zeroFg=2), 사업마다 한 번씩 읽고
  // 예산·집행이 전혀 없는 과목(예: 쓰지 않은 여비 과목)은 전체 코드표(zeroFg=1)에서 한 번만 따로 읽어 덧붙인다. 10분 보관.
  const BUDGET_ALL = {key: '', at: 0, data: null};
  async function budgetAll({year, force = false} = {}) {
    const ctx = context(), y = Number(year || kstParts().y), key = [ctx.erpCompSeq, ctx.erpEmpSeq, y].join('|');
    if (!force && BUDGET_ALL.key === key && BUDGET_ALL.data && Date.now() - BUDGET_ALL.at < 10 * 60000) return BUDGET_ALL.data;
    const cat = await budgetCatalog();
    const projects = new Array(cat.length);
    let next = 0;
    const worker = async () => {
      while (next < cat.length) {
        const i = next++, c = cat[i];
        try { const t = await budgetTable(ctx, {project: c.project}, {year: y}); projects[i] = {project: c.project, name: c.name, rows: t.rows}; }
        catch (e) { projects[i] = {project: c.project, name: c.name, rows: [], error: e.code || 'ERROR', message: e.message}; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    let empty = [], names = {}, emptyError = '';
    try {
      const z = await budgetTable(ctx, {project: cat[0] ? cat[0].project : 'A201'}, {year: y, zero: true});
      const used = new Set(projects.flatMap(p => p.rows.map(r => r.code)));
      empty = z.rows.filter(r => !used.has(r.code));
      for (const r of z.rows) names[r.code] = r.name;
    } catch (e) { emptyError = e.message; }
    const data = {year: y, projects, empty, names, emptyError, at: Date.now()};
    if (!emptyError && !projects.some(p => p.error)) { BUDGET_ALL.key = key; BUDGET_ALL.at = Date.now(); BUDGET_ALL.data = data; }
    return data;
  }

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

  // ---------- 카드 사용내역 (v1.21) ----------
  // 지출결의서의 [카드승인내역] 창과 같은 조회(내가 쓸 수 있는 카드: 권한부여·이관·불출). 그룹웨어가 이 주소만 값을 암호화해 주고받으므로
  // 그룹웨어 자체 복호화 함수로 푼다. 카드번호·가맹점 사업자번호·대표자·전화·주소는 풀지 않고 버린다. 결의 반영·선택은 하지 않는다(읽기만).
  let cachedCrypto = null;
  function findCrypto() {
    if (cachedCrypto) return cachedCrypto;
    const chunkName = Object.keys(window).find(k => k === 'webpackChunkklago_ui_gw') || Object.keys(window).find(k => k.startsWith('webpackChunk'));
    let req = null;
    if (chunkName) window[chunkName].push([[`bwyfgw-c-${Date.now()}`], {}, r => { req = r; }]);
    if (req && req.m) for (const id of Object.keys(req.m)) {
      let src = '';
      try { src = Function.prototype.toString.call(req.m[id]); } catch { continue; }
      if (!src.includes('decryptResult') || !src.includes('@!E!@')) continue;
      let exp;
      try { exp = req(id); } catch { continue; }
      const c = [exp && exp.default, ...Object.values(exp || {})].find(v => v && typeof v.decrypt === 'function' && typeof v.encrypt === 'function');
      if (c) { cachedCrypto = c; return c; }
    }
    throw new GwError('DECRYPT_NOT_FOUND', '카드 내역을 풀어 읽는 그룹웨어 기능을 찾지 못했습니다. 그룹웨어 업데이트로 구조가 바뀌었을 수 있습니다.');
  }
  const CARD_STATE = {all: '0', done: '1', open: '2'}; // 반영여부: 전체 / 여(결의 반영) / 부(미반영)
  const CARD_KEEP = ['issDt', 'issSq', 'issTime', 'attrNm', 'trCd', 'chainName', 'sunginNb', 'sunginAm', 'vatAm', 'gisuDt', 'gisuNb', 'isuDt', 'docuNb', 'getNb', 'approState', 'getbackFg', 'transferFg', 'ebankKey'];
  const ymd8 = v => /^\d{8}$/.test(String(v || '')) ? String(v) : '';
  // 상태는 그룹웨어 창의 선택 가능 판정과 같다: 결의일·발행일이 없거나 회수된 건은 '결의 전', 처리상태 0·1·5는 '다른 처리'(지출결의/계산서처리 건).
  const cardRow = x => {
    const other = ['0', '1', '5'].includes(String(x.approState ?? '')), returned = x.getbackFg === 'Y';
    const resolved = !!ymd8(x.gisuDt) || (!!ymd8(x.isuDt) && x.isuDt !== '00000000');
    return {
      date: ymd8(x.issDt), time: str(x.issTime, 5), seq: num(x.issSq), card: str(x.attrNm, 80), cardCode: str(x.trCd, 20), place: mask(x.chainName, 120),
      approvalNo: str(x.sunginNb, 30), amount: num(x.sunginAm), vat: num(x.vatAm),
      ebankKey: str(x.ebankKey, 40), resolution: str(x.gisuNb, 30), resolutionDate: ymd8(x.gisuDt),
      slip: x.docuNb === '-0' ? '' : str(x.docuNb, 30), proposal: str(x.getNb, 30), returned, transferred: x.transferFg === 'Y',
      status: other ? 'other' : (resolved && !returned) ? 'done' : 'open',
    };
  };
  async function cardUsage({from, to, state = 'all'} = {}) {
    const ctx = context();
    const f = String(from || '').replace(/-/g, ''), t = String(to || '').replace(/-/g, '');
    if (!ymd8(f) || !ymd8(t) || f > t) throw new GwError('BAD_QUERY', '승인일 기간을 확인하세요.');
    const day = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    if ((day(t) - day(f)) / 86400000 > 366) throw new GwError('BAD_QUERY', '카드 사용내역은 1년 이내로 조회하세요.');
    let erp = null;
    try { const ui = JSON.parse(sessionStorage.getItem('userInfo') || 'null'); erp = ui && ui.erpUserInfo; if (typeof erp === 'string') erp = JSON.parse(erp); } catch { erp = null; }
    const body = {trCds: '', issDtFrom: f, issDtTo: t, searchText: '', docuFg: '', commitFg: CARD_STATE[state] || '0', authFg: ['1', '2', '3'], empCd: String((erp && erp.userCode) || ctx.erpEmpSeq || ''), deptCd: String((erp && erp.deptCode) || '')};
    const d = await call('/nonprofit/cardAuth/0BN00001', body, {encrypt: true, timeoutMs: 30000});
    if (!Array.isArray(d)) throw new GwError('BAD_RESPONSE', '카드 승인내역 형식을 확인할 수 없습니다.');
    const key = String(ctx.groupSeq || '');
    const dec = v => {
      if (typeof v !== 'string') return v;
      const a = v.indexOf('@!E!@'), b = v.lastIndexOf('@!E!@');
      if (a < 0 || b <= a) return v;
      try { return findCrypto().decrypt(v.substring(a + 5, b), key, 'AES'); } catch (e) { throw e instanceof GwError ? e : new GwError('DECRYPT_FAILED', '카드 내역을 풀어 읽지 못했습니다.'); }
    };
    const rows = d.map(r => { const x = {}; for (const k of CARD_KEEP) x[k] = dec(r && r[k]); return cardRow(x); })
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time) || b.seq - a.seq);
    return {from: f, to: t, state: CARD_STATE[state] ? state : 'all', rows, url: LINKS.route(ROUTES.expenseEntry), at: new Date().toISOString()};
  }

  // ---------- 전자세금계산서 (v1.22) ----------
  // 지출결의서의 [전자(세금)계산서발행내역] 창과 같은 조회(증빙 과세·면세, 회계단위 전체). 결의 반영·선택은 하지 않는다(읽기만).
  const ETAX_STATE = {all: '0', done: '1', open: '2'}; // 반영여부: 전체 / 반영 / 미반영
  const etaxRow = x => {
    const sum = num(x.sumAm), done = num(x.abdocuAm), balance = num(x.balanceAm);
    return {
      date: ymd8(x.issDt), seq: num(x.issSq), supplier: mask(x.trNm, 80), bizNo: str(x.trregNb, 12), issueNo: str(x.issNo, 40),
      sum, supply: num(x.supAm), vat: num(x.vatAm), taxType: str(x.taxTy, 2), item: mask(x.itemDc, 120),
      reflected: done, balance, resolution: str(x.gisuNb, 30), resolutionDate: ymd8(x.gisuDt), slip: str(x.docuNb, 30),
      status: (done <= 0 && !str(x.gisuNb, 30)) ? 'open' : balance > 0 ? 'partial' : 'done',
    };
  };
  async function etaxInvoices({from, to, state = 'all'} = {}) {
    const ctx = context();
    const f = String(from || '').replace(/-/g, ''), t = String(to || '').replace(/-/g, '');
    if (!ymd8(f) || !ymd8(t) || f > t) throw new GwError('BAD_QUERY', '발행일 기간을 확인하세요.');
    const day = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    if ((day(t) - day(f)) / 86400000 > 366) throw new GwError('BAD_QUERY', '전자세금계산서는 1년 이내로 조회하세요.');
    let erp = null;
    try { const ui = JSON.parse(sessionStorage.getItem('userInfo') || 'null'); erp = ui && ui.erpUserInfo; if (typeof erp === 'string') erp = JSON.parse(erp); } catch { erp = null; }
    const co = String((erp && erp.companyCode) || ctx.erpCompSeq || '');
    const body = {issDtFrom: f, issDtTo: t, searchText: '', divObj: [co], docuFg: '4', reflectFg: ETAX_STATE[state] || '0', docuNbText: '지출결의/계산서', evidType: ['2', '4']};
    const d = await call('/nonprofit/etaxAuth/0BN00001', body, {timeoutMs: 30000});
    if (!Array.isArray(d)) throw new GwError('BAD_RESPONSE', '전자세금계산서 내역 형식을 확인할 수 없습니다.');
    const rows = d.map(etaxRow).sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq);
    return {from: f, to: t, state: ETAX_STATE[state] ? state : 'all', rows, url: LINKS.route(ROUTES.expenseEntry), at: new Date().toISOString()};
  }

  // Mail detail: attachments, big-file links and the groupware read-view URL.
  // WARNING: the groupware marks a mail as read when its detail is fetched, so this refuses
  // unread mails unless the caller explicitly accepts that (after asking the user).
  async function mailDetail({uid, seen, allowMarkRead = false} = {}) {
    if (!uid) throw new GwError('BAD_ARG', 'uid가 필요합니다.');
    if (seen !== true && !allowMarkRead) throw new GwError('WOULD_MARK_READ', '안 읽은 메일은 상세를 열면 읽음으로 바뀝니다.');
    const d = await call('/mail/mail002A01', {uid: String(uid)}, {[INTERNAL_CALL]: true});
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
    const rawReadUrl = str(dm.url, 500);
    const safeReadUrl = (() => {
      if (!rawReadUrl) return '';
      if (/^#\//.test(rawReadUrl)) return rawReadUrl;
      try { const p = new URL(rawReadUrl, ORIGIN); return (p.origin === ORIGIN || /^https:\/\/(?:[a-z0-9-]+\.)*amaranth10\.co\.kr$/i.test(p.origin)) ? p.href : ''; } catch { return ''; }
    })();
    return {uid: String(uid), subject: str(dm.subject, 300), from: dec(str(dm.from, 200)), to: dec(str(dm.to, 2000)), cc: dec(str(dm.cc, 2000)), date: str(dm.date, 20),
      readUrl: safeReadUrl, account: str(dm.email, 120), files, bigFiles, bigUntil, text: mask(plain, 4000), wasUnread: seen !== true,
      // 화면 표시 전용: 그룹웨어 메일 화면과 같은 원문. 스크립트가 막힌 틀에만 싣고, AI·저장소·기록에는 넘기지 않는다(그쪽은 가려진 text만 쓴다).
      html: html.length <= 800000 ? html : '', htmlTooLong: html.length > 800000, plain: dec(String(mime.body?.plain || '').replace(/&nbsp;/g, ' ')).replace(/\r\n?/g, '\n').slice(0, 200000)};
  }
  // Pictures inside a mail body (signatures, pasted images): the same GET the groupware read view makes, no state change.
  // Only this one groupware address is fetched, and only pictures come back, as data for the script-less body frame.
  async function mailInlineImage(url) {
    if (!READ_ONLY.has('/mail/mail002A30')) throw new GwError('NOT_ALLOWED', '허용되지 않은 API입니다.');
    let u;
    try { u = new URL(String(url || '')); } catch { throw new GwError('BAD_URL', '허용되지 않은 그림 주소입니다.'); }
    if (u.origin !== ORIGIN || u.pathname !== '/mail/mail002A30' || u.username || u.password) throw new GwError('BAD_URL', '허용되지 않은 그림 주소입니다.');
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => { try { ac && ac.abort(); } catch {} }, 8000);
    try {
      // 다른 주소로 넘기는 응답은 따라가지 않는다(이 한 주소만 읽는다는 약속을 지키기 위해). 크기는 받기 전에 먼저 본다.
      const res = await fetch(u.href, {credentials: 'same-origin', redirect: 'error', ...(ac ? {signal: ac.signal} : {})});
      if (!res.ok) throw new GwError('API_ERROR', `그림을 받지 못했습니다(${res.status}).`);
      if (Number(res.headers.get('content-length') || 0) > 4 * 1048576) { try { ac && ac.abort(); } catch {} throw new GwError('BAD_IMAGE', '표시할 수 없는 그림입니다.'); }
      const blob = await res.blob();
      if (!/^image\/(?:png|jpe?g|gif|webp|bmp)$/i.test(blob.type) || blob.size < 1 || blob.size > 4 * 1048576) throw new GwError('BAD_IMAGE', '표시할 수 없는 그림입니다.');
      return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(new GwError('API_ERROR', '그림을 읽지 못했습니다.'));
        fr.readAsDataURL(blob);
      });
    } catch (e) { throw e instanceof GwError ? e : new GwError('API_ERROR', '그림을 받지 못했습니다.'); }
    finally { clearTimeout(timer); }
  }
  // Download one normal mail attachment (the same request the groupware read view makes; no state change).
  // Convert one mail attachment into a Synap document-viewer URL (HWP, PDF, xlsx …; read-only).
  async function mailAttachmentPreview({uid, sn, account = ''} = {}) {
    if (!uid || !sn || !account) throw new GwError('BAD_ARG', '미리보기 정보가 없습니다.');
    if (!READ_ONLY.has('/ecm/ecm001A07')) throw new GwError('NOT_ALLOWED', '허용되지 않은 API입니다.');
    const ctx = context();
    const client = findClient();
    let timer;
    try {
      const res = await Promise.race([
        client.post('/ecm/ecm001A07', {fileSn: sn, authKeyMap: JSON.stringify({email: account, muid: String(uid), empSeq: String(ctx.empSeq)}), moduleGbn: 'MAIL'}),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new GwError('TIMEOUT', '미리보기 변환 시간 초과')), 120000); }),
      ]);
      const r = typeof res === 'string' ? JSON.parse(res) : res;
      if (!r || r.resultCode !== 0 || typeof r.resultData !== 'string' || !r.resultData.trim()) throw new GwError('API_ERROR', (r && r.resultMsg) || '문서 변환 실패');
      let url;
      try { url = new URL(r.resultData, ORIGIN); } catch { throw new GwError('BAD_URL', '허용되지 않은 미리보기 주소입니다.'); }
      if (url.username || url.password || !(url.origin === ORIGIN || /^https:\/\/(?:[a-z0-9-]+\.)*amaranth10\.co\.kr$/i.test(url.origin) || (/^http:\/\/10\.\d+\.\d+\.\d+(?::\d+)?$/i.test(url.origin) && /SynapDocViewServer/i.test(url.pathname)))) throw new GwError('BAD_URL', '허용되지 않은 미리보기 주소입니다.');
      return url.href;
    } catch (e) { throw parseRejection(e); }
    finally { clearTimeout(timer); }
  }
  // Text of one converted mail attachment (v0.88.0): the same GETs the groupware document viewer makes after
  // /ecm/ecm001A07 converts the file (status, then one XML per page with positioned characters). No state change.
  // Only same-origin /SynapDocViewServer/ addresses built from the converter's key are read; the caller turns XML into text.
  async function mailAttachmentPages({uid, sn, account = '', maxPages = 8} = {}) {
    const href = await mailAttachmentPreview({uid, sn, account});
    let u;
    try { u = new URL(href); } catch { throw new GwError('BAD_URL', '미리보기 주소를 읽지 못했습니다.'); }
    const key = u.searchParams.get('key') || '';
    if (u.origin !== ORIGIN || !/^\/SynapDocViewServer\//.test(u.pathname) || !/^[A-Za-z0-9_=+-]{10,300}$/.test(key)) throw new GwError('BAD_URL', '이 첨부는 글자로 읽을 수 있는 미리보기 주소가 아닙니다.');
    return synapPages(key, maxPages);
  }
  // Read a converted document by its viewer key: status (page count) then one positioned-character XML per page.
  const SYNAP_IMG = /^(jpe?g|png|gif|bmp|tiff?)$/i;
  async function synapPages(key, maxPages = 8) {
    if (!/^[A-Za-z0-9_=+-]{10,300}$/.test(String(key || ''))) throw new GwError('BAD_ARG', '문서 뷰어 키가 올바르지 않습니다.');
    const get = async (p, ms = 20000) => {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const tm = setTimeout(() => { try { ac && ac.abort(); } catch {} }, ms);
      try {
        const r = await fetch(ORIGIN + '/SynapDocViewServer/' + p, {credentials: 'same-origin', redirect: 'error', ...(ac ? {signal: ac.signal} : {})});
        if (!r.ok) throw new GwError('API_ERROR', `미리보기 응답 오류(${r.status})`);
        return await r.text();
      } catch (e) { throw e instanceof GwError ? e : new GwError('API_ERROR', '미리보기를 읽지 못했습니다.'); }
      finally { clearTimeout(tm); }
    };
    let st = null;
    for (let i = 0; i < 8; i++) {
      try { st = JSON.parse(await get(`status/${key}?`)); } catch { st = null; }
      if (st && (Number(st.pageNum) > 0 || SYNAP_IMG.test(String(st.format || '')))) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    const total = st ? Number(st.pageNum) || 0 : 0;
    // 그림 파일은 쪽 수가 0으로 오고 글자 XML이 없다: 한 장짜리 그림으로 돌려준다(글자는 AI 그림 읽기로만)
    if (!total && st && SYNAP_IMG.test(String(st.format || ''))) return {format: str(st.format, 10), total: 1, pages: [], key, image: true};
    if (!total) throw new GwError('NOT_READY', '문서 변환이 아직 끝나지 않았습니다. 잠시 뒤 다시 시도하세요.');
    const n = Math.min(total, Math.max(1, Math.min(20, Number(maxPages) || 8)));
    const pages = [];
    for (let p = 0; p < n; p++) { const x = await get(`thumbnailxml/${key}/${p}?dpi=96&dispAnnot=2&`); pages.push(x.length > 600000 ? '' : x); }
    return {format: str(st.format, 10), total, pages, key};
  }
  // Page images of a converted document (v0.90.0), for reading scans and pictures with AI after the user agrees.
  // Same viewer GET as the page thumbnails; PNG/JPEG only, at most 4 pages and 2.5MB each, returned as base64.
  async function synapPageImages({key, pages = 1, width = 1600} = {}) {
    if (!/^[A-Za-z0-9_=+-]{10,300}$/.test(String(key || ''))) throw new GwError('BAD_ARG', '문서 뷰어 키가 올바르지 않습니다.');
    const n = Math.max(1, Math.min(4, Number(pages) || 1)), long = Math.max(800, Math.min(2000, Number(width) || 1600));
    // w·h는 잘라내기 크기라서, 쪽마다 원래 크기(96dpi)를 보고 긴 변이 long이 되도록 dpi를 낮춘 뒤 그 dpi의 정확한 크기로 받는다
    const dims = async dpi => { try { return JSON.parse(await (await fetch(`${ORIGIN}/SynapDocViewServer/dimension/${key}/0-${n - 1}?dpi=${dpi}&`, {credentials: 'same-origin', redirect: 'error'})).text()); } catch { return []; } };
    const base = await dims(96);
    const out = [];
    for (let p = 0; p < n; p++) {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const tm = setTimeout(() => { try { ac && ac.abort(); } catch {} }, 30000);
      try {
        const d0 = base.find(x => x && x.p === p) || {w: 793, h: 1121};
        const dpi = Math.max(24, Math.min(96, Math.floor(96 * long / Math.max(d0.w || 793, d0.h || 1121))));
        const d1 = (await dims(dpi)).find(x => x && x.p === p) || {w: Math.round((d0.w || 793) * dpi / 96), h: Math.round((d0.h || 1121) * dpi / 96)};
        const r = await fetch(`${ORIGIN}/SynapDocViewServer/thumbnail/${key}/${p}?dpi=${dpi}&w=${d1.w}&h=${d1.h}&dispAnnot=2&`, {credentials: 'same-origin', redirect: 'error', ...(ac ? {signal: ac.signal} : {})});
        if (!r.ok) throw new GwError('API_ERROR', `쪽 그림을 받지 못했습니다(${r.status}).`);
        const blob = await r.blob();
        if (!/^image\/(png|jpeg)$/i.test(blob.type) || blob.size < 100 || blob.size > 2.5 * 1048576) throw new GwError('BAD_IMAGE', '쪽 그림 형식이나 크기가 맞지 않습니다.');
        const data = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result || '').replace(/^data:[^,]*,/, '')); fr.onerror = () => reject(new GwError('API_ERROR', '쪽 그림을 읽지 못했습니다.')); fr.readAsDataURL(blob); });
        out.push({mime: blob.type, data, bytes: blob.size, page: p});
      } catch (e) { throw e instanceof GwError ? e : new GwError('API_ERROR', '쪽 그림을 받지 못했습니다.'); }
      finally { clearTimeout(tm); }
    }
    return out;
  }
  // Text of an approval-document (ECM) attachment (v0.89.0). The groupware's own file popup converts the file for the
  // signed-in user's permissions; a hidden frame opens it only until the viewer key appears, then the same page XML is read.
  async function docAttachmentPages({fileId, maxPages = 8} = {}) {
    if (!/^[A-Za-z0-9]{16,64}$/.test(String(fileId || ''))) throw new GwError('BAD_ARG', '첨부 식별자가 올바르지 않습니다.');
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-4000px;top:0;width:900px;height:900px;border:0;opacity:0;pointer-events:none';
    frame.src = LINKS.file(fileId);
    document.body.appendChild(frame);
    let key = '';
    const scan = (w, depth) => {
      if (!w || depth > 3 || key) return;
      try { for (const e of w.performance.getEntriesByType('resource')) { const m = String(e.name).match(/^https:\/\/[^/]+\/SynapDocViewServer\/status\/([A-Za-z0-9_=+-]{10,300})\?/); if (m && new URL(e.name).origin === ORIGIN) { key = m[1]; return; } } } catch {}
      try { for (const fr of w.document.querySelectorAll('iframe')) { scan(fr.contentWindow, depth + 1); if (key) return; } } catch {}
    };
    try {
      const t0 = Date.now();
      while (!key && Date.now() - t0 < 25000) { await new Promise(r => setTimeout(r, 300)); scan(frame.contentWindow, 0); }
    } finally { frame.remove(); }
    if (!key) throw new GwError('TIMEOUT', '첨부 미리보기를 준비하지 못했습니다(권한이 없거나 변환 시간이 지났습니다).');
    try { return await synapPages(key, maxPages); }
    finally {
      // 숨은 미리보기 창의 문서 뷰어가 남긴 쪽 정보 캐시(synap_<key>_*, 건당 50~160KB)를 지워 저장 공간이 차지 않게 한다
      try { for (const k of Object.keys(localStorage)) if (k.startsWith('synap_' + key)) localStorage.removeItem(k); } catch {}
    }
  }

  async function mailAttachment({uid, sn, account = ''} = {}) {
    if (!uid || !sn) throw new GwError('BAD_ARG', '첨부 정보가 없습니다.');
    if (!READ_ONLY.has('/mail/mail002A37')) throw new GwError('NOT_ALLOWED', '허용되지 않은 API입니다.');
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
    const raw = await call(def.api, body);
    const {list, total} = firstList(raw);
    // Only an explicit, valid totalCount and an actual list establish completeness.
    // startCount is not proof of the total and must not support absence decisions.
    let container = raw;
    while (container && typeof container === 'object' && !Array.isArray(container.list)) {
      container = ['map', 'list', 'result'].map(k => container[k]).find(v => v && typeof v === 'object' && !Array.isArray(v));
    }
    const value = container && container.totalCount;
    const count = value !== null && value !== undefined && String(value).trim() !== '' ? Number(value) : NaN;
    const reliableTotal = container && Array.isArray(container.list) && Number.isSafeInteger(count) && count >= 0 ? count : null;
    return {kind, page, total, reliableTotal, from, to, docs: list.map(r => toDoc(r, kind))};
  }

  // List-only fallback is limited to the approvalPage date range and current server permissions.
  async function approvalFallback({docNo = '', year = '', days = 92} = {}) {
    const number = String(docNo || '').trim(), wantedYear = String(year || '');
    if (!number || !/^\d{4}$/.test(wantedYear) || !Number.isSafeInteger(days) || days < 1 || days > 36500)
      throw new GwError('BAD_QUERY', '정확한 문서번호, 4자리 연도와 유효한 조회 일수가 필요합니다.');
    const size = 100, maxResults = 1000, candidates = [], coverage = {};
    for (const {key} of APPROVAL_LISTS) {
      const info = coverage[key] = {status: 'incomplete', pages: 0, fetched: 0, total: null, from: null, to: null};
      const seen = new Set(); let total = null;
      for (let page = 1; page <= maxResults / size; page++) {
        let result;
        try { result = await approvalPage(key, page, {days, size}); }
        catch (e) { info.status = 'error'; info.error = typeof e?.code === 'string' && /^[A-Z_]{1,40}$/.test(e.code) ? e.code : 'ERROR'; break; }
        info.pages++;
        if (!Array.isArray(result?.docs) || !Number.isSafeInteger(result.reliableTotal) || result.reliableTotal < 0) break;
        if (total === null) { total = result.reliableTotal; info.total = total; info.from = result.from; info.to = result.to; }
        if (result.reliableTotal !== total || result.from !== info.from || result.to !== info.to) break;
        if (total > maxResults) { info.status = 'capped'; break; }
        const rows = result.docs;
        if (rows.length > size || info.fetched + rows.length > total) break;
        let unstable = false;
        for (const row of rows) {
          const id = String(row?.docId || '').trim();
          if (!id || seen.has(id)) unstable = true;
          if (id) seen.add(id);
          if (String(row?.docNo || '').trim() === number) candidates.push(row);
        }
        info.fetched += rows.length;
        if (unstable) break;
        if (info.fetched === total) { info.status = 'complete'; break; }
        if (rows.length !== size) break;
      }
    }
    const matching = candidates.filter(row => /^\d{4}/.test(String(row.date || '')) && String(row.date).slice(0, 4) === wantedYear);
    const uncertain = candidates.some(row => !/^\d{4}/.test(String(row.date || '')) || !String(row.docId || '').trim());
    const ids = new Set(matching.map(row => String(row.docId).trim()));
    const complete = Object.values(coverage).every(x => x.status === 'complete');
    return {candidates: matching, coverage, complete, reason: !complete ? 'incomplete' : uncertain || ids.size > 1 ? 'ambiguous' : ids.size === 1 ? 'unique' : 'not_found'};
  }

  // Preview of an approval document from the search index: no popup is opened, so no 열람 record.
  async function docPreview({docNo = '', title = '', year = ''} = {}) {
    const number = String(docNo || '').trim();
    const name = String(title || '').replace(/\s/g, '');
    const q = number || String(title || '').replace(/[\[\]()「」『』]/g, ' ').trim().slice(0, 40);
    if (q.length < 2) return {found: false};
    if (year && !/^\d{4}$/.test(String(year))) return {found: false, reason: 'ambiguous'};
    // A bounded complete scan is required: search ranking is not evidence of uniqueness.
    const pageSize = 100, maxResults = 1000;
    const collect = async keyword => {
      let total = null; const items = [], seen = new Set();
      for (let page = 1; ; page++) {
        const r = await search(keyword, {types: ['doc'], pageSize, page});
        const group = r && r.groups && r.groups.doc;
        if (!group || group.error) throw new GwError(group?.error || 'SEARCH_ERROR', group?.message || '문서 검색 결과를 읽지 못했습니다.');
        const rows = group.items;
        if (!Array.isArray(rows) || !Number.isSafeInteger(group.reliableTotal) || group.reliableTotal < 0) return null;
        if (total === null) total = group.reliableTotal;
        if (group.reliableTotal !== total || total > maxResults || rows.length > pageSize || items.length + rows.length > total) return null;
        for (const row of rows) {
          // Repeated IDs across pages indicate an unstable result window; do not infer completeness.
          const id = String(row.docId || '');
          if (id && seen.has(id)) return null;
          if (id) seen.add(id);
          items.push(row);
        }
        if (items.length === total) return items;
        if (rows.length !== pageSize) return null;
      }
    };
    let items = await collect(q);
    if (!items) return {found: false, reason: 'incomplete'};
    // Some indexes tokenize the numeric part but return zero hits for the full number.
    const suffix = number.match(/-(\d{2,})$/)?.[1] || '';
    if (number && items.length === 0 && suffix && suffix !== q) {
      items = await collect(suffix);
      if (!items) return {found: false, reason: 'incomplete'};
    }
    // The fallback is only a search term, never an identity: require the entire number.
    let hits = items.filter(x => number ? String(x.docNo || '').trim() === number : name && String(x.title || '').replace(/\s/g, '') === name);
    if (year) {
      if (hits.some(x => !/^\d{4}/.test(String(x.date || '')))) return {found: false, reason: 'ambiguous'};
      hits = hits.filter(x => String(x.date).slice(0, 4) === String(year));
    }
    const ids = new Set(hits.map(x => x.docId).filter(Boolean));
    if (hits.length && (ids.size !== 1 || hits.some(x => !x.docId))) return {found: false, reason: 'ambiguous'};
    return hits.length ? {found: true, ...hits[0]} : {found: false};
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

  // Executed amount per month for one budget code (and its children) — batched in groups of 4.
  async function budgetMonthly({project, code, year, gisu} = {}) {
    if (!project) throw new GwError('BAD_QUERY', '프로젝트 코드가 필요합니다.');
    const ctx = context();
    const y = Number(year || kstParts().y);
    const g = String(gisu || (y - 2014));
    const months = Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0'));
    const res = [];
    for (let i = 0; i < months.length; i += 4) {
      const part = await Promise.all(months.slice(i, i + 4).map(m => call('/nonprofit/NCC0610/0BN00002', {bgtFrYm: `${y}${m}`, bgtToYm: `${y}${m}`, bgtBeforeFrYm: '', bgtBeforeToYm: '', bgtStartFrYm: `${y}0101`, summaryYn: 'N', abgtFg: '1', divCds: `${ctx.erpCompSeq}|`, mgtCds: `${project}|`, bottomCds: '', mgtBottomList: [], bgtCnt: '1', abdocuFg: '1', acctdefFg: 'N001', abdocuDtFg: '1', grFg: '0', zeroFg: '2', divFg: '8', sumRtFg: '2', ctrCd05: '3', ctrCd10: '1', optionBN03: '1', optionBN10: '1', optionBN11: '0', optionBN14: '0', pOptionBn15: '0', coCd: ctx.erpCompSeq, gisu: g, empCd: ctx.erpEmpSeq, gisuFrDt: `${y}0101`, gisuToDt: `${y}1231`}, {timeoutMs: 30000})
        .then(d => { const rows = arr(d && d.printList).map(budgetRow); const sel = code ? rows.filter(r => r.path.split('|').includes(code)) : rows; return {month: m, rows: sel}; })
        .catch(e => ({month: m, error: e.code}))));
      res.push(...part);
    }
    return {project, code, year: y, gisu: g, months: res};
  }

  // 보낸메일함 최근 목록(읽기 전용, 본문 없음). 대화 비서의 "보낸 메일" 조회용.
  async function sentMail({size = 50} = {}) {
    const boxes = arr((await call('/mail/mail000A01')).mailboxList), sent = boxes.find(b => b.name === 'SENT');
    if (!sent) return [];
    const d = await call('/mail/mail003A01', {boxName: 'SENT', mainApiCode: 'mail003A01', mboxSeq: sent.mboxSeq, page: 1, pageSize: Math.min(Math.max(+size || 50, 1), 100), sort: 'rfc822date', sortType: 'desc', listType: '', showType: '', seen: false});
    return arr(d && d.Records).map(r => ({uid: str(r.muid, 40), subject: mask(r.subject, 200), date: str(r.tooltipDate || r.rfc822date, 25), to: str(r.toAddrName, 60)}));
  }

  // A subject match is only a candidate, never evidence of a reply to this message.
  async function findReply({subject = '', since = ''} = {}) {
    const boxes = arr((await call('/mail/mail000A01')).mailboxList);
    const sent = boxes.find(b => b.name === 'SENT');
    if (!sent) return {checked: false, found: false};
    const d = await call('/mail/mail003A01', {boxName: 'SENT', mainApiCode: 'mail003A01', mboxSeq: sent.mboxSeq, page: 1, pageSize: 50, sort: 'rfc822date', sortType: 'desc', listType: '', showType: '', seen: false});
    const norm = s => String(s || '').replace(/^\s*((re|fw|fwd|회신|답장|전달)\s*[:：]\s*)+/i, '').replace(/\s+/g, '').toLowerCase();
    const want = norm(subject);
    const hit = want && arr(d && d.Records).find(r => norm(r.subject) === want && (!since || str(r.tooltipDate || r.rfc822date, 25) >= since));
    // The API provides no verified message/thread relationship. Even a matching
    // candidate or a truncated/no-result search cannot prove sent or unsent.
    return {checked: false, found: false, candidate: hit ? {
      uid: str(hit.muid, 40), subject: mask(hit.subject, 200), date: str(hit.tooltipDate || hit.rfc822date, 25), to: str(hit.toAddrName, 60)
    } : null};
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
    version: VERSION, collect, call, search, organizationTree, organizationMembers, sentMail, budgetCatalog, budgetProject, budgetAll, budgetLedger, budgetMonthly, cardUsage, etaxInvoices, attendanceDays, teamAttendance, teamPlanned, resourceList, resourceBookings, resourceDetail, resourceCheck, reserveResource, myReservations, todoList, todoDetail, todoCreate, todoUpdate, todoSetDone, todoSetProgress, todoSetImportance, todoDelete, todoLink, todoComments, readAlert, routingHistory, submittedRange, approvalPage, approvalFallback, docPreview, frequentForms, findReply, mailDetail, mailInlineImage, mailAttachment, mailAttachmentPreview, mailAttachmentPages, docAttachmentPages, synapPageImages, saveBlob,
    context: () => { const c = context(); return {name: c.name, deptName: c.deptName, compName: c.compName, duty: c.duty, position: c.position}; },
    readOnlyEndpoints: () => [...READ_ONLY], routes: ROUTES, links: LINKS, searchLabels: SEARCH_LABELS, defaults: DEFAULTS,
  });
})();
