// GW 비서 · 그룹웨어 → 구글 캘린더 동기화 계획(순수 함수). 스킬 bwyf-gcal-sync의 원칙을 코드로 옮긴 것이다.
//  - 레이어 격리: 근태 → "5 BWYF 근태", 문서에서 읽은 기한 → "4 BWYF 개인". (부서 행사·메신저 일정은 원문 확인이 필요해 자동 계획에서 제외)
//  - 결재완료 건만 등록 후보. 결재 중인 건은 보류. 추측으로 만든 일정은 없다(모든 후보는 그룹웨어의 실제 신청·문서에서 나온다).
//  - 메모 서식: 근태 "{결재문서제목}, {문서번호}\n- 출장목적/근무내용/휴고사유: …", 그 밖은 출처 메타데이터 표준.
//  - 등록은 사용자가 구글 일정 작성 화면에서 [저장]을 직접 누른다(사전 승인 원칙). 이 모듈은 URL과 메모를 만들 뿐이다.
// briefing.mjs 뒤에 이어 붙어 한 범위로 번들되므로 import 금지, 비공개 이름은 gs 접두, 내보내기 이름은 gsyncXxx.
export const GSYNC_VERSION = 1;

export const GSYNC_LAYERS = {attend: '5 BWYF 근태', personal: '4 BWYF 개인', dept: '3 BWYF 부서'};
const gsDow = ymd => '일월화수목금토'[new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8))).getUTCDay()];
const gsDash = ymd => `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}(${gsDow(ymd)})`;
const gsPlus = (ymd, n) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + n)).toISOString().slice(0, 10).replace(/-/g, '');
const gsValidYmd = s => /^\d{8}$/.test(String(s || '')) && gsPlus(String(s), 0) === String(s);
const gsValidTm = s => /^\d{4}$/.test(String(s || '')) && (+String(s).slice(0, 2) < 24 || String(s) === '2400') && +String(s).slice(2) < 60;
const gsHm = s => `${s.slice(0, 2)}:${s.slice(2)}`;
const gsOne = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/** 근태 항목명 → 종류. 일정이 아닌 항목은 ''. */
export function gsyncKind(atNm) {
  const n = String(atNm || '');
  if (/출장|사외교육|교육/.test(n)) return 'trip';
  if (/연장근무|휴일근무|조기근무|시간외|근무일대체|휴일대체/.test(n)) return 'ot';
  if (/휴가|연차|반차|병가|공가|대체|보상|외출|조퇴/.test(n)) return 'leave';
  return '';
}
const GS_REASON_LABEL = {trip: '출장목적', ot: '근무내용', leave: '휴고사유'}; // 스킬 표준 표기(‘휴고사유’)를 그대로 따른다

