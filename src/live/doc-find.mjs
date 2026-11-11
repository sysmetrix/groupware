// GW 비서 · 문서 찾기 순수 함수. 통합검색이 돌려준 결재문서 한 묶음을 기안/접수/발송으로 나누고, 부서·양식·낱말로 거른다.
// 원칙: 그룹웨어에 새 요청을 만들지 않는다(검색 결과만 다룬다) / 구분은 문서 양식과 본문 머리의 "수신자" 줄로 추정하며 화면에 추정임을 밝힌다.
// 이 파일은 briefing.mjs 뒤에 이어 붙어 한 범위로 번들되므로 import 없이, 이름은 df* 접두를 쓴다.

export const DF_VERSION = 1;
export const DF_KINDS = [['draft', '기안'], ['recv', '접수'], ['send', '발송']];
export const DF_KIND_NAME = {draft: '기안', recv: '접수', send: '발송'};

const dfStr = v => String(v ?? '');
const dfNorm = v => dfStr(v).replace(/\s+/g, '').toLowerCase();

/** 본문 머리의 "수신자 ○○ (경유) 제목" 줄에서 수신자를 읽는다. 없으면 ''. */
export function dfRecipient(text) {
  const m = dfStr(text).slice(0, 300).match(/수신자?\s*[:：]?\s*([\s\S]{0,80}?)\s*(?:\(\s*경유\s*\)|제목)/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

/** 기안(draft) / 접수(recv) / 발송(send). 접수는 양식 이름, 발송은 수신자가 내부결재가 아닌 기안문으로 추정한다. */
export function dfKind(doc) {
  if (!doc) return 'draft';
  if (/접수/.test(dfStr(doc.form))) return 'recv';
  const to = dfRecipient(doc.text);
  if (to && !/내부\s*결재/.test(to)) return 'send';
  return 'draft';
}

/** 같은 부서인지: 이름이 같거나 한쪽이 다른 쪽을 포함(예: "재단 전략경영실" ↔ "전략경영실"). */
export function dfSameDept(a, b) {
  const x = dfNorm(a), y = dfNorm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

const dfYmd = v => { const d = dfStr(v).replace(/\D/g, ''); return d.length >= 8 ? d.slice(0, 8) : ''; };

/** 검색 결과에 구분·날짜·내 부서 여부를 붙이고, 같은 문서가 두 번 오면 하나만 남긴다. */
export function dfPrepare(items, myDept = '') {
  const seen = new Set(), out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !it.docId || seen.has(it.docId)) continue;
    seen.add(it.docId);
    const kind = dfKind(it);
    out.push({...it, kind, ymd: dfYmd(it.date), mine: dfSameDept(it.dept, myDept), to: kind === 'send' ? dfRecipient(it.text) : ''});
  }
  return out;
}

const dfMatch = (d, f, skip) => {
  if (skip !== 'kind' && f.kind && f.kind !== 'all' && d.kind !== f.kind) return false;
  if (skip !== 'dept' && f.dept && f.dept !== 'all' && !(f.dept === 'mine' ? d.mine : d.dept === f.dept)) return false;
  if (skip !== 'form' && f.form && d.form !== f.form) return false;
  if (f.q) { const q = dfNorm(f.q); if (q && !dfNorm([d.title, d.docNo, d.drafter, d.dept, d.form].join(' ')).includes(q)) return false; }
  return true;
};

/** 거르고 정렬한다. sort: 'new'(최신순, 기본) | 'old' | 'rel'(그룹웨어가 준 순서 = 관련도). */
export function dfApply(list, filter = {}) {
  const f = filter || {};
  const out = (Array.isArray(list) ? list : []).filter(d => dfMatch(d, f, ''));
  if (f.sort === 'rel') return out;
  const dir = f.sort === 'old' ? 1 : -1;
  return out.map((d, i) => [d, i]).sort((a, b) => (a[0].ymd === b[0].ymd ? a[1] - b[1] : (a[0].ymd < b[0].ymd ? -1 : 1) * dir)).map(x => x[0]);
}

/** 필터 옆에 보일 건수. 각 필터의 건수는 "다른 필터는 그대로 두고 이것만 바꾸면 몇 건인지"로 센다. */
export function dfCounts(list, filter = {}) {
  const f = filter || {}, all = Array.isArray(list) ? list : [];
  const kinds = {all: 0, draft: 0, recv: 0, send: 0};
  for (const d of all) if (dfMatch(d, f, 'kind')) { kinds.all++; kinds[d.kind] = (kinds[d.kind] || 0) + 1; }
  const depts = new Map(); let deptAll = 0, mine = 0;
  for (const d of all) if (dfMatch(d, f, 'dept')) { deptAll++; if (d.mine) mine++; const k = d.dept || '(부서 없음)'; depts.set(k, (depts.get(k) || 0) + 1); }
  const forms = new Map();
  for (const d of all) if (dfMatch(d, f, 'form')) { const k = d.form || '(양식 없음)'; forms.set(k, (forms.get(k) || 0) + 1); }
  const rank = m => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  return {kinds, deptAll, mine, depts: rank(depts), forms: rank(forms)};
}

/** 최신순·오래된순일 때 달이 바뀌는 자리에 구분 줄을 넣기 위한 묶음. 날짜 없는 문서는 '날짜 없음'. */
export function dfMonths(list) {
  const out = [];
  for (const d of Array.isArray(list) ? list : []) {
    const key = d.ymd ? d.ymd.slice(0, 6) : '';
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(d);
    else out.push({key, label: key ? `${key.slice(0, 4)}년 ${Number(key.slice(4))}월` : '날짜 없음', items: [d]});
  }
  return out;
}

/** 저장한 검색·최근 검색 목록 정리: 앞뒤 공백 제거, 두 글자 미만 제외, 중복 제거, 최대 n개. */
export function dfKeywords(list, n = 8) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) { const k = dfStr(v).trim().slice(0, 40); if (k.length >= 2 && !out.includes(k)) out.push(k); }
  return out.slice(0, n);
}
