/*
 * BWYF groupware live collector (runs inside a logged-in https://gw.bwyf.or.kr page).
 *
 * How it works
 * - Reuses the groupware's own signed API client (the webpack module that adds
 *   Authorization / timestamp / wehago-sign headers). This script never reads,
 *   copies or prints cookie, token or signing-key values.
 * - Only endpoints in READ_ONLY are callable. Writes (send, approve, commute
 *   registration, visit statistics, preference saves) are rejected before any
 *   request is made.
 * - Listing APIs do not open mails or documents, so unread states stay intact.
 *
 * Usage (page context):  await BWYFGW.collect({ mailCount: 100, days: 14 })
 */
(() => {
  'use strict';
  const VERSION = '1.0.0';
  const ORIGIN = 'https://gw.bwyf.or.kr';

  // Endpoints verified on 2026-11-08 as list/read calls issued by the app itself.
  const READ_ONLY = new Set([
    '/mail/mail000A01', '/mail/mail000A03', '/mail/mail003A01',
    '/ea/api/getMenuCountInfo', '/ea/ea036A02', '/ea/ea025A04', '/ea/ea023A02', '/ea/ea027A02',
    '/ea/ea038A09', '/ea/ea038A15',
    '/board/APIHandler/ViewBoardArtList', '/board/APIHandler/getBoardReadCnt',
    '/schres/sc111A02', '/schres/sc111A03', '/gw/APIHandler/gw114A14',
    '/human/common/judgeTimeManagement/getTodayComeLeaveInfo', '/personal/hpd0220/0hr00001',
    '/personal/hpd0550/0hp00002', '/personal/hpd0550/0hp00003',
    '/nonprofit/NCC0610/0BN00002',
    '/event/event02A01',
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

  const ROUTES = {
    mail: '#/UD/UDA/UDA0000?specialLnb=Y&moduleCode=UD&menuCode=UDA&pageCode=UDA0020',
    approvalHome: '#/UC/UCA/UCA0000?specialLnb=Y&moduleCode=UC&menuCode=UCA&pageCode=UCA8000',
    approvalPage: page => `#/UC/UCA/UCA0000?specialLnb=Y&moduleCode=UC&menuCode=UCA&pageCode=${page}`,
    notice: '#/UF/UFA/UFA0000?specialLnb=Y&moduleCode=UF&menuCode=3000300_001008&pageCode=UFA3000',
    schedule: '#/UE/UEA/UEA0000?specialLnb=Y&moduleCode=UE&menuCode=UEA&pageCode=UEA0000',
    worktime: '#/HP/HPD0220/HPD0220',
    leave: '#/HP/HPD0550/HPD0550',
    budget: '#/HP/NPC2040/NCC0610',
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
    let text = typeof reason === 'string' ? reason : (reason && reason.message) || String(reason);
    try {
      const j = JSON.parse(text);
      const code = j && (j.errors && j.errors.code || j.resultCode || j.errorCode);
      const msg = j && (j.errors && j.errors.message || j.resultMsg || j.errorMsg) || '';
      if (code === 'E002' || /Token is not exists|Session is not exists/i.test(msg)) return new GwError('SESSION_EXPIRED', '그룹웨어 로그인 세션이 만료되었습니다.');
      if (code === 601) return new GwError('ORIGIN_REJECTED', '허용된 쿠키 인증 URL이 아닙니다(601).');
      return new GwError('API_ERROR', `${code || ''} ${msg}`.trim() || 'API 오류');
    } catch { return new GwError('API_ERROR', text.slice(0, 200)); }
  }

  async function call(path, body = {}, {timeoutMs = 15000} = {}) {
    if (!READ_ONLY.has(path)) throw new GwError('NOT_ALLOWED', `읽기 전용 허용 목록에 없는 API입니다: ${path}`);
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
  const mask = s => str(s, 1000).replace(SECRET, '$1[MASKED]');
  const firstList = obj => {
    if (!obj || typeof obj !== 'object') return {list: [], total: null};
    if (Array.isArray(obj.list)) return {list: obj.list, total: obj.totalCount !== undefined ? num(obj.totalCount) : (obj.startCount !== undefined ? num(obj.startCount) : null)};
    for (const k of ['map', 'list', 'result']) if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) return firstList(obj[k]);
    return {list: [], total: null};
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

  // ---------- modules ----------
  async function collectMail(ctx, opt) {
    const boxesRaw = await call('/mail/mail000A01');
    const boxes = ((boxesRaw && boxesRaw.mailboxList) || []).map(b => ({seq: b.mboxSeq, name: str(b.name, 60), total: num(b.exists), unseen: num(b.unseen)}));
    const inbox = boxes.find(b => b.name === 'INBOX') || {seq: 571, name: 'INBOX'};
    const toMail = (r, box) => ({
      uid: str(r.muid, 40), box, subject: mask(r.subject).slice(0, 300), from: str(r.fromAddrName || r.from, 80), fromEmail: str(r.fromAddrEmail, 120),
      date: str(r.tooltipDate || r.rfc822date, 40), shortDate: str(r.rfc822date, 20), seen: num(r.seen) === 1, flagged: num(r.flagged) === 1,
      answered: num(r.answered) === 1, forwarded: num(r.forward) === 1, attach: num(r.attach) > 0, size: num(r.size), preview: mask(r.context).slice(0, 220),
    });
    const list = async (box, size, seenFilter) => {
      const body = {boxName: box.name, mainApiCode: 'mail003A01', mboxSeq: box.seq, page: 1, pageSize: size, sort: 'rfc822date', sortType: 'desc', listType: '', showType: '', seen: false};
      const d = await call('/mail/mail003A01', body);
      const records = ((d && d.Records) || []).map(r => toMail(r, box.name));
      return {total: num(d.TotalRecordCount), unseen: num(d.TotalUnseenCount), records: seenFilter ? records.filter(r => !r.seen) : records};
    };
    const inboxData = await list(inbox, Math.min(Math.max(opt.mailCount, 10), 200));
    const extra = boxes.filter(b => !['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM'].includes(b.name) && b.unseen > 0);
    const others = await Promise.all(extra.map(b => list(b, 30, true).then(x => x.records).catch(() => [])));
    return {boxes, inbox: {total: inboxData.total, unseen: inboxData.unseen, fetched: inboxData.records.length, records: inboxData.records}, otherUnseen: others.flat(), url: ORIGIN + '/' + ROUTES.mail};
  }

  async function collectApproval(ctx, opt) {
    const countsRaw = await call('/ea/api/getMenuCountInfo', {groupSeq: ctx.groupSeq, compSeq: ctx.compSeq, bizSeq: ctx.bizSeq, deptSeq: ctx.deptSeq, empSeq: ctx.empSeq, userSe: ctx.userSe, langCode: ctx.langCode, leftMenuCntYn: 'Y'});
    const counts = Object.entries(countsRaw || {}).map(([menu, value]) => {
      const [a, b] = String(value).split('/');
      return {menu, name: APPROVAL_MENUS[menu] || menu, count: num(a), total: b !== undefined ? num(b) : null};
    });
    const now = new Date();
    const from = ymd(addDays(now, -opt.approvalDays)), to = ymd(now);
    const base = {fDocSts: '', sDocSts: '', readYn: '', selectFlag: '', riKind: '', c_aiokflag: '', allDocSts: '', sortType: 'DESC', page: '1', pageSize: String(opt.approvalPageSize), menuAuthType: 'USER', searchAuthType: 'U', sfrDt: from, stoDt: to, fromDate: from, toDate: to, multiDeptSeq: [], multiKlUserName: [], multiTxtDrafters: [], multiReceiveSendUsers: [], multiRiEmpNames: [], multiLastKlEmps: [], multiaiUserNames: [], co_id: ctx.compSeq, searchType: ''};
    const toDoc = (r, viewing = false) => ({
      docId: str(r.diKeyCode, 30), title: mask(r.diTitle).slice(0, 300), status: str(r.diStatusName || r.rsStatusName || r.rsFlagName, 60), statusCode: str(r.diStatus || r.rsStatus, 10),
      drafter: str(r.diEmpName, 40), drafterDept: str(r.diDeptName, 60), approver: str(r.diKyulJaeUserName, 40),
      sender: str(r.riSendOrgName || r.orgDept || r.riSendDeptName, 100), docNo: str(r.riSendDocNum || r.diDocNum || r.docNo, 60),
      date: str(r.diWriteDate || r.riArriveDate || r.rsReceiveDate || r.rsReadDate, 25), attachments: num(r.attachCount), comments: num(r.commentCount),
      // 열람문서 rows carry the reader's empSeq in riReadYn once read and '' before.
      unread: r.riReadYn === 'N' || r.readYn === 'N' || r.rsReadYn === 'N' || (viewing && !r.riReadYn),
    });
    const lists = {};
    await Promise.all(APPROVAL_LISTS.map(async def => {
      const body = {...base, nMenuID: def.menu, pageCode: def.page, periodPicker: def.period, sortField: def.period, topSort: def.period, ...(def.extra || {})};
      try {
        const {list, total} = firstList(await call(def.api, body));
        lists[def.key] = {label: def.label, menu: def.menu, total, fetched: list.length, from, to, docs: list.map(r => toDoc(r, def.key === 'viewing')), url: ORIGIN + '/' + ROUTES.approvalPage(def.page)};
      } catch (e) {
        lists[def.key] = {label: def.label, menu: def.menu, error: e.code || 'ERROR', message: e.message, docs: [], url: ORIGIN + '/' + ROUTES.approvalPage(def.page)};
      }
    }));
    return {counts, lists, url: ORIGIN + '/' + ROUTES.approvalHome};
  }

  async function collectNotice(ctx, opt) {
    const boardNo = String(opt.noticeBoard || '223');
    const body = {adminPage: 'N', searchAuthType: '', boardNo, searchTotal: '', searchTitle: '', searchNick: '', searchDesc: '', searchBoard: '', searchRemarkNo: '', searchEtcValue: '', searchStartDate: '', searchEndDate: '', searchStartTerm: '', searchEndTerm: '', eventStatus: '', reserveStatus: '', counselingOk: '', searchMailFrom: '', sort: 'write_date', project_id: null, page: 1, pageSize: String(opt.noticeCount), sortType: 'desc', menuCode: 'UFA', pageCode: 'UFA3000', moduleCode: 'UF', noticeYn: '', apiName: 'ViewBoardArtList', use_list_art_content: 'N'};
    const [d, readCnt] = await Promise.all([call('/board/APIHandler/ViewBoardArtList', body), call('/board/APIHandler/getBoardReadCnt', {cat_seq_no: boardNo}).catch(() => null)]);
    const articles = ((d && d.articleList) || []).map(a => ({
      id: str(a.art_seq_no, 20), title: mask(a.art_title).slice(0, 300), writer: str(a.mbr_nick, 40), dept: str(a.deptname || a.dept_name, 60),
      date: str(a.write_date_origin || a.write_date, 25), read: a.art_read_yn === 'Y', top: a.notice_yn === 'Y' || a.notice_yn_top === 'Y',
      files: num(a.file_cnt), mine: a.my_yn === 'Y', reserved: a.reserve_yn === 'Y' && String(a.reserve_state) === '0', reserveStart: str(a.reserve_start, 25),
    }));
    return {board: boardNo, total: num(d.totalCnt), unread: readCnt ? num(String(readCnt.not_read_cnt || '0').split('/')[0]) : null, fetched: articles.length, articles, url: ORIGIN + '/' + ROUTES.notice};
  }

  async function collectSchedule(ctx, opt) {
    const companyInfo = {compSeq: ctx.compSeq, groupSeq: ctx.groupSeq, deptSeq: ctx.deptSeq, emailAddr: ctx.emailAddr, emailDomain: ctx.emailDomain};
    const now = new Date();
    const start = ymd(now), end = ymd(addDays(now, opt.days));
    const cals = await call('/schres/sc111A02', {companyInfo, calType: '', langCode: ctx.langCode});
    const calendars = ((cals && cals.resultList) || []).filter(c => c.displayYn !== 'N').map(c => ({seq: str(c.mcalSeq, 20), type: str(c.calType, 4), title: str(c.calTitle, 60), writable: c.calRwGbn === 'w'}));
    const calList = calendars.map(c => ({mcalSeq: c.seq, calType: c.type, adminYn: c.writable ? 'Y' : 'N', color: ''}));
    const [rows, holidays] = await Promise.all([
      calList.length ? call('/schres/sc111A03', {companyInfo, startDate: start, endDate: end, mySchYn: 'N', calList, tcalList: [], acalList: [], searchEmpSeq: '', excelYn: null, abUID: '', sortDate: 'Y', langCode: ctx.langCode}) : {resultList: []},
      call('/gw/APIHandler/gw114A14', {startDate: start, endDate: end, compSeq: ctx.compSeq}).catch(() => []),
    ]);
    const events = ((rows && rows.resultList) || []).filter(r => r.delYn !== 'Y').map(r => ({
      id: str(r.schSeq, 20), title: mask(r.schTitle).slice(0, 200), calendar: str(r.calTitle, 60), start: str(r.startDate, 12), end: str(r.endDate, 12),
      allDay: r.alldayYn === 'Y', place: str(r.schPlace, 100), people: str(r.schUserList, 200),
    })).sort((a, b) => a.start.localeCompare(b.start));
    return {start, end, calendars, events, holidays: (Array.isArray(holidays) ? holidays : []).map(h => ({date: str(h.h_day, 8), title: str(h.title, 60)})), url: ORIGIN + '/' + ROUTES.schedule};
  }

  async function collectAttendance(ctx) {
    const p = kstParts();
    const today = `${p.y}${p.m}${p.d}`;
    const monthFrom = `${p.y}${p.m}01`, monthTo = `${p.y}${p.m}${String(lastDayOfMonth(p.y, p.m)).padStart(2, '0')}`;
    const [todayInfo, month] = await Promise.all([
      call('/human/common/judgeTimeManagement/getTodayComeLeaveInfo', {empCd: ctx.erpEmpSeq, coCd: ctx.erpCompSeq, workDt: today}).catch(e => ({error: e.code})),
      call('/personal/hpd0220/0hr00001', {atDtFrom: monthFrom, atDtTo: monthTo}).catch(e => ({error: e.code})),
    ]);
    const mins = v => (v === null || v === undefined || v === '') ? null : num(v);
    return {
      today: {date: today, come: str(todayInfo && todayInfo.comeTm, 12), leave: str(todayInfo && todayInfo.leaveTm, 12), error: todayInfo && todayInfo.error || ''},
      month: {from: monthFrom, to: monthTo, recognizedMin: mins(month.appworkTm), basicMin: mins(month.basicworkTm), overtimeMin: mins(month.overworkTm), exceptMin: mins(month.exceptworkTm), nightMin: mins(month.nightworkTm), error: month.error || ''},
      url: ORIGIN + '/' + ROUTES.worktime,
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
    const uses = (Array.isArray(usesRaw) ? usesRaw : []).map(u => ({start: str(u.startDt, 8), end: str(u.endDt, 8), startTime: str(u.startTm, 4), endTime: str(u.endTm, 4), kind: str(u.atNm, 30), days: num(u.ycUseCnt), title: mask(u.titleDc).slice(0, 120), approved: String(u.approState) === '1'}));
    return {
      year, granted: +granted.toFixed(5), used: +used.toFixed(5), remaining: +(granted - used).toFixed(5),
      breakdown: {basic: num(s.basicDy), add: num(s.addDy), reward: num(s.rewDy), change: num(s.changeDy), etc: num(s.etcDy), usedBasic: num(s.useDy), usedReward: num(s.useRewDy), usedChange: num(s.useChangeDy), inApproval: num(s.appProcessDy)},
      upcoming: uses.filter(u => u.end >= today).sort((a, b) => a.start.localeCompare(b.start)), usedCount: uses.length,
      url: ORIGIN + '/' + ROUTES.leave,
    };
  }

  async function collectBudget(ctx, opt) {
    const targets = (opt.budget || []).filter(t => t && t.project);
    if (!targets.length) return {projects: [], skipped: true};
    const year = Number(opt.budgetYear || kstParts().y);
    // 기수(회계기수): 2026년 = 12기 (observed). Override with opt.budgetGisu if the foundation renumbers.
    const gisu = String(opt.budgetGisu || year - 2014);
    const projects = await Promise.all(targets.map(async t => {
      const body = {bgtFrYm: `${year}01`, bgtToYm: `${year}12`, bgtBeforeFrYm: '', bgtBeforeToYm: '', bgtStartFrYm: `${year}0101`, summaryYn: 'Y', abgtFg: '1', divCds: `${ctx.erpCompSeq}|`, mgtCds: `${t.project}|`, bottomCds: '', mgtBottomList: [], bgtCnt: '1', abdocuFg: '1', acctdefFg: 'N001', abdocuDtFg: '1', grFg: '0', zeroFg: '2', divFg: '8', sumRtFg: '2', ctrCd05: '3', ctrCd10: '1', optionBN03: '1', optionBN10: '1', optionBN11: '0', optionBN14: '0', pOptionBn15: '0', coCd: ctx.erpCompSeq, gisu, empCd: ctx.erpEmpSeq, gisuFrDt: `${year}0101`, gisuToDt: `${year}1231`};
      try {
        const d = await call('/nonprofit/NCC0610/0BN00002', body, {timeoutMs: 30000});
        const row = r => ({code: str(r.bgtCd, 30), name: str(r.bgtNm, 120), level: str(r.divFgNm, 6), path: str(r.bglistCd, 120), budget: num(r.abgtSumAm), executed: num(r.unitAm), balance: num(r.subAm), rate: num(r.sumRt)});
        const all = (d.printList || []).map(row);
        const rows = t.filter ? all.filter(r => r.path.split('|').includes(t.filter)) : all.filter(r => ['관', '항'].includes(r.level));
        const sum = d.expendSum ? row({...d.expendSum, bgtCd: t.project, bgtNm: '합계', divFgNm: '계'}) : null;
        return {project: t.project, label: t.label || '', filter: t.filter || '', year, gisu, period: '누계', total: sum, rows, rowCount: all.length};
      } catch (e) {
        return {project: t.project, label: t.label || '', filter: t.filter || '', error: e.code || 'ERROR', message: e.message, rows: []};
      }
    }));
    return {projects, url: ORIGIN + '/' + ROUTES.budget};
  }

  async function collectAlerts(ctx, opt) {
    const d = await call('/event/event02A01', {header: {groupSeq: ctx.groupSeq, empSeq: ctx.empSeq}, body: {reqType: '2', reqSubType: 'N', pageSize: String(opt.alertCount), newYn: 'N', mentionYn: 'N', langCode: ctx.langCode, eventType: '', searchType: 'received', timeStamp: Date.now()}});
    const alerts = ((d && d.alertList) || []).map(a => {
      let data = {};
      try { data = typeof a.data === 'string' ? JSON.parse(a.data) : (a.data || {}); } catch { data = {}; }
      return {type: str(a.eventType, 20), subType: str(a.eventSubType, 20), title: mask(data.title || a.title || a.alertTitle).slice(0, 200), docNo: str(data.doc_no, 60), who: str(data.drafter_nm || data.userName || a.senderName, 40), dept: str(data.deptName, 60), time: str(data.rep_dt || a.createDate || a.alertDate, 25), read: !!a.readDate};
    });
    return {alerts};
  }

  const MODULES = {mail: collectMail, approval: collectApproval, notice: collectNotice, schedule: collectSchedule, attendance: collectAttendance, leave: collectLeave, budget: collectBudget, alerts: collectAlerts};
  const DEFAULTS = {
    modules: Object.keys(MODULES), mailCount: 100, days: 14, approvalDays: 92, approvalPageSize: 30, noticeCount: 20, noticeBoard: '223', alertCount: 20,
    budget: [{project: 'A201', label: '전략경영실운영', filter: '노121'}],
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

  window.BWYFGW = Object.freeze({version: VERSION, collect, call, context: () => { const c = context(); return {name: c.name, deptName: c.deptName, compName: c.compName}; }, readOnlyEndpoints: () => [...READ_ONLY], routes: ROUTES, defaults: DEFAULTS});
})();
