// GW 통합 업무센터 · timers & keys
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- timers & keys ----------
  let timer = null;
  function schedule() {
    clearInterval(timer);
    const m = Number(S.settings.refreshMin || 0);
    if (m > 0) timer = setInterval(() => { if (document.visibilityState !== 'hidden' || S.settings.notify) refresh({silent: true}); }, m * 60_000); // 보이지 않는 탭은 알림을 켠 경우에만 조회
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
    // 팔레트 키 처리는 진짜 명령 팔레트(#palq)가 열려 있을 때만. 다른 대화상자(AI·지급·기록기 등)도 paletteOpen을 쓰므로
    // 거기서 Enter를 누르면 팔레트 항목이 실행되던 문제를 막는다.
    if (S.paletteOpen && $('#palq')) { paletteKey(e); return; }
    if (S.coach) { if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); coachNext(); } return; }
    if (!typing && (e.key === 'Enter' || e.key === ' ') && t.dataset && t.dataset.act && t.tagName !== 'BUTTON' && t.tagName !== 'A' || (!typing && (e.key === 'Enter' || e.key === ' ') && t.tagName === 'A' && !t.href)) { e.preventDefault(); t.click(); return; }
    if (typing && t.id === 'chInput') { chatKey(e, t); return; } // AI 채팅 입력창: Enter 전송, Shift+Enter 줄바꿈, 위 화살표로 직전 질문
    if (typing) {
      if (e.key !== 'Enter') return;
      if (t.id === 'cmdPrompt') { e.preventDefault(); executeCommandWorkflow(t.value); return; }
      if (t.id === 'gsearch') { e.preventDefault(); const v = t.value.trim(); if (!v) return; if (R.looksLikeCommand(v) && allowed('aiConsole')) { t.blur(); t.value = ''; go('home'); setTimeout(() => chatSend(v), 60); } else { t.blur(); S.search.kw = v; runSearch(); } return; }
      if (t.id === 'aiQ') { e.preventDefault(); aiAsk(); return; }
      if (/^ask_\d+$/.test(t.id || '')) { e.preventDefault(); const nx = $('#ask_' + (Number(t.id.slice(4)) + 1)); if (nx) nx.focus(); else $('#askOk')?.click(); return; }
      if (t.id === 'aiKey') { e.preventDefault(); aiSaveKey(); return; }
      else if (t.id === 'sq') { S.search.kw = t.value.trim(); runSearch(); }
      else if (t.id === 'mailq') runMailSearch(t.value.trim());
      else if (t.id === 'tdTitle') addTodoFromInput();
      else if (t.id === 'bcode' || t.id === 'bfilter') { S.budget.project = $('#bcode').value.trim(); S.budget.filter = $('#bfilter').value.trim(); loadBudget(); }
      return;
    }
    if (S.paletteOpen || S.helpOpen) return; // 대화상자(AI·지급·기록기·명령 콘솔 등) 위에서는 전역 단축키를 쓰지 않는다
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code;
    if (c === 'KeyD' && e.shiftKey) { e.preventDefault(); toggleTheme(); toast(S.settings.theme === 'dark' ? '다크 모드' : '라이트 모드'); return; }
    if (c === 'Slash' && e.shiftKey) { toggleHelp(); return; }
    if (c === 'Slash') { e.preventDefault(); const ci = S.view === 'home' && $('#chInput'); (ci || $('#gsearch')).focus(); return; }
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
    else if (c === 'KeyE') { e.preventDefault(); markDoneKeys([x.key]); }
    else if (c === 'KeyX') hide([x.key]);
    else if (c === 'KeyS') snooze([x.key]);
    else if (c === 'KeyT') addTodo(x.title, x.deadline && x.deadline.date || '', x.kind, x.url, x.key);
  }
  root.addEventListener('keyup', e => e.stopPropagation());