/** 시간 표기 (8, 3.5 …) : 신청 시간(분) → 없으면 시작·종료 → 없으면 일수×8 */
export function gsyncHours(a) {
  let min = Number(a.appTm);
  if (!(min > 0) && gsValidTm(a.startTm) && gsValidTm(a.endTm) && !(a.startTm === '0000' && a.endTm === '0000')) { const s = +a.startTm.slice(0, 2) * 60 + +a.startTm.slice(2), e = +a.endTm.slice(0, 2) * 60 + +a.endTm.slice(2); min = e > s ? e - s : e + 1440 - s; }
  if (!(min > 0)) min = (Number(a.appDy) > 0 ? Number(a.appDy) : 1) * 480;
  const h = Math.round(min / 30) / 2;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/** 일정명: 사용자의 실제 구글 캘린더 관례를 따른다 — 출장 관내출장(8), 시간외 시간외(3)·시간외(보상3), 휴일근무(8), 외출(3)·조퇴(2)·오전반차(4), 그 밖의 휴가는 이름만(대체휴가). */
export function gsyncTitle(a, kind) {
  const n = String(a.atNm || ''), h = gsyncHours(a), comp = /보상/.test(n);
  if (kind === 'trip') return `${n}(${h})`;
  if (kind === 'ot') return /휴일근무|근무일대체|휴일대체/.test(n) ? `휴일근무(${comp ? '보상' : ''}${h})` : `시간외(${comp ? '보상' : ''}${h})`;
  if (/외출|조퇴/.test(n)) return `${n}(${h})`;
  if (/반차/.test(n)) return `${n.replace(/\(보상\)/, '')}(${h})`;
  return n;
}

/** 구글 일정 작성 주소의 dates 값. 하루 안의 시간 지정은 로컬 타임스탬프, 그 밖은 종일(종료일 다음 날). */
export function gsyncDates(startYmd, endYmd, startTm, endTm) {
  const s = String(startYmd), e = String(endYmd || startYmd);
  if (!gsValidYmd(s) || !gsValidYmd(e) || e < s) return null;
  if ((startTm && (!gsValidTm(startTm) || startTm === '2400')) || (endTm && !gsValidTm(endTm))) return null;
  const timed = s === e && gsValidTm(startTm) && gsValidTm(endTm) && !(startTm === '0000' && endTm === '0000') && startTm !== endTm;
  if (!timed) return {allDay: true, dates: `${s}/${gsPlus(e, 1)}`};
  const next = endTm <= startTm || endTm === '2400';
  const endDay = next ? gsPlus(s, 1) : s, et = endTm === '2400' ? '0000' : endTm;
  return {allDay: false, dates: `${s}T${startTm}00/${endDay}T${et}00`};
}

export function gsyncAttendMemo(a, kind) {
  const m = String(a.startDt || '').slice(4, 6), d = String(a.startDt || '').slice(6, 8);
  const title = gsOne(a.title) || `(${m}-${d})${a.atNm}(${a.korNm || ''})`;
  const head = a.noDoc ? `${title}, ${a.noDoc}` : title;
  const reason = gsOne(a.reason);
  const lines = [head];
  if (reason) lines.push(`- ${GS_REASON_LABEL[kind]}: ${reason}`);
  if (kind === 'trip' && gsOne(a.place)) lines.push(`- 행선지: ${gsOne(a.place)}`);
  return lines.join('\n');
}

export function gsyncDeadlineMemo(d, now = new Date()) {
  const ymd = String(d.date || '').replace(/-/g, '');
  const k = new Date(now.getTime() + 9 * 3600000).toISOString();
  return [`[일정/업무 상세 안내]`, `• 일정명: ${gsOne(d.title)}`, `• 일시: ${gsDash(ymd)}${d.time ? ' ' + d.time : ''}`, '', `[출처 메타데이터]`, `• 출처 시스템: 그룹웨어 ${gsOne(d.source) || '문서'}`, `• 출처 세부정보: ${gsOne(d.title).slice(0, 80)}`, `• 확인/확정 일시: ${k.slice(0, 10).replace(/-/g, '.')} ${k.slice(11, 16)}`, `• 안내: 문서에서 읽은 기한입니다. 원문을 확인한 뒤 등록하세요.`].join('\n');
}

/** 상태 결정: 사용자가 표시했거나 구글에서 확인되면 synced, 비슷한 일정이 있으면 similar, 대조했는데 없으면 ready, 대조 전이면 unverified. */
function gsyncSettle(ev, synced, existing, ready) {
  if (!ready) { ev.state = 'hold'; return; }
  if (synced[ev.key]) { ev.state = 'synced'; ev.verified = 'user'; return; }
  const m = gsyncMatch(ev, existing);
  ev.match = m;
  ev.state = m.level === 'exact' ? 'synced' : m.level === 'similar' ? 'similar' : m.level === 'none' ? 'ready' : 'unverified';
  if (m.level === 'exact') ev.verified = 'google';
}

/** 캘린더 설정 목록에서 레이어 이름에 맞는 항목을 찾는다. */
export function gsyncCalendarId(cals, layerName) {
  const bare = String(layerName).replace(/^\d+\s*/, '');
  const hit = (Array.isArray(cals) ? cals : []).find(c => c && c.id && (String(c.name || '') === layerName || String(c.name || '').includes(layerName) || (bare && String(c.name || '').includes(bare))));
  return hit ? hit.id : '';
}

/** 구글 일정 작성 화면 주소(저장은 사용자가 직접). calId가 있으면 그 캘린더가 미리 선택되도록 src를 붙인다. */
export function gsyncUrl(ev, calId = '') {
  const q = [`text=${encodeURIComponent(ev.title)}`, `dates=${ev.dates}`, `details=${encodeURIComponent(ev.details || '')}`];
  if (ev.location) q.push(`location=${encodeURIComponent(ev.location)}`);
  q.push('ctz=Asia%2FSeoul');
  if (calId) q.push(`src=${encodeURIComponent(calId)}`);
  return 'https://calendar.google.com/calendar/u/0/r/eventedit?' + q.join('&');
}

// ---------------------------------------------------------------------------
// 구글 캘린더 대조: 구글 캘린더의 "일 보기"에서 읽은 일정 문장을 기록으로 바꾸고, 그룹웨어 후보와 맞춰 본다.
// (월 보기는 칸마다 일정이 가려져 누락되므로 후보 날짜의 일 보기만 근거로 삼는다.)
// ---------------------------------------------------------------------------
export function gsyncKindOfTitle(title) {
  const t = String(title || '');
  if (/출장|교육/.test(t)) return 'trip';
  if (/시간외|휴일근무|연장근무|조기근무/.test(t)) return 'ot';
  if (/휴가|연차|반차|외출|조퇴|대체휴일|공가|특별휴가|보상/.test(t)) return 'leave';
  return '';
}
/** 일 보기 일정 한 건의 문장 → {date, cal, title, from, to}. 일정이 아닌 문장(할 일 등)은 null. */
export function gsyncParseDayText(text, ymd) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || /^할 일|, 완료됨,|, 완료되지 않음,/.test(t) || /^cake /.test(t)) return null;
  t = t.replace(/^\d{4}년 \d{1,2}월 \d{1,2}일 \d{2}:\d{2}~\d{4}년 \d{1,2}월 \d{1,2}일 \d{2}:\d{2}, /, '');
  const m = t.match(/^(?:(\d{2}:\d{2})(?:~(\d{2}:\d{2}))?, )?(.+?), (?:캘린더: )?([^,]+), 위치(?: 없음|:)/);
  if (!m) return null;
  let title = m[3].trim();
  const dup = title.match(/^(.+?) 종일, (.+)$/); // 종일 일정은 "제목 종일, 제목" 꼴로 읽힌다
  if (dup && dup[1] === dup[2]) title = dup[1];
  title = title.replace(/, 종일$/, '').replace(/ 종일$/, '');
  if (!title) return null;
  return {date: String(ymd), cal: m[4].trim(), title, from: m[1] || '', to: m[2] || ''};
}
export function gsyncNormalizeExisting(payload) {
  const days = (payload && payload.days) || {}, records = [], dates = [];
  for (const [d, list] of Object.entries(days)) {
    if (!gsValidYmd(d)) continue;
    dates.push(d);
    for (const x of Array.isArray(list) ? list : []) { const r = typeof x === 'string' ? gsyncParseDayText(x, d) : (x && x.title ? {date: d, cal: String(x.cal || ''), title: String(x.title), from: String(x.from || ''), to: String(x.to || '')} : null); if (r) records.push(r); }
  }
  return {at: Number(payload && payload.at) || Date.now(), dates: dates.slice(0, 500), records: records.slice(0, 5000)};
}
const gsDays = (s, e) => { const out = []; for (let d = String(s); d <= String(e) && out.length < 40; d = gsPlus(d, 1)) out.push(d); return out; };
/** 대조해야 할 날짜(후보들의 모든 날). 이 날짜들의 일 보기를 읽어 gsyncNormalizeExisting에 넣는다. */
export function gsyncNeedDates(items) { return [...new Set((items || []).filter(i => i.state !== 'hold').flatMap(i => gsDays(i.startYmd, i.endYmd)))].sort(); }
const gsMin = hm => (/^\d{2}:\d{2}$/.test(hm || '') ? +hm.slice(0, 2) * 60 + +hm.slice(3) : null);
/**
 * 후보 하나를 대조한다. 반환 level: 'exact'(해당 레이어에 같은 종류·시간의 일정) | 'similar'(다른 캘린더나 다른 이름으로 같은 시간·종류) | 'none' | 'unknown'(그 날을 읽지 않음)
 */
