// GW 비서 · 오늘 할 일
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ----- 오늘 할 일 -----
  // 한 줄 요약 + 필터 + 한 줄 목록. 자세한 내용과 처리 버튼은 줄을 골랐을 때 오른쪽 창에만 나온다.
  // v1.23: 할 일은 한 목록이다. 출처(전체 · 그룹웨어 · 개인)는 목록 위 눌림 버튼으로 거른다. '개인'은 개인 ToDo 화면(mytodo)을 연다.
  // 건수는 출처별로 따로 쓴다(그룹웨어는 mineVisible, 개인은 TD.list). 조회 범위가 달라 한 숫자로 합치지 않는다.
  const todoSrcNow = () => S.view === 'mytodo' ? 'mine' : S.todoSrc === 'gw' ? 'gw' : 'all';
  function todoSrcSeg() {
    const cur = todoSrcNow();
    return `<div class="seg" role="group" aria-label="할 일 출처">${[['all', '전체'], ['gw', '그룹웨어'], ['mine', '개인']].map(([k, n]) => `<button class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}" data-act="todoSrc" data-v="${k}">${n}</button>`).join('')}</div>`;
  }
  // 전체 보기에 넣을 개인 ToDo: 오늘까지(기한 지남 포함)와 그 뒤. 목록 검색어를 같이 적용한다.
  function todayPersonal() {
    if (typeof TD !== 'object' || !TD || typeof todoRow !== 'function') return {state: 'none', due: [], later: []};
    if (!Array.isArray(TD.list)) return {state: TD.err ? 'err' : 'loading', due: [], later: []};
    const q = String(S.filter.q || '').trim().toLowerCase(), t0 = today();
    const open = TD.list.filter(t => !t.done && (!q || `${t.title} ${t.memo || ''} ${t.projectName || ''}`.toLowerCase().includes(q)));
    const byDue = (a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999'));
    const incomplete = typeof personalTodoIncomplete === 'function' && personalTodoIncomplete();
    return {state: incomplete ? 'partial' : 'ok', due: open.filter(t => t.due && t.due <= t0).sort(byDue), later: open.filter(t => !t.due || t.due > t0).sort(byDue), open: TD.list.filter(t => !t.done).length};
  }
  function vToday() {
    const src = todoSrcNow();
    if (src === 'all' && typeof TD === 'object' && TD && !TD.list && !TD.busy && !TD.err && typeof todoLoad === 'function') todoLoad();
    const mine = mineVisible();
    const urgent = mine.filter(x => ['overdue', 'urgent'].includes(stateOf(x))).length;
    const refN = visibleActions().filter(x => !isMine(x)).length;
    const f = S.filter;
    const tab = src === 'gw' ? S.todayTab || 'mine' : 'mine';
    const hiddenN = S.a.actions.filter(x => isHidden(x.key) || isSnoozed(x.key)).length;
    const curList = tab === 'mine' ? (f.level === 'wait' ? visibleActions().filter(x => isMine(x) && stateOf(x) === 'wait') : mine) : visibleActions().filter(x => !isMine(x));
    const areas = [['all', '전체'], ['메일', '메일'], ['결재', '결재'], ['근태', '근태'], ['공지', '공지']].filter(([a]) => a === 'all' || curList.some(x => x.area === a));
    const acnt = a => a === 'all' ? curList.length : curList.filter(x => x.area === a).length;
    const gaps = groupwareTaskGaps();
    const pt = src === 'all' ? todayPersonal() : null;
    const personalSub = !pt ? '' : pt.state === 'loading' ? ' · 개인 ToDo 확인 중' : pt.state === 'err' || pt.state === 'none' ? ' · 개인 ToDo 확인 불가' : ` · 개인 ToDo ${pt.state === 'partial' ? '확인된 ' : ''}미완료 ${pt.open}건`;
    const sub = `${gaps ? '확인된 ' : ''}그룹웨어 처리·확인 ${mine.length}건${urgent ? ` · <b style="color:var(--hi)">급한 일 ${urgent}건</b>` : ''}${src === 'all' ? esc(personalSub) : ' · 개인 ToDo 제외'}`;

    return `${pgh('할 일', sub, mine.length ? `<button class="btn primary" data-act="focusStart" title="그룹웨어에서 처리할 일을 하나씩 차례로 (F)">${ic('play')}하나씩 처리</button>` : '')}
${gaps ? '<p class="muted lean-note" role="status">일부 그룹웨어 자료를 읽지 못해 확인된 항목만 표시합니다.</p>' : ''}
<div class="bar">
  ${todoSrcSeg()}
  ${src === 'gw' ? `<div class="seg" role="tablist" aria-label="그룹웨어 업무 구분">
    <button role="tab" aria-selected="${tab === 'mine'}" class="${tab === 'mine' ? 'on' : ''}" data-act="setTodayTab" data-v="mine">처리·확인<span class="c">${mine.length}</span></button>
    <button role="tab" aria-selected="${tab === 'ref'}" class="${tab === 'ref' ? 'on' : ''}" data-act="setTodayTab" data-v="ref" title="부서 접수·배부 등 부서 문서담당자가 처리하는 공문">부서 참고<span class="c">${refN}</span></button>
  </div>` : ''}
  ${src === 'gw' && areas.length > 2 ? `<div class="seg" role="tablist" aria-label="그룹웨어 업무 영역">${areas.map(([a, n]) => `<button role="tab" aria-selected="${f.area === a}" class="${f.area === a ? 'on' : ''}" data-act="area" data-v="${a}">${n}<span class="c">${acnt(a)}</span></button>`).join('')}</div>` : ''}
  <label class="srch-in" style="flex:1;min-width:160px;display:flex"><input class="inp grow" id="qfilter" placeholder="목록에서 검색" value="${esc(f.q)}" aria-label="목록에서 검색"></label>
  ${f.level !== 'all' ? `<button class="chip on" data-act="stateFilter" data-v="all" title="이 조건 풀기">${esc(STATE_GROUP[f.level] || '')}만 ${ic('x')}</button>` : ''}
  ${hiddenN || f.showHidden ? `<button class="chip ${f.showHidden ? 'on' : ''}" data-act="showHidden" title="이 화면에서 숨기거나 내일로 미룬 항목">${ic('eye')}숨긴 항목 ${hiddenN}</button>` : ''}
</div>

<div id="batch">${batchBar()}</div>
<div id="qlist">${queueRows()}</div>`;
  }

  // 렌더링과 방향키·범위 선택이 같은 순서와 조건을 사용한다.
  function todayQueue() {
    const all = queue(), lvl = S.filter.level;
    if (S.todoSrc === 'gw' && (S.todayTab || 'mine') === 'ref') return all.filter(x => !isMine(x));
    const mine = all.filter(x => isMine(x) && (lvl === 'wait' ? stateOf(x) === 'wait' : stateOf(x) !== 'wait')).filter(x => lvl === 'all' || (lvl === 'urgent' ? ['overdue', 'urgent'].includes(stateOf(x)) : stateOf(x) === lvl));
    return ['urgent', 'todo', 'check', 'confirm', 'wait'].flatMap(st => mine.filter(x => STATE_GROUP[stateOf(x)] === STATE_GROUP[st]));
  }
  const queueRows = () => {
    const all = todayQueue();
    const lvl = S.filter.level;
    const tab = S.todoSrc === 'gw' ? S.todayTab || 'mine' : 'mine';

    const gaps = groupwareTaskGaps();
    if (todoSrcNow() === 'all') return todayAllRows(all, lvl, gaps);
    if (tab === 'ref') {
      const refs = all.filter(x => !isMine(x));
      if (!refs.length) {
        return `<div class="list"><div class="empty"><div class="ill">${ic('check', 'style="width:36px;height:36px;color:var(--ok)"')}</div><b>${gaps ? '부서 참고 공문을 모두 확인할 수 없습니다' : '조건에 맞는 부서 참고 공문이 없습니다'}</b></div></div>`;
      }
      return `<p class="muted lean-note">부서 문서담당자가 처리하는 공문입니다. 내 업무라면 줄 끝의 ⋯에서 “내 일로 지정”을 누르세요.</p><div class="list" role="list">${refs.map(x => actionRow(x, true)).join('')}</div>`;
    }

    const mine = all;
    const groups = [];
    for (const st of ['urgent', 'todo', 'check', 'confirm', 'wait']) {
      const xs = mine.filter(x => STATE_GROUP[stateOf(x)] === STATE_GROUP[st]);
      if (xs.length && !groups.some(g => g.name === STATE_GROUP[st])) groups.push({name: STATE_GROUP[st], xs});
    }
    const body = groups.map(g => `<div class="grp">${esc(g.name)}<span class="c">${g.xs.length}</span></div><div class="list" role="list">${g.xs.map(x => actionRow(x)).join('')}</div>`).join('');
    const empty = !mine.length ? `<div class="list"><div class="empty"><div class="ill">${ic('check', 'style="width:36px;height:36px;color:var(--ok)"')}</div><b>${gaps ? '일부 자료를 읽지 못했습니다' : S.filter.showHidden ? '조건에 맞는 숨긴 항목이 없습니다' : S.filter.q || lvl !== 'all' || S.filter.area !== 'all' ? '조건에 맞는 항목이 없습니다' : '조회된 그룹웨어 처리·확인 항목이 없습니다'}</b>${gaps ? '전체 목록을 확인할 수 없습니다. 새로 고침 후 다시 확인하세요.' : ''}</div></div>` : '';
    return empty + body;
  };

  // 전체 보기: 그룹웨어 업무 묶음(급한 일 → 할 일 → 확인) 안에 개인 ToDo를 넣는다. 오늘까지인 개인 ToDo는 '급한 일', 그 뒤는 맨 아래 묶음.
  // 상태 거르기(급한 일만 등)나 숨긴 항목 보기는 그룹웨어 기준이므로, 급한 일만 볼 때는 오늘까지인 개인 ToDo만 함께 둔다.
  function todayAllRows(all, lvl, gaps) {
    const pt = S.filter.showHidden ? {state: 'ok', due: [], later: []} : todayPersonal();
    const pDue = lvl === 'all' || lvl === 'urgent' ? pt.due : [], pLater = lvl === 'all' ? pt.later : [];
    const tdList = ts => ts.length ? `<div class="td-list today-td" role="list" aria-label="개인 ToDo">${ts.map(t => todoRow(t)).join('')}</div>` : '';
    const groups = [];
    for (const st of ['urgent', 'todo', 'check', 'confirm', 'wait']) {
      const xs = all.filter(x => STATE_GROUP[stateOf(x)] === STATE_GROUP[st]);
      if ((xs.length || (st === 'urgent' && pDue.length)) && !groups.some(g => g.name === STATE_GROUP[st])) groups.push({name: STATE_GROUP[st], xs, td: st === 'urgent' ? pDue : []});
    }
    const body = groups.map(g => `<div class="grp">${esc(g.name)}<span class="c">${g.xs.length + g.td.length}</span></div>${g.xs.length ? `<div class="list" role="list">${g.xs.map(x => actionRow(x)).join('')}</div>` : ''}${tdList(g.td)}`).join('');
    const LATER_MAX = 20;
    const later = pLater.length ? `<div class="grp">개인 ToDo · 내일 이후·기한 없음<span class="c">${pLater.length}</span></div>${tdList(pLater.slice(0, LATER_MAX))}${pLater.length > LATER_MAX ? `<p class="muted lean-note">외 ${pLater.length - LATER_MAX}건 · <button class="linkbtn" data-act="todoSrc" data-v="mine">개인 ToDo 전체 보기</button></p>` : ''}` : '';
    const pNote = pt.state === 'loading' ? '<p class="muted lean-note" role="status">개인 ToDo를 읽는 중입니다.</p>' : pt.state === 'err' ? '<p class="muted lean-note" role="status">개인 ToDo를 읽지 못해 그룹웨어 업무만 보여 드립니다.</p>' : pt.state === 'partial' ? '<p class="muted lean-note" role="status">개인 ToDo는 확인된 목록만 보입니다.</p>' : '';
    if (!body && !later) return `${pNote}<div class="list"><div class="empty"><div class="ill">${ic('check', 'style="width:36px;height:36px;color:var(--ok)"')}</div><b>${gaps ? '일부 자료를 읽지 못했습니다' : S.filter.q || lvl !== 'all' ? '조건에 맞는 할 일이 없습니다' : '조회된 할 일이 없습니다'}</b>${gaps ? '전체 목록을 확인할 수 없습니다. 새로 고침 후 다시 확인하세요.' : ''}</div></div>`;
    return pNote + body + later;
  }

  // 한 건 = 한 줄: 상태 · 제목 · 할 일 한마디 · 기한 · 일시. 담당·문서번호·미리보기·처리 버튼은 오른쪽 창에서 본다.
  function actionRow(x, ref = false) {
    const st = stateOf(x);
    const k = esc(x.key);
    const hot = x.deadline && x.deadline.dday <= 1 && ['overdue', 'urgent'].includes(st);
    const dl = x.deadline && x.deadline.date && !ref ? `<span class="bdg date ${hot ? 'hot' : ''}" title="기한">${ic('clock')}${esc(x.deadline.date.slice(5).replace('-', '/'))}${x.deadline.time ? ' ' + esc(x.deadline.time) : ''}</span>` : '';
    const stale = isHidden(x.key) && Date.now() - S.hidden[x.key] > 86400_000;
    const facts = (x.facts && x.facts.length ? x.facts : [x.kind, x.detail]).filter(Boolean).slice(0, 4);
    const head = ref ? (x.refReason || x.kind) : (x.headline || x.kind);
    const typeIcon = {doc: 'doc', mail: 'mail', notice: 'bell', attendance: 'clock', leave: 'cal', conflict: 'alert'}[x.type] || 'doc';
    const note = isSnoozed(x.key) ? '내일 다시' : isHidden(x.key) ? (stale ? '숨겼지만 남음' : '숨김') : S.plan[x.key] ? (BUCKET_NAME[S.plan[x.key]] || '') : '';
    const done = !ref && (st === 'confirm' || (st === 'check' && x.type === 'attendance' && !(x.att && x.att.applied)));
    const tip = [x.title, head, ...facts].filter(Boolean).join(' · ');
    return `<div class="row lean ${ref ? 'ref' : ''} ${S.sel && S.sel.key === x.key ? 'sel' : ''} ${isHidden(x.key) || isSnoozed(x.key) ? 'hid' : ''} ${S.multi.has(x.key) ? 'multi' : ''}" role="listitem" tabindex="0" data-act="selAction" data-k="${k}" title="${esc(tip)}">
      ${ref ? `<span class="type-icon">${ic(typeIcon)}</span>` : `<input class="ck" type="checkbox" data-act="multi" data-k="${k}" ${S.multi.has(x.key) ? 'checked' : ''} aria-label="선택" title="여러 건 선택">`}
      <span class="bdg ${ref ? 'info' : st}">${ref ? '참고' : STATE_NAME[st]}</span>
      <div class="mn"><span class="t">${S.newKeys.has(x.key) ? '<span class="bdg new">새</span> ' : ''}${esc(x.title)}</span><span class="what ${ref ? '' : st}">${esc(head)}</span></div>
      ${dl}${note ? `<span class="bdg tag">${esc(note)}</span>` : ''}
      <span class="w">${esc(shortWhen(x.when))}</span>
      <span class="qa">${done ? `<button class="btn sm ghost icon" data-act="markDone" data-k="${k}" title="끝난 일이면 목록에서 완료 처리" aria-label="완료 처리">${ic('check')}</button>` : ''}<button class="btn sm ghost icon" data-act="rowMenu" data-k="${k}" title="미루기·숨기기·할 일에 추가" aria-label="더 보기">${ic('more')}</button></span>
    </div>`;
  }

  const shortWhen = w => { const s = String(w || ''); if (!s) return ''; const d = s.slice(0, 10); if (d === today()) return s.slice(11, 16) || '오늘'; return s.slice(5, 10).replace('-', '/'); };
  const batchBar = () => S.multi.size ? `<div class="batch"><b>${S.multi.size}건 선택됨</b><button class="btn sm primary" data-act="batchFocus">${ic('play')}선택한 것 하나씩 처리</button><button class="btn sm" data-act="batchSnooze">내일 다시 보기</button><button class="btn sm" data-act="batchTodo">할 일에 추가</button><button class="btn sm" data-act="batchHide">숨기기</button><button class="btn sm" data-act="batchCsv">엑셀로 저장</button><button class="btn sm ghost" data-act="batchClear">선택 해제</button></div>` : '';
  const refreshQueue = () => { const l = $('#qlist'); if (l) l.innerHTML = queueRows(); const b = $('#batch'); if (b) b.innerHTML = batchBar(); renderNav(); renderHead(); };
