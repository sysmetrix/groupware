// GW 비서 · 자원 예약 및 오늘 타임라인 순수 모델
// 브라우저 번들(scripts/live-build.mjs)과 Node ESM 테스트 양쪽에서 외부 import 없이 동작한다.

const resKst = (now = new Date()) => { const d = new Date(now.getTime() + 9 * 3600000); return {date: d.toISOString().slice(0, 10), hh: d.getUTCHours(), mm: d.getUTCMinutes()}; };
const resValidYmd = s => { const t = String(s || '').replace(/\D/g, ''); if (t.length !== 8) return false; const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6))); return d.toISOString().slice(0, 10).replace(/-/g, '') === t; };
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
  if (!resValidYmd(String(date).replace(/-/g, ''))) errors.push('날짜를 선택하세요');
  const hmOk = s => /^([01]\d|2[0-3]):?[0-5]\d$/.test(String(s || ''));
  const a = hmOk(start) ? toMin(start) : null, z = hmOk(end) ? toMin(end) : null;
  if (a === null || z === null) errors.push('시작·종료 시각을 선택하세요');
  else if (z <= a) errors.push('종료 시각이 시작보다 뒤여야 합니다');
  else if (limitMin > 0 && z - a > limitMin) errors.push(`최대 ${limitMin / 60}시간까지만 예약할 수 있습니다`);
  const k = resKst(now), today = k.date.replace(/-/g, ''), d8 = String(date).replace(/-/g, '');
  if (a !== null && (d8 < today || (d8 === today && a < k.hh * 60 + k.mm))) errors.push('이미 지난 시각은 예약할 수 없습니다');
  return {ok: errors.length === 0, errors, start12: d8 + String(start).replace(':', ''), end12: d8 + String(end).replace(':', '')};
}

