// GW 통합 업무센터 · storage
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- storage ----------
  const LS = 'bwyfgw:wc:';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(LS + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(LS + k); } catch {} },
  };
  const DEFAULT_SETTINGS = {refreshMin: 5, notify: false, budget: [{project: 'A201', label: '젠더유스 거버넌스운영', filter: '노121'}], urgentWords: [], mailCount: 100, days: 14, fontSize: 'm', theme: 'light', paneWidth: 560, beginner: true, tourDone: false};
  const migrateTodos = list => (Array.isArray(list) ? list : []).map(t => ({id: t.id || `t${t.at || Date.now()}${Math.random().toString(36).slice(2, 6)}`, title: t.title, due: t.due || '', status: t.status || (t.done ? 'done' : 'todo'), source: t.source || '', url: t.url || '', at: t.at || Date.now()}));
  const S = {
    settings: {...DEFAULT_SETTINGS, ...store.get('settings', {})},
    hidden: store.get('hidden', store.get('done', {})), snooze: store.get('snooze', {}), plan: store.get('plan', {}),
    todos: migrateTodos(store.get('todos', [])), newKeys: new Set(store.get('newKeys', [])), activity: store.get('activity', []), seenActivity: store.get('seenActivity', 0),
    history: store.get('history', []), routing: store.get('routing', null), forms: store.get('forms', null),
    raw: null, a: null, view: 'today', loading: false, error: '', lastRefresh: null, pendingRefresh: false,
    filter: {area: 'all', level: 'all', q: '', onlyNew: false, showHidden: false}, multi: new Set(), lastClickKey: '',
    apTab: 'pending', apMore: {}, mailFilter: 'all', mailGroup: false,
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

