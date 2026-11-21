// GW 비서 · 내 할 일(그룹웨어 ToDo)과 예산 집행 계획의 순수 계산 (v1.17).
// briefing.mjs 뒤에 이어 붙어 R.* 로 쓰인다. import, DOM, localStorage를 쓰지 않는다. 이름은 td*/bp* 접두로 겹치지 않게 한다.
// 설계: docs/design/todo-budget-plan.md

const TD_MARK_RE = /⟦gwb:(\{[\s\S]*?\})⟧/g;
const TD_HEAD = '— GW 비서 정보(이 아래는 고치지 마세요) —';
const TD_MAX_CONTENTS = 1500;
const tdPad = n => String(n).padStart(2, '0');
const tdIso = s => { const t = String(s || '').replace(/[^0-9]/g, ''); return t.length >= 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : ''; };
const tdDayNum = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);
const tdFromNum = n => new Date(n * 86400000).toISOString().slice(0, 10);
const tdToday = now => { const k = new Date(now.getTime() + 9 * 3600000); return `${k.getUTCFullYear()}-${tdPad(k.getUTCMonth() + 1)}-${tdPad(k.getUTCDate())}`; };
const tdValidIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && tdFromNum(tdDayNum(s)) === s;
const tdWon = n => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const tdMd = iso => iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '';
const TD_WD = ['일', '월', '화', '수', '목', '금', '토'];

// ---------- 메모 + 정보 묶음 ----------
// 묶음이 끝에 있지 않아도(그룹웨어·모바일에서 뒤에 글을 덧붙인 경우) 마지막 묶음을 읽고, 묶음 뒤의 글은 메모로 살린다.
// 표시줄은 있는데 JSON을 읽지 못하면 broken: 이때는 내용 칸을 다시 쓰지 않는다(정보를 지우지 않기 위해).
export function tdMetaParse(contents = '') {
  const text = String(contents || '').replace(/\r\n/g, '\n');
  const all = [...text.matchAll(TD_MARK_RE)];
  const m = all.length ? all[all.length - 1] : null;
  const cut = text.indexOf(TD_HEAD);
  let meta = {}, broken = false;
  if (m) { try { const j = JSON.parse(m[1]); if (j && typeof j === 'object' && !Array.isArray(j)) meta = j; else broken = true; } catch { broken = true; } }
  else if (cut >= 0) broken = true;
  const before = cut >= 0 && (!m || cut < m.index) ? text.slice(0, cut) : m ? text.slice(0, m.index) : text;
  const after = m ? text.slice(m.index + m[0].length).trim() : '';
  const memo = [before.replace(/\s+$/, ''), after].filter(Boolean).join('\n');
  return {memo, meta, broken, hasBlock: !!m || cut >= 0};
}
export function tdRepeatLabel(rp) {
  if (!rp || typeof rp !== 'object') return '';
  if (rp.f === 'wd') return '평일 매일';
  if (rp.f === 'w') { const days = (Array.isArray(rp.wd) ? rp.wd : []).filter(n => n >= 0 && n <= 6); return days.length ? `매주 ${days.map(n => TD_WD[n]).join('·')}요일` : ''; }
  if (rp.f === 'm') return rp.md === -1 ? '매월 말일' : Number.isInteger(rp.md) && rp.md >= 1 && rp.md <= 31 ? `매월 ${rp.md}일` : '';
  return '';
}
export function tdMetaLines(meta = {}) {
  const out = [];
  const rl = tdRepeatLabel(meta.rp); if (rl) out.push('반복: ' + rl);
  const b = meta.b;
  if (b && b.c) out.push(`예산: ${b.h || ''} ${b.n || b.c} ${tdWon(b.a)}원${b.d ? ` (${tdMd(b.d)} 예정)` : ''}${b.st === 'done' ? ' · 집행됨' : ''}`.replace(/\s+/g, ' '));
  if (b && b.pd) out.push('근거 계획서: ' + b.pd);
  for (const l of (Array.isArray(meta.ln) ? meta.ln : []).slice(0, 5)) out.push('연결: ' + (l.no || l.ti || l.t || '').toString().slice(0, 60));
  return out;
}
// 저장할 내용 칸 문자열. 정보가 없으면 메모만 둔다. 너무 길면 {ok:false}.
export function tdMetaCompose(memo = '', meta = {}) {
  const clean = {};
  for (const [k, v] of Object.entries(meta || {})) if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)) clean[k] = v;
  const m = String(memo || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  const keys = Object.keys(clean).filter(k => k !== 'v');
  if (!keys.length) return {ok: m.length <= TD_MAX_CONTENTS, text: m, length: m.length};
  clean.v = 1;
  const text = `${m ? m + '\n\n' : ''}${TD_HEAD}\n${tdMetaLines(clean).join('\n')}${tdMetaLines(clean).length ? '\n' : ''}⟦gwb:${JSON.stringify(clean)}⟧`;
  return {ok: text.length <= TD_MAX_CONTENTS, text, length: text.length};
}

