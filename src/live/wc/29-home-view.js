// GW 비서 · 첫 화면 "홈" (v1.23: 왼쪽 먼저 할 일 한 건 → 오늘 현황(핵심 4 줄), 오른쪽 오늘 일정·챙겨 둘 것, 맨 아래 비서 대화)
// 같은 내용은 한 곳에만 둔다: 건수는 핵심 4 줄, 먼저 할 일은 맨 위 카드, 일정 목록은 오른쪽 '오늘' 카드, 결재·메일은 '챙겨 둘 것'.
// 읽기 전용 요약. 숫자는 '오늘 할 일'과 같은 기준(mineVisible, stateOf)을 쓴다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  // 홈·채팅 화면의 data-act 처리기 등록소. 16-events.js의 default 분기가 HOME_ACTS[act](el, v, e)를 부른다.
  const HOME_ACTS = {};
  // 왼쪽 메뉴 접기·펴기(아이콘만 남긴다). 고른 상태는 이 브라우저에 남는다.
  HOME_ACTS.navMini = () => { S.settings.navMini = !S.settings.navMini; saveLocal(); applyLook(); };

  function groupwareTaskGaps() {
    const sources = ['approval', 'mail', 'attendance', 'leave', 'notice', '시간외 지문 확인'];
    return !!(S.error || S.raw?.sessionExpired || S.raw?.data?.mail?.partial || S.a?.failed?.some(x => sources.includes(x.name)) || sources.some(k => S.raw?.status?.[k]?.ok === false || S.raw?.status?.[k]?.error) || Object.values(S.a?.approval?.lists || {}).some(x => x?.error));
  }

  function homeData() {
    const loaded = !!(S.a && S.raw);
    const out = {loaded, mine: [], urgent: 0, todo: 0, check: 0, wait: 0, refN: 0, events: [], away: [], timeline: [], resources: []};
    if (!loaded) return out;
    const mine = mineVisible();
    const cnt = st => mine.filter(x => st.includes(stateOf(x))).length;
    out.mine = mine; out.urgent = cnt(['overdue', 'urgent']); out.todo = cnt(['todo']); out.check = cnt(['check', 'confirm']);
    out.wait = visibleActions().filter(x => isMine(x) && stateOf(x) === 'wait').length;
    out.taskGaps = groupwareTaskGaps();
    out.refN = visibleActions().filter(x => !isMine(x)).length;
    const status = S.raw.status?.leave;
    const lv = !S.error && !S.raw.sessionExpired && status?.ok !== false && !status?.error && S.raw.data?.leave;
    out.unread = mailSnapshot().unread;
    // 핵심 4의 근태·예산 줄: 수집기가 이미 읽은 오늘 출퇴근·관심 사업 예산만 쓴다. 카드 사용내역은 예산 화면에서 이미 읽었을 때만 보탠다.
    out.attToday = !S.error && !S.raw.sessionExpired && S.raw.data && S.raw.data.attendance ? S.raw.data.attendance.today || null : null;
    out.workday = S.a.today ? S.a.today.isWorkday !== false : true;
    out.attCheck = mine.filter(x => x.area === '근태').length;
    out.budgetProjects = (S.a.budget && S.a.budget.projects) || [];
    out.elapsedPct = S.a.budget ? S.a.budget.elapsedPct : null;
    try { out.cardOpen = typeof CDU === 'object' && CDU && CDU.data && CDU.period === 'month' && Array.isArray(CDU.data.rows) ? CDU.data.rows.filter(r => r.status === 'open').length : null; } catch { out.cardOpen = null; }
    out.leave = Number.isFinite(lv?.remaining) ? fmtDays(lv.remaining) : '';
    out.leaveTypes = lv?.balances ? leaveTypesText(lv) : '유형별 잔여 확인 불가';
    const p = R.kstNow(new Date()), t8 = p.date.replace(/-/g, ''), mk = t8.slice(0, 6);
    // 오늘 일정은 그룹웨어 일정과 내 휴가·출장만 포함한다. 자원 예약은 별도 섹션이다.
    const schedule = S.raw.data && S.raw.data.schedule;
    const scheduleStatus = S.raw.status && S.raw.status.schedule;
    const start = String(schedule && schedule.start || '').replace(/-/g, '').slice(0, 8), end = String(schedule && schedule.end || '').replace(/-/g, '').slice(0, 8);
    out.scheduleUnknown = !!(S.error || S.raw.sessionExpired || !schedule || !Array.isArray(schedule.events) || (scheduleStatus && (scheduleStatus.ok === false || scheduleStatus.error)) || !start || !end || t8 < start || t8 > end);
    out.holidays = !out.scheduleUnknown && schedule && Array.isArray(schedule.holidays) ? schedule.holidays.filter(h => String(h.date || '').replace(/-/g, '').slice(0, 8) === t8) : [];
    const sched = !out.scheduleUnknown ? schedule.events : [];
    for (const e of sched) {
      const s = String(e.start || ''), z = String(e.end || e.start || '');
      if (s.slice(0, 8) <= t8 && z.slice(0, 8) >= t8) out.timeline.push({from: e.allDay ? '' : s.slice(8, 10) + ':' + s.slice(10, 12), to: e.allDay || z.length < 12 ? '' : z.slice(8, 10) + ':' + z.slice(10, 12), label: e.title, allDay: !!e.allDay, kind: 'etc'});
    }
    try { if (typeof ensureTeam === 'function') ensureTeam(mk); } catch (e) { logError('home.team', e.message); }
    const apps = S.appsC && S.appsC.user === currentKey && S.appsC.data;
    out.otUnknown = !apps || !apps.me || !Array.isArray(apps.apps);
    out.overtime = !out.otUnknown && typeof R.homeOvertime === 'function' ? R.homeOvertime(apps.apps, {date: t8, me: apps.me}) : [];
    for (const ot of out.overtime) {
      const fmt = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
      out.timeline.push({from: fmt(ot.from), to: fmt(Math.min(ot.end, 1440)), label: ot.label + (ot.end > 1440 ? ' (다음 날 종료)' : ''), allDay: false, kind: 'ot'});
    }
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
    if (d.loaded) g.sub = '';
    if (!d.loaded && S.error) g.sub = '그룹웨어 자료를 읽지 못했습니다';
    if (d.loaded && d.taskGaps) { g.sub = '일부 자료를 읽지 못해 할 일 현황이 불완전할 수 있습니다'; g.tone = 'warn'; }
    return `<div class="hm-head"><div class="hm-eyebrow">${esc(day.label)}${day.weekend ? ' · 주말' : ''}</div><h1 class="hm-hello">오늘의 업무</h1>${g.sub ? `<p class="hm-sub hm-tone-${g.tone}">${esc(g.sub)}</p>` : ''}</div>`;
  }

  // 하루 띠: 08~19시를 한 줄로 놓고 오늘 일정과 내 부재를 칸으로, 지금 시각을 바늘로 보여 준다(계산은 R.homeDayRail).
  // 칸을 누르면 일정 달력으로 간다. 바늘은 wc/39-motion.js가 1분마다 옮긴다.
  const homeNowMin = () => { const k = new Date(Date.now() + 9 * 3600000); return k.getUTCHours() * 60 + k.getUTCMinutes(); };
  // 지문 시각 HH:MM. 수집기는 HHMM·HHMMSS·YYYYMMDDHHMM 중 하나로 줄 수 있어 숫자만 보고 고른다.
  const homeHm = s => { const n = String(s || '').replace(/\D/g, ''), x = n.length >= 12 ? n.slice(8, 12) : n.length >= 4 ? n.slice(0, 4) : ''; return /^([01]\d|2[0-3])[0-5]\d$/.test(x) ? x.slice(0, 2) + ':' + x.slice(2) : ''; };
  function homeLiveTick() {
    try {
      if (!S.open) return;
      const nowMin = homeNowMin();
      const box = $('#hmRailBox'), a = root.activeElement;
      if (S.view === 'home' && box && homeRailLast && !(a && box.contains(a))) box.innerHTML = homeRailHtml(homeRailLast.d, homeRailLast.day);
      const att = $('[data-live="att"]');
      if (att && homeAttLast && typeof R.homeAttendanceLine === 'function') { const x = R.homeAttendanceLine({...homeAttLast, nowMin}); if (att.textContent !== x.text) { att.textContent = x.text; const b = att.closest('button'); if (b) b.setAttribute('aria-label', '근태·연차, ' + x.text); } }
      const at = $('[data-live="att-today"]');
      if (at && typeof attTodayText === 'function') { const x = attTodayText(); if (x && at.textContent !== x) at.textContent = x; }
    } catch (e) { logError('home.live', e.message); }
  }
  const homeDur = m => (m >= 60 ? Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '') : m + '분');
  // v1.25: 하루 띠와 '다음 일정 N분 뒤 · 퇴근까지' 글자, 근태 줄의 '출근 후 N시간'은 homeLiveTick이 30초마다 다시 센다(홈 전체를 다시 그리지 않는다).
  let homeRailLast = null, homeAttLast = null;
  function homeRailHtml(d, day) {
    homeRailLast = {d, day};
    if (!d.loaded || d.scheduleUnknown || typeof R.homeDayRail !== 'function') return '';
    const off = day && (day.weekend || day.holiday);
    const overtime = d.overtime || [];
    const activeOt = overtime.filter(x => x.end > homeNowMin());
    const otEnd = activeOt.length ? Math.max(...activeOt.map(x => x.end)) : 0;
    const useOtEnd = activeOt.length > 0 && (off || otEnd >= 18 * 60);
    const end = useOtEnd ? otEnd : 18 * 60;
    const endH = Math.min(24, Math.max(19, Math.ceil(end / 60)));
    const r = R.homeDayRail(d.timeline, {nowMin: homeNowMin(), endH, workEndMin: useOtEnd ? end : null});
    const blocks = r.blocks.map((b, i) => `<button class="dr-b dr-${b.kind}${b.done ? ' dr-done' : ''}" style="left:${b.left}%;width:${b.width}%;--i:${i}" data-act="homeTile" data-v="schedule" title="${esc(b.time + ' ' + b.label)}" aria-label="${esc(b.time + ' ' + b.label + (b.done ? ' (지남)' : ''))}">${esc(b.label)}</button>`).join('');
    const notes = [];
    if (r.allDay.length) notes.push(`<span class="dr-allday"><i aria-hidden="true"></i>종일 <b>${esc(r.allDay.slice(0, 2).join(', '))}</b>${r.allDay.length > 2 ? ` 외 ${r.allDay.length - 2}건` : ''}</span>`);
    if (r.next) notes.push(`<span>다음 일정 <b>${esc(r.next.label)}</b> ${homeDur(r.next.inMin)} 뒤</span>`);
    else if (!r.blocks.length && !r.allDay.length) notes.push('<span>오늘 시간이 정해진 일정이 없습니다</span>');
    if (!d.otUnknown && (!off || overtime.length) && r.leftMin) notes.push(`<span>${useOtEnd ? '승인 시간외 종료' : '기본 근무 종료'}까지 <b>${homeDur(r.leftMin)}</b>${useOtEnd ? ` (예정 ${esc(String(Math.floor(end / 60) % 24).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0'))}${end >= 1440 ? ' 다음 날' : ''})` : ' (18:00 기준)'}</span>`);
    if (d.otUnknown) notes.push('<span>시간외 신청 확인 중 또는 조회 불가</span>');
    if (r.outside) notes.push(`<span>이 시간대 밖 일정 ${r.outside}건</span>`);
    return `<div class="dr" id="dayRail" role="group" aria-label="오늘 하루 시간표 (8시부터 ${endH}시)"><div class="dr-track"><i class="dr-past" id="drPast" style="width:${r.now.left}%"></i><i class="dr-lunch" style="left:${r.lunch.left}%;width:${r.lunch.width}%" title="점심"></i>${blocks}</div>${r.now.inRange ? `<div class="dr-now${r.now.edge ? ' dr-edge-' + r.now.edge : ''}" id="drNow" style="left:${r.now.left}%" aria-hidden="true"><b>${esc(r.now.label)}</b></div>` : ''}<div class="dr-ticks" aria-hidden="true">${r.ticks.map(t => `<span class="dr-tick" style="left:${t.left}%">${t.h}</span>`).join('')}</div></div>${notes.length ? `<div class="dr-note">${notes.join('')}</div>` : ''}`;
  }

  // v1.23 인사 바로 아래: 먼저 할 일 한 건(그룹웨어·개인 ToDo 중 더 급한 것)과 '핵심 4' 줄(할 일 · 일정·예약 · 근태·연차 · 예산 집행).
  // 숫자는 홈에서 한 번만 나온다: 할 일 건수는 할 일 줄, 일정 수·자리 비움 수는 일정 줄, 남은 연차는 근태 줄, 결재·메일은 오른쪽 '챙겨 둘 것'.
  function homeTopHtml(d) {
    if (!d.loaded && S.error) return `<section class="hm-card hm-next" role="status">그룹웨어 자료를 읽지 못했습니다. 새로 고침 후 다시 확인하세요.</section>`;
    if (!d.loaded) return `<section class="hm3-core" aria-label="오늘 현황"><ul class="hm3-list">${'<li class="hm3-row hm-skel" aria-hidden="true"></li>'.repeat(4)}</ul></section>`;
    return homeFirstHtml(d) + homeCoreHtml(d);
  }
  const homePersonal = () => (typeof personalHomeDue === 'function' && typeof TD === 'object' && TD ? personalHomeDue() : null);
  // 먼저 할 일 한 건: 그룹웨어 기한 지남·급함(다른 사람이 기다리는 일) → 개인 기한 지남 → 개인 오늘 마감 → 그룹웨어 나머지 순서.
  function homeFirstHtml(d) {
    const day = R.kstNow(new Date()).date;
    const p = homePersonal();
    const next = R.homeNextAction(d.mine.map(x => ({key: x.key, title: x.title, headline: x.headline, area: x.area, state: stateOf(x), deadline: x.deadline && x.deadline.date ? x.deadline.date.slice(5) + (x.deadline.time ? ' ' + x.deadline.time : '') : ''})));
    const tone = s => (s === 'overdue' || s === 'urgent' ? 'urgent' : 'todo');
    const picked = next && d.mine.find(x => x.key === next.key);
    const nextLabel = picked?.type === 'mail' ? '메일 읽기' : picked?.area === '결재' ? '결재 문서 열기' : picked?.area === '근태' ? '근태 기록 확인' : '업무 상세 보기';
    const reason = next && (next.state === 'overdue' ? '기한이 지났습니다' : picked?.deadline?.date === day ? '오늘 마감입니다' : next.state === 'urgent' && picked?.deadline?.dday === 1 ? '내일 마감입니다' : ({pending: '내 결재가 대기 중입니다', rejected: '내 문서가 반려되었습니다', conflict: '기한과 일정이 겹칩니다'}[picked?.base] || ({urgent: '우선 확인이 필요한 업무입니다', todo: '내가 처리할 그룹웨어 업무입니다', check: '확인이 필요합니다', confirm: '처리 여부를 확인해야 합니다'}[next.state])));
    const pick = next && ['overdue', 'urgent'].includes(next.state) ? 'gw' : p && p.late.length ? 'late' : p && p.today.length ? 'today' : next ? 'gw' : '';
    if (pick === 'late' || pick === 'today') {
      const t = pick === 'late' ? p.late[0] : p.today[0];
      return `<section class="hm-card hm-next hm-next-p" aria-label="먼저 할 일"><div class="hm-card-h"><h2 class="hm-card-k"><span class="desk-index" aria-hidden="true">01</span> 먼저 할 일 · 개인 ToDo</h2><span class="hm-badge hm-tone-urgent">${pick === 'late' ? '기한 지남' : '오늘 마감'}</span></div><div class="hm-next-b"><div class="hm-next-t">${esc(t.title)}</div><div class="hm-next-s">${pick === 'late' ? '기한이 지났습니다' : '오늘 마감입니다'} · 기한 ${esc(String(t.due || '').slice(5).replace('-', '/'))}${next ? `<br>그룹웨어에서 먼저 볼 업무: ${esc(next.title)}` : ''}</div></div><div class="hm-next-a"><button class="ch-btn ch-btn-primary" data-act="tdSel" data-id="${esc(t.id)}">ToDo 열기</button><button class="ch-btn ch-btn-ghost" data-act="homeOpenToday">할 일 목록 보기</button></div></section>`;
    }
    const emptyTail = d.taskGaps ? '일부 자료를 읽지 못해 전체 할 일을 확인할 수 없습니다.' : d.refN ? `부서 참고 공문 ${d.refN}건이 등록되어 있습니다.` : p && p.known ? '오늘까지인 개인 ToDo도 없습니다.' : '개인 ToDo는 할 일 목록에서 확인하세요.';
    return pick === 'gw'
      ? `<section class="hm-card hm-next" aria-label="먼저 할 일"><div class="hm-card-h"><h2 class="hm-card-k"><span class="desk-index" aria-hidden="true">01</span> 먼저 할 일 · 그룹웨어</h2><span class="hm-badge hm-tone-${tone(next.state)}">${esc(STATE_NAME[next.state] || '')}</span></div><div class="hm-next-b"><div class="hm-next-t">${esc(next.title)}</div><div class="hm-next-s">${esc(reason)} · ${esc(next.deadline ? '기한 ' + next.deadline : '확인된 기한 없음')}<br>다음: ${esc(next.sub || '업무 상세 확인')}</div></div><div class="hm-next-a"><button class="ch-btn ch-btn-primary" data-act="homeNext" data-v="${esc(next.key)}">${nextLabel}</button><button class="ch-btn ch-btn-ghost" data-act="homeOpenToday">할 일 목록 보기</button></div></section>`
      : `<section class="hm-card hm-next hm-next-ok" aria-label="먼저 할 일"><div class="hm-card-h"><h2 class="hm-card-k">${d.taskGaps ? '그룹웨어 업무를 모두 확인할 수 없습니다' : '현재 확인된 내 일 없음'}</h2></div><div class="hm-next-s">${S.lastRefresh ? esc(hhmm(S.lastRefresh)) + ' 조회 기준 · ' : ''}${emptyTail}</div></section>`;
  }
  // 핵심 4: 줄마다 요약 한 줄 + 주 동작 하나. 줄을 누르면 그 메뉴로 간다. 예산은 수집기가 이미 읽은 값만 쓴다(홈에서 새로 조회하지 않는다).
  function homeCoreHtml(d) {
    const p = homePersonal();
    const gap = d.taskGaps ? '확인된 ' : '';
    const todoTxt = [`그룹웨어 ${gap}처리·확인 ${d.mine.length}건`, d.urgent ? `우선 ${d.urgent}건` : '', d.wait ? `기다리는 중 ${d.wait}건` : '', p ? p.text : ''].filter(Boolean).join(' · ') + (d.taskGaps ? ' (일부 자료 누락 가능)' : '');
    const teamGap = d.teamLoading || d.teamError || d.teamUnknown;
    const schedTxt = [d.scheduleUnknown ? '오늘 일정 일부 미확인' : `오늘 그룹웨어 일정 ${d.events.length}건${teamGap || d.otUnknown ? ' (일부 미확인)' : ''}`, d.teamError ? '자리 비움 조회 실패' : d.teamLoading ? '자리 비움 확인 중' : d.teamUnknown ? '자리 비움 확인 불가' : `자리 비움 ${d.away.length}명`, d.resUnknown ? '' : `자원 예약 ${d.resources.length}건${d.resPartial ? '(일부 자원)' : ''}`].filter(Boolean).join(' · ');
    homeAttLast = {come: homeHm(d.attToday && d.attToday.come), leave: homeHm(d.attToday && d.attToday.leave), error: !d.attToday || !!d.attToday.error, workday: d.workday, remaining: d.leave, check: d.attCheck};
    const att = typeof R.homeAttendanceLine === 'function' ? R.homeAttendanceLine({...homeAttLast, nowMin: homeNowMin()}) : {text: '', tone: 'info'};
    const bud = typeof R.homeBudgetLine === 'function' ? R.homeBudgetLine(d.budgetProjects, d.elapsedPct) : {text: '', tone: 'info'};
    const cardOpen = d.cardOpen == null ? '' : ` · 이번 달 결의 전 카드 ${d.cardOpen}건`;
    const row = (v, key, text, tone, act) => `<li class="hm3-row hm3-tone-${tone}"><button class="hm3-go" data-act="homeTile" data-v="${v}" aria-label="${esc(key + ', ' + text)}"><span class="hm3-k">${esc(key)}</span><span class="hm3-v"${v === 'leave' ? ' data-live="att"' : ''}>${esc(text)}</span></button>${act}</li>`;
    const btn = (attrs, label) => `<button class="ch-btn ch-btn-ghost hm3-act" ${attrs}>${label}</button>`;
    return `<section class="hm3-core" aria-label="오늘 현황"><h2 class="hm-card-k hm3-h">오늘 현황</h2><ul class="hm3-list">
      ${row('todo', '할 일', todoTxt, d.urgent ? 'urgent' : d.taskGaps ? 'warn' : 'info', btn('data-act="homeOpenToday"', '할 일 열기'))}
      ${row('schedule', '일정·예약', schedTxt, d.scheduleUnknown || teamGap ? 'warn' : 'info', typeof allowed === 'function' && allowed('resource') ? btn('data-act="homeTile" data-v="reserve"', '예약하기') : btn('data-act="homeTile" data-v="schedule"', '달력 열기'))}
      ${row('leave', '근태·연차', att.text, att.tone, btn('data-act="quickAtt" data-t="leave"', '휴가 신청 준비'))}
      ${row('budget', '예산 집행', bud.text + cardOpen, bud.tone, btn('data-act="openPay"', '지출결의 준비'))}
    </ul></section>`;
  }

  // 오른쪽: 오늘 일정(하루 띠 + 목록 + 자리 비움), 챙겨 둘 것, 자동화, 자원 예약.
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
    const dayInfo = typeof R.homeDayInfo === 'function' ? R.homeDayInfo({date: R.kstNow(new Date()).date, holidays: d.holidays || []}) : null;
    const rowHtml = r => `<li class="hm-tl-${esc(r.kind)}"><span class="hm-tl-t">${r.allDay ? '종일' : esc(r.from) + (r.to ? '~' + esc(r.to) : '')}</span><span class="hm-tl-l">${esc(r.label)}</span></li>`;
    const tlHtml = `<section class="hm-card hm-today" aria-label="오늘 일정"><div class="hm-card-h"><h3 class="hm-card-k hm-today-k">오늘 그룹웨어 일정</h3><button class="hm-link" data-act="homeTile" data-v="schedule">달력 열기</button></div><div id="hmRailBox">${homeRailHtml(d, dayInfo)}</div>${holiday ? `<div class="hm-empty">그룹웨어 휴일 정보: ${esc(holiday)} (근무 여부는 별도 확인)</div>` : ''}${tl.rows.length ? `<ul class="hm-tl">${tl.rows.map(rowHtml).join('')}</ul>${tl.more ? `<div class="hm-more">외 ${tl.more}건 · <button class="hm-link" data-act="homeTile" data-v="schedule">일정 달력에서 보기</button></div>` : ''}` : d.scheduleUnknown || d.teamLoading || d.teamError || d.teamUnknown ? '<div class="hm-empty">일정 일부가 미확인입니다. 확인 후 다시 안내합니다.</div>' : '<div class="hm-empty">조회된 그룹웨어 일정이 없습니다. 구글 일정은 별도로 확인하세요.</div>'}${awayLine ? `<div class="hm-away"><span class="hm-away-k">자리 비움</span> ${esc(awayLine)}</div>` : ''}${d.teamError ? '<div class="hm-empty">직원 근태를 조회하지 못해 자리 비움 현황을 확인할 수 없습니다.</div>' : d.teamLoading ? '<div class="hm-empty">직원 근태를 확인하는 중입니다.</div>' : d.teamUnknown ? '<div class="hm-empty">직원 근태 조회 여부를 확인할 수 없습니다.</div>' : ''}${gaps.map(x => `<div class="hm-empty">${esc(x)}</div>`).join('')}</section>`;
    const resources = R.homeTimelineCompact(d.resources, 5);
    const resourceHtml = `<section class="hm-card hm-today hm-res" aria-label="오늘 자원 예약"><div class="hm-card-h"><h3 class="hm-card-k hm-today-k">오늘 자원 예약 (직원 전체)</h3></div>${resources.rows.length ? `<ul class="hm-tl">${resources.rows.map(r => `<li class="hm-tl-car"><span class="hm-tl-t">${esc(r.from)}${r.to ? '~' + esc(r.to) : ''}</span><span class="hm-tl-l">${esc(r.label)}</span></li>`).join('')}</ul>${resources.more ? `<div class="hm-more">외 ${resources.more}건</div>` : ''}` : resourceGaps.length ? '' : '<div class="hm-empty">조회된 자원 예약이 없습니다.</div>'}${resourceGaps.map(x => `<div class="hm-empty">${esc(x)}</div>`).join('')}</section>`;
    const sum = (S.a && S.a.summary) || {};
    const sig = (id, icon, k, v) => `<button class="hm-sig" data-act="homeTile" data-v="${id}" aria-label="${esc(k + ' ' + v)}">${typeof ic === 'function' ? ic(icon) : ''}<span class="hm-sig-k">${esc(k)}</span><b class="hm-sig-v">${esc(v)}</b></button>`;
    const signals = `<section class="hm-card hm-sigs" aria-label="업무 참고 현황"><div class="hm-card-h"><h3 class="hm-card-k hm-today-k">챙겨 둘 것</h3></div><div class="hm-sig-l">${homeRiskSig()}${sig('mail', 'mail', '안 읽은 메일', d.unread == null ? '확인 불가' : '조회분 ' + d.unread + '건')}${sum.pending !== undefined ? sig('approval', 'doc', '내가 결재할 문서', sum.pending == null ? '확인 불가' : sum.pending + '건') : ''}</div></section>`;
    // v1.23: 남은 연차는 핵심 4의 근태 줄, 부서 참고는 할 일(그룹웨어 › 부서 참고)으로 옮겼다. 자동화는 만든 것이 있을 때만 보이고 관리는 설정에서 한다.
    const autos = typeof autoCardHtml === 'function' && typeof autoList === 'function' && autoList().length ? autoCardHtml() : '';
    return tlHtml + signals + autos + resourceHtml;
  }

  // v0.94.0: "놓치기 쉬운 일"을 묻지 않아도 보이게(지난·임박 기한, 하루 넘게 안 읽은 요청 메일, 오래된 답장 확인, 근태 확인, 반려). 누르면 비서가 이유와 함께 답한다.
  function homeRiskSig() {
    if (!S.a || typeof R.cuRisks !== 'function') return '';
    const taskGaps = groupwareTaskGaps();
    // 이미 읽어 둔 메일 본문의 기한까지 반영(새로 열지는 않음 — 홈을 그릴 때마다 요청을 보내지 않는다)
    const items = typeof cuRiskItemsCached === 'function' ? cuRiskItemsCached() : mineVisible().map(x => ({key: x.key, title: x.title, state: stateOf(x), base: x.base, type: x.type, deadline: x.deadline && x.deadline.date || '', when: x.when || ''}));
    const n = R.cuRisks(items, {today: today()}).length;
    return `<button class="hm-sig" data-act="homeTile" data-v="risks" aria-label="${esc('놓치기 쉬운 일 ' + (taskGaps && !n ? '전체 확인 불가' : (taskGaps ? '확인된 ' : '') + n + '건') + ', 누르면 비서가 이유를 알려 줍니다')}">${typeof ic === 'function' ? ic('alert') : ''}<span class="hm-sig-k">놓치기 쉬운 일</span><b class="hm-sig-v">${n ? (taskGaps ? '확인된 ' : '') + n + '건 · 이유 보기' : taskGaps ? '전체 확인 불가' : '없음'}</b></button>`;
  }

  // 넓은 화면: 왼쪽은 인사 → 지금 할 일 → 숫자 줄 → 대화, 오른쪽은 오늘 일정과 참고. 좁은 화면에서는 같은 순서로 한 줄로 쌓인다(순서는 CSS order).
  function vHome() {
    const d = homeData();
    // v1.23: 왼쪽은 먼저 할 일 → 오늘 현황(핵심 4), 오른쪽은 오늘 일정과 참고. 비서 대화는 아직 기능이 부족해 맨 아래에 둔다.
    // '바로 시작' 버튼은 핵심 4 줄의 주 동작(휴가 신청 준비 등)과 머리줄 '새로 만들기'(결과보고·출장)가 맡는다.
    return `<div class="hm desk hm3" id="hm"><div id="hmHead">${homeHeadHtml(d)}</div><div class="hm3-grid"><div class="hm3-main"><div id="hmTop">${homeTopHtml(d)}</div></div><aside class="hm3-rail" aria-label="오늘 일정과 참고"><h2 class="desk-ref">일정과 참고</h2><div id="hmDash">${homeDashHtml(d)}</div></aside></div><section class="hm3-chat" aria-label="비서에게 묻기">${typeof chatView === 'function' ? chatView() : ''}</section></div>`;
  }
  // 홈이 이미 그려져 있으면 입력창을 건드리지 않고 머리말과 요약만 새로 그린다(비동기 자료가 도착할 때 입력 중 포커스를 잃지 않게). 그렸으면 true.
  // Replacing summary regions must not discard the keyboard user's current control.
  function homeReplaceHtml(region, html) {
    if (!region) return;
    const active = root.activeElement;
    const owned = !!(active && region.contains(active));
    const controls = owned ? [...region.querySelectorAll('[data-act], summary, [tabindex]')] : [];
    const peers = owned ? controls.filter(el => el.tagName === active.tagName && el.dataset.act === active.dataset.act && el.dataset.v === active.dataset.v) : [];
    const occurrence = peers.indexOf(active);
    const opened = [...region.querySelectorAll('details[open]')].map(el => el.className).filter(Boolean);
    region.innerHTML = html;
    if (opened.length) region.querySelectorAll('details').forEach(el => { if (opened.includes(el.className)) el.open = true; });
    if (!owned) return;
    const candidates = [...region.querySelectorAll('[data-act], summary, [tabindex]')].filter(el => el.tagName === active.tagName && el.dataset.act === active.dataset.act && el.dataset.v === active.dataset.v);
    const target = candidates[occurrence] || $('#chInput');
    if (target) target.focus({preventScroll: true});
  }
  function homePartialRefresh() {
    const head = $('#hmHead'), dash = $('#hmDash');
    if (S.view !== 'home' || !head || !dash) return false;
    const d = homeData();
    homeReplaceHtml(head, homeHeadHtml(d)); homeReplaceHtml(dash, homeDashHtml(d));
    const top = $('#hmTop'); if (top) homeReplaceHtml(top, homeTopHtml(d));
    // 새 대화가 없을 때 보이는 첫 브리핑도 같은 자료로 맞춘다(입력창은 그대로 둔다).
    try { if (typeof chatRefresh === 'function' && typeof chatState === 'function' && !chatState().busy && !chatState().msgs.some(m => !m.restored)) chatRefresh(); } catch (e) { logError('home.brief', e.message); }
    return true;
  }

  HOME_ACTS.homeTile = (el, v) => {
    if (v === 'risks') { if (typeof chatSend === 'function') { const i = $('#chInput'); if (i) i.focus({preventScroll: true}); chatSend('이번 주에 내가 놓치기 쉬운 거 있어?'); } return; }
    if (['urgent', 'todo', 'wait'].includes(v)) { S.filter = {...S.filter, level: v === 'urgent' ? 'urgent' : v === 'wait' ? 'wait' : 'all', area: 'all', q: '', onlyNew: false, showHidden: false}; S.todayTab = 'mine'; S.todoSrc = 'all'; go('today'); }
    else if (v === 'schedule' || v === 'away') { S.cal.offset = 0; if (v === 'away') teamCfg().day = today().replace(/-/g, ''); go('calendar'); }
    else if (v === 'mail') openUnreadMail();
    else if (v === 'approval') { if (go('approval')) { S.apTab = 'pending'; S.apTabPinned = true; renderMain(); } } // 이동한 뒤 고정해야 빈 목록이어도 '결재 대기'가 열린다
    else if (v === 'leave') go('attendance');
    else if (v === 'budget') go('budget');
    else if (v === 'reserve') { if (go('resource') === false) { S.cal.offset = 0; go('calendar'); } }
    else if (v === 'mytodo') go('mytodo');
    else if (v === 'ref') { S.filter = {...S.filter, level: 'all', area: 'all', q: '', onlyNew: false, showHidden: false}; S.todoSrc = 'gw'; S.todayTab = 'ref'; go('today'); }
  };
  // v1.23 일정·예약: 달력에서 고른 날의 자원 예약 탭을 연다(예약 자체는 자원 예약 화면의 확인 카드를 눌러야 한다).
  HOME_ACTS.calReserve = (el, v) => {
    if (!/^\d{8}$/.test(String(v || '')) || typeof resState !== 'function') return;
    const s = resState(); if (s.date !== v) { s.date = v; if (typeof resInvalidate === 'function') resInvalidate(); }
    go('resource');
  };
  HOME_ACTS.homeNext = (el, v) => { if (!v) return; el.focus({preventScroll:true}); selectAction(v); };
  HOME_ACTS.homeOpenToday = () => { S.filter = {...S.filter, level: 'all', area: 'all', q: '', onlyNew: false, showHidden: false}; S.todayTab = 'mine'; S.todoSrc = 'all'; go('today'); };
