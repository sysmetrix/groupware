// GW 통합 업무센터 · 일정 달력 (month grid, drag to change to-do due)
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ----- 일정 달력 (month grid, drag to change to-do due) -----
  function vCalendar() {
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + S.cal.offset);
    const y = base.getFullYear(), mo = base.getMonth();
    ensureTeam(`${y}${String(mo + 1).padStart(2, '0')}`);
    const first = new Date(y, mo, 1), startDow = first.getDay(), last = new Date(y, mo + 1, 0).getDate();
    const items = calendarItems();
    const t0 = today();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div class="c out"></div>');
    for (let dnum = 1; dnum <= last; dnum++) {
      const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(dnum).padStart(2, '0')}`;
      const dow = (startDow + dnum - 1) % 7;
      const its = items.filter(x => x.date === iso);
      const d8 = iso.replace(/-/g, ''), tm = teamOf(d8);
      cells.push(`<div class="c ${iso === t0 ? 'today' : ''} ${dow === 0 || its.some(x => x.cls === 'h') ? 'sun' : dow === 6 ? 'sat' : ''}" data-drop-date="${iso}" ${tm.length ? `data-act="calDay" data-v="${d8}"` : ''}><div class="dn">${dnum}${iso === t0 ? ' <span class="bdg todo" style="height:18px">오늘</span>' : ''}</div>${tm.slice(0, 4).map(teamChip).join('')}${tm.length > 4 ? `<span class="muted" style="font-size:12px">+${tm.length - 4}명</span>` : ''}${its.slice(0, tm.length ? 2 : 4).map(it => `<span class="ev ${it.cls}" ${it.todo ? `draggable="true" data-drag="todo:${esc(it.todo)}"` : ''} data-act="calItem" data-k="${esc(it.key || '')}" data-url="${esc(it.url || '')}" title="${esc(it.tag + ' · ' + it.text)}">${esc(it.text)}</span>`).join('')}${its.length > (tm.length ? 2 : 4) ? `<span class="muted">외 ${its.length - (tm.length ? 2 : 4)}건</span>` : ''}</div>`);
    }
    const upcoming = items.filter(x => x.date >= t0 && x.cls !== 'h').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
    const legend = [['e', '일정'], ['l', '내 휴가'], ['d', '기한'], ['a', '근태 확인·출장'], ['t', '내 할 일(끌어서 날짜 변경)'], ['h', '휴일'], ['tl', '직원 휴가'], ['tt', '직원 출장·교육'], ['to', '내 시간외 퇴근 확인됨'], ['tw', '내 시간외 퇴근 지문 확인 필요'], ['n', '칩 기호: ✓ 퇴근 지문 확인 · ✗ 지문 없음 · ! 신청 종료 전 퇴근']];
    return `${pgh(`${y}년 ${mo + 1}월`, '', `<button class="btn sm icon" data-act="calPrev" aria-label="이전 달">${ic('back')}</button><button class="btn sm" data-act="calToday">이번 달</button><button class="btn sm icon" data-act="calNext" aria-label="다음 달" style="transform:scaleX(-1)">${ic('back')}</button><a class="btn sm" href="${esc(S.raw.data.schedule?.url || '')}" target="_blank" rel="noopener">${ic('ext')}그룹웨어 일정</a>`)}
