// GW 비서 · 버전과 업데이트 내역
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  function openChangelog() {
    S.paletteOpen = true;
    const up = store.get('updateInfo', null);
    const upOk = up && /^\d+\.\d+\.\d+$/.test(up.latest || '');
    const newer = upOk && R.compareVersions(up.latest, VERSION) > 0;
    const rows = R.CHANGELOG.map((c, i) => `<details ${i < 3 ? 'open' : ''} style="border-top:1px solid var(--line);padding:8px 0"><summary style="cursor:pointer;display:flex;gap:10px;align-items:center"><b style="min-width:62px">v${esc(c.v)}</b><span class="muted" style="min-width:118px">${esc(c.date)}</span><span>${esc(c.title)}${c.v === VERSION ? ' <span class="bdg confirm">현재</span>' : ''}${c.old ? ` <span class="bdg info">${/^\d/.test(c.old) ? '이전 v' : ''}${esc(c.old)}</span>` : ''}</span></summary>${c.items.length ? `<ul style="margin:6px 0 2px 24px;line-height:1.7">${c.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<div class="muted" style="margin:6px 0 2px 24px;font-size:13px">자세한 내용은 <a href="https://github.com/sysmetrix/groupware/releases" target="_blank" rel="noopener">릴리스 기록</a>에 있습니다.</div>`}</details>`).join('');
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(720px,95vw);padding:22px 24px;max-height:88vh;overflow:auto" role="dialog" aria-label="업데이트 내역"><button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
      <h2 style="margin:0 0 4px;font-size:18px">업데이트 내역</h2>
      <div style="margin-bottom:10px">설치된 버전 <b>v${esc(VERSION)}</b> · 수집기 v${esc(GW.version)}${(() => { const v = versionInfo(); return v.applied ? ` · ${esc(v.applied)} 적용${v.from ? ` (이전 v${esc(v.from)})` : ''}` : ''; })()} ${newer ? `<span class="bdg urgent">새 버전 v${esc(up.latest)} 있음</span>` : upOk ? '<span class="bdg confirm">최신 버전</span>' : '<span class="bdg info">최신 여부 확인 전</span>'}
        <div class="acts" style="margin-top:6px">${newer ? `<button class="btn sm primary" data-act="updateNow">${ic('refresh')}지금 v${esc(up.latest)}(으)로 바꾸기</button>` : ''}<button class="btn sm" data-act="govUpdate">업데이트 확인</button><a class="btn sm" href="https://sysmetrix.github.io/groupware/" target="_blank" rel="noopener">${ic('ext')}시작 페이지 열기</a></div>${newer ? '<div class="muted" style="font-size:12.5px;margin-top:6px">누르면 이 화면에서 바로 새 버전으로 바뀝니다. 설정과 할 일은 그대로 남습니다. 자동 업데이트가 켜져 있으면 GW 비서를 닫았을 때 저절로 바뀝니다.</div>' : ''}</div>
      <div class="muted" style="font-size:12.5px;margin:4px 0 8px">버전 번호는 0.1.0부터 다시 매겼습니다. 옛 표기(v3·v4·v5)는 각 줄의 “이전”에 남겨 두었습니다. 모두 ${R.CHANGELOG_ALL || R.CHANGELOG.length}개 버전${R.CHANGELOG_ALL > R.CHANGELOG.length ? `, 여기에는 최근 ${R.CHANGELOG.length}개만 싣습니다. 이전 내역: <a href="https://github.com/sysmetrix/groupware/releases" target="_blank" rel="noopener">GitHub 릴리스</a>` : ''}.</div>
      ${rows}</div></div>`;
  }
