/*
 * GW 통합 업무센터 v3.0.0 — one interactive page on top of the logged-in https://gw.bwyf.or.kr tab.
 *
 * Data comes from window.BWYFGW (allow-listed read/search APIs) and window.BWYFGW_REPORT (analysis).
 * The right-hand pane embeds the groupware's own screens (approval document, board article, mail
 * compose, new draft, attendance request). Real processing (결재·접수·배부·발송·답장) happens there,
 * with the groupware's own buttons. This script itself never writes to the groupware.
 * Local state (hidden/snooze/plan/to-do/settings/caches) lives in this browser's localStorage.
 */
(() => {
  'use strict';
  const VERSION = '3.3.0';
  let api = null;
  const lazy = {
    version: VERSION,
    open() { if (!api) api = boot(); api.open(); },
    close() { if (api) api.close(); },
    destroy() { if (api) api.destroy(); api = null; },
    refresh() { if (!api) api = boot(); return api.refresh(); },
    install(src) { if (typeof src !== 'string' || src.length < 1000) return false; try { localStorage.setItem('bwyfgw:wc:src', src); return true; } catch { return false; } },
    state() { return api ? api.state() : {booted: false}; },
    debug() { return api ? api.debug() : null; },
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
  const DEFAULT_SETTINGS = {refreshMin: 5, notify: false, budget: [{project: 'A201', label: '전략경영실운영', filter: '노121'}], urgentWords: [], mailCount: 100, days: 14, fontSize: 'm', theme: 'light', paneWidth: 560, beginner: true, tourDone: false};
  const migrateTodos = list => (Array.isArray(list) ? list : []).map(t => ({id: t.id || `t${t.at || Date.now()}${Math.random().toString(36).slice(2, 6)}`, title: t.title, due: t.due || '', status: t.status || (t.done ? 'done' : 'todo'), source: t.source || '', url: t.url || '', at: t.at || Date.now()}));
  const S = {
    settings: {...DEFAULT_SETTINGS, ...store.get('settings', {})},
    hidden: store.get('hidden', store.get('done', {})), snooze: store.get('snooze', {}), plan: store.get('plan', {}),
    todos: migrateTodos(store.get('todos', [])), newKeys: new Set(store.get('newKeys', [])), activity: store.get('activity', []), seenActivity: store.get('seenActivity', 0),
    history: store.get('history', []), routing: store.get('routing', null), forms: store.get('forms', null),
    raw: null, a: null, view: 'today', loading: false, error: '', lastRefresh: null, pendingRefresh: false,
    filter: {area: 'all', level: 'all', q: '', onlyNew: false, showHidden: false}, multi: new Set(), lastClickKey: '',
    apTab: 'distWaiting', apMore: {}, mailFilter: 'all', mailGroup: false,
    sel: null, pane: {url: '', mounted: '', expanded: false, extract: null, preview: null},
    focus: null,
    search: {kw: '', types: ['doc', 'mail', 'board', 'file', 'person'], period: '', res: null, busy: false, more: {}}, mailSearch: {kw: '', res: null},
    budget: {project: '', filter: '', table: null, ledger: null, monthly: null, month: '', busy: false, q: '', seq: 0},
    att: {month: '', rows: null, busy: false, seq: 0, day: ''}, cal: {offset: 0},
    weekly: store.get('weekly', ''), errors: store.get('errors', []), undo: [], open: false, paletteOpen: false, helpOpen: false, menuOpen: '',
  };
  const saveLocal = () => {
    store.set('hidden', S.hidden); store.set('snooze', S.snooze); store.set('plan', S.plan); store.set('todos', S.todos); store.set('settings', S.settings);
    store.set('newKeys', [...S.newKeys]); store.set('activity', S.activity.slice(-150)); store.set('seenActivity', S.seenActivity); store.set('history', S.history.slice(-40)); store.set('weekly', S.weekly);
  };

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const won = n => Math.round(Number(n || 0)).toLocaleString('ko-KR');
  const pct = n => `${(Math.round(Number(n || 0) * 10) / 10).toFixed(1)}%`;
  const ymd8 = s => (s && /^\d{8}/.test(s)) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || '');
  const hm4 = s => (s && /^\d{4}$/.test(s)) ? `${s.slice(0, 2)}:${s.slice(2)}` : (s || '');
  const dtm12 = s => (s && /^\d{12}/.test(s)) ? `${ymd8(s)} ${s.slice(8, 10)}:${s.slice(10, 12)}` : ymd8(s);
  const mins = m => m === null || m === undefined ? '-' : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`;
  // 6.59375일 -> "6일 4시간 45분" (1일 = 8시간)
  const fmtDays = v => { if (v === null || v === undefined || v === '') return '-'; const n = Number(v); const d = Math.trunc(n); const m = Math.round((n - d) * 8 * 60); return `${d}일${m ? ` ${Math.floor(m / 60) ? Math.floor(m / 60) + '시간' : ''}${m % 60 ? ` ${m % 60}분` : ''}` : ''}`.replace(/\s+/g, ' ').trim(); };
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const today = () => R.kstNow(new Date()).date;
  const hhmm = d => { const k = R.kstNow(d); return `${String(k.hh).padStart(2, '0')}:${String(k.mm).padStart(2, '0')}`; };
  const ddayText = n => n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`;
  const PRI = {high: '긴급', medium: '보통', low: '참고'};
  const download = (name, text, type = 'text/plain;charset=utf-8') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const copyText = async text => { try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); } catch { toast('복사하지 못했습니다.'); } };
  // Rich copy: 한글/워드에 붙여넣으면 표·굵게가 유지된다.
  const copyRich = async (html, text) => {
    try { await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([html], {type: 'text/html'}), 'text/plain': new Blob([text], {type: 'text/plain'})})]); toast('한글에 붙여넣을 수 있게 복사했습니다.'); }
    catch { copyText(text); }
  };
  const hl = (text, kw) => { const t = String(text ?? ''); if (!kw) return esc(t); const i0 = []; const low = t.toLowerCase(), k = String(kw).toLowerCase(); let i = low.indexOf(k); while (i >= 0 && i0.length < 50) { i0.push(i); i = low.indexOf(k, i + k.length); } if (!i0.length) return esc(t); let out = '', p = 0; for (const s of i0) { out += esc(t.slice(p, s)) + `<mark>${esc(t.slice(s, s + k.length))}</mark>`; p = s + k.length; } return out + esc(t.slice(p)); };
  const isHidden = k => !!S.hidden[k];
  const isSnoozed = k => S.snooze[k] && S.snooze[k] > Date.now();
  const tomorrow8 = () => { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(8, 0, 0, 0); return t.getTime(); };
  const uid = () => `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

  // ---------- shell ----------
  const host = document.createElement('div');
  host.id = 'bwyfgw-workcenter';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:none';
  const root = host.attachShadow({mode: 'open'});
  const fab = document.createElement('div');
  fab.id = 'bwyfgw-wc-fab';
  fab.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483500;background:#1a5fd0;color:#fff;font:700 14px "Malgun Gothic",sans-serif;height:38px;padding:0 16px;border-radius:999px;box-shadow:0 6px 18px rgba(26,95,208,.35);cursor:pointer;user-select:none;display:flex;align-items:center';
  fab.setAttribute('role', 'button'); fab.tabIndex = 0;
  fab.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  fab.textContent = '업무센터';
  fab.title = '통합 업무센터 열기 (Alt+G)';
  // One-time bubble after closing: tells where the work center went.
  const tipBubble = document.createElement('div');
  tipBubble.style.cssText = 'position:fixed;left:50%;top:58px;transform:translateX(-50%);z-index:2147483500;background:#202124;color:#fff;font:13px "Malgun Gothic",sans-serif;padding:9px 13px;border-radius:9px;box-shadow:0 4px 14px rgba(0,0,0,.3);display:none;max-width:280px;line-height:1.5';
  tipBubble.textContent = '업무센터는 화면 위 가운데 파란 "업무센터" 버튼(또는 Alt+G)으로 다시 엽니다.';
  let tipTimer = 0;
  fab.addEventListener('click', () => open());
  document.body.append(host, fab, tipBubble);

  const WC_CSS = '/*@WC_CSS@*/';
  // One small line-icon set (stroke icons, 24px grid) so every screen uses the same visual language.
  const ICONS = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    inbox: '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5 5h14l1 8v6H4v-6z"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.3-4.3"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="8" rx="1.5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    wallet: '<path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M16 13h2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    report: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5"/><path d="M12 17h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    down: '<path d="M12 4v12M6 11l6 6 6-6"/><path d="M5 20h14"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    play: '<path d="M7 5v14l11-7z"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    clip: '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3L14.5 7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    snooze: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  };
  const ic = (n, extra = '') => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${ICONS[n] || ''}</svg>`;
  root.innerHTML = `<style>${WC_CSS}</style><div class="wc nopane" id="wc" role="application" aria-label="GW 통합 업무센터"><header role="banner">
<button class="home" data-act="home" title="처음 화면(오늘 할 일)으로 · H" aria-label="업무센터 처음 화면"><span class="logo">${ic('home')}</span>업무센터</button>
<label class="srch" title="통합검색 또는 명령 (Ctrl+K)">${ic('search')}<input id="gsearch" placeholder="메일·문서·사람 검색 또는 명령" autocomplete="off" aria-label="통합검색"><kbd>Ctrl K</kbd></label>
<span class="sp"></span>
<button class="stat" id="meta" data-act="refresh" title="지금 다시 읽기 (R)"></button>
<button class="hb" data-act="menuNew" title="새 메일·새 기안·근태신청">${ic('plus')}새로 만들기</button>
<button class="hb icon" data-act="menuBell" id="bell" title="새로 들어온 항목" aria-label="알림">${ic('bell')}</button>
<button class="hb icon" data-act="menuView" title="도움말·보기 설정" aria-label="도움말과 보기 설정">${ic('help')}</button>
<button class="hb back" data-act="close" title="업무센터를 접고 원래 그룹웨어 화면으로 (화면 위 가운데 '업무센터' 버튼이나 Alt+G로 다시 열기)">${ic('back')}그룹웨어로 돌아가기</button></header>
<div class="band" id="band" role="status" aria-live="polite"></div><nav id="nav" aria-label="업무센터 메뉴"></nav><main id="main" tabindex="-1"></main><div class="split" id="split" title="끌어서 오른쪽 창 너비 조절"></div><aside id="pane" aria-label="선택한 항목"></aside><div id="overlay"></div></div>`;
  const $ = sel => root.querySelector(sel);
  const wcEl = $('#wc');
  const applyLook = () => {
    wcEl.dataset.fs = S.settings.fontSize;
    wcEl.classList.toggle('dark', S.settings.theme === 'dark');
    wcEl.style.setProperty('--paneW', `${Math.max(360, Math.min(window.innerWidth * 0.75, S.settings.paneWidth))}px`);
  };
  applyLook();

  // ---------- data ----------
  async function refresh({silent = false} = {}) {
    if (S.loading) return;
    S.loading = true; S.error = '';
    if (!silent) renderHead();
    try {
      const raw = await GW.collect({budget: S.settings.budget, mailCount: S.settings.mailCount, days: S.settings.days});
      ingest(raw);
    } catch (e) { S.error = e && e.message || String(e); logError('자료 읽기', S.error); }
    finally { S.loading = false; }
    if (silent && isUserBusy()) { S.pendingRefresh = true; renderHead(); renderBand(); renderNav(); return; }
    render();
  }
  function logError(where, msg) { S.errors = [...(S.errors || []), {at: Date.now(), where, msg: String(msg).slice(0, 300)}].slice(-30); store.set('errors', S.errors); }
  function ingest(raw) {
    const prev = store.get('state', null);
    const usablePrev = prev && prev.at && Date.parse(prev.at) < Date.parse(raw.collectedAt) ? prev : null;
    const a = R.analyze(raw, usablePrev, new Date(), {roles: S.settings.roles});
    applyUrgentWords(a);
    const fresh = a.actions.filter(x => x.isNew);
    for (const x of fresh) { S.newKeys.add(x.key); S.activity.push({at: Date.now(), key: x.key, title: x.title, kind: x.kind, area: x.area, priority: x.priority}); }
    if (!raw.sessionExpired) store.set('state', R.nextState(raw, usablePrev));
    // Clean local marks only for areas that were read successfully this time.
    const okAreas = new Set(a.status.filter(s => s.ok).map(s => s.name));
    const areaOf = k => k.startsWith('doc:') ? 'approval' : k.startsWith('mail:') ? 'mail' : k.startsWith('notice:') ? 'notice' : k.startsWith('att:') ? 'attendance' : k.startsWith('leave:') ? 'leave' : '';
    const live = new Set(a.actions.map(x => x.key));
    for (const k of Object.keys(S.snooze)) if (S.snooze[k] < Date.now() || (okAreas.has(areaOf(k)) && !live.has(k))) delete S.snooze[k];
    for (const k of Object.keys(S.hidden)) if (okAreas.has(areaOf(k)) && !live.has(k)) delete S.hidden[k];
    for (const k of Object.keys(S.plan)) if (k.startsWith('todo:') ? !S.todos.some(t => `todo:${t.id}` === k) : (okAreas.has(areaOf(k)) && !live.has(k))) delete S.plan[k];
    const d = today();
    const h = S.history.find(x => x.date === d);
    const entry = {date: d, total: a.actions.length, high: a.summary.high, approval: a.summary.approvalAction, mail: a.summary.mailUnread};
    if (h) Object.assign(h, entry); else S.history.push(entry);
    S.raw = raw; S.a = a; S.lastRefresh = new Date(); S.pendingRefresh = false;
    if (raw.sessionExpired) S.error = 'SESSION';
    saveLocal();
    notifyNew(fresh.filter(x => x.priority === 'high'));
  }
  // ----- 내 일 / 참고 구분 (user rules on top of the analyzer's defaults) -----
  const RULE_KIND = {deptWaiting: '부서 접수 대기', distWaiting: '배부 대기', sendWaiting: '발송 대기', viewing: '열람문서', notice: '공지', mailShared: '받은 자료 메일', mailUnread: '안 읽은 메일', mailReply: '답장 확인 메일', leave: '휴가 안내'};
  function senderOf(x) {
    if (x.type === 'mail') { const m = findMail(x.ref.box, x.ref.uid); return m ? m.from : ''; }
    if (x.type === 'doc') { const d = findDoc(x.ref.kind, x.ref.docId); return d ? (d.sendOrg || d.sender || d.drafter || '') : ''; }
    if (x.type === 'notice') return (x.detail || '').split(' ')[0] || '';
    return '';
  }
  const rel = () => { const r = S.settings.rel = S.settings.rel || {}; r.mute = r.mute || []; r.mine = r.mine || []; return r; };
  const ruleMatch = (r, x) => r.t === 'key' ? x.key === r.v : r.t === 'kind' ? x.base === r.v : r.t === 'sender' ? senderOf(x) === r.v : false;
  function applyRelevance(a) {
    const r = rel();
    a.muted = a.actions.filter(x => r.mute.some(q => ruleMatch(q, x)));
    a.actions = a.actions.filter(x => !a.muted.includes(x));
    for (const x of a.actions) if (x.scope === 'ref' && r.mine.some(q => ruleMatch(q, x))) { x.scope = 'mine'; x.refReason = ''; x.state = x.deadline && x.deadline.dday <= 1 ? 'urgent' : 'todo'; x.priority = x.state === 'urgent' ? 'high' : 'medium'; x.why = [...(x.why || []), '내 일로 지정']; }
    sortActions(a);
  }
  function reanalyze() { const a = R.analyze(S.raw, store.get('state', null), new Date(), {roles: S.settings.roles}); applyUrgentWords(a); S.a = a; }
  function addRule(list, t, v, label) {
    const r = rel();
    pushUndo('관련성 규칙');
    r[list] = r[list].filter(q => !(q.t === t && q.v === v));
    r[list].push({t, v, label, at: Date.now()});
    saveLocal(); if (S.raw) reanalyze(); closeOverlay(); render();
  }
  function applyUrgentWords(a) {
    applyRelevance(a);
    const words = (S.settings.urgentWords || []).filter(Boolean);
    if (!words.length) return;
    const re = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
    for (const x of a.actions) if (re.test(x.title)) { x.score += 30; x.why = [...(x.why || []), '내 긴급 키워드']; if (x.scope !== 'ref' && ['todo', 'check'].includes(x.state)) { x.state = 'urgent'; x.priority = 'high'; } }
    sortActions(a);
  }
  const ST_RANK = {overdue: 0, urgent: 1, todo: 2, check: 3, confirm: 4, info: 5};
  function sortActions(a) { a.actions.sort((p, q) => (ST_RANK[p.state] ?? 2) - (ST_RANK[q.state] ?? 2) || q.score - p.score); }
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
  async function loadForms(force = false) {
    if (S.forms && !force && Date.now() - (S.forms.at || 0) < 7 * 86400_000) return S.forms.list;
    try { const list = await GW.frequentForms(); S.forms = {at: Date.now(), list}; store.set('forms', S.forms); } catch (e) { toast('양식 목록을 읽지 못했습니다: ' + e.message); }
    return S.forms ? S.forms.list : [];
  }
  const previewCache = new Map();
  async function loadPreview(doc) {
    const k = doc.docNo || doc.title;
    if (previewCache.has(k)) return previewCache.get(k);
    const p = GW.docPreview({docNo: doc.docNo, title: doc.title}).catch(() => ({found: false}));
    previewCache.set(k, p);
    return p;
  }
  const isUserBusy = () => {
    const ae = root.activeElement;
    if (ae && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName) && ae.id !== 'gsearch') return true;
    return !!S.focus || S.paletteOpen;
  };

  // ---------- timers & keys ----------
  let timer = null;
  function schedule() {
    clearInterval(timer);
    const m = Number(S.settings.refreshMin || 0);
    if (m > 0) timer = setInterval(() => refresh({silent: true}), m * 60_000);
  }
  const onDocKey = e => {
    if (e.altKey && e.code === 'KeyG') { e.preventDefault(); e.stopPropagation(); S.open ? close() : open(); return; }
    if (S.open) handleKey(e);
  };
  document.addEventListener('keydown', onDocKey, true);
  const onResize = () => applyLook();
  window.addEventListener('resize', onResize);
  function handleKey(e) {
    const t = e.composedPath()[0] || {};
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName || '') || t.isContentEditable;
    e.stopPropagation(); // keep groupware shortcuts from firing behind the work center
    if (e.isComposing || e.keyCode === 229) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); openPalette(typing && t.id === 'gsearch' ? t.value : ''); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !typing) { e.preventDefault(); undo(); return; }
    if (e.key === 'Escape') {
      if (S.coach) { endCoach(); return; }
      if (S.paletteOpen || S.helpOpen || S.menuOpen) { closeOverlay(); return; }
      if (typing) { t.blur(); return; }
      if (S.focus) { stopFocus(); return; }
      if (S.pane.url) { if (!leavePane()) return; S.pane.url = ''; renderPane(); return; }
      if (S.sel) { S.sel = null; render(); return; }
      close(); return;
    }
    if (S.paletteOpen) { paletteKey(e); return; }
    if (S.coach) { if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); coachNext(); } return; }
    if (!typing && (e.key === 'Enter' || e.key === ' ') && t.dataset && t.dataset.act && t.tagName !== 'BUTTON' && t.tagName !== 'A' || (!typing && (e.key === 'Enter' || e.key === ' ') && t.tagName === 'A' && !t.href)) { e.preventDefault(); t.click(); return; }
    if (typing) {
      if (e.key !== 'Enter') return;
      if (t.id === 'gsearch') { const v = t.value.trim(); if (v) { S.search.kw = v; runSearch(); } }
      else if (t.id === 'sq') { S.search.kw = t.value.trim(); runSearch(); }
      else if (t.id === 'mailq') runMailSearch(t.value.trim());
      else if (t.id === 'tdTitle') addTodoFromInput();
      else if (t.id === 'bcode' || t.id === 'bfilter') { S.budget.project = $('#bcode').value.trim(); S.budget.filter = $('#bfilter').value.trim(); loadBudget(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code;
    if (c === 'Slash' && e.shiftKey) { toggleHelp(); return; }
    if (c === 'Slash') { e.preventDefault(); $('#gsearch').focus(); return; }
    if (c === 'KeyH') { goHome(); return; }
    if (c === 'KeyR') { refresh(); return; }
    if (c === 'KeyF') { startFocus(); return; }
    if (/^Digit[1-9]$/.test(c)) { const v = VIEWS[Number(c.slice(5)) - 1]; if (v) go(v.id); return; }
    if (S.focus) { if (c === 'KeyN') focusNext(true); else if (c === 'KeyB') focusPrev(); return; }
    if (S.view === 'today' && ['KeyJ', 'KeyK', 'ArrowDown', 'ArrowUp'].includes(c)) { e.preventDefault(); moveSel(c === 'KeyJ' || c === 'ArrowDown' ? 1 : -1); return; }
    const x = selectedAction();
    if (!x) return;
    if (c === 'Enter') openItem(x);
    else if (c === 'KeyO') openWindow(x.url, x);
    else if (c === 'KeyX') hide([x.key]);
    else if (c === 'KeyS') snooze([x.key]);
    else if (c === 'KeyT') addTodo(x.title, x.deadline && x.deadline.date || '', x.kind, x.url, x.key);
  }
  root.addEventListener('keyup', e => e.stopPropagation());

  // ---------- views ----------
  const VIEWS = [
    {id: 'today', label: '오늘 할 일'}, {id: 'overview', label: '현황'}, {id: 'approval', label: '결재·문서유통'}, {id: 'mail', label: '메일'}, {id: 'search', label: '통합검색'},
    {id: 'board', label: '할 일 보드'}, {id: 'calendar', label: '일정 달력'}, {id: 'budget', label: '예산 집행'}, {id: 'attendance', label: '근태·연차'},
    {id: 'report', label: '보고서'}, {id: 'settings', label: '설정'},
  ];
  // Charts: shown on big screens, folded on laptops unless the user chose otherwise.
  const showCharts = () => S.settings.showCharts ?? (window.innerHeight >= 860 && window.innerWidth >= 1500);
  const go = v => { if (S.view !== v && !S.focus) { if (!leavePane()) return; S.sel = null; S.pane.url = ''; } S.view = v; S.multi.clear(); S.pane.expanded = false; render(); const mm = $('#main'); if (mm) mm.scrollTop = 0; };
  // Home: back to a clean "오늘 할 일" (asks first if something is being typed in the pane).
  function goHome() {
    if (S.focus) { stopFocus(); if (S.focus) return; }
    if (!leavePane()) return;
    closeOverlay();
    S.sel = null; S.pane.url = ''; S.pane.expanded = false; S.multi.clear();
    S.filter = {...S.filter, area: 'all', level: 'all', onlyNew: false, q: '', showHidden: false};
    S.view = 'today';
    render();
    const mm = $('#main'); if (mm) mm.scrollTop = 0;
  }
  // Hidden items come back after 24h if the groupware still lists them (숨겼지만 아직 남음).
  const resurfaced = k => isHidden(k) && Date.now() - S.hidden[k] > 86400_000;
  const visibleActions = () => S.a ? S.a.actions.filter(x => S.filter.showHidden ? (isHidden(x.key) || isSnoozed(x.key)) : ((!isHidden(x.key) || resurfaced(x.key)) && !isSnoozed(x.key))) : [];
  const queue = () => {
    const f = S.filter;
    return visibleActions().filter(x => (f.area === 'all' || x.area === f.area) && (!f.onlyNew || S.newKeys.has(x.key))
      && (!f.q || (x.title + x.detail + x.kind).toLowerCase().includes(f.q.toLowerCase())));
  };
  const selectedAction = () => S.sel && S.sel.type === 'action' ? S.a && S.a.actions.find(x => x.key === S.sel.key) : null;
  function moveSel(step) {
    const q = queue();
    if (!q.length) return;
    let i = q.findIndex(x => S.sel && S.sel.key === x.key);
    i = Math.max(0, Math.min(q.length - 1, i + step));
    selectAction(q[i].key);
    const row = root.querySelector(`.row[data-k="${CSS.escape(q[i].key)}"]`);
    if (row) row.scrollIntoView({block: 'nearest'});
  }

  function render() {
    if (!S.open) return;
    renderHead(); renderBand(); renderNav(); renderMain(); renderPane();
  }
  const STATE_ORDER = ['overdue', 'urgent', 'todo', 'check', 'confirm', 'info'];
  const STATE_NAME = {overdue: '기한 지남', urgent: '급함', todo: '할 일', check: '확인 필요', confirm: '끝났는지 확인', info: '참고'};
  const STATE_GROUP = {overdue: '급한 일', urgent: '급한 일', todo: '할 일', check: '확인이 필요한 일', confirm: '끝났는지만 확인', info: '참고'};
  const stateOf = x => x.state || (x.scope === 'ref' ? 'info' : x.priority === 'high' ? 'urgent' : 'todo');
  const isMine = x => x.scope !== 'ref';
  const mineVisible = () => visibleActions().filter(isMine);
  function renderHead() {
    const m = $('#meta');
    if (!m) return;
    const age = S.lastRefresh ? Math.floor((Date.now() - S.lastRefresh.getTime()) / 60000) : null;
    m.className = 'stat' + (age !== null && age >= 10 ? ' stale' : '');
    m.innerHTML = S.loading ? '<span class="spin"></span> 읽는 중' : S.lastRefresh ? `${ic('refresh')}${hhmm(S.lastRefresh)} 기준${age ? ` · ${age}분 전` : ''}` : `${ic('refresh')}새로고침`;
    const unseen = S.activity.filter(x => x.at > S.seenActivity).length;
    $('#bell').innerHTML = `${ic('bell')}${unseen ? `<span class="dot">${unseen > 99 ? '99+' : unseen}</span>` : ''}`;
    const urgent = S.a ? mineVisible().filter(x => ['overdue', 'urgent'].includes(stateOf(x))).length : 0;
    const total = S.a ? mineVisible().length : 0;
    fab.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px">${ic('home').replace('class="i"', 'width="16" height="16" style="fill:none;stroke:currentColor;stroke-width:2"')}업무센터${S.a ? ` <b style="background:${urgent ? '#ff5252' : 'rgba(255,255,255,.25)'};border-radius:999px;padding:0 7px;font-size:12px">${urgent ? `급함 ${urgent}` : total}</b>` : ''}</span>`;
  }
  function updCrumb() {}
  function renderBand() {
    const b = $('#band');
    const parts = [];
    if (S.error === 'SESSION') parts.push(`<div class="b err">${ic('alert')}<b>그룹웨어 로그인이 끊겼습니다.</b> 지금 보이는 숫자는 최신이 아닙니다. <button class="btn sm" data-act="relogin">다시 로그인</button></div>`);
    else if (S.error) parts.push(`<div class="b err">${ic('alert')}자료를 읽지 못했습니다: ${esc(S.error)} <button class="btn sm" data-act="refresh">다시 시도</button></div>`);
    if (S.a && S.a.failed.length) parts.push(`<div class="b warn">${ic('alert')}${S.a.failed.map(f => esc(MODNAME[f.name] || f.name)).join(', ')} 자료를 지금 확인할 수 없습니다. 해당 숫자는 "확인 불가"로 표시합니다. <button class="btn sm" data-act="refresh">다시 시도</button></div>`);
    if (S.pendingRefresh) parts.push(`<div class="b info">새 자료가 도착했습니다. 작업 중이라 화면은 그대로 두었습니다. <button class="btn sm primary" data-act="applyRefresh">지금 반영</button></div>`);
    const age = S.lastRefresh ? (Date.now() - S.lastRefresh.getTime()) / 60000 : 0;
    if (age >= 15 && !S.loading) parts.push(`<div class="b warn">${Math.floor(age)}분 전 자료입니다. <button class="btn sm" data-act="refresh">새로고침</button></div>`);
    b.innerHTML = parts.join('');
  }
  const MODNAME = {mail: '메일', approval: '전자결재', notice: '공지', schedule: '일정', attendance: '근태', leave: '연차', budget: '예산', alerts: '알림'};
  const VIEW_ICON = {today: 'inbox', overview: 'chart', approval: 'doc', mail: 'mail', search: 'search', board: 'board', calendar: 'cal', budget: 'wallet', attendance: 'clock', report: 'report', settings: 'gear'};
  function renderNav() {
    const u = S.a ? S.a.unknown : {};
    const mine = S.a ? mineVisible() : [];
    const urgent = mine.filter(x => ['overdue', 'urgent'].includes(stateOf(x))).length;
    const byArea = a => mine.filter(x => x.area === a).length;
    const counts = {
      today: S.a ? {n: mine.length, cls: urgent ? 'hot' : mine.length ? 'mine' : ''} : null,
      approval: S.a ? (u.approval ? {n: '?'} : {n: byArea('결재'), cls: byArea('결재') ? 'mine' : ''}) : null,
      mail: S.a ? (u.mail ? {n: '?'} : {n: byArea('메일'), cls: byArea('메일') ? 'mine' : ''}) : null,
      attendance: S.a ? {n: byArea('근태'), cls: byArea('근태') ? 'mine' : ''} : null,
      board: S.a ? {n: boardCount()} : null,
      calendar: S.a ? {n: S.a.deadlines.filter(x => x.dday >= 0 && x.dday <= 7).length} : null,
    };
    const item = (v, i) => { const c = counts[v.id]; return `<a data-act="view" data-v="${v.id}" class="${S.view === v.id ? 'on' : ''}" role="link" tabindex="0" aria-current="${S.view === v.id ? 'page' : 'false'}" title="${esc(v.label)} (숫자키 ${i + 1})">${ic(VIEW_ICON[v.id])}<span class="lb">${esc(v.label)}</span>${c && c.n !== '' && c.n !== 0 ? `<span class="n ${c.cls || ''}" title="${v.id === 'today' ? '내 처리할 일' : v.id === 'board' ? '보드의 남은 카드' : v.id === 'calendar' ? '7일 안 기한' : '내 처리할 일 중 이 영역'}">${c.n}</span>` : ''}</a>`; };
    $('#nav').innerHTML = VIEWS.slice(0, 9).map(item).join('') + '<div class="sep"></div>' + VIEWS.slice(9).map((v, i) => item(v, i + 9)).join('')
      + `<div class="foot"><a data-act="help" role="link" tabindex="0">${ic('help')}<span class="lb">사용법</span></a><a data-act="coach" role="link" tabindex="0">${ic('play')}<span class="lb">처음 안내 다시 보기</span></a></div>`;
  }
  function boardCount() { return (S.a ? S.a.actions.filter(x => onBoard(x) && bucketOfAction(x) !== 'done').length : 0) + S.todos.filter(t => bucketOfTodo(t) !== 'done').length; }
  function renderMain() {
    const el = $('#main');
    if (!S.a) { el.innerHTML = S.error && S.error !== 'SESSION' ? `<div class="empty"><div class="ill">${ic('alert')}</div><b>자료를 읽지 못했습니다</b>${esc(S.error)}<div class="acts" style="justify-content:center"><button class="btn primary" data-act="refresh">다시 시도</button></div></div>` : `<div class="pgh"><h1>그룹웨어 자료를 읽는 중입니다</h1><span class="spin"></span></div><div class="list">${'<div class="sk row"></div>'.repeat(6)}</div>`; return; }
    const scroll = el.scrollTop;
    const fn = {today: vToday, overview: vOverview, approval: vApproval, mail: vMail, search: vSearch, board: vBoard, calendar: vCalendar, budget: vBudget, attendance: vAttendance, report: vReport, settings: vSettings}[S.view] || vToday;
    el.innerHTML = fn();
    el.scrollTop = scroll;
    if (S.view === 'report') { const f = $('#briefFrame'); if (f) f.srcdoc = R.renderHtml(S.a); }
    if (S.view === 'budget' && !S.budget.table && !S.budget.busy) loadBudget();
    if (S.view === 'attendance' && !S.att.rows && !S.att.busy) loadAttendance();
    if (S.view === 'approval' && ['distWaiting', 'deptWaiting'].includes(S.apTab) && !S.routing) loadRouting().then(() => { if (S.view === 'approval') renderMain(); });
  }
  const pgh = (title, sub = '', tools = '') => `<div class="pgh"><h1>${title}</h1>${sub ? `<span class="sub">${sub}</span>` : ''}${tools ? `<div class="tools">${tools}</div>` : ''}</div>`;

  // ----- 오늘 할 일 -----
  function vToday() {
    const mine = mineVisible();
    const cnt = st => mine.filter(x => st.includes(stateOf(x))).length;
    const urgent = cnt(['overdue', 'urgent']), todo = cnt(['todo']), check = cnt(['check']), confirm = cnt(['confirm']);
    const refN = visibleActions().filter(x => !isMine(x)).length;
    const top = mine[0];
    const name = (S.raw && S.raw.principal && S.raw.principal.name) || '';
    const f = S.filter;
    const stat = (key, label, n, color) => `<button class="stat ${f.level === key ? 'on' : ''}" data-act="stateFilter" data-v="${key}" aria-pressed="${f.level === key}"><div class="l"><i style="background:${color}"></i>${label}</div><div class="v">${n}</div></button>`;
    const msg = mine.length
      ? `<b class="big">${esc(name)} 님, 처리할 일 ${mine.length}건${urgent ? ` 중 <span style="color:var(--hi)">급한 일 ${urgent}건</span>` : ''}</b><div class="next">${top ? `가장 먼저: <a data-act="selAction" data-k="${esc(top.key)}">${esc(top.title.slice(0, 46))}</a>${top.headline ? ` · ${esc(top.headline)}` : ''}` : ''}</div>`
      : `<b class="big">${esc(name)} 님, 지금 처리할 일이 없습니다</b><div class="next">참고 항목 ${refN}건은 아래에 접어 두었습니다.</div>`;
    const areas = [['all', '전체'], ['결재', '결재'], ['메일', '메일'], ['기한', '기한'], ['근태', '근태'], ['공지', '공지']].filter(([a]) => a === 'all' || mine.some(x => x.area === a));
    const acnt = a => a === 'all' ? mine.length : mine.filter(x => x.area === a).length;
    const hiddenN = S.a.actions.filter(x => isHidden(x.key) || isSnoozed(x.key)).length;
    return `<div class="hello"><div class="msg">${msg}</div><div class="stats">${stat('urgent', '급한 일', urgent, 'var(--hi)')}${stat('todo', '할 일', todo, 'var(--accent)')}${stat('check', '확인 필요', check, '#d98200')}${stat('confirm', '끝났는지 확인', confirm, 'var(--ok)')}</div>${mine.length ? `<button class="btn primary" data-act="focusStart" title="처리할 일을 하나씩 차례로 (F)">${ic('play')}하나씩 처리하기</button>` : ''}</div>
<div class="bar"><div class="seg" role="tablist" aria-label="영역">${areas.map(([a, n]) => `<button role="tab" aria-selected="${f.area === a}" class="${f.area === a ? 'on' : ''}" data-act="area" data-v="${a}">${n}<span class="c">${acnt(a)}</span></button>`).join('')}</div>
<label class="srch-in" style="flex:1;min-width:180px;display:flex"><input class="inp grow" id="qfilter" placeholder="목록에서 찾기" value="${esc(f.q)}" aria-label="목록에서 찾기"></label>
${f.level !== 'all' ? `<button class="chip on" data-act="stateFilter" data-v="all">${esc(STATE_GROUP[f.level] || '')} ${ic('x')}</button>` : ''}
<button class="chip ${f.showHidden ? 'on' : ''}" data-act="showHidden" title="이 화면에서 숨기거나 내일로 미룬 항목">${ic('eye')}숨긴 항목 ${hiddenN}</button></div>
<div id="batch">${batchBar()}</div>
<div id="qlist">${queueRows()}</div>`;
  }
  const queueRows = () => {
    const all = queue();
    const lvl = S.filter.level;
    const mine = all.filter(isMine).filter(x => lvl === 'all' || (lvl === 'urgent' ? ['overdue', 'urgent'].includes(stateOf(x)) : stateOf(x) === lvl));
    const refs = lvl === 'all' ? all.filter(x => !isMine(x)) : [];
    const groups = [];
    for (const st of ['urgent', 'todo', 'check', 'confirm']) {
      const xs = mine.filter(x => STATE_GROUP[stateOf(x)] === STATE_GROUP[st]);
      if (xs.length && !groups.some(g => g.name === STATE_GROUP[st])) groups.push({name: STATE_GROUP[st], xs});
    }
    const body = groups.map(g => `<div class="grp">${esc(g.name)}<span class="c">${g.xs.length}</span></div><div class="list" role="list">${g.xs.map(x => actionRow(x)).join('')}</div>`).join('');
    const empty = !mine.length ? `<div class="list"><div class="empty"><div class="ill">${ic('check', 'style="width:36px;height:36px;color:var(--ok)"')}</div><b>${S.filter.showHidden ? '숨긴 항목이 없습니다' : S.a.failed.length ? '일부 자료를 읽지 못했습니다' : S.filter.q || lvl !== 'all' || S.filter.area !== 'all' ? '조건에 맞는 항목이 없습니다' : '지금 처리할 일이 없습니다'}</b>${S.a.failed.length ? '목록이 비어 보일 수 있습니다. 위의 "다시 시도"를 눌러 주세요.' : '새 일이 들어오면 여기에 바로 나타납니다.'}</div></div>` : '';
    const refBox = refs.length ? `<details class="refbox" ${S.refOpen ? 'open' : ''} data-act="refToggle"><summary><span class="car">${ic('play', 'style="width:12px;height:12px"')}</span>참고 ${refs.length}건 <span class="muted" style="font-weight:400">나와 직접 관련이 적은 항목(부서 접수·배부, 다른 사람 발송, 공지, 받은 자료)</span></summary><div class="list">${refs.map(x => actionRow(x, true)).join('')}</div></details>` : '';
    return empty + body + refBox;
  };
  function actionRow(x, ref = false) {
    const st = stateOf(x);
    const dl = x.deadline && x.deadline.date && !ref ? `<span class="bdg date ${x.deadline.dday <= 1 && ['overdue', 'urgent'].includes(st) ? 'hot' : ''}">${ic('clock')}${esc(x.deadline.date.slice(5).replace('-', '/'))}${x.deadline.time ? ' ' + esc(x.deadline.time) : ''}</span>` : '';
    const stale = isHidden(x.key) && Date.now() - S.hidden[x.key] > 86400_000;
    const plan = S.plan[x.key] ? `<span class="bdg tag">${esc(BUCKET_NAME[S.plan[x.key]] || '')}</span>` : '';
    const facts = (x.facts && x.facts.length ? x.facts : [x.kind, x.detail]).filter(Boolean).slice(0, 4);
    const head = x.headline || x.kind;
    const typeIcon = {doc: 'doc', mail: 'mail', notice: 'bell', attendance: 'clock', leave: 'cal', conflict: 'alert'}[x.type] || 'doc';
    if (ref) return `<div class="row ref ${S.sel && S.sel.key === x.key ? 'sel' : ''}" role="listitem" tabindex="0" data-act="selAction" data-k="${esc(x.key)}"><span style="color:var(--muted)">${ic(typeIcon)}</span><div class="mn"><div class="t">${esc(x.title)}</div><div class="fx"><span>${esc(x.refReason || x.kind)}</span>${facts.slice(0, 2).map(t => `<span>${esc(t)}</span>`).join('')}</div></div><div class="w">${esc(shortWhen(x.when))}</div><div class="qa"><button class="btn sm ghost icon" data-act="rowMenu" data-k="${esc(x.key)}" aria-label="더 보기" title="내 일로 지정 · 숨기기 등">${ic('more')}</button></div></div>`;
    return `<div class="row ${S.sel && S.sel.key === x.key ? 'sel' : ''} ${isHidden(x.key) || isSnoozed(x.key) ? 'hid' : ''} ${S.multi.has(x.key) ? 'multi' : ''}" role="listitem" tabindex="0" data-act="selAction" data-k="${esc(x.key)}">
<input class="ck" type="checkbox" data-act="multi" data-k="${esc(x.key)}" ${S.multi.has(x.key) ? 'checked' : ''} aria-label="여러 개 선택" title="여러 개 선택 (Shift로 범위)">
<div class="mn"><div class="t">${esc(dispTitle(x))}</div><div class="hl"><span class="bdg ${st}">${STATE_NAME[st]}</span>${S.newKeys.has(x.key) ? '<span class="bdg new">새</span>' : ''}<span class="what ${st}">${esc(head)}</span>${dl}${plan}${stale ? '<span class="bdg check">숨겼지만 아직 남음</span>' : ''}</div><div class="fx">${facts.map(t => `<span>${esc(t)}</span>`).join('')}</div></div>
<div class="w">${esc(shortWhen(x.when))}${isSnoozed(x.key) ? '<br>내일 다시' : ''}${isHidden(x.key) ? '<br>숨김' : ''}</div>
<div class="qa">${st === 'confirm' ? `<button class="btn sm" data-act="markDone" data-k="${esc(x.key)}" title="끝난 일로 표시하고 목록에서 내립니다">${ic('check')}끝냄</button>` : ''}<button class="btn sm primary" data-act="quickOpen" data-k="${esc(x.key)}" title="그룹웨어 원래 화면으로 열기 (Enter)">열기</button><button class="btn sm ghost icon" data-act="rowMenu" data-k="${esc(x.key)}" aria-label="더 보기" title="내일 다시 보기 · 할 일 추가 · 상관없음">${ic('more')}</button></div></div>`;
  }
  const dispTitle = x => { if (x.type !== 'attendance') return x.title; const d = String(x.when).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return x.title; const w = WD[new Date(d + 'T00:00:00+09:00').getDay()]; return `${d.slice(5).replace('-', '/')}(${w}) 근태 확인${x.facts && /출장/.test(x.facts.join(' ')) ? ' · 관내출장' : ''}`; };
  const shortWhen = w => { const s = String(w || ''); if (!s) return ''; const d = s.slice(0, 10); if (d === today()) return s.slice(11, 16) || '오늘'; return s.slice(5, 10).replace('-', '/'); };
  const batchBar = () => S.multi.size ? `<div class="batch"><b>${S.multi.size}건 선택</b><button class="btn sm primary" data-act="batchFocus">${ic('play')}선택한 것 하나씩 처리</button><button class="btn sm" data-act="batchSnooze">내일 다시 보기</button><button class="btn sm" data-act="batchTodo">할 일에 추가</button><button class="btn sm" data-act="batchHide">숨기기</button><button class="btn sm" data-act="batchCsv">엑셀로 저장</button><button class="btn sm ghost" data-act="batchClear">선택 해제</button></div>` : '';
  const refreshQueue = () => { const l = $('#qlist'); if (l) l.innerHTML = queueRows(); const b = $('#batch'); if (b) b.innerHTML = batchBar(); renderNav(); renderHead(); };

  // ----- 현황 (charts moved off the home screen) -----
  function vOverview() {
    return `${pgh('현황', '그래프의 막대·점·칸을 누르면 해당 목록으로 이동합니다')}<div class="cards">${chartFlow()}${chartDeadlines()}${chartBudget()}${chartAttendance()}${chartTrend()}</div>`;
  }

  // ----- charts (inline SVG, clickable) -----
  function chartFlow() {
    const lists = S.a.approval.lists, counts = Object.fromEntries(S.a.approval.counts.map(c => [c.name, c]));
    const rows = [['distWaiting', '배부 대기', lists.distWaiting?.total ?? 0], ['deptWaiting', '부서 접수 대기', lists.deptWaiting?.total ?? 0], ['pending', '결재 대기', lists.pending?.total ?? 0], ['sendWaiting', '발송 대기', lists.sendWaiting?.total ?? 0], ['viewing', '미열람 열람문서', counts['열람문서']?.count ?? 0], ['progress', '부서 진행', counts['부서진행문서']?.count ?? 0]];
    const max = Math.max(1, ...rows.map(r => r[2]));
    const svg = rows.map(([k, n, v], i) => `<g class="hit" data-act="goApproval" data-v="${k === 'progress' ? 'deptWaiting' : k}"><text x="0" y="${i * 22 + 14}" font-size="11" fill="currentColor">${esc(n)}</text><rect x="96" y="${i * 22 + 4}" width="${Math.max(2, v / max * 150)}" height="13" rx="3" fill="${k === 'progress' ? '#9aa4b2' : v ? '#1a73e8' : '#c9d1de'}"><title>${esc(n)} ${v}건</title></rect><text x="${100 + Math.max(2, v / max * 150)}" y="${i * 22 + 14}" font-size="11" fill="currentColor">${v}</text></g>`).join('');
    return `<div class="card2"><div class="ct"><span>결재·문서유통 흐름</span><span class="muted">막대를 누르면 목록</span></div><svg viewBox="0 0 280 ${rows.length * 22}" width="100%" height="${rows.length * 22}">${svg}</svg></div>`;
  }
  function chartDeadlines() {
    const items = S.a.deadlines.filter(x => x.dday >= -1 && x.dday <= 14);
    const W = 280, x0 = 10, w = 260;
    const pos = d => x0 + (Math.max(-1, Math.min(14, d)) + 1) / 15 * w;
    const off = new Set((S.raw.data.leave?.upcoming || []).map(u => R.dday(ymd8(u.start))));
    const ticks = Array.from({length: 16}, (_, i) => i - 1).map(d => `<line x1="${pos(d)}" x2="${pos(d)}" y1="34" y2="40" stroke="#9aa4b2"/>${d % 7 === 0 ? `<text x="${pos(d)}" y="52" font-size="10" text-anchor="middle" fill="currentColor">${d === 0 ? '오늘' : `+${d}`}</text>` : ''}${off.has(d) ? `<rect x="${pos(d) - 8}" y="8" width="16" height="30" fill="#e6f4ea" opacity=".9"><title>휴가</title></rect>` : ''}`).join('');
    const dots = items.map((x, i) => `<circle class="hit" data-act="selDeadline" data-k="${esc(x.key || '')}" data-title="${esc(x.title)}" cx="${pos(x.dday)}" cy="${30 - (i % 3) * 8}" r="5" fill="${x.dday <= 1 ? '#c5221f' : x.dday <= 3 ? '#e37400' : '#1a73e8'}"><title>${esc(`${x.date}${x.time ? ' ' + x.time : ''} ${ddayText(x.dday)} · ${x.title}`)}</title></circle>`).join('');
    return `<div class="card2"><div class="ct"><span>2주 기한</span><span class="muted">${items.length}건 · 점을 누르면 항목</span></div><svg viewBox="0 0 ${W} 58" width="100%" height="64"><line x1="${x0}" x2="${x0 + w}" y1="37" y2="37" stroke="#9aa4b2"/>${ticks}${dots}</svg></div>`;
  }
  function chartBudget() {
    const p = S.a.budget.projects.find(x => !x.error && x.rows.length);
    if (!p) return '';
    const head = p.rows[0], el = S.a.budget.elapsedPct;
    const leaves = p.rows.filter(r => r.level === '세').slice(0, 5);
    const bar = (r, y, label) => `<g class="hit" data-act="goBudgetCode" data-v="${esc(r.code)}"><text x="96" y="${y + 10}" font-size="9.5" text-anchor="end" fill="currentColor">${esc(label.length > 10 ? label.slice(0, 9) + '…' : label)}<title>${esc(r.name)}</title></text><rect x="100" y="${y + 1}" width="150" height="11" rx="3" fill="#e7ebf2"/><rect x="100" y="${y + 1}" width="${Math.min(150, r.rate * 1.5)}" height="11" rx="3" fill="${r.rate < el - 30 ? '#e37400' : '#1a73e8'}"><title>${esc(r.name)} 집행 ${pct(r.rate)} (예산 ${won(r.budget)}원)</title></rect><line x1="${100 + el * 1.5}" x2="${100 + el * 1.5}" y1="${y - 1}" y2="${y + 14}" stroke="#1d2330" stroke-width="1.5"><title>연간 경과율 ${el}%</title></line><text x="254" y="${y + 10}" font-size="10" fill="currentColor">${Math.round(r.rate)}%</text></g>`;
    const short = shortLabels(leaves.map(r => r.name));
    const rows = [bar(head, 0, head.name), ...leaves.map((r, i) => bar(r, (i + 1) * 18, short[i]))].join('');
    return `<div class="card2"><div class="ct"><span>예산 ${esc(p.project)} ${esc(p.filter)}</span><span class="muted">세로선 = 연간 경과 ${el}%</span></div><svg viewBox="0 0 280 ${(leaves.length + 1) * 18}" width="100%" height="${(leaves.length + 1) * 18}">${rows}</svg></div>`;
  }
  // Drop the words all labels share ("○ 젠더유스 거버넌스 회의비(자)" -> "회의비(자)").
  function shortLabels(names) {
    const clean = names.map(n => String(n).replace(/^[○●·\s]+/, ''));
    if (clean.length < 2) return clean;
    let p = clean[0];
    for (const n of clean) while (p && !n.startsWith(p)) p = p.slice(0, -1);
    p = p.replace(/\S+$/, '');
    return clean.map(n => n.slice(p.length).trim() || n);
  }
  function chartAttendance() {
    const days = S.raw.data.attendance?.days || [];
    if (!days.length) return '';
    const bad = new Set(S.a.anomalies.map(x => x.date));
    const first = days[0].date;
    const off = new Date(Number(first.slice(0, 4)), Number(first.slice(4, 6)) - 1, 1).getDay();
    const pos = r => off + Number(r.date.slice(6)) - 1;
    const worked = r => !!r.come || (/정상/.test(r.result) && !/휴일/.test(r.result));
    const cells = days.map(r => { const i = pos(r); const cls = bad.has(r.date) ? '#f28b82' : worked(r) ? (/정상/.test(r.result) ? '#81c995' : '#fdd663') : r.holiday || /휴일/.test(r.result) ? '#dadce0' : '#fdd663'; return `<rect class="hit" data-act="goAttendanceDay" data-v="${r.date}" x="${(i % 7) * 38}" y="${Math.floor(i / 7) * 30}" width="34" height="26" rx="5" fill="${cls}"><title>${esc(`${ymd8(r.date)} ${r.result} ${r.item} ${r.status}`)}</title></rect><text x="${(i % 7) * 38 + 17}" y="${Math.floor(i / 7) * 30 + 17}" font-size="10.5" text-anchor="middle" fill="#1d2330" pointer-events="none">${Number(r.date.slice(6))}</text>`; }).join('');
    const h = (Math.floor(pos(days[days.length - 1]) / 7) + 1) * 30;
    return `<div class="card2"><div class="ct"><span>이번 달 근태</span><span class="muted">빨강 = 확인 필요</span></div><svg viewBox="0 0 266 ${h}" width="100%" height="${h}">${cells}</svg></div>`;
  }
  function chartTrend() {
    const h = S.history.slice(-14);
    if (h.length < 2) return '';
    const max = Math.max(1, ...h.map(x => x.total));
    const pts = (k) => h.map((x, i) => `${10 + i * (250 / (h.length - 1))},${70 - x[k] / max * 60}`).join(' ');
    return `<div class="card2"><div class="ct"><span>처리할 일 추이</span><span class="muted">파랑 전체 · 빨강 긴급</span></div><svg viewBox="0 0 270 78" width="100%" height="78"><polyline points="${pts('total')}" fill="none" stroke="#1a73e8" stroke-width="2"/><polyline points="${pts('high')}" fill="none" stroke="#c5221f" stroke-width="2"/>${h.map((x, i) => `<circle cx="${10 + i * (250 / (h.length - 1))}" cy="${70 - x.total / max * 60}" r="3" fill="#1a73e8"><title>${esc(x.date)} 전체 ${x.total} · 긴급 ${x.high}</title></circle>`).join('')}</svg></div>`;
  }

  // ----- 결재·문서유통 -----
  const AP_VERB = {distWaiting: '배부하기', deptWaiting: '접수하기', pending: '결재하기', sendWaiting: '발송하기', viewing: '열람하기', submitted: '열기'};
  const AP_STATUS = {distWaiting: '배부 전', deptWaiting: '접수 전'};
  function vApproval() {
    const lists = S.a.approval.lists, counts = S.a.approval.counts;
    const tabs = [['pending', '결재 대기'], ['deptWaiting', '부서 접수 대기'], ['distWaiting', '배부 대기'], ['sendWaiting', '발송 대기'], ['viewing', '열람문서'], ['submitted', '내 상신문서']];
    const l = lists[S.apTab];
    const more = S.apMore[S.apTab] || [];
    const docs = l && !l.error ? [...l.docs, ...more] : [];
    const withRec = ['distWaiting', 'deptWaiting'].includes(S.apTab);
    const hist = S.routing ? (S.apTab === 'distWaiting' ? S.routing.dist : S.routing.dept) : [];
    const target = S.apTab === 'distWaiting' ? 'toDept' : 'toEmp';
    const roleMine = {distWaiting: S.settings.roles?.distributor, deptWaiting: S.settings.roles?.deptReceiver, sendWaiting: S.settings.roles?.sender}[S.apTab];
    const rows = docs.map(d => {
      const rec = withRec && hist.length ? R.recommendRouting(d, hist, {target, limit: 2}) : Object.assign([], {group: null});
      const recHtml = !withRec ? '' : !S.routing ? '<span class="spin"></span>' : rec.group && rec.group.targets.length >= 2 ? `<b>${rec.group.targets.length}곳 함께</b><div class="muted">${esc(rec.group.targets.slice(0, 3).join(', '))}${rec.group.targets.length > 3 ? ' 외' : ''}</div>` : rec.length ? rec.map(r => `<div>${esc(r.name)} <span class="muted">· 비슷한 ${r.of}건 중 ${r.count}건</span></div>`).join('') : '<span class="muted">비슷한 이력 없음</span>';
      return `<tr class="click ${S.sel && S.sel.type === 'doc' && S.sel.docId === d.docId ? 'sel' : ''}" data-act="selDoc" data-kind="${S.apTab}" data-id="${esc(d.docId)}" tabindex="0"><td><div style="font-weight:700">${esc(R.cleanTitle ? R.cleanTitle(d.title) : d.title)}</div><div class="muted">${d.unread ? '<span class="bdg check" style="margin-right:6px">아직 안 봄</span>' : ''}${esc(d.docNo)}${d.attachments ? ` · 첨부 ${d.attachments}` : ''}</div></td><td>${esc(d.sender || d.drafter || d.drafterDept)}</td><td class="nowrap">${esc(AP_STATUS[S.apTab] || d.status)}</td>${withRec ? `<td>${recHtml}</td>` : ''}<td class="nowrap">${esc(shortWhen(d.date))}</td><td class="nowrap"><button class="btn sm ${S.apTab === 'submitted' || S.apTab === 'viewing' ? '' : 'primary'}" data-act="apOpen" data-kind="${S.apTab}" data-id="${esc(d.docId)}">${AP_VERB[S.apTab]}</button></td></tr>`;
    }).join('');
    const total = l ? (l.total ?? l.docs.length) : 0;
    const note = roleMine === false ? `<div class="box" style="margin:0 0 12px">이 목록은 설정상 <b>참고</b>(부서 담당자가 처리)로 분류되어 "오늘 할 일"에는 나오지 않습니다. 내 업무라면 <a class="btn sm" data-act="view" data-v="settings">설정에서 바꾸기</a></div>` : '';
    return `${pgh('결재·문서유통', '', `${l ? `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">${ic('ext')}그룹웨어 목록</a>` : ''}${docs.length && ['distWaiting', 'deptWaiting', 'pending', 'sendWaiting'].includes(S.apTab) ? `<button class="btn sm primary" data-act="focusList">${ic('play')}이 목록 하나씩 처리</button>` : ''}`)}
<div class="bar"><div class="seg" role="tablist">${tabs.map(([k, n]) => { const c = lists[k]; const cnt = c ? (c.error ? '?' : c.total ?? c.docs.length) : '-'; return `<button role="tab" aria-selected="${S.apTab === k}" class="${S.apTab === k ? 'on' : ''}" data-act="apTab" data-v="${k}">${n}<span class="c">${cnt}</span></button>`; }).join('')}</div></div>
${note}
${l && l.error ? `<div class="box errb">${esc(l.message)} <button class="btn sm" data-act="refresh">다시 시도</button></div>` : docs.length ? `<table><tr><th>제목</th><th>보낸 곳·기안</th><th>상태</th>${withRec ? `<th title="최근 180일 동안 제목 주제가 비슷한 문서가 어디로 갔는지 센 값">지난번엔 어디로?</th>` : ''}<th>받은 날</th><th></th></tr>${rows}</table>` : `<div class="list"><div class="empty"><b>비어 있습니다</b>이 목록에 처리할 문서가 없습니다.</div></div>`}
${docs.length < total ? `<div class="acts"><button class="btn" data-act="apMore">더 보기 (${docs.length}/${total})</button></div>` : ''}
<details style="margin-top:18px"><summary class="muted" style="cursor:pointer">그룹웨어 메뉴별 건수</summary><table style="margin-top:8px"><tr><th>메뉴</th><th class="num">건수</th></tr>${counts.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.count}</td></tr>`).join('')}</table></details>`;
  }

  // ----- 메일 -----
  const cleanPreview = p => String(p || '').replace(/대용량 파일첨부[\s\S]*?보관\)/, '').replace(/\s+/g, ' ').trim();
  function vMail() {
    const m = S.a.mail;
    const all = [...(S.raw.data.mail?.inbox.records || []), ...(S.raw.data.mail?.otherUnseen || [])];
    const actKeys = new Map(S.a.actions.filter(x => x.type === 'mail').map(x => [x.ref.box + x.ref.uid, x]));
    const f = S.mailFilter;
    const rows = all.filter(x => f === 'all' || (f === 'unread' && !x.seen) || (f === 'todo' && actKeys.has(x.box + x.uid) && isMine(actKeys.get(x.box + x.uid))) || (f === 'attach' && (x.attach || /대용량 파일첨부/.test(x.preview))) || (f === 'other' && x.box !== 'INBOX'));
    const sr = S.mailSearch.res;
    const rowHtml = x => { const a = actKeys.get(x.box + x.uid); const st = a ? stateOf(a) : ''; const att = x.attach || /대용량 파일첨부/.test(x.preview); return `<div class="row ${S.sel && S.sel.type === 'mail' && S.sel.uid === x.uid ? 'sel' : ''}" role="listitem" tabindex="0" data-act="selMail" data-box="${esc(x.box)}" data-uid="${esc(x.uid)}" style="grid-template-columns:170px 1fr auto"><div style="${x.seen ? '' : 'font-weight:800'}">${x.seen ? '' : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-right:6px"></span>'}${esc(x.from)}</div><div class="mn"><div class="t" style="${x.seen ? 'font-weight:600' : ''}">${esc(x.subject || '(제목 없음)')}</div><div class="hl">${a && st !== 'info' ? `<span class="bdg ${st}">${STATE_NAME[st]}</span>` : ''}${att ? `<span class="bdg tag">${ic('clip')}첨부</span>` : ''}${x.box !== 'INBOX' ? `<span class="bdg tag">${esc(x.box)}</span>` : ''}<span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:520px">${esc(cleanPreview(x.preview).slice(0, 90))}</span></div></div><div class="w">${esc(shortWhen(x.date))}</div></div>`; };
    const listHtml = rows.length ? `<div class="list" role="list">${rows.map(rowHtml).join('')}</div>` : `<div class="list"><div class="empty"><b>해당하는 메일이 없습니다</b></div></div>`;
    return `${pgh('메일', `최근 ${all.length}통 · 안 읽음 ${all.filter(x => !x.seen).length}통`, `<a class="btn sm" href="${esc(m.url)}" target="_blank" rel="noopener">${ic('ext')}받은메일함</a><button class="btn sm primary" data-act="openUrl" data-url="${esc(GW.links.compose('plain'))}" data-title="새 메일 쓰기">${ic('plus')}새 메일</button>`)}
<div class="bar"><div class="seg" role="tablist">${[['all', '전체'], ['todo', '처리할 메일'], ['unread', '안 읽음'], ['attach', '첨부 있음'], ['other', '내 메일함']].map(([k, n]) => `<button role="tab" aria-selected="${f === k}" class="${f === k ? 'on' : ''}" data-act="mailFilter" data-v="${k}">${n}</button>`).join('')}</div>
<input class="inp grow" id="mailq" placeholder="메일 본문까지 검색 후 Enter" value="${esc(S.mailSearch.kw)}" aria-label="메일 검색">${S.mailSearch.busy ? '<span class="spin"></span>' : ''}</div>
${sr ? `<h2>"${esc(sr.keyword)}" 검색 결과 ${sr.groups.mail?.total ?? 0}건 <button class="btn sm ghost" data-act="clearMailSearch">${ic('x')}지우기</button></h2><div class="list">${(sr.groups.mail?.items || []).map(x => `<div class="row" tabindex="0" data-act="selMailSearch" data-uid="${esc(x.uid)}" style="grid-template-columns:170px 1fr auto"><div>${esc(x.from)}</div><div class="mn"><div class="t">${hl(x.subject || '(제목 없음)', sr.keyword)}</div><div class="fx">${hl(x.snippet, sr.keyword)}</div></div><div class="w">${esc(shortWhen(x.date))}</div></div>`).join('') || '<div class="empty"><b>결과가 없습니다</b>다른 단어로 찾아보세요.</div>'}</div><h2>최근 메일</h2>` : ''}
${listHtml}
<p class="muted" style="margin-top:12px">메일 목록을 보는 것만으로는 읽음 처리되지 않습니다.</p>`;
  }
  async function runMailSearch(kw) {
    S.mailSearch.kw = kw;
    if (kw.length < 2) { toast('검색어를 두 글자 이상 입력하세요.'); return; }
    S.mailSearch.busy = true; if (S.view === 'mail') renderMain();
    try { S.mailSearch.res = await GW.search(kw, {types: ['mail'], pageSize: 20}); } catch (e) { toast('메일을 검색하지 못했습니다: ' + e.message); }
    S.mailSearch.busy = false;
    if (S.view === 'mail') renderMain();
  }

  // ----- 통합검색 -----
  const periodFrom = p => { if (!p) return ''; const d = new Date(); d.setMonth(d.getMonth() - Number(p)); return R.kstNow(d).date.replace(/-/g, ''); };
  function vSearch() {
    const s = S.search, res = s.res;
    const types = Object.entries(GW.searchLabels).filter(([k]) => k !== 'note');
    const group = (type, render) => { const g = res && res.groups[type]; if (!g) return ''; return `<h2>${esc(g.label)} <span class="muted">${g.total}건</span>${g.total > g.items.length ? `<button class="btn sm ghost" data-act="searchMore" data-t="${type}">더 보기</button>` : ''}</h2>${g.error ? `<div class="box errb">${esc(g.message)}</div>` : g.items.length ? `<div class="list" role="list">${g.items.map(render).join('')}</div>` : '<div class="muted">결과 없음</div>'}`; };
    const row = (t, id, pill, title, desc, when) => `<div class="row ${S.sel && S.sel.type === 'search' && S.sel.item && (S.sel.item.docId || S.sel.item.uid || S.sel.item.id || S.sel.item.fileId) === id ? 'sel' : ''}" role="listitem" tabindex="0" data-act="selSearch" data-t="${t}" data-id="${esc(id)}" style="grid-template-columns:90px 1fr auto"><span class="bdg tag">${esc(pill)}</span><div class="mn"><div class="t">${title}</div><div class="fx">${desc}</div></div><div class="w">${esc(when)}</div></div>`;
    const totals = res ? Object.values(res.groups).reduce((n, g) => n + (g.total || 0), 0) : 0;
    const busy = s.busy ? `<div class="list">${'<div class="sk row"></div>'.repeat(4)}</div><p class="muted"><span class="spin"></span> ${esc(s.types.map(t => GW.searchLabels[t]).join('·'))}에서 "${esc(s.kw)}"을(를) 찾는 중입니다…</p>` : '';
    return `${pgh('통합검색', res && !s.busy ? `"${esc(res.keyword)}" 결과 ${totals}건` : '결재문서 본문, 메일, 게시판, 첨부파일, 일정, 사람을 한 번에 찾습니다')}
<div class="bar"><input class="inp grow" id="sq" placeholder="검색어 (예: 월간업무보고, 문서번호, 사람 이름)" value="${esc(s.kw)}" aria-label="검색어"><select class="f" id="speriod" aria-label="기간">${[['', '전체 기간'], ['1', '최근 1개월'], ['3', '최근 3개월'], ['12', '최근 1년']].map(([v, n]) => `<option value="${v}" ${s.period === v ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="btn primary" data-act="doSearch" ${s.busy ? 'disabled' : ''}>${ic('search')}검색</button></div>
<div class="bar"><span class="muted">찾을 곳</span>${types.map(([k, n]) => `<button class="chip ${s.types.includes(k) ? 'on' : ''}" data-act="stype" data-v="${k}" aria-pressed="${s.types.includes(k)}">${s.types.includes(k) ? ic('check') : ''}${esc(n)}</button>`).join('')}</div>
${busy}
${!res && !s.busy ? `<div class="card2"><div class="ct">이렇게 찾아보세요</div><div class="bar" style="margin:0">${['월간업무보고', '시간외근무', '노동이사제', '일상감사', ...(S.searchRecent || [])].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8).map(k => `<button class="chip" data-act="searchExample" data-v="${esc(k)}">${ic('search')}${esc(k)}</button>`).join('')}</div><p class="muted" style="margin:10px 0 0">결과를 누르면 오른쪽에 본문 미리보기가 열립니다. 미리보기와 검색은 열람 기록이나 그룹웨어 최근 검색어를 남기지 않습니다.</p></div>` : ''}
${res && !s.busy ? [
      group('doc', x => row('doc', x.docId, x.form || '문서', hl(x.title, res.keyword), `${esc(x.docNo)} · ${esc(x.dept)} ${esc(x.drafter)} · ${hl(x.snippet, res.keyword)}`, ymd8(x.date))),
      group('mail', x => row('mail', x.uid, '메일', hl(x.subject || '(제목 없음)', res.keyword), `${esc(x.from)} → ${esc(x.to)} · ${hl(x.snippet, res.keyword)}`, shortWhen(x.date))),
      group('board', x => row('board', x.id, x.catTitle || '게시판', hl(x.title, res.keyword), `${esc(x.writer)} · ${hl(x.snippet, res.keyword)}`, String(x.date).slice(0, 10))),
      group('file', x => row('file', x.fileId, (x.ext || '파일').toUpperCase(), hl(x.name, res.keyword), `${esc(x.parent)} · ${esc(x.owner)}`, String(x.date).slice(0, 10))),
      group('schedule', x => row('schedule', x.id, '일정', hl(x.title, res.keyword), hl(x.snippet, res.keyword), String(x.start).slice(0, 10))),
      group('person', x => `<div class="row" role="listitem" style="grid-template-columns:90px 1fr auto"><span class="bdg tag">사람</span><div class="mn"><div class="t">${esc(x.name)} ${esc(x.duty || x.position)}</div><div class="fx">${esc(x.dept)}${x.tel ? ' · ☎ ' + esc(x.tel) : ''}${x.email ? ' · ' + esc(x.email) : ''}</div></div><div>${x.email ? `<button class="btn sm" data-act="copy" data-v="${esc(x.email)}">메일 주소 복사</button>` : ''}</div></div>`),
      group('contact', x => `<div class="row" role="listitem" style="grid-template-columns:90px 1fr auto"><span class="bdg tag">연락처</span><div class="mn"><div class="t">${esc(x.name)} ${esc(x.rank)}</div><div class="fx">${esc(x.company)} ${esc(x.dept)}${x.tel ? ' · ☎ ' + esc(x.tel) : ''}${x.email ? ' · ' + esc(x.email) : ''}</div></div><div></div></div>`),
    ].join('') || '<div class="list"><div class="empty"><b>찾은 결과가 없습니다</b>기간이나 찾을 곳을 넓혀 보세요.</div></div>' : ''}`;
  }
  async function runSearch(types) {
    const s = S.search;
    if (!s.kw || s.kw.length < 2) { toast('검색어를 두 글자 이상 입력하세요.'); return; }
    s.busy = true; S.view = 'search'; render();
    try { s.res = await GW.search(s.kw, {types: types || s.types, pageSize: 10, from: periodFrom(s.period)}); s.more = {}; S.searchRecent = [s.kw, ...(S.searchRecent || []).filter(k => k !== s.kw)].slice(0, 5); } catch (e) { toast('검색하지 못했습니다: ' + e.message); }
    s.busy = false; render();
  }

  // ----- 할 일 보드 (drag & drop) -----
  const BUCKETS = [['late', '밀린 일'], ['today', '오늘'], ['tomorrow', '내일'], ['week', '이번 주'], ['later', '나중에'], ['done', '끝냄']];
  const BUCKET_NAME = Object.fromEntries(BUCKETS);
  const onBoard = x => x.scope !== 'ref' || !!S.plan[x.key];
  const endOfWeek = () => { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return R.kstNow(d).date; };
  const plusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return R.kstNow(d).date; };
  function bucketOfTodo(t) {
    if (t.status === 'done') return 'done';
    if (S.plan[`todo:${t.id}`]) return S.plan[`todo:${t.id}`];
    if (!t.due) return 'later';
    const n = R.dday(t.due);
    return n < 0 ? 'late' : n === 0 ? 'today' : n === 1 ? 'tomorrow' : t.due <= endOfWeek() ? 'week' : 'later';
  }
  function bucketOfAction(x) {
    if (S.plan[x.key]) return S.plan[x.key];
    if (isHidden(x.key)) return 'done';
    if (isSnoozed(x.key)) return 'tomorrow';
    const st = stateOf(x);
    if (st === 'overdue') return 'late';
    if (st === 'urgent' || (x.deadline && x.deadline.dday <= 0)) return 'today';
    if (x.deadline && x.deadline.dday === 1) return 'tomorrow';
    if (x.type === 'attendance' && String(x.when).slice(0, 10) < today()) return 'late';
    return 'week';
  }
  function vBoard() {
    const cards = [];
    for (const x of S.a.actions) if (onBoard(x)) cards.push({id: x.key, kind: 'act', b: bucketOfAction(x), title: x.title, sub: x.headline || x.kind, pri: x.priority});
    for (const t of S.todos) cards.push({id: `todo:${t.id}`, kind: 'todo', b: bucketOfTodo(t), title: t.title, sub: `${t.due ? `기한 ${t.due.slice(5).replace('-', '/')} (${ddayText(R.dday(t.due))})` : '기한 없음'}${t.source ? ' · ' + t.source : ''}`});
    return `${pgh('할 일 보드', '카드를 끌어 다른 칸으로 옮기면 계획이 저장됩니다')}
<div class="bar"><input class="inp grow" id="tdTitle" placeholder="새 할 일을 쓰고 Enter" aria-label="새 할 일"><input class="inp" id="tdDue" placeholder="기한 (예: 11/12)" style="width:140px" aria-label="기한"><button class="btn primary" data-act="addTodo">${ic('plus')}추가</button></div>
<div class="board">${BUCKETS.map(([b, n]) => { const cs = cards.filter(c => c.b === b); return `<div class="col" data-drop="${b}"><div class="ch"><span>${n}</span><span class="muted">${cs.length}</span></div>${cs.map(c => `<div class="card ${c.kind} ${c.pri || ''}" draggable="true" data-drag="${esc(c.id)}" data-act="boardCard" data-k="${esc(c.id)}" tabindex="0" title="끌어서 옮기기 · 누르면 내용 보기"><div>${esc(c.title)}</div><div class="d">${esc(c.sub)}</div>${c.kind === 'todo' ? `<div class="acts" style="margin-top:6px"><button class="btn sm" data-act="todoEdit" data-id="${esc(c.id.slice(5))}">고치기</button><button class="btn sm danger" data-act="todoDel" data-id="${esc(c.id.slice(5))}">지우기</button></div>` : ''}</div>`).join('') || '<div class="hint">여기로 끌어다 놓으세요</div>'}</div>`; }).join('')}</div>
<p class="muted" style="margin-top:12px">파란 줄 카드는 그룹웨어 업무라 그룹웨어에서 처리해야 사라집니다. 노란 줄 카드는 내가 적은 할 일이며 이 PC에만 저장됩니다.</p>`;
  }
  function dropTo(id, bucket) {
    pushUndo('보드 이동');
    if (id.startsWith('todo:')) {
      const t = S.todos.find(x => `todo:${x.id}` === id);
      if (!t) return;
      if (bucket === 'done') { t.status = 'done'; delete S.plan[id]; }
      else { t.status = 'todo'; if (bucket === 'late') { S.plan[id] = 'late'; } else { t.due = bucket === 'today' ? today() : bucket === 'tomorrow' ? plusDays(1) : bucket === 'week' ? endOfWeek() : ''; delete S.plan[id]; } }
    } else {
      if (bucket === 'done') { S.hidden[id] = Date.now(); delete S.plan[id]; }
      else { delete S.hidden[id]; if (bucket === 'tomorrow') S.snooze[id] = tomorrow8(); else delete S.snooze[id]; S.plan[id] = bucket; }
    }
    saveLocal(); render();
    toastUndo(`"${BUCKET_NAME[bucket]}" 칸으로 옮겼습니다.`);
  }
  const parseDue = v => { const s = String(v || '').trim(); if (!s) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const m = s.match(/^(\d{1,2})[./-](\d{1,2})$/); if (!m) return ''; const y = R.kstNow(new Date()).y; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; };

  // ----- 일정 달력 (month grid, drag to change to-do due) -----
  function vCalendar() {
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + S.cal.offset);
    const y = base.getFullYear(), mo = base.getMonth();
    const first = new Date(y, mo, 1), startDow = first.getDay(), last = new Date(y, mo + 1, 0).getDate();
    const items = calendarItems();
    const t0 = today();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div class="c out"></div>');
    for (let dnum = 1; dnum <= last; dnum++) {
      const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(dnum).padStart(2, '0')}`;
      const dow = (startDow + dnum - 1) % 7;
      const its = items.filter(x => x.date === iso);
      cells.push(`<div class="c ${iso === t0 ? 'today' : ''} ${dow === 0 || its.some(x => x.cls === 'h') ? 'sun' : dow === 6 ? 'sat' : ''}" data-drop-date="${iso}"><div class="dn">${dnum}${iso === t0 ? ' <span class="bdg todo" style="height:18px">오늘</span>' : ''}</div>${its.slice(0, 4).map(it => `<span class="ev ${it.cls}" ${it.todo ? `draggable="true" data-drag="todo:${esc(it.todo)}"` : ''} data-act="calItem" data-k="${esc(it.key || '')}" data-url="${esc(it.url || '')}" title="${esc(it.tag + ' · ' + it.text)}">${esc(it.text)}</span>`).join('')}${its.length > 4 ? `<span class="muted">외 ${its.length - 4}건</span>` : ''}</div>`);
    }
    const upcoming = items.filter(x => x.date >= t0 && x.cls !== 'h').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
    const legend = [['e', '일정'], ['l', '내 휴가'], ['d', '기한'], ['a', '근태 확인·출장'], ['t', '내 할 일(끌어서 날짜 변경)'], ['h', '휴일']];
    return `${pgh(`${y}년 ${mo + 1}월`, '', `<button class="btn sm icon" data-act="calPrev" aria-label="이전 달">${ic('back')}</button><button class="btn sm" data-act="calToday">이번 달</button><button class="btn sm icon" data-act="calNext" aria-label="다음 달" style="transform:scaleX(-1)">${ic('back')}</button><a class="btn sm" href="${esc(S.raw.data.schedule?.url || '')}" target="_blank" rel="noopener">${ic('ext')}그룹웨어 일정</a>`)}
<div class="legend">${legend.map(([c, n]) => `<span><i class="ev ${c}" style="display:inline-block;margin:0;padding:0;width:12px;height:12px"></i>${n}</span>`).join('')}</div>
<div class="cal">${WD.map(w => `<div class="h">${w}</div>`).join('')}${cells.join('')}</div>
<h2>다가오는 일정·기한</h2>${upcoming.length ? `<div class="list" role="list">${upcoming.map(it => `<div class="row" role="listitem" tabindex="0" data-act="calItem" data-k="${esc(it.key || '')}" data-url="${esc(it.url || '')}" style="grid-template-columns:110px 1fr auto"><span class="bdg ${it.cls === 'd' ? 'urgent' : 'tag'}">${esc(it.tag.split(' · ')[0])}</span><div class="mn"><div class="t">${esc(it.text)}</div></div><div class="w">${esc(it.date.slice(5).replace('-', '/'))} · ${ddayText(R.dday(it.date))}</div></div>`).join('')}</div>` : '<div class="list"><div class="empty"><b>다가오는 일정이 없습니다</b></div></div>'}`;
  }
  function calendarItems() {
    const out = [];
    const sc = S.raw.data.schedule;
    for (const e of sc?.events || []) out.push({date: ymd8(e.start), text: `${e.allDay ? '' : dtm12(e.start).slice(11) + ' '}${e.title}`, tag: e.calendar || '일정', cls: 'e'});
    for (const h of sc?.holidays || []) out.push({date: ymd8(h.date), text: h.title, tag: '휴일', cls: 'h'});
    for (const u of S.raw.data.leave?.history || S.raw.data.leave?.upcoming || []) out.push({date: ymd8(u.start), text: `${u.kind}${u.days ? ' ' + fmtDays(u.days) : ''}`, tag: '내 휴가', cls: 'l'});
    for (const d of S.a.deadlines) out.push({date: d.date, text: `${d.time ? d.time + ' ' : ''}${d.title}`, tag: `기한 · ${d.source}`, cls: 'd', key: d.key, url: d.url});
    for (const x of S.a.actions.filter(x => x.type === 'attendance')) out.push({date: String(x.when).slice(0, 10), text: x.headline || x.title, tag: '근태 확인', cls: 'a', key: x.key});
    for (const r of S.raw.data.attendance?.days || []) if (/출장/.test(r.item || '')) out.push({date: ymd8(r.date), text: r.item, tag: '출장', cls: 'a'});
    if (S.pane.extract) for (const x of S.pane.extract.deadlines) out.push({date: x.date, text: x.context, tag: '본문 기한', cls: 'd'});
    for (const t of S.todos.filter(t => t.due && t.status !== 'done')) out.push({date: t.due, text: t.title, tag: '내 할 일', cls: 't', todo: t.id, url: t.url});
    return out;
  }

  // ----- 예산 집행 (charts, forecast, ledger) -----
  function vBudget() {
    const b = S.budget, t = b.table, el = S.a.budget.elapsedPct;
    const projOptions = S.settings.budget.map(p => `<option value="${esc(p.project + '|' + (p.filter || ''))}" ${b.project === p.project && b.filter === (p.filter || '') ? 'selected' : ''}>${esc(p.project)} ${esc(p.label || '')}${p.filter ? ' · ' + esc(p.filter) : ''}</option>`).join('');
    const flag = r => r.balance < 0 ? '<span class="bdg urgent">초과</span>' : (r.budget > 0 && r.rate >= 95) ? '<span class="bdg check">거의 다 씀</span>' : (r.budget > 0 && ['목', '세'].includes(r.level) && r.rate < el - 35) ? '<span class="bdg tag">덜 씀</span>' : '';
    const rows = t && !t.error ? t.rows.filter(r => !b.q || (r.name + r.code).includes(b.q)) : [];
    const head = rows[0];
    const fc = r => { const f = Math.max(0.05, el / 100); const proj = Math.min(r.budget * 1.5, r.executed / f); return {proj, rate: r.budget ? proj / r.budget * 100 : 0, unused: Math.max(0, r.budget - proj)}; };
    const summary = head ? (() => { const f = fc(head); return `<div class="box ${f.rate < 85 ? 'warn' : 'okb'}"><b>${esc(head.name)}</b> 예산 ${won(head.budget)}원 · 집행 ${won(head.executed)}원(${pct(head.rate)}) · 잔액 ${won(head.balance)}원<br>지금 속도(연간 경과 ${el}%)로 가면 연말 집행률 약 <b>${pct(f.rate)}</b>, 쓰지 못할 예상액 약 <b>${won(f.unused)}원</b>. <span class="muted">단순 비례 추정이며 행사 일정에 따라 달라집니다.</span></div>`; })() : '';
    const leaves = rows.filter(r => r.level === '세');
    const leafShort = shortLabels(leaves.map(r => r.name));
    const ledger = b.ledger;
    const monthly = b.monthly && b.monthly.code === (b.filter || head?.code) ? b.monthly : null;
    const monthChart = monthly ? (() => {
      const vals = monthly.months.map(m => { if (m.error) return null; const r = (m.rows || []).find(x => x.code === monthly.code) || (m.rows || [])[0]; return r ? r.executed : 0; });
      const max = Math.max(1, ...vals.filter(v => v !== null));
      const failed = vals.filter(v => v === null).length;
      return `<div class="card2"><div class="ct"><span>월별 집행 (${esc(monthly.code)})</span><span class="muted">막대를 누르면 그 달 결의만${failed ? ` · ${failed}개월 조회 실패(?)` : ''}</span></div><svg viewBox="0 0 300 120" width="100%" height="130">${vals.map((v, i) => v === null ? `<g><rect x="${8 + i * 24}" y="40" width="18" height="60" rx="3" fill="none" stroke="#9aa4b2" stroke-dasharray="3 2"><title>${i + 1}월 조회 실패</title></rect><text x="${17 + i * 24}" y="74" font-size="11" text-anchor="middle" fill="#9aa4b2">?</text><text x="${17 + i * 24}" y="114" font-size="10" text-anchor="middle" fill="currentColor">${i + 1}</text></g>` : `<g class="hit" data-act="budgetMonth" data-v="${String(i + 1).padStart(2, '0')}"><rect x="${8 + i * 24}" y="${100 - v / max * 88}" width="18" height="${Math.max(1, v / max * 88)}" rx="3" fill="${b.month === String(i + 1).padStart(2, '0') ? '#c5221f' : '#1a73e8'}"><title>${i + 1}월 ${won(v)}원</title></rect><text x="${17 + i * 24}" y="114" font-size="10" text-anchor="middle" fill="currentColor">${i + 1}</text></g>`).join('')}</svg></div>`;
    })() : (b.monthlyBusy ? '<p class="muted"><span class="spin"></span> 월별 집행을 읽는 중…</p>' : `<div class="card2"><div class="ct">월별 집행</div><div class="muted">1~12월 집행액을 막대로 봅니다.</div><div class="acts"><button class="btn sm" data-act="loadMonthly">${ic('chart')}월별 집행 불러오기</button></div></div>`);
    const barChart = leaves.length ? `<div class="card2"><div class="ct"><span>세목별 집행률</span><span class="muted">세로선 = 연간 경과 ${el}% · 막대를 누르면 결의 내역</span></div><svg viewBox="0 0 300 ${leaves.length * 22}" width="100%" height="${leaves.length * 22}">${leaves.map((r, i) => `<g class="hit" data-act="ledger" data-code="${esc(r.code)}"><text x="112" y="${i * 22 + 13}" font-size="10.5" text-anchor="end" fill="currentColor">${esc(leafShort[i].slice(0, 12))}<title>${esc(r.name)}</title></text><rect x="118" y="${i * 22 + 3}" width="150" height="12" rx="3" fill="#e7ebf2"/><rect x="118" y="${i * 22 + 3}" width="${Math.min(150, r.rate * 1.5)}" height="12" rx="3" fill="${r.balance < 0 ? '#c5221f' : r.rate < el - 35 ? '#e37400' : '#1a73e8'}"><title>${esc(r.name)} ${pct(r.rate)} · 잔액 ${won(r.balance)}원</title></rect><line x1="${118 + el * 1.5}" x2="${118 + el * 1.5}" y1="${i * 22}" y2="${i * 22 + 18}" stroke="#1d2330" stroke-width="1.5"/><text x="272" y="${i * 22 + 13}" font-size="10" fill="currentColor">${Math.round(r.rate)}%</text></g>`).join('')}</svg></div>` : '';
    const lrows = ledger && ledger.rows ? ledger.rows.filter(r => !b.month || r.date.slice(4, 6) === b.month) : [];
    const multiLedger = ledger && ledger.bgtCd === '__ALL';
    const cur = S.settings.budget.find(p => p.project === b.project && (p.filter || '') === b.filter);
    return `${pgh('예산 집행', cur ? esc(cur.label || '') : '', `<a class="btn sm" href="${esc(S.a.budget.url)}" target="_blank" rel="noopener">${ic('ext')}예실대비현황</a>${t && !t.error ? `<button class="btn sm" data-act="richBudget">한글용 복사</button><button class="btn sm" data-act="csvBudget">${ic('down')}엑셀(CSV)</button>` : ''}`)}
<div class="bar"><select class="f" id="bproj" aria-label="사업 선택">${projOptions}<option value="__custom" ${b.custom ? 'selected' : ''}>다른 사업 직접 입력…</option></select>${b.custom ? `<input class="inp" id="bcode" placeholder="사업 코드" value="${esc(b.project)}" style="width:110px"><input class="inp" id="bfilter" placeholder="세부 코드(선택)" value="${esc(b.filter)}" style="width:130px"><button class="btn primary" data-act="loadBudget">조회</button>` : ''}${b.busy ? '<span class="spin"></span>' : ''}<input class="inp grow" id="bq" placeholder="과목 이름 찾기" value="${esc(b.q)}" aria-label="과목 찾기"></div>
${t && t.error ? `<p class="err">${esc(t.message)}</p>` : ''}
${t && !t.error ? `${summary}<div class="cards" style="margin-top:12px">${barChart}${monthChart}</div>
<table><tr><th>과목</th><th class="num">예산</th><th class="num">집행</th><th class="num">잔액</th><th class="num">집행률</th></tr>${rows.map(r => `<tr class="lv-${esc(r.level)} ${r.level === '세' ? 'click' : ''} ${ledger && ledger.bgtCd === r.code ? 'sel' : ''}" ${r.level === '세' ? `data-act="ledger" data-code="${esc(r.code)}"` : ''}><td title="과목 코드 ${esc(r.code)}">${esc(String(r.name).replace(/^[○●·\s]+/, ''))} ${flag(r)}</td><td class="num">${won(r.budget)}</td><td class="num">${won(r.executed)}</td><td class="num">${won(r.balance)}</td><td class="num">${pct(r.rate)}<div class="rate"><i class="${r.balance < 0 ? 'over' : r.rate < el - 35 ? 'low' : ''}" style="width:${Math.min(100, Math.max(0, r.rate))}%"></i><b style="left:${el}%"></b></div></td></tr>`).join('')}</table>
${leaves.length > 1 ? `<p><button class="btn" data-act="ledgerAll">${esc(head ? head.name : '')} 전체 결의 내역 보기 (세목 ${leaves.filter(r => r.executed > 0).length}개)</button></p>` : ''}
${t.total ? `<p class="muted">참고: ${esc(t.project)} 프로젝트 전체(인건비 포함) 예산 ${won(t.total.budget)}원 · 집행 ${won(t.total.executed)}원 · ${pct(t.total.rate)}</p>` : ''}` : (b.busy ? '<p><span class="spin"></span> 조회 중…</p>' : '')}
${ledger ? `<h3>결의 내역 · ${esc(ledger.name || ledger.bgtCd)} <span class="muted">${ledger.rows ? `${lrows.length}건${b.month ? ` (${Number(b.month)}월)` : ''}` : ''}</span>${b.month ? '<button class="btn sm" data-act="budgetMonthClear">모든 달</button>' : ''}${ledger.rows ? ' <button class="btn sm" data-act="csvLedger">CSV</button>' : ''}</h3>${ledger.error ? `<p class="err">${esc(ledger.error)}</p>` : ledger.rows ? `<table><tr><th>결의일</th>${multiLedger ? '<th>세목</th>' : ''}<th>적요</th><th class="num">금액</th><th>문서번호</th><th>작성</th><th>전표</th></tr>${lrows.map(r => `<tr class="click" data-act="ledgerRow" data-i="${ledger.rows.indexOf(r)}"><td class="nowrap">${esc(ymd8(r.date))}</td>${multiLedger ? `<td class="muted">${esc(r.name.replace(/^○\s*/, '').slice(0, 18))}</td>` : ''}<td>${esc(r.desc)}</td><td class="num">${won(r.amount)}</td><td class="nowrap">${esc(r.docNo)}</td><td class="nowrap">${esc(r.writer)}</td><td class="nowrap muted">${esc(r.slip)}</td></tr>`).join('')}<tr class="lv-관"><td colspan="${multiLedger ? 3 : 2}">${b.month ? `${Number(b.month)}월 합계 <span class="muted">(연간 ${esc(ledger.check)})</span>` : esc(ledger.check)}</td><td class="num">${won(lrows.reduce((s, r) => s + r.amount, 0))}</td><td colspan="3"></td></tr></table>` : '<p><span class="spin"></span></p>'}` : ''}`;
  }
  async function loadBudget() {
    const b = S.budget;
    if (!b.project) { const p = S.settings.budget[0] || {project: 'A201', filter: ''}; b.project = p.project; b.filter = p.filter || ''; }
    const seq = ++b.seq;
    b.busy = true; b.ledger = null; b.monthly = null; b.month = ''; if (S.view === 'budget') renderMain();
    let table;
    try { table = await GW.budgetProject({project: b.project, filter: b.filter}); } catch (e) { table = {error: true, message: e.message}; }
    if (seq !== b.seq) return;
    b.table = table; b.busy = false; if (S.view === 'budget') renderMain();
  }
  async function loadLedger(code) {
    const b = S.budget;
    const row = b.table && b.table.rows.find(r => r.code === code);
    const seq = ++b.seq;
    b.ledger = {bgtCd: code, name: row ? row.name : code, rows: null}; b.month = '';
    renderMain();
    let res;
    try { res = await GW.budgetLedger({project: b.project, bgtCd: code, year: b.table && b.table.year, gisu: b.table && b.table.gisu}); } catch (e) { res = {error: e.message}; }
    if (seq !== b.seq || !b.ledger || b.ledger.bgtCd !== code) return;
    if (res.error) b.ledger.error = res.error;
    else { const ok = row ? res.checkSum === row.executed : null; Object.assign(b.ledger, {rows: res.rows, checkSum: res.checkSum, check: ok === null ? '합계' : ok ? `합계 ✓ 집행액 ${won(row.executed)}원과 일치` : `합계 ⚠ 집행액 ${won(row.executed)}원과 ${won(row.executed - res.checkSum)}원 차이`}); }
    if (S.view === 'budget') renderMain();
  }
  // All subjects under the selected 항 at once (예: 노121 → 26건), checked against the 항 total.
  async function loadLedgerAll() {
    const b = S.budget;
    const t = b.table;
    if (!t || t.error) return;
    const head = t.rows[0];
    const leaves = t.rows.filter(r => r.level === '세' && r.executed > 0);
    const seq = ++b.seq;
    b.ledger = {bgtCd: '__ALL', name: `${head ? head.name : ''} 전체`, rows: null};
    renderMain();
    try {
      const parts = await Promise.all(leaves.map(r => GW.budgetLedger({project: b.project, bgtCd: r.code, year: t.year, gisu: t.gisu}).then(l => ({r, l}))));
      if (seq !== b.seq) return;
      const rows = parts.flatMap(p => p.l.rows).sort((x, y) => x.date.localeCompare(y.date));
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      const bad = parts.filter(p => p.l.checkSum !== p.r.executed);
      const target = head ? head.executed : sum;
      Object.assign(b.ledger, {rows, checkSum: sum, check: sum === target && !bad.length ? `합계 ✓ ${won(target)}원과 일치 (세목 ${parts.length}개, ${rows.length}건)` : `합계 ⚠ ${won(target)}원과 ${won(target - sum)}원 차이${bad.length ? ` · 확인 필요 세목 ${bad.map(p => p.r.code).join(', ')}` : ''}`});
    } catch (e) { if (seq === b.seq) b.ledger.error = e.message; }
    if (S.view === 'budget') renderMain();
  }
  async function loadMonthly() {
    const b = S.budget;
    const code = b.filter || (b.table && b.table.rows[0] && b.table.rows[0].code) || '';
    b.monthlyBusy = true; renderMain();
    try { b.monthly = await GW.budgetMonthly({project: b.project, code, year: b.table && b.table.year}); b.monthly.code = code; } catch (e) { toast('월별 집행을 읽지 못했습니다: ' + e.message); }
    b.monthlyBusy = false; if (S.view === 'budget') renderMain();
  }

  // ----- 근태·연차 (calendar heat grid) -----
  function vAttendance() {
    const at = S.raw.data.attendance, lv = S.raw.data.leave, st = S.att;
    const p = R.kstNow(new Date());
    const thisM = `${p.y}${String(p.m).padStart(2, '0')}`;
    const prevD = new Date(Date.UTC(p.y, p.m - 2, 1));
    const prevM = `${prevD.getUTCFullYear()}${String(prevD.getUTCMonth() + 1).padStart(2, '0')}`;
    const month = st.month || thisM;
    const rows = st.rows || [];
    const anomalies = R.attendanceAnomalies(rows, {leaves: lv?.history || []});
    const bad = new Map(anomalies.map(x => [x.date, x]));
    const y = Number(month.slice(0, 4)), mo = Number(month.slice(4, 6));
    const startDow = new Date(y, mo - 1, 1).getDay(), last = new Date(y, mo, 0).getDate();
    const byDate = new Map(rows.map(r => [r.date, r]));
    const leaveDays = new Set();
    for (const u of lv?.history || []) if (u.approved && u.days >= 1) leaveDays.add(u.start);
    const t8 = today().replace(/-/g, '');
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div></div>');
    for (let dnum = 1; dnum <= last; dnum++) {
      const d8 = `${month}${String(dnum).padStart(2, '0')}`;
      const r = byDate.get(d8);
      const worked = r && (!!r.come || (/정상/.test(r.result) && !/휴일/.test(r.result)));
      const cls = !r ? 'off' : bad.has(d8) ? 'bad' : leaveDays.has(d8) ? 'lv' : worked ? (/정상/.test(r.result) ? 'okd' : 'part') : r.holiday || /휴일/.test(r.result) ? 'off' : 'part';
      const label = !r ? '' : bad.has(d8) ? '확인 필요' : leaveDays.has(d8) ? '휴가' : worked ? (r.come ? `${hm4(r.come)} 출근` : '근무') : r.holiday || /휴일/.test(r.result) ? '휴일' : r.result;
      cells.push(`<div class="c ${cls} ${st.day === d8 ? 'sel' : ''} ${d8 === t8 ? 'today' : ''}" role="button" tabindex="0" data-act="attDay" data-v="${d8}" title="${esc(r ? `${r.result} ${r.item || ''} ${r.status || ''}` : '')}"><b>${dnum}</b>${d8 === t8 ? ' <span class="muted">오늘</span>' : ''}<div class="muted" style="font-size:12px">${esc(label)}</div>${r && r.item ? `<div style="font-size:12px">${esc(r.item)}</div>` : ''}</div>`);
    }
    const selRow = st.day ? byDate.get(st.day) : null;
    const isWork = S.a.today ? S.a.today.isWorkday : true;
    const todayBox = isWork ? `출근 <b>${esc(hm4(at?.today.come) || '기록 없음')}</b> · 퇴근 <b>${esc(hm4(at?.today.leave) || '기록 없음')}</b>` : '오늘은 근무일이 아닙니다.';
    const legend = [['#e6f4ea', '정상 근무'], ['#fef7e0', '일부 근무(외출·조퇴 등)'], ['#e8f0fe', '휴가'], ['#f7f9fc', '휴일'], ['#fce8e6', '확인 필요']];
    const attActs = S.a.actions.filter(x => x.type === 'attendance');
    return `${pgh('근태·연차', '', `<a class="btn sm" href="${esc(at?.url || '')}" target="_blank" rel="noopener">${ic('ext')}근무시간 현황</a><button class="btn sm primary" data-act="openUrl" data-url="${esc(at?.requestUrl || '')}" data-title="근태신청">${ic('plus')}근태신청</button>`)}
<div class="cards"><div class="card2"><div class="ct">오늘</div>${todayBox}<div class="muted" style="margin-top:6px">이번 달 인정된 근무시간 ${mins(at?.month.recognizedMin)} · 초과 근무 ${mins(at?.month.overtimeMin)}<span class="term" title="기본 ${mins(at?.month.basicMin)}, 근무시간에서 뺀 시간(외출·휴게 등) ${mins(at?.month.exceptMin)}"> (자세히)</span></div></div>
<div class="card2"><div class="ct">${esc(lv?.year)}년 연차</div>남은 연차 <b style="font-size:20px">${fmtDays(lv?.remaining)}</b><div class="muted">받은 연차 ${fmtDays(lv?.granted)} · 쓴 연차 ${fmtDays(lv?.used)}</div>${(lv?.upcoming || []).map(u => `<div style="margin-top:4px">${ic('cal')} ${esc(ymd8(u.start).slice(5).replace('-', '/'))} ${esc(u.kind)} ${fmtDays(u.days)} <span class="muted">(${u.approved ? '결재 완료' : '결재 중'})</span></div>`).join('')}</div></div>
${attActs.length ? `<h2>확인이 필요한 날 ${attActs.length}일</h2><div class="list" role="list">${attActs.map(x => actionRow(x)).join('')}</div>` : ''}
<div class="bar" style="margin-top:18px"><div class="seg"><button class="${month === thisM ? 'on' : ''}" data-act="attMonth" data-v="${thisM}">이번 달</button><button class="${month === prevM ? 'on' : ''}" data-act="attMonth" data-v="${prevM}">지난달</button></div>${st.rows ? `<button class="btn sm" data-act="csvAtt">${ic('down')}엑셀로 저장</button>` : ''}</div>
<div class="legend">${legend.map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div>
${st.busy ? `<div class="att">${'<div class="sk" style="height:72px;margin:0"></div>'.repeat(14)}</div>` : `<div class="att">${WD.map(w => `<div class="h">${w}</div>`).join('')}${cells.join('')}</div>`}
${selRow ? `<div class="box ${bad.has(st.day) ? 'warn' : ''}"><b>${esc(ymd8(st.day))}</b> · ${esc(selRow.workType || '')} · 근태 상태 ${esc(selRow.result)}${selRow.item ? ` · ${esc(selRow.item)}` : ''}${selRow.status ? ` · ${esc(selRow.status)}` : ''}<br>출근 ${esc(hm4(selRow.come) || '-')} · 퇴근 ${esc(hm4(selRow.leave) || '-')} · 인정 ${selRow.recognizedMin === null ? '-' : mins(selRow.recognizedMin)}<div class="acts"><button class="btn sm primary" data-act="openUrl" data-url="${esc(at?.requestUrl || '')}" data-title="근태신청 ${esc(ymd8(st.day))}">이 날짜 근태신청 하러 가기</button></div></div>` : ''}
<h2>올해 연차·휴가 사용 내역 <span class="muted">${(lv?.history || []).length}건</span></h2><table><tr><th>날짜</th><th>구분</th><th class="num">기간</th><th>제목</th><th>상태</th></tr>${(lv?.history || []).slice(0, 40).map(u => `<tr><td class="nowrap">${esc(ymd8(u.start))}${u.end !== u.start ? ' ~ ' + esc(ymd8(u.end).slice(5)) : ''}</td><td>${esc(u.kind)}</td><td class="num">${fmtDays(u.days)}</td><td>${esc(u.title)}</td><td>${u.approved ? '완료' : '진행 중'}</td></tr>`).join('')}</table>`;
  }
  async function loadAttendance(month) {
    const p = R.kstNow(new Date());
    const m = month || S.att.month || `${p.y}${String(p.m).padStart(2, '0')}`;
    const seq = ++S.att.seq;
    S.att.month = m; S.att.busy = true; if (!S.att.day.startsWith(m)) S.att.day = ''; renderMain();
    const y = Number(m.slice(0, 4)), mo = Number(m.slice(4, 6));
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const t = today().replace(/-/g, '');
    const to = `${m}${String(last).padStart(2, '0')}`;
    let rows;
    try { rows = await GW.attendanceDays({from: `${m}01`, to: to > t ? t : to}); } catch (e) { rows = []; toast('근태 자료를 읽지 못했습니다: ' + e.message); }
    if (seq !== S.att.seq) return;
    S.att.rows = rows; S.att.busy = false; if (S.view === 'attendance') renderMain();
  }

  // ----- 보고서 -----
  function vReport() {
    return `${pgh('보고서', '한글(HWP)·워드에 붙여넣으면 굵게·표가 유지됩니다')}
<div class="cards"><div class="card2"><div class="ct">주간 업무 실적 초안</div><div class="muted">최근 7일 상신문서와 내가 접수한 문서로 만듭니다.</div><div class="acts"><button class="btn primary" data-act="mkWeekly">${ic('report')}${S.weekly ? '다시 만들기' : '초안 만들기'}</button>${S.weekly ? `<button class="btn" data-act="richWeekly">한글용 복사</button><button class="btn" data-act="dlWeekly">${ic('down')}TXT 저장</button>` : ''}</div></div>
<div class="card2"><div class="ct">오늘 브리핑</div><div class="muted">처리할 일과 참고 항목을 한 장으로 정리합니다.</div><div class="acts"><button class="btn primary" data-act="richBrief">한글용 복사</button><button class="btn" data-act="printBrief">인쇄·PDF</button><button class="btn" data-act="dlBrief">${ic('down')}HTML 저장</button><button class="btn" data-act="csvQueue">${ic('down')}엑셀(CSV)</button></div></div></div>
${S.weekly ? `<h2>주간 업무 실적 초안 <span class="saved on" id="wkSaved">${ic('check')}자동 저장됨</span></h2><textarea id="weekly" aria-label="주간 업무 실적 초안" rows="${Math.min(30, Math.max(10, S.weekly.split('\n').length + 2))}">${esc(S.weekly)}</textarea>` : ''}
<h2>오늘 브리핑 미리보기</h2><iframe id="briefFrame" title="오늘 브리핑" sandbox="allow-popups allow-popups-to-escape-sandbox allow-modals" style="width:100%;height:640px;border:1px solid var(--line);border-radius:12px;background:#fff"></iframe>`;
  }
  const weeklyHtml = text => `<div style="font-family:'함초롬바탕','맑은 고딕',serif;font-size:11pt;line-height:1.7">${text.split('\n').map(l => l.startsWith('□') ? `<p><b>${esc(l)}</b></p>` : l.startsWith('○') ? `<p style="margin-left:10pt"><b>${esc(l)}</b></p>` : l.startsWith('  -') ? `<p style="margin-left:24pt">${esc(l.trim())}</p>` : l.startsWith('※') ? `<p style="color:#666;font-size:9pt">${esc(l)}</p>` : l ? `<p>${esc(l)}</p>` : '').join('')}</div>`;
  const briefHtml = () => {
    const a = S.a, m = a.summary.mine || {};
    const rows = mineVisible().slice(0, 30).map(x => `<tr><td>${STATE_NAME[stateOf(x)]}</td><td>${esc(x.title)}</td><td>${esc(x.headline || x.kind)}</td><td>${esc(x.deadline ? x.deadline.date.slice(5) + ' ' + ddayText(x.deadline.dday) : '')}</td></tr>`).join('');
    return `<p><b>업무 브리핑 (${esc(R.kstNow(new Date(a.collectedAt)).date)} ${hhmm(new Date(a.collectedAt))} 기준)</b></p><p>내 처리할 일 ${m.total ?? mineVisible().length}건(급함 ${m.urgent ?? 0} · 할 일 ${m.todo ?? 0} · 확인 ${m.check ?? 0}), 참고 ${a.summary.ref ?? 0}건, 남은 연차 ${fmtDays(a.summary.leaveRemaining)}</p><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-size:10pt"><tr><th>구분</th><th>내용</th><th>해야 할 일</th><th>기한</th></tr>${rows}</table>`;
  };

  // ----- 설정 (바꾸는 즉시 자동 저장) -----
  function vSettings() {
    const st = S.settings;
    const hasMini = !!localStorage.getItem(LS + 'src');
    const perm = 'Notification' in window ? ({granted: '허용됨', denied: '브라우저에서 막혀 있음', default: '아직 묻지 않음'}[Notification.permission] || '') : '이 브라우저는 지원하지 않음';
    const r = rel();
    const ruleChips = (l, name) => r[l].length ? `<div style="margin-top:8px"><span class="muted">${name}</span> ${r[l].map((q, i) => `<span class="chip">${esc(q.label || q.v)}<button class="btn sm ghost icon" style="height:22px;width:22px" data-act="delRule" data-l="${l}" data-i="${i}" aria-label="지우기">${ic('x')}</button></span>`).join(' ')}</div>` : '';
    const usedKB = (() => { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(LS) || k.startsWith('bwyfgw:')) n += (localStorage.getItem(k) || '').length; } } catch {} return Math.round(n / 1024); })();
    return `${pgh('설정', '바꾸는 즉시 저장됩니다', `<span class="saved" id="setSaved">${ic('check')}저장됨</span>`)}
<div class="set">
<div class="si"><b>내 업무 범위</b><div><label><input type="checkbox" class="setc" data-k="roles.deptReceiver" ${st.roles?.deptReceiver ? 'checked' : ''}>부서 접수는 내 업무</label><label><input type="checkbox" class="setc" data-k="roles.distributor" ${st.roles?.distributor ? 'checked' : ''}>문서 배부는 내 업무</label><label><input type="checkbox" class="setc" data-k="roles.sender" ${st.roles?.sender ? 'checked' : ''}>다른 사람 문서 발송도 내 업무</label><div class="muted">체크하지 않은 종류는 "참고"로 접혀 처리할 일에서 빠집니다.</div>${ruleChips('mute', '목록에서 뺀 것:')}${ruleChips('mine', '내 일로 지정한 것:')}</div></div>
<div class="si"><b>내 긴급 키워드</b><div><input class="inp setc" data-k="urgentWords" style="width:100%" value="${esc((st.urgentWords || []).join(', '))}" placeholder="쉼표로 구분 (예: 행정사무감사, 시의회)"><div class="muted">제목에 이 단어가 있으면 "급함"으로 올립니다.</div></div></div>
<div class="si"><b>자동 새로고침</b><div><select class="f setc" data-k="refreshMin">${[0, 3, 5, 10, 30].map(m => `<option value="${m}" ${Number(st.refreshMin) === m ? 'selected' : ''}>${m ? m + '분마다' : '끄기'}</option>`).join('')}</select> <span class="muted">작업 중에는 화면을 바꾸지 않고 "지금 반영" 안내만 띄웁니다.</span></div></div>
<div class="si"><b>새 급한 일 알림</b><div><label><input type="checkbox" class="setc" data-k="notify" ${st.notify ? 'checked' : ''}>바탕화면 알림 보내기</label><span class="muted">알림 권한: ${perm}</span></div></div>
<div class="si"><b>보기</b><div><select class="f setc" data-k="fontSize" aria-label="글자 크기">${[['s', '글자 작게'], ['m', '글자 보통'], ['l', '글자 크게'], ['xl', '글자 아주 크게']].map(([v, n]) => `<option value="${v}" ${st.fontSize === v ? 'selected' : ''}>${n}</option>`).join('')}</select> <select class="f setc" data-k="theme" aria-label="테마"><option value="light" ${st.theme === 'light' ? 'selected' : ''}>밝은 화면</option><option value="dark" ${st.theme === 'dark' ? 'selected' : ''}>어두운 화면</option></select></div></div>
<div class="si"><b>예산 조회 대상</b><div><div id="budgetRows">${st.budget.map((b, i) => `<div class="bar"><input class="inp" data-b="label" data-i="${i}" value="${esc(b.label || '')}" placeholder="이름 (예: 전략경영실 운영)" style="flex:1"><input class="inp" data-b="project" data-i="${i}" value="${esc(b.project)}" placeholder="사업 코드" style="width:110px" title="예실대비현황의 프로젝트 코드"><input class="inp" data-b="filter" data-i="${i}" value="${esc(b.filter || '')}" placeholder="세부 코드(선택)" style="width:130px"><button class="btn sm ghost icon" data-act="budgetRowDel" data-i="${i}" aria-label="삭제">${ic('x')}</button></div>`).join('')}</div><button class="btn sm" data-act="budgetRowAdd">${ic('plus')}대상 추가</button></div></div>
<div class="si"><b>받은메일 읽는 수</b><div><select class="f setc" data-k="mailCount">${[50, 100, 200].map(n => `<option value="${n}" ${Number(st.mailCount) === n ? 'selected' : ''}>최근 ${n}통</option>`).join('')}</select></div></div>
</div>
<h2>이 PC에 저장된 자료</h2>
<div class="set"><div class="si"><b>저장 내용</b><div>숨기기·미루기 표시, 내 할 일, 설정, 최근 처리 기록(최대 40일)과 배부 추천용 이력(12시간 보관)이 이 브라우저에만 저장됩니다. 현재 약 ${usedKB}KB. 로그인 정보는 저장하지 않습니다. 여러 사람이 쓰는 PC라면 다 쓴 뒤 지워 주세요.<div class="acts"><button class="btn sm" data-act="resetDone">숨기기·미루기 초기화</button><button class="btn sm" data-act="resetRouting">추천 이력 지우기</button><button class="btn sm danger" data-act="resetAll">업무센터 자료 모두 지우기</button></div></div></div>
<div class="si"><b>설치</b><div>${hasMini ? '이 브라우저에 설치되어 있습니다. 그룹웨어 화면 위 가운데 "업무센터" 버튼이나 Alt+G로 엽니다.' : '설치 북마크로 한 번 실행하면 이 브라우저에 저장됩니다.'}<details style="margin-top:6px"><summary class="muted" style="cursor:pointer">버전 정보</summary><div class="muted">업무센터 ${VERSION} · 수집기 ${esc(GW.version)} · 조회 전용 연결 ${GW.readOnlyEndpoints().length}개${S.errors && S.errors.length ? ` · 최근 오류 ${S.errors.length}건 <button class="btn sm" data-act="copyErrors">오류 기록 복사</button>` : ''}</div></details></div></div></div>`;
  }
  function saveSettingField(el) {
    const st = S.settings, k = el.dataset.k;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    if (k.startsWith('roles.')) { st.roles = {...(st.roles || {}), [k.slice(6)]: v}; if (S.raw) reanalyze(); }
    else if (k === 'urgentWords') { st.urgentWords = String(v).split(',').map(w => w.trim()).filter(Boolean); if (S.raw) reanalyze(); }
    else if (k === 'refreshMin' || k === 'mailCount') { st[k] = Number(v); if (k === 'refreshMin') schedule(); }
    else if (k === 'notify') { st.notify = v; if (v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => { if (S.view === 'settings') renderMain(); }); }
    else st[k] = v;
    saveLocal(); applyLook();
    const s = $('#setSaved'); if (s) { s.classList.add('on'); clearTimeout(saveSettingField.t); saveSettingField.t = setTimeout(() => s.classList.remove('on'), 1600); }
    renderNav(); renderHead();
  }
  function saveBudgetRows() {
    const rows = {};
    root.querySelectorAll('#budgetRows input').forEach(i => { (rows[i.dataset.i] = rows[i.dataset.i] || {})[i.dataset.b] = i.value.trim(); });
    const list = Object.values(rows).filter(b => /^[A-Za-z0-9가-힣]+$/.test(b.project || '')).map(b => ({project: b.project, filter: b.filter || '', label: b.label || ''}));
    S.settings.budget = list.length ? list : DEFAULT_SETTINGS.budget; S.budget.table = null;
    saveLocal();
    const s = $('#setSaved'); if (s) { s.classList.add('on'); setTimeout(() => s.classList.remove('on'), 1600); }
  }

  // ---------- detail pane ----------
  function renderPane() {
    const pane = $('#pane');
    const show = !!(S.sel || S.pane.url || S.focus);
    wcEl.classList.toggle('nopane', !show);
    wcEl.classList.toggle('expanded', show && S.pane.expanded);
    if (!show) { pane.innerHTML = ''; S.pane.mounted = ''; return; }
    if (!pane.querySelector('#ph')) pane.innerHTML = '<div class="ph" id="ph"></div><div class="frame" id="frame"></div><div id="fbar"></div>';
    const info = paneInfo();
    const ph = $('#ph');
    const keepScroll = ph.querySelector('.in') ? ph.scrollTop : 0;
    ph.className = 'ph' + (S.pane.url ? '' : ' min');
    const x = selectedAction();
    const st = x ? stateOf(x) : '';
    ph.innerHTML = `<div class="top"><button class="btn sm" data-act="closePane" title="오른쪽 창을 닫고 목록으로 (Esc)">${ic('back')}목록으로</button><span class="sp"></span>${S.pane.url ? `<button class="btn sm ghost" data-act="paneExpand" title="${S.pane.expanded ? '목록과 나란히 보기' : '원래 화면을 넓게 보기'}">${ic('expand')}${S.pane.expanded ? '나란히' : '넓게'}</button><a class="btn sm ghost" href="${esc(S.pane.url)}" target="_blank" rel="noopener" title="새 창으로 열기">${ic('ext')}새 창</a>` : ''}</div>
<div class="in"><div class="box warn" id="dirtyNote" style="display:${S.pane.dirty ? 'block' : 'none'};margin:0 0 10px">${ic('alert')} 원래 화면에 입력 중입니다. 보내기·저장·상신 전에 다른 곳으로 옮기면 먼저 여쭤봅니다.</div>
${x ? `<div class="state"><span class="bdg ${st}">${STATE_NAME[st]}</span>${x.headline ? `<b class="${['overdue', 'urgent'].includes(st) ? 'err' : ''}">${esc(x.headline)}</b>` : ''}</div>` : ''}<div class="t">${esc(info.title || '')}</div>${info.body || ''}</div>`;
    ph.scrollTop = keepScroll;
    const frame = $('#frame');
    if (S.pane.url !== S.pane.mounted) {
      frame.innerHTML = '';
      S.pane.dirty = false;
      if (S.pane.url) { const f = document.createElement('iframe'); f.src = S.pane.url; f.title = '그룹웨어 원래 화면'; const u = S.pane.url; f.addEventListener('load', () => { scanFrame(f, u); watchDirty(f, u); }); frame.append(f); }
      S.pane.mounted = S.pane.url;
    }
    frame.classList.toggle('idle', !S.pane.url);
    if (!S.pane.url) frame.innerHTML = `<div class="fe">${info.url ? `<div>${ic('ext', 'style="width:30px;height:30px"')}</div><div>그룹웨어 원래 화면을 여기에 열어 그대로 처리할 수 있습니다.<br><span class="muted">원래 화면의 버튼(결재·접수·배부·발송·보내기)은 실제로 처리됩니다.</span></div><button class="btn primary" data-act="paneOpenMain">원래 화면 열기</button>` : '<div class="muted">이 항목은 열 화면이 없습니다.</div>'}</div>`;
    $('#fbar').innerHTML = focusBar();
  }
  // Mark the pane "dirty" as soon as the user types anything in the embedded groupware screen
  // (답장 본문, 결재 의견, 기안 제목 ...), including nested editor iframes.
  function watchDirty(f, url) {
    const seen = new WeakSet();
    const mark = () => { if (S.pane.url === url && !S.pane.dirty) { S.pane.dirty = true; const b = $('#dirtyNote'); if (b) b.style.display = 'block'; } };
    const attach = doc => { if (!doc || seen.has(doc)) return; seen.add(doc); ['input', 'change', 'keydown', 'paste', 'drop'].forEach(ev => doc.addEventListener(ev, e => { if (ev !== 'keydown' || (e.key && e.key.length === 1)) mark(); }, true)); };
    const scan = () => { if (!f.isConnected || S.pane.url !== url) return false; try { const walk = doc => { attach(doc); for (const i of doc.querySelectorAll('iframe')) { try { walk(i.contentDocument); } catch {} } }; walk(f.contentDocument); } catch {} return true; };
    scan();
    const t = setInterval(() => { if (!scan()) clearInterval(t); }, 1500);
  }
  // Ask before throwing away what the user typed in the pane.
  function leavePane() {
    if (!S.pane.url || !S.pane.dirty) return true;
    const ok = confirm('처리 창에 입력하던 내용이 있습니다(답장·의견·기안 등).\n보내기·저장·상신을 하지 않았다면 이동할 때 사라집니다.\n(메일은 그룹웨어 설정에 따라 임시보관함에 자동 저장됐을 수 있습니다.)\n그래도 이동할까요?');
    if (ok) S.pane.dirty = false;
    return ok;
  }
  // After the user opens a document, read its text (same origin) and pull out deadlines.
  function scanFrame(f, url, tries = 0) {
    if (!f.isConnected || url !== S.pane.url) return;
    let text = '';
    try {
      const collect = doc => { if (!doc || !doc.body) return; text += '\n' + doc.body.innerText; for (const ta of doc.querySelectorAll('textarea,input[type=text],input:not([type])')) text += '\n' + (ta.value || ''); for (const inner of doc.querySelectorAll('iframe')) { try { collect(inner.contentDocument); } catch {} } };
      collect(f.contentDocument);
    } catch { return; }
    if (text.replace(/\s/g, '').length < 80 && tries < 8) { setTimeout(() => scanFrame(f, url, tries + 1), 1200); return; }
    const deadlines = R.extractAllDeadlines(text).filter(x => x.dday >= -1 && x.dday <= 120);
    const flat = text.replace(/\s+/g, ' ');
    const asks = (flat.match(/[^.。]*?(?:제출|회신|요청|협조|참석|신청)[^.。]{0,60}(?:바랍니다|주시기|요청드|부탁)/g) || []).slice(0, 3);
    const attach = (text.match(/붙임\s*[^\n]{0,80}/g) || []).slice(0, 4);
    const amounts = [...new Set((flat.match(/\d{1,3}(?:,\d{3})+\s*원/g) || []))].slice(0, 5);
    S.pane.extract = {url, deadlines, asks, attach, amounts};
    const box = $('#extract');
    if (box) box.innerHTML = extractHtml();
  }
  const extractHtml = () => {
    const x = S.pane.extract;
    if (!x || x.url !== S.pane.url) return S.pane.url ? '<span class="muted"><span class="spin"></span> 열린 원문에서 기한·요청을 찾는 중…</span>' : '<span class="muted">원문을 열면 본문에서 기한·요청·금액을 자동으로 찾아 보여 줍니다.</span>';
    const nx = R.nextDeadline(x.deadlines);
    return `<b>원문 자동 추출</b>${x.deadlines.length ? `<div>${x.deadlines.map(d => `<span class="pill ${d.dday <= 1 ? 'solid' : d.dday <= 3 ? 'high' : 'medium'}" title="${esc(d.context)}">${esc(d.date.slice(5))}${d.time ? ' ' + esc(d.time) : ''} ${ddayText(d.dday)}</span>`).join('')}</div><div class="muted">${esc(nx ? nx.context : '')}</div>` : '<div class="muted">기한 표현을 찾지 못했습니다.</div>'}${x.asks.length ? `<div style="margin-top:4px">${x.asks.map(a => `· ${esc(a.trim().slice(0, 140))}`).join('<br>')}</div>` : ''}${x.amounts.length ? `<div class="muted">금액: ${x.amounts.map(esc).join(', ')}</div>` : ''}${x.attach.length ? `<div class="muted" style="margin-top:4px">${x.attach.map(esc).join('<br>')}</div>` : ''}<div class="acts">${nx ? `<button class="btn sm" data-act="todoFromExtract">${esc(nx.date.slice(5))} 기한으로 할 일 추가</button>` : ''}</div>`;
  };
  const relatedQ = t => String(t || '').replace(/\(.*?\)|\[.*?\]|「|」|『|』|20\d{2}년?/g, ' ').split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');
  function paneInfo() {
    const sel = S.sel;
    if (!sel) return {title: S.focus ? '연속 처리' : '그룹웨어 화면', url: S.pane.url, body: ''};
    if (sel.type === 'action') {
      const x = selectedAction();
      if (!x) return {title: '항목이 목록에서 사라졌습니다', body: '<div class="box okb">그룹웨어에서 처리됐거나 조건이 바뀌었습니다. 새로고침 후 목록에서 다시 선택하세요.</div>'};
      const why = `${x.scope === 'ref' && x.refReason ? `<div class="box" style="margin-top:8px"><b>참고로 분류한 이유</b> ${esc(x.refReason)} <button class="btn sm" data-act="rowMenu" data-k="${esc(x.key)}">내 일로 지정</button></div>` : ''}${x.why && x.why.length ? `<div class="muted" style="margin-top:6px">판단 근거: ${esc(x.why.join(', '))}</div>` : ''}`;
      if (x.type === 'doc') return docPane(findDoc(x.ref.kind, x.ref.docId) || {title: x.title, url: x.url, docId: x.ref.docId}, x.ref.kind, x, why);
      if (x.type === 'mail') return mailPane(findMail(x.ref.box, x.ref.uid), x, why);
      if (x.type === 'notice') return {title: x.title, url: x.url, body: `${why}<div class="kv"><b>구분</b><span>${esc(x.kind)}</span><b>작성</b><span>${esc(x.detail)}</span><b>등록</b><span>${esc(x.when)}</span></div><div class="box warn">원문을 열면 게시글이 읽음 처리되고 조회수가 올라갑니다.</div>${actsFor(x.url, {key: x.key, q: relatedQ(x.title), title: x.title, unread: true, what: '게시글'})}<div class="box" id="extract">${extractHtml()}</div>`};
      if (x.type === 'attendance') return {title: x.title, url: x.url, body: `${why}<div class="box warn">${esc(x.detail)}</div>${actsFor(x.url, {key: x.key, title: '근태신청'})}<div class="box tip">근태신청 화면이 열립니다. 해당 날짜의 출장·휴가·근무일대체 신청 여부를 확인하세요. <button class="btn sm" data-act="goAttendanceDay" data-v="${esc(x.ref.date)}">근태 달력에서 보기</button></div>`};
      if (x.type === 'conflict') return {title: x.title, url: x.url, body: `${why}<div class="box warn"><b>휴가일 마감</b> ${esc(x.detail)}</div>${actsFor(x.url, {key: x.key, title: x.title})}`};
      return {title: x.title, url: x.url, body: `${why}<div class="kv"><b>구분</b><span>${esc(x.area)} · ${esc(x.kind)}</span><b>내용</b><span>${esc(x.detail)}</span></div>${actsFor(x.url, {key: x.key, title: x.title})}`};
    }
    if (sel.type === 'doc') { const d = findDoc(sel.kind, sel.docId) || (S.apMore[sel.kind] || []).find(x => x.docId === sel.docId); return docPane(d || {title: '문서', docId: sel.docId}, sel.kind, null, ''); }
    if (sel.type === 'mail') return mailPane(findMail(sel.box, sel.uid), null, '');
    if (sel.type === 'search') return searchPane(sel.item);
    if (sel.type === 'ledger') {
      const r = sel.row;
      return {title: r.desc, url: '', body: `<div class="kv"><b>결의일</b><span>${esc(ymd8(r.date))}</span><b>금액</b><span>${won(r.amount)}원</span><b>문서번호</b><span>${esc(r.docNo)}</span><b>작성</b><span>${esc(r.dept)} ${esc(r.writer)}</span><b>전표</b><span>${esc(r.slip)}</span><b>과목</b><span>${esc(r.name)} (${esc(r.code)})</span></div><div class="acts">${r.docNo ? `<button class="btn primary" data-act="findDocNo" data-no="${esc(r.docNo)}" data-t="${esc(r.desc)}">결재문서 찾아 열기</button>` : ''}<button class="btn" data-act="todoFromSel">할 일 추가</button></div><div id="docNoResult"></div>`};
    }
    if (sel.type === 'frame') return {title: sel.title, url: sel.url, body: ''};
    return {title: '', url: '', body: ''};
  }
  function docPane(d, kind, action, why) {
    const url = d.url || (action && action.url);
    const hist = S.routing ? (kind === 'distWaiting' ? S.routing.dist : kind === 'deptWaiting' ? S.routing.dept : []) : [];
    const rec = hist.length ? R.recommendRouting(d, hist, {target: kind === 'distWaiting' ? 'toDept' : 'toEmp', limit: 3}) : null;
    let recBox = '';
    if (['distWaiting', 'deptWaiting'].includes(kind)) {
      const label = kind === 'distWaiting' ? '배부 추천' : '접수 추천 담당자';
      if (!S.routing) recBox = `<div class="box tip"><b>${label}</b> <button class="btn sm" data-act="reloadRouting">처리 이력 읽고 추천 받기</button></div>`;
      else {
        const grp = rec && rec.group;
        recBox = `<div class="box tip"><b>${label}</b> <span class="muted">최근 180일 비슷한 문서 ${rec ? rec.similar : 0}건 기준</span>${grp ? `<div style="margin:4px 0">가장 비슷한 지난 문서는 <b>${grp.targets.length}곳</b>에 함께 ${kind === 'distWaiting' ? '배부' : '접수'}: ${esc(grp.targets.join(', '))}<div class="muted">${esc(grp.title)} · ${esc(grp.from)} · ${esc(String(grp.date).slice(0, 10))}</div></div>` : ''}${rec && rec.length ? rec.map(r => `<div>${esc(r.name)} <span class="pill ${r.level === '높음' ? 'ok' : 'low'}">${r.level === '높음' ? '가능성 높음' : '가능성 낮음'}</span><span class="muted">비슷한 ${r.of}건 중 ${r.count}건 · ${esc(r.reasons.join(', '))}</span>${r.examples[0] ? `<div class="muted">예: ${esc(r.examples[0].title)} (${esc(String(r.examples[0].date).slice(0, 10))})</div>` : ''}</div>`).join('') : '<div class="muted">제목 주제가 겹치는 처리 이력이 없습니다.</div>'}</div>`;
      }
    }
    const waiting = ['distWaiting', 'deptWaiting'].includes(kind);
    const pv = waiting ? {found: false} : S.pane.preview && S.pane.preview.key === (d.docNo || d.title) ? S.pane.preview.data : null;
    const pvBox = `<div class="box" id="pvbox">${pv === null ? '<span class="muted"><span class="spin"></span> 열람 기록 없이 미리보기를 찾는 중…</span>' : pv.found ? `<b>미리보기</b> <span class="muted">통합검색 색인에서 읽음 · 열람 기록 없음</span>${(() => { const dl = R.extractAllDeadlines(pv.text || '').filter(x => x.dday >= -1); return dl.length ? `<div>${dl.map(x => `<span class="pill ${x.dday <= 1 ? 'solid' : 'medium'}" title="${esc(x.context)}">${esc(x.date.slice(5))} ${ddayText(x.dday)}</span>`).join('')}</div>` : ''; })()}<div class="pv">${esc((pv.text || '').slice(0, 2500))}</div>${pv.files && pv.files.length ? `<div class="muted">첨부: ${pv.files.map(f => esc(f.name)).join(', ')}</div>` : ''}` : `<span class="muted">미리보기 없음: ${['distWaiting', 'deptWaiting'].includes(kind) ? '접수·배부 전 문서는 통합검색 색인에 아직 없어 원문으로만 볼 수 있습니다.' : '통합검색 색인에서 이 문서를 찾지 못했습니다.'}</span>`}</div>`;
    if (pv === null) loadPreview(d).then(p => { S.pane.preview = {key: d.docNo || d.title, data: p}; const b = $('#pvbox'); if (b && S.sel) renderPane(); });
    const warn = d.unread ? '<div class="box warn">아직 열람하지 않은 문서입니다. 처리 창에 열면 그룹웨어에 열람으로 기록됩니다.</div>' : '';
    const title = d.title || (action && action.title) || '';
    return {title, url, body: `${why || ''}<div class="kv"><b>구분</b><span>${esc((S.a.approval.lists[kind] || {}).label || kind)}</span><b>문서번호</b><span>${esc(d.docNo || '-')}</span><b>보낸 곳</b><span>${esc(d.sender || '-')}</span><b>기안·담당</b><span>${esc([d.drafterDept, d.drafter, d.toEmp].filter(Boolean).join(' ') || '-')}</span><b>상태</b><span>${esc(d.status || '-')}</span><b>일시</b><span>${esc(d.date || '-')}</span><b>첨부</b><span>${d.attachments || 0}개</span>${action && action.deadline ? `<b>기한</b><span>${esc(action.deadline.date)}${action.deadline.time ? ' ' + esc(action.deadline.time) : ''} (${ddayText(action.deadline.dday)})</span>` : ''}</div>${recBox}${warn}${actsFor(url, {key: action ? action.key : `doc:${kind}:${d.docId}`, q: relatedQ(title), title, unread: d.unread})}${pvBox}<div class="box" id="extract">${extractHtml()}</div>`};
  }
  function actsFor(url, {key, q, title, unread, what, extra, primaryLabel} = {}) {
    return `<div class="acts">${url ? `<button class="btn primary" data-act="openUrl" data-url="${esc(url)}" data-title="${esc(title || '')}" ${unread ? `data-unread="1" data-what="${esc(what || '문서')}"` : ''}>${ic('ext')}${esc(primaryLabel || '원래 화면 열기')}</button>` : ''}${extra || ''}<button class="btn" data-act="todoFromSel">${ic('plus')}할 일에 추가</button>${q ? `<button class="btn" data-act="related" data-q="${esc(q)}">${ic('search')}관련 문서</button>` : ''}${key ? `<button class="btn icon" data-act="rowMenu" data-k="${esc(key)}" aria-label="더 보기" title="내일 다시 보기 · 숨기기 · 상관없음">${ic('more')}</button>` : ''}</div>`;
  }
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const extOf = name => (String(name).match(/\.([A-Za-z0-9]{1,5})$/) || [])[1]?.toLowerCase() || '';
  // Attachments: read once for mails already read (no state change); unread mails need consent.
  async function loadMailDetail(m, allowMarkRead = false) {
    S.mailDet = S.mailDet || {}; S.mailDetBusy = S.mailDetBusy || {};
    if (S.mailDetBusy[m.uid]) return;
    S.mailDetBusy[m.uid] = 1;
    try {
      const r = await GW.mailDetail({uid: m.uid, seen: m.seen === true, allowMarkRead});
      S.mailDet[m.uid] = r;
      if (allowMarkRead) m.seen = true;
    } catch (e) { S.mailDet[m.uid] = {error: e.message}; }
    delete S.mailDetBusy[m.uid];
    if (S.sel && (S.sel.uid === m.uid || (S.sel.key || '').endsWith(':' + m.uid))) renderPane();
  }
  async function downloadMailFile(uid, i, btn) {
    const c = S.mailDet && S.mailDet[uid];
    const f = c && c.files[i];
    if (!f) return false;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 받는 중'; }
    try {
      const blob = await GW.mailAttachment({uid, sn: f.sn, name: f.name});
      GW.saveBlob(blob, f.name);
      if (btn) { btn.innerHTML = `${ic('check')}받음`; }
      return true;
    } catch (e) {
      if (btn) { btn.disabled = false; btn.innerHTML = `${ic('down')}다시 받기`; }
      toast(`"${f.name}"을(를) 받지 못했습니다: ${e.message}. "메일 원문 열기"에서 받을 수 있습니다.`);
      return false;
    }
  }
  function mailFilesBox(m) {
    S.mailDet = S.mailDet || {};
    const c = S.mailDet[m.uid];
    if (!c) {
      if (m.seen) { setTimeout(() => loadMailDetail(m), 0); return `<div class="sec"><div class="sh">${ic('clip')}첨부파일</div><div class="sk"></div><div class="sk" style="width:70%"></div></div>`; }
      return `<div class="sec"><div class="sh">${ic('clip')}본문·첨부파일</div><div class="box warn" style="margin-top:0">아직 읽지 않은 메일입니다. 본문과 첨부를 불러오면 그룹웨어에 <b>읽음</b>으로 표시됩니다.<div class="acts"><button class="btn primary sm" data-act="mailDetail" data-uid="${esc(m.uid)}" data-box="${esc(m.box)}">본문·첨부 불러오기</button></div></div></div>`;
    }
    if (c.error) return `<div class="sec"><div class="sh">${ic('clip')}첨부파일</div><div class="box errb" style="margin-top:0">첨부 정보를 불러오지 못했습니다(${esc(c.error)}). <button class="btn sm" data-act="mailDetailRetry" data-uid="${esc(m.uid)}" data-box="${esc(m.box)}">다시 시도</button></div></div>`;
    const n = c.files.length + c.bigFiles.length;
    const fileRow = (name, size, btn) => `<div class="file"><span class="ext ${esc(extOf(name))}">${esc((extOf(name) || 'file').toUpperCase().slice(0, 4))}</span><div class="nm"><b title="${esc(name)}">${esc(name)}</b><span>${esc(size)}</span></div>${btn}</div>`;
    const rows = [
      ...c.files.map((f, i) => fileRow(f.name, kb(f.size), `<button class="btn sm" data-act="dlFile" data-uid="${esc(m.uid)}" data-i="${i}">${ic('down')}받기</button>`)),
      ...c.bigFiles.map(f => fileRow(f.name, `${f.size} · 대용량${c.bigUntil ? ` · ${c.bigUntil}까지 받을 수 있음` : ''}`, `<a class="btn sm" href="${esc(f.href)}" target="_blank" rel="noopener">${ic('down')}받기</a>`)),
    ];
    const text = c.text ? c.text.replace(/대용량 파일첨부[\s\S]*?보관\)/, '').trim() : '';
    return `${text ? `<div class="sec"><div class="sh">${ic('mail')}본문</div><div class="body-text ${S.bodyOpen ? 'open' : ''}" id="bodyText">${esc(text.slice(0, 6000))}</div>${text.length > 240 ? `<button class="btn sm ghost" data-act="bodyToggle" style="margin-top:6px">${S.bodyOpen ? '접기' : '본문 전체 보기'}</button>` : ''}</div>` : ''}
<div class="sec"><div class="sh">${ic('clip')}첨부파일 ${n}개${c.files.length > 1 ? `<button class="btn sm" data-act="dlAll" data-uid="${esc(m.uid)}" style="margin-left:auto">${ic('down')}모두 받기</button>` : ''}</div>${n ? `<div class="files">${rows.join('')}</div>` : '<div class="muted">첨부파일이 없습니다.</div>'}${c.readUrl ? `<div class="acts"><button class="btn sm ghost" data-act="openUrl" data-url="${esc(c.readUrl)}" data-title="메일 원문: ${esc(m.subject)}">${ic('ext')}그룹웨어에서 메일 원문 보기</button></div>` : ''}</div>`;
  }
  function mailPane(m, action, why) {
    if (!m) return {title: action ? action.title : '메일', url: S.a.mail.url, body: actsFor(S.a.mail.url, {key: action && action.key, title: '받은메일함', primaryLabel: '받은메일함 열기'})};
    const ur = m.seen ? '' : 'data-unread="1" data-what="메일"';
    const c = S.mailDet && S.mailDet[m.uid];
    const to = c && c.to ? c.to.replace(/<[^>]+>/g, '').replace(/\s*,\s*/g, ', ') : '';
    const reply = `<button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('reall', m))}" data-title="전체 답장: ${esc(m.subject)}" ${ur}>전체 답장</button><button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('fw', m))}" data-title="전달: ${esc(m.subject)}" ${ur}>전달</button>`;
    return {title: m.subject || '(제목 없음)', url: GW.links.compose('re', m), body: `${why || ''}<div class="kv"><b>보낸 사람</b><span>${esc(m.from)} <span class="muted">${esc(m.fromEmail)}</span></span><b>받은 시각</b><span>${esc(m.date.slice(0, 16))}</span>${to ? `<b>받는 사람</b><span title="${esc(to)}">${esc(to.length > 90 ? to.slice(0, 90) + '…' : to)}</span>` : ''}<b>상태</b><span>${m.seen ? '읽음' : '안 읽음'}${m.answered ? ' · 답장함' : ''}${m.forwarded ? ' · 전달함' : ''}</span></div>
${c && !c.error ? '' : `<div class="body-text open" style="max-height:120px">${esc((m.preview || '').replace(/대용량 파일첨부[\s\S]*?보관\)/, '').trim()) || '미리보기 없음'}</div>`}
${mailFilesBox(m)}
<div class="acts"><button class="btn primary" data-act="openUrl" data-url="${esc(GW.links.compose('re', m))}" data-title="답장: ${esc(m.subject)}" ${ur}>${ic('mail')}답장 쓰기</button>${reply}${action ? `<button class="btn icon" data-act="rowMenu" data-k="${esc(action.key)}" aria-label="더 보기">${ic('more')}</button>` : ''}</div>
<p class="muted" style="margin-top:10px">답장 창은 받는 사람·제목이 채워진 채 열리고 "보내기"를 눌러야 발송됩니다.${m.seen ? '' : ' 안 읽은 메일은 답장 창을 열 때 읽음으로 바뀔 수 있어 먼저 묻습니다.'}</p>`};
  }
  function searchPane(it) {
    if (!it) return {title: '검색 결과를 찾을 수 없습니다', url: '', body: ''};
    const kw = S.search.res && S.search.res.keyword;
    if (it.type === 'doc' || it.type === 'board') {
      const dl = R.extractAllDeadlines(it.text || '').filter(x => x.dday >= -1);
      const meta = it.type === 'doc' ? `<b>문서번호</b><span>${esc(it.docNo)}</span><b>양식</b><span>${esc(it.form)}</span><b>기안</b><span>${esc(it.dept)} ${esc(it.drafter)}</span><b>일자</b><span>${esc(ymd8(it.date))}</span>` : `<b>게시판</b><span>${esc(it.catTitle)}</span><b>작성</b><span>${esc(it.writer)}</span><b>등록</b><span>${esc(it.date)}</span>`;
      return {title: it.title, url: it.url, body: `<div class="kv">${meta}<b>첨부</b><span>${it.files.map(f => esc(f.name)).join('<br>') || '-'}</span></div>${dl.length ? `<div class="box tip"><b>본문 기한</b> ${dl.map(d => `<span class="pill ${d.dday <= 1 ? 'solid' : 'medium'}" title="${esc(d.context)}">${esc(d.date.slice(5))} ${ddayText(d.dday)}</span>`).join('')}</div>` : ''}<div class="box"><b>본문 미리보기</b> <span class="muted">열람 기록 없음</span><div class="pv">${hl((it.text || it.snippet || '').slice(0, 4000), kw)}</div></div>${actsFor(it.url, {q: relatedQ(it.title), title: it.title})}<div class="box" id="extract">${extractHtml()}</div>`};
    }
    if (it.type === 'file') return {title: it.name, url: it.url, body: `<div class="kv"><b>출처</b><span>${esc(it.parent)}</span><b>올린 사람</b><span>${esc(it.owner)}</span><b>일자</b><span>${esc(it.date)}</span><b>크기</b><span>${won(it.size)} B</span></div>${actsFor(it.url, {q: relatedQ(it.parent), title: it.name})}<div class="box tip">첨부파일 미리보기(그룹웨어 문서 뷰어)가 열립니다.</div>`};
    if (it.type === 'mail') return {title: it.subject || '(제목 없음)', url: S.a.mail.url, body: `<div class="kv"><b>메일함</b><span>${esc(it.box)}</span><b>보낸 사람</b><span>${esc(it.from)}</span><b>받는 사람</b><span>${esc(it.to)}</span><b>일시</b><span>${esc(it.date)}</span></div><div class="box">${hl(it.snippet, kw)}</div><div class="acts"><button class="btn primary" data-act="openUrl" data-url="${esc(GW.links.compose('re', it))}" data-title="답장">답장 쓰기</button><button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('fw', it))}" data-title="전달">전달</button></div>${actsFor(S.a.mail.url, {q: relatedQ(it.subject), title: '받은메일함'})}`};
    return {title: it.title || it.name, url: '', body: `<div class="box">${esc(it.snippet || '')}</div>`};
  }
  const findDoc = (kind, id) => ((S.a.approval.lists[kind] || {}).docs || []).find(d => d.docId === id);
  const findMail = (box, uid) => [...(S.raw.data.mail?.inbox.records || []), ...(S.raw.data.mail?.otherUnseen || [])].find(m => m.box === box && m.uid === uid);

  function selectAction(key, {keepPane = false} = {}) {
    if (!keepPane && S.sel && S.sel.key !== key && !leavePane()) return;
    S.sel = {type: 'action', key};
    if (!keepPane) { S.pane.url = ''; S.pane.extract = null; S.pane.preview = null; }
    if (S.newKeys.delete(key)) saveLocal();
    const x = selectedAction();
    if (x && x.type === 'doc' && ['distWaiting', 'deptWaiting'].includes(x.ref.kind) && !S.routing) loadRouting().then(() => renderPane());
    if (S.view === 'today') { root.querySelectorAll('.row.sel').forEach(r => r.classList.remove('sel')); const row = root.querySelector(`.row[data-k="${CSS.escape(key)}"]`); if (row) { row.classList.add('sel'); row.querySelector('.pill.new')?.remove(); } renderNav(); }
    else renderMain();
    renderPane();
  }
  function openUrl(url, {title = '', unread = false, what = '문서'} = {}) {
    if (!url) return;
    if (url !== S.pane.url && !leavePane()) return;
    if (unread && !confirm(`아직 읽지 않은 ${what}입니다. 처리 창에 열면 그룹웨어에 읽음(열람)으로 기록될 수 있습니다. 열까요?`)) return;
    if (!S.sel) S.sel = {type: 'frame', title: title || '그룹웨어 화면', url};
    S.pane.url = url; S.pane.extract = null;
    // Full groupware screens (근태신청, 메일함, 결재작성) need width: open the pane wide.
    if (!/#\/?popup\?/.test(url)) { S.pane.expanded = true; toast('그룹웨어 전체 화면이라 처리 창을 넓게 열었습니다. 왼쪽 메뉴나 "목록 보기"로 돌아갑니다.'); }
    else S.pane.expanded = false;
    renderPane();
  }
  // Would opening this item record a read/열람 in the groupware?
  function marksRead(x) {
    if (!x) return false;
    if (x.type === 'doc') { const d = findDoc(x.ref.kind, x.ref.docId); return !!(d && d.unread); }
    if (x.type === 'notice') return true;
    if (x.type === 'mail') { const m = findMail(x.ref.box, x.ref.uid); return !!(m && !m.seen); }
    return false;
  }
  function openItem(x) {
    const what = x.type === 'mail' ? '메일' : x.type === 'notice' ? '게시글' : '문서';
    if (x.type === 'mail') { const m = findMail(x.ref.box, x.ref.uid); openUrl(m ? GW.links.compose('re', m) : x.url, {title: x.title, unread: marksRead(x), what}); return; }
    openUrl(x.url, {title: x.title, unread: marksRead(x), what});
  }
  function openWindow(url, x) {
    const d = x && x.type === 'doc' ? findDoc(x.ref.kind, x.ref.docId) : null;
    if (d && d.unread && !confirm('아직 열람하지 않은 문서입니다. 새 창으로 열면 열람으로 기록됩니다. 열까요?')) return;
    window.open(url, '_blank');
  }

  // ---------- hide / snooze / undo / to-do ----------
  function pushUndo(label) { S.undo.push({label, hidden: {...S.hidden}, snooze: {...S.snooze}, plan: {...S.plan}, todos: JSON.parse(JSON.stringify(S.todos))}); if (S.undo.length > 20) S.undo.shift(); }
  function undo() {
    const u = S.undo.pop();
    if (!u) { toast('되돌릴 작업이 없습니다.'); return; }
    S.hidden = u.hidden; S.snooze = u.snooze; S.plan = u.plan; S.todos = u.todos; saveLocal(); render(); toast(`되돌렸습니다: ${u.label}`);
  }
  function hide(keys) { pushUndo(`${keys.length}건 숨기기`); for (const k of keys) S.hidden[k] = Date.now(); S.multi.clear(); saveLocal(); afterMark(); toastUndo(`${keys.length}건을 이 화면에서 숨겼습니다. 그룹웨어에서 처리해야 완전히 사라집니다.`); }
  function snooze(keys) { pushUndo(`${keys.length}건 미루기`); const t = tomorrow8(); for (const k of keys) S.snooze[k] = t; S.multi.clear(); saveLocal(); afterMark(); toastUndo(`${keys.length}건을 내일 오전 8시까지 미뤘습니다.`); }
  function afterMark() { if (S.view === 'today') refreshQueue(); else render(); if (S.sel && S.sel.type === 'action' && (isHidden(S.sel.key) || isSnoozed(S.sel.key)) && !S.focus) { const q = queue(); if (q[0]) selectAction(q[0].key); else { S.sel = null; renderPane(); } } }
  function addTodo(title, due = '', source = '', url = '', key = '') {
    if (!title) return;
    pushUndo('할 일 추가');
    const t = {id: uid(), title, due, status: 'todo', source, url, at: Date.now()};
    S.todos.unshift(t);
    if (key) S.plan[key] = S.plan[key] || 'today';
    saveLocal(); renderNav(); if (S.view === 'board' || S.view === 'calendar') renderMain();
    toastUndo(`할 일에 추가했습니다${due ? ` (기한 ${due.slice(5)})` : ''}.`);
  }
  function addTodoFromInput() { const title = ($('#tdTitle') || {}).value?.trim(); if (!title) return; addTodo(title, parseDue(($('#tdDue') || {}).value), '직접 추가'); }
  function selInfo() { const info = S.sel ? paneInfo() : null; return info ? {title: info.title, url: info.url} : {title: '', url: ''}; }

  // ---------- 연속 처리 모드 ----------
  function startFocus(keys) {
    const list = (keys && keys.length ? keys : queue().filter(x => x.scope !== 'ref' && ['doc', 'mail', 'attendance', 'conflict', 'notice'].includes(x.type)).map(x => x.key));
    if (!list.length) { toast('처리할 항목이 없습니다.'); return; }
    if (!leavePane()) return;
    S.focus = {keys: list, i: 0, results: {}, busy: false};
    if (S.view !== 'today' && S.view !== 'approval') S.view = 'today';
    focusOpen();
    toast('연속 처리: 그룹웨어 원래 화면에서 처리한 뒤 아래 초록 버튼을 누르세요. 실제로 처리됐는지 확인해 드립니다.');
  }
  // Items that would record a read are not opened automatically: the pane shows a gate instead.
  function focusOpen() {
    const f = S.focus;
    const k = f.keys[f.i];
    const x = S.a.actions.find(a => a.key === k);
    S.sel = {type: 'action', key: k};
    S.pane.extract = null; S.pane.preview = null; S.pane.dirty = false;
    f.gate = false;
    if (!x) S.pane.url = '';
    else if (x.type === 'mail') S.pane.url = ''; // 답장·전달·메일함 중 고르게 한다
    else if (marksRead(x)) { S.pane.url = ''; f.gate = true; }
    else S.pane.url = x.url;
    S.pane.expanded = !!(S.pane.url && !/#\/?popup\?/.test(S.pane.url));
    if (!f.started) f.started = new Date();
    render();
  }
  function focusBar() {
    const f = S.focus;
    if (!f) return '';
    const cnt = r => Object.values(f.results).filter(v => v === r).length;
    const k = f.keys[f.i];
    const x = S.a.actions.find(a => a.key === k);
    const label = x && x.type === 'doc' ? '처리했음 → 확인하고 다음' : x && x.type === 'mail' ? '답장했음 → 보낸메일 확인하고 다음' : '직접 확인했음 → 다음';
    const gate = f.gate ? `<div class="box warn" style="margin:0 10px 6px">이 항목은 열면 그룹웨어에 읽음(열람)으로 기록됩니다. <button class="btn sm primary" data-act="focusOpenGate">열고 처리하기</button> <button class="btn sm" data-act="focusSkip">열지 않고 건너뛰기</button></div>` : '';
    const summary = [cnt('done') ? `처리 확인 ${cnt('done')}` : '', cnt('manual') ? `직접 확인 ${cnt('manual')}` : '', cnt('remain') ? `아직 남음 ${cnt('remain')}` : '', cnt('hadReply') ? `이전 답장만 ${cnt('hadReply')}` : '', cnt('unsent') ? `답장 못 찾음 ${cnt('unsent')}` : ''].filter(Boolean).join(' · ');
    return `${gate}<div class="fbar"><span class="prog">연속 처리 ${f.i + 1} / ${f.keys.length}${summary ? ' · ' + summary : ''}</span><button class="btn sm" data-act="focusPrev" ${f.i === 0 || f.busy ? 'disabled' : ''}>◀ 이전</button><button class="btn sm" data-act="focusSkip" ${f.busy ? 'disabled' : ''}>건너뛰기</button><button class="btn ok" data-act="focusNext" ${f.busy ? 'disabled' : ''}>${f.busy ? '<span class="spin"></span> 확인 중…' : label}</button><button class="btn sm" data-act="focusStop" ${f.busy ? 'disabled' : ''}>끝내기</button></div>`;
  }
  async function focusNext(verify = true) {
    const f = S.focus;
    if (!f || f.busy) return;
    if (!leavePane()) return;
    const k = f.keys[f.i];
    const x = S.a.actions.find(a => a.key === k);
    f.busy = true; $('#fbar').innerHTML = focusBar();
    try {
      if (verify && x && x.type === 'doc' && ['distWaiting', 'deptWaiting', 'pending', 'sendWaiting'].includes(x.ref.kind)) {
        // Re-read the whole list (up to 200) so that long lists are not misjudged.
        const r = await GW.approvalPage(x.ref.kind, 1, {size: 200});
        const still = r.docs.some(d => d.docId === x.ref.docId);
        f.results[k] = still ? 'remain' : 'done';
        toast(still ? '아직 그룹웨어 목록에 남아 있습니다. 처리가 저장되지 않았을 수 있습니다.' : '✓ 그룹웨어에서 처리된 것을 확인했습니다.');
      } else if (verify && x && x.type === 'mail') {
        const m = findMail(x.ref.box, x.ref.uid);
        const r = await GW.findReply({subject: m ? m.subject : x.title, since: m ? m.date : ''});
        const k0 = R.kstNow(f.started || new Date());
        const startText = `${k0.date} ${String(k0.hh).padStart(2, '0')}:${String(k0.mm).padStart(2, '0')}`;
        if (r.found && r.date.slice(0, 16) >= startText) { pushUndo('연속 처리 확인'); f.results[k] = 'done'; S.hidden[k] = Date.now(); saveLocal(); toast(`✓ 방금 보낸 답장을 보낸메일함에서 찾았습니다 (${r.date.slice(5, 16)}).`); }
        else if (r.found) { f.results[k] = 'hadReply'; toast(`이전에 보낸 답장(${r.date.slice(5, 16)})만 있습니다. 제출까지 끝났는지 확인하세요. 목록에 남겨 둡니다.`); }
        else { f.results[k] = 'unsent'; toast('보낸메일함에서 이 메일의 답장을 찾지 못했습니다. 목록에 남겨 둡니다.'); }
      } else if (verify && x) { pushUndo('연속 처리 확인'); f.results[k] = 'manual'; S.hidden[k] = Date.now(); saveLocal(); }
    } catch (e) { f.results[k] = 'unknown'; toast('확인하지 못했습니다: ' + e.message); }
    f.busy = false;
    if (!S.focus) return;
    if (f.i >= f.keys.length - 1) { finishFocus(); return; }
    f.i++; focusOpen();
  }
  function focusPrev() { if (S.focus && S.focus.i > 0 && !S.focus.busy && leavePane()) { S.focus.i--; focusOpen(); } }
  function finishFocus() {
    const f = S.focus;
    const cnt = r => f.keys.filter(k => f.results[k] === r).length;
    S.focus = null; S.pane.url = ''; S.sel = null; S.pane.dirty = false;
    if (S.raw) reanalyze();
    render();
    toast(`연속 처리 끝: 그룹웨어에서 처리 확인 ${cnt('done')}건${cnt('manual') ? ` · 직접 확인 ${cnt('manual')}건` : ''}${cnt('remain') ? ` · 아직 남음 ${cnt('remain')}건` : ''}${cnt('hadReply') ? ` · 이전 답장만 ${cnt('hadReply')}건` : ''}${cnt('unsent') ? ` · 답장 못 찾음 ${cnt('unsent')}건` : ''}${cnt('skip') ? ` · 건너뜀 ${cnt('skip')}건` : ''}.`);
    refresh({silent: true});
  }
  function stopFocus() { if (!S.focus || S.focus.busy) return; if (!leavePane()) return; finishFocus(); }

  // ---------- overlays: palette, help, menus ----------
  let palItems = [], palIndex = 0;
  function openPalette(q = '') {
    S.paletteOpen = true; S.menuOpen = ''; S.helpOpen = false;
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg pal" data-stop="1"><input id="palq" placeholder="무엇을 할까요? 예) 배부, A201, 지난달 근태, 새 메일, 전략경영실-1234, 회의록" value="${esc(q)}" autocomplete="off"><div id="pallist" style="margin-top:8px"></div><div class="muted" style="margin-top:6px">↑↓ 이동 · Enter 실행 · Esc 닫기</div></div></div>`;
    const inp = $('#palq');
    inp.focus(); inp.setSelectionRange(q.length, q.length);
    palRender(q);
  }
  function palCommands(q) {
    const cmds = [];
    const add = (label, hint, run, extra = '', icon = 'play') => cmds.push({label, hint, run, icon, text: label + ' ' + hint + ' ' + extra});
    const VIEW_WORDS = {today: '할 일 오늘 긴급 대시보드', approval: '배부 접수 결재 발송 열람 공문 문서유통', mail: '메일 답장 받은메일', search: '검색 찾기', board: '할 일 계획 보드', calendar: '일정 달력 기한', budget: '예산 집행 결의 예실', attendance: '근태 연차 휴가 출근 퇴근', report: '보고서 주간 브리핑 실적', settings: '설정 글자 테마 알림'};
    for (const v of VIEWS) add(`${v.label}`, '화면으로 이동', () => go(v.id), VIEW_WORDS[v.id] || '', VIEW_ICON[v.id]);
    add('연속 처리 시작', '처리할 일을 하나씩', () => startFocus(), '처리 모드');
    add('새로고침', '자료 다시 읽기', () => refresh());
    add('새 메일 쓰기', '메일', () => openUrl(GW.links.compose('plain'), {title: '새 메일 쓰기'}), 'mail');
    for (const f of (S.forms && S.forms.list) || []) add(`새 기안: ${f.name}`, f.count ? `최근 6개월 ${f.count}번 사용` : '추천 양식', () => openUrl(f.url, {title: `새 기안: ${f.name}`}), '기안 결재작성 양식');
    add('전체 양식에서 기안', '결재작성', () => openUrl(GW.links.route(GW.routes.draft), {title: '결재작성'}), '기안 양식');
    add('근태신청', '출장·휴가·대체', () => openUrl(GW.links.route(GW.routes.attendanceRequest), {title: '근태신청'}), '휴가 출장');
    add('근태 지난달 보기', '근태·연차', () => { go('attendance'); const p = R.kstNow(new Date()); const d = new Date(Date.UTC(p.y, p.m - 2, 1)); loadAttendance(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`); });
    for (const p of S.settings.budget) add(`예산 ${p.project} ${p.filter || ''}`, p.label || '예산 집행', () => { S.budget.project = p.project; S.budget.filter = p.filter || ''; S.budget.table = null; go('budget'); });
    add('주간 업무 실적 초안', '보고서', () => { go('report'); makeWeekly(); }, '보고');
    add('오늘 브리핑 한글용 복사', '보고서', () => copyRich(briefHtml(), R.renderMarkdown(S.a)));
    add('도움말', '사용법·용어', () => toggleHelp(true));
    add('글자 크게', '보기', () => fontStep(1)); add('글자 작게', '보기', () => fontStep(-1));
    add(S.settings.theme === 'dark' ? '밝은 테마' : '어두운 테마', '보기', () => toggleTheme());
    for (const x of visibleActions().slice(0, 60)) add(dispTitle(x), x.headline || x.kind, () => { go('today'); selectAction(x.key); }, x.detail, {doc: 'doc', mail: 'mail', attendance: 'clock', notice: 'bell'}[x.type] || 'doc');
    const qq = q.trim();
    if (/^[A-Za-z]\d{3}$/.test(qq)) add(`예산 ${qq.toUpperCase()} 조회`, '프로젝트 코드', () => { S.budget.project = qq.toUpperCase(); S.budget.filter = ''; S.budget.table = null; go('budget'); });
    if (/[가-힣A-Za-z0-9]+-\d{2,}/.test(qq)) add(`문서번호 ${qq} 찾아 열기`, '결재문서', () => findAndOpenDocNo(qq, ''));
    if (qq.length >= 2) add(`통합검색: ${qq}`, 'Enter', () => { S.search.kw = qq; runSearch(); }, qq);
    return cmds;
  }
  const fuzzy = (text, q) => {
    if (!q) return 1;
    const t = text.toLowerCase(), k = q.toLowerCase().replace(/\s+/g, '');
    if (t.includes(q.toLowerCase())) return 100 - t.indexOf(q.toLowerCase());
    let i = 0, score = 0;
    for (const ch of k) { const j = t.indexOf(ch, i); if (j < 0) return 0; score += j === i ? 3 : 1; i = j + 1; }
    return score;
  };
  function palRender(q) {
    const cmds = palCommands(q);
    palItems = cmds.map(c => ({...c, s: fuzzy(c.text, q.trim())})).filter(c => c.s > 0).sort((a, b) => b.s - a.s).slice(0, 14);
    if (q.trim().length >= 2 && !palItems.some(c => c.label.startsWith('통합검색'))) palItems.push(cmds.find(c => c.label.startsWith('통합검색')));
    palItems = palItems.filter(Boolean);
    palIndex = 0;
    $('#pallist').innerHTML = palItems.map((c, i) => `<div class="it ${i === palIndex ? 'on' : ''}" data-act="palRun" data-i="${i}">${ic(c.icon || 'play')}<span class="lb">${esc(c.label)}</span><span class="k">${esc(c.hint)}</span></div>`).join('') || '<div class="muted">해당하는 명령이 없습니다.</div>';
  }
  function paletteKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); palIndex = Math.max(0, Math.min(palItems.length - 1, palIndex + (e.key === 'ArrowDown' ? 1 : -1))); root.querySelectorAll('.pal .it').forEach((n, i) => n.classList.toggle('on', i === palIndex)); return; }
    if (e.key === 'Enter') { e.preventDefault(); const c = palItems[palIndex]; closeOverlay(); if (c) c.run(); }
  }
  function toggleHelp(force) {
    S.helpOpen = force === undefined ? !S.helpOpen : force; S.paletteOpen = false; S.menuOpen = '';
    if (!S.helpOpen) { $('#overlay').innerHTML = ''; return; }
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" role="dialog" aria-label="사용법"><button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button><h2 style="margin-top:0">GW 통합 업무센터 사용법</h2>
<p><b>1. 오늘 할 일</b>에서 위 카드·그래프를 누르면 아래 목록이 그 기준으로 걸러집니다. 목록은 <b>기한이 가깝고 오래 기다린 순</b>입니다. 빨간 <b>긴급</b>은 최대 6건만 붙입니다.</p>
<p><b>2. 항목을 누르면</b> 오른쪽에 요약·추천·미리보기가 나옵니다. <b>처리 창에 열기</b>를 누르면 그룹웨어 원래 화면이 옆에 열리고, 그 화면의 버튼으로 결재·접수·배부·발송·답장을 합니다.</p>
<p><b>3. 연속 처리</b>를 누르면 처리할 일을 하나씩 엽니다. 처리 후 <b>처리했음 → 다음</b>을 누르면 그룹웨어에서 실제로 처리됐는지 확인해 드립니다.</p>
<p><b>4. 숨기기·미루기</b>는 이 화면에서만 감추는 개인 표시이고, <b>되돌리기</b>(Ctrl+Z)로 취소할 수 있습니다. 그룹웨어 상태는 바뀌지 않습니다.</p>
<p><b>5. 할 일 보드</b>에서 카드를 끌어 오늘·내일·이번 주로 옮기고, <b>일정 달력</b>에서 할 일을 다른 날짜로 끌어 기한을 바꿉니다.</p>
<p><b>6. Ctrl+K</b>(또는 위 검색칸)에 "배부", "A201", "새 메일", "전략경영실-1234"처럼 쓰면 바로 이동·실행합니다.</p>
<h3>용어</h3><p><span class="term">배부</span> 기관 밖에서 온 공문을 담당 부서로 나눠 보내는 일 · <span class="term">부서 접수</span> 부서로 온 문서를 담당자가 받는 일 · <span class="term">열람</span> 참고하라고 보내 준 문서 · <span class="term">발송 대기</span> 결재가 끝나 밖으로 보낼 차례인 문서 · <span class="term">근무일대체</span> 휴일 근무 대신 다른 날 쉬는 것</p>
<h3>안전</h3><p>이 화면이 자료를 읽을 때(목록·검색·미리보기)는 그룹웨어를 바꾸지 않습니다. 처리 창에 열린 그룹웨어 화면의 버튼은 실제로 처리되니 평소처럼 확인하고 누르세요. 미열람 문서를 처리 창에 열면 열람으로 기록되어 미리 물어봅니다.</p>
<h3>단축키</h3><p><kbd>J</kbd>/<kbd>K</kbd> 이동 · <kbd>Enter</kbd> 처리 창에 열기 · <kbd>X</kbd> 숨기기 · <kbd>S</kbd> 미루기 · <kbd>T</kbd> 할 일 · <kbd>F</kbd> 연속 처리 · <kbd>R</kbd> 새로고침 · <kbd>/</kbd> 검색 · <kbd>Ctrl</kbd>+<kbd>K</kbd> 명령 · <kbd>Ctrl</kbd>+<kbd>Z</kbd> 되돌리기 · <kbd>Alt</kbd>+<kbd>G</kbd> 열기·닫기 (한글 입력 상태에서도 동작)</p>
<p><button class="btn primary" data-act="closeHelp">닫기</button> <button class="btn" data-act="coach">처음 안내 다시 보기</button> <span class="muted">Esc로도 닫힙니다</span></p></div></div>`;
    if (!S.settings.tourDone) { S.settings.tourDone = true; saveLocal(); }
  }
  async function openMenu(which, anchor) {
    if (S.menuOpen === which) { closeOverlay(); return; }
    S.menuOpen = which; S.paletteOpen = false; S.helpOpen = false;
    if (which === 'new') {
      $('#overlay').innerHTML = `<div class="menu" data-stop="1"><div class="mh">새로 만들기 (처리 창에 열림, 저장·발송 전까지 아무것도 남지 않음)</div><div class="mi" data-act="openUrl" data-url="${esc(GW.links.compose('plain'))}" data-title="새 메일 쓰기">✉ 새 메일 쓰기</div><div class="mh">새 기안 · 내가 자주 쓰는 양식</div><div id="formList"><div class="mi muted"><span class="spin"></span> 양식을 읽는 중…</div></div><div class="mi" data-act="openUrl" data-url="${esc(GW.links.route(GW.routes.draft))}" data-title="결재작성">전체 양식에서 고르기</div><div class="mi" data-act="openUrl" data-url="${esc(GW.links.route(GW.routes.attendanceRequest))}" data-title="근태신청">근태신청(휴가·출장·대체)</div></div>`;
      const list = await loadForms();
      const fl = $('#formList');
      if (fl) fl.innerHTML = (list || []).slice(0, 10).map(f => `<div class="mi" data-act="openUrl" data-url="${esc(f.url)}" data-title="새 기안: ${esc(f.name)}">📝 ${esc(f.name)} <span class="muted">${f.count ? `${f.count}번 사용` : '추천'}</span></div>`).join('') || '<div class="mi muted">양식이 없습니다.</div>';
    } else if (which.startsWith('row:')) {
      const key = which.slice(4);
      const x = S.a.actions.find(a => a.key === key);
      if (!x) { closeOverlay(); return; }
      const r = anchor ? anchor.getBoundingClientRect() : null, hr = wcEl.getBoundingClientRect();
      const pos = r ? `top:${Math.min(r.bottom - hr.top + 4, hr.height - 300)}px;right:${Math.max(8, hr.right - r.right)}px` : '';
      const k = esc(key);
      $('#overlay').innerHTML = `<div class="menu" data-stop="1" role="menu" style="${pos}"><div class="mh">${esc(x.title.slice(0, 34))}</div>${isMine(x) ? `<div class="mi" role="menuitem" data-act="rmSnooze" data-k="${k}">${ic('snooze')}내일 아침에 다시 보기</div><div class="mi" role="menuitem" data-act="rmTodo" data-k="${k}">${ic('plus')}할 일 보드에 추가</div><div class="mi" role="menuitem" data-act="rmWindow" data-k="${k}">${ic('ext')}새 창으로 열기</div><div class="mi" role="menuitem" data-act="rmHide" data-k="${k}">${ic('eye')}이 화면에서 숨기기</div><div class="mi danger" role="menuitem" data-act="rmMute" data-k="${k}">${ic('x')}나와 상관없음…</div>` : `<div class="mi" role="menuitem" data-act="rmMine" data-k="${k}">${ic('star')}내 일로 지정…</div><div class="mi" role="menuitem" data-act="rmWindow" data-k="${k}">${ic('ext')}새 창으로 열기</div><div class="mi" role="menuitem" data-act="rmHide" data-k="${k}">${ic('eye')}이 화면에서 숨기기</div>`}</div>`;
    } else if (which.startsWith('mute:') || which.startsWith('mine:')) {
      const list = which.slice(0, 4), key = which.slice(5);
      const x = S.a.actions.find(a => a.key === key);
      if (!x) { closeOverlay(); return; }
      const who = senderOf(x), kindName = RULE_KIND[x.base] || x.kind;
      const head = list === 'mute' ? '나와 상관없음: 목록에서 빼기 (설정에서 되돌릴 수 있음)' : '내 처리할 일로 옮기기';
      $('#overlay').innerHTML = `<div class="menu" data-stop="1" style="right:auto;left:50%;top:30%;transform:translateX(-50%);min-width:360px"><div class="mh">${head}</div><div class="mi" data-act="relAdd" data-l="${list}" data-t="key" data-v="${esc(key)}" data-label="${esc(x.title.slice(0, 40))}">이 항목만 <span class="muted">${esc(x.title.slice(0, 28))}</span></div>${who ? `<div class="mi" data-act="relAdd" data-l="${list}" data-t="sender" data-v="${esc(who)}" data-label="보낸 곳: ${esc(who)}">보낸 곳이 ‘${esc(who)}’인 항목 모두</div>` : ''}${RULE_KIND[x.base] ? `<div class="mi" data-act="relAdd" data-l="${list}" data-t="kind" data-v="${esc(x.base)}" data-label="종류: ${esc(kindName)}">‘${esc(kindName)}’ 종류 모두</div>` : ''}<div class="mi muted" data-act="closeOverlay">취소</div></div>`;
    } else if (which === 'view') {
      const fsName = {s: '작게', m: '보통', l: '크게', xl: '아주 크게'};
      $('#overlay').innerHTML = `<div class="menu" data-stop="1"><div class="mh">글자 크기: ${fsName[S.settings.fontSize] || '보통'}</div><div class="mi" data-act="fsUp">가+ 글자 크게</div><div class="mi" data-act="fsDown">가− 글자 작게</div><div class="mi" data-act="theme">${S.settings.theme === 'dark' ? '밝은 테마로' : '어두운 테마로'}</div><div class="mi" data-act="help">? 사용법·용어·단축키</div><div class="mi" data-act="openPalette">Ctrl+K 명령 찾기</div><div class="mi" data-act="view" data-v="settings">설정</div></div>`;
    } else if (which === 'bell') {
      const items = S.activity.slice(-40).reverse();
      $('#overlay').innerHTML = `<div class="menu" data-stop="1"><div class="mh">새로 들어온 항목 (업무센터가 확인한 시각 기준)</div>${items.map(x => `<div class="mi" data-act="bellItem" data-k="${esc(x.key)}"><span class="pill ${x.priority || 'low'}">${PRI[x.priority] || '참고'}</span>${esc(x.title)}<div class="muted">${esc(x.kind)} · ${hhmm(new Date(x.at))}${x.at > S.seenActivity ? ' · 새' : ''}</div></div>`).join('') || '<div class="mi muted">아직 없습니다.</div>'}</div>`;
      S.seenActivity = Date.now(); saveLocal(); renderHead();
    }
  }
  // 3-step on-screen guide pointing at the real controls.
  const COACH = [
    {sel: '#qlist .row, #qlist .empty', title: '① 처리할 일', text: '내가 처리해야 할 일만 급한 순서로 모았습니다. 줄을 누르면 오른쪽에 내용이 나옵니다.'},
    {sel: '#qlist .row .btn.primary, .hello .btn.primary', title: '② 원래 화면에서 처리', text: '"열기"를 누르면 그룹웨어 원래 화면이 오른쪽에 열립니다. 거기 있는 결재·접수·보내기 버튼으로 평소처럼 처리하세요.'},
    {sel: 'header .home', title: '③ 처음 화면', text: '언제든 왼쪽 위 "업무센터"를 누르면 이 첫 화면으로 돌아옵니다.'},
    {sel: 'header .back', title: '④ 그룹웨어로 돌아가기', text: '오른쪽 위 버튼을 누르면 원래 그룹웨어 화면으로 돌아갑니다. 다시 열 때는 화면 위 가운데 파란 "업무센터" 버튼(또는 Alt+G)을 누르세요.'},
  ];
  function startCoach() { closeOverlay(); if (S.view !== 'today') go('today'); S.coach = {i: 0}; drawCoach(); }
  function coachNext() { if (!S.coach) return; S.coach.i++; if (S.coach.i >= COACH.length) endCoach(); else drawCoach(); }
  function endCoach() { S.coach = null; $('#overlay').innerHTML = ''; if (!S.settings.tourDone) { S.settings.tourDone = true; saveLocal(); } }
  function drawCoach() {
    const step = COACH[S.coach.i];
    const target = root.querySelector(step.sel);
    const hr = wcEl.getBoundingClientRect();
    const r = target ? target.getBoundingClientRect() : {left: hr.width / 2 - 100, top: hr.height / 2 - 30, width: 200, height: 60, right: hr.width / 2 + 100, bottom: hr.height / 2 + 30};
    const left = Math.max(12, Math.min(hr.width - 340, r.left - hr.left));
    const below = r.bottom - hr.top + 12 + 190 < hr.height;
    const top = below ? r.bottom - hr.top + 12 : Math.max(12, r.top - hr.top - 190);
    $('#overlay').innerHTML = `<div class="coach-hole" style="left:${r.left - hr.left - 6}px;top:${r.top - hr.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div><div class="coach" role="dialog" aria-label="${esc(step.title)}" style="left:${left}px;top:${top}px"><div class="st">${S.coach.i + 1} / ${COACH.length}</div><b>${esc(step.title)}</b><div>${esc(step.text)}</div><div class="acts"><button class="btn primary" data-act="coachNext">${S.coach.i === COACH.length - 1 ? '시작하기' : '다음'}</button><button class="btn ghost" style="color:#fff" data-act="coachEnd">건너뛰기</button></div></div>`;
  }
  function closeOverlay() { S.paletteOpen = false; S.helpOpen = false; S.menuOpen = ''; $('#overlay').innerHTML = ''; }
  const fontStep = n => { const order = ['s', 'm', 'l', 'xl']; const i = Math.max(0, Math.min(3, order.indexOf(S.settings.fontSize) + n)); S.settings.fontSize = order[i]; saveLocal(); applyLook(); };
  const toggleTheme = () => { S.settings.theme = S.settings.theme === 'dark' ? 'light' : 'dark'; saveLocal(); applyLook(); };

  async function findAndOpenDocNo(no, t) {
    const out = $('#docNoResult');
    if (out) out.innerHTML = '<p><span class="spin"></span> 문서를 찾는 중…</p>';
    try {
      const p = await GW.docPreview({docNo: no, title: t});
      if (p.found) { if (out) out.innerHTML = `<div class="box okb">${esc(p.title)} (${esc(p.docNo)})</div>`; if (!S.sel) S.sel = {type: 'frame', title: p.title, url: p.url}; openUrl(p.url, {title: p.title}); }
      else if (out) out.innerHTML = '<div class="box warn">통합검색에서 같은 문서번호를 찾지 못했습니다. 권한이 없거나 아직 색인되지 않은 문서일 수 있습니다.</div>'; else toast('문서를 찾지 못했습니다.');
    } catch (err) { if (out) out.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  }
  async function makeWeekly() {
    toast('최근 7일 자료를 읽는 중…');
    try {
      const [sub, hist] = await Promise.all([GW.submittedRange({days: 7, size: 100}), loadRouting()]);
      const me = S.raw.principal.name;
      const receipts = (hist ? hist.dept : []).filter(r => String(r.toEmp).replace(/\s/g, '') === String(me).replace(/\s/g, '') && String(r.date).replace(/-/g, '').slice(0, 8) >= sub.from);
      S.weekly = R.weeklyReport({submitted: sub.docs, receipts, me: `${S.raw.principal.deptName} ${me}`, from: sub.from, to: sub.to});
      saveLocal();
    } catch (err) { toast('주간 초안을 만들지 못했습니다: ' + err.message); }
    if (S.view === 'report') renderMain();
  }

  // ---------- events ----------
  root.addEventListener('click', async e => {
    const path = e.composedPath();
    const el = path.find(n => n && n.dataset && n.dataset.act);
    if (!el) return;
    const act = el.dataset.act, v = el.dataset.v;
    if (act === 'closeOverlay' && path.some(n => n && n.dataset && n.dataset.stop)) return;
    if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
    if (S.menuOpen && !path.some(n => n && n.dataset && n.dataset.stop) && !['menuNew', 'menuBell'].includes(act)) closeOverlay();
    switch (act) {
      case 'refresh': refresh(); break;
      case 'applyRefresh': S.pendingRefresh = false; render(); break;
      case 'relogin': if (!S.pane.dirty || confirm('처리 창에 입력 중인 내용이 있습니다. 그룹웨어를 새로 고치면 사라집니다. 계속할까요?')) location.reload(); break;
      case 'close': if (leavePane()) close(); break;
      case 'home': goHome(); break;
      case 'apOpen': { e.stopPropagation(); const d = findDoc(el.dataset.kind, el.dataset.id) || (S.apMore[el.dataset.kind] || []).find(x => x.docId === el.dataset.id); if (!d || !leavePane()) break; S.sel = {type: 'doc', kind: el.dataset.kind, docId: d.docId}; S.pane.url = ''; renderMain(); openUrl(d.url, {title: d.title, unread: d.unread}); break; }
      case 'copyErrors': copyText((S.errors || []).map(x => `${new Date(x.at).toISOString()} ${x.where}: ${x.msg}`).join('\n')); break;
      case 'stateFilter': S.filter.level = S.filter.level === v || v === 'all' ? 'all' : v; renderMain(); break;
      case 'rowMenu': e.stopPropagation(); openMenu('row:' + el.dataset.k, el); break;
      case 'markDone': e.stopPropagation(); { pushUndo('끝냄'); S.hidden[el.dataset.k] = Date.now(); saveLocal(); afterMark(); toastUndo('끝난 일로 표시했습니다. 그룹웨어에 아직 남아 있으면 하루 뒤 다시 보여 드립니다.'); } break;
      case 'coach': startCoach(); break;
      case 'coachNext': coachNext(); break;
      case 'coachEnd': endCoach(); break;
      case 'paneOpenMain': { const x = selectedAction(); if (x) openItem(x); else { const info = paneInfo(); if (info.url) openUrl(info.url, {title: info.title}); } break; }
      case 'dlFile': downloadMailFile(el.dataset.uid, Number(el.dataset.i), el); break;
      case 'dlAll': { const c = S.mailDet[el.dataset.uid]; el.disabled = true; let ok = 0; for (let i = 0; i < c.files.length; i++) { if (await downloadMailFile(el.dataset.uid, i, root.querySelector('[data-act="dlFile"][data-uid="' + CSS.escape(el.dataset.uid) + '"][data-i="' + i + '"]'))) ok++; } el.disabled = false; toast('첨부 ' + ok + '/' + c.files.length + '개를 받았습니다. 브라우저 다운로드 폴더를 확인하세요.'); break; }
      case 'bodyToggle': S.bodyOpen = !S.bodyOpen; renderPane(); break;
      case 'mailDetailRetry': { const m = findMail(el.dataset.box, el.dataset.uid); if (m) { delete S.mailDet[m.uid]; loadMailDetail(m); renderPane(); } break; }
      case 'rmSnooze': snooze([el.dataset.k]); closeOverlay(); break;
      case 'rmTodo': { const x = S.a.actions.find(a => a.key === el.dataset.k); closeOverlay(); if (x) addTodo(x.title, x.deadline && x.deadline.date || '', x.kind, x.url, x.key); break; }
      case 'rmHide': hide([el.dataset.k]); closeOverlay(); break;
      case 'rmMute': openMenu('mute:' + el.dataset.k); break;
      case 'rmMine': openMenu('mine:' + el.dataset.k); break;
      case 'rmWindow': { const x = S.a.actions.find(a => a.key === el.dataset.k); closeOverlay(); if (x) openWindow(x.url, x); break; }
      case 'relMenu': e.stopPropagation(); openMenu(`${el.dataset.l}:${el.dataset.k}`); break;
      case 'relAdd': {
        if (el.dataset.l === 'mine' && el.dataset.t === 'kind' && ['deptWaiting', 'distWaiting', 'sendWaiting'].includes(el.dataset.v)) { const ro = S.settings.roles = {...(S.settings.roles || {})}; ro[{deptWaiting: 'deptReceiver', distWaiting: 'distributor', sendWaiting: 'sender'}[el.dataset.v]] = true; saveLocal(); reanalyze(); closeOverlay(); render(); toast('설정의 “내 업무 범위”에 반영했습니다.'); break; }
        addRule(el.dataset.l, el.dataset.t, el.dataset.v, el.dataset.label);
        toast(el.dataset.l === 'mute' ? '목록에서 뺐습니다. Ctrl+Z 또는 설정에서 되돌릴 수 있습니다.' : '내 처리할 일로 옮겼습니다.');
        break;
      }
      case 'delRule': { const r = rel(); r[el.dataset.l].splice(Number(el.dataset.i), 1); saveLocal(); if (S.raw) reanalyze(); render(); break; }
      case 'refToggle': S.refOpen = !el.open; break;
      case 'mailDetail': { const m = findMail(el.dataset.box, el.dataset.uid); if (m && confirm('이 메일을 불러오면 그룹웨어에 읽음으로 표시됩니다. 불러올까요?')) loadMailDetail(m, true); break; }
      case 'crumbView': if (S.focus) { stopFocus(); break; } if (!leavePane()) break; S.sel = null; S.pane.url = ''; S.pane.expanded = false; render(); break;
      case 'toggleCharts': S.settings.showCharts = !showCharts(); saveLocal(); renderMain(); break;
      case 'searchExample': S.search.kw = el.dataset.v; runSearch(); break;
      case 'view': go(v); break;
      case 'help': toggleHelp(); break;
      case 'closeHelp': case 'closeOverlay': closeOverlay(); break;
      case 'menuNew': openMenu('new'); break;
      case 'menuBell': openMenu('bell'); break;
      case 'bellItem': closeOverlay(); go('today'); selectAction(el.dataset.k); break;
      case 'fsUp': fontStep(1); if (S.menuOpen === 'view') { S.menuOpen = ''; openMenu('view'); } break;
      case 'fsDown': fontStep(-1); if (S.menuOpen === 'view') { S.menuOpen = ''; openMenu('view'); } break;
      case 'theme': toggleTheme(); if (S.menuOpen === 'view') { S.menuOpen = ''; openMenu('view'); } break;
      case 'openPalette': closeOverlay(); openPalette(''); break;
      case 'palRun': { const c = palItems[Number(el.dataset.i)]; closeOverlay(); if (c) c.run(); break; }
      case 'tileLevel': S.filter.level = S.filter.level === v ? 'all' : v; S.filter.area = 'all'; renderMain(); break;
      case 'tileArea': S.filter.area = S.filter.area === v ? 'all' : v; S.filter.level = 'all'; renderMain(); break;
      case 'goApproval': if (v) S.apTab = v; go('approval'); break;
      case 'goCalendar': go('calendar'); break;
      case 'goBudgetCode': go('budget'); break;
      case 'goAttendanceDay': S.att.day = v; if (S.att.month !== v.slice(0, 6)) { S.att.rows = null; S.att.month = v.slice(0, 6); } go('attendance'); break;
      case 'selDeadline': if (el.dataset.k && S.a.actions.some(x => x.key === el.dataset.k)) { go('today'); selectAction(el.dataset.k); } else { S.search.kw = relatedQ(el.dataset.title); runSearch(); } break;
      case 'area': S.filter.area = v; renderMain(); break;
      case 'level': S.filter.level = v; renderMain(); break;
      case 'onlyNew': S.filter.onlyNew = !S.filter.onlyNew; renderMain(); break;
      case 'showHidden': S.filter.showHidden = !S.filter.showHidden; renderMain(); break;
      case 'multi': {
        e.stopPropagation();
        const k = el.dataset.k;
        if (e.shiftKey && S.lastClickKey) { const q = queue().map(x => x.key); const a = q.indexOf(S.lastClickKey), b = q.indexOf(k); if (a >= 0 && b >= 0) for (const kk of q.slice(Math.min(a, b), Math.max(a, b) + 1)) S.multi.add(kk); }
        else if (S.multi.has(k)) S.multi.delete(k); else S.multi.add(k);
        S.lastClickKey = k; refreshQueue(); return;
      }
      case 'selAction': if (path.some(n => n && n.tagName === 'INPUT')) return; selectAction(el.dataset.k); break;
      case 'quickOpen': e.stopPropagation(); { const x = S.a.actions.find(a => a.key === el.dataset.k); if (x) { selectAction(x.key); openItem(x); } } break;
      case 'quickHide': e.stopPropagation(); hide([el.dataset.k]); break;
      case 'quickSnooze': e.stopPropagation(); snooze([el.dataset.k]); break;
      case 'quickTodo': e.stopPropagation(); { const x = S.a.actions.find(a => a.key === el.dataset.k); if (x) addTodo(x.title, x.deadline && x.deadline.date || '', x.kind, x.url, x.key); } break;
      case 'batchHide': hide([...S.multi]); break;
      case 'batchSnooze': snooze([...S.multi]); break;
      case 'batchTodo': { const keys = [...S.multi]; pushUndo(`${keys.length}건 할 일로`); for (const k of keys) { const x = S.a.actions.find(a => a.key === k); if (x) { S.todos.unshift({id: uid(), title: x.title, due: x.deadline && x.deadline.date || '', status: 'todo', source: x.kind, url: x.url, at: Date.now()}); S.plan[k] = S.plan[k] || 'today'; } } S.multi.clear(); saveLocal(); refreshQueue(); toastUndo(`${keys.length}건을 할 일에 넣었습니다.`); break; }
      case 'batchCsv': { const rows = S.a.actions.filter(x => S.multi.has(x.key)); download(`선택항목_${today()}.csv`, R.toCsv(rows, csvCols), 'text/csv;charset=utf-8'); break; }
      case 'batchFocus': startFocus([...S.multi]); S.multi.clear(); break;
      case 'batchClear': S.multi.clear(); refreshQueue(); break;
      case 'focusStart': startFocus(); break;
      case 'focusList': { const l = S.a.approval.lists[S.apTab]; startFocus(((l && l.docs) || []).map(d => `doc:${S.apTab}:${d.docId}`).filter(k => S.a.actions.some(a => a.key === k))); break; }
      case 'focusNext': focusNext(true); break;
      case 'focusSkip': if (S.focus && !S.focus.busy && leavePane()) { S.focus.results[S.focus.keys[S.focus.i]] = 'skip'; if (S.focus.i >= S.focus.keys.length - 1) finishFocus(); else { S.focus.i++; focusOpen(); } } break;
      case 'focusOpenGate': if (S.focus) { const x = S.a.actions.find(a => a.key === S.focus.keys[S.focus.i]); S.focus.gate = false; if (x) { S.pane.url = x.url; renderPane(); } } break;
      case 'menuView': openMenu('view'); break;
      case 'focusPrev': focusPrev(); break;
      case 'focusStop': stopFocus(); break;
      case 'apTab': S.apTab = v; renderMain(); break;
      case 'apMore': { const l = S.a.approval.lists[S.apTab]; const have = l.docs.length + (S.apMore[S.apTab] || []).length; try { const r = await GW.approvalPage(S.apTab, Math.floor(have / 30) + 1); S.apMore[S.apTab] = [...(S.apMore[S.apTab] || []), ...r.docs.filter(d => !l.docs.some(x => x.docId === d.docId))]; } catch (err) { toast(err.message); } renderMain(); break; }
      case 'selDoc': if (!leavePane()) break; S.sel = {type: 'doc', kind: el.dataset.kind, docId: el.dataset.id}; S.pane.url = ''; S.pane.extract = null; S.pane.preview = null; renderMain(); renderPane(); break;
      case 'reloadRouting': toast('배부·접수 이력을 읽는 중…'); await loadRouting(true); render(); break;
      case 'mailFilter': S.mailFilter = v; renderMain(); break;
      case 'mailGroup': S.mailGroup = !S.mailGroup; renderMain(); break;
      case 'selMail': if (!leavePane()) break; S.sel = {type: 'mail', box: el.dataset.box, uid: el.dataset.uid}; S.pane.url = ''; renderMain(); renderPane(); break;
      case 'selMailSearch': { if (!leavePane()) break; const it = (S.mailSearch.res && S.mailSearch.res.groups.mail.items || []).find(x => x.uid === el.dataset.uid); if (it) { S.sel = {type: 'search', item: it}; S.pane.url = ''; renderPane(); } break; }
      case 'clearMailSearch': S.mailSearch = {kw: '', res: null}; renderMain(); break;
      case 'stype': S.search.types = S.search.types.includes(v) ? S.search.types.filter(t => t !== v) : [...S.search.types, v]; renderMain(); break;
      case 'doSearch': S.search.kw = ($('#sq') || {}).value?.trim() || S.search.kw; S.search.period = ($('#speriod') || {}).value || ''; runSearch(); break;
      case 'searchMore': { const t = el.dataset.t; const s = S.search; const g = s.res.groups[t]; const page = (s.more[t] || 1) + 1; try { const r = await GW.search(s.kw, {types: [t], pageSize: 10, page, from: periodFrom(s.period)}); const add = r.groups[t].items; g.items = [...g.items, ...add]; s.more[t] = page; } catch (err) { toast(err.message); } renderMain(); break; }
      case 'selSearch': { if (!leavePane()) break; const g = S.search.res && S.search.res.groups[el.dataset.t]; const it = g && g.items.find(x => (x.docId || x.uid || x.id || x.fileId) === el.dataset.id); if (it) { S.sel = {type: 'search', item: it}; S.pane.url = ''; S.pane.extract = null; renderMain(); renderPane(); } break; }
      case 'related': S.search.kw = el.dataset.q; runSearch(['doc', 'board', 'mail', 'file']); break;
      case 'openUrl': closeOverlay(); openUrl(el.dataset.url, {title: el.dataset.title || el.textContent.trim(), unread: el.dataset.unread === '1', what: el.dataset.what || '문서'}); break;
      case 'copy': copyText(v); break;
      case 'paneExpand': S.pane.expanded = !S.pane.expanded; renderPane(); break;
      case 'closePane': if (S.focus) { stopFocus(); break; } if (!leavePane()) break; S.sel = null; S.pane.url = ''; S.pane.expanded = false; render(); break;
      case 'todoFromSel': { const t = selInfo(); const x = selectedAction(); addTodo(t.title, x && x.deadline && x.deadline.date || '', x ? x.kind : '업무센터 항목', t.url, x ? x.key : ''); break; }
      case 'todoFromExtract': { const nx = S.pane.extract && R.nextDeadline(S.pane.extract.deadlines); const t = selInfo(); if (nx) addTodo(t.title, nx.date, '원문 기한 자동 추출', t.url); break; }
      case 'boardCard': { const k = el.dataset.k; if (path.some(n => n && n.tagName === 'BUTTON')) break; if (k.startsWith('todo:')) { const t = S.todos.find(x => `todo:${x.id}` === k); if (t && t.url) { S.sel = {type: 'frame', title: t.title, url: t.url}; openUrl(t.url, {title: t.title}); } } else { go('today'); selectAction(k); } break; }
      case 'addTodo': addTodoFromInput(); break;
      case 'todoDel': { const t = S.todos.find(x => x.id === el.dataset.id); if (!t) break; pushUndo('할 일 삭제'); S.todos = S.todos.filter(x => x.id !== t.id); delete S.plan[`todo:${t.id}`]; saveLocal(); renderMain(); renderNav(); toastUndo(`"${t.title.slice(0, 20)}" 할 일을 지웠습니다.`); break; }
      case 'todoEdit': { const t = S.todos.find(x => x.id === el.dataset.id); if (!t) break; const nt = prompt('할 일 내용', t.title); if (nt === null) break; const nd = prompt('기한 (YYYY-MM-DD, 비우면 없음)', t.due || ''); pushUndo('할 일 고치기'); t.title = nt.trim() || t.title; t.due = /^\d{4}-\d{2}-\d{2}$/.test((nd || '').trim()) ? nd.trim() : ''; saveLocal(); renderMain(); break; }
      case 'calPrev': S.cal.offset--; renderMain(); break;
      case 'calNext': S.cal.offset++; renderMain(); break;
      case 'calToday': S.cal.offset = 0; renderMain(); break;
      case 'calItem': if (el.dataset.k && S.a.actions.some(x => x.key === el.dataset.k)) { go('today'); selectAction(el.dataset.k); } else if (el.dataset.url) openUrl(el.dataset.url, {title: el.textContent.trim()}); break;
      case 'loadBudget': S.budget.project = $('#bcode').value.trim(); S.budget.filter = $('#bfilter').value.trim(); if (!S.budget.project) { toast('프로젝트 코드를 입력하세요.'); break; } loadBudget(); break;
      case 'ledger': loadLedger(el.dataset.code); break;
      case 'loadMonthly': loadMonthly(); break;
      case 'budgetMonth': { const m = S.budget.month === v ? '' : v; if (!S.budget.ledger || S.budget.ledger.bgtCd !== '__ALL') { await loadLedgerAll(); } S.budget.month = m; renderMain(); break; }
      case 'ledgerAll': loadLedgerAll(); break;
      case 'budgetMonthClear': S.budget.month = ''; renderMain(); break;
      case 'ledgerRow': { if (!leavePane()) break; const r = S.budget.ledger.rows[Number(el.dataset.i)]; S.sel = {type: 'ledger', row: r}; S.pane.url = ''; renderPane(); break; }
      case 'findDocNo': findAndOpenDocNo(el.dataset.no, el.dataset.t); break;
      case 'csvBudget': { const t = S.budget.table; download(`예산_${t.project}_${today()}.csv`, R.toCsv(t.rows, [{label: '구분', key: 'level'}, {label: '코드', key: 'code'}, {label: '과목', key: 'name'}, {label: '예산', key: 'budget'}, {label: '집행', key: 'executed'}, {label: '잔액', key: 'balance'}, {label: '집행률(%)', key: 'rate'}]), 'text/csv;charset=utf-8'); break; }
      case 'richBudget': { const t = S.budget.table; const html = `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-size:10pt"><tr><th>과목</th><th>예산</th><th>집행</th><th>잔액</th><th>집행률</th></tr>${t.rows.map(r => `<tr><td>${esc(r.level)} ${esc(r.name)}</td><td align="right">${won(r.budget)}</td><td align="right">${won(r.executed)}</td><td align="right">${won(r.balance)}</td><td align="right">${pct(r.rate)}</td></tr>`).join('')}</table>`; copyRich(html, t.rows.map(r => `${r.level} ${r.name}\t${won(r.budget)}\t${won(r.executed)}\t${won(r.balance)}\t${pct(r.rate)}`).join('\n')); break; }
      case 'csvLedger': { const l = S.budget.ledger; download(`결의내역_${l.bgtCd}_${today()}.csv`, R.toCsv(l.rows, [{label: '결의일', value: r => ymd8(r.date)}, {label: '적요', key: 'desc'}, {label: '금액', key: 'amount'}, {label: '문서번호', key: 'docNo'}, {label: '작성', key: 'writer'}, {label: '전표', key: 'slip'}]), 'text/csv;charset=utf-8'); break; }
      case 'attMonth': loadAttendance(v); break;
      case 'attDay': S.att.day = S.att.day === v ? '' : v; renderMain(); break;
      case 'csvAtt': download(`근태_${S.att.month}.csv`, R.toCsv(S.att.rows, [{label: '날짜', value: r => ymd8(r.date)}, {label: '근무유형', key: 'workType'}, {label: '출결', key: 'result'}, {label: '근태항목', key: 'item'}, {label: '상태', key: 'status'}, {label: '출근', value: r => hm4(r.come)}, {label: '퇴근', value: r => hm4(r.leave)}, {label: '인정(분)', key: 'recognizedMin'}]), 'text/csv;charset=utf-8'); break;
      case 'dlBrief': download(`그룹웨어_브리핑_${today()}.html`, R.renderHtml(S.a), 'text/html;charset=utf-8'); break;
      case 'printBrief': { const w = window.open('', '_blank'); if (w) { w.document.write(R.renderHtml(S.a)); w.document.close(); setTimeout(() => w.print(), 400); } break; }
      case 'richBrief': copyRich(briefHtml(), R.renderMarkdown(S.a)); break;
      case 'csvQueue': download(`할일목록_${today()}.csv`, R.toCsv(queue(), csvCols), 'text/csv;charset=utf-8'); break;
      case 'mkWeekly': makeWeekly(); break;
      case 'cpWeekly': copyText(S.weekly); break;
      case 'richWeekly': copyRich(weeklyHtml(S.weekly), S.weekly); break;
      case 'dlWeekly': download(`주간업무실적_${today()}.txt`, S.weekly); break;
      case 'budgetRowAdd': S.settings.budget.push({project: '', filter: '', label: ''}); renderMain(); break;
      case 'budgetRowDel': S.settings.budget.splice(Number(el.dataset.i), 1); renderMain(); break;
      case 'saveSettings': {
        const st = S.settings;
        st.refreshMin = Number($('#setRefresh').value);
        st.notify = $('#setNotify').checked;
        if (st.notify && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
        st.fontSize = $('#setFs').value; st.theme = $('#setTheme').value; st.beginner = $('#setBeginner').checked;
        const rows = {};
        root.querySelectorAll('#budgetRows input').forEach(i => { (rows[i.dataset.i] = rows[i.dataset.i] || {})[i.dataset.b] = i.value.trim(); });
        st.budget = Object.values(rows).filter(b => /^[A-Za-z0-9가-힣]+$/.test(b.project || '')).map(b => ({project: b.project, filter: b.filter || '', label: b.label || ''}));
        if (!st.budget.length) st.budget = DEFAULT_SETTINGS.budget;
        st.urgentWords = $('#setWords').value.split(',').map(w => w.trim()).filter(Boolean);
        st.mailCount = Number($('#setMail').value);
        st.roles = {deptReceiver: $('#roleDept').checked, distributor: $('#roleDist').checked, sender: $('#roleSend').checked};
        saveLocal(); schedule(); applyLook(); toast('설정을 저장했습니다.'); S.budget.table = null; refresh(); break;
      }
      case 'resetDone': pushUndo('표시 초기화'); S.hidden = {}; S.snooze = {}; S.plan = {}; saveLocal(); render(); toastUndo('숨기기·미루기·보드 계획을 지웠습니다.'); break;
      case 'resetRouting': S.routing = null; store.del('routing'); toast('추천 이력을 지웠습니다.'); break;
      case 'tourAgain': S.settings.tourDone = false; saveLocal(); toggleHelp(true); break;
      case 'resetAll': if (confirm('이 브라우저에 저장된 업무센터 설정·할 일·표시를 모두 지울까요? (그룹웨어 자료는 바뀌지 않습니다)')) { for (const k of Object.keys(localStorage)) if (k.startsWith(LS) && k !== LS + 'src') localStorage.removeItem(k); S.hidden = {}; S.snooze = {}; S.plan = {}; S.todos = []; S.newKeys.clear(); S.activity = []; S.history = []; S.settings = {...DEFAULT_SETTINGS}; S.routing = null; S.forms = null; applyLook(); render(); } break;
      case 'toastUndo': undo(); root.querySelector('.toast')?.remove(); break;
      default: break;
    }
  });
  const csvCols = [{label: '우선순위', value: x => PRI[x.priority]}, {label: '점수', key: 'score'}, {label: '영역', key: 'area'}, {label: '구분', key: 'kind'}, {label: '제목', key: 'title'}, {label: '내용', key: 'detail'}, {label: '기한', value: x => x.deadline ? x.deadline.date : ''}, {label: '일시', key: 'when'}];

  // IME-safe inputs: update only the list, never rebuild the input while typing.
  root.addEventListener('input', e => {
    const t = e.composedPath()[0];
    if (t.id === 'qfilter') { S.filter.q = t.value; if (!e.isComposing) refreshQueue(); }
    else if (t.id === 'bq') { S.budget.q = t.value; }
    else if (t.id === 'weekly') { S.weekly = t.value; store.set('weekly', S.weekly); const w = $('#wkSaved'); if (w) { w.classList.add('on'); } }
    else if (t.id === 'palq') palRender(t.value);
  });
  root.addEventListener('compositionend', e => { const t = e.composedPath()[0]; if (t.id === 'qfilter') { S.filter.q = t.value; refreshQueue(); } });
  root.addEventListener('change', e => {
    const t = e.composedPath()[0];
    if (t.id === 'bproj' && t.value === '__custom') { S.budget.custom = true; renderMain(); }
    if (t.id === 'bproj' && t.value !== '__custom') { S.budget.custom = false; const [p, f] = t.value.split('|'); S.budget.project = p; S.budget.filter = f; loadBudget(); }
    if (t.id === 'bq') renderMain();
    if (t.classList && t.classList.contains('setc')) saveSettingField(t);
    if (t.dataset && t.dataset.b) saveBudgetRows();
  });
  root.addEventListener('keyup', e => { const t = e.composedPath()[0]; if (t.id === 'bq' && !e.isComposing && e.key === 'Enter') renderMain(); });
  // Drag & drop: board columns and calendar dates.
  root.addEventListener('dragstart', e => { const n = e.composedPath().find(x => x && x.dataset && x.dataset.drag); if (n) { e.dataTransfer.setData('text/plain', n.dataset.drag); e.dataTransfer.effectAllowed = 'move'; } });
  root.addEventListener('dragover', e => { const z = e.composedPath().find(x => x && x.dataset && (x.dataset.drop || x.dataset.dropDate)); if (z) { e.preventDefault(); z.classList.add('drop'); } });
  root.addEventListener('dragleave', e => { const z = e.composedPath().find(x => x && x.dataset && (x.dataset.drop || x.dataset.dropDate)); if (z) z.classList.remove('drop'); });
  root.addEventListener('drop', e => {
    const z = e.composedPath().find(x => x && x.dataset && (x.dataset.drop || x.dataset.dropDate));
    if (!z) return;
    e.preventDefault(); z.classList.remove('drop');
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    if (z.dataset.drop) dropTo(id, z.dataset.drop);
    else if (z.dataset.dropDate && id.startsWith('todo:')) { const t = S.todos.find(x => `todo:${x.id}` === id); if (t) { pushUndo('기한 변경'); t.due = z.dataset.dropDate; delete S.plan[id]; saveLocal(); renderMain(); toastUndo(`기한을 ${t.due.slice(5)}로 바꿨습니다.`); } }
  });
  // Resizable pane.
  const split = $('#split');
  split.addEventListener('mousedown', e => {
    e.preventDefault(); split.classList.add('drag');
    const shield = document.createElement('div'); shield.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:col-resize'; document.body.append(shield);
    const move = ev => { S.settings.paneWidth = Math.max(360, Math.min(window.innerWidth * 0.75, window.innerWidth - ev.clientX)); applyLook(); };
    const up = () => { split.classList.remove('drag'); shield.remove(); document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true); saveLocal(); };
    document.addEventListener('mousemove', move, true); document.addEventListener('mouseup', up, true);
  });

  let toastTimer = null;
  function toast(msg, withUndo = false) {
    let t = root.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; wcEl.append(t); }
    t.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button data-act="toastUndo">되돌리기</button>' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), withUndo ? 6000 : 3800);
  }
  const toastUndo = msg => toast(msg, true);

  // ---------- lifecycle ----------
  let prevTitle = document.title;
  // Browser Back button: step back inside the work center (pane → list → groupware) instead of leaving the page.
  let backArmed = false;
  const armBack = () => { if (!backArmed) { try { history.pushState({bwyfgwWc: 1}, '', location.href); backArmed = true; } catch {} } };
  const onPop = () => {
    if (!backArmed || !S.open) return;
    backArmed = false;
    if (S.helpOpen || S.paletteOpen || S.menuOpen) { closeOverlay(); armBack(); return; }
    if (S.focus || S.pane.url || S.sel) { if (S.focus) stopFocus(); else if (leavePane()) { S.sel = null; S.pane.url = ''; S.pane.expanded = false; render(); } armBack(); return; }
    if (S.view !== 'today') { go('today'); armBack(); return; }
    if (S.pane.dirty && !leavePane()) { armBack(); return; }
    close();
  };
  window.addEventListener('popstate', onPop);
  function open() {
    tipBubble.style.display = 'none';
    S.open = true; host.style.display = 'block'; fab.style.display = 'none'; prevTitle = document.title;
    armBack();
    applyLook(); render();
    if (document.activeElement && document.activeElement !== document.body) { try { document.activeElement.blur(); } catch {} }
    if (!S.a || !S.lastRefresh || Date.now() - S.lastRefresh.getTime() > 60_000) refresh();
    if (!S.settings.tourDone) setTimeout(() => startCoach(), 900);
  }
  function close() { if (backArmed) { backArmed = false; try { history.back(); } catch {} } S.open = false; host.style.display = 'none'; fab.style.display = 'block';
    if (!S.settings.fabTipShown || (S.settings.fabTipCount || 0) < 3) { S.settings.fabTipCount = (S.settings.fabTipCount || 0) + 1; S.settings.fabTipShown = true; saveLocal(); tipBubble.style.display = 'block'; clearTimeout(tipTimer); tipTimer = setTimeout(() => { tipBubble.style.display = 'none'; }, 6000); } document.title = prevTitle; closeOverlay(); }
  function destroy() { clearInterval(timer); document.removeEventListener('keydown', onDocKey, true); window.removeEventListener('resize', onResize); window.removeEventListener('popstate', onPop); host.remove(); fab.remove(); tipBubble.remove(); }
  schedule();
  return {open, close, destroy, refresh,
    state: () => ({booted: true, open: S.open, view: S.view, loading: S.loading, error: S.error, actions: S.a ? S.a.actions.length : 0, high: S.a ? S.a.summary.high : 0, focus: S.focus ? {i: S.focus.i, n: S.focus.keys.length} : null, lastRefresh: S.lastRefresh}),
    debug: () => ({view: S.view, sel: S.sel, paneUrl: S.pane.url, mounted: S.pane.mounted, multi: [...S.multi], todos: S.todos.length, plan: Object.keys(S.plan).length, hidden: Object.keys(S.hidden).length, undo: S.undo.length})};
  }
})();
