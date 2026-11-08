// GW 통합 업무센터 · 기안 패턴 학습 및 풀 자동 기입 엔진
// 사용자 본인의 지난 결재문서(제목·기록물철·기본항목·참조문서·본문 문단 서식)를 읽어 조직 서식 그대로 새 기안을 채운다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  // ---------- 학습 데이터 저장소 ----------
  const PAT_KEY = 'patterns';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const patLoad = () => { const p = store.get(PAT_KEY, null); return p && p.docs ? p : {v: 1, docs: {}}; };
  const patSaveDoc = doc => { try { const p = patLoad(); p.docs[doc.id] = {...doc, learnedAt: Date.now()}; p.at = Date.now(); store.set(PAT_KEY, p); } catch (e) { logError('patSaveDoc', e.message); } };
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
        const todo = sub.docs.filter(d => !HR_FORMS.test(d.tiKeyCode) && !have[d.docId]).slice(0, limit)
          .map(d => ({id: d.docId, ti: d.tiKeyCode, title: d.title, form: d.form, docNo: d.docNo, date: d.date}));
        if (!todo.length) return 0;
        if (!quiet) toast(`내 기안 패턴을 학습하는 중입니다 (${todo.length}건)…`);
        const t0 = Date.now();
        const worker = async () => {
          while (todo.length && Date.now() - t0 < budgetMs) {
            const r = await readDocPattern(todo.shift());
            if (!r.err) { patSaveDoc(r); done++; }
          }
        };
        await Promise.all(Array.from({length: conc}, worker));
      } catch (e) { logError('learnPatterns', e.message); }
      return done;
    })().finally(() => { learning = null; });
    return learning;
  }

  // ---------- 결과보고 대상(미작성 계획서) 선별 ----------
  async function getPendingPlansList() {
    await learnPatterns({limit: 12, budgetMs: 60000, quiet: true}).catch(() => {});
    const docs = Object.values(patLoad().docs).filter(d => d.binder && !/^접수문서/.test(d.binder) && /^일반기안문/.test(d.form || ''));
    const plans = docs.filter(d => /계획(\(안\)|\(변경\))?$/.test(String(d.title).trim()) && !/결과/.test(d.title));
    const reportedNos = new Set();
    const reportedCores = new Set();
    const core = t => R.patternTokens(R.planToResultTitle(t).replace(/\s*(운영|참가)?\s*결과보고.*$/, '')).join(' ');
    for (const d of docs) {
      if (!/결과보고/.test(d.title)) continue;
      for (const r of d.refs || []) { const m = String(r).match(/^(\S+?)\(/); if (m) reportedNos.add(m[1]); }
      reportedCores.add(core(d.title));
    }
    return plans
      .filter(p => !reportedNos.has(p.docNo) && !reportedCores.has(core(p.title)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
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
              <div class="muted">내가 기안한 계획서 중 결과보고가 아직 없는 문서입니다. 선택하면 그 계획서의 기록물철·본문·참조문서를 그대로 이어받습니다.</div>
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
    if (!pending.length) { el.innerHTML = `<div class="empty"><div class="ill">${ic('check')}</div><b>결과보고가 필요한 계획서가 없습니다</b>모든 계획서에 결과보고가 이미 있습니다.</div>`; return; }
    el.innerHTML = pending.map(p => `
      <div class="cmd-preset" role="button" tabindex="0" data-act="selectPlanForResult" data-id="${esc(p.id)}" style="display:flex;align-items:flex-start;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14.5px;color:var(--fg)">${esc(p.title)}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">${esc(p.docNo || '-')} · 시행 ${esc((p.runday || '').replace(/^.*\((.*)\)$/, '$1') || String(p.date || '').slice(0, 10))} · 기록물철 ${esc(p.binder || '-')}</div>
        </div>
        <button class="btn sm primary" style="flex:0 0 auto">결과보고 작성</button>
      </div>`).join('');
  }

  // ---------- 새 기안 창 열기 / 채우기 ----------
  async function openDraftFrame(formKey, formName, title) {
    openUrl(GW.links.draft(formKey, formName), {title});
    S.pane.expanded = true;
    renderPane();
    for (let i = 0; i < 40; i++) {
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
  const DENY_BTN = /^(결재\s*상신|결재상신|상신하기|상신|결재|임시저장|저장|보관|보내기|발송|전송|회수|삭제|기안|승인|반려|전결|대결)(\(\w\))?$/;
  const AUTO = {running: false, allow: false, blocked: []};
  function installGuard(win) {
    if (win.__wcGuard) return;
    win.__wcGuard = true;
    const block = e => {
      if (!AUTO.running || AUTO.allow) return;
      const b = e.target && e.target.closest && e.target.closest('button,a,[role=button],.topBtn,.OBTButton,input[type=button],input[type=submit]');
      const t = [b && b.innerText, b && b.value, b && b.getAttribute && b.getAttribute('aria-label'), b && b.title].map(x => String(x || '').replace(/\s+/g, '')).find(x => x && DENY_BTN.test(x)) || '';
      if (b && t) { e.stopImmediatePropagation(); e.preventDefault(); AUTO.blocked.push(t); }
    };
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick'].forEach(n => win.addEventListener(n, block, true));
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

  async function pickBinder(f, name) {
    const d = f.contentDocument;
    const inp = d.querySelector('input[placeholder*="기록물철"]');
    const btn = inp?.parentElement?.querySelector('button');
    if (!inp || !btn) return {ok: false, detail: '기록물철 입력칸을 찾지 못했습니다'};
    btn.click();
    await wait(900);
    const dlg = dlgOf(d);
    if (!dlg) return {ok: false, detail: '기록물철 선택창이 열리지 않았습니다'};
    const leaf = [...dlg.querySelectorAll('*')].find(el => el.children.length === 0 && (el.innerText || '').trim() === name);
    if (!leaf) { [...dlg.querySelectorAll('button')].find(b => /닫기|취소/.test(b.innerText))?.click(); return {ok: false, detail: `기록물철 “${name}”을(를) 목록에서 찾지 못했습니다`}; }
    leaf.dispatchEvent(new f.contentWindow.MouseEvent('dblclick', {bubbles: true}));
    await waitFor(() => !dlgOf(d), 3000);
    const val = (inp.value || '').trim();
    return {ok: val === name || val.replace(/\(\d+년\)$/, '') === name, detail: val || '(비어 있음)'};
  }

  // 내 결재라인 '기본'을 그대로 적용 (임의로 결재자를 고르지 않는다)
  async function applyMyApprovalLine(f) {
    const d = f.contentDocument;
    const lineBtn = [...d.querySelectorAll('.topBtn, button')].find(b => b.innerText.trim() === '결재라인지정');
    if (!lineBtn) return {ok: false, detail: '결재라인지정 버튼을 찾지 못했습니다'};
    lineBtn.click();
    await wait(1200);
    let dlg = dlgOf(d);
    if (!dlg) return {ok: false, detail: '결재라인 창이 열리지 않았습니다'};
    const tab = [...dlg.querySelectorAll('*')].find(el => el.children.length === 0 && (el.innerText || '').trim() === '내결재라인');
    if (tab) tab.click();
    await wait(700);
    const basic = [...dlg.querySelectorAll('*')].find(el => el.children.length === 0 && (el.innerText || '').trim() === '기본');
    if (!basic) return {ok: false, detail: '내결재라인에 “기본”이 없습니다'};
    basic.click();
    basic.dispatchEvent(new f.contentWindow.MouseEvent('dblclick', {bubbles: true}));
    await wait(700);
    const conf = await waitFor(() => allDlgs(d).find(x => x !== dlg && /결재자/.test(x.innerText || '')), 1500);
    if (conf) btnIn(conf, /^확인$/)?.click();
    await wait(500);
    btnIn(dlg, /^반영$/)?.click();
    const closed = !!(await waitFor(() => !dlgOf(d), 5000));
    if (!closed) allDlgs(d).forEach(x => btnIn(x, /^(취소|닫기)$/)?.click());
    return {ok: closed, detail: closed ? '내결재라인 “기본” 반영' : '결재라인 창을 닫지 못해 취소했습니다(직접 지정 필요)'};
  }

  // 참조문서: 계획서를 제목으로 검색해 선택한다 (합성 입력/마우스 이벤트)
  async function pickRefDoc(f, planTitle, docNo) {
    const d = f.contentDocument, w = f.contentWindow;
    const label = [...d.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.innerText || '').trim().startsWith('참조문서') && e.getBoundingClientRect().width > 0).pop();
    let scope = label, open = null;
    for (let i = 0; i < 4 && scope && !open; i++) { scope = scope.parentElement; open = scope && btnIn(scope, /^선택$/); }
    if (!open) return {ok: false, detail: '참조문서 선택 버튼을 찾지 못했습니다'};
    open.click();
    await wait(1800);
    const dlg = dlgOf(d);
    if (!dlg) return {ok: false, detail: '참조문서 창이 열리지 않았습니다'};
    const inp = [...dlg.querySelectorAll('input[type=text]')].find(i => { const r = i.getBoundingClientRect(); return r.top > 0 && r.width > 50; });
    const q = [...dlg.querySelectorAll('button')].find(b => { const r = b.getBoundingClientRect(); return r.top > 60 && r.top < 110 && r.width > 15; });
    const queries = [planTitle, planTitle.replace(/[『』「」]/g, ' ').trim().split(/\s+/).slice(-3).join(' ')];
    let found = 0;
    for (const qs of queries) {
      inp.focus(); setNative(w, inp, qs); q.click();
      await wait(3000);
      found = Number((dlg.innerText.match(/총(\d+)개/) || [])[1] || 0);
      if (found) break;
    }
    if (found !== 1) { btnIn(dlg, /취소/)?.click(); return {ok: false, detail: found ? `검색 결과가 ${found}건이라 자동 선택하지 않았습니다(직접 선택)` : '참조문서 검색 결과가 없습니다'}; }
    const cv = dlg.querySelectorAll('canvas')[0];
    const r = cv.getBoundingClientRect();
    const fire = (type, x, y) => cv.dispatchEvent(new w.MouseEvent(type, {bubbles: true, cancelable: true, clientX: x, clientY: y, view: w, button: 0, buttons: type === 'mouseup' ? 0 : 1}));
    const x = r.left + 55, y = r.top + 46;
    fire('mousemove', x, y); fire('mousedown', x, y); fire('mouseup', x, y); fire('click', x, y);
    await wait(500);
    const down = [...dlg.querySelectorAll('button')].find(b => { const q2 = b.getBoundingClientRect(); return q2.top > 380 && q2.top < 420 && q2.width > 20 && q2.width < 40; });
    down && down.click();
    await wait(800);
    if (!/선택된 문서 목록\s*\n?\s*[1-9]/.test(dlg.innerText)) { [...dlg.querySelectorAll('button')].find(b => /취소/.test(b.innerText))?.click(); return {ok: false, detail: '참조문서 행 선택에 실패했습니다'}; }
    [...dlg.querySelectorAll('button')].find(b => (b.innerText || '').trim() === '확인')?.click();
    await wait(1200);
    const txt = d.body.innerText;
    const ok = !dlgOf(d) && (!docNo || txt.slice(txt.lastIndexOf('참조문서')).includes(docNo));
    return {ok, detail: ok ? `${docNo || planTitle} 참조` : '참조문서가 반영되지 않았습니다'};
  }

  // 본문: 조직 서식 그대로 줄바꿈하고, 줄이 넘어갈 항목에는 96pt 내어쓰기(문단 모양)를 적용한다
  function putBody(f, body) {
    const d = f.contentDocument;
    const ctrl = d.querySelector('iframe[src*="hwpBuild"], #formCtrl_1')?.contentWindow?.HwpCtrl;
    if (!ctrl) return {ok: false, detail: '한글 에디터를 찾지 못했습니다'};
    ctrl.PutFieldText('_F_CONTENTS_', body.text);
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
    const typed = (t && t.value.trim() && t.value.trim() !== spec.title) || (body && !spec.body) || (f.contentWindow.__wcFilled && (t.value.trim() || body));
    if (typed && !confirm('이미 입력한 내용이 있습니다. 자동 기입으로 덮어쓸까요?')) return '사용자가 덮어쓰기를 취소했습니다.';
    return '';
  }
  async function fillDraft(f, spec) {
    const d = f.contentDocument, w = f.contentWindow;
    const steps = [];
    const bad0 = preflight(f, spec);
    if (bad0) return [{name: '사전점검', ok: false, detail: bad0}];
    installGuard(w); AUTO.running = true; AUTO.blocked = [];
    let halted = false;
    const run = async (name, fn) => {
      if (halted) { steps.push({name, ok: false, detail: '앞 단계의 팝업이 정리되지 않아 중단했습니다'}); return; }
      try { const r = await fn(); steps.push({name, ok: !!r.ok, detail: r.detail || ''}); } catch (e) { steps.push({name, ok: false, detail: e.message}); }
      if (allDlgs(d).length) { allDlgs(d).forEach(x => btnIn(x, /^(취소|닫기)$/)?.click()); await wait(500); if (allDlgs(d).length) halted = true; }
    };
    await run('제목', async () => {
      const inp = d.querySelector('input[placeholder="제목을 입력해주세요"]');
      setNative(w, inp, spec.title);
      await wait(300);
      try { d.querySelector('iframe[src*="hwpBuild"], #formCtrl_1').contentWindow.HwpCtrl.PutFieldText('doc_name', spec.title); } catch {}
      return {ok: inp.value === spec.title, detail: spec.title};
    });
    const m = spec.meta;
    await run('공개·긴급·보안·문서구분', async () => {
      const r = [setRadioByLabel(d, m.open), setRadioByLabel(d, m.urgent), setRadioByLabel(d, m.sec), setRadioByLabel(d, m.docKind)];
      return {ok: r.every(Boolean), detail: `${m.open} · ${m.urgent} · ${m.sec} · ${m.docKind}`};
    });
    if (m.binder) await run('기록물철', async () => { const r = await pickBinder(f, m.binder); return {ok: r.ok, detail: `${r.detail} — ${m.basis}`}; });
    await run('결재라인', () => applyMyApprovalLine(f));
    if (spec.body) await run('본문', async () => putBody(f, spec.body));
    if (spec.ref) await run('참조문서', () => pickRefDoc(f, spec.ref.title, spec.ref.docNo));
    AUTO.running = false;
    w.__wcFilled = Date.now();
    steps.push({name: '안전장치', ok: AUTO.blocked.length === 0, detail: AUTO.blocked.length ? `자동 실행 중 ${AUTO.blocked.join(', ')} 버튼 클릭을 차단했습니다(상신·저장은 하지 않았습니다)` : '상신·결재·임시저장·삭제는 실행하지 않았습니다(결재 직전에서 멈춤)'});
    return steps;
  }

  function showDraftReport(title, steps, notes = []) {
    const bad = steps.filter(s => !s.ok).length;
    logActionRecord({command: title, type: '기안', target: title, summary: bad ? `${steps.length - bad}/${steps.length}개 항목 자동 기입, ${bad}개는 직접 확인이 필요합니다.` : `${steps.length}개 항목을 지난 결재문서 패턴대로 모두 자동 기입했습니다.`, steps: steps.map(s => `${s.ok ? '✓' : '✗'} ${s.name}: ${s.detail}`), verified: !bad, details: notes.join(' / ')});
    $('#overlay').innerHTML = `
      <div class="modal" data-act="closeOverlay">
        <div class="dlg" data-stop="1" style="width:min(620px,94vw);padding:20px 24px;position:absolute;right:24px;bottom:24px;top:auto;left:auto;transform:none" role="dialog" aria-label="자동 기입 결과">
          <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
          <h2 style="margin:0 0 4px;font-size:17px">${bad ? '자동 기입 결과 (확인이 필요한 항목이 있습니다)' : '자동 기입 완료 · 결재 직전 상태'}</h2>
          <div class="muted" style="margin-bottom:10px">${esc(title)}</div>
          ${steps.map(s => `<div style="display:flex;gap:8px;padding:5px 0;border-top:1px solid var(--line)"><b style="color:${s.ok ? 'var(--ok)' : 'var(--hi)'};width:18px">${s.ok ? '✓' : '✗'}</b><div><b>${esc(s.name)}</b><div class="muted" style="font-size:12.5px">${esc(s.detail)}</div></div></div>`).join('')}
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
    let src = plan;
    if (!src.body || !src.runday) { const r = await readDocPattern({id: plan.id, ti: 'mg_20160303185413307', title: plan.title, form: plan.form, docNo: plan.docNo, date: plan.date}); if (!r.err) { patSaveDoc(r); src = r; } }
    const title = R.planToResultTitle(plan.title);
    const meta = R.predictDraftMeta(patModel(), {title, sourceDocNo: plan.docNo, sourceTitle: plan.title});
    const body = R.buildResultBody(src.body || '', {runday: src.runday, docNo: plan.docNo, planTitle: plan.title});
    const f = await openDraftFrame('mg_20160303185413307', '일반기안문', `결과보고: ${plan.title}`);
    if (!f) { toast('기안 화면을 열지 못했습니다. 잠시 후 다시 시도하세요.'); return; }
    const steps = await fillDraft(f, {title, meta, body, ref: {title: plan.title, docNo: plan.docNo}});
    const notes = [...body.notes.map(n => `${n}: 계획서 값을 그대로 두었습니다. 실제 결과로 고쳐 주세요.`), '붙임 파일명·개수와 소요예산 문구는 실제 결과에 맞게 확인하세요.'];
    showDraftReport(title, steps, notes);
  }

  // ---------- 운영/참가 계획서: 같은 사업의 과거 계획서 서식을 이어받아 뼈대 작성 ----------
  async function startPlanDraft() {
    if (gated('draftPlan')) return;
    const name = (prompt('계획서 사업명을 입력하세요.\n예) 2026년『OOO』 운영계획  /  2026년 OOO 참가계획') || '').trim();
    if (!name) return;
    const title = /계획(\(안\))?$/.test(name) ? name : `${name} 운영계획`;
    closeOverlay();
    const model = patModel();
    const meta = R.predictDraftMeta(model, {title});
    const sk = R.buildPlanSkeleton(model, {title});
    const f = await openDraftFrame('mg_20160303185413307', '일반기안문', `새 기안: ${title}`);
    if (!f) { toast('기안 화면을 열지 못했습니다.'); return; }
    const body = sk ? {text: sk.text, lines: sk.lines, hang: sk.lines.map(() => false)} : null;
    const steps = await fillDraft(f, {title, meta, body});
    showDraftReport(title, steps, sk ? [`본문 뼈대: 과거 계획서 “${sk.basis}”의 서식을 이어받았습니다. 항목 값은 직접 채워 주세요.`] : ['과거 계획서가 없어 본문은 비워 두었습니다.']);
  }

  // ---------- 지급 문서: 계획서 -> 지급 건의(일반기안문) -> 지출결의서 / 계획서 -> 물품매입품의서 -> 지출결의서 ----------
  const ownDocs = () => Object.values(patLoad().docs).filter(d => d.binder && !/^접수문서/.test(d.binder));
  const planDocs = () => ownDocs().filter(d => /계획(\(안\)|\(변경\))?$/.test(String(d.title).trim()) && !/결과/.test(d.title) && /^일반기안문/.test(d.form || '일반기안문')).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const won0 = n => (n ? n.toLocaleString('en-US') + '원' : '-');

  async function openPaymentHub() {
    if (gated('draftPay')) return;
    closeOverlay();
    S.paletteOpen = true;
    const shell = body => `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(760px,95vw);padding:22px 24px;max-height:88vh;overflow:auto" role="dialog" aria-label="지급 문서"><button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>${body}</div></div>`;
    $('#overlay').innerHTML = shell('<h2 style="margin:0 0 8px;font-size:18px">지급 문서</h2><div class="mi muted"><span class="spin"></span> 내 지급 문서를 분석하고 있습니다…</div>');
    await learnPatterns({limit: 12, budgetMs: 40000, quiet: true}).catch(() => {});
    const all = Object.values(patLoad().docs);
    const props = R.listProposals(all).slice(0, 8);
    const pend = R.pendingPayments(all);
    $('#overlay').innerHTML = shell(`
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div class="cmd-logo">${ic('doc')}</div><div><h2 style="margin:0;font-size:18px">지급 문서</h2><div class="muted">내가 해 온 순서: 계획서 → 지급 건의(또는 물품매입 품의) → 지출결의서. 앞 문서의 기록물철·기본항목을 이어받습니다.</div></div></div>
      <div class="sec"><div class="sh">① 지급 건의 새로 작성 <span class="muted">(지난 건의를 틀로 사용)</span></div>
        ${props.length ? props.map(p => `<div class="cmd-preset" role="button" tabindex="0" data-act="payPickBase" data-id="${esc(p.id)}" style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1;min-width:0"><b>${esc(p.title)}</b><div class="muted" style="font-size:12px">${esc(p.docNo)} · ${esc(won0(R.proposalAmount(p)))} · 기록물철 ${esc(p.binder)}</div></div><button class="btn sm primary">이 건의처럼 작성</button></div>`).join('') : '<div class="muted">학습된 지급 건의가 없습니다.</div>'}
      </div>
      <div class="sec"><div class="sh">② 물품매입 품의 새로 작성</div><div class="acts"><button class="btn primary" data-act="goodsPickPlan">${ic('plus')}계획서를 고르고 작성</button></div></div>
      <div class="sec"><div class="sh">③ 지출결의서를 올릴 차례인 문서 <span class="muted">(${pend.length}건)</span></div>
        ${pend.length ? pend.map(p => `<div class="box" style="margin:6px 0"><b>${esc(p.title)}</b> <span class="bdg tag">${esc(p.kind)}</span><div class="muted" style="font-size:12.5px;margin:3px 0">${esc(p.docNo)} 참조 · ${esc(p.expenseForm)} · 기록물철 ${esc(p.binder)}${p.amount ? ' · ' + esc(won0(p.amount)) : ''}</div><div class="acts"><button class="btn sm" data-act="copy" data-v="${esc(p.expenseTitle)}">제목 복사</button><button class="btn sm" data-act="copy" data-v="${esc(p.ref || p.docNo)}">참조문서 복사</button>${p.amount ? `<button class="btn sm" data-act="copy" data-v="${esc(R.moneyKo(p.amount))}">금액(한글) 복사</button>` : ''}</div></div>`).join('') : '<div class="muted">지출결의서가 필요한 문서가 없습니다.</div>'}
        <div class="acts" style="margin-top:8px"><button class="btn sm" data-act="openUrl" data-url="${esc(GW.links.route(GW.routes.draft))}" data-title="결재작성">${ic('ext')}지출결의서 양식 열기</button><button class="btn sm" data-act="openRec">${ic('play')}기록기로 지출결의 입력 기록·재생</button></div>
        <div class="muted" style="font-size:12px;margin-top:6px">지출결의서는 회계 전표와 연동된 양식이라 자동 입력 대신 값 복사와 기록기 재생을 사용합니다(상신·결재는 하지 않습니다).</div>
      </div>`);
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
      <b>근거 계획서</b><select id="payPlan" style="width:100%;min-width:0;box-sizing:border-box;background:transparent;color:inherit;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font-size:14px">${plans.map(p => `<option style="color:#111" value="${esc(p.id)}" ${p.docNo === refNo ? 'selected' : ''}>${esc(p.title)} (${esc(p.docNo)})</option>`).join('')}</select></div>
      <div class="muted" style="font-size:12.5px;margin-top:6px">제목은 “… 지급 건의”로 끝나야 합니다. 결제방법·예산과목·붙임은 틀 문서의 것을 그대로 이어받습니다.</div>
      <div class="acts" style="margin-top:14px;justify-content:flex-end"><button class="btn sm ghost" data-act="openPay">뒤로</button><button class="btn sm primary" data-act="payRun">작성 시작</button></div></div></div>`;
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
    if (!src.runday) { const r = await readDocPattern({id: plan.id, ti: 'mg_20160303185413307', title: plan.title, form: plan.form, docNo: plan.docNo, date: plan.date}); if (!r.err) { patSaveDoc(r); src = r; } }
    const body = R.buildPaymentProposalBody(base.body || '', {ref: R.formatRunRef(src.runday) || plan.docNo, title, amount});
    if (!body) { toast('틀 문서의 본문을 읽지 못했습니다. 다른 건의를 선택하세요.'); return; }
    const meta = R.predictDraftMeta(patModel(), {title, sourceDocNo: plan.docNo, sourceTitle: plan.title});
    const f = await openDraftFrame('mg_20160303185413307', '일반기안문', `지급 건의: ${title}`);
    if (!f) { toast('기안 화면을 열지 못했습니다.'); return; }
    const steps = await fillDraft(f, {title, meta, body, ref: {title: plan.title, docNo: plan.docNo}});
    showDraftReport(title, steps, [...body.notes, `금액 ${R.moneyKo(amount)}`, '예산과목·결제방법은 틀 문서와 같은지 확인하세요.']);
  }

  // ---------- 물품매입 품의 (계획서를 참조문서로 지정) ----------
  function goodsPickPlan() {
    if (gated('draftGoods')) return;
    const plans = planDocs().slice(0, 14);
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(700px,95vw);padding:22px 24px;max-height:86vh;overflow:auto" role="dialog" aria-label="물품매입 품의 계획서 선택">
      <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
      <h2 style="margin:0 0 4px;font-size:18px">어느 사업의 물품매입 품의인가요?</h2><div class="muted" style="margin-bottom:10px">선택한 계획서의 기록물철을 쓰고, 계획서를 참조문서로 지정합니다.</div>
      ${plans.map(p => `<div class="cmd-preset" role="button" tabindex="0" data-act="goodsRun" data-id="${esc(p.id)}"><b>${esc(p.title)}</b><div class="muted" style="font-size:12px">${esc(p.docNo)} · 기록물철 ${esc(p.binder)}</div></div>`).join('')}</div></div>`;
  }
  async function goodsRun(planId) {
    if (gated('draftGoods')) return;
    const plan = patLoad().docs[planId];
    if (!plan) return;
    const base = String(plan.title).replace(/\s*(운영|참가)\s*계획(\(안\))?$/, '').trim();
    const title = (prompt('물품매입 품의 제목을 확인·수정하세요.', `${base} 운영물품 구입`) || '').trim();
    if (!title) return;
    closeOverlay();
    const meta = R.predictDraftMeta(patModel(), {title, sourceDocNo: plan.docNo, sourceTitle: plan.title});
    const f = await openDraftFrame('mg_20160313172845987', '물품매입(수리제조)품의 및 요구서', `물품매입: ${title}`);
    if (!f) { toast('기안 화면을 열지 못했습니다.'); return; }
    const steps = await fillDraft(f, {title, meta, ref: {title: plan.title, docNo: plan.docNo}});
    showDraftReport(title, steps, ['물품 내역·금액은 양식의 표에 직접 입력하세요.']);
  }
  const startGoodsDraft = goodsPickPlan;

  // 메뉴/콘솔/버튼에서 부르는 진입점
  function autoStartDraft(type) {
    if (type === 'result') return openResultPlanPicker();
    if (type === 'plan') return startPlanDraft();
    if (type === 'pay') return openPaymentHub();
    closeOverlay();
    return goodsPickPlan();
  }
  function autoFillDraft(type) { return autoStartDraft(type === 'oneClick' ? 'result' : type); }