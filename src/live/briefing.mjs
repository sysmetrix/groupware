// Turns a raw BWYFGW.collect() result into an action-oriented briefing
// (analysis object, HTML, Markdown), a diff state and an assistant dataset.
// Pure functions: no network, no file access.

const ACTION_WORDS = /요청|확인|회신|제출|협조|검토|마감|기한|긴급|필독|참석|회의|신청|문의|보고|의견|취합/;
const NOISE_WORDS = /광고|뉴스레터|newsletter|weekly|위클리|웨비나|webinar|no-?reply|수신거부|구독|이벤트 안내/i;
// 홍보·뉴스레터 메일: 제목 말고 보낸 주소(edu@·news@·marketing@ 등)와 그림 문자로 시작하는 제목도 본다(예: '🅰️ 2027년도 AI와 함께할 미래…' edu@ablearn.kr).
const PROMO_SENDER = /^(edu|news|newsletter|marketing|event|events|mailer|noreply|no-reply|donotreply|promo|ad|ads|campaign)@/i;
const TRUSTED_MAIL = /(^|[.@])(bwyf\.or\.kr|go\.kr|korea\.kr|or\.kr|ac\.kr|re\.kr|(hs|ms|es|sc)\.kr)$/i;
export const isNoiseMail = m => { const s = String((m && m.subject) || ''), e = String((m && (m.fromEmail || m.email)) || ''); if (NOISE_WORDS.test(s)) return true; if (TRUSTED_MAIL.test(e)) return false; return PROMO_SENDER.test(e) || /^\s*[\u{1F000}-\u{1FAFF}]/u.test(s); };
const PRIORITY_ORDER = {high: 0, medium: 1, low: 2};

