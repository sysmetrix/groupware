// GW 비서 · views
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- views ----------
  const VIEWS = [
    // v1.23: 핵심 4(할 일·일정·예약·근태·연차·예산 집행)를 홈 다음 1~5번(Alt+1~5)에 고정하고, 나머지는 '문서·소통'으로 내린다.
    // 배열 순서가 Alt+숫자 순서다. 왼쪽 메뉴 9개가 먼저, 메뉴 안 탭으로 들어가는 화면이 뒤에 온다.
    {id: 'home', label: '홈'}, {id: 'today', label: '할 일'}, {id: 'calendar', label: '일정·예약'}, {id: 'attendance', label: '근태·연차'}, {id: 'budget', label: '예산 집행'},
    {id: 'approval', label: '결재·메일'}, {id: 'search', label: '찾기'}, {id: 'report', label: '보고'}, {id: 'settings', label: '설정'},
    {id: 'mail', label: '메일'}, {id: 'notifications', label: '알림'}, {id: 'mytodo', label: '개인 ToDo'}, {id: 'board', label: '보드'}, {id: 'resource', label: '자원 예약'}, {id: 'gcal', label: '구글 캘린더'},
    {id: 'gsync', label: '구글 연동'}, {id: 'docs', label: '결재문서 찾기'}, {id: 'people', label: '사람·조직'}, {id: 'overview', label: '현황 차트'},
  ];
  // 메뉴에 따로 두지 않고 상위 화면 안의 탭으로 들어가는 화면(기능과 화면 id는 그대로, 메뉴만 합침). 옛 주소(gw-view)·비서 open_view도 이 표로 새 메뉴 안에서 열린다.
  const VIEW_PARENT = {mail: 'approval', notifications: 'approval', mytodo: 'today', board: 'today', resource: 'calendar', gcal: 'calendar', gsync: 'settings', docs: 'search', people: 'search', overview: 'report'};
  const navView = () => VIEW_PARENT[S.view] || S.view;
  const viewUrl = v => { const url = new URL(location.href); url.searchParams.set('gw-view', v); return url.href; };
  const linkedView = () => VIEWS.find(v => v.id === new URLSearchParams(location.search).get('gw-view'))?.id;
  function viewAvailable(v) {
    return v !== 'resource' ? !['gcal', 'gsync'].includes(v) || allowed('googleCalendar') : allowed('resource');
  }
  function normalizeTabs(el) {
    for (const group of el.querySelectorAll('[role="tablist"]')) {
      const tabs = [...group.querySelectorAll('[role="tab"]')];
      const first = tabs.find(t => t.getAttribute('aria-selected') === 'true' && !t.disabled) || tabs.find(t => !t.disabled);
      for (const t of tabs) t.tabIndex = t === first ? 0 : -1;
    }
  }
  function viewTabs() {
    const tab = (id, label, n) => `<button role="tab" aria-selected="${S.view === id}" class="${S.view === id ? 'on' : ''}" data-act="view" data-v="${id}">${label}${n ? `<span class="c">${n}</span>` : ''}</button>`;
    // 같은 탭 안에서 출처만 바꾸는 화면(할 일의 개인 ToDo, 달력의 구글 캘린더)은 탭을 나누지 않고 하나의 탭을 고른 것으로 본다.
    const tabOf = (ids, label, n) => { const on = ids.includes(S.view); return `<button role="tab" aria-selected="${on}" class="${on ? 'on' : ''}" data-act="view" data-v="${ids[0]}">${label}${n ? `<span class="c">${n}</span>` : ''}</button>`; };
    const p = navView();
    if (p === 'today') return `<div class="vtabs"><div class="seg" role="tablist" aria-label="할 일 보기 방식">${tabOf(['today', 'mytodo'], '목록')}${tab('board', '보드')}</div></div>`;
    if (p === 'calendar') return `<div class="vtabs"><div class="seg" role="tablist" aria-label="일정 및 예약">${tabOf(['calendar', 'gcal'], '달력')}${allowed('resource') ? tab('resource', '자원 예약') : ''}</div>${allowed('googleCalendar') && ['calendar', 'gcal'].includes(S.view) ? `<div class="seg" role="group" aria-label="달력 출처">${[['calendar', '그룹웨어'], ['gcal', '구글 캘린더']].map(([id, n]) => `<button class="${S.view === id ? 'on' : ''}" aria-pressed="${S.view === id}" data-act="view" data-v="${id}">${n}</button>`).join('')}</div>` : ''}</div>`;
    if (p === 'approval') return `<div class="vtabs"><div class="seg" role="tablist" aria-label="결재 메일 알림">${tab('approval', '결재·문서유통')}${tab('mail', '메일')}${tab('notifications', '알림')}</div></div>`;
    if (p === 'search') return `<div class="vtabs"><div class="seg" role="tablist" aria-label="찾는 자료">${tab('search', '통합검색')}${tab('docs', '결재문서 (기안·접수·발송)')}${tab('people', '사람·조직')}</div></div>`;
    if (p === 'report') return `<div class="vtabs"><div class="seg" role="tablist" aria-label="보고 및 현황">${tab('report', '보고서')}${tab('overview', '현황 차트')}</div></div>`;
    if (p === 'settings' && allowed('googleCalendar')) return `<div class="vtabs"><div class="seg" role="tablist" aria-label="설정 구분">${tab('settings', '설정')}${tab('gsync', '구글 연동')}</div></div>`;
    return '';
  }
  // Charts: shown on big screens, folded on laptops unless the user chose otherwise.
  const showCharts = () => S.settings.showCharts ?? (window.innerHeight >= 860 && window.innerWidth >= 1500);
  // v1.10.0: 메뉴를 다시 그리면 키보드 포커스가 사라져 화면낭독기 사용자가 위치를 잃었다. 같은 메뉴로 포커스를 돌려 주고, 바뀐 화면 이름을 읽어 준다.
  // v1.21.1: 화면에 새로 들어올 때의 기본값. 결재·문서유통은 '내 상신문서', 일정·예약은 이번 달과 오늘 날짜를 고른 상태로 연다.
  // 다른 탭이 필요한 곳(홈의 '결재 대기' 등)은 go() 뒤에 S.apTab을 다시 정한다.
  function viewDefaults(v) {
    if (v === 'approval') { S.apTab = 'submitted'; S.apTabPinned = true; }
    if (v === 'calendar' && S.cal) { S.cal.offset = 0; S.cal.day = today().replace(/-/g, ''); }
    if (v === 'budget' && typeof BM === 'object' && BM && BM.open) BM.open.clear(); // v1.25.2: 재단 전체 사업은 모두 접힌 채로 시작
  }
  const go = v => {
    if (!viewAvailable(v)) return false;
    const changed = S.view !== v;
    if (changed && S.view === 'mytodo' && typeof TD === 'object' && TD && (TD.saving || TD.dirty)) { if (TD.saving) { toast('할 일을 저장 중입니다. 잠시 기다려 주세요.'); return false; } if (!confirm('할 일에 저장하지 않은 내용이 있습니다. 버리고 이동할까요?')) return false; TD.dirty = false; TD.sel = ''; TD.edFiles = null; }
    if (changed && !S.focus) { if (!leavePane()) return false; S.sel = null; S.pane.url = ''; }
    const active = root.activeElement;
    const fromNav = active?.closest('#nav a');
    const fromViewTabs = active?.closest('.vtabs');
    if (changed) {
      S.apTabPinned = false;
      viewDefaults(v);
      if (typeof carrySearchInputs === 'function') carrySearchInputs(S.view, v);
    }
    S.view = v; S.multi.clear(); S.pane.expanded = false;
    writeViewUrl(v);
    render();
    const mm = $('#main'); if (mm) mm.scrollTop = 0;
    if (fromNav) root.querySelector(`#nav a[data-v="${navView()}"]`)?.focus({preventScroll: true});
    else if (fromViewTabs) (mm?.querySelector('.vtabs [aria-current="page"]') || mm?.querySelector('.vtabs [aria-selected="true"]'))?.focus({preventScroll: true});
    else if (changed) mm?.focus({preventScroll: true});
    if (changed && $('#srAnnounce')) $('#srAnnounce').textContent = (mm?.querySelector('h1')?.textContent.trim() || VIEWS.find(x => x.id === v)?.label || '') + ' 화면';
    return true;
  };
  // Home: back to a clean "오늘 할 일" (asks first if something is being typed in the pane).
  function goHome() {
    if (S.focus) { stopFocus(); if (S.focus) return; }
    if (!leavePane()) return;
    closeOverlay();
    S.sel = null; S.pane.url = ''; S.pane.expanded = false; S.multi.clear();
    S.filter = {...S.filter, area: 'all', level: 'all', onlyNew: false, q: '', showHidden: false};
    go('home');
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
    const q = todayQueue();
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
  const STATE_GROUP = {overdue: '급한 일', urgent: '급한 일', todo: '할 일', check: '확인이 필요한 일', confirm: '끝났는지만 확인', wait: '기다리는 중', info: '참고'};
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
    // v1.9.1: 종은 통합알림 화면을 연다. 숫자도 통합알림의 안 읽음 수(조회한 최근 100건 기준)로 맞춘다.
    { const unread = typeof ntfUnread === 'function' ? ntfUnread() : null, bl = $('#bell'); bl.innerHTML = `${ic('bell')}${unread ? `<span class="dot" aria-hidden="true">${unread > 99 ? '99+' : unread}</span>` : ''}`; bl.setAttribute('aria-label', unread ? `통합알림, 최근 조회분에서 안 읽음 ${unread}건` : '통합알림'); bl.title = unread ? `통합알림 · 최근 100건 중 안 읽음 ${unread}건` : '통합알림'; if (S.a && typeof notificationsBackground === 'function') notificationsBackground(); if (bl.dataset.unread !== String(unread)) { bl.dataset.unread = String(unread); renderNav(); } }
    const urgent = S.a ? mineVisible().filter(x => ['overdue', 'urgent'].includes(stateOf(x))).length : 0;
    const total = S.a ? mineVisible().length : 0;
    { const st = !S.a ? 'idle' : urgent ? 'urgent' : total ? 'todo' : 'ok'; const sum = !S.a ? '불러오는 중' : urgent ? `급한 일 ${urgent}건 · 전체 ${total}건` : total ? `처리할 일 ${total}건` : '오늘 처리할 일 없음'; fab.dataset.st = st;
      const sig = `${VERSION}|${st}|${sum}|${urgent || total || 'ok'}`;
      if (fab.dataset.sig !== sig) { fab.dataset.sig = sig; fab.innerHTML = `<span class="lg">${mascotImage}</span><span class="t">GW 비서</span><span class="v" title="설치된 버전">v${esc(VERSION)}</span><span class="sm">${sum}</span>${S.a ? `<span class="b">${urgent || total || '✓'}</span>` : ''}<kbd>Alt G</kbd>`; } }
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
    { const cm = R.contractMessage(S.contract); if (cm) parts.push(`<div class="b warn">${ic('alert')}${esc(cm)} <button class="btn sm" data-act="openDiag">자세히</button></div>`); }
    if (S.pendingRefresh) parts.push(`<div class="b info">새 자료가 도착했습니다. 작업 중이라 화면은 그대로 두었고, 작업을 마치면 알아서 반영합니다. <button class="btn sm primary" data-act="applyRefresh">지금 반영</button></div>`);
    const age = S.lastRefresh ? (Date.now() - S.lastRefresh.getTime()) / 60000 : 0;
    if (age >= 15 && !S.loading) parts.push(`<div class="b warn">${Math.floor(age)}분 전 자료입니다. <button class="btn sm" data-act="refresh">새로고침</button></div>`);
    b.innerHTML = parts.join('');
  }
  const MODNAME = {mail: '메일', approval: '전자결재', notice: '공지', schedule: '일정', attendance: '근태', leave: '연차', budget: '예산', alerts: '알림'};
  const VIEW_ICON = {notifications: 'bell', people: 'user', docs: 'search', home: 'home', today: 'inbox', overview: 'chart', approval: 'doc', mail: 'mail', search: 'expand', board: 'board', mytodo: 'check', calendar: 'cal', gcal: 'gcal', gsync: 'gcal', budget: 'wallet', attendance: 'clock', resource: 'car', report: 'report', settings: 'gear'};
  function renderNav() {
    const u = S.a ? S.a.unknown : {};
    const mine = S.a ? mineVisible() : [];
    const urgent = mine.filter(x => ['overdue', 'urgent'].includes(stateOf(x))).length;
    const byArea = a => mine.filter(x => x.area === a).length;
    const counts = {
      today: S.a ? (() => { const td = typeof todoNavDue === 'function' ? todoNavDue() : []; const late = td.some(t => R.dday(t.due) < 0); return {n: mine.length || td.length, text: [mine.length ? '처리·확인 ' + mine.length : '', td.length ? '오늘까지 ' + td.length : ''].filter(Boolean), cls: urgent || late ? 'hot' : 'mine', tip: '그룹웨어 처리·확인 ' + mine.length + '건 · 오늘까지인 개인 할 일 ' + td.length + '건' + (typeof TD === 'object' && (!TD.list || TD.cached || TD.complete === false || TD.err) ? ' (개인 목록 전체 확인 전)' : '')}; })() : null,
      // 결재·메일: 결재 대기와 안 읽은 메일(조회분)을 따로 쓴다. 조회 범위가 달라 한 숫자로 합치지 않는다.
      approval: S.a ? (() => {
        const ap = u.approval ? null : (S.a.approval?.lists?.pending?.total ?? byArea('결재')), ml = mailSnapshot().unread;
        const text = [u.approval ? '결재 확인 불가' : ap ? '결재 ' + ap : '', ml == null ? '메일 확인 불가' : ml ? '메일 ' + ml : ''].filter(Boolean);
        return {n: text.length ? (ap || 0) + (ml || 0) || '?' : 0, text, cls: ap || ml ? 'mine' : '', tip: (u.approval ? '결재 대기 확인 불가' : '결재 대기 ' + ap + '건') + ' · ' + (ml == null ? '안 읽은 메일 확인 불가' : '안 읽은 메일 조회분 ' + ml + '건')};
      })() : null,
      attendance: S.a ? {n: byArea('근태'), cls: byArea('근태') ? 'mine' : '', tip: '지문 확인 ' + byArea('근태') + '건'} : null,
      calendar: S.a ? (() => { const n = mine.filter(x => x.deadline && x.deadline.dday >= 0 && x.deadline.dday <= 7).length; return {n, cls: n ? 'mine' : '', tip: '7일 안 기한 ' + n + '건'}; })() : null,
    };
    // 읽히는 이름은 보이는 메뉴 이름으로 시작한다(WCAG 2.5.3). 숫자 뜻은 뒤에 붙인다.
    const item = v => {
      const i = VIEWS.indexOf(v), c = counts[v.id], shown = c && c.n !== '' && c.n !== 0;
      const active = navView() === v.id;
      const tip = shown ? c.tip || (c.n === '?' ? '확인 불가' : c.n + '건') : '';
      return `<a href="${esc(viewUrl(v.id))}" data-act="view" data-v="${v.id}" class="${active ? 'on' : ''}${shown && c.text ? ' nav-counted' : ''}" ${active ? 'aria-current="page"' : ''} aria-label="${esc(v.label + (tip ? ', ' + tip : ''))}" title="${esc(v.label + (i < 9 ? ' (Alt+' + (i + 1) + ')' : '') + (tip ? ' · ' + tip : ''))}">${ic(VIEW_ICON[v.id])}<span class="lb">${esc(v.label)}</span>${shown ? `<span class="n ${c.cls || ''}" aria-hidden="true">${c.text ? c.text.map(t => '<span>' + esc(t) + '</span>').join('') : c.n}</span>` : ''}</a>`;
    };
    const topViews = VIEWS.filter(v => !VIEW_PARENT[v.id] && v.id !== 'settings');
    const settingsView = VIEWS.find(v => v.id === 'settings');
    // 메뉴 묶음: 매일 보는 것 → 처리하는 업무 → 찾아보는 자료 → 사람. 어디에도 없는 화면은 마지막 묶음에 붙는다.
    const NAV_GROUPS = [['', ['home']], ['핵심', ['today', 'calendar', 'attendance', 'budget']], ['문서·소통', ['approval', 'search', 'report']]];
    const grouped = new Set(NAV_GROUPS.flatMap(g => g[1]));
    const navGroups = NAV_GROUPS.map(([label, ids], gi) => {
      const vs = topViews.filter(v => ids.includes(v.id) || (gi === NAV_GROUPS.length - 1 && !grouped.has(v.id)));
      return vs.length ? `<div class="nav-g" role="group"${label ? ` aria-label="${label}"` : ''}>${label ? `<div class="nav-label">${label}</div>` : ''}${vs.map(item).join('')}</div>` : '';
    }).join('');
    const nav = $('#nav'), focused = root.activeElement?.closest('#nav a');
    const top = nav.scrollTop;
    nav.innerHTML = navGroups + '<div class="sep"></div>' + (settingsView ? item(settingsView) : '') + (() => { const v = versionInfo(); return `<div class="foot"><a data-act="openChangelog" role="button" tabindex="0" class="navver ${v.state}" title="설치된 버전과 업데이트 내역"><span class="lb"><span><b>v${esc(VERSION)}</b>${v.label ? ' · ' + esc(v.label) : ''}</span>${v.applied ? `<small>${esc(v.applied)} 적용</small>` : ''}</span></a></div>`; })();
    nav.scrollTop = top;
    if (focused) nav.querySelector(focused.dataset.v ? `a[data-v="${focused.dataset.v}"]` : '.navver')?.focus({preventScroll: true});
  }
  function renderMain() {
    const el = $('#main');
    if (!S.a) { el.innerHTML = S.error && S.error !== 'SESSION' ? `<div class="empty"><div class="ill">${ic('alert')}</div><b>자료를 읽지 못했습니다</b>${esc(S.error)}<div class="acts" style="justify-content:center"><button class="btn primary" data-act="refresh">다시 시도</button></div></div>` : `<div class="pgh"><h1>그룹웨어 자료를 읽는 중입니다</h1><span class="spin"></span></div><div class="list">${'<div class="sk row"></div>'.repeat(6)}</div>`; return; }
    const scroll = el.scrollTop;
    if (S.view === 'home' && typeof homePartialRefresh === 'function' && homePartialRefresh()) return; // 홈이 이미 그려져 있으면 입력창을 건드리지 않고 요약만 갱신
    const fn = {notifications: vNotifications, people: vPeople, docs: vDocs, home: vHome, today: vToday, overview: vOverview, approval: vApproval, mail: vMail, search: vSearch, board: vBoard, mytodo: vMyTodo, calendar: vCalendar, gcal: vGcal, gsync: vGsync, budget: vBudget, attendance: vAttendance, resource: vResource, report: vReport, settings: vSettings}[S.view] || vToday;
    const focusedTab = root.activeElement?.closest('[role=tab]');
    const tabGroup = focusedTab?.closest('[role=tablist]');
    const tabGroupIndex = [...el.querySelectorAll('[role=tablist]')].indexOf(tabGroup);
    el.innerHTML = fn();
    { const vt = viewTabs(); if (vt) { const ph = el.querySelector(':scope > .pgh'); if (ph) ph.insertAdjacentHTML('afterend', vt); else el.insertAdjacentHTML('afterbegin', vt); } }
    normalizeTabs(el);
    if (tabGroupIndex >= 0) {
      const tabs = el.querySelectorAll('[role=tablist]')[tabGroupIndex]?.querySelectorAll('[role=tab]');
      if (tabs) ([...tabs].find(t => t.dataset.act === focusedTab.dataset.act && t.dataset.v === focusedTab.dataset.v && t.tabIndex === 0) || [...tabs].find(t => t.tabIndex === 0))?.focus({preventScroll: true});
    }
    el.scrollTop = scroll;
    if (S.view === 'notifications' && NTF.items === null && !NTF.loading && !NTF.error) { loadNotifications(); return; }
    if (S.view === 'report') renderBriefFrame();
    if (S.view === 'budget' && !S.budget.table && !S.budget.busy) loadBudget();
    if (S.view === 'attendance' && !S.att.rows && !S.att.busy && !S.att.error) loadAttendance();
    if (S.view === 'attendance' && GW.teamPlanned) loadApps().catch(() => {});
    if (S.view === 'gsync' && GW.teamPlanned) loadApps().catch(() => {});
    if (S.view === 'resource') resEnsure();
    if (S.view === 'approval' && ['distWaiting', 'deptWaiting'].includes(S.apTab) && !S.routing && !routingBusy() && !routingFailedRecently()) loadRouting().then(() => { if (S.view === 'approval') renderMain(); });
  }
  const pgh = (title, sub = '', tools = '') => `<div class="pgh"><h1>${title}</h1>${sub ? `<span class="sub">${sub}</span>` : ''}${tools ? `<div class="tools">${tools}</div>` : ''}</div>`;

