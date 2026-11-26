// GW 비서 · 예산 집행 > 세금계산서 (v1.22)
// 지출결의서 채주정보의 [전자(세금)계산서발행내역] 창과 같은 자료를 결의를 쓰기 전에 미리 본다. 읽기만 하고, 결의에 넣는 일은 그룹웨어 결의서에서 한다.
// 자료: GW.etaxInvoices() (수집기). 거르기·합계: R.etxView (card-usage.mjs). 기간 단추·날짜 고르기는 카드 사용내역(56번)과 같은 것을 쓴다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const ETX = {period: 'month', from: '', to: '', state: 'open', q: '', data: null, busy: false, err: '', seq: 0};
  const etxRange = () => R.cduPeriod(ETX.period, new Date(), {from: ETX.from, to: ETX.to});
  async function etxLoad(inRender) {
    if (!GW.etaxInvoices) { ETX.err = '이 화면의 그룹웨어 연결에 세금계산서 조회가 없습니다. 그룹웨어를 새로고침한 뒤 다시 열어 주세요.'; if (!inRender && S.view === 'budget') renderMain(); return; }
    const p = etxRange(), seq = ++ETX.seq;
    ETX.busy = true; ETX.err = '';
    if (!inRender && S.view === 'budget') renderMain();
    try {
      const d = await GW.etaxInvoices({from: p.from, to: p.to, state: 'all'});
      if (seq !== ETX.seq) return;
      ETX.data = d;
    } catch (e) {
      if (seq !== ETX.seq) return;
      ETX.err = String((e && e.message) || e).slice(0, 160); ETX.data = null;
      if (typeof logError === 'function') logError('etax.load', ETX.err);
    } finally {
      if (seq === ETX.seq) { ETX.busy = false; if (S.view === 'budget' && typeof budgetMode === 'function' && budgetMode() === 'etax') renderMain(); }
    }
  }
  const etxBadge = r => r.status === 'done' ? `<span class="bdg tag">${esc(R.etxStatusLabel(r))}</span>` : `<span class="bdg check">${esc(R.etxStatusLabel(r))}</span>`;
  function etxListHtml(v) {
    if (!v.rows.length) {
      const why = ETX.q ? '찾는 말과 맞는 세금계산서가 없습니다.' : ETX.state === 'open' ? '이 기간에 결의 전인 세금계산서가 없습니다.' : '이 기간에 해당하는 세금계산서가 없습니다.';
      return `<div class="empty"><div class="ill">${ic('check')}</div><b>${why}</b>${ETX.state === 'open' && !ETX.q ? '다른 기간이나 [전체]에서 확인해 보세요.' : ''}</div>`;
    }
    const tr = r => `<tr data-etx-row><td class="nowrap">${esc(R.cduDayLabel(r.date))}</td><td class="cu-place">${esc(r.supplier)}<div class="muted">${esc(R.etxBizNo(r.bizNo))}${r.item ? ` · ${esc(r.item)}` : ''}</div></td><td>${esc(R.etxTaxLabel(r))}</td><td class="num">${won(r.sum)}${r.vat ? `<div class="muted">부가세 ${won(r.vat)}</div>` : ''}</td><td>${etxBadge(r)}</td></tr>`;
    return `<div class="bm-scroll"><table class="bm-tbl cu-tbl"><tr><th scope="col">발행일</th><th scope="col">공급자</th><th scope="col">구분</th><th scope="col" class="num">합계</th><th scope="col">결의</th></tr>${v.rows.map(tr).join('')}${v.rows.length > 1 ? `<tr class="sum"><td colspan="3">합계 ${v.rows.length}건</td><td class="num">${won(v.amount)}</td><td></td></tr>` : ''}</table></div>`;
  }
  function vBudgetEtax() {
    const p = etxRange();
    if (!ETX.busy && !ETX.err && (!ETX.data || ETX.data.from !== p.from || ETX.data.to !== p.to)) etxLoad(true);
    const d = ETX.data && ETX.data.from === p.from && ETX.data.to === p.to ? ETX.data : null;
    const v = R.etxView(d ? d.rows : [], {state: ETX.state, q: ETX.q});
    const sub = `${esc(R.cduDayLabel(p.from))} ~ ${esc(R.cduDayLabel(p.to))} 발행${d ? ` · ${d.rows.length}건 · ${esc(cduAt(d.at))} 조회` : ''}`;
    const entry = (d && d.url) || (GW.links && GW.routes ? GW.links.route(GW.routes.expenseEntry) : '');
    const head = pgh('예산 집행', sub, `<button class="btn sm" data-act="etxReload" ${ETX.busy ? 'disabled' : ''}>${ic('refresh')}다시 읽기</button>${d && d.rows.length ? `<button class="btn sm" data-act="etxCsv">CSV 저장</button>` : ''}${entry ? `<button class="btn sm" data-act="openUrl" data-url="${esc(entry)}" data-title="지출결의서 입력">${ic('ext')}지출결의서 입력</button>` : ''}<button class="btn sm primary" data-act="openPay" title="GW 비서에서 지급 건의·지출결의 서식을 채웁니다. 상신은 직접 합니다.">${ic('wallet')}지출결의 준비</button>`);
    const chip = (act, val, on, label) => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-v="${esc(val)}" aria-pressed="${on}">${label}</button>`;
    const periods = R.CDU_PERIODS.map(([k, l]) => chip('etxPeriod', k, ETX.period === k, l)).join('');
    const custom = `${typeof dateField === 'function' ? dateField('etxFrom', R.cduDash(p.from), '시작일', {maxOf: 'etxTo'}) : ''}<span class="muted">~</span>${typeof dateField === 'function' ? dateField('etxTo', R.cduDash(p.to), '종료일', {minOf: 'etxFrom'}) : ''}<button class="btn sm ${ETX.period === 'custom' ? 'on' : ''}" data-act="etxCustom">기간 조회</button>`;
    const states = R.ETX_STATES.map(([k, l]) => chip('etxState', k, ETX.state === k, `${l}${d ? ` ${v.counts[k]}` : ''}`)).join('');
    const tools = `${budgetModeTabs()}<div class="bar cu-period" role="group" aria-label="발행일 기간">${periods}<span class="bm-sep" aria-hidden="true"></span>${custom}</div><div class="bar cu-state" role="group" aria-label="결의 여부">${states}<span class="bm-sep" aria-hidden="true"></span><label for="etxQ" class="vh">공급자·품목·승인번호 찾기</label><input class="inp grow" id="etxQ" placeholder="공급자·품목·승인번호·금액 찾기" value="${esc(ETX.q)}" autocomplete="off"></div>`;
    if (ETX.err) return `${head}${tools}<div class="box errb">세금계산서를 읽지 못했습니다: ${esc(ETX.err)} <button class="btn sm" data-act="etxReload">다시 시도</button></div>`;
    if (!d) return `${head}${tools}<p class="muted"><span class="spin"></span> 세금계산서를 읽는 중입니다…</p><div class="list">${'<div class="sk row"></div>'.repeat(4)}</div>`;
    const age = v.oldestOpen ? R.cduAgeDays(v.oldestOpen) : null;
    const sum = `<section class="bm-sum cu-sum" aria-label="결의 전 세금계산서"><div class="bm-big">결의 전 <b>${v.counts.open}건</b> · ${won(v.openAmount)}원</div><p>${v.counts.open ? `가장 오래된 건 ${esc(R.cduDayLabel(v.oldestOpen))}${age != null && age > 0 ? ` · ${age}일 지남` : ''}. 결의서에서 [전자(세금)계산서발행내역]을 누르면 이 건들이 나옵니다.` : '이 기간의 세금계산서는 모두 결의에 반영되었습니다.'}</p></section>`;
    return `${head}${tools}${sum}<div id="etxList">${etxListHtml(v)}</div>
<p class="muted td-hint">그룹웨어 지출결의서 채주정보의 [전자(세금)계산서발행내역]과 같은 조건(증빙 과세·면세, 발행일 기준)으로 읽기만 합니다. 결의에 넣는 일은 그룹웨어 결의서에서 합니다.</p>`;
  }
  function etxInput(t, composing) {
    ETX.q = t.value;
    if (composing) return;
    const box = $('#etxList'), d = ETX.data;
    if (box && d) box.innerHTML = etxListHtml(R.etxView(d.rows, {state: ETX.state, q: ETX.q}));
  }

  HOME_ACTS.etxPeriod = (el, v) => { if (!R.CDU_PERIODS.some(([k]) => k === v)) return; ETX.period = v; renderMain(); root.querySelector(`[data-act="etxPeriod"][data-v="${v}"]`)?.focus(); };
  HOME_ACTS.etxCustom = () => {
    const f = ($('#etxFrom') || {}).value || '', t = ($('#etxTo') || {}).value || '';
    const p = R.cduPeriod('custom', new Date(), {from: f, to: t});
    if (p.kind !== 'custom') { toast('시작일과 종료일을 바르게 골라 주세요.'); return; }
    ETX.period = 'custom'; ETX.from = p.from; ETX.to = p.to; renderMain();
  };
  HOME_ACTS.etxState = (el, v) => { if (!R.ETX_STATES.some(([k]) => k === v)) return; ETX.state = v; renderMain(); root.querySelector(`[data-act="etxState"][data-v="${v}"]`)?.focus(); };
  HOME_ACTS.etxReload = () => { ETX.err = ''; etxLoad(); };
  HOME_ACTS.etxCsv = () => {
    const d = ETX.data; if (!d) return;
    const v = R.etxView(d.rows, {state: ETX.state, q: ETX.q});
    download(`세금계산서_${d.from}-${d.to}.csv`, R.toCsv(v.rows, [{label: '발행일', value: r => R.cduDash(r.date)}, {label: '공급자', key: 'supplier'}, {label: '사업자번호', value: r => R.etxBizNo(r.bizNo)}, {label: '구분', value: r => R.etxTaxLabel(r)}, {label: '품목', key: 'item'}, {label: '공급가액', key: 'supply'}, {label: '부가세', key: 'vat'}, {label: '합계', key: 'sum'}, {label: '결의', value: r => R.etxStatusLabel(r)}, {label: '승인번호', key: 'issueNo'}]), 'text/csv;charset=utf-8');
  };