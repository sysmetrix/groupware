// GW 통합 업무센터 · lifecycle
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- lifecycle ----------
  let prevTitle = document.title;
  // Browser Back button: step back inside the work center (pane → list → groupware) instead of leaving the page.
  let backArmed = false;
  const armBack = () => { if (!backArmed) { try { history.pushState({bwyfgwWc: 1}, '', location.href); backArmed = true; } catch {} } };
  const onPop = () => {
    if (!backArmed || !S.open) return;
    backArmed = false;
    if (S.helpOpen || S.paletteOpen || S.menuOpen) { closeOverlay(); armBack(); return; }
    if (S.focus || S.pane.url || S.sel) { if (S.focus) stopFocus(); else if (leavePane()) { S.sel = null; S.pane.url = ''; S.pane.expanded = false; render(); } armBack(); return; }
    if (S.view !== 'today') { go('today'); armBack(); return; }
    if (S.pane.dirty && !leavePane()) { armBack(); return; }
    close();
  };
  window.addEventListener('popstate', onPop);
  function open() {
    if (!POLICY.enabled) { toast('관리자 설정으로 업무센터가 꺼져 있습니다.' + (POLICY.message ? ' ' + POLICY.message : '')); return; }
    govPurge();
    tipBubble.style.display = 'none';
    S.open = true; host.style.display = 'block'; fab.style.display = 'none'; prevTitle = document.title;
    armBack();
    applyLook(); render();
    if (document.activeElement && document.activeElement !== document.body) { try { document.activeElement.blur(); } catch {} }
    if (!S.a || !S.lastRefresh || Date.now() - S.lastRefresh.getTime() > 60_000) refresh();
    const noticed = showNoticeIfNeeded();
    if (!noticed && S.settings.seenVersion !== VERSION) { const first = !S.settings.seenVersion; S.settings.seenVersion = VERSION; saveLocal(); if (!first) setTimeout(() => { if (S.open && !S.paletteOpen) openChangelog(); }, 1500); }
    if (!noticed && !S.settings.tourDone) setTimeout(() => startCoach(), 900);
    checkUpdate(false).then(i => { if (i && i.latest && R.compareVersions(i.latest, VERSION) > 0 && !S.updToast) { S.updToast = true; toast(`새 버전 ${i.latest} 이 있습니다. 관리자에게 알려 주세요.`); } }).catch(() => {});
  }
  function close() { if (backArmed) { backArmed = false; try { history.back(); } catch {} } S.open = false; host.style.display = 'none'; fab.style.display = 'block';
    if (!S.settings.fabTipShown || (S.settings.fabTipCount || 0) < 3) { S.settings.fabTipCount = (S.settings.fabTipCount || 0) + 1; S.settings.fabTipShown = true; saveLocal(); tipBubble.style.display = 'block'; clearTimeout(tipTimer); tipTimer = setTimeout(() => { tipBubble.style.display = 'none'; }, 6000); } document.title = prevTitle; closeOverlay(); }
  function destroy() { clearInterval(timer); document.removeEventListener('keydown', onDocKey, true); window.removeEventListener('resize', onResize); window.removeEventListener('popstate', onPop); host.remove(); fab.remove(); tipBubble.remove(); }