${teamBar(y, mo)}
<div class="legend">${legend.map(([c, n]) => `<span><i class="ev ${c}" style="display:inline-block;margin:0;padding:0;width:12px;height:12px"></i>${n}</span>`).join('')}</div>
<div class="cal">${WD.map(w => `<div class="h">${w}</div>`).join('')}${cells.join('')}</div>
${teamDayPanel()}
<h2>다가오는 일정·기한</h2>${upcoming.length ? `<div class="list" role="list">${upcoming.map(it => `<div class="row" role="listitem" tabindex="0" data-act="calItem" data-k="${esc(it.key || '')}" data-url="${esc(it.url || '')}" style="grid-template-columns:110px 1fr auto"><span class="bdg ${it.cls === 'd' && R.dday(it.date) <= 1 ? 'urgent' : it.cls === 'd' ? 'todo' : 'tag'}">${esc(it.tag.split(' · ')[0])}</span><div class="mn"><div class="t">${esc(it.text)}</div></div><div class="w">${esc(it.date.slice(5).replace('-', '/'))} · ${ddayText(R.dday(it.date))}</div></div>`).join('')}</div>` : '<div class="list"><div class="empty"><b>다가오는 일정이 없습니다</b></div></div>'}`;
  }
  function calendarItems() {
    const out = [];
    const sc = S.raw.data.schedule;
    for (const e of sc?.events || []) out.push({date: ymd8(e.start), text: `${e.allDay ? '' : dtm12(e.start).slice(11) + ' '}${e.title}`, tag: e.calendar || '일정', cls: 'e'});
    for (const h of sc?.holidays || []) out.push({date: ymd8(h.date), text: h.title, tag: '휴일', cls: 'h'});
    const teamOn = Object.values(S.team || {}).some(t => t.rows);
    if (!teamOn) for (const u of S.raw.data.leave?.history || S.raw.data.leave?.upcoming || []) out.push({date: ymd8(u.start), text: `${u.kind}${u.days ? ' ' + fmtDays(u.days) : ''}`, tag: '내 휴가', cls: 'l'});
    for (const d of S.a.deadlines) { const ow = d.key && S.a.actions.find(a => a.key === d.key); const hot = !ow || (isMine(ow) && ['overdue', 'urgent', 'todo'].includes(stateOf(ow))); out.push({date: d.date, text: `${d.time ? d.time + ' ' : ''}${d.title}`, tag: hot ? `기한 · ${d.source}` : `기한(확인용) · ${d.source}`, cls: hot ? 'd' : 'h', key: d.key, url: d.url}); }
    for (const x of S.a.actions.filter(x => x.type === 'attendance')) out.push({date: String(x.when).slice(0, 10), text: x.headline || x.title, tag: '근태 확인', cls: 'a', key: x.key});
    if (!teamOn) for (const r of S.raw.data.attendance?.days || []) if (/출장/.test(r.item || '')) out.push({date: ymd8(r.date), text: r.item, tag: '출장', cls: 'a'});
    if (S.pane.extract) for (const x of S.pane.extract.deadlines) out.push({date: x.date, text: x.context, tag: '본문 기한', cls: 'd'});
    for (const t of S.todos.filter(t => t.due && t.status !== 'done')) out.push({date: t.due, text: t.title, tag: '내 할 일', cls: 't', todo: t.id, url: t.url});
    return out;
  }

  // ----- 직원 근태 레이어 (휴가·출장·시간외 퇴근 지문) -----
  const TEAM_STATE = {ok: ['✓', '퇴근 지문 확인'], miss: ['✗', '지문 없음'], short: ['!', '신청 종료 전 퇴근'], wait: ['…', '아직 진행 전'], info: ['', '']};
  function teamCfg() { const cs = S.cal; cs.layers = cs.layers || {leave: true, trip: true, ot: true}; cs.dept = cs.dept || ''; cs.day = cs.day || ''; return cs; }
  function monthKey() { const b = new Date(); b.setDate(1); b.setMonth(b.getMonth() + S.cal.offset); return `${b.getFullYear()}${String(b.getMonth() + 1).padStart(2, '0')}`; }
  function ensureTeam(mk) {
    S.team = S.team || {};
    if (S.team[mk] || !GW.teamAttendance || !allowed('teamAttendance')) return;
    const lastD = new Date(Number(mk.slice(0, 4)), Number(mk.slice(4)), 0).getDate();
    S.team[mk] = {busy: true, rows: null, err: ''};
    GW.teamAttendance({from: mk + '01', to: mk + String(lastD).padStart(2, '0')})
      .then(rows => { S.team[mk] = {busy: false, rows, err: '', cal: R.buildTeamCalendar(rows, new Date()), at: Date.now()}; })
      .catch(e => { S.team[mk] = {busy: false, rows: null, err: String(e.message || e).slice(0, 80)}; logError('team', e.message); })
      .finally(() => { if (S.view === 'calendar' || S.view === 'today') renderMain(); });
  }
  function teamEntries(mk) {
    const cfg = teamCfg(), t = (S.team || {})[mk];
    if (!t || !t.cal) return {byDate: {}, problems: [], depts: []};
    const keep = x => cfg.layers[x.kind] && (!cfg.dept || x.dept === cfg.dept) && (!cfg.mine || x.mine);
    const byDate = {};
    for (const [d, l] of Object.entries(t.cal.byDate)) { const f = l.filter(keep); if (f.length) byDate[d] = f; }
    return {byDate, problems: t.cal.problems.filter(keep), depts: t.cal.depts};
  }
  // 홈 화면 카드: 오늘 누가 자리를 비웠는지, 최근 시간외 퇴근 지문 확인 필요
  function teamHomeCard() {
    if (!allowed('teamAttendance') || !GW.teamAttendance) return '';
    const p = R.kstNow(new Date()), mk = p.date.slice(0, 7).replace('-', '');
    ensureTeam(mk);
    if (p.d <= 7) { const pm = new Date(p.y, p.m - 2, 1); ensureTeam(`${pm.getFullYear()}${String(pm.getMonth() + 1).padStart(2, '0')}`); }
    const t = (S.team || {})[mk];
    if (!t || !t.cal) return t && t.busy ? '<div class="card2 teamhome"><div class="ct">오늘 직원 근태</div><span class="muted"><span class="spin"></span> 불러오는 중…</span></div>' : '';
    const prevKey = (() => { const pm = new Date(p.y, p.m - 2, 1); return `${pm.getFullYear()}${String(pm.getMonth() + 1).padStart(2, '0')}`; })();
    const pt = (S.team || {})[prevKey];
    const s = R.teamHomeSummary(t.cal, new Date());
    if (p.d <= 7 && pt && pt.cal) s.problems = [...s.problems, ...R.teamHomeSummary({byDate: {}, problems: pt.cal.problems}, new Date(Date.now() - 0)).problems, ...pt.cal.problems.filter(x => x.date >= R.kstNow(new Date(Date.now() - 7 * 86400000)).date.replace(/-/g, ''))].filter((x, i, a) => a.findIndex(y => y.name === x.name && y.date === x.date) === i);
    const nm = x => esc(x.name) + (x.mine ? '(나)' : '') + ' <span class="muted">' + esc(x.label.replace(/^(관내|관외)/, '$1 ')) + '</span>';
    const away = s.leave.length + s.trip.length;
    const left = away
      ? `<div class="card2"><div class="ct">오늘 자리 비움 <span class="bdg info">${away}명</span></div><div style="line-height:1.9">${s.leave.length ? '휴가: ' + s.leave.map(nm).join(' · ') + '<br>' : ''}${s.trip.length ? '출장·교육: ' + s.trip.map(nm).join(' · ') : ''}</div></div>`
      : '';
    const prob = s.problems.length
      ? `<div class="card2 warnside"><div class="ct">내 시간외 퇴근 지문 확인 필요 <span class="bdg urgent">${s.problems.length}건</span> <button class="btn sm ghost" data-act="goCalendar" style="margin-left:auto">근태 확인하기</button></div>${s.problems.slice(0, 4).map(x => `<div class="trow"><span>${esc(x.name)}${x.mine ? '(나)' : ''}</span><span class="muted">${esc(x.date.slice(4, 6))}/${esc(x.date.slice(6))} · ${esc(x.state === 'miss' ? '지문 없음' : '일찍 퇴근')}</span></div>`).join('')}${s.problems.length > 4 ? `<button class="btn sm ghost" data-act="goCalendar">외 ${s.problems.length - 4}건 더보기</button>` : ''}</div>`
      : '';
    if (!left && !prob) return '<div class="teamhome quiet"><span class="bdg confirm">직원 근태</span> <span class="muted">오늘 자리 비운 직원이 없고 내 시간외 퇴근 지문도 정상입니다</span></div>';
    return `<div class="cards teamhome">${left}${prob}</div>`;
  }
  const teamOf = d8 => (teamEntries(monthKey()).byDate[d8] || []);
  function teamChip(x) {
    const st = TEAM_STATE[x.state] || TEAM_STATE.info;
    const cls = x.kind === 'leave' ? 'tl' : x.kind === 'trip' ? 'tt' : x.state === 'ok' ? 'to' : x.state === 'wait' ? 'tn' : 'tw';
    const txt = x.kind === 'ot' ? `${x.name} 시간외 ${st[0]}` : `${x.name} ${x.label.replace(/^(관내|관외)/, '$1 ')}`;
    return `<span class="ev ${cls} ${x.mine ? 'me' : ''}" title="${esc(x.name + ' · ' + x.dept + ' · ' + x.label + (x.detail ? ' · ' + x.detail : ''))}">${esc(txt)}</span>`;
  }
  function teamBar(y, mo) {
    const cfg = teamCfg(), mk = monthKey(), t = (S.team || {})[mk] || {};
    const te = teamEntries(mk);
    const lay = [['leave', '휴가'], ['trip', '출장·교육'], ['ot', '내 시간외 퇴근']];
    const status = t.busy ? '<span class="muted"><span class="spin"></span> 직원 근태를 불러오는 중…</span>' : t.err ? `<span class="muted">직원 근태를 읽지 못했습니다(${esc(t.err)}) <button class="btn sm" data-act="calTeamReload">다시</button></span>` : t.rows ? `<span class="muted">직원 ${new Set(t.rows.map(r => r.emp)).size}명 · 읽기 전용 · 휴가·출장·시간외만 표시</span>` : '';
    const pr = te.problems;
    return `<div class="teambar"><div class="seg">${lay.map(([k, n]) => `<button class="${cfg.layers[k] ? 'on' : ''}" data-act="calLayer" data-v="${k}">${n}</button>`).join('')}</div>
      <div class="seg"><button class="${!cfg.dept ? 'on' : ''}" data-act="calDept" data-v="">전체 부서</button>${te.depts.map(d => `<button class="${cfg.dept === d ? 'on' : ''}" data-act="calDept" data-v="${esc(d)}">${esc(d.replace(/청소년센터|여성청소년센터/, m => m))}</button>`).join('')}</div>
      <label class="chk"><input type="checkbox" data-act="calMine" ${cfg.mine ? 'checked' : ''}> 내 것만</label>${status}</div>
      ${cfg.layers.ot && t.rows ? (pr.length ? `<div class="box warn tprob"><b>내 시간외 퇴근 지문 확인 필요 ${pr.length}건</b> <span class="muted">(신청 종료 시각과 퇴근 지문 대조 · 출근 지문은 보지 않음)</span>${pr.slice(0, 4).map(p => `<div class="tp ${p.mine ? 'me' : ''}" role="button" tabindex="0" data-act="calDay" data-v="${p.date}"><span class="bdg ${p.state === 'miss' ? 'urgent' : 'check'}">${p.state === 'miss' ? '지문 없음' : '일찍 퇴근'}</span> <b>${esc(p.name)}</b>${p.mine ? ' (나)' : ''} <span class="muted">${esc(p.date.slice(4, 6))}/${esc(p.date.slice(6))} · ${esc(p.detail)}</span></div>`).join('')}${pr.length > 8 ? `<div class="muted">외 ${pr.length - 8}건은 날짜를 눌러 확인하세요</div>` : ''}</div>` : `<div class="box tip tprob"><b>내 시간외 신청일의 퇴근 지문이 모두 정상입니다</b></div>`) : ''}`;
  }
  function teamDayPanel() {
    const cfg = teamCfg(), d8 = cfg.day;
    if (!d8) return '';
    const l = teamOf(d8);
    if (!l.length) return '';
    const grp = [['ot', '시간외 근무'], ['leave', '휴가'], ['trip', '출장·교육']];
    return `<div class="box" style="margin-top:12px"><b>${esc(d8.slice(0, 4))}-${esc(d8.slice(4, 6))}-${esc(d8.slice(6))}</b> 직원 근태 <button class="btn sm ghost" data-act="calDay" data-v="">닫기</button>
      ${grp.map(([k, n]) => { const g = l.filter(x => x.kind === k); return g.length ? `<div style="margin-top:8px"><span class="muted">${n} ${g.length}명</span>${g.map(x => { const st = TEAM_STATE[x.state] || TEAM_STATE.info; return `<div class="tp ${x.mine ? 'me' : ''}"><b>${esc(x.name)}</b> <span class="muted">${esc(x.dept)}</span> · ${esc(x.label)}${x.kind === 'ot' ? ` <span class="bdg ${x.state === 'ok' ? 'confirm' : x.state === 'miss' ? 'urgent' : x.state === 'wait' ? 'info' : 'check'}">${st[0]} ${st[1]}</span> <span class="muted">${esc(x.detail)}</span>` : ''}</div>`; }).join('')}</div>` : ''; }).join('')}</div>`;
  }

  // ----- 예산 집행 (customizable: pick any foundation project & subject, pin to my list) -----
  const bKey = (p, f) => `${p}|${f || ''}`;
  const isPinned = (p, f) => S.settings.budget.some(x => x.project === p && (x.filter || '') === (f || ''));
  function vBudget() {
    const b = S.budget, t = b.table, full = b.full, el = S.a.budget.elapsedPct;
    const pinned = S.settings.budget;
    const curPin = pinned.find(p => p.project === b.project && (p.filter || '') === (b.filter || ''));
    const curCat = (b.catalog || []).find(p => p.project === b.project);
    const subjRow = full && full.rows && full.rows.find(r => r.code === b.filter);
    const curName = (subjRow && subjRow.name) || (curPin && curPin.label) || (curCat && curCat.name) || b.project;
    const flag = r => r.balance < 0 ? '<span class="bdg urgent">초과</span>' : (r.budget > 0 && r.rate >= 95) ? '<span class="bdg check">거의 다 씀</span>' : (r.budget > 0 && ['목', '세'].includes(r.level) && r.rate < el - 35) ? '<span class="bdg tag">덜 씀</span>' : '';
    const rows = t && !t.error ? t.rows.filter(r => !b.q || (r.name + r.code).includes(b.q)) : [];
    const head = rows[0];
    const fc = r => { const f = Math.max(0.05, el / 100); const proj = Math.min(r.budget * 1.5, r.executed / f); return {proj, rate: r.budget ? proj / r.budget * 100 : 0, unused: Math.max(0, r.budget - proj)}; };
    const summary = head ? (() => { const f = fc(head); return `<div class="box ${f.rate < 85 ? 'warn' : 'okb'}"><b>${esc(head.name)}</b> 예산 ${won(head.budget)}원 · 집행 ${won(head.executed)}원(${pct(head.rate)}) · 잔액 ${won(head.balance)}원<br>지금 속도(연간 경과 ${el}%)로 가면 연말 집행률 약 <b>${pct(f.rate)}</b>, 쓰지 못할 예상액 약 <b>${won(f.unused)}원</b>. <span class="muted">단순 비례 추정이며 행사 일정에 따라 달라집니다.</span></div>`; })() : '';
    const leaves = rows.filter(r => r.level === '세');
    const leafShort = shortLabels(leaves.map(r => r.name));
    const ledger = b.ledger;
    const monthly = b.monthly && b.monthly.code === (b.filter || head?.code) ? b.monthly : null;
    const monthChart = monthly ? (() => {
      const vals = monthly.months.map(m => { if (m.error) return null; const r = (m.rows || []).find(x => x.code === monthly.code) || (m.rows || [])[0]; return r ? r.executed : 0; });
      const max = Math.max(1, ...vals.filter(v => v !== null));
      const failed = vals.filter(v => v === null).length;
      return `<div class="card2"><div class="ct"><span>월별 집행</span><span class="muted">막대를 누르면 그 달 결의만${failed ? ` · ${failed}개월 조회 실패(?)` : ''}</span></div><svg viewBox="0 0 300 120" width="100%" height="130">${vals.map((v, i) => v === null ? `<g><rect x="${8 + i * 24}" y="40" width="18" height="60" rx="3" fill="none" stroke="#9aa4b2" stroke-dasharray="3 2"><title>${i + 1}월 조회 실패</title></rect><text x="${17 + i * 24}" y="74" font-size="12" text-anchor="middle" fill="#9aa4b2">?</text><text x="${17 + i * 24}" y="114" font-size="12" text-anchor="middle" fill="currentColor">${i + 1}</text></g>` : `<g class="hit" data-act="budgetMonth" data-v="${String(i + 1).padStart(2, '0')}"><rect x="${8 + i * 24}" y="${100 - v / max * 88}" width="18" height="${Math.max(1, v / max * 88)}" rx="3" fill="${b.month === String(i + 1).padStart(2, '0') ? '#c5221f' : '#1a73e8'}"><title>${i + 1}월 ${won(v)}원</title></rect><text x="${17 + i * 24}" y="114" font-size="12" text-anchor="middle" fill="currentColor">${i + 1}</text></g>`).join('')}</svg></div>`;
    })() : (b.monthlyBusy ? '<p class="muted"><span class="spin"></span> 월별 집행을 읽는 중…</p>' : `<div class="card2"><div class="ct">월별 집행</div><div class="muted">1~12월 집행액을 막대로 봅니다.</div><div class="acts"><button class="btn sm" data-act="loadMonthly">${ic('chart')}월별 집행 불러오기</button></div></div>`);
    const barChart = leaves.length ? `<div class="card2"><div class="ct"><span>세목별 집행률</span><span class="muted">세로선 = 연간 경과 ${el}% · 막대를 누르면 결의 내역</span></div><svg viewBox="0 0 300 ${leaves.length * 22}" width="100%" height="${leaves.length * 22}">${leaves.map((r, i) => `<g class="hit" data-act="ledger" data-code="${esc(r.code)}"><text x="112" y="${i * 22 + 13}" font-size="12" text-anchor="end" fill="currentColor">${esc(leafShort[i].slice(0, 12))}<title>${esc(r.name)}</title></text><rect x="118" y="${i * 22 + 3}" width="150" height="12" rx="3" fill="#e7ebf2"/><rect x="118" y="${i * 22 + 3}" width="${Math.min(150, r.rate * 1.5)}" height="12" rx="3" fill="${r.balance < 0 ? '#c5221f' : r.rate < el - 35 ? '#e37400' : '#1a73e8'}"><title>${esc(r.name)} ${pct(r.rate)} · 잔액 ${won(r.balance)}원</title></rect><line x1="${118 + el * 1.5}" x2="${118 + el * 1.5}" y1="${i * 22}" y2="${i * 22 + 18}" stroke="#1d2330" stroke-width="1.5"/><text x="272" y="${i * 22 + 13}" font-size="12" fill="currentColor">${Math.round(r.rate)}%</text></g>`).join('')}</svg></div>` : '';
    const lrows = ledger && ledger.rows ? ledger.rows.filter(r => !b.month || r.date.slice(4, 6) === b.month) : [];
    const multiLedger = ledger && ledger.bgtCd === '__ALL';
    // Subject tree of the chosen project (관·항·목) so the user can pick by name without knowing codes.
    const subjs = full && full.rows ? full.rows.filter(r => ['관', '항'].includes(r.level) && r.budget > 0) : [];
    const pinChips = pinned.map((p, i) => {
      const on = p.project === b.project && (p.filter || '') === (b.filter || '');
      return `<span class="chip ${on ? 'on' : ''}" data-act="bPick" data-p="${esc(p.project)}" data-f="${esc(p.filter || '')}" title="${esc(p.project + (p.filter ? ' · ' + p.filter : ''))}">${ic('star')}${esc(p.filter && p.label === '전략경영실운영' && p.filter === '노121' ? '젠더유스 거버넌스운영' : (p.label || p.filter || p.project))}<button class="btn sm ghost icon" style="height:20px;width:20px;margin-left:2px" data-act="bUnpin" data-i="${i}" title="내 관심 사업에서 빼기" aria-label="빼기">${ic('x')}</button></span>`;
    }).join('');
    const picker = b.pickOpen ? `<div class="card2" style="margin-bottom:14px"><div class="ct"><span>사업·단위사업 고르기</span><button class="btn sm ghost" data-act="bTogglePick">${ic('x')}닫기</button></div>
