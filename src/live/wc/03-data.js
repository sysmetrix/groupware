// GW 비서 · data
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- data ----------
  async function refresh({silent = false, announce = false} = {}) {
    if (S.loading) { if (announce) toast('이미 읽는 중입니다…'); return; }
    S.loading = true; S.error = '';
    if (!silent) renderHead();
    try {
      const raw = await GW.collect({budget: S.settings.budget, mailCount: S.settings.mailCount, days: S.settings.days});
      ingest(raw);
      loadForms();
    } catch (e) { S.error = e && e.message || String(e); logError('자료 읽기', S.error); }
    finally { S.loading = false; }
    if (announce) {
      const bad = S.raw && S.raw.status ? Object.entries(S.raw.status).filter(([, s]) => s && s.error).map(([k]) => k) : [];
      toast(S.error ? '새로 고치지 못했습니다: ' + S.error : `최신 자료로 새로 고쳤습니다 · 내 할 일 ${mineVisible().length}건${bad.length ? ` · 읽지 못한 영역: ${bad.join(', ')}` : ''}`);
    }
    if (silent && isUserBusy()) { S.pendingRefresh = true; renderHead(); renderBand(); renderNav(); return; }
    render(); renderHead();
  }
  // 자주 쓰는 결재 양식(팔레트의 "새 기안: 양식")을 하루 한 번 읽는다.
  function loadForms() {
    if (S.forms && S.forms.list && Date.now() - (S.forms.at || 0) < 864e5) return;
    if (typeof GW.frequentForms !== 'function') return;
    const owner = currentKey;
    GW.frequentForms().then(l => { if (owner !== currentKey) return; const list = Array.isArray(l) ? l : (l && l.list) || []; S.forms = {list, at: Date.now()}; if (!store.set('forms', S.forms)) S.storageError = true; }).catch(() => {});
  }
  function logError(where, msg) { S.errors = [...(S.errors || []), {at: Date.now(), where, msg: String(msg).slice(0, 300)}].slice(-30); store.set('errors', S.errors); }
  function ingest(raw) {
    if (raw && raw.principal && (raw.principal.empSeq || raw.principal.loginId)) {
      const pKey = String(raw.principal.empSeq || raw.principal.loginId).replace(/[^0-9A-Za-z_-]/g, '');
      if (switchUserStorage(pKey)) {
        // user switched, clear current view state
        S.sel = null; S.pane.url = ''; S.pane.expanded = false; S.multi.clear();
      }
    }
    syncLocal();
    S.apMore = {}; S.apPages = {}; S.apBusy = {}; S.apEpoch++;
    const prev = store.get('state', null);
    const usablePrev = prev && prev.at && Date.parse(prev.at) < Date.parse(raw.collectedAt) ? prev : null;
    const a = R.analyze(raw, usablePrev, new Date(), {roles: S.settings.roles});
    applyUrgentWords(a);
    const fresh = a.actions.filter(x => x.isNew);
    for (const x of fresh) { S.newKeys.add(x.key); S.activity.push({at: Date.now(), key: x.key, title: x.title, kind: x.kind, area: x.area, priority: x.priority}); }
    if (!raw.sessionExpired) { if (!store.set('state', R.nextState(raw, usablePrev))) S.storageError = true; }
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
  const ST_RANK = {overdue: 0, urgent: 1, todo: 2, check: 3, confirm: 4, wait: 5, info: 6};
  function sortActions(a) { a.actions.sort((p, q) => (ST_RANK[p.state] ?? 2) - (ST_RANK[q.state] ?? 2) || q.score - p.score); }
  function notifyNew(items) {
    if (!items.length) return;
    toast(`새 긴급 항목 ${items.length}건: ${items[0].title.slice(0, 40)}`);
    if (S.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('GW 비서 · 새 긴급 항목 ' + items.length + '건', {body: items.slice(0, 3).map(x => `[${x.kind}] ${x.title}`).join('\n'), tag: 'bwyfgw-wc'}); } catch {}
    }
  }
  // 배부·접수 이력: 진행 중 요청은 하나만, 실패하면 1분 동안 자동 재시도하지 않는다(무한 재조회·재렌더링 방지).
  let routingP = null, routingFailAt = 0;
  const routingBusy = () => !!routingP;
  const routingFailedRecently = () => routingFailAt && Date.now() - routingFailAt < 60_000;
  async function loadRouting(force = false) {
    const fresh = S.routing && S.routing.fetchedAt && Date.now() - Date.parse(S.routing.fetchedAt) < 12 * 3600_000;
    if (fresh && !force) return S.routing;
    if (routingP) return routingP;
    if (!force && routingFailedRecently()) return S.routing;
    const owner = currentKey;
    routingP = (async () => {
      try {
        const rows = await GW.routingHistory({days: 180, size: 500});
        if (owner !== currentKey) return null;
        const slim = r => ({title: String(r.title || '').slice(0, 100), sendOrg: r.sendOrg || '', sendDept: r.sendDept || '', sendDeptCode: r.sendDeptCode || '', toDept: r.toDept || '', toEmp: r.toEmp || '', date: String(r.date || '').slice(0, 16)});
        S.routing = {from: rows.from, to: rows.to, fetchedAt: rows.fetchedAt, dist: (rows.dist || []).map(slim), dept: (rows.dept || []).map(slim)};
        if (!store.set('routing', S.routing)) S.storageError = true;
        routingFailAt = 0;
      } catch (e) { if (owner !== currentKey) return null; routingFailAt = Date.now(); toast('배부·접수 이력을 읽지 못했습니다: ' + e.message); }
      return S.routing;
    })();
    try { return await routingP; } finally { routingP = null; }
  }
  const previewCache = new Map();
  async function loadPreview(doc) {
    const k = doc.docNo || doc.title;
    if (previewCache.has(k)) return previewCache.get(k);
    if (previewCache.size >= 50) previewCache.delete(previewCache.keys().next().value);
    const p = GW.docPreview({docNo: doc.docNo, title: doc.title}).catch(() => ({found: false}));
    previewCache.set(k, p);
    return p;
  }
  const isUserBusy = () => {
    const ae = root.activeElement;
    if (ae && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName) && ae.id !== 'gsearch' && !(ae.id === 'chInput' && S.view === 'home')) return true; // 홈의 채팅 입력은 부분 갱신으로 지켜지므로 바쁜 것으로 보지 않는다
    return !!S.focus || S.paletteOpen;
  };

