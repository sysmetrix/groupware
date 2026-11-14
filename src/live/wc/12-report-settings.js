// GW 비서 · 보고서
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ----- 보고서 -----
  function vReport() {
    return `${pgh('보고서', '한글(HWP)·워드에 붙여넣으면 굵게·표가 유지됩니다')}
<div class="cards"><div class="card2"><div class="ct">주간 업무 실적 초안</div><div class="muted">최근 7일 상신문서와 내가 접수한 문서로 만듭니다.</div><div class="acts"><button class="btn primary" data-act="mkWeekly">${ic('report')}${S.weekly ? '다시 만들기' : '초안 만들기'}</button>${S.weekly ? `<button class="btn" data-act="richWeekly">한글용 복사</button><button class="btn" data-act="dlWeekly">${ic('down')}TXT 저장</button>` : ''}</div></div>
<div class="card2"><div class="ct">오늘 브리핑</div><div class="muted">처리할 일과 참고 항목을 한 장으로 정리합니다.</div><div class="acts"><button class="btn primary" data-act="richBrief">한글용 복사</button><button class="btn" data-act="printBrief">인쇄·PDF</button><button class="btn" data-act="dlBrief">${ic('down')}HTML 저장</button><button class="btn" data-act="csvQueue">${ic('down')}엑셀(CSV)</button></div></div></div>
${store.get('weeklyRecovery', null) ? `<div class="box warn">다른 탭에서 작성한 주간 보고 초안이 보관되어 있습니다. <button class="btn sm" data-act="recoverWeekly">보관 초안 복구</button></div>` : ''}
<h2>주간 업무 실적 초안 <span class="saved on" id="wkSaved">${ic('check')}자동 저장됨</span></h2><textarea id="weekly" aria-label="주간 업무 실적 초안" rows="${Math.min(30, Math.max(10, S.weekly.split('\n').length + 2))}">${esc(S.weekly)}</textarea>
<h2>오늘 브리핑 미리보기</h2><iframe id="briefFrame" title="오늘 브리핑" sandbox="allow-popups allow-popups-to-escape-sandbox allow-modals" style="width:100%;height:640px;border:1px solid var(--line);border-radius:12px;background:#fff"></iframe>`;
  }
  const weeklyHtml = text => `<div style="font-family:'함초롬바탕','맑은 고딕',serif;font-size:11pt;line-height:1.7">${text.split('\n').map(l => l.startsWith('□') ? `<p><b>${esc(l)}</b></p>` : l.startsWith('○') ? `<p style="margin-left:10pt"><b>${esc(l)}</b></p>` : l.startsWith('  -') ? `<p style="margin-left:24pt">${esc(l.trim())}</p>` : l.startsWith('※') ? `<p style="color:#666;font-size:9pt">${esc(l)}</p>` : l ? `<p>${esc(l)}</p>` : '').join('')}</div>`;
  const briefHtml = () => {
    const a = S.a, m = a.summary.mine || {};
    const rows = mineVisible().slice(0, 30).map(x => `<tr><td>${STATE_NAME[stateOf(x)]}</td><td>${esc(x.title)}</td><td>${esc(x.headline || x.kind)}</td><td>${esc(x.deadline ? x.deadline.date.slice(5) + ' ' + ddayText(x.deadline.dday) : '')}</td></tr>`).join('');
    return `<p><b>업무 브리핑 (${esc(R.kstNow(new Date(a.collectedAt)).date)} ${hhmm(new Date(a.collectedAt))} 기준)</b></p><p>내 처리할 일 ${m.total ?? mineVisible().length}건(급함 ${m.urgent ?? 0} · 할 일 ${m.todo ?? 0} · 확인 ${m.check ?? 0}), 참고 ${a.summary.ref ?? 0}건, 남은 연차 ${fmtDays(a.summary.leaveRemaining)}</p><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-size:10pt"><tr><th>구분</th><th>내용</th><th>해야 할 일</th><th>기한</th></tr>${rows}</table>`;
  };

  // ----- 설정 (바꾸는 즉시 자동 저장) -----
  function vSettings() {
    const st = S.settings;
    const hasMini = !!localStorage.getItem('bwyfgw:wc:src') || !!localStorage.getItem(LS + 'src') || !!window.BWYFGW_POLICY || !!document.documentElement.dataset.bwyfgwExt;
    const perm = 'Notification' in window ? ({granted: '허용됨', denied: '브라우저에서 막혀 있음', default: '아직 묻지 않음'}[Notification.permission] || '') : '이 브라우저는 지원하지 않음';
    const r = rel();
    const ruleChips = (l, name) => r[l].length ? `<div style="margin-top:8px"><span class="muted">${name}</span> ${r[l].map((q, i) => `<span class="chip">${esc(q.label || q.v)}<button class="btn sm ghost icon" style="height:22px;width:22px" data-act="delRule" data-l="${l}" data-i="${i}" aria-label="지우기">${ic('x')}</button></span>`).join(' ')}</div>` : '';
    const usedKB = (() => { let n = 0; try { const p = getPrefix(); for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(p)) n += (localStorage.getItem(k) || '').length; } } catch {} return Math.round(n / 1024); })();
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
    return `${pgh('설정', '바꾸는 즉시 저장됩니다', `<span class="saved" id="setSaved">${ic('check')}저장됨</span>`)}
<div class="set">
<div class="si"><b>내 업무 범위</b><div><label><input type="checkbox" class="setc" data-k="roles.deptReceiver" ${st.roles?.deptReceiver ? 'checked' : ''}>부서 접수는 내 업무</label><label><input type="checkbox" class="setc" data-k="roles.distributor" ${st.roles?.distributor ? 'checked' : ''}>문서 배부는 내 업무</label><label><input type="checkbox" class="setc" data-k="roles.sender" ${st.roles?.sender ? 'checked' : ''}>다른 사람 문서 발송도 내 업무</label><div class="muted">체크하지 않은 종류는 "참고"로 접혀 처리할 일에서 빠집니다.</div>${ruleChips('mute', '목록에서 뺀 것:')}${ruleChips('mine', '내 일로 지정한 것:')}</div></div>
<div class="si"><b>내 긴급 키워드</b><div><input class="inp setc" data-k="urgentWords" style="width:100%" value="${esc((st.urgentWords || []).join(', '))}" placeholder="쉼표로 구분 (예: 행정사무감사, 시의회)"><div class="muted">제목에 이 단어가 있으면 "급함"으로 올립니다.</div></div></div>
<div class="si"><b>자동 새로고침</b><div><select class="f setc" data-k="refreshMin">${[0, 3, 5, 10, 30].map(m => `<option value="${m}" ${Number(st.refreshMin) === m ? 'selected' : ''}>${m ? m + '분마다' : '끄기'}</option>`).join('')}</select> <span class="muted">작업 중에는 화면을 바꾸지 않고 "지금 반영" 안내만 띄웁니다.</span></div></div>
<div class="si"><b>새 급한 일 알림</b><div><label><input type="checkbox" class="setc" data-k="notify" ${st.notify ? 'checked' : ''}>바탕화면 알림 보내기</label><span class="muted">알림 권한: ${perm}</span></div></div>
<div class="si"><b>보기</b><div><select class="f setc" data-k="fontSize" aria-label="글자 크기">${[['s', '글자 작게'], ['m', '글자 보통'], ['l', '글자 크게'], ['xl', '글자 아주 크게']].map(([v, n]) => `<option value="${v}" ${st.fontSize === v ? 'selected' : ''}>${n}</option>`).join('')}</select> <select class="f setc" data-k="theme" aria-label="테마"><option value="light" ${st.theme === 'light' ? 'selected' : ''}>밝은 화면</option><option value="dark" ${st.theme === 'dark' ? 'selected' : ''}>어두운 화면</option></select></div></div>
<div class="si"><b>키보드 단축키</b><div><label><input type="checkbox" class="setc" data-k="singleKeyShortcuts" ${st.singleKeyShortcuts !== false ? 'checked' : ''}>단일 문자 단축키(1~9, H, R, E, X, S 등) 사용</label><div class="muted">끄면 입력창 밖에서 한 글자 키를 눌렀을 때 화면 이동·완료·숨기기가 실행되지 않습니다(Alt+G, Ctrl+K, Esc는 유지).</div></div></div>
<div class="si"><b>예산 관심 사업</b><div><div id="budgetRows">${st.budget.map((b, i) => `<div class="bar"><input class="inp" data-b="label" data-i="${i}" value="${esc(b.label || '')}" placeholder="이름 (예: 전략경영실 운영)" style="flex:1"><input class="inp" data-b="project" data-i="${i}" value="${esc(b.project)}" placeholder="사업 코드" style="width:110px" title="예실대비현황의 프로젝트 코드"><input class="inp" data-b="filter" data-i="${i}" value="${esc(b.filter || '')}" placeholder="세부 코드(선택)" style="width:130px"><button class="btn sm ghost icon" data-act="budgetRowDel" data-i="${i}" aria-label="삭제">${ic('x')}</button></div>`).join('')}</div><button class="btn sm" data-act="budgetRowAdd">${ic('plus')}직접 추가</button> <button class="btn sm primary" data-act="goBudgetPick">예산 화면에서 목록 보고 고르기</button></div></div>
<div class="si"><b>받은메일 읽는 수</b><div><select class="f setc" data-k="mailCount">${[50, 100, 200].map(n => `<option value="${n}" ${Number(st.mailCount) === n ? 'selected' : ''}>최근 ${n}통</option>`).join('')}</select></div></div>
</div>
<h2>다른 PC로 설정 옮기기</h2>
<div class="set"><div class="si"><b>설정 파일</b><div>집·사무실처럼 PC나 브라우저가 다르면 설정이 따로 저장됩니다. 한쪽에서 <b>내보내기</b>로 파일을 만들고, 다른 쪽에서 <b>가져오기</b>로 불러오면 같은 설정이 됩니다.<div class="muted">옮기는 것: 내 업무 범위, 긴급 키워드, 새로고침·알림, 글자 크기·테마, 예산 관심 사업, 구글 일정(계정·캘린더·색). 옮기지 않는 것: AI 키, 할 일·숨기기·미루기 같은 작업 자료, 그룹웨어 로그인 정보. 파일에 구글 이메일과 캘린더 ID가 들어 있으니 본인 PC와 메일로만 옮기세요.</div><div class="acts"><button class="btn sm primary" data-act="setExport">설정 내보내기</button><button class="btn sm" data-act="setImport">설정 가져오기</button><input type="file" id="setImportFile" accept=".json,application/json" hidden></div></div></div></div>
<h2>이 PC에 저장된 자료</h2>
<div class="set"><div class="si"><b>저장 내용</b><div>숨기기·미루기 표시, 내 할 일, 설정, 최근 처리 기록(최대 40일)과 배부 추천용 이력(12시간 보관)이 이 브라우저에만 저장됩니다. 내 자료 약 ${usedKB}KB · 브라우저 전체(미리보기 캐시 포함) 약 ${originStat.allKB}K자(5M 한도의 ${originStat.allPct}%)${originStat.synapCnt ? ` · 그룹웨어 문서 미리보기 캐시 ${originStat.synapKB}K자(${originStat.synapCnt}건)` : ''}.${S.storageError ? ' <b class="err">저장 공간이 부족합니다. 아래 버튼으로 캐시를 비우세요.</b>' : ''} 로그인 정보는 저장하지 않습니다. 여러 사람이 쓰는 PC라면 다 쓴 뒤 지워 주세요.<div class="acts"><button class="btn sm" data-act="resetDone">숨기기·미루기 초기화</button><button class="btn sm" data-act="resetRouting">추천 이력 지우기</button>${originStat.synapCnt ? `<button class="btn sm" data-act="cleanSynap">문서 미리보기 캐시 정리 (${originStat.synapKB}K)</button>` : ''}<button class="btn sm danger" data-act="resetAll">GW 비서 자료 모두 지우기</button></div></div></div>
<div class="si"><b>관리·진단</b><div>저장된 자료 확인·삭제, 감사 기록 무결성, 환경 진단을 볼 수 있습니다.<div class="acts"><button class="btn sm" data-act="openData">데이터 관리</button><button class="btn sm" data-act="openDiag">진단</button><button class="btn sm" data-act="openChangelog">업데이트 내역</button></div></div></div>
<div class="si"><b>설치</b><div>${hasMini ? '이 브라우저에 설치되어 있습니다. 그룹웨어 화면 위 가운데 "GW 비서" 버튼이나 Alt+G로 엽니다.' : '설치 북마크로 한 번 실행하면 이 브라우저에 저장됩니다.'}<details style="margin-top:6px"><summary class="muted" style="cursor:pointer">버전 정보</summary><div class="muted">GW 비서 ${VERSION} · 수집기 ${esc(GW.version)} · 조회 전용 연결 ${GW.readOnlyEndpoints().length}개${S.errors && S.errors.length ? ` · 최근 오류 ${S.errors.length}건 <button class="btn sm" data-act="copyErrors">오류 기록 복사</button>` : ''}</div></details></div></div></div>`;
  }
  function saveSettingField(el) {
    const st = S.settings, k = el.dataset.k;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    if (k.startsWith('roles.')) { st.roles = {...(st.roles || {}), [k.slice(6)]: v}; if (S.raw) reanalyze(); }
    else if (k === 'urgentWords') { st.urgentWords = String(v).split(',').map(w => w.trim()).filter(Boolean); if (S.raw) reanalyze(); }
    else if (k === 'refreshMin' || k === 'mailCount') { st[k] = Number(v); if (k === 'refreshMin') schedule(); }
    else if (k === 'notify') { st.notify = v; if (v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => { if (S.view === 'settings') renderMain(); }); }
    else st[k] = v;
    saveLocal(); applyLook();
    const s = $('#setSaved'); if (s) { s.classList.add('on'); clearTimeout(saveSettingField.t); saveSettingField.t = setTimeout(() => s.classList.remove('on'), 1600); }
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
  function saveBudgetRows() {
    const rows = {};
    root.querySelectorAll('#budgetRows input').forEach(i => { (rows[i.dataset.i] = rows[i.dataset.i] || {})[i.dataset.b] = i.value.trim(); });
    const saved = $('#setSaved');
    if (saved) saved.classList.remove('on');
    const invalid = Object.values(rows).some(b => !/^[A-Za-z0-9가-힣]+$/.test(b.project || ''));
    if (invalid) {
      toast('예산 사업 코드를 확인하세요. 영문·숫자·한글만 입력할 수 있으며, 수정 전까지 저장하지 않습니다.');
      return;
    }
    const list = Object.values(rows).map(b => ({project: b.project, filter: b.filter || '', label: b.label || ''}));
    S.settings.budget = list; S.budget.table = null;
    if (!saveLocal()) {
      toast('예산 설정을 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인한 뒤 다시 시도하세요.');
      return;
    }
    if (saved) { saved.classList.add('on'); setTimeout(() => saved.classList.remove('on'), 1600); }
  }

