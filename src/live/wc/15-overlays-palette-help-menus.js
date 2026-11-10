// GW 비서 · overlays: palette, help, menus
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- overlays: palette, help, menus ----------
  let palItems = [], palIndex = 0;
  const dispTitle = x => R.cleanTitle((x && x.title) || '');
  function openPalette(q = '') {
    S.paletteOpen = true; S.menuOpen = ''; S.helpOpen = false;
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg pal" data-stop="1"><input id="palq" placeholder="무엇을 할까요? 예) 결재, 사업 예산, 지난달 근태, 새 메일, 문서번호, 회의록" value="${esc(q)}" autocomplete="off"><div id="pallist" style="margin-top:8px"></div><div class="muted" style="margin-top:6px">↑↓ 이동 · Enter 실행 · Esc 닫기</div></div></div>`;
    const inp = $('#palq');
    inp.focus(); inp.setSelectionRange(q.length, q.length);
    palRender(q);
  }
  function palCommands(q) {
    const cmds = [];
    const qq = q.trim();
    const add = (label, hint, run, extra = '', icon = 'play') => cmds.push({label, hint, run, icon, text: label + ' ' + hint + ' ' + extra});
    const VIEW_WORDS = {today: '할 일 오늘 긴급 대시보드', approval: '배부 접수 결재 발송 열람 공문 문서유통', mail: '메일 답장 받은메일', search: '검색 찾기', board: '할 일 계획 보드', calendar: '일정 달력 기한', gcal: '구글 일정 캘린더 google calendar 내 일정', gsync: '구글 동기화 캘린더 올리기 등록 연동 근태 출장 시간외', budget: '예산 집행 결의 예실', attendance: '근태 연차 휴가 출근 퇴근', report: '보고서 주간 브리핑 실적', settings: '설정 글자 테마 알림'};
    for (const v of VIEWS) add(`${v.label}`, '화면으로 이동', () => go(v.id), VIEW_WORDS[v.id] || '', VIEW_ICON[v.id]);
    add('연속 처리 시작', '처리할 일을 하나씩', () => startFocus(), '처리 모드');
    add('새로고침', '자료 다시 읽기', () => refresh());
    add('새 메일 쓰기', '메일', () => openUrl(GW.links.compose('plain'), {title: '새 메일 쓰기'}), 'mail');
    for (const f of ((S.forms && S.forms.list) || []).filter(f => f.isStandalone !== false)) add(`새 기안: ${f.name}`, f.count ? `최근 6개월 ${f.count}번 사용` : '추천 양식', () => openUrl(f.url, {title: `새 기안: ${f.name}`}), '기안 결재작성 양식');
    add('전체 양식에서 기안', '결재작성', () => openUrl(GW.links.route(GW.routes.draft), {title: '결재작성'}), '기안 양식');
    add('근태신청', '출장·휴가·대체', () => openUrl(GW.links.route(GW.routes.attendanceRequest), {title: '근태신청'}), '휴가 출장');
    add('근태 지난달 보기', '근태·연차', () => { go('attendance'); const p = R.kstNow(new Date()); const d = new Date(Date.UTC(p.y, p.m - 2, 1)); loadAttendance(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`); });
    for (const p of S.settings.budget) add(`예산 ${p.project} ${p.filter || ''}`, p.label || '예산 집행', () => { S.budget.project = p.project; S.budget.filter = p.filter || ''; S.budget.table = null; go('budget'); });
    add('주간 업무 실적 초안', '보고서', () => { go('report'); makeWeekly(); }, '보고');
    add('오늘 브리핑 한글용 복사', '보고서', () => copyRich(briefHtml(), R.renderMarkdown(S.a)));
    add('새로 만들기', '기안·신청·메일 메뉴', () => openMenu('new', root.querySelector('[data-act=menuNew]')), '기안 작성 신청');
    add('결과보고 작성', '내 계획서에서 이어서', () => openResultPlanPicker(), '결과 보고 기안');
    add('운영·참가계획 작성', '과거 계획서 서식', () => autoStartDraft('plan'), '계획 기안');
    add('지급·지출 문서', '지급 건의·물품·지출결의', () => openPaymentHub(), '지출 지급 결의 카드 이체');
    add('근태 신청 (구분 선택)', '근태신청', () => quickAttendanceApplication(''), '출장 휴가 시간외 휴일근무 연차 반차 외출 조퇴');
    add('출장 신청', '근태신청', () => quickAttendanceApplication('trip'), '관내 관외 출장');
    add('연차·반차 신청', '근태신청', () => quickAttendanceApplication('leave'), '휴가 대체');
    add('시간외·휴일근무 신청', '근태신청', () => quickAttendanceApplication('overtime'), '연장 야근');
    if (allowed('googleCalendar')) add('구글 일정', '내 Google 캘린더 보기', () => go('gcal'), '구글 캘린더 google calendar 내 일정 스케줄');
    add('차량 예약', '자원 예약', () => go('resource'), '관용차 자원 예약');
    if (allowed('aiAssistant')) add('AI 도우미', '우선순위·질문', () => openAi(), 'gemini 인공지능');
    if (allowed('aiConsole')) add('빠른 업무 실행', '말로 시키기', () => openCommandConsole(qq), '명령 콘솔 지시');
    add('업데이트 내역', '버전', () => openChangelog(), '버전 변경');
    add('데이터 관리', '저장한 자료', () => openDataCenter(), '삭제 개인정보');
    add('진단', '오류·상태', () => openDiag(), '오류 문제');
    add('도움말', '사용법·용어', () => toggleHelp(true));
    add('글자 크게', '보기', () => fontStep(1)); add('글자 작게', '보기', () => fontStep(-1));
    add(S.settings.theme === 'dark' ? '밝은 테마' : '어두운 테마', '보기', () => toggleTheme());
    for (const x of visibleActions().slice(0, 60)) { add(dispTitle(x), x.headline || x.kind, () => { go('today'); selectAction(x.key); }, x.detail, {doc: 'doc', mail: 'mail', attendance: 'clock', notice: 'bell'}[x.type] || 'doc'); cmds[cmds.length - 1].work = isMine(x) ? 2 : 1; }
    if (/^[A-Za-z]\d{3}$/.test(qq)) add(`예산 ${qq.toUpperCase()} 조회`, '프로젝트 코드', () => { S.budget.project = qq.toUpperCase(); S.budget.filter = ''; S.budget.table = null; go('budget'); });
    if (/[가-힣A-Za-z0-9]+-\d{2,}/.test(qq)) add(`문서번호 ${qq} 찾아 열기`, '결재문서', () => findAndOpenDocNo(qq, ''));
    if (qq.length >= 2) add(`통합검색: ${qq}`, 'Enter', () => { S.search.kw = qq; runSearch(); }, qq);
    return cmds;
  }
  const fuzzy = (text, q) => {
    if (!q) return 1;
    const t = text.toLowerCase(), k = q.toLowerCase().replace(/\s+/g, '');
    if (t.includes(q.toLowerCase())) return 100 - t.indexOf(q.toLowerCase());
    let i = 0, score = 0;
    for (const ch of k) { const j = t.indexOf(ch, i); if (j < 0) return 0; score += j === i ? 3 : 1; i = j + 1; }
    return score;
  };
  function palRender(q) {
    const cmds = palCommands(q);
    const recent = S.settings.palRecent || [];
    palItems = cmds.map(c => { const s = fuzzy(c.text, q.trim()); const ri = recent.indexOf(c.label); return {...c, s: s > 0 && ri >= 0 ? s + (q.trim() ? 8 : 50) - ri : (!q.trim() && c.work === 2 ? 20 : s)}; }).filter(c => c.s > 0).sort((a, b) => b.s - a.s).slice(0, 14);
    if (q.trim().length >= 2 && !palItems.some(c => c.label.startsWith('통합검색'))) palItems.push(cmds.find(c => c.label.startsWith('통합검색')));
    palItems = palItems.filter(Boolean);
    palIndex = 0;
    $('#pallist').innerHTML = palItems.map((c, i) => `<div class="it ${i === palIndex ? 'on' : ''}" data-act="palRun" data-i="${i}">${ic(c.icon || 'play')}<span class="lb">${esc(c.label)}</span><span class="k">${esc(c.hint)}</span></div>`).join('') || '<div class="muted">해당하는 명령이 없습니다.</div>';
  }
  function palExec(c) { closeOverlay(); if (!c) return; S.settings.palRecent = [c.label, ...(S.settings.palRecent || []).filter(l => l !== c.label)].slice(0, 6); saveLocal(); c.run(); }
  function paletteKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); palIndex = Math.max(0, Math.min(palItems.length - 1, palIndex + (e.key === 'ArrowDown' ? 1 : -1))); root.querySelectorAll('.pal .it').forEach((n, i) => n.classList.toggle('on', i === palIndex)); return; }
    if (e.key === 'Enter') { e.preventDefault(); palExec(palItems[palIndex]); }
  }
  // 입력 대화상자: 값 배열(취소·Esc·바깥 클릭이면 null)을 돌려준다. Enter는 handleKey에서 #askOk로 연결
  function askForm({title, desc = '', fields, okLabel = '확인'}) {
    return new Promise(res => {
      S.paletteOpen = true; S.menuOpen = ''; S.helpOpen = false;
      const ov = $('#overlay');
      ov.innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(560px,94vw);padding:22px 24px" role="dialog" aria-label="${esc(title)}"><h2 style="margin:0 0 6px;font-size:17px">${esc(title)}</h2>${desc ? `<div class="muted" style="margin-bottom:10px">${esc(desc)}</div>` : ''}${fields.map((f, i) => `<label style="display:flex;flex-direction:column;gap:4px;margin:10px 0 0;font-size:13px;color:var(--muted)">${esc(f.label)}<input class="inp" id="ask_${i}" type="${f.type || 'text'}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off" style="height:40px;font-size:14px;color:var(--fg)"></label>`).join('')}<div class="acts" style="justify-content:flex-end;margin-top:16px"><button class="btn" id="askNo">취소</button><button class="btn primary" id="askOk">${esc(okLabel)}</button></div></div></div>`;
      let settled = false;
      const obs = new MutationObserver(() => { if (!ov.querySelector('#askOk') && !settled) { settled = true; obs.disconnect(); res(null); } });
      const done = v => { if (settled) return; settled = true; obs.disconnect(); closeOverlay(); res(v); };
      $('#askOk').addEventListener('click', () => done(fields.map((f, i) => (($('#ask_' + i) || {}).value || '').trim())));
      $('#askNo').addEventListener('click', () => done(null));
      obs.observe(ov, {childList: true});
      setTimeout(() => { const i = $('#ask_0'); if (i) { i.focus(); i.select(); } }, 30);
    });
  }
  async function askText(title, label, value = '', placeholder = '') { const v = await askForm({title, fields: [{label, value, placeholder}]}); return v ? v[0] : null; }
  function toggleHelp(force) {
    S.helpOpen = force === undefined ? !S.helpOpen : force; S.paletteOpen = false; S.menuOpen = '';
    if (!S.helpOpen) { $('#overlay').innerHTML = ''; return; }
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" role="dialog" aria-label="사용법"><button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button><h2 style="margin-top:0">GW 비서 사용법</h2>
<p><b>1. 오늘 할 일</b>에는 <b>내가 처리해야 할 일</b>만 급한 순서로 나옵니다. 위 숫자(급한 일·할 일·확인 필요·끝났는지 확인)를 누르면 그것만 봅니다. 나와 직접 관련이 적은 항목은 맨 아래 <b>참고</b>에 접혀 있습니다.</p>
<p><b>2. 줄을 누르면</b> 오른쪽에 내용이 나옵니다. <b>열기</b> 또는 <b>원래 화면 열기</b>를 누르면 그룹웨어 원래 화면이 옆에 열리고, 그 화면의 버튼으로 결재·접수·배부·발송·답장을 합니다.</p>
<p><b>3. 메일 첨부</b>는 오른쪽 창의 <b>받기</b>(또는 <b>모두 받기</b>)로 바로 내려받습니다.</p>
<p><b>4. 하나씩 처리하기</b>를 누르면 처리할 일을 차례로 엽니다. 처리 후 초록 버튼을 누르면 그룹웨어에서 실제로 처리됐는지 확인합니다.</p>
<p><b>5. 줄 오른쪽 ⋯</b>에서 내일 다시 보기, 할 일 보드에 추가, 숨기기, 나와 상관없음(같은 보낸 곳·종류 모두 빼기)을 고릅니다. 실수했으면 <kbd>Ctrl</kbd>+<kbd>Z</kbd>.</p>
<p><b>6. 돌아가기</b> 왼쪽 위 <b>GW 비서</b>는 첫 화면, 오른쪽 위 <b>그룹웨어로 돌아가기</b>는 원래 그룹웨어입니다. 다시 열 때는 화면 오른쪽 아래의 <b>GW 비서</b> 버튼(끌어서 옮겼다면 그 자리)이나 <kbd>Alt</kbd>+<kbd>G</kbd>.</p>
<h3>용어</h3><p><span class="term">배부</span> 기관 밖에서 온 공문을 담당 부서로 나눠 보내는 일 · <span class="term">부서 접수</span> 부서로 온 문서를 담당자가 받는 일 · <span class="term">열람</span> 참고하라고 보내 준 문서 · <span class="term">발송 대기</span> 결재가 끝나 밖으로 보낼 차례인 문서 · <span class="term">근무일대체</span> 휴일 근무 대신 다른 날 쉬는 것</p>
<h3>안전</h3><p>이 화면이 자료를 읽을 때(목록·검색·미리보기)는 그룹웨어를 바꾸지 않습니다. 처리 창에 열린 그룹웨어 화면의 버튼은 실제로 처리되니 평소처럼 확인하고 누르세요. 미열람 문서를 처리 창에 열면 열람으로 기록되어 미리 물어봅니다.</p>
<h3>단축키</h3><p><kbd>J</kbd>/<kbd>K</kbd> 이동 · <kbd>Enter</kbd> 내용 보기 · <kbd>X</kbd> 숨기기 · <kbd>S</kbd> 미루기 · <kbd>T</kbd> 할 일 · <kbd>F</kbd> 연속 처리 · <kbd>R</kbd> 새로고침 · <kbd>/</kbd> 검색 · <kbd>Shift</kbd>+<kbd>D</kbd> 다크/라이트 · <kbd>Ctrl</kbd>+<kbd>K</kbd> 명령 · <kbd>Ctrl</kbd>+<kbd>Z</kbd> 되돌리기 · <kbd>Alt</kbd>+<kbd>G</kbd> 열기·닫기 (한글 입력 상태에서도 동작)</p>
<p><button class="btn primary" data-act="closeHelp">닫기</button> <button class="btn" data-act="coach">처음 안내 다시 보기</button> <span class="muted">Esc로도 닫힙니다</span></p></div></div>`;
    if (!S.settings.tourDone) { S.settings.tourDone = true; saveLocal(); }
  }
  async function openMenu(which, anchor) {
    if (S.menuOpen === which) { closeOverlay(); return; }
    S.menuOpen = which; S.paletteOpen = false; S.helpOpen = false; S.coach = null;
    if (which === 'new') {
      const action = (type, label, desc, icon, extra = '') => `<button type="button" class="new-action" data-act="${type}" ${extra}><span class="new-icon">${ic(icon)}</span><span class="new-copy"><b>${label}</b><small>${desc}</small></span></button>`;
      $('#overlay').innerHTML = `<div class="menu new-menu" data-stop="1" aria-label="새로 만들기"><div class="new-heading"><strong>새로 만들기</strong><span>업무에 필요한 작업을 선택하세요</span></div><div class="new-section">전자결재</div>
        ${action('quickDraft','결과보고','계획서를 바탕으로 작성','doc','data-t="result"')}
        ${action('quickDraft','운영·참가계획','이전 계획서 서식으로 작성','doc','data-t="plan"')}
        ${action('quickDraft','물품매입품의','운영물품 구입 품의','doc','data-t="goods"')}
        ${action('openPay','지급·지출 문서','지급 건의와 지출결의 준비','wallet')}
        <div class="new-section">근태 및 예약</div>
        ${action('quickAtt','출장 신청','관내·관외 출장 준비','car','data-t="trip"')}
        ${action('quickAtt','휴가 신청','연차·반차·대체휴가 준비','cal','data-t="leave"')}
        ${action('quickAtt','시간외·휴일근무','신청 일시와 사유 준비','clock','data-t="overtime"')}
        ${action('goResource','자원 예약','공용차량·회의실 현황 확인','car')}
        <div class="new-section">기타</div>
        ${action('openAi','AI 도우미','업무 질문과 우선순위 확인','star')}
        ${action('openRec','기록기','자주 하는 화면 작업 기록','play')}
        ${action('openUrl','전자결재 전체 양식','양식함에서 직접 선택','doc', 'data-url="'+esc(GW.links.route(GW.routes.draft))+'" data-title="결재작성"')}
        ${action('openUrl','새 메일 쓰기','메일 작성 화면 열기','mail', 'data-url="'+esc(GW.links.compose('plain'))+'" data-title="새 메일 쓰기"')}
      </div>`;
    } else if (which.startsWith('row:')) {
      const key = which.slice(4);
      const x = S.a.actions.find(a => a.key === key);
      if (!x) { closeOverlay(); return; }
      const r = anchor ? anchor.getBoundingClientRect() : null, hr = wcEl.getBoundingClientRect();
      const pos = r ? (() => { const navW = root.querySelector('nav')?.offsetWidth || 200; const wantLeft = r.right - hr.left + 328 <= hr.width ? r.left - hr.left : r.right - hr.left - 320; const left = Math.max(navW + 8, Math.min(hr.width - 332, wantLeft)); const top = r.bottom - hr.top + 280 <= hr.height ? r.bottom - hr.top + 4 : Math.max(60, r.top - hr.top - 260); return `top:${top}px;left:${left}px;right:auto`; })() : '';
      const k = esc(key);
      $('#overlay').innerHTML = `<div class="menu" data-stop="1" role="menu" style="${pos}"><div class="mh" title="${esc(x.title)}">${esc(x.title)}</div>${isMine(x) ? `<div class="mi" role="menuitem" data-act="rmSnooze" data-k="${k}">${ic('snooze')}내일 아침에 다시 보기</div><div class="mi" role="menuitem" data-act="rmTodo" data-k="${k}">${ic('plus')}할 일 보드에 추가</div><div class="mi" role="menuitem" data-act="rmWindow" data-k="${k}">${ic('ext')}새 창으로 열기</div><div class="mi" role="menuitem" data-act="rmHide" data-k="${k}">${ic('eye')}이 화면에서 숨기기</div><div class="mi danger" role="menuitem" data-act="rmMute" data-k="${k}">${ic('x')}나와 상관없음…</div>` : `<div class="mi" role="menuitem" data-act="rmMine" data-k="${k}">${ic('star')}내 일로 지정…</div><div class="mi" role="menuitem" data-act="rmWindow" data-k="${k}">${ic('ext')}새 창으로 열기</div><div class="mi" role="menuitem" data-act="rmHide" data-k="${k}">${ic('eye')}이 화면에서 숨기기</div>`}</div>`;
    } else if (which.startsWith('mute:') || which.startsWith('mine:')) {
      const list = which.slice(0, 4), key = which.slice(5);
      const x = S.a.actions.find(a => a.key === key);
      if (!x) { closeOverlay(); return; }
      const who = senderOf(x), kindName = RULE_KIND[x.base] || x.kind;
      const head = list === 'mute' ? '나와 상관없음: 목록에서 빼기 (설정에서 되돌릴 수 있음)' : '내 처리할 일로 옮기기';
      $('#overlay').innerHTML = `<div class="menu" data-stop="1" style="right:auto;left:50%;top:30%;transform:translateX(-50%);min-width:360px"><div class="mh">${head}</div><div class="mi" data-act="relAdd" data-l="${list}" data-t="key" data-v="${esc(key)}" data-label="${esc(x.title.slice(0, 40))}">이 항목만 <span class="muted">${esc(x.title.slice(0, 28))}</span></div>${who ? `<div class="mi" data-act="relAdd" data-l="${list}" data-t="sender" data-v="${esc(who)}" data-label="보낸 곳: ${esc(who)}">보낸 곳이 ‘${esc(who)}’인 항목 모두</div>` : ''}${RULE_KIND[x.base] ? `<div class="mi" data-act="relAdd" data-l="${list}" data-t="kind" data-v="${esc(x.base)}" data-label="종류: ${esc(kindName)}">‘${esc(kindName)}’ 종류 모두</div>` : ''}<div class="mi muted" data-act="closeOverlay">취소</div></div>`;
    } else if (which === 'view') {
      const fsName = {s: '작게', m: '보통', l: '크게', xl: '아주 크게'};
      $('#overlay').innerHTML = `<div class="menu" data-stop="1"><div class="mh">글자 크기: ${fsName[S.settings.fontSize] || '보통'}</div><div class="mi" data-act="fsUp">가+ 글자 크게</div><div class="mi" data-act="fsDown">가− 글자 작게</div><div class="mi" data-act="theme">${S.settings.theme === 'dark' ? '밝은 테마로' : '어두운 테마로'}</div><div class="mi" data-act="help">? 사용법·용어·단축키</div><div class="mi" data-act="openPalette">Ctrl+K 명령 찾기</div><div class="mi" data-act="view" data-v="settings">설정</div></div>`;
    } else if (which === 'bell') {
      const items = S.activity.slice(-40).reverse();
      $('#overlay').innerHTML = `<div class="menu" data-stop="1"><div class="mh">새로 들어온 항목 (GW 비서가 확인한 시각 기준)</div>${items.map(x => `<div class="mi" data-act="bellItem" data-k="${esc(x.key)}"><span class="pill ${x.priority || 'low'}">${PRI[x.priority] || '참고'}</span>${esc(x.title)}<div class="muted">${esc(x.kind)} · ${hhmm(new Date(x.at))}${x.at > S.seenActivity ? ' · 새' : ''}</div></div>`).join('') || '<div class="mi muted">아직 없습니다.</div>'}</div>`;
      S.seenActivity = Date.now(); saveLocal(); renderHead();
    }
    $('#overlay').querySelectorAll('.mi[data-act]').forEach(el => { if (!el.hasAttribute('role')) el.setAttribute('role', 'button'); el.tabIndex = 0; });
  }
  // 3-step on-screen guide pointing at the real controls.
  const COACH = [
    {sel: '#qlist .row, #qlist .empty', title: '① 처리할 일', text: '내가 처리해야 할 일만 급한 순서로 모았습니다. 줄을 누르면 오른쪽에 내용이 나옵니다.'},
    {sel: '#qlist .row .btn.primary, .hello .btn.primary', title: '② 원래 화면에서 처리', text: '"열기"를 누르면 그룹웨어 원래 화면이 오른쪽에 열립니다. 거기 있는 결재·접수·보내기 버튼으로 평소처럼 처리하세요.'},
    {sel: 'header .home', title: '③ 처음 화면', text: '언제든 왼쪽 위 "GW 비서"를 누르면 이 첫 화면으로 돌아옵니다.'},
    {sel: 'header .back', title: '④ 그룹웨어로 돌아가기', text: '오른쪽 위 버튼을 누르면 원래 그룹웨어 화면으로 돌아갑니다. 다시 열 때는 화면 오른쪽 아래의 "GW 비서" 버튼(또는 Alt+G)을 누르세요.'},
  ];
  function startCoach() { closeOverlay(); if (S.view !== 'today') go('today'); S.coach = {i: 0}; drawCoach(); }
  function coachNext() { if (!S.coach) return; S.coach.i++; if (S.coach.i >= COACH.length) endCoach(); else drawCoach(); }
  function endCoach() { S.coach = null; $('#overlay').innerHTML = ''; if (!S.settings.tourDone) { S.settings.tourDone = true; saveLocal(); } }
  function drawCoach() {
    const step = COACH[S.coach.i];
    const target = root.querySelector(step.sel);
    const hr = wcEl.getBoundingClientRect();
    const r = target ? target.getBoundingClientRect() : {left: hr.width / 2 - 100, top: hr.height / 2 - 30, width: 200, height: 60, right: hr.width / 2 + 100, bottom: hr.height / 2 + 30};
    const left = Math.max(12, Math.min(hr.width - 340, r.left - hr.left));
    const below = r.bottom - hr.top + 12 + 190 < hr.height;
    const top = below ? r.bottom - hr.top + 12 : Math.max(12, r.top - hr.top - 190);
    $('#overlay').innerHTML = `<div class="coach-hole" style="left:${r.left - hr.left - 6}px;top:${r.top - hr.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div><div class="coach" role="dialog" aria-label="${esc(step.title)}" style="left:${left}px;top:${top}px"><div class="st">${S.coach.i + 1} / ${COACH.length}</div><b>${esc(step.title)}</b><div>${esc(step.text)}</div><div class="acts"><button class="btn primary" data-act="coachNext">${S.coach.i === COACH.length - 1 ? '시작하기' : '다음'}</button><button class="btn ghost" style="color:#fff" data-act="coachEnd">건너뛰기</button></div></div>`;
  }
  function closeOverlay() { S.paletteOpen = false; S.helpOpen = false; S.menuOpen = ''; S.coach = null; $('#overlay').innerHTML = ''; }
  const fontStep = n => { const order = ['s', 'm', 'l', 'xl']; const i = Math.max(0, Math.min(3, order.indexOf(S.settings.fontSize) + n)); S.settings.fontSize = order[i]; saveLocal(); applyLook(); };
  const toggleTheme = () => { S.settings.theme = S.settings.theme === 'dark' ? 'light' : 'dark'; saveLocal(); applyLook(); };

  async function findAndOpenDocNo(no, t) {
    const out = $('#docNoResult');
    if (out) out.innerHTML = '<p><span class="spin"></span> 문서를 찾는 중…</p>';
    try {
      const p = await GW.docPreview({docNo: no, title: t});
      if (p.found) { if (out) out.innerHTML = `<div class="box okb">${esc(p.title)} (${esc(p.docNo)})</div>`; if (!S.sel) S.sel = {type: 'frame', title: p.title, url: p.url}; openUrl(p.url, {title: p.title}); }
      else if (out) out.innerHTML = '<div class="box warn">통합검색에서 같은 문서번호를 찾지 못했습니다. 권한이 없거나 아직 색인되지 않은 문서일 수 있습니다.</div>'; else toast('문서를 찾지 못했습니다.');
    } catch (err) { if (out) out.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  }
  async function makeWeekly() {
    if (S.weekly && S.weekly.trim() && !confirm('지금 초안을 고친 내용이 있으면 사라집니다. 새로 만들까요?\n(필요하면 먼저 복사해 두세요)')) return;
    // 기간: 이번 주(월~오늘) · 지난주(월~금) · 최근 7일 · 직접(11/2~11/6)
    const pv = await askText('주간 업무 실적 초안', '기간 (이번 주 / 지난주 / 최근 7일 / 11/2~11/6)', S.settings.weeklyPeriod || (new Date(Date.now() + 9 * 3600000).getUTCDay() === 1 ? '지난주' : '이번 주'));
    if (pv === null) return;
    const k = R.kstNow(new Date()), base = new Date(Date.UTC(k.y, k.m - 1, k.d)), dow = base.getUTCDay() || 7;
    const ymdU = dt => `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
    const add = n => new Date(base.getTime() + n * 86400000);
    let range = null; const p = pv.replace(/\s+/g, '');
    const mm = p.match(/(\d{1,2})[./](\d{1,2})~(\d{1,2})[./](\d{1,2})/);
    if (mm) range = {from: `${k.y}${mm[1].padStart(2, '0')}${mm[2].padStart(2, '0')}`, to: `${k.y}${mm[3].padStart(2, '0')}${mm[4].padStart(2, '0')}`};
    else if (/지난주|저번주/.test(p)) range = {from: ymdU(add(-dow - 6)), to: ymdU(add(-dow - 2))};
    else if (/최근/.test(p)) range = {from: ymdU(add(-7)), to: ymdU(base)};
    else if (/이번주|금주|^$/.test(p)) range = {from: ymdU(add(1 - dow)), to: ymdU(base)};
    else { toast('기간을 알아보지 못했습니다. 예) 이번 주, 지난주, 최근 7일, 11/2~11/6'); return; }
    
    toast(`${range.from.slice(4, 6)}/${range.from.slice(6)}~${range.to.slice(4, 6)}/${range.to.slice(6)} 자료를 읽는 중…`);
    try {
      const [sub0, hist] = await Promise.all([GW.submittedRange({from: range.from, to: range.to, size: 100}), loadRouting()]);
      const sub = {...sub0, docs: (sub0.docs || []).filter(dd => { const dt = String(dd.date || '').replace(/\D/g, '').slice(0, 8); return !dt || (dt >= range.from && dt <= range.to); })};
      const me = S.raw.principal.name;
      const receipts = (hist ? hist.dept : []).filter(r => String(r.toEmp).replace(/\s/g, '') === String(me).replace(/\s/g, '') && String(r.date).replace(/-/g, '').slice(0, 8) >= sub.from && String(r.date).replace(/-/g, '').slice(0, 8) <= sub.to);
      S.weekly = R.weeklyReport({submitted: sub.docs, receipts, me: `${S.raw.principal.deptName} ${me}`, from: sub.from, to: sub.to});
      saveLocal();
    } catch (err) { toast('주간 초안을 만들지 못했습니다: ' + err.message); }
    if (S.view === 'report') renderMain();
  }

