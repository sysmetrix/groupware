// GW 비서 · 홈 모델(순수 함수). 화면/DOM/브라우저 값에 의존하지 않는다.
// briefing.mjs 뒤에 이어 붙어 한 범위로 번들되므로 import 금지, 비공개 이름은 hmo 접두, 내보내기 이름은 homeXxx.
export const HOME_MODEL_VERSION = 1;

const hmoN = v => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
const hmoCut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/** 시각(0~23)과 상황에 맞는 인사와 한 줄 요약 */
export function homeGreeting({hour = 9, name = '', urgent = 0, total = 0, loading = false, weekend = false, nextLabel = ''} = {}) {
  const h = hmoN(hour);
  const hi = h < 5 ? '늦은 시간이네요' : h < 12 ? '좋은 아침입니다' : h < 18 || weekend ? '안녕하세요' : '수고하셨습니다';
  const who = String(name || '').trim();
  const title = who ? `${hi}, ${who} 님` : hi;
  const u = hmoN(urgent), t = hmoN(total);
  const later = weekend && nextLabel ? ` · 다음 평일 ${nextLabel}에 이어서 보셔도 됩니다` : '';
  const sub = loading ? '그룹웨어 자료를 읽는 중입니다' : u ? `바로 처리할 일 ${u}건이 있습니다` : t ? `남은 처리·확인할 일은 ${t}건입니다${later}` : '지금 처리할 일이 없습니다';
  return {title, sub, tone: loading ? 'info' : u ? 'urgent' : t ? 'todo' : 'ok'};
}

/** 핵심 타일: 값이 0이어도 자리는 유지(위치가 바뀌면 혼란스럽다). view는 눌렀을 때 이동할 곳. */
export function homeTiles({urgent = 0, todo = 0, check = 0, wait = 0, events = 0, away = 0, loaded = true} = {}) {
  const v = x => (loaded && x != null ? hmoN(x) : '–');
  const open = hmoN(urgent) + hmoN(todo) + hmoN(check);
  return [
    {id: 'urgent', label: '급한 일', value: v(urgent), sub: hmoN(urgent) ? '기한이 지났거나 오늘까지' : '없음', tone: loaded && hmoN(urgent) ? 'urgent' : 'ok', view: 'today'},
    {id: 'todo', label: '내가 처리·확인할 일', value: v(open), sub: hmoN(check) ? `확인 필요 ${hmoN(check)}건 포함` : '조회된 처리·확인 항목', tone: loaded && open ? 'todo' : 'ok', view: 'today'},
    {id: 'wait', label: '기다리는 중', value: v(wait), sub: '조회된 대기 항목 · 처리할 일과 별도', tone: 'info', view: 'today'},
    {id: 'schedule', label: '오늘 그룹웨어 일정', value: v(events), sub: hmoN(events) ? '구글 일정 제외' : '구글 일정 별도 확인', tone: 'info', view: 'calendar'},
    {id: 'away', label: '오늘 자리 비움', value: v(away), sub: hmoN(away) ? '조회된 휴가·출장·교육' : '조회된 부재 신청 없음', tone: 'info', view: 'calendar'},
  ];
}

const HMO_ORDER = ['overdue', 'urgent', 'todo', 'check', 'confirm'];
/** 지금 할 일 한 가지: 상태 우선순위 → 같은 상태면 입력 순서(이미 점수순) */
export function homeNextAction(actions = []) {
  const list = (Array.isArray(actions) ? actions : []).filter(a => a && a.key && HMO_ORDER.includes(a.state));
  if (!list.length) return null;
  // 같은 단계 안에서는 기한이 빠른 것이 먼저, 기한 없는 것은 뒤로 보낸다(같으면 앞선 순서 유지).
  const dl = a => String(a.deadline || '') || '\uffff';
  const best = list.reduce((b, a) => { const ia = HMO_ORDER.indexOf(a.state), ib = HMO_ORDER.indexOf(b.state); return ia < ib || (ia === ib && dl(a) < dl(b)) ? a : b; });
  return {key: best.key, title: hmoCut(best.title, 70), sub: hmoCut(best.headline || best.area || '', 90), state: best.state, deadline: best.deadline || ''};
}

/** 압축 타임라인: 시작 시각순, 종일 먼저, 최대 max개 + 나머지 개수 */
export function homeTimelineCompact(items = [], max = 5) {
  const all = (Array.isArray(items) ? items : []).filter(Boolean).map(i => ({from: String(i.from || ''), to: String(i.to || ''), label: hmoCut(i.label, 40), allDay: !!i.allDay, kind: i.kind || 'etc'}));
  all.sort((a, b) => (b.allDay - a.allDay) || a.from.localeCompare(b.from));
  const m = Math.max(1, hmoN(max));
  return {rows: all.slice(0, m), more: Math.max(0, all.length - m)};
}

const hmoMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
const hmoHm = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
/**
 * 하루 띠: 근무 시간대(기본 08~19시)를 한 줄로 놓았을 때 일정 칸·점심·지금 바늘이 놓일 위치(%)를 계산한다.
 * 시간이 정해진 일정만 칸이 되고, 종일 일정은 이름만 따로 돌려준다. 띠 밖(이른 아침·밤)의 일정은 개수만 센다.
 */
export function homeDayRail(items = [], {nowMin = 540, startH = 8, endH = 19, workEndH = 18} = {}) {
  const s = hmoN(startH) * 60, e = Math.max(s + 60, hmoN(endH) * 60), span = e - s;
  const pct = m => +(((Math.min(e, Math.max(s, m)) - s) / span) * 100).toFixed(2);
  const now = Number.isFinite(Number(nowMin)) ? Math.trunc(Number(nowMin)) : s;
  const blocks = [], allDay = [];
  let outside = 0;
  for (const it of (Array.isArray(items) ? items : []).filter(Boolean)) {
    const f = hmoMin(it.from);
    if (it.allDay || f === null) { allDay.push(hmoCut(it.label, 24)); continue; }
    const t0 = hmoMin(it.to), t = t0 !== null && t0 > f ? t0 : f + 30;
    if (t <= s || f >= e) { outside++; continue; }
    blocks.push({left: pct(f), width: +(pct(t) - pct(f)).toFixed(2), label: hmoCut(it.label, 40), time: hmoHm(f) + '~' + hmoHm(t), kind: ['away', 'car'].includes(it.kind) ? it.kind : 'etc', done: t <= now, fromMin: f});
  }
  blocks.sort((a, b) => a.fromMin - b.fromMin || b.width - a.width);
  const next = blocks.find(b => b.fromMin > now) || null;
  const workEnd = hmoN(workEndH) * 60;
  return {
    blocks: blocks.map(({fromMin, ...b}) => b), allDay, outside,
    ticks: Array.from({length: hmoN(endH) - hmoN(startH) + 1}, (_, i) => ({h: hmoN(startH) + i, left: pct(s + i * 60)})),
    lunch: {left: pct(720), width: +(pct(780) - pct(720)).toFixed(2)},
    now: {left: pct(now), label: hmoHm(((now % 1440) + 1440) % 1440), inRange: now >= s && now <= e, edge: now <= s + span * 0.04 ? 'l' : now >= e - span * 0.04 ? 'r' : ''},
    next: next ? {label: next.label, inMin: next.fromMin - now} : null,
    leftMin: now >= s && now < workEnd ? workEnd - now : 0,
  };
}

/** 자리 비움 한 줄: '(이름) 출장 · (이름) 휴가 외 2명' */
export function homeAwayLine(people = [], max = 3) {
  const p = (Array.isArray(people) ? people : []).filter(x => x && x.name);
  if (!p.length) return '';
  const head = p.slice(0, Math.max(1, hmoN(max))).map(x => `${x.name} ${String(x.label || '').replace(/^(관내|관외)/, '').trim()}`.trim());
  return head.join(' · ') + (p.length > head.length ? ` 외 ${p.length - head.length}명` : '');
}

const HMO_DOW = '일월화수목금토';
/** 오늘의 요일·주말 여부와 다음 평일. 그룹웨어 휴일 기록은 기념일일 수 있어 쉬는 날로 단정하지 않고 이름만 전달한다. */
export function homeDayInfo({date = '', holidays = []} = {}) {
  const none = {date: '', dow: '', weekend: false, holiday: '', next: '', nextLabel: '', label: ''};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return none;
  const ms = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) return none;
  const d8 = date.replace(/-/g, '');
  const holiday = (Array.isArray(holidays) ? holidays : []).filter(h => h && String(h.date || '').replace(/-/g, '').slice(0, 8) === d8).map(h => hmoCut(h.title || '휴일', 20)).join(' · ');
  const w = new Date(ms).getUTCDay();
  let next = '';
  for (let i = 1; i <= 7 && !next; i++) { const n = new Date(ms + i * 86400000), nw = n.getUTCDay(); if (nw !== 0 && nw !== 6) next = n.toISOString().slice(0, 10); }
  const nextLabel = next ? `${Number(next.slice(5, 7))}/${Number(next.slice(8, 10))}(${HMO_DOW[new Date(next + 'T00:00:00Z').getUTCDay()]})` : '';
  return {date, dow: HMO_DOW[w], weekend: w === 0 || w === 6, holiday, next, nextLabel, label: `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${HMO_DOW[w]}요일`};
}

