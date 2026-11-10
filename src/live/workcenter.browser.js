/*
 * GW 비서 v4.2.2 — one interactive page on top of the logged-in https://gw.bwyf.or.kr tab.
 *
 * Data comes from window.BWYFGW (allow-listed read/search APIs) and window.BWYFGW_REPORT (analysis).
 * The right-hand pane embeds the groupware's own screens (approval document, board article, mail
 * compose, new draft, attendance request). Real processing (결재·접수·배부·발송·답장) happens there,
 * with the groupware's own buttons. This script itself never writes to the groupware.
 * Local state (hidden/snooze/plan/to-do/settings/caches) lives in this browser's localStorage.
 */
(() => {
  'use strict';
  const VERSION = '0.46.0';
  let api = null;
  const lazy = {
    version: VERSION,
    open() { if (!api) api = boot(); api.open(); },
    // Extension: create the launcher button only (the work center opens when the user clicks it).
    mount() { if (!api) { api = boot(); api.refresh({silent: true}).catch(() => {}); } return true; },
    close() { if (api) api.close(); },
    destroy() { if (api) api.destroy(); api = null; },
    refresh() { if (!api) api = boot(); return api.refresh(); },
    install(src) { if (typeof src !== 'string' || src.length < 1000) return false; try { localStorage.setItem('bwyfgw:wc:src', src); return true; } catch { return false; } },
    state() { return api ? api.state() : {booted: false}; },
    debug() { return api ? api.debug() : null; },
    // 구글 캘린더 대조(스킬 bwyf-gcal-sync): 대조할 날짜·후보를 얻고, 읽어 온 구글 일정을 넣는다.
    gsyncPlan() { if (!api) api = boot(); return api.gsyncPlan(); },
    gsyncImport(payload) { if (!api) api = boot(); return api.gsyncImport(payload); },
  };
  if (window.BWYFGW_WC && typeof window.BWYFGW_WC.destroy === 'function') { try { window.BWYFGW_WC.destroy(); } catch {} }
  window.BWYFGW_WC = Object.freeze(lazy);

  function boot() {
  const GW = window.BWYFGW, R = window.BWYFGW_REPORT;
  if (!GW || !R) throw new Error('BWYFGW 수집기와 분석 모듈이 먼저 로드되어야 합니다.');

  /*@WC_PARTS@*/
  schedule();
  return {open, close, destroy, refresh,
    state: () => ({booted: true, open: S.open, view: S.view, loading: S.loading, error: S.error, actions: S.a ? S.a.actions.length : 0, high: S.a ? S.a.summary.high : 0, focus: S.focus ? {i: S.focus.i, n: S.focus.keys.length} : null, lastRefresh: S.lastRefresh}),
    gsyncPlan: gsyncPlanForAgent, gsyncImport,
    debug: () => ({view: S.view, sel: S.sel, paneUrl: S.pane.url, mounted: S.pane.mounted, multi: [...S.multi], todos: S.todos.length, plan: Object.keys(S.plan).length, hidden: Object.keys(S.hidden).length, undo: S.undo.length})};
  }
})();
