// GW 비서 · 새 첫 화면 "홈" (AI 채팅창 + 핵심 요약)
// 읽기 전용 요약. 숫자는 '오늘 할 일'과 같은 기준(mineVisible, stateOf)을 쓴다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  // 홈·채팅 화면의 data-act 처리기 등록소. 16-events.js의 default 분기가 HOME_ACTS[act](el, v, e)를 부른다.
  const HOME_ACTS = {};

  function homeData() {
    const loaded = !!(S.a && S.raw);
    const out = {loaded, mine: [], urgent: 0, todo: 0, check: 0, wait: 0, refN: 0, events: [], away: [], timeline: []};
    if (!loaded) return out;
    const mine = mineVisible();
    const cnt = st => mine.filter(x => st.includes(stateOf(x))).length;
    out.mine = mine; out.urgent = cnt(['overdue', 'urgent']); out.todo = cnt(['todo']); out.check = cnt(['check', 'confirm']);
    out.wait = visibleActions().filter(x => isMine(x) && stateOf(x) === 'wait').length;
    out.refN = visibleActions().filter(x => !isMine(x)).length;
    const p = R.kstNow(new Date()), t8 = p.date.replace(/-/g, ''), mk = t8.slice(0, 6);
    // 오늘 일정(그룹웨어 일정 + 내 휴가·출장 + 자원 예약)
    const sched = (S.raw.data && S.raw.data.schedule && S.raw.data.schedule.events) || [];
    for (const e of sched) {
      const s = String(e.start || ''), z = String(e.end || e.start || '');
      if (s.slice(0, 8) <= t8 && z.slice(0, 8) >= t8) out.timeline.push({from: e.allDay ? '' : s.slice(8, 10) + ':' + s.slice(10, 12), to: e.allDay || z.length < 12 ? '' : z.slice(8, 10) + ':' + z.slice(10, 12), label: e.title, allDay: !!e.allDay, kind: 'etc'});
    }
    try { if (typeof ensureTeam === 'function') ensureTeam(mk); } catch (e) { logError('home.team', e.message); }
    const team = (S.team || {})[mk];
    if (team && team.cal) {
      const day = team.cal.byDate[t8] || [];
      for (const x of day) if (x.mine && x.kind !== 'ot') out.timeline.push({from: x.time ? x.time.slice(0, 5) : '', to: x.time ? x.time.slice(6) : '', label: x.label + (x.place ? ' · ' + x.place : ''), allDay: !x.time, kind: 'away'});
      const sum = R.teamHomeSummary(team.cal, new Date());
      let aw = [...sum.leave, ...sum.trip];
      const dp = typeof effDept === 'function' ? effDept(team.cal.depts) : '';
      if (dp) aw = aw.filter(x => x.dept === dp);
      out.away = aw;
    }
    try { if (typeof homeResEnsure === 'function') homeResEnsure(); } catch (e) { logError('home.res', e.message); }
    for (const b of (S.homeRes && S.homeRes.items) || []) { const s = String(b.start || ''), z = String(b.end || ''); if (s.slice(0, 8) === t8) out.timeline.push({from: s.slice(8, 10) + ':' + s.slice(10, 12), to: z.slice(8, 10) + ':' + z.slice(10, 12), label: b.label, kind: 'car'}); }
    out.events = out.timeline;
    return out;
  }

  function homeHeadHtml(d) {
    const hour = new Date(Date.now() + 9 * 3600000).getUTCHours();
    const name = (S.raw && S.raw.principal && S.raw.principal.name) || '';
    const g = R.homeGreeting({hour, name, urgent: d.urgent, total: d.urgent + d.todo + d.check, loading: !d.loaded});
    const age = S.lastRefresh ? Math.floor((Date.now() - S.lastRefresh.getTime()) / 60000) : null;
    const asof = S.loading ? '<span class="spin"></span> 읽는 중' : S.lastRefresh ? `${hhmm(S.lastRefresh)} 기준${age ? ` · ${age}분 전` : ''}` : '';
    return `<div class="hm-head"><div><h1 class="hm-hello">${esc(g.title)}</h1><p class="hm-sub hm-tone-${g.tone}">${esc(g.sub)}</p></div></div>`;
  }

  // 맨 위: 핵심 숫자 한 줄 + 지금 가장 먼저 할 일 한 가지.
  function homeTopHtml(d) {
    if (!d.loaded) return `<section class="hm-tiles" aria-label="핵심 현황">${'<div class="hm-tile hm-skel" aria-hidden="true"></div>'.repeat(5)}</section>`;
    const tiles = R.homeTiles({urgent: d.urgent, todo: d.todo, check: d.check, wait: d.wait, events: d.events.length, away: d.away.length, loaded: true});
    const tileHtml = tiles.map(t => `<button class="hm-tile hm-tone-${t.tone}" data-act="homeTile" data-v="${t.id}" aria-label="${esc(t.label + ' ' + t.value + ' ' + t.sub)}"><span class="hm-tile-l">${esc(t.label)}</span><b class="hm-tile-v">${esc(t.value)}</b><span class="hm-tile-s">${esc(t.sub)}</span></button>`).join('');
    const next = R.homeNextAction(d.mine.map(x => ({key: x.key, title: x.title, headline: x.headline, area: x.area, state: stateOf(x), deadline: x.deadline && x.deadline.date ? x.deadline.date.slice(5) + (x.deadline.time ? ' ' + x.deadline.time : '') : ''})));
    const nextHtml = next
      ? `<section class="hm-next" aria-label="지금 할 일 한 가지"><div class="hm-next-b"><div class="hm-next-k">지금 가장 먼저 할 일 <span class="hm-badge hm-tone-${next.state === 'overdue' || next.state === 'urgent' ? 'urgent' : 'todo'}">${esc(STATE_NAME[next.state] || '')}</span></div><div class="hm-next-t">${esc(next.title)}</div>${next.sub || next.deadline ? `<div class="hm-next-s">${esc([next.sub, next.deadline ? '기한 ' + next.deadline : ''].filter(Boolean).join(' · '))}</div>` : ''}</div><div class="hm-next-a"><button class="ch-btn ch-btn-primary" data-act="homeNext" data-v="${esc(next.key)}">열어서 처리</button><button class="ch-btn ch-btn-ghost" data-act="homeOpenToday">할 일 전체 ${d.urgent + d.todo + d.check}건 보기</button></div></section>`
      : `<section class="hm-next hm-next-ok" aria-label="지금 할 일"><div class="hm-next-b"><div class="hm-next-k">지금 처리할 일이 없습니다</div><div class="hm-next-s">${d.refN ? `부서 참고 공문 ${d.refN}건이 등록되어 있습니다.` : '새로 도착한 일이 없습니다.'}</div></div><div class="hm-next-a"><button class="ch-btn ch-btn-ghost" data-act="homeOpenToday">할 일 목록 열기</button></div></section>`;
    return `<section class="hm-tiles" aria-label="핵심 현황">${tileHtml}</section>${nextHtml}`;
  }
  // 채팅 옆: 오늘 일정과 자리 비움.
  function homeDashHtml(d) {
    if (!d.loaded) return '';
    const tl = R.homeTimelineCompact(d.timeline, 5);
    const awayLine = R.homeAwayLine(d.away.map(x => ({name: x.name, label: x.label})), 3);
    const tlHtml = `<section class="hm-today" aria-label="오늘 일정"><div class="hm-today-k">오늘 일정</div>${tl.rows.length ? `<ul class="hm-tl">${tl.rows.map(r => `<li class="hm-tl-${esc(r.kind)}"><span class="hm-tl-t">${r.allDay ? '종일' : esc(r.from) + (r.to ? '~' + esc(r.to) : '')}</span><span class="hm-tl-l">${esc(r.label)}</span></li>`).join('')}</ul>${tl.more ? `<div class="hm-more">외 ${tl.more}건 · <button class="hm-link" data-act="homeTile" data-v="schedule">일정 달력에서 보기</button></div>` : ''}` : '<div class="hm-empty">오늘 시간이 정해진 일정이 없습니다.</div>'}${awayLine ? `<div class="hm-away"><span class="hm-away-k">자리 비움</span> ${esc(awayLine)}</div>` : ''}</section>`;
    return tlHtml;
  }

  function vHome() {
    const d = homeData();
    return `<div class="hm" id="hm"><div id="hmHead">${homeHeadHtml(d)}</div><div id="hmTop">${homeTopHtml(d)}</div><div class="hm-grid"><div class="hm-chatcol">${typeof chatView === 'function' ? chatView() : ''}</div><div id="hmDash">${homeDashHtml(d)}</div></div></div>`;
  }
  // 홈이 이미 그려져 있으면 입력창을 건드리지 않고 머리말과 요약만 새로 그린다(비동기 자료가 도착할 때 입력 중 포커스를 잃지 않게). 그렸으면 true.
  function homePartialRefresh() {
    const head = $('#hmHead'), dash = $('#hmDash');
    if (S.view !== 'home' || !head || !dash) return false;
    const d = homeData();
    head.innerHTML = homeHeadHtml(d); dash.innerHTML = homeDashHtml(d);
    const top = $('#hmTop'); if (top) top.innerHTML = homeTopHtml(d);
    return true;
  }

  HOME_ACTS.homeTile = (el, v) => {
    if (v === 'urgent') { S.filter = {...S.filter, level: 'urgent', area: 'all', q: ''}; S.todayTab = 'mine'; go('today'); }
    else if (v === 'todo') { S.filter = {...S.filter, level: 'all', area: 'all', q: ''}; S.todayTab = 'mine'; go('today'); }
    else if (v === 'wait') go('approval');
    else go('calendar');
  };
  HOME_ACTS.homeNext = (el, v) => { if (!v) return; go('today'); selectAction(v); };
  HOME_ACTS.homeOpenToday = () => { S.filter = {...S.filter, level: 'all', area: 'all', q: ''}; S.todayTab = 'mine'; go('today'); };
