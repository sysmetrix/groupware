// Read-only browser smoke for the minified demo. It changes views only and never alters records or opens external pages.
// Aside REPL invocation:
// const code = await fs.readFile('scripts/90-menu-smoke.browser.js', 'utf8');
// const result = await page.evaluate(code => (0, eval)(code), code); console.log(result);
(async () => {
  const SIDEBAR = [
    ['home', '홈'], ['today', '할 일'], ['approval', '결재·문서유통'], ['mail', '메일'],
    ['calendar', '일정·예약'], ['attendance', '근태·연차'], ['search', '검색·문서'], ['budget', '예산 집행'],
    ['report', '보고·현황'], ['notifications', '통합알림'], ['people', '조직·사람'], ['settings', '설정'],
  ];
  const SUBTABS = [
    ['today', 'mytodo', '내 할 일'], ['today', 'board', '보드'], ['calendar', 'resource', '자원 예약'], ['calendar', 'gcal', '구글 일정'],
    ['calendar', 'gsync', '구글 동기화'], ['search', 'docs', '문서 찾기 (기안·접수·발송)'], ['report', 'overview', '현황 차트'],
  ];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({name, ok: !!ok, detail});
  const errors = [];
  const capture = event => errors.push(String(event?.message || event?.reason || event).slice(0, 240));
  window.addEventListener('error', capture);
  window.addEventListener('unhandledrejection', capture);
  try {
    if (!document.querySelector('#bwyfgw-workcenter') && window.BWYFGW_WC?.open) window.BWYFGW_WC.open();
    await wait(600);
    const host = document.querySelector('#bwyfgw-workcenter');
    const root = host?.shadowRoot;
    const nav = root?.querySelector('#nav');
    const main = root?.querySelector('#main');
    check('workcenter shadow root is available', !!root, root ? '' : '업무센터가 열리지 않았습니다');
    check('sidebar has exactly 12 items', !!nav && nav.querySelectorAll('a[data-act="view"]').length === 12, nav ? String(nav.querySelectorAll('a[data-act="view"]').length) : 'nav 없음');
    if (!root || !nav || !main) return finish();

    const visibleErrors = () => [...root.querySelectorAll('[role="alert"], .err, .errb')]
      .map(node => node.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const settle = async () => { await wait(350); };
    const verify = (kind, id, label) => {
      const heading = main.querySelector('h1');
      const current = [...nav.querySelectorAll('a[data-act="view"]')].filter(node => node.getAttribute('aria-current') === 'page');
      const expected = nav.querySelector(`a[data-v="${id}"]`) || nav.querySelector(`a[data-v="${kind}"]`);
      check(`${label}: sidebar aria-current`, current.length === 1 && current[0] === expected, current.map(node => node.dataset.v).join(',') || '없음');
      check(`${label}: heading`, !!heading && heading.textContent.trim().length > 0, heading?.textContent.trim() || 'h1 없음');
      const alerts = visibleErrors();
      check(`${label}: no visible error`, alerts.length === 0, alerts.join(' | ').slice(0, 240));
    };

    for (const [id, label] of SIDEBAR) {
      const link = nav.querySelector(`a[data-act="view"][data-v="${id}"]`);
      check(`${label}: sidebar link`, !!link, link ? '' : id);
      if (!link) continue;
      link.click(); await settle(); verify(id, id, label);
    }
    for (const [parent, id, label] of SUBTABS) {
      const parentLink = nav.querySelector(`a[data-act="view"][data-v="${parent}"]`);
      if (!parentLink) { check(`${label}: parent link`, false, parent); continue; }
      parentLink.click(); await settle();
      const tab = main.querySelector(`button[role="tab"][data-act="view"][data-v="${id}"]`);
      check(`${label}: subtab link`, !!tab, tab ? '' : id);
      if (!tab) continue;
      tab.click(); await settle();
      verify(parent, id, label);
      const selectedTab = main.querySelector(`button[role="tab"][data-act="view"][data-v="${id}"]`);
      check(`${label}: selected subtab`, selectedTab?.getAttribute('aria-selected') === 'true', selectedTab?.getAttribute('aria-selected') || 'missing');
    }
    check('page error events', errors.length === 0, errors.join(' | ').slice(0, 240));
    return finish();
  } finally {
    window.removeEventListener('error', capture);
    window.removeEventListener('unhandledrejection', capture);
  }

  function finish() {
    const failed = checks.filter(check => !check.ok);
    return {ok: failed.length === 0, total: checks.length, failed, checks};
  }
})()


