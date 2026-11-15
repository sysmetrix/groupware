// GW 비서 · 그룹웨어 알림과 사람 찾기 (read-only until the user opens a compose screen)
  const NTF = {items: null, loading: false, error: '', filter: 'all', type: 'all', at: '', seq: 0};
  const PEOPLE = {query: '', items: null, total: null, loading: false, error: '', seq: 0, tree: null, treeError: '', orgLoading: false, orgSeq: 0, org: '', localFilter: ''};
  const notificationLabel = type => ({EAPPROVAL:'전자결재', MAIL:'메일', BOARD:'게시판', RESOURCE:'자원', SCHEDULE:'일정', WORK:'업무관리'}[type] || type || '기타');
  function notificationTime(value) {
    const s = String(value || '');
    return /^\d{12}/.test(s) ? s.slice(0,4)+'.'+s.slice(4,6)+'.'+s.slice(6,8)+' '+s.slice(8,10)+':'+s.slice(10,12) : s || '시각 미상';
  }
  async function loadNotifications() {
    if (NTF.loading) return;
    const seq = ++NTF.seq, owner = currentKey; NTF.loading = true; NTF.error = ''; renderMain();
    try {
      const result = await GW.collect({modules:['alerts'], alertCount:100});
      if (seq !== NTF.seq || owner !== currentKey || owner !== getUserKey()) return;
      if (!result.status?.alerts?.ok || !Array.isArray(result.data?.alerts?.alerts)) throw new Error(result.status?.alerts?.message || '알림 응답을 확인할 수 없습니다.');
      NTF.items = result.data.alerts.alerts; NTF.at = result.collectedAt; if (NTF.type !== 'all' && !NTF.items.some(x => x.type === NTF.type)) NTF.type = 'all';
    } catch (e) { if (seq === NTF.seq && owner === currentKey) { NTF.items = null; NTF.error = String(e.message || e); } }
    finally { if (seq === NTF.seq) { NTF.loading = false; if (S.view === 'notifications') renderMain(); } }
  }
  function vNotifications() {
    if (currentKey !== getUserKey()) return pgh('통합알림') + '<div class="box warn">계정이 변경되었습니다. 새로고침 후 확인하세요.</div>';
    const list = NTF.items || [], unread = list.filter(x => !x.read).length;
    const types = [...new Set(list.map(x => x.type || '기타'))];
    const filtered = list.map((x,i)=>({x,i})).filter(({x}) => (NTF.filter === 'all' || !x.read) && (NTF.type === 'all' || x.type === NTF.type));
    const chip = (act, value, label, active) => `<button class="chip ${active ? 'on' : ''}" data-act="${act}" data-v="${esc(value)}" aria-pressed="${active}">${esc(label)}</button>`;
    const rows = filtered.map(({x,i}) => `<article class="card2" style="margin:8px 0"><div class="bar" style="margin:0"><span class="bdg tag">${esc(notificationLabel(x.type))}</span><b>${esc(x.title || x.head || '(제목 없음)')}</b><span class="muted">${x.read ? '읽음' : '안 읽음'}</span></div><p class="muted" style="margin:7px 0">${esc([x.head, x.dept, x.who, notificationTime(x.time)].filter(Boolean).join(' · '))}</p>${x.url && !/[{}]/.test(x.url) ? `<button class="btn sm" data-act="notificationOpen" data-i="${i}">원문 열기</button>` : '<span class="muted">원문 연결 확인 불가 · 그룹웨어에서 확인</span>'}</article>`).join('');
    return pgh('통합알림', '그룹웨어에서 최근 조회한 최대 100건 · 열기 전까지 읽음 상태를 변경하지 않습니다', `<button class="btn" data-act="notificationsLoad" ${NTF.loading?'disabled':''}>${NTF.loading?'불러오는 중…':'새로고침'}</button>`) +
      `<div class="bar">${chip('notificationsFilter','all','전체 '+(NTF.items === null ? '—' : list.length),NTF.filter==='all')}${chip('notificationsFilter','unread','안 읽음 '+(NTF.items === null ? '—' : unread),NTF.filter==='unread')}</div><div class="bar">${chip('notificationsType','all','모든 유형',NTF.type==='all')}${types.map(t=>chip('notificationsType',t,notificationLabel(t),NTF.type===t)).join('')}</div>${NTF.at ? `<p class="muted">조회 시각: ${esc(new Date(NTF.at).toLocaleString('ko-KR'))} · 전체 알림 수가 아닌 조회 범위의 건수입니다.</p>` : ''}${NTF.loading ? '<div class="box">그룹웨어 알림을 읽고 있습니다…</div>' : NTF.error ? `<div class="box errb">알림을 불러오지 못했습니다: ${esc(NTF.error)}</div>` : NTF.items === null ? '<div class="box">새로고침을 눌러 그룹웨어 알림을 불러오세요.</div>' : rows || '<div class="box">조건에 맞는 알림이 없습니다.</div>'}`;
  }
  function openNotification(i) {
    if (currentKey !== getUserKey()) return;
    const x = NTF.items?.[i]; if (!x || !x.url || /[{}]/.test(x.url)) return;
    openUrl(x.url, {title:x.title || x.head || '알림', unread:!x.read, what:'알림'});
  }
  async function peopleLoadTree() {
    if (PEOPLE.orgLoading) return; const seq = ++PEOPLE.orgSeq, owner = currentKey; PEOPLE.orgLoading = true; PEOPLE.treeError = ''; renderMain();
    try { const tree = await GW.organizationTree(); if (seq !== PEOPLE.orgSeq || owner !== currentKey || owner !== getUserKey()) return; PEOPLE.tree = tree.filter(x => x.name && /^d[0-9]+$/.test(x.key)).filter((x,i,a) => a.findIndex(y => y.key === x.key) === i); }
    catch (e) { if (seq === PEOPLE.orgSeq && owner === currentKey && owner === getUserKey()) PEOPLE.treeError = String(e.message || e); }
    finally { if (seq === PEOPLE.orgSeq) { PEOPLE.orgLoading = false; if (S.view === 'people') renderMain(); } }
  }
  async function peopleDept(key) {
    const selected = PEOPLE.tree?.find(x => x.key === key); if (!selected || PEOPLE.loading) return;
    const seq = ++PEOPLE.seq, owner = currentKey; PEOPLE.loading = true; PEOPLE.error = ''; PEOPLE.items = null; PEOPLE.query = ''; PEOPLE.localFilter = ''; PEOPLE.org = selected.name; renderMain();
    try { const rows = await GW.organizationMembers(key); if (seq !== PEOPLE.seq || owner !== currentKey || owner !== getUserKey()) return; PEOPLE.items = rows; PEOPLE.total = rows.length; }
    catch (e) { if (seq === PEOPLE.seq && owner === currentKey) PEOPLE.error = String(e.message || e); }
    finally { if (seq === PEOPLE.seq) { PEOPLE.loading = false; if (S.view === 'people') renderMain(); } }
  }
  async function peopleSearch() {
    const q = String(PEOPLE.query || '').trim();
    if (q.length < 2) { toast('직원 이름을 두 글자 이상 입력하세요.'); return; }
    const seq = ++PEOPLE.seq, owner = currentKey; PEOPLE.loading = true; PEOPLE.error = ''; PEOPLE.items = null; PEOPLE.localFilter = ''; PEOPLE.org = ''; renderMain();
    try {
      const result = await GW.search(q, {types:['person'], pageSize:50});
      if (seq !== PEOPLE.seq || owner !== currentKey || owner !== getUserKey()) return;
      const g = result.groups?.person; if (!g || g.error || !Array.isArray(g.items)) throw new Error(g?.message || '직원 검색 결과를 확인할 수 없습니다.');
      PEOPLE.items = g.items; PEOPLE.total = g.reliableTotal;
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
  }
  function vPeople() {
    if (currentKey !== getUserKey()) return pgh('조직·사람 찾기') + '<div class="box warn">계정이 변경되었습니다. 새로고침 후 확인하세요.</div>';
    const rows = (PEOPLE.items || []).map((p,i)=>({p,i}));
    const matches = p => !PEOPLE.localFilter.trim() || [p.name,p.dept,p.duty,p.position,p.tel,p.extension,p.email,p.work].some(v => String(v || '').toLowerCase().includes(PEOPLE.localFilter.trim().toLowerCase()));
    const cards = rows.map(({p,i}) => `<tr data-person-row ${matches(p) ? '' : 'hidden'} data-search="${esc([p.name,p.dept,p.duty,p.position,p.tel,p.extension,p.email,p.work].filter(Boolean).join(' ').toLowerCase())}"><th scope="row">${esc(p.name || '이름 미상')}</th><td>${esc(p.dept || '—')}</td><td>${esc([p.duty,p.position].filter(Boolean).join(' / ') || '—')}</td><td>${esc(p.work || '—')}</td><td>${esc(p.tel || '—')}${p.extension ? `<br><span class="muted">내선 ${esc(p.extension)}</span>` : ''}</td><td>${esc(p.email || '—')}</td><td>${p.email ? `<button class="btn sm primary" data-act="personMail" data-i="${i}" aria-label="${esc(p.name)}에게 메일 쓰기">메일</button>` : ''}${p.tel ? ` <button class="btn sm" data-act="copy" data-v="${esc(p.tel)}" aria-label="${esc(p.name)} 전화번호 복사">전화 복사</button>` : ''}</td></tr>`).join('');
    const table = `<div style="overflow:auto;border:1px solid var(--line);border-radius:12px"><table class="people-table" style="width:100%;min-width:900px;border-collapse:collapse;text-align:left;font-size:13px"><caption class="sr-only">직원별 소속, 직책, 담당업무 및 연락처</caption><thead><tr>${['이름','소속','직책 / 직급','담당업무','전화 / 내선','이메일','연락'].map(x=>`<th scope="col" style="padding:12px;border-bottom:1px solid var(--line);white-space:nowrap">${x}</th>`).join('')}</tr></thead><tbody>${cards || '<tr><td colspan="7" style="padding:18px">조건에 맞는 직원이 없습니다.</td></tr>'}</tbody></table></div>`;
    const tree = PEOPLE.tree ? '<div class="bar">'+PEOPLE.tree.map(x => `<button class="chip" data-act="peopleDept" data-v="${esc(x.key)}">${esc(x.name)} <span class="muted">${x.count}</span></button>`).join('')+'</div>' : `<div class="box">${PEOPLE.orgLoading ? '조직도를 읽고 있습니다…' : PEOPLE.treeError ? '조직도를 불러오지 못했습니다: '+esc(PEOPLE.treeError) : '부서별로 찾아보세요.'} <button class="btn sm" data-act="peopleTree">${PEOPLE.treeError ? '다시 시도' : '조직도 불러오기'}</button></div>`;
    return pgh('조직·사람 찾기', '이름으로 검색하고 소속과 연락처를 확인한 뒤 메일을 작성합니다') + `<div class="bar"><input class="inp grow" id="peopleQuery" aria-label="직원 이름" placeholder="직원 이름 두 글자 이상" value="${esc(PEOPLE.query)}"><button class="btn primary" data-act="peopleSearch" ${PEOPLE.loading?'disabled':''}>검색</button></div><p class="muted">동명이인은 소속과 주소를 확인하세요. 메일은 작성 화면만 열리며 자동 발송하지 않습니다.</p><h2>부서별 찾아보기</h2>${tree}${PEOPLE.org ? `<h2>${esc(PEOPLE.org)} 구성원</h2>` : ''}${PEOPLE.loading ? '<div class="box">직원을 찾는 중입니다…</div>' : PEOPLE.error ? `<div class="box errb">직원 검색 실패: ${esc(PEOPLE.error)}</div>` : PEOPLE.items ? `<p class="muted">검색 결과 ${PEOPLE.total == null ? PEOPLE.items.length+'건 조회됨' : PEOPLE.total+'건 중 '+PEOPLE.items.length+'건 표시'}</p><div class="bar"><label for="peopleFilter" class="muted">표 안에서 찾기</label><input id="peopleFilter" class="inp grow" aria-label="표 안에서 이름 부서 담당업무 연락처 찾기" placeholder="이름, 부서, 담당업무, 연락처" value="${esc(PEOPLE.localFilter)}"></div><div id="peopleRows">${table}</div><p class="muted" id="peopleFilterCount">${rows.filter(({p}) => matches(p)).length}명 표시</p>` : '<div class="box">이름을 입력해 그룹웨어 조직도에서 직원을 찾아보세요.</div>'}<p class="muted">쪽지·대화는 현재 그룹웨어 메뉴에서 사용할 수 없어 제공하지 않습니다.</p>`;
  }