const pad = n => String(n).padStart(2, '0');
export function kstNow(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600_000);
  return {y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), hh: k.getUTCHours(), mm: k.getUTCMinutes(), date: `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`};
}
const dayNumber = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);
export const dday = (isoDate, now = new Date()) => dayNumber(isoDate) - dayNumber(kstNow(now).date);
const fmtYmd = s => (s && /^\d{8}/.test(s)) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || '');
const fmtYmdHm = s => (s && /^\d{12}/.test(s)) ? `${fmtYmd(s)} ${s.slice(8, 10)}:${s.slice(10, 12)}` : fmtYmd(s);
export const cleanTitle = s => String(s ?? '').replace(/[\u0000-\u001f\u007f\ufffd]/g, ' ').replace(/^[\s?？\ufffd]+/, '').replace(/\s+/g, ' ').trim();
// 6.59375 -> "6일 4시간 45분" (1일 = 8시간)
export const fmtDays = v => { if (v === null || v === undefined || v === '') return '-'; const n = Number(v); if (!Number.isFinite(n)) return String(v); const d = Math.trunc(n); const m = Math.round((n - d) * 480); const h = Math.floor(m / 60), mi = m % 60; return [`${d}일`, h ? `${h}시간` : '', mi ? `${mi}분` : ''].filter(Boolean).join(' '); };
const WD = '일월화수목금토';
const mdw = iso => `${iso.slice(5)}(${WD[new Date(iso + 'T00:00:00Z').getUTCDay()]})`;
const won = n => Number(n || 0).toLocaleString('ko-KR');
const hm = min => min === null || min === undefined ? '-' : `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const ageDays = (dateText, now) => { const t = Date.parse(String(dateText).replace(' ', 'T') + '+09:00'); return Number.isFinite(t) ? (now.getTime() - t) / 86400000 : Infinity; };

// "~11.20.", "11.20.까지", "11월 20일까지", "기한: 11/20", "(~11/9(월) 16:00)" -> {date, time}
export function extractDeadlineInfo(text, now = new Date()) {
  const s = String(text || '');
  const patterns = [
    /~\s*(\d{1,2})\s*[./]\s*(\d{1,2})/,
    /(\d{1,2})\s*[./]\s*(\d{1,2})\.?\s*(?:\([월화수목금토일]\))?\s*까지/,
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\([월화수목금토일]\))?\s*까지/,
    /(?:기한|마감|제출기한)\s*[:：]?\s*(\d{1,2})\s*[./월]\s*(\d{1,2})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m) continue;
    const month = Number(m[1]), day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const {y} = kstNow(now);
    let iso = `${y}-${pad(month)}-${pad(day)}`;
    if (dday(iso, now) < -60) iso = `${y + 1}-${pad(month)}-${pad(day)}`;
    if (Number.isNaN(Date.parse(iso))) continue;
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 18);
    const t = after.match(/(\d{1,2}):(\d{2})/);
    return {date: iso, time: t ? `${pad(Number(t[1]))}:${t[2]}` : ''};
  }
  return {date: '', time: ''};
}
export function extractDeadline(text, now = new Date()) { return extractDeadlineInfo(text, now).date; }

function docLink(raw, list) { return list?.url || raw?.data?.approval?.url || raw?.origin; }

// Every deadline-like expression in a longer text (document body, mail preview).
// A date counts only when it is introduced as a deadline (~, 까지, 기한, 마감, 제출, 회신, 신청) and ends like a date.
// strict: for short previews, only explicit deadline words (~, 까지, 기한, 마감) count.
export function extractAllDeadlines(text, now = new Date(), {strict = false} = {}) {
  const s = String(text || '').replace(/\s+/g, ' ');
  const found = [];
  const re = /(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*(?:[./]|월)\s*(\d{1,2})(?=\s*(?:\.|일|\(|까지|\s*\d{1,2}:\d{2}|$|[^\d부개명건회차]))\s*\.?\s*(?:일)?\s*(?:\(([월화수목금토일])\))?\s*(\d{1,2}:\d{2})?\s*(까지|마감|한|제출)?/g;
  let m;
  while ((m = re.exec(s)) && found.length < 30) {
    const lead = s.slice(Math.max(0, m.index - 14), m.index);
    const tail = s.slice(m.index + m[0].length, m.index + m[0].length + 4);
    if (/^\s*[~\-–]\s*\d/.test(tail)) continue; // start of a range: the end date is the deadline
    const isDeadline = strict ? (/까지|마감/.test(m[0]) || /~\s*$|기한|마감/.test(lead)) : (/까지|마감|제출/.test(m[0]) || /~\s*$|기한|마감|제출|회신|신청|접수/.test(lead));
    if (!isDeadline) continue;
    const month = Number(m[2]), day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const {y} = kstNow(now);
    const year = m[1] ? Number(m[1]) : y;
    let iso = `${year}-${pad(month)}-${pad(day)}`;
    if (!m[1] && dday(iso, now) < -60) iso = `${year + 1}-${pad(month)}-${pad(day)}`;
    if (Number.isNaN(Date.parse(iso))) continue;
    const context = s.slice(Math.max(0, m.index - 40), Math.min(s.length, m.index + m[0].length + 30)).trim();
    if (!found.some(f => f.date === iso)) found.push({date: iso, time: m[5] || '', dday: dday(iso, now), context});
  }
  return found.sort((a, b) => a.date.localeCompare(b.date));
}
// The deadline to act on: the nearest one that has not passed, otherwise the latest.
export function nextDeadline(list = []) { return list.find(x => x.dday >= 0) || list[list.length - 1] || null; }

// Daily attendance rows -> days that need a check. Cross-checks leave records and 근무일대체 nearby.
export function attendanceAnomalies(days = [], {now = new Date(), leaves = []} = {}) {
  const k = kstNow(now);
  const today = k.date.replace(/-/g, '');
  const covered = new Set();
  for (const u of leaves) {
    if (!u || !u.approved || !u.start) continue;
    if (u.days >= 0.75) for (let d = dayNumber(fmtYmd(u.start)); d <= dayNumber(fmtYmd(u.end || u.start)); d++) covered.add(new Date(d * 86400000).toISOString().slice(0, 10).replace(/-/g, ''));
  }
  const swaps = days.filter(r => /근무일대체|대체/.test(r.workType || '') || /근무일대체/.test(r.item || '')).map(r => r.date);
  // One 근무일대체 can explain only one absence: pair each swap with the nearest unexplained absence.
  const candidates = days.filter(r => r && !r.holiday && !/휴일/.test(r.result || '') && /결근|미출근/.test(r.result || '') && !r.applied && !covered.has(r.date)).map(r => r.date);
  const swapFor = new Map();
  for (const s of swaps) {
    const best = candidates.filter(c => !swapFor.has(c) && Math.abs(dayNumber(fmtYmd(c)) - dayNumber(fmtYmd(s))) <= 7).sort((a, b) => Math.abs(dayNumber(fmtYmd(a)) - dayNumber(fmtYmd(s))) - Math.abs(dayNumber(fmtYmd(b)) - dayNumber(fmtYmd(s))))[0];
    if (best) swapFor.set(best, s);
  }
  const out = [];
  for (const r of days) {
    if (!r || r.holiday || /휴일/.test(r.result || '')) continue;
    if (r.date === today && k.hh < 18) continue; // the day is not over yet
    // 출근 지문은 판정하지 않는다: 퇴근 지문이 있고 출근 지문 누락(이상근태/미출근/지각)만 문제인 날은 제외
    if (/이상|미출근|지각/.test(r.result || '') && !/결근|조퇴|미인정|미퇴근/.test(r.result || '') && !r.come && r.leave) continue;
    const bad = /결근|지각|조퇴|미인정|미출근|미퇴근|이상/.test(r.result || '');
    if (!bad) continue;
    if (r.applied && r.status === '승인') continue; // covered by an approved request (외출·반차 등)
    if (covered.has(r.date)) continue; // approved full-day leave on that day
    const absent = /결근|미출근/.test(r.result);
    const nearSwap = swapFor.get(r.date) || '';
    const hints = [];
    if (nearSwap) hints.push(`${fmtYmd(nearSwap).slice(5).replace('-', '/')}에 휴일근무(근무일대체) 기록 있음`);
    if (r.applied) hints.push(`근태신청 ${r.status || '진행 중'}`);
    out.push({date: r.date, result: r.result, item: r.item, status: r.status, nearSwap: nearSwap || '', applied: !!r.applied || (/미인정/.test(r.result || '') && !!r.item),
      priority: absent && !r.applied && !nearSwap ? 'high' : 'medium',
      advice: [...hints, r.applied ? '근태신청 결재가 끝나면 그룹웨어 기록이 바뀝니다' : '쉰 날이면 근태신청을 해야 그룹웨어 기록이 바뀝니다'].join(' · ')});
  }
  return out;
}

// Suggest where an incoming document should go, from past distribution/receipt history.
// Honest numbers: "비슷한 문서 n건 중 k건".
const STOP = /^(20\d{2}년?|\d+월?|안내|요청|알림|관련|제출|협조|실시|결과|계획|참석|회신|보고|개최|운영|및|등|위한|대한|부천|부천시|경기도|경기|재단|여성청소년재단|부천여성청소년재단|협조요청|참여|프로그램|사업)$/;
const tokens = t => new Set(String(t || '').replace(/[\[\]()「」『』【】<>"'“”‘’·,.:;!?~\-_/]/g, ' ').split(/\s+/).filter(w => w.length >= 2 && !STOP.test(w)));
// Organisation names in titles ("부천시청소년센터 10월 …") say who sent it, not what it is about.
const ORG_WORD = /(센터|재단|협의회|교육청|교육지원청|시청|구청|도청|본부|사무소|복지관|여성회관)$/;
const topicTokens = (title, orgs = []) => { const drop = new Set(orgs.flatMap(o => [...tokens(o)])); return new Set([...tokens(title)].filter(w => !drop.has(w) && !ORG_WORD.test(w))); };
export function recommendRouting(doc, history = [], {target = 'toDept', limit = 3} = {}) {
  const out = [];
  out.group = null; out.similar = 0;
  if (!doc || !history.length) return out;
  const want = topicTokens(doc.title, [doc.sendOrg, doc.sendDept, doc.sender]);
  // Rare words count more than words that appear in many past titles (IDF).
  const df = new Map();
  const byDoc = new Map();
  for (const h of history) {
    if (!h[target]) continue;
    const key = `${h.title}|${h.sendDeptCode}|${String(h.date).slice(0, 10)}`;
    const e = byDoc.get(key) || {title: h.title, date: h.date, from: h.sendDept || h.sendOrg, sendDeptCode: h.sendDeptCode, sendOrg: h.sendOrg, targets: new Set()};
    e.targets.add(h[target]);
    byDoc.set(key, e);
  }
  for (const e of byDoc.values()) for (const w of topicTokens(e.title, [e.sendOrg, e.from])) df.set(w, (df.get(w) || 0) + 1);
  const N = Math.max(1, byDoc.size);
  const idf = w => Math.log(1 + N / (df.get(w) || 1));
  const similar = [];
  for (const e of byDoc.values()) {
    const have = topicTokens(e.title, [e.sendOrg, e.from]);
    let overlap = 0, weight = 0;
    for (const w of want) if (have.has(w)) { overlap++; weight += idf(w); }
    const sameDept = !!(doc.sendDeptCode && doc.sendDeptCode === e.sendDeptCode);
    const sameOrg = !!(doc.sendOrg && doc.sendOrg === e.sendOrg);
    if (!overlap || weight < 2.2) continue; // topic must match on a meaningful word; sender alone is not evidence
    similar.push({...e, overlap, weight, sameDept, score: weight + (sameDept ? 3 : sameOrg ? 1 : 0)});
  }
  similar.sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)));
  const pool = similar.slice(0, 12);
  out.similar = pool.length;
  const tally = new Map();
  for (const e of pool) for (const t of e.targets) {
    const c = tally.get(t) || {name: t, count: 0, examples: [], sameDept: false};
    c.count++; c.sameDept = c.sameDept || e.sameDept;
    if (c.examples.length < 2) c.examples.push({title: e.title, date: e.date, from: e.from});
    tally.set(t, c);
  }
  const ranked = [...tally.values()].sort((a, b) => b.count - a.count).slice(0, limit);
  for (const r of ranked) {
    const ratio = pool.length ? r.count / pool.length : 0;
    out.push({name: r.name, count: r.count, of: pool.length, ratio: Math.round(ratio * 100), level: pool.length >= 3 && ratio >= 0.5 ? '높음' : '참고',
      reasons: [r.sameDept ? '같은 발송 부서' : '', '제목 주제 일치'].filter(Boolean), examples: r.examples});
  }
  const best = pool[0];
  // Show "동시 배부" only when the closest past document is really close (strong word match).
  out.group = best && best.targets.size >= 2 && (best.weight >= 3 || (best.sameDept && best.weight >= 2.2)) ? {title: best.title, date: best.date, from: best.from, targets: [...best.targets], strong: best.sameDept} : null;
  return out;
}

// Plain-text weekly report draft (주간 업무 실적) from my submitted documents and receipts.
const PERSONAL_FORMS = /연차휴가신청서|출장신청서|근무일대체신청서|연장근무신청서|시간외근무신청서/;
export function weeklyReport({submitted = [], receipts = [], me = '', from = '', to = '', now = new Date()} = {}) {
  const md = s => s ? `${Number(s.slice(4, 6))}.${Number(s.slice(6, 8))}.` : '';
  const clean = t => String(t || '').replace(/^\(\d{2}-\d{2}\)/, '').trim();
  const isPersonal = d => PERSONAL_FORMS.test(d.form || '') || (/^\(\d{2}-\d{2}\)/.test(d.title || '') && /휴가|외출|반차|출장|시간외|대체|근무일대체|연장근무|조퇴/.test(d.title || ''));
  const work = submitted.filter(d => !isPersonal(d));
  const personal = submitted.filter(d => isPersonal(d));
  const done = work.filter(d => /완료|종결/.test(d.status) || d.statusCode === '008');
  const going = work.filter(d => !done.includes(d));
  const lines = [`□ 주간 업무 실적 (${md(from)} ~ ${md(to)})${me ? ` — ${me}` : ''}`, ''];
  lines.push(`○ 기안·보고 ${work.length}건 (결재완료 ${done.length}, 진행 ${going.length})`);
  const grouped = new Map();
  for (const d of done) { const k = clean(d.title); const g = grouped.get(k) || {title: k, nos: []}; if (d.docNo) g.nos.push(d.docNo); grouped.set(k, g); }
  for (const g of grouped.values()) lines.push(`  - ${g.title}${g.nos.length > 1 ? ` (${g.nos.length}건: ${g.nos.join(', ')})` : g.nos[0] ? ` (${g.nos[0]})` : ''}`);
  for (const d of going) lines.push(`  - ${clean(d.title)} — ${d.status || '진행 중'}`);
  if (receipts.length) {
    lines.push('', `○ 접수 처리 ${receipts.length}건`);
    for (const r of receipts.slice(0, 15)) lines.push(`  - ${clean(r.title)}${r.sendOrg || r.sendDept ? ` (${[r.sendOrg, r.sendDept].filter(Boolean).join(' ')})` : ''}`);
    if (receipts.length > 15) lines.push(`  - 외 ${receipts.length - 15}건`);
  }
  if (personal.length) lines.push('', `○ 복무 신청 ${personal.length}건: ${personal.map(d => clean(d.title)).join(', ')}`);
  lines.push('', `※ 그룹웨어 목록 기준 자동 초안(${kstNow(now).date}). 제출 전 내용을 확인·보완하세요.`);
  return lines.join('\n');
}

export function toCsv(rows, columns) {
  const cell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d[\d,]*(\.\d+)?$/.test(s)) s = "'" + s; // formula injection guard (plain negative numbers stay numbers)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + [columns.map(c => cell(c.label)).join(','), ...rows.map(r => columns.map(c => cell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','))].join('\r\n');
}

// ---------- priority scoring ----------
const URGENT_WORDS = /긴급|필독|즉시|오늘까지|금일|시급|독촉|재요청/;
const REQUEST_WORDS = /요청|제출|회신|협조|검토|확인|조사|취합|의견|신청|작성/;
const PROMO_WORDS = /홍보|문화혜택|공연|모집|소식|초대|이벤트|할인|뉴스|웨비나|박람회|공모전 안내/;
const BASE = {mailAnswered: 30, conflictAnswered: 30, mailReplyIn: 12, pending: 62, rejected: 70, deptWaiting: 50, distWaiting: 48, sendWaiting: 34, viewing: 12, mailUnreadAsk: 46, mailUnread: 26, mailOther: 10, mailDeadline: 44, mailReply: 22, notice: 10, leave: 8, attHigh: 58, attMedium: 42, conflict: 85};
// Working days between a date text and now (weekends skipped).
function bizDays(dateText, now) {
  const t = Date.parse(String(dateText || '').replace(' ', 'T') + '+09:00');
  if (!Number.isFinite(t)) return 0;
  let n = 0;
  for (let d = new Date(t + 9 * 3600_000); d.getTime() + 86400000 <= now.getTime() + 9 * 3600_000; d = new Date(d.getTime() + 86400000)) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
function scoreAction(a, now) {
  let s = BASE[a.base] ?? 20;
  const why = [];
  if (a.deadline && a.deadline.date) {
    const n = dday(a.deadline.date, now);
    const add = n <= 0 ? 40 : n === 1 ? 34 : n <= 3 ? 24 : n <= 7 ? 12 : 0;
    if (add) { s += add; why.push(`기한 ${n <= 0 ? '오늘·지남' : `D-${n}`}`); }
  }
  const waited = Number.isFinite(a.waitDays) ? Math.max(0, Math.floor(a.waitDays)) : 0;
  if (waited && ['pending', 'deptWaiting', 'distWaiting', 'sendWaiting'].includes(a.base)) {
    const biz = a.bizWait ?? waited;
    s += biz >= 3 ? 22 : Math.min(12, biz * 4);
    if (waited >= 2) why.push(biz >= 3 ? `근무일 ${biz}일 대기` : `${waited}일 대기`);
  }
  if (a.leaveConflict) { s += a.leaveConflict.answered ? 4 : 24; why.push('휴가일 마감'); }
  if (URGENT_WORDS.test(a.title)) { s += 20; why.push('긴급 표현'); }
  if (PROMO_WORDS.test(a.title) && !REQUEST_WORDS.test(a.title)) { s -= 22; why.push('홍보·안내성'); }
  return {score: s, why};
}

// Mail that only hands over material is reference, not a task, unless it also asks for something.
const SHARE_WORDS = /공유|드립니다|드려요|보내드|송부|전달드|참고|안내드/;
const ASK_WORDS = /요청|회신|제출|검토|작성|부탁|바랍니다|주시기|주세요|의견|취합|협조|확인\s*(부탁|요망|바랍|해\s*주)|마감|기한|까지/;
// Who handles department-level work. Default: not me (the dept 문서담당 does it) unless the settings say so.
const STATE_ORDER = {overdue: 0, urgent: 1, todo: 2, check: 3, confirm: 4, wait: 5, info: 6};
const STATE_PRI = {overdue: 'high', urgent: 'high', todo: 'medium', check: 'medium', confirm: 'medium', wait: 'low', info: 'low'};
// State-based judgement (state wins over score): what is it, and what should I do?
function judge(a, now) {
  const lc = a.leaveConflict;
  const effDate = lc ? lc.before : a.deadline && a.deadline.date;
  const left = effDate ? dday(effDate, now) : null;
  const facts = [];
  const sender = a.from || a.sender || '';
  if (sender) facts.push(sender);
  if (a.docNo) facts.push(a.docNo);
  if (a.attachN) facts.push(a.type === 'doc' ? `첨부 ${a.attachN}` : '첨부 있음');
  let state = 'todo', headline = '';
  const dueTxt = effDate ? `${mdw(effDate)}까지` : '';
  if (a.scope === 'ref') {
    state = 'info';
    headline = {mailShared: `자료 확인${a.attachN ? ` (첨부 ${a.attachN}개)` : ''}`, deptWaiting: '부서 접수 대기(문서담당 처리)', distWaiting: '배부 대기(배부 담당 처리)', sendWaiting: '발송 대기(기안자 처리)', viewing: '열람 문서 읽기', notice: '공지 읽기', leave: '예정된 휴가'}[a.base] || '참고';
  } else if (a.type === 'attendance') {
    state = 'check';
    const x = a.att || {};
    const absent = /결근|미출근/.test(x.result || '');
    if (x.applied || (/미인정/.test(x.result || '') && x.item)) { headline = '근태신청 결재를 기다리는 중'; state = 'wait'; }
    else if (absent) headline = '출근 기록 없음 · 쉰 날이면 근태신청 필요';
    else headline = `근태 '${x.result}' 확인`;
    if (x.item) facts.push(x.item);
    if (x.status) facts.push(`그룹웨어 표시: ${x.result}${x.status ? `(${x.status})` : ''}`);
    a.context = x.nearSwap ? `${fmtYmd(x.nearSwap).slice(5).replace('-', '/')}에 휴일근무(근무일대체) 기록이 있습니다. 그 대체로 쉰 날이면 "정상입니다"를 누르세요.` : '';
  } else if (a.base === 'mailAnswered' || a.base === 'conflictAnswered') {
    state = 'confirm';
    headline = effDate ? `${dueTxt}${left < 0 ? '였음' : ''} · 답장함 → 제출 끝났는지 확인` : '답장함 → 제출 끝났는지 확인';
  } else if (a.type === 'mail' || a.type === 'conflict') {
    if (left !== null && left < 0) { state = 'overdue'; headline = `${dueTxt} 제출했어야 함 · 지금 처리`; }
    else if (left !== null && left <= 1) { state = 'urgent'; headline = `${left === 0 ? '오늘' : '내일'}(${mdw(effDate)}) 마감 · 회신·제출`; }
    else if (left !== null) headline = `${dueTxt} 회신·제출`;
    else headline = {mailReplyIn: '내 요청에 온 회신 확인', mailReply: '답장이 필요한지 확인', mailUnreadAsk: '요청 메일 읽고 처리'}[a.base] || '메일 읽기';
  } else if (a.type === 'doc') {
    if (a.base === 'pending' || a.base === 'rejected') { state = 'urgent'; headline = a.base === 'pending' ? '결재하기' : '반려된 내 문서 고쳐 다시 올리기'; }
    else { headline = {deptWaiting: '부서 접수 처리', distWaiting: '배부 처리', sendWaiting: '발송 처리', viewing: '열람 문서 읽기'}[a.base] || '문서 확인'; state = left !== null && left < 0 ? 'overdue' : left !== null && left <= 1 ? 'urgent' : 'todo'; }
    if (effDate) facts.push(`기한 ${mdw(effDate)}`);
  } else if (a.type === 'notice') headline = '공지 읽기';
  else if (a.type === 'leave') { state = 'info'; headline = '예정된 휴가'; }
  return {state, headline: headline.slice(0, 40), facts: facts.filter(Boolean).slice(0, 4)};
}
export const DEFAULT_ROLES = {deptReceiver: false, distributor: false, sender: false};
export function analyze(raw, prev = null, now = new Date(), {maxHigh = 6, roles = DEFAULT_ROLES} = {}) {
  const d = raw?.data || {};
  const me = raw?.principal?.name || '';
  const myLogin = String(raw?.principal?.loginId || '').toLowerCase();
  const role = {...DEFAULT_ROLES, ...(roles || {})};
  const prevMail = new Set(prev?.mailUids || []);
  const prevDocs = new Set(Object.values(prev?.docIds || {}).flat());
  const prevNotices = new Set(prev?.noticeIds || []);
  const hasPrev = !!prev;
  const actions = [];
  const deadlines = [];
  const addDeadline = (title, source, url, key = '', preview = '') => {
    let info = extractDeadlineInfo(title, now);
    if (!info.date && preview) { const all = extractAllDeadlines(preview, now, {strict: true}); const nx = nextDeadline(all); if (nx) info = {date: nx.date, time: nx.time}; }
    if (!info.date) return null;
    const left = dday(info.date, now);
    if (left < -1 || left > 60) return null;
    if (!deadlines.some(x => x.title === title && x.date === info.date)) deadlines.push({date: info.date, time: info.time, dday: left, title, source, url, key});
    return {...info, dday: left};
  };
  const push = a => { a.title = cleanTitle(a.title) || '(제목 없음)'; const ex = actions.find(x => x.key === a.key); if (ex) { if ((BASE[a.base] ?? 0) > (BASE[ex.base] ?? 0)) Object.assign(ex, a); return; } actions.push(a); };

  // Approval / document flow
  const lists = d.approval?.lists || {};
  const counts = Object.fromEntries((d.approval?.counts || []).map(c => [c.name, c]));
  const docAction = (key, verb) => {
    const l = lists[key];
    if (!l || l.error) return;
    for (const doc of l.docs) {
      const k = `doc:${key}:${doc.docId}`;
      const deadline = addDeadline(doc.title, l.label, doc.url || docLink(raw, l), k);
      push({key: k, type: 'doc', base: key, ref: {kind: key, docId: doc.docId}, drafter: doc.drafter || '', toEmp: doc.toEmp || '', sender: doc.sender || doc.sendOrg || doc.drafter || '', docNo: doc.docNo || '', attachN: doc.attachments || 0, area: '결재', kind: l.label, title: doc.title, detail: [verb, doc.sender || doc.drafter, doc.docNo, doc.attachments ? `첨부 ${doc.attachments}` : ''].filter(Boolean).join(' · '), when: doc.date, waitDays: ageDays(doc.date, now), bizWait: bizDays(doc.date, now), deadline, url: doc.url || docLink(raw, l), listUrl: l.url, isNew: hasPrev && !prevDocs.has(`${key}:${doc.docId}`)});
    }
  };
  docAction('pending', '내 결재 차례');
  docAction('deptWaiting', '부서 접수 처리 필요');
  docAction('distWaiting', '배부 처리 필요');
  docAction('sendWaiting', '발송 처리 대기');
  const submitted = (lists.submitted?.docs || []);
  const rejected = submitted.filter(x => /반려|회수/.test(x.status));
  for (const doc of rejected) push({key: `doc:submitted:${doc.docId}`, type: 'doc', base: 'rejected', ref: {kind: 'submitted', docId: doc.docId}, area: '결재', kind: '내 상신문서', title: doc.title, detail: `${doc.status} · 수정·재상신 검토`, when: doc.date, url: doc.url || lists.submitted.url, listUrl: lists.submitted.url, isNew: hasPrev && !prevDocs.has(`submitted:${doc.docId}`)});
  const inProgress = submitted.filter(x => x.statusCode !== '008' && !/완료|반려|회수/.test(x.status));
  const viewingUnread = (lists.viewing?.docs || []).filter(x => x.unread);
  for (const doc of viewingUnread) push({key: `doc:viewing:${doc.docId}`, type: 'doc', base: 'viewing', ref: {kind: 'viewing', docId: doc.docId}, area: '결재', kind: '열람문서', title: doc.title, detail: `미열람 · ${doc.status}`, when: doc.date, url: doc.url || lists.viewing.url, listUrl: lists.viewing.url, isNew: hasPrev && !prevDocs.has(`viewing:${doc.docId}`)});
  for (const doc of lists.viewing?.docs || []) addDeadline(doc.title, '열람문서', doc.url || lists.viewing.url);

  // Mail
  const mails = [...(d.mail?.inbox?.records || []), ...(d.mail?.otherUnseen || [])];
  const seenUid = new Set();
  const uniqueMails = mails.filter(m => { const k = `${m.box}:${m.uid}`; if (seenUid.has(k)) return false; seenUid.add(k); return true; });
  const unreadMails = uniqueMails.filter(m => !m.seen && !isNoiseMail(m));
  const recentAction = uniqueMails.filter(m => m.seen && !m.answered && !m.forwarded && ageDays(m.date, now) <= 3 && ACTION_WORDS.test(m.subject) && !isNoiseMail(m) && !/^re:|^회신:|^답장:/i.test(m.subject.trim()));
  const fromMe = m => (me && m.from === me) || (myLogin && String(m.fromEmail || '').toLowerCase().startsWith(myLogin + '@'));
  for (const m of uniqueMails) {
    const k = `mail:${m.box}:${m.uid}`;
    if (fromMe(m)) continue; // mails I sent to myself are notes, not tasks
    // "Re:/FW:" mails are replies to a request (often my own): not my deadline.
    const isReplyMail = /^\s*(re|fw|fwd|회신|답장|전달)\s*[:：]/i.test(m.subject || '');
    if (isReplyMail) {
      if (!m.seen && !isNoiseMail(m)) push({key: k, type: 'mail', base: 'mailReplyIn', from: m.from, ref: {box: m.box, uid: m.uid}, area: '메일', kind: '내 요청에 온 회신', title: m.subject, detail: `${m.from} · 안 읽음`, when: m.date, url: d.mail.url, isNew: hasPrev && !prevMail.has(`${m.box}:${m.uid}`)});
      continue;
    }
    const dl = ageDays(m.date, now) <= 30 ? addDeadline(m.subject, '메일', d.mail?.url, k, m.preview) : null;
    const hasDeadline = dl && dl.dday >= -1 && dl.dday <= 7 && !isNoiseMail(m);
    const unread = !m.seen && !isNoiseMail(m);
    const asks = ASK_WORDS.test(`${m.subject} ${m.preview || ''}`);
    const shareOnly = SHARE_WORDS.test(m.subject) && !ASK_WORDS.test(m.subject);
    const replyCheck = recentAction.includes(m) && asks && !shareOnly;
    if (!unread && !hasDeadline && !replyCheck) {
      // Material handed over to me: keep as reference (attachments are often what I need).
      if (shareOnly && ageDays(m.date, now) <= 7) push({key: k, type: 'mail', base: 'mailShared', from: m.from, attachN: (m.attach || /첨부/.test(m.preview || '')) ? (Number((String(m.preview || '').match(/첨부\s*(\d+)\s*개/) || [])[1]) || 1) : 0, ref: {box: m.box, uid: m.uid}, area: '메일', kind: '받은 자료', title: m.subject || '(제목 없음)', detail: `${m.from} · 읽음${m.attach || /첨부/.test(m.preview || '') ? ' · 첨부' : ''}`, when: m.date, url: d.mail.url, scope: 'ref', refReason: '자료를 공유한 메일(할 일 요청 없음)', isNew: false});
      continue;
    }
    const replied = m.answered || m.forwarded;
    // A deadline mail I already answered is most likely done: keep it visible but low.
    const base = hasDeadline ? (replied ? 'mailAnswered' : 'mailDeadline') : unread ? (ACTION_WORDS.test(m.subject) ? 'mailUnreadAsk' : m.box === 'INBOX' ? 'mailUnread' : 'mailOther') : 'mailReply';
    const kind = hasDeadline ? (replied ? '기한 메일 · 제출까지 끝났는지 확인' : '기한 있는 메일') : unread ? (m.box === 'INBOX' ? '안 읽은 메일' : `안 읽은 메일(${m.box})`) : '답장했는지 확인';
    const flags = [m.seen ? '읽음' : '안 읽음', m.answered ? '답장함' : '', m.forwarded ? '전달함' : '', m.attach ? '첨부' : ''].filter(Boolean).join(' · ');
    push({key: k, type: 'mail', base, from: m.from, attachN: m.attach ? 1 : 0, ref: {box: m.box, uid: m.uid}, area: '메일', kind, title: m.subject || '(제목 없음)', detail: `${m.from} · ${flags}`, when: m.date, deadline: dl, url: d.mail.url, isNew: hasPrev && !prevMail.has(`${m.box}:${m.uid}`)});
  }
  const newMails = hasPrev ? uniqueMails.filter(m => !prevMail.has(`${m.box}:${m.uid}`)) : [];

  // Notices
  const articles = d.notice?.articles || [];
  const unreadNotices = articles.filter(a => !a.read && !a.reserved);
  for (const a of articles) if (!a.reserved) addDeadline(a.title, '공지', a.url || d.notice?.url, `notice:${a.id}`);
  for (const a of unreadNotices) push({key: `notice:${a.id}`, type: 'notice', base: 'notice', ref: {id: a.id}, area: '공지', kind: '안 읽은 공지', title: a.title, detail: `${a.dept} ${a.writer}${a.files ? ` · 첨부 ${a.files}` : ''}`, when: a.date, deadline: extractDeadlineInfo(a.title, now).date ? {...extractDeadlineInfo(a.title, now), dday: dday(extractDeadline(a.title, now), now)} : null, url: a.url || d.notice.url, listUrl: d.notice.url, isNew: hasPrev && !prevNotices.has(a.id)});
  const newNotices = hasPrev ? articles.filter(a => !prevNotices.has(a.id)) : [];

  // Leave reminders and leave-deadline conflicts
  const upcoming = d.leave?.upcoming || [];
  for (const u of upcoming.filter(u => dday(fmtYmd(u.start), now) <= 7)) push({key: `leave:${u.start}:${u.kind}`, type: 'leave', base: 'leave', ref: {start: u.start}, area: '근태', kind: '예정된 휴가·외출', title: `${fmtYmd(u.start)} ${u.kind}`, detail: `${u.days}일 · ${u.approved ? '결재완료' : '결재 진행 중'}`, when: fmtYmd(u.start), url: d.leave.url, isNew: false});
  const offDays = new Map();
  for (const u of upcoming) if (u.days >= 0.5) for (let n = dayNumber(fmtYmd(u.start)); n <= dayNumber(fmtYmd(u.end || u.start)); n++) offDays.set(new Date(n * 86400000).toISOString().slice(0, 10), u);
  for (const dl of deadlines) {
    const u = offDays.get(dl.date);
    if (!u || dl.dday < 0) continue;
    const owner = actions.find(a => a.key === dl.key);
    const answered = owner && owner.base === 'mailAnswered'; // keep the warning, but lower
    if (owner) { // fold the warning into the item itself instead of a second row
      // Real deadline = the last working day before the leave (weekends and other leave days skipped).
      let n = dayNumber(dl.date) - 1;
      while (n > dayNumber(dl.date) - 14) { const iso = new Date(n * 86400000).toISOString().slice(0, 10); const w = new Date(n * 86400000).getUTCDay(); if (w !== 0 && w !== 6 && !offDays.has(iso)) break; n--; }
      const before = new Date(n * 86400000).toISOString().slice(0, 10);
      const passed = dday(before, now) < 0;
      const wd = '일월화수목금토'[new Date(n * 86400000).getUTCDay()];
      owner.leaveConflict = {date: dl.date, kind: u.kind, answered, before, passed};
      owner.detail += ` · 마감일(${dl.date.slice(5)})이 ${u.kind} → 실제로는 ${before.slice(5)}(${wd})까지${passed ? '였음' : ''}`;
      continue;
    }
    push({key: `conflict:${dl.date}:${dl.key || dl.title.slice(0, 20)}`, type: 'conflict', base: answered ? 'conflictAnswered' : 'conflict', ref: {key: dl.key}, area: '기한', kind: '휴가일 마감', title: dl.title, detail: `${dl.date.slice(5)}${dl.time ? ' ' + dl.time : ''} 마감인데 그날 ${u.kind}${answered ? ' · 답장은 했음, 제출까지 끝났는지 확인' : ' · 전날까지 처리하세요'}`, when: dl.date, deadline: {date: dl.date, time: dl.time, dday: dl.dday}, url: dl.url, isNew: false});
  }

  // Attendance (cross-checked with approved leave and 근무일대체)
  const anomalies = attendanceAnomalies(d.attendance?.days || [], {now, leaves: d.leave?.history || upcoming});
  for (const x of anomalies) push({key: `att:${x.date}`, type: 'attendance', base: x.priority === 'high' ? 'attHigh' : 'attMedium', att: x, ref: {date: x.date}, area: '근태', kind: '근태 확인 필요', title: `${fmtYmd(x.date).slice(5).replace('-', '/')}(${'일월화수목금토'[new Date(fmtYmd(x.date) + 'T00:00:00Z').getUTCDay()]}) 근태 확인${x.item ? ` · ${x.item}` : ''}`, detail: x.advice, when: fmtYmd(x.date), url: d.attendance?.requestUrl || d.attendance?.url, listUrl: d.attendance?.url, isNew: false});

  // Score -> level. Only the top `maxHigh` can be 긴급 so that red stays meaningful.
  // Is this mine to do, or just something I can see? (참고 = 나와 직접 관련 적음)
  for (const a of actions) {
    if (a.scope) continue;
    let ref = '';
    if (a.base === 'deptWaiting' && !role.deptReceiver && !(me && a.toEmp === me)) ref = '부서 접수는 부서 문서담당이 처리(설정에서 내 업무로 바꿀 수 있음)';
    else if (a.base === 'distWaiting' && !role.distributor) ref = '배부는 문서 배부 담당이 처리(설정에서 내 업무로 바꿀 수 있음)';
    else if (a.base === 'sendWaiting' && !role.sender && !(me && a.drafter === me)) ref = `${a.drafter || '다른 직원'} 기안 문서의 발송 대기`;
    else if (a.base === 'viewing') ref = '열람용으로 받은 문서';
    else if (a.base === 'notice') ref = '전체 공지';
    else if (a.base === 'leave') ref = '예정 안내';
    a.scope = ref ? 'ref' : 'mine';
    if (ref) a.refReason = ref;
  }
  for (const a of actions) { const {score, why} = scoreAction(a, now); a.score = a.scope === 'ref' ? Math.min(score, 39) : score; a.why = why; }
  actions.sort((a, b) => (a.scope === 'ref') - (b.scope === 'ref') || b.score - a.score || String(a.when).localeCompare(String(b.when)));
  for (const a of actions) Object.assign(a, judge(a, now));
  actions.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.score - a.score || String(a.when).localeCompare(String(b.when)));
  let highs = 0;
  for (const a of actions) {
    let level = STATE_PRI[a.state];
    if (level === 'high' && a.state === 'urgent' && ++highs > maxHigh) level = 'medium'; // safety net; overdue is never demoted
    a.priority = level;
  }
  const mineActs = actions.filter(a => a.scope !== 'ref');
  const cnt = st => mineActs.filter(a => st.includes(a.state)).length;
  const doing = mineActs.filter(a => a.state !== 'wait');
  const mine = {total: doing.length, urgent: cnt(['overdue', 'urgent']), todo: cnt(['todo']), check: cnt(['check']), confirm: cnt(['confirm']), wait: cnt(['wait']),
    byArea: Object.fromEntries(['결재', '메일', '기한', '근태', '공지'].map(ar => [ar, doing.filter(a => a.area === ar).length]))};
  const todayInfo = (() => {
    const k = kstNow(now), d8 = k.date.replace(/-/g, '');
    const wd = new Date(k.date + 'T00:00:00Z').getUTCDay();
    const row = (d.attendance?.days || []).find(r => r && r.date === d8);
    const hol = (d.schedule?.holidays || []).some(h => String(h.date || '').replace(/-/g, '').slice(0, 8) === d8);
    return {date: k.date, isWorkday: !(wd === 0 || wd === 6 || hol || (row && (row.holiday || /휴일/.test(row.result || ''))))};
  })();
  deadlines.sort((a, b) => a.date.localeCompare(b.date));

  // Budget with change since previous run
  const elapsedPct = (() => { const k = kstNow(now); const start = Date.UTC(k.y, 0, 1), end = Date.UTC(k.y + 1, 0, 1); return Math.round((Date.UTC(k.y, k.m - 1, k.d) - start) / (end - start) * 1000) / 10; })();
  const budget = (d.budget?.projects || []).map(p => ({...p, rows: (p.rows || []).map(r => {
    const before = prev?.budget?.[p.project]?.[r.code];
    return {...r, executedDelta: before === undefined ? null : r.executed - before};
  })}));

  const status = Object.entries(raw?.status || {}).map(([name, s]) => ({name, ...s}));
  const failedNames = new Set(status.filter(s => !s.ok).map(s => s.name));
  return {
    generatedAt: now.toISOString(), collectedAt: raw?.collectedAt, durationMs: raw?.durationMs, collector: raw?.collector,
    principal: raw?.principal || {}, sessionExpired: !!raw?.sessionExpired, status, failed: status.filter(s => !s.ok),
    unknown: {approval: failedNames.has('approval'), mail: failedNames.has('mail'), notice: failedNames.has('notice'), attendance: failedNames.has('attendance'), leave: failedNames.has('leave'), budget: failedNames.has('budget'), schedule: failedNames.has('schedule')},
    summary: {
      approvalAction: (lists.pending?.docs.length || 0) + (lists.deptWaiting?.docs.length || 0) + (lists.distWaiting?.docs.length || 0),
      pending: counts['대기문서']?.count ?? null, deptWaiting: counts['부서대기문서']?.count ?? null, distWaiting: counts['배부대기문서']?.count ?? null,
      sendWaiting: counts['발송대기문서']?.count ?? null, viewingUnread: counts['열람문서']?.count ?? null, drafts: counts['임시보관문서']?.count ?? null,
      inProgressSubmitted: inProgress.length, rejectedSubmitted: rejected.length,
      mailUnread: unreadMails.length, inboxTotal: d.mail?.inbox?.total ?? null, noticeUnread: d.notice?.unread ?? unreadNotices.length,
      leaveRemaining: d.leave?.remaining ?? null, upcomingEvents: d.schedule?.events?.length ?? null,
      high: actions.filter(a => a.priority === 'high').length, total: actions.length, mine, ref: actions.length - mineActs.length,
    },
    actions, deadlines, today: todayInfo,
    newSince: hasPrev ? {since: prev.at, mails: newMails.length, notices: newNotices.length, docs: actions.filter(a => a.area === '결재' && a.isNew).length} : null,
    anomalies,
    approval: {counts: d.approval?.counts || [], lists, inProgress},
    mail: {boxes: d.mail?.boxes || [], unread: unreadMails, recentAction, recent: (d.mail?.inbox?.records || []).slice(0, 15), url: d.mail?.url},
    notice: {total: d.notice?.total, unread: unreadNotices, recent: articles.slice(0, 10), url: d.notice?.url},
    schedule: d.schedule || null, attendance: d.attendance || null, leave: d.leave || null,
    budget: {projects: budget, elapsedPct, url: d.budget?.url}, alerts: d.alerts?.alerts || [],
  };
}

export function nextState(raw, prev = null) {
  const d = raw?.data || {};
  const keep = (key, fresh) => (raw?.status?.[key]?.ok ? fresh : undefined);
  const mailUids = keep('mail', [...(d.mail?.inbox?.records || []), ...(d.mail?.otherUnseen || [])].map(m => `${m.box}:${m.uid}`)) ?? prev?.mailUids ?? [];
  const docIds = keep('approval', Object.fromEntries(Object.entries(d.approval?.lists || {}).map(([k, l]) => [k, (l.docs || []).map(x => `${k}:${x.docId}`)]))) ?? prev?.docIds ?? {};
  const noticeIds = keep('notice', (d.notice?.articles || []).map(a => a.id)) ?? prev?.noticeIds ?? [];
  const budget = keep('budget', Object.fromEntries((d.budget?.projects || []).filter(p => !p.error).map(p => [p.project, Object.fromEntries(p.rows.map(r => [r.code, r.executed]))]))) ?? prev?.budget ?? {};
  return {at: raw?.collectedAt, mailUids, docIds, noticeIds, budget};
}

// ---------- rendering ----------
const kstText = iso => { if (!iso) return '-'; const k = kstNow(new Date(iso)); return `${k.date} ${pad(k.hh)}:${pad(k.mm)}`; };
const ddayText = n => n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`;
const PRI_LABEL = {high: '긴급', medium: '보통', low: '참고'};
export const STATE_LABEL = {overdue: '기한 지남', urgent: '급함', todo: '할 일', check: '확인 필요', confirm: '끝났는지 확인', wait: '기다리는 중', info: '참고'};

