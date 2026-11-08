// Turns a raw BWYFGW.collect() result into an action-oriented briefing
// (analysis object, HTML, Markdown), a diff state and an assistant dataset.
// Pure functions: no network, no file access.

const ACTION_WORDS = /요청|확인|회신|제출|협조|검토|마감|기한|긴급|필독|참석|회의|신청|문의|보고|의견|취합/;
const NOISE_WORDS = /광고|뉴스레터|newsletter|weekly|위클리|웨비나|webinar|no-?reply|수신거부|구독|이벤트 안내/i;
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
  const unreadMails = uniqueMails.filter(m => !m.seen && !NOISE_WORDS.test(m.subject));
  const recentAction = uniqueMails.filter(m => m.seen && !m.answered && !m.forwarded && ageDays(m.date, now) <= 3 && ACTION_WORDS.test(m.subject) && !NOISE_WORDS.test(m.subject) && !/^re:|^회신:|^답장:/i.test(m.subject.trim()));
  const fromMe = m => (me && m.from === me) || (myLogin && String(m.fromEmail || '').toLowerCase().startsWith(myLogin + '@'));
  for (const m of uniqueMails) {
    const k = `mail:${m.box}:${m.uid}`;
    if (fromMe(m)) continue; // mails I sent to myself are notes, not tasks
    // "Re:/FW:" mails are replies to a request (often my own): not my deadline.
    const isReplyMail = /^\s*(re|fw|fwd|회신|답장|전달)\s*[:：]/i.test(m.subject || '');
    if (isReplyMail) {
      if (!m.seen && !NOISE_WORDS.test(m.subject)) push({key: k, type: 'mail', base: 'mailReplyIn', from: m.from, ref: {box: m.box, uid: m.uid}, area: '메일', kind: '내 요청에 온 회신', title: m.subject, detail: `${m.from} · 안 읽음`, when: m.date, url: d.mail.url, isNew: hasPrev && !prevMail.has(`${m.box}:${m.uid}`)});
      continue;
    }
    const dl = ageDays(m.date, now) <= 30 ? addDeadline(m.subject, '메일', d.mail?.url, k, m.preview) : null;
    const hasDeadline = dl && dl.dday >= -1 && dl.dday <= 7 && !NOISE_WORDS.test(m.subject);
    const unread = !m.seen && !NOISE_WORDS.test(m.subject);
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
  if (best) return {...metaOf(best.e), basis: `같은 사업의 과거 문서 “${best.e.title}”와 동일`, confidence: 'similar'};
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
  const refLine = lines.find(l => /^1\.\s/.test(l)) || '';
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
  return {lines: out, text: out.join('\r\n'), basis: best.e.title};
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
export function buildPaymentProposalBody(baseBody = '', {ref = '', title = '', amount = 0} = {}) {
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
  const hang = lines.map(l => /^ {2}[가-하]\.\s/.test(l) && textWidthPt(l) > HANG_LIMIT_PT);
  return {lines, text: lines.join('\r\n'), hang, notes: ['지급계획(표)에는 지급처·내역을 직접 입력하세요.']};
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
export const POLICY_FEATURES = ['briefing', 'teamAttendance', 'aiAssistant', 'draftResult', 'draftPlan', 'draftPay', 'draftGoods', 'recorder', 'aiConsole', 'updateCheck'];
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
export function classifyTeamRow(r, now = new Date()) {
  const item = String(r.item || '');
  let kind = '';
  if (/휴가|연차|반차|병가|공가|대체휴가|보상휴가/.test(item)) kind = 'leave';
  else if (/출장|교육/.test(item)) kind = 'trip';
  else if (/연장근무|휴일근무|조기근무/.test(item)) kind = 'ot';
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
export function buildTeamCalendar(rows = [], now = new Date()) {
  const byDate = {}, problems = [];
  const expanded = rows.flatMap(r => String(r.item || '').split(/\s*[,;/+·]\s*/).filter(Boolean).map(item => ({...r, item})));
  for (const r of expanded) {
    const c = classifyTeamRow(r, now);
    if (!c) continue;
    if (c.kind === 'ot' && !c.mine) continue; // 다른 직원의 시간외·지문은 표시하지 않는다(내 것만)
    (byDate[c.date] = byDate[c.date] || []).push(c);
    if (c.kind === 'ot' && (c.state === 'miss' || c.state === 'short')) problems.push(c);
  }
  const order = {ot: 0, leave: 1, trip: 2};
  for (const d of Object.keys(byDate)) byDate[d].sort((a, b) => (b.mine - a.mine) || (order[a.kind] - order[b.kind]) || a.name.localeCompare(b.name, 'ko'));
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
export function checkPaymentEntry(entry = {}, planned = 0, now = new Date()) {
  const today = kstNow(now).date.replace(/-/g, '');
  const errors = [], warns = [];
  const d8 = s => String(s || '').replace(/\D/g, '').slice(0, 8);
  const cards = (entry.cards || []).filter(r => r.merchant || r.amount || r.date || r.approval);
  const trans = (entry.transfers || []).filter(r => r.payee || r.amount || r.account || r.bank || r.date);
  if (!cards.length && !trans.length) errors.push('법인카드 사용 내역이나 계좌이체 내역을 한 건 이상 입력하세요');
  cards.forEach((r, i) => {
    const n = `카드 ${i + 1}번`;
    if (!parseWon(r.amount)) errors.push(`${n}: 금액을 입력하세요`);
    if (!String(r.merchant || '').trim()) errors.push(`${n}: 가맹점(사용처)을 입력하세요`);
    if (d8(r.date).length !== 8) errors.push(`${n}: 사용일을 8자리(예: 20261105)로 입력하세요`);
    else if (d8(r.date) > today) errors.push(`${n}: 사용일이 오늘 이후입니다`);
    if (!String(r.approval || '').trim()) warns.push(`${n}: 승인번호가 비어 있습니다(영수증과 대조하려면 입력 권장)`);
  });
  trans.forEach((r, i) => {
    const n = `이체 ${i + 1}번`;
    if (!parseWon(r.amount)) errors.push(`${n}: 금액을 입력하세요`);
    if (!String(r.payee || '').trim()) errors.push(`${n}: 받는 사람(예금주·업체)을 입력하세요`);
    if (!String(r.bank || '').trim()) errors.push(`${n}: 은행을 입력하세요`);
    if (String(r.account || '').replace(/\D/g, '').length < 8) errors.push(`${n}: 계좌번호를 확인하세요(숫자 8자리 이상)`);
    if (d8(r.date).length !== 8) warns.push(`${n}: 이체(예정)일이 비어 있거나 형식이 다릅니다`);
  });
  const cardTotal = cards.reduce((a, r) => a + parseWon(r.amount), 0), transTotal = trans.reduce((a, r) => a + parseWon(r.amount), 0);
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
export const isGeminiKey = k => /^AIza[0-9A-Za-z_-]{30,60}$/.test(String(k || '').trim());
export function buildAiContext({name = '', mine = [], deadlines = [], todayAway = [], ownProblems = [], leave = null, now = new Date()} = {}) {
  const k = kstNow(now);
  const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const lines = [`오늘: ${k.date} ${String(k.hh).padStart(2, '0')}:${String(k.mm).padStart(2, '0')} (KST)`, name ? `사용자: ${clip(name, 20)} (부천여성청소년재단 전략경영실)` : ''];
  lines.push(`내가 처리할 일 ${mine.length}건:`);
  mine.slice(0, 40).forEach((x, i) => lines.push(`${i + 1}. [${clip(x.state, 8)}] ${clip(x.title, 70)}${x.headline ? ' - ' + clip(x.headline, 60) : ''}${x.deadline ? ' (마감 ' + clip(x.deadline, 16) + ')' : ''}`));
  if (deadlines.length) { lines.push('다가오는 기한:'); deadlines.slice(0, 15).forEach(d => lines.push(`- ${d.date}${d.time ? ' ' + d.time : ''} ${clip(d.title, 60)}`)); }
  if (todayAway.length) lines.push(`오늘 자리 비운 직원: ${todayAway.slice(0, 20).map(x => clip(x.name, 10) + '(' + clip(x.label, 10) + ')').join(', ')}`);
  if (ownProblems.length) lines.push(`내 시간외 퇴근 지문 확인 필요: ${ownProblems.slice(0, 8).map(x => x.date + ' ' + x.state).join(', ')}`);
  if (leave && leave.remaining !== undefined && leave.remaining !== null) lines.push(`남은 연차: ${leave.remaining}일`);
  return lines.filter(Boolean).join('\n');
}
export const AI_SYSTEM = '당신은 한국 공공기관(부천여성청소년재단 전략경영실) 차장의 업무 비서입니다. 아래 업무 요약만 근거로 답하고, 없는 사실은 지어내지 말고 "자료에 없음"이라고 말하세요. 한국어 존댓말, 이모지 금지, 짧고 구체적으로. 우선순위를 말할 때는 마감과 상태를 근거로 들고, 결재·상신·삭제 같은 실행은 제안만 하고 대신 하지 않습니다.';
