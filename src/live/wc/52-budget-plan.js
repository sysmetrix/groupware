// GW 비서 · 예산 집행 계획과 예상 집행률 (v1.17)
// 계획 한 건 = 예산 정보(사업·항·세목·금액·예정일)가 붙은 내 할 일(그룹웨어 ToDo). 51번 조각의 TD.list에서 읽는다.
// 예상 = 예실대비 누계 집행액 + 아직 결의되지 않은 계획 금액(짝 확인을 기다리는 결의 금액은 빼서 이중 계산 방지). 계산은 R.bpForecast.
// 결의 짝짓기는 제안만 하고 확정은 사용자가 누른다. 설계: docs/design/todo-budget-plan.md
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const BP = {rows: {}, ledger: {}, busy: {}, err: {}, imp: null, impBusy: false, impErr: ''};
  const bpKey = (p, f) => `${p}|${f || ''}`;
  function bpRows(project, filter) {
    const k = bpKey(project, filter);
    if (BP.rows[k]) return BP.rows[k];
    const t = S.budget && S.budget.table;
    if (t && !t.error && S.budget.project === project && (S.budget.filter || '') === (filter || '') && Array.isArray(t.rows)) return t.rows;
    return null;
  }
  async function bpLoadRows(project, filter, force = false) {
    const k = bpKey(project, filter);
    if (!force && BP.rows[k]) return BP.rows[k];
    const t = await GW.budgetProject({project, filter: filter || ''});
    BP.rows[k] = Array.isArray(t.rows) ? t.rows : [];
    return BP.rows[k];
  }
  // 편집기의 '예산 연결' 선택지를 위해 내 관심 사업의 세목을 미리 읽는다
  let bpPinnedLoading = null;
  function bpEnsurePinnedRows() {
    if (bpPinnedLoading) return bpPinnedLoading;
    const pins = (S.settings.budget || []).filter(p => p && p.project && !BP.rows[bpKey(p.project, p.filter)]);
    if (!pins.length || typeof GW !== 'object' || !GW.budgetProject) return Promise.resolve();
    bpPinnedLoading = Promise.all(pins.slice(0, 6).map(p => bpLoadRows(p.project, p.filter || '').catch(e => logError('bp.rows', e.message)))).finally(() => { bpPinnedLoading = null; });
    return bpPinnedLoading;
  }
  // 범위 안 세목마다 결의 내역을 모은다(집행액이 있는 세목만, 4개씩)
  async function bpLoadLedger(project, filter, force = false) {
    const k = bpKey(project, filter);
    if (BP.busy[k]) return BP.busy[k];
    if (!force && BP.ledger[k] && Date.now() - BP.ledger[k].t < 10 * 60000) return BP.ledger[k];
    const owner = currentKey;
    BP.busy[k] = (async () => {
      try {
        const rows = await bpLoadRows(project, filter, force);
        const se = rows.filter(r => r.level === '세' && Number(r.executed) > 0);
        const out = [], fails = [];
        for (let i = 0; i < se.length; i += 4) {
          const part = await Promise.all(se.slice(i, i + 4).map(r => GW.budgetLedger({project, bgtCd: r.code}).then(l => (l.rows || []).map(x => ({...x, code: x.code || r.code}))).catch(e => { fails.push(r.code); logError('bp.ledger', e.message); return []; })));
          for (const p of part) out.push(...p);
        }
        if (owner !== currentKey) return null;
        const exec = se.reduce((s, r) => s + (Number(r.executed) || 0), 0), sum = out.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        BP.ledger[k] = {rows: out, t: Date.now(), at: new Date().toISOString(), fails, exec, sum};
        BP.err[k] = '';
        return BP.ledger[k];
      } catch (e) { BP.err[k] = String(e.message || e); logError('bp.load', BP.err[k]); return null; }
      finally { BP.busy[k] = null; if (S.view === 'budget' && S.budget.budgetTab === 'plan') renderMain(); }
    })();
    return BP.busy[k];
  }
  const bpAllPlans = () => (typeof TD === 'object' && Array.isArray(TD.list) ? TD.list : []).filter(t => t.meta && t.meta.b && t.meta.b.c);
  // 올해 계획만(예정일, 없으면 기한·만든 날 기준). 지난해 계획이 올해 예상에 섞이지 않게.
  const bpYearOf = t => String(t.meta.b.d || t.due || t.created || '').slice(0, 4);
  const bpPlansFor = (project, filter) => bpAllPlans().filter(t => t.meta.b.p === project && (!filter || t.meta.b.h === filter || String(t.meta.b.c).startsWith(filter)) && (!bpYearOf(t) || bpYearOf(t) === today().slice(0, 4)));
  const bpTarget = () => { const v = Number(S.settings.bpTarget); return v > 0 && v <= 150 ? v : 100; };
  const bpClose = () => { const v = String(S.settings.bpClose || ''); return /^\d{4}-\d{2}-\d{2}$/.test(v) && v.slice(0, 4) === today().slice(0, 4) ? v : `${today().slice(0, 4)}-12-31`; };
  // 계획·결의·짝 제안을 합쳐 예상치를 만든다
  function bpCompute(project, filter) {
    const rows = bpRows(project, filter) || [];
    const led = BP.ledger[bpKey(project, filter)];
    const plans = bpPlansFor(project, filter);
    const claimed = new Set(bpAllPlans().flatMap(t => (t.meta.b.m || []).map(m => m.k)));
    const sug = {}, pending = {};
    if (led) for (const p of plans) {
      if (p.meta.b.st === 'done' || p.meta.b.st === 'drop') continue;
      const s = R.bpSuggest(p, led.rows, claimed);
      if (s) { sug[p.id] = s; pending[p.id] = s.sum; for (const r of s.rows) claimed.add(r.k); }
    }
    const f = R.bpForecast({rows, plans, pending, target: bpTarget(), closeDate: bpClose()});
    let proj = null;
    if (led) {
      const y = today().slice(0, 4), monthly = Array(12).fill(0);
      for (const r of led.rows) { const d = String(r.date || ''); if (d.slice(0, 4) === y) monthly[Number(d.slice(4, 6)) - 1] += Number(r.amount) || 0; }
      proj = R.bpProjection({monthly, items: f.items, budget: f.budget, target: bpTarget()});
    }
    return {rows, led, plans, sug, f, proj};
  }
  // 다른 화면(대화·홈)에서 쓰는 요약. 자료가 없으면 읽는다.
  async function bpForecastFor(project, filter) {
    await bpLoadLedger(project, filter);
    if (typeof todoLoad === 'function' && (!TD.list || Date.now() - TD.lastLoad > 5 * 60000)) await todoLoad({force: true, sweep: false});
    return bpCompute(project, filter);
  }

  // ---------- 화면 ----------
  const bpSt = {plan: '계획', check: '짝 확인', wait: '끝냄·결의 대기', done: '집행됨', drop: '취소'};
  function bpChart(c) {
    const p = c.proj; if (!p || !c.f.budget) return '';
    const W = 660, H = 190, L = 64, B = 24, T = 14, max = Math.max(c.f.budget, p.goal, ...p.projected.filter(v => v != null), ...p.actual.filter(v => v != null)) * 1.08 || 1;
    const x = i => L + (W - L - 10) * (i / 11), y = v => T + (H - T - B) * (1 - v / max);
    const line = (arr, from = 0) => arr.map((v, i) => v == null || i < from ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(' ');
    const last = p.projected[11];
    const ticks = [0, 0.5, 1].map(r => r * c.f.budget);
    return `<figure class="bp-chart"><figcaption>월별 누계 집행 <span class="muted">실선 = 결의 누계, 점선 = 계획 반영 예상, 가로선 = 목표 ${esc(String(c.f.target))}%</span></figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 누계 집행과 예상. 12월 예상 ${won(last || 0)}원, 목표 ${won(p.goal)}원">
${ticks.map(v => `<line class="bp-grid" x1="${L}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}"/><text class="bp-ax" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v >= 10000 ? Math.round(v / 10000).toLocaleString('ko-KR') + '만' : won(v)}</text>`).join('')}
<line class="bp-goal" x1="${L}" x2="${W - 10}" y1="${y(p.goal)}" y2="${y(p.goal)}"/>
${Array.from({length: 12}, (_, i) => `<text class="bp-ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${i + 1}</text>`).join('')}
<polyline class="bp-proj" points="${line(p.projected, p.month - 1)}"/><polyline class="bp-act" points="${line(p.actual)}"/>
${last != null ? `<circle class="bp-dot" cx="${x(11)}" cy="${y(last)}" r="4"/><text class="bp-lbl" x="${x(11) - 6}" y="${y(last) - 8}" text-anchor="end">12월 예상 ${(c.f.budget ? last / c.f.budget * 100 : 0).toFixed(1)}%</text>` : ''}
</svg></figure>`;
  }
  function bpView(b) {
    const t = b.table;
    if (!t || t.error) return b.busy ? `<div class="list">${'<div class="sk row"></div>'.repeat(4)}</div>` : '<p class="muted">예산을 먼저 조회해 주세요.</p>';
    const rows = t.rows || [];
    if (!b.filter) {
      const hang = rows.filter(r => r.level === '항');
      return `<div class="box"><b>집행 계획은 단위사업(항)별로 세웁니다.</b> 계획을 세울 사업을 고르세요.<div class="bar" style="margin-top:8px">${hang.map(r => `<button class="chip" data-act="bPick" data-p="${esc(b.project)}" data-f="${esc(r.code)}">${esc(r.name)} <span class="muted">${esc(r.code)}</span></button>`).join('')}</div></div>`;
    }
    const k = bpKey(b.project, b.filter);
    if (!BP.ledger[k] && !BP.busy[k] && !BP.err[k]) bpLoadLedger(b.project, b.filter);
    if (typeof TD === 'object' && !TD.list && !TD.busy && typeof todoLoad === 'function') todoLoad();
    const c = bpCompute(b.project, b.filter), f = c.f, led = c.led;
    const head = rows.find(r => r.code === b.filter) || {};
    const se = rows.filter(r => r.level === '세');
    const gapTxt = f.gap > 0 ? `목표 ${f.target}%까지 <b>${won(f.gap)}원</b>은 아직 계획이 없습니다` : f.gap < 0 ? `<span class="err">목표보다 ${won(-f.gap)}원 많게 계획했습니다</span>` : '목표와 계획이 같습니다';
    const exW = f.budget ? Math.min(100, f.executed / f.budget * 100) : 0, plW = f.budget ? Math.max(0, Math.min(100 - exW, f.planned / f.budget * 100)) : 0;
    const sugIds = Object.keys(c.sug);
    const planRows = f.items;
    const status = [BP.busy[k] ? '<span class="spin"></span> 결의 내역을 읽는 중…' : led ? `결의 내역 ${esc(new Date(led.at).toLocaleTimeString('ko-KR', {timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}))} 기준 ${led.rows.length}건${led.sum !== led.exec ? ` · <span class="err">결의 합계 ${won(led.sum)}원이 집행액 ${won(led.exec)}원과 ${won(Math.abs(led.exec - led.sum))}원 다릅니다(월별 곡선은 결의 기준)</span>` : ' · 집행액과 일치'}${led.fails.length ? ` · <span class="err">세목 ${led.fails.length}개는 결의 내역을 읽지 못했습니다</span>` : ''}` : BP.err[k] ? `<span class="err">결의 내역을 읽지 못했습니다: ${esc(BP.err[k])}</span>` : '',
      typeof TD === 'object' && TD.err ? `<span class="err">계획(그룹웨어 ToDo)을 새로 읽지 못했습니다</span>` : ''].filter(Boolean).join(' · ');
    return `<section class="bp-sum" aria-label="예상 집행률"><div class="bp-big">${esc(head.name || b.filter)} · 지금 <b>${pct(f.rate)}</b> <span aria-hidden="true">→</span> 계획 반영 예상 <b class="${f.forecastRate > 100.0001 ? 'err' : ''}">${pct(f.forecastRate)}</b></div>
<div class="bp-bar" role="img" aria-label="집행 ${pct(f.rate)}, 계획 포함 ${pct(f.forecastRate)}, 목표 ${f.target}%"><i class="ex" style="width:${exW}%"></i><i class="pl" style="width:${plW}%"></i><b style="left:${Math.min(100, f.target)}%"></b></div>
<p>예산 ${won(f.budget)}원 · 집행 ${won(f.executed)}원 · 남은 계획 ${won(f.planned)}원${f.pending ? ` · 짝 확인 대기 ${won(f.pending)}원(이미 결의된 것으로 보고 계획에서 뺌)` : ''} · ${gapTxt}</p>
<div class="bar bp-set"><label>목표 집행률 <input class="inp" type="number" id="bpTarget" min="1" max="150" value="${f.target}" style="width:80px">%</label><label>회계 마감일 <input class="inp" type="date" id="bpClose" value="${esc(f.close)}"></label><button class="btn sm" data-act="bpReload">${ic('refresh')}결의 다시 읽기</button></div>
<p class="muted" role="status">${status}</p></section>
${f.warnings.length ? `<div class="box warn bp-warn"><b>확인할 것 ${f.warnings.length}건</b><ul>${f.warnings.slice(0, 8).map(w => `<li>${esc(w.text)}${w.id ? ` <button class="btn sm ghost" data-act="bpEdit" data-id="${esc(w.id)}">고치기</button>` : ''}</li>`).join('')}</ul></div>` : ''}
${sugIds.length ? `<section class="bp-sug" aria-label="결의와 짝짓기"><h3>결의가 들어온 것 같은 계획 ${sugIds.length}건 <span class="muted">맞으면 집행됨으로 바뀌고 할 일도 끝냄 처리됩니다</span></h3>${sugIds.map(id => { const p = c.plans.find(x => x.id === id), s = c.sug[id]; return `<div class="bp-sg"><div><b>${esc(p.title)}</b> <span class="muted">계획 ${won(p.meta.b.a)}원 · 남은 ${won(s.remain)}원</span>${s.rows.map(r => `<div class="muted">· ${esc(r.d.slice(5).replace('-', '/'))} ${esc(r.desc.slice(0, 60))} <b>${won(r.a)}원</b></div>`).join('')}</div><div class="acts"><button class="btn sm primary" data-act="bpConfirm" data-id="${esc(id)}" data-keys="${esc(s.rows.map(r => r.k).join(','))}">${s.full ? '맞아요, 집행됨' : `맞아요 (${won(s.sum)}원 반영)`}</button><button class="btn sm" data-act="bpReject" data-id="${esc(id)}">아니에요</button></div></div>`; }).join('')}</section>` : ''}
<section class="bp-plans" aria-label="집행 계획"><h3>집행 계획 <span class="muted">${planRows.filter(i => !['done', 'drop'].includes(i.state)).length}건 진행 · ${planRows.filter(i => i.state === 'done').length}건 집행됨</span></h3>
<div class="bar bp-add"><label for="bpNewTitle" class="vh">내용</label><input class="inp grow" id="bpNewTitle" placeholder="내용 (예: 12월 자문회의 다과)" autocomplete="off"><label for="bpNewCode" class="vh">세목</label><select class="inp" id="bpNewCode">${se.map(r => `<option value="${esc(r.code)}">${esc(String(r.name).replace(/^[○●·\s]+/, ''))}</option>`).join('')}</select><label for="bpNewAmt" class="vh">금액</label><input class="inp" id="bpNewAmt" inputmode="numeric" placeholder="금액(원)" style="width:130px"><label for="bpNewDate" class="vh">예정일</label><input class="inp" type="date" id="bpNewDate"><button class="btn primary" data-act="bpAdd">${ic('plus')}계획 추가</button><button class="btn" data-act="bpImport">내 계획서에서 가져오기</button></div>
${planRows.length ? `<table class="bp-tbl"><tr><th scope="col">예정일</th><th scope="col">내용</th><th scope="col">세목</th><th scope="col" class="num">계획</th><th scope="col" class="num">집행(짝지음)</th><th scope="col" class="num">남은 금액</th><th scope="col">상태</th><th scope="col"></th></tr>${planRows.map(i => `<tr class="${['done', 'drop'].includes(i.state) ? 'done' : ''}"><td class="nowrap ${i.state === 'plan' && i.date && i.date < today() ? 'err' : ''}">${esc(i.date ? i.date.slice(5).replace('-', '/') : '-')}</td><td>${esc(i.title)}${i.pd ? ` <span class="muted">${esc(i.pd)}</span>` : ''}</td><td class="muted">${esc(String(i.name).replace(/^[○●·\s]+/, '').slice(0, 20))}</td><td class="num">${won(i.amount)}</td><td class="num">${i.matched ? won(i.matched) : '-'}</td><td class="num">${['done', 'drop'].includes(i.state) ? '-' : won(i.remain)}</td><td>${esc(i.state === 'plan' && i.date && i.date < today() ? '예정일 지남' : bpSt[i.state] || i.state)}</td><td class="nowrap"><button class="btn sm ghost" data-act="bpEdit" data-id="${esc(i.id)}">고치기</button>${!['done', 'drop'].includes(i.state) ? `<button class="btn sm ghost" data-act="bpDropRest" data-id="${esc(i.id)}">${i.matched ? '남은 금액 안 씀' : '계획 취소'}</button>` : ''}</td></tr>`).join('')}</table>` : `<p class="muted">아직 계획이 없습니다. 남은 행사·지급을 건별로 넣으면 연말 예상 집행률이 계산됩니다.</p>`}</section>
<section aria-label="세목별 예상"><h3>세목별 예상</h3><table class="bp-tbl"><tr><th scope="col">세목</th><th scope="col" class="num">예산</th><th scope="col" class="num">집행</th><th scope="col" class="num">남은 계획</th><th scope="col" class="num">예상</th><th scope="col" class="num">예상 집행률</th><th scope="col" class="num">계획 없는 잔액</th></tr>${f.subjects.map(s => `<tr><td>${esc(s.name)}</td><td class="num">${won(s.budget)}</td><td class="num">${won(s.executed)}</td><td class="num">${s.planned ? won(s.planned) : '-'}</td><td class="num">${won(s.forecast)}</td><td class="num ${s.forecast > s.budget ? 'err' : ''}">${pct(s.forecastRate)}</td><td class="num">${won(s.unplanned)}</td></tr>`).join('')}<tr class="sum"><td>합계</td><td class="num">${won(f.budget)}</td><td class="num">${won(f.executed)}</td><td class="num">${won(f.planned)}</td><td class="num">${won(f.forecast)}</td><td class="num">${pct(f.forecastRate)}</td><td class="num">${won(Math.max(0, f.budget - f.forecast))}</td></tr></table></section>
${bpChart(c)}
<p class="muted td-hint">계획은 그룹웨어 개인 ToDo에 저장되어 '내 할 일'에도 보입니다(다른 PC·모바일과 같음). 결의 짝짓기는 같은 세목·비슷한 금액·적요 낱말로 제안만 하며, 확정은 직접 누릅니다.</p>`;
  }

  // ----- 계획서에서 가져오기 -----
  async function bpImportOpen() {
    const b = S.budget; if (!b.filter) { toast('단위사업(항)을 먼저 고르세요.'); return; }
    closeOverlay(); S.paletteOpen = true;
    BP.imp = null; BP.impErr = ''; BP.impBusy = true;
    const render = () => { if (S.paletteOpen) $('#overlay').innerHTML = bpImportHtml(); };
    render();
    try {
      if (typeof learnPatterns === 'function') await learnPatterns({limit: 12, budgetMs: 30000, quiet: true}).catch(() => null);
      const docs = typeof patLoad === 'function' ? Object.values(patLoad().docs || {}).filter(d => d && d.binder && !/^접수문서/.test(d.binder)) : [];
      const led = await bpLoadLedger(b.project, b.filter);
      const rows = bpRows(b.project, b.filter) || [];
      const claimed = new Set(bpAllPlans().flatMap(t => (t.meta.b.m || []).map(m => m.k)));
      const taken = bpAllPlans().map(t => t.meta.b.pd).filter(Boolean);
      BP.imp = R.bpPlanCandidates({docs, rows, ledger: (led && led.rows) || [], taken, year: Number(today().slice(0, 4)), claimed});
      BP.impDocs = docs.length; BP.impLedger = !!led;
    } catch (e) { BP.impErr = String(e.message || e); logError('bp.import', BP.impErr); }
    BP.impBusy = false; render();
  }
  function bpImportHtml() {
    const b = S.budget, se = (bpRows(b.project, b.filter) || []).filter(r => r.level === '세');
    const list = BP.imp || [];
    const open = list.filter(c => !c.taken && c.remain > 0 && !c.stale), rest = list.filter(c => c.taken || c.remain <= 0 || c.stale);
    const t0 = today();
    const row = c => { const i = list.indexOf(c); const due = c.eventDate && c.eventDate >= t0 ? c.eventDate : R.tdNextDue({f: 'wd'}, R.tdNextDue({f: 'wd'}, t0)); return `<div class="bp-imp"><div><b>${esc(c.title)}</b> <span class="muted">${esc(c.docNo)} · ${esc(c.date)}${c.eventDate ? ` · 행사 ${esc(c.eventDate.slice(5).replace('-', '/'))}` : ''}</span><div class="muted">소요예산 ${won(c.amount)}원${c.spent ? ` · 이미 결의 ${won(c.spent)}원(${c.used.length}건)` : ''} · 세목 ${esc(c.names.map(n => String(n).replace(/^[○●·\s]+/, '')).join(', '))}</div></div><div class="bar"><select class="inp" id="bpImpCode${i}" aria-label="세목">${c.codes.map(code => `<option value="${esc(code)}" ${code === c.code ? 'selected' : ''}>${esc(String((se.find(r => r.code === code) || {}).name || code).replace(/^[○●·\s]+/, ''))}</option>`).join('')}</select><input class="inp" id="bpImpAmt${i}" inputmode="numeric" value="${won(c.remain)}" aria-label="계획 금액" style="width:120px"><input class="inp" type="date" id="bpImpDate${i}" value="${esc(due)}" aria-label="집행 예정일"><button class="btn sm primary" data-act="bpImportAdd" data-i="${i}">계획으로 추가</button></div></div>`; };
    return `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" role="dialog" aria-label="내 계획서에서 가져오기" style="width:min(820px,96vw);max-height:88vh;overflow:auto"><button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button><h2 style="margin-top:0">내 계획서에서 가져오기</h2>
<p class="muted">올해 내가 기안한 계획서 중 이 사업의 세목을 쓰는 것을 찾고, 이미 결의된 금액(같은 세목·계획서 날짜 이후·적요 낱말 일치)을 뺀 나머지를 계획 후보로 보여 드립니다. 세목이 여러 개면 나눠서 두 번 추가하세요.</p>
${BP.impBusy ? '<p><span class="spin"></span> 내 결재문서와 결의 내역을 읽는 중…</p>' : BP.impErr ? `<p class="err">${esc(BP.impErr)}</p>` : `${open.length ? open.map(row).join('') : `<p>남은 금액이 있는 계획서를 찾지 못했습니다. (학습한 내 문서 ${BP.impDocs || 0}건 기준)</p>`}${rest.length ? `<details><summary>이미 집행됐거나 끝난 계획서 ${rest.length}건</summary>${rest.map(c => `<div class="muted">· ${esc(c.title)} (${esc(c.docNo)}) — ${c.taken ? '이미 계획으로 가져옴' : c.stale && c.remain > 0 ? `행사가 끝나 남은 ${won(c.remain)}원은 집행 잔액으로 보임(소요 ${won(c.amount)}원 중 ${won(c.spent)}원 결의)` : `소요 ${won(c.amount)}원 중 ${won(c.spent)}원 결의`}</div>`).join('')}</details>` : ''}`}
<div class="acts" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="closeOverlay">닫기</button></div></div></div>`;
  }

  // ----- 처리기 -----
  const bpAmt = v => Number(String(v || '').replace(/[^0-9]/g, '')) || 0;
  async function bpSavePlanMeta(id, b, {complete = false} = {}) {
    const t = typeof todoFind === 'function' ? todoFind(id) : null; if (!t) return {ok: false, text: '계획을 찾지 못했습니다.'};
    const r = await todoSave(id, {meta: {...t.meta, b}});
    if (r.ok && complete && !t.done) { const d = await todoToggle(id, true); if (!d.ok) return d; }
    return r;
  }
  HOME_ACTS.bpReload = () => { const b = S.budget; if (b.filter) { BP.rows[bpKey(b.project, b.filter)] = null; bpLoadLedger(b.project, b.filter, true); if (typeof todoLoad === 'function') todoLoad({force: true}); renderMain(); } };
  HOME_ACTS.bpAdd = async () => {
    if (BP.adding) return;
    const b = S.budget, v = id => (($('#' + id) || {}).value || '').trim();
    const code = v('bpNewCode'), amt = bpAmt(v('bpNewAmt')), date = v('bpNewDate');
    const row = (bpRows(b.project, b.filter) || []).find(r => r.code === code);
    if (!row) { toast('세목을 고르세요.'); return; }
    if (!amt) { toast('금액을 입력하세요.'); $('#bpNewAmt')?.focus(); return; }
    if (!date) { toast('집행 예정일을 고르세요.'); $('#bpNewDate')?.focus(); return; }
    const name = String(row.name).replace(/^[○●·\s]+/, '');
    const title = v('bpNewTitle') || `${name} 집행`;
    BP.adding = true;
    const r = await todoCreate({title, due: date, meta: {b: {p: b.project, h: b.filter, c: code, n: name, a: amt, d: date, st: 'plan'}}}).finally(() => { BP.adding = false; });
    toast(r.ok ? `계획을 추가했습니다(${won(amt)}원 · 내 할 일에도 저장).` : r.text);
    if (r.ok) renderMain();
  };
  HOME_ACTS.bpImport = () => bpImportOpen();
  HOME_ACTS.bpImportAdd = async el => {
    const i = Number(el.dataset.i), c = (BP.imp || [])[i]; if (!c) return;
    const b = S.budget, code = ($('#bpImpCode' + i) || {}).value, amt = bpAmt(($('#bpImpAmt' + i) || {}).value), date = ($('#bpImpDate' + i) || {}).value;
    const row = (bpRows(b.project, b.filter) || []).find(r => r.code === code);
    if (!row || !amt || !date) { toast('세목·금액·예정일을 확인하세요.'); return; }
    el.disabled = true;
    const name = String(row.name).replace(/^[○●·\s]+/, '');
    const short = c.title.replace(/^20\d\d년?\.?\s*/, '').replace(/\s*(운영|참가)?\s*계획(\s*\((안|변경)\))?$/, '').replace(/[『』「」‘’“”"']/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const r = await todoCreate({title: `${short} 집행(${name.split(/\s+/).pop().slice(0, 20)})`.slice(0, 100), due: date, meta: {b: {p: b.project, h: b.filter, c: code, n: name, a: amt, d: date, st: 'plan', pd: c.docNo, pdDate: c.date, pt: c.title.slice(0, 80)}}});
    if (r.ok) { c.taken = true; toast(`“${short}” 계획을 추가했습니다.`); } else { el.disabled = false; toast(r.text); }
    if (S.paletteOpen) $('#overlay').innerHTML = bpImportHtml();
  };
  HOME_ACTS.bpConfirm = async el => {
    const b = S.budget, c = bpCompute(b.project, b.filter), id = el.dataset.id, s = c.sug[id], p = c.plans.find(x => x.id === id);
    if (!s || !p || s.rows.map(r => r.k).join(',') !== (el.dataset.keys || '')) { toast('결의 내역이 바뀌어 제안이 달라졌습니다. 다시 확인해 주세요.'); renderMain(); return; }
    el.disabled = true;
    const m = [...(p.meta.b.m || []), ...s.rows.map(r => ({k: r.k, d: r.d, a: r.a, s: r.desc.slice(0, 30), no: r.docNo || undefined}))];
    const matched = m.reduce((x, y) => x + (Number(y.a) || 0), 0);
    const full = matched >= (Number(p.meta.b.a) || 0) * 0.95;
    const r = await bpSavePlanMeta(id, {...p.meta.b, m, st: full ? 'done' : 'plan'}, {complete: full});
    toast(!r.ok ? r.text : full ? '집행됨으로 표시하고 할 일을 끝냄 처리했습니다.' : `${won(s.sum)}원을 반영했습니다. 남은 ${won(Math.max(0, p.meta.b.a - matched))}원은 계획으로 남겨 둡니다.`);
    renderMain();
  };
  HOME_ACTS.bpReject = async el => {
    const b = S.budget, c = bpCompute(b.project, b.filter), id = el.dataset.id, s = c.sug[id], p = c.plans.find(x => x.id === id);
    if (!s || !p) return;
    const r = await bpSavePlanMeta(id, {...p.meta.b, x: [...(p.meta.b.x || []), ...s.rows.map(x => x.k)].slice(-40)});
    toast(r.ok ? '이 결의는 다시 제안하지 않습니다.' : r.text); renderMain();
  };
  HOME_ACTS.bpDropRest = async el => {
    const p = bpAllPlans().find(x => x.id === el.dataset.id); if (!p) return;
    const matched = (p.meta.b.m || []).reduce((x, y) => x + (Number(y.a) || 0), 0);
    if (!confirm(matched ? `남은 ${won(p.meta.b.a - matched)}원은 쓰지 않는 것으로 하고 계획을 ${won(matched)}원으로 줄여 끝낼까요?` : `“${p.title}” 계획을 취소할까요? (할 일은 끝냄 처리되고 예상에서 빠집니다)`)) return;
    const r = await bpSavePlanMeta(p.id, {...p.meta.b, a: matched || p.meta.b.a, st: matched ? 'done' : 'drop'}, {complete: true});
    toast(r.ok ? '반영했습니다.' : r.text); renderMain();
  };
  HOME_ACTS.bpEdit = el => { if (typeof todoOpen === 'function') todoOpen(el.dataset.id); };
  function bpChange(t) {
    if (t.id === 'bpTarget') { const v = Number(t.value); if (v > 0 && v <= 150) { S.settings.bpTarget = v; saveLocal(); renderMain(); root.querySelector('#bpTarget')?.focus(); } else toast('목표 집행률은 1~150%로 입력하세요.'); }
    else if (t.id === 'bpClose') { if (/^\d{4}-\d{2}-\d{2}$/.test(t.value)) { S.settings.bpClose = t.value; saveLocal(); renderMain(); } }
  }
