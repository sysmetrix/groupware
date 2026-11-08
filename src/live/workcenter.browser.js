/*
 * GW 통합 업무센터 (BWYF groupware integrated work center) v2.0.0
 * One full-screen page injected into the logged-in https://gw.bwyf.or.kr tab.
 *
 * - Data: window.BWYFGW (read-only collector/search/ledger APIs) + window.BWYFGW_REPORT (analysis).
 * - Processing: the right-hand pane embeds the groupware's own screens (approval document
 *   popup, board article, attendance request, mail box) so 결재·접수·배부·발송·회신 are done
 *   with the native buttons by the user. This script itself never writes to the groupware.
 * - Local state (done/snooze/to-do/settings/history cache) lives in this browser's localStorage.
 */
(() => {
  'use strict';
  const VERSION = '2.0.0';
  let api = null;
  // Nothing is added to the groupware page until open() is called (background collection stays invisible).
  const lazy = {
    version: VERSION,
    open() { if (!api) api = boot(); api.open(); },
    close() { if (api) api.close(); },
    destroy() { if (api) api.destroy(); api = null; },
    refresh() { if (!api) api = boot(); return api.refresh(); },
    install(src) { if (typeof src !== 'string' || src.length < 1000) return false; try { localStorage.setItem('bwyfgw:wc:src', src); return true; } catch { return false; } },
    state() { return api ? api.state() : {booted: false}; },
  };
  if (window.BWYFGW_WC && typeof window.BWYFGW_WC.destroy === 'function') { try { window.BWYFGW_WC.destroy(); } catch {} }
  window.BWYFGW_WC = Object.freeze(lazy);

  function boot() {
  const GW = window.BWYFGW, R = window.BWYFGW_REPORT;
  if (!GW || !R) throw new Error('BWYFGW 수집기와 분석 모듈이 먼저 로드되어야 합니다.');

  // ---------- storage ----------
  const LS = 'bwyfgw:wc:';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(LS + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(LS + k); } catch {} },
  };
  const DEFAULT_SETTINGS = {refreshMin: 5, notify: false, budget: [{project: 'A201', label: '전략경영실운영', filter: '노121'}], urgentWords: [], mailCount: 100, days: 14};
  const S = {
    settings: {...DEFAULT_SETTINGS, ...store.get('settings', {})},
    done: store.get('done', {}), snooze: store.get('snooze', {}), todos: store.get('todos', []), newKeys: new Set(store.get('newKeys', [])),
    raw: null, a: null, view: 'today', filter: {area: 'all', q: '', onlyNew: false, showDone: false}, apTab: 'distWaiting', mailFilter: 'all',
    sel: null, paneUrl: '', paneExtract: null, loading: false, error: '', lastRefresh: null, toast: '',
    routing: store.get('routing', null), search: {kw: '', types: ['doc', 'mail', 'board', 'file', 'person'], res: null, busy: false},
    budget: {project: '', filter: '', table: null, ledger: null, busy: false, q: ''}, att: {month: '', rows: null, busy: false},
    weekly: '', mailSearch: {kw: '', res: null}, open: false,
  };
  const saveLocal = () => { store.set('done', S.done); store.set('snooze', S.snooze); store.set('todos', S.todos); store.set('settings', S.settings); store.set('newKeys', [...S.newKeys]); };

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const won = n => Number(n || 0).toLocaleString('ko-KR');
  const ymd8 = s => (s && /^\d{8}/.test(s)) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || '');
  const hm4 = s => (s && /^\d{4}$/.test(s)) ? `${s.slice(0, 2)}:${s.slice(2)}` : (s || '');
  const dtm12 = s => (s && /^\d{12}/.test(s)) ? `${ymd8(s)} ${s.slice(8, 10)}:${s.slice(10, 12)}` : ymd8(s);
  const mins = m => m === null || m === undefined ? '-' : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const kstToday = () => R.kstNow(new Date()).date;
  const nowText = () => { const k = R.kstNow(new Date()); return `${String(k.hh).padStart(2, '0')}:${String(k.mm).padStart(2, '0')}`; };
  const ddayText = n => n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`;
  const PRI = {high: '긴급', medium: '보통', low: '참고'};
  const download = (name, text, type = 'text/plain;charset=utf-8') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const copy = async text => { try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); } catch { toast('복사하지 못했습니다. 직접 선택해 복사하세요.'); } };
  const isDone = k => !!S.done[k];
  const isSnoozed = k => S.snooze[k] && S.snooze[k] > Date.now();

  // ---------- shell ----------
  const host = document.createElement('div');
  host.id = 'bwyfgw-workcenter';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:none';
  const root = host.attachShadow({mode: 'open'});
  const fab = document.createElement('div');
  fab.id = 'bwyfgw-wc-fab';
  fab.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483500;background:#1a73e8;color:#fff;font:600 13px "Malgun Gothic",sans-serif;padding:9px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;user-select:none';
  fab.textContent = '업무센터';
  fab.title = '통합 업무센터 열기 (Alt+G)';
  fab.addEventListener('click', () => open());
  document.body.append(host, fab);

  root.innerHTML = `<style>
