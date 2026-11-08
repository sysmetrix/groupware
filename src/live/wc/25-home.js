// GW 통합 업무센터 · 홈 하루 요약 (오늘 타임라인, 퇴근 정리, 내 상신문서 결재 지연)
// 읽기 전용. 이미 가져온 일정·근태·자원·상신문서 자료를 한 곳에 모아 보여 준다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  function homeResEnsure() {
    if (!allowed('resource') || !GW.resourceList || !GW.resourceBookings) return;
    const h = S.homeRes = S.homeRes || {at: 0, items: [], busy: false};
    if (h.busy || Date.now() - h.at < 10 * 60000) return;
    h.busy = true;
    const day = R.kstNow(new Date()).date.replace(/-/g, '');
    (async () => {
      try {
        const list = (await GW.resourceList()).filter(r => r.useYn !== 'N');
        const out = [];
        for (const r of list.slice(0, 4)) for (const b of await GW.resourceBookings({from: day, to: day, resSeqs: [r.resSeq]})) out.push({start: b.start, end: b.end, label: `${r.name.replace(/\(.*$/, '')} ${b.who}${b.title ? ' · ' + b.title : ''}`, kind: 'car'});
        h.items = out;
      } catch (e) { logError('homeRes', e.message); }
      h.busy = false; h.at = Date.now();
      if (S.view === 'today') renderMain();
    })();
  }

  function homeDayCard() {
    const p = R.kstNow(new Date()), today = p.date.replace(/-/g, '');
    const tmr = R.kstNow(new Date(Date.now() + 86400000)).date.replace(/-/g, '');
    homeResEnsure();
    const sched = (S.raw && S.raw.data && S.raw.data.schedule && S.raw.data.schedule.events) || [];
    const mk = p.date.slice(0, 7).replace('-', '');
    const team = (S.team || {})[mk];
    const rows = (team && team.rows) || [];
    const mineToday = rows.filter(r => r.mine && r.date === today);
    const items = [];
    for (const e of sched) items.push({start: e.start, end: e.end || e.start, label: e.title, kind: 'etc', allDay: !!e.allDay});
    for (const r of mineToday) {
      if (/연장|휴일근무|조기|시간외/.test(r.item) && r.appStart && r.appEnd) items.push({start: today + r.appStart, end: today + r.appEnd, label: `시간외 ${r.item}`, kind: 'ot'});
      else if (/휴가|연차|반차|출장|교육|대체/.test(r.item)) items.push({start: today + (r.appStart || '0000'), end: today + (r.appEnd || '2359'), label: r.item, kind: 'away', allDay: !r.appStart});
    }
    for (const b of (S.homeRes && S.homeRes.items) || []) items.push(b);
    const tl = R.buildDayTimeline(items, today, new Date());
    const span = tl.hi - tl.lo, pct = m => ((m - tl.lo) / span * 100).toFixed(2);
    const color = {etc: 'var(--accent)', car: 'var(--ok)', ot: '#a78bfa', away: 'var(--md)'};
    const ticks = [8, 10, 12, 14, 16, 18].map(h => `<span class="tk" style="left:${pct(h * 60)}%">${h}</span>`).join('');
    const bars = tl.segs.map(s => `<span class="sg" style="left:${pct(s.a)}%;width:${((s.z - s.a) / span * 100).toFixed(2)}%;background:${color[s.kind] || color.etc}" title="${esc(s.from + '~' + s.to + ' ' + s.label)}"></span>`).join('');
    const now = tl.nowMin !== null ? `<span class="nw" style="left:${pct(tl.nowMin)}%"></span>` : '';
    const list = [...tl.allDay.map(a => `<span class="bdg info">종일</span> ${esc(a.label)}`), ...tl.segs.map(s => `<span class="muted">${esc(s.from)}~${esc(s.to)}</span> ${esc(s.label)}`)];
    // 퇴근 정리
    const otToday = mineToday.find(r => /연장|휴일근무|시간외/.test(r.item) && r.appStart && r.appEnd);
    const tmrAway = team && team.cal && team.cal.byDate[tmr] ? team.cal.byDate[tmr].filter(x => x.kind !== 'ot') : [];
    const tmrItems = sched.filter(e => String(e.start).slice(0, 8) === tmr).map(e => `${e.allDay ? '종일' : String(e.start).slice(8, 10) + ':' + String(e.start).slice(10)} ${e.title}`);
    const wrap = R.wrapUpModel({ownOtToday: otToday ? {from: R.minToHm(Number(otToday.appStart.slice(0, 2)) * 60 + Number(otToday.appStart.slice(2))), to: R.minToHm(Number(otToday.appEnd.slice(0, 2)) * 60 + Number(otToday.appEnd.slice(2)))} : null, tomorrowItems: tmrItems, tomorrowAway: tmrAway.map(x => `${x.name}(${x.label})`), pendingMine: mineVisible().length});
    const wrapHtml = wrap.active ? `<div class="box" style="margin-top:10px"><b>퇴근 정리</b>
      ${wrap.otReminder ? `<div style="color:var(--md);margin-top:4px">${esc(wrap.otReminder)}</div>` : ''}
      <div class="muted" style="margin-top:4px">남은 내 할 일 ${wrap.pendingMine}건${wrap.pendingMine ? ' · 오늘 못 끝낸 것은 “내일로 미루기”로 정리하세요' : ''}</div>
      <div style="margin-top:4px">내일 일정: ${wrap.tomorrow.length ? wrap.tomorrow.map(esc).join(' · ') : '<span class="muted">없음</span>'}</div>
      <div>내일 자리 비움: ${wrap.away.length ? wrap.away.map(esc).join(' · ') : '<span class="muted">없음</span>'}</div></div>` : (wrap.otReminder ? `<div class="box warn" style="margin-top:10px">${esc(wrap.otReminder)}</div>` : '');
    // 결재 지연
    const subm = (S.raw && S.raw.data && S.raw.data.approval && S.raw.data.approval.lists && S.raw.data.approval.lists.submitted && S.raw.data.approval.lists.submitted.docs) || [];
    const stalled = R.stalledSubmitted(subm, new Date());
    const stHtml = stalled.length ? `<div class="card2 warnside"><div class="ct">내 상신문서 중 결재가 오래 머문 것 <span class="bdg check">${stalled.length}건</span></div>${stalled.slice(0, 4).map(d => `<div class="trow"><span>${esc(d.title)}</span><span class="muted">${esc(d.who || '결재 중')} · ${d.age}일째</span></div>`).join('')}${stalled.length > 4 ? `<div class="muted">외 ${stalled.length - 4}건</div>` : ''}<div class="muted" style="font-size:12px;margin-top:4px">최근 ${subm.length}건 기준 · 결재자가 오래 열어 두었는지 확인하세요</div></div>` : '';
    return `<div class="cards teamhome"><div class="card2"><div class="ct">오늘 하루 <span class="muted" style="font-weight:400">${esc(p.date)}</span>${S.homeRes && S.homeRes.busy ? ' <span class="spin"></span>' : ''}</div>
      <div class="tl" role="img" aria-label="오늘 08시부터 19시까지의 일정 막대"><div class="tkb">${ticks}</div><div class="trk">${bars}${now}</div></div>
      <div class="tll">${list.length ? list.map(x => `<div>${x}</div>`).join('') : '<span class="muted">오늘 시간이 정해진 일정이 없습니다</span>'}</div>${wrapHtml}</div>${stHtml}</div>`;
  }
