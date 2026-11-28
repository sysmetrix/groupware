// GW 비서 · 사용 기록(순수 로직). 어떤 화면·버튼·비서 도구를 며칠에 몇 번 썼는지만 센다.
// 적는 것은 코드에 정해진 이름(화면 id, data-act 이름, 도구 이름)과 횟수뿐이다. 제목·본문·사람 이름·검색어·질문 내용은 적지 않는다.
// 이 브라우저에만 남고 어디로도 보내지 않는다. 사용자가 직접 내보내거나 지울 수 있다.
// briefing.mjs 뒤에 이어 붙는다: import 금지, DOM·localStorage 접근 금지, 최상위 비공개 이름은 us 접두.

export const USAGE_KEEP_DAYS = 60;
export const USAGE_KINDS = ['view', 'act', 'tool', 'toolAi'];
const US_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}(?::err)?$/;
const US_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const US_MAX_KEYS_PER_DAY = 400;

/** 한국 시간 기준 날짜(YYYY-MM-DD). */
export function usageDay(now = Date.now()) { return new Date(Number(now) + 9 * 3600000).toISOString().slice(0, 10); }

/** 저장된 값이 깨졌거나 예전 모양이어도 쓸 수 있는 모양으로 고친다. 이름 규칙에 안 맞는 키는 버린다. */
export function usageNormalize(log) {
  const out = {v: 1, days: {}};
  const days = log && typeof log === 'object' && log.days && typeof log.days === 'object' ? log.days : {};
  for (const [day, kinds] of Object.entries(days)) {
    if (!US_DAY_RE.test(day) || !kinds || typeof kinds !== 'object') continue;
    const d = {};
    for (const kind of USAGE_KINDS) {
      const src = kinds[kind];
      if (!src || typeof src !== 'object') continue;
      for (const [k, n] of Object.entries(src)) {
        if (!US_KEY_RE.test(k) || !Number.isFinite(n) || n <= 0) continue;
        (d[kind] ||= {})[k] = Math.min(Math.floor(n), 1e6);
      }
    }
    if (Object.keys(d).length) out.days[day] = d;
  }
  return out;
}

/** 한 번 썼음을 더한 새 기록을 돌려준다(원본은 건드리지 않는다). 이름 규칙에 안 맞으면 그대로 돌려준다. */
export function usageBump(log, kind, key, now = Date.now()) {
  const cur = usageNormalize(log);
  if (!USAGE_KINDS.includes(kind) || !US_KEY_RE.test(String(key || ''))) return cur;
  const day = usageDay(now);
  const d = cur.days[day] ||= {};
  const bucket = d[kind] ||= {};
  if (!(key in bucket) && Object.values(d).reduce((a, b) => a + Object.keys(b).length, 0) >= US_MAX_KEYS_PER_DAY) return cur;
  bucket[key] = (bucket[key] || 0) + 1;
  // 오래된 날은 지운다
  const cut = usageDay(Number(now) - USAGE_KEEP_DAYS * 86400000);
  for (const k of Object.keys(cur.days)) if (k < cut) delete cur.days[k];
  return cur;
}

// 자주 하는 일: 핵심 4(docs/design/principles.md '메뉴 체계')와 그 밖의 일(etc). 화면은 VIEW_PARENT 로 묶인 id, 나머지는 data-act·비서 도구 이름이다.
// 버튼은 조회·준비·저장하는 것만 센다(거르기·넘기기·닫기는 빼서 횟수가 부풀지 않게 한다).
const usWords = s => s.split(' ');
const usJourney = (id, label, view, act, tool, etc = false) => ({id, label, etc, view: usWords(view), act: usWords(act), tool: usWords(tool)});
export const USAGE_JOURNEYS = [
  usJourney('todo', '할 일', 'today mytodo board',
    'tdNew tdAdd tdSave tdSel tdToggle tdDel tdSubAdd tdSubToggle tdBulk tdKanMove tdWrap addTodo todoEdit todoDel todoFromSel todoFromExtract markDone batchTodo focusStart focusNext boardMove homeNext homeOpenToday',
    'list_tasks list_deadlines list_todos add_todo mark_task plan_priorities check_risks prepare_task_screen'),
  usJourney('calendar', '일정·예약', 'calendar gcal resource',
    'calDay calItem calReserve resSel resBook gcalNew gcalSave',
    'get_schedule prepare_schedule busy_days find_when get_resource_status reserve_vehicle get_gcal_access get_gcal_sync'),
  usJourney('attendance', '근태·연차', 'attendance',
    'quickAtt autoFillAtt attDay goAttendanceDay csvAtt',
    'prepare_leave_request prepare_trip_request prepare_overtime_request get_leave_status check_leave_day get_work_hours get_my_attendance get_staff_status list_my_requests'),
  usJourney('budget', '예산 집행', 'budget',
    'ledger ledgerRow ledgerSearch bOpen bPick bSearch csvBudget csvLedger richBudget openPay payRun goodsRun expAdd expGo cduReload cduCsv etxReload etxCsv bpAdd bpImport bpConfirm',
    'get_budget search_budget budget_forecast get_unresolved_evidence'),
  usJourney('approval', '결재·메일', 'approval mail notifications',
    'apOpen selDoc selMail mailToDraft autoFillMail quickDraft selectPlanForResult notificationOpen',
    'list_approvals prepare_approval_queue prepare_draft list_mail read_mail digest_mail read_doc draft_mail_reply compose_mail check_sent_reply list_sent_mail list_alerts', true),
  {id: 'chat', label: '비서에게 묻기', etc: true, view: [], act: ['chatSend', 'chatChip'], tool: ['*']},
];