export function gsyncMatch(item, existing) {
  if (!existing || !Array.isArray(existing.dates) || !existing.dates.length) return {level: 'unknown'};
  const days = gsDays(item.startYmd, item.endYmd);
  if (!days.every(d => existing.dates.includes(d))) return {level: 'unknown'};
  const recs = (existing.records || []).filter(r => days.includes(r.date));
  const bare = String(item.layer).replace(/^\d+\s*/, '').replace(/^BWYF\s*/, '');
  const inLayer = r => r.cal && (r.cal.includes(item.layer) || r.cal.includes(bare));
  const [is, ie] = String(item.time || '').split('~').map(gsMin);
  const timeOk = r => { if (is === null || !r.from) return true; const rs = gsMin(r.from), re = gsMin(r.to); return rs === is || (re !== null && ie !== null && rs < ie && re > is); };
  const timeSame = r => is !== null && gsMin(r.from) === is && (ie === null || !r.to || gsMin(r.to) === ie);
  if (item.source === 'deadline') {
    const core = String(item.title).replace(/^\[마감\]\s*/, '').replace(/\s+/g, '').slice(0, 10);
    const has = r => core.length >= 4 && String(r.title).replace(/\s+/g, '').includes(core);
    const e = recs.find(r => inLayer(r) && has(r)); if (e) return {level: 'exact', title: e.title, cal: e.cal};
    const s = recs.find(has); return s ? {level: 'similar', title: s.title, cal: s.cal} : {level: 'none'};
  }
  const ex = recs.find(r => inLayer(r) && gsyncKindOfTitle(r.title) === item.kind && timeOk(r));
  if (ex) return {level: 'exact', title: ex.title, cal: ex.cal};
  const sim = recs.find(r => (gsyncKindOfTitle(r.title) === item.kind && timeOk(r) && gsyncKindOfTitle(r.title)) || (inLayer(r) && timeSame(r)));
  return sim ? {level: 'similar', title: sim.title, cal: sim.cal} : {level: 'none'};
}