// 그룹웨어 ToDo 행 → GW 비서 할 일
export function tdFromGw(r = {}) {
  const {memo, meta, broken} = tdMetaParse(r.contents);
  const kids = Array.isArray(r.children) ? r.children : [];
  const due = tdIso(r.endDate) || tdIso(r.startDate);
  return {
    id: String(r.todoSeq || ''), title: String(r.todoName || '').trim(), due, start: tdIso(r.startDate), contents: String(r.contents || ''),
    done: String(r.todoStatus) === '2' || Number(r.processRate) >= 100, doneDate: tdIso(r.completeDate),
    important: String(r.importDegree || '0') === '1', memo, meta, broken,
    created: tdIso(r.createDate), modified: tdIso(r.modifyDate), level: Number(r.todoLevel) || 1, parent: String(r.prtSeq || ''),
    project: String(r.prjSeq || ''), owner: String(r.ownerEmpSeq || ''), creator: String(r.createEmpSeq || ''),
    mine: r.loginUserTodoOwnerYn === 'Y' && r.loginUserTodoCreateYn === 'Y',
    checklist: kids.map(c => ({id: String(c.todoSeq || ''), title: String(c.todoName || '').trim(), done: String(c.todoStatus) === '2' || Number(c.processRate) >= 100})),
  };
}

// ---------- 반복 ----------
const tdHolSet = hol => new Set((Array.isArray(hol) ? hol : []).map(h => tdIso(typeof h === 'string' ? h : h && h.date)).filter(Boolean));
const tdIsOff = (iso, hs) => { const w = new Date(iso + 'T00:00:00Z').getUTCDay(); return w === 0 || w === 6 || hs.has(iso); };
const tdPrevWork = (iso, hs) => { let n = tdDayNum(iso); for (let i = 0; i < 14 && tdIsOff(tdFromNum(n), hs); i++) n--; return tdFromNum(n); };
// 다음 회차 기한. after(지난 회차 기한, 없으면 오늘)보다 뒤의 첫 날짜. 주말·휴일이면 앞 평일(평일 매일은 다음 평일).
export function tdNextDue(rp, after, holidays = []) {
  if (!rp || !tdValidIso(after)) return '';
  const hs = tdHolSet(holidays), base = tdDayNum(after);
  if (rp.f === 'wd') { for (let n = base + 1; n < base + 30; n++) if (!tdIsOff(tdFromNum(n), hs)) return tdFromNum(n); return ''; }
  if (rp.f === 'w') {
    const days = new Set((Array.isArray(rp.wd) ? rp.wd : []).filter(n => Number.isInteger(n) && n >= 0 && n <= 6));
    if (!days.size) return '';
    for (let n = base + 1; n < base + 60; n++) { const iso = tdFromNum(n); if (days.has(new Date(iso + 'T00:00:00Z').getUTCDay())) { const adj = tdPrevWork(iso, hs); if (adj > after) return adj; } }
    return '';
  }
  if (rp.f === 'm') {
    const md = rp.md === -1 ? -1 : Number(rp.md);
    if (md !== -1 && !(Number.isInteger(md) && md >= 1 && md <= 31)) return '';
    let y = Number(after.slice(0, 4)), mo = Number(after.slice(5, 7));
    for (let i = 0; i < 24; i++) {
      const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const iso = `${y}-${tdPad(mo)}-${tdPad(md === -1 ? last : Math.min(md, last))}`;
      const adj = tdPrevWork(iso, hs);
      if (adj > after) return adj;
      mo++; if (mo > 12) { mo = 1; y++; }
    }
  }
  return '';
}
// 반복 묶음(sid)마다 가장 늦은 회차만 본다. 그 회차가 끝났고 반복 규칙이 있으며 다음 회차 표시(nx)·멈춤(stop)이 없을 때만 다음 회차를 만든다.
// 같은 묶음에 열린 회차가 하나라도 있으면 만들지 않는다(사용자가 지운 경우·예전 회차의 표시 실패로 중복 생성하지 않게).
// nx가 'p<시각>'이면 다른 PC가 만드는 중이라는 표시다. 10분이 넘도록 바뀌지 않았으면 실패로 보고 다시 만든다.
export function tdRepeatDue(todos = [], now = new Date()) {
  const nxSet = nx => !!nx && !(/^p\d{13}/.test(nx) && now.getTime() - Number(String(nx).slice(1, 14)) > 600000);
  const open = new Set(todos.filter(t => !t.done && t.meta && t.meta.sid).map(t => t.meta.sid));
  const latest = new Map();
  for (const t of todos) {
    if (!t.meta || !t.meta.sid) continue;
    const cur = latest.get(t.meta.sid);
    const key = x => String(x.due || '') + '|' + String(x.created || '') + '|' + String(x.id || '').replace(/\D/g, '').padStart(12, '0');
    if (!cur || key(t) > key(cur)) latest.set(t.meta.sid, t);
  }
  return [...latest.values()].filter(t => t.done && t.meta.rp && !nxSet(t.meta.nx) && !t.meta.stop && !open.has(t.meta.sid));
}

