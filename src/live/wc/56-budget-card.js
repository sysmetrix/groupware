// GW 비서 · 예산 집행 > 카드 사용내역 (v1.21)
// 지출결의서 채주정보의 [카드승인내역] 창과 같은 자료를 결의를 쓰기 전에 미리 본다. 읽기만 하고, 결의에 넣는 일은 그룹웨어 결의서에서 한다.
// 자료: GW.cardUsage() (수집기). 거르기·합계: R.cduView (card-usage.mjs).
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const CDU = {period: 'month', from: '', to: '', state: 'open', card: '', q: '', data: null, busy: false, err: '', seq: 0};
  const cduRange = () => R.cduPeriod(CDU.period, new Date(), {from: CDU.from, to: CDU.to});
  async function cduLoad(inRender) {
    if (!GW.cardUsage) { CDU.err = '이 화면의 그룹웨어 연결에 카드 사용내역 조회가 없습니다. 그룹웨어를 새로고침한 뒤 다시 열어 주세요.'; if (!inRender && S.view === 'budget') renderMain(); return; }
    const p = cduRange(), seq = ++CDU.seq;
    CDU.busy = true; CDU.err = '';
    if (!inRender && S.view === 'budget') renderMain();
    try {
      const d = await GW.cardUsage({from: p.from, to: p.to, state: 'all'});
      if (seq !== CDU.seq) return;
      CDU.data = d;
      if (CDU.card && !d.rows.some(r => r.card === CDU.card)) CDU.card = '';
    } catch (e) {
      if (seq !== CDU.seq) return;
      CDU.err = String((e && e.message) || e).slice(0, 160); CDU.data = null;
      if (typeof logError === 'function') logError('card.load', CDU.err);
    } finally {
      if (seq === CDU.seq) { CDU.busy = false; if (S.view === 'budget' && typeof budgetMode === 'function' && budgetMode() === 'card') renderMain(); }
    }
  }
  const cduAt = iso => { const d = iso ? new Date(iso) : null; return d && Number.isFinite(d.getTime()) ? new Date(d.getTime() + 9 * 3600000).toISOString().slice(11, 16) : ''; };
  const cduBadge = r => r.status === 'open' ? `<span class="bdg check">${esc(R.cduStatusLabel(r))}</span>` : r.status === 'done' ? `<span class="bdg tag">${esc(R.cduStatusLabel(r))}</span>` : `<span class="bdg info">${esc(R.cduStatusLabel(r))}</span>`;
  function cduListHtml(v) {
    if (!v.rows.length) {
      const why = CDU.q ? '찾는 말과 맞는 카드 사용이 없습니다.' : CDU.state === 'open' ? '이 기간에 결의 전인 카드 사용이 없습니다.' : '이 기간에 해당하는 카드 사용이 없습니다.';
      return `<div class="empty"><div class="ill">${ic('check')}</div><b>${why}</b>${CDU.state === 'open' && !CDU.q ? '다른 기간이나 [전체]에서 확인해 보세요.' : ''}</div>`;
    }
    const tr = r => `<tr data-cdu-row><td class="nowrap">${esc(R.cduDayLabel(r.date))}<div class="muted">${esc(r.time)}</div></td><td>${esc(r.card)}</td><td class="cu-place">${esc(r.place)}${r.approvalNo ? `<div class="muted">승인 ${esc(r.approvalNo)}</div>` : ''}</td><td class="num"><button class="linkbtn" data-act="openUrl" data-url="${esc(R.cduSlipUrl(r))}" data-title="${esc(r.place)} 매출전표" aria-label="${esc(r.place)} 매출전표 보기">${won(r.amount)}</button>${r.vat ? `<div class="muted">부가세 ${won(r.vat)}</div>` : ''}</td><td>${cduBadge(r)}</td></tr>`;
    return `<div class="bm-scroll"><table class="bm-tbl cu-tbl"><tr><th scope="col">승인일시</th><th scope="col">카드</th><th scope="col">사용처</th><th scope="col" class="num">금액</th><th scope="col">결의</th></tr>${v.rows.map(tr).join('')}${v.rows.length > 1 ? `<tr class="sum"><td colspan="3">합계 ${v.rows.length}건</td><td class="num">${won(v.amount)}</td><td></td></tr>` : ''}</table></div>`;
  }
  function vBudgetCard() {
    const p = cduRange();
    if (!CDU.busy && !CDU.err && (!CDU.data || CDU.data.from !== p.from || CDU.data.to !== p.to)) cduLoad(true);
    const d = CDU.data && CDU.data.from === p.from && CDU.data.to === p.to ? CDU.data : null;
    const v = R.cduView(d ? d.rows : [], {state: CDU.state, card: CDU.card, q: CDU.q});
    const sub = `${esc(R.cduDayLabel(p.from))} ~ ${esc(R.cduDayLabel(p.to))} 승인${d ? ` · ${d.rows.length}건 · ${esc(cduAt(d.at))} 조회` : ''}`;
    const entry = (d && d.url) || (GW.links && GW.routes ? GW.links.route(GW.routes.expenseEntry) : '');
    const head = pgh('예산 집행', sub, `<button class="btn sm" data-act="cduReload" ${CDU.busy ? 'disabled' : ''}>${ic('refresh')}다시 읽기</button>${d && d.rows.length ? `<button class="btn sm" data-act="cduCsv">CSV 저장</button>` : ''}${entry ? `<button class="btn sm" data-act="openUrl" data-url="${esc(entry)}" data-title="지출결의서 입력">${ic('ext')}지출결의서 입력</button>` : ''}<button class="btn sm primary" data-act="openPay" title="GW 비서에서 지급 건의·지출결의 서식을 채웁니다. 상신은 직접 합니다.">${ic('wallet')}지출결의 준비</button>`);
    const chip = (act, val, on, label, attr = 'data-v') => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" ${attr}="${esc(val)}" aria-pressed="${on}">${label}</button>`;
    const periods = R.CDU_PERIODS.map(([k, l]) => chip('cduPeriod', k, CDU.period === k, l)).join('');
    const custom = `${typeof dateField === 'function' ? dateField('cduFrom', R.cduDash(p.from), '시작일', {maxOf: 'cduTo'}) : ''}<span class="muted">~</span>${typeof dateField === 'function' ? dateField('cduTo', R.cduDash(p.to), '종료일', {minOf: 'cduFrom'}) : ''}<button class="btn sm ${CDU.period === 'custom' ? 'on' : ''}" data-act="cduCustom">기간 조회</button>`;
    const states = R.CDU_STATES.map(([k, l]) => chip('cduState', k, CDU.state === k, `${l}${d ? ` ${v.counts[k]}` : ''}`)).join('');
    const cards = d && v.cards.length > 1 ? `<div class="bar cu-cards" role="group" aria-label="카드 고르기">${chip('cduCard', '', !CDU.card, '모든 카드', 'data-c')}${v.cards.map(c => chip('cduCard', c.card, CDU.card === c.card, `${esc(c.card)} ${c.count}`, 'data-c')).join('')}</div>` : '';
    const tools = `${budgetModeTabs()}<div class="bar cu-period" role="group" aria-label="승인일 기간">${periods}<span class="bm-sep" aria-hidden="true"></span>${custom}</div><div class="bar cu-state" role="group" aria-label="결의 여부">${states}<span class="bm-sep" aria-hidden="true"></span><label for="cduQ" class="vh">사용처·카드·승인번호 찾기</label><input class="inp grow" id="cduQ" placeholder="사용처·카드·승인번호·금액 찾기" value="${esc(CDU.q)}" autocomplete="off"></div>${cards}`;
    if (CDU.err) return `${head}${tools}<div class="box errb">카드 사용내역을 읽지 못했습니다: ${esc(CDU.err)} <button class="btn sm" data-act="cduReload">다시 시도</button></div>`;
    if (!d) return `${head}${tools}<p class="muted"><span class="spin"></span> 카드 사용내역을 읽는 중입니다…</p><div class="list">${'<div class="sk row"></div>'.repeat(4)}</div>`;
    const age = v.oldestOpen ? R.cduAgeDays(v.oldestOpen) : null;
    const sum = `<section class="bm-sum cu-sum" aria-label="결의 전 카드 사용"><div class="bm-big">결의 전 <b>${v.counts.open}건</b> · ${won(v.openAmount)}원</div><p>${v.counts.open ? `가장 오래된 건 ${esc(R.cduDayLabel(v.oldestOpen))}${age != null && age > 0 ? ` · ${age}일 지남` : ''}. 결의서에서 [카드승인내역]을 누르면 이 건들이 나옵니다.` : '이 기간의 카드 사용은 모두 결의에 반영되었습니다.'}${v.counts.other ? ` 지출결의·계산서로 따로 처리된 건 ${v.counts.other}건은 [전체]에서 봅니다.` : ''}</p></section>`;
    return `${head}${tools}${sum}<div id="cduList">${cduListHtml(v)}</div>
<p class="muted td-hint">그룹웨어 지출결의서 채주정보의 [카드승인내역]과 같은 조건(내가 쓸 수 있는 카드, 승인일 기준)으로 읽기만 합니다. 결의에 넣는 일은 그룹웨어 결의서에서 합니다. 카드번호는 읽지 않습니다.</p>`;
  }
  // 찾기: 표만 다시 그려 입력 칸의 글자와 커서를 지킨다
  function cduInput(t, composing) {
    CDU.q = t.value;
    if (composing) return;
    const box = $('#cduList'), d = CDU.data;
    if (box && d) box.innerHTML = cduListHtml(R.cduView(d.rows, {state: CDU.state, card: CDU.card, q: CDU.q}));
  }

  HOME_ACTS.cduPeriod = (el, v) => { if (!R.CDU_PERIODS.some(([k]) => k === v)) return; CDU.period = v; renderMain(); root.querySelector(`[data-act="cduPeriod"][data-v="${v}"]`)?.focus(); };
  HOME_ACTS.cduCustom = () => {
    const f = ($('#cduFrom') || {}).value || '', t = ($('#cduTo') || {}).value || '';
    const p = R.cduPeriod('custom', new Date(), {from: f, to: t});
    if (p.kind !== 'custom') { toast('시작일과 종료일을 바르게 골라 주세요.'); return; }
    CDU.period = 'custom'; CDU.from = p.from; CDU.to = p.to; renderMain();
  };
  HOME_ACTS.cduState = (el, v) => { if (!R.CDU_STATES.some(([k]) => k === v)) return; CDU.state = v; renderMain(); root.querySelector(`[data-act="cduState"][data-v="${v}"]`)?.focus(); };
  HOME_ACTS.cduCard = el => { CDU.card = el.dataset.c || ''; renderMain(); };
  HOME_ACTS.cduReload = () => { CDU.err = ''; cduLoad(); };
  HOME_ACTS.cduCsv = () => {
    const d = CDU.data; if (!d) return;
    const v = R.cduView(d.rows, {state: CDU.state, card: CDU.card, q: CDU.q});
    download(`카드사용내역_${d.from}-${d.to}.csv`, R.toCsv(v.rows, [{label: '승인일', value: r => R.cduDash(r.date)}, {label: '시간', key: 'time'}, {label: '카드', key: 'card'}, {label: '사용처', key: 'place'}, {label: '금액', key: 'amount'}, {label: '부가세', key: 'vat'}, {label: '결의', value: r => R.cduStatusLabel(r)}, {label: '승인번호', key: 'approvalNo'}]), 'text/csv;charset=utf-8');
  };
