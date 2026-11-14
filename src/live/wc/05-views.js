// GW 비서 · views
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- views ----------
  const VIEWS = [
    {id: 'home', label: '홈'}, {id: 'today', label: '할 일'}, {id: 'approval', label: '결재·문서유통'}, {id: 'mail', label: '메일'}, {id: 'calendar', label: '일정·예약'}, {id: 'attendance', label: '근태·연차'}, {id: 'search', label: '검색·문서'},
    {id: 'budget', label: '예산 집행'}, {id: 'report', label: '보고·현황'}, {id: 'settings', label: '설정'},
    {id: 'board', label: '할 일 보드'}, {id: 'resource', label: '자원 예약'}, {id: 'gcal', label: '구글 일정'}, {id: 'gsync', label: '구글 동기화'}, {id: 'docs', label: '문서 찾기'}, {id: 'overview', label: '현황 차트'},
  ];
  // 메뉴에 따로 두지 않고 상위 화면 안의 탭으로 들어가는 화면(기능은 그대로, 메뉴만 합침).
  const VIEW_PARENT = {board: 'today', resource: 'calendar', gcal: 'calendar', gsync: 'calendar', docs: 'search', overview: 'report'};
  const navView = () => VIEW_PARENT[S.view] || S.view;
  function viewTabs() {
    const tab = (id, label, n) => `<button role="tab" aria-selected="${S.view === id}" class="${S.view === id ? 'on' : ''}" data-act="view" data-v="${id}">${label}${n ? `<span class="c">${n}</span>` : ''}</button>`;
    const p = navView();
    if (p === 'today') return `<div class="vtabs"><div class="seg" role="tablist" aria-label="할 일 보기 방식">${tab('today', '목록')}${tab('board', '보드', boardCount())}</div></div>`;
    if (p === 'calendar') return `<div class="vtabs"><div class="seg" role="tablist" aria-label="일정 및 예약">${tab('calendar', '그룹웨어 일정')}${allowed('resource') ? tab('resource', '자원 예약') : ''}${allowed('googleCalendar') ? tab('gcal', '구글 일정') + tab('gsync', '구글 동기화') : ''}</div></div>`;
    if (p === 'search') return `<div class="vtabs"><div class="seg" role="tablist" aria-label="검색 방식">${tab('search', '통합검색')}${tab('docs', '문서 찾기 (기안·접수·발송)')}</div></div>`;
    if (p === 'report') return `<div class="vtabs"><div class="seg" role="tablist" aria-label="보고 및 현황">${tab('report', '보고서')}${tab('overview', '현황 차트')}</div></div>`;
    return '';
  }
  // Charts: shown on big screens, folded on laptops unless the user chose otherwise.
  const showCharts = () => S.settings.showCharts ?? (window.innerHeight >= 860 && window.innerWidth >= 1500);
  const go = v => { if (S.view !== v && !S.focus) { if (!leavePane()) return false; S.sel = null; S.pane.url = ''; } if (S.view !== v) S.apTabPinned = false; S.view = v; S.multi.clear(); S.pane.expanded = false; render(); const mm = $('#main'); if (mm) mm.scrollTop = 0; return true; };
  // Home: back to a clean "오늘 할 일" (asks first if something is being typed in the pane).
  function goHome() {
    if (S.focus) { stopFocus(); if (S.focus) return; }
    if (!leavePane()) return;
    closeOverlay();
    S.sel = null; S.pane.url = ''; S.pane.expanded = false; S.multi.clear();
    S.filter = {...S.filter, area: 'all', level: 'all', onlyNew: false, q: '', showHidden: false};
    S.view = 'home';
    render();
    const mm = $('#main'); if (mm) mm.scrollTop = 0;
  }
  // Hidden items come back after 24h if the groupware still lists them (숨겼지만 아직 남음).
  const resurfaced = k => isHidden(k) && Date.now() - S.hidden[k] > (k.startsWith('att:') ? 3 : 1) * 86400_000;
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
  const STATE_ORDER = ['overdue', 'urgent', 'todo', 'check', 'confirm', 'wait', 'info'];
  const STATE_NAME = {overdue: '기한 지남', urgent: '급함', todo: '할 일', check: '확인 필요', confirm: '끝났는지 확인', wait: '기다리는 중', info: '참고'};
  const STATE_GROUP = {overdue: '급한 일', urgent: '급한 일', todo: '할 일', check: '확인이 필요한 일', confirm: '끝났는지만 확인', wait: '결재를 기다리는 중 (할 일 없음)', info: '참고'};
  const stateOf = x => x.state || (x.scope === 'ref' ? 'info' : x.priority === 'high' ? 'urgent' : 'todo');
  const isMine = x => x.scope !== 'ref';
  const mineVisible = () => visibleActions().filter(x => isMine(x) && stateOf(x) !== 'wait');
  function renderHead() {
    const m = $('#meta');
    if (!m) return;
    const age = S.lastRefresh ? Math.floor((Date.now() - S.lastRefresh.getTime()) / 60000) : null;
    m.className = 'stat' + (age !== null && age >= 10 ? ' stale' : '');
    m.innerHTML = S.loading ? '<span class="spin"></span> 읽는 중' : S.lastRefresh ? `${ic('refresh')}${hhmm(S.lastRefresh)} 기준${age ? ` · ${age}분 전` : ''}` : `${ic('refresh')}새로고침`;
    // 기관명: 관리자 정책 > 로그인한 사용자의 소속 기관 > 기본 문구
    try { const on = $('#orgName'), nm = POLICY.orgName || (S.raw && S.raw.principal && S.raw.principal.compName) || ''; if (on && nm) on.textContent = nm; } catch {}
    const unseen = S.activity.filter(x => x.at > S.seenActivity).length;
    $('#bell').innerHTML = `${ic('bell')}${unseen ? `<span class="dot">${unseen > 99 ? '99+' : unseen}</span>` : ''}`;
    const urgent = S.a ? mineVisible().filter(x => ['overdue', 'urgent'].includes(stateOf(x))).length : 0;
    const total = S.a ? mineVisible().length : 0;
    { const st = !S.a ? 'idle' : urgent ? 'urgent' : total ? 'todo' : 'ok'; const sum = !S.a ? '불러오는 중' : urgent ? `급한 일 ${urgent}건 · 전체 ${total}건` : total ? `처리할 일 ${total}건` : '오늘 처리할 일 없음'; fab.dataset.st = st;
      fab.innerHTML = `<span class="lg">${brandImage}</span><span class="t">GW 비서</span><span class="v" title="설치된 버전">v${esc(VERSION)}</span><span class="sm">${sum}</span>${S.a ? `<span class="b">${urgent || total || '✓'}</span>` : ''}<kbd>Alt G</kbd>`; }
  }
  // 설치된 버전과 갱신 상태(왼쪽 메뉴 아래 · 접힌 런처 버튼).
  function versionInfo() {
    const up = store.get('updateInfo', null);
    const known = !!(up && /^\d+\.\d+\.\d+$/.test(up.latest || ''));
    const newer = known && R.compareVersions(up.latest, VERSION) > 0;
    const state = !allowed('updateCheck') ? 'off' : newer ? 'new' : known ? 'ok' : 'unknown';
    const label = {new: `새 버전 v${up && up.latest} 있음`, ok: '최신', unknown: '최신 여부 확인 전', off: ''}[state];
    const at = S.settings.verAt && S.settings.verOf === VERSION ? new Date(S.settings.verAt) : null;
    const pad = n => String(n).padStart(2, '0');
    const applied = at ? `${at.getMonth() + 1}/${at.getDate()} ${pad(at.getHours())}:${pad(at.getMinutes())}` : '';
    const checked = up && up.at ? hhmm(new Date(up.at)) : '';
    const from = S.settings.verFrom && S.settings.verOf === VERSION ? S.settings.verFrom : '';
    return {state, label, applied, checked, from, latest: known ? up.latest : ''};
  }
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
  const VIEW_ICON = {docs: 'search', home: 'home', today: 'inbox', overview: 'chart', approval: 'doc', mail: 'mail', search: 'expand', board: 'board', calendar: 'cal', gcal: 'gcal', gsync: 'gcal', budget: 'wallet', attendance: 'clock', resource: 'car', report: 'report', settings: 'gear'};
  function renderNav() {
    const u = S.a ? S.a.unknown : {};
    const mine = S.a ? mineVisible() : [];
    const urgent = mine.filter(x => ['overdue', 'urgent'].includes(stateOf(x))).length;
    const byArea = a => mine.filter(x => x.area === a).length;
    const counts = {
      today: S.a ? {n: mine.length, cls: urgent ? 'hot' : mine.length ? 'mine' : '', tip: '내 전체 처리할 일'} : null,
      approval: S.a ? (u.approval ? {n: '?'} : (() => { const n = S.a.approval?.lists?.pending?.total ?? byArea('결재'); return {n, cls: n ? 'mine' : '', tip: '결재·문서 대기'}; })()) : null,
      mail: S.a ? (u.mail ? {n: '?'} : (() => { const ur = S.a.mail?.unread; const n = Array.isArray(ur) ? ur.length : Number.isFinite(ur) ? ur : byArea('메일'); return {n, cls: n ? 'mine' : '', tip: '안 읽은 메일'}; })()) : null,
      attendance: S.a ? {n: byArea('근태'), cls: byArea('근태') ? 'mine' : '', tip: '퇴근 지문 확인'} : null,
      calendar: S.a ? (() => { const n = mine.filter(x => x.deadline && x.deadline.dday >= 0 && x.deadline.dday <= 7).length; return {n, cls: n ? 'mine' : '', tip: '7일 내 기한'}; })() : null,
    };
    const item = (v) => { const i = VIEWS.indexOf(v); const c = counts[v.id]; return `<a data-act="view" data-v="${v.id}" class="${navView() === v.id ? 'on' : ''}" role="link" tabindex="0" aria-current="${navView() === v.id ? 'page' : 'false'}" title="${esc(v.label)}${i < 9 ? ` (Alt+${i + 1})` : ''}">${ic(VIEW_ICON[v.id])}<span class="lb">${esc(v.label)}</span>${c && c.n !== '' && c.n !== 0 ? `<span class="n ${c.cls || ''}" title="${esc(c.tip || v.label)}">${c.n}</span>` : ''}</a>`; };
    const topViews = VIEWS.filter(v => !VIEW_PARENT[v.id] && v.id !== 'settings');
    const settingsView = VIEWS.find(v => v.id === 'settings');
    $('#nav').innerHTML = '<div class="nav-label">업무 메뉴</div>' + topViews.map(item).join('') + '<div class="sep"></div>' + (settingsView ? item(settingsView) : '') + (() => { const v = versionInfo(); return `<div class="foot"><a data-act="openChangelog" role="button" tabindex="0" class="navver ${v.state}" title="설치된 버전과 업데이트 내역"><span class="lb"><span><b>v${esc(VERSION)}</b>${v.label ? ' · ' + esc(v.label) : ''}</span>${v.applied ? `<small>${esc(v.applied)} 적용</small>` : ''}</span></a></div>`; })();
  }
  function boardCount() { return (S.a ? S.a.actions.filter(x => onBoard(x) && !boardLinked(x) && bucketOfAction(x) !== 'done').length : 0) + S.todos.filter(t => bucketOfTodo(t) !== 'done').length; }
  function renderMain() {
    const el = $('#main');
    if (!S.a) { el.innerHTML = S.error && S.error !== 'SESSION' ? `<div class="empty"><div class="ill">${ic('alert')}</div><b>자료를 읽지 못했습니다</b>${esc(S.error)}<div class="acts" style="justify-content:center"><button class="btn primary" data-act="refresh">다시 시도</button></div></div>` : `<div class="pgh"><h1>그룹웨어 자료를 읽는 중입니다</h1><span class="spin"></span></div><div class="list">${'<div class="sk row"></div>'.repeat(6)}</div>`; return; }
    const scroll = el.scrollTop;
    if (S.view === 'home' && typeof homePartialRefresh === 'function' && homePartialRefresh()) return; // 홈이 이미 그려져 있으면 입력창을 건드리지 않고 요약만 갱신
    const fn = {docs: vDocs, home: vHome, today: vToday, overview: vOverview, approval: vApproval, mail: vMail, search: vSearch, board: vBoard, calendar: vCalendar, gcal: vGcal, gsync: vGsync, budget: vBudget, attendance: vAttendance, resource: vResource, report: vReport, settings: vSettings}[S.view] || vToday;
    el.innerHTML = viewTabs() + fn();
    el.scrollTop = scroll;
    if (S.view === 'report') { const f = $('#briefFrame'); if (f) f.srcdoc = R.renderHtml(S.a); }
    if (S.view === 'budget' && !S.budget.table && !S.budget.busy) loadBudget();
    if (S.view === 'attendance' && !S.att.rows && !S.att.busy) loadAttendance();
    if (S.view === 'attendance' && GW.teamPlanned) loadApps().catch(() => {});
    if (S.view === 'gsync' && GW.teamPlanned) loadApps().catch(() => {});
    if (S.view === 'resource' && !resState().bookings && !resState().busy && !resState().err) resLoad();
    if (S.view === 'approval' && ['distWaiting', 'deptWaiting'].includes(S.apTab) && !S.routing && !routingBusy() && !routingFailedRecently()) loadRouting().then(() => { if (S.view === 'approval') renderMain(); });
  }
  const pgh = (title, sub = '', tools = '') => `<div class="pgh"><h1>${title}</h1>${sub ? `<span class="sub">${sub}</span>` : ''}${tools ? `<div class="tools">${tools}</div>` : ''}</div>`;

