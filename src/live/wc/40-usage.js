// GW 비서 · 사용 기록 (어떤 화면·버튼·비서 도구를 며칠에 몇 번 썼는지. 이름과 횟수만, 이 브라우저에만)
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
// 계산은 src/live/usage.mjs(R.usage*)에 있다. 여기서는 세는 곳을 잇고 화면을 그린다.
  let usageLastView = '';
  const usageOn = () => S.settings.usageLog !== false;
  /** 한 번 썼음을 적는다. 저장에 실패해도 조용히 넘어간다(기록 때문에 본래 일이 막히면 안 된다). */
  function usageNote(kind, key) {
    try {
      if (!usageOn() || !key) return;
      store.set('usage', R.usageBump(store.get('usage', null), kind, String(key)));
    } catch {}
  }
  /** 화면이 바뀌었으면 한 번 적는다. 화면은 버튼·단축키·비서 등 여러 길로 바뀌므로 바뀐 결과를 보고 센다. */
  function usageViewCheck() {
    if (!S.open || !S.view || S.view === usageLastView) return;
    usageLastView = S.view;
    usageNote('view', S.view);
  }
  setInterval(usageViewCheck, 4000);

  function usageData(days = 28) {
    return {log: store.get('usage', null), opt: {days, views: VIEWS.map(v => v.id), version: VERSION, errors: store.get('errors', [])}};
  }
  function openUsage() {
    closeOverlay();
    S.paletteOpen = true;
    const {log, opt} = usageData();
    const s = R.usageSummary(log, opt);
    const viewLabel = id => (VIEWS.find(v => v.id === id) || {label: id}).label;
    // 화면에는 내부 이름 대신 사람이 읽는 이름을 보인다(내보내는 파일에는 바뀌지 않는 내부 이름을 쓴다).
    const toolLabel = k => { const name = k.replace(/:err$/, ''), def = CHAT_TOOLS.get(name); return ((def && def.label) || name) + (k.endsWith(':err') ? ' (하지 못함)' : ''); };
    const list = (rows, name = k => k, n = 8) => rows.length ? rows.slice(0, n).map(([k, v]) => `<tr style="border-top:1px solid var(--line)"><td style="padding:5px 4px">${esc(name(k))}</td><td style="text-align:right;white-space:nowrap">${v}회</td></tr>`).join('') : '<tr><td class="muted" style="padding:5px 4px">아직 기록이 없습니다.</td></tr>';
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(680px,95vw);padding:22px 24px;max-height:88vh;overflow:auto" role="dialog" aria-label="사용 기록">
      <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
      <h2 style="margin:0 0 4px;font-size:18px">사용 기록</h2>
      <div class="muted" style="margin-bottom:10px">${esc(s.from)} ~ ${esc(s.to)} · 쓴 날 ${s.activeDays}일. 화면·버튼·비서 도구의 이름과 횟수만 이 브라우저에 남깁니다. 제목·본문·이름·질문 내용은 적지 않고, 어디로도 보내지 않습니다.</div>
      ${usageOn() ? '' : '<div class="box warn" style="margin-bottom:10px">기록이 꺼져 있습니다. 아래 버튼으로 다시 켤 수 있습니다.</div>'}
      <h3 style="margin:12px 0 4px;font-size:14px">자주 하는 일</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${s.journeys.map(j => `<tr style="border-top:1px solid var(--line)"><td style="padding:5px 4px">${esc(j.label)}</td><td style="text-align:right;white-space:nowrap">${j.total}회</td></tr>`).join('')}</tbody></table>
      <h3 style="margin:14px 0 4px;font-size:14px">많이 연 화면</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${list(s.views, viewLabel)}</tbody></table>
      ${s.unusedViews.length ? `<div class="muted" style="margin-top:6px">한 번도 열지 않은 화면: ${esc(s.unusedViews.map(viewLabel).join(', '))}</div>` : ''}
      <h3 style="margin:14px 0 4px;font-size:14px">비서에게 시킨 일</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${list(s.tools, toolLabel)}</tbody></table>
      <div class="acts" style="margin-top:14px"><button class="btn sm" data-act="usageExport">파일로 내보내기</button><button class="btn sm" data-act="usageCopy">복사</button><button class="btn sm" data-act="usageToggle">${usageOn() ? '기록 끄기' : '기록 켜기'}</button><button class="btn sm danger" data-act="usageClear">기록 지우기</button></div></div></div>`;
  }
  HOME_ACTS.openUsage = () => openUsage();
  HOME_ACTS.usageExport = () => { const {log, opt} = usageData(USAGE_EXPORT_DAYS); download(`GW 비서_사용기록_${R.usageDay()}.md`, R.usageReport(log, opt), 'text/markdown;charset=utf-8'); toast('사용 기록 파일을 만들었습니다.'); };
  HOME_ACTS.usageCopy = () => { const {log, opt} = usageData(USAGE_EXPORT_DAYS); copyText(R.usageReport(log, opt)); toast('사용 기록을 복사했습니다.'); };
  HOME_ACTS.usageToggle = () => { S.settings.usageLog = !usageOn(); saveLocal(); toast(usageOn() ? '사용 기록을 켰습니다.' : '사용 기록을 껐습니다. 이미 적힌 기록은 남아 있습니다.'); openUsage(); };
  HOME_ACTS.usageClear = () => { store.set('usage', {v: 1, days: {}}); toast('사용 기록을 지웠습니다.'); openUsage(); };
  const USAGE_EXPORT_DAYS = 60;
