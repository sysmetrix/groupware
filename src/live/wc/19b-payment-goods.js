// GW 비서 · 지급 문서 허브와 물품매입 품의
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs. 19-draft-engine.js에서 나눔(v1.16.0).
  // ---------- 지급 문서: 계획서 -> 지급 건의(일반기안문) -> 지출결의서 / 계획서 -> 물품매입품의서 -> 지출결의서 ----------
  const ownDocs = () => Object.values(patLoad().docs).filter(d => d.binder && !/^접수문서/.test(d.binder));
  const planDocs = () => ownDocs().filter(d => /계획(\(안\)|\(변경\))?$/.test(String(d.title).trim()) && !/결과/.test(d.title) && /^일반기안문/.test(d.form || '일반기안문')).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const won0 = n => (n ? n.toLocaleString('en-US') + '원' : '-');

  async function openPaymentHub() {
    if (gated('draftPay')) return;
    closeOverlay();
    S.paletteOpen = true;
    const shell = body => `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(760px,95vw);padding:22px 24px;max-height:88vh;overflow:auto" role="dialog" aria-label="지급 문서"><button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>${body}</div></div>`;
    // 읽어 둔 문서가 있으면 바로 그린다
    const known = Object.keys(patLoad().docs).length;
    $('#overlay').innerHTML = known ? shell(payHubBody(null)) : shell('<h2 style="margin:0 0 8px;font-size:18px">지급 문서</h2><div class="mi muted"><span class="spin"></span> 내 지급 문서를 분석하고 있습니다…</div>');
    const mark = typeof overlayMark === 'function' ? overlayMark() : 0;
    const res = await learnPatterns({limit: 12, budgetMs: 40000, quiet: true}).catch(() => 0);
    // 분석하는 동안 사용자가 창을 닫았거나 다른 창·다른 지급 문서 창으로 바뀌었으면 다시 그리지 않는다.
    if (typeof overlayLive === 'function' && !overlayLive(mark)) return;
    const top = $('#overlay .dlg')?.scrollTop || 0;
    $('#overlay').innerHTML = shell(payHubBody(res || {errMsg: '오류'}));
    const dlg = $('#overlay .dlg'); if (dlg) dlg.scrollTop = top;
  }
  // res: null이면 확인 중. 조회 실패·못 읽은 범위는 그대로 보인다
  function payHubBody(res) {
    const all = Object.values(patLoad().docs);
    const props = R.listProposals(all).slice(0, 8);
    const pend = R.pendingPayments(all);
    const miss = !!res && !!(res.errMsg || res.errors || res.left);
    const note = !res ? '<div class="muted" role="status"><span class="spin"></span> 새 문서 확인 중…</div>'
      : miss ? `<div class="box warn" role="status">${res.errMsg ? `문서 목록을 읽지 못했습니다(${esc(res.errMsg)}). 전에 읽어 둔 ${all.length}건만 보입니다.` : `확인하지 못한 문서 ${(res.errors || 0) + (res.left || 0)}건이 있어 빠진 것이 있을 수 있습니다.`}</div>` : '';
    const none = !res ? '읽어 둔 문서에는 없습니다(확인 중).' : '확인한 문서에서 찾지 못했습니다.';
    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div class="cmd-logo">${ic('doc')}</div><div><h2 style="margin:0;font-size:18px">지급 문서</h2><div class="muted">내가 해 온 순서: 계획서 → 지급 건의(또는 물품매입 품의) → 지출결의서. 앞 문서의 기록물철·기본항목을 이어받습니다.</div></div></div>${note}
      <div class="sec"><div class="sh">① 지급 건의 새로 작성 <span class="muted">(지난 건의를 틀로 사용)</span></div>
        ${props.length ? props.map(p => `<div class="cmd-preset" role="button" tabindex="0" data-act="payPickBase" data-id="${esc(p.id)}" style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1;min-width:0"><b>${esc(p.title)}</b><div class="muted" style="font-size:12px">${esc(p.docNo)} · ${esc(won0(R.proposalAmount(p)))} · 기록물철 ${esc(p.binder)}</div></div><button class="btn sm primary">이 건의처럼 작성</button></div>`).join('') : `<div class="muted">${miss || !res ? none : '학습된 지급 건의가 없습니다.'}</div>`}
      </div>
      <div class="sec"><div class="sh">② 물품매입 품의 새로 작성</div><div class="acts"><button class="btn primary" data-act="goodsPickPlan">${ic('plus')}계획서를 고르고 작성</button></div></div>
      <div class="sec"><div class="sh">③ 지출결의서를 올릴 차례인 문서 <span class="muted">(${pend.length}건)</span></div>
        ${pend.length ? pend.map(p => `<div class="box" style="margin:6px 0"><b>${esc(p.title)}</b> <span class="bdg tag">${esc(p.kind)}</span><div class="muted" style="font-size:12.5px;margin:3px 0">${esc(p.docNo)} 참조 · ${esc(p.expenseForm)} · 기록물철 ${esc(p.binder)}${p.amount ? ' · ' + esc(won0(p.amount)) : ''}</div><div class="acts"><button class="btn sm primary" data-act="expOpen" data-id="${esc(p.id)}">지출 내역 입력하고 확인</button><button class="btn sm" data-act="copy" data-v="${esc(p.expenseTitle)}">제목 복사</button><button class="btn sm" data-act="copy" data-v="${esc(p.ref || p.docNo)}">참조문서 복사</button>${p.amount ? `<button class="btn sm" data-act="copy" data-v="${esc(R.moneyKo(p.amount))}">금액(한글) 복사</button>` : ''}</div></div>`).join('') : `<div class="muted">${miss || !res ? none : '지출결의서가 필요한 문서가 없습니다.'}</div>`}
        <div class="acts" style="margin-top:8px"><button class="btn sm" data-act="openUrl" data-url="${esc(GW.links.route(GW.routes.expenseEntry))}" data-title="결의서입력 (예산집행)">${ic('ext')}결의서입력 화면 열기</button><button class="btn sm" data-act="openRec">${ic('play')}기록기로 지출결의 입력 기록·재생</button></div>
        <div class="muted" style="font-size:12px;margin-top:6px">지출결의서는 일반기안문이 아니라 지출 메뉴의 별도 양식입니다. 먼저 법인카드·계좌이체 내역을 입력하면 건의·품의 금액과 대조해 확인한 뒤, 값 복사와 기록기 재생으로 이어집니다(상신·결재는 하지 않습니다).</div>
      </div>`;
  }

  function payForm(baseId) {
    const base = patLoad().docs[baseId];
    if (!base) { toast('기준 건의를 찾지 못했습니다.'); return; }
    S.pay = {baseId};
    const refNo = (String((base.refs || [])[0] || '').match(/^(\S+?)\(/) || [])[1] || '';
    const plans = planDocs();
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(640px,95vw);padding:22px 24px" role="dialog" aria-label="지급 건의 작성">
      <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
      <h2 style="margin:0 0 4px;font-size:18px">지급 건의 작성</h2><div class="muted" style="margin-bottom:12px">틀: ${esc(base.title)} (${esc(base.docNo)})</div>
      <div class="kv" style="display:grid;grid-template-columns:90px minmax(0,1fr);gap:10px;align-items:center"><b>제목</b><input id="payTitle" class="cmd-inp" style="width:100%;min-width:0;box-sizing:border-box;background:transparent;color:inherit;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:14px" value="${esc(base.title)}">
      <b>금액(원)</b><input id="payAmt" class="cmd-inp" style="width:100%;min-width:0;box-sizing:border-box;background:transparent;color:inherit;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:14px" value="${R.proposalAmount(base) || ''}" inputmode="numeric">
      <b>근거 계획서</b><select id="payPlan" style="width:100%;min-width:0;box-sizing:border-box;background:var(--card);color:var(--fg);border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:14px">${plans.map(p => `<option value="${esc(p.id)}" ${p.docNo === refNo ? 'selected' : ''}>${esc(p.title)} (${esc(p.docNo)})</option>`).join('')}</select></div>
      <div class="muted" style="font-size:12.5px;margin-top:6px">제목은 “… 지급 건의”로 끝나야 합니다. 결제방법·예산과목·붙임은 틀 문서의 것을 그대로 이어받습니다.</div>
      <div class="acts" style="margin-top:14px;justify-content:flex-end"><button class="btn sm ghost" data-act="openPay">뒤로</button><button class="btn sm primary" data-act="payRun">작성 시작</button></div></div></div>`;
  }

  // 근거 계획서를 바꾸면 제목도 그 사업 이름으로 바꿔 준다(제목을 직접 고쳤으면 그대로 둔다)
  function payPlanChanged() {
    const base = S.pay && patLoad().docs[S.pay.baseId];
    const plan = patLoad().docs[($('#payPlan') || {}).value];
    const t = $('#payTitle');
    if (!base || !plan || !t) return;
    if (t.dataset.auto !== undefined ? t.value !== t.dataset.auto : t.value !== base.title) return;
    const bt = String(base.title);
    const suffix = (bt.match(/\s(\S*(?:비|료|금|예산|수당)(?:\([^)]*\))?)\s*지급\s*건의$/) || bt.match(/\s(\S+)\s*지급\s*건의$/) || [])[1] || '운영비';
    const name = String(plan.title).replace(/\s*(운영|참가)?\s*(예산\s*)?(변경)?\s*(\(\d차\))?\s*계획(\s*변경)?(\(안\)|\(변경\))?\s*$/, '').trim();
    t.value = `${name} ${suffix} 지급 건의`; t.dataset.auto = t.value;
  }
  async function payRun() {
    if (gated('draftPay')) return;
    const base = S.pay && patLoad().docs[S.pay.baseId];
    let title = ($('#payTitle') || {}).value?.trim() || '';
    const amount = R.parseWon(($('#payAmt') || {}).value);
    const plan = patLoad().docs[($('#payPlan') || {}).value];
    if (!base || !plan || !title) { toast('제목과 근거 계획서를 확인하세요.'); return; }
    if (!/지급\s*건의$/.test(title)) title += ' 지급 건의';
    if (!amount) { toast('금액을 입력하세요.'); return; }
    closeOverlay();
    let src = plan;
    if (!src.runday || !src.body) { const r = await readDocPattern({id: plan.id, ti: 'mg_20160303185413307', title: plan.title, form: plan.form, docNo: plan.docNo, date: plan.date}); if (!r.err) { patSaveDoc(r); src = r; } }
    const body = R.buildPaymentProposalBody(base.body || '', {ref: R.formatRunRef(src.runday) || plan.docNo, title, amount, planBody: src.body || ''});
    if (!body) { toast('틀 문서의 본문을 읽지 못했습니다. 다른 건의를 선택하세요.'); return; }
    const meta = R.predictDraftMeta(patModel(), {title, sourceDocNo: plan.docNo, sourceTitle: plan.title});
    const f = await openDraftFrame('mg_20160303185413307', '일반기안문', `지급 건의: ${title}`);
    if (!f) { toast('기안 열기를 취소했거나 화면이 준비되지 않았습니다. 기존 내용은 그대로 두었습니다.'); return; }
    const steps = await fillDraft(f, {title, meta, body, ref: {title: plan.title, docNo: plan.docNo}});
    showDraftReport(title, steps, [...body.notes, `금액 ${R.moneyKo(amount)}`, '결제방법(카드·계좌이체)은 틀 문서 값입니다. 맞는지 확인하세요.']);
  }

  // ---------- 물품매입 품의 (계획서를 참조문서로 지정) ----------
  function goodsPickPlan() {
    if (gated('draftGoods')) return;
    const plans = planDocs().slice(0, 14);
    S.paletteOpen = true; // Esc·바깥 클릭으로 닫히게
    const list = plans.length
      ? plans.map(p => `<div class="cmd-preset" role="button" tabindex="0" data-act="goodsRun" data-id="${esc(p.id)}"><b>${esc(p.title)}</b><div class="muted" style="font-size:12px">${esc(p.docNo)} · 기록물철 ${esc(p.binder)}</div></div>`).join('')
      : `<div class="empty"><div class="ill">${ic('doc')}</div><b>학습된 계획서가 없습니다</b>내 결재문서에서 계획서를 아직 읽지 못했습니다. 계획서 없이 작성하면 기록물철·참조문서는 직접 지정해야 합니다.</div>`;
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(700px,95vw);padding:22px 24px;max-height:86vh;overflow:auto" role="dialog" aria-label="물품매입 품의 계획서 선택">
      <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
      <h2 style="margin:0 0 4px;font-size:18px">어느 사업의 물품매입 품의인가요?</h2><div class="muted" style="margin-bottom:10px">선택한 계획서의 기록물철을 쓰고, 계획서를 참조문서로 지정합니다.</div>
      ${list}
      <div class="acts" style="margin-top:12px;justify-content:flex-end;border-top:1px solid var(--line);padding-top:10px"><button class="btn sm" data-act="goodsRun" data-id="">계획서 없이 작성</button><button class="btn sm ghost" data-act="closeHelp">닫기 (Esc)</button></div></div></div>`;
  }
  async function goodsRun(planId) {
    if (gated('draftGoods')) return;
    if (!planId) return goodsRunNoPlan();
    const plan = patLoad().docs[planId];
    if (!plan) { toast('선택한 계획서 정보를 찾지 못했습니다.'); return; }
    const base = String(plan.title).replace(/\s*(운영|참가)\s*계획(\(안\))?$/, '').trim();
    const title = ((await askText('물품매입 품의', '품의 제목 (확인·수정)', `${base} 운영물품 구입`)) || '').trim();
    if (!title) return;
    closeOverlay();
    const meta = R.predictDraftMeta(patModel(), {title, sourceDocNo: plan.docNo, sourceTitle: plan.title});
    const f = await openDraftFrame('mg_20160313172845987', '물품매입(수리제조)품의 및 요구서', `물품매입: ${title}`);
    if (!f) { toast('기안 열기를 취소했거나 화면이 준비되지 않았습니다. 기존 내용은 그대로 두었습니다.'); return; }
    const steps = await fillDraft(f, {title, meta, ref: {title: plan.title, docNo: plan.docNo}});
    showDraftReport(title, steps, ['물품 내역·금액은 양식의 표에 직접 입력하세요.']);
  }
  // 계획서 없이: 제목만 받아 양식을 열고 기본항목·결재선(·지난 문서로 추정한 기록물철)을 채운다. 참조문서는 사용자가 지정
  async function goodsRunNoPlan() {
    const title = ((await askText('물품매입 품의 (계획서 없이)', '품의 제목', '', '예) 2026년 OOO 운영물품 구입')) || '').trim();
    if (!title) return;
    closeOverlay();
    const meta = R.predictDraftMeta(patModel(), {title});
    const f = await openDraftFrame('mg_20160313172845987', '물품매입(수리제조)품의 및 요구서', `물품매입: ${title}`);
    if (!f) { toast('기안 열기를 취소했거나 화면이 준비되지 않았습니다. 기존 내용은 그대로 두었습니다.'); return; }
    const steps = await fillDraft(f, {title, meta});
    showDraftReport(title, steps, ['계획서 없이 작성했습니다. 참조문서는 직접 지정하고, 기록물철은 지난 문서로 추정한 값이니 확인하세요.', '물품 내역·금액은 양식의 표에 직접 입력하세요.']);
  }
  const startGoodsDraft = goodsPickPlan;

  // 메뉴/콘솔/버튼에서 부르는 진입점
  function autoStartDraft(type) {
    if (type === 'result') return openResultPlanPicker();
    if (type === 'plan') return startPlanDraft();
    if (type === 'pay' || type === 'budget') return openPaymentHub(); // 예산 집행·지급 품의는 지급 문서 화면에서 시작
    closeOverlay();
    return goodsPickPlan();
  }