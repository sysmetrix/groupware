// GW 비서 · 움직임(v0.69). 화면 코드(다른 조각)를 고치지 않고, 그려진 결과를 지켜보다가 .m-* 클래스만 붙인다. 모양은 wc-studio.css.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
// 규칙: ① 화면을 바꿨을 때(또는 자료가 처음 도착했을 때) 한 번만 등장 연출 ② 그 밖에는 사용자가 한 일이나 바뀐 값에만 반응
//       ③ 자동 새로고침으로 같은 화면이 다시 그려질 때는 아무것도 움직이지 않는다 ④ '움직임 줄이기'(OS 설정)면 전부 끈다.
  const motionOff = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const motionFlags = {};
  function motionFlag(cls, ms) {
    wcEl.classList.add(cls);
    clearTimeout(motionFlags[cls]);
    motionFlags[cls] = setTimeout(() => wcEl.classList.remove(cls), ms);
  }
  let motionKey = '', motionQueued = false, motionHadPane = false, motionWasDark = wcEl.classList.contains('dark');
  const motionSeen = new Map(); // 숫자 위치 -> 마지막으로 보여 준 값
  const motionNav = new Map(); // 메뉴 -> 마지막 건수

  // 숫자 올리기: 0에서 값까지 0.6초. 화면에 처음 들어올 때만 쓴다.
  function motionCount(el, to) {
    const t0 = performance.now(), dur = 600;
    const step = now => {
      if (!el.isConnected) return;
      const p = Math.min(1, (now - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - p, 3)));
      el.textContent = String(v);
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  }
  function motionNumbers(entering) {
    root.querySelectorAll('#main .hm-tile-v').forEach((el, i) => {
      const text = el.textContent.trim(), key = (el.closest('[data-v]') || {dataset: {}}).dataset.v || 'n' + i;
      const had = motionSeen.has(key), prev = motionSeen.get(key);
      motionSeen.set(key, text);
      if (!/^\d{1,4}$/.test(text)) return;
      if (entering) { if (+text > 0) motionCount(el, +text); }
      else if (had && prev !== text) { el.classList.remove('m-tick'); void el.offsetWidth; el.classList.add('m-tick'); }
    });
  }
  // 등장 순서: 줄·카드·도장에 차례 번호(--i)를 준다. 앞의 12개까지만 차례로, 나머지는 함께.
  function motionOrder() {
    const give = sel => root.querySelectorAll(sel).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 12)));
    give('#main .row'); give('#main .hm-card,#main .box,#main .card2');
    give('#main .bdg.urgent,#main .bdg.overdue,#main .hm-badge.hm-tone-urgent');
  }
  function motionSync() {
    motionQueued = false;
    if (!S.open) return;
    const off = motionOff();
    wcEl.classList.toggle('m-off', off);
    const head = $('header'); if (head) head.classList.toggle('m-loading', !!S.loading && !off);
    // 메뉴 건수: 바뀐 것만 한 번 튄다
    root.querySelectorAll('#nav a[data-v]').forEach(a => {
      const n = a.querySelector('.n'), v = a.dataset.v, cur = n ? n.textContent.trim() : '';
      if (n && !off && motionNav.has(v) && motionNav.get(v) !== cur && motionNav.get(v) !== '') n.classList.add('m-bump');
      motionNav.set(v, cur);
    });
    const key = S.view + '|' + (S.a ? 'data' : 'wait');
    const entering = key !== motionKey;
    motionKey = key;
    if (off) { motionNumbers(false); return; }
    if (entering) { motionOrder(); motionFlag('m-view', 1100); }
    motionNumbers(entering && !!S.a);
  }
  const motionQueue = () => { if (!motionQueued) { motionQueued = true; requestAnimationFrame(motionSync); } };
  const motionMainObs = new MutationObserver(motionQueue);
  motionMainObs.observe($('#main'), {childList: true, subtree: true});
  motionMainObs.observe($('#nav'), {childList: true});
  { const meta = $('#meta'); if (meta) motionMainObs.observe(meta, {childList: true}); }

  // 처리 창이 열릴 때와 밝게·어둡게를 바꿀 때 (wc의 class만 본다. 내가 붙이는 m-* 는 상태 비교에 걸리지 않는다)
  const motionShellObs = new MutationObserver(() => {
    const pane = !wcEl.classList.contains('nopane'), dark = wcEl.classList.contains('dark');
    if (motionOff()) { motionHadPane = pane; motionWasDark = dark; return; }
    if (pane && !motionHadPane) motionFlag('m-pane', 600);
    if (dark !== motionWasDark) motionFlag('m-theme', 450);
    motionHadPane = pane; motionWasDark = dark;
  });
  motionShellObs.observe(wcEl, {attributes: true, attributeFilter: ['class']});

  // 하루 띠의 바늘: 30초마다 지금 시각으로 옮긴다(홈을 다시 그리지 않는다).
  function motionNeedle() {
    const now = $('#drNow'), past = $('#drPast');
    if (!now || typeof R.homeDayRail !== 'function' || typeof homeNowMin !== 'function') return;
    const n = R.homeDayRail([], {nowMin: homeNowMin()}).now;
    if (!n.inRange) { now.remove(); return; }
    now.style.left = n.left + '%';
    now.className = 'dr-now' + (n.edge ? ' dr-edge-' + n.edge : '');
    const b = now.querySelector('b'); if (b && b.textContent !== n.label) b.textContent = n.label;
    if (past) past.style.width = n.left + '%';
  }
  const motionTimer = setInterval(motionNeedle, 30000);
  function motionStop() { clearInterval(motionTimer); motionMainObs.disconnect(); motionShellObs.disconnect(); Object.values(motionFlags).forEach(clearTimeout); }