/**
 * 동기화 계획. 입력은 이미 읽어 둔 그룹웨어 자료뿐이다(네트워크·DOM 접근 없음).
 * synced: {key: 시각} 사용자가 "올렸다"고 표시한 것. 반환 items는 날짜순.
 */
export function gsyncPlan({apps = [], me = '', deadlines = [], cals = [], synced = {}, existing = null, now = new Date(), sinceDays = 30} = {}) {
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
  const since = gsPlus(today, -Math.abs(sinceDays));
  const items = [], seen = new Set();
  for (const a of Array.isArray(apps) ? apps : []) {
    if (!a || !me || String(a.empCd) !== String(me)) continue;
    if (a.deleteReqYn === 'Y' || a.docdelYn === 'N') continue;
    const kind = gsyncKind(a.atNm);
    if (!kind) continue;
    const s = String(a.startDt || ''), e = String(a.endDt || a.startDt || '');
    const dt = gsyncDates(s, e, a.startTm, a.endTm);
    if (!dt || e < since) continue;
    const key = `gs:${a.noDoc || a.appDt + '-' + a.appSq}:${s}:${a.atNm}`;
    if (seen.has(key)) continue; seen.add(key);
    const ready = String(a.approState) === '1';
    const layer = GSYNC_LAYERS.attend;
    const ev = {key, source: 'attend', kind, layer, calId: gsyncCalendarId(cals, layer), title: gsyncTitle(a, kind), startYmd: s, endYmd: e, allDay: dt.allDay, dates: dt.dates, time: dt.allDay ? '' : `${gsHm(a.startTm)}~${gsHm(a.endTm)}`, location: kind === 'trip' ? gsOne(a.place) : '', details: gsyncAttendMemo(a, kind), docNo: a.noDoc || '', pending: !ready, label: a.atNm};
    gsyncSettle(ev, synced, existing, ready);
    items.push(ev);
  }
  for (const d of Array.isArray(deadlines) ? deadlines : []) {
    const ymd = String((d && d.date) || '').replace(/-/g, '');
    if (!d || !d.title || !gsValidYmd(ymd) || ymd < since) continue;
    const key = `gs:dl:${d.key || gsOne(d.title).slice(0, 40)}:${ymd}`;
    if (seen.has(key)) continue; seen.add(key);
    const tm = /^(\d{2}):(\d{2})$/.test(d.time || '') ? d.time.replace(':', '') : '';
    const endTm = tm ? (+tm.slice(0, 2) * 60 + +tm.slice(2) + 30 >= 1440 ? '2359' : String(Math.floor((+tm.slice(0, 2) * 60 + +tm.slice(2) + 30) / 60)).padStart(2, '0') + String((+tm.slice(0, 2) * 60 + +tm.slice(2) + 30) % 60).padStart(2, '0')) : '';
    const dt = gsyncDates(ymd, ymd, tm, endTm);
    if (!dt) continue;
    const layer = GSYNC_LAYERS.personal;
    items.push({key, source: 'deadline', kind: 'deadline', layer, calId: gsyncCalendarId(cals, layer), title: `[마감] ${gsOne(d.title).slice(0, 80)}`, startYmd: ymd, endYmd: ymd, allDay: dt.allDay, dates: dt.dates, time: dt.allDay ? '' : `${tm.slice(0, 2)}:${tm.slice(2)}`, location: '', details: gsyncDeadlineMemo(d, now), docNo: '', pending: false, label: '마감'});
    gsyncSettle(items[items.length - 1], synced, existing, true);
  }
  for (const ev of items) {
    if (ev.source !== 'attend' || ev.verified !== 'google') continue;
    if (items.some(other => other !== ev && !other.pending && other.source === 'attend' && other.layer === ev.layer && other.kind === ev.kind && other.startYmd === ev.startYmd && other.endYmd === ev.endYmd && other.time === ev.time)) { ev.state = 'similar'; ev.match = {...ev.match, level: 'similar'}; delete ev.verified; }
  }
  items.sort((x, y) => x.startYmd.localeCompare(y.startYmd) || x.title.localeCompare(y.title, 'ko'));
  const counts = {ready: 0, hold: 0, synced: 0, similar: 0, unverified: 0};
  for (const i of items) counts[i.state]++;
  return {items, counts, today, compared: !!(existing && existing.dates && existing.dates.length), comparedAt: existing ? existing.at || 0 : 0};
}
