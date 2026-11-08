// GW 통합 업무센터 · 일정 달력 (month grid, drag to change to-do due)
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ----- 일정 달력 (month grid, drag to change to-do due) -----
  function vCalendar() {
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + S.cal.offset);
    const y = base.getFullYear(), mo = base.getMonth();
    const first = new Date(y, mo, 1), startDow = first.getDay(), last = new Date(y, mo + 1, 0).getDate();
    const items = calendarItems();
    const t0 = today();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div class="c out"></div>');
    for (let dnum = 1; dnum <= last; dnum++) {
      const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(dnum).padStart(2, '0')}`;
      const dow = (startDow + dnum - 1) % 7;
      const its = items.filter(x => x.date === iso);
      cells.push(`<div class="c ${iso === t0 ? 'today' : ''} ${dow === 0 || its.some(x => x.cls === 'h') ? 'sun' : dow === 6 ? 'sat' : ''}" data-drop-date="${iso}"><div class="dn">${dnum}${iso === t0 ? ' <span class="bdg todo" style="height:18px">오늘</span>' : ''}</div>${its.slice(0, 4).map(it => `<span class="ev ${it.cls}" ${it.todo ? `draggable="true" data-drag="todo:${esc(it.todo)}"` : ''} data-act="calItem" data-k="${esc(it.key || '')}" data-url="${esc(it.url || '')}" title="${esc(it.tag + ' · ' + it.text)}">${esc(it.text)}</span>`).join('')}${its.length > 4 ? `<span class="muted">외 ${its.length - 4}건</span>` : ''}</div>`);
    }
    const upcoming = items.filter(x => x.date >= t0 && x.cls !== 'h').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
    const legend = [['e', '일정'], ['l', '내 휴가'], ['d', '기한'], ['a', '근태 확인·출장'], ['t', '내 할 일(끌어서 날짜 변경)'], ['h', '휴일']];
    return `${pgh(`${y}년 ${mo + 1}월`, '', `<button class="btn sm icon" data-act="calPrev" aria-label="이전 달">${ic('back')}</button><button class="btn sm" data-act="calToday">이번 달</button><button class="btn sm icon" data-act="calNext" aria-label="다음 달" style="transform:scaleX(-1)">${ic('back')}</button><a class="btn sm" href="${esc(S.raw.data.schedule?.url || '')}" target="_blank" rel="noopener">${ic('ext')}그룹웨어 일정</a>`)}
