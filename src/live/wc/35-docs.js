// GW 비서 · 문서 찾기 (부서원이 기안한 문서·부서로 접수된 문서·부서가 발송한 문서·재단 전체 문서를 한 번에 검색)
// 그룹웨어 통합검색(결재문서)만 쓴다. 한 번 찾은 결과를 구분·부서·양식·낱말로 이 화면에서 거르므로 거를 때는 그룹웨어에 다시 묻지 않는다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const DF_PAGE = 50;
  function dfState() {
    if (!S.docs) S.docs = {kw: '', period: '12', items: [], total: 0, page: 0, busy: false, err: '', searched: '', filter: {kind: 'all', dept: 'mine', form: '', q: '', sort: 'new'}, seq: 0};
    return S.docs;
  }
  const dfMyDept = () => (S.raw && S.raw.principal && S.raw.principal.deptName) || '';
  const dfSaved = () => R.dfKeywords(store.get('dfSaved', []), 12);
  const dfRecent = () => R.dfKeywords(store.get('dfRecent', []), 6);

  async function dfRun(kw, more = false) {
    const st = dfState();
    const k = String(kw ?? st.kw).trim();
    if (k.length < 2) { toast('검색어를 두 글자 이상 입력하세요.'); return; }
    if (st.busy) return;
    const page = more ? st.page + 1 : 1, seq = ++st.seq;
    st.kw = k; st.busy = true; st.err = '';
    if (!more) { st.items = []; st.total = 0; st.page = 0; st.filter.form = ''; st.filter.q = ''; if (!['all', 'mine'].includes(st.filter.dept)) st.filter.dept = 'all'; }
    if (S.view !== 'docs') go('docs'); else renderMain();
    try {
      const r = await GW.search(k, {types: ['doc'], pageSize: DF_PAGE, page, from: periodFrom(st.period)});
      if (seq !== st.seq) return;
      const g = (r.groups && r.groups.doc) || {items: [], total: 0};
      if (g.error) throw new Error(g.message || '검색하지 못했습니다.');
      st.items = R.dfPrepare([...st.items, ...g.items], dfMyDept());
      st.total = Math.max(g.total || 0, st.items.length); st.page = page; st.searched = k;
      st.done = !g.items.length || st.items.length >= st.total;
      // 내 부서 문서가 한 건도 없으면 '내 부서' 필터 때문에 빈 화면이 되지 않게 전체로 넓힌다.
      if (!more && st.filter.dept === 'mine' && !st.items.some(d => d.mine)) { st.filter.dept = 'all'; st.widened = true; } else if (!more) st.widened = false;
      store.set('dfRecent', R.dfKeywords([k, ...dfRecent()], 6));
    } catch (e) { if (seq === st.seq) st.err = String(e.message || e).slice(0, 160); }
    if (seq !== st.seq) return;
    st.busy = false;
    if (S.view === 'docs') renderMain();
  }

  function dfRow(d, kw) {
    const sel = S.sel && S.sel.type === 'search' && S.sel.item && S.sel.item.docId === d.docId;
    const when = d.ymd ? `${d.ymd.slice(4, 6)}/${d.ymd.slice(6, 8)}` : '';
    const who = [d.kind === 'send' && d.to ? `→ ${d.to}` : '', d.drafter, d.docNo].filter(Boolean).map(esc).join(' · ');
    return `<div class="row lean df-row df-${d.kind} ${sel ? 'sel' : ''}" role="listitem" tabindex="0" data-act="dfSel" data-id="${esc(d.docId)}" title="${esc([d.title, d.form, d.dept, d.drafter, d.docNo].filter(Boolean).join(' · '))}">
      <span class="bdg df-b df-${d.kind}">${R.DF_KIND_NAME[d.kind]}</span>
      <div class="mn"><span class="t">${hl(d.title, kw)}</span><span class="what"><span class="df-dept ${d.mine ? 'me' : ''}">${esc(d.dept)}</span>${who ? ' · ' + who : ''}</span></div>
      ${d.files && d.files.length ? `<span class="bdg tag" title="${esc(d.files.map(f => f.name).join(', '))}">${ic('clip')}${d.files.length}</span>` : ''}
      <span class="w">${esc(when)}</span>
    </div>`;
  }

  function dfListHtml() {
    const st = dfState(), f = st.filter;
    const list = R.dfApply(st.items, f);
    if (!list.length) return `<div class="list"><div class="empty"><b>조건에 맞는 문서가 없습니다</b>${st.items.length ? '구분·부서·양식 조건을 풀어 보세요.' : '검색어나 기간을 바꿔 보세요.'}${st.items.length ? '<div class="acts" style="justify-content:center"><button class="btn sm" data-act="dfReset">조건 모두 풀기</button></div>' : ''}</div></div>`;
    const groups = f.sort === 'rel' ? [{label: '', items: list}] : R.dfMonths(list);
    return groups.map(g => `${g.label ? `<div class="grp">${esc(g.label)}<span class="c">${g.items.length}</span></div>` : ''}<div class="list" role="list">${g.items.map(d => dfRow(d, st.searched)).join('')}</div>`).join('');
  }

  function dfFiltersHtml() {
    const st = dfState(), f = st.filter, c = R.dfCounts(st.items, f), my = dfMyDept();
    const kindBtn = (k, n) => `<button role="tab" aria-selected="${f.kind === k}" class="${f.kind === k ? 'on' : ''} ${k !== 'all' ? 'df-k df-' + k : ''}" data-act="dfKind" data-v="${k}">${k !== 'all' ? '<i></i>' : ''}${n}<span class="c">${c.kinds[k] || 0}</span></button>`;
    const others = c.depts.filter(([d]) => !R.dfSameDept(d, my));
    const deptSel = !['all', 'mine'].includes(f.dept);
    return `<div class="bar df-filters">
  <div class="seg" role="tablist" aria-label="문서 구분">${kindBtn('all', '전체')}${R.DF_KINDS.map(([k, n]) => kindBtn(k, n)).join('')}</div>
  <div class="seg" role="tablist" aria-label="부서">
    ${my ? `<button role="tab" aria-selected="${f.dept === 'mine'}" class="${f.dept === 'mine' ? 'on' : ''}" data-act="dfDept" data-v="mine" title="${esc(my)}">내 부서<span class="c">${c.mine}</span></button>` : ''}
    <button role="tab" aria-selected="${f.dept === 'all'}" class="${f.dept === 'all' ? 'on' : ''}" data-act="dfDept" data-v="all">재단 전체<span class="c">${c.deptAll}</span></button>
  </div>
  ${others.length || deptSel ? `<select class="f ${deptSel ? 'on' : ''}" id="dfDeptSel" aria-label="다른 부서 고르기"><option value="">다른 부서…</option>${others.map(([d, n]) => `<option value="${esc(d)}" ${f.dept === d ? 'selected' : ''}>${esc(d)} (${n})</option>`).join('')}</select>` : ''}
  ${c.forms.length > 1 || f.form ? `<select class="f ${f.form ? 'on' : ''}" id="dfFormSel" aria-label="양식"><option value="">모든 양식</option>${c.forms.map(([n, k]) => `<option value="${esc(n)}" ${f.form === n ? 'selected' : ''}>${esc(n)} (${k})</option>`).join('')}</select>` : ''}
  <label class="srch-in" style="flex:1;min-width:150px;display:flex"><input class="inp grow" id="dfIn" placeholder="결과 안에서 찾기 (제목·문서번호·기안자)" value="${esc(f.q)}" aria-label="결과 안에서 찾기"></label>
  <select class="f" id="dfSortSel" aria-label="정렬">${[['new', '최신순'], ['old', '오래된순'], ['rel', '관련도순']].map(([v, n]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
</div>`;
  }

  function vDocs() {
    const st = dfState(), my = dfMyDept();
    const saved = dfSaved(), recent = dfRecent().filter(k => !saved.includes(k));
    const isSaved = st.searched && saved.includes(st.searched);
    const shown = st.items.length ? R.dfApply(st.items, st.filter).length : 0;
    const sub = st.busy && !st.items.length ? '' : st.searched ? `“${esc(st.searched)}” ${st.total}건${st.items.length < st.total ? ` 중 ${st.items.length}건 불러옴` : ''}${shown !== st.items.length ? ` · 조건에 맞는 문서 ${shown}건` : ''}` : '기안·접수·발송 문서를 한 번에 찾고, 구분과 부서로 걸러 봅니다';
    const chips = (list, cls, del) => list.map(k => `<span class="df-chipw"><button class="chip ${cls}" data-act="dfChip" data-v="${esc(k)}">${ic(del ? 'star' : 'search')}${esc(k)}</button>${del ? `<button class="df-x" data-act="dfUnsave" data-v="${esc(k)}" title="저장한 검색에서 빼기" aria-label="${esc(k)} 저장 해제">${ic('x')}</button>` : ''}</span>`).join('');
    const quick = `<div class="bar df-quick">${my ? `<button class="chip df-mine" data-act="dfChip" data-v="${esc(my)}" title="문서번호에 부서 이름이 들어간 문서를 찾습니다">${ic('doc')}${esc(my)} 문서 모두</button>` : ''}${chips(saved, 'on', true)}${chips(recent, '', false)}</div>`;
    const body = st.err ? `<div class="box errb">${esc(st.err)} <button class="btn sm" data-act="dfSearch">다시 시도</button></div>`
      : st.busy && !st.items.length ? `<div class="list">${'<div class="sk row"></div>'.repeat(6)}</div><p class="muted"><span class="spin"></span> “${esc(st.kw)}” 문서를 찾는 중입니다…</p>`
      : !st.searched ? `<div class="card2"><div class="ct">이렇게 씁니다</div><ul class="df-help"><li>검색어 하나로 <b>기안·접수·발송 문서를 한 번에</b> 찾습니다. 줄 앞의 색으로 구분합니다: <span class="bdg df-b df-draft">기안</span> <span class="bdg df-b df-recv">접수</span> <span class="bdg df-b df-send">발송</span></li><li>찾은 뒤 <b>구분·내 부서/재단 전체·양식</b>으로 거릅니다. 거를 때는 그룹웨어에 다시 묻지 않아 바로 바뀝니다.</li><li>줄을 누르면 오른쪽에 본문 미리보기가 열립니다. 검색과 미리보기는 열람 기록을 남기지 않습니다.</li><li>자주 찾는 말은 검색 뒤 <b>☆ 저장</b>을 눌러 두면 위에 버튼으로 남습니다.</li></ul></div>`
      : `${st.widened ? `<p class="muted lean-note">내 부서 문서가 없어 재단 전체 결과를 보여 드립니다.</p>` : ''}${dfFiltersHtml()}<div id="dfList">${dfListHtml()}</div>${!st.done ? `<div class="acts" style="justify-content:center;margin-top:12px"><button class="btn" data-act="dfMore" ${st.busy ? 'disabled' : ''}>${st.busy ? '<span class="spin"></span> 불러오는 중' : `${ic('down')}다음 ${Math.min(DF_PAGE, st.total - st.items.length)}건 더 불러오기`}</button></div>` : ''}<p class="muted df-foot">구분은 양식 이름과 본문의 수신자 줄로 추정합니다(수신자가 내부결재가 아니면 발송). 내가 볼 권한이 있는 문서만 나옵니다.</p>`;
    return `${pgh('문서 찾기', sub, st.searched && !st.busy ? `<button class="btn sm ${isSaved ? 'on' : ''}" data-act="${isSaved ? 'dfUnsave' : 'dfSave'}" data-v="${esc(st.searched)}" title="${isSaved ? '저장한 검색에서 빼기' : '이 검색어를 버튼으로 저장'}">${ic('star')}${isSaved ? '저장됨' : '저장'}</button>` : '')}
<div class="bar"><input class="inp grow" id="dfq" placeholder="검색어 (예: 월간업무보고, 문서번호, 기안자 이름)" value="${esc(st.kw)}" aria-label="문서 검색어"><select class="f" id="dfPeriod" aria-label="기간">${[['1', '최근 1개월'], ['3', '최근 3개월'], ['12', '최근 1년'], ['', '전체 기간']].map(([v, n]) => `<option value="${v}" ${st.period === v ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="btn primary" data-act="dfSearch" ${st.busy ? 'disabled' : ''}>${ic('search')}찾기</button></div>
${quick}
${body}`;
  }
  // 목록만 다시 그린다(결과 안에서 찾기 입력 중에 입력창을 건드리지 않도록).
  function dfRefreshList() { const l = $('#dfList'); if (l) l.innerHTML = dfListHtml(); }
  function dfChange(t) {
    const st = dfState();
    if (t.id === 'dfDeptSel') { st.filter.dept = t.value || 'all'; renderMain(); }
    else if (t.id === 'dfFormSel') { st.filter.form = t.value; renderMain(); }
    else if (t.id === 'dfSortSel') { st.filter.sort = t.value; dfRefreshList(); }
    else if (t.id === 'dfPeriod') { st.period = t.value; if (st.searched) dfRun(st.searched); }
    else return false;
    return true;
  }
  function dfAct(act, el, v) {
    const st = dfState();
    switch (act) {
      case 'dfSearch': { const i = $('#dfq'); dfRun(i ? i.value : st.kw); break; }
      case 'dfChip': dfRun(v); break;
      case 'dfMore': dfRun(st.searched, true); break;
      case 'dfKind': st.filter.kind = v; renderMain(); break;
      case 'dfDept': st.filter.dept = v; st.widened = false; renderMain(); break;
      case 'dfReset': st.filter = {...st.filter, kind: 'all', dept: 'all', form: '', q: ''}; renderMain(); break;
      case 'dfSave': store.set('dfSaved', R.dfKeywords([v, ...dfSaved()], 12)); renderMain(); toast('저장했습니다. 위의 버튼으로 바로 찾을 수 있습니다.'); break;
      case 'dfUnsave': store.set('dfSaved', dfSaved().filter(k => k !== v)); renderMain(); break;
      case 'dfSel': { if (!leavePane()) break; const it = st.items.find(d => d.docId === el.dataset.id); if (it) { S.sel = {type: 'search', item: it, kw: st.searched}; S.pane.url = ''; S.pane.extract = null; renderMain(); renderPane(); } break; }
      default: break;
    }
  }