// ---------- 점검 ----------
export function tdBucketOf(t, now = new Date()) {
  if (t.done) return 'done';
  if (!t.due) return 'nodate';
  const n = tdDayNum(t.due) - tdDayNum(tdToday(now));
  if (n < 0) return 'late';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return n <= 7 ? 'week' : 'later';
}
export const TD_BUCKETS = [['late', '지난 기한'], ['today', '오늘'], ['tomorrow', '내일'], ['week', '7일 안'], ['later', '나중'], ['nodate', '기한 없음'], ['done', '끝낸 일']];
export function tdSort(list = []) {
  return [...list].sort((a, b) => (!!a.done - !!b.done) || (!!b.important - !!a.important) || String(a.due || '9999').localeCompare(String(b.due || '9999')) || String(a.title).localeCompare(String(b.title), 'ko'));
}
export function tdSummary(todos = [], now = new Date()) {
  const s = {total: 0, late: 0, today: 0, tomorrow: 0, week: 0, important: 0, done: 0, plans: 0};
  for (const t of todos) {
    const b = tdBucketOf(t, now);
    if (b === 'done') { s.done++; continue; }
    s.total++; if (s[b] !== undefined) s[b]++;
    if (t.important) s.important++;
    if (t.meta && t.meta.b && t.meta.b.c) s.plans++;
  }
  return s;
}
// 기한 알림: D-3, D-1, 당일, 지남. key로 하루 한 번만 띄운다.
export function tdAlerts(todos = [], now = new Date()) {
  const t0 = tdToday(now), out = [];
  for (const t of todos) {
    if (t.done || !t.due) continue;
    const n = tdDayNum(t.due) - tdDayNum(t0);
    const stage = n < 0 ? 'late' : n === 0 ? 'd0' : n === 1 ? 'd1' : n === 3 ? 'd3' : '';
    if (!stage) continue;
    const label = stage === 'late' ? `기한 ${-n}일 지남` : stage === 'd0' ? '오늘 마감' : stage === 'd1' ? '내일 마감' : '3일 뒤 마감';
    out.push({id: t.id, stage, label, title: t.title, due: t.due, important: !!t.important, key: `${t.id}:${stage}:${t0}`});
  }
  const rank = {late: 0, d0: 1, d1: 2, d3: 3};
  return out.sort((a, b) => rank[a.stage] - rank[b.stage] || (!!b.important - !!a.important));
}
// 퇴근 전 마무리 대상: 오늘까지인데 끝내지 않은 일
export function tdWrapUp(todos = [], now = new Date()) {
  const t0 = tdToday(now);
  return tdSort(todos.filter(t => !t.done && t.due && t.due <= t0));
}
// 주간 실적 초안에 넣을 줄
export function tdWeeklyLines(todos = [], from = '', to = '') {
  const f = tdIso(from), e = tdIso(to);
  const done = todos.filter(t => t.done && t.doneDate && (!f || t.doneDate >= f) && (!e || t.doneDate <= e));
  if (!done.length) return [];
  const lines = [`○ 처리한 할 일 ${done.length}건`];
  for (const t of tdSort(done).slice(0, 15)) {
    const b = t.meta && t.meta.b;
    lines.push(`  - ${t.title}${b && b.c ? ` (${b.n || b.c} ${tdWon(b.a)}원)` : ''}`);
  }
  if (done.length > 15) lines.push(`  - 외 ${done.length - 15}건`);
  return lines;
}
// "11/25", "2026-11-25", "내일", "모레", "다음주 월요일", "금요일" → ISO. 비우면 ''. 못 읽으면 null.
export function tdParseDue(s, now = new Date()) {
  const v = String(s || '').trim();
  if (!v) return '';
  const t0 = tdToday(now), n0 = tdDayNum(t0), y0 = Number(t0.slice(0, 4));
  if (/^오늘$/.test(v)) return t0;
  if (/^내일$/.test(v)) return tdFromNum(n0 + 1);
  if (/^모레$/.test(v)) return tdFromNum(n0 + 2);
  let m = v.match(/^(다음\s*주|이번\s*주)?\s*([일월화수목금토])요일?$/);
  if (m) {
    const want = TD_WD.indexOf(m[2]), w0 = new Date(t0 + 'T00:00:00Z').getUTCDay();
    if (m[1] && /다음/.test(m[1])) { const mon = n0 - ((w0 + 6) % 7) + 7; return tdFromNum(mon + ((want + 6) % 7)); }
    if (m[1]) { const mon = n0 - ((w0 + 6) % 7); return tdFromNum(mon + ((want + 6) % 7)); }
    let d = (want - w0 + 7) % 7; if (d === 0) d = 7; return tdFromNum(n0 + d);
  }
  m = v.match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?$/) || v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) { const iso = `${m[1]}-${tdPad(m[2])}-${tdPad(m[3])}`; return tdValidIso(iso) ? iso : null; }
  m = v.match(/^(\d{1,2})\s*[/.월-]\s*(\d{1,2})\s*일?\.?$/);
  if (m) {
    let iso = `${y0}-${tdPad(m[1])}-${tdPad(m[2])}`;
    if (!tdValidIso(iso)) return null;
    if (tdDayNum(iso) < n0 - 60) iso = `${y0 + 1}-${tdPad(m[1])}-${tdPad(m[2])}`; // 두 달 넘게 지난 날짜면 내년으로 본다
    return tdValidIso(iso) ? iso : null;
  }
  return null;
}

