// GW 통합 업무센터 · 지출 확인 (건의·품의 -> 실제 지출 내역을 먼저 묻고 대조한 뒤 지출결의서 준비)
// 지출결의서는 일반기안문이 아니라 지출 메뉴의 별도 양식이다. 그래서 내역(법인카드 승인, 계좌이체)을 먼저 입력받아
// 건의·품의 금액과 맞는지 확인하고, 확인이 끝난 값만 복사/기록기로 넘긴다. 계좌번호 전체는 저장하지 않는다(화면 메모리에만 둔다).
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const blankCard = () => ({date: '', merchant: '', amount: '', approval: ''});
  const blankTrans = () => ({payee: '', bank: '', account: '', amount: '', date: '', memo: ''});
  const expShell = body => `<div class="modal"><div class="dlg" data-stop="1" style="width:min(820px,96vw);padding:22px 24px;max-height:90vh;overflow:auto" role="dialog" aria-label="지출 내역 확인"><button class="btn icon ghost x" data-act="expClose" aria-label="닫기">${ic('x')}</button>${body}</div></div>`;
  const expWon = n => (n ? n.toLocaleString('en-US') + '원' : '0원');

  function expOpen(id) {
    if (gated('draftPay')) return;
    const p = R.pendingPayments(Object.values(patLoad().docs)).find(x => x.id === id);
    if (!p) { toast('대상 문서를 찾지 못했습니다. 지급 문서 화면을 다시 열어 주세요.'); return; }
    S.exp = {p, planned: p.amount || 0, cards: [blankCard()], transfers: [], res: null, stage: 'edit'};
    S.paletteOpen = true;
    expRender();
  }
  function expSync() {
    const e = S.exp, root_ = $('#expForm');
    if (!e || !root_) return;
    for (const inp of root_.querySelectorAll('[data-f]')) {
      const [kind, i, k] = inp.dataset.f.split('.');
      if (kind === 'planned') { e.planned = R.parseWon(inp.value); continue; }
      if (e[kind] && e[kind][+i]) e[kind][+i][k] = inp.value;
    }
  }
  const expField = (kind, i, k, label, val, ph = '', w = '') => `<label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted);${w}">${label}<input class="inp" data-f="${kind}.${i}.${k}" value="${esc(val)}" placeholder="${esc(ph)}" inputmode="${k === 'amount' || k === 'date' || k === 'account' ? 'numeric' : 'text'}" style="height:34px"></label>`;
  function expRender() {
    const e = S.exp;
    if (!e) return;
    const p = e.p;
    const cards = e.cards.map((r, i) => `<div class="box" style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">${expField('cards', i, 'date', '사용일', r.date, '20261105', 'width:110px')}${expField('cards', i, 'merchant', '가맹점(사용처)', r.merchant, '', 'flex:1;min-width:140px')}${expField('cards', i, 'amount', '금액(원)', r.amount, '120000', 'width:120px')}${expField('cards', i, 'approval', '승인번호', r.approval, '선택', 'width:110px')}<button class="btn sm danger ghost" data-act="expDel" data-kind="cards" data-i="${i}" aria-label="카드 내역 삭제">${ic('x')}</button></div>`).join('');
    const trans = e.transfers.map((r, i) => `<div class="box" style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">${expField('transfers', i, 'payee', '받는 사람·업체', r.payee, '', 'flex:1;min-width:130px')}${expField('transfers', i, 'bank', '은행', r.bank, '', 'width:90px')}${expField('transfers', i, 'account', '계좌번호', r.account, '', 'width:170px')}${expField('transfers', i, 'amount', '금액(원)', r.amount, '', 'width:120px')}${expField('transfers', i, 'date', '이체일', r.date, '20261106', 'width:110px')}${expField('transfers', i, 'memo', '적요', r.memo, '선택', 'flex:1;min-width:110px')}<button class="btn sm danger ghost" data-act="expDel" data-kind="transfers" data-i="${i}" aria-label="이체 내역 삭제">${ic('x')}</button></div>`).join('');
    let result = '';
    if (e.res) {
      const r = e.res;
      result = `<div class="box ${r.ok ? 'tip' : 'warn'}" style="margin-top:12px"><b>${r.ok ? '입력 내용이 건의·품의와 맞습니다' : '고쳐야 할 내용이 있습니다'}</b> <span class="muted">합계 ${expWon(r.total)} (카드 ${expWon(r.cardTotal)} · 이체 ${expWon(r.transTotal)})${r.planned ? ' / 건의·품의 ' + expWon(r.planned) : ''}</span>
        ${r.errors.map(x => `<div style="color:var(--hi)">✗ ${esc(x)}</div>`).join('')}${r.warns.map(x => `<div class="muted">! ${esc(x)}</div>`).join('')}
        ${r.ok ? `<div class="acts"><button class="btn primary" data-act="expGo">맞습니다. 이 내용으로 지출 준비</button></div><div class="muted" style="font-size:12px;margin-top:4px">이 단계에서는 그룹웨어에 아무것도 올리지 않습니다. 확인된 값을 복사하거나 기록기로 넘길 수 있게 정리만 합니다.</div>` : ''}</div>`;
    }
    $('#overlay').innerHTML = expShell(`<h2 style="margin:0 0 4px;font-size:18px">지출 내역 확인</h2>
      <div class="muted" style="margin-bottom:10px">${esc(p.kind)}: <b style="color:var(--fg)">${esc(p.title)}</b> (${esc(p.docNo)})<br>실제로 얼마를 어떻게 썼는지 먼저 입력하세요. 건의·품의 금액과 대조한 뒤에만 다음 단계로 갑니다.</div>
      <div id="expForm">
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:6px">건의·품의 금액(원) <input class="inp" data-f="planned.0.v" value="${e.planned || ''}" style="height:34px;width:150px" inputmode="numeric" placeholder="${p.amount ? '' : '문서에서 읽지 못함: 직접 입력'}">${e.planned ? `<span class="muted">${esc(R.moneyKo(e.planned))}</span>` : ''}</label>
      <h3 style="margin:14px 0 4px">법인카드 사용 내역</h3>${cards || '<div class="muted">없음</div>'}<button class="btn sm" data-act="expAdd" data-kind="cards">${ic('plus')}카드 내역 추가</button>
      <h3 style="margin:16px 0 4px">계좌이체 내역</h3>${trans || '<div class="muted">없음</div>'}<button class="btn sm" data-act="expAdd" data-kind="transfers">${ic('plus')}계좌이체 추가</button>
      </div>
      <div class="acts" style="margin-top:16px"><button class="btn primary" data-act="expCheck">내용 확인하기</button><button class="btn ghost" data-act="expClose">취소</button></div>${result}`);
  }
  function expCheck() {
    expSync();
    const e = S.exp;
    if (!e) return;
    e.res = R.checkPaymentEntry({cards: e.cards, transfers: e.transfers}, e.planned);
    expRender();
  }
  function expGo() {
    expSync();
    const e = S.exp;
    const res = R.checkPaymentEntry({cards: e.cards, transfers: e.transfers}, e.planned);
    if (!res.ok) { e.res = res; expRender(); return; }
    const p = e.p;
    const cardLines = res.cards.map(r => `${r.date.replace(/\D/g, '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')} ${r.merchant} ${expWon(R.parseWon(r.amount))}${r.approval ? ' (승인 ' + r.approval + ')' : ''}`);
    const transLines = res.trans.map(r => `${r.payee} ${r.bank} ${r.account} ${expWon(R.parseWon(r.amount))}${r.date ? ' ' + r.date : ''}${r.memo ? ' ' + r.memo : ''}`);
    // 저장하는 기록에는 계좌번호 전체를 남기지 않는다
    logActionRecord({command: `지출 내역 확인: ${p.expenseTitle}`, type: '지출', target: p.docNo, summary: `${p.kind} ${p.docNo}에 대해 카드 ${res.cards.length}건·이체 ${res.trans.length}건, 합계 ${expWon(res.total)}를 사용자가 확인했습니다.`,
      steps: [...res.cards.map(r => `카드 ${r.merchant} ${expWon(R.parseWon(r.amount))}`), ...res.trans.map(r => `이체 ${r.payee} ${r.bank} ${R.maskAccount(r.account)} ${expWon(R.parseWon(r.amount))}`)], verified: true});
    e.ready = {res, cardLines, transLines};
    const cp = (label, v) => v ? `<button class="btn sm" data-act="copy" data-v="${esc(v)}">${esc(label)} 복사</button>` : '';
    $('#overlay').innerHTML = expShell(`<h2 style="margin:0 0 4px;font-size:18px">지출결의서 준비 완료</h2>
      <div class="box tip"><b>${esc(p.expenseTitle)}</b><div class="muted" style="margin-top:4px">양식: ${esc(p.expenseForm)} · 참조문서: ${esc(p.ref || p.docNo)} · 기록물철: ${esc(p.binder)}</div>
      <div style="margin-top:6px">합계 <b>${expWon(res.total)}</b> (${esc(R.moneyKo(res.total))}) ${res.planned ? `· 건의·품의 ${expWon(res.planned)}${res.diff < 0 ? ` · 잔액 ${expWon(-res.diff)}` : ' · 일치'}` : ''}</div></div>
      <h3>복사해서 지출결의서에 붙여넣기</h3>
      <div class="acts" style="margin-top:0">${cp('제목', p.expenseTitle)}${cp('참조문서', p.ref || p.docNo)}${cp('금액(한글)', R.moneyKo(res.total))}${cp('카드 내역 전체', cardLines.join('\n'))}${cp('이체 내역 전체', transLines.join('\n'))}</div>
      ${cardLines.length ? `<h3>카드</h3>${cardLines.map(l => `<div class="trow"><span>${esc(l)}</span><button class="btn sm ghost" data-act="copy" data-v="${esc(l)}">복사</button></div>`).join('')}` : ''}
      ${transLines.length ? `<h3>계좌이체</h3>${transLines.map((l, ti) => `<div class="trow"><span>${esc(res.trans[ti].payee + ' ' + res.trans[ti].bank + ' ' + R.maskAccount(res.trans[ti].account) + ' ' + expWon(R.parseWon(res.trans[ti].amount)) + (res.trans[ti].date ? ' ' + res.trans[ti].date : '') + (res.trans[ti].memo ? ' ' + res.trans[ti].memo : ''))}</span><button class="btn sm ghost" data-act="copy" data-v="${esc(l)}">복사</button></div>`).join('')}` : ''}
      <div class="acts" style="margin-top:14px"><button class="btn primary" data-act="openUrl" data-url="${esc(GW.links.route(GW.routes.draft))}" data-title="결재작성">${ic('ext')}결재작성에서 지출결의서 열기</button><button class="btn" data-act="openRec">${ic('play')}기록기로 입력 기록·재생</button><button class="btn ghost" data-act="expClose">닫기</button></div>
      <div class="muted" style="font-size:12px;margin-top:8px">상신·결재는 하지 않습니다. 계좌번호는 화면에서만 가리고 복사에는 전체가 들어가며, 저장되는 기록에는 끝 4자리만 남습니다.</div>`);
  }
  function expAdd(kind) { expSync(); if (S.exp) { S.exp[kind].push(kind === 'cards' ? blankCard() : blankTrans()); S.exp.res = null; expRender(); } }
  function expDel(kind, i) { expSync(); if (S.exp && S.exp[kind]) { S.exp[kind].splice(i, 1); S.exp.res = null; expRender(); } }
  function expClose() { S.exp = null; closeOverlay(); }
