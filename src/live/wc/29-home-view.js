// GW 비서 · 첫 화면 "홈" (왼쪽: 인사와 비서 대화, 오른쪽: 오늘 현황·지금 할 일·일정·챙겨 둘 것·자동화)
// 읽기 전용 요약. 숫자는 '오늘 할 일'과 같은 기준(mineVisible, stateOf)을 쓴다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  // 홈·채팅 화면의 data-act 처리기 등록소. 16-events.js의 default 분기가 HOME_ACTS[act](el, v, e)를 부른다.
  const HOME_ACTS = {};

  function homeData() {
    const loaded = !!(S.a && S.raw);
    const out = {loaded, mine: [], urgent: 0, todo: 0, check: 0, wait: 0, refN: 0, events: [], away: [], timeline: [], resources: []};
    if (!loaded) return out;
    const mine = mineVisible();
    const cnt = st => mine.filter(x => st.includes(stateOf(x))).length;
    out.mine = mine; out.urgent = cnt(['overdue', 'urgent']); out.todo = cnt(['todo']); out.check = cnt(['check', 'confirm']);
    out.wait = visibleActions().filter(x => isMine(x) && stateOf(x) === 'wait').length;
    out.taskGaps = !!(S.error || S.raw.sessionExpired || (S.a.failed && S.a.failed.some(x => ['approval', 'mail', 'attendance', 'leave', '시간외 지문 확인'].includes(x.name))) || Object.entries(S.raw.status || {}).some(([k, v]) => ['approval', 'mail', 'attendance', 'leave'].includes(k) && v && (v.ok === false || v.error)) || Object.values((S.a.approval && S.a.approval.lists) || {}).some(x => x && x.error));
    out.refN = visibleActions().filter(x => !isMine(x)).length;
    const mailStatus = S.raw.status && S.raw.status.mail, leaveStatus = S.raw.status && S.raw.status.leave;
    const mail = S.raw.data && S.raw.data.mail, lv = S.raw.data && S.raw.data.leave;
    const unread = mail && mail.inbox && Array.isArray(mail.inbox.records) && Array.isArray(mail.otherUnseen) ? [...mail.inbox.records, ...mail.otherUnseen].filter(m => !m.seen).length : null;
    out.unread = !S.error && !S.raw.sessionExpired && !(mailStatus && (mailStatus.ok === false || mailStatus.error)) ? unread : null;
    out.leave = !S.error && !S.raw.sessionExpired && !(leaveStatus && (leaveStatus.ok === false || leaveStatus.error)) && lv && lv.remaining != null && Number.isFinite(Number(lv.remaining)) ? fmtDays(lv.remaining) : '';
    const p = R.kstNow(new Date()), t8 = p.date.replace(/-/g, ''), mk = t8.slice(0, 6);
    // 오늘 일정은 그룹웨어 일정과 내 휴가·출장만 포함한다. 자원 예약은 별도 섹션이다.
    const schedule = S.raw.data && S.raw.data.schedule;
    const scheduleStatus = S.raw.status && S.raw.status.schedule;
    const start = String(schedule && schedule.start || '').replace(/-/g, '').slice(0, 8), end = String(schedule && schedule.end || '').replace(/-/g, '').slice(0, 8);
    out.scheduleUnknown = !!(S.error || S.raw.sessionExpired || !schedule || !Array.isArray(schedule.events) || (scheduleStatus && (scheduleStatus.ok === false || scheduleStatus.error)) || !start || !end || t8 < start || t8 > end);
    out.holidays = !out.scheduleUnknown && schedule && Array.isArray(schedule.holidays) ? schedule.holidays.filter(h => String(h.date || '').replace(/-/g, '').slice(0, 8) === t8) : [];
    const sched = schedule && Array.isArray(schedule.events) && !(scheduleStatus && (scheduleStatus.ok === false || scheduleStatus.error)) ? schedule.events : [];
    for (const e of sched) {
      const s = String(e.start || ''), z = String(e.end || e.start || '');
      if (s.slice(0, 8) <= t8 && z.slice(0, 8) >= t8) out.timeline.push({from: e.allDay ? '' : s.slice(8, 10) + ':' + s.slice(10, 12), to: e.allDay || z.length < 12 ? '' : z.slice(8, 10) + ':' + z.slice(10, 12), label: e.title, allDay: !!e.allDay, kind: 'etc'});
    }
    try { if (typeof ensureTeam === 'function') ensureTeam(mk); } catch (e) { logError('home.team', e.message); }
    const team = (S.team || {})[mk];
    if (team && !team.busy && !team.err && team.cal && team.cal.byDate) {
      const day = team.cal.byDate[t8] || [];
      for (const x of day) if (x.mine && x.kind !== 'ot') out.timeline.push({from: x.time ? x.time.slice(0, 5) : '', to: x.time ? x.time.slice(6) : '', label: x.label + (x.place ? ' · ' + x.place : ''), allDay: !x.time, kind: 'away'});
      const sum = R.teamHomeSummary(team.cal, new Date());
      let aw = [...sum.leave, ...sum.trip];
      const dp = typeof effDept === 'function' ? effDept(team.cal.depts) : '';
      if (dp) aw = aw.filter(x => x.dept === dp);
      out.away = aw;
    }
    try { if (typeof homeResEnsure === 'function') homeResEnsure(); } catch (e) { logError('home.res', e.message); }
    const res = S.homeRes;
    out.resLoading = !!(res && res.busy);
    out.resError = !!(res && res.err);
    out.resUnknown = !res || out.resLoading || out.resError || res.day !== t8 || !Array.isArray(res.items);
    out.resPartial = !!(res && res.partial);
    for (const b of (!out.resUnknown && res.items) || []) { const s = String(b.start || ''), z = String(b.end || ''); if (s.slice(0, 8) === t8) out.resources.push({from: s.slice(8, 10) + ':' + s.slice(10, 12), to: z.slice(8, 10) + ':' + z.slice(10, 12), label: b.label, kind: 'car'}); }
    out.events = out.timeline;
    out.teamError = team && team.err ? team.err : '';
    out.teamLoading = !!(team && team.busy);
    out.teamUnknown = !team || (!team.busy && !team.err && !(team.cal && team.cal.byDate));
    return out;
  }
  // 머리말: 날짜와 요일, 인사, 한 줄 상황. 주말에는 다음 평일에 이어 봐도 된다고만 알리고 근무 여부는 단정하지 않는다.
  function homeHeadHtml(d) {
    const hour = new Date(Date.now() + 9 * 3600000).getUTCHours();
    const name = (S.raw && S.raw.principal && S.raw.principal.name) || '';
    const day = typeof R.homeDayInfo === 'function' ? R.homeDayInfo({date: R.kstNow(new Date()).date, holidays: d.holidays || []}) : {label: '', weekend: false, holiday: '', nextLabel: ''};
    const g = R.homeGreeting({hour, name, urgent: d.urgent, total: d.urgent + d.todo + d.check, loading: !d.loaded, weekend: day.weekend, nextLabel: day.nextLabel});
    if (!d.loaded && S.error) g.sub = '그룹웨어 자료를 읽지 못했습니다';
    if (d.loaded && d.taskGaps) g.sub = '일부 자료를 읽지 못해 할 일 현황이 불완전할 수 있습니다';
    return `<div class="hm-head">${day.label ? `<div class="hm-eyebrow"><span>${esc(day.label)}</span>${day.weekend ? '<span class="hm-pill">주말</span>' : ''}${day.holiday ? `<span class="hm-pill">${esc(day.holiday)}</span>` : ''}</div>` : ''}<h1 class="hm-hello">${esc(g.title)}</h1><p class="hm-sub hm-tone-${g.tone}">${esc(g.sub)}</p></div>`;
  }

  // 오른쪽 위: 핵심 숫자와 지금 가장 먼저 할 일(이어서 볼 일 2건까지).
  function homeTopHtml(d) {
    if (!d.loaded && S.error) return `<section class="hm-card hm-next" role="status">그룹웨어 자료를 읽지 못했습니다. 새로 고침 후 다시 확인하세요.</section>`;
    if (!d.loaded) return `<section class="hm-card hm-stats" aria-label="핵심 현황"><div class="hm-tiles">${'<div class="hm-tile hm-skel" aria-hidden="true"></div>'.repeat(5)}</div></section>`;
    const tiles = R.homeTiles({urgent: d.urgent, todo: d.todo, check: d.check, wait: d.wait, events: d.events.length, away: d.away.length, loaded: true});
    const tileHtml = tiles.map(t => {
      if (t.id === 'away' && (d.teamLoading || d.teamError || d.teamUnknown)) return {...t, value: '–', sub: d.teamError ? '조회 실패' : d.teamLoading ? '확인 중' : '조회 여부 확인 불가'};
      if (t.id === 'wait' && d.taskGaps) return {...t, sub: '일부 자료 누락 가능 · 확인된 건수'};
      if (['urgent', 'todo'].includes(t.id) && d.taskGaps) return {...t, sub: '일부 자료 누락 가능 · 확인된 건수'};
      if (t.id === 'schedule' && (d.scheduleUnknown || d.teamLoading || d.teamError || d.teamUnknown)) return {...t, sub: '일부 자료 미확인 · 확인된 건수'};
      return t;
    }).map(t => `<button class="hm-tile hm-tile-${esc(t.id)} hm-tone-${t.tone}" data-act="homeTile" data-v="${t.id}" aria-label="${esc(t.label + ' ' + t.value + ' ' + t.sub)}"><span class="hm-tile-l">${esc(t.label)}</span><b class="hm-tile-v">${esc(t.value)}</b><span class="hm-tile-s">${esc(t.sub)}</span></button>`).join('');
    const total = d.urgent + d.todo + d.check;
    const next = R.homeNextAction(d.mine.map(x => ({key: x.key, title: x.title, headline: x.headline, area: x.area, state: stateOf(x), deadline: x.deadline && x.deadline.date ? x.deadline.date.slice(5) + (x.deadline.time ? ' ' + x.deadline.time : '') : ''})));
    const tone = s => (s === 'overdue' || s === 'urgent' ? 'urgent' : 'todo');
    const queue = next ? d.mine.filter(x => x.key !== next.key).slice(0, 2) : [];
    const queueHtml = queue.length ? `<div class="hm-queue-k">이어서 볼 일</div><ol class="hm-queue">${queue.map(x => `<li><button class="hm-q" data-act="homeNext" data-v="${esc(x.key)}"><span class="hm-q-t">${esc(x.title)}</span><span class="hm-badge hm-tone-${tone(stateOf(x))}">${esc(STATE_NAME[stateOf(x)] || x.area || '')}</span></button></li>`).join('')}</ol>` : '';
    const nextHtml = next
      ? `<section class="hm-card hm-next" aria-label="지금 할 일 한 가지"><div class="hm-card-h"><h2 class="hm-card-k">지금 가장 먼저 할 일</h2><span class="hm-badge hm-tone-${tone(next.state)}">${esc(STATE_NAME[next.state] || '')}</span></div><div class="hm-next-b"><div class="hm-next-t">${esc(next.title)}</div>${next.sub || next.deadline ? `<div class="hm-next-s">${esc([next.sub, next.deadline ? '기한 ' + next.deadline : ''].filter(Boolean).join(' · '))}</div>` : ''}</div><div class="hm-next-a"><button class="ch-btn ch-btn-primary" data-act="homeNext" data-v="${esc(next.key)}">열어서 처리</button><button class="ch-btn ch-btn-ghost" data-act="homeOpenToday">할 일 전체 ${total}건 보기</button></div>${queueHtml}</section>`
      : `<section class="hm-card hm-next hm-next-ok" aria-label="지금 할 일"><div class="hm-card-h"><h2 class="hm-card-k">${d.taskGaps ? '확인된 처리할 일이 없습니다' : '지금 처리할 일이 없습니다'}</h2></div><div class="hm-next-s">${d.taskGaps ? '일부 자료를 읽지 못해 전체 할 일을 확인할 수 없습니다.' : d.refN ? `부서 참고 공문 ${d.refN}건이 등록되어 있습니다.` : '새로 도착한 일이 없습니다.'}</div><div class="hm-next-a"><button class="ch-btn ch-btn-ghost" data-act="homeOpenToday">할 일 목록 열기</button></div></section>`;
    return `<section class="hm-card hm-stats" aria-label="핵심 현황"><div class="hm-tiles">${tileHtml}</div></section>${nextHtml}`;
  }

  // 오른쪽 아래: 오늘 일정과 자리 비움, 챙겨 둘 것, 자동화, 자원 예약.
  function homeDashHtml(d) {
    if (!d.loaded) return '';
    const tl = R.homeTimelineCompact(d.timeline, 5);
    const awayLine = R.homeAwayLine(d.away.map(x => ({name: x.name, label: x.label})), 3);
    const gaps = [];
    if (d.scheduleUnknown) gaps.push('그룹웨어 일정 조회 또는 오늘 날짜 범위를 확인할 수 없습니다.');
    const resourceGaps = [];
    if (d.resLoading) resourceGaps.push('자원 예약을 확인하는 중입니다.');
    else if (d.resError) resourceGaps.push('자원 예약을 조회하지 못했습니다.');
    else if (d.resUnknown) resourceGaps.push('오늘 자원 예약 조회 여부를 확인할 수 없습니다.');
    else if (d.resPartial) resourceGaps.push('자원 예약은 일부 자원만 조회했습니다.');
    const holiday = (d.holidays || []).map(h => h.title || '휴일').join(' · ');
    const rowHtml = r => `<li class="hm-tl-${esc(r.kind)}"><span class="hm-tl-t">${r.allDay ? '종일' : esc(r.from) + (r.to ? '~' + esc(r.to) : '')}</span><span class="hm-tl-l">${esc(r.label)}</span></li>`;
    const tlHtml = `<section class="hm-card hm-today" aria-label="오늘 일정"><div class="hm-card-h"><h2 class="hm-card-k hm-today-k">오늘 일정</h2><button class="hm-link" data-act="homeTile" data-v="schedule">달력 열기</button></div>${holiday ? `<div class="hm-empty">그룹웨어 휴일 정보: ${esc(holiday)} (근무 여부는 별도 확인)</div>` : ''}${tl.rows.length ? `<ul class="hm-tl">${tl.rows.map(rowHtml).join('')}</ul>${tl.more ? `<div class="hm-more">외 ${tl.more}건 · <button class="hm-link" data-act="homeTile" data-v="schedule">일정 달력에서 보기</button></div>` : ''}` : '<div class="hm-empty">조회된 오늘 일정이 없습니다.</div>'}${awayLine ? `<div class="hm-away"><span class="hm-away-k">자리 비움</span> ${esc(awayLine)}</div>` : ''}${d.teamError ? '<div class="hm-empty">직원 근태를 조회하지 못해 자리 비움 현황을 확인할 수 없습니다.</div>' : d.teamLoading ? '<div class="hm-empty">직원 근태를 확인하는 중입니다.</div>' : d.teamUnknown ? '<div class="hm-empty">직원 근태 조회 여부를 확인할 수 없습니다.</div>' : ''}${gaps.map(x => `<div class="hm-empty">${esc(x)}</div>`).join('')}</section>`;
    const resources = R.homeTimelineCompact(d.resources, 5);
    const resourceHtml = `<section class="hm-card hm-today hm-res" aria-label="오늘 자원 예약"><div class="hm-card-h"><h2 class="hm-card-k hm-today-k">오늘 자원 예약 (직원 전체)</h2></div>${resources.rows.length ? `<ul class="hm-tl">${resources.rows.map(r => `<li class="hm-tl-car"><span class="hm-tl-t">${esc(r.from)}${r.to ? '~' + esc(r.to) : ''}</span><span class="hm-tl-l">${esc(r.label)}</span></li>`).join('')}</ul>${resources.more ? `<div class="hm-more">외 ${resources.more}건</div>` : ''}` : resourceGaps.length ? '' : '<div class="hm-empty">조회된 자원 예약이 없습니다.</div>'}${resourceGaps.map(x => `<div class="hm-empty">${esc(x)}</div>`).join('')}</section>`;
    const sum = (S.a && S.a.summary) || {};
    const sig = (id, icon, k, v) => `<button class="hm-sig" data-act="homeTile" data-v="${id}" aria-label="${esc(k + ' ' + v)}">${typeof ic === 'function' ? ic(icon) : ''}<span class="hm-sig-k">${esc(k)}</span><b class="hm-sig-v">${esc(v)}</b></button>`;
    const signals = `<section class="hm-card hm-sigs" aria-label="업무 참고 현황"><div class="hm-card-h"><h2 class="hm-card-k hm-today-k">챙겨 둘 것</h2></div><div class="hm-sig-l">${sig('mail', 'mail', '안 읽은 메일', d.unread == null ? '확인 불가' : '조회분 ' + d.unread + '건')}${sum.pending !== undefined ? sig('approval', 'doc', '내가 결재할 문서', sum.pending == null ? '확인 불가' : sum.pending + '건') : ''}${sig('ref', 'inbox', '부서 참고', (d.taskGaps ? '확인된 ' : '') + d.refN + '건')}${sig('leave', 'clock', '남은 연차', d.leave ? d.leave : '확인 불가')}</div></section>`;
    return tlHtml + signals + (typeof autoCardHtml === 'function' ? autoCardHtml() : '') + resourceHtml;
  }

  // 넓은 화면: 왼쪽은 비서(인사 + 대화), 오른쪽은 오늘 현황. 좁은 화면에서는 인사 → 대화 → 현황 순으로 쌓인다(순서는 CSS order).
  function vHome() {
    const d = homeData();
    return `<div class="hm" id="hm"><div class="hm-main"><div id="hmHead">${homeHeadHtml(d)}</div><div class="hm-chatcol">${typeof chatView === 'function' ? chatView() : ''}</div></div><aside class="hm-rail" aria-label="오늘 현황"><div id="hmTop">${homeTopHtml(d)}</div><div id="hmDash">${homeDashHtml(d)}</div></aside></div>`;
  }
  // 홈이 이미 그려져 있으면 입력창을 건드리지 않고 머리말과 요약만 새로 그린다(비동기 자료가 도착할 때 입력 중 포커스를 잃지 않게). 그렸으면 true.
  function homePartialRefresh() {
    const head = $('#hmHead'), dash = $('#hmDash');
    if (S.view !== 'home' || !head || !dash) return false;
    const d = homeData();
    head.innerHTML = homeHeadHtml(d); dash.innerHTML = homeDashHtml(d);
    const top = $('#hmTop'); if (top) top.innerHTML = homeTopHtml(d);
    // 새 대화가 없을 때 보이는 첫 브리핑도 같은 자료로 맞춘다(입력창은 그대로 둔다).
    try { if (typeof chatRefresh === 'function' && typeof chatState === 'function' && !chatState().busy && !chatState().msgs.some(m => !m.restored)) chatRefresh(); } catch (e) { logError('home.brief', e.message); }
    return true;
  }

  HOME_ACTS.homeTile = (el, v) => {
    if (['urgent', 'todo', 'wait'].includes(v)) { S.filter = {...S.filter, level: v === 'urgent' ? 'urgent' : v === 'wait' ? 'wait' : 'all', area: 'all', q: '', onlyNew: false, showHidden: false}; S.todayTab = 'mine'; go('today'); }
    else if (v === 'schedule' || v === 'away') { S.cal.offset = 0; if (v === 'away') teamCfg().day = today().replace(/-/g, ''); go('calendar'); }
    else if (v === 'mail') go('mail');
    else if (v === 'approval') go('approval');
    else if (v === 'leave') go('attendance');
    else if (v === 'ref') { S.filter = {...S.filter, level: 'all', area: 'all', q: '', onlyNew: false, showHidden: false}; S.todayTab = 'ref'; go('today'); }
  };
  HOME_ACTS.homeNext = (el, v) => { if (!v) return; go('today'); if (S.view !== 'today') return; S.filter = {...S.filter, level: 'all', area: 'all', q: '', onlyNew: false, showHidden: false}; S.todayTab = 'mine'; renderMain(); selectAction(v); };
  HOME_ACTS.homeOpenToday = () => { S.filter = {...S.filter, level: 'all', area: 'all', q: '', onlyNew: false, showHidden: false}; S.todayTab = 'mine'; go('today'); };
