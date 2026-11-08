// GW 통합 업무센터 · 그룹웨어 기록기 (동작 기록 · 변수화 · 재생)
// 처리 창(#frame)에 열린 그룹웨어 화면에서 클릭·입력·선택을 기록해 두었다가 같은 순서로 재생한다.
// 비밀번호 입력은 기록하지 않고, 상신·결재·발송·삭제 같은 비가역 버튼은 재생 때마다 사용자 확인을 받는다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  // ---------- 기록/재생 엔진 (의존성 없음) ----------
  const REC_DANGER = /^(결재\s*상신|결재상신|상신하기|상신|결재|임시저장|저장|보관|보내기|발송|회수|삭제|승인|반려|전결|대결|전송|폐기|기안)(\(\w\))?$/;
  const REC_TYPES = new Set(['click', 'dblclick', 'type', 'select', 'check', 'key', 'canvasClick', 'confirm', 'assert', 'waitFor']);
  // 클릭 대상(버튼) 이름을 글자, 값, aria-label, title 어디서든 찾아 위험 여부를 판단한다.
  const recDanger = el => { const b = (el.closest && el.closest('button,a,[role=button],.OBTButton,input[type=button],input[type=submit]')) || el; return [b.innerText, b.value, b.getAttribute && b.getAttribute('aria-label'), b.title].map(x => rNorm(x).replace(/\s+/g, '')).find(x => x && REC_DANGER.test(x)) || ''; };
  const REC_DATA_ATTRS = ['data-testid', 'data-id', 'data-code', 'data-name', 'name'];
  const rNorm = s => (s || '').replace(/\s+/g, ' ').trim();
  const rVisible = el => !!(el && el.isConnected && el.getClientRects().length > 0);

  function recFrames(rootDoc) {
    const list = [{doc: rootDoc, path: []}];
    const walk = (doc, path) => {
      [...doc.querySelectorAll('iframe')].forEach((ifr, idx) => {
        try { const sub = ifr.contentDocument; if (sub) { const np = [...path, idx]; list.push({doc: sub, path: np}); walk(sub, np); } } catch {}
      });
    };
    walk(rootDoc, []);
    return list;
  }
  function recFrameDoc(rootDoc, framePath = []) {
    let cur = rootDoc;
    for (const idx of framePath) { const ifr = cur.querySelectorAll('iframe')[idx]; if (!ifr || !ifr.contentDocument) return null; cur = ifr.contentDocument; }
    return cur;
  }
  function recQuery(doc, cand) {
    const tag = cand.tag || '*';
    let list = [];
    try {
      if (cand.by === 'data' || cand.by === 'css') list = [...doc.querySelectorAll(cand.value)];
      else if (cand.by === 'aria') list = [...doc.querySelectorAll(`${tag}[aria-label=${JSON.stringify(cand.value)}]`)];
      else if (cand.by === 'placeholder') list = [...doc.querySelectorAll(`${tag}[placeholder=${JSON.stringify(cand.value)}]`)];
      else if (cand.by === 'label') {
        for (const lb of [...doc.querySelectorAll('label, .obt-label, th, .form-label')].filter(l => rNorm(l.textContent) === cand.value)) {
          const forId = lb.getAttribute('for'); const t = forId && doc.getElementById(forId); if (t) list.push(t);
          const scope = lb.closest('tr, .obt-field, .form-group, div') || lb.parentElement; if (scope) list.push(...scope.querySelectorAll(tag));
        }
      } else if (cand.by === 'text') list = [...doc.querySelectorAll(tag)].filter(el => el.children.length <= 3 && rNorm(el.innerText || el.textContent) === cand.value);
    } catch { return null; }
    const vis = list.filter(rVisible);
    const pool = vis.length ? vis : list;
    return pool[cand.nth ?? 0] || pool[0] || null;
  }
  function recSelectors(el) {
    const doc = el.ownerDocument, tag = el.tagName.toLowerCase(), raw = [];
    for (const a of REC_DATA_ATTRS) { const v = el.getAttribute(a); if (v) raw.push({by: 'data', value: `${tag}[${a}=${JSON.stringify(v)}]`, tag}); }
    const aria = rNorm(el.getAttribute('aria-label')); if (aria) raw.push({by: 'aria', value: aria, tag});
    const ph = rNorm(el.getAttribute('placeholder')); if (ph) raw.push({by: 'placeholder', value: ph, tag});
    const row = el.closest('tr, .obt-field, .form-group');
    const lb = (el.id && doc.querySelector(`label[for=${JSON.stringify(el.id)}]`)) || (row && row.querySelector('label, .obt-label, th, .form-label'));
    const lbTxt = lb ? rNorm(lb.textContent) : '';
    if (lbTxt && lbTxt.length <= 25) raw.push({by: 'label', value: lbTxt, tag});
    const txt = rNorm(el.innerText || el.textContent);
    if (txt && txt.length <= 40 && el.children.length <= 3 && !['input', 'textarea', 'select'].includes(tag)) raw.push({by: 'text', value: txt, tag});
    const parts = []; let cur = el;
    while (cur && cur.nodeType === 1 && cur !== doc.body && parts.length < 4) {
      const t = cur.tagName.toLowerCase();
      const cls = [...cur.classList].filter(c => /^(obt|OBT|realgrid|dialog|btn|modal|grid|lnb)/.test(c)).slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
      const sibs = cur.parentElement ? [...cur.parentElement.children].filter(x => x.tagName === cur.tagName) : [];
      parts.unshift(`${t}${cls}${sibs.length > 1 ? `:nth-of-type(${sibs.indexOf(cur) + 1})` : ''}`);
      if (cur.classList.contains('obtdialog') || cur.id) break;
      cur = cur.parentElement;
    }
    if (parts.length) raw.push({by: 'css', value: parts.join(' > '), tag});
    return raw.map(c => {
      const all = c.by === 'text' ? [...doc.querySelectorAll(tag)].filter(x => x.children.length <= 3 && rNorm(x.innerText || x.textContent) === c.value)
        : (c.by === 'data' || c.by === 'css') ? (() => { try { return [...doc.querySelectorAll(c.value)]; } catch { return []; } })() : [recQuery(doc, {...c, nth: 0})].filter(Boolean);
      const vis = all.filter(rVisible);
      const idx = (vis.length ? vis : all).indexOf(el);
      return {...c, nth: idx >= 0 ? idx : 0};
    });
  }
  function recSetValue(el, val) {
    const win = el.ownerDocument.defaultView;
    if (el.isContentEditable) { el.focus(); el.textContent = val; el.dispatchEvent(new win.InputEvent('input', {bubbles: true, data: val})); el.dispatchEvent(new win.Event('change', {bubbles: true})); return; }
    const proto = el instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : el instanceof win.HTMLSelectElement ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, val); else el.value = val;
    el.dispatchEvent(new win.InputEvent('input', {bubbles: true, cancelable: true, data: String(val)}));
    el.dispatchEvent(new win.Event('change', {bubbles: true, cancelable: true}));
  }
  function recMouse(el, x, y, dbl = false) {
    const win = el.ownerDocument.defaultView;
    for (const type of dbl ? ['mousedown', 'mouseup', 'click', 'mousedown', 'mouseup', 'click', 'dblclick'] : ['mousedown', 'mouseup', 'click'])
      el.dispatchEvent(new win.MouseEvent(type, {view: win, bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, detail: type === 'dblclick' ? 2 : 1}));
  }

  function createRecorder({getRootDocs, onStep}) {
    let active = false, steps = [], cleanups = [], typeTimer = null, pendingType = null;
    const attached = new WeakSet();
    const sensitive = el => { if (!el || el.nodeType !== 1) return false; const t = (el.getAttribute('type') || '').toLowerCase(), a = (el.getAttribute('autocomplete') || '').toLowerCase(); return t === 'password' || a.includes('password'); };
    const flush = () => { if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; } if (pendingType) { steps.push(pendingType); onStep(pendingType); pendingType = null; } };
    const push = s => { flush(); const step = {id: `s${steps.length + 1}`, ...s}; steps.push(step); onStep(step); };
    const bind = (doc, path) => {
      if (!doc || attached.has(doc)) return;
      attached.add(doc);
      const win = doc.defaultView;
      const onClick = e => {
        if (!active) return;
        if (e.type === 'click' && e.detail > 1) return; // 더블클릭은 dblclick 한 번만 기록
        const t = e.target;
        if (!(t instanceof win.Element) || sensitive(t)) return;
        const canvas = t.closest('canvas');
        if (canvas) { const r = canvas.getBoundingClientRect(); if (r.width > 0 && r.height > 0) { push({type: 'canvasClick', frame: path, selectors: recSelectors(canvas), rx: +((e.clientX - r.left) / r.width).toFixed(4), ry: +((e.clientY - r.top) / r.height).toFixed(4), dbl: e.type === 'dblclick'}); return; } }
        const a = t.closest('button, a, .OBTButton, [role="button"], [role="tab"], [role="menuitem"], input[type="button"], input[type="submit"], label') || t;
        const tag = a.tagName.toLowerCase();
        if (['input', 'textarea', 'select'].includes(tag) && !['button', 'submit', 'checkbox', 'radio'].includes((a.type || '').toLowerCase())) return;
        if (tag === 'input' && ['checkbox', 'radio'].includes((a.type || '').toLowerCase())) return; // change에서 기록
        const label = rNorm(a.innerText || a.value || a.getAttribute('aria-label'));
        const base = {type: e.type === 'dblclick' ? 'dblclick' : 'click', frame: path, selectors: recSelectors(a), label: label.slice(0, 40)};
        if (REC_DANGER.test(label)) push({type: 'confirm', frame: path, message: `비가역 버튼(“${label}”) 실행 전 확인이 필요합니다.`, nextAction: base}); else push(base);
      };
      const onInput = e => {
        if (!active) return;
        const el = e.target;
        if (!el || sensitive(el)) return;
        const tag = (el.tagName || '').toLowerCase(), ty = (el.type || '').toLowerCase();
        if (ty === 'checkbox' || ty === 'radio' || tag === 'select') return;
        const val = el.isContentEditable ? el.textContent : el.value;
        const sel = recSelectors(el);
        if (pendingType && JSON.stringify(pendingType.frame) === JSON.stringify(path) && pendingType.selectors[0]?.value === sel[0]?.value) pendingType.value = val;
        else { flush(); pendingType = {id: `s${steps.length + 1}`, type: 'type', frame: path, selectors: sel, value: val}; }
        clearTimeout(typeTimer); typeTimer = setTimeout(flush, 450);
      };
      const onChange = e => {
        if (!active) return;
        const el = e.target;
        if (!el || sensitive(el)) return;
        const tag = (el.tagName || '').toLowerCase(), ty = (el.type || '').toLowerCase();
        if (ty === 'checkbox' || ty === 'radio') push({type: 'check', frame: path, selectors: recSelectors(el), checked: !!el.checked, label: rNorm((el.closest('label') || el.parentElement)?.innerText).slice(0, 30)});
        else if (tag === 'select') push({type: 'select', frame: path, selectors: recSelectors(el), value: el.value});
      };
      const onKey = e => { if (!active || sensitive(e.target)) return; if (['Enter', 'Escape'].includes(e.key)) push({type: 'key', frame: path, selectors: recSelectors(e.target), key: e.key, ctrlKey: e.ctrlKey}); };
      doc.addEventListener('click', onClick, true); doc.addEventListener('dblclick', onClick, true);
      doc.addEventListener('input', onInput, true); doc.addEventListener('change', onChange, true); doc.addEventListener('keydown', onKey, true);
      const rescan = () => { for (const root of getRootDocs()) for (const f of recFrames(root)) bind(f.doc, f.path); };
      doc.querySelectorAll('iframe').forEach(ifr => ifr.addEventListener('load', rescan));
      const mo = new win.MutationObserver(rescan);
      if (doc.documentElement) mo.observe(doc.documentElement, {childList: true, subtree: true});
      cleanups.push(() => { doc.removeEventListener('click', onClick, true); doc.removeEventListener('dblclick', onClick, true); doc.removeEventListener('input', onInput, true); doc.removeEventListener('change', onChange, true); doc.removeEventListener('keydown', onKey, true); mo.disconnect(); });
    };
    const rescanAll = () => { for (const root of getRootDocs()) for (const f of recFrames(root)) bind(f.doc, f.path); };
    return {
      start() { active = true; steps = []; rescanAll(); },
      rescan: rescanAll,
      stop() { active = false; flush(); cleanups.forEach(fn => fn()); cleanups = []; return [...steps]; },
      count: () => steps.length + (pendingType ? 1 : 0),
    };
  }

  function createPlayer({getRootDocs, onProgress, beforeStep}) {
    let aborted = false;
    const interp = (str, v) => String(str ?? '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => v[k.trim()] ?? '');
    const waitTarget = async (framePath, selectors, timeoutMs = 8000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (aborted) throw new Error('재생 중단됨');
        const doc = recFrameDoc(getRootDocs()[0], framePath);
        if (doc) for (const c of selectors || []) { const el = recQuery(doc, c); if (rVisible(el)) return {el, used: c}; }
        await wait(150);
      }
      throw new Error(`요소를 찾지 못했습니다: ${JSON.stringify((selectors || [])[0])}`);
    };
    const exec = async (step, vars, confirmed) => {
      if (step.type === 'confirm') {
        // 확인 문구는 파일 안의 글이 아니라 실행 시점의 실제 대상 버튼 이름으로 만든다(가져온 기록의 문구 위조 방지)
        const na = step.nextAction;
        if (!na) return '확인함';
        const tgt = await waitTarget(na.frame, na.selectors, na.timeoutMs || 8000);
        const nm = recDanger(tgt.el) || rNorm(tgt.el.innerText || tgt.el.value || tgt.el.getAttribute('aria-label')) || '(이름 없는 버튼)';
        if (!window.confirm(`비가역 버튼(“${nm}”)을 누릅니다. 진행할까요?`)) throw new Error('사용자가 비가역 동작을 거부하여 안전 중단');
        return exec(na, vars, true);
      }
      const {el, used} = await waitTarget(step.frame, step.selectors, step.timeoutMs || 8000);
      const dl = step.type === 'assert' || step.type === 'waitFor' ? '' : recDanger(el);
      if (step.type === 'key' && (step.key === 'Enter' || step.ctrlKey) && !confirmed) {
        if (!window.confirm('Enter 또는 Ctrl 조합 키를 누릅니다. 입력 확정·저장이 될 수 있습니다. 진행할까요?')) throw new Error('키 입력 거부로 중단');
      }
      if (dl && !confirmed) {
        if (!window.confirm(`비가역 버튼(“${dl}”)을 누릅니다. 진행할까요?`)) throw new Error(`“${dl}” 실행 거부로 중단`);
      }
      if (dl) AUTO.allow = true; // 사용자가 확인한 이 한 번의 동작만 가드를 통과시킨다
      el.scrollIntoView({block: 'center', inline: 'center'});
      const r = el.getBoundingClientRect();
      if (step.type === 'click' || step.type === 'dblclick') recMouse(el, r.left + r.width / 2, r.top + r.height / 2, step.type === 'dblclick');
      else if (step.type === 'canvasClick') recMouse(el, r.left + r.width * (step.rx ?? .5), r.top + r.height * (step.ry ?? .5), !!step.dbl);
      else if (step.type === 'type' || step.type === 'select') recSetValue(el, interp(step.value, vars));
      else if (step.type === 'check') { if (!!el.checked !== !!step.checked) el.click(); }
      else if (step.type === 'key') { const w = el.ownerDocument.defaultView; el.dispatchEvent(new w.KeyboardEvent('keydown', {key: step.key, ctrlKey: !!step.ctrlKey, bubbles: true})); el.dispatchEvent(new w.KeyboardEvent('keyup', {key: step.key, ctrlKey: !!step.ctrlKey, bubbles: true})); }
      else if (step.type === 'assert') { const actual = rNorm(el.innerText || el.value || el.textContent), want = interp(step.expectText, vars); if (!actual.includes(want)) throw new Error(`검증 실패: “${want}” ≠ “${actual.slice(0, 40)}”`); }
      AUTO.allow = false;
      return `${used.by}: ${String(used.value).slice(0, 40)}`;
    };
    return {
      stop() { aborted = true; },
      async play(macro, {vars = {}, speed = 1, maxRetries = 3} = {}) {
        aborted = false;
        const results = [];
        for (let i = 0; i < macro.steps.length; i++) {
          const step = macro.steps[i];
          if (beforeStep && !(await beforeStep(step, i))) { results.push({ok: false, detail: '사용자가 중단'}); onProgress(i, results[i]); return {ok: false, at: i, results}; }
          const t0 = Date.now();
          let res = null;
          for (let a = 1; a <= maxRetries; a++) {
            try { res = {ok: true, detail: await exec(step, vars, false), ms: Date.now() - t0}; break; }
            catch (e) { if (aborted || step.type === 'confirm' || /거부|중단/.test(e.message) || a >= maxRetries) { res = {ok: false, detail: e.message, ms: Date.now() - t0}; break; } await wait(Math.max(150, 400 / speed)); }
          }
          results.push(res); onProgress(i, res);
          if (!res.ok) return {ok: false, at: i, results};
          await wait(Math.max(50, 250 / speed));
        }
        return {ok: true, at: -1, results};
      },
    };
  }

  // ---------- 기록기 화면 ----------
  const macroLoad = () => { const m = store.get('macros', []); return Array.isArray(m) ? m : []; };
  const macroSave = m => store.set('macros', m);
  const recFrameDocNow = () => { const f = $('#frame iframe'); try { return f && f.contentDocument; } catch { return null; } };
  const recVarsOf = m => [...new Set((JSON.stringify(m.steps).match(/\{\{\s*([^}]+?)\s*\}\}/g) || []).map(x => x.replace(/[{}\s]/g, '')))];
  const stepLabel = s => {
    const sel = (s.selectors && s.selectors[0] && s.selectors[0].value) || '';
    const t = {click: '클릭', dblclick: '더블클릭', type: '입력', select: '선택', check: '체크', key: '키', canvasClick: '그리드 클릭', confirm: '확인 후 실행', assert: '검증', waitFor: '대기'}[s.type] || s.type;
    if (s.type === 'confirm') return `⚠ ${s.nextAction ? stepLabel(s.nextAction) : t} (재생 때 확인)`;
    return `${esc(t)} · ${esc(s.label || String(s.value ?? sel).slice(0, 34))}`;
  };
  let recorder = null, player = null;

  function updateRecBar() {
    let bar = root.querySelector('#recbar');
    if (!recorder) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'recbar'; bar.style.cssText = 'position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;background:#b3261e;color:#fff;border-radius:999px;padding:8px 14px;display:flex;gap:12px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.35);font-weight:700'; wcEl.append(bar); }
    bar.innerHTML = `<span>● 기록 중 · ${recorder.count()}단계</span><button class="btn sm" data-act="recStop" style="height:28px">■ 정지·저장</button>`;
  }
  function recStart() {
    if (gated('recorder')) return;
    const d = recFrameDocNow();
    if (!d) { toast('먼저 기록할 그룹웨어 화면을 처리 창에 열어 주세요 (예: 새로 만들기 → 양식 열기, 또는 항목의 “원래 화면 열기”).'); return; }
    closeOverlay();
    recorder = createRecorder({getRootDocs: () => { const x = recFrameDocNow(); return x ? [x] : []; }, onStep: updateRecBar});
    recorder.start();
    const f = $('#frame iframe');
    if (f) f.addEventListener('load', () => recorder && recorder.rescan(), {once: false});
    updateRecBar();
    toast('기록을 시작했습니다. 처리 창에서 평소처럼 작업하세요. 비밀번호 입력은 기록되지 않습니다.');
  }
  function recStop() {
    if (!recorder) return;
    const steps = recorder.stop();
    recorder = null; updateRecBar();
    if (!steps.length) { toast('기록된 동작이 없습니다.'); return; }
    const name = (prompt(`기록한 ${steps.length}단계의 이름을 입력하세요.`, `기록 ${new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}`) || '').trim();
    if (!name) { toast('이름이 없어 저장하지 않았습니다.'); return; }
    const m = macroLoad();
    m.unshift({version: '1.0', id: 'm' + Date.now().toString(36), name, createdAt: Date.now(), vars: {}, steps});
    macroSave(m);
    toast(`“${name}” ${steps.length}단계를 저장했습니다.`);
    openRecorder();
  }
  function openRecorder() {
    if (gated('recorder')) return;
    closeOverlay();
    S.paletteOpen = true;
    const ms = macroLoad();
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(780px,95vw);padding:22px 24px;max-height:88vh;overflow:auto" role="dialog" aria-label="그룹웨어 기록기">
      <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div class="cmd-logo" style="background:#b3261e">${ic('play')}</div><div><h2 style="margin:0;font-size:18px">그룹웨어 기록기</h2><div class="muted">처리 창에서 한 작업을 기록해 두었다가 그대로 재생합니다. 값은 변수로 바꿔 매번 다르게 넣을 수 있습니다.</div></div></div>
      <div class="acts"><button class="btn primary" data-act="recStart">● 기록 시작</button><button class="btn" data-act="recImport">가져오기(JSON)</button></div>
      <div class="box tip" style="margin-top:10px">안전: 비밀번호는 기록하지 않고, 상신·결재·임시저장·발송·삭제 버튼은 재생 때마다 확인을 받습니다. 실패하면 즉시 멈춥니다.</div>
      <div class="sec"><div class="sh">내 기록 (${ms.length})</div>
      ${ms.length ? ms.map((m, i) => `<div class="box" style="margin:8px 0"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="flex:1;min-width:140px">${esc(m.name)}</b><span class="muted">${m.steps.length}단계${recVarsOf(m).length ? ` · 변수 ${recVarsOf(m).map(v => '{{' + esc(v) + '}}').join(' ')}` : ''}</span></div>
        <div class="acts" style="margin-top:6px"><button class="btn sm primary" data-act="recPlay" data-i="${i}" data-mode="auto">▶ 재생</button><button class="btn sm" data-act="recPlay" data-i="${i}" data-mode="step">한 단계씩</button><button class="btn sm" data-act="recDetail" data-i="${i}">단계 보기·변수화</button><button class="btn sm" data-act="recExport" data-i="${i}">내보내기</button><button class="btn sm danger ghost" data-act="recDel" data-i="${i}">삭제</button></div></div>`).join('') : '<div class="muted">저장된 기록이 없습니다. “기록 시작” 후 처리 창에서 작업하세요.</div>'}
      </div></div></div>`;
  }
  function recDetail(i) {
    const m = macroLoad()[i];
    if (!m) return;
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(780px,95vw);padding:22px 24px;max-height:88vh;overflow:auto" role="dialog" aria-label="기록 단계">
      <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
      <h2 style="margin:0 0 4px;font-size:18px">${esc(m.name)}</h2><div class="muted" style="margin-bottom:8px">입력 단계의 “변수로”를 누르면 값을 {{이름}}으로 바꿔, 재생할 때마다 새 값을 넣을 수 있습니다.</div>
      ${m.steps.map((s, k) => `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-top:1px solid var(--line)"><span class="muted" style="width:28px">${k + 1}</span><span style="flex:1;min-width:0">${stepLabel(s)}</span>${s.type === 'type' || s.type === 'select' ? `<button class="btn sm" data-act="recVar" data-i="${i}" data-s="${k}">변수로</button>` : ''}<button class="btn sm ghost" data-act="recStepDel" data-i="${i}" data-s="${k}">삭제</button></div>`).join('')}
      <div class="acts" style="margin-top:12px;justify-content:flex-end"><button class="btn sm" data-act="openRec">목록으로</button></div></div></div>`;
  }
  function recVar(i, k) {
    const ms = macroLoad(), m = ms[i], s = m && m.steps[k];
    if (!s) return;
    const name = (prompt('변수 이름을 입력하세요 (예: 제목, 금액).', '값') || '').trim().replace(/[{}\s]/g, '');
    if (!name) return;
    m.vars = m.vars || {}; m.vars[name] = s.value; s.value = `{{${name}}}`;
    macroSave(ms); recDetail(i);
  }
  function recStepDel(i, k) { const ms = macroLoad(); if (ms[i]) { ms[i].steps.splice(k, 1); macroSave(ms); recDetail(i); } }
  function recDel(i) { const ms = macroLoad(); if (!ms[i] || !confirm(`“${ms[i].name}” 기록을 삭제할까요?`)) return; ms.splice(i, 1); macroSave(ms); openRecorder(); }
  function recExport(i) { const m = macroLoad()[i]; if (!m) return; const json = JSON.stringify(m, null, 2); try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], {type: 'application/json'})); a.download = `${m.name}.macro.json`; a.click(); } catch {} toast('기록을 파일로 저장했습니다.'); }
  function recImport() {
    const txt = prompt('내보낸 기록(JSON)을 붙여 넣으세요.');
    if (!txt) return;
    try { const m = JSON.parse(txt); if (!m || !Array.isArray(m.steps)) throw new Error('steps가 없습니다');
      if (!m.steps.every(s => s && REC_TYPES.has(s.type) && (!s.nextAction || REC_TYPES.has(s.nextAction.type)))) throw new Error('허용되지 않은 단계 종류가 있습니다');
      m.name = String(m.name || '가져온 기록').slice(0, 60); m.imported = true; m.id = 'm' + Date.now().toString(36); m.createdAt = Date.now(); const ms = macroLoad(); ms.unshift(m); macroSave(ms); toast(`“${m.name || '가져온 기록'}”을 가져왔습니다.`); openRecorder(); }
    catch (e) { toast('가져오지 못했습니다: ' + e.message); }
  }
  async function recPlay(i, mode) {
    if (gated('recorder')) return;
    const m = macroLoad()[i];
    if (!m) return;
    if (!recFrameDocNow()) { toast('재생할 그룹웨어 화면을 처리 창에 먼저 열어 주세요.'); return; }
    const vars = {};
    for (const v of recVarsOf(m)) { const val = prompt(`“${v}” 값을 입력하세요.`, (m.vars || {})[v] ?? ''); if (val === null) return; vars[v] = val; }
    closeOverlay();
    try { const fw = $('#frame iframe').contentWindow; installGuard(fw); } catch {}
    AUTO.running = true; AUTO.allow = false;
    const log = [];
    const render = () => { const el = $('#recplay'); if (el) el.innerHTML = m.steps.map((s, k) => `<div style="display:flex;gap:8px;padding:3px 0;border-top:1px solid var(--line)"><b style="width:18px;color:${log[k] ? (log[k].ok ? 'var(--ok)' : 'var(--hi)') : 'var(--muted)'}">${log[k] ? (log[k].ok ? '✓' : '✗') : (k === log.length ? '▶' : '·')}</b><span style="flex:1">${stepLabel(s)}${log[k] && !log[k].ok ? `<div class="err" style="font-size:12px">${esc(log[k].detail)}</div>` : ''}</span></div>`).join(''); };
    $('#overlay').innerHTML = `<div class="modal"><div class="dlg" data-stop="1" style="width:min(620px,94vw);padding:18px 22px;position:absolute;right:24px;bottom:24px;top:auto;left:auto;transform:none;max-height:70vh;overflow:auto" role="dialog" aria-label="기록 재생"><h2 style="margin:0 0 6px;font-size:16px">▶ ${esc(m.name)} 재생 중</h2><div id="recplay"></div><div class="acts" style="margin-top:8px;justify-content:flex-end"><button class="btn sm danger" data-act="recAbort">중지</button><button class="btn sm primary" data-act="closeHelp">닫기</button></div></div></div>`;
    render();
    player = createPlayer({getRootDocs: () => { const x = recFrameDocNow(); return x ? [x] : []; }, onProgress: (k, res) => { log[k] = res; render(); },
      beforeStep: mode === 'step' ? async (s, k) => window.confirm(`${k + 1}/${m.steps.length}단계를 실행할까요?\n${stepLabel(s).replace(/<[^>]+>/g, '')}`) : null});
    let r;
    try { r = await player.play(m, {vars}); } finally { AUTO.running = false; AUTO.allow = false; player = null; }
    logActionRecord({command: `기록 재생: ${m.name}`, type: '기록기', target: m.name, summary: r.ok ? `${m.steps.length}단계를 모두 재생했습니다.` : `${r.at + 1}단계에서 중단했습니다: ${(r.results[r.at] || {}).detail || ''}`, steps: r.results.map((x, k) => `${x.ok ? '✓' : '✗'} ${k + 1}. ${x.detail}`), verified: r.ok});
    toast(r.ok ? `“${m.name}” 재생을 마쳤습니다.` : `재생을 중단했습니다: ${(r.results[r.at] || {}).detail || ''}`);
  }
  function recAbort() { if (player) player.stop(); }
