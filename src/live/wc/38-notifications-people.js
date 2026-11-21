// GW 비서 · 그룹웨어 알림과 사람 찾기 (read-only until the user opens a compose screen)
  const NTF = {items: null, loading: false, error: '', filter: 'all', type: 'all', query: '', search: '', page: 1, at: '', seq: 0};
  const PEOPLE = {query: '', items: null, total: null, loading: false, error: '', seq: 0, tree: null, treeError: '', orgLoading: false, orgSeq: 0, org: '', orgNote: '', localFilter: ''};
  const notificationLabel = type => ({EAPPROVAL:'전자결재', MAIL:'메일', BOARD:'게시판', RESOURCE:'자원', SCHEDULE:'일정', WORK:'업무관리'}[type] || type || '기타');
  function notificationTime(value) {
    const s = String(value || '');
    if (/^\d{12}/.test(s)) return s.slice(0,4)+'.'+s.slice(4,6)+'.'+s.slice(6,8)+' '+s.slice(8,10)+':'+s.slice(10,12);
    const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
    return m ? m[1]+'.'+m[2].padStart(2,'0')+'.'+m[3].padStart(2,'0')+(m[4] ? ' '+m[4].padStart(2,'0')+':'+m[5] : '') : s || '시각 미상';
  }
  async function loadNotifications() {
    if (NTF.loading) return;
    const seq = ++NTF.seq, owner = currentKey; NTF.loading = true; NTF.error = ''; renderMain();
    try {
      const result = await GW.collect({modules:['alerts'], alertCount:100});
      if (seq !== NTF.seq || owner !== currentKey || owner !== getUserKey()) return;
      if (!result.status?.alerts?.ok || !Array.isArray(result.data?.alerts?.alerts)) throw new Error(result.status?.alerts?.message || '알림 응답을 확인할 수 없습니다.');
      NTF.items = result.data.alerts.alerts; NTF.page = 1; NTF.at = result.collectedAt; if (typeof renderHead === 'function') renderHead(); if (NTF.type !== 'all' && !NTF.items.some(x => x.type === NTF.type)) NTF.type = 'all';
    } catch (e) { if (seq === NTF.seq && owner === currentKey) { NTF.items = null; NTF.error = String(e.message || e); } }
    finally { if (seq === NTF.seq) { NTF.loading = false; if (S.view === 'notifications') renderMain(); } }
  }
  // v1.9.1: 머리글 종 숫자용. 화면을 다시 그리지 않고 최근 100건을 받아 두며, 3분에 한 번만 묻는다(통합알림 화면에서는 그 화면의 새로고침에 맡김).
  function ntfUnread() { try { return NTF.items ? NTF.items.filter(x => !x.read).length : null; } catch { return null; } }
  let ntfBgAt = 0;
  if (typeof document === 'object' && document && document.addEventListener) document.addEventListener('visibilitychange', () => { if (!document.hidden) ntfBgAt = Math.min(ntfBgAt, Date.now() - 150000); }); // 다른 탭에서 돌아오면 30초 안에 다시 확인
  async function notificationsBackground() {
    try { if (NTF.loading || S.view === 'notifications' || Date.now() - ntfBgAt < 180000) return; } catch { return; }
    ntfBgAt = Date.now(); const seq = NTF.seq, owner = currentKey;
    try {
      const result = await GW.collect({modules:['alerts'], alertCount:100});
      if (seq !== NTF.seq || NTF.loading || S.view === 'notifications' || owner !== currentKey || owner !== getUserKey()) return;
      if (result.status?.alerts?.ok && Array.isArray(result.data?.alerts?.alerts)) { NTF.items = result.data.alerts.alerts; NTF.at = result.collectedAt; NTF.error = ''; renderHead(); }
    } catch {}
  }
  function notificationsSearch() {
    NTF.query = String($('#notificationsQuery')?.value ?? NTF.query); NTF.search = NTF.query.trim().toLowerCase(); NTF.page = 1; renderMain();
  }
  function notificationsPage(value) {
    NTF.page = Math.max(1, Math.floor(Number(value) || 1)); renderMain();
  }
  function notificationUrl(x) {
    if (!x?.url || /[{}]/.test(x.url)) return '';
    try { const url = new URL(x.url, location.href); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  }
  function vNotifications() {
    if (currentKey !== getUserKey()) return pgh('통합알림') + '<div class="box warn" role="alert">계정이 변경되었습니다. 새로고침 후 확인하세요.</div>';
    const list = NTF.items || [], unread = list.filter(x => !x.read).length;
    const types = [...new Set(list.map(x => x.type || '기타'))];
    const timeKey = x => { const t = notificationTime(x.time); return /^\d{4}\.\d{2}\.\d{2}/.test(t) ? t.replace(/\D/g, '').padEnd(12, '0') : ''; };
    const filtered = list.map((x,i)=>({x,i,k:timeKey(x)})).sort((a,b) => (a.k ? 0 : 1) - (b.k ? 0 : 1) || (a.k < b.k ? 1 : a.k > b.k ? -1 : a.i - b.i)).filter(({x}) => (NTF.filter === 'all' || !x.read) && (NTF.type === 'all' || (x.type || '기타') === NTF.type) && (!NTF.search || [x.title,x.head,x.who,x.dept].some(v => String(v || '').toLowerCase().includes(NTF.search))));
    const pages = Math.max(1, Math.ceil(filtered.length / 25)); NTF.page = Math.min(pages, Math.max(1, Math.floor(Number(NTF.page) || 1)));
    const start = (NTF.page - 1) * 25, visible = filtered.slice(start, start + 25);
    const chip = (act, value, label, active) => `<button class="chip ${active ? 'on' : ''}" data-act="${act}" data-v="${esc(value)}" aria-pressed="${active}">${esc(label)}</button>`;
    let previousDay = '';
    const rows = visible.map(({x,i}) => {
      const time = notificationTime(x.time), day = /^\d{4}\.\d{2}\.\d{2}/.test(time) ? time.slice(0,10) : '날짜 미상';
      const heading = day !== previousDay ? '<h2 class="ntf-day">'+esc(day)+'</h2>' : ''; previousDay = day;
      const title = x.title || x.head || '(제목 없음)', headCore = String(x.head || '').replace(/^\[[^\]]*\]\s*/, ''), meta = [x.head && headCore && !title.includes(headCore) ? x.head : '', x.dept, x.who, day === '날짜 미상' ? time : ''].filter(Boolean).join(' · ');
      return heading + `<article class="ntf-row${x.read ? '' : ' unread'}"><span class="ntf-type">${esc(notificationLabel(x.type))}</span><div class="ntf-main"><b class="ntf-t"><i class="ntf-dot${x.read ? ' off' : ''}" aria-hidden="true"></i>${esc(title)}</b><span class="ntf-meta"><span class="vh">${x.read ? '읽음' : '안 읽음'} · </span>${esc(meta)}</span></div><span class="ntf-time">${esc(day === '날짜 미상' ? '' : time.slice(11))}</span><span class="ntf-acts">${notificationUrl(x) ? `<button class="btn sm" data-act="notificationOpen" data-i="${i}" aria-label="${esc(title === '(제목 없음)' ? '알림' : title)} 원문 열기">원문 열기</button>` : '<button class="btn sm ghost" data-act="nativeNotifications" title="원문 연결을 확인할 수 없어 그룹웨어 알림 목록을 엽니다">그룹웨어에서 보기</button>'}<button class="btn sm ghost" data-act="copy" data-v="${esc(title)}" aria-label="알림 제목 복사">복사</button></span></article>`;
    }).join('');
    const pager = `<nav class="bar" aria-label="알림 페이지"><button class="btn sm" data-act="notificationsPage" data-v="${NTF.page-1}" ${NTF.page===1?'disabled':''}>이전</button><span role="status" aria-live="polite">${filtered.length ? start+1 : 0}–${Math.min(start+25,filtered.length)} / 조건에 맞는 ${filtered.length}건 · ${NTF.page}/${pages}페이지</span><button class="btn sm" data-act="notificationsPage" data-v="${NTF.page+1}" ${NTF.page===pages?'disabled':''}>다음</button></nav>`;
    return pgh('통합알림', '최근 100건까지 · 원문을 열기 전에는 읽음 처리하지 않습니다', `<button class="btn" data-act="notificationsLoad" ${NTF.loading?'disabled':''}>${NTF.loading?'불러오는 중…':'새로고침'}</button>`) +
      `<div class="bar">${chip('notificationsFilter','all','전체 '+(NTF.items === null ? '—' : list.length),NTF.filter==='all')}${chip('notificationsFilter','unread','안 읽음 '+(NTF.items === null ? '—' : unread),NTF.filter==='unread')}</div><div class="bar">${chip('notificationsType','all','모든 유형',NTF.type==='all')}${types.map(t=>chip('notificationsType',t,notificationLabel(t),NTF.type===t)).join('')}</div><div class="bar"><label for="notificationsQuery">조회한 알림에서 찾기</label><input class="inp grow" id="notificationsQuery" placeholder="제목, 발신자, 부서" value="${esc(NTF.query)}"><button class="btn" data-act="notificationsSearch">검색</button></div>${NTF.at ? `<p class="muted">조회 시각: ${esc(new Date(NTF.at).toLocaleString('ko-KR'))} · 전체 알림 수가 아닌 조회 범위의 건수입니다.</p>` : ''}<section aria-label="알림 조회 결과" aria-busy="${NTF.loading}">${NTF.loading ? '<div class="box" role="status">그룹웨어 알림을 읽고 있습니다…</div>' : NTF.error ? `<div class="box errb" role="alert">알림을 불러오지 못했습니다: ${esc(NTF.error)} <button class="btn sm" data-act="notificationsLoad">다시 시도</button></div>` : NTF.items === null ? '<div class="box" role="status">새로고침을 눌러 그룹웨어 알림을 불러오세요.</div>' : rows ? rows + pager : '<div class="box" role="status">조건에 맞는 알림이 없습니다. 검색어나 필터를 바꿔 보세요.</div>'}</section>`;
  }
  function openNotification(i) {
    if (currentKey !== getUserKey()) return;
    const x = NTF.items?.[i], url = notificationUrl(x); if (!url) return;
    const wasUnread = !x.read; openUrl(url, {title:x.title || x.head || '알림', unread:wasUnread, what:'알림'});
    if (wasUnread) { x.read = true; if (typeof renderHead === 'function') renderHead(); if (S.view === 'notifications') renderMain(); } // v1.10.0: 연 알림은 곧바로 숫자에서 뺀다
  }
  // 홈페이지 기준 공식 순서다. 이름을 비슷하게 고쳐 맞추지 않고, GW의 정확한 정식 명칭·키만 연결한다.
  const PEOPLE_OFFICIAL_ORG = [
    {name:'이사장', level:0}, {name:'이사회', level:1, missingLabel:'그룹웨어 연결 없음'}, {name:'대표이사', level:1}, {name:'윤리감사', level:2},
    {name:'전략경영실', level:2}, {name:'전략기획부', level:3, optional:true}, {name:'경영지원부', level:3, optional:true},
    {name:'부천시여성회관', level:2}, {name:'부천여성청소년센터', level:2}, {name:'부천시청소년센터', level:2}, {name:'산울림청소년센터', level:2}, {name:'소사청소년센터', level:2}, {name:'부천시청소년상담복지센터', level:2}, {name:'부천시건강가정지원센터', level:2}, {name:'고리울청소년센터', level:2}, {name:'부천시일쉼지원센터', level:2}
  ];
  const peopleIsBranchNode = x => /[（(]\s*지점\s*[)）]/.test(String(x?.name || ''));
  const peopleDisplayDept = value => String(value || '—').replace(/[（(]\s*지점\s*[)）]/g, '· 별도 조직키');
  const PEOPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function peopleOfficialOrganization(tree) {
    const used = new Set();
    return PEOPLE_OFFICIAL_ORG.map(spec => {
      const item = tree.find(x => x.name === spec.name && !peopleIsBranchNode(x) && !used.has(x.key));
      if (item) used.add(item.key);
      return {...spec, item};
    });
  }
  function peopleOrgButton(entry) {
    const {name, item, optional, missingLabel} = entry;
    const unavailable = missingLabel || (optional ? 'API 독립키 미확인' : '그룹웨어 키 미확인');
    return `<button class="chip ${PEOPLE.org === name ? 'on' : ''}" aria-pressed="${PEOPLE.org === name}" ${item && !PEOPLE.loading ? `data-act="peopleDept" data-v="${esc(item.key)}"` : 'disabled aria-disabled="true"'}>${esc(name)} ${item ? '' : `<span class="muted">${unavailable}</span>`}</button>`;
  }
  const peopleOrgListItem = (entry, children = '') => `<li>${peopleOrgButton(entry)}${children ? `<ul>${children}</ul>` : ''}</li>`;
  function peopleOfficialTree(official) {
    const [chair, board, ceo, ethics, strategy, plan, support, ...facilities] = official;
    return `<ul class="org-chart" aria-label="공식 조직 계층">${peopleOrgListItem(chair, peopleOrgListItem(board) + peopleOrgListItem(ceo, peopleOrgListItem(ethics) + peopleOrgListItem(strategy, peopleOrgListItem(plan) + peopleOrgListItem(support)) + facilities.map(x => peopleOrgListItem(x)).join('')))}</ul>`;
  }
  async function peopleLoadTree() {
    if (PEOPLE.orgLoading) return; const seq = ++PEOPLE.orgSeq, owner = currentKey; PEOPLE.orgLoading = true; PEOPLE.treeError = ''; renderMain();
    try {
      const tree = await GW.organizationTree();
      if (seq !== PEOPLE.orgSeq || owner !== currentKey || owner !== getUserKey()) return;
      if (!Array.isArray(tree)) throw new Error('조직도 응답을 확인할 수 없습니다.');
      PEOPLE.tree = tree.filter(x => x.name && /^d[0-9]+$/.test(x.key)).filter((x,i,a) => a.findIndex(y => y.key === x.key) === i);
    } catch (e) { if (seq === PEOPLE.orgSeq && owner === currentKey && owner === getUserKey()) PEOPLE.treeError = String(e.message || e); }
    finally { if (seq === PEOPLE.orgSeq) { PEOPLE.orgLoading = false; if (S.view === 'people') renderMain(); } }
  }
  const peopleBaseOrgName = value => String(value || '').replace(/[（(]\s*지점\s*[)）]/g, '').trim();
  function peopleUniqueMembers(lists) {
    const emails = new Set(), rows = [];
    for (const list of lists) for (const person of list) {
      const email = String(person?.email || '').trim().toLowerCase();
      const emailKey = PEOPLE_EMAIL.test(email) ? email : '';
      if (emailKey && emails.has(emailKey)) continue;
      if (emailKey) emails.add(emailKey);
      rows.push(person);
    }
    return rows;
  }
  async function peopleDept(key) {
    const selected = PEOPLE.tree?.find(x => x.key === key); if (!selected || peopleIsBranchNode(selected) || PEOPLE.loading) return;
    const partners = PEOPLE.tree.filter(x => peopleIsBranchNode(x) && peopleBaseOrgName(x.name) === selected.name);
    const seq = ++PEOPLE.seq, owner = currentKey; PEOPLE.loading = true; PEOPLE.error = ''; PEOPLE.orgNote = ''; PEOPLE.items = null; PEOPLE.total = null; PEOPLE.query = ''; PEOPLE.localFilter = ''; PEOPLE.org = selected.name; renderMain();
    try {
      // 정식 키를 항상 첫 번째로 조회한다. 분리된 지점 키는 화면에 노출하지 않고, 누락 방지를 위해 결과만 병합한다.
      const sources = [selected, ...partners], settled = await Promise.allSettled(sources.map(x => GW.organizationMembers(x.key)));
      if (seq !== PEOPLE.seq || owner !== currentKey || owner !== getUserKey()) return;
      const good = settled.filter(x => x.status === 'fulfilled' && Array.isArray(x.value)).map(x => x.value);
      const failed = settled.filter(x => x.status !== 'fulfilled' || !Array.isArray(x.value));
      if (!good.length) throw new Error('부서 구성원 응답을 확인할 수 없습니다.');
      PEOPLE.items = peopleUniqueMembers(good); PEOPLE.total = PEOPLE.items.length;
      if (failed.length) PEOPLE.orgNote = '일부 조직을 읽지 못해 일부 구성원이 빠질 수 있습니다.';
      else if (partners.length) PEOPLE.orgNote = '분리 조직 계정을 함께 조회했으며, 같은 이메일은 한 번만 표시합니다.';
    } catch (e) { if (seq === PEOPLE.seq && owner === currentKey) PEOPLE.error = String(e.message || e); }
    finally { if (seq === PEOPLE.seq) { PEOPLE.loading = false; if (S.view === 'people') renderMain(); } }
  }
  async function peopleSearch() {
    const q = String(PEOPLE.query || '').trim();
    if (q.length < 2) { toast('직원 이름을 두 글자 이상 입력하세요.'); return; }
    const seq = ++PEOPLE.seq, owner = currentKey; PEOPLE.loading = true; PEOPLE.error = ''; PEOPLE.items = null; PEOPLE.total = null; PEOPLE.localFilter = ''; PEOPLE.org = ''; PEOPLE.orgNote = ''; renderMain();
    try {
      const result = await GW.search(q, {types:['person'], pageSize:50});
      if (seq !== PEOPLE.seq || owner !== currentKey || owner !== getUserKey()) return;
      const g = result.groups?.person; if (!g || g.error || !Array.isArray(g.items)) throw new Error(g?.message || '직원 검색 결과를 확인할 수 없습니다.');
      PEOPLE.items = g.items; PEOPLE.total = Number.isSafeInteger(g.reliableTotal) && g.reliableTotal >= g.items.length ? g.reliableTotal : null;
    } catch(e) { if (seq === PEOPLE.seq && owner === currentKey) PEOPLE.error = String(e.message || e); }
    finally { if (seq === PEOPLE.seq) { PEOPLE.loading = false; if (S.view === 'people') renderMain(); } }
  }
  function personMail(i) {
    if (currentKey !== getUserKey()) return;
    const person = PEOPLE.items?.[i], email = person?.email || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('확인된 메일 주소가 없습니다.'); return; }
    const url = location.origin + '/#/popup?popType=Y&callComp=UDAP001&mailKind=link&to=' + encodeURIComponent(email);
    openUrl(url, {title: person.name + ' 님에게 메일 쓰기'});
  }
  function peopleFilterRows() {
    const q = PEOPLE.localFilter.trim().toLowerCase(); let count = 0;
    root.querySelectorAll('[data-person-row]').forEach(row => { row.hidden = !!q && !row.dataset.search.includes(q); if (!row.hidden) count++; });
    const el = $('#peopleFilterCount'); if (el) el.textContent = count + '명 표시';
    const empty = $('#peopleFilterEmpty'); if (empty) empty.hidden = count > 0;
  }
  function vPeople() {
    if (currentKey !== getUserKey()) return pgh('조직·사람') + '<div class="box warn">계정이 변경되었습니다. 새로고침 후 확인하세요.</div>';
    if (!PEOPLE.tree && !PEOPLE.orgLoading && !PEOPLE.treeError && !PEOPLE.autoTree && typeof setTimeout === 'function') { PEOPLE.autoTree = true; setTimeout(() => { if (S.view === 'people') peopleLoadTree(); else PEOPLE.autoTree = false; }, 0); } // v1.9.0: 부서별 찾아보기를 한 번 더 누르지 않게
    const rows = (PEOPLE.items || []).map((p,i)=>({p,i}));
    const matches = p => !PEOPLE.localFilter.trim() || [p.name,peopleDisplayDept(p.dept),p.duty,p.position,p.tel,p.extension,p.email,p.work].some(v => String(v || '').toLowerCase().includes(PEOPLE.localFilter.trim().toLowerCase()));
    const visibleCount = rows.filter(({p}) => matches(p)).length;
    const cards = rows.map(({p,i}) => `<tr data-person-row ${matches(p) ? '' : 'hidden'} data-search="${esc([p.name,peopleDisplayDept(p.dept),p.duty,p.position,p.tel,p.extension,p.email,p.work].filter(Boolean).join(' ').toLowerCase())}"><th scope="row">${esc(p.name || '이름 미상')}</th><td>${esc(peopleDisplayDept(p.dept))}</td><td>${esc([p.duty,p.position].filter(Boolean).join(' / ') || '—')}</td><td>${esc(p.work || '—')}</td><td>${esc(p.tel || '—')}${p.extension ? `<br><span class="muted">내선 ${esc(p.extension)}</span>` : ''}</td><td>${esc(p.email || '—')}</td><td>${p.email ? `<button class="btn sm primary" data-act="personMail" data-i="${i}" aria-label="${esc(p.name)}에게 메일 쓰기">메일</button>` : ''}${p.tel ? ` <button class="btn sm" data-act="copy" data-v="${esc(p.tel)}" aria-label="${esc(p.name)} 전화번호 복사">전화 복사</button>` : ''}</td></tr>`).join('');
    const table = `<div style="overflow:auto;border:1px solid var(--line);border-radius:12px"><table class="people-table" style="width:100%;min-width:900px;border-collapse:collapse;text-align:left;font-size:13px"><caption class="sr-only">직원별 소속, 직책, 담당업무 및 연락처</caption><thead><tr>${['이름','소속','직책 / 직급','담당업무','전화 / 내선','이메일','연락'].map(x=>`<th scope="col" style="padding:12px;border-bottom:1px solid var(--line);white-space:nowrap">${x}</th>`).join('')}</tr></thead><tbody>${cards}<tr id="peopleFilterEmpty" ${visibleCount ? 'hidden' : ''}><td colspan="7" style="padding:18px">표 안의 조건에 맞는 직원이 없습니다. 검색어를 바꿔 보세요.</td></tr></tbody></table></div>`;
    const tree = PEOPLE.tree ? (() => {
      if (!PEOPLE.tree.length) return '<div class="box" role="status">조회된 부서가 없습니다.</div>';
      const official = peopleOfficialOrganization(PEOPLE.tree), officialKeys = new Set(official.flatMap(x => x.item ? [x.item.key] : []));
      const other = PEOPLE.tree.filter(x => !peopleIsBranchNode(x) && !officialKeys.has(x.key));
      return `<section aria-label="공식 조직도"><p class="muted">홈페이지 기준 공식 순서와 계층입니다. 정식 조직을 선택하면 연결된 분리 조직도 함께 조회합니다.</p>${peopleOfficialTree(official)}<p class="muted">비활성 항목은 현재 그룹웨어에서 독립 조회 키를 확인하지 못한 상태입니다. 이사회는 조직도 연결이 없을 때 연결 없음으로 표시합니다. 숫자가 아닌 키의 노사협의회 등은 현재 조직도 API 조회 대상이 아닙니다.</p>${other.length ? `<h3>기타 그룹웨어 조직</h3><ul class="org-other">${other.map(x => `<li><button class="chip ${PEOPLE.org === x.name ? 'on' : ''}" aria-pressed="${PEOPLE.org === x.name}" ${PEOPLE.loading ? 'disabled' : ''} data-act="peopleDept" data-v="${esc(x.key)}">${esc(x.name)} <span class="muted">${esc(x.count)}</span></button></li>`).join('')}</ul>` : ''}<p class="muted">분리된 조직 키는 선택지에 보이지 않습니다. 대응 키가 있으면 공식 부서 선택 시 함께 읽고, 이름 검색 소속은 ‘별도 조직키’로 표시합니다.</p></section>`;
    })() : `<div class="box" role="${PEOPLE.treeError ? 'alert' : 'status'}" aria-busy="${PEOPLE.orgLoading}">${PEOPLE.orgLoading ? '조직도를 읽고 있습니다…' : PEOPLE.treeError ? '조직도를 불러오지 못했습니다: '+esc(PEOPLE.treeError) : '부서별로 찾아보세요.'} <button class="btn sm" data-act="peopleTree" ${PEOPLE.orgLoading ? 'disabled' : ''}>${PEOPLE.treeError ? '다시 시도' : '조직도 불러오기'}</button></div>`;
    return pgh('조직·사람', '') + `<div class="bar"><input class="inp grow" id="peopleQuery" aria-label="직원 이름" placeholder="직원 이름 두 글자 이상" value="${esc(PEOPLE.query)}"><button class="btn primary" data-act="peopleSearch" ${PEOPLE.loading?'disabled':''}>검색</button></div><h2>부서별 찾아보기</h2>${tree}${PEOPLE.org ? `<h2>${esc(PEOPLE.org)} 구성원</h2>` : ''}${PEOPLE.loading ? '<div class="box" role="status" aria-busy="true">직원을 찾는 중입니다…</div>' : PEOPLE.error ? `<div class="box errb" role="alert">직원 조회 실패: ${esc(PEOPLE.error)} · 이름 검색 또는 부서를 선택해 다시 시도하세요.</div>` : PEOPLE.items ? `<p class="muted" role="status">조회 결과 ${PEOPLE.total == null ? PEOPLE.items.length+'건 조회됨' : PEOPLE.total+'건 중 '+PEOPLE.items.length+'건 조회됨'} · 동명이인은 소속을 확인하세요 · 메일은 작성 화면만 열립니다</p>${!PEOPLE.org && (PEOPLE.items.length >= 50 || PEOPLE.total > PEOPLE.items.length) ? '<div class="box warn" role="status">이름 검색은 최대 50건까지 조회합니다. 전체 결과가 아닐 수 있습니다. 이름을 더 구체적으로 입력하거나 부서별 찾아보기를 이용하세요.</div>' : ''}${PEOPLE.orgNote ? `<div class="box warn" role="status">${esc(PEOPLE.orgNote)}</div>` : ''}${PEOPLE.items.length === 0 ? '<div class="box" role="status">조회된 직원이 없습니다. 이름을 바꾸거나 다른 부서를 선택하세요.</div>' : ''}<div class="bar"><label for="peopleFilter" class="muted">표 안에서 찾기</label><input id="peopleFilter" class="inp grow" aria-label="표 안에서 이름 부서 담당업무 연락처 찾기" placeholder="이름, 부서, 담당업무, 연락처" value="${esc(PEOPLE.localFilter)}"></div><div id="peopleRows">${table}</div><p class="muted" id="peopleFilterCount" role="status" aria-live="polite">${visibleCount}명 표시</p>` : '<div class="box">이름을 입력해 그룹웨어 조직도에서 직원을 찾아보세요.</div>'}<p class="muted">쪽지·대화는 현재 그룹웨어 메뉴에서 사용할 수 없어 제공하지 않습니다.</p>`;
  }