/** 기간 요약: 날짜 범위, 쓴 날 수, 종류별 합계(많은 순), 자주 하는 일별 횟수, 한 번도 안 쓴 화면. */
export function usageSummary(log, {now = Date.now(), days = 28, views = []} = {}) {
  const cur = usageNormalize(log);
  const to = usageDay(now), from = usageDay(Number(now) - (Math.max(1, days) - 1) * 86400000);
  const sum = Object.fromEntries(USAGE_KINDS.map(k => [k, {}]));
  let activeDays = 0;
  for (const [day, kinds] of Object.entries(cur.days)) {
    if (day < from || day > to) continue;
    activeDays++;
    for (const kind of USAGE_KINDS) for (const [k, n] of Object.entries(kinds[kind] || {})) sum[kind][k] = (sum[kind][k] || 0) + n;
  }
  const rank = o => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = o => Object.values(o).reduce((a, b) => a + b, 0);
  const tools = {...sum.tool};
  for (const [k, n] of Object.entries(sum.toolAi)) tools[k] = (tools[k] || 0) + n;
  const okTools = Object.fromEntries(Object.entries(tools).filter(([k]) => !k.endsWith(':err')));
  const pick = (o, names) => names.includes('*') ? total(o) : names.reduce((a, n) => a + (o[n] || 0), 0);
  const journeys = USAGE_JOURNEYS.map(j => ({id: j.id, label: j.label, etc: j.etc, views: pick(sum.view, j.view), acts: pick(sum.act, j.act), tools: pick(okTools, j.tool)})).map(j => ({...j, total: j.views + j.acts + j.tools}));
  const confirmOk = sum.act.chatConfirm || 0, confirmCancel = sum.act.chatCancel || 0;
  const confirmTotal = confirmOk + confirmCancel;
  const toolErrTotal = Object.entries(tools).filter(([k]) => k.endsWith(':err')).reduce((a, [, v]) => a + v, 0);
  return {
    from, to, days, activeDays,
    views: rank(sum.view), acts: rank(sum.act), tools: rank(tools),
    toolErrors: rank(Object.fromEntries(Object.entries(tools).filter(([k]) => k.endsWith(':err')))),
    chat: {local: total(sum.tool), ai: total(sum.toolAi)},
    roi: {confirmOk, confirmCancel, confirmRate: confirmTotal ? Math.round((confirmOk / confirmTotal) * 100) : null, toolErrTotal},
    journeys,
    unusedViews: views.filter(v => !sum.view[v]),
  };
}

/** 내보내기용 글(마크다운). 사람이 읽고 그대로 붙여 넣을 수 있는 모양. errors 는 [{at, where, msg}]. */
export function usageReport(log, {now = Date.now(), days = 28, views = [], version = '', errors = []} = {}) {
  const s = usageSummary(log, {now, days, views});
  const table = (rows, n = 15) => rows.length ? rows.slice(0, n).map(([k, v]) => `- ${k}: ${v}`).join('\n') : '- (없음)';
  const errs = (Array.isArray(errors) ? errors : []).filter(e => e && Number(e.at) >= Number(now) - days * 86400000);
  const byWhere = {};
  for (const e of errs) { const w = String(e.where || '').replace(/[^\w가-힣 .:-]/g, '').slice(0, 40) || '(알 수 없음)'; byWhere[w] = (byWhere[w] || 0) + 1; }
  const lines = etc => s.journeys.filter(j => j.etc === etc).map(j => `- ${j.label}: ${j.total}회 (화면 ${j.views}, 버튼 ${j.acts}, 비서 도구 ${j.tools})`);
  return [
    `# GW 비서 사용 기록 ${s.from} ~ ${s.to}`,
    '',
    `버전 ${version || '(알 수 없음)'} · 쓴 날 ${s.activeDays}일 / ${s.days}일`,
    '화면·버튼·도구의 이름과 횟수만 들어 있습니다. 제목·본문·이름·질문 내용은 없습니다.',
    '',
    '## 자주 하는 일',
    ...lines(false),
    '',
    '## 그 밖의 일',
    ...lines(true),
    '',
    '## 화면',
    table(s.views),
    '',
    `## 한 번도 열지 않은 화면\n${s.unusedViews.length ? s.unusedViews.map(v => `- ${v}`).join('\n') : '- (없음)'}`,
    '',
    '## 버튼(많이 쓴 순)',
    table(s.acts, 25),
    '',
    `## 비서 도구 (규칙으로 답함 ${s.chat.local}회, AI가 고름 ${s.chat.ai}회)`,
    table(s.tools, 25),
    '',
    '## 비서 효율 지표',
    `- 확인 카드 확정: ${s.roi.confirmOk}회 · 취소: ${s.roi.confirmCancel}회${s.roi.confirmRate != null ? ` (확정률 ${s.roi.confirmRate}%)` : ''}`,
    `- 도구 실행 실패: ${s.roi.toolErrTotal}회`,
    '',
    '## 오류가 난 곳',
    table(Object.entries(byWhere).sort((a, b) => b[1] - a[1])),
    '',
  ].join('\n');
}
