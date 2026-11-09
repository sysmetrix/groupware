// GW 통합 업무센터 · 현황 (charts moved off the home screen)
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ----- 현황 (charts moved off the home screen) -----
  function vOverview() {
    return `${pgh('현황', '그래프의 막대·점·칸을 누르면 해당 목록으로 이동합니다')}<div class="cards">${chartFlow()}${chartDeadlines()}${chartBudget()}${chartAttendance()}${chartTrend()}</div>`;
  }

  // ----- charts (inline SVG, clickable) -----
  function chartFlow() {
    const lists = S.a.approval.lists, counts = Object.fromEntries(S.a.approval.counts.map(c => [c.name, c]));
    const rows = [['distWaiting', '배부 대기', lists.distWaiting?.total ?? 0], ['deptWaiting', '부서 접수 대기', lists.deptWaiting?.total ?? 0], ['pending', '결재 대기', lists.pending?.total ?? 0], ['sendWaiting', '발송 대기', lists.sendWaiting?.total ?? 0], ['viewing', '미열람 열람문서', counts['열람문서']?.count ?? 0], ['progress', '부서 진행', counts['부서진행문서']?.count ?? 0]];
    const max = Math.max(1, ...rows.map(r => r[2]));
    const svg = rows.map(([k, n, v], i) => `<g class="hit" data-act="goApproval" data-v="${k === 'progress' ? 'deptWaiting' : k}"><text x="0" y="${i * 22 + 14}" font-size="12" fill="currentColor">${esc(n)}</text><rect x="96" y="${i * 22 + 4}" width="${Math.max(2, v / max * 150)}" height="13" rx="3" fill="${k === 'progress' ? '#9aa4b2' : v ? '#1a73e8' : '#c9d1de'}"><title>${esc(n)} ${v}건</title></rect><text x="${100 + Math.max(2, v / max * 150)}" y="${i * 22 + 14}" font-size="12" fill="currentColor">${v}</text></g>`).join('');
    return `<div class="card2"><div class="ct"><span>결재·문서유통 흐름</span><span class="muted">막대를 누르면 목록</span></div><svg viewBox="0 0 280 ${rows.length * 22}" width="100%" height="${rows.length * 22}">${svg}</svg></div>`;
  }
  function chartDeadlines() {
    const items = S.a.deadlines.filter(x => x.dday >= -1 && x.dday <= 14);
    const W = 280, x0 = 10, w = 260;
    const pos = d => x0 + (Math.max(-1, Math.min(14, d)) + 1) / 15 * w;
    const off = new Set((S.raw.data.leave?.upcoming || []).map(u => R.dday(ymd8(u.start))));
    const ticks = Array.from({length: 16}, (_, i) => i - 1).map(d => `<line x1="${pos(d)}" x2="${pos(d)}" y1="34" y2="40" stroke="#9aa4b2"/>${d % 7 === 0 ? `<text x="${pos(d)}" y="52" font-size="12" text-anchor="middle" fill="currentColor">${d === 0 ? '오늘' : `+${d}`}</text>` : ''}${off.has(d) ? `<rect x="${pos(d) - 8}" y="8" width="16" height="30" fill="#e6f4ea" opacity=".9"><title>휴가</title></rect>` : ''}`).join('');
    const dots = items.map((x, i) => `<circle class="hit" data-act="selDeadline" data-k="${esc(x.key || '')}" data-title="${esc(x.title)}" cx="${pos(x.dday)}" cy="${30 - (i % 3) * 8}" r="5" fill="${x.dday <= 1 ? '#c5221f' : x.dday <= 3 ? '#e37400' : '#1a73e8'}"><title>${esc(`${x.date}${x.time ? ' ' + x.time : ''} ${ddayText(x.dday)} · ${x.title}`)}</title></circle>`).join('');
    return `<div class="card2"><div class="ct"><span>2주 기한</span><span class="muted">${items.length}건 · 점을 누르면 항목</span></div><svg viewBox="0 0 ${W} 58" width="100%" height="64"><line x1="${x0}" x2="${x0 + w}" y1="37" y2="37" stroke="#9aa4b2"/>${ticks}${dots}</svg></div>`;
  }
  function chartBudget() {
    const p = S.a.budget.projects.find(x => !x.error && x.rows.length);
    if (!p) return '';
    const head = p.rows[0], el = S.a.budget.elapsedPct;
    const leaves = p.rows.filter(r => r.level === '세').slice(0, 5);
    const bar = (r, y, label) => `<g class="hit" data-act="goBudgetCode" data-v="${esc(r.code)}" data-p="${esc(p.project || '')}"><text x="96" y="${y + 10}" font-size="12" text-anchor="end" fill="currentColor">${esc(label.length > 10 ? label.slice(0, 9) + '…' : label)}<title>${esc(r.name)}</title></text><rect x="100" y="${y + 1}" width="150" height="11" rx="3" fill="#e7ebf2"/><rect x="100" y="${y + 1}" width="${Math.min(150, r.rate * 1.5)}" height="11" rx="3" fill="${r.rate < el - 30 ? '#e37400' : '#1a73e8'}"><title>${esc(r.name)} 집행 ${pct(r.rate)} (예산 ${won(r.budget)}원)</title></rect><line x1="${100 + el * 1.5}" x2="${100 + el * 1.5}" y1="${y - 1}" y2="${y + 14}" stroke="#1d2330" stroke-width="1.5"><title>연간 경과율 ${el}%</title></line><text x="254" y="${y + 10}" font-size="12" fill="currentColor">${Math.round(r.rate)}%</text></g>`;
    const short = shortLabels(leaves.map(r => r.name));
    const rows = [bar(head, 0, head.name), ...leaves.map((r, i) => bar(r, (i + 1) * 18, short[i]))].join('');
    return `<div class="card2"><div class="ct"><span>예산 · ${esc((S.settings.budget.find(b => b.project === p.project) || {}).label || p.project)}</span><span class="muted">세로선 = 연간 경과 ${el}%</span></div><svg viewBox="0 0 280 ${(leaves.length + 1) * 18}" width="100%" height="${(leaves.length + 1) * 18}">${rows}</svg></div>`;
  }
  // Drop the words all labels share ("○ 젠더유스 거버넌스 회의비(자)" -> "회의비(자)").
  function shortLabels(names) {
    const clean = names.map(n => String(n).replace(/^[○●·\s]+/, ''));
    if (clean.length < 2) return clean;
    let p = clean[0];
    for (const n of clean) while (p && !n.startsWith(p)) p = p.slice(0, -1);
    p = p.replace(/\S+$/, '');
    return clean.map(n => n.slice(p.length).trim() || n);
  }
  function chartAttendance() {
    const days = S.raw.data.attendance?.days || [];
    if (!days.length) return '';
    const bad = new Set(S.a.anomalies.map(x => x.date));
    const first = days[0].date;
    const off = new Date(Number(first.slice(0, 4)), Number(first.slice(4, 6)) - 1, 1).getDay();
    const pos = r => off + Number(r.date.slice(6)) - 1;
    const worked = r => !!r.come || (/정상/.test(r.result) && !/휴일/.test(r.result));
    const cells = days.map(r => { const i = pos(r); const cls = bad.has(r.date) ? '#f28b82' : worked(r) ? (/정상/.test(r.result) ? '#81c995' : '#fdd663') : r.holiday || /휴일/.test(r.result) ? '#dadce0' : '#fdd663'; return `<rect class="hit" data-act="goAttendanceDay" data-v="${r.date}" x="${(i % 7) * 38}" y="${Math.floor(i / 7) * 30}" width="34" height="26" rx="5" fill="${cls}"><title>${esc(`${ymd8(r.date)} ${r.result} ${r.item} ${r.status}`)}</title></rect><text x="${(i % 7) * 38 + 17}" y="${Math.floor(i / 7) * 30 + 17}" font-size="12" text-anchor="middle" fill="#1d2330" pointer-events="none">${Number(r.date.slice(6))}</text>`; }).join('');
    const h = (Math.floor(pos(days[days.length - 1]) / 7) + 1) * 30;
    return `<div class="card2"><div class="ct"><span>이번 달 근태</span><span class="muted">빨강 = 확인 필요</span></div><svg viewBox="0 0 266 ${h}" width="100%" height="${h}">${cells}</svg></div>`;
  }
  function chartTrend() {
    const h = S.history.slice(-14);
    if (h.length < 2) return '';
    const max = Math.max(1, ...h.map(x => x.total));
    const pts = (k) => h.map((x, i) => `${10 + i * (250 / (h.length - 1))},${70 - x[k] / max * 60}`).join(' ');
    return `<div class="card2"><div class="ct"><span>처리할 일 추이</span><span class="muted">파랑 전체 · 빨강 긴급</span></div><svg viewBox="0 0 270 78" width="100%" height="78"><polyline points="${pts('total')}" fill="none" stroke="#1a73e8" stroke-width="2"/><polyline points="${pts('high')}" fill="none" stroke="#c5221f" stroke-width="2"/>${h.map((x, i) => `<circle cx="${10 + i * (250 / (h.length - 1))}" cy="${70 - x.total / max * 60}" r="3" fill="#1a73e8"><title>${esc(x.date)} 전체 ${x.total} · 긴급 ${x.high}</title></circle>`).join('')}</svg></div>`;
  }

