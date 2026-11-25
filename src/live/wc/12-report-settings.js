// GW 비서 · 보고서
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ----- 보고서 -----
  function vReport() {
    const w = reportState(), a = S.a, range = w.range;
    const draft = !!S.weekly.trim(), period = draft && R.weeklyDraftPeriod(S.weekly);
    const saved = S.storageError ? '저장 실패 · 내용을 복사하세요' : draft ? '이 브라우저에 저장됨' : '작성 전';
    const btn = (act, label) => `<button type="button" class="btn sm" data-act="${act}">${label}</button>`;
    return `${pgh('보고·현황', '주간 보고와 오늘 업무')}
<div class="rp-layout"><section class="rp-sec" aria-labelledby="rpWeeklyTitle"><div class="rp-h"><div><h2 id="rpWeeklyTitle">주간 업무 실적 초안</h2><p>선택한 기간의 상신·접수 자료로 작성합니다. 그룹웨어에는 제출되지 않습니다.</p></div><span class="saved on" id="wkSaved" role="status">${saved}</span></div>
<div class="rp-range" role="group" aria-label="조회 기간"><div class="acts">${[['week','이번 주'],['last','지난주'],['recent','최근 7일']].map(([v,t])=>`<button type="button" class="btn sm" data-act="wkPreset" data-v="${v}">${t}</button>`).join('')}</div><div class="rp-dates"><div class="rp-date"><span class="muted">시작일</span>${typeof dateField === 'function' ? dateField('wkFrom', range.from, '시작일', {maxOf: 'wkTo'}) : `<input class="inp" type="date" id="${'wkFrom'}" value="${esc(range.from)}" aria-label="시작일">`}</div><div class="rp-date"><span class="muted">종료일</span>${typeof dateField === 'function' ? dateField('wkTo', range.to, '종료일', {minOf: 'wkFrom'}) : `<input class="inp" type="date" id="${'wkTo'}" value="${esc(range.to)}" aria-label="종료일">`}</div><button type="button" class="btn sm primary" data-act="mkWeekly" ${w.busy ? 'disabled' : ''}>${w.busy ? '조회 중…' : '이 기간으로 초안 만들기'}</button></div><p id="wkStatus" class="muted" role="status">${esc(w.note)}</p></div>
<div class="rp-editor"><div class="rp-h"><label for="weekly"><b>초안 편집</b> ${period ? `<span class="rp-period">${esc(period.label)}${period.stale ? ' · 지난 초안' : ''}</span>` : ''}</label><div class="acts">${btn('richWeekly','주간 초안 복사')}${btn('dlWeekly','초안 TXT 저장')}${store.get('weeklyRecovery', null)?.text?.trim() ? btn('recoverWeekly','이전 초안 복구') : ''}</div></div><textarea id="weekly" aria-label="주간 업무 실적 초안 편집" rows="12" spellcheck="false" placeholder="기간을 골라 초안을 만들거나 직접 작성하세요.">${esc(S.weekly)}</textarea></div></section>
<section class="rp-sec" aria-labelledby="rpBriefTitle"><div class="rp-h"><div><h2 id="rpBriefTitle">오늘 브리핑</h2><p>${esc(briefCoverage('최근 조회 목록'))}</p></div><div class="acts">${btn('richBrief','브리핑 요약 복사')}${btn('printBrief','인쇄·PDF')}${btn('dlBrief','브리핑 HTML 저장')}${btn('csvQueue','할 일 목록 CSV')}</div></div><div class="rp-metrics">${[['처리·확인',a.summary.mine?.total],['급한 일',a.summary.mine?.urgent],['참고',a.summary.ref]].map(([t,n])=>`<div><span>${t}</span><b>${n ?? '—'}</b></div>`).join('')}</div><details id="briefDetails" ${w.details ? 'open' : ''}><summary>상세 브리핑 보기</summary><div class="rp-preview">${w.details ? briefFrame() : ''}</div></details></section></div>`;
  }
  const briefFrame = () => '<iframe id="briefFrame" class="rp-frame" title="상세 브리핑" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>';
  function renderBriefFrame() {
    const f = $('#briefFrame');
    if (!f) return;
    const cs = getComputedStyle(wcEl), vars = ['card','fg','muted','line','accent','hi','md','ok'].map(n => '--' + n + ':' + cs.getPropertyValue('--' + n).trim()).join(';');
    f.srcdoc = briefExportHtml().replace('</head>', `<style>:root{${vars};--bg:var(--card);color-scheme:${wcEl.classList.contains('dark') ? 'dark' : 'light'}}main{max-width:none;padding:12px;overflow:auto}h1{display:none}</style></head>`);
  }
  const weeklyHtml = text => `<div style="font-family:'함초롬바탕','맑은 고딕',serif;font-size:11pt;line-height:1.7">${text.split('\n').map(l => l.startsWith('□') ? `<p><b>${esc(l)}</b></p>` : l.startsWith('○') ? `<p style="margin-left:10pt"><b>${esc(l)}</b></p>` : l.startsWith('  -') ? `<p style="margin-left:24pt">${esc(l.trim())}</p>` : l.startsWith('※') ? `<p style="color:#666;font-size:9pt">${esc(l)}</p>` : l ? `<p>${esc(l)}</p>` : '').join('')}</div>`;
  function reportCollectedAt(value) {
    const ms = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(ms) ? new Date(ms + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ') + ' KST' : '확인 불가';
  }
  function weeklyExportText() {
    const text = S.weekly;
    const period = typeof R.weeklyDraftPeriod === 'function' ? R.weeklyDraftPeriod(text) : null;
    return [
      !/^\[보고 기간:/m.test(text) && `[보고 기간: ${period?.label || '확인 불가'}]`,
      !/^\[자료 조회 기준:/m.test(text) && '[자료 조회 기준: 확인 불가]',
      !/^\[자료 범위:/m.test(text) && '[자료 범위: 확인 불가 · 원본과 대조 필요]',
      text,
    ].filter(Boolean).join('\n');
  }
  function briefCoverage(scope) {
    const a = S.a, failed = (a.failed || []).map(f => f.name).filter(Boolean);
    const missing = a.sessionExpired || (a.failed || []).length || a.status?.some(x => !x.ok);
    return `자료 조회 기준: ${reportCollectedAt(a.collectedAt)} · ${scope} · ${missing ? `일부 자료 미조회${failed.length ? ': ' + failed.join(', ') : ''}${a.sessionExpired ? ' (로그인 필요)' : ''} — 미조회는 0건이 아닙니다.` : '그룹웨어에서 수집된 목록 기준이며 원본 전체가 아닙니다.'}`;
  }
  const briefExportHtml = () => R.renderHtml(S.a).replace('<h1>그룹웨어 업무 브리핑</h1>', title => `${title}<p class="muted">${esc(briefCoverage('브리핑 조회 자료 · 최근 목록 및 표시 한도 적용'))}</p>`);
  const briefExportText = () => briefCoverage('브리핑 조회 자료 · 요약 및 표시 한도 적용') + '\n\n' + R.renderMarkdown(S.a);
  const briefHtml = () => {
    const a = S.a, m = a.summary.mine || {}, visible = mineVisible();
    const rows = visible.slice(0, 30).map(x => `<tr><td>${STATE_NAME[stateOf(x)]}</td><td>${esc(x.title)}</td><td>${esc(x.headline || x.kind)}</td><td>${esc(x.deadline ? x.deadline.date.slice(5) + ' ' + ddayText(x.deadline.dday) : '')}</td></tr>`).join('');
    return `<p><b>그룹웨어 업무 브리핑 요약</b></p><p>${esc(briefCoverage(`현재 화면의 내 업무 ${visible.length}건 중 ${Math.min(30, visible.length)}건 표시`))}</p><p>내 처리할 일 ${m.total ?? visible.length}건(급함 ${m.urgent ?? 0} · 할 일 ${m.todo ?? 0} · 확인 ${m.check ?? 0}), 참고 ${a.summary.ref ?? 0}건, 남은 연차 ${fmtDays(a.summary.leaveRemaining)}</p><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-size:10pt"><tr><th>구분</th><th>내용</th><th>해야 할 일</th><th>기한</th></tr>${rows}</table>`;
  };

  // ----- 설정 (바꾸는 즉시 자동 저장) -----
  function vSettings() {
    const st = S.settings;
    const hasMini = !!localStorage.getItem('bwyfgw:wc:src') || !!window.BWYFGW_POLICY || !!document.documentElement.dataset.bwyfgwExt;
    const perm = 'Notification' in window ? ({granted: '허용됨', denied: '브라우저에서 막혀 있음', default: '아직 묻지 않음'}[Notification.permission] || '') : '이 브라우저는 지원하지 않음';
    const r = rel();
    const ruleChips = (l, name) => r[l].length ? `<div style="margin-top:8px"><span class="muted">${name}</span> ${r[l].map((q, i) => `<span class="chip">${esc(q.label || q.v)}<button class="btn sm ghost icon" style="height:22px;width:22px" data-act="delRule" data-l="${l}" data-i="${i}" aria-label="지우기">${ic('x')}</button></span>`).join(' ')}</div>` : '';
    const usedKB = (() => { let n = 0; try { const p = getPrefix(); for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(p)) n += (localStorage.getItem(k) || '').length * 2; } } catch {} return Math.round(n / 1024); })();
    const originStat = (() => {
      let all = 0, synap = 0, synapCnt = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          const len = (localStorage.getItem(k) || '').length;
          all += len;
          if (k.startsWith('synap_')) { synap += len; synapCnt++; }
        }
      } catch {}
      return {allPct: Math.min(100, Math.round(all / 52428.8)), allKB: Math.round(all / 1024), synapKB: Math.round(synap / 1024), synapCnt};
    })();
    return `${pgh('설정', '변경한 설정은 이 브라우저에 자동 저장됩니다.', `<span class="saved${S.storageError ? ' on' : ''}" id="setSaved" role="status" aria-live="polite">${S.storageError ? '저장 실패 · 변경값을 확인하세요' : ''}</span>`)}
<section aria-label="업무·조회"><h2>업무·조회</h2><div class="set">
<div class="si"><b>내 업무 범위</b><div><label><input type="checkbox" class="setc" data-k="roles.deptReceiver" ${st.roles?.deptReceiver ? 'checked' : ''}>부서 접수는 내 업무</label><label><input type="checkbox" class="setc" data-k="roles.distributor" ${st.roles?.distributor ? 'checked' : ''}>문서 배부는 내 업무</label><label><input type="checkbox" class="setc" data-k="roles.sender" ${st.roles?.sender ? 'checked' : ''}>다른 사람 문서 발송도 내 업무</label><div class="muted">체크하지 않은 종류는 "참고"로 접혀 처리할 일에서 빠집니다.</div>${ruleChips('mute', '목록에서 뺀 것:')}${ruleChips('mine', '내 일로 지정한 것:')}</div></div>
<div class="si"><b>내 긴급 키워드</b><div><input class="inp setc" data-k="urgentWords" aria-label="내 긴급 키워드" style="width:100%" value="${esc((st.urgentWords || []).join(', '))}" placeholder="쉼표로 구분 (예: 행정사무감사, 시의회)"><div class="muted">제목에 이 단어가 있으면 "급함"으로 올립니다.</div></div></div>
<div class="si"><b>자동 새로고침</b><div><select class="f setc" data-k="refreshMin" aria-label="자동 새로고침 주기">${[0, 3, 5, 10, 30].map(m => `<option value="${m}" ${Number(st.refreshMin) === m ? 'selected' : ''}>${m ? m + '분마다' : '끄기'}</option>`).join('')}</select> <span class="muted">작업 중에는 화면을 바꾸지 않고 "지금 반영" 안내만 띄웁니다.</span></div></div>
<div class="si"><b>받은메일 읽는 수</b><div><select class="f setc" data-k="mailCount" aria-label="받은메일 읽는 수">${[50, 100, 200].map(n => `<option value="${n}" ${Number(st.mailCount) === n ? 'selected' : ''}>최근 ${n}통</option>`).join('')}</select></div></div>
</div></section>
<section aria-label="화면·알림·업데이트"><h2>화면·알림·업데이트</h2><div class="set">
<div class="si"><b>새 급한 일 알림</b><div><label><input type="checkbox" class="setc" data-k="notify" ${st.notify ? 'checked' : ''}>바탕화면 알림 보내기</label><span class="muted">알림 권한: ${perm}</span></div></div>
<div class="si"><b>보기</b><div><select class="f setc" data-k="fontSize" aria-label="글자 크기">${[['s', '글자 작게'], ['m', '글자 보통'], ['l', '글자 크게'], ['xl', '글자 아주 크게']].map(([v, n]) => `<option value="${v}" ${st.fontSize === v ? 'selected' : ''}>${n}</option>`).join('')}</select> <select class="f setc" data-k="theme" aria-label="테마"><option value="light" ${st.theme === 'light' ? 'selected' : ''}>밝은 화면</option><option value="dark" ${st.theme === 'dark' ? 'selected' : ''}>어두운 화면</option></select></div></div>
<div class="si"><b>자동 업데이트</b><div><label><input type="checkbox" class="setc" data-k="autoUpdate" ${st.autoUpdate !== false ? 'checked' : ''}>새 버전이 나오면 자동으로 바꾸기</label><div class="muted">쓰는 중에는 바꾸지 않고, GW 비서를 닫았을 때나 그룹웨어를 새로 열 때 바뀝니다. 설정과 할 일은 그대로 남습니다. 끄면 업데이트 내역의 "지금 바꾸기"로 직접 바꿉니다.</div></div></div>
<div class="si"><b>키보드 단축키</b><div><label><input type="checkbox" class="setc" data-k="singleKeyShortcuts" ${st.singleKeyShortcuts !== false ? 'checked' : ''}>단일 문자 단축키(1~9, H, R, E, X, S 등) 사용</label><div class="muted">끄면 입력창 밖에서 한 글자 키를 눌렀을 때 화면 이동·완료·숨기기가 실행되지 않습니다(Alt+G, Ctrl+K, Esc는 유지).</div></div></div>
</div></section>
<section aria-label="예산"><h2>예산</h2><div class="set">
<div class="si"><b>예산 관심 사업</b><div><div id="budgetRows">${budgetSettingRows().map((b, i) => [b, i]).sort((x, y) => (x[0].project ? 0 : 1) - (y[0].project ? 0 : 1) || x[1] - y[1]).map(([b, i]) => `<div class="bar"><input class="inp" data-b="label" aria-label="관심 사업 ${i + 1} 이름" data-i="${i}" value="${esc(b.label || '')}" placeholder="이름 (예: 전략경영실 운영)" style="flex:1"><input class="inp" data-b="project" aria-label="관심 사업 ${i + 1} 코드" data-i="${i}" value="${esc(b.project)}" placeholder="사업 코드" style="width:110px" title="예실대비현황의 프로젝트 코드"><input class="inp" data-b="filter" aria-label="관심 사업 ${i + 1} 세부 코드" data-i="${i}" value="${esc(b.filter || '')}" placeholder="세부 코드(선택)" style="width:130px"><button class="btn sm ghost icon" data-act="budgetRowDel" data-i="${i}" aria-label="관심 사업 ${i + 1} 삭제">${ic('x')}</button></div>`).join('')}</div><button class="btn sm" data-act="budgetRowAdd">${ic('plus')}직접 추가</button> <button class="btn sm" data-act="goBudgetPick">예산 화면에서 목록 보고 고르기</button></div></div>
</div></section>
<section aria-label="다른 PC로 설정 옮기기"><h2>다른 PC로 설정 옮기기</h2>
<div class="set"><div class="si"><b>설정 전용 파일</b><div>지원되는 설정만 JSON 파일로 옮깁니다. 자료 백업이 아닙니다.<div class="muted">예: 내 업무 범위와 분류 규칙, 알림, 화면 설정, 예산 관심 사업, 구글 일정 설정. 할 일·숨기기·미루기 같은 작업 자료, 그룹웨어 원본과 로그인 정보, AI 키는 포함되지 않습니다. 구글 이메일과 캘린더 ID가 포함될 수 있으니 파일을 공유하지 마세요.</div><div class="acts"><button class="btn sm" data-act="setExport">설정만 내보내기 (JSON)</button><button class="btn sm" data-act="setImport">설정 가져오기</button><input type="file" id="setImportFile" accept=".json,application/json" hidden></div></div></div></div></section>
<section aria-label="이 PC에 저장된 자료"><h2>이 PC에 저장된 자료</h2>
<div class="set"><div class="si"><b>저장 내용</b><div>숨기기·미루기 표시, 로컬 할 일, 설정, 최근 처리 기록(최대 40일)과 배부 추천용 이력(12시간 보관)이 이 브라우저에 저장됩니다. 내 자료 약 ${usedKB}KB · 브라우저 전체(미리보기 캐시 포함) 약 ${originStat.allKB}K자(5M 한도의 ${originStat.allPct}%)${originStat.synapCnt ? ` · 그룹웨어 문서 미리보기 캐시 ${originStat.synapKB}K자(${originStat.synapCnt}건)` : ''}.${S.storageError ? ' <b class="err">저장 공간이 부족합니다. 아래 버튼으로 캐시를 비우세요.</b>' : ''} 숨기기·미루기 초기화는 보드 계획·직접 추가한 할 일·기한을 지우지 않으며 되돌릴 수 있습니다. 미완성 예산 행은 저장 전 임시 편집값입니다. 로그인 정보는 저장하지 않습니다. 여러 사람이 쓰는 PC라면 다 쓴 뒤 지워 주세요.<div class="acts"><button class="btn sm" data-act="resetDone">숨기기·미루기만 초기화</button><button class="btn sm" data-act="resetRouting">추천 이력 지우기</button>${originStat.synapCnt ? `<button class="btn sm" data-act="cleanSynap">문서 미리보기 캐시 정리 (${originStat.synapKB}K)</button>` : ''}</div></div></div></div></section>
<section aria-label="관리·진단"><h2>관리·진단</h2><div class="set">
<div class="si"><b>관리·진단</b><div>저장된 자료 확인·삭제, 감사 기록 무결성, 환경 진단을 볼 수 있습니다.<div class="acts"><button class="btn sm" data-act="openData">데이터 관리</button><button class="btn sm" data-act="openDiag">진단</button><button class="btn sm" data-act="openUsage">사용 기록</button><button class="btn sm" data-act="openChangelog">업데이트 내역</button></div></div></div>
<div class="si"><b>설치</b><div>${hasMini ? '이 브라우저에 설치되어 있습니다. 그룹웨어 화면 위 가운데 "GW 비서" 버튼이나 Alt+G로 엽니다.' : '설치 북마크로 한 번 실행하면 이 브라우저에 저장됩니다.'}<details style="margin-top:6px"><summary class="muted" style="cursor:pointer">버전 정보</summary><div class="muted">GW 비서 ${VERSION} · 수집기 ${esc(GW.version)} · 조회 전용 연결 ${GW.readOnlyEndpoints().length}개${S.errors && S.errors.length ? ` · 최근 오류 ${S.errors.length}건 <button class="btn sm" data-act="copyErrors">오류 기록 복사</button>` : ''}</div></details></div></div></div></section>
<section aria-label="위험 구역"><h2>위험 구역</h2><div class="set"><div class="si"><b>이 브라우저의 내 자료 삭제</b><div>이 브라우저에 저장된 내 GW 비서 설정·로컬 할 일·표시를 지웁니다. 그룹웨어 원본은 바뀌지 않으며, 삭제 전에 한 번 더 확인합니다.<div class="acts danger-zone"><button class="btn sm danger" data-act="resetAll">GW 비서 자료 모두 지우기</button></div></div></div></div></section>`;
  }
  function saveSettingField(el) {
    const st = S.settings, k = el.dataset.k;
    const allowed = ['roles.deptReceiver', 'roles.distributor', 'roles.sender', 'urgentWords', 'refreshMin', 'mailCount', 'notify', 'fontSize', 'theme', 'singleKeyShortcuts', 'autoUpdate'];
    if (!allowed.includes(k)) return;
    const choices = {refreshMin: ['0', '3', '5', '10', '30'], mailCount: ['50', '100', '200'], fontSize: ['s', 'm', 'l', 'xl'], theme: ['light', 'dark']};
    if (choices[k] && !choices[k].includes(String(el.value))) { settingsSaveStatus(false, '설정값을 확인하세요. 저장하지 않았습니다.'); return; }
    const v = el.type === 'checkbox' ? el.checked : el.value;
    if (k.startsWith('roles.')) { st.roles = {...(st.roles || {}), [k.slice(6)]: v}; if (S.raw) reanalyze(); }
    else if (k === 'urgentWords') { st.urgentWords = String(v).split(',').map(w => w.trim()).filter(Boolean); if (S.raw) reanalyze(); }
    else if (k === 'refreshMin' || k === 'mailCount') { st[k] = Number(v); if (k === 'refreshMin') schedule(); }
    else if (k === 'notify') { st.notify = v; if (v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => { if (S.view === 'settings') renderMain(); }); }
    else st[k] = v;
    const saved = saveLocal(); applyLook();
    settingsSaveStatus(saved);
    if (!saved) toast('설정을 저장하지 못했습니다. 현재 화면에만 반영되어 있습니다. 저장 공간과 브라우저 설정을 확인하세요.');
    renderNav(); renderHead();
  }
  // 설정 옮기기: 내보내기는 허용 목록 항목만 파일로, 가져오기는 검증 후 바뀌는 항목을 보여 주고 확인받아 덮어쓴다.
  function settingsExport() {
    download(R.setxFileName(), R.setxBuild(S.settings, {version: VERSION}), 'application/json;charset=utf-8');
    toast('설정 파일을 내려받았습니다. 다른 PC의 GW 비서 설정에서 “설정 가져오기”로 불러오세요.');
  }
  async function settingsImport(input) {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    if (f.size > 512 * 1024) { toast('설정 파일이 너무 큽니다. GW 비서에서 내보낸 파일인지 확인하세요.'); return; }
    const importKey = currentKey;
    if (getUserKey() !== importKey) { toast('계정이 변경되어 설정 가져오기를 중단했습니다.'); return; }
    let text;
    try { text = await f.text(); } catch { toast('파일을 읽지 못했습니다.'); return; }
    if (currentKey !== importKey || getUserKey() !== importKey) { toast('계정이 변경되어 설정 가져오기를 중단했습니다.'); return; }
    const r = R.setxParse(text, S.settings);
    if (!r.ok) { toast(r.error); return; }
    if (!r.changed.length) { toast('이 PC의 설정이 파일 내용과 이미 같습니다.'); return; }
    const when = r.exportedAt ? new Date(r.exportedAt).toLocaleString('ko-KR') : '';
    const msg = `${when ? when + '에 내보낸 ' : ''}설정 파일로 아래 항목을 바꿉니다.\n\n- ${r.changed.map(c => c.label).join('\n- ')}${r.skipped.length ? '\n\n형식이 맞지 않아 건너뛰는 항목: ' + r.skipped.join(', ') : ''}\n\n이 PC의 해당 설정은 파일 내용으로 덮어쓰입니다. 계속할까요?`;
    if (!confirm(msg)) return;
    const gc = r.patch.gcal ? {...r.patch.gcal, synced: r.patch.gcal.synced || (S.settings.gcal || {}).synced} : undefined;
    Object.assign(S.settings, r.patch);
    if (gc) { if (!gc.synced) delete gc.synced; S.settings.gcal = gc; }
    const saved = saveLocal(); applyLook(); schedule();
    if (S.raw) reanalyze();
    renderNav(); renderHead(); renderMain();
    if (!saved) { toast('일부 항목을 저장하지 못했습니다. 설정과 저장 공간을 확인한 뒤 다시 시도하세요.'); return; }
    toast(`설정 ${r.changed.length}개 항목을 가져왔습니다.`);
  }
  function settingsSaveStatus(ok, message = '') {
    const el = $('#setSaved');
    if (!el) return;
    clearTimeout(settingsSaveStatus.timer);
    el.classList.add('on');
    el.textContent = message || (ok ? '저장됨' : '저장 실패 · 변경값은 현재 화면에만 반영됨');
    if (ok) settingsSaveStatus.timer = setTimeout(() => el.classList.remove('on'), 1600);
  }
  let budgetSettingsDraft = null;
  function budgetSettingRows() {
    if (!budgetSettingsDraft || budgetSettingsDraft.owner !== S.settings) budgetSettingsDraft = {owner: S.settings, rows: S.settings.budget.map(b => ({...b}))};
    return budgetSettingsDraft.rows;
  }
  function readBudgetDraft() {
    const rows = [];
    root.querySelectorAll('#budgetRows input').forEach(i => { (rows[Number(i.dataset.i)] ||= {})[i.dataset.b] = i.value.trim(); });
    budgetSettingRows(); budgetSettingsDraft.rows = rows;
    return rows;
  }
  function budgetRowAdd() {
    readBudgetDraft().push({project: '', filter: '', label: ''});
    renderMain();
    settingsSaveStatus(false, '예산 행 편집 중 · 사업 코드 입력 후 저장됩니다');
  }
  function budgetRowDel(index) {
    const rows = readBudgetDraft();
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) return;
    rows.splice(index, 1); renderMain(); saveBudgetRows();
  }
  function saveBudgetRows() {
    const rows = readBudgetDraft();
    const invalid = rows.some(b => !/^[A-Za-z0-9가-힣]+$/.test(b.project || ''));
    if (invalid) {
      settingsSaveStatus(false, '예산 행 편집 중 · 저장하지 않음');
      toast('예산 사업 코드를 확인하세요. 영문·숫자·한글만 입력할 수 있으며, 수정 전까지 저장하지 않습니다.');
      return false;
    }
    const old = S.settings.budget;
    S.settings.budget = rows.map(b => ({project: b.project, filter: b.filter || '', label: b.label || ''}));
    const saved = saveLocal();
    if (!saved) {
      S.settings.budget = old;
      settingsSaveStatus(false);
      toast('예산 설정을 저장하지 못했습니다. 편집값을 유지했습니다. 저장 공간과 브라우저 설정을 확인한 뒤 다시 시도하세요.');
      return false;
    }
    S.budget.table = null;
    settingsSaveStatus(true);
    return true;
  }
  function resetDoneMarks() {
    pushUndo('숨기기·미루기 초기화');
    S.hidden = {}; S.snooze = {};
    const saved = saveLocal(); render();
    if (!saved) { toast('초기화 표시를 저장하지 못했습니다. 현재 화면에만 반영되어 있습니다.'); return; }
    toastUndo('숨기기·미루기만 지웠습니다. 보드 계획과 할 일·기한은 유지됩니다.');
  }