/** 비서가 먼저 건네는 브리핑(조회된 숫자만 문장으로 옮긴다. 값이 null이면 '확인 불가'로 남긴다). */
export function homeBriefing({urgent = 0, total = 0, wait = 0, events = 0, away = null, unread = null, leave = '', refN = 0, weekend = false, nextLabel = '', gaps = false, first = ''} = {}) {
  const u = hmoN(urgent), t = hmoN(total);
  let lead = u ? `지금 바로 볼 일이 ${u}건 있습니다.` : t ? `급한 일은 없고, 처리·확인할 일이 ${t}건 있습니다.` : gaps ? '확인된 처리할 일은 없습니다.' : '지금 처리할 일이 없습니다.';
  if (weekend) lead = '주말입니다. ' + lead + (!u && t && nextLabel ? ` 다음 평일 ${nextLabel}에 이어서 보셔도 됩니다.` : '');
  const facts = [
    {id: 'schedule', label: '오늘 그룹웨어 일정 (구글 제외)', value: events == null ? '확인 불가' : `${hmoN(events)}건`, tone: 'info'},
    {id: 'away', label: '자리 비움', value: away === null || away === undefined ? '확인 불가' : `${hmoN(away)}명`, tone: 'info'},
    {id: 'mail', label: '안 읽은 메일', value: unread === null || unread === undefined ? '확인 불가' : `${hmoN(unread)}건`, tone: hmoN(unread) ? 'todo' : 'info'},
    {id: 'wait', label: '기다리는 중', value: `${gaps ? '확인된 ' : ''}${hmoN(wait)}건`, tone: 'info'},
    {id: 'ref', label: '부서 참고', value: `${gaps ? '확인된 ' : ''}${hmoN(refN)}건`, tone: 'info'},
    {id: 'leave', label: '남은 연차', value: leave ? String(leave) : '확인 불가', tone: 'info'},
  ];
  return {lead, first: first ? hmoCut(first, 60) : '', note: gaps ? '일부 자료를 읽지 못해 확인된 범위만 알려 드립니다.' : '', tone: gaps ? 'warn' : u ? 'urgent' : t ? 'todo' : 'ok', facts};
}

/**
 * v1.23 홈 '핵심 4'의 예산 집행 한 줄. projects는 수집기가 이미 읽은 관심 사업 예산(누계)이며 홈은 새로 조회하지 않는다.
 * 사업마다 rows[0]이 그 사업(또는 단위사업)의 합계다. 조회 실패·예산 0인 사업은 합계에서 빼고 따로 센다.
 */
export function homeBudgetLine(projects = [], elapsedPct = null) {
  const list = (Array.isArray(projects) ? projects : []).filter(Boolean);
  if (!list.length) return {text: '관심 사업을 정하면 집행률을 보여 드립니다', tone: 'info', rate: null, count: 0, failed: 0};
  const top = p => (!p.error && Array.isArray(p.rows) && p.rows[0]) || null;
  const ok = list.filter(p => top(p) && Number(top(p).budget) > 0);
  const failed = list.filter(p => p.error || !top(p)).length;
  const el = elapsedPct === null || elapsedPct === undefined || !Number.isFinite(Number(elapsedPct)) ? null : Number(elapsedPct);
  if (!ok.length) return {text: failed ? `관심 사업 ${list.length}개 모두 조회 실패` : '관심 사업 예산이 0원으로 읽혔습니다', tone: 'warn', rate: null, count: 0, failed};
  const budget = ok.reduce((s, p) => s + Number(top(p).budget || 0), 0), executed = ok.reduce((s, p) => s + Number(top(p).executed || 0), 0);
  const rate = Math.round(executed / budget * 1000) / 10;
  const parts = [`관심 사업 ${ok.length}개 집행률 ${rate}%`];
  if (el !== null) parts.push(`올해 경과 ${el}%`);
  if (failed) parts.push(`${failed}개 조회 실패`);
  return {text: parts.join(' · '), tone: failed ? 'warn' : 'info', rate, count: ok.length, failed};
}

/**
 * v1.23 홈 '핵심 4'의 근태·연차 한 줄. 시각은 화면 쪽에서 HH:MM으로 바꿔 넘긴다.
 * 조회하지 못한 값은 '확인 불가'로 남기고, 근무일이 아니면 출퇴근을 말하지 않는다.
 */
export function homeAttendanceLine({come = '', leave = '', error = false, workday = true, remaining = '', check = 0} = {}) {
  const parts = [];
  if (error) parts.push('오늘 출퇴근 기록 확인 불가');
  else if (!workday) parts.push('오늘은 근무일이 아닙니다');
  else parts.push(`출근 ${come || '기록 없음'} · 퇴근 ${leave || '기록 없음'}`);
  parts.push(remaining ? `남은 연차 ${remaining}` : '남은 연차 확인 불가');
  if (hmoN(check)) parts.push(`확인할 근태 ${hmoN(check)}건`);
  return {text: parts.join(' · '), tone: hmoN(check) ? 'todo' : 'info'};
}