// ---------- 예산 집행 계획 ----------
export const bpNormName = s => String(s || '').replace(/[\s·・‧ㆍ○●\-_]/g, '').replace(/^20\d\d년?/, '').toLowerCase();
export const bpLedgerKey = r => `${String(r.date || '').replace(/[^0-9]/g, '')}|${Math.round(Number(r.amount) || 0)}|${bpNormName(r.desc).slice(0, 16)}`;
const BP_STOP = new Set(['지급', '집행', '결의', '운영', '계획', '사업', '참석', '관련', '경비', '비용', '청소년', '청년', '부천', '재단', '지원', '위한', '프로그램', '참가', '운영비', '회의']);
const bpTokens = s => [...new Set(String(s || '').replace(/[『』「」()（）\[\]“”"'‘’·,.:~\-–/<>]/g, ' ').split(/\s+/).map(w => w.replace(/(을|를|의|및|에|와|과)$/, '')).filter(w => w.length >= 2 && !BP_STOP.has(w) && !/^\d+(년|월|일|차|회|기|명)?$/.test(w)))];
const bpOverlap = (a, b) => { const B = new Set(bpTokens(b)); return bpTokens(a).filter(w => B.has(w) || [...B].some(x => x.length >= 3 && w.length >= 3 && (x.includes(w) || w.includes(x)))).length; };

// 계획서 본문에서 금액·세목 이름·행사일
export function bpParsePlanDoc(doc = {}) {
  const body = String(doc.body || '').replace(/\r\n/g, '\n');
  let amount = 0;
  const am = body.match(/(?:소요\s*예산|예\s*산\s*액|사업비|소요\s*금액)\s*[:：]\s*(?:총\s*)?금?\s*([\d,]+)\s*원/);
  if (am) amount = Number(am[1].replace(/,/g, '')) || 0;
  const subjects = [];
  const sm = body.match(/예산\s*과목\s*[:：]\s*([^\n]+)/);
  if (sm) for (const part of sm[1].split(/부기\)/).slice(1)) { const name = part.replace(/(편성목|통계목|정책|단위|세부)\).*$/, '').trim(); if (name) subjects.push(name); }
  let eventDate = '';
  const dm = body.match(/(?:운영|참가|행사|교육|회의|추진)?\s*(?:일시|일정|기간)\s*[:：]\s*(\d{4})\s*[.\-]\s*(\d{1,2})\s*[.\-]\s*(\d{1,2})/);
  if (dm) { const iso = `${dm[1]}-${tdPad(dm[2])}-${tdPad(dm[3])}`; if (tdValidIso(iso)) eventDate = iso; }
  return {docNo: String(doc.docNo || ''), title: String(doc.title || '').trim(), date: tdIso(doc.date), amount, subjects, eventDate};
}
// 부기 이름 → 세목 코드 (rows: 세 단계 행 {code, name})
export function bpMapSubjects(names = [], rows = []) {
  const out = [];
  for (const n of names) {
    const k = bpNormName(n);
    if (!k) continue;
    const hit = rows.find(r => bpNormName(r.name) === k) || rows.find(r => { const rn = bpNormName(r.name); return rn.length >= 4 && (rn.includes(k) || k.includes(rn)); });
    if (hit && !out.includes(hit.code)) out.push(hit.code);
  }
  return out;
}
// 계획 한 건(정규화된 할 일)에 대한 결의 짝 후보. claimed: 이미 다른 계획이 가진 결의 키 Set.
export function bpSuggest(plan, ledger = [], claimed = new Set()) {
  const b = plan && plan.meta && plan.meta.b;
  if (!b || !b.c || b.st === 'done') return null;
  const mine = new Set([...(Array.isArray(b.m) ? b.m : []).map(x => x.k), ...(Array.isArray(b.x) ? b.x : [])]); // x: 사용자가 '아니에요'로 뺀 결의
  const remain = Math.max(0, Math.round(Number(b.a) || 0) - (Array.isArray(b.m) ? b.m : []).reduce((s, x) => s + (Number(x.a) || 0), 0));
  if (remain <= 0) return null;
  const since = b.pdDate || plan.created || '';
  const sinceN = since ? tdDayNum(since) - 3 : -Infinity;
  const text = `${plan.title} ${b.pt || ''}`;
  const cands = [];
  for (const r of ledger) {
    if (String(r.code) !== String(b.c)) continue;
    const k = bpLedgerKey(r), d = tdIso(r.date), a = Math.round(Number(r.amount) || 0);
    if (!d || a <= 0 || claimed.has(k) || mine.has(k) || tdDayNum(d) < sinceN) continue;
    const ov = Math.min(3, bpOverlap(text, r.desc));
    let score = ov;
    if (a === remain) score += 3; else if (a <= remain) score += 1; else if (a > remain * 1.05) continue;
    if (b.d && Math.abs(tdDayNum(d) - tdDayNum(b.d)) <= 14) score += 1;
    cands.push({k, d, a, desc: String(r.desc || ''), docNo: String(r.docNo || ''), score, ov});
  }
  cands.sort((x, y) => y.score - x.score || x.d.localeCompare(y.d));
  const best = cands[0];
  if (!best || best.score < 3) return null;
  if (best.a === remain) return {rows: [best], sum: best.a, remain, full: true, score: best.score};
  // 같은 낱말을 가진 여러 결의를 합쳐 남은 금액 이하로 묶는다
  const rows = [], pool = cands.filter(c => c.ov >= 1 || c === best).sort((x, y) => x.d.localeCompare(y.d));
  let sum = 0;
  for (const c of pool) if (sum + c.a <= remain * 1.05) { rows.push(c); sum += c.a; }
  if (!rows.length) return null;
  return {rows, sum, remain, full: sum >= remain * 0.95, score: best.score};
}
// 계획서 후보: 올해 내 계획서 중 담당 항의 세목을 쓰고 아직 결의되지 않은 금액이 남은 것
// stale: 행사(없으면 결재일)가 30일 넘게 지났고 일부라도 결의된 계획서 — 남은 금액은 집행 잔액일 가능성이 커서 후보에서 내린다.
// code: 기본으로 고를 세목(아직 결의가 없는 세목 우선).
export function bpPlanCandidates({docs = [], rows = [], ledger = [], taken = [], year = 0, claimed = new Set(), now = new Date()} = {}) {
  const t0n = tdDayNum(tdToday(now));
  const se = rows.filter(r => r.level === '세');
  const takenSet = new Set(taken);
  const out = [];
  for (const d of docs) {
    const title = String(d.title || '').trim();
    if (!/계획(\s*\((안|변경)\))?$/.test(title) || /결과/.test(title)) continue;
    const p = bpParsePlanDoc(d);
    if (year && p.date && Number(p.date.slice(0, 4)) !== year) continue;
    if (!p.amount || !p.subjects.length) continue;
    const codes = bpMapSubjects(p.subjects, se);
    if (!codes.length) continue;
    const pdN = p.date ? tdDayNum(p.date) - 3 : -Infinity;
    const used = ledger.filter(r => codes.includes(String(r.code)) && !claimed.has(bpLedgerKey(r)) && tdIso(r.date) && tdDayNum(tdIso(r.date)) >= pdN && bpOverlap(title, r.desc) >= 1);
    const spent = used.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const remain = Math.max(0, p.amount - spent);
    const ref = p.eventDate || p.date;
    const stale = !!(spent > 0 && ref && t0n - tdDayNum(ref) > 30);
    const code = codes.find(cd => !used.some(r => String(r.code) === cd)) || codes[0];
    out.push({...p, codes, code, names: codes.map(c => (se.find(r => r.code === c) || {}).name || c), spent, remain, stale, used: used.map(r => ({d: tdIso(r.date), a: Number(r.amount) || 0, desc: String(r.desc || ''), code: String(r.code)})), taken: takenSet.has(p.docNo)});
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
// 예상 집행률. rows: 예실대비(세 단계 포함), plans: 예산 정보가 붙은 할 일, pending: {planId: 짝 후보 합계}
export function bpForecast({rows = [], plans = [], pending = {}, target = 100, closeDate = '', now = new Date()} = {}) {
  const t0 = tdToday(now), y = t0.slice(0, 4), close = tdValidIso(closeDate) ? closeDate : `${y}-12-31`;
  const se = rows.filter(r => r.level === '세');
  const by = new Map(se.map(r => [String(r.code), {code: String(r.code), name: String(r.name || '').replace(/^[○●·\s]+/, ''), budget: Number(r.budget) || 0, executed: Number(r.executed) || 0, planned: 0, pending: 0, open: 0}]));
  const warn = [], items = [];
  for (const p of plans) {
    const b = p.meta && p.meta.b;
    if (!b || !b.c) continue;
    const matched = (Array.isArray(b.m) ? b.m : []).reduce((s, x) => s + (Number(x.a) || 0), 0);
    // 할 일만 끝냄으로 표시하고 결의를 아직 확인하지 않은 계획은 '결의 대기'로 예상에 남긴다(결의 반영 전 공백 방지).
    const live = b.st !== 'done' && b.st !== 'drop';
    const remain = live ? Math.max(0, Math.round(Number(b.a) || 0) - matched) : 0;
    const pend = live ? Math.min(remain, Math.max(0, Number(pending[p.id]) || 0)) : 0;
    const eff = remain - pend;
    const row = by.get(String(b.c));
    const item = {id: p.id, title: p.title, code: String(b.c), name: b.n || (row && row.name) || b.c, amount: Math.round(Number(b.a) || 0), matched, remain, pending: pend, eff, date: b.d || p.due || '', state: !live ? (b.st === 'drop' ? 'drop' : 'done') : pend ? 'check' : p.done ? 'wait' : 'plan', pd: b.pd || '', known: !!row};
    items.push(item);
    if (!row) { if (live) warn.push({kind: 'nosubject', id: p.id, text: `“${p.title}”의 세목(${b.c})이 이 사업에 없습니다`}); continue; }
    row.planned += eff; row.pending += pend; if (live) row.open++;
    if (live && !p.done && item.date && item.date < t0 && !pend) warn.push({kind: 'late', id: p.id, text: `“${p.title}” 예정일(${tdMd(item.date)})이 지났는데 결의가 없습니다`});
    if (live && !p.done && item.date && item.date > close) warn.push({kind: 'afterclose', id: p.id, text: `“${p.title}” 예정일이 마감(${tdMd(close)}) 뒤입니다`});
  }
  const subjects = [...by.values()].map(r => {
    const forecast = r.executed + r.planned;
    const over = forecast - r.budget;
    if (over > 0 && r.planned > 0) warn.push({kind: 'over', code: r.code, text: `${r.name}: 계획이 예산보다 ${tdWon(over)}원 많습니다`});
    return {...r, forecast, rate: r.budget ? r.executed / r.budget * 100 : 0, forecastRate: r.budget ? forecast / r.budget * 100 : 0, unplanned: Math.max(0, r.budget - forecast)};
  });
  const sum = k => subjects.reduce((s, r) => s + r[k], 0);
  const budget = sum('budget'), executed = sum('executed'), planned = sum('planned'), forecast = executed + planned;
  const goal = budget * (Number(target) || 100) / 100;
  return {
    budget, executed, planned, pending: sum('pending'), forecast, rate: budget ? executed / budget * 100 : 0, forecastRate: budget ? forecast / budget * 100 : 0,
    target: Number(target) || 100, goal, gap: goal - forecast, close, subjects, items: items.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999'))), warnings: warn,
  };
}
// 월별 누계: monthly[i] = i+1월 집행액. 예상선은 이번 달 결의 누계에서 출발해, 남은 계획을 예정월에 더한다.
// 이번 달까지(지난 예정 포함)의 계획은 다음 달 점에 반영한다(12월이면 12월 점).
export function bpProjection({monthly = [], items = [], budget = 0, target = 100, now = new Date()} = {}) {
  const t0 = tdToday(now), mNow = Number(t0.slice(5, 7)), y = t0.slice(0, 4);
  const plan = Array(12).fill(0);
  for (const it of items) {
    if (it.state === 'done' || it.state === 'drop' || !(it.eff > 0)) continue;
    let mo = it.date && it.date.slice(0, 4) === y ? Number(it.date.slice(5, 7)) : mNow;
    if (it.date && it.date.slice(0, 4) > y) continue;
    if (mo <= mNow) mo = Math.min(12, mNow + 1);
    plan[mo - 1] += it.eff;
  }
  const actual = [], projected = [];
  let a = 0, p = 0;
  for (let i = 0; i < 12; i++) {
    a += Number(monthly[i]) || 0;
    actual.push(i < mNow ? a : null);
    if (i === mNow - 1) p = a + (mNow === 12 ? plan[i] : 0); else if (i >= mNow) p += plan[i];
    projected.push(i >= mNow - 1 ? p : null);
  }
  const goalLine = budget * (Number(target) || 100) / 100;
  return {actual, projected, plan, goal: goalLine, budget, month: mNow};
}
