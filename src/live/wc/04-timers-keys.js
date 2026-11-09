// GW 통합 업무센터 · timers & keys
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- timers & keys ----------
  let timer = null;
  function schedule() {
    clearInterval(timer);
    const m = Number(S.settings.refreshMin || 0);
    if (m > 0) timer = setInterval(() => refresh({silent: true}), m * 60_000);
  }
  const onDocKey = e => {
    if (e.altKey && e.code === 'KeyG') { e.preventDefault(); e.stopPropagation(); S.open ? close() : open(); return; }
    if (S.open) handleKey(e);
  };
  document.addEventListener('keydown', onDocKey, true);
  const onResize = () => applyLook();
  window.addEventListener('resize', onResize);
  function handleKey(e) {
    const t = e.composedPath()[0] || {};
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName || '') || t.isContentEditable;
    e.stopPropagation(); // keep groupware shortcuts from firing behind the work center
    if (e.isComposing || e.keyCode === 229) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); openPalette(typing && t.id === 'gsearch' ? t.value : ''); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !typing) { e.preventDefault(); undo(); return; }
    if (e.key === 'Escape') {
      if (S.coach) { endCoach(); return; }
      if (S.paletteOpen || S.helpOpen || S.menuOpen) { closeOverlay(); return; }
      if (typing) { t.blur(); return; }
      if (S.focus) { stopFocus(); return; }
      if (S.pane.url) { if (!leavePane()) return; S.pane.url = ''; renderPane(); return; }
      if (S.sel) { S.sel = null; render(); return; }
      close(); return;
    }
    if (S.paletteOpen) { paletteKey(e); return; }
    if (S.coach) { if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); coachNext(); } return; }
    if (!typing && (e.key === 'Enter' || e.key === ' ') && t.dataset && t.dataset.act && t.tagName !== 'BUTTON' && t.tagName !== 'A' || (!typing && (e.key === 'Enter' || e.key === ' ') && t.tagName === 'A' && !t.href)) { e.preventDefault(); t.click(); return; }
    if (typing) {
      if (e.key !== 'Enter') return;
      if (t.id === 'cmdPrompt') { e.preventDefault(); executeCommandWorkflow(t.value); return; }
      if (t.id === 'gsearch') { e.preventDefault(); const v = t.value.trim(); if (v) { openCommandConsole(v); } return; }
      else if (t.id === 'sq') { S.search.kw = t.value.trim(); runSearch(); }
      else if (t.id === 'mailq') runMailSearch(t.value.trim());
      else if (t.id === 'tdTitle') addTodoFromInput();
      else if (t.id === 'bcode' || t.id === 'bfilter') { S.budget.project = $('#bcode').value.trim(); S.budget.filter = $('#bfilter').value.trim(); loadBudget(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code;
    if (c === 'KeyD' && e.shiftKey) { e.preventDefault(); toggleTheme(); toast(S.settings.theme === 'dark' ? '다크 모드' : '라이트 모드'); return; }
    if (c === 'Slash' && e.shiftKey) { toggleHelp(); return; }
    if (c === 'Slash') { e.preventDefault(); $('#gsearch').focus(); return; }
    if (c === 'KeyH') { goHome(); return; }
    if (c === 'KeyR') { refresh(); return; }
    if (c === 'KeyF') { startFocus(); return; }
    if (/^Digit[1-9]$/.test(c)) { const v = VIEWS[Number(c.slice(5)) - 1]; if (v) go(v.id); return; }
    if (S.focus) { if (c === 'KeyN') focusNext(true); else if (c === 'KeyB') focusPrev(); return; }
    if (S.view === 'today' && ['KeyJ', 'KeyK', 'ArrowDown', 'ArrowUp'].includes(c)) { e.preventDefault(); moveSel(c === 'KeyJ' || c === 'ArrowDown' ? 1 : -1); return; }
    const x = selectedAction();
    if (!x) return;
    if (c === 'Enter') openItem(x);
    else if (c === 'KeyO') openWindow(x.url, x);
    else if (c === 'KeyX') hide([x.key]);
    else if (c === 'KeyS') snooze([x.key]);
    else if (c === 'KeyT') addTodo(x.title, x.deadline && x.deadline.date || '', x.kind, x.url, x.key);
  }
  root.addEventListener('keyup', e => e.stopPropagation());

