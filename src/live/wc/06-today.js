// GW 통합 업무센터 · 오늘 할 일
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ----- 오늘 할 일 -----
  function vToday() {
    const mine = mineVisible();
    const cnt = st => mine.filter(x => st.includes(stateOf(x))).length;
    const urgent = cnt(['overdue', 'urgent']), todo = cnt(['todo']), check = cnt(['check']), confirm = cnt(['confirm']);
    const refN = visibleActions().filter(x => !isMine(x)).length;
    const top = mine[0];
    const name = (S.raw && S.raw.principal && S.raw.principal.name) || '';
    const f = S.filter;
    const tab = S.todayTab || 'mine';

    // Summary message: clear, professional, no false alarms
    let msgTitle = '';
    let msgSub = '';
    if (urgent > 0) {
      msgTitle = `<b class="big">${esc(name)} 님, 오늘 바로 처리할 일 <span style="color:var(--hi)">${urgent}건</span>이 있습니다</b>`;
      msgSub = top ? `가장 급한 일: <a data-act="selAction" data-k="${esc(top.key)}">${esc(top.title)}</a>${top.headline ? ` · ${esc(top.headline)}` : ''}` : '';
    } else if (mine.length > 0) {
      msgTitle = `<b class="big">${esc(name)} 님, 오늘 확인이 필요한 업무가 ${mine.length}건 있습니다</b>`;
      msgSub = top ? `확인할 일: <a data-act="selAction" data-k="${esc(top.key)}">${esc(top.title)}</a>${top.headline ? ` · ${esc(top.headline)}` : ''}` : '';
    } else {
      msgTitle = `<b class="big">${esc(name)} 님, 지금 처리할 일이 없습니다</b>`;
      msgSub = `부서 참고 공문 ${refN}건이 등록되어 있습니다.`;
    }

    // Meaningful status cards (hide zero-clutter cards)
    const statCards = [];
    if (urgent > 0) statCards.push(`<button class="stat ${f.level === 'urgent' ? 'on' : ''}" data-act="stateFilter" data-v="urgent"><div class="l"><i style="background:var(--hi)"></i>급한 일</div><div class="v" style="color:var(--hi)">${urgent}</div></button>`);
    if (todo > 0) statCards.push(`<button class="stat ${f.level === 'todo' ? 'on' : ''}" data-act="stateFilter" data-v="todo"><div class="l"><i style="background:var(--accent)"></i>할 일</div><div class="v">${todo}</div></button>`);
    if (check > 0) statCards.push(`<button class="stat ${f.level === 'check' ? 'on' : ''}" data-act="stateFilter" data-v="check"><div class="l"><i style="background:var(--md)"></i>확인 대기</div><div class="v">${check}</div></button>`);
    if (confirm > 0) statCards.push(`<button class="stat ${f.level === 'confirm' ? 'on' : ''}" data-act="stateFilter" data-v="confirm"><div class="l"><i style="background:var(--ok)"></i>제출 확인</div><div class="v">${confirm}</div></button>`);
    statCards.push(`<button class="stat ${tab === 'ref' ? 'on' : ''}" data-act="setTodayTab" data-v="ref" title="부서 접수·배부 등 부서 공문 및 공유 자료"><div class="l"><i style="background:var(--muted)"></i>부서 참고</div><div class="v">${refN}</div></button>`);

    const hiddenN = S.a.actions.filter(x => isHidden(x.key) || isSnoozed(x.key)).length;

    // Filter categories for the current tab
    const curList = tab === 'mine' ? mine : visibleActions().filter(x => !isMine(x));
    const areas = [['all', '전체'], ['메일', '메일'], ['결재', '결재'], ['근태', '근태'], ['공지', '공지']].filter(([a]) => a === 'all' || curList.some(x => x.area === a));
    const acnt = a => a === 'all' ? curList.length : curList.filter(x => x.area === a).length;

    return `<div class="hello"><div class="msg">${msgTitle}<div class="next">${msgSub}</div></div><div class="stats">${statCards.join('')}</div>${mine.length ? `<button class="btn primary" data-act="focusStart" title="처리할 일을 하나씩 차례로 (F)">${ic('play')}하나씩 처리하기</button>` : ''}</div>

<div class="bar">
  <div class="seg" role="tablist" style="margin-right:4px">
    <button role="tab" aria-selected="${tab === 'mine'}" class="${tab === 'mine' ? 'on' : ''}" data-act="setTodayTab" data-v="mine">내 할 일<span class="c">${mine.length}</span></button>
    <button role="tab" aria-selected="${tab === 'ref'}" class="${tab === 'ref' ? 'on' : ''}" data-act="setTodayTab" data-v="ref">부서 참고 공문<span class="c">${refN}</span></button>
  </div>
  ${areas.length > 2 ? `<div class="seg" role="tablist">${areas.map(([a, n]) => `<button role="tab" aria-selected="${f.area === a}" class="${f.area === a ? 'on' : ''}" data-act="area" data-v="${a}">${n}<span class="c">${acnt(a)}</span></button>`).join('')}</div>` : ''}
  <label class="srch-in" style="flex:1;min-width:160px;display:flex"><input class="inp grow" id="qfilter" placeholder="목록에서 검색" value="${esc(f.q)}" aria-label="목록에서 검색"></label>
  ${f.level !== 'all' ? `<button class="chip on" data-act="stateFilter" data-v="all">${esc(STATE_GROUP[f.level] || '')} ${ic('x')}</button>` : ''}
  <button class="chip ${f.showHidden ? 'on' : ''}" data-act="showHidden" title="이 화면에서 숨기거나 내일로 미룬 항목">${ic('eye')}숨긴 항목 ${hiddenN}</button>
</div>

<div id="batch">${batchBar()}</div>
<div id="qlist">${queueRows()}</div>`;
  }

  const queueRows = () => {
    const all = queue();
    const lvl = S.filter.level;
    const tab = S.todayTab || 'mine';

    if (tab === 'ref') {
      const refs = all.filter(x => !isMine(x));
      if (!refs.length) {
        return `<div class="list"><div class="empty"><div class="ill">${ic('check', 'style="width:36px;height:36px;color:var(--ok)"')}</div><b>부서 참고 공문이 없습니다</b></div></div>`;
      }
      return `<div class="box tip" style="margin-top:0;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
        <div>${ic('info')} 부서 접수·배부 등 부서 문서담당자가 처리하는 공문입니다. 내 업무라면 각 줄의 [⋯] 메뉴에서 <b>"내 일로 지정"</b>을 누르세요.</div>
        <button class="btn sm" data-act="setTodayTab" data-v="mine">← 내 할 일로 돌아가기</button>
      </div>
      <div class="list" role="list">${refs.map(x => actionRow(x, true)).join('')}</div>`;
    }

    const mine = all.filter(isMine).filter(x => lvl === 'all' || (lvl === 'urgent' ? ['overdue', 'urgent'].includes(stateOf(x)) : stateOf(x) === lvl));
    const groups = [];
    for (const st of ['urgent', 'todo', 'check', 'confirm', 'wait']) {
      const xs = mine.filter(x => STATE_GROUP[stateOf(x)] === STATE_GROUP[st]);
      if (xs.length && !groups.some(g => g.name === STATE_GROUP[st])) groups.push({name: STATE_GROUP[st], xs});
    }
    const body = groups.map(g => `<div class="grp">${esc(g.name)}<span class="c">${g.xs.length}</span></div><div class="list" role="list">${g.xs.map(x => actionRow(x)).join('')}</div>`).join('');
    const empty = !mine.length ? `<div class="list"><div class="empty"><div class="ill">${ic('check', 'style="width:36px;height:36px;color:var(--ok)"')}</div><b>${S.filter.showHidden ? '숨긴 항목이 없습니다' : S.a.failed.length ? '일부 자료를 읽지 못했습니다' : S.filter.q || lvl !== 'all' || S.filter.area !== 'all' ? '조건에 맞는 항목이 없습니다' : '지금 처리할 일이 없습니다'}</b>${S.a.failed.length ? '목록이 비어 보일 수 있습니다. 위의 "다시 시도"를 눌러 주세요.' : '새 일이 들어오면 여기에 바로 나타납니다.'}</div></div>` : '';
    
    const refCount = all.filter(x => !isMine(x)).length;
    const refFooter = refCount > 0 ? `<div style="margin-top:16px;text-align:center;padding:12px;background:var(--bg-subtle);border-radius:var(--r);border:1px dashed var(--line2);font-size:13.5px;color:var(--muted)">
      부서 접수·배부 등 참고 공문이 <b>${refCount}건</b> 있습니다.
      <button class="btn sm primary" data-act="setTodayTab" data-v="ref" style="margin-left:8px">참고 공문 확인하기</button>
    </div>` : '';

    return empty + body + refFooter;
  };

  function actionRow(x, ref = false) {
    const st = stateOf(x);
    const dl = x.deadline && x.deadline.date && !ref ? `<span class="bdg date ${x.deadline.dday <= 1 && ['overdue', 'urgent'].includes(st) ? 'hot' : ''}">${ic('clock')}${esc(x.deadline.date.slice(5).replace('-', '/'))}${x.deadline.time ? ' ' + esc(x.deadline.time) : ''}</span>` : '';
    const stale = isHidden(x.key) && Date.now() - S.hidden[x.key] > 86400_000;
    const plan = S.plan[x.key] ? `<span class="bdg tag">${esc(BUCKET_NAME[S.plan[x.key]] || '')}</span>` : '';
    const facts = (x.facts && x.facts.length ? x.facts : [x.kind, x.detail]).filter(Boolean).slice(0, 4);
    const head = x.headline || x.kind;
    const typeIcon = {doc: 'doc', mail: 'mail', notice: 'bell', attendance: 'clock', leave: 'cal', conflict: 'alert'}[x.type] || 'doc';

    if (ref) {
      return `<div class="row ref ${S.sel && S.sel.key === x.key ? 'sel' : ''}" role="listitem" tabindex="0" data-act="selAction" data-k="${esc(x.key)}" title="클릭하여 상세 보기">
        <span class="type-icon">${ic(typeIcon)}</span>
        <div class="mn">
          <div class="t">${esc(x.title)}</div>
          <div class="fx"><span>${esc(x.refReason || x.kind)}</span>${facts.slice(0, 2).map(t => `<span>${esc(t)}</span>`).join('')}</div>
        </div>
        <div class="w">${esc(shortWhen(x.when))}</div>
        <div class="qa">
          <button class="btn sm" data-act="rmMine" data-k="${esc(x.key)}" title="내 처리할 일로 지정하여 첫 화면에 표시합니다">${ic('star')}내 일로 지정</button>
          <button class="btn sm primary" data-act="quickOpen" data-k="${esc(x.key)}" title="원문 화면 열기">열기</button>
          <button class="btn sm ghost icon" data-act="rowMenu" data-k="${esc(x.key)}" aria-label="더 보기">${ic('more')}</button>
        </div>
      </div>`;
    }

    const actionBtns = [];
    if (st === 'confirm') {
      actionBtns.push(`<button class="btn sm" data-act="markDone" data-k="${esc(x.key)}" title="제출 또는 회신이 끝났으면 목록에서 완료 처리합니다">${ic('check')}처리 완료</button>`);
    }
    if (st === 'check' && x.type === 'attendance' && !(x.att && x.att.applied)) {
      actionBtns.push(`<button class="btn sm" data-act="markDone" data-k="${esc(x.key)}" title="대체휴무 등으로 확인된 날이면 목록에서 제외합니다">${ic('check')}확인 완료</button>`);
    }
    const openLabel = x.type === 'mail' ? '메일 보기' : x.type === 'attendance' ? '근태신청' : '원문 열기';
    actionBtns.push(`<button class="btn sm primary" data-act="quickOpen" data-k="${esc(x.key)}" title="${openLabel}">${ic('ext')}${openLabel}</button>`);
    actionBtns.push(`<button class="btn sm ghost icon" data-act="rowMenu" data-k="${esc(x.key)}" aria-label="추가 옵션">${ic('more')}</button>`);

    return `<div class="row ${S.sel && S.sel.key === x.key ? 'sel' : ''} ${isHidden(x.key) || isSnoozed(x.key) ? 'hid' : ''} ${S.multi.has(x.key) ? 'multi' : ''}" role="listitem" tabindex="0" data-act="selAction" data-k="${esc(x.key)}" title="클릭하여 상세 보기 (열린 상태에서 다시 누르면 닫힘)">
      <input class="ck" type="checkbox" data-act="multi" data-k="${esc(x.key)}" ${S.multi.has(x.key) ? 'checked' : ''} aria-label="선택" title="다중 선택">
      <div class="mn">
        <div class="t">${esc(x.title)}</div>
        <div class="hl"><span class="bdg ${st}">${STATE_NAME[st]}</span>${S.newKeys.has(x.key) ? '<span class="bdg new">새</span>' : ''}<span class="what ${st}">${esc(head)}</span>${dl}${plan}${stale ? '<span class="bdg check">숨겼지만 아직 남음</span>' : ''}</div>
        <div class="fx">${facts.map(t => `<span>${esc(t)}</span>`).join('')}</div>
      </div>
      <div class="w">${esc(shortWhen(x.when))}${isSnoozed(x.key) ? '<br>내일 다시' : ''}${isHidden(x.key) ? '<br>숨김' : ''}</div>
      <div class="qa">${actionBtns.join('')}</div>
    </div>`;
  }

  const shortWhen = w => { const s = String(w || ''); if (!s) return ''; const d = s.slice(0, 10); if (d === today()) return s.slice(11, 16) || '오늘'; return s.slice(5, 10).replace('-', '/'); };
  const batchBar = () => S.multi.size ? `<div class="batch"><b>${S.multi.size}건 선택됨</b><button class="btn sm primary" data-act="batchFocus">${ic('play')}선택한 것 하나씩 처리</button><button class="btn sm" data-act="batchSnooze">내일 다시 보기</button><button class="btn sm" data-act="batchTodo">할 일에 추가</button><button class="btn sm" data-act="batchHide">숨기기</button><button class="btn sm" data-act="batchCsv">엑셀로 저장</button><button class="btn sm ghost" data-act="batchClear">선택 해제</button></div>` : '';
  const refreshQueue = () => { const l = $('#qlist'); if (l) l.innerHTML = queueRows(); const b = $('#batch'); if (b) b.innerHTML = batchBar(); renderNav(); renderHead(); };