<div class="bar"><label class="muted">기관·부서 사업</label><select class="f" id="bCatProj" aria-label="기관·부서 사업">${(b.catalog || [{project: b.project, name: curName}]).map(p => `<option value="${esc(p.project)}" ${p.project === b.project ? 'selected' : ''}>${esc(p.name)} (${esc(p.project)})</option>`).join('')}</select>
<button class="btn sm ${!b.filter ? 'primary' : ''}" data-act="bPick" data-p="${esc(b.project)}" data-f="">이 사업 전체 보기</button>
${isPinned(b.project, '') ? '' : `<button class="btn sm" data-act="bPin" data-p="${esc(b.project)}" data-f="" data-l="${esc((curCat && curCat.name) || b.project)}">${ic('plus')}사업 전체를 내 목록에 추가</button>`}</div>
<div class="muted" style="margin-bottom:6px">아래에서 보고 싶은 단위사업(항)을 누르면 바로 조회됩니다. ★를 누르면 "내 관심 사업"에 저장해 다음부터 한 번에 봅니다.</div>
${subjs.length ? `<table><tr><th>단위사업</th><th class="num">예산</th><th class="num">집행</th><th class="num">잔액</th><th class="num">집행률</th><th></th></tr>${subjs.map(r => { const pin = isPinned(b.project, r.code); return `<tr class="${r.level === '관' ? 'lv-관' : 'click'} ${b.filter === r.code ? 'sel' : ''}" ${r.level === '항' ? `data-act="bPick" data-p="${esc(b.project)}" data-f="${esc(r.code)}"` : ''}><td>${r.level === '항' ? '&nbsp;&nbsp;↳ ' : ''}${esc(r.name)} <span class="muted">${esc(r.code)}</span></td><td class="num">${won(r.budget)}</td><td class="num">${won(r.executed)}</td><td class="num">${won(r.balance)}</td><td class="num">${pct(r.rate)}</td><td class="nowrap">${r.level === '항' ? `<button class="btn sm ${pin ? '' : 'primary'}" data-act="bPin" data-p="${esc(b.project)}" data-f="${esc(r.code)}" data-l="${esc(r.name)}">${ic('star')}${pin ? '저장됨' : '내 목록에 추가'}</button>` : ''}</td></tr>`; }).join('')}</table>` : '<p><span class="spin"></span> 과목 목록을 불러오는 중…</p>'}</div>` : '';
    return `${pgh('예산 집행', esc(curName), `<button class="btn sm ${b.pickOpen ? 'primary' : ''}" data-act="bTogglePick">${ic('gear')}사업 고르기·추가</button>${isPinned(b.project, b.filter) ? '' : `<button class="btn sm" data-act="bPin" data-p="${esc(b.project)}" data-f="${esc(b.filter || '')}" data-l="${esc(curName)}">${ic('star')}내 관심 사업에 저장</button>`}<a class="btn sm" href="${esc(S.a.budget.url)}" target="_blank" rel="noopener">${ic('ext')}예실대비현황</a>${t && !t.error ? `<button class="btn sm" data-act="richBudget">한글용 복사</button><button class="btn sm" data-act="csvBudget">${ic('down')}엑셀(CSV)</button>` : ''}`)}
