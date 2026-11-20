// GW 비서 · 현황 (charts moved off the home screen)
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ----- 현황 (charts moved off the home screen) -----
  function vOverview() {
    return `${pgh('보고·현황', '')}<div class="cards">${chartFlow()}${chartDeadlines()}${chartBudget()}${chartAttendance()}${chartTrend()}</div>`;
  }

  // All interactive SVG marks have an equivalent native button in a data table.
  function chartTable(caption, headers, rows) {
    return '<details><summary>' + esc(caption) + ' 데이터 표</summary><table><caption>' + esc(caption) + '</caption><tr>' + headers.map(h => '<th scope="col">' + esc(h) + '</th>').join('') + '</tr>' + rows.map(r => '<tr>' + r.map(v => '<td>' + v + '</td>').join('') + '</tr>').join('') + '</table></details>';
  }
  const chartButton = (act, data, label) => '<button type="button" class="btn sm ghost" data-act="' + act + '" ' + data + '>' + esc(label) + '</button>';
  // ----- charts (inline SVG, clickable) -----
  function chartFlow() {
    const lists = S.a.approval.lists, counts = Object.fromEntries(S.a.approval.counts.map(c => [c.name, c]));
    const rows = [['distWaiting', '배부 대기', lists.distWaiting?.total ?? 0], ['deptWaiting', '부서 접수 대기', lists.deptWaiting?.total ?? 0], ['pending', '결재 대기', lists.pending?.total ?? 0], ['sendWaiting', '발송 대기', lists.sendWaiting?.total ?? 0], ['viewing', '미열람 열람문서', counts['열람문서']?.count ?? 0], ['progress', '부서 진행', counts['부서진행문서']?.count ?? 0]];
    for (const row of rows) { const source = lists[row[0]]; if (row[0] !== 'progress' && (!source || source.error)) row[2] = null; }
    const max = Math.max(1, ...rows.map(r => r[2] || 0));
    const svg = rows.map(([k, n, v], i) => `<g ${k === 'progress' ? '' : `class="hit" role="button" tabindex="0" aria-label="${esc(n)} ${v}건 목록" data-act="goApproval" data-v="${k}"`}><text x="0" y="${i * 22 + 14}" font-size="12" fill="var(--fg)">${esc(n)}</text><rect x="96" y="${i * 22 + 4}" width="${Math.max(2, v / max * 150)}" height="13" rx="3" fill="${k === 'progress' ? 'var(--muted)' : v ? 'var(--accent)' : 'var(--line)'}"><title>${esc(n)} ${v}건</title></rect><text x="${100 + Math.max(2, v / max * 150)}" y="${i * 22 + 14}" font-size="12" fill="var(--fg)">${v === null ? '미확인' : v}</text></g>`).join('');
    return `<div class="card2"><div class="ct"><span>결재·문서유통 흐름</span><span class="muted">막대를 누르면 목록</span></div><svg viewBox="0 0 280 ${rows.length * 22}" width="100%" height="${rows.length * 22}">${svg}</svg>${chartTable('결재·문서유통 흐름', ['종류', '건수'], rows.map(([k,n,v]) => [k === 'progress' ? esc(n) + ' (집계 전용)' : chartButton('goApproval', `data-v="${k}"`, n), v === null ? '확인 불가' : esc(v)]))}</div>`;
  }
  function chartDeadlines() {
    const items = S.a.deadlines.filter(x => x.dday >= -1 && x.dday <= 14);
    const W = 280, x0 = 10, w = 260;
    const pos = d => x0 + (Math.max(-1, Math.min(14, d)) + 1) / 15 * w;
    const off = new Set((S.raw.data.leave?.upcoming || []).map(u => R.dday(ymd8(u.start))));
    const ticks = Array.from({length: 16}, (_, i) => i - 1).map(d => `<line x1="${pos(d)}" x2="${pos(d)}" y1="34" y2="40" stroke="var(--line2)"/>${d % 7 === 0 ? `<text x="${pos(d)}" y="52" font-size="12" text-anchor="middle" fill="var(--fg)">${d === 0 ? '오늘' : `+${d}`}</text>` : ''}${off.has(d) ? `<rect x="${pos(d) - 8}" y="8" width="16" height="30" rx="3" fill="var(--ok-soft)"><title>휴가</title></rect>` : ''}`).join('');
    const dots = items.map((x, i) => `<circle class="hit" role="button" tabindex="0" aria-label="${esc(x.date + ' ' + x.title)}" data-act="selDeadline" data-k="${esc(x.key || '')}" data-title="${esc(x.title)}" cx="${pos(x.dday)}" cy="${30 - (i % 3) * 8}" r="5" fill="${x.dday <= 1 ? 'var(--hi)' : x.dday <= 3 ? 'var(--md)' : 'var(--accent)'}"><title>${esc(`${x.date}${x.time ? ' ' + x.time : ''} ${ddayText(x.dday)} · ${x.title}`)}</title></circle>`).join('');
    return `<div class="card2"><div class="ct"><span>2주 기한</span><span class="muted">${items.length}건 · 점을 누르면 항목</span></div><svg viewBox="0 0 ${W} 58" width="100%" height="64"><line x1="${x0}" x2="${x0 + w}" y1="37" y2="37" stroke="var(--line2)"/>${ticks}${dots}</svg>${chartTable('2주 기한', ['날짜', '항목'], items.map(x => [esc(x.date), chartButton('selDeadline', `data-k="${esc(x.key || '')}" data-title="${esc(x.title)}"`, x.title)]))}</div>`;
  }
  function chartBudget() {
    const p = S.a.budget.projects.find(x => !x.error && x.rows.length);
    if (!p) return '';
    const head = p.rows[0], el = S.a.budget.elapsedPct;
    const leaves = p.rows.filter(r => r.level === '세').slice(0, 5);
    const bar = (r, y, label) => `<g class="hit" role="button" tabindex="0" aria-label="${esc(r.name)} 집행률 ${pct(r.rate)}" data-act="goBudgetCode" data-v="${esc(r.code)}" data-p="${esc(p.project || '')}"><text x="96" y="${y + 10}" font-size="12" text-anchor="end" fill="var(--fg)">${esc(label.length > 10 ? label.slice(0, 9) + '…' : label)}<title>${esc(r.name)}</title></text><rect x="100" y="${y + 1}" width="150" height="11" rx="3" fill="var(--soft)" stroke="var(--line)" stroke-width=".5"/><rect x="100" y="${y + 1}" width="${Math.max(0, Math.min(150, (Number(r.rate) || 0) * 1.5))}" height="11" rx="3" fill="${r.rate < el - 30 ? 'var(--md)' : 'var(--accent)'}"><title>${esc(r.name)} 집행 ${pct(r.rate)} (예산 ${won(r.budget)}원)</title></rect><line x1="${100 + el * 1.5}" x2="${100 + el * 1.5}" y1="${y - 1}" y2="${y + 14}" stroke="var(--fg)" stroke-opacity=".75" stroke-width="1.5"><title>연간 경과율 ${el}%</title></line><text x="254" y="${y + 10}" font-size="12" fill="var(--fg)">${Math.round(r.rate)}%</text></g>`;
    const short = shortLabels(leaves.map(r => r.name));
    const rows = [bar(head, 0, head.name), ...leaves.map((r, i) => bar(r, (i + 1) * 18, short[i]))].join('');
    return `<div class="card2"><div class="ct"><span>예산 · ${esc((S.settings.budget.find(b => b.project === p.project) || {}).label || p.project)}</span><span class="muted">세로선 = 연간 경과 ${el}%</span></div><svg viewBox="0 0 280 ${(leaves.length + 1) * 18}" width="100%" height="${(leaves.length + 1) * 18}">${rows}</svg>${chartTable('예산 집행', ['과목', '예산', '집행', '잔액', '집행률'], [head, ...leaves].map(r => [chartButton('goBudgetCode', `data-v="${esc(r.code)}" data-p="${esc(p.project || '')}"`, r.name), won(r.budget), won(r.executed), won(r.balance), pct(r.rate)]))}</div>`;
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
    const allDays = [...(S.raw.data.attendance?.days || [])].sort((a,b) => a.date.localeCompare(b.date));
    const month = allDays.at(-1)?.date.slice(0,6);
    const days = allDays.filter(r => r.date.startsWith(month));
    if (!days.length) return '';
    const bad = new Set(S.a.anomalies.map(x => x.date));
    const first = days[0].date;
    const off = new Date(Number(first.slice(0, 4)), Number(first.slice(4, 6)) - 1, 1).getDay();
    const pos = r => off + Number(r.date.slice(6)) - 1;
    const worked = r => !!r.come || (/정상/.test(r.result) && !/휴일/.test(r.result));
    const cells = days.map(r => { const i = pos(r); const cls = bad.has(r.date) ? 'var(--hi-soft)' : worked(r) ? (/정상/.test(r.result) ? 'var(--ok-soft)' : 'var(--md-soft)') : r.holiday || /휴일/.test(r.result) ? 'var(--soft)' : 'var(--md-soft)'; const txtCol = bad.has(r.date) ? 'var(--hi)' : r.holiday || /휴일/.test(r.result) ? 'var(--muted)' : 'var(--fg)'; return `<rect class="hit" role="button" tabindex="0" aria-label="${esc(ymd8(r.date) + ' ' + (r.result || '확인 불가'))}" data-act="goAttendanceDay" data-v="${r.date}" x="${(i % 7) * 38}" y="${Math.floor(i / 7) * 30}" width="34" height="26" rx="5" fill="${cls}" stroke="var(--line)" stroke-width=".6"><title>${esc(`${ymd8(r.date)} ${r.result} ${r.item} ${r.status}`)}</title></rect><text x="${(i % 7) * 38 + 17}" y="${Math.floor(i / 7) * 30 + 17}" font-size="12" font-weight="600" text-anchor="middle" fill="${txtCol}" pointer-events="none">${Number(r.date.slice(6))}</text>`; }).join('');
    const h = (Math.floor(pos(days[days.length - 1]) / 7) + 1) * 30;
    return `<div class="card2"><div class="ct"><span>${esc(month.slice(0,4))}년 ${esc(month.slice(4))}월 근태</span><span class="muted">빨강 = 확인 필요</span></div><svg viewBox="0 0 266 ${h}" width="100%" height="${h}">${cells}</svg>${chartTable('조회된 근태', ['날짜', '결과'], allDays.map(r => [chartButton('goAttendanceDay', `data-v="${esc(r.date)}"`, ymd8(r.date)), esc(r.result || '확인 불가')]))}</div>`;
  }
  function chartTrend() {
    const h = S.history.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date)).slice().sort((a,b) => a.date.localeCompare(b.date)).slice(-14);
    if (h.length < 2) return '';
    const start = Date.parse(h[0].date), end = Date.parse(h.at(-1).date), span = Math.max(864e5, end - start);
    const max = Math.max(1, ...h.flatMap(x => [Number(x.total) || 0, Number(x.high) || 0]));
    const px = x => 10 + (Date.parse(x.date) - start) / span * 250;
    const py = v => 70 - Number(v) / max * 60;
    // Do not connect missing dates, which are unknown rather than zero.
    const lines = ['total','high'].map(k => h.slice(1).map((x,i) => Date.parse(x.date) - Date.parse(h[i].date) === 864e5 && Number.isFinite(x[k]) && Number.isFinite(h[i][k]) ? '<line x1="' + px(h[i]) + '" y1="' + py(h[i][k]) + '" x2="' + px(x) + '" y2="' + py(x[k]) + '" stroke="' + (k === 'total' ? 'var(--accent)' : 'var(--hi)') + '" stroke-width="2"/>' : '').join('')).join('');
    return '<div class="card2"><div class="ct"><span>처리할 일 추이</span><span class="muted">파랑 전체 · 빨강 긴급 · 끊김은 미조회</span></div><svg role="img" aria-label="날짜별 처리할 일 추이, 상세 수치는 아래 데이터 표" viewBox="0 0 280 94" width="100%" height="94">' + lines + h.map(x => Number.isFinite(x.total) ? '<circle cx="' + px(x) + '" cy="' + py(x.total) + '" r="3" fill="var(--accent)"><title>' + esc(x.date) + ' 전체 ' + x.total + '</title></circle>' : '').join('') + '<text x="10" y="90" font-size="11" fill="var(--fg)">' + esc(h[0].date) + '</text><text x="260" y="90" text-anchor="end" font-size="11" fill="var(--fg)">' + esc(h.at(-1).date) + '</text></svg>' + chartTable('처리할 일 추이', ['날짜','전체','긴급'], h.map(x => [esc(x.date), Number.isFinite(x.total) ? esc(x.total) : '확인 불가', Number.isFinite(x.high) ? esc(x.high) : '확인 불가'])) + '</div>';
  }
