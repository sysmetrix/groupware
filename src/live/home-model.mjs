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
  const v = x => (loaded ? hmoN(x) : '–');
  const open = hmoN(urgent) + hmoN(todo) + hmoN(check);
  return [
    {id: 'urgent', label: '급한 일', value: v(urgent), sub: hmoN(urgent) ? '기한이 지났거나 오늘까지' : '없음', tone: loaded && hmoN(urgent) ? 'urgent' : 'ok', view: 'today'},
    {id: 'todo', label: '내가 처리·확인할 일', value: v(open), sub: hmoN(check) ? `확인 필요 ${hmoN(check)}건 포함` : '조회된 처리·확인 항목', tone: loaded && open ? 'todo' : 'ok', view: 'today'},
    {id: 'wait', label: '기다리는 중', value: v(wait), sub: '조회된 대기 항목 · 처리할 일과 별도', tone: 'info', view: 'today'},
    {id: 'schedule', label: '오늘 일정', value: v(events), sub: hmoN(events) ? '시간 순서로 아래에' : '일정 없음', tone: 'info', view: 'calendar'},
    {id: 'away', label: '오늘 자리 비움', value: v(away), sub: hmoN(away) ? '조회된 휴가·출장·교육' : '조회된 부재 신청 없음', tone: 'info', view: 'calendar'},
  ];
}

const HMO_ORDER = ['overdue', 'urgent', 'todo', 'check', 'confirm'];
/** 지금 할 일 한 가지: 상태 우선순위 → 같은 상태면 입력 순서(이미 점수순) */
export function homeNextAction(actions = []) {
  const list = (Array.isArray(actions) ? actions : []).filter(a => a && a.key && HMO_ORDER.includes(a.state));
  if (!list.length) return null;
  const best = list.reduce((b, a) => (HMO_ORDER.indexOf(a.state) < HMO_ORDER.indexOf(b.state) ? a : b));
  return {key: best.key, title: hmoCut(best.title, 70), sub: hmoCut(best.headline || best.area || '', 90), state: best.state, deadline: best.deadline || ''};
}

/** 압축 타임라인: 시작 시각순, 종일 먼저, 최대 max개 + 나머지 개수 */
export function homeTimelineCompact(items = [], max = 5) {
  const all = (Array.isArray(items) ? items : []).filter(Boolean).map(i => ({from: String(i.from || ''), to: String(i.to || ''), label: hmoCut(i.label, 40), allDay: !!i.allDay, kind: i.kind || 'etc'}));
  all.sort((a, b) => (b.allDay - a.allDay) || a.from.localeCompare(b.from));
  const m = Math.max(1, hmoN(max));
  return {rows: all.slice(0, m), more: Math.max(0, all.length - m)};
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
    {id: 'schedule', label: '오늘 일정', value: `${hmoN(events)}건`, tone: 'info'},
    {id: 'away', label: '자리 비움', value: away === null || away === undefined ? '확인 불가' : `${hmoN(away)}명`, tone: 'info'},
    {id: 'mail', label: '안 읽은 메일', value: unread === null || unread === undefined ? '확인 불가' : `${hmoN(unread)}건`, tone: hmoN(unread) ? 'todo' : 'info'},
    {id: 'wait', label: '기다리는 중', value: `${hmoN(wait)}건`, tone: 'info'},
    {id: 'ref', label: '부서 참고', value: `${hmoN(refN)}건`, tone: 'info'},
    {id: 'leave', label: '남은 연차', value: leave ? String(leave) : '확인 불가', tone: 'info'},
  ];
  return {lead, first: first ? hmoCut(first, 60) : '', note: gaps ? '일부 자료를 읽지 못해 확인된 범위만 알려 드립니다.' : '', tone: u ? 'urgent' : t ? 'todo' : 'ok', facts};
}