export function renderMarkdown(a) {
  const s = a.summary;
  const lines = [];
  lines.push(`# 그룹웨어 업무 브리핑 (${kstText(a.collectedAt)} KST 기준)`);
  lines.push('');
  lines.push(`${a.principal.name || ''} · ${a.principal.deptName || ''} · 읽기 전용`, '', `**내 처리할 일 ${s.mine?.total ?? 0}건** (급함 ${s.mine?.urgent ?? 0} · 할 일 ${s.mine?.todo ?? 0} · 확인 ${(s.mine?.check ?? 0) + (s.mine?.confirm ?? 0)}) · 참고 ${s.ref ?? 0}건`);
  if (a.sessionExpired) lines.push('', '> 로그인 세션이 만료되어 일부 자료를 읽지 못했습니다. 다시 로그인 후 실행하세요.');
  if (a.failed.length) lines.push('', `> 실패한 모듈: ${a.failed.map(f => `${f.name}(${f.error})`).join(', ')}`);
  lines.push('', '## 한눈에 보기', '');
  lines.push(`- 내 처리할 일 **${s.mine?.total ?? 0}건** (급함 ${s.mine?.urgent ?? 0} · 할 일 ${s.mine?.todo ?? 0} · 확인 필요 ${s.mine?.check ?? 0} · 끝났는지 확인 ${s.mine?.confirm ?? 0}) · 참고 ${s.ref ?? 0}건`);
  lines.push(`- 내 상신문서 진행 중 ${s.inProgressSubmitted}건, 반려/회수 ${s.rejectedSubmitted}건 · 임시보관 ${s.drafts ?? '-'}건 · 미열람 열람문서 ${s.viewingUnread ?? '-'}건`);
  lines.push(`- 내 처리할 일 중 결재 ${s.mine?.byArea?.결재 ?? 0}건 · 메일 ${s.mine?.byArea?.메일 ?? 0}건 · 근태 ${s.mine?.byArea?.근태 ?? 0}건 · 남은 연차 ${fmtDays(s.leaveRemaining)}`);
  if (a.newSince) lines.push(`- 지난 실행(${kstText(a.newSince.since)}) 이후 새 메일 ${a.newSince.mails}건, 새 공지 ${a.newSince.notices}건, 새 결재·문서 ${a.newSince.docs}건`);
  lines.push('', `## 내 처리할 일 ${s.mine?.total ?? 0}건`, '');
  const mineL = a.actions.filter(x => x.scope !== 'ref'), refL = a.actions.filter(x => x.scope === 'ref');
  if (!mineL.length) lines.push('- 지금 내가 처리할 일이 없습니다.');
  for (const x of mineL.slice(0, 40)) lines.push(`- [${STATE_LABEL[x.state]}] ${x.isNew ? '(새) ' : ''}${x.title} — ${x.headline}${x.facts.length ? ` (${x.facts.join(', ')})` : ''}`);
  if (refL.length) { lines.push('', `## 참고 ${refL.length}건`, ''); for (const x of refL.slice(0, 30)) lines.push(`- ${x.title} — ${x.headline}`); }
  if (a.deadlines.length) {
    lines.push('', '## 제목에서 찾은 기한', '');
    for (const x of a.deadlines) lines.push(`- ${x.date} (${ddayText(x.dday)}) ${x.title} [${x.source}]`);
  }
  for (const p of a.budget.projects) {
    lines.push('', `## 예산 ${p.label || p.project}${p.filter ? ` · ${p.filter}` : ''} (${p.period || ''}, 연간 경과율 ${a.budget.elapsedPct}%)`, '');
    if (p.error) { lines.push(`- 조회 실패: ${p.message}`); continue; }
    lines.push('| 과목 | 예산 | 집행 | 잔액 | 집행률 |', '|---|---:|---:|---:|---:|');
    for (const r of p.rows) lines.push(`| ${r.level} ${r.name} | ${won(r.budget)} | ${won(r.executed)}${r.executedDelta ? ` (+${won(r.executedDelta)})` : ''} | ${won(r.balance)} | ${r.rate}% |`);
    if (p.total) lines.push(`| **${p.project} 프로젝트 전체** | ${won(p.total.budget)} | ${won(p.total.executed)} | ${won(p.total.balance)} | ${p.total.rate}% |`);
  }
  if (a.leave) lines.push('', '## 연차', '', `- ${a.leave.year}년 부여 ${fmtDays(a.leave.granted)} · 사용 ${fmtDays(a.leave.used)} · 잔여 **${fmtDays(a.leave.remaining)}**`, ...(a.leave.upcoming || []).map(u => `- 예정: ${fmtYmd(u.start)} ${u.kind} ${u.days}일 (${u.approved ? '결재완료' : '진행 중'})`));
  if (a.attendance) lines.push('', '## 근무시간', '', `- 이번 달 인정 ${hm(a.attendance.month.recognizedMin)} · 초과 ${hm(a.attendance.month.overtimeMin)} · 오늘 출근 ${a.attendance.today.come || '기록 없음'}`);
  lines.push('', `---`, `생성 ${kstText(a.generatedAt)} KST · 메일·문서를 열지 않는 목록 조회만 사용해 읽음 상태는 바뀌지 않습니다.`);
  return lines.join('\n') + '\n';
}

