// 사용 기록 보고서(순수 로직): 내보낸 사용 기록을 읽어 메뉴별 사용, 수정 후보, 동결 후보를 뽑는다.
// DOM·파일 접근 없음. 입력 파일의 글자는 믿지 않는다: 이름 규칙에 맞는 키와 횟수만 읽고, 버린 것은 개수만 센다.
import {usageDay, usageNormalize, USAGE_KINDS, USAGE_KEEP_DAYS} from '../../src/live/usage.mjs';

export const CORE_MENUS = ['today', 'calendar', 'attendance', 'budget'];
const MENU_ORDER = [...CORE_MENUS, 'approval', 'search', 'report', 'settings', 'home'];
/** 이보다 적게 쓴 기록으로는 동결을 정하기 이르다고 알린다. */
export const MIN_ACTIVE_DAYS = 10;
/** 앱이 내보내는 글(usageReport)의 표마다 담는 줄 수. 이만큼 차 있으면 잘렸을 수 있다. */
const MD_LIMIT = {view: 15, act: 25, tool: 25};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
/** 이름 규칙은 usage.mjs 한 곳에만 둔다: 정규화를 통과하는지로 판단한다. */
const keeps = (key, n = 1) => Object.keys(usageNormalize({days: {'2000-01-01': {view: {[key]: n}}}}).days).length > 0;
const add = (map, key, n) => map.set(key, (map.get(key) || 0) + n);
const rank = map => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const sumOf = map => [...map.values()].reduce((a, b) => a + b, 0);

// ---------- 입력 읽기 ----------

/** 저장 모양({v, days})의 기록. 규칙 밖의 날짜·종류·키·값은 버리고 개수만 센다. */
function fromLog(raw) {
  let dropped = 0;
  for (const [day, kinds] of Object.entries(raw.days)) {
    if (!DAY_RE.test(day) || !isObj(kinds)) { dropped += isObj(kinds) ? Object.values(kinds).reduce((a, o) => a + (isObj(o) ? Object.keys(o).length : 1), 0) || 1 : 1; continue; }
    for (const [kind, src] of Object.entries(kinds)) {
      if (!USAGE_KINDS.includes(kind) || !isObj(src)) { dropped += isObj(src) ? Object.keys(src).length || 1 : 1; continue; }
      for (const [k, n] of Object.entries(src)) if (!keeps(k, n)) dropped++;
    }
  }
  return {type: 'log', log: usageNormalize(raw), dropped};
}

