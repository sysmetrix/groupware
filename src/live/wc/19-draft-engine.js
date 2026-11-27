// GW 비서 · 기안 패턴 학습 및 풀 자동 기입 엔진
// 사용자 본인의 지난 결재문서(제목·기록물철·기본항목·참조문서·본문 문단 서식)를 읽어 조직 서식 그대로 새 기안을 채운다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  // ---------- 학습 데이터 저장소 ----------
  const PAT_KEY = 'patterns';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const patLoad = () => { const p = store.get(PAT_KEY, null); return p && p.docs ? p : {v: 1, docs: {}}; };
  const patSaveDoc = doc => { try { const p = patLoad(); const d = {...doc, body: doc.body ? String(doc.body).slice(0, 4000) : '', learnedAt: Date.now()}; p.docs[d.id] = d; p.at = Date.now(); if (!store.set(PAT_KEY, p)) S.storageError = true; } catch (e) { logError('patSaveDoc', e.message); } };
  const patModel = () => R.buildPatternModel(Object.values(patLoad().docs));
  const HR_FORMS = /^(36|40|43|1012|1021)$/;
  let learning = null;

  // 결재 완료 문서 한 건을 보이지 않는 창에서 열어 기본항목과 본문을 읽는다 (조회만, 저장·상신 없음)
  async function readDocPattern(it) {
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;left:-3000px;top:0;width:1300px;height:800px;opacity:0;pointer-events:none';
    fr.src = `${location.origin}/#popup?MicroModuleCode=ea&callComp=UCAP001&diKeyCode=${it.id}&tiKeyCode=${encodeURIComponent(it.ti || 'mg_20160303185413307')}`;
    document.body.appendChild(fr);
    const out = {id: it.id, docNo: it.docNo || '', title: it.title || '', form: it.form || '', date: it.date || '', at: Date.now()};
    try {
      let d, t0 = Date.now(), tab = null;
      while (Date.now() - t0 < 25000) {
        await wait(600);
        try { d = fr.contentDocument; } catch { continue; }
        if (!d || !d.body) continue;
        tab = [...d.querySelectorAll('*')].find(e => e.children.length <= 1 && (e.innerText || '').trim() === '기본항목');
        if (tab) break;
      }
      try { if (fr.contentWindow) installGuard(fr.contentWindow); } catch {}
      if (!tab) throw new Error('기본항목 탭을 찾지 못했습니다');
      tab.click();
      let txt = '';
      t0 = Date.now();
      while (Date.now() - t0 < 12000) { await wait(500); txt = d.body.innerText; if (/기록물철\t/.test(txt)) break; }
      const g = k => { const m = txt.match(new RegExp(k + '\\t([^\\n]*)')); return m ? m[1].trim() : ''; };
      out.binder = g('기록물철'); out.open = g('공개여부'); out.urgent = g('긴급여부'); out.sec = g('보안여부'); out.docKind = g('문서구분'); out.sender = g('발신인명');
      const refm = txt.slice(txt.lastIndexOf('참조문서')).match(/\S+-\d+\([^\n]*/g);
      out.refs = refm ? refm.slice(0, 3) : [];
      try {
        t0 = Date.now();
        while (Date.now() - t0 < 8000) {
          const ctrl = d.querySelector('iframe[src*="hwpBuild"], #formCtrl_1')?.contentWindow?.HwpCtrl;
          if (ctrl) { const s = String(ctrl.GetFieldText('_F_CONTENTS_') || ''); if (s.trim()) { out.body = s; out.runday = String(ctrl.GetFieldText('doc_runday') || ''); break; } }
          await wait(500);
        }
      } catch {}
    } catch (e) { out.err = e.message; }
    try { fr.src = 'about:blank'; } catch {}
    fr.remove();
    return out;
  }

  // 아직 학습하지 않은 내 결재문서를 읽어 패턴을 보강한다 (처음 1회는 시간이 걸리므로 백그라운드로 진행)
  async function learnPatterns({limit = 30, budgetMs = 100000, conc = 3, quiet = true} = {}) {
    if (learning) return learning;
    learning = (async () => {
      let done = 0;
      try {
        const sub = await GW.submittedRange({days: 365, size: 400});
        const have = patLoad().docs;
    const fresh = sub.docs.filter(d => !HR_FORMS.test(d.tiKeyCode) && !have[d.docId]);
    const todo = fresh.slice(0, limit)
      .map(d => ({id: d.docId, ti: d.tiKeyCode, title: d.title, form: d.form, docNo: d.docNo, date: d.date}));
    if (!todo.length) return {done: 0, errors: 0};
    if (!quiet) toast(`내 기안 패턴을 학습하는 중입니다 (${todo.length}건)…`);
    const t0 = Date.now();
    let errors = 0;
    const worker = async () => {
      while (todo.length && Date.now() - t0 < budgetMs) {
        const r = await readDocPattern(todo.shift());
        if (!r.err) { patSaveDoc(r); done++; } else errors++;
      }
    };
    await Promise.all(Array.from({length: conc}, worker));
    return {done, errors, left: fresh.length - done - errors};
  } catch (e) { logError('learnPatterns', e.message); return {done, errors: 1, errMsg: e.message}; }
  })().finally(() => { learning = null; });
  return learning;
  }

  // ---------- 결과보고 대상(미작성 계획서) 선별 ----------
  async function getPendingPlansList() {
    const lr = await learnPatterns({limit: 12, budgetMs: 60000, quiet: true}).catch(e => ({done: 0, errors: 1, errMsg: e.message}));
    const allDocs = Object.values(patLoad().docs);
    const docs = allDocs.filter(d => d.binder && !/^접수문서/.test(d.binder) && /^일반기안문/.test(d.form || ''));
    const plans = docs.filter(d => /계획(\(안\)|\(변경\))?$/.test(String(d.title).trim()) && !/결과/.test(d.title));
    const reportedNos = new Set();
    const reportedCores = new Set();
    const core = t => R.patternTokens(R.planToResultTitle(t).replace(/\s*(운영|참가)?\s*결과보고.*$/, '')).join(' ');
    for (const d of docs) {
      if (!/결과보고/.test(d.title)) continue;
      for (const r of d.refs || []) { const m = String(r).match(/^(\S+?)\(/); if (m) reportedNos.add(m[1]); }
      reportedCores.add(core(d.title));
    }
    const pending = plans
      .filter(p => !/변경\s*(\(\d+차\))?\s*계획|계획\s*\(변경\)|계획\s*변경/.test(p.title))
      .filter(p => !reportedNos.has(p.docNo))
      .map(p => ({...p, similarReport: !!core(p.title) && reportedCores.has(core(p.title))}))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    pending.learnedCount = allDocs.length;
    pending.learnErrors = (lr && lr.errors) || 0;
    return pending;
  }

  async function openResultPlanPicker() {
    if (gated('draftResult')) return;
    closeOverlay();
    S.paletteOpen = true;
    $('#overlay').innerHTML = `
      <div class="modal" data-act="closeOverlay">
        <div class="dlg" data-stop="1" style="width:min(720px,94vw);padding:22px 24px" role="dialog" aria-label="결과보고 대상 계획서 선택">
          <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
            <div class="cmd-logo">${ic('doc')}</div>
            <div>
              <h2 style="margin:0;font-size:18px">어떤 계획서의 결과보고를 작성할까요?</h2>
              <div class="muted">조회한 문서 중 결과보고의 참조 문서번호가 일치한 계획서는 제외했습니다. 미연결 보고서가 있을 수 있으니 작성 전에 확인하세요. 선택하면 그 계획서의 기록물철·본문·참조문서를 그대로 이어받습니다.</div>
            </div>
          </div>
          <div id="planPickerList" style="max-height:380px;overflow:auto;display:flex;flex-direction:column;gap:8px">
            <div class="mi muted"><span class="spin"></span> 내 결재문서를 분석하고 있습니다…</div>
          </div>
          <div class="acts" style="margin-top:16px;justify-content:flex-end;border-top:1px solid var(--line);padding-top:12px">
            <button class="btn sm ghost" data-act="closeHelp">닫기 (Esc)</button>
          </div>
        </div>
      </div>`;
    const pending = await getPendingPlansList();
    const el = $('#planPickerList');
    if (!el) return;
    if (!pending.length) { el.innerHTML = `<div class="empty"><div class="ill">${ic('check')}</div><b>미작성 계획서를 찾지 못했습니다</b>현재 학습한 ${pending.learnedCount || 0}건 기준입니다.${pending.learnErrors ? ` (일부 문서 ${pending.learnErrors}건은 읽지 못했습니다)` : ''}</div>`; return; }
    el.innerHTML = (pending.learnErrors ? `<p role="status">일부 문서를 조회하지 못했습니다. 결과보고 유무를 원문에서 확인하세요.</p>` : '') + pending.map(p => `
      <div class="cmd-preset" role="button" tabindex="0" data-act="selectPlanForResult" data-id="${esc(p.id)}" style="display:flex;align-items:flex-start;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14.5px;color:var(--fg)">${esc(p.title)}${p.similarReport ? ' · 유사한 결과보고 있음 (연결 확인 필요)' : ''}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">${esc(p.docNo || '-')} · 시행 ${esc((p.runday || '').replace(/^.*\((.*)\)$/, '$1') || String(p.date || '').slice(0, 10))} · 기록물철 ${esc(p.binder || '-')}</div>
        </div>
        <button class="btn sm primary" style="flex:0 0 auto">결과보고 작성</button>
      </div>`).join('');
  }

  // ---------- 새 기안 창 열기 / 채우기 ----------
  async function openDraftFrame(formKey, formName, title) {
    const url = GW.links.draft(formKey, formName);
    if (!openUrl(url, {title})) return null; // 사용자가 이동을 취소함(같은 화면이어도): 입력 중인 화면에 값을 넣지 않는다
    S.pane.expanded = true;
    renderPane();
    for (let i = 0; i < 40 && S.pane.url === url; i++) {
      await wait(500);
      const f = $('#frame iframe');
      let d = null; try { d = f && f.contentDocument; } catch {}
      if (d && d.querySelector('input[placeholder="제목을 입력해주세요"]') && d.querySelector('iframe[src*="hwpBuild"], #formCtrl_1')?.contentWindow?.HwpCtrl) { await wait(800); return f; }
    }
    return null;
  }
  const setNative = (w, el, v) => { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('input', {bubbles: true})); el.dispatchEvent(new w.Event('change', {bubbles: true})); };
  const dlgOf = d => [...d.querySelectorAll('.obtdialog.open, ._isDialog')].pop();
  const allDlgs = d => [...d.querySelectorAll('.obtdialog.open, ._isDialog')];
  const waitFor = async (pred, ms = 8000, step = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { let r; try { r = pred(); } catch {} if (r) return r; await wait(step); } return null; };
  // 자동 기입 중에는 상신·결재·임시저장·보내기·삭제 같은 비가역 버튼을 코드 레벨에서 막는다
  const DENY_BTN = /^(결재\s*상신|결재상신|상신하기|상신|결재|결재요청|승인요청|일괄결재|임시저장|저장|보관|보내기|발송|전송|회수|삭제|삭제하기|기안|승인|반려|전결|대결|접수|배부|제출|확정|신청완료|추가신청|신청취소|신청|등록)(\(\w\))?$/;
  const AUTO = {running: false, allow: false, blocked: []};
  function installGuard(win) {
    if (win.__wcGuard) return;
    win.__wcGuard = true;
    const block = e => {
      if (e.isTrusted || !AUTO.running || AUTO.allow) return; // 사람이 직접 누른 클릭은 막지 않는다(자동 동작만 차단)
      const b = e.target && e.target.closest && e.target.closest('button,a,[role=button],.topBtn,.OBTButton,input[type=button],input[type=submit]');
      const t = [b && b.innerText, b && b.value, b && b.getAttribute && b.getAttribute('aria-label'), b && b.title].map(x => String(x || '').replace(/\s+/g, '')).find(x => x && DENY_BTN.test(x)) || '';
      if (b && t) { e.stopImmediatePropagation(); e.preventDefault(); AUTO.blocked.push(t); }
    };
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick'].forEach(n => win.addEventListener(n, block, true));
    win.addEventListener('keydown', e => { if (!e.isTrusted && AUTO.running && !AUTO.allow && e.key === 'Enter') block(e); }, true);
    win.addEventListener('submit', e => { if (!e.isTrusted && AUTO.running && !AUTO.allow) { e.stopImmediatePropagation(); e.preventDefault(); AUTO.blocked.push('submit'); } }, true);
    const oc = win.HTMLElement.prototype.click;
    win.HTMLElement.prototype.click = function () { if (AUTO.running && !AUTO.allow && DENY_BTN.test((this.innerText || '').replace(/\s+/g, ''))) { AUTO.blocked.push((this.innerText || '').trim()); return; } return oc.call(this); };
  }
  const btnIn = (root, re) => [...root.querySelectorAll('button, [role=button]')].find(b => re.test((b.innerText || '').trim()));

  // 라디오는 value가 아니라 화면에 보이는 이름(공개/일반문서/내부결재...)으로 고른다
  function setRadioByLabel(d, label) {
    const hit = [...d.querySelectorAll('input[type="radio"]')].find(r => ((r.closest('label') || r.parentElement)?.innerText || '').trim() === label);
    if (!hit) return false;
    if (!hit.checked) hit.click();
    return hit.checked;
  }

  const guardStopped = () => ({ok: false, detail: '기안 화면 또는 계정이 변경되어 중단했습니다'});
  const guardLive = guard => !guard || guard();

  async function pickBinder(f, name, guard) {
    const d = f.contentDocument;
    const inp = d.querySelector('input[placeholder*="기록물철"]');
    const btn = inp?.parentElement?.querySelector('button');
    if (!inp || !btn) return {ok: false, detail: '기록물철 입력칸을 찾지 못했습니다'};
    if (!guardLive(guard)) return guardStopped();
    btn.click();
    await wait(900);
    if (!guardLive(guard)) return guardStopped();
    const dlg = dlgOf(d);
    if (!dlg) return {ok: false, detail: '기록물철 선택창이 열리지 않았습니다'};
    const leaf = [...dlg.querySelectorAll('*')].find(el => el.children.length === 0 && (el.innerText || '').trim() === name);
    if (!leaf) { if (!guardLive(guard)) return guardStopped(); [...dlg.querySelectorAll('button')].find(b => /닫기|취소/.test(b.innerText))?.click(); return {ok: false, detail: `기록물철 “${name}”${typeof R === 'object' && R && typeof R.cuJosa === 'function' ? R.cuJosa(String(name), '을를').slice(-1) : '을(를)'} 목록에서 찾지 못했습니다`}; }
    if (!guardLive(guard)) return guardStopped();
    leaf.dispatchEvent(new f.contentWindow.MouseEvent('dblclick', {bubbles: true}));
    await waitFor(() => !dlgOf(d), 3000);
    if (!guardLive(guard)) return guardStopped();
    const val = (inp.value || '').trim();
    return {ok: val === name || val.replace(/\(\d+년\)$/, '') === name, detail: val || '(비어 있음)'};
  }

  // 내 결재라인 '기본'을 그대로 적용 (임의로 결재자를 고르지 않는다)
  async function applyMyApprovalLine(f, guard) {
    const d = f.contentDocument;
    const lineBtn = [...d.querySelectorAll('.topBtn, button')].find(b => b.innerText.trim() === '결재라인지정');
    if (!lineBtn) return {ok: false, detail: '결재라인지정 버튼을 찾지 못했습니다'};
    if (!guardLive(guard)) return guardStopped();
    lineBtn.click();
    await wait(1200);
    if (!guardLive(guard)) return guardStopped();
    let dlg = dlgOf(d);
    if (!dlg) return {ok: false, detail: '결재라인 창이 열리지 않았습니다'};
    const tab = [...dlg.querySelectorAll('*')].find(el => el.children.length === 0 && (el.innerText || '').trim() === '내결재라인');
    if (tab) { if (!guardLive(guard)) return guardStopped(); tab.click(); }
    await wait(700);
    if (!guardLive(guard)) return guardStopped();
    const basic = [...dlg.querySelectorAll('*')].find(el => el.children.length === 0 && (el.innerText || '').trim() === '기본');
    if (!basic) return {ok: false, detail: '내결재라인에 “기본”이 없습니다'};
    if (!guardLive(guard)) return guardStopped();
    basic.click();
    if (!guardLive(guard)) return guardStopped();
    basic.dispatchEvent(new f.contentWindow.MouseEvent('dblclick', {bubbles: true}));
    await wait(700);
    if (!guardLive(guard)) return guardStopped();
    const conf = await waitFor(() => allDlgs(d).find(x => x !== dlg && /결재자/.test(x.innerText || '')), 1500);
    if (!guardLive(guard)) return guardStopped();
    if (conf) { if (!guardLive(guard)) return guardStopped(); btnIn(conf, /^확인$/)?.click(); }
    await wait(500);
    if (!guardLive(guard)) return guardStopped();
    btnIn(dlg, /^반영$/)?.click();
    const closed = !!(await waitFor(() => !dlgOf(d), 5000));
    if (!guardLive(guard)) return guardStopped();
    if (!closed) {
      for (const x of allDlgs(d)) {
        if (!guardLive(guard)) return guardStopped();
        btnIn(x, /^(취소|닫기)$/)?.click();
      }
    }
    // 결재자 이름은 화면에서 다시 읽어 대조하지 않으므로, 이름까지 맞다고 말하지 않는다
    // 결재란(본문 서식의 approver1~8 칸)에 실제로 들어간 직위를 다시 읽어 보여 준다
    const readSeq = () => { const out = []; try { const H = d.querySelector('iframe[src*="hwpBuild"], #formCtrl_1').contentWindow.HwpCtrl; for (let i = 1; i <= 8; i++) { const v = String(H.GetFieldText('approver' + i) || '').trim(); if (v) out.push(v); } } catch {} return out; };
    let seq = [];
    if (closed) {
      seq = (await waitFor(() => { if (!guardLive(guard)) return true; const s = readSeq(); return s.length ? s : null; }, 2000)) || [];
      if (!guardLive(guard)) return guardStopped();
      if (seq === true) seq = [];
    }
    if (closed && !seq.length) return {ok: false, detail: '결재선을 불러왔으나 결재란을 다시 읽지 못했습니다(화면에서 직접 확인 필요)'};
    return {ok: closed, detail: closed ? `기본 결재선 반영: ${seq.join(' → ')} (결재란 다시 읽음)` : '결재라인 창을 닫지 못해 취소했습니다(직접 지정 필요)'};
  }

  // 참조문서: 계획서를 제목으로 검색해 선택한다 (합성 입력/마우스 이벤트)
  async function pickRefDoc(f, planTitle, docNo, guard) {
    const d = f.contentDocument, w = f.contentWindow;
    const findOpen = () => {
      const label = [...d.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.textContent || '').trim().startsWith('참조문서') && e.getBoundingClientRect().width > 0).pop();
      let scope = label, btn = null;
      for (let i = 0; i < 5 && scope && !btn; i++) { scope = scope.parentElement; btn = scope && btnIn(scope, /^선택$/); }
      return btn;
    };
    const open = await waitFor(findOpen, 10000);
    if (!guardLive(guard)) return guardStopped();
    if (!open) return {ok: false, detail: '참조문서 선택 버튼을 찾지 못했습니다'};
    open.click();
    await wait(1800);
    if (!guardLive(guard)) return guardStopped();
    const dlg = dlgOf(d);
    if (!dlg) return {ok: false, detail: '참조문서 창이 열리지 않았습니다'};
    // 화면 크기와 무관하게 찾는다: '제목' 글자와 같은 줄의 입력칸, 그 오른쪽 돋보기 버튼, 목록 아래의 '↓(선택 목록에 담기)' 버튼
    const R0 = el => el.getBoundingClientRect();
    const mid = q => q.top + q.height / 2;
    const lab = [...dlg.querySelectorAll('*')].find(el => el.children.length === 0 && (el.textContent || '').trim() === '제목' && R0(el).width > 0);
    if (!lab) { if (!guardLive(guard)) return guardStopped(); btnIn(dlg, /취소/)?.click(); return {ok: false, detail: '참조문서 창에서 제목 칸을 찾지 못했습니다'}; }
    const lr = R0(lab);
    const inp = [...dlg.querySelectorAll('input[type=text]')].filter(i => { const q = R0(i); return q.width > 0 && Math.abs(mid(q) - mid(lr)) < 14 && q.left > lr.left; }).sort((a, b) => R0(a).left - R0(b).left)[0];
    const ir = inp && R0(inp);
    const q = inp && [...dlg.querySelectorAll('button')].filter(b => { const r2 = R0(b); return r2.width > 0 && r2.width < 40 && Math.abs(mid(r2) - mid(ir)) < 14 && r2.left >= ir.right - 2; }).sort((a, b) => R0(a).left - R0(b).left)[0];
    if (!inp || !q) { if (!guardLive(guard)) return guardStopped(); btnIn(dlg, /취소/)?.click(); return {ok: false, detail: '참조문서 검색칸·검색 버튼을 찾지 못했습니다(직접 선택)'}; }
    const widen = async yearsBack => {
      const pl = [...dlg.querySelectorAll('*')].find(el => el.children.length === 0 && (el.textContent || '').trim() === '기간' && R0(el).width > 0);
      if (!pl) return false;
      const pr = R0(pl);
      const di = [...dlg.querySelectorAll('input')].filter(i => { const q2 = R0(i); return q2.width > 0 && Math.abs(mid(q2) - mid(pr)) < 14 && q2.left > pr.left; }).sort((a, b) => R0(a).left - R0(b).left)[0];
      if (!di) return false;
      const y = new Date().getFullYear() - yearsBack;
      if (!guardLive(guard)) return false;
      di.focus(); di.select && di.select(); d.execCommand('insertText', false, `${y}0101`); await wait(150);
      if (!guardLive(guard)) return false;
      di.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true})); await wait(150);
      if (!guardLive(guard)) return false;
      di.blur(); await wait(300);
      return guardLive(guard);
    };
    await widen(0);
    if (!guardLive(guard)) return guardStopped();
    const queries = [planTitle, docNo, planTitle.replace(/[『』「」]/g, ' ').trim().split(/\s+/).slice(-3).join(' ')].filter(Boolean);
    let found = 0;
    for (const qs of queries) {
      if (!guardLive(guard)) return guardStopped();
      inp.focus(); setNative(w, inp, qs); q.click();
      await wait(3000);
      if (!guardLive(guard)) return guardStopped();
      found = Number((dlg.innerText.match(/총(\d+)개/) || [])[1] || 0);
      if (found === 1) break;
    }
    if (!found && await widen(1)) {
      if (!guardLive(guard)) return guardStopped();
      for (const qs of queries) {
        if (!guardLive(guard)) return guardStopped();
        inp.focus(); setNative(w, inp, qs); q.click(); await wait(3000);
        if (!guardLive(guard)) return guardStopped();
        found = Number((dlg.innerText.match(/총(\d+)개/) || [])[1] || 0); if (found === 1) break;
      }
    }
    if (found !== 1) { if (!guardLive(guard)) return guardStopped(); btnIn(dlg, /취소/)?.click(); return {ok: false, detail: found ? `검색 결과가 ${found}건이라 자동 선택하지 않았습니다(직접 선택)` : '참조문서 검색 결과가 없습니다'}; }
    const cvs = [...dlg.querySelectorAll('canvas')].filter(x => R0(x).width > 100).sort((a, b) => R0(a).top - R0(b).top);
    const cv = cvs[0], cr = cv && R0(cv), c2 = cvs[1] && R0(cvs[1]);
    if (!cv) { if (!guardLive(guard)) return guardStopped(); btnIn(dlg, /취소/)?.click(); return {ok: false, detail: '참조문서 목록을 찾지 못했습니다'}; }
    const fire = (type, x, y) => cv.dispatchEvent(new w.MouseEvent(type, {bubbles: true, cancelable: true, clientX: x, clientY: y, view: w, button: 0, buttons: type === 'mouseup' || type === 'click' ? 0 : 1}));
    const mover = [...dlg.querySelectorAll('button')].filter(b => { const r2 = R0(b); return r2.width >= 24 && r2.width <= 36 && r2.top > cr.bottom + 20 && (!c2 || r2.bottom < c2.top + 2); }).sort((a, b) => R0(a).top - R0(b).top || R0(a).left - R0(b).left)[0];
    let picked = false;
    for (const dy of [46, 40, 52, 34]) {
      if (!guardLive(guard)) return guardStopped();
      const x = cr.left + 55, y = cr.top + dy;
      fire('mousemove', x, y); fire('mousedown', x, y); fire('mouseup', x, y); fire('click', x, y);
      await wait(400);
      if (!guardLive(guard)) return guardStopped();
      if (mover) { if (!guardLive(guard)) return guardStopped(); mover.click(); }
      await wait(800);
      if (!guardLive(guard)) return guardStopped();
      const m = dlg.innerText.match(/선택된 문서 목록\s*\(?\s*(\d+)/);
      if (m && Number(m[1]) > 0) { picked = true; break; }
    }
    if (!picked) { if (!guardLive(guard)) return guardStopped(); [...dlg.querySelectorAll('button')].find(b => /취소/.test(b.innerText))?.click(); return {ok: false, detail: '참조문서 행 선택에 실패했습니다(직접 선택)'}; }
    if (!guardLive(guard)) return guardStopped();
    [...dlg.querySelectorAll('button')].find(b => (b.innerText || '').trim() === '확인')?.click();
    await wait(1200);
    if (!guardLive(guard)) return guardStopped();
    const txt = d.body.innerText;
    const ok = !dlgOf(d) && (!docNo || txt.slice(txt.lastIndexOf('참조문서')).includes(docNo));
    return {ok, detail: ok ? `${docNo || planTitle} 참조` : '참조문서가 반영되지 않았습니다'};
  }

  // 본문: 조직 서식 그대로 줄바꿈하고, 줄이 넘어갈 항목에는 96pt 내어쓰기(문단 모양)를 적용한다
  function putBody(f, body) {
    const d = f.contentDocument;
    const ctrl = d.querySelector('iframe[src*="hwpBuild"], #formCtrl_1')?.contentWindow?.HwpCtrl;
    if (!ctrl) return {ok: false, detail: '한글 에디터를 찾지 못했습니다'};
    // HwpCtrl drops bare LF on input. Its CRLF readback is compared as logical paragraphs.
    ctrl.PutFieldText('_F_CONTENTS_', String(body.text).replace(/\r\n?|\n/g, '\r\n'));
    ctrl.MoveToField('_F_CONTENTS_', true, true, true);
    const st = ctrl.GetPos();
    let shaped = 0;
    body.hang.forEach((h, i) => {
      if (!h) return;
      ctrl.SetPos(st.list, st.para + i, 0);
      const act = ctrl.CreateAction('ParagraphShape');
      const set = act.CreateSet();
      act.GetDefault(set);
      set.SetItem('LeftMargin', 0); set.SetItem('Indentation', -19200); set.SetItem('AlignType', 1);
      if (act.Execute(set)) shaped++;
    });
    ctrl.MoveToField('_F_CONTENTS_', true, true, true);
    let html = '';
    try { ctrl.Run('SelectAll'); html = String(ctrl.GetTextFile('HTML', 'saveblock') || ''); } finally { try { ctrl.Run('Cancel'); } catch {} }
    const hung = (html.match(/margin-left:96\.0pt;text-align:left;text-indent:-96\.0pt;/g) || []).length;
    const text = String(ctrl.GetFieldText('_F_CONTENTS_') || '').replace(/\r?\n/g, '\n');
    const same = text === body.text.replace(/\r?\n/g, '\n');
    try { ctrl.Run('ViewZoomFitWidth'); } catch {}
    try { ctrl.MoveToField('_F_CONTENTS_', true, true, true); ctrl.Run('MoveDocBegin'); } catch {}
    const want = body.hang.filter(Boolean).length;
    return {ok: same && hung === want, detail: `${body.lines.length}줄 기입${want ? ` · 내어쓰기 ${hung}/${want}` : ''}${same ? '' : ' · 본문 불일치'}`};
  }

  function preflight(f, spec) {
    const d = f.contentDocument;
    if (!d) return '기안 화면이 열려 있지 않습니다.';
    if (allDlgs(d).length) return '열려 있는 팝업이 있습니다. 먼저 닫은 뒤 다시 실행하세요.';
    const ctrl = d.querySelector('iframe[src*="hwpBuild"], #formCtrl_1')?.contentWindow?.HwpCtrl;
    if (!ctrl) return '한글 편집기가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.';
    const t = d.querySelector('input[placeholder="제목을 입력해주세요"]');
    let body = ''; try { body = String(ctrl.GetFieldText('_F_CONTENTS_') || '').trim(); } catch {}
    const want = String((spec.body && spec.body.text) || '').replace(/\r\n?/g, '\n').trim();
    // 본문이 이미 있으면 바꿔 넣을 본문이 있든 없든 묻는다(같은 본문을 다시 넣는 경우만 제외)
    const typed = (t && t.value.trim() && t.value.trim() !== spec.title) || (body && body.replace(/\r\n?/g, '\n') !== want) || (f.contentWindow.__wcFilled && (t?.value?.trim() || body));
    if (typed && !confirm('이미 입력한 내용이 있습니다. 자동 기입으로 덮어쓸까요?')) return '사용자가 덮어쓰기를 취소했습니다.';
    return '';
  }
  async function fillDraft(f, spec) {
    const d = f.contentDocument, w = f.contentWindow;
    const steps = [];
    const bad0 = preflight(f, spec);
    if (bad0) return [{name: '사전점검', keep: 1, ok: false, detail: bad0}];
    const owner = currentKey, paneUrl = S.pane.url;
    const m = spec.meta || {};
    const classification = ['open', 'urgent', 'sec', 'docKind', 'binder'].filter(k => typeof m[k] === 'string' && m[k].trim());
    const labels = {open: '공개여부', urgent: '긴급여부', sec: '보안여부', docKind: '문서구분', binder: '기록물철'};
    const confirmed = classification.length > 0 && confirm('다음 값은 과거 문서에서 추정한 값이며 현재 문서의 분류 근거가 아닙니다.\n각 값을 현재 문서에 적용해도 되는지 직접 확인해 주세요. 확인하지 않으면 기존 값을 유지합니다.\n' + classification.map(k => labels[k] + ': ' + m[k]).join('\n') + '\n이 값들을 확인하고 적용할까요?');
    const live = () => f.isConnected && f.contentDocument === d && f.contentWindow === w && owner === currentKey && owner === getUserKey() && paneUrl === S.pane.url;
    if (!live()) return [{name: '사전점검', keep: 1, ok: false, detail: '기안 화면 또는 계정이 변경되어 중단했습니다'}];
    installGuard(w); AUTO.running = true; AUTO.blocked = []; const tok = AUTO.tok = {};
    window.addEventListener('beforeunload', () => { AUTO.running = false; }, {once: true});
    setTimeout(() => { if (AUTO.tok === tok) AUTO.running = false; }, 180000); // 어떤 이유로든 3분 뒤에는 반드시 풀린다(사람이 직접 상신·저장할 수 있어야 함)
    let halted = false;
    const run = async (name, fn) => {
      if (halted) { steps.push({name, ok: false, detail: '앞 단계의 팝업이 정리되지 않아 중단했습니다'}); return; }
      if (!live()) { halted = true; steps.push({name, ok: false, detail: '기안 화면 또는 계정이 변경되어 중단했습니다'}); return; }
      // Mark before mutation: partial failures must not leave an unprotected draft.
      markPaneDirty(f, paneUrl);
      try { const r = await fn(live); steps.push({name, ok: !!r.ok, detail: r.detail || '', keep: r.keep}); } catch (e) { steps.push({name, ok: false, detail: e.message}); }
      if (!live()) { halted = true; return; }
      if (allDlgs(d).length) { allDlgs(d).forEach(x => btnIn(x, /^(취소|닫기)$/)?.click()); await wait(500); if (allDlgs(d).length) halted = true; }
    };
    try {
    await run('제목', async () => {
      const inp = d.querySelector('input[placeholder="제목을 입력해주세요"]');
      try { inp.focus(); } catch {}
      setNative(w, inp, spec.title);
      try { inp.blur(); inp.dispatchEvent(new w.FocusEvent('focusout', {bubbles: true})); } catch {}
      await wait(300);
      if (!live()) return {ok: false, detail: '계정 또는 기안 화면이 변경되어 중단했습니다'};
      let hwpTitle = ''; try { const ctrl = d.querySelector('iframe[src*="hwpBuild"], #formCtrl_1').contentWindow.HwpCtrl; ctrl.PutFieldText('doc_name', spec.title); for (let i = 0; i < 10; i++) { hwpTitle = String((await ctrl.GetFieldText('doc_name')) || '').trim(); if (hwpTitle === spec.title) break; await wait(300); } } catch {}
      const ok = inp.value === spec.title && hwpTitle === spec.title;
      return {ok, detail: ok ? '화면 제목과 한글 제목 일치' : '화면 제목 또는 한글 제목 불일치 · 직접 확인 필요'};
    });
    await run('공개·긴급·보안·문서구분', async () => {
      const keys = ['open', 'urgent', 'sec', 'docKind'];
      if (!confirmed) return {ok: true, keep: 1, detail: '그룹웨어 기본값 유지(이어받기 선택 안 함) · 공개·보안은 상신 전에 확인하세요.'};
      const ks = keys.filter(k => classification.includes(k));
      if (!ks.length) return {ok: true, keep: 1, detail: '그룹웨어 기본값 유지 · 공개·보안은 상신 전에 확인하세요.'};
      const r = keys.map(k => classification.includes(k) && setRadioByLabel(d, m[k]));
      return {ok: r.every(Boolean), detail: keys.map(k => m[k] || '확인 불가').join(' · ')};
    });
    if (m.binder && !confirmed) steps.push({name: '기록물철', ok: false, detail: '추정 기록물철을 적용하지 않았습니다. 직접 확인하세요.'});
    if (m.binder && confirmed) await run('기록물철', async guard => { const r = await pickBinder(f, m.binder, guard); return {ok: r.ok, detail: `${r.detail} — ${m.basis}`}; });
    await run('결재라인', guard => applyMyApprovalLine(f, guard));
    if (spec.body) await run('본문', async () => putBody(f, spec.body));
    if (spec.ref) await run('참조문서', guard => pickRefDoc(f, spec.ref.title, spec.ref.docNo, guard));
    } finally { if (AUTO.tok === tok) AUTO.running = false; }
    if (live()) w.__wcFilled = Date.now();
    steps.push({name: '안전장치', keep: 1, ok: AUTO.blocked.length === 0, detail: AUTO.blocked.length ? `자동 실행 중 ${AUTO.blocked.join(', ')} 버튼 클릭을 차단했습니다(상신·저장은 하지 않았습니다)` : '상신·결재·임시저장·삭제는 실행하지 않았습니다(상신 전에서 멈춤)'});
    return steps;
  }

  function showDraftReport(title, steps, notes = []) {
    if (typeof markPaneDirty === 'function') { const pf = $('#frame iframe'); if (pf) markPaneDirty(pf); }
    const bad = steps.filter(s => !s.ok).length, fill = steps.filter(s => !s.keep), got = fill.filter(s => s.ok).length;
    const bodyStep = steps.find(s => s.name === '본문');
    const bodyFilled = !!(bodyStep && bodyStep.ok); // 본문을 실제로 넣고 다시 읽어 일치한 경우만
    const frameOnly = '초안 틀만 입력했습니다. 본문 사실(일시·장소·인원·금액)은 직접 확인하세요.';
    if (!got) notes = []; // 넣은 값이 없으면 본문·틀을 이어받았다는 안내도 보이지 않는다
    const head = !got ? (fill.length ? '자동 기입을 확인하지 못했습니다' : '자동 기입하지 못했습니다') : bad ? '자동 기입 결과 (확인이 필요한 항목이 있습니다)' : bodyFilled ? '자동 기입 완료 · 상신 전 확인 단계' : '초안 틀만 입력했습니다';
    const summary = !got ? (fill.length ? '기안에 채운 칸을 확인하지 못했습니다. 화면을 확인하세요.' : '기안을 채우지 못했습니다.') : bad ? `${got}/${fill.length}개 항목 자동 기입, ${bad}개는 직접 확인이 필요합니다.` : bodyFilled ? `${got}개 항목을 지난 결재문서 패턴대로 기입하고 다시 읽어 확인했습니다.` : `${got}개 항목(본문 제외)을 기입했습니다. ${frameOnly}`;
    const rec = logActionRecord({command: title, type: '기안', target: title, summary, steps: steps.map(s => `${s.ok ? '✓' : '✗'} ${s.name}: ${s.detail}`), status: !got ? 'error' : bad ? 'partial' : 'success', verified: !bad, details: notes.join(' / ')});
    if (typeof overlayYield === 'function' && overlayYield(summary + (got && bad && !bodyFilled ? ' 본문은 직접 확인하세요.' : '') + ' 상신하지 않았습니다.', rec)) return;
    S.paletteOpen = true; // Esc·바깥 클릭으로 닫히게
    $('#overlay').innerHTML = `
      <div class="modal peek">
        <div class="dlg" data-stop="1" style="width:min(620px,94vw);padding:20px 24px;position:absolute;right:24px;bottom:24px;top:auto;left:auto;transform:none" role="dialog" aria-label="자동 기입 결과">
          <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
          <h2 style="margin:0 0 4px;font-size:17px">${esc(head)}</h2>
          <div class="muted" style="margin-bottom:10px">${esc(title)}<br>${esc(summary)}</div>
          ${steps.map(s => `<div style="display:flex;gap:8px;padding:5px 0;border-top:1px solid var(--line)"><b style="color:${s.ok ? 'var(--ok)' : 'var(--hi)'};width:18px">${s.ok ? '✓' : '✗'}</b><div><b>${esc(s.name)}</b><div class="muted" style="font-size:12.5px">${esc(s.detail)}</div></div></div>`).join('')}
          ${got && !bodyFilled ? `<div class="box warn" style="margin-top:10px"><b>${esc(frameOnly)}</b></div>` : ''}
          ${notes.length ? `<div class="box warn" style="margin-top:10px">${notes.map(esc).join('<br>')}</div>` : ''}
          <div class="acts" style="margin-top:12px;justify-content:flex-end"><button class="btn sm primary" data-act="closeHelp">확인하고 계속 작성</button></div>
        </div>
      </div>`;
  }


  // ---------- 결과보고: 계획서를 이어받아 작성 ----------
  async function startResultFromPlan(planDocId) {
    if (gated('draftResult')) return;
    closeOverlay();
    const plan = patLoad().docs[planDocId];
    if (!plan) { toast('선택한 계획서 정보를 찾지 못했습니다.'); return; }
    toast(`“${plan.title.slice(0, 24)}…” 결과보고를 준비하는 중…`);
    const owner = currentKey, ov = $('#overlay');
    S.paletteOpen = true;
    ov.innerHTML = '<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" role="dialog" aria-label="관련 자료 조회"><h2>관련 자료 조회</h2><p>선택한 계획서와 연결된 자료를 찾습니다.</p><button class="btn" data-act="closeHelp">취소</button></div></div>';
    const loading = ov.firstElementChild;
    const evidence = await resultEvidence(plan).catch(() => ({scope:'관련 자료 조회 실패. 직접 확인한 실적만 입력하세요.',sources:[],suggestions:[]}));
    if (owner !== currentKey || owner !== getUserKey() || ov.firstElementChild !== loading) return;
    const templates = Object.values(patLoad().docs).filter(x => x.body && /결과보고/.test(x.title) && x.id !== plan.id);
    const kindOf = t => /참가/.test(t || '') ? '참가' : /운영/.test(t || '') ? '운영' : '';
    templates.sort((a,b) => Number(kindOf(b.title) === kindOf(plan.title)) - Number(kindOf(a.title) === kindOf(plan.title)) || Number(b.binder === plan.binder) - Number(a.binder === plan.binder) || String(b.date).localeCompare(String(a.date)));
    const reviewed = await reviewResultDraft(plan,evidence,templates[0]);
    if (!reviewed || owner !== currentKey || owner !== getUserKey()) return;
    const {title,body} = reviewed;
    const meta = reviewed.useMeta ? R.predictDraftMeta(patModel(), {title, sourceDocNo: plan.docNo, sourceTitle: plan.title}) : {};
    if (plan.binder && !/^접수문서/.test(plan.binder)) { meta.binder = plan.binder; meta.basis = `계획서(${plan.docNo || '선택한 계획서'})와 같은 기록물철`; }
    const f = await openDraftFrame('mg_20160303185413307', '일반기안문', `결과보고: ${plan.title}`);
    if (!f) { toast('기안 열기를 취소했거나 화면이 아직 준비되지 않았습니다. 기존 내용은 그대로 두었습니다.'); return; }
    const steps = await fillDraft(f, {title, meta, body, ref: {title: plan.title, docNo: plan.docNo}});
    const notes = [...body.notes, '붙임 파일명·개수와 소요예산 문구는 실제 결과에 맞게 확인하세요.'];
    showDraftReport(title, steps, notes);
  }

  // ---------- 운영/참가 계획서: 같은 사업의 과거 계획서 서식을 이어받아 뼈대 작성 ----------
  async function startPlanDraft() {
    if (gated('draftPlan')) return;
    const name = ((await askText('운영·참가계획 작성', '계획서 제목(사업명)', '', '예) 2026년『OOO』 운영계획  /  2026년 OOO 참가계획')) || '').trim();
    if (!name) return;
    const title = /계획(\(안\))?$/.test(name) ? name : `${name} 운영계획`;
    closeOverlay();
    const model = patModel();
    const meta = R.predictDraftMeta(model, {title});
    const sk = R.buildPlanSkeleton(model, {title});
    const f = await openDraftFrame('mg_20160303185413307', '일반기안문', `새 기안: ${title}`);
    if (!f) { toast('기안 열기를 취소했거나 화면이 준비되지 않았습니다. 기존 내용은 그대로 두었습니다.'); return; }
    const body = sk ? {text: sk.text, lines: sk.lines, hang: sk.lines.map(() => false)} : null;
    const steps = await fillDraft(f, {title, meta, body});
    showDraftReport(title, steps, sk ? [`본문 뼈대: 과거 계획서 “${sk.basis}”의 서식을 이어받았습니다. 항목 값은 직접 채워 주세요.`, sk.refCopied ? '1번 관련 문서번호는 그 계획서의 근거를 그대로 가져왔습니다. 이번 사업에 맞는지 확인하세요.' : '1번 관련 문서번호는 비워 두었습니다. 근거 문서를 적어 주세요.', ...(meta.confidence === 'similar' ? ['기록물철은 제목이 비슷한 과거 문서를 보고 골랐습니다. 맞는지 확인하세요.'] : [])] : ['과거 계획서가 없어 본문은 비워 두었습니다.']);
  }