export function renderHtml(a) {
  const s = a.summary;
  const card = (label, value, sub = '', tone = '') => `<div class="card ${tone}"><div class="label">${esc(label)}</div><div class="value">${esc(value ?? '-')}</div><div class="sub">${esc(sub)}</div></div>`;
  const link = (url, text) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text);
  const actionRows = a.actions.filter(x => x.scope !== 'ref').slice(0, 60).map(x => `<tr class="p-${x.priority}"><td><span class="pill ${x.priority}">${STATE_LABEL[x.state]}</span>${x.isNew ? '<span class="pill new">새</span>' : ''}</td><td>${esc(x.area)}<div class="muted">${esc(x.kind)}</div></td><td>${link(x.url, x.title)}<div><b>${esc(x.headline)}</b></div><div class="muted">${esc(x.facts.join(' · '))}</div></td><td class="nowrap">${esc(x.when)}</td></tr>`).join('');
  const refRows = a.actions.filter(x => x.scope === 'ref').slice(0, 40).map(x => `<tr><td>${link(x.url, x.title)}<div class="muted">${esc(x.headline)}</div></td><td class="nowrap">${esc(x.when)}</td></tr>`).join('');
  const deadlineRows = a.deadlines.map(x => `<tr><td class="nowrap"><b>${esc(x.date)}</b></td><td><span class="pill ${x.dday <= 3 ? 'high' : x.dday <= 7 ? 'medium' : 'low'}">${ddayText(x.dday)}</span></td><td>${link(x.url, x.title)}</td><td>${esc(x.source)}</td></tr>`).join('');
  const countRows = (a.approval.counts || []).map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.count}</td><td class="num muted">${c.total ?? ''}</td></tr>`).join('');
  const listBlock = (key) => {
    const l = a.approval.lists[key];
    if (!l) return '';
    if (l.error) return `<h3>${esc(l.label)}</h3><p class="warn">조회 실패: ${esc(l.message)}</p>`;
    const docs = key === 'submitted' ? l.docs.slice(0, 10) : l.docs;
    return `<h3>${link(l.url, l.label)} <span class="muted">${l.total ?? l.fetched}건${key === 'submitted' ? ' · 최근 10건' : ''}</span></h3>` + (docs.length ? `<table><tr><th>제목</th><th>상태</th><th>보낸 곳/기안</th><th>일시</th></tr>${docs.map(x => `<tr><td>${esc(x.title)}${x.attachments ? ` <span class="muted">첨부${x.attachments}</span>` : ''}</td><td class="nowrap">${esc(x.status)}</td><td>${esc(x.sender || x.drafter || x.drafterDept)}</td><td class="nowrap">${esc(x.date)}</td></tr>`).join('')}</table>` : '<p class="muted">없음</p>');
  };
  const mailRows = a.mail.recent.map(m => `<tr class="${m.seen ? '' : 'unread'}"><td>${m.seen ? '' : '<span class="pill high">안읽음</span>'}${esc(m.subject)}${m.attach ? ' <span class="muted">첨부</span>' : ''}<div class="muted">${esc(m.preview.slice(0, 90))}</div></td><td>${esc(m.from)}</td><td class="nowrap">${esc(m.date)}</td></tr>`).join('');
  const noticeRows = a.notice.recent.map(n => `<tr class="${n.read ? '' : 'unread'}"><td>${n.read ? '' : '<span class="pill medium">안읽음</span>'}${n.reserved ? '<span class="pill low">예약</span>' : ''}${esc(n.title)}</td><td>${esc(n.dept)} ${esc(n.writer)}</td><td class="nowrap">${esc(n.date.slice(0, 16))}</td></tr>`).join('');
  const budgetBlocks = a.budget.projects.map(p => p.error ? `<p class="warn">${esc(p.project)} 조회 실패: ${esc(p.message)}</p>` : `<h3>${esc(p.label || p.project)}${p.filter ? ` · ${esc(p.filter)}` : ''} <span class="muted">${esc(p.period)} · 연간 경과율 ${a.budget.elapsedPct}%</span></h3><table><tr><th>과목</th><th class="num">예산</th><th class="num">집행</th><th class="num">잔액</th><th class="num">집행률</th></tr>${p.rows.map(r => `<tr class="lv-${esc(r.level)}"><td>${esc(r.level)} ${esc(r.name)}</td><td class="num">${won(r.budget)}</td><td class="num">${won(r.executed)}${r.executedDelta ? `<div class="delta">+${won(r.executedDelta)}</div>` : ''}</td><td class="num">${won(r.balance)}</td><td class="num"><div class="bar"><i style="width:${Math.min(100, r.rate)}%"></i></div>${r.rate}%</td></tr>`).join('')}${p.total ? `<tr class="total"><td>${esc(p.project)} 프로젝트 전체</td><td class="num">${won(p.total.budget)}</td><td class="num">${won(p.total.executed)}</td><td class="num">${won(p.total.balance)}</td><td class="num">${p.total.rate}%</td></tr>` : ''}</table>`).join('');
  const lv = a.leave, at = a.attendance, sc = a.schedule;
  const events = sc?.events?.length ? `<ul>${sc.events.map(e => `<li>${esc(fmtYmdHm(e.start))} ${esc(e.title)} <span class="muted">${esc(e.calendar)}${e.place ? ' · ' + esc(e.place) : ''}</span></li>`).join('')}</ul>` : `<p class="muted">${esc(fmtYmd(sc?.start))} ~ ${esc(fmtYmd(sc?.end))} 그룹웨어 캘린더 일정 없음</p>`;
  const status = a.status.map(x => `<span class="pill ${x.ok ? 'ok' : 'high'}">${esc(x.name)} ${x.ok ? '정상' : '읽지 못함'}</span>`).join(' ');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>그룹웨어 업무 브리핑 ${esc(kstText(a.collectedAt))}</title><style>
:root{--bg:#f6f7f9;--fg:#1d2330;--muted:#6b7280;--line:#e3e6eb;--card:#fff;--hi:#d93025;--md:#e37400;--lo:#5f6368;--ok:#188038;--accent:#1a73e8}
@media print{body{background:#fff}main{max-width:none;padding:0}a{color:inherit}}
*{box-sizing:border-box}body{margin:0;font:14px/1.55 "Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:1100px;margin:0 auto;padding:24px 18px 48px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}h3{font-size:15px;margin:18px 0 8px}
.muted{color:var(--muted);font-size:12.5px}.warn{color:var(--hi)}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:14px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.card .label{color:var(--muted);font-size:12.5px}.card .value{font-size:24px;font-weight:700}.card .sub{color:var(--muted);font-size:12px}.card.alert .value{color:var(--hi)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:12.5px;color:var(--muted);font-weight:600}tr:last-child td{border-bottom:0}
.num{text-align:right;white-space:nowrap}.nowrap{white-space:nowrap}.pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11.5px;margin-right:4px;border:1px solid currentColor}.pill.high{color:var(--hi)}.pill.medium{color:var(--md)}.pill.low{color:var(--lo)}.pill.ok{color:var(--ok)}.pill.new{color:var(--accent)}
tr.unread td:first-child{font-weight:600}tr.total td{font-weight:700}tr.lv-항 td,tr.lv-관 td{font-weight:600}.bar{height:5px;background:var(--line);border-radius:3px;margin-bottom:2px}.bar i{display:block;height:100%;background:var(--accent);border-radius:3px}.delta{color:var(--md);font-size:11.5px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:760px){.grid2{grid-template-columns:1fr}}footer{margin-top:30px;color:var(--muted);font-size:12px}
</style></head><body><main>
<h1>그룹웨어 업무 브리핑</h1><div class="muted">${esc(kstText(a.collectedAt))} KST 기준 · ${esc(a.principal.name)} ${esc(a.principal.duty || '')} · ${esc(a.principal.deptName)} · 읽기 전용</div>
${a.sessionExpired ? '<p class="warn"><b>로그인 세션이 만료되어 일부 자료를 읽지 못했습니다.</b> 그룹웨어에 다시 로그인한 뒤 실행하세요.</p>' : ''}${a.failed.length ? `<p class="warn">실패한 모듈: ${a.failed.map(f => esc(`${f.name}(${f.message || f.error})`)).join(', ')}</p>` : ''}
<div class="cards">${card('내 처리할 일', s.mine.total + '건', `급함 ${s.mine.urgent} · 할 일 ${s.mine.todo}`, s.mine.urgent ? 'alert' : '')}${card('확인 필요', s.mine.check + '건', '근태 등 직접 확인')}${card('끝났는지 확인', s.mine.confirm + '건', '답장한 기한 메일 등')}${card('참고', s.ref + '건', '부서 접수·배부, 공지, 받은 자료')}${card('남은 연차', fmtDays(s.leaveRemaining), lv ? `받은 연차 ${fmtDays(lv.granted)} · 쓴 연차 ${fmtDays(lv.used)}` : '')}</div>
${a.newSince ? `<p class="muted">지난 실행(${esc(kstText(a.newSince.since))}) 이후: 새 메일 ${a.newSince.mails}건 · 새 공지 ${a.newSince.notices}건 · 새 결재·문서 ${a.newSince.docs}건</p>` : ''}
<h2>내 처리할 일 ${s.mine.total}건 <span class="muted">급함 ${s.mine.urgent} · 할 일 ${s.mine.todo} · 확인 ${s.mine.check + s.mine.confirm} · 참고 ${s.ref}건</span></h2>${actionRows ? `<table><tr><th>상태</th><th>영역</th><th>내용</th><th>일시</th></tr>${actionRows}</table>` : '<p class="muted">지금 내가 처리할 일이 없습니다.</p>'}${refRows ? `<h3>참고 ${s.ref}건 <span class="muted">나와 직접 관련 적은 항목</span></h3><table><tr><th>제목</th><th>일시</th></tr>${refRows}</table>` : ''}
${a.deadlines.length ? `<h2>제목에서 찾은 기한</h2><table><tr><th>날짜</th><th></th><th>제목</th><th>출처</th></tr>${deadlineRows}</table><p class="muted">제목의 "~11.20.", "11월 20일까지" 같은 표현을 자동으로 읽은 값입니다. 본문 기한은 원문에서 확인하세요.</p>` : ''}
<h2>전자결재·문서유통</h2><div class="grid2"><div>${listBlock('pending')}${listBlock('deptWaiting')}${listBlock('distWaiting')}${listBlock('sendWaiting')}</div><div><h3>메뉴별 건수</h3><table><tr><th>메뉴</th><th class="num">건수</th><th class="num">전체</th></tr>${countRows}</table>${listBlock('submitted')}</div></div>
<h2>메일 ${link(a.mail.url, '받은메일함 열기')}</h2><p class="muted">${a.mail.boxes.filter(b => b.unseen).map(b => `${esc(b.name)} 안읽음 ${b.unseen}`).join(' · ') || '안 읽은 메일함 없음'} (스팸함 포함)</p><table><tr><th>제목 (최근 15통)</th><th>보낸 사람</th><th>받은 시각</th></tr>${mailRows}</table>
<h2>공지사항 ${link(a.notice.url, '게시판 열기')}</h2><table><tr><th>제목 (최근 10건)</th><th>작성</th><th>등록</th></tr>${noticeRows}</table>
<h2>예산 집행 ${link(a.budget.url, '예실대비현황 열기')}</h2>${budgetBlocks || '<p class="muted">설정된 예산 조회 대상이 없습니다.</p>'}
<h2>일정·근태</h2><div class="grid2"><div><h3>${link(sc?.url, '그룹웨어 일정')} <span class="muted">향후 ${sc ? dday(fmtYmd(sc.end)) : '-'}일</span></h3>${events}${sc?.holidays?.length ? `<p class="muted">휴일: ${sc.holidays.map(h => esc(fmtYmd(h.date) + ' ' + h.title)).join(', ')}</p>` : ''}</div><div><h3>${link(lv?.url, '연차')}</h3>${lv ? `<p>${esc(lv.year)}년 부여 <b>${fmtDays(lv.granted)}</b> · 사용 <b>${fmtDays(lv.used)}</b> · 잔여 <b>${fmtDays(lv.remaining)}</b></p>${lv.upcoming.length ? `<ul>${lv.upcoming.map(u => `<li>${esc(fmtYmd(u.start))}${u.end !== u.start ? '~' + esc(fmtYmd(u.end)) : ''} ${esc(u.kind)} ${u.days}일 <span class="muted">${u.approved ? '결재완료' : '진행 중'}</span></li>`).join('')}</ul>` : '<p class="muted">예정된 휴가 없음</p>'}` : '<p class="muted">미조회</p>'}<h3>${link(at?.url, '근무시간')}</h3>${at ? `<p>이번 달 인정 ${hm(at.month.recognizedMin)} · 기본 ${hm(at.month.basicMin)} · 초과 ${hm(at.month.overtimeMin)}<br>오늘(${esc(fmtYmd(at.today.date))}) 출근 ${esc(at.today.come || '기록 없음')} · 퇴근 ${esc(at.today.leave || '기록 없음')}</p>` : '<p class="muted">미조회</p>'}</div></div>
<footer>자료 상태: ${status}<br>생성 ${esc(kstText(a.generatedAt))} KST. 메일·문서·게시글을 열지 않는 목록 조회 API만 사용하므로 읽음 상태와 조회수는 바뀌지 않습니다. 금액·건수는 수집 시점 관찰값입니다.</footer>
</main></body></html>`;
}