// v1.26 자원 예약: 상태 이름(그룹웨어 자원 화면과 같은 말), 차량 먼저, 기본 시간, 겹침 확인
const RES_STATUS = {RE: ['승인 대기', 'todo'], '10': ['승인 대기', 'todo'], CO: ['승인 완료', 'ok'], '20': ['승인 완료', 'ok'], RC: ['예약 완료', 'ok'], RJ: ['반려', 'urgent'], CR: ['승인 취소', 'muted'], CA: ['취소', 'muted'], AC: ['자동 취소', 'muted']};
export function resStatusLabel(code) { const x = RES_STATUS[String(code || '').trim()]; return x ? {label: x[0], tone: x[1]} : {label: '', tone: ''}; }
/** 자원 목록: 차량(속성·이름에 '차량')을 맨 앞에, 나머지는 그룹웨어 순서 그대로. */
export function resSortList(list = []) {
  const car = r => /차량/.test(`${(r && r.attr) || ''} ${(r && r.name) || ''}`);
  return (Array.isArray(list) ? list : []).map((r, i) => ({r, i})).sort((a, b) => (car(b.r) - car(a.r)) || a.i - b.i).map(x => x.r);
}
// v1.28 자원 종류: 비서의 현황 조회(get_resource_status)와 예약 준비(reserve_vehicle)가 함께 쓰는 한 기준.
// 말과 자원 모두 LED → 회의실 → 차량 순서로 본다. 장비·소모품 이름(빔프로젝터·화상회의 장비·하이패스 카드·블랙박스)은 어느 종류도 아니다.
const RES_KIND = {led: [/LED|패널|전광판/i, 'LED 패널'], room: [/회의실|회의|세미나|강당|교육장|강의실/, '회의실'], car: [/차량|관용|니로|승용|승합|자동차|마이크로버스|카니발|스타리아|스타렉스|아반떼|쏘나타|그랜저|아이오닉|쏘렌토|싼타페|봉고|전기차|화물차|버스|트럭/, '차량']};
const RES_KINDS = ['led', 'room', 'car'];
const RES_GEAR = /(?:회의|차량)용|프로젝터|빔|장비|카드|블랙박스|노트북|카메라|마이크(?!로)|스피커|충전기|하이패스|내비|열쇠/;
const RES_FULL = /회의실|세미나실|강당|교육장|강의실|차량|승합차|승용차|자동차|버스/;
// 장비 이름인지. 괄호 안 설명(대회의실(빔프로젝터)·관용차량(니로, 내비))은 보지 않고, 회의실·차량 같은 말이 장비 말보다 앞에 있으면 장비가 아니다(회의용·차량용은 장비).
function resIsGear(name) {
  const n = String(name || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' '), g = n.match(RES_GEAR);
  if (!g) return false;
  if (/용$/.test(g[0])) return true;
  const full = n.match(RES_FULL);
  return !(full && full.index < g.index);
}
// 종류만 뜻하는 말(이름 단서가 아님): 차량·회의실·LED 패널 등. 승합차·강당·세미나실·니로처럼 좁은 말은 이름 단서로 쓴다.
const RES_GENERIC = /^(?:car|room|led|vehicle|meetingroom|차|차량|관용차|관용차량|공용차|공용차량|자동차|회의|회의실|회의공간|회의장소|세미나|교육|행사|업무|led패널|패널|전광판|자원|예약)$/i;
const resFlat = s => String(s || '').replace(/\s+/g, '').toLowerCase();
const resGeneric = s => RES_GENERIC.test(resFlat(s));
const resOwn = k => Object.prototype.hasOwnProperty.call(RES_KIND, k);
/** 말(kind 인자·자원 이름 단서) → 'led'|'room'|'car', 모르면 ''. */
export function resKindOfText(v) {
  const t = String(v || '').trim();
  if (resOwn(t)) return t;
  if (resIsGear(t)) return '';
  for (const k of RES_KINDS) if (RES_KIND[k][0].test(t)) return k;
  return /room/i.test(t) ? 'room' : /^(?:vehicle|차|\d+\s*인승)$/i.test(t) || /공용차/.test(t) ? 'car' : '';
}
// [종류, 이름으로 판정했는지]. 이름이 장비면 분류가 차량·회의실이어도 종류가 없다.
function resKindBy(r) {
  const name = String((r && r.name) || ''), attr = String((r && r.attr) || '');
  if (resIsGear(name)) return ['', false];
  for (const k of RES_KINDS) if (RES_KIND[k][0].test(name)) return [k, true];
  for (const k of RES_KINDS) if (RES_KIND[k][0].test(attr)) return [k, false];
  return ['', false];
}
/** 자원 하나의 종류. 이름이 먼저, 이름으로 모르면 자원 분류(attr). */
export function resKindOf(r) { return resKindBy(r)[0]; }
// name에 clue가 들어 있는지. 숫자는 앞뒤가 숫자가 아니어야 한다(1층 ≠ 11층, 상담실 1 ≠ 상담실 10).
function resHas(name, clue) {
  const n = resFlat(name), c = resFlat(clue), dg = ch => /\d/.test(ch || '');
  if (!c) return false;
  // 번호만 말한 단서(회의실 2의 2)는 층 번호(2층)에 맞지 않는다
  for (let i = n.indexOf(c); i >= 0; i = n.indexOf(c, i + 1)) if (!(dg(c[0]) && dg(n[i - 1])) && !(dg(c[c.length - 1]) && dg(n[i + c.length])) && !(/^\d+$/.test(c) && n[i + c.length] === '층')) return true;
  return false;
}
/** 이름 단서가 자원 이름에 맞는 정도: 3 이름 전체, 2 이어진 일부, 1 낱말마다(종류 말은 그 종류면 맞음), 0 안 맞음. */
export function resNameScore(r, clue) {
  const name = String((r && r.name) || ''), c = resFlat(clue);
  if (!c) return 0;
  if (resFlat(name) === c || resFlat(name.replace(/\s*\(.*$/, '')) === c) return 3;
  if (resHas(name, clue)) return 2;
  // 낱말마다: 2번·2호·제2는 2로도 본다(2번 회의실 → 회의실 2)
  const toks = String(clue).trim().split(/\s+/), alt = t => [t, t.replace(/^제(?=\d)/, '').replace(/(\d)\s*(?:번|호)$/, '$1')];
  return toks.length > 1 && toks.every(t => alt(t).some(w => resHas(name, w)) || (resGeneric(t) && resKindOfText(t) && resKindOfText(t) === resKindOf(r))) ? 1 : 0;
}
/**
 * v1.28 보수 규칙: 이름 단서가 자원 이름에 꼭 맞는지. 이름 전체와 같거나(공백·괄호 설명은 보지 않음),
 * 숫자가 없는 단서가 이름의 한 낱말과 그대로 같을 때만(승합차 → 업무용 승합차 (12가 3456)). 일부만 겹치면 맞지 않는다.
 */
export function resNameExact(r, clue) {
  const name = String((r && r.name) || ''), c = resFlat(clue), base = name.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  if (!c) return false;
  if (resFlat(name) === c || resFlat(base) === c) return true;
  return !/\d/.test(c) && base.split(/\s+/).some(w => w && resFlat(w) === c);
}
// 사용자 문장에서 이 자원들 가운데 일부만 꼭 맞게 가리키는 낱말(승합차 등). 이름 일부만 겹치는 낱말(니로 ↔ 관용차량(니로EV), 2층)이 있으면 unsure.
function resTextClues(of, text) {
  const out = [];
  let unsure = false;
  for (const raw of String(text || '').split(/[\s,.!?~·]+/)) {
    // 조사를 뗀 말과 그대로의 말을 함께 본다(니로 → 니로, 승합차로 → 승합차).
    const ws = [raw, raw.replace(/(?:에서|으로|하고|이랑|로|을|를|이|가|은|는|에|도|만|랑|와|과)$/, '')].filter(w => w.length >= 2 && !resGeneric(w) && !/\d\s*(?:시|분|월|일|:)|^\d+\/\d+$/.test(w));
    if (!ws.length || resGeneric(raw)) continue;
    const hit = of.filter(r => ws.some(w => resNameExact(r, w)));
    if (hit.length && hit.length < of.length) out.push(hit);
    else if (!hit.length && of.some(r => ws.some(w => resHas(r.name, w)))) unsure = true;
  }
  return {out, unsure};
}
/**
 * 요청한 종류의 자원을 고른다. kind: 'car'|'room'|'led'|그 밖의 말, hint: 자원 이름 단서, text: 사용자 문장.
 */
export function resPick(list = [], kind = '', hint = '', text = '', drop = []) {
  const dropC = (Array.isArray(drop) ? drop : []).map(c => String(c || '').trim()).filter(c => c && !resGeneric(c));
  const out = r => dropC.some(c => resNameScore(r, c) > 0);
  const all = Array.isArray(list) ? list.filter(r => r && typeof r === 'object') : [], excluded = all.filter(out), arr = all.filter(r => !out(r));
  const kw = String(kind || '').trim(), hw = String(hint || '').trim();
  const ofKind = k => arr.map((r, i) => ({r, i, by: resKindBy(r)})).filter(x => x.by[0] === k).sort((a, b) => (b.by[1] - a.by[1]) || a.i - b.i).map(x => x.r);
  let k = resKindOfText(kw || hw), label, of;
  const clues = [kw, hw].filter(c => c && !resGeneric(c) && !(c === kw && !k));
  if (k) { label = RES_KIND[k][1]; of = ofKind(k); }
  else if (kw) { const lit = resFlat(kw).slice(0, 20); label = kw.slice(0, 20); of = lit.length >= 2 ? arr.filter(r => resHas(`${r.name}${r.attr || ''}`, lit)) : []; }
  else { label = '자원'; of = arr; }
  if (!clues.length) {
    const {out: tc, unsure} = resTextClues(of, text), pool = unsure ? [] : tc.length ? of.filter(r => tc.every(h => h.includes(r))) : of;
    return {kind: k, label, of, pool, clue: '', ambiguous: !unsure && tc.length > 0 && !pool.length, unsure: unsure || (tc.length > 0 && pool.length > 1), excluded};
  }
  const pool = (k || kw ? of : arr).filter(r => clues.every(c => resNameExact(r, c)));
  if (!k && !kw && pool.length) { const pk = resKindOf(pool[0]); if (pk && pool.every(r => resKindOf(r) === pk)) { k = pk; label = RES_KIND[pk][1]; of = ofKind(pk); } }
  return {kind: k, label, of, pool, clue: clues[clues.length - 1].slice(0, 30), ambiguous: false, unsure: pool.length !== 1, excluded};
}
/** 겹치는 예약 하나(없으면 null). start·end는 'HH:MM', date는 YYYYMMDD. */
export function resConflict(bookings = [], date, start, end) {
  const a = toMin(start), z = toMin(end);
  if (a === null || z === null || z <= a) return null;
  for (const b of Array.isArray(bookings) ? bookings : []) { const sp = bookingSpanOnDay(b, date); if (sp && sp[0] < z && sp[1] > a) return b; }
  return null;
}
/** 기본 예약 시간: 오늘이면 지금 뒤의 30분 단위, 다른 날이면 09:00부터 len분(기본 1시간). 겹치면 그날의 다음 빈 칸으로 옮기고, 남은 빈 칸이 없으면 null. */
export function resDefaultTimes({date = '', bookings = [], now = new Date(), len = 60} = {}) {
  const k = resKst(now), today = k.date.replace(/-/g, '');
  const LO = 6 * 60, HI = 23 * 60 + 30;
  const s = Math.max(LO, String(date) === today ? Math.ceil((k.hh * 60 + k.mm + 1) / 30) * 30 : 9 * 60);
  for (let t = s; t + 30 <= HI; t += 30) {
    const e = Math.min(t + len, HI);
    if (!resConflict(bookings, date, minToHm(t), minToHm(e))) return {start: minToHm(t), end: minToHm(e)};
  }
  return null;
}

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
  const k = resKst(now), nowMin = k.date.replace(/-/g, '') === ymd ? k.hh * 60 + k.mm : null;
  return {segs, allDay, lo: DAY_LO, hi: DAY_HI, nowMin: nowMin !== null && nowMin >= DAY_LO && nowMin <= DAY_HI ? nowMin : null};
}
