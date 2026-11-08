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
    const stat = (key, label, n, color) => `<button class="stat ${f.level === key ? 'on' : ''}" data-act="stateFilter" data-v="${key}" aria-pressed="${f.level === key}"><div class="l"><i style="background:${color}"></i>${label}</div><div class="v">${n}</div></button>`;
    const msg = mine.length
      ? `<b class="big">${esc(name)} 님, 처리할 일 ${mine.length}건${urgent ? ` 중 <span style="color:var(--hi)">급한 일 ${urgent}건</span>` : ''}</b><div class="next">${top ? `가장 먼저: <a data-act="selAction" data-k="${esc(top.key)}">${esc(top.title.slice(0, 46))}</a>${top.headline ? ` · ${esc(top.headline)}` : ''}` : ''}</div>`
      : `<b class="big">${esc(name)} 님, 지금 처리할 일이 없습니다</b><div class="next">참고 항목 ${refN}건은 아래에 접어 두었습니다.</div>`;
    const areas = [['all', '전체'], ['결재', '결재'], ['메일', '메일'], ['기한', '기한'], ['근태', '근태'], ['공지', '공지']].filter(([a]) => a === 'all' || mine.some(x => x.area === a));
    const acnt = a => a === 'all' ? mine.length : mine.filter(x => x.area === a).length;
    const hiddenN = S.a.actions.filter(x => isHidden(x.key) || isSnoozed(x.key)).length;
    return `<div class="hello"><div class="msg">${msg}</div><div class="stats">${stat('urgent', '급한 일', urgent, 'var(--hi)')}${stat('todo', '할 일', todo, 'var(--accent)')}${stat('check', '확인 필요', check, '#d98200')}${stat('confirm', '끝났는지 확인', confirm, 'var(--ok)')}</div>${mine.length ? `<button class="btn primary" data-act="focusStart" title="처리할 일을 하나씩 차례로 (F)">${ic('play')}하나씩 처리하기</button>` : ''}</div>
<div class="bar"><div class="seg" role="tablist" aria-label="영역">${areas.map(([a, n]) => `<button role="tab" aria-selected="${f.area === a}" class="${f.area === a ? 'on' : ''}" data-act="area" data-v="${a}">${n}<span class="c">${acnt(a)}</span></button>`).join('')}</div>
<label class="srch-in" style="flex:1;min-width:180px;display:flex"><input class="inp grow" id="qfilter" placeholder="목록에서 찾기" value="${esc(f.q)}" aria-label="목록에서 찾기"></label>
${f.level !== 'all' ? `<button class="chip on" data-act="stateFilter" data-v="all">${esc(STATE_GROUP[f.level] || '')} ${ic('x')}</button>` : ''}
<button class="chip ${f.showHidden ? 'on' : ''}" data-act="showHidden" title="이 화면에서 숨기거나 내일로 미룬 항목">${ic('eye')}숨긴 항목 ${hiddenN}</button></div>
<div id="batch">${batchBar()}</div>
<div id="qlist">${queueRows()}</div>`;
  }
  const queueRows = () => {
    const all = queue();
    const lvl = S.filter.level;
    const mine = all.filter(isMine).filter(x => lvl !== 'all' || true).filter(x => lvl === 'all' || (lvl === 'urgent' ? ['overdue', 'urgent'].includes(stateOf(x)) : stateOf(x) === lvl));
    const refs = lvl === 'all' ? all.filter(x => !isMine(x)) : [];
    const groups = [];
    for (const st of ['urgent', 'todo', 'check', 'confirm', 'wait']) {
      const xs = mine.filter(x => STATE_GROUP[stateOf(x)] === STATE_GROUP[st]);
      if (xs.length && !groups.some(g => g.name === STATE_GROUP[st])) groups.push({name: STATE_GROUP[st], xs});
    }
    const body = groups.map(g => `<div class="grp">${esc(g.name)}<span class="c">${g.xs.length}</span></div><div class="list" role="list">${g.xs.map(x => actionRow(x)).join('')}</div>`).join('');
    const empty = !mine.length ? `<div class="list"><div class="empty"><div class="ill">${ic('check', 'style="width:36px;height:36px;color:var(--ok)"')}</div><b>${S.filter.showHidden ? '숨긴 항목이 없습니다' : S.a.failed.length ? '일부 자료를 읽지 못했습니다' : S.filter.q || lvl !== 'all' || S.filter.area !== 'all' ? '조건에 맞는 항목이 없습니다' : '지금 처리할 일이 없습니다'}</b>${S.a.failed.length ? '목록이 비어 보일 수 있습니다. 위의 "다시 시도"를 눌러 주세요.' : '새 일이 들어오면 여기에 바로 나타납니다.'}</div></div>` : '';
    const refBox = refs.length ? `<details class="refbox" ${S.refOpen ? 'open' : ''} data-act="refToggle"><summary><span class="car">${ic('play', 'style="width:12px;height:12px"')}</span>참고 ${refs.length}건 <span class="muted" style="font-weight:400">나와 직접 관련이 적은 항목(부서 접수·배부, 다른 사람 발송, 공지, 받은 자료)</span></summary><div class="list">${refs.map(x => actionRow(x, true)).join('')}</div></details>` : '';
    return empty + body + refBox;
  };
  function actionRow(x, ref = false) {
    const st = stateOf(x);
    const dl = x.deadline && x.deadline.date && !ref ? `<span class="bdg date ${x.deadline.dday <= 1 && ['overdue', 'urgent'].includes(st) ? 'hot' : ''}">${ic('clock')}${esc(x.deadline.date.slice(5).replace('-', '/'))}${x.deadline.time ? ' ' + esc(x.deadline.time) : ''}</span>` : '';
    const stale = isHidden(x.key) && Date.now() - S.hidden[x.key] > 86400_000;
    const plan = S.plan[x.key] ? `<span class="bdg tag">${esc(BUCKET_NAME[S.plan[x.key]] || '')}</span>` : '';
    const facts = (x.facts && x.facts.length ? x.facts : [x.kind, x.detail]).filter(Boolean).slice(0, 4);
    const head = x.headline || x.kind;
    const typeIcon = {doc: 'doc', mail: 'mail', notice: 'bell', attendance: 'clock', leave: 'cal', conflict: 'alert'}[x.type] || 'doc';
    if (ref) return `<div class="row ref ${S.sel && S.sel.key === x.key ? 'sel' : ''}" role="listitem" tabindex="0" data-act="selAction" data-k="${esc(x.key)}"><span style="color:var(--muted)">${ic(typeIcon)}</span><div class="mn"><div class="t">${esc(x.title)}</div><div class="fx"><span>${esc(x.refReason || x.kind)}</span>${facts.slice(0, 2).map(t => `<span>${esc(t)}</span>`).join('')}</div></div><div class="w">${esc(shortWhen(x.when))}</div><div class="qa"><button class="btn sm ghost icon" data-act="rowMenu" data-k="${esc(x.key)}" aria-label="더 보기" title="내 일로 지정 · 숨기기 등">${ic('more')}</button></div></div>`;
    return `<div class="row ${S.sel && S.sel.key === x.key ? 'sel' : ''} ${isHidden(x.key) || isSnoozed(x.key) ? 'hid' : ''} ${S.multi.has(x.key) ? 'multi' : ''}" role="listitem" tabindex="0" data-act="selAction" data-k="${esc(x.key)}">
<input class="ck" type="checkbox" data-act="multi" data-k="${esc(x.key)}" ${S.multi.has(x.key) ? 'checked' : ''} aria-label="여러 개 선택" title="여러 개 선택 (Shift로 범위)">
<div class="mn"><div class="t">${esc(dispTitle(x))}</div><div class="hl"><span class="bdg ${st}">${STATE_NAME[st]}</span>${S.newKeys.has(x.key) ? '<span class="bdg new">새</span>' : ''}<span class="what ${st}">${esc(head)}</span>${dl}${plan}${stale ? '<span class="bdg check">숨겼지만 아직 남음</span>' : ''}</div><div class="fx">${facts.map(t => `<span>${esc(t)}</span>`).join('')}</div></div>
<div class="w">${esc(shortWhen(x.when))}${isSnoozed(x.key) ? '<br>내일 다시' : ''}${isHidden(x.key) ? '<br>숨김' : ''}</div>
<div class="qa">${st === 'confirm' ? `<button class="btn sm" data-act="markDone" data-k="${esc(x.key)}" title="끝난 일로 표시하고 목록에서 내립니다">${ic('check')}끝냄</button>` : ''}${st === 'check' && x.type === 'attendance' && !(x.att && x.att.applied) ? `<button class="btn sm" data-act="markDone" data-k="${esc(x.key)}" title="문제없는 날이면 눌러 이 화면에서 내립니다. 그룹웨어 기록은 바뀌지 않으며, 3일 뒤에도 그대로면 다시 보여 드립니다.">${ic('check')}정상입니다</button>` : ''}<button class="btn sm primary" data-act="quickOpen" data-k="${esc(x.key)}" title="그룹웨어 원래 화면으로 열기 (Enter)">열기</button><button class="btn sm ghost icon" data-act="rowMenu" data-k="${esc(x.key)}" aria-label="더 보기" title="내일 다시 보기 · 할 일 추가 · 상관없음">${ic('more')}</button></div></div>`;
  }
  const dispTitle = x => { return x.title; const d = String(x.when).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return x.title; const w = WD[new Date(d + 'T00:00:00+09:00').getDay()]; return `${d.slice(5).replace('-', '/')}(${w}) 근태 확인${x.facts && /출장/.test(x.facts.join(' ')) ? ' · 관내출장' : ''}`; };
  const shortWhen = w => { const s = String(w || ''); if (!s) return ''; const d = s.slice(0, 10); if (d === today()) return s.slice(11, 16) || '오늘'; return s.slice(5, 10).replace('-', '/'); };
  const batchBar = () => S.multi.size ? `<div class="batch"><b>${S.multi.size}건 선택</b><button class="btn sm primary" data-act="batchFocus">${ic('play')}선택한 것 하나씩 처리</button><button class="btn sm" data-act="batchSnooze">내일 다시 보기</button><button class="btn sm" data-act="batchTodo">할 일에 추가</button><button class="btn sm" data-act="batchHide">숨기기</button><button class="btn sm" data-act="batchCsv">엑셀로 저장</button><button class="btn sm ghost" data-act="batchClear">선택 해제</button></div>` : '';
  const refreshQueue = () => { const l = $('#qlist'); if (l) l.innerHTML = queueRows(); const b = $('#batch'); if (b) b.innerHTML = batchBar(); renderNav(); renderHead(); };

