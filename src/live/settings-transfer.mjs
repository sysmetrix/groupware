// GW 비서 · 설정 옮기기(내보내기/가져오기) 순수 함수. 다른 PC·브라우저로 "내 설정"만 파일로 옮긴다.
// 원칙: 허용 목록(화이트리스트)에 있는 키만 담고 읽는다 / 키·비밀번호·로그인 정보·그룹웨어 자료는 담지 않는다 /
//       가져올 때는 형식을 검증하고 어떤 항목이 바뀌는지 먼저 알려 준다(이 모듈은 계산만 하고 저장하지 않는다).
// 이 파일은 briefing.mjs 뒤에 이어 붙어 한 범위로 번들되므로 import 없이, 이름은 setx* 접두를 쓴다.

export const SETX_VERSION = 1;
export const SETX_KIND = 'bwyf-gw-bisu-settings';

// 사람이 알아볼 이름. 여기 없는 설정(seenVersion, tourDone, noticeAck, fabTip*, palRecent, paneWidth 등)은 PC마다 다른 값이라 옮기지 않는다.
export const SETX_LABELS = {
  roles: '내 업무 범위', urgentWords: '내 긴급 키워드', rel: '내 일로/목록에서 뺀 지정', refreshMin: '자동 새로고침', notify: '새 급한 일 알림',
  fontSize: '글자 크기', theme: '화면 테마', budget: '예산 관심 사업', mailCount: '받은메일 읽는 수', days: '조회 기간',
  gcal: '구글 일정(계정·캘린더·색)', navMore: '왼쪽 메뉴 더보기', chatSave: '대화 기록 저장',
};
const SETX_LIMITS = {str: 300, list: 200};

const setxPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const setxStr = (v, n = SETX_LIMITS.str) => typeof v === 'string' ? v.slice(0, n) : '';
const setxBool = v => typeof v === 'boolean';
const setxCalId = v => typeof v === 'string' && v.length <= 200 && /^[A-Za-z0-9._#+\-]+@[A-Za-z0-9._\-]+$/.test(v);
const setxColor = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

// 각 키의 검증·정리 규칙. 정리된 값을 돌려주고, 형식이 맞지 않으면 undefined(= 건너뜀).
const SETX_RULES = {
  roles: v => setxPlain(v) ? Object.fromEntries(['deptReceiver', 'distributor', 'sender'].filter(k => setxBool(v[k])).map(k => [k, v[k]])) : undefined,
  urgentWords: v => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 40)).slice(0, 50) : undefined,
  rel: v => {
    if (!setxPlain(v)) return undefined;
    const lst = a => {
      if (a === undefined) return [];
      if (!Array.isArray(a) || a.some(q => !setxPlain(q) || !['key', 'kind', 'sender'].includes(q.t) || typeof q.v !== 'string' || (q.label !== undefined && typeof q.label !== 'string') || (q.at !== undefined && (typeof q.at !== 'number' || !Number.isFinite(q.at))))) return undefined;
      return a.slice(0, SETX_LIMITS.list).map(q => ({t: q.t, v: q.v, ...(q.label !== undefined ? {label: q.label} : {}), ...(q.at !== undefined ? {at: q.at} : {})}));
    };
    const mute = lst(v.mute), mine = lst(v.mine);
    return mute && mine ? {mute, mine} : undefined;
  },
  refreshMin: v => [0, 3, 5, 10, 30].includes(Number(v)) ? Number(v) : undefined,
  notify: v => setxBool(v) ? v : undefined,
  fontSize: v => ['s', 'm', 'l', 'xl'].includes(v) ? v : undefined,
  theme: v => ['light', 'dark'].includes(v) ? v : undefined,
  budget: v => Array.isArray(v) && v.every(b => setxPlain(b) && typeof b.project === 'string' && /^[A-Za-z0-9가-힣]+$/.test(b.project)) ? v.slice(0, 30).map(b => ({project: b.project, filter: setxStr(b.filter, 60), label: setxStr(b.label, 60)})) : undefined,
  mailCount: v => [50, 100, 200].includes(Number(v)) ? Number(v) : undefined,
  days: v => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 120 ? Number(v) : undefined,
  navMore: v => setxBool(v) ? v : undefined,
  chatSave: v => setxBool(v) ? v : undefined,
  gcal: v => {
    if (!setxPlain(v)) return undefined;
    const out = {};
    if (v.email !== undefined) { if (!setxCalId(v.email)) return undefined; out.email = v.email; }
    const cals = v.cals || (Array.isArray(v.extra) ? v.extra.map(id => ({id})) : []);
    if (!Array.isArray(cals)) return undefined;
    const seen = new Set(); out.cals = [];
    for (const x of cals) {
      if (!setxPlain(x) || !setxCalId(x.id)) return undefined;
      if (seen.has(x.id)) continue; seen.add(x.id);
      out.cals.push({id: x.id, color: setxColor(x.color) ? x.color.toLowerCase() : '', name: setxStr(x.name, 30)});
    }
    out.cals = out.cals.slice(0, 12);
    if (['WEEK', 'MONTH', 'AGENDA'].includes(v.mode)) out.mode = v.mode;
    return out;
  },
};
export const SETX_KEYS = Object.keys(SETX_RULES);

