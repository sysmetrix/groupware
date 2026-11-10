// GW 비서 · 홈 모델(순수 함수). 화면/DOM/브라우저 값에 의존하지 않는다.
// briefing.mjs 뒤에 이어 붙어 한 범위로 번들되므로 import 금지, 비공개 이름은 hmo 접두, 내보내기 이름은 homeXxx.
export const HOME_MODEL_VERSION = 1;

const hmoN = v => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
const hmoCut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/** 시각(0~23)과 상황에 맞는 인사와 한 줄 요약 */
export function homeGreeting({hour = 9, name = '', urgent = 0, total = 0, loading = false} = {}) {
  const h = hmoN(hour);
  const hi = h < 5 ? '늦은 시간이네요' : h < 12 ? '좋은 아침입니다' : h < 18 ? '안녕하세요' : '수고하셨습니다';
  const who = String(name || '').trim();
  const title = who ? `${hi}, ${who} 님` : hi;
  const u = hmoN(urgent), t = hmoN(total);
  const sub = loading ? '그룹웨어 자료를 읽는 중입니다' : u ? `바로 처리할 일 ${u}건이 있습니다` : t ? `오늘 처리할 일은 ${t}건입니다` : '지금 처리할 일이 없습니다';
  return {title, sub, tone: loading ? 'info' : u ? 'urgent' : t ? 'todo' : 'ok'};
}

/** 핵심 타일: 값이 0이어도 자리는 유지(위치가 바뀌면 혼란스럽다). view는 눌렀을 때 이동할 곳. */
export function homeTiles({urgent = 0, todo = 0, check = 0, wait = 0, events = 0, away = 0, loaded = true} = {}) {
  const v = x => (loaded ? hmoN(x) : '–');
  const open = hmoN(urgent) + hmoN(todo) + hmoN(check);
  return [
    {id: 'urgent', label: '급한 일', value: v(urgent), sub: hmoN(urgent) ? '기한이 지났거나 오늘까지' : '없음', tone: loaded && hmoN(urgent) ? 'urgent' : 'ok', view: 'today'},
    {id: 'todo', label: '내 할 일', value: v(open), sub: hmoN(check) ? `확인 필요 ${hmoN(check)}건 포함` : '처리할 일', tone: loaded && open ? 'todo' : 'ok', view: 'today'},
    {id: 'wait', label: '결재 대기 중', value: v(wait), sub: '기다리는 중 · 할 일 아님', tone: 'info', view: 'approval'},
    {id: 'schedule', label: '오늘 일정', value: v(events), sub: hmoN(events) ? '시간 순서로 아래에' : '일정 없음', tone: 'info', view: 'calendar'},
    {id: 'away', label: '오늘 자리 비움', value: v(away), sub: hmoN(away) ? '휴가·출장·교육' : '모두 근무', tone: 'info', view: 'calendar'},
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
