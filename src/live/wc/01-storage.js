// GW 비서 · storage
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- storage (per-user isolation) ----------
  function getUserKey() {
    try {
      const u = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const uc = u && u.ucUserInfo ? (typeof u.ucUserInfo === 'string' ? JSON.parse(u.ucUserInfo) : u.ucUserInfo) : null;
      if (uc && (uc.empSeq || uc.loginId)) return String(uc.empSeq || uc.loginId).replace(/[^0-9A-Za-z_-]/g, '');
    } catch {}
    return 'default';
  }
  let currentKey = getUserKey();
  const getPrefix = () => 'bwyfgw:wc:' + currentKey + ':';
  const LS = getPrefix();

  const IDB_KEYS = new Set(['patterns', 'routing']);
  const idbMem = new Map();
  let idbDb = null, idbStarted = false;
  function idbOpen() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (idbDb) return Promise.resolve(idbDb);
    return new Promise(res => {
      try {
        const req = indexedDB.open('bwyfgw_db', 1);
        req.onupgradeneeded = () => { try { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); } catch {} };
        req.onsuccess = () => { idbDb = req.result; res(idbDb); };
        req.onerror = () => res(null);
      } catch { res(null); }
    });
  }
  function idbPut(fk, val) {
    idbMem.set(fk, val);
    idbOpen().then(db => {
      if (!db) return;
      try { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, fk); } catch {}
    });
  }
  function idbDel(fk) {
    idbMem.delete(fk);
    idbOpen().then(db => {
      if (!db) return;
      try { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(fk); } catch {}
    });
  }
  function idbInit() {
    if (idbStarted || typeof indexedDB === 'undefined') return;
    idbStarted = true;
    idbOpen().then(db => {
      if (!db) return;
      try {
        const p = getPrefix();
        for (const k of IDB_KEYS) {
          const fk = p + k;
          const lsRaw = localStorage.getItem(fk);
          const tx = db.transaction('kv', 'readonly');
          const rq = tx.objectStore('kv').get(fk);
          rq.onsuccess = () => {
            if (rq.result !== undefined) {
              idbMem.set(fk, rq.result);
              if (k === 'routing' && !S.routing) S.routing = rq.result;
              if (lsRaw !== null) try { localStorage.removeItem(fk); } catch {}
            } else if (lsRaw !== null) {
              try { const parsed = JSON.parse(lsRaw); idbPut(fk, parsed); localStorage.removeItem(fk); } catch {}
            }
          };
        }
      } catch {}
    });
  }
  idbInit();

  const store = {
    get(k, d) {
      try {
        const p = getPrefix();
        if (IDB_KEYS.has(k) && idbMem.has(p + k)) return idbMem.get(p + k);
        let v = localStorage.getItem(p + k);
        // Legacy migration: if per-user storage is empty, check legacy global key for 'default' or initial run
        if (v === null && currentKey !== 'default') {
          const old = localStorage.getItem('bwyfgw:wc:' + k);
          const owner = localStorage.getItem('bwyfgw:wc:migrated:' + k); // 이미 다른 사용자가 가져간 자료는 넘겨받지 않는다
          if (old !== null && (!owner || owner === currentKey)) {
            v = old;
            localStorage.setItem(p + k, old);
            localStorage.setItem('bwyfgw:wc:migrated:' + k, currentKey);
            try { localStorage.removeItem('bwyfgw:wc:' + k); } catch {}
          }
        }
        if (v === null) return d;
        const parsed = JSON.parse(v);
        if (IDB_KEYS.has(k) && typeof indexedDB !== 'undefined') { idbPut(p + k, parsed); try { localStorage.removeItem(p + k); } catch {} }
        return parsed;
      } catch { return d; }
    },
    set(k, v) {
      if (currentKey === 'default') return false;
      if (IDB_KEYS.has(k) && typeof indexedDB !== 'undefined') {
        idbPut(getPrefix() + k, v);
        try { localStorage.removeItem(getPrefix() + k); } catch {}
        return true;
      }
      const raw = JSON.stringify(v);
      try { localStorage.setItem(getPrefix() + k, raw); return true; } catch {
        if (pruneStorageForQuota(k)) {
          try { localStorage.setItem(getPrefix() + k, raw); return true; } catch {}
        }
        return false;
      }
    },
    del(k) {
      if (IDB_KEYS.has(k)) idbDel(getPrefix() + k);
      try { localStorage.removeItem(getPrefix() + k); } catch {}
    },
  };
  function pruneStorageForQuota(excludeKey) {
    let freed = false;
    const p = getPrefix();
    for (const k of ['routing', 'forms', 'gsyncExisting', 'chatModels', 'chatCool', 'chatHist']) {
      if (k === excludeKey) continue;
      if (localStorage.getItem(p + k) !== null) { try { localStorage.removeItem(p + k); freed = true; } catch {} }
    }
    if (excludeKey !== 'patterns') {
      try {
        const pr = localStorage.getItem(p + 'patterns');
        if (pr && pr.length > 40000) {
          const pat = JSON.parse(pr);
          if (pat && pat.docs) {
            const entries = Object.entries(pat.docs).sort((a, b) => (b[1].learnedAt || b[1].at || 0) - (a[1].learnedAt || a[1].at || 0)).slice(0, 60);
            for (const [, doc] of entries) if (doc.body && doc.body.length > 2000) doc.body = doc.body.slice(0, 2000);
            localStorage.setItem(p + 'patterns', JSON.stringify({...pat, docs: Object.fromEntries(entries)}));
            freed = true;
          }
        }
      } catch {}
    }
    return freed;
  }
  function cleanupLegacyStorage() {
    if (currentKey === 'default') return;
    const p = getPrefix();
    for (const k of ['settings', 'state', 'done', 'snooze', 'hidden', 'todos', 'weekly', 'plan', 'newKeys', 'activity', 'seenActivity', 'history', 'routing']) {
      try {
        const legacyKey = 'bwyfgw:wc:' + k;
        const old = localStorage.getItem(legacyKey);
        if (old === null) continue;
        const owner = localStorage.getItem('bwyfgw:wc:migrated:' + k);
        if (localStorage.getItem(p + k) === null && (!owner || owner === currentKey)) {
          localStorage.setItem(p + k, old);
          localStorage.setItem('bwyfgw:wc:migrated:' + k, currentKey);
        }
        if (localStorage.getItem(p + k) !== null || (owner && owner === currentKey)) localStorage.removeItem(legacyKey);
      } catch {}
    }
    try { if (localStorage.getItem('bwyfgw:state') !== null) localStorage.removeItem('bwyfgw:state'); } catch {}
  }
  cleanupLegacyStorage();
  function switchUserStorage(newEmpKey) {
    if (!newEmpKey || newEmpKey === currentKey) return false;
    currentKey = newEmpKey;
    reloadUserState();
    clearUserViews();
    localBaseline = localValues();
    return true;
  }
  const DEFAULT_SETTINGS = {refreshMin: 5, notify: false, budget: [], urgentWords: [], mailCount: 100, days: 14, fontSize: 'm', theme: 'light', paneWidth: 560, beginner: true, tourDone: false, singleKeyShortcuts: true};
  const migrateTodos = list => (Array.isArray(list) ? list : []).map((t, i) => ({id: t.id || `t${t.at || 0}_${i}`, title: t.title, due: t.due || '', status: t.status || (t.done ? 'done' : 'todo'), source: t.source || '', key: t.key || '', url: t.url || '', at: t.at || Date.now()}));
  const S = {
    userKey: currentKey,
    settings: {...DEFAULT_SETTINGS, budget: [], ...store.get('settings', {})},
    hidden: store.get('hidden', store.get('done', {})), snooze: store.get('snooze', {}), plan: store.get('plan', {}),
    todos: migrateTodos(store.get('todos', [])), newKeys: new Set(store.get('newKeys', [])), activity: store.get('activity', []), seenActivity: store.get('seenActivity', 0),
    history: store.get('history', []), routing: store.get('routing', null), forms: store.get('forms', null),
    raw: null, a: null, view: 'home', loading: false, error: '', lastRefresh: null, pendingRefresh: false,
    filter: {area: 'all', level: 'all', q: '', onlyNew: false, showHidden: false}, multi: new Set(), lastClickKey: '',
    apTab: 'pending', apMore: {}, apPages: {}, apBusy: {}, apEpoch: 0, mailFilter: 'all', mailGroup: false,
    sel: null, pane: {url: '', mounted: '', expanded: false, extract: null, preview: null},
    focus: null,
    search: {kw: '', types: ['doc', 'mail', 'board', 'file', 'person'], period: '', res: null, busy: false, more: {}}, mailSearch: {kw: '', res: null},
    budget: {project: '', filter: '', table: null, ledger: null, monthly: null, month: '', busy: false, q: '', seq: 0},
    att: {month: '', rows: null, busy: false, seq: 0, day: ''}, cal: {offset: 0},
    weekly: store.get('weekly', ''), errors: store.get('errors', []), undo: [], open: false, paletteOpen: false, helpOpen: false, menuOpen: '',
  };
  function reloadUserState() {
    S.userKey = currentKey;
    S.settings = {...DEFAULT_SETTINGS, budget: [], ...store.get('settings', {})};
    S.aiHist = [];
    S.hidden = store.get('hidden', store.get('done', {}));
    S.snooze = store.get('snooze', {});
    S.plan = store.get('plan', {});
    S.todos = migrateTodos(store.get('todos', []));
    S.newKeys = new Set(store.get('newKeys', []));
    S.activity = store.get('activity', []);
    S.seenActivity = store.get('seenActivity', 0);
    S.history = store.get('history', []);
    S.routing = store.get('routing', null);
    S.forms = store.get('forms', null);
    S.weekly = store.get('weekly', '');
    S.errors = store.get('errors', []);
  }
  function clearUserViews() {
    S.apMore = {}; S.apPages = {}; S.apBusy = {}; S.apEpoch++;
    S.sel = null; S.pane = {url: '', mounted: '', expanded: false, extract: null, preview: null};
    S.focus = null; S.multi.clear(); S.undo = []; S.raw = null; S.a = null;
    previewCache.clear(); routingFailAt = 0; S.mailDet = {}; S.mailDetBusy = {}; S.bodyOpen = false;
    S.search = {kw: '', types: ['doc', 'mail', 'board', 'file', 'person'], period: '', res: null, busy: false, more: {}};
    S.mailSearch = {kw: '', res: null}; S.team = {}; S.appsC = null; S.chat = null; S.res = null; S.expBar = null; S.aiHist = [];
    S.att = {month: '', rows: null, busy: false, seq: (S.att?.seq || 0) + 1, day: ''};
    S.budget = {project: '', filter: '', table: null, ledger: null, monthly: null, month: '', busy: false, q: '', seq: (S.budget?.seq || 0) + 1};
    if (typeof $ === 'function') { const frame = $('#frame'); if (frame) frame.replaceChildren(); const overlay = $('#overlay'); if (overlay) overlay.replaceChildren(); }
    S.paletteOpen = false; S.helpOpen = false; S.menuOpen = '';
  }
  const localValues = () => JSON.parse(JSON.stringify({hidden: S.hidden, snooze: S.snooze, plan: S.plan, todos: S.todos, settings: S.settings, newKeys: [...S.newKeys], activity: S.activity.slice(-150), seenActivity: S.seenActivity, history: S.history.slice(-40), weekly: S.weekly}));
  const localEmpty = {hidden: {}, snooze: {}, plan: {}, todos: [], settings: {...DEFAULT_SETTINGS, budget: []}, newKeys: [], activity: [], seenActivity: 0, history: [], weekly: ''};
  let localBaseline = localValues();
  const sameLocal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function mergeLocal(base, local, remote) {
    if (sameLocal(local, base)) return remote;
    if (sameLocal(remote, base) || sameLocal(local, remote)) return local;
    if (Array.isArray(local) && Array.isArray(remote) && Array.isArray(base)) {
      const id = x => x && typeof x === 'object' ? x.id || x.key || x.date || (x.at && String(x.at)) : String(x);
      if ([...base, ...local, ...remote].every(x => id(x))) {
        const bm = new Map(base.map(x => [id(x), x])), lm = new Map(local.map(x => [id(x), x])), rm = new Map(remote.map(x => [id(x), x]));
        return [...new Set([...lm.keys(), ...rm.keys()])].flatMap(k => {
          if (bm.has(k) && (!lm.has(k) || !rm.has(k))) return [];
          return [mergeLocal(bm.get(k), lm.get(k), rm.get(k))];
        }).filter(x => x !== undefined);
      }
    }
    if (base && local && remote && !Array.isArray(local) && typeof local === 'object' && typeof remote === 'object') {
      const out = {};
      for (const k of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
        if (k in base && (!(k in local) || !(k in remote))) continue;
        const v = mergeLocal(base[k], local[k], remote[k]); if (v !== undefined) out[k] = v;
      }
      return out;
    }
    return local;
  }
  // Stored values read with the same clean-up as startup (defaults merged into settings, legacy 'done' marks, stable to-do ids).
  function loadLocal(k) {
    if (k === 'settings') return {...DEFAULT_SETTINGS, budget: [], ...store.get('settings', {})};
    if (k === 'hidden') return store.get('hidden', store.get('done', {}));
    if (k === 'todos') return migrateTodos(store.get('todos', []));
    return store.get(k, localEmpty[k]);
  }
  // Merges this tab's changes with what other tabs stored. A key that cannot be saved stays pending (its baseline is kept),
  // and the other keys are still written. Returns true only when everything was saved.
  function syncLocal(write = false) {
    const local = localValues(), next = {}, remote = {}, failed = new Set();
    for (const k of Object.keys(local)) {
      remote[k] = loadLocal(k);
      next[k] = mergeLocal(localBaseline[k], local[k], remote[k]);
      if (k === 'weekly' && local[k] !== localBaseline[k] && remote[k] !== localBaseline[k] && local[k] !== remote[k] && remote[k]) {
        if (!store.set('weeklyRecovery', {at: Date.now(), text: remote[k]}) && write) { failed.add(k); next[k] = local[k]; continue; } // never replace the other draft unless a copy is kept
      }
      if (write && !sameLocal(next[k], remote[k]) && !store.set(k, next[k])) failed.add(k);
    }
    Object.assign(S, next, {newKeys: new Set(next.newKeys)});
    const fresh = localValues();
    localBaseline = write ? Object.fromEntries(Object.keys(fresh).map(k => [k, failed.has(k) ? localBaseline[k] : fresh[k]])) : JSON.parse(JSON.stringify(remote));
    if (write) {
      S.storageError = failed.size > 0;
      if (failed.size && typeof toast === 'function') toast('브라우저에 저장하지 못한 항목이 있습니다. 자료를 복사한 뒤 저장 공간·브라우저 설정을 확인하세요.');
    }
    return failed.size === 0;
  }
  const bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('bwyfgw-wc-sync') : null;
  if (bc) bc.onmessage = ev => {
    const msg = ev && ev.data;
    if (!msg || msg.user !== currentKey) return;
    if (msg.type === 'sync') onStorage({key: getPrefix() + 'state'});
  };
  const saveLocal = () => { const ok = syncLocal(true); if (ok && bc) try { bc.postMessage({type: 'sync', user: currentKey}); } catch {} return ok; };
  let storageTimer = null;
  const onStorage = e => {
    if (e.key !== null && !e.key.startsWith(getPrefix())) return;
    if (getUserKey() !== currentKey) return;
    const before = JSON.stringify(localValues());
    syncLocal();
    if (JSON.stringify(localValues()) !== before) S.undo = []; // 되돌리기 기록은 다른 탭의 변경을 지울 수 있다
    if (S.open && !isUserBusy()) {
      if (typeof setTimeout === 'function') {
        clearTimeout(storageTimer);
        storageTimer = setTimeout(() => { if (S.raw) reanalyze(); render(); }, 200);
      } else { if (S.raw) reanalyze(); render(); }
    } else S.pendingRefresh = true;
  };
  window.addEventListener('storage', onStorage);

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

