// GW 비서 · 예산 집행 메뉴 재설계 (v1.18): 하위 탭 [내 사업 한눈에] [사업 상세] [재단 전체]
// - 내 사업 한눈에: 내 관심 사업(항)을 한 표로. 예산·집행·집행률(경과선)·남은 계획·계획 반영 예상·계획 없는 잔액과 합계.
// - 사업 상세: 기존 예산 과목·결의 내역·집행 계획·예상(10·52번 조각). 위에는 사업 선택 칸 하나와 별(내 사업 추가·빼기)만 둔다.
// - 재단 전체: 모든 사업을 사업별로 접고 펴서 본다. 찾기·정렬·과목 검색, 단위사업마다 별·상세.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const BM = {loading: new Set(), sort: 'order', q: ''};
  // 관심 사업 목록 정리: 사업 코드가 빈 항목·같은 항목 겹침을 없앤다(예전 설정 가져오기 등으로 빈 항목이 남아 있었음).
  function bmCleanPins() {
    try {
      const list = Array.isArray(S.settings.budget) ? S.settings.budget : [];
      const seen = new Set(), out = [];
      for (const p of list) {
        if (!p || typeof p.project !== 'string' || !/^[A-Za-z0-9가-힣]+$/.test(p.project.trim())) continue;
        const k = p.project.trim() + '|' + String(p.filter || '').trim();
        if (seen.has(k)) continue;
        seen.add(k); out.push({project: p.project.trim(), filter: String(p.filter || '').trim(), label: String(p.label || '').trim()});
      }
      if (out.length !== list.length || out.some((p, i) => p.project !== list[i].project || p.filter !== (list[i].filter || '') || p.label !== (list[i].label || ''))) { S.settings.budget = out; saveLocal(); }
    } catch (e) { logError('budget.pins', e.message); }
  }
  if (typeof S === 'object' && S && S.settings) bmCleanPins();
  const bmPins = () => (S.settings.budget || []).filter(p => p && p.project);
  const bmName = p => { const rows = typeof bpRows === 'function' ? bpRows(p.project, p.filter) : null; const r = rows && rows.find(x => x.code === p.filter); return (r && String(r.name).replace(/^[○●·\s]+/, '')) || p.label || p.filter || p.project; };
  function budgetMode() {
    const b = S.budget;
    if (!['mine', 'detail', 'all'].includes(b.mode)) b.mode = bmPins().length ? 'mine' : 'all';
    return b.mode;
  }
  function budgetModeTabs() {
    const m = budgetMode(), tab = (id, label) => `<button role="tab" aria-selected="${m === id}" class="${m === id ? 'on' : ''}" data-act="bMode" data-v="${id}">${label}</button>`;
    return `<div class="vtabs"><div class="seg" role="tablist" aria-label="예산 집행 보기">${tab('mine', '내 사업 한눈에')}${tab('detail', '사업 상세')}${tab('all', '재단 전체')}</div></div>`;
  }
  const bmBar = (rate, plan, el) => `<span class="bm-bar" aria-hidden="true"><i class="ex" style="width:${Math.min(100, Math.max(0, rate))}%"></i>${plan > 0 ? `<i class="pl" style="width:${Math.min(100 - Math.min(100, Math.max(0, rate)), plan)}%"></i>` : ''}${el != null ? `<b style="left:${Math.min(100, Math.max(0, el))}%"></b>` : ''}</span>`;
  // 사업 상세 위쪽: 사업 선택 칸과 별
  function budgetDetailHead(curName) {
    const b = S.budget, pins = bmPins();
    const cur = `${b.project}|${b.filter || ''}`, pinned = pins.some(p => `${p.project}|${p.filter || ''}` === cur);
    const opts = pins.map(p => `<option value="${esc(p.project + '|' + (p.filter || ''))}" ${`${p.project}|${p.filter || ''}` === cur ? 'selected' : ''}>${esc(bmName(p))}${p.filter ? '' : ' (사업 전체)'}</option>`).join('');
    return `<div class="bar bd-head"><label for="bSel" class="muted">사업</label><select class="inp bd-sel" id="bSel">${pinned ? '' : `<option value="${esc(cur)}" selected>${esc(curName || b.project)}</option>`}${opts}<option value="__all">재단 전체에서 고르기…</option></select><button class="btn sm ${pinned ? 'on' : ''}" data-act="bPin" data-p="${esc(b.project)}" data-f="${esc(b.filter || '')}" data-l="${esc(curName || '')}" aria-pressed="${pinned}">${ic('star')}${pinned ? '내 사업' : '내 사업에 추가'}</button>${b.busy ? '<span class="spin"></span>' : ''}</div>`;
  }

  // ---------- 내 사업 한눈에 ----------
  function bmEnsure() {
    const need = bmPins().filter(p => !BM.loading.has(bpKey(p.project, p.filter)) && (!BP.rows[bpKey(p.project, p.filter)] || (!BP.ledger[bpKey(p.project, p.filter)] && !BP.err[bpKey(p.project, p.filter)])));
    if (!need.length) return;
    for (const p of need) BM.loading.add(bpKey(p.project, p.filter));
    Promise.all(need.map(p => bpLoadLedger(p.project, p.filter).catch(e => logError('bm.load', e.message)))).finally(() => {
      for (const p of need) BM.loading.delete(bpKey(p.project, p.filter));
      if (S.view === 'budget' && budgetMode() === 'mine') renderMain();
    });
  }
  function vBudgetMine() {
    const pins = bmPins(), el = S.a && S.a.budget ? S.a.budget.elapsedPct : null;
    if (typeof TD === 'object' && !TD.list && !TD.busy && typeof todoLoad === 'function') todoLoad();
    bmEnsure();
    const rows = pins.map(p => { const k = bpKey(p.project, p.filter), loaded = !!BP.rows[k]; const c = loaded ? bpCompute(p.project, p.filter) : null; return {p, k, c, loading: BM.loading.has(k), err: BP.err[k]}; });
    const ok = rows.filter(r => r.c && r.c.f.budget);
    const sum = key => ok.reduce((s, r) => s + (r.c.f[key] || 0), 0);
    const T = {budget: sum('budget'), executed: sum('executed'), planned: sum('planned'), forecast: sum('forecast'), goal: sum('goal')};
    const rate = T.budget ? T.executed / T.budget * 100 : 0, frate = T.budget ? T.forecast / T.budget * 100 : 0;
    const head = pgh('예산 집행', pins.length ? `내 사업 ${pins.length}개${el != null ? ` · 올해 경과 ${el}%` : ''}` : '', `<button class="btn sm" data-act="bMineReload">${ic('refresh')}다시 읽기</button><button class="btn sm" data-act="openUrl" data-url="${esc(S.a.budget.url)}" data-title="예실대비현황">${ic('ext')}예실대비현황</button>`);
    if (!pins.length) return `${head}${budgetModeTabs()}<div class="empty"><div class="ill">${ic('star')}</div><b>아직 내 사업이 없습니다</b>재단 전체에서 맡은 단위사업에 별을 누르면 여기서 한눈에 봅니다.<div class="acts" style="justify-content:center"><button class="btn primary" data-act="bMode" data-v="all">재단 전체 열기</button></div></div>`;
    const tr = r => {
      const name = bmName(r.p);
      if (!r.c) return `<tr><td><button class="bm-name" data-act="bOpen" data-p="${esc(r.p.project)}" data-f="${esc(r.p.filter || '')}">${esc(name)}</button><div class="muted">${esc(r.p.project)}${r.p.filter ? ' · ' + esc(r.p.filter) : ''}</div></td><td colspan="7" class="muted">${r.err ? `<span class="err">읽지 못했습니다: ${esc(r.err)}</span>` : '<span class="spin"></span> 읽는 중…'}</td></tr>`;
      const f = r.c.f, warn = f.warnings.length, sug = Object.keys(r.c.sug || {}).length;
      const planPct = f.budget ? f.planned / f.budget * 100 : 0;
      return `<tr class="bm-row"><td><button class="bm-name" data-act="bOpen" data-p="${esc(r.p.project)}" data-f="${esc(r.p.filter || '')}">${esc(name)}</button><div class="muted">${esc(r.p.project)}${r.p.filter ? ' · ' + esc(r.p.filter) : ' · 사업 전체'}${sug ? ` · <span class="bm-flag">짝 확인 ${sug}건</span>` : ''}${warn ? ` · <span class="err">확인할 것 ${warn}건</span>` : ''}</div></td><td class="num">${won(f.budget)}</td><td class="num">${won(f.executed)}</td><td class="bm-rate">${bmBar(f.rate, planPct, el)}<span>${pct(f.rate)}</span></td><td class="num">${f.planned ? won(f.planned) : '-'}</td><td class="num ${f.forecastRate > 100.0001 ? 'err' : ''}">${pct(f.forecastRate)}</td><td class="num">${won(Math.max(0, f.budget - f.forecast))}</td><td class="nowrap"><button class="btn sm ghost" data-act="bOpen" data-p="${esc(r.p.project)}" data-f="${esc(r.p.filter || '')}" data-t="plan">계획</button><button class="btn sm ghost" data-act="bOpen" data-p="${esc(r.p.project)}" data-f="${esc(r.p.filter || '')}">상세 ›</button></td></tr>`;
    };
    const left = Math.max(0, T.budget - T.forecast);
    return `${head}${budgetModeTabs()}
<section class="bm-sum" aria-label="내 사업 합계"><div class="bm-big">내 사업 합계 · 집행률 <b>${pct(rate)}</b> <span aria-hidden="true">→</span> 계획 반영 예상 <b>${pct(frate)}</b></div>
${bmBar(rate, T.budget ? T.planned / T.budget * 100 : 0, el)}
<p>예산 ${won(T.budget)}원 · 집행 ${won(T.executed)}원 · 남은 계획 ${won(T.planned)}원 · <b>계획 없는 잔액 ${won(left)}원</b> <span class="muted">· 막대: 진한 색 집행, 옅은 색 계획, 빨간 선 올해 경과</span>${ok.length < rows.length ? ` <span class="muted">(${rows.length - ok.length}개 사업은 아직 읽지 못해 합계에서 빠짐)</span>` : ''}</p></section>
<div class="bm-scroll"><table class="bm-tbl bm-mine-tbl"><tr><th scope="col">사업</th><th scope="col" class="num">예산</th><th scope="col" class="num">집행</th><th scope="col">집행률</th><th scope="col" class="num">남은 계획</th><th scope="col" class="num">계획 반영 예상</th><th scope="col" class="num">계획 없는 잔액</th><th scope="col"></th></tr>${rows.map(tr).join('')}${ok.length > 1 ? `<tr class="sum"><td>합계</td><td class="num">${won(T.budget)}</td><td class="num">${won(T.executed)}</td><td class="bm-rate">${bmBar(rate, T.budget ? T.planned / T.budget * 100 : 0, el)}<span>${pct(rate)}</span></td><td class="num">${won(T.planned)}</td><td class="num">${pct(frate)}</td><td class="num">${won(left)}</td><td></td></tr>` : ''}</table></div>
<p class="muted td-hint">사업 이름을 누르면 사업 상세, [계획]은 그 사업의 집행 계획·예상으로 갑니다. 내 사업은 재단 전체 탭이나 사업 상세의 별로 더하고 뺍니다.</p>`;
  }

  // ---------- 재단 전체 ----------
  function vBudgetAll() {
    const b = S.budget, el = S.a && S.a.budget ? S.a.budget.elapsedPct : null;
    if (!b.all && !b.allBusy && !b.allErr && GW.budgetAll) loadBudgetAll();
    const pinSet = new Set(bmPins().map(p => `${p.project}|${p.filter || ''}`));
    const flag = r => r.balance < 0 ? '<span class="bdg urgent">초과</span>' : (r.budget > 0 && r.rate >= 95) ? '<span class="bdg check">거의 다 씀</span>' : (r.budget > 0 && ['목', '세'].includes(r.level) && el != null && r.rate < el - 35) ? '<span class="bdg tag">덜 씀</span>' : '';
    const searching = !!(b.q || '').trim();
    const head = pgh('예산 집행', b.all ? `재단 사업 ${(b.all.projects || []).filter(p => (p.rows || []).length && !/세입/.test(p.name || '')).length}개${b.allAsOf ? ' · ' + esc(new Date(b.allAsOf).toLocaleTimeString('ko-KR', {timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'})) + ' 조회' : ''}` : '', `<button class="btn sm" data-act="bAllReload">${ic('refresh')}다시 읽기</button><button class="btn sm" data-act="openUrl" data-url="${esc(S.a.budget.url)}" data-title="예실대비현황">${ic('ext')}예실대비현황</button>`);
    const tools = `<div class="bar"><label for="bAllFilter" class="vh">사업·단위사업 찾기</label><input class="inp" id="bAllFilter" placeholder="사업·단위사업 이름이나 코드" value="${esc(BM.q)}" autocomplete="off" style="width:240px"><label for="bAllSort" class="muted">정렬</label><select class="inp" id="bAllSort">${[['order', '사업 순서'], ['low', '집행률 낮은 순'], ['high', '집행률 높은 순'], ['left', '잔액 많은 순']].map(([v, l]) => `<option value="${v}" ${BM.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="bm-sep" aria-hidden="true"></span><label for="bq" class="vh">세목까지 과목 검색</label><input class="inp grow" id="bq" placeholder="세목까지 찾기 (예: 출장 여비, 시간외)" value="${esc(b.q || '')}"><button class="btn sm" data-act="bSearch">과목 검색</button>${b.q ? '<button class="btn sm" data-act="bSearchClear">지우기</button>' : ''}</div>`;
    if (searching) return `${head}${budgetModeTabs()}${tools}${budgetHitsHtml(b, flag)}`;
    if (b.allErr) return `${head}${budgetModeTabs()}${tools}<div class="box errb">재단 전체 사업을 읽지 못했습니다: ${esc(b.allErr)} <button class="btn sm" data-act="bAllReload">다시 시도</button></div>`;
    if (!b.all) return `${head}${budgetModeTabs()}${tools}<p class="muted"><span class="spin"></span> 재단 전체 사업을 읽는 중입니다(사업 15개 내외, 몇 초 걸립니다)…</p><div class="list">${'<div class="sk row"></div>'.repeat(5)}</div>`;
    const projs = (b.all.projects || []).map((p, i) => {
      const rows = (p.rows || []).filter(r => ['관', '항'].includes(r.level) && (r.budget || r.executed));
      const gw = rows.filter(r => r.level === '관');
      const budget = gw.reduce((s, r) => s + (Number(r.budget) || 0), 0), executed = gw.reduce((s, r) => s + (Number(r.executed) || 0), 0);
      // 세입(수입) 사업은 예산이 0이고 '집행'이 수입액이라 지출 합계에 넣지 않는다(2026-11-22 A001에서 확인)
      const income = /세입/.test(p.name || '') || (!budget && executed > 0);
      return {p, i, rows, budget, executed, income, empty: !rows.length && !p.error, rate: budget ? executed / budget * 100 : 0, left: budget - executed, mine: rows.filter(r => pinSet.has(`${p.project}|${r.code}`)).length + (pinSet.has(`${p.project}|`) ? 1 : 0)};
    });
    const sorted = [...projs].sort((a, c) => BM.sort === 'low' ? a.rate - c.rate : BM.sort === 'high' ? c.rate - a.rate : BM.sort === 'left' ? c.left - a.left : (c.mine > 0) - (a.mine > 0) || a.i - c.i);
    const spend = projs.filter(x => !x.income && !x.empty), incomes = projs.filter(x => x.income), empties = projs.filter(x => x.empty);
    const TB = spend.reduce((s, x) => s + x.budget, 0), TE = spend.reduce((s, x) => s + x.executed, 0);
    const fails = (b.all.projects || []).filter(p => p.error).map(p => p.name || p.project);
    const proj = x => `<details class="bm-proj" data-bm-proj data-search="${esc((x.p.name + ' ' + x.p.project + ' ' + x.rows.map(r => r.name + ' ' + r.code).join(' ')).toLowerCase())}" ${x.mine || BM.q ? 'open' : ''}><summary><span class="bm-pn">${esc(x.p.name || x.p.project)} <span class="muted">${esc(x.p.project)}</span>${x.mine ? ` <span class="bm-mine">${ic('star')}내 사업 ${x.mine}</span>` : ''}</span><span class="num">${won(x.budget)}</span><span class="num">${won(x.executed)}</span><span class="bm-rate">${bmBar(x.rate, 0, el)}<span>${pct(x.rate)}</span></span><span class="num">${won(x.left)}</span></summary>${x.p.error ? `<p class="err">이 사업을 읽지 못했습니다.</p>` : `<div class="bm-scroll"><table class="bm-tbl bm-all-tbl"><tr><th scope="col">과목</th><th scope="col" class="num">예산</th><th scope="col" class="num">집행</th><th scope="col" class="num">잔액</th><th scope="col">집행률</th><th scope="col"></th></tr>${x.rows.map(r => { const k = `${x.p.project}|${r.code}`, on = pinSet.has(k); return `<tr data-bm-row data-search="${esc((r.name + ' ' + r.code).toLowerCase())}" class="${r.level === '관' ? 'lv-관' : ''}"><td>${r.level === '항' ? `<button class="bm-name" data-act="bOpen" data-p="${esc(x.p.project)}" data-f="${esc(r.code)}">${esc(String(r.name).replace(/^[○●·\s]+/, ''))}</button>` : `<b>${esc(r.name)}</b>`} <span class="muted">${esc(r.code)}</span> ${flag(r)}</td><td class="num">${won(r.budget)}</td><td class="num">${won(r.executed)}</td><td class="num">${won(r.balance)}</td><td class="bm-rate">${bmBar(r.rate, 0, el)}<span>${pct(r.rate)}</span></td><td class="nowrap">${r.level === '항' ? `<button class="btn sm ${on ? 'on' : 'ghost'}" data-act="bPin" data-p="${esc(x.p.project)}" data-f="${esc(r.code)}" data-l="${esc(String(r.name).replace(/^[○●·\s]+/, ''))}" aria-pressed="${on}" aria-label="${esc(r.name)} ${on ? '내 사업에서 빼기' : '내 사업에 추가'}">${ic('star')}${on ? '내 사업' : '추가'}</button><button class="btn sm ghost" data-act="bOpen" data-p="${esc(x.p.project)}" data-f="${esc(r.code)}">상세 ›</button>` : ''}</td></tr>`; }).join('')}</table></div><p class="bm-pfoot"><button class="btn sm ghost" data-act="bOpen" data-p="${esc(x.p.project)}" data-f="">${esc(x.p.name || x.p.project)} 사업 전체 상세 ›</button></p>`}</details>`;
    return `${head}${budgetModeTabs()}${tools}
<section class="bm-sum" aria-label="재단 전체 합계"><div class="bm-big">재단 전체 · 집행률 <b>${pct(TB ? TE / TB * 100 : 0)}</b></div>${bmBar(TB ? TE / TB * 100 : 0, 0, el)}<p>예산 ${won(TB)}원 · 집행 ${won(TE)}원 · 잔액 ${won(TB - TE)}원${el != null ? ` · 올해 경과 ${el}%` : ''}</p>${fails.length ? `<p class="err">읽지 못한 사업: ${esc(fails.join(', '))}</p>` : ''}</section>
<div class="bm-phead" aria-hidden="true"><span>사업</span><span class="num">예산</span><span class="num">집행</span><span>집행률</span><span class="num">잔액</span></div>
<div id="bmProjects">${sorted.filter(x => !x.income && !x.empty).map(proj).join('')}</div>
${incomes.length ? `<p class="muted bm-note">세입(수입) 사업 ${incomes.map(x => esc(x.p.name || x.p.project) + ' 수입 ' + won(x.executed) + '원').join(', ')}은 지출 집행이 아니라서 위 합계에서 뺐습니다.</p>` : ''}${empties.length ? `<p class="muted bm-note">올해 예산 자료가 없는 사업 ${empties.length}개: ${empties.map(x => esc(x.p.name || x.p.project)).join(', ')}</p>` : ''}
<p class="muted" id="bmNoHit" hidden>찾는 사업이 없습니다. 세목 이름이면 오른쪽 '과목 검색'을 써 보세요.</p>
<p class="muted td-hint">사업을 눌러 펼치고, 단위사업의 별로 내 사업에 더합니다. 인건비 등 모든 관을 합친 금액입니다.</p>`;
  }
  // 찾기: 다시 그리지 않고 줄만 숨긴다(입력 중 글자가 끊기지 않게)
  function bmFilterRows(q) {
    BM.q = String(q || '');
    const s = BM.q.trim().toLowerCase();
    let any = false;
    root.querySelectorAll('[data-bm-proj]').forEach(d => {
      const hit = !s || d.dataset.search.includes(s);
      d.hidden = !hit; if (hit) any = true;
      if (s && hit) d.open = true;
      d.querySelectorAll('[data-bm-row]').forEach(r => { r.hidden = !!s && !r.dataset.search.includes(s) && !(d.querySelector('summary').textContent || '').toLowerCase().includes(s); });
    });
    const n = $('#bmNoHit'); if (n) n.hidden = any;
  }

  // ---------- 처리기 ----------
  HOME_ACTS.bMode = (el, v) => {
    if (!['mine', 'detail', 'all'].includes(v)) return;
    S.budget.mode = v;
    if (v !== 'all') { S.budget.q = ''; }
    renderMain();
    root.querySelector(`[data-act="bMode"][data-v="${v}"]`)?.focus();
  };
  HOME_ACTS.bOpen = el => {
    const b = S.budget, p = el.dataset.p, f = el.dataset.f || '';
    if (!p) return;
    b.mode = 'detail'; b.q = '';
    if (el.dataset.t === 'plan') b.budgetTab = 'plan';
    else if (b.budgetTab === 'plan' && (b.project !== p || (b.filter || '') !== f)) b.budgetTab = 'subjects';
    if (b.project === p && (b.filter || '') === f && b.table && !b.table.error) { renderMain(); return; }
    b.project = p; b.filter = f; loadBudget();
    const m = $('#main'); if (m) m.scrollTop = 0;
  };
  HOME_ACTS.bMineReload = () => { for (const p of bmPins()) { const k = bpKey(p.project, p.filter); BP.rows[k] = null; BP.ledger[k] = null; BP.err[k] = ''; } if (typeof todoLoad === 'function') todoLoad({force: true, sweep: false}); renderMain(); };
  HOME_ACTS.bAllReload = () => { loadBudgetAll(true); };
  function bmChange(t) {
    if (t.id === 'bSel') {
      if (t.value === '__all') { S.budget.mode = 'all'; renderMain(); return; }
      const [p, f] = t.value.split('|'); HOME_ACTS.bOpen({dataset: {p, f: f || ''}});
      return;
    }
    if (t.id === 'bAllSort') { BM.sort = t.value; renderMain(); root.querySelector('#bAllSort')?.focus(); }
  }