// ---------- assistant dataset (browser-snapshot contract) ----------
const kstToIso = text => {
  const m = String(text || '').match(/^(\d{4})-?(\d{2})-?(\d{2})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (!m) return '';
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}+09:00`).toISOString();
};

export function toDataset(raw, scope) {
  const origin = raw.origin;
  const exportedAt = new Date(raw.collectedAt).toISOString();
  const base = {organizationId: scope.organizationId, allowedUserIds: [scope.userId]};
  const items = [];
  const d = raw.data || {};
  const lists = d.approval?.lists || {};
  const approvalKeys = [['pending', 'pending'], ['deptWaiting', 'pending'], ['distWaiting', 'pending'], ['sendWaiting', 'pending']];
  const seen = new Set();
  let approvalTotal = 0, approvalComplete = raw.status?.approval?.ok === true;
  for (const [key, status] of approvalKeys) {
    const l = lists[key];
    if (!l || l.error) { approvalComplete = false; continue; }
    if (l.total === null || l.total !== l.docs.length) approvalComplete = false;
    approvalTotal += Math.max(l.total ?? 0, l.docs.length);
    for (const doc of l.docs) {
      const id = `gw:approval:${key}:${doc.docId}`.replace(/[^a-zA-Z0-9_.:-]/g, '_');
      if (seen.has(id)) continue; seen.add(id);
      items.push({...base, id, type: 'approval', status, title: doc.title || '(제목 없음)', body: `${l.label} · ${[doc.status, doc.sender || doc.drafter, doc.docNo].filter(Boolean).join(' · ')}. 그룹웨어 목록 API 조회값이며 본문은 수집하지 않았습니다.`, updatedAt: kstToIso(doc.date) || exportedAt, url: l.url, tags: ['그룹웨어', l.label]});
    }
  }
  const notices = d.notice?.articles || [];
  for (const n of notices.filter(x => !x.reserved)) {
    items.push({...base, id: `gw:notice:${n.id}`.replace(/[^a-zA-Z0-9_.:-]/g, '_'), type: 'notice', status: 'published', title: n.title || '(제목 없음)', body: `${n.dept} ${n.writer} 작성 · 등록 ${n.date}${n.files ? ` · 첨부 ${n.files}개` : ''}. 목록 조회값이며 본문은 수집하지 않았습니다.`, updatedAt: kstToIso(n.date) || exportedAt, url: d.notice.url, tags: ['그룹웨어', '공지사항']});
  }
  const events = (d.schedule?.events || []).map(e => ({e, s: kstToIso(e.start), t: kstToIso(e.end)})).filter(x => x.s && x.t && x.s < x.t);
  for (const {e, s, t} of events) items.push({...base, id: `gw:schedule:${e.id}`.replace(/[^a-zA-Z0-9_.:-]/g, '_'), type: 'schedule', status: 'published', title: e.title || '(제목 없음)', body: `${e.calendar}${e.place ? ' · ' + e.place : ''}${e.people ? ' · ' + e.people : ''}`, updatedAt: exportedAt, url: d.schedule.url, startsAt: s, endsAt: t, tags: ['그룹웨어', e.calendar]});
  const approvalCount = items.filter(i => i.type === 'approval').length;
  const noticeCount = items.filter(i => i.type === 'notice').length;
  const scheduleCount = items.filter(i => i.type === 'schedule').length;
  const coverage = [
    raw.status?.approval?.ok ? {type: 'approval', state: approvalComplete ? 'complete' : 'partial', query: `결재대기·부서접수대기·배부대기·발송대기 목록 API, 최근 ${raw.options?.approvalDays ?? 92}일`, collected: approvalCount, total: Math.max(approvalTotal, approvalCount), url: d.approval.url} : {type: 'approval', state: 'unobserved', query: '결재 조회 실패', collected: 0, total: null, url: ''},
    raw.status?.schedule?.ok ? {type: 'schedule', state: 'complete', query: `${d.schedule.start}~${d.schedule.end} 표시 캘린더 ${d.schedule.calendars.length}개, 삭제 일정 제외`, collected: scheduleCount, total: scheduleCount, url: d.schedule.url} : {type: 'schedule', state: 'unobserved', query: '일정 조회 실패', collected: 0, total: null, url: ''},
    raw.status?.notice?.ok ? {type: 'notice', state: 'partial', query: `공지사항 최근 ${notices.length}건 목록(예약 게시 제외)`, collected: noticeCount, total: Math.max(d.notice.total || 0, noticeCount), url: d.notice.url} : {type: 'notice', state: 'unobserved', query: '공지 조회 실패', collected: 0, total: null, url: ''},
    {type: 'document', state: 'unobserved', query: '규정·서식·첨부는 수집하지 않습니다.', collected: 0, total: null, url: ''},
  ];
  return {schemaVersion: 1, source: {kind: 'browser-snapshot', label: `그룹웨어 실시간 목록 조회 · ${raw.principal?.compName || ''} ${raw.principal?.deptName || ''}`.trim(), exportedAt, baseUrl: origin, coverage}, principal: {userId: scope.userId, displayName: scope.displayName, organizationId: scope.organizationId}, items};
}

// ---------------------------------------------------------------------------
// 기안 패턴: 사용자 본인의 결재문서에서 학습한 조직 서식 규칙 (순수 함수, 테스트 가능)
// ---------------------------------------------------------------------------
const PAT_GENERIC = new Set(['운영', '계획', '운영계획', '결과보고', '참가', '지급', '건의', '구입', '제출', '요청', '협조', '안내', '추진', '현황', '보고', '관련', '실시', '개최', '변경', '시행', '알림', '신청', '수립', '의견', '자료', '검토', '결과', '수행', '제작', '대관', '물품', '운영물품', '구입비', '연간', '상반기', '하반기', '중간보고', '참가비', '참가계획']);
export function patternTokens(title) {
  return String(title || '').replace(/[『』「」()（）\[\]“”"'·,.:~\-–/]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 2 && !PAT_GENERIC.has(w) && !/^\d+(년|기|분기|차|회)?$/.test(w));
}
const PAT_DEFAULT = {open: '공개', urgent: '일반문서', sec: '일반문서', docKind: '내부결재', sender: ''};
export function buildPatternModel(docs = []) {
  const own = docs.filter(d => d && d.binder && !/^접수문서/.test(d.binder));
  const entries = own.map(d => ({...d, tokens: patternTokens(d.title)}));
  const freq = {};
  for (const e of entries) freq[e.binder] = (freq[e.binder] || 0) + 1;
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  return {entries, defaultBinder: top ? top[0] : '', freq};
}
function metaOf(e) { return {binder: e.binder, open: e.open || PAT_DEFAULT.open, urgent: e.urgent || PAT_DEFAULT.urgent, sec: e.sec || PAT_DEFAULT.sec, docKind: e.docKind || PAT_DEFAULT.docKind, sender: e.sender || ''}; }
// 새 문서의 기본항목(기록물철·공개·긴급·보안·문서구분)을 과거 결재문서 패턴으로 예측한다.
// 1순위: 근거(계획서) 문서의 값을 그대로, 2순위: 같은 사업(제목 핵심어)의 과거 문서, 3순위: 유형별 기본값.
export function predictDraftMeta(model, {title = '', sourceDocNo = '', sourceTitle = ''} = {}) {
  const es = (model && model.entries) || [];
  if (sourceDocNo || sourceTitle) {
    const src = sourceDocNo ? es.find(e => e.docNo === sourceDocNo) : es.find(e => sourceTitle && e.title === sourceTitle);
    if (src) return {...metaOf(src), basis: `근거 문서(${src.docNo || src.title})의 기록물철·기본항목을 그대로 사용`, confidence: 'source'};
  }
  const tk = patternTokens(sourceTitle || title);
  let best = null;
  for (const e of es) {
    let s = 0;
    for (const t of tk) if (e.tokens.includes(t)) s += t.length >= 3 ? 2 : 1;
    if (s >= 2 && (!best || s > best.s)) best = {s, e};
  }
  if (best) return {...metaOf(best.e), basis: `제목이 비슷한 과거 문서 “${best.e.title}”와 같게 고름(맞는지 확인)`, confidence: 'similar'};
  const joined = `${title} ${sourceTitle}`;
  if (/참가\s*(계획|결과보고|비)|교육 참가|아카데미|연수/.test(joined)) {
    const ed = es.find(e => e.binder === '직원교육');
    if (ed) return {...PAT_DEFAULT, binder: '직원교육', basis: '교육 참가 문서는 직원교육 기록물철 사용', confidence: 'rule'};
  }
  return {...PAT_DEFAULT, binder: (model && model.defaultBinder) || '', basis: '가장 많이 쓴 기록물철(확인 필요)', confidence: 'default'};
}
// "전략경영실-7679 (2026.10.23)" -> "전략경영실-7679(2026. 10. 23.)"
export function formatRunRef(runday = '') {
  const m = String(runday).match(/^\s*(\S+?)\s*\((\d{4})\.(\d{1,2})\.(\d{1,2})\)/);
  return m ? `${m[1]}(${m[2]}. ${Number(m[3])}. ${Number(m[4])}.)` : String(runday || '').trim();
}
// 참조문서 칸에 표시되는 형식: 전략경영실-7679(2026. 10. 23., "제목")
export function formatRefDoc(runday = '', title = '') {
  const r = formatRunRef(runday).replace(/\.\)$/, '.');
  return r ? `${r.replace(/\.$/, '')}., "${title}")`.replace(/\.\.,/, '.,') : '';
}
export function planToResultTitle(planTitle = '') {
  const t = String(planTitle).trim();
  if (/참가\s*계획(\(변경\))?$/.test(t)) return t.replace(/\s*참가\s*계획(\(변경\))?$/, ' 참가 결과보고');
  if (/운영\s*계획(\(안\))?$/.test(t)) return t.replace(/\s*운영\s*계획(\(안\))?$/, ' 운영 결과보고');
  if (/계획(\(안\))?$/.test(t)) return t.replace(/\s*계획(\(안\))?$/, ' 결과보고');
  return `${t} 결과보고`;
}
// 굴림체 12pt 기준 줄 너비(pt): 한글·전각 12, 영문·숫자·공백·ASCII 기호 6
export function textWidthPt(s = '') {
  let w = 0;
  for (const ch of String(s)) w += /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF\u2460-\u27BF\u00B7\u203B]/.test(ch) ? 12 : 6;
  return w;
}
const HANG_LIMIT_PT = 440; // 본문 폭(약 482pt)보다 여유를 두어, 줄이 넘어갈 수 있는 항목에는 내어쓰기를 적용
// 계획서 본문 -> 결과보고 본문. 실제 결재 문서쌍(계획서/결과보고)에서 추출한 변환 규칙:
//  1) "1. <계획서 시행번호(시행일)>호와 관련입니다."  2) "2. <사업명> <운영|참가> 결과를 다음과 같이 보고합니다."
//  3) 계획서의 항목(사 업 명, 운영일정, ...)을 라벨 그대로 가나다 순으로 복사(참가인원의 ※ 비고는 삭제)
//  4) 빈 줄 + "붙임  결과보고서 1부.  끝."  5) 줄이 넘어갈 항목은 96pt 내어쓰기(HStyle0 + margin-left 96pt, text-indent -96pt, 왼쪽 정렬)
export function buildResultBody(planBody = '', {runday = '', docNo = '', planTitle = ''} = {}) {
  const src = String(planBody).split(/\r?\n/);
  const start = src.findIndex(l => /^ {2}(?:[가-하]|\d{1,2})\.\s+\S/.test(l));
  const items = [];
  const notes = [];
  if (start >= 0) {
    let n = 0;
    for (let i = start; i < src.length; i++) {
      const l = src[i];
      if (/^\s*붙임/.test(l)) break;
      if (!l.trim()) continue;
      const m = l.match(/^ {2}(?:[가-하]|\d{1,2})\.\s+(.*)$/);
      if (m) {
        let body = m[1];
        if (/^(참가인원|인\s*원|참\s*가\s*인\s*원)\s*:/.test(body)) { body = body.replace(/\s*※.*$/, ''); notes.push('참가인원 실적 확인'); }
        items.push(`  ${ordKo(n++)}. ${body}`);
      } else items.push(l);
    }
  }
  const t = String(planTitle).replace(/\s*\d+기(?=\s*(운영|참가))/, '');
  const kind = /참가\s*(계획|결과)/.test(t) ? '참가' : /운영\s*(계획|결과)/.test(t) ? '운영' : '추진';
  const name = t.replace(/\s*(운영|참가)\s*(계획|결과보고)(\(안\)|\(변경\))?\s*$/, '').replace(/\s*(시행|추진|실시)?계획(\(안\))?\s*$/, '').trim();
  const ref = formatRunRef(runday) || docNo;
  const lines = [`1. ${ref}호와 관련입니다.`, `2. ${name} ${kind} 결과를 다음과 같이 보고합니다.`, ...items, '', '붙임  결과보고서 1부.  끝.'];
  const hang = lines.map(l => /^ {2}(?:[가-하])\.\s/.test(l) && textWidthPt(l) > HANG_LIMIT_PT);
  return {lines, text: lines.join('\r\n'), hang, notes: [...new Set(notes)]};
}
// 새 운영/참가 계획서의 뼈대: 같은 사업의 과거 계획서(없으면 가장 최근 계획서)의 1항(근거 문서)·라벨을 그대로 쓰고 값만 비운다.
export function buildPlanSkeleton(model, {title = ''} = {}) {
  const es = ((model && model.entries) || []).filter(e => e.body && /계획(\(안\)|\(변경\))?$/.test(String(e.title).trim()) && /^일반기안문/.test(e.form || '일반기안문'));
  if (!es.length) return null;
  const tk = patternTokens(title);
  let best = null;
  for (const e of es) { let s = 0; for (const t of tk) if (e.tokens.includes(t)) s += t.length >= 3 ? 2 : 1; if (!best || s > best.s || (s === best.s && String(e.date || '') > String(best.e.date || ''))) best = {s, e}; }
  const lines = String(best.e.body).split(/\r?\n/);
  const start = lines.findIndex(l => /^ {2}(?:[가-하]|\d{1,2})\.\s+\S/.test(l));
  if (start < 0) return null;
  // 관련 문서번호는 같은 사업으로 볼 만큼 제목이 겹칠 때만 이어받는다(아니면 빈칸)
  const hit = tk.filter(t => best.e.tokens.includes(t)).length;
  const refLine = tk.length && hit >= Math.max(2, Math.ceil(tk.length * 0.6)) ? (lines.find(l => /^1\.\s/.test(l)) || '') : '';
  const kind = /참가\s*계획/.test(title) ? '참가' : '운영';
  const name = String(title).replace(/\s*(운영|참가)\s*계획(\(안\))?\s*$/, '').trim();
  const items = [];
  let n = 0;
  for (let i = start; i < lines.length; i++) {
    if (/^\s*붙임/.test(lines[i])) break;
    const m = lines[i].match(/^ {2}(?:[가-하]|\d{1,2})\.\s+([^:：]+[:：])/);
    if (m) items.push(`  ${ordKo(n++)}. ${m[1].trim()} `);
  }
  const out = [refLine || '1. 전략경영실-    (    .  .  .)호와 관련입니다.', kind === '참가' ? `2. ${name}에 참가하고자 합니다.` : `2. ${name}${(() => { const k = [...name].reverse().find(ch => /[가-힣]/.test(ch)); return k && (k.charCodeAt(0) - 0xAC00) % 28 === 0 ? '를' : '을'; })()} 다음과 같이 운영하고자 합니다.`, ...items, '', `붙임  ${kind === '참가' ? '안내문' : '운영계획서'} 1부.  끝.`];
  return {lines: out, text: out.join('\r\n'), basis: best.e.title, refCopied: !!refLine};
}

// ---------------------------------------------------------------------------
// 지급 문서 패턴: 계획서 -> 지급 건의(일반기안문) -> 지출결의서(기안포함)  /  계획서 -> 물품매입품의서 -> 지출결의서(기안미포함)
// ---------------------------------------------------------------------------
// 금액 -> "금200,000원(금이십만원)". 실제 문서처럼 십·백·천 앞의 '일'을 생략하지 않는다(일십오만, 일백삼십만).
// 항목 부호: 가나다...하, 거너더...허, 고노도...호 (14개를 넘겨도 undefined가 나오지 않게)
const ORD_KO = '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호';
export const ordKo = n => ORD_KO[n] || String(n + 1);
export function moneyKo(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return '';
  const dig = '영일이삼사오육칠팔구', small = ['', '십', '백', '천'], big = ['', '만', '억', '조'];
  const groups = [];
  for (let x = v; x > 0; x = Math.floor(x / 10000)) groups.push(x % 10000);
  let out = '';
  groups.forEach((g, gi) => {
    if (!g) return;
    let s = '';
    String(g).padStart(4, '0').split('').forEach((c, i) => { const d = Number(c); if (d) s += dig[d] + small[3 - i]; });
    out = s + big[gi] + out;
  });
  return `금${v.toLocaleString('en-US')}원(금${out}원)`;
}
export function parseWon(s) { const m = String(s || '').replace(/[,\s원]/g, '').match(/\d+/); return m ? Number(m[0]) : 0; }
const isProposal = d => /지급\s*건의$/.test(String(d.title || '').trim()) && /^일반기안문/.test(d.form || '일반기안문');
const isExpense = d => /지출결의/.test(d.form || '');
const isPurchase = d => /물품매입|구입과지출/.test(d.form || '');
export function listProposals(docs = []) { return docs.filter(d => d && d.binder && !/^접수문서/.test(d.binder) && isProposal(d)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))); }
export function proposalAmount(d) { const m = String(d.body || '').match(/(?:지급|지출)예정금액:\s*금([\d,]+)원/); return m ? parseWon(m[1]) : 0; }
// 지급 건의 본문: 같은 사업·비목의 과거 건의를 틀로 삼아 근거 문서·사업명·금액만 바꾼다(결제방법·예산과목·붙임은 그대로 이어받음).
export function buildPaymentProposalBody(baseBody = '', {ref = '', title = '', amount = 0, planBody = ''} = {}) {
  const src = String(baseBody).split(/\r?\n/);
  const tail = src.findIndex(l => /^ {2}가\.\s/.test(l));
  if (tail < 0) return null;
  const subject = String(title).replace(/\s*지급\s*건의$/, '').trim();
  const lines = [`1. ${ref}호와 관련입니다.`, `2. ${subject} 지급을 다음과 같이 건의합니다.`, ...src.slice(tail)];
  // 금액 항목이 정확히 하나가 아니거나 금액이 올바르지 않으면 옛 금액이 남지 않도록 만들지 않는다.
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const ks = lines.flatMap((l, i) => (/^ {2}[가-하]\.\s+(?:지급|지출)예정금액\s*[:：]/.test(l) ? [i] : []));
  if (ks.length !== 1) return null;
  lines[ks[0]] = lines[ks[0]].replace(/[:：]\s*.*$/, `: ${moneyKo(amount)}`);
  // 예산과목: 근거 계획서에 '예산과목' 줄이 있으면 그 값으로 바꾼다(틀 문서는 다른 사업일 수 있음)
  const notes = ['지급계획(표)에는 지급처·내역을 직접 입력하세요.'];
  const planSub = (String(planBody).split(/\r?\n/).map(l => l.match(/예산\s*과목\s*[:：]\s*(.+?)\s*(?:\.\s*끝\.)?\s*$/)).find(Boolean) || [])[1] || '';
  const bi = lines.findIndex(l => /^ {2}[가-하]\.\s+예산\s*과목\s*[:：]/.test(l));
  const looksCode = /(정책|단위|세부|편성목|통계목)\)/.test(planSub); // '부서별 사업비 개별 집행' 같은 설명은 과목 값이 아님
  if (bi >= 0 && planSub && looksCode) {
    const end = /\.\s*끝\.\s*$/.test(lines[bi]) ? '.  끝.' : '';
    lines[bi] = lines[bi].replace(/[:：]\s*.*$/, `: ${planSub.replace(/\.$/, '')}${end}`);
    notes.push('예산과목은 근거 계획서의 값으로 넣었습니다.');
  } else if (bi >= 0) notes.push('예산과목은 틀 문서의 값입니다(근거 계획서에 과목 코드가 적혀 있지 않음). 이번 사업에 맞는지 확인하세요.');
  const hang = lines.map(l => /^ {2}[가-하]\.\s/.test(l) && textWidthPt(l) > HANG_LIMIT_PT);
  return {lines, text: lines.join('\r\n'), hang, notes};
}
export function expenseTitleOf(d) {
  const t = String(d.title || '').trim();
  if (isProposal(d)) return t.replace(/\s*건의$/, '');
  if (/구입$/.test(t)) return `${t}비 지급`;
  if (/제작$/.test(t)) return `${t}비 지급`;
  if (/임차$/.test(t)) return `${t}료 지급`;
  return `${t} 지급`;
}
// 아직 지출결의서가 없는 지급 건의/물품매입품의서를 찾는다 (지출결의서의 참조문서에 문서번호가 있으면 '완료').
export function pendingPayments(docs = []) {
  const own = docs.filter(d => d && d.binder && !/^접수문서/.test(d.binder));
  const used = new Set();
  for (const e of own.filter(isExpense)) for (const r of e.refs || []) { const m = String(r).match(/^\s*([^()]+?)\s*\(/); if (m) used.add(m[1].trim()); }
  const todo = own.filter(d => (isProposal(d) || (isPurchase(d) && !isExpense(d))) && !used.has(d.docNo));
  return todo.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map(d => ({id: d.id, docNo: d.docNo, title: d.title, kind: isProposal(d) ? '지급 건의' : '물품매입 품의', expenseForm: isProposal(d) ? '지출결의서(기안포함)(A10)' : '지출결의서(기안미포함)(A10)', expenseTitle: expenseTitleOf(d), binder: d.binder, amount: proposalAmount(d), date: d.date, ref: formatRefDoc(d.runday || '', d.title)}));
}

// ---------------------------------------------------------------------------
// 거버넌스: 변조 감지 감사로그(해시 체인), 관리자 정책, 보존기간, 버전 비교
// ---------------------------------------------------------------------------
export function sha256Hex(str) {
  const bytes = new TextEncoder().encode(String(str));
  const K = []; const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  for (let c = 2, n = 0; n < 64; c++) { let p = true; for (let d = 2; d * d <= c; d++) if (c % d === 0) { p = false; break; } if (p) K[n++] = (Math.cbrt(c) % 1 * 4294967296) | 0; }
  const l = bytes.length, total = (((l + 9 + 63) >> 6) << 6), buf = new Uint8Array(total);
  buf.set(bytes); buf[l] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(total - 4, (l * 8) >>> 0); dv.setUint32(total - 8, Math.floor(l * 8 / 4294967296));
  const w = new Array(64);
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + w[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10))) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
const auditCore = e => JSON.stringify([e.id, e.at, e.command, e.type, e.target, e.summary, e.steps, e.verified, e.prev]);
// 새 기록에 이전 기록의 해시를 엮어 넣는다(중간 삭제·수정 시 검증 실패).
export function chainAudit(list = [], entry) {
  const prev = list.length && list[0].hash ? list[0].hash : '0'.repeat(64);
  const e = {...entry, prev};
  e.hash = sha256Hex(auditCore(e));
  return e;
}
// list는 최신순. 맨 앞부터 prev 연결과 해시를 확인한다. 보관 한도로 잘린 꼬리는 허용.
export function verifyAudit(list = []) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.hash) return {ok: i === list.length - 1 || !list[i + 1].hash ? true : false, checked: i, legacy: list.length - i};
    if (sha256Hex(auditCore(e)) !== e.hash) return {ok: false, badAt: i, checked: i, reason: '내용이 바뀌었습니다'};
    const next = list[i + 1];
    if (next && next.hash && next.hash !== e.prev) return {ok: false, badAt: i, checked: i, reason: '중간 기록이 빠졌습니다'};
  }
  return {ok: true, checked: list.length, legacy: 0};
}
export const POLICY_FEATURES = ['briefing', 'teamAttendance', 'aiAssistant', 'resource', 'googleCalendar', 'draftResult', 'draftPlan', 'draftPay', 'draftGoods', 'recorder', 'aiConsole', 'updateCheck'];
export const DEFAULT_POLICY = {orgName: '', enabled: true, message: '', features: Object.fromEntries(POLICY_FEATURES.map(f => [f, true])), retentionDays: 90, requireAckVersion: '', recorderPlayConfirm: true, license: ''};
// 관리자가 배포 폴더의 policy.js로 지정한 값을 검증·보정한다(알 수 없는 값은 무시, 안전한 쪽으로 기본값).
export function normalizePolicy(p) {
  const o = {...DEFAULT_POLICY, features: {...DEFAULT_POLICY.features}};
  if (!p || typeof p !== 'object') return o;
  if (typeof p.orgName === 'string') o.orgName = p.orgName.slice(0, 60);
  if (p.enabled === false) o.enabled = false;
  if (typeof p.message === 'string') o.message = p.message.slice(0, 200);
  if (p.features && typeof p.features === 'object') for (const f of POLICY_FEATURES) if (p.features[f] === false) o.features[f] = false;
  const r = Number(p.retentionDays); if (Number.isFinite(r)) o.retentionDays = Math.min(365, Math.max(7, Math.round(r)));
  if (typeof p.requireAckVersion === 'string') o.requireAckVersion = p.requireAckVersion.slice(0, 20);
  if (p.recorderPlayConfirm === false) o.recorderPlayConfirm = true; // 재생 확인은 끌 수 없음
  if (typeof p.license === 'string') o.license = p.license.slice(0, 120);
  return o;
}
export function featureAllowed(policy, f) { const p = normalizePolicy(policy); return p.enabled && p.features[f] !== false; }
// 학습한 문서 중 보존기간이 지난 것(수집 시각 at 기준)을 지운다.
export function purgeExpired(patterns, nowMs, days) {
  const p = patterns && patterns.docs ? patterns : {v: 1, docs: {}};
  const limit = nowMs - days * 86400000;
  const docs = {}; let removed = 0;
  for (const [id, d] of Object.entries(p.docs)) { if ((d.learnedAt || p.at || nowMs) < limit) removed++; else docs[id] = d; }
  return {patterns: {...p, docs}, removed};
}
export function compareVersions(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
// 진단 보고서에서 개인정보 성격의 문자열을 가린다(사번·문서번호 숫자·이메일·전화).
export function maskSensitive(s) {
  return String(s ?? '').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '***@***').replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '***-****-****').replace(/(empSeq|loginId|사번)["':=\s]+[\w-]+/gi, '$1=***');
}

// ---------------------------------------------------------------------------
// 직원 근태 달력: 휴가·출장(교육 포함)·시간외 근무만 골라 표시하고, 시간외는 퇴근 지문을 신청 종료 시각과 대조한다.
// 출근 지문은 판정하지 않는다(조기근무만 예외).
// ---------------------------------------------------------------------------
const hmMin = s => { const m = String(s || '').match(/^(\d{2})(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hmFmt = s => (String(s || '').length === 4 ? `${s.slice(0, 2)}:${s.slice(2)}` : '');
// 신청 한 건의 시간·장소·사유(근태 달력과 근태 화면에 보여 주는 세부 내역)
export function appInfo(a = {}) {
  const s = String(a.startTm || ''), e = String(a.endTm || '');
  const time = s.length === 4 && e.length === 4 && !(s === '0000' && e === '0000') ? `${hmFmt(s)}~${hmFmt(e)}` : '';
  return {item: String(a.atNm || ''), time, place: String(a.place || ''), route: [a.depart, a.stop, a.arrive].filter(Boolean).join(' → '), reason: String(a.reason || ''), transport: String(a.transport || ''), title: String(a.title || ''), noDoc: String(a.noDoc || ''), pending: String(a.approState) !== '1'};
}
export const appInfoLine = i => (i ? [i.time, i.place, i.reason].filter(Boolean).join(' · ') + (i.pending ? ' (결재 중)' : '') : '');
// 신청 목록을 사번|날짜별로 색인한다(날짜별 하루씩 펼침, 과거 포함).
export function appInfoIndex(apps = []) {
  const idx = {};
  for (const r of expandPlanned(apps, {fromYmd: '20200101', toYmd: '20991231', todayYmd: '20200101', includePast: true})) (idx[`${r.emp}|${r.date}`] = idx[`${r.emp}|${r.date}`] || []).push({...r.info, name: r.name, dept: r.dept});
  return idx;
}
const kindOfItem = item => /휴가|연차|반차|병가|공가|대체휴가|보상휴가/.test(item) ? 'leave' : /출장|교육/.test(item) ? 'trip' : /연장근무|휴일근무|조기근무|시간외\s*근무/.test(item) ? 'ot' : '';
function pickInfo(idx, r) {
  const list = idx && idx[`${r.emp}|${r.date}`];
  if (!list || !list.length) return null;
  return list.find(i => i.item === r.item) || list.find(i => kindOfItem(i.item) && kindOfItem(i.item) === kindOfItem(r.item)) || null;
}
export function classifyTeamRow(r, now = new Date()) {
  const c = classifyCore(r, now);
  if (!c) return c;
  const i = r.info || null;
  const detail = c.kind === 'ot' ? c.detail + (i && i.reason ? ` · 사유 ${i.reason}` : '') : appInfoLine(i);
  return {...c, info: i, time: i ? i.time : '', place: i ? i.place : '', reason: i ? i.reason : '', detail};
}
function classifyCore(r, now = new Date()) {
  const item = String(r.item || '');
  let kind = '';
  if (/휴가|연차|반차|병가|공가|대체휴가|보상휴가/.test(item)) kind = 'leave';
  else if (/출장|교육/.test(item)) kind = 'trip';
  else if (/연장근무|휴일근무|조기근무|시간외\s*근무/.test(item)) kind = 'ot';
  if (!kind) return null;
  const base = {kind, label: item, name: r.name, dept: r.dept, date: r.date, mine: !!r.mine, emp: r.emp};
  if (kind !== 'ot') return {...base, state: 'info', detail: ''};
  const s = hmMin(r.appStart), e = hmMin(r.appEnd), leave = hmMin(r.leave);
  const span = `${hmFmt(r.appStart)}~${hmFmt(r.appEnd)}`;
  if (s === null || e === null) return {...base, state: 'wait', detail: '신청 시각 확인 필요'};
  // 날짜 경계: 신청 종료가 시작보다 이르거나 24:00이면 다음 날 새벽까지로 본다. 지문에는 날짜가 없어 24시간 넘는 근무는 판별하지 못한다.
  const midnight = dayNumber(fmtYmd(r.date)) * 1440;
  const cross = e < s || e === 1440;
  const end = midnight + e + (e < s ? 1440 : 0);
  const current = Math.floor(now.getTime() / 60000) + 540;
  if (current < end) return {...base, state: 'wait', detail: `신청 ${span}${leave !== null ? ` · 현재 지문 ${hmFmt(r.leave)}` : ''}`};
  if (leave === null) return {...base, state: 'miss', detail: `신청 ${span} · 퇴근 지문 없음`};
  const actual = midnight + leave + (cross && leave < s ? 1440 : 0);
  const early = actual < end;
  return {...base, state: early ? 'short' : 'ok', detail: `신청 ${span} · 퇴근 지문 ${hmFmt(r.leave)}${early ? ` (신청 종료보다 ${end - actual}분 일찍)` : ''}`};
}
export function buildTeamCalendar(rows = [], now = new Date(), idx = null) {
  const byDate = {}, problems = [];
  const expanded = rows.flatMap(r => String(r.item || '').split(/\s*[,;/+·]\s*/).filter(Boolean).map(item => ({...r, item})));
  for (const r0 of expanded) {
    const r = r0.info ? r0 : {...r0, info: pickInfo(idx, r0)};
    const c = classifyTeamRow(r, now);
    if (!c) continue;
    if (c.kind === 'ot' && !c.mine) continue; // 다른 직원의 시간외·지문은 표시하지 않는다(내 것만)
    (byDate[c.date] = byDate[c.date] || []).push(c);
    if (c.kind === 'ot' && (c.state === 'miss' || c.state === 'short')) problems.push(c);
  }
  const order = {ot: 0, leave: 1, trip: 2};
  for (const d of Object.keys(byDate)) byDate[d].sort((a, b) => (b.mine - a.mine) || (order[a.kind] - order[b.kind]) || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko'));
  problems.sort((a, b) => (b.mine - a.mine) || b.date.localeCompare(a.date));
  return {byDate, problems, depts: [...new Set(rows.map(r => r.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))};
}

// 홈 요약: 오늘 부재(휴가·출장)와 최근 7일 시간외 퇴근 지문 확인 필요
export function teamHomeSummary(cal, now = new Date()) {
  const today = kstNow(now).date.replace(/-/g, '');
  const day = (cal && cal.byDate && cal.byDate[today]) || [];
  const from = new Date(now.getTime() - 7 * 86400000), f8 = kstNow(from).date.replace(/-/g, '');
  const problems = ((cal && cal.problems) || []).filter(p => p.date >= f8 && p.date <= today);
  return {leave: day.filter(x => x.kind === 'leave'), trip: day.filter(x => x.kind === 'trip'), ot: day.filter(x => x.kind === 'ot'), problems};
}

// ---------------------------------------------------------------------------
// 지출 확인: 건의/품의 금액 대비 실제로 쓴 내역(법인카드 승인, 계좌이체)을 사용자에게 먼저 묻고 대조한다.
// ---------------------------------------------------------------------------
// 입력 금액은 숫자(쉼표·원 허용)만 인정한다. '-100', '1e6', '1.5'는 거부.
const strictWon = s => { const t = String(s ?? '').replace(/[,\s]|원$/g, ''); return /^\d+$/.test(t) && Number.isSafeInteger(Number(t)) && Number(t) > 0 ? Number(t) : 0; };
const validYmd = s => { const t = String(s || '').replace(/\D/g, ''); if (t.length !== 8) return false; const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6))); return d.toISOString().slice(0, 10).replace(/-/g, '') === t; };
export function checkPaymentEntry(entry = {}, planned = 0, now = new Date()) {
  const today = kstNow(now).date.replace(/-/g, '');
  const errors = [], warns = [];
  const d8 = s => String(s || '').replace(/\D/g, '').slice(0, 8);
  const cards = (entry.cards || []).filter(r => r.merchant || r.amount || r.date || r.approval);
  const trans = (entry.transfers || []).filter(r => r.payee || r.amount || r.account || r.bank || r.date);
  if (!cards.length && !trans.length) errors.push('법인카드 사용 내역이나 계좌이체 내역을 한 건 이상 입력하세요');
  cards.forEach((r, i) => {
    const n = `카드 ${i + 1}번`;
    if (!strictWon(r.amount)) errors.push(`${n}: 금액은 숫자만 입력하세요(예: 120000)`);
    if (!String(r.merchant || '').trim()) errors.push(`${n}: 가맹점(사용처)을 입력하세요`);
    if (!validYmd(r.date)) errors.push(`${n}: 사용일을 실제 날짜 8자리(예: 20261105)로 입력하세요`);
    else if (d8(r.date) > today) errors.push(`${n}: 사용일이 오늘 이후입니다`);
    if (!String(r.approval || '').trim()) warns.push(`${n}: 승인번호가 비어 있습니다(영수증과 대조하려면 입력 권장)`);
  });
  trans.forEach((r, i) => {
    const n = `이체 ${i + 1}번`;
    if (!strictWon(r.amount)) errors.push(`${n}: 금액은 숫자만 입력하세요(예: 120000)`);
    if (!String(r.payee || '').trim()) errors.push(`${n}: 받는 사람(예금주·업체)을 입력하세요`);
    if (!String(r.bank || '').trim()) errors.push(`${n}: 은행을 입력하세요`);
    if (String(r.account || '').replace(/\D/g, '').length < 8) errors.push(`${n}: 계좌번호를 확인하세요(숫자 8자리 이상)`);
    if (d8(r.date).length !== 8) warns.push(`${n}: 이체(예정)일이 비어 있거나 형식이 다릅니다`);
  });
  const cardTotal = cards.reduce((a, r) => a + strictWon(r.amount), 0), transTotal = trans.reduce((a, r) => a + strictWon(r.amount), 0);
  const total = cardTotal + transTotal, diff = planned ? total - planned : 0;
  if (planned && diff > 0) errors.push(`입력 합계 ${total.toLocaleString('en-US')}원이 건의·품의 금액 ${planned.toLocaleString('en-US')}원보다 ${diff.toLocaleString('en-US')}원 많습니다(초과 집행)`);
  else if (planned && diff < 0) warns.push(`입력 합계가 건의·품의 금액보다 ${(-diff).toLocaleString('en-US')}원 적습니다(잔액)`);
  if (!planned) warns.push('건의·품의 금액을 찾지 못해 대조하지 못했습니다');
  const seen = new Set(), dup = [];
  for (const r of cards) { const k = `${d8(r.date)}|${String(r.approval || '').trim()}|${parseWon(r.amount)}`; if (r.approval && seen.has(k)) dup.push(r.merchant); seen.add(k); }
  if (dup.length) errors.push(`같은 카드 승인이 중복 입력됨: ${dup.join(', ')}`);
  return {ok: errors.length === 0, errors, warns, cardTotal, transTotal, total, planned, diff, cards, trans};
}
export const maskAccount = a => { const s = String(a || '').replace(/\D/g, ''); return s.length > 4 ? '*'.repeat(s.length - 4) + s.slice(-4) : s; };

// ---------------------------------------------------------------------------
// AI 도우미(Gemini): 키 형식 검증, 보낼 업무 요약 만들기(메일 본문은 보내지 않는다)
// ---------------------------------------------------------------------------
// 키 형식: 예전 AIza..., 새 형식 AQ.... 둘 다 허용(공백 없는 20자 이상)
export const isGeminiKey = k => /^(AIza|AQ\.)[0-9A-Za-z._-]{16,300}$/.test(String(k || '').trim());
export function buildAiContext({name = '', mine = [], deadlines = [], todayAway = [], ownProblems = [], leave = null, now = new Date()} = {}) {
  mine = Array.isArray(mine) ? mine : []; deadlines = Array.isArray(deadlines) ? deadlines : []; todayAway = Array.isArray(todayAway) ? todayAway : []; ownProblems = Array.isArray(ownProblems) ? ownProblems : [];
  const k = kstNow(now);
  const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const lines = [`오늘: ${k.date} ${String(k.hh).padStart(2, '0')}:${String(k.mm).padStart(2, '0')} (KST)`, name ? `사용자: ${clip(name, 20)} (부천여성청소년재단 전략경영실)` : ''];
  lines.push(`내가 처리할 일 ${mine.length}건:`);
  (Array.isArray(mine) ? mine : []).slice(0, 40).forEach((x, i) => { const dl = x.deadline && typeof x.deadline === 'object' ? [x.deadline.date, x.deadline.time].filter(Boolean).join(' ') : x.deadline; lines.push(`${i + 1}. [${clip(x.state, 8)}] ${clip(x.title, 70)}${x.headline ? ' - ' + clip(x.headline, 60) : ''}${dl ? ' (마감 ' + clip(dl, 16) + ')' : ''}`); });
  if (deadlines.length) { lines.push('다가오는 기한:'); deadlines.slice(0, 15).forEach(d => lines.push(`- ${d.date}${d.time ? ' ' + d.time : ''} ${clip(d.title, 60)}`)); }
  if (todayAway.length) lines.push(`오늘 자리 비운 직원: ${todayAway.slice(0, 20).map(x => clip(x.name, 10) + '(' + clip(x.label, 10) + ')').join(', ')}`);
  if (ownProblems.length) lines.push(`내 시간외 퇴근 지문 확인 필요: ${ownProblems.slice(0, 8).map(x => x.date + ' ' + x.state).join(', ')}`);
  if (leave && leave.remaining !== undefined && leave.remaining !== null) lines.push(`남은 연차: ${leave.remaining}일`);
  return lines.filter(Boolean).join('\n');
}
export const AI_SYSTEM = '당신은 한국 공공기관(부천여성청소년재단 전략경영실) 차장의 업무 비서입니다. 아래 업무 요약만 근거로 답하고, 없는 사실은 지어내지 말고 "자료에 없음"이라고 말하세요. 한국어 존댓말, 이모지 금지, 짧고 구체적으로. 우선순위를 말할 때는 마감과 상태를 근거로 들고, 결재·상신·삭제 같은 실행은 제안만 하고 대신 하지 않습니다.';

// ---------------------------------------------------------------------------
// 도래하지 않은 날짜: 근태/출장 신청 현황(결재 중 포함)을 날짜별 행으로 펼친다. 지문은 아직 없으므로 신청만 보여 준다.
// ---------------------------------------------------------------------------
export function expandPlanned(apps = [], {fromYmd, toYmd, todayYmd, meCd = '', includePast = false} = {}) {
  const out = [];
  const toDay = s => Math.floor(Date.parse(fmtYmd(s) + 'T00:00:00Z') / 86400000);
  const ymdOf = n => new Date(n * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  const seen = new Set();
  for (const a of Array.isArray(apps) ? apps : []) {
    if (!a) continue;
    const s = String(a.startDt || a.atDt || ''), e = String(a.endDt || a.startDt || a.atDt || '');
    if (!/^\d{8}$/.test(s) || !/^\d{8}$/.test(e)) continue;
    const key = [a.empCd, a.appDt, a.appSq, s, e, a.atNm, a.startTm, a.endTm].join('|');
    if (seen.has(key)) continue; seen.add(key);
    if (a.deleteReqYn === 'Y' || a.docdelYn === 'N') continue;
    const leaveLike = /휴가|연차|반차|병가|공가|보상|대체/.test(String(a.atNm || ''));
    // 조회 범위와 오늘로 먼저 잘라서(수개월짜리 신청도 안전하게) 하루씩 펼친다
    const lo = Math.max(toDay(s), toDay(String(fromYmd)), includePast ? -Infinity : toDay(String(todayYmd))), hi = Math.min(toDay(e), toDay(String(toYmd)));
    for (let d = lo; d <= hi; d++) {
      const ymd = ymdOf(d), dow = new Date(d * 86400000).getUTCDay();
      if (leaveLike && s !== e && (dow === 0 || dow === 6)) continue; // 여러 날 휴가는 주말을 쉬는 날로 세지 않는다(출장·휴일근무는 주말도 포함)
      out.push({emp: String(a.empCd || ''), name: a.korNm || a.empNm || '', dept: a.deptNm || '', date: ymd, item: a.atNm || '', appStart: a.startTm || '', appEnd: a.endTm || '', come: '', leave: '', result: '', mine: !!meCd && String(a.empCd) === String(meCd), pending: String(a.approState) !== '1', info: appInfo(a)});
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 자원(공용차량·회의실) 예약: 하루 예약 현황에서 빈 시간 계산, 입력 검증
// ---------------------------------------------------------------------------
const toMin = hhmm => { const m = String(hhmm || '').match(/^(\d{2}):?(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const minToHm = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
// 예약 한 건(YYYYMMDDHHmm 시작·끝)이 지정한 날과 겹치는 분 구간을 돌려준다(여러 날 예약도 처리).
export function bookingSpanOnDay(b, ymd) {
  if (!b) return null;
  const s = String(b.start || ''), e = String(b.end || '');
  if (!/^\d{12}$/.test(s) || !/^\d{12}$/.test(e)) return null;
  if (s.slice(0, 8) > ymd || e.slice(0, 8) < ymd) return null;
  const a = s.slice(0, 8) === ymd ? toMin(s.slice(8)) : 0, z = e.slice(0, 8) === ymd ? toMin(e.slice(8)) : 1440;
  return z > a ? [a, z] : null;
}
export function freeSlots(bookings = [], ymd, {open = '09:00', close = '18:00', minMin = 30} = {}) {
  const lo = toMin(open), hi = toMin(close);
  const busy = bookings.map(b => bookingSpanOnDay(b, ymd)).filter(Boolean).sort((a, b) => a[0] - b[0]);
  const out = []; let cur = lo;
  for (const [a, z] of busy) { if (a > cur) out.push([cur, Math.min(a, hi)]); cur = Math.max(cur, z); if (cur >= hi) break; }
  if (cur < hi) out.push([cur, hi]);
  return out.filter(([a, z]) => z - a >= minMin).map(([a, z]) => ({start: minToHm(a), end: minToHm(z), minutes: z - a}));
}
export function timeOptions({from = '07:00', to = '22:00', step = 30} = {}) { const o = []; for (let m = toMin(from); m <= toMin(to); m += step) o.push(minToHm(m)); return o; }
export function validateBooking({title = '', date = '', start = '', end = '', now = new Date(), limitMin = 0} = {}) {
  const errors = [];
  if (!String(title).trim()) errors.push('예약명을 입력하세요');
  if (!validYmd(String(date).replace(/-/g, ''))) errors.push('날짜를 선택하세요');
  const hmOk = s => /^([01]\d|2[0-3]):?[0-5]\d$/.test(String(s || ''));
  const a = hmOk(start) ? toMin(start) : null, z = hmOk(end) ? toMin(end) : null;
  if (a === null || z === null) errors.push('시작·종료 시각을 선택하세요');
  else if (z <= a) errors.push('종료 시각이 시작보다 뒤여야 합니다');
  else if (limitMin > 0 && z - a > limitMin) errors.push(`최대 ${limitMin / 60}시간까지만 예약할 수 있습니다`);
  const k = kstNow(now), today = k.date.replace(/-/g, ''), d8 = String(date).replace(/-/g, '');
  if (a !== null && (d8 < today || (d8 === today && a < k.hh * 60 + k.mm))) errors.push('이미 지난 시각은 예약할 수 없습니다');
  return {ok: errors.length === 0, errors, start12: d8 + String(start).replace(':', ''), end12: d8 + String(end).replace(':', '')};
}

// ---------------------------------------------------------------------------
// 홈: 오늘 타임라인, 내 상신문서 결재 지연, 퇴근 정리
// ---------------------------------------------------------------------------
const DAY_LO = 8 * 60, DAY_HI = 19 * 60;
// items: {start:'YYYYMMDDHHmm', end, label, kind}. 오늘과 겹치는 구간만 08:00~19:00 안으로 잘라 돌려준다.
export function buildDayTimeline(items = [], ymd, now = new Date()) {
  const segs = [], allDay = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it) continue;
    if (it.allDay) { if (String(it.start || '').slice(0, 8) <= ymd && String(it.end || it.start || '').slice(0, 8) >= ymd) allDay.push({label: it.label, kind: it.kind}); continue; }
    const sp = bookingSpanOnDay({start: it.start, end: it.end}, ymd);
    if (!sp) continue;
    const a = Math.max(DAY_LO, sp[0]), z = Math.min(DAY_HI, sp[1]);
    if (z <= a) continue;
    segs.push({a, z, from: minToHm(sp[0]), to: minToHm(sp[1] === 1440 ? 1439 : sp[1]), label: it.label, kind: it.kind || 'etc'});
  }
  segs.sort((x, y) => x.a - y.a || x.z - y.z);
  const k = kstNow(now), nowMin = k.date.replace(/-/g, '') === ymd ? k.hh * 60 + k.mm : null;
  return {segs, allDay, lo: DAY_LO, hi: DAY_HI, nowMin: nowMin !== null && nowMin >= DAY_LO && nowMin <= DAY_HI ? nowMin : null};
}
// 내 상신문서 중 결재가 끝나지 않았는데 오래 머문 것. 상태 문구 예: "결재중(이승봉)"
export function stalledSubmitted(docs = [], now = new Date(), {days = 2} = {}) {
  const today = dayNumber(kstNow(now).date);
  const out = [];
  for (const d of Array.isArray(docs) ? docs : []) {
    if (!d) continue;
    const st = String(d.status || '');
    if (/결재완료|완료|반려|회수|종결|시행|접수|임시/.test(st) || !st) continue;
    const m = String(d.date || '').match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) continue;
    const age = today - dayNumber(m[1]);
    if (age < days) continue;
    const who = (st.match(/\(([^)]+)\)/) || [])[1] || '';
    out.push({title: String(d.title || '').slice(0, 80), docNo: d.docNo || '', form: d.form || '', status: st, who, age, date: m[1], url: d.url || ''});
  }
  return out.sort((a, b) => b.age - a.age);
}
// 퇴근 정리(17:30 이후): 오늘 시간외 신청이 있으면 퇴근 지문 알림, 내일 일정·부재
export function wrapUpModel({now = new Date(), ownOtToday = null, tomorrowItems = [], tomorrowAway = [], pendingMine = 0} = {}) {
  const k = kstNow(now);
  const active = k.hh * 60 + k.mm >= 17 * 60 + 30;
  return {active, otReminder: ownOtToday ? `오늘 시간외 신청(${ownOtToday.from}~${ownOtToday.to})이 있습니다. 퇴근 전 지문을 꼭 찍으세요.` : '', tomorrow: (Array.isArray(tomorrowItems) ? tomorrowItems : []).slice(0, 6), away: (Array.isArray(tomorrowAway) ? tomorrowAway : []).slice(0, 8), pendingMine};
}

// 업데이트 내역: 새 버전을 낼 때 맨 위에 한 줄을 추가한다(하네스가 현재 버전과 맞는지 검사).
// 4.2~4.6 사이 세부 항목은 릴리스 제목만 근거로 적어 간단하다.
export const CHANGELOG = [
  {v: "0.35.0", date: "2026-11-10", old: "", title: "근태 세부 내역(시간·장소·사유) 표시", items: ["일정 달력의 직원 휴가·출장·교육 칩과 날짜 상세에 시간, 출장지, 사유·목적을 표시. 홈 “오늘 자리 비움”에도 시간과 장소를 함께 표시","근태·연차 화면: 날짜를 누르면 그날의 신청 내용(시간, 장소, 경로, 사유·목적, 교통, 문서번호, 결재 중 여부), 연차·휴가 내역 표에 시간·장소·사유 칸 추가","확인이 필요한 근태 항목의 상세 창에도 같은 신청 내용을 표시. 근태신청과 출장신청 현황 두 목록을 신청 한 건으로 합쳐 읽고 10분 동안 모든 화면이 같이 사용(읽기 전용, 신청일 기준 최근 150일)"]},
  {v: "0.34.1", date: "2026-11-10", old: "", title: "구글 일정: 캘린더별 색 구분", items: ["구글 일정에서 캘린더마다 구글 캘린더 원본과 같은 색으로 일정을 구분해서 표시하고, 화면 위에 색 범례(이름)를 보여 줌","설정 화면이 한 줄에 하나 “캘린더ID #색상 이름” 형식의 목록으로 바뀜. 색과 이름은 생략할 수 있고, 0.34.0에서 저장한 캘린더 목록은 그대로 읽음"]},
  {v: "0.34.0", date: "2026-11-10", old: "", title: "구글 일정 메뉴", items: ["왼쪽 메뉴 “구글 일정”(일정 달력 바로 아래, 명령창에서도 검색): 내 Google 캘린더를 업무센터 안에서 주·월·목록으로 봄. 첫 사용 때 구글 이메일 한 번만 입력","다른 캘린더(부서·개인 등)는 캘린더 ID를 쉼표로 더하면 함께 표시. “새 일정”과 “구글 캘린더 열기” 버튼은 구글 캘린더를 새 탭으로 엶","구글에서 제공하는 퍼가기 화면을 그대로 보여 주는 읽기 전용 화면이며, 일정 내용은 업무센터가 읽거나 저장하지 않음(이메일·보기 방식만 저장). 관리자 정책 googleCalendar로 끌 수 있음"]},
  {v: "0.33.0","date":"2026-11-10","old":"","title":"자료 보호와 설치·동기화 안정성 종합 개선","items":["여러 탭의 할 일·숨김·미루기·설정을 변경분 기준으로 합치고 삭제한 항목의 재등장을 막음. 주간 보고 동시 편집 충돌 시 다른 초안을 보관하고 보고서 화면에서 복구","계정 전환 때 결재 추가 페이지·검색·근태·예산·예약·되돌리기 캐시를 비우고 이전 사용자로 시작한 지연 응답을 폐기","결재 더 보기: 중복 클릭 잠금, 페이지 번호 별도 추적, 문서 ID 중복 제거, 새로고침 이후 오래된 응답 차단","작성 중인 기안·근태·회신의 자동 입력 전 덮어쓰기 확인과 취소 전파 보강. 존재하지 않는 날짜를 신청서에 넣지 않도록 검증","동기화 자료와 체크포인트를 실제 저장 바이트 기준으로 검사하고 최신 브라우저 자료가 과거 파일로 교체되는 것을 차단","원본이 누락된 문서를 표시하되 다른 업로드와 기존 추출 근거는 유지","같은 코드로 빌드하면 같은 실행 검증값 생성, 관리자 정책 보존, 격리 빌드·회귀 검사로 배포본이 테스트 중 바뀌지 않도록 개선","저장 실패를 자동 저장 성공으로 표시하지 않음. 감사 기록 삭제 전에 확인하고 초기화 기록을 남김. 숨겨진 업무센터 탭의 불필요한 자동 조회를 줄임"]},
  {v: "0.32.0",date: "2026-11-09 18:30",old: "",title: "메일 보기 클릭 시 답장 쓰기 창이 열리던 오류 수정",items: ["버그 수정: 오늘 할 일·메일 목록·검색 결과에서 [메일 보기] 또는 [원문 화면 열기]를 클릭했을 때 답장 작성 팝업이 뜨던 오류를 완전히 수정","메일 열람 연결: 메일 선택 또는 [메일 보기] 시 더존 Amaranth 10의 원문 메일 열람 화면(UDAP007)이 업무센터 처리 창과 새 창에 정확하게 열리도록 연동","답장 분리: 메일 답장·전체 답장·전달은 전용 [답장 쓰기]·[전체 답장]·[전달] 버튼을 통해서만 명확하게 실행되도록 분리","미열람 메일 보호: 아직 읽지 않은 메일을 원문 화면으로 열 때 그룹웨어에 열람(읽음)으로 기록될 수 있음을 사전에 확인하는 안전 확인 창 추가"]},
  {v: "0.31.0",date: "2026-11-09 16:30",old: "",title: "만들어 둔 기능을 실제 업무 끝까지 되게: 기능별 실화면 완주 점검과 보강",items: ["점검 방식: 결과보고·계획서·물품매입·지급 건의·메일로 기안·회신 문구·출장/휴가/시간외 신청·지출 준비·차량 예약·주간 실적·할 일 보드·연속 처리·명령 콘솔을 실제 그룹웨어 화면에서 상신·신청 직전까지 끝까지 실행해 보고, 들어간 값을 화면에서 다시 읽어 확인","근태 신청(출장·휴가·시간외/휴일근무): 사유만 복사하던 방식에서, 먼저 날짜·종류·방문처·목적·시간을 묻고 근태신청서(출장신청서·연차휴가신청서·연장근무신청서)를 직접 채운 뒤 [신청완료] 직전에서 멈추도록 바꿈. “다음 주 수요일”처럼 적어도 됨. 출장은 교통수단 선택과 일별 업무계획 등록까지, 시간외는 근무 시간(예: 10:00~15:00)까지 넣음. 같은 날 근태가 이미 있으면 알려 줌","근태신청 버튼이 근태관리 첫 화면이 아니라 근태신청서 화면으로 바로 열리게 수정","결과보고·물품매입: 참조문서(근거 계획서) 자동 지정이 화면 크기에 따라 실패하던 문제 수정, 오래된 계획서도 찾도록 조회 기간을 넓힘","결재선: 불러온 뒤 결재란을 다시 읽어 “차장 → 부장 → 실장”처럼 실제로 들어간 순서를 보여 줌","운영·참가계획: 관련 없는 과거 계획서의 문서번호를 1번 근거로 넣던 문제 수정(같은 사업일 때만 이어받음), 기록물철을 비슷한 제목으로 골랐으면 확인하라고 표시","메일로 기안: 한글 편집기에 본문이 들어가지 않던 문제 수정(결과보고와 같은 기안 엔진 사용), 요청 요지에서 첨부 파일 이름·인사말을 빼고 요청 문장을 고름","지급 건의: 근거 계획서를 바꾸면 제목도 그 사업 이름으로 바뀜, 계획서에 예산과목 코드가 있으면 그 값으로 넣음","지출결의서: 결재작성이 아니라 실제 입력 화면인 마이페이지 > 예산관리 > 예산집행 > 결의서입력을 열고, 그 위에 제목·참조문서·금액·카드 내역 복사 막대를 유지","회신 문구: 제목 괄호가 [[요청] …]처럼 겹치던 표시 수정, 명령 콘솔의 회신문은 대상 메일이 없으면 고르게 함","메일 본문에 “<hr …>” 같은 태그 글자가 섞여 보이던 문제 수정","주간 실적 초안: 기간 선택(이번 주·지난주·최근 7일·11/2~11/6), 월요일에는 지난주가 기본","입력창: 브라우저 기본 입력창 대신 업무센터 안의 입력 대화상자 사용(계획서 제목·물품 품의 제목·할 일 고치기), Enter로 다음 칸·확인","결과보고 대상 목록에서 “예산 변경 계획” 같은 변경 계획서는 제외","자동 입력 안전장치에 [신청완료]·[추가신청]·[신청취소]를 추가해 자동으로 눌리지 않게 함"]},
  {v: "0.30.0",date: "2026-11-09 13:30",old: "",title: "3차 종합 점검: 작동하지 않던 기능 전수 수리",items: ["점검 방식: 실제 그룹웨어 화면에서 모든 화면·버튼 160여 개를 자동으로 눌러 보는 실화면 점검 + 에이전트 팀(Claude Opus 5.5 배선·결함, GPT-6 Astra 업무 동선, Gemini 디자인·레퍼런스) 교차 검토","Ctrl+K 명령 팔레트가 빈 창으로 뜨던 문제 수정(정의되지 않은 함수). 새로 만들기·결과보고·계획서·지급·출장·연차·시간외·차량·AI·진단 등 명령 추가, 최근 쓴 명령을 위로","AI 도우미·지급·기록기 등 대화상자 입력칸에서 Enter를 누르면 창이 닫히고 엉뚱한 명령이 실행되던 문제 수정. AI 질문창은 Enter로 보내기, 앞 대화를 이어서 답하고 답변 길이 늘림","헤더 검색창 Enter가 검색 대신 명령 콘솔만 열던 문제: 업무 지시처럼 보일 때만 빠른 업무 실행, 나머지는 통합검색","빠른 업무 실행(명령 콘솔)의 가짜 성공 제거: 보낸메일 확인은 실제 보낸메일함 조회 결과만 표시, 알아듣지 못한 명령은 통합검색으로, 예산·지급 명령은 지급 문서 화면으로, “다음 주 ○요일”이 이번 주로 계산되던 날짜 오류 수정, 고정 날짜(11-14) 제거","기안·회신 자동 입력의 과장 문구 정리: 본문 사실이 비면 “초안 틀만 입력”으로 표시, 결재선은 “불러옴(이름 확인 필요)”, 회신 문구의 “이상 없음·반영 완료” 같은 단정 대신 입력 칸, 첨부 없을 때 “첨부 참조” 문구 생략, 다시 넣을 때 중복으로 쌓이지 않음, 이름·직위 하드코딩 제거","메일로 기안: 고정 4.5초 대기 대신 화면이 준비될 때까지 확인, 다른 화면에 값을 넣지 않음, 실제로 넣은 칸만 알림","결재 탭을 직접 고르면 0건이어도 그 탭을 유지(다른 탭으로 튕기던 문제), “이 목록 하나씩 처리”가 다른 업무를 열던 문제 수정","처리 창 닫기 버튼이 입력 중인 내용을 묻지 않고 버리던 문제 수정, 처리 창의 “원래 화면 열기” 버튼 복구","직원 근태·배부 이력 조회가 실패하면 끝없이 다시 읽던 문제(화면 깜박임) 수정, 예산 월별 조회 중 사업을 바꾸면 이전 결과가 덮던 문제, 전체 결의 내역이 세목 하나 실패로 통째로 안 보이던 문제 수정","키보드: E = 끝냄 표시 추가, 행 메뉴(⋯) 다시 누르면 닫힘, 숫자키 안내를 실제 동작(1~9)과 일치","“처리 완료” 문구를 “끝냄 표시(업무센터 목록에서만)”로 바꿔 그룹웨어 처리와 구분, Ctrl+Z로 “나와 상관없음” 규칙도 되돌림, 같은 업무를 할 일에 두 번 넣지 않음","현황 차트 화면을 메뉴에 연결(그동안 들어갈 길이 없었음), 팔레트의 “새 기안: 자주 쓰는 양식” 목록이 채워지도록 연결","예산 결의 내역의 문서번호를 누르면 바로 결재문서를 찾아 열기, 관심 사업 행 삭제가 저장되지 않던 문제, 설치 상태가 늘 “미설치”로 보이던 문제, 모두 지우기 뒤 옛 자료가 다시 들어오던 문제 수정","자원 예약: 확인 뒤 예약명만 고쳐도 다시 확인하라던 문제와 첫 클릭이 씹히던 문제 수정","새로고침 버튼을 누르면 결과(내 할 일 건수, 못 읽은 영역)를 알림으로 표시","근태 빠른 신청 사유에 “(undefined)”가 들어가던 문제 수정, 기록기 재생 후 “재생 중”으로 멈추던 문제 수정","디자인: 정의 없이 쓰이던 색·그림자 토큰 정의, 키보드 포커스 테두리, 선택 상자 선명하게, 한글 제목 단어 단위 줄바꿈"]},
  {v: "0.29.0", date: "2026-11-09 12:10", old: "5.8.0 이후", title: "버전 번호를 0.1.0부터 다시 매기고 모든 업데이트 내역을 상세화", items: ["버전 체계를 0.1.0부터 다시 정리: 첫 로컬 도우미(10-22)부터 지금까지 전체를 시간순 0.1.0~0.29.0으로 재번호. 이전 표기(v3.x, v4.x, v5.x)는 각 항목에 “이전 v…”로 남김","업데이트 내역 화면: 항목마다 날짜·시각, 이전 표기, 변경 내용을 자세히 표시하고 최신 3건은 펼쳐서 보여 줌","업데이트 확인은 새 번호 체계(0.x) 릴리스만 비교하도록 변경(옛 v5.x 태그와 섞여 “새 버전”으로 잘못 뜨지 않게 함)","GitHub 릴리스 태그도 v0.29.0부터 새 번호로 발행(이전 v3~v5 태그는 기록으로 그대로 보존)"]},
  {v: "0.28.0", date: "2026-11-09 11:51", old: "5.8.0", title: "버전·업데이트 내역 화면", items: ["왼쪽 아래 “v… 업데이트 내역” 링크와 설정 화면의 “업데이트 내역” 버튼 추가","설치된 버전, 수집기 버전, 최신 여부(GitHub 확인), “업데이트 확인”·“최신 릴리스 열기” 버튼","새 버전으로 바뀐 뒤 처음 열 때 한 번 자동으로 내역 표시(처음 설치 시와 사용 안내 중에는 표시하지 않음)","하네스가 업데이트 내역 맨 위 버전과 실제 버전이 같은지 검사해서 내역 누락을 막음"]},
  {v: "0.27.1", date: "2026-11-09 11:07", old: "5.7.1", title: "다크/라이트 전환 버튼과 Shift+D", items: ["사라졌던 화면 모드 전환 버튼을 헤더(알림 아이콘 왼쪽)에 되살림. 다크면 해, 라이트면 달 아이콘","Shift+D로 다크/라이트 전환 + “다크 모드/라이트 모드” 알림. 검색창 등 입력 중에는 동작하지 않음","도움말 단축키 목록에 Shift+D 추가"]},
  {v: "0.27.0", date: "2026-11-09 07:05", old: "5.7.0", title: "2차 멀티 에이전트 평가 반영, 홈 하루 요약", items: ["평가 팀: Claude Opus 5.5(UX·보안), GPT-6 Astra(제품 전략·로직), Gemini(구조·성능, 4-argon 한도 초과로 3.8-flash 대체)","자원 예약 안전: 사람이 직접 누른 직후에만 실행(페이지 스크립트 호출은 거부), 동시 실행 잠금, 시각 형식·존재하는 날짜·90일 제한, 자원 목록 대조, 로그인 정보 변경 감지, 응답 지연 시 저장 여부 재조회","예약 경합 수정: 확인한 값(자원·날짜·예약명·시간)을 고정해 그대로만 전송, 확인 중 값이 바뀌면 응답 폐기, 늦게 온 조회 응답이 현재 화면을 덮지 않게 함","금액 입력 엄격화(-100, 1e6, 1.5 거부), 실제 없는 날짜(2월 30일) 거부, 오전·오후 반차 구분, 수개월짜리 신청 범위 절단, 출장은 주말 포함, “시간외근무” 분류, 팀 근태 캐시 일 단위 갱신, 다른 달 캐시가 개인 휴가를 숨기던 문제, 하이픈 계좌 마스킹, AI 마감 객체 표시","위험 버튼 차단 목록 확대(접수·배부·제출·확정·등록·결재요청 등), 자동 입력 안전 해제 3분 타이머, 메일 첨부 미리보기 호출 인자 오류 수정","화면: 도움말·안내의 런처 위치 문구 정정, 결재 대기 항목 버튼을 “진행 보기”로, 근태 달력의 결재 대기일 구분, 범례 색 복원, 자원 날짜 선택 즉시 반영, 홈 AI 진입점 중복 제거, 차량 아이콘, 접근성","홈 신기능: “오늘 하루” 08~19시 타임라인(일정·차량·내 시간외·내 휴가/출장, 현재 시각선), 퇴근 정리(17:30 이후 시간외 퇴근 지문 알림·남은 할 일·내일 일정과 부재), 내 상신문서 결재 지연 카드(2일 이상)"]},
  {v: "0.26.0", date: "2026-11-09 06:55", old: "5.6.0", title: "새 런처 아이콘", items: ["어두운 유리 질감의 알약 모양 런처. 로고 칩, 이름, 숫자 배지, Alt G 표시","마우스를 올리면 오늘 요약 말풍선(처리할 일 N건 / 급한 일 N건), 마우스를 따라 움직이는 빛, 급한 일은 붉은 배지가 깜박임, 할 일이 없으면 초록 체크","끌어서 이동, 놓으면 가까운 좌우 끝에 붙고 위치 기억, Alt+더블클릭으로 기본 위치 복귀, 창 크기 변경 시 화면 밖으로 나가지 않게 보정","기본 위치는 오른쪽 아래(그룹웨어 자체 맨위로 버튼과 겹치지 않게 조금 위). 움직임 줄이기 설정과 키보드 포커스 표시 지원"]},
  {v: "0.25.0", date: "2026-11-09 06:49", old: "5.5.0", title: "자원 예약", items: ["왼쪽 메뉴 “자원 예약”과 새로 만들기 메뉴: 공용차량(관용차량 니로EV) 현황, 날짜 이동, 09~18시 빈 시간 칩, 다가오는 예약","예약 흐름: 예약명·시작·종료 입력, “예약 가능한지 확인”(최대 이용시간·중복·한도 확인), 확인되면 “이 내용으로 예약 확정”","쓰기 요청은 예약 등록 하나뿐(rs121A06). 하네스가 그 한 개만 허용되는지 매번 검사. 취소·변경은 그룹웨어 자원 화면에서","승인이 필요한 자원은 “승인 대기”로 표시. 설정 파일에서 features.resource=false로 끌 수 있음"]},
  {v: "0.24.0", date: "2026-11-09 06:36", old: "5.4.0", title: "앞으로 예정된 근태 표시", items: ["근태 기록 조회가 오늘 이후 날짜에는 빈 결과를 돌려주는 문제를 근태·출장 “신청 현황”(결재 중 포함) 조회로 해결해 오늘 이후의 직원 휴가·출장·내 연장근무를 달력에 표시","지문 기록 조회는 어제까지, 오늘부터는 신청 현황으로 채움","달력 부서 필터 기본값을 내 부서(전략경영실)로, “전체 부서” 선택 가능. 홈 “오늘 자리 비움”도 같은 기본값","수집기 호출 인자 오염 사고를 하네스가 검출하도록 검사 추가(문자열 치환으로 내 근태 조회가 일시 깨졌던 문제 재발 방지)"]},
  {v: "0.23.2", date: "2026-11-09 06:21", old: "5.3.2", title: "AI 모델 자동 선택 개선", items: ["모델을 고정하지 않고 최신 flash 모델부터 차례로 시험(신규 사용자에게 막힌 구형 모델 문제 해결)","질문 시 모델이 거절되면 다음 사용 때 다시 고르도록 초기화"]},
  {v: "0.23.1", date: "2026-11-09 06:18", old: "5.3.1", title: "AI 키 새 형식 허용", items: ["AIza 외에 AQ. 로 시작하는 Gemini API 키도 허용(연결 시험 화면 안내 문구 포함)"]},
  {v: "0.23.0", date: "2026-11-09 06:16", old: "5.3.0", title: "내 시간외만 확인, AI 도우미", items: ["다른 직원의 시간외 근무·퇴근 지문 확인 표시를 모두 제거. 달력과 홈은 내 시간외 퇴근 지문만 확인","AI 도우미(Gemini): 오늘 우선순위 정리, 마감·놓친 일 점검, 아침 브리핑, 협조·부재 확인, 자유 질문. 실행은 하지 않고 제안만","보내는 내용은 업무 제목·상태·마감과 직원 이름·휴가 구분만(메일·문서 본문·계좌·비밀번호 제외), 화면에서 미리 확인 가능","API 키 발급 안내 화면(구글 AI 스튜디오 3단계)과 연결 시험. 키는 이 브라우저에만 저장"]},
  {v: "0.22.0", date: "2026-11-09 06:13", old: "5.2.0", title: "지출 내역 확인, 홈 근태 카드, 평가 반영", items: ["지급 문서 화면 ③에서 “지출 내역 입력하고 확인”: 법인카드(사용일·가맹점·금액·승인번호)와 계좌이체(받는 사람·은행·계좌·금액·이체일) 입력 → 건의·품의 금액과 대조(초과 집행 차단, 미래 날짜 차단, 승인 중복 차단, 잔액 안내)","확인 후에만 지출결의서 준비 화면: 제목·참조문서·금액(한글)·내역 복사. 상신·결재는 하지 않으며 저장 기록에는 계좌 끝 4자리만 남김","홈 “오늘 자리 비움” 카드, 기안 참조문서 선택 버튼 대기 재시도(지급 건의 흐름 실화면 ✓ 6개)","1차 멀티 에이전트 평가 반영: 기록기 가져오기 검증(허용 단계·확인 문구는 실행 시점 버튼 이름으로 생성·모든 단계에 위험 버튼 검사·재생 중 가드), 차단 목록 확대와 aria-label 검사, 자정 넘는 시간외, 조기근무도 퇴근 지문 기준, 한 행 복합 항목 분리, 지급액 검증, 문서번호 우선, 접근성 CSS, 정책 항목 teamAttendance, 이벤트 데이터 계약 검사, 확장 설명 문구 정정"]},
  {v: "0.21.1", date: "2026-11-09 05:47", old: "5.1.1", title: "품질 하네스·개발 루프·코드 그래프", items: ["npm run harness(전체 약 1분)/harness:fast(약 2초): 구문, 코드 그래프, 이벤트 계약, 단위 테스트, 빌드·용량 예산, 안전 규칙, 비밀 점검","npm run loop: 파일 저장 때마다 빠른 검사, “새로 깨짐/해결”만 출력. npm run graph: 모듈 의존·이벤트→함수 그래프","푸시 전 자동 검사 훅, 실화면 스모크(모든 화면·오버레이 58개 점검), 알려진 환경 문제 격리 목록","앱 기능은 0.21.0과 동일"]},
  {v: "0.21.0", date: "2026-11-09 05:35", old: "5.1.0", title: "직원 근태 달력, 디자인 전면 개편", items: ["일정 달력에 직원 휴가·출장·교육 표시. 연장·휴일 근무는 신청 종료 시각과 퇴근 지문을 대조(지문 없음/일찍 퇴근/정상/대기). 출근 지문은 판정하지 않음","레이어(휴가·출장·시간외)·부서·내 것만 필터, 날짜를 누르면 그날 직원 근태 상세","디자인: 중립색 면, 가는 선, 유리 질감 상단바, 보라-파랑 그라데이션은 AI 지시 버튼에만, 라이트/다크 두 테마, 달력 가는 격자","출근 지문만 없는 “이상근태”는 내 확인 목록에서 제외. 시각 검수 2회(5→6.5/10) 반영"]},
  {v: "0.20.0", date: "2026-11-09 03:59", old: "5.0.0", title: "거버넌스와 상용화 문서", items: ["관리자 정책 파일(policy.js): 기능별 차단, 전체 긴급 중지, 보관일 설정","SHA-256 해시 체인 감사 기록(수정·중간 삭제 감지), 데이터 관리 화면(항목별 용량·삭제), 진단 보고서(이메일·전화·사번 마스킹), 업데이트 확인, 최초 사용 안내","학습한 결재문서 90일 자동 삭제. 상용화 준비도 평가·관리자 배포 가이드·보안 개인정보 설명서·사용자 매뉴얼·사용 허락 계약 초안"]},
  {v: "0.19.0", date: "2026-11-09 03:55", old: "4.9.0", title: "지급 문서 허브와 그룹웨어 기록기", items: ["지급 문서: 지난 지급 건의를 틀로 근거 계획서·금액을 바꿔 작성(금액 한글 표기 규칙 반영), 물품매입 품의(계획서 참조), 지출결의서 차례인 문서 목록","그룹웨어 기록기: 클릭·입력·선택 기록, 변수화({{이름}}), 재생(한 단계씩 가능), 가져오기/내보내기, 비밀번호 입력은 기록하지 않음, 비가역 버튼은 재생 때마다 확인","자동 입력 안전장치: 상신·결재·임시저장·삭제 클릭 코드 차단, 사전점검(열린 팝업·편집기 준비·덮어쓰기), 실패 시 해당 팝업만 닫고 이후 단계 중단, 확인 버튼은 새 창 범위로 한정, 참조문서 검색 결과 1건일 때만 자동 선택"]},
  {v: "0.18.1", date: "2026-11-09 03:46", old: "4.8.0 보완", title: "계획서 조사(을/를) 수정", items: ["계획서 제목에서 받침에 따라 을/를을 맞추도록 수정"]},
  {v: "0.18.0", date: "2026-11-09 03:46", old: "4.8.0", title: "내 결재문서 패턴 학습 기안", items: ["내 결재문서 246건에서 제목 규칙·기록물철·결재라인·참조문서·본문 서식을 학습. 기록물철 예측 정확도 89.4%(근거 문서가 있으면 93%)","결과보고·계획서를 결재 직전까지 자동 기입: 제목, 공개/긴급/보안/문서구분, 기록물철, 내결재라인 “기본”, 본문(굴림체 12pt·줄간격 160%·내어쓰기), 참조문서","본문은 실제 조직 서식 그대로: 호수 붙여쓰기, 『 앞 공백 없음, 항목 가나다, 붙임 줄, 끝 표시. 단계별 ✓/✗ 보고"]},
  {v: "0.17.1", date: "2026-11-09 03:14", old: "4.7.1", title: "기록물철 매핑과 결재라인 지정", items: ["사업 기준 기록물철 매핑(예: AX 워크숍 → ESG 경영)과 내 결재라인 정확 지정"]},
  {v: "0.17.0", date: "2026-11-09 02:55", old: "4.7.0", title: "지능형 기안 자동 완성, 새로 만들기 개편", items: ["새로 만들기 메뉴를 업무 목적 중심으로 재구성(출장신청서 같은 엉뚱한 화면 대신 결과보고·계획서·물품)","제목·기록물철·결재라인·HWP 본문 자동 기입(HwpCtrl API로 본문 주입), 기안 화면을 넓게 열어 잘림 해결","미완료 계획서 선택 대화상자(이미 결과보고가 있는 건 제외)와 계획→결과보고 자동 생성"]},
  {v: "0.16.0", date: "2026-11-09 02:16", old: "4.6.0", title: "AI 지시창, 자연어 근태, 보낸메일 검증", items: ["AI 지시창: 자연어 지시를 단계별로 실행·관찰하는 러너, 작업 내역과 검증 로그","자연어 날짜 해석(“이번주 토요일” → 11-14(토)) 및 근태신청 연동","보낸메일함에서 같은 제목의 Re: 메일을 찾아 회신 여부를 실시간 검증"]},
  {v: "0.15.0", date: "2026-11-09 02:08", old: "4.5.0", title: "결재 직전까지 기안 자동화", items: ["한 번에 기안 준비, 메일에서 기안 만들기, 실시간 예산표 주입, 연동 양식 안전 라우팅"]},
  {v: "0.14.0", date: "2026-11-09 02:02", old: "4.4.0", title: "API 기반 자동 입력 서비스", items: ["기안 서식 주입기, 메일 회신 초안 채우기, 실시간 예산표, 근태 도우미"]},
  {v: "0.13.1", date: "2026-11-09 01:52", old: "4.3.0 보완", title: "연동본문 오류와 닫기 함정 수정", items: ["“연동본문 데이터 조회 실패” 해결, 안전한 기안 경로, 닫을 때 입력 중 경고가 막던 문제 제거"]},
  {v: "0.13.0", date: "2026-11-09 01:21", old: "4.3.0", title: "사용성 전면 개편", items: ["내 업무/참고 탭 분리, 결재 화면은 건수가 있는 탭을 자동 선택","전문적인 작업 버튼, 바깥 클릭으로 겹친 창 닫기"]},
  {v: "0.12.2", date: "2026-11-09 00:08", old: "4.2.2", title: "겹친 창 닫기와 도움말 버튼", items: ["배경 클릭으로 겹친 창이 닫히는 문제 수정, 명시적인 도움말 버튼, 직접 조작 개선"]},
  {v: "0.12.1", date: "2026-11-09 00:02", old: "4.2.1", title: "디자인 토큰 정리", items: ["디자인 시스템 토큰과 레이아웃 정리"]},
  {v: "0.12.0", date: "2026-11-08 23:35", old: "4.2.0", title: "다중 사용자 분리, 부서 예산 자동", items: ["저장 데이터를 사번별로 분리(여러 사람이 쓰는 PC에서 섞이지 않음)","부서 예산 자동 선택, 깔끔한 영역 분리"]},
  {v: "0.11.0", date: "2026-11-08 22:29", old: "4.1.0", title: "근태 사실 표시, 모듈 분리, 예산 직접 고르기, HWP 미리보기", items: ["근태 사실(결근/미인정 등)을 단정하지 않고 사실로 표시, 안전한 확인창","업무센터 코드를 모듈로 분리(17개 조각)하고 확장 프로그램 실패 시 안내 표시","예산 사업 직접 고르기, 결재 대기 상태 표시, HWP 문서 미리보기(전체 폭), 메뉴·행 표시 수정"]},
  {v: "0.10.0", date: "2026-11-08 21:42", old: "3.3.0", title: "내 일/참고 구분, 메일 첨부", items: ["부서 접수·배부·남의 발송 대기·공지·열람 문서·자료 공유 메일은 “참고”로 분류(이유 표시), 본인 발송 메일 제외, 역할 설정","줄별 “상관없음”(항목/보낸 곳/종류 규칙)과 “내 일로” 지정(되돌리기 가능)","읽은 메일의 첨부 목록, 큰 파일 링크 직접 다운로드(안 읽은 메일은 읽음 처리 때문에 확인 후에만)"]},
  {v: "0.9.0", date: "2026-11-08 21:27", old: "3.2.0", title: "돌아가기와 사용성", items: ["왼쪽 위 집 버튼으로 “오늘 할 일” 복귀(H), 이동 경로 표시, “그룹웨어로 돌아가기”와 다시 열기 안내 말풍선","브라우저 뒤로 가기가 업무센터 안에서 먼저 한 단계씩 되돌림, 상세에서 “목록으로”","노트북 화면에서 차트 접기, 항상 보이는 “열기”, 검색 예시, 초보자 모드에서 점수 숨김"]},
  {v: "0.8.1", date: "2026-11-08 20:19", old: "3.1.1", title: "검토 4차 반영", items: ["연속 처리에서 메일은 시작 이후 보낸 회신만 완료로 인정, 입력 중 보호 강화, 넓은 화면은 자동으로 넓게 열기","휴가일 마감 경고를 원 항목에 합침, 근태 색 보정, 마감 배지 표시 수정(휴가 직전 마지막 근무일 계산)"]},
  {v: "0.8.0", date: "2026-11-08 20:13", old: "3.1", title: "입력 보호, 정직한 결과, 규칙 정정", items: ["입력 중인 내용(회신·의견·기안)이 있으면 화면 이동 전에 확인","연속 처리: 읽음 기록이 남는 항목은 자동으로 열지 않음, 문서는 최대 200행 대조, 메일은 보낸메일함에서 검증","Re:/FW: 메일은 내 마감 아님, 근무일대체 하나는 결근 하나만 설명, 영업일 대기 가산, 연차를 일+시간으로 표시"]},
  {v: "0.7.0", date: "2026-11-08 19:58", old: "3.0", title: "상호작용형 한 페이지 처리", items: ["새로고침해도 유지되는 처리 창, 실패·오래된 자료·세션 만료 상태, IME 안전 단축키","점수 기반 우선순위(마감·대기 일수·긴급 문구), 휴가일 마감 충돌, 연속 처리 모드(서버 검증), 명령 팔레트(Ctrl+K), 여러 건 일괄, 되돌리기(Ctrl+Z)","대시보드 차트, 끌어서 옮기는 보드·달력, 월 근태 격자, 예산 전망과 월별 차트, 메일 회신·전달·새 기안"]},
  {v: "0.6.0", date: "2026-11-08 18:50", old: "2.0", title: "GW 통합 업무센터(한 페이지 처리)", items: ["전체 화면 업무센터: 통합 대기열, 결재·접수·배부·게시판·근태신청 네이티브 화면 포함, 자동 새로고침·알림, 처리 완료·미루기·할 일·보고서·설정","수집기 2판: 전문 검색(문서·메일·게시판·파일·사람), 계정과목별 원장, 일별 근태, 접수·배부 이력, 팝업 링크","접수·배부 추천, 본문 마감 추출, 근태 이상 탐지, 주간 보고 초안, CSV 저장"]},
  {v: "0.5.0", date: "2026-11-08 16:47", old: "1.0", title: "실시간 읽기 전용 그룹웨어 수집기", items: ["그룹웨어 화면 안에서 메일·결재·문서유통·공지·일정·근태·연차·예산(누계)·알림을 병렬로 읽음(약 0.3초)","읽기 전용 허용 목록만 호출, 쿠키·토큰은 읽지 않음","우선순위 브리핑, 제목 기한, 이전 실행과의 차이, HTML/Markdown 출력, 북마클릿"]},
  {v: "0.4.0", date: "2026-10-23 21:51", old: "로컬 도우미 후기", title: "범위 지정 브라우저 스냅샷", items: ["브라우저 스냅샷을 범위 지정해 연결하고 그룹웨어 검색 문제 수정, 검색 범위 안내와 빈 문서 라이브러리 처리"]},
  {v: "0.3.0", date: "2026-10-22 15:54", old: "로컬 도우미 중기", title: "파일 자동화·동기화 검증·첨부 추출", items: ["워크플로 참조를 쓰는 파일 자동화 강화, 페이지 나뉜 동기화 검증","로컬 첨부파일 추출과 버전별 검색 근거, 선택한 첨부 금액 검증, 로컬 모델 확인"]},
  {v: "0.2.0", date: "2026-10-22 03:38", old: "로컬 도우미 초기", title: "이식 가능한 설치와 예약 처리", items: ["어느 PC에서나 설치하는 설치 스크립트, 예약된 내보내기 자료 처리","제출한 문서와 결재 대기를 구분하도록 수정"]},
  {v: "0.1.0", date: "2026-10-22 01:37", old: "시작", title: "로컬 업무도우미 MVP", items: ["그룹웨어 자료를 가져와 업무 브리핑·규정과 서식 검색·초안 사전 점검을 하는 로컬 우선 도우미","범위가 정해진 근거 중심 워크플로, 상신·결재·발송·회계 반영 기능 없음"]},
];

// 헤더 검색창 Enter: 업무 지시처럼 보이면 빠른 업무 실행(명령 콘솔), 아니면 통합검색.
export const looksLikeCommand = q => /(작성|기안|신청|예약|회신|답장)\s*(해\s*줘|해\s*주세요|하기|해)$|(작성|기안|신청|예약|회신|답장)\s*(해\s*줘|해\s*주세요)|올려\s*줘|만들어\s*줘|써\s*줘|보내\s*줘|확인해\s*줘|확인해\s*주세요|준비해\s*줘|보냈는지/.test(String(q || '').trim());
