// GW 비서 · 홈 자원 예약 (읽기 전용, 조회 범위와 실패를 보존)
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  function homeResEnsure() {
    if (!allowed('resource') || !GW.resourceList || !GW.resourceBookings) return;
    const h = S.homeRes = S.homeRes || {at: 0, items: [], busy: false};
    const day = R.kstNow(new Date()).date.replace(/-/g, '');
    if (h.busy || (h.day === day && Date.now() - h.at < 10 * 60000)) return;
    h.busy = true; h.err = ''; h.partial = false; h.day = day; h.items = [];
    (async () => {
      try {
        const list = (await GW.resourceList()).filter(r => r.useYn !== 'N');
        const out = [];
        h.partial = list.length > 4;
        for (const r of list.slice(0, 4)) for (const b of await GW.resourceBookings({from: day, to: day, resSeqs: [r.resSeq]})) out.push({start: b.start, end: b.end, label: `${r.name.replace(/\(.*$/, '')} ${b.who}${b.title ? ' · ' + b.title : ''}`, kind: 'car'});
        h.items = out;
      } catch (e) { h.err = '자원 예약을 조회하지 못했습니다'; h.items = []; logError('homeRes', e.message); }
      h.busy = false; h.at = Date.now();
      if (S.view === 'today' || S.view === 'home') renderMain();
    })();
  }
