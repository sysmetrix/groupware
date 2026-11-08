// GW 통합 업무센터 · 근태·연차 (calendar heat grid)
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ----- 근태·연차 (calendar heat grid) -----
  function vAttendance() {
    const at = S.raw.data.attendance, lv = S.raw.data.leave, st = S.att;
    const p = R.kstNow(new Date());
    const thisM = `${p.y}${String(p.m).padStart(2, '0')}`;
    const prevD = new Date(Date.UTC(p.y, p.m - 2, 1));
    const prevM = `${prevD.getUTCFullYear()}${String(prevD.getUTCMonth() + 1).padStart(2, '0')}`;
    const month = st.month || thisM;
    const rows = st.rows || [];
    const anomalies = R.attendanceAnomalies(rows, {leaves: lv?.history || []});
    const bad = new Map(anomalies.map(x => [x.date, x]));
    const y = Number(month.slice(0, 4)), mo = Number(month.slice(4, 6));
    const startDow = new Date(y, mo - 1, 1).getDay(), last = new Date(y, mo, 0).getDate();
    const byDate = new Map(rows.map(r => [r.date, r]));
    const leaveDays = new Set();
    for (const u of lv?.history || []) if (u.approved && u.days >= 1) leaveDays.add(u.start);
    const t8 = today().replace(/-/g, '');
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div></div>');
    for (let dnum = 1; dnum <= last; dnum++) {
      const d8 = `${month}${String(dnum).padStart(2, '0')}`;
      const r = byDate.get(d8);
      const worked = r && (!!r.come || (/정상/.test(r.result) && !/휴일/.test(r.result)));
      const cls = !r ? 'off' : bad.has(d8) ? 'bad' : leaveDays.has(d8) ? 'lv' : worked ? (/정상/.test(r.result) ? 'okd' : 'part') : r.holiday || /휴일/.test(r.result) ? 'off' : 'part';
      const label = !r ? '' : bad.has(d8) ? '확인 필요' : leaveDays.has(d8) ? '휴가' : worked ? (r.come ? `${hm4(r.come)} 출근` : '근무') : r.holiday || /휴일/.test(r.result) ? '휴일' : r.result;
      cells.push(`<div class="c ${cls} ${st.day === d8 ? 'sel' : ''} ${d8 === t8 ? 'today' : ''}" role="button" tabindex="0" data-act="attDay" data-v="${d8}" title="${esc(r ? `${r.result} ${r.item || ''} ${r.status || ''}` : '')}"><b>${dnum}</b>${d8 === t8 ? ' <span class="muted">오늘</span>' : ''}<div class="muted" style="font-size:12px">${esc(label)}</div>${r && r.item ? `<div style="font-size:12px">${esc(r.item)}</div>` : ''}</div>`);
    }
    const selRow = st.day ? byDate.get(st.day) : null;
    const isWork = S.a.today ? S.a.today.isWorkday : true;
    const todayBox = isWork ? `출근 <b>${esc(hm4(at?.today.come) || '기록 없음')}</b> · 퇴근 <b>${esc(hm4(at?.today.leave) || '기록 없음')}</b>` : '오늘은 근무일이 아닙니다.';
    const legend = [['#e6f4ea', '정상 근무'], ['#fef7e0', '일부 근무(외출·조퇴 등)'], ['#e8f0fe', '휴가'], ['#f7f9fc', '휴일'], ['#fce8e6', '확인 필요']];
    const attActs = S.a.actions.filter(x => x.type === 'attendance');
    return `${pgh('근태·연차', '', `<a class="btn sm" href="${esc(at?.url || '')}" target="_blank" rel="noopener">${ic('ext')}근무시간 현황</a><button class="btn sm primary" data-act="openUrl" data-url="${esc(at?.requestUrl || '')}" data-title="근태신청">${ic('plus')}근태신청</button>`)}
<div class="cards"><div class="card2"><div class="ct">오늘</div>${todayBox}<div class="muted" style="margin-top:6px">이번 달 인정된 근무시간 ${mins(at?.month.recognizedMin)} · 초과 근무 ${mins(at?.month.overtimeMin)}<span class="term" title="기본 ${mins(at?.month.basicMin)}, 근무시간에서 뺀 시간(외출·휴게 등) ${mins(at?.month.exceptMin)}"> (자세히)</span></div></div>
<div class="card2"><div class="ct">${esc(lv?.year)}년 연차</div>남은 연차 <b style="font-size:20px">${fmtDays(lv?.remaining)}</b><div class="muted">받은 연차 ${fmtDays(lv?.granted)} · 쓴 연차 ${fmtDays(lv?.used)}</div>${(lv?.upcoming || []).map(u => `<div style="margin-top:4px">${ic('cal')} ${esc(ymd8(u.start).slice(5).replace('-', '/'))} ${esc(u.kind)} ${fmtDays(u.days)} <span class="muted">(${u.approved ? '결재 완료' : '결재 중'})</span></div>`).join('')}</div></div>
${attActs.length ? `<h2>확인이 필요한 날 ${attActs.length}일</h2><div class="list" role="list">${attActs.map(x => actionRow(x)).join('')}</div>` : ''}
<div class="bar" style="margin-top:18px"><div class="seg"><button class="${month === thisM ? 'on' : ''}" data-act="attMonth" data-v="${thisM}">이번 달</button><button class="${month === prevM ? 'on' : ''}" data-act="attMonth" data-v="${prevM}">지난달</button></div>${st.rows ? `<button class="btn sm" data-act="csvAtt">${ic('down')}엑셀로 저장</button>` : ''}</div>
<div class="legend">${legend.map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div>
${st.busy ? `<div class="att">${'<div class="sk" style="height:72px;margin:0"></div>'.repeat(14)}</div>` : `<div class="att">${WD.map(w => `<div class="h">${w}</div>`).join('')}${cells.join('')}</div>`}
${selRow ? `<div class="box ${bad.has(st.day) ? 'warn' : ''}"><b>${esc(ymd8(st.day))}</b> · ${esc(selRow.workType || '')} · 근태 상태 ${esc(selRow.result)}${selRow.item ? ` · ${esc(selRow.item)}` : ''}${selRow.status ? ` · ${esc(selRow.status)}` : ''}<br>출근 ${esc(hm4(selRow.come) || '-')} · 퇴근 ${esc(hm4(selRow.leave) || '-')} · 인정 ${selRow.recognizedMin === null ? '-' : mins(selRow.recognizedMin)}<div class="acts"><button class="btn sm primary" data-act="openUrl" data-url="${esc(at?.requestUrl || '')}" data-title="근태신청 ${esc(ymd8(st.day))}">이 날짜 근태신청 하러 가기</button></div></div>` : ''}
<h2>올해 연차·휴가 사용 내역 <span class="muted">${(lv?.history || []).length}건</span></h2><table><tr><th>날짜</th><th>구분</th><th class="num">기간</th><th>제목</th><th>상태</th></tr>${(lv?.history || []).slice(0, 40).map(u => `<tr><td class="nowrap">${esc(ymd8(u.start))}${u.end !== u.start ? ' ~ ' + esc(ymd8(u.end).slice(5)) : ''}</td><td>${esc(u.kind)}</td><td class="num">${fmtDays(u.days)}</td><td>${esc(u.title)}</td><td>${u.approved ? '완료' : '진행 중'}</td></tr>`).join('')}</table>`;
  }
  async function loadAttendance(month) {
    const p = R.kstNow(new Date());
    const m = month || S.att.month || `${p.y}${String(p.m).padStart(2, '0')}`;
    const seq = ++S.att.seq;
    S.att.month = m; S.att.busy = true; if (!S.att.day.startsWith(m)) S.att.day = ''; renderMain();
    const y = Number(m.slice(0, 4)), mo = Number(m.slice(4, 6));
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const t = today().replace(/-/g, '');
    const to = `${m}${String(last).padStart(2, '0')}`;
    let rows;
    try { rows = await GW.attendanceDays({from: `${m}01`, to: to > t ? t : to}); } catch (e) { rows = []; toast('근태 자료를 읽지 못했습니다: ' + e.message); }
    if (seq !== S.att.seq) return;
    S.att.rows = rows; S.att.busy = false; if (S.view === 'attendance') renderMain();
  }

