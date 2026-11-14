// 실화면 스모크 점검 (그룹웨어 탭에서 실행). 읽기 전용: 화면 전환과 오버레이 열기/닫기만 한다.
// 사용(Aside REPL): const code = await fs.readFile('D:\\Coding\\groupware\\scripts\\live-smoke.browser.js','utf8');
//   긴 작업이라 백그라운드로 시작하고 결과를 폴링한다:
//   await page.evaluate(c => { window.__smoke = null; (0, eval)(c).then(r => { window.__smoke = r; }); }, code);
//   ... 20초 간격으로 await page.evaluate(() => window.__smoke) 가 null이 아닐 때까지
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (!document.querySelector('#bwyfgw-workcenter') && window.BWYFGW_WC) { window.BWYFGW_WC.open(); await wait(1200); }
  const host = document.querySelector('#bwyfgw-workcenter');
  if (!host || !host.shadowRoot) return {ok: false, error: '업무센터가 로드되지 않았습니다'};
  const root = host.shadowRoot, wc = root.querySelector('.wc');
  const errors = [];
  const onErr = e => errors.push(String(e.message || e.reason || e).slice(0, 160));
  window.addEventListener('error', onErr); window.addEventListener('unhandledrejection', onErr);
  const results = [];
  const BAD = /undefined|NaN|\[object Object\]|Invalid Date|null(?![a-z])/;
  const check = (name, cond, detail = '') => results.push({name, ok: !!cond, detail});
  const fire = a => { const b = document.createElement('button'); b.dataset.act = a; wc.appendChild(b); b.click(); b.remove(); };

  window.BWYFGW_WC.open();
  await wait(600);
  // 1) 모든 좌측 메뉴 화면: 비어 있지 않고, 깨진 값 문자열이 없고, 12px 미만 글자가 없는지
  const navs = [...root.querySelectorAll('nav a')];
  for (const a of navs) {
    const label = a.textContent.replace(/\s+/g, ' ').trim().slice(0, 14);
    a.click(); await wait(a.textContent.includes('달력') ? 4500 : 700);
    const main = root.querySelector('main');
    const text = main ? main.innerText : '';
    const fullText = wc ? wc.innerText : text;
    check(`화면: ${label}`, text.trim().length > 20, `글자 ${text.length}`);
    const m = fullText.match(BAD);
    check(`값 이상 없음: ${label}`, !m, m ? `"${m[0]}" 발견` : '');
    const small = main ? [...main.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 12).length : 0;
    check(`글자 12px 이상: ${label}`, small === 0, small ? `${small}곳` : '');
    const over = main ? [...main.querySelectorAll('.cal .c, .card2, .row')].filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX === 'visible').length : 0;
    check(`가로 넘침 없음: ${label}`, over === 0, over ? `${over}곳` : '');
  }
  // 2) 오버레이 열기/닫기
  for (const act of ['menuNew', 'openCmd', 'openPay', 'openRec', 'openData', 'openDiag', 'help']) {
    fire(act); await wait(act === 'openPay' ? 8000 : act === 'openDiag' ? 2500 : 500);
    const dlg = root.querySelector('.dlg, .menu, .cmd-console');
    check(`오버레이: ${act}`, !!dlg, dlg ? '' : '열리지 않음');
    fire('closeHelp'); await wait(250);
  }
  // 3) 경계: 보이는 곳에 자동으로 눌러선 안 되는 버튼이 있는지(상신·결재 등은 업무센터 안에 없어야 함)
  const danger = [...root.querySelectorAll('button')].filter(b => /^(상신|결재|임시저장|삭제)$/.test(b.textContent.trim())).map(b => b.textContent.trim());
  check('업무센터 안에 상신·결재·삭제 버튼 없음', danger.length === 0, danger.join(','));
  // 4) 앱 내부 오류 로그
  const stored = Object.keys(localStorage).filter(k => /:errors$/.test(k)).map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return []; } }).flat();
  const recent = stored.filter(e => Date.now() - e.at < 120000);
  check('최근 2분 내 앱 오류 없음', recent.length === 0, recent.map(e => e.where + ':' + e.msg).slice(0, 3).join(' | '));
  check('페이지 오류 이벤트 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onErr);
  const failed = results.filter(r => !r.ok);
  return {ok: failed.length === 0, total: results.length, failed};
})()
