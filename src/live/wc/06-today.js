// GW 비서 · 오늘 할 일
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ----- 오늘 할 일 -----
  // 한 줄 요약 + 필터 + 한 줄 목록. 자세한 내용과 처리 버튼은 줄을 골랐을 때 오른쪽 창에만 나온다.
  function vToday() {
    const mine = mineVisible();
    const urgent = mine.filter(x => ['overdue', 'urgent'].includes(stateOf(x))).length;
    const refN = visibleActions().filter(x => !isMine(x)).length;
    const f = S.filter;
    const tab = S.todayTab || 'mine';
    const hiddenN = S.a.actions.filter(x => isHidden(x.key) || isSnoozed(x.key)).length;
    const curList = tab === 'mine' ? mine : visibleActions().filter(x => !isMine(x));
    const areas = [['all', '전체'], ['메일', '메일'], ['결재', '결재'], ['근태', '근태'], ['공지', '공지']].filter(([a]) => a === 'all' || curList.some(x => x.area === a));
    const acnt = a => a === 'all' ? curList.length : curList.filter(x => x.area === a).length;
    const sub = !mine.length ? '지금 처리할 일이 없습니다' : urgent ? `<b style="color:var(--hi)">급한 일 ${urgent}건</b> · 전체 ${mine.length}건` : `전체 ${mine.length}건`;

    return `${pgh('할 일', sub, mine.length ? `<button class="btn primary" data-act="focusStart" title="처리할 일을 하나씩 차례로 (F)">${ic('play')}하나씩 처리</button>` : '')}
<div class="bar">
  <div class="seg" role="tablist">
    <button role="tab" aria-selected="${tab === 'mine'}" class="${tab === 'mine' ? 'on' : ''}" data-act="setTodayTab" data-v="mine">내 할 일<span class="c">${mine.length}</span></button>
    <button role="tab" aria-selected="${tab === 'ref'}" class="${tab === 'ref' ? 'on' : ''}" data-act="setTodayTab" data-v="ref" title="부서 접수·배부 등 부서 문서담당자가 처리하는 공문">부서 참고<span class="c">${refN}</span></button>
  </div>
  ${areas.length > 2 ? `<div class="seg" role="tablist">${areas.map(([a, n]) => `<button role="tab" aria-selected="${f.area === a}" class="${f.area === a ? 'on' : ''}" data-act="area" data-v="${a}">${n}<span class="c">${acnt(a)}</span></button>`).join('')}</div>` : ''}
  <label class="srch-in" style="flex:1;min-width:160px;display:flex"><input class="inp grow" id="qfilter" placeholder="목록에서 검색" value="${esc(f.q)}" aria-label="목록에서 검색"></label>
  ${f.level !== 'all' ? `<button class="chip on" data-act="stateFilter" data-v="all" title="이 조건 풀기">${esc(STATE_GROUP[f.level] || '')}만 ${ic('x')}</button>` : ''}
  ${hiddenN || f.showHidden ? `<button class="chip ${f.showHidden ? 'on' : ''}" data-act="showHidden" title="이 화면에서 숨기거나 내일로 미룬 항목">${ic('eye')}숨긴 항목 ${hiddenN}</button>` : ''}
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
      return `<p class="muted lean-note">부서 문서담당자가 처리하는 공문입니다. 내 업무라면 줄 끝의 ⋯에서 “내 일로 지정”을 누르세요.</p><div class="list" role="list">${refs.map(x => actionRow(x, true)).join('')}</div>`;
    }

    const mine = all.filter(isMine).filter(x => lvl === 'all' || (lvl === 'urgent' ? ['overdue', 'urgent'].includes(stateOf(x)) : stateOf(x) === lvl));
    const groups = [];
    for (const st of ['urgent', 'todo', 'check', 'confirm', 'wait']) {
      const xs = mine.filter(x => STATE_GROUP[stateOf(x)] === STATE_GROUP[st]);
      if (xs.length && !groups.some(g => g.name === STATE_GROUP[st])) groups.push({name: STATE_GROUP[st], xs});
    }
    const body = groups.map(g => `<div class="grp">${esc(g.name)}<span class="c">${g.xs.length}</span></div><div class="list" role="list">${g.xs.map(x => actionRow(x)).join('')}</div>`).join('');
    const empty = !mine.length ? `<div class="list"><div class="empty"><div class="ill">${ic('check', 'style="width:36px;height:36px;color:var(--ok)"')}</div><b>${S.filter.showHidden ? '숨긴 항목이 없습니다' : S.a.failed.length ? '일부 자료를 읽지 못했습니다' : S.filter.q || lvl !== 'all' || S.filter.area !== 'all' ? '조건에 맞는 항목이 없습니다' : '지금 처리할 일이 없습니다'}</b>${S.a.failed.length ? '목록이 비어 보일 수 있습니다. 위의 "다시 시도"를 눌러 주세요.' : '새 일이 들어오면 여기에 바로 나타납니다.'}</div></div>` : '';
    return empty + body;
  };

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