<div class="bar"><span class="muted">내 관심 사업</span>${pinChips}<button class="chip" data-act="bTogglePick">${ic('plus')}다른 사업 선택…</button>${b.busy ? '<span class="spin"></span>' : ''}<input class="inp grow" id="bq" placeholder="과목 이름 찾기" value="${esc(b.q)}" aria-label="과목 찾기"></div>
${picker}
${t && t.error ? `<div class="box errb">${esc(t.message)}</div>` : ''}
${t && !t.error ? `${summary}${leaves.length ? `<div class="cards" style="margin-top:12px">${barChart}${monthChart}</div>` : ''}
<table><tr><th>과목</th><th class="num">예산</th><th class="num">집행</th><th class="num">잔액</th><th class="num">집행률</th><th></th></tr>${rows.map(r => `<tr class="lv-${esc(r.level)} ${r.level === '세' || (!b.filter && r.level === '항') ? 'click' : ''} ${ledger && ledger.bgtCd === r.code ? 'sel' : ''}" ${r.level === '세' ? `data-act="ledger" data-code="${esc(r.code)}"` : !b.filter && r.level === '항' ? `data-act="bPick" data-p="${esc(b.project)}" data-f="${esc(r.code)}"` : ''}><td title="과목 코드 ${esc(r.code)}">${esc(String(r.name).replace(/^[○●·\s]+/, ''))} ${flag(r)}</td><td class="num">${won(r.budget)}</td><td class="num">${won(r.executed)}</td><td class="num">${won(r.balance)}</td><td class="num">${pct(r.rate)}<div class="rate"><i class="${r.balance < 0 ? 'over' : r.rate < el - 35 ? 'low' : ''}" style="width:${Math.min(100, Math.max(0, r.rate))}%"></i><b style="left:${el}%"></b></div></td><td class="nowrap">${!b.filter && r.level === '항' ? `<button class="btn sm ghost" data-act="bPin" data-p="${esc(b.project)}" data-f="${esc(r.code)}" data-l="${esc(r.name)}" title="내 관심 사업에 추가">${ic('star')}</button>` : ''}</td></tr>`).join('')}</table>
${leaves.length > 1 ? `<p><button class="btn" data-act="ledgerAll">${esc(head ? head.name : '')} 전체 결의 내역 보기 (세목 ${leaves.filter(r => r.executed > 0).length}개)</button></p>` : ''}
${t.total ? `<p class="muted">참고: ${esc((curCat && curCat.name) || t.project)} 전체(인건비 포함) 예산 ${won(t.total.budget)}원 · 집행 ${won(t.total.executed)}원 · ${pct(t.total.rate)}</p>` : ''}` : (b.busy ? `<div class="list">${'<div class="sk row"></div>'.repeat(5)}</div>` : '')}
${ledger ? `<h3>결의 내역 · ${esc(ledger.name || ledger.bgtCd)} <span class="muted">${ledger.rows ? `${lrows.length}건${b.month ? ` (${Number(b.month)}월)` : ''}` : ''}</span>${b.month ? '<button class="btn sm" data-act="budgetMonthClear">모든 달</button>' : ''}${ledger.rows ? ` <button class="btn sm" data-act="csvLedger">${ic('down')}엑셀(CSV)</button>` : ''}</h3>${ledger.error ? `<p class="err">${esc(ledger.error)}</p>` : ledger.rows ? `<table><tr><th>결의일</th>${multiLedger ? '<th>세목</th>' : ''}<th>적요</th><th class="num">금액</th><th>문서번호</th><th>작성</th><th>전표</th></tr>${lrows.map(r => `<tr class="click" data-act="ledgerRow" data-i="${ledger.rows.indexOf(r)}"><td class="nowrap">${esc(ymd8(r.date))}</td>${multiLedger ? `<td class="muted">${esc(r.name.replace(/^○\s*/, '').slice(0, 18))}</td>` : ''}<td>${esc(r.desc)}</td><td class="num">${won(r.amount)}</td><td class="nowrap">${esc(r.docNo)}</td><td class="nowrap">${esc(r.writer)}</td><td class="nowrap muted">${esc(r.slip)}</td></tr>`).join('')}<tr class="lv-관"><td colspan="${multiLedger ? 3 : 2}">${b.month ? `${Number(b.month)}월 합계 <span class="muted">(연간 ${esc(ledger.check)})</span>` : esc(ledger.check)}</td><td class="num">${won(lrows.reduce((s, r) => s + r.amount, 0))}</td><td colspan="3"></td></tr></table>` : '<p><span class="spin"></span></p>'}` : ''}`;
  }
  async function loadBudget() {
    const b = S.budget;
    if (!b.catalog) {
      try { b.catalog = await GW.budgetCatalog(); } catch {}
    }
    if (!b.project) {
      const p = S.settings.budget && S.settings.budget[0];
      if (p && p.project) {
        b.project = p.project; b.filter = p.filter || '';
      } else if (b.catalog && b.catalog.length) {
        // Find best match for user dept if available
        const myDept = (S.raw && S.raw.principal && S.raw.principal.deptName) || '';
        const match = myDept ? b.catalog.find(c => c.name.includes(myDept) || myDept.includes(c.name.replace(/운영$/, ''))) : null;
        const target = match || b.catalog[0];
        b.project = target.project; b.filter = '';
      } else {
        b.project = 'A201'; b.filter = '';
      }
    }
    const seq = ++b.seq;
    b.busy = true; b.ledger = null; b.monthly = null; b.month = ''; if (S.view === 'budget') renderMain();
    let full = b.full && b.full.project === b.project ? b.full : null;
    if (!full) { try { full = await GW.budgetProject({project: b.project, filter: ''}); } catch (e) { full = {error: true, message: e.message}; } }
    if (seq !== b.seq) return;
    b.full = full;
    if (full.error) b.table = full;
    else {
      const rows = b.filter ? full.rows.filter(r => r.path.split('|').includes(b.filter)) : full.rows;
      b.table = {...full, filter: b.filter, rows};
    }
    b.busy = false; if (S.view === 'budget') renderMain();
  }
  async function loadLedger(code) {
    const b = S.budget;
    const row = b.table && b.table.rows.find(r => r.code === code);
    const seq = ++b.seq;
    b.ledger = {bgtCd: code, name: row ? row.name : code, rows: null}; b.month = '';
    renderMain();
    let res;
    try { res = await GW.budgetLedger({project: b.project, bgtCd: code, year: b.table && b.table.year, gisu: b.table && b.table.gisu}); } catch (e) { res = {error: e.message}; }
    if (seq !== b.seq || !b.ledger || b.ledger.bgtCd !== code) return;
    if (res.error) b.ledger.error = res.error;
    else { const ok = row ? res.checkSum === row.executed : null; Object.assign(b.ledger, {rows: res.rows, checkSum: res.checkSum, check: ok === null ? '합계' : ok ? `합계 ✓ 집행액 ${won(row.executed)}원과 일치` : `합계 ⚠ 집행액 ${won(row.executed)}원과 ${won(row.executed - res.checkSum)}원 차이`}); }
    if (S.view === 'budget') renderMain();
  }
  // All subjects under the selected 항 at once (예: 노121 → 26건), checked against the 항 total.
  async function loadLedgerAll() {
    const b = S.budget;
    const t = b.table;
    if (!t || t.error) return;
    const head = t.rows[0];
    const leaves = t.rows.filter(r => r.level === '세' && r.executed > 0);
    const seq = ++b.seq;
    b.ledger = {bgtCd: '__ALL', name: `${head ? head.name : ''} 전체`, rows: null};
    renderMain();
    try {
      const parts = await Promise.all(leaves.map(r => GW.budgetLedger({project: b.project, bgtCd: r.code, year: t.year, gisu: t.gisu}).then(l => ({r, l}))));
      if (seq !== b.seq) return;
      const rows = parts.flatMap(p => p.l.rows).sort((x, y) => x.date.localeCompare(y.date));
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      const bad = parts.filter(p => p.l.checkSum !== p.r.executed);
      const target = head ? head.executed : sum;
      Object.assign(b.ledger, {rows, checkSum: sum, check: sum === target && !bad.length ? `합계 ✓ ${won(target)}원과 일치 (세목 ${parts.length}개, ${rows.length}건)` : `합계 ⚠ ${won(target)}원과 ${won(target - sum)}원 차이${bad.length ? ` · 확인 필요 세목 ${bad.map(p => p.r.code).join(', ')}` : ''}`});
    } catch (e) { if (seq === b.seq) b.ledger.error = e.message; }
    if (S.view === 'budget') renderMain();
  }
  async function loadMonthly() {
    const b = S.budget;
    const code = b.filter || (b.table && b.table.rows[0] && b.table.rows[0].code) || '';
    b.monthlyBusy = true; renderMain();
    try { b.monthly = await GW.budgetMonthly({project: b.project, code, year: b.table && b.table.year}); b.monthly.code = code; } catch (e) { toast('월별 집행을 읽지 못했습니다: ' + e.message); }
    b.monthlyBusy = false; if (S.view === 'budget') renderMain();
  }

