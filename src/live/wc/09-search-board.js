// GW 비서 · 통합검색
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  async function loadCaseFlow(q) {
    const box = $('#caseFlow');
    if (!q || !box) { if (q) { S.search.kw = q; runSearch(['doc', 'mail']); } return; }
    box.innerHTML = '<div class="box"><span class="spin"></span> 관련 사안(결재문서·메일) 흐름을 묶는 중…</div>';
    try {
      const r = await GW.search(q, {types: ['doc', 'mail'], pageSize: 6});
      const items = [
        ...(r.groups?.doc?.items || []).map(x => ({kind: '결재', title: x.title, sub: x.docNo || x.drafter || '', date: String(x.date || '').slice(0, 10), url: x.url || ''})),
        ...(r.groups?.mail?.items || []).map(x => ({kind: '메일', title: x.subject, sub: x.from || '', date: String(x.date || '').slice(0, 10), url: ''})),
      ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
      box.innerHTML = `<div class="box tip"><b>관련 사안 흐름</b> <span class="muted">“${esc(q)}” 기준 ${items.length}건</span>${items.length ? items.map(it => `<div class="trow"><span><span class="bdg tag">${esc(it.kind)}</span> ${esc(it.title)}${it.sub ? ` <span class="muted">(${esc(it.sub)})</span>` : ''}</span><span class="muted nowrap">${esc(it.date)}${it.url ? ` <button class="btn sm ghost" data-act="openUrl" data-url="${esc(it.url)}" data-title="${esc(it.title)}">열기</button>` : ''}</span></div>`).join('') : '<div class="muted" style="margin-top:4px">연결된 사안 문서를 찾지 못했습니다.</div>'}</div>`;
    } catch (e) { box.innerHTML = `<div class="box warn">사안 흐름을 읽지 못했습니다: ${esc(e.message)}</div>`; }
  }

  // ----- 통합검색 -----
  const cleanSnip = t => String(t || '').replace(/^[\s\S]{0,80}?수신자[\s\S]{0,160}?제목\s*/, '').replace(/\s+/g, ' ').trim();
  const periodFrom = p => { if (!p) return ''; const d = new Date(); d.setMonth(d.getMonth() - Number(p)); return R.kstNow(d).date.replace(/-/g, ''); };
  let searchSeq = 0;
  const searchDateText = d => String(d).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  const searchTypeLabel = type => type === 'doc' ? '결재문서' : GW.searchLabels[type] || type;
  const searchTotal = g => (g.reliableTotal === undefined ? g.total : g.reliableTotal) ?? null;
  const searchCanPage = g => !g.error && !g.exhausted && (searchTotal(g) == null ? g.items.length > 0 : searchTotal(g) > g.items.length);
  function carrySearchInputs(from, to) {
    if (!(from === 'search' && to === 'docs' || from === 'docs' && to === 'search')) return;
    const src = from === 'search' ? S.search : dfState(), dst = to === 'search' ? S.search : dfState();
    src.kw = $(from === 'search' ? '#sq' : '#dfq')?.value ?? src.kw;
    src.period = $(from === 'search' ? '#speriod' : '#dfPeriod')?.value ?? src.period;
    dst.kw = src.kw; dst.period = src.period;
  }
  function searchFromInputs() {
    const q = $('#sq'), p = $('#speriod');
    if (q) S.search.kw = q.value.trim();
    if (p) S.search.period = p.value;
    return runSearch();
  }
  function vSearch() {
    const s = S.search, res = s.res;
    const types = Object.keys(GW.searchLabels).filter(k => k !== 'note');
    const group = (type, render) => {
      const g = res?.groups?.[type]; if (!g) return '';
      const n = searchTotal(g), count = g.items.length;
      return `<h2>${esc(searchTypeLabel(type))} <span class="muted">${g.error ? '조회 실패' : n == null ? `${count}건 확인 · 전체 건수 미확인` : n > count ? `${n}건 중 ${count}건 확인` : `${n}건`}</span>${searchCanPage(g) ? `<button class="btn sm ghost" data-act="searchMore" data-t="${type}" ${s.moreBusy?.[type] ? 'disabled' : ''}>${s.moreBusy?.[type] ? '불러오는 중…' : '더 보기'}</button>` : ''}</h2>${g.error ? `<div class="box errb">${esc(g.message)}</div>` : count ? `<div class="list" role="list">${g.items.map(render).join('')}</div>` : n === 0 ? '<div class="muted">이 검색 범위에서 결과 0건</div>' : '<div class="muted">결과 유무를 확인하지 못했습니다.</div>'}${g.exhausted && n > count ? '<p class="muted">추가 응답이 없어 전체 결과를 확인하지 못했습니다.</p>' : ''}`;
    };
    const row = (t, id, pill, title, desc, when) => `<div class="row ${S.sel && S.sel.type === 'search' && S.sel.item && (S.sel.item.docId || S.sel.item.uid || S.sel.item.id || S.sel.item.fileId) === id ? 'sel' : ''}" role="listitem" tabindex="0" data-act="selSearch" data-t="${t}" data-id="${esc(id)}" style="grid-template-columns:90px 1fr auto"><span class="bdg tag">${esc(pill)}</span><div class="mn"><div class="t">${title}</div><div class="fx">${desc}</div></div><div class="w">${esc(when)}</div></div>`;
    const byType = res?.groups || {}, groups = Object.values(byType), query = s.searchQuery;
    const missing = !!res && ((query && query.types.some(t => !byType[t])) || !groups.length || groups.some(g => g.error || g.pageError || searchTotal(g) == null || ((g.exhausted || !g.items.length) && searchTotal(g) > g.items.length)));
    const count = groups.reduce((n, g) => n + (g.error ? 0 : g.items.length), 0);
    const zero = !!res && !missing && groups.every(g => searchTotal(g) === 0);
    const busy = s.busy ? `<div class="list">${'<div class="sk row"></div>'.repeat(4)}</div><p class="muted"><span class="spin"></span> “${esc(s.kw)}” 검색 중입니다…</p>` : '';
    return `${pgh('통합검색', '결재문서·메일 등 여러 자료에서 찾습니다')}
<div class="bar"><input class="inp grow" id="sq" placeholder="검색어 (예: 월간업무보고, 문서번호, 사람 이름)" value="${esc(s.kw)}" aria-label="검색어"><select class="f" id="speriod" aria-label="기간">${[['', '전체 기간'], ['1', '최근 1개월'], ['3', '최근 3개월'], ['12', '최근 1년']].map(([v, n]) => `<option value="${v}" ${s.period === v ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="btn primary" data-act="doSearch" ${s.busy ? 'disabled' : ''}>${ic('search')}검색</button></div>
<div class="bar"><span class="muted">찾을 곳</span>${types.map(k => `<button class="chip ${s.types.includes(k) ? 'on' : ''}" data-act="stype" data-v="${k}" aria-pressed="${s.types.includes(k)}">${s.types.includes(k) ? ic('check') : ''}${esc(searchTypeLabel(k))}</button>`).join('')}</div>
${busy}
<p class="muted">계정에 보이는 그룹웨어 검색 색인 기준입니다. 결과가 없어도 권한 밖이거나 색인에 없는 자료의 존재 여부는 확인할 수 없습니다.</p>
${!res && !s.busy ? `<div class="card2"><div class="ct">이렇게 찾아보세요</div><div class="bar" style="margin:0">${['월간업무보고', '시간외근무', '노동이사제', '일상감사', ...(S.searchRecent || [])].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8).map(k => `<button class="chip" data-act="searchExample" data-v="${esc(k)}">${ic('search')}${esc(k)}</button>`).join('')}</div><p class="muted" style="margin:10px 0 0">결과를 누르면 오른쪽에 본문 미리보기가 열립니다. 미리보기와 검색은 열람 기록이나 그룹웨어 최근 검색어를 남기지 않습니다.</p></div>` : ''}
${res && !s.busy ? `<p role="status">“${esc(res.keyword)}” · ${query?.from ? `${searchDateText(query.from)} ~ ${searchDateText(query.to || '')}` : '전체 기간'}${zero ? ' · 이 범위에서 결과 0건' : count ? ` · ${count}건 확인` : ''}${missing ? ' · 일부 조회 실패 또는 범위 미확인' : ''}</p>` + [
      group('doc', x => row('doc', x.docId, '결재문서', hl(x.title, res.keyword), `${x.form ? esc(x.form) + ' · ' : ''}${esc(x.docNo)} · ${esc(x.dept)} ${esc(x.drafter)} · ${hl(cleanSnip(x.snippet), res.keyword)}`, ymd8(x.date))),
      group('mail', x => row('mail', x.uid, '메일', hl(x.subject || '(제목 없음)', res.keyword), `${esc(x.from)} → ${esc(x.to)} · ${hl(x.snippet, res.keyword)}`, shortWhen(x.date))),
      group('board', x => row('board', x.id, '게시판', hl(x.title, res.keyword), `${x.catTitle ? esc(x.catTitle) + ' · ' : ''}${esc(x.writer)} · ${hl(x.snippet, res.keyword)}`, String(x.date).slice(0, 10))),
      group('file', x => row('file', x.fileId, '첨부파일', hl(x.name, res.keyword), `${x.ext ? esc(x.ext.toUpperCase()) + ' · ' : ''}${esc(x.parent)} · ${esc(x.owner)}`, String(x.date).slice(0, 10))),
      group('schedule', x => row('schedule', x.id, '일정', hl(x.title, res.keyword), hl(x.snippet, res.keyword), String(x.start).slice(0, 10))),
      group('person', x => `<div class="row" role="listitem" style="grid-template-columns:90px 1fr auto"><span class="bdg tag">사람</span><div class="mn"><div class="t">${esc(x.name)} ${esc(x.duty || x.position)}</div><div class="fx">${esc(x.dept)}${x.tel ? ' · ☎ ' + esc(x.tel) : ''}${x.email ? ' · ' + esc(x.email) : ''}</div></div><div>${x.email ? `<button class="btn sm" data-act="copy" data-v="${esc(x.email)}">메일 주소 복사</button>` : ''}</div></div>`),
      group('contact', x => `<div class="row" role="listitem" style="grid-template-columns:90px 1fr auto"><span class="bdg tag">연락처</span><div class="mn"><div class="t">${esc(x.name)} ${esc(x.rank)}</div><div class="fx">${esc(x.company)} ${esc(x.dept)}${x.tel ? ' · ☎ ' + esc(x.tel) : ''}${x.email ? ' · ' + esc(x.email) : ''}</div></div><div></div></div>`),
    ].join('') : ''}`;
  }
  async function runSearch(types) {
    const s = S.search, kw = s.kw.trim();
    if (kw.length < 2) { toast('검색어를 두 글자 이상 입력하세요.'); return; }
    const selected = types || s.types;
    if (!selected.length) { toast('찾을 곳을 하나 이상 선택하세요.'); return; }
    const from = periodFrom(s.period);
    const seq = ++searchSeq, query = {kw, from, to: from ? R.kstNow(new Date()).date.replace(/-/g, '') : '', types: [...selected]};
    s.busy = true; s.res = null; s.moreBusy = {}; S.view = 'search'; render();
    try {
      const res = await GW.search(query.kw, {types: query.types, pageSize: 10, from: query.from, to: query.to});
      if (seq !== searchSeq || S.search !== s) return;
      s.res = res; s.searchQuery = query; s.more = {};
      S.searchRecent = [kw, ...(S.searchRecent || []).filter(k => k !== kw)].slice(0, 5);
    } catch (e) { if (seq === searchSeq && S.search === s) toast('검색하지 못했습니다: ' + e.message); }
    finally { if (seq === searchSeq && S.search === s) { s.busy = false; render(); } }
  }
  async function searchMore(type) {
    const s = S.search, res = s.res, query = s.searchQuery, g = res?.groups?.[type];
    if (s.busy || !query || !g || !searchCanPage(g)) return;
    const locks = s.moreBusy || (s.moreBusy = {});
    if (locks[type]) return;
    locks[type] = true;
    const seq = searchSeq, page = (s.more[type] || 1) + 1;
    renderMain();
    try {
      const r = await GW.search(query.kw, {types: [type], pageSize: 10, page, from: query.from, to: query.to});
      if (seq !== searchSeq || S.search !== s || s.res !== res || s.searchQuery !== query) return;
      const next = r.groups[type];
      if (!next || next.error) throw new Error(next?.message || '결과를 불러오지 못했습니다.');
      if (!next.items.length) g.exhausted = true;
      g.items = [...g.items, ...next.items]; s.more[type] = page; g.pageError = false;
    } catch (err) { if (seq === searchSeq && S.search === s && s.res === res) { g.pageError = true; toast(err.message); } }
    finally {
      delete locks[type];
      if (seq === searchSeq && S.search === s && s.res === res) renderMain();
    }
  }

  // ----- 할 일 보드 (drag & drop) -----
  const BUCKETS = [['late', '밀린 일'], ['today', '오늘'], ['tomorrow', '내일'], ['week', '이번 주'], ['later', '나중에'], ['wait', '결재 대기'], ['done', '끝냄·숨김']];
  const BUCKET_NAME = Object.fromEntries(BUCKETS);
  const onBoard = x => x.scope !== 'ref' || !!S.plan[x.key];
  const boardLinked = x => S.todos.some(t => t.key === x.key && t.status !== 'done');
  const endOfWeek = () => { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return R.kstNow(d).date; };
  const plusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return R.kstNow(d).date; };
  function bucketOfTodo(t) {
    if (t.status === 'done') return 'done';
    if (BUCKET_NAME[S.plan[`todo:${t.id}`]]) return S.plan[`todo:${t.id}`];
    if (!t.due) return 'later';
    const n = R.dday(t.due);
    return n < 0 ? 'late' : n === 0 ? 'today' : n === 1 ? 'tomorrow' : t.due <= endOfWeek() ? 'week' : 'later';
  }
  function bucketOfAction(x) {
    if (isHidden(x.key) && !resurfaced(x.key)) return 'done';
    const st = stateOf(x);
    if (st === 'wait') return 'wait';
    if (BUCKET_NAME[S.plan[x.key]]) return S.plan[x.key];
    if (isSnoozed(x.key)) return 'tomorrow';
    if (st === 'overdue') return 'late';
    if (st === 'urgent' || (x.deadline && x.deadline.dday <= 0)) return 'today';
    if (x.deadline && x.deadline.dday === 1) return 'tomorrow';
    if (x.type === 'attendance' && String(x.when).slice(0, 10) < today()) return 'late';
    return 'week';
  }
  function vBoard() {
    const cards = [];
    for (const x of S.a.actions) if (onBoard(x) && !boardLinked(x)) cards.push({id: x.key, kind: 'act', b: bucketOfAction(x), title: x.title, sub: x.headline || x.kind, pri: x.priority});
    for (const t of S.todos) cards.push({id: `todo:${t.id}`, kind: 'todo', b: bucketOfTodo(t), title: t.title, sub: `${t.due ? `기한 ${t.due.slice(5).replace('-', '/')} (${ddayText(R.dday(t.due))})` : '기한 없음'}${t.source ? ' · ' + t.source : ''}`});
    return `${pgh('할 일', '카드를 끌어 계획 칸을 옮깁니다 · 실제 기한은 그대로')}
<div class="bar"><input class="inp grow" id="tdTitle" placeholder="새 할 일을 쓰고 Enter" aria-label="새 할 일"><input class="inp" id="tdDue" placeholder="기한 (예: 11/12)" style="width:140px" aria-label="기한"><button class="btn primary" data-act="addTodo">${ic('plus')}추가</button></div>
<div class="board">${BUCKETS.map(([b, n]) => { const cs = cards.filter(c => c.b === b); return `<div class="col" ${b === 'wait' ? '' : `data-drop="${b}"`}><div class="col-h"><span>${n}</span><span class="muted">${cs.length}</span></div>${cs.map(c => `<div class="card ${c.kind} ${c.pri || ''}" draggable="${c.b !== 'wait'}" data-drag="${esc(c.id)}" data-act="boardCard" data-k="${esc(c.id)}" tabindex="0" title="누르면 내용 보기 · 계획 이동 버튼으로 칸 변경"><div>${esc(c.title)}</div><div class="d">${esc(c.sub)}</div>${c.b !== 'wait' ? `<button class="btn sm" data-act="boardMove" data-k="${esc(c.id)}" aria-label="${esc(c.title)} 계획 이동">계획 이동</button>` : ''}${c.kind === 'todo' ? `<div class="acts" style="margin-top:6px"><button class="btn sm" data-act="todoEdit" data-id="${esc(c.id.slice(5))}">고치기</button><button class="btn sm danger" data-act="todoDel" data-id="${esc(c.id.slice(5))}">지우기</button></div>` : ''}</div>`).join('') || `<div class="hint">${b === 'wait' ? '결재 대기 항목이 없습니다' : '여기로 끌어다 놓으세요'}</div>`}</div>`; }).join('')}</div>
<p class="muted" style="margin-top:12px">파란 줄 카드는 그룹웨어 업무라 그룹웨어에서 처리해야 사라집니다. 노란 줄 카드는 내가 적은 할 일입니다${S.todosGw ? '(그룹웨어 개인 ToDo에 저장, 칸 이동은 이 PC의 계획 표시)' : '(이 PC에만 저장)'}.</p>`;
  }
  function boardMove(id) {
    const t = id.startsWith('todo:') ? S.todos.find(x => 'todo:' + x.id === id) : S.a.actions.find(x => x.key === id);
    if (!t || (!id.startsWith('todo:') && bucketOfAction(t) === 'wait')) return;
    S.menuOpen = 'boardMove'; S.paletteOpen = false; S.helpOpen = false;
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" role="dialog" aria-label="계획 이동"><h2>계획 이동</h2><p>실제 기한은 바꾸지 않습니다.</p><div class="acts">${BUCKETS.filter(([b]) => b !== 'wait').map(([b, n]) => `<button class="btn" data-act="boardMoveTo" data-k="${esc(id)}" data-v="${b}">${n}</button>`).join('')}</div><button class="btn ghost" data-act="closeOverlay">취소</button></div></div>`;
    $('#overlay button')?.focus();
  }
  function dropTo(id, bucket) {
    if (!BUCKET_NAME[bucket] || bucket === 'wait' || typeof id !== 'string') return;
    const t = id.startsWith('todo:') ? S.todos.find(x => 'todo:' + x.id === id) : null;
    const x = t ? null : S.a.actions.find(x => x.key === id);
    if ((!t && !x) || (x && bucketOfAction(x) === 'wait')) return;
    if (t && /^td\d+$/.test(t.id) && typeof todoToggle === 'function') {
      // 그룹웨어 ToDo: '끝냄' 칸은 완료로 저장, 다른 칸은 이 PC의 계획 표시만 바꾼다(기한은 그대로)
      if (bucket === 'done') { delete S.plan[id]; saveLocal(); todoToggle(t.id, true).then(r => toast(r.ok ? '끝냄으로 표시했습니다(그룹웨어 ToDo 완료).' : r.text)); return; }
      if (t.status === 'done') todoToggle(t.id, false);
      S.plan[id] = bucket; saveLocal(); render(); toast(`"${BUCKET_NAME[bucket]}" 칸으로 옮겼습니다. 실제 기한은 유지됩니다.`); return;
    }
    pushUndo('보드 이동');
    if (t) {
      t.status = bucket === 'done' ? 'done' : 'todo';
      if (bucket === 'done') delete S.plan[id]; else S.plan[id] = bucket;
    } else {
      if (bucket === 'done') { S.hidden[id] = Date.now(); delete S.plan[id]; }
      else { delete S.hidden[id]; delete S.snooze[id]; S.plan[id] = bucket; }
    }
    const saved = saveLocal(); render();
    [...root.querySelectorAll('[data-act="boardMove"]')].find(el => el.dataset.k === id)?.focus();
    if (!saved) { toast('계획을 저장하지 못했습니다. 현재 화면에만 반영되어 있습니다. 저장 공간을 확인하세요.'); return; }
    toastUndo(`"${BUCKET_NAME[bucket]}" 칸으로 옮겼습니다. 실제 기한은 유지됩니다.`);
  }
  // 빈 값은 기한 없음, null은 잘못된 입력을 뜻한다.
  const parseDue = v => {
    const s = String(v ?? '').trim();
    if (!s) return '';
    const full = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const short = s.match(/^(\d{1,2})[./-](\d{1,2})$/);
    if (!full && !short) return null;
    const y = full ? Number(full[1]) : Number(R.kstNow(new Date()).y);
    const m = Number(full ? full[2] : short[1]);
    const d = Number(full ? full[3] : short[2]);
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) return null;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  const dueError = '올바른 날짜를 입력하세요. 예: 11/20 또는 2026-11-20';
  // 클릭과 Enter가 모두 호출하는 기존 입력 함수를 대체한다.
  addTodoFromInput = function () {
    const title = ($('#tdTitle') || {}).value?.trim();
    const input = $('#tdDue');
    const due = parseDue(input?.value);
    if (due === null) { toast(dueError); input?.focus(); return; }
    addTodo(title, due, '직접 추가');
  };

