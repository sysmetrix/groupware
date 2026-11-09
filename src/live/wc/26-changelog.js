// GW 통합 업무센터 · 버전과 업데이트 내역
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  function openChangelog() {
    S.paletteOpen = true;
    const up = store.get('updateInfo', null);
    const newer = up && up.latest && R.compareVersions(up.latest, VERSION) > 0;
    const rows = R.CHANGELOG.map((c, i) => `<details ${i < 3 ? 'open' : ''} style="border-top:1px solid var(--line);padding:8px 0"><summary style="cursor:pointer;display:flex;gap:10px;align-items:center"><b style="min-width:62px">v${esc(c.v)}</b><span class="muted" style="min-width:84px">${esc(c.date)}</span><span>${esc(c.title)}${c.v === VERSION ? ' <span class="bdg confirm">현재</span>' : ''}</span></summary><ul style="margin:6px 0 2px 24px;line-height:1.7">${c.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('');
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(720px,95vw);padding:22px 24px;max-height:88vh;overflow:auto" role="dialog" aria-label="업데이트 내역"><button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
      <h2 style="margin:0 0 4px;font-size:18px">업데이트 내역</h2>
      <div style="margin-bottom:10px">설치된 버전 <b>v${esc(VERSION)}</b> · 수집기 v${esc(GW.version)} ${newer ? `<span class="bdg urgent">새 버전 v${esc(up.latest)} 있음</span>` : up && up.latest ? '<span class="bdg confirm">최신 버전</span>' : '<span class="muted">최신 여부는 진단에서 확인</span>'}
        <div class="acts" style="margin-top:6px"><button class="btn sm" data-act="govUpdate">업데이트 확인</button><a class="btn sm" href="https://github.com/sysmetrix/groupware/releases/latest" target="_blank" rel="noopener">${ic('ext')}최신 릴리스 열기</a></div></div>
      ${rows}</div></div>`;
  }