/** 앱의 '파일로 내보내기'·'복사'가 만드는 Markdown. 날짜별 값이 없고 표가 잘려 있어 합계만 읽는다. */
function fromMarkdown(text) {
  const lines = text.split(/\r?\n/);
  const head = lines[0].match(/^# GW 비서 사용 기록 (\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})\s*$/);
  if (!head) return null;
  const src = {type: 'summary', from: head[1], to: head[2], activeDays: 0, view: new Map(), act: new Map(), tool: new Map(), unusedViews: new Set(), truncated: {view: false, act: false, tool: false}, chat: {local: 0, ai: 0}, dropped: 0};
  const rows = {view: 0, act: 0, tool: 0};
  const found = new Set();
  let section = '';
  for (const line of lines.slice(1)) {
    const active = !section && line.match(/쓴 날 (\d+)일/);
    if (active) src.activeDays = Number(active[1]);
    if (line.startsWith('## ')) {
      const title = line.slice(3).trim();
      const tools = title.match(/^비서 도구 \(규칙으로 답함 (\d+)회, AI가 고름 (\d+)회\)$/);
      if (tools) src.chat = {local: Number(tools[1]), ai: Number(tools[2])};
      section = tools ? 'tool' : title === '화면' ? 'view' : title === '버튼(많이 쓴 순)' ? 'act' : title === '한 번도 열지 않은 화면' ? 'unused' : 'skip';
      found.add(section);
      continue;
    }
    if (!section || section === 'skip' || !line.startsWith('- ') || line.trim() === '- (없음)') continue;
    if (section === 'unused') {
      const k = line.slice(2).trim();
      if (keeps(k)) src.unusedViews.add(k); else src.dropped++;
      continue;
    }
    rows[section]++;
    const m = line.match(/^- (.*): (\d+)\s*$/);
    if (m && keeps(m[1], Number(m[2]))) add(src[section], m[1], Math.min(Number(m[2]), 1e6)); else src.dropped++;
  }
  // 표가 하나라도 빠졌으면 중간에 잘린 파일이다. 빠진 표를 0회로 읽지 않는다.
  if (['view', 'act', 'tool', 'unused'].some(s => !found.has(s))) return null;
  for (const k of Object.keys(rows)) src.truncated[k] = rows[k] >= MD_LIMIT[k];
  return src;
}

/** 파일 내용 하나를 읽는다. 알아볼 수 없으면 {type: 'bad', reason}. 내용은 reason에 옮기지 않는다. */
export function parseUsageInput(text) {
  const body = String(text ?? '').trimStart(); // trimStart는 BOM도 지운다
  if (!body) return {type: 'bad', reason: '빈 파일입니다'};
  if (body.startsWith('{')) {
    let data;
    try { data = JSON.parse(body); } catch { return {type: 'bad', reason: 'JSON 형식이 깨졌습니다'}; }
    const raw = isObj(data?.days) ? data : data?.usage;
    return isObj(raw?.days) ? fromLog(raw) : {type: 'bad', reason: '사용 기록(days)이 없습니다'};
  }
  return fromMarkdown(body) || {type: 'bad', reason: '사용 기록 파일이 아니거나 중간에 잘렸습니다'};
}

// ---------- 코드의 이름 목록 ----------

/** model은 wc-analyze의 loadWc 결과, analysis는 analyze 결과. 소스에서 화면·data-act·도구 이름을 뽑는다. */
export function codeNames(model, analysis) {
  const raw = model.parts.map(p => p.raw).join('\n') + '\n' + model.workcenter;
  const viewsSrc = raw.match(/const VIEWS = \[([\s\S]*?)\n\s*\];/);
  const parentSrc = raw.match(/const VIEW_PARENT = \{([^}]*)\}/);
  if (!viewsSrc || !parentSrc) throw new Error('소스에서 VIEWS 또는 VIEW_PARENT를 찾지 못했습니다');
  const views = [...viewsSrc[1].matchAll(/\{id: '(\w+)', label: '([^']+)'\}/g)].map(m => ({id: m[1], label: m[2]}));
  const viewParent = Object.fromEntries([...parentSrc[1].matchAll(/(\w+): '(\w+)'/g)].map(m => [m[1], m[2]]));
  // 버튼: 화면 템플릿의 data-act, 16-events의 case, HOME_ACTS 등록을 모두 모은다.
  const home = [...raw.matchAll(/HOME_ACTS(?:\.(\w+)|\[['"](\w+)['"]\])\s*=(?!=)/g)].map(m => m[1] || m[2]);
  const allActs = [...new Set([...analysis.acts, ...analysis.cases.map(c => c.act), ...home])];
  const tools = [...new Set([...raw.matchAll(/chatRegisterTool\(\s*\{\s*(?:\/\/[^\n]*\n\s*)*name:\s*'(\w+)'/g)].map(m => m[1]))];
  // 도구로 등록하지 않고 AI 기능 이름으로만 세는 것(usageNote('toolAi', '이름'))
  const aiOnly = [...new Set([...raw.matchAll(/usageNote\('toolAi', '(\w+)'\)/g)].map(m => m[1]))];
  if (!views.length || !allActs.length || !tools.length) throw new Error('소스에서 이름 목록을 읽지 못했습니다');
  // 이름 규칙에 안 맞는 버튼은 앱이 세지 않으므로 0회 후보에서 뺀다.
  return {views, viewParent, acts: allActs.filter(a => keeps(a)).sort(), uncountedActs: allActs.filter(a => !keeps(a)).sort(), tools: tools.sort(), aiOnly: aiOnly.sort()};
}

// ---------- 합치기와 판정 ----------

/** 같은 사람의 파일을 겹쳐 넣었는지: 두 기록에 내용이 똑같은 날(이름 3개 이상)이 있으면 의심한다. */
function overlapPairs(logs) {
  const sig = d => JSON.stringify(USAGE_KINDS.map(k => Object.entries(d[k] || {}).sort((a, b) => a[0].localeCompare(b[0]))));
  const seen = new Map(), pairs = new Set();
  for (const {index, days} of logs) for (const [day, d] of days) {
    if (Object.values(d).reduce((a, o) => a + Object.keys(o).length, 0) < 3) continue;
    const key = day + sig(d);
    if (seen.has(key) && seen.get(key) !== index) pairs.add(`${seen.get(key)}·${index}`); else seen.set(key, index);
  }
  return [...pairs];
}

/** sources는 parseUsageInput 결과 배열. 반환값은 보고서에 쓰는 숫자 전부. */
export function buildUsageReport(sources, names, {now = Date.now(), days = 28} = {}) {
  const span = Math.max(1, Math.floor(days) || 28);
  const to = usageDay(now), from = usageDay(Number(now) - (span - 1) * 86400000);
  const sum = {view: new Map(), act: new Map(), tool: new Map(), toolAi: new Map(), mixed: new Map()};
  const parentOf = id => names.viewParent[id] || id;
  const label = id => names.views.find(v => v.id === id)?.label || id;
  const menuIds = [...MENU_ORDER, ...names.views.map(v => v.id).filter(id => !names.viewParent[id] && !MENU_ORDER.includes(id))];
  const menu = new Map(menuIds.map(id => [id, {count: 0, dates: new Set(), fileDays: 0, fromSummary: false}]));
  const known = new Set(names.views.map(v => v.id));
  const dates = new Set(), logs = [], summaries = [], bad = [];
  const seenViews = new Set(), unknownViews = new Map();
  const truncated = {view: false, act: false, tool: false};
  const chat = {local: 0, ai: 0, mixedLocal: 0, mixedAi: 0};
  let dropped = 0, used = 0, personDays = 0, outside = 0;
  const countView = (id, n) => {
    if (!known.has(id)) { add(unknownViews, id, n); return null; }
    seenViews.add(id);
    const m = menu.get(parentOf(id));
    if (m) m.count += n;
    return m || null;
  };

  sources.forEach((src, i) => {
    const index = i + 1;
    if (src.type === 'bad') { bad.push({index, reason: src.reason}); return; }
    dropped += src.dropped;
    if (src.type === 'log') {
      const inRange = Object.entries(src.log.days).filter(([d]) => d >= from && d <= to);
      if (!inRange.length) { outside++; return; }
      used++; personDays += inRange.length;
      logs.push({index, days: inRange});
      for (const [day, kinds] of inRange) {
        dates.add(day);
        const touched = new Set();
        for (const kind of USAGE_KINDS) for (const [k, n] of Object.entries(kinds[kind] || {})) {
          add(sum[kind], k, n);
          if (kind === 'view') { const m = countView(k, n); if (m) { m.dates.add(day); touched.add(m); } }
          if (kind === 'tool') chat.local += n;
          if (kind === 'toolAi') chat.ai += n;
        }
        for (const m of touched) m.fileDays++;
      }
      return;
    }
    // 요약 파일: 날짜별 값이 없어 기간을 자를 수 없다. 기간과 전혀 겹치지 않을 때만 뺀다.
    if (src.to < from || src.from > to || !src.activeDays) { outside++; return; }
    used++; personDays += src.activeDays;
    summaries.push({index, from: src.from, to: src.to, activeDays: src.activeDays});
    for (const k of Object.keys(truncated)) truncated[k] ||= src.truncated[k];
    for (const [k, n] of src.view) { add(sum.view, k, n); const m = countView(k, n); if (m) m.fromSummary = true; }
    // 화면 표가 잘렸으면 '열지 않은 화면' 목록에 없는 화면은 한 번 이상 연 것이다.
    if (src.truncated.view) for (const {id} of names.views) if (!src.unusedViews.has(id) && !src.view.has(id)) { seenViews.add(id); const m = menu.get(parentOf(id)); if (m) m.fromSummary = true; }
    for (const [k, n] of src.act) add(sum.act, k, n);
    for (const [k, n] of src.tool) add(sum.mixed, k, n);
    chat.mixedLocal += src.chat.local; chat.mixedAi += src.chat.ai;
  });

  const total = [...menu.values()].reduce((a, m) => a + m.count, 0);
  const menus = [...menu].map(([id, m]) => ({id, label: label(id), core: CORE_MENUS.includes(id), count: m.count, share: total ? m.count / total : 0, days: m.dates.size, fileDays: m.fileDays, daysPartial: m.fromSummary}));

  const errors = [];
  for (const [kind, map] of Object.entries(sum)) for (const [k, n] of map) {
    if (!k.endsWith(':err')) continue;
    const name = k.slice(0, -4), ok = map.get(name) || 0;
    // 요약 파일의 잘린 표에서는 성공 줄이 빠졌을 수 있어 비율을 내지 않는다.
    const unsure = kind === 'mixed' && truncated.tool && !map.has(name);
    errors.push({kind, name, errors: n, ok: unsure ? null : ok, rate: unsure ? null : n / (n + ok)});
  }
  errors.sort((a, b) => b.errors - a.errors || (b.rate ?? 0) - (a.rate ?? 0) || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));

  const base = k => k.replace(/:err$/, '');
  const usedActs = new Set([...sum.act.keys()].map(base));
  const usedTools = new Set([...sum.tool.keys(), ...sum.toolAi.keys(), ...sum.mixed.keys()].map(base));
  const allTools = [...new Set([...names.tools, ...names.aiOnly])].sort();
  // 판단할 수 없으면 null: 기록이 없거나, 요약 파일의 표가 잘려 0회인지 알 수 없는 경우.
  const freeze = {
    views: used ? names.views.map(v => v.id).filter(id => !seenViews.has(id)) : null,
    acts: used && !truncated.act ? names.acts.filter(a => !usedActs.has(a)) : null,
    tools: used && !truncated.tool ? allTools.filter(t => !usedTools.has(t)) : null,
  };
  const notInCode = (set, list) => { const have = new Set(list); return [...set].filter(k => !have.has(k)).length; };

  return {
    from, to, span, files: sources.length, used, outside, bad, dropped, summaries, truncated,
    overlaps: overlapPairs(logs), activeDates: dates.size, personDays,
    activeDays: Math.max(dates.size, ...summaries.map(s => Math.min(s.activeDays, span))),
    menus, viewTotal: total, errors, freeze,
    totals: {views: names.views.length, acts: names.acts.length, tools: allTools.length},
    uncountedActs: names.uncountedActs || [],
    unknown: {views: unknownViews.size, acts: notInCode(usedActs, names.acts), tools: notInCode(usedTools, allTools)},
    tools: {local: rank(sum.tool).filter(([k]) => !k.endsWith(':err')), ai: rank(sum.toolAi).filter(([k]) => !k.endsWith(':err')), mixed: rank(sum.mixed).filter(([k]) => !k.endsWith(':err')), chat},
    labels: Object.fromEntries(names.views.map(v => [v.id, v.label])),
  };
}

// ---------- 글로 쓰기 ----------

const pct = x => `${(x * 100).toFixed(1)}%`;
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
const KIND_LABEL = {view: '화면', act: '버튼', tool: '도구(로컬)', toolAi: '도구(AI)', mixed: '도구(구분 없음)'};

export function formatUsageReport(r, {top = 10, version = ''} = {}) {
  const out = [`# 사용 기록 보고서 ${r.from} ~ ${r.to} (${r.span}일)`, ''];
  out.push(`- 파일 ${r.files}개 중 ${r.used}개를 반영했습니다. 기간 밖 ${r.outside}개, 읽지 못함 ${r.bad.length}개입니다.`);
  out.push(`- 쓴 날: 날짜 기준 ${r.summaries.length ? `${r.activeDays}일 이상` : `${r.activeDates}일`}, 파일별 합 ${r.personDays}일${r.summaries.length ? '(요약 파일은 내보낸 기간 전체)' : ''}`);
  out.push(`- 이름·횟수 규칙에 맞지 않아 버린 항목: ${r.dropped}개`);
  if (version) out.push(`- 이름 목록 기준: 코드 버전 ${version}`);

  const warns = [];
  for (const b of r.bad) warns.push(`${b.index}번째 파일은 읽지 못했습니다: ${b.reason}.`);
  if (!r.used) warns.push('기간 안의 기록이 없어 아무것도 판단할 수 없습니다.');
  else if (r.activeDays < MIN_ACTIVE_DAYS) warns.push(`쓴 날이 ${MIN_ACTIVE_DAYS}일보다 적습니다. 동결을 정하기에는 이릅니다.`);
  if (r.span > USAGE_KEEP_DAYS) warns.push(`앱은 ${USAGE_KEEP_DAYS}일치만 보관합니다. 그보다 오래된 사용은 알 수 없습니다.`);
  for (const s of r.summaries) warns.push(`${s.index}번째 파일은 요약(Markdown)입니다. 날짜별 값이 없어 ${s.from} ~ ${s.to} 합계를 그대로 더했습니다.`);
  if (r.truncated.view || r.truncated.act || r.truncated.tool) warns.push('요약 파일의 표가 상위 일부만 담고 있어 횟수가 실제보다 적을 수 있습니다.');
  for (const p of r.overlaps) warns.push(`${p}번째 파일에 내용이 똑같은 날이 있습니다. 같은 사람의 파일이면 두 번 세어집니다. 한 사람당 최근 파일 하나만 넣어 주세요.`);
  if (warns.length) out.push('', '## 먼저 확인해 주세요', '', ...warns.map(w => `- ${w}`));
  if (!r.used) return out.join('\n') + '\n';

  const core = r.menus.filter(m => m.core).reduce((a, m) => a + m.count, 0);
  out.push('', '## 메뉴별 사용', '', '화면을 연 횟수입니다. 버튼과 비서 도구는 넣지 않았습니다.', '',
    table(['메뉴', '구분', '횟수', '비율', '쓴 날(날짜)', '쓴 날(파일 합)'], r.menus.map(m => {
      const day = n => (m.daysPartial ? (n ? `${n} 이상` : '확인 불가') : String(n));
      return [m.label, m.core ? '핵심 4' : '', m.count, r.viewTotal ? pct(m.share) : '-', day(m.days), day(m.fileDays)];
    })), '',
    `핵심 4 합계: ${core}회${r.viewTotal ? ` (${pct(core / r.viewTotal)})` : ''}`);

  out.push('', '## 수정 후보 (실패가 남은 것)', '', '오류율은 실패 ÷ (성공 + 실패)입니다.', '',
    r.errors.length ? table(['구분', '이름', '실패', '성공', '오류율'], r.errors.map(e => [KIND_LABEL[e.kind], e.name, e.errors, e.ok ?? '확인 불가', e.rate === null ? '확인 불가' : pct(e.rate)])) : '- 실패 기록이 없습니다.');

  out.push('', '## 동결 후보 (기간 동안 0회)', '', '바로 지우지 말고 확인해 주세요. 버튼은 누른 것만 세고, 쓸 상황이 없었던 것도 0회입니다.');
  const list = (title, items, total, name = x => x) => {
    out.push('', `### ${title}${items ? ` ${items.length}개 / 전체 ${total}개` : ''}`, '');
    out.push(!items ? '- 확인 불가: 요약 파일은 상위 일부만 담아 0회인지 알 수 없습니다.' : items.length ? items.map(x => `\`${name(x)}\``).join(', ') : '- 없습니다.');
  };
  list('화면', r.freeze.views, r.totals.views, id => `${r.labels[id]}(${id})`);
  list('버튼(data-act)', r.freeze.acts, r.totals.acts);
  list('비서 도구', r.freeze.tools, r.totals.tools);
  if (r.uncountedActs.length) out.push('', `이름 규칙 때문에 앱이 세지 않는 버튼 ${r.uncountedActs.length}개는 뺐습니다.`);
  const u = r.unknown;
  if (u.views + u.acts + u.tools) out.push('', `지금 코드에 없는 이름: 화면 ${u.views}개, 버튼 ${u.acts}개, 도구 ${u.tools}개 (예전 버전의 기록일 수 있습니다)`);

  const c = r.tools.chat;
  out.push('', '## 비서 도구 상위', '', '표는 성공한 횟수입니다. 합계에는 실패도 들어갑니다.');
  const toolTable = (title, rows) => out.push('', `### ${title}`, '', rows.length ? table(['이름', '횟수'], rows.slice(0, top)) : '- 기록이 없습니다.');
  const hasLogs = r.used > r.summaries.length;
  if (hasLogs) { toolTable(`로컬(규칙으로 답함) 합계 ${c.local}회`, r.tools.local); toolTable(`AI가 고름 합계 ${c.ai}회`, r.tools.ai); }
  if (r.summaries.length) toolTable(`요약 파일 (로컬 ${c.mixedLocal}회, AI ${c.mixedAi}회, 도구별 구분 없음)`, r.tools.mixed);
  return out.join('\n') + '\n';
}
