// Read-only browser smoke for the minified demo. It changes views only and never alters records or opens external pages.
// Aside REPL invocation:
// const code = await fs.readFile('scripts/90-menu-smoke.browser.js', 'utf8');
// const result = await page.evaluate(code => (0, eval)(code), code); console.log(result);
(async () => {
  const SIDEBAR = [
    ['home', '홈'], ['today', '할 일'], ['calendar', '일정·예약'], ['attendance', '근태·연차'], ['budget', '예산 집행'],
    ['approval', '결재·메일'], ['search', '찾기'], ['report', '보고'], ['settings', '설정'],
  ];
  // [상위 메뉴, 화면 id, 이름, 여는 버튼 선택자, 고른 상태 속성]. 출처만 바꾸는 화면(개인 ToDo, 구글 캘린더)은 탭이 아니라 눌림 버튼이다.
  const tabSel = id => `button[role="tab"][data-act="view"][data-v="${id}"]`;
  const SUBTABS = [
    ['today', 'mytodo', '개인 ToDo', 'button[data-act="todoSrc"][data-v="mine"]', 'aria-pressed'], ['today', 'board', '보드', tabSel('board'), 'aria-selected'],
    ['calendar', 'resource', '자원 예약', tabSel('resource'), 'aria-selected'], ['calendar', 'gcal', '구글 캘린더', 'button[aria-pressed][data-act="view"][data-v="gcal"]', 'aria-pressed'],
    ['approval', 'mail', '메일', tabSel('mail'), 'aria-selected'], ['approval', 'notifications', '알림', tabSel('notifications'), 'aria-selected'],
    ['search', 'docs', '결재문서 찾기', tabSel('docs'), 'aria-selected'], ['search', 'people', '사람·조직', tabSel('people'), 'aria-selected'],
    ['report', 'overview', '현황 차트', tabSel('overview'), 'aria-selected'], ['settings', 'gsync', '구글 연동', tabSel('gsync'), 'aria-selected'],
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
    check('sidebar has exactly 9 items', !!nav && nav.querySelectorAll('a[data-act="view"]').length === 9, nav ? String(nav.querySelectorAll('a[data-act="view"]').length) : 'nav 없음');
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
    for (const [parent, id, label, selector, attr] of SUBTABS) {
      const parentLink = nav.querySelector(`a[data-act="view"][data-v="${parent}"]`);
      if (!parentLink) { check(`${label}: parent link`, false, parent); continue; }
      parentLink.click(); await settle();
      const opener = main.querySelector(selector);
      check(`${label}: subtab link`, !!opener, opener ? '' : id);
      if (!opener) continue;
      opener.click(); await settle();
      verify(parent, id, label);
      const selected = main.querySelector(selector);
      check(`${label}: selected subtab`, selected?.getAttribute(attr) === 'true', selected?.getAttribute(attr) || 'missing');
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


