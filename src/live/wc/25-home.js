// GW 비서 · 홈 하루 요약 (오늘 타임라인, 퇴근 정리, 내 상신문서 결재 지연)
// 읽기 전용. 이미 가져온 일정·근태·자원·상신문서 자료를 한 곳에 모아 보여 준다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  function homeResEnsure() {
    if (!allowed('resource') || !GW.resourceList || !GW.resourceBookings) return;
    const h = S.homeRes = S.homeRes || {at: 0, items: [], busy: false};
    if (h.busy || Date.now() - h.at < 10 * 60000) return;
    h.busy = true;
    const day = R.kstNow(new Date()).date.replace(/-/g, '');
    (async () => {
      try {
        const list = (await GW.resourceList()).filter(r => r.useYn !== 'N');
        const out = [];
        for (const r of list.slice(0, 4)) for (const b of await GW.resourceBookings({from: day, to: day, resSeqs: [r.resSeq]})) out.push({start: b.start, end: b.end, label: `${r.name.replace(/\(.*$/, '')} ${b.who}${b.title ? ' · ' + b.title : ''}`, kind: 'car'});
        h.items = out;
      } catch (e) { logError('homeRes', e.message); }
      h.busy = false; h.at = Date.now();
      if (S.view === 'today' || S.view === 'home') renderMain();
    })();
  }