<div class="legend">${legend.map(([c, n]) => `<span><i class="ev ${c}" style="display:inline-block;margin:0;padding:0;width:12px;height:12px"></i>${n}</span>`).join('')}</div>
<div class="cal">${WD.map(w => `<div class="h">${w}</div>`).join('')}${cells.join('')}</div>
<h2>다가오는 일정·기한</h2>${upcoming.length ? `<div class="list" role="list">${upcoming.map(it => `<div class="row" role="listitem" tabindex="0" data-act="calItem" data-k="${esc(it.key || '')}" data-url="${esc(it.url || '')}" style="grid-template-columns:110px 1fr auto"><span class="bdg ${it.cls === 'd' && R.dday(it.date) <= 1 ? 'urgent' : it.cls === 'd' ? 'todo' : 'tag'}">${esc(it.tag.split(' · ')[0])}</span><div class="mn"><div class="t">${esc(it.text)}</div></div><div class="w">${esc(it.date.slice(5).replace('-', '/'))} · ${ddayText(R.dday(it.date))}</div></div>`).join('')}</div>` : '<div class="list"><div class="empty"><b>다가오는 일정이 없습니다</b></div></div>'}`;
  }
  function calendarItems() {
    const out = [];
    const sc = S.raw.data.schedule;
    for (const e of sc?.events || []) out.push({date: ymd8(e.start), text: `${e.allDay ? '' : dtm12(e.start).slice(11) + ' '}${e.title}`, tag: e.calendar || '일정', cls: 'e'});
    for (const h of sc?.holidays || []) out.push({date: ymd8(h.date), text: h.title, tag: '휴일', cls: 'h'});
    for (const u of S.raw.data.leave?.history || S.raw.data.leave?.upcoming || []) out.push({date: ymd8(u.start), text: `${u.kind}${u.days ? ' ' + fmtDays(u.days) : ''}`, tag: '내 휴가', cls: 'l'});
    for (const d of S.a.deadlines) { const ow = d.key && S.a.actions.find(a => a.key === d.key); const hot = !ow || (isMine(ow) && ['overdue', 'urgent', 'todo'].includes(stateOf(ow))); out.push({date: d.date, text: `${d.time ? d.time + ' ' : ''}${d.title}`, tag: hot ? `기한 · ${d.source}` : `기한(확인용) · ${d.source}`, cls: hot ? 'd' : 'h', key: d.key, url: d.url}); }
    for (const x of S.a.actions.filter(x => x.type === 'attendance')) out.push({date: String(x.when).slice(0, 10), text: x.headline || x.title, tag: '근태 확인', cls: 'a', key: x.key});
    for (const r of S.raw.data.attendance?.days || []) if (/출장/.test(r.item || '')) out.push({date: ymd8(r.date), text: r.item, tag: '출장', cls: 'a'});
    if (S.pane.extract) for (const x of S.pane.extract.deadlines) out.push({date: x.date, text: x.context, tag: '본문 기한', cls: 'd'});
    for (const t of S.todos.filter(t => t.due && t.status !== 'done')) out.push({date: t.due, text: t.title, tag: '내 할 일', cls: 't', todo: t.id, url: t.url});
    return out;
  }

  // ----- 예산 집행 (charts, forecast, ledger) -----
  function vBudget() {
    const b = S.budget, t = b.table, el = S.a.budget.elapsedPct;
    const projOptions = S.settings.budget.map(p => `<option value="${esc(p.project + '|' + (p.filter || ''))}" ${b.project === p.project && b.filter === (p.filter || '') ? 'selected' : ''}>${esc(p.project)} ${esc(p.label || '')}${p.filter ? ' · ' + esc(p.filter) : ''}</option>`).join('');
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
      return `<div class="card2"><div class="ct"><span>월별 집행 (${esc(monthly.code)})</span><span class="muted">막대를 누르면 그 달 결의만${failed ? ` · ${failed}개월 조회 실패(?)` : ''}</span></div><svg viewBox="0 0 300 120" width="100%" height="130">${vals.map((v, i) => v === null ? `<g><rect x="${8 + i * 24}" y="40" width="18" height="60" rx="3" fill="none" stroke="#9aa4b2" stroke-dasharray="3 2"><title>${i + 1}월 조회 실패</title></rect><text x="${17 + i * 24}" y="74" font-size="12" text-anchor="middle" fill="#9aa4b2">?</text><text x="${17 + i * 24}" y="114" font-size="12" text-anchor="middle" fill="currentColor">${i + 1}</text></g>` : `<g class="hit" data-act="budgetMonth" data-v="${String(i + 1).padStart(2, '0')}"><rect x="${8 + i * 24}" y="${100 - v / max * 88}" width="18" height="${Math.max(1, v / max * 88)}" rx="3" fill="${b.month === String(i + 1).padStart(2, '0') ? '#c5221f' : '#1a73e8'}"><title>${i + 1}월 ${won(v)}원</title></rect><text x="${17 + i * 24}" y="114" font-size="12" text-anchor="middle" fill="currentColor">${i + 1}</text></g>`).join('')}</svg></div>`;
    })() : (b.monthlyBusy ? '<p class="muted"><span class="spin"></span> 월별 집행을 읽는 중…</p>' : `<div class="card2"><div class="ct">월별 집행</div><div class="muted">1~12월 집행액을 막대로 봅니다.</div><div class="acts"><button class="btn sm" data-act="loadMonthly">${ic('chart')}월별 집행 불러오기</button></div></div>`);
    const barChart = leaves.length ? `<div class="card2"><div class="ct"><span>세목별 집행률</span><span class="muted">세로선 = 연간 경과 ${el}% · 막대를 누르면 결의 내역</span></div><svg viewBox="0 0 300 ${leaves.length * 22}" width="100%" height="${leaves.length * 22}">${leaves.map((r, i) => `<g class="hit" data-act="ledger" data-code="${esc(r.code)}"><text x="112" y="${i * 22 + 13}" font-size="12" text-anchor="end" fill="currentColor">${esc(leafShort[i].slice(0, 12))}<title>${esc(r.name)}</title></text><rect x="118" y="${i * 22 + 3}" width="150" height="12" rx="3" fill="#e7ebf2"/><rect x="118" y="${i * 22 + 3}" width="${Math.min(150, r.rate * 1.5)}" height="12" rx="3" fill="${r.balance < 0 ? '#c5221f' : r.rate < el - 35 ? '#e37400' : '#1a73e8'}"><title>${esc(r.name)} ${pct(r.rate)} · 잔액 ${won(r.balance)}원</title></rect><line x1="${118 + el * 1.5}" x2="${118 + el * 1.5}" y1="${i * 22}" y2="${i * 22 + 18}" stroke="#1d2330" stroke-width="1.5"/><text x="272" y="${i * 22 + 13}" font-size="12" fill="currentColor">${Math.round(r.rate)}%</text></g>`).join('')}</svg></div>` : '';
    const lrows = ledger && ledger.rows ? ledger.rows.filter(r => !b.month || r.date.slice(4, 6) === b.month) : [];
    const multiLedger = ledger && ledger.bgtCd === '__ALL';
    const cur = S.settings.budget.find(p => p.project === b.project && (p.filter || '') === b.filter);
    return `${pgh('예산 집행', cur ? esc(cur.label || '') : '', `<a class="btn sm" href="${esc(S.a.budget.url)}" target="_blank" rel="noopener">${ic('ext')}예실대비현황</a>${t && !t.error ? `<button class="btn sm" data-act="richBudget">한글용 복사</button><button class="btn sm" data-act="csvBudget">${ic('down')}엑셀(CSV)</button>` : ''}`)}