/** 현재 설정에서 옮길 항목만 골라 파일 내용(JSON 문자열)을 만든다. */
export function setxBuild(settings, {version = '', now = new Date()} = {}) {
  const src = setxPlain(settings) ? settings : {};
  const data = {};
  for (const k of SETX_KEYS) {
    if (src[k] === undefined) continue;
    const v = SETX_RULES[k](src[k]);
    if (v !== undefined) data[k] = v;
  }
  return JSON.stringify({kind: SETX_KIND, format: SETX_VERSION, app: version, exportedAt: new Date(now).toISOString(), settings: data}, null, 2);
}

/** 파일 이름: GW비서_설정_YYYY-MM-DD.json (한국 시간 기준). */
export function setxFileName(now = new Date()) {
  const kst = new Date(new Date(now).getTime() + 9 * 3600 * 1000);
  return `GW비서_설정_${kst.toISOString().slice(0, 10)}.json`;
}

const setxSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 파일 내용을 검사해 가져올 값과 바뀌는 항목을 계산한다.
 * 반환: {ok:false, error} 또는 {ok:true, patch, changed:[{key,label}], same:[label], skipped:[label], exportedAt}
 * patch는 현재 설정에 덮어쓸 값(허용 키만, 검증을 통과한 것만)이다.
 */
export function setxParse(text, current = {}) {
  let doc;
  try { doc = JSON.parse(String(text)); } catch { return {ok: false, error: 'JSON 파일이 아닙니다. GW 비서에서 내보낸 설정 파일을 선택하세요.'}; }
  if (!setxPlain(doc) || doc.kind !== SETX_KIND) return {ok: false, error: 'GW 비서 설정 파일이 아닙니다.'};
  if (!Number.isInteger(doc.format) || doc.format < 1) return {ok: false, error: '파일 형식 정보가 없습니다.'};
  if (doc.format > SETX_VERSION) return {ok: false, error: '더 새로운 버전에서 내보낸 파일입니다. 이 PC의 GW 비서를 먼저 최신으로 업데이트하세요.'};
  if (!setxPlain(doc.settings)) return {ok: false, error: '설정 내용이 비어 있습니다.'};
  const cur = setxPlain(current) ? current : {};
  const patch = {}, changed = [], same = [], skipped = [];
  for (const k of SETX_KEYS) {
    if (!(k in doc.settings)) continue;
    const v = SETX_RULES[k](doc.settings[k]);
    if (v === undefined) { skipped.push(SETX_LABELS[k]); continue; }
    patch[k] = v;
    // 현재 값도 같은 규칙으로 정리해 비교한다(없으면 기본값과 다름으로 본다).
    const before = cur[k] === undefined ? undefined : SETX_RULES[k](cur[k]);
    (setxSame(before, v) ? same : changed).push(setxSame(before, v) ? SETX_LABELS[k] : {key: k, label: SETX_LABELS[k]});
  }
  if (!Object.keys(patch).length) return {ok: false, error: '가져올 수 있는 설정이 없습니다.'};
  return {ok: true, patch, changed, same, skipped, exportedAt: typeof doc.exportedAt === 'string' ? doc.exportedAt : ''};
}