:host{all:initial}
*{box-sizing:border-box}
.wc{position:absolute;inset:0;display:grid;grid-template-columns:150px minmax(420px,1fr) minmax(380px,46%);grid-template-rows:52px 1fr;background:#f4f6f9;color:#1d2330;font:13.5px/1.5 "Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif}
.wc.nopane{grid-template-columns:150px 1fr 0}
header{grid-column:1/4;display:flex;align-items:center;gap:10px;padding:0 14px;background:#1d2b4f;color:#fff}
header .ttl{font-weight:700;font-size:15px;white-space:nowrap}header .ttl small{font-weight:400;opacity:.7;margin-left:6px}
header input{flex:1;max-width:520px;border:0;border-radius:6px;padding:7px 10px;font:inherit}
header .meta{font-size:12px;opacity:.85;white-space:nowrap}
header button,.btn{border:1px solid #c9d1de;background:#fff;color:#1d2330;border-radius:6px;padding:5px 10px;font:inherit;cursor:pointer;white-space:nowrap}
header button{background:#2e3f6b;color:#fff;border-color:#40548a}
.btn.primary{background:#1a73e8;color:#fff;border-color:#1a73e8}.btn.warn{color:#c5221f;border-color:#f1b0ad}.btn.sm{padding:2px 7px;font-size:12px}
.btn:disabled{opacity:.5;cursor:default}
nav{background:#fff;border-right:1px solid #e1e5ec;padding:8px 0;overflow:auto}
nav a{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;color:#33415c;text-decoration:none;cursor:pointer;border-left:3px solid transparent}
nav a.on{background:#eaf1fe;border-left-color:#1a73e8;color:#1a5fc2;font-weight:700}
nav a .n{font-size:11.5px;background:#e7ebf2;border-radius:999px;padding:0 7px;color:#33415c}nav a .n.hot{background:#fde3e1;color:#c5221f}
nav .sep{height:1px;background:#eef0f4;margin:6px 0}
main{overflow:auto;padding:14px 16px}
aside{overflow:hidden;border-left:1px solid #e1e5ec;background:#fff;display:flex;flex-direction:column}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px}
.card{background:#fff;border:1px solid #e1e5ec;border-radius:9px;padding:9px 12px;cursor:pointer}
.card .l{color:#6b7280;font-size:12px}.card .v{font-size:21px;font-weight:700}.card .s{color:#6b7280;font-size:11.5px}.card.hot .v{color:#c5221f}
h2{font-size:15px;margin:4px 0 10px}h3{font-size:14px;margin:14px 0 6px}
.bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}
.chip{border:1px solid #c9d1de;background:#fff;border-radius:999px;padding:2px 10px;cursor:pointer;font-size:12.5px}.chip.on{background:#1a73e8;border-color:#1a73e8;color:#fff}
.list{background:#fff;border:1px solid #e1e5ec;border-radius:9px;overflow:hidden}
.row{display:grid;grid-template-columns:62px 1fr auto;gap:8px;padding:8px 12px;border-bottom:1px solid #eef0f4;cursor:pointer;align-items:start}
.row:last-child{border-bottom:0}.row:hover{background:#f7f9fc}.row.sel{background:#eaf1fe}.row.done{opacity:.5}
.row .t{font-weight:600;word-break:break-all}.row .d{color:#6b7280;font-size:12px}.row .w{color:#6b7280;font-size:12px;white-space:nowrap;text-align:right}
.pill{display:inline-block;padding:0 7px;border-radius:999px;font-size:11px;border:1px solid currentColor;margin-right:4px;white-space:nowrap}
.pill.high{color:#c5221f}.pill.medium{color:#d56e0c}.pill.low{color:#5f6368}.pill.new{color:#1a73e8}.pill.ok{color:#188038}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e1e5ec;border-radius:9px;overflow:hidden;font-size:12.8px}
th,td{padding:6px 8px;border-bottom:1px solid #eef0f4;text-align:left;vertical-align:top}th{color:#6b7280;font-weight:600;background:#fafbfc;position:sticky;top:0}
tr.click{cursor:pointer}tr.click:hover td{background:#f7f9fc}tr.sel td{background:#eaf1fe}tr.bad td{background:#fff4f3}
.num{text-align:right;white-space:nowrap}.nowrap{white-space:nowrap}.muted{color:#6b7280;font-size:12px}.err{color:#c5221f}
.lv-관 td,.lv-항 td{font-weight:700}.lv-목 td:first-child{padding-left:18px}.lv-세 td:first-child{padding-left:30px}
.rate{height:5px;background:#e7ebf2;border-radius:3px;margin-top:2px}.rate i{display:block;height:100%;background:#1a73e8;border-radius:3px}.rate i.low{background:#d56e0c}.rate i.over{background:#c5221f}
.pane-h{padding:12px 14px;border-bottom:1px solid #eef0f4;max-height:52%;overflow:auto}
.pane-h .t{font-size:15px;font-weight:700;margin-bottom:4px;word-break:break-all}
.kv{display:grid;grid-template-columns:86px 1fr;gap:2px 8px;font-size:12.5px;margin:6px 0}.kv b{color:#6b7280;font-weight:400}
.acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.box{border:1px solid #e1e5ec;border-radius:8px;padding:8px 10px;margin-top:8px;background:#fafbfc}.box.tip{background:#f3f8ff;border-color:#cfe0fb}.box.warn{background:#fff8ec;border-color:#f6d9a8}
.frame{flex:1;position:relative;background:#f4f6f9}.frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
.frame .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6b7280;padding:20px;text-align:center}
.toast{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);background:#1d2330;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;z-index:5}
.spin{display:inline-block;width:12px;height:12px;border:2px solid #c9d1de;border-top-color:#1a73e8;border-radius:50%;animation:sp 1s linear infinite;vertical-align:-2px}@keyframes sp{to{transform:rotate(360deg)}}
textarea,input.f,select.f{font:inherit;border:1px solid #c9d1de;border-radius:6px;padding:6px 8px;background:#fff}
textarea{width:100%;min-height:260px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.hl{background:#fff1a8}
.day{margin-bottom:10px}.day .dh{font-weight:700;margin-bottom:3px}.day .it{padding:4px 10px;background:#fff;border:1px solid #e1e5ec;border-radius:7px;margin-bottom:4px}
kbd{font:11px monospace;border:1px solid #c9d1de;border-bottom-width:2px;border-radius:4px;padding:0 4px;background:#fff}
</style><div class="wc nopane" id="wc"><header><div class="ttl">GW 통합 업무센터<small>v${VERSION} · 읽기 전용</small></div><input id="gsearch" placeholder="결재문서 본문·메일·게시판·첨부·인물 통합검색 (/)" autocomplete="off"><span class="meta" id="meta"></span><button data-act="refresh" title="새로고침 (r)">새로고침</button><button data-act="close" title="닫기 (Esc)">닫기</button></header><nav id="nav"></nav><main id="main"></main><aside id="pane"></aside></div>`;
  const $ = sel => root.querySelector(sel);

  // ---------- data ----------
  async function refresh({silent = false} = {}) {
    if (S.loading) return;
    S.loading = true; S.error = '';
    if (!silent) renderMeta();
    try {
      const raw = await GW.collect({budget: S.settings.budget, mailCount: S.settings.mailCount, days: S.settings.days});
      const prev = store.get('state', null);
      const usablePrev = prev && prev.at && Date.parse(prev.at) < Date.parse(raw.collectedAt) ? prev : null;
      const a = R.analyze(raw, usablePrev);
      applyUrgentWords(a);
      const fresh = a.actions.filter(x => x.isNew);
      for (const x of fresh) S.newKeys.add(x.key);
      if (!raw.sessionExpired) store.set('state', R.nextState(raw, usablePrev));
      // forget local marks for items that no longer exist
      const live = new Set(a.actions.map(x => x.key));
      for (const k of Object.keys(S.snooze)) if (!live.has(k) || S.snooze[k] < Date.now()) delete S.snooze[k];
      S.raw = raw; S.a = a; S.lastRefresh = new Date();
      if (raw.sessionExpired) S.error = '로그인 세션이 만료되었습니다. 그룹웨어에 다시 로그인한 뒤 새로고침하세요.';
      saveLocal();
      notifyNew(fresh.filter(x => x.priority === 'high'));
    } catch (e) {
      S.error = e && e.message || String(e);
    } finally { S.loading = false; }
    render();
  }

  function applyUrgentWords(a) {
    const words = (S.settings.urgentWords || []).filter(Boolean);
    if (!words.length) return;
    const re = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
    for (const x of a.actions) if (x.priority !== 'high' && re.test(x.title)) { x.priority = 'high'; x.detail += ' · 내 긴급 키워드'; }
    a.actions.sort((p, q) => ({high: 0, medium: 1, low: 2}[p.priority] - {high: 0, medium: 1, low: 2}[q.priority]) || String(q.when).localeCompare(String(p.when)));
  }

  function notifyNew(items) {
    if (!items.length) return;
    toast(`새 긴급 항목 ${items.length}건: ${items[0].title.slice(0, 40)}`);
    if (S.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('GW 업무센터 · 새 긴급 항목 ' + items.length + '건', {body: items.slice(0, 3).map(x => `[${x.kind}] ${x.title}`).join('\n'), tag: 'bwyfgw-wc'}); } catch {}
    }
  }

  async function loadRouting(force = false) {
    const fresh = S.routing && S.routing.fetchedAt && Date.now() - Date.parse(S.routing.fetchedAt) < 12 * 3600_000;
    if (fresh && !force) return S.routing;
    try { S.routing = await GW.routingHistory({days: 180, size: 500}); store.set('routing', S.routing); } catch (e) { toast('배부·접수 이력을 읽지 못했습니다: ' + e.message); }
    return S.routing;
  }

  // ---------- timers & keys ----------
  let timer = null;
  function schedule() {
    clearInterval(timer);
    const m = Number(S.settings.refreshMin || 0);
    if (m > 0) timer = setInterval(() => refresh({silent: true}), m * 60_000);
  }
  const onDocKey = e => {
    if (e.altKey && (e.key === 'g' || e.key === 'G' || e.key === 'ㅎ')) { e.preventDefault(); e.stopPropagation(); S.open ? close() : open(); return; }
    if (S.open) handleKey(e);
  };
  document.addEventListener('keydown', onDocKey, true);
  function handleKey(e) {
    const t = e.composedPath()[0] || {};
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName || '');
    e.stopPropagation(); // keep groupware shortcuts from firing behind the work center
    if (e.key === 'Escape') { if (typing) { t.blur(); return; } if (S.paneUrl) { S.paneUrl = ''; renderPane(); } else close(); return; }
    if (typing) {
      if (e.key !== 'Enter' || e.isComposing) return;
      if (t.id === 'gsearch' || t.id === 'sq') { S.search.kw = t.value.trim(); runSearch(); }
      else if (t.id === 'mailq') { const kw = t.value.trim(); S.mailSearch.kw = kw; if (kw.length >= 2) GW.search(kw, {types: ['mail'], pageSize: 20}).then(r => { S.mailSearch.res = r; renderMain(); }).catch(err => toast(err.message)); }
      else if (t.id === 'tdTitle') { addTodo(t.value.trim(), ($('#tdDue') || {}).value || ''); renderMain(); }
      else if (t.id === 'bcode' || t.id === 'bfilter') { S.budget.project = $('#bcode').value.trim(); S.budget.filter = $('#bfilter').value.trim(); loadBudget(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === '/') { e.preventDefault(); $('#gsearch').focus(); return; }
    if (k === 'r') { refresh(); return; }
    if (/^[1-9]$/.test(k)) { const v = VIEWS[Number(k) - 1]; if (v) { S.view = v.id; render(); } return; }
    if (S.view === 'today' && ['j', 'k', 'ArrowDown', 'ArrowUp'].includes(k)) { e.preventDefault(); moveSel(k === 'j' || k === 'ArrowDown' ? 1 : -1); return; }
    const x = selectedAction();
    if (!x) return;
    if (k === 'Enter') openInPane(x.url);
    else if (k === 'o') window.open(x.url, '_blank');
    else if (k === 'x') toggleDone(x.key);
    else if (k === 's') snooze(x.key);
  }
  // keep groupware shortcuts from firing while the work center is open
  root.addEventListener('keyup', e => e.stopPropagation());

  // ---------- views ----------
  const VIEWS = [
    {id: 'today', label: '오늘 할 일'}, {id: 'approval', label: '결재·문서유통'}, {id: 'mail', label: '메일'}, {id: 'search', label: '통합검색'},
    {id: 'budget', label: '예산 집행'}, {id: 'attendance', label: '근태·연차'}, {id: 'calendar', label: '일정·기한'}, {id: 'todo', label: '내 할 일'},
    {id: 'report', label: '보고서'}, {id: 'settings', label: '설정'},
  ];
  const queue = () => {
    if (!S.a) return [];
    const f = S.filter;
    return S.a.actions.filter(x => (f.showDone || (!isDone(x.key) && !isSnoozed(x.key)))
      && (f.area === 'all' || x.area === f.area) && (!f.onlyNew || S.newKeys.has(x.key))
      && (!f.q || (x.title + x.detail + x.kind).toLowerCase().includes(f.q.toLowerCase())));
  };
  const selectedAction = () => S.sel && S.sel.type === 'action' ? S.a && S.a.actions.find(x => x.key === S.sel.key) : null;
  function moveSel(step) {
    const q = queue();
    if (!q.length) return;
    let i = q.findIndex(x => S.sel && S.sel.key === x.key);
    i = Math.max(0, Math.min(q.length - 1, i + step));
    selectAction(q[i].key);
  }

  function render() {
    if (!S.open) return;
    renderMeta(); renderNav(); renderMain(); renderPane();
    fab.textContent = `업무센터${S.a ? ' ' + queue().filter(x => x.priority === 'high').length : ''}`;
  }
  function renderMeta() {
    const m = $('#meta');
    if (!m) return;
    m.innerHTML = S.loading ? '<span class="spin"></span> 읽는 중…' : `${S.lastRefresh ? `갱신 ${nowTextOf(S.lastRefresh)} · ${S.raw ? S.raw.durationMs : '-'}ms` : ''}${S.settings.refreshMin ? ` · 자동 ${S.settings.refreshMin}분` : ''}${S.error ? ` · <span style="color:#ffb4ab">${esc(S.error)}</span>` : ''}`;
  }
  const nowTextOf = d => { const k = R.kstNow(d); return `${String(k.hh).padStart(2, '0')}:${String(k.mm).padStart(2, '0')}`; };
  function renderNav() {
    const s = S.a && S.a.summary;
    const q = queue();
    const counts = {
      today: q.length, approval: s ? s.approvalAction + (s.sendWaiting || 0) : '', mail: s ? s.mailUnread : '', attendance: S.a ? S.a.anomalies.length : '',
      todo: S.todos.filter(t => !t.done).length, calendar: S.a ? S.a.deadlines.length : '',
    };
    const hot = {today: q.some(x => x.priority === 'high'), approval: s && s.approvalAction > 0, attendance: S.a && S.a.anomalies.length > 0};
    $('#nav').innerHTML = VIEWS.map((v, i) => `${i === 8 ? '<div class="sep"></div>' : ''}<a data-act="view" data-v="${v.id}" class="${S.view === v.id ? 'on' : ''}" title="${i + 1}"><span>${esc(v.label)}</span>${counts[v.id] !== undefined && counts[v.id] !== '' ? `<span class="n ${hot[v.id] ? 'hot' : ''}">${counts[v.id]}</span>` : ''}</a>`).join('')
      + `<div class="sep"></div><div class="muted" style="padding:6px 14px;line-height:1.7"><kbd>j</kbd><kbd>k</kbd> 이동 <kbd>Enter</kbd> 열기<br><kbd>o</kbd> 새 창 <kbd>x</kbd> 완료 <kbd>s</kbd> 미루기<br><kbd>/</kbd> 검색 <kbd>r</kbd> 새로고침<br><kbd>Alt</kbd>+<kbd>G</kbd> 열기·닫기</div>`;
  }
  function renderMain() {
    const el = $('#main');
    if (!S.a && !S.loading && !S.error) { el.innerHTML = '<p class="muted">새로고침을 눌러 그룹웨어 자료를 읽어 오세요.</p>'; return; }
    if (!S.a) { el.innerHTML = S.error ? `<p class="err">${esc(S.error)}</p>` : '<p><span class="spin"></span> 그룹웨어 자료를 읽는 중입니다…</p>'; return; }
    const fn = {today: vToday, approval: vApproval, mail: vMail, search: vSearch, budget: vBudget, attendance: vAttendance, calendar: vCalendar, todo: vTodo, report: vReport, settings: vSettings}[S.view] || vToday;
    el.innerHTML = fn();
    if (S.view === 'report') { const f = $('#briefFrame'); if (f) f.srcdoc = R.renderHtml(S.a); }
    if (S.view === 'budget' && !S.budget.table && !S.budget.busy) loadBudget();
    if (S.view === 'attendance' && !S.att.rows && !S.att.busy) loadAttendance();
    if (S.view === 'approval' && ['distWaiting', 'deptWaiting'].includes(S.apTab) && !S.routing) loadRouting().then(() => S.view === 'approval' && renderMain());
  }

  function vToday() {
    const s = S.a.summary, q = queue();
    const card = (label, v, sub, act, hot) => `<div class="card ${hot ? 'hot' : ''}" data-act="${act}">${'<div class="l">' + esc(label) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(sub) + '</div>'}</div>`;
    const areas = ['all', '결재', '메일', '공지', '근태'];
    const newCount = S.a.actions.filter(x => S.newKeys.has(x.key)).length;
    const dl = S.a.deadlines.filter(x => x.dday >= 0 && x.dday <= 7);
    return `<div class="cards">
${card('결재·접수·배부', s.approvalAction + '건', `결재 ${s.pending ?? '-'} · 접수 ${s.deptWaiting ?? '-'} · 배부 ${s.distWaiting ?? '-'}`, 'goApproval', s.approvalAction > 0)}
${card('발송 대기', (s.sendWaiting ?? '-') + '건', `반려/회수 ${s.rejectedSubmitted} · 임시보관 ${s.drafts ?? '-'}`, 'goApproval', s.rejectedSubmitted > 0)}
${card('안 읽은 메일', s.mailUnread + '건', `받은메일함 ${s.inboxTotal ?? '-'}`, 'goMail', s.mailUnread > 0)}
${card('근태 확인', S.a.anomalies.length + '건', `잔여 연차 ${s.leaveRemaining ?? '-'}일`, 'goAttendance', S.a.anomalies.length > 0)}
${card('7일 내 기한', dl.length + '건', dl[0] ? `${dl[0].date.slice(5)} ${dl[0].title.slice(0, 14)}` : '제목 기준', 'goCalendar', dl.some(x => x.dday <= 2))}
${card('안 읽은 공지', (s.noticeUnread ?? '-') + '건', `미열람 열람문서 ${s.viewingUnread ?? '-'}`, 'goAreaNotice', false)}
</div>
<div class="bar">${areas.map(a => `<span class="chip ${S.filter.area === a ? 'on' : ''}" data-act="area" data-v="${a}">${a === 'all' ? '전체' : a}</span>`).join('')}
<span class="chip ${S.filter.onlyNew ? 'on' : ''}" data-act="onlyNew">새 항목 ${newCount}</span><span class="chip ${S.filter.showDone ? 'on' : ''}" data-act="showDone">완료·미룬 항목 보기</span>
<input class="f" id="qfilter" placeholder="목록 안에서 찾기" value="${esc(S.filter.q)}" style="flex:1;min-width:120px">${newCount ? '<button class="btn sm" data-act="clearNew">새 표시 모두 지우기</button>' : ''}</div>
<div class="list">${q.length ? q.map(x => actionRow(x)).join('') : '<div class="row"><div></div><div class="muted">처리할 항목이 없습니다.</div><div></div></div>'}</div>
<p class="muted">항목을 누르면 오른쪽에 그룹웨어 원래 화면이 열려 그 자리에서 결재·접수·배부·발송을 처리할 수 있습니다. 완료 표시는 이 화면에서만 숨기는 개인 메모이며 그룹웨어 상태는 바꾸지 않습니다.</p>`;
  }
  const actionRow = x => `<div class="row ${S.sel && S.sel.key === x.key ? 'sel' : ''} ${isDone(x.key) ? 'done' : ''}" data-act="selAction" data-k="${esc(x.key)}"><div><span class="pill ${x.priority}">${PRI[x.priority]}</span>${S.newKeys.has(x.key) ? '<br><span class="pill new">새</span>' : ''}</div><div><div class="t">${esc(x.title)}</div><div class="d">${esc(x.area)} · ${esc(x.kind)} · ${esc(x.detail)}</div></div><div class="w">${esc(String(x.when).slice(0, 16))}${isSnoozed(x.key) ? '<br>미룸' : ''}${isDone(x.key) ? '<br>완료' : ''}</div></div>`;

  function vApproval() {
    const lists = S.a.approval.lists, counts = S.a.approval.counts;
    const tabs = [['distWaiting', '배부 대기'], ['deptWaiting', '부서 접수 대기'], ['pending', '결재 대기'], ['sendWaiting', '발송 대기'], ['viewing', '열람문서'], ['submitted', '내 상신문서']];
    const l = lists[S.apTab];
    const withRec = ['distWaiting', 'deptWaiting'].includes(S.apTab);
    const hist = S.routing ? (S.apTab === 'distWaiting' ? S.routing.dist : S.routing.dept) : [];
    const target = S.apTab === 'distWaiting' ? 'toDept' : 'toEmp';
    const rows = l && !l.error ? l.docs.map(d => {
      const rec = withRec && hist.length ? R.recommendRouting(d, hist, {target, limit: 2}) : [];
      const grp = rec.group;
      const recCell = grp && grp.targets.length >= 3 ? `<b>${grp.targets.length}곳 동시 ${S.apTab === 'distWaiting' ? '배부' : '접수'}</b> <span class="muted">지난 비슷한 문서 기준</span><div class="muted">${esc(grp.targets.slice(0, 4).join(', '))}${grp.targets.length > 4 ? ' 외' : ''}</div>` : rec.length ? rec.map(r => `${esc(r.name)} <span class="muted">${r.confidence}%·${r.count}건</span>`).join('<br>') : `<span class="muted">${S.routing ? '비슷한 이력 없음' : '<span class="spin"></span>'}</span>`;
      return `<tr class="click ${S.sel && S.sel.type === 'doc' && S.sel.docId === d.docId ? 'sel' : ''}" data-act="selDoc" data-kind="${S.apTab}" data-id="${esc(d.docId)}"><td>${d.unread ? '<span class="pill high">미열람</span>' : ''}${esc(d.title)}${d.attachments ? ` <span class="muted">첨부${d.attachments}</span>` : ''}<div class="muted">${esc(d.docNo)}</div></td><td>${esc(d.sender || d.drafter || d.drafterDept)}</td><td class="nowrap">${esc(d.status)}</td>${withRec ? `<td>${recCell}</td>` : ''}<td class="nowrap">${esc(String(d.date).slice(0, 16))}</td></tr>`;
    }).join('') : '';
    return `<h2>전자결재·문서유통</h2><div class="bar">${tabs.map(([k, n]) => { const c = lists[k]; const cnt = c ? (c.total ?? c.docs.length) : '-'; return `<span class="chip ${S.apTab === k ? 'on' : ''}" data-act="apTab" data-v="${k}">${n} ${cnt}</span>`; }).join('')}${l ? `<a class="btn sm" href="${esc(l.url)}" target="_blank">그룹웨어 목록</a>` : ''}${withRec ? `<button class="btn sm" data-act="reloadRouting">추천 이력 다시 읽기</button>` : ''}</div>
${l && l.error ? `<p class="err">${esc(l.message)}</p>` : `<table><tr><th>제목</th><th>보낸 곳/기안</th><th>상태</th>${withRec ? `<th>${S.apTab === 'distWaiting' ? '배부 추천 부서' : '접수 추천 담당자'}</th>` : ''}<th>일시</th></tr>${rows || `<tr><td colspan="5" class="muted">없음</td></tr>`}</table>`}
${withRec ? `<p class="muted">추천은 최근 180일 ${S.apTab === 'distWaiting' ? '배부 완료' : '부서 접수 완료'} 이력 ${hist.length}건에서 같은 발송 부서와 제목 단어가 겹치는 처리 결과를 집계한 값입니다. 최종 결정은 문서를 보고 하세요.</p>` : ''}
<h3>메뉴별 건수</h3><table><tr><th>메뉴</th><th class="num">건수</th><th class="num">전체</th></tr>${counts.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.count}</td><td class="num muted">${c.total ?? ''}</td></tr>`).join('')}</table>`;
  }

  function vMail() {
    const m = S.a.mail;
    const all = [...(S.raw.data.mail?.inbox.records || []), ...(S.raw.data.mail?.otherUnseen || [])];
    const needReply = new Set(m.recentAction.map(x => x.box + x.uid));
    const f = S.mailFilter;
    const rows = all.filter(x => f === 'all' || (f === 'unread' && !x.seen) || (f === 'reply' && needReply.has(x.box + x.uid)) || (f === 'attach' && x.attach) || (f === 'other' && x.box !== 'INBOX'));
    const sr = S.mailSearch.res;
    return `<h2>메일 <a class="btn sm" href="${esc(m.url)}" target="_blank">받은메일함</a></h2>
<div class="bar">${[['all', '전체'], ['unread', '안 읽음'], ['reply', '회신 확인'], ['attach', '첨부'], ['other', '내 메일함']].map(([k, n]) => `<span class="chip ${f === k ? 'on' : ''}" data-act="mailFilter" data-v="${k}">${n}</span>`).join('')}
<input class="f" id="mailq" placeholder="메일 본문까지 검색 (Enter)" value="${esc(S.mailSearch.kw)}" style="flex:1;min-width:160px"></div>
${sr ? `<h3>"${esc(sr.keyword)}" 메일 검색 ${sr.groups.mail?.total ?? 0}건 <button class="btn sm" data-act="clearMailSearch">지우기</button></h3><div class="list">${(sr.groups.mail?.items || []).map(x => `<div class="row" data-act="selMailSearch" data-uid="${esc(x.uid)}"><div><span class="pill low">${esc(x.box)}</span></div><div><div class="t">${hl(x.subject, sr.keyword)}</div><div class="d">${esc(x.from)} → ${esc(x.to)} · ${hl(x.snippet, sr.keyword)}</div></div><div class="w">${esc(x.date)}</div></div>`).join('') || '<div class="row"><div></div><div class="muted">결과 없음</div><div></div></div>'}</div>` : ''}
<h3>최근 메일 ${rows.length}통</h3><div class="list">${rows.map(x => `<div class="row ${S.sel && S.sel.type === 'mail' && S.sel.uid === x.uid ? 'sel' : ''}" data-act="selMail" data-box="${esc(x.box)}" data-uid="${esc(x.uid)}"><div>${x.seen ? '' : '<span class="pill high">안읽음</span>'}${needReply.has(x.box + x.uid) ? '<span class="pill medium">회신?</span>' : ''}${x.box !== 'INBOX' ? `<span class="pill low">${esc(x.box)}</span>` : ''}</div><div><div class="t">${esc(x.subject)}${x.attach ? ' <span class="muted">📎</span>' : ''}</div><div class="d">${esc(x.from)} · ${esc(x.preview.slice(0, 110))}</div></div><div class="w">${esc(x.shortDate || x.date)}</div></div>`).join('')}</div>
<p class="muted">목록·검색 API만 쓰므로 여기서 보는 것만으로는 메일이 읽음 처리되지 않습니다.</p>`;
  }
  const hl = (text, kw) => { const t = esc(text); if (!kw) return t; const k = esc(kw); return t.split(k).join(`<span class="hl">${k}</span>`); };

  function vSearch() {
    const s = S.search;
    const types = Object.entries(GW.searchLabels).filter(([k]) => k !== 'note');
    const res = s.res;
    const group = (type, render) => { const g = res && res.groups[type]; if (!g) return ''; return `<h3>${esc(g.label)} <span class="muted">${g.total}건${g.total > g.items.length ? ` 중 ${g.items.length}건 표시` : ''}</span></h3>${g.error ? `<p class="err">${esc(g.message)}</p>` : g.items.length ? `<div class="list">${g.items.map(render).join('')}</div>` : '<p class="muted">결과 없음</p>'}`; };
    return `<h2>통합검색</h2><div class="bar"><input class="f" id="sq" placeholder="검색어 (예: 월간업무보고, 문서번호, 사람 이름)" value="${esc(s.kw)}" style="flex:1;min-width:200px"><button class="btn primary" data-act="doSearch">${s.busy ? '<span class="spin"></span>' : '검색'}</button></div>
<div class="bar">${types.map(([k, n]) => `<span class="chip ${s.types.includes(k) ? 'on' : ''}" data-act="stype" data-v="${k}">${esc(n)}</span>`).join('')}</div>
${!res ? '<p class="muted">전자결재 문서는 본문까지, 메일은 본문 일부까지 검색합니다. 검색 기록은 그룹웨어 최근 검색어에 남기지 않습니다.</p>' : ''}
${res ? group('doc', x => `<div class="row" data-act="selSearch" data-t="doc" data-id="${esc(x.docId)}"><div><span class="pill low">${esc(x.form || '문서')}</span></div><div><div class="t">${hl(x.title, res.keyword)}</div><div class="d">${esc(x.docNo)} · ${esc(x.dept)} ${esc(x.drafter)} · ${hl(x.snippet, res.keyword)}</div></div><div class="w">${esc(ymd8(x.date))}</div></div>`) : ''}
${res ? group('mail', x => `<div class="row" data-act="selSearch" data-t="mail" data-id="${esc(x.uid)}"><div><span class="pill low">${esc(x.box)}</span></div><div><div class="t">${hl(x.subject, res.keyword)}</div><div class="d">${esc(x.from)} → ${esc(x.to)} · ${hl(x.snippet, res.keyword)}</div></div><div class="w">${esc(x.date)}</div></div>`) : ''}
${res ? group('board', x => `<div class="row" data-act="selSearch" data-t="board" data-id="${esc(x.id)}"><div><span class="pill low">${esc(x.catTitle || '게시판')}</span></div><div><div class="t">${hl(x.title, res.keyword)}</div><div class="d">${esc(x.writer)} · ${hl(x.snippet, res.keyword)}</div></div><div class="w">${esc(String(x.date).slice(0, 10))}</div></div>`) : ''}
${res ? group('file', x => `<div class="row" data-act="selSearch" data-t="file" data-id="${esc(x.fileId)}"><div><span class="pill low">${esc(x.ext || '파일')}</span></div><div><div class="t">${hl(x.name, res.keyword)}</div><div class="d">${esc(x.parent)} · ${esc(x.owner)}</div></div><div class="w">${esc(String(x.date).slice(0, 10))}</div></div>`) : ''}
${res ? group('schedule', x => `<div class="row" data-act="selSearch" data-t="schedule" data-id="${esc(x.id)}"><div><span class="pill low">일정</span></div><div><div class="t">${hl(x.title, res.keyword)}</div><div class="d">${hl(x.snippet, res.keyword)}</div></div><div class="w">${esc(String(x.start).slice(0, 10))}</div></div>`) : ''}
${res ? group('person', x => `<div class="row"><div><span class="pill low">인물</span></div><div><div class="t">${esc(x.name)} ${esc(x.duty || x.position)}</div><div class="d">${esc(x.dept)}${x.tel ? ' · ☎ ' + esc(x.tel) : ''}${x.email ? ' · ' + esc(x.email) : ''}</div></div><div class="w"></div></div>`) : ''}
${res ? group('contact', x => `<div class="row"><div><span class="pill low">연락처</span></div><div><div class="t">${esc(x.name)} ${esc(x.rank)}</div><div class="d">${esc(x.company)} ${esc(x.dept)}${x.tel ? ' · ☎ ' + esc(x.tel) : ''}${x.email ? ' · ' + esc(x.email) : ''}</div></div><div class="w"></div></div>`) : ''}`;
  }

  function vBudget() {
    const b = S.budget, t = b.table, el = S.a.budget.elapsedPct;
    const projOptions = S.settings.budget.map(p => `<option value="${esc(p.project + '|' + (p.filter || ''))}" ${b.project === p.project && b.filter === (p.filter || '') ? 'selected' : ''}>${esc(p.project)} ${esc(p.label || '')}${p.filter ? ' · ' + esc(p.filter) : ''}</option>`).join('');
    const flag = r => r.balance < 0 ? '<span class="pill high">초과</span>' : (r.budget > 0 && r.rate >= 95) ? '<span class="pill medium">소진 임박</span>' : (r.budget > 0 && ['목', '세'].includes(r.level) && r.rate < el - 35) ? '<span class="pill low">집행 저조</span>' : '';
    const rows = t ? t.rows.filter(r => !b.q || (r.name + r.code).includes(b.q)) : [];
    const ledger = b.ledger;
    return `<h2>예산 집행 <a class="btn sm" href="${esc(S.a.budget.url)}" target="_blank">예실대비현황</a></h2>
<div class="bar"><select class="f" id="bproj">${projOptions}<option value="__custom">직접 입력…</option></select><input class="f" id="bcode" placeholder="프로젝트 코드" value="${esc(b.project)}" style="width:110px"><input class="f" id="bfilter" placeholder="항·목 코드(선택)" value="${esc(b.filter)}" style="width:120px"><button class="btn primary" data-act="loadBudget">${b.busy ? '<span class="spin"></span>' : '조회'}</button><input class="f" id="bq" placeholder="과목 이름 찾기" value="${esc(b.q)}" style="flex:1;min-width:120px">${t ? '<button class="btn sm" data-act="csvBudget">CSV</button>' : ''}</div>
${t && t.error ? `<p class="err">${esc(t.message)}</p>` : ''}
${t && !t.error ? `<p class="muted">${esc(t.project)} · ${t.year}년 ${t.gisu}기 1~12월 누계 · 연간 경과율 ${el}% · 행 ${rows.length}/${t.rowCount}${t.total ? ` · 프로젝트 전체 집행률 ${t.total.rate}%` : ''}. 세목(세) 행을 누르면 결의 내역이 열립니다.</p>
<table><tr><th>과목</th><th class="num">예산</th><th class="num">집행</th><th class="num">잔액</th><th class="num">집행률</th></tr>${rows.map(r => `<tr class="lv-${esc(r.level)} ${r.level === '세' ? 'click' : ''} ${ledger && ledger.bgtCd === r.code ? 'sel' : ''}" ${r.level === '세' ? `data-act="ledger" data-code="${esc(r.code)}"` : ''}><td><span class="muted">${esc(r.level)}</span> ${esc(r.name)} ${flag(r)}<div class="muted">${esc(r.code)}</div></td><td class="num">${won(r.budget)}</td><td class="num">${won(r.executed)}</td><td class="num">${won(r.balance)}</td><td class="num">${r.rate}%<div class="rate"><i class="${r.balance < 0 ? 'over' : r.rate < el - 35 ? 'low' : ''}" style="width:${Math.min(100, Math.max(0, r.rate))}%"></i></div></td></tr>`).join('')}${t.total ? `<tr class="lv-관"><td>${esc(t.project)} 프로젝트 전체</td><td class="num">${won(t.total.budget)}</td><td class="num">${won(t.total.executed)}</td><td class="num">${won(t.total.balance)}</td><td class="num">${t.total.rate}%</td></tr>` : ''}</table>` : (b.busy ? '<p><span class="spin"></span> 조회 중…</p>' : '')}
${ledger ? `<h3>결의 내역 · ${esc(ledger.name || ledger.bgtCd)} <span class="muted">${ledger.rows ? ledger.rows.length + '건' : ''}</span>${ledger.rows ? ' <button class="btn sm" data-act="csvLedger">CSV</button>' : ''}</h3>${ledger.error ? `<p class="err">${esc(ledger.error)}</p>` : ledger.rows ? `<table><tr><th>결의일</th><th>적요</th><th class="num">금액</th><th>문서번호</th><th>작성</th><th>전표</th></tr>${ledger.rows.map((r, i) => `<tr class="click" data-act="ledgerRow" data-i="${i}"><td class="nowrap">${esc(ymd8(r.date))}</td><td>${esc(r.desc)}</td><td class="num">${won(r.amount)}</td><td class="nowrap">${esc(r.docNo)}</td><td class="nowrap">${esc(r.writer)}</td><td class="nowrap muted">${esc(r.slip)}</td></tr>`).join('')}<tr class="lv-관"><td colspan="2">합계 ${ledger.check}</td><td class="num">${won(ledger.checkSum)}</td><td colspan="3"></td></tr></table>` : '<p><span class="spin"></span></p>'}` : ''}`;
  }
  async function loadBudget() {
    const b = S.budget;
    if (!b.project) { const p = S.settings.budget[0] || {project: 'A201', filter: ''}; b.project = p.project; b.filter = p.filter || ''; }
    b.busy = true; b.ledger = null; renderMain();
    try { b.table = await GW.budgetProject({project: b.project, filter: b.filter}); }
    catch (e) { b.table = {error: true, message: e.message}; }
    b.busy = false; if (S.view === 'budget') renderMain();
  }
  async function loadLedger(code) {
    const b = S.budget;
    const row = b.table && b.table.rows.find(r => r.code === code);
    b.ledger = {bgtCd: code, name: row ? row.name : code, rows: null};
    renderMain();
    try {
      const l = await GW.budgetLedger({project: b.project, bgtCd: code, year: b.table && b.table.year, gisu: b.table && b.table.gisu});
      const ok = row ? l.checkSum === row.executed : null;
      Object.assign(b.ledger, {rows: l.rows, checkSum: l.checkSum, check: ok === null ? '' : ok ? '✓ 집행액과 일치' : `⚠ 집행액 ${won(row.executed)}과 ${won(row.executed - l.checkSum)} 차이`});
    } catch (e) { b.ledger.error = e.message; }
    if (S.view === 'budget') renderMain();
  }

  function vAttendance() {
    const at = S.raw.data.attendance, lv = S.raw.data.leave, st = S.att;
    const p = R.kstNow(new Date());
    const thisM = `${p.y}${String(p.m).padStart(2, '0')}`;
    const prevD = new Date(Date.UTC(p.y, p.m - 2, 1));
    const prevM = `${prevD.getUTCFullYear()}${String(prevD.getUTCMonth() + 1).padStart(2, '0')}`;
    const month = st.month || thisM;
    const rows = st.rows || [];
    const bad = new Set(R.attendanceAnomalies(rows).map(x => x.date));
    return `<h2>근태·연차 <a class="btn sm" href="${esc(at?.url || '')}" target="_blank">근무시간현황</a> <a class="btn sm" data-act="paneUrl" data-url="${esc(at?.requestUrl || '')}">근태신청 화면 열기</a></h2>
<div class="grid2"><div class="box"><b>오늘</b> 출근 ${esc(hm4(at?.today.come) || '기록 없음')} · 퇴근 ${esc(hm4(at?.today.leave) || '기록 없음')}<br><b>이번 달</b> 인정 ${mins(at?.month.recognizedMin)} · 기본 ${mins(at?.month.basicMin)} · 초과 ${mins(at?.month.overtimeMin)} · 제외 ${mins(at?.month.exceptMin)}</div>
<div class="box"><b>${esc(lv?.year)}년 연차</b> 부여 ${lv?.granted} · 사용 ${lv?.used} · <b>잔여 ${lv?.remaining}일</b><br>${(lv?.upcoming || []).map(u => `예정 ${esc(ymd8(u.start))} ${esc(u.kind)} ${u.days}일(${u.approved ? '결재완료' : '진행 중'})`).join('<br>') || '<span class="muted">예정된 휴가 없음</span>'}</div></div>
<div class="bar" style="margin-top:10px"><span class="chip ${month === thisM ? 'on' : ''}" data-act="attMonth" data-v="${thisM}">이번 달</span><span class="chip ${month === prevM ? 'on' : ''}" data-act="attMonth" data-v="${prevM}">지난달</span>${st.rows ? '<button class="btn sm" data-act="csvAtt">CSV</button>' : ''}<span class="muted">이상 근태(결근·지각·조퇴·미인정 중 승인 신청이 없는 날)는 붉게 표시합니다.</span></div>
${st.busy ? '<p><span class="spin"></span></p>' : `<table><tr><th>날짜</th><th>근무유형</th><th>출결</th><th>근태항목</th><th>상태</th><th>출근</th><th>퇴근</th><th class="num">인정</th></tr>${rows.map(r => `<tr class="${bad.has(r.date) ? 'bad' : ''}"><td class="nowrap">${esc(ymd8(r.date).slice(5))} (${WD[r.weekday] || ''})</td><td>${esc(r.workType)}</td><td>${esc(r.result)}</td><td>${esc(r.item)}</td><td>${esc(r.status)}</td><td>${esc(hm4(r.come))}</td><td>${esc(hm4(r.leave))}</td><td class="num">${r.recognizedMin === null ? '' : mins(r.recognizedMin)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">자료 없음</td></tr>'}</table>`}
<h3>올해 연차·휴가 사용 내역 <span class="muted">${(lv?.history || []).length}건</span></h3><table><tr><th>기간</th><th>구분</th><th class="num">일수</th><th>제목</th><th>상태</th></tr>${(lv?.history || []).slice(0, 60).map(u => `<tr><td class="nowrap">${esc(ymd8(u.start))}${u.end !== u.start ? '~' + esc(ymd8(u.end).slice(5)) : ''}</td><td>${esc(u.kind)}</td><td class="num">${u.days}</td><td>${esc(u.title)}</td><td>${u.approved ? '완료' : '진행'}</td></tr>`).join('')}</table>`;
  }
  async function loadAttendance(month) {
    const p = R.kstNow(new Date());
    const m = month || S.att.month || `${p.y}${String(p.m).padStart(2, '0')}`;
    S.att.month = m; S.att.busy = true; renderMain();
    const y = Number(m.slice(0, 4)), mo = Number(m.slice(4, 6));
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const today = kstToday().replace(/-/g, '');
    const to = `${m}${String(last).padStart(2, '0')}`;
    try { S.att.rows = await GW.attendanceDays({from: `${m}01`, to: to > today ? today : to}); } catch (e) { S.att.rows = []; toast('근태 자료를 읽지 못했습니다: ' + e.message); }
    S.att.busy = false; if (S.view === 'attendance') renderMain();
  }

  function vCalendar() {
    const today = kstToday();
    const items = [];
    const sc = S.raw.data.schedule;
    for (const e of sc?.events || []) items.push({date: ymd8(e.start), text: `${e.allDay ? '' : dtm12(e.start).slice(11) + ' '}${e.title}`, tag: e.calendar, kind: 'event'});
    for (const h of sc?.holidays || []) items.push({date: ymd8(h.date), text: h.title, tag: '휴일', kind: 'holiday'});
    for (const u of S.raw.data.leave?.upcoming || []) items.push({date: ymd8(u.start), text: `${u.kind} ${u.days}일`, tag: '내 휴가', kind: 'leave'});
    for (const d of S.a.deadlines) items.push({date: d.date, text: d.title, tag: `기한 · ${d.source}`, kind: 'deadline', url: d.url});
    for (const x of S.paneExtract ? S.paneExtract.deadlines : []) items.push({date: x.date, text: x.context, tag: '본문 기한', kind: 'deadline'});
    for (const t of S.todos.filter(t => t.due && !t.done)) items.push({date: t.due, text: t.title, tag: '내 할 일', kind: 'todo'});
    const byDate = {};
    for (const it of items.filter(x => x.date >= today)) (byDate[it.date] = byDate[it.date] || []).push(it);
    const dates = Object.keys(byDate).sort().slice(0, 40);
    return `<h2>일정·기한 <a class="btn sm" href="${esc(sc?.url || '')}" target="_blank">그룹웨어 일정</a></h2><p class="muted">그룹웨어 캘린더(${(sc?.calendars || []).map(c => esc(c.title)).join(', ')}) · 휴일 · 내 휴가 · 문서·메일·공지 제목의 기한 · 내 할 일을 날짜순으로 모았습니다.</p>
${dates.length ? dates.map(d => { const n = R.dday(d); const w = WD[new Date(d + 'T00:00:00Z').getUTCDay()]; return `<div class="day"><div class="dh">${esc(d)} (${w}) <span class="pill ${n <= 2 ? 'high' : n <= 7 ? 'medium' : 'low'}">${ddayText(n)}</span></div>${byDate[d].map(it => `<div class="it"><span class="pill ${it.kind === 'deadline' ? 'high' : 'low'}">${esc(it.tag)}</span>${it.url ? `<a href="#" data-act="paneUrl" data-url="${esc(it.url)}">${esc(it.text)}</a>` : esc(it.text)}</div>`).join('')}</div>`; }).join('') : '<p class="muted">예정된 항목이 없습니다.</p>'}`;
  }

  function vTodo() {
    const t = S.todos;
    return `<h2>내 할 일</h2><div class="bar"><input class="f" id="tdTitle" placeholder="할 일" style="flex:1;min-width:200px"><input class="f" id="tdDue" type="date"><button class="btn primary" data-act="addTodo">추가</button></div>
<div class="list">${t.length ? t.map((x, i) => `<div class="row ${x.done ? 'done' : ''}"><div><input type="checkbox" data-act="todoDone" data-i="${i}" ${x.done ? 'checked' : ''}></div><div><div class="t">${esc(x.title)}</div><div class="d">${x.due ? `기한 ${esc(x.due)} (${ddayText(R.dday(x.due))}) · ` : ''}${x.source ? esc(x.source) : '직접 추가'}${x.url ? ` · <a href="#" data-act="paneUrl" data-url="${esc(x.url)}">원문 열기</a>` : ''}</div></div><div class="w"><button class="btn sm warn" data-act="todoDel" data-i="${i}">삭제</button></div></div>`).join('') : '<div class="row"><div></div><div class="muted">할 일이 없습니다. 항목 상세에서 "할 일 추가"를 누르면 여기로 모입니다.</div><div></div></div>'}</div>
<p class="muted">할 일은 이 브라우저에만 저장됩니다.</p>`;
  }

  function vReport() {
    return `<h2>보고서</h2><div class="bar"><button class="btn primary" data-act="dlBrief">오늘 브리핑 HTML 저장</button><button class="btn" data-act="cpBrief">브리핑 Markdown 복사</button><button class="btn" data-act="csvQueue">할 일 목록 CSV</button><button class="btn" data-act="mkWeekly">주간 업무 실적 초안 만들기</button></div>
${S.weekly ? `<h3>주간 업무 실적 초안 <button class="btn sm" data-act="cpWeekly">복사</button> <button class="btn sm" data-act="dlWeekly">TXT 저장</button></h3><textarea id="weekly">${esc(S.weekly)}</textarea>` : '<p class="muted">주간 실적 초안은 최근 7일 내 상신문서와 내가 담당한 부서 접수 문서로 만듭니다. 그대로 제출하지 말고 확인·보완하세요.</p>'}
<h3>오늘 브리핑 미리보기</h3><iframe id="briefFrame" style="width:100%;height:560px;border:1px solid #e1e5ec;border-radius:9px;background:#fff"></iframe>`;
  }

  function vSettings() {
    const st = S.settings;
    const hasMini = !!localStorage.getItem(LS + 'src');
    return `<h2>설정</h2><table><tr><td style="width:160px">자동 새로고침</td><td><select class="f" id="setRefresh">${[0, 3, 5, 10, 30].map(m => `<option value="${m}" ${Number(st.refreshMin) === m ? 'selected' : ''}>${m ? m + '분마다' : '끄기'}</option>`).join('')}</select> <span class="muted">업무센터가 열려 있거나 숨겨져 있는 동안 이 탭에서만 동작합니다.</span></td></tr>
<tr><td>새 긴급 항목 알림</td><td><label><input type="checkbox" id="setNotify" ${st.notify ? 'checked' : ''}> 바탕화면 알림 보내기</label> <span class="muted">${'Notification' in window ? '권한: ' + Notification.permission : '이 브라우저는 알림을 지원하지 않습니다'}</span></td></tr>
<tr><td>예산 조회 대상</td><td><textarea id="setBudget" style="min-height:80px" placeholder="한 줄에 하나: 프로젝트코드 항목코드(선택) 이름">${esc(st.budget.map(b => [b.project, b.filter || '-', b.label || ''].join(' ')).join('\n'))}</textarea><div class="muted">예: <code>A201 노121 전략경영실운영</code> · 항목 코드를 비우려면 <code>-</code></div></td></tr>
<tr><td>내 긴급 키워드</td><td><input class="f" id="setWords" style="width:100%" value="${esc((st.urgentWords || []).join(', '))}" placeholder="쉼표로 구분 (예: 행정사무감사, 시의회, 감사)"><div class="muted">제목에 이 단어가 있으면 긴급으로 올립니다.</div></td></tr>
<tr><td>받은메일 읽는 수</td><td><select class="f" id="setMail">${[50, 100, 200].map(n => `<option ${Number(st.mailCount) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></td></tr>
<tr><td>정리</td><td><button class="btn sm" data-act="resetDone">완료·미루기 표시 초기화</button> <button class="btn sm" data-act="resetRouting">배부·접수 추천 이력 지우기</button> <button class="btn sm warn" data-act="resetAll">이 브라우저의 업무센터 자료 모두 지우기</button></td></tr>
<tr><td>설치 상태</td><td>${hasMini ? '이 브라우저에 설치됨: 작은 북마크(<code>GW 업무센터</code>)로 바로 열 수 있습니다.' : '설치 북마크로 한 번 실행하면 이 브라우저에 저장됩니다.'}<br><span class="muted">수집기 v${esc(GW.version)} · 업무센터 v${VERSION} · 허용 API ${GW.readOnlyEndpoints().length}개(모두 조회용)</span></td></tr></table>
<p><button class="btn primary" data-act="saveSettings">설정 저장</button></p>`;
  }

  // ---------- detail pane ----------
  function renderPane() {
    const wc = $('#wc');
    const pane = $('#pane');
    if (!S.sel) { wc.classList.add('nopane'); pane.innerHTML = ''; return; }
    wc.classList.remove('nopane');
    const info = paneInfo();
    pane.innerHTML = `<div class="pane-h"><div style="display:flex;justify-content:space-between;gap:8px"><div class="t">${esc(info.title)}</div><button class="btn sm" data-act="closePane">✕</button></div>${info.body}</div><div class="frame" id="frame">${S.paneUrl ? '' : `<div class="ph">${info.url ? '"여기서 열기"를 누르면 그룹웨어 원래 화면이 이 자리에 열립니다.<br>그 화면의 버튼으로 결재·접수·배부·발송을 처리하세요.' : '이 항목은 내장 화면이 없습니다.'}</div>`}</div>`;
    if (S.paneUrl) mountFrame();
  }
  function mountFrame() {
    const fr = $('#frame');
    if (!fr) return;
    const f = document.createElement('iframe');
    f.src = S.paneUrl;
    f.addEventListener('load', () => scanFrame(f));
    fr.innerHTML = '';
    fr.append(f);
  }
  // After the user opens a document, read its text (same origin) and pull out deadlines.
  function scanFrame(f, tries = 0) {
    let text = '';
    try {
      const doc = f.contentDocument;
      text = doc ? doc.body.innerText : '';
      for (const inner of doc ? doc.querySelectorAll('iframe') : []) { try { text += '\n' + inner.contentDocument.body.innerText; for (const i2 of inner.contentDocument.querySelectorAll('iframe')) { try { text += '\n' + i2.contentDocument.body.innerText; for (const ta of i2.contentDocument.querySelectorAll('textarea,input')) text += '\n' + (ta.value || ''); } catch {} } } catch {} }
    } catch { return; }
    if (text.replace(/\s/g, '').length < 80 && tries < 8) { setTimeout(() => scanFrame(f, tries + 1), 1200); return; }
    const deadlines = R.extractAllDeadlines(text).filter(x => x.dday >= -1 && x.dday <= 90);
    const asks = (text.replace(/\s+/g, ' ').match(/[^.。]*?(?:제출|회신|요청|협조|참석|신청)[^.。]{0,60}(?:바랍니다|주시기|요청드|부탁)/g) || []).slice(0, 3);
    const attach = (text.match(/붙임\s*[^\n]{0,80}/g) || []).slice(0, 4);
    S.paneExtract = {url: S.paneUrl, deadlines, asks, attach};
    const box = $('#extract');
    if (box) box.innerHTML = extractHtml();
  }
  const extractHtml = () => {
    const x = S.paneExtract;
    if (!x || x.url !== S.paneUrl) return '<span class="muted">원문을 열면 본문에서 기한·요청 사항을 자동으로 찾아 보여줍니다.</span>';
    return `<b>본문 자동 추출</b>${x.deadlines.length ? `<div>${x.deadlines.map(d => `<span class="pill ${d.dday <= 3 ? 'high' : 'medium'}">${esc(d.date.slice(5))}${d.time ? ' ' + esc(d.time) : ''} ${ddayText(d.dday)}</span>`).join('')}</div><div class="muted">${esc(x.deadlines[0].context)}</div>` : '<div class="muted">기한 표현을 찾지 못했습니다.</div>'}${x.asks.length ? `<div style="margin-top:4px">${x.asks.map(a => `· ${esc(a.trim().slice(0, 140))}`).join('<br>')}</div>` : ''}${x.attach.length ? `<div class="muted" style="margin-top:4px">${x.attach.map(esc).join('<br>')}</div>` : ''}<div class="acts">${x.deadlines[0] ? `<button class="btn sm" data-act="todoFromExtract">기한으로 할 일 추가</button>` : ''}</div>`;
  };

  function paneInfo() {
    const sel = S.sel;
    const actsFor = (url, opts = {}) => `<div class="acts">${url ? `<button class="btn primary" data-act="paneUrl" data-url="${esc(url)}">여기서 열기</button><a class="btn" href="${esc(url)}" target="_blank">새 창</a>` : ''}${opts.key ? `<button class="btn" data-act="toggleDone" data-k="${esc(opts.key)}">${isDone(opts.key) ? '완료 취소' : '완료 표시'}</button><button class="btn" data-act="snooze" data-k="${esc(opts.key)}">내일까지 미루기</button>` : ''}<button class="btn" data-act="todoFromSel">할 일 추가</button>${opts.q ? `<button class="btn" data-act="related" data-q="${esc(opts.q)}">관련 문서 찾기</button>` : ''}${opts.extra || ''}</div>`;
    const relatedQ = t => String(t || '').replace(/\(.*?\)|\[.*?\]|「|」|『|』|20\d{2}년?/g, ' ').split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');
    if (sel.type === 'action') {
      const x = selectedAction();
      if (!x) return {title: '항목이 사라졌습니다', body: '<p class="muted">새로고침 후 목록에서 다시 선택하세요.</p>'};
      if (x.type === 'doc') return docPane(findDoc(x.ref.kind, x.ref.docId) || {title: x.title, url: x.url, docId: x.ref.docId}, x.ref.kind, x, actsFor, relatedQ);
      if (x.type === 'mail') { const m = findMail(x.ref.box, x.ref.uid); return mailPane(m, x, actsFor, relatedQ); }
      if (x.type === 'notice') return {title: x.title, url: x.url, body: `<div class="kv"><b>구분</b><span>${esc(x.kind)}</span><b>작성</b><span>${esc(x.detail)}</span><b>등록</b><span>${esc(x.when)}</span></div><div class="box warn">원문을 열면 게시글이 읽음 처리되고 조회수가 올라갑니다.</div>${actsFor(x.url, {key: x.key, q: relatedQ(x.title)})}<div class="box" id="extract">${extractHtml()}</div>`};
      return {title: x.title, url: x.url, body: `<div class="kv"><b>구분</b><span>${esc(x.area)} · ${esc(x.kind)}</span><b>내용</b><span>${esc(x.detail)}</span></div>${actsFor(x.url, {key: x.key})}${x.type === 'attendance' ? '<div class="box tip">근태신청 화면이 열립니다. 해당 날짜의 출장·휴가·근무일대체 신청 여부를 확인하세요.</div>' : ''}`};
    }
    if (sel.type === 'doc') { const d = findDoc(sel.kind, sel.docId); return docPane(d || {title: '문서', docId: sel.docId}, sel.kind, null, actsFor, relatedQ); }
    if (sel.type === 'mail') return mailPane(findMail(sel.box, sel.uid), null, actsFor, relatedQ);
    if (sel.type === 'search') {
      const it = sel.item;
      if (it.type === 'doc') return {title: it.title, url: it.url, body: `<div class="kv"><b>문서번호</b><span>${esc(it.docNo)}</span><b>양식</b><span>${esc(it.form)}</span><b>기안</b><span>${esc(it.dept)} ${esc(it.drafter)}</span><b>일자</b><span>${esc(ymd8(it.date))}</span><b>첨부</b><span>${it.files.map(f => esc(f.name)).join('<br>') || '-'}</span></div><div class="box">${hl(it.snippet, S.search.res && S.search.res.keyword)}</div>${actsFor(it.url, {q: relatedQ(it.title)})}<div class="box" id="extract">${extractHtml()}</div>`};
      if (it.type === 'board') return {title: it.title, url: it.url, body: `<div class="kv"><b>게시판</b><span>${esc(it.catTitle)}</span><b>작성</b><span>${esc(it.writer)}</span><b>등록</b><span>${esc(it.date)}</span><b>첨부</b><span>${it.files.map(f => esc(f.name)).join('<br>') || '-'}</span></div><div class="box">${hl(it.snippet, S.search.res && S.search.res.keyword)}</div>${actsFor(it.url, {q: relatedQ(it.title)})}<div class="box" id="extract">${extractHtml()}</div>`};
      if (it.type === 'file') return {title: it.name, url: it.url, body: `<div class="kv"><b>출처</b><span>${esc(it.parent)}</span><b>올린 사람</b><span>${esc(it.owner)}</span><b>일자</b><span>${esc(it.date)}</span><b>크기</b><span>${won(it.size)} B</span></div>${actsFor(it.url, {q: relatedQ(it.parent)})}<div class="box tip">첨부파일 미리보기(그룹웨어 문서 뷰어)가 열립니다.</div>`};
      if (it.type === 'mail') return {title: it.subject, url: S.a.mail.url, body: `<div class="kv"><b>메일함</b><span>${esc(it.box)}</span><b>보낸 사람</b><span>${esc(it.from)}</span><b>받는 사람</b><span>${esc(it.to)}</span><b>일시</b><span>${esc(it.date)}</span></div><div class="box">${hl(it.snippet, S.search.res && S.search.res.keyword)}</div>${actsFor(S.a.mail.url, {q: relatedQ(it.subject)})}<div class="box tip">메일 원문은 메일함 화면에서 제목을 눌러 엽니다.</div>`};
      return {title: it.title || it.name, url: '', body: `<div class="box">${esc(it.snippet || '')}</div>`};
    }
    if (sel.type === 'frame') return {title: sel.title, url: sel.url, body: `<div class="acts"><a class="btn" href="${esc(sel.url)}" target="_blank">새 창</a></div>`};
    if (sel.type === 'ledger') {
      const r = sel.row;
      return {title: r.desc, url: '', body: `<div class="kv"><b>결의일</b><span>${esc(ymd8(r.date))}</span><b>금액</b><span>${won(r.amount)}원</span><b>문서번호</b><span>${esc(r.docNo)}</span><b>작성</b><span>${esc(r.dept)} ${esc(r.writer)}</span><b>전표</b><span>${esc(r.slip)}</span><b>과목</b><span>${esc(r.name)} (${esc(r.code)})</span></div><div class="acts">${r.docNo ? `<button class="btn primary" data-act="findDocNo" data-no="${esc(r.docNo)}" data-t="${esc(r.desc)}">결재문서 찾아 열기</button>` : ''}<button class="btn" data-act="todoFromSel">할 일 추가</button></div><div id="docNoResult"></div>`};
    }
    return {title: '', url: '', body: ''};
  }
  function docPane(d, kind, action, actsFor, relatedQ) {
    const url = d.url || (action && action.url);
    const hist = S.routing ? (kind === 'distWaiting' ? S.routing.dist : kind === 'deptWaiting' ? S.routing.dept : []) : [];
    const rec = hist.length ? R.recommendRouting(d, hist, {target: kind === 'distWaiting' ? 'toDept' : 'toEmp', limit: 3}) : [];
    const grp = rec.group;
    const grpLine = grp ? `<div style="margin:4px 0">가장 비슷한 지난 문서는 <b>${grp.targets.length}곳</b>에 함께 ${kind === 'distWaiting' ? '배부' : '접수'}됐습니다: ${esc(grp.targets.join(', '))}<div class="muted">${esc(grp.title)} · ${esc(grp.from)} · ${esc(String(grp.date).slice(0, 10))}</div></div>` : '';
    const recBox = ['distWaiting', 'deptWaiting'].includes(kind) ? `<div class="box tip"><b>${kind === 'distWaiting' ? '배부 추천 부서' : '접수 추천 담당자'}</b>${grpLine}${S.routing ? (rec.length ? rec.map(r => `<div>${esc(r.name)} <span class="muted">신뢰 ${r.confidence}% · 비슷한 이력 ${r.count}건 · ${esc(r.reasons.join(', '))}</span>${r.examples[0] ? `<div class="muted">예: ${esc(r.examples[0].title)} (${esc(String(r.examples[0].date).slice(0, 10))})</div>` : ''}</div>`).join('') : '<div class="muted">비슷한 처리 이력이 없습니다.</div>') : '<div><button class="btn sm" data-act="reloadRouting">처리 이력 읽고 추천 받기</button></div>'}</div>` : '';
    const warn = d.unread ? '<div class="box warn">아직 열람하지 않은 문서입니다. 원문을 열면 열람 처리됩니다.</div>' : '';
    const title = d.title || (action && action.title) || '';
    return {title, url, body: `<div class="kv"><b>구분</b><span>${esc((S.a.approval.lists[kind] || {}).label || kind)}</span><b>문서번호</b><span>${esc(d.docNo || '-')}</span><b>보낸 곳</b><span>${esc(d.sender || '-')}</span><b>기안·담당</b><span>${esc([d.drafterDept, d.drafter, d.toEmp].filter(Boolean).join(' ') || '-')}</span><b>상태</b><span>${esc(d.status || '-')}</span><b>일시</b><span>${esc(d.date || '-')}</span><b>첨부</b><span>${d.attachments || 0}개</span></div>${recBox}${warn}${actsFor(url, {key: action ? action.key : `doc:${kind}:${d.docId}`, q: relatedQ(title)})}<div class="box" id="extract">${extractHtml()}</div>`};
  }
  function mailPane(m, action, actsFor, relatedQ) {
    if (!m) return {title: action ? action.title : '메일', url: S.a.mail.url, body: `${actsFor(S.a.mail.url, {key: action && action.key})}`};
    const dl = R.extractAllDeadlines(m.subject + ' ' + m.preview).filter(x => x.dday >= -1);
    return {title: m.subject, url: S.a.mail.url, body: `<div class="kv"><b>보낸 사람</b><span>${esc(m.from)} &lt;${esc(m.fromEmail)}&gt;</span><b>받은 시각</b><span>${esc(m.date)}</span><b>메일함</b><span>${esc(m.box)}</span><b>상태</b><span>${m.seen ? '읽음' : '안 읽음'}${m.answered ? ' · 회신함' : ''}${m.forwarded ? ' · 전달함' : ''}${m.attach ? ' · 첨부' : ''}</span></div><div class="box">${esc(m.preview) || '<span class="muted">미리보기 없음</span>'}</div>${dl.length ? `<div class="box tip"><b>찾은 기한</b> ${dl.map(d => `<span class="pill ${d.dday <= 3 ? 'high' : 'medium'}">${esc(d.date.slice(5))} ${ddayText(d.dday)}</span>`).join('')}</div>` : ''}${actsFor(S.a.mail.url, {key: action ? action.key : `mail:${m.box}:${m.uid}`, q: relatedQ(m.subject)})}<div class="box tip">메일함 화면이 열리면 제목을 눌러 원문을 확인하고 그 화면에서 답장하세요.</div>`};
  }
  const findDoc = (kind, id) => ((S.a.approval.lists[kind] || {}).docs || []).find(d => d.docId === id);
  const findMail = (box, uid) => [...(S.raw.data.mail?.inbox.records || []), ...(S.raw.data.mail?.otherUnseen || [])].find(m => m.box === box && m.uid === uid);

  function selectAction(key) {
    S.sel = {type: 'action', key}; S.paneUrl = '';
    if (S.newKeys.delete(key)) saveLocal();
    const x = selectedAction();
    if (x && x.type === 'doc' && ['distWaiting', 'deptWaiting'].includes(x.ref.kind) && !S.routing) loadRouting().then(() => renderPane());
    render();
  }
  const openInPane = url => { if (!url) return; S.paneUrl = url; S.paneExtract = null; renderPane(); };
  function toggleDone(key) { if (S.done[key]) delete S.done[key]; else S.done[key] = Date.now(); saveLocal(); render(); }
  function snooze(key) { const t = new Date(); t.setHours(24 + 8, 0, 0, 0); S.snooze[key] = t.getTime(); saveLocal(); toast('내일 오전 8시까지 목록에서 숨깁니다.'); render(); }
  function addTodo(title, due = '', source = '', url = '') { if (!title) return; S.todos.unshift({title, due, source, url, done: false, at: Date.now()}); saveLocal(); toast('내 할 일에 추가했습니다.'); renderNav(); }
  function selTitle() { const info = S.sel ? paneInfo() : null; return info ? {title: info.title, url: info.url} : {title: '', url: ''}; }

  async function runSearch(types) {
    const s = S.search;
    if (!s.kw || s.kw.length < 2) { toast('검색어를 두 글자 이상 입력하세요.'); return; }
    s.busy = true; S.view = 'search'; render();
    try { s.res = await GW.search(s.kw, {types: types || s.types, pageSize: 10}); } catch (e) { toast(e.message); }
    s.busy = false; render();
  }

  // ---------- events ----------
  root.addEventListener('click', async e => {
    const el = e.composedPath().find(n => n && n.dataset && n.dataset.act);
    if (!el) return;
    const act = el.dataset.act, v = el.dataset.v;
    if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
    switch (act) {
      case 'refresh': refresh(); break;
      case 'close': close(); break;
      case 'view': S.view = v; render(); break;
      case 'goApproval': S.view = 'approval'; render(); break;
      case 'goMail': S.view = 'mail'; render(); break;
      case 'goAttendance': S.view = 'attendance'; render(); break;
      case 'goCalendar': S.view = 'calendar'; render(); break;
      case 'goAreaNotice': S.view = 'today'; S.filter.area = '공지'; render(); break;
      case 'area': S.filter.area = v; render(); break;
      case 'onlyNew': S.filter.onlyNew = !S.filter.onlyNew; render(); break;
      case 'showDone': S.filter.showDone = !S.filter.showDone; render(); break;
      case 'clearNew': S.newKeys.clear(); saveLocal(); render(); break;
      case 'selAction': selectAction(el.dataset.k); break;
      case 'apTab': S.apTab = v; render(); break;
      case 'selDoc': S.sel = {type: 'doc', kind: el.dataset.kind, docId: el.dataset.id}; S.paneUrl = ''; render(); break;
      case 'reloadRouting': toast('배부·접수 이력을 읽는 중…'); await loadRouting(true); render(); break;
      case 'mailFilter': S.mailFilter = v; render(); break;
      case 'selMail': S.sel = {type: 'mail', box: el.dataset.box, uid: el.dataset.uid}; S.paneUrl = ''; render(); break;
      case 'selMailSearch': { const it = (S.mailSearch.res.groups.mail.items || []).find(x => x.uid === el.dataset.uid); S.search.res = S.mailSearch.res; S.sel = {type: 'search', item: it}; S.paneUrl = ''; render(); break; }
      case 'clearMailSearch': S.mailSearch = {kw: '', res: null}; render(); break;
      case 'stype': S.search.types = S.search.types.includes(v) ? S.search.types.filter(t => t !== v) : [...S.search.types, v]; render(); break;
      case 'doSearch': S.search.kw = ($('#sq') || {}).value?.trim() || S.search.kw; runSearch(); break;
      case 'selSearch': { const g = S.search.res.groups[el.dataset.t]; const it = g.items.find(x => (x.docId || x.uid || x.id || x.fileId) === el.dataset.id); S.sel = {type: 'search', item: it}; S.paneUrl = ''; render(); break; }
      case 'related': S.search.kw = el.dataset.q; runSearch(['doc', 'board', 'mail', 'file']); break;
      case 'paneUrl': if (el.dataset.url) { if (!S.sel) S.sel = {type: 'frame', title: el.textContent.trim() || '그룹웨어 화면', url: el.dataset.url}; openInPane(el.dataset.url); render(); } break;
      case 'closePane': S.sel = null; S.paneUrl = ''; render(); break;
      case 'toggleDone': toggleDone(el.dataset.k); break;
      case 'snooze': snooze(el.dataset.k); break;
      case 'todoFromSel': { const t = selTitle(); addTodo(t.title, '', '업무센터 항목', t.url); break; }
      case 'todoFromExtract': { const x = S.paneExtract; const t = selTitle(); if (x && x.deadlines[0]) addTodo(t.title, x.deadlines[0].date, '본문 기한 자동 추출', t.url); break; }
      case 'loadBudget': S.budget.project = $('#bcode').value.trim(); S.budget.filter = $('#bfilter').value.trim(); if (!S.budget.project) { toast('프로젝트 코드를 입력하세요.'); break; } loadBudget(); break;
      case 'ledger': loadLedger(el.dataset.code); break;
      case 'ledgerRow': { const r = S.budget.ledger.rows[Number(el.dataset.i)]; S.sel = {type: 'ledger', row: r}; S.paneUrl = ''; renderPane(); break; }
      case 'findDocNo': {
        const out = $('#docNoResult'); out.innerHTML = '<p><span class="spin"></span> 문서를 찾는 중…</p>';
        try {
          let res = await GW.search(el.dataset.no, {types: ['doc'], pageSize: 5});
          let hits = (res.groups.doc.items || []).filter(x => x.docNo === el.dataset.no);
          if (!hits.length) { res = await GW.search(String(el.dataset.t).slice(0, 30), {types: ['doc'], pageSize: 10}); hits = (res.groups.doc.items || []).filter(x => x.docNo === el.dataset.no); }
          if (hits[0]) { out.innerHTML = `<div class="box tip">${esc(hits[0].title)} (${esc(hits[0].docNo)})</div>`; openInPane(hits[0].url); }
          else out.innerHTML = '<div class="box warn">통합검색에서 같은 문서번호를 찾지 못했습니다. 권한이 없거나 아직 색인되지 않은 문서일 수 있습니다.</div>';
        } catch (err) { out.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
        break;
      }
      case 'csvBudget': { const t = S.budget.table; download(`예산_${t.project}_${kstToday()}.csv`, R.toCsv(t.rows, [{label: '구분', key: 'level'}, {label: '코드', key: 'code'}, {label: '과목', key: 'name'}, {label: '예산', key: 'budget'}, {label: '집행', key: 'executed'}, {label: '잔액', key: 'balance'}, {label: '집행률(%)', key: 'rate'}]), 'text/csv;charset=utf-8'); break; }
      case 'csvLedger': { const l = S.budget.ledger; download(`결의내역_${l.bgtCd}_${kstToday()}.csv`, R.toCsv(l.rows, [{label: '결의일', value: r => ymd8(r.date)}, {label: '적요', key: 'desc'}, {label: '금액', key: 'amount'}, {label: '문서번호', key: 'docNo'}, {label: '작성', key: 'writer'}, {label: '전표', key: 'slip'}]), 'text/csv;charset=utf-8'); break; }
      case 'attMonth': loadAttendance(v); break;
      case 'csvAtt': download(`근태_${S.att.month}.csv`, R.toCsv(S.att.rows, [{label: '날짜', value: r => ymd8(r.date)}, {label: '근무유형', key: 'workType'}, {label: '출결', key: 'result'}, {label: '근태항목', key: 'item'}, {label: '상태', key: 'status'}, {label: '출근', value: r => hm4(r.come)}, {label: '퇴근', value: r => hm4(r.leave)}, {label: '인정(분)', key: 'recognizedMin'}]), 'text/csv;charset=utf-8'); break;
      case 'addTodo': addTodo(($('#tdTitle') || {}).value?.trim(), ($('#tdDue') || {}).value || ''); renderMain(); break;
      case 'todoDone': S.todos[Number(el.dataset.i)].done = el.checked; saveLocal(); render(); break;
      case 'todoDel': S.todos.splice(Number(el.dataset.i), 1); saveLocal(); render(); break;
      case 'dlBrief': download(`그룹웨어_브리핑_${kstToday()}.html`, R.renderHtml(S.a), 'text/html;charset=utf-8'); break;
      case 'cpBrief': copy(R.renderMarkdown(S.a)); break;
      case 'csvQueue': download(`할일목록_${kstToday()}.csv`, R.toCsv(queue(), [{label: '우선순위', value: x => PRI[x.priority]}, {label: '영역', key: 'area'}, {label: '구분', key: 'kind'}, {label: '제목', key: 'title'}, {label: '내용', key: 'detail'}, {label: '일시', key: 'when'}]), 'text/csv;charset=utf-8'); break;
      case 'mkWeekly': {
        toast('최근 7일 자료를 읽는 중…');
        try {
          const [sub, hist] = await Promise.all([GW.submittedRange({days: 7, size: 100}), loadRouting()]);
          const me = S.raw.principal.name;
          const from = sub.from;
          const receipts = (hist ? hist.dept : []).filter(r => r.toEmp === me && String(r.date).replace(/-/g, '').slice(0, 8) >= from);
          S.weekly = R.weeklyReport({submitted: sub.docs, receipts, me: `${S.raw.principal.deptName} ${me}`, from, to: sub.to});
        } catch (err) { toast('주간 초안을 만들지 못했습니다: ' + err.message); }
        renderMain(); break;
      }
      case 'cpWeekly': copy(($('#weekly') || {}).value || S.weekly); break;
      case 'dlWeekly': download(`주간업무실적_${kstToday()}.txt`, ($('#weekly') || {}).value || S.weekly); break;
      case 'saveSettings': {
        const st = S.settings;
        st.refreshMin = Number($('#setRefresh').value);
        st.notify = $('#setNotify').checked;
        if (st.notify && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
        st.budget = $('#setBudget').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [project, filter, ...rest] = l.split(/\s+/); return {project, filter: filter && filter !== '-' ? filter : '', label: rest.join(' ')}; }).filter(b => /^[A-Za-z0-9가-힣]+$/.test(b.project));
        if (!st.budget.length) st.budget = DEFAULT_SETTINGS.budget;
        st.urgentWords = $('#setWords').value.split(',').map(w => w.trim()).filter(Boolean);
        st.mailCount = Number($('#setMail').value);
        saveLocal(); schedule(); toast('설정을 저장했습니다.'); S.budget.table = null; refresh(); break;
      }
      case 'resetDone': S.done = {}; S.snooze = {}; saveLocal(); render(); break;
      case 'resetRouting': S.routing = null; store.del('routing'); toast('추천 이력을 지웠습니다.'); break;
      case 'resetAll': if (confirm('이 브라우저에 저장된 업무센터 설정·할 일·표시를 모두 지울까요? (그룹웨어 자료는 바뀌지 않습니다)')) { for (const k of Object.keys(localStorage)) if (k.startsWith(LS) && k !== LS + 'src') localStorage.removeItem(k); S.done = {}; S.snooze = {}; S.todos = []; S.newKeys.clear(); S.settings = {...DEFAULT_SETTINGS}; S.routing = null; render(); } break;
      default: break;
    }
  });
  root.addEventListener('input', e => {
    const t = e.composedPath()[0];
    if (t.id === 'qfilter') { S.filter.q = t.value; const pos = t.selectionStart; renderMain(); const n = $('#qfilter'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
    if (t.id === 'bq') { S.budget.q = t.value; const pos = t.selectionStart; renderMain(); const n = $('#bq'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  });
  root.addEventListener('change', e => {
    const t = e.composedPath()[0];
    if (t.id === 'bproj' && t.value !== '__custom') { const [p, f] = t.value.split('|'); S.budget.project = p; S.budget.filter = f; loadBudget(); }
  });

  let toastTimer = null;
  function toast(msg) {
    let t = root.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; $('#wc').append(t); }
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 3500);
  }

  // ---------- lifecycle ----------
  let prevTitle = document.title;
  function open() {
    S.open = true; host.style.display = 'block'; fab.style.display = 'none'; prevTitle = document.title;
    render();
    if (document.activeElement && document.activeElement !== document.body) { try { document.activeElement.blur(); } catch {} }
    if (!S.a || !S.lastRefresh || Date.now() - S.lastRefresh.getTime() > 60_000) refresh();
  }
  function close() { S.open = false; host.style.display = 'none'; fab.style.display = 'block'; document.title = prevTitle; render(); }
  function destroy() { clearInterval(timer); document.removeEventListener('keydown', onDocKey, true); host.remove(); fab.remove(); }
  schedule();
  return {open, close, destroy, refresh, state: () => ({booted: true, open: S.open, view: S.view, loading: S.loading, error: S.error, actions: S.a ? S.a.actions.length : 0, lastRefresh: S.lastRefresh})};
  }
})();