<div class="bar"><select class="f" id="bproj" aria-label="사업 선택">${projOptions}<option value="__custom" ${b.custom ? 'selected' : ''}>다른 사업 직접 입력…</option></select>${b.custom ? `<input class="inp" id="bcode" placeholder="사업 코드" value="${esc(b.project)}" style="width:110px"><input class="inp" id="bfilter" placeholder="세부 코드(선택)" value="${esc(b.filter)}" style="width:130px"><button class="btn primary" data-act="loadBudget">조회</button>` : ''}${b.busy ? '<span class="spin"></span>' : ''}<input class="inp grow" id="bq" placeholder="과목 이름 찾기" value="${esc(b.q)}" aria-label="과목 찾기"></div>
${t && t.error ? `<p class="err">${esc(t.message)}</p>` : ''}
${t && !t.error ? `${summary}<div class="cards" style="margin-top:12px">${barChart}${monthChart}</div>
<table><tr><th>과목</th><th class="num">예산</th><th class="num">집행</th><th class="num">잔액</th><th class="num">집행률</th></tr>${rows.map(r => `<tr class="lv-${esc(r.level)} ${r.level === '세' ? 'click' : ''} ${ledger && ledger.bgtCd === r.code ? 'sel' : ''}" ${r.level === '세' ? `data-act="ledger" data-code="${esc(r.code)}"` : ''}><td title="과목 코드 ${esc(r.code)}">${esc(String(r.name).replace(/^[○●·\s]+/, ''))} ${flag(r)}</td><td class="num">${won(r.budget)}</td><td class="num">${won(r.executed)}</td><td class="num">${won(r.balance)}</td><td class="num">${pct(r.rate)}<div class="rate"><i class="${r.balance < 0 ? 'over' : r.rate < el - 35 ? 'low' : ''}" style="width:${Math.min(100, Math.max(0, r.rate))}%"></i><b style="left:${el}%"></b></div></td></tr>`).join('')}</table>
${leaves.length > 1 ? `<p><button class="btn" data-act="ledgerAll">${esc(head ? head.name : '')} 전체 결의 내역 보기 (세목 ${leaves.filter(r => r.executed > 0).length}개)</button></p>` : ''}
${t.total ? `<p class="muted">참고: ${esc(t.project)} 프로젝트 전체(인건비 포함) 예산 ${won(t.total.budget)}원 · 집행 ${won(t.total.executed)}원 · ${pct(t.total.rate)}</p>` : ''}` : (b.busy ? '<p><span class="spin"></span> 조회 중…</p>' : '')}
${ledger ? `<h3>결의 내역 · ${esc(ledger.name || ledger.bgtCd)} <span class="muted">${ledger.rows ? `${lrows.length}건${b.month ? ` (${Number(b.month)}월)` : ''}` : ''}</span>${b.month ? '<button class="btn sm" data-act="budgetMonthClear">모든 달</button>' : ''}${ledger.rows ? ' <button class="btn sm" data-act="csvLedger">CSV</button>' : ''}</h3>${ledger.error ? `<p class="err">${esc(ledger.error)}</p>` : ledger.rows ? `<table><tr><th>결의일</th>${multiLedger ? '<th>세목</th>' : ''}<th>적요</th><th class="num">금액</th><th>문서번호</th><th>작성</th><th>전표</th></tr>${lrows.map(r => `<tr class="click" data-act="ledgerRow" data-i="${ledger.rows.indexOf(r)}"><td class="nowrap">${esc(ymd8(r.date))}</td>${multiLedger ? `<td class="muted">${esc(r.name.replace(/^○\s*/, '').slice(0, 18))}</td>` : ''}<td>${esc(r.desc)}</td><td class="num">${won(r.amount)}</td><td class="nowrap">${esc(r.docNo)}</td><td class="nowrap">${esc(r.writer)}</td><td class="nowrap muted">${esc(r.slip)}</td></tr>`).join('')}<tr class="lv-관"><td colspan="${multiLedger ? 3 : 2}">${b.month ? `${Number(b.month)}월 합계 <span class="muted">(연간 ${esc(ledger.check)})</span>` : esc(ledger.check)}</td><td class="num">${won(lrows.reduce((s, r) => s + r.amount, 0))}</td><td colspan="3"></td></tr></table>` : '<p><span class="spin"></span></p>'}` : ''}`;
  }
  async function loadBudget() {
    const b = S.budget;
    if (!b.project) { const p = S.settings.budget[0] || {project: 'A201', filter: ''}; b.project = p.project; b.filter = p.filter || ''; }
    const seq = ++b.seq;
    b.busy = true; b.ledger = null; b.monthly = null; b.month = ''; if (S.view === 'budget') renderMain();
    let table;
    try { table = await GW.budgetProject({project: b.project, filter: b.filter}); } catch (e) { table = {error: true, message: e.message}; }
    if (seq !== b.seq) return;
    b.table = table; b.busy = false; if (S.view === 'budget') renderMain();
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

