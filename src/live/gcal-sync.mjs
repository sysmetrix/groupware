// GW 통합 업무센터 · 그룹웨어 → 구글 캘린더 동기화 계획(순수 함수). 스킬 bwyf-gcal-sync의 원칙을 코드로 옮긴 것이다.
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
const gsValidTm = s => /^\d{4}$/.test(String(s || '')) && +String(s).slice(0, 2) <= 24 && +String(s).slice(2) < 60;
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

/** 구글 일정 작성 주소의 dates 값. 하루 안의 시간 지정은 로컬 타임스탬프, 그 밖은 종일(종료일 다음 날). */
export function gsyncDates(startYmd, endYmd, startTm, endTm) {
  const s = String(startYmd), e = String(endYmd || startYmd);
  if (!gsValidYmd(s) || !gsValidYmd(e) || e < s) return null;
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

/**
 * 동기화 계획. 입력은 이미 읽어 둔 그룹웨어 자료뿐이다(네트워크·DOM 접근 없음).
 * synced: {key: 시각} 사용자가 "올렸다"고 표시한 것. 반환 items는 날짜순.
 */
export function gsyncPlan({apps = [], me = '', deadlines = [], cals = [], synced = {}, now = new Date(), sinceDays = 30} = {}) {
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
    const ev = {key, source: 'attend', kind, layer, calId: gsyncCalendarId(cals, layer), title: `${a.atNm}(${gsyncHours(a)})`.replace(/^(근무일대체|연장근무|휴일근무|조기근무)(\(보상\))?/, '시간외'), startYmd: s, endYmd: e, allDay: dt.allDay, dates: dt.dates, time: dt.allDay ? '' : `${gsHm(a.startTm)}~${gsHm(a.endTm)}`, location: kind === 'trip' ? gsOne(a.place) : '', details: gsyncAttendMemo(a, kind), docNo: a.noDoc || '', pending: !ready, label: a.atNm};
    ev.state = synced[key] ? 'synced' : ready ? 'ready' : 'hold';
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
    items.push({key, source: 'deadline', kind: 'deadline', layer, calId: gsyncCalendarId(cals, layer), title: `[마감] ${gsOne(d.title).slice(0, 80)}`, startYmd: ymd, endYmd: ymd, allDay: dt.allDay, dates: dt.dates, time: dt.allDay ? '' : `${tm.slice(0, 2)}:${tm.slice(2)}`, location: '', details: gsyncDeadlineMemo(d, now), docNo: '', pending: false, label: '마감', state: synced[key] ? 'synced' : 'ready'});
  }
  items.sort((x, y) => x.startYmd.localeCompare(y.startYmd) || x.title.localeCompare(y.title, 'ko'));
  const counts = {ready: 0, hold: 0, synced: 0};
  for (const i of items) counts[i.state]++;
  return {items, counts, today};
}
