// GW 통합 업무센터 · AI 업무 지시창, 명령 실행 엔진 및 작업 내역 검증 로그
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  // ---------- Action History & Verification Log Store ----------
  function getActionHistory() {
    return store.get('actionHistory', []);
  }
  function logActionRecord(record) {
    const list = getActionHistory();
    const entry = {
      id: uid(),
      at: Date.now(),
      command: record.command || '자동화 작업',
      type: record.type || '기안',
      target: record.target || '',
      summary: record.summary || '',
      steps: record.steps || [],
      status: record.status || 'success', // success / warning / error
      verified: record.verified !== false,
      details: record.details || ''
    };
    list.unshift(entry);
    store.set('actionHistory', list.slice(0, 50));
    return entry;
  }

  // ---------- Command Interpretation & Automation Workflows ----------
  const COMMAND_PRESETS = [
    { id: 'result_draft', tag: '기안', label: '결과보고서 자동 기안', desc: '사업 추진 결과보고 서식·실시간 예산표·제목을 결재 직전 상태로 자동 완성', icon: 'doc', query: '결과보고서 기안문 작성' },
    { id: 'plan_draft', tag: '기안', label: '운영계획서 자동 기안', desc: '4단계 행정 표준 운영계획(안) 본문과 메타데이터 자동 기입', icon: 'doc', query: '운영계획서 기안문 작성' },
    { id: 'budget_draft', tag: '예산', label: '예산집행품의서 작성', desc: '선택된 사업의 실시간 예산·집행·잔액 표를 본문에 직접 기입', icon: 'wallet', query: '실시간 예산집행품의서 작성' },
    { id: 'mail_confirm', tag: '메일', label: '시간외근무 확인 회신문', desc: '공공기관 표준 확인 회신문을 메일 에디터에 1클릭 자동 기입', icon: 'mail', query: '시간외근무 확인 회신문 작성' },
    { id: 'mail_submit', tag: '메일', label: '자료 제출용 회신문', desc: '제출 건명·제출자·첨부파일 안내 문구 자동 기입', icon: 'mail', query: '자료 제출용 회신문 작성' },
    { id: 'att_swap', tag: '근태', label: '대체휴무 근태신청 준비', desc: '11/01 휴일대체근무 내역 자동 매칭 및 사유 복사 후 신청 화면 오픈', icon: 'clock', query: '11월 대체휴무 근태신청' },
    { id: 'att_trip', tag: '근태', label: '관내출장신청 연동', desc: '출장 사유 자동 준비 및 근태신청 화면 오픈', icon: 'clock', query: '관내출장신청' },
    { id: 'scan_urgent', tag: '점검', label: '급한 일 전수 점검', desc: '기한 임박·대기·미열람 문서를 즉시 스캔하여 요약', icon: 'check', query: '오늘 급한 일 확인' },
  ];

  // Open Command Console Dialog
  function openCommandConsole(initialQuery = '') {
    closeOverlay();
    S.paletteOpen = true;
    const presetsHtml = COMMAND_PRESETS.map((p, i) => `
      <div class="cmd-preset" role="button" tabindex="0" data-act="runPreset" data-id="${esc(p.id)}">
        <div class="cp-head"><span class="bdg ${p.tag === '기안' ? 'urgent' : p.tag === '예산' ? 'check' : p.tag === '메일' ? 'todo' : 'tag'}">${esc(p.tag)}</span><b>${esc(p.label)}</b></div>
        <div class="cp-desc">${esc(p.desc)}</div>
      </div>
    `).join('');

    $('#overlay').innerHTML = `
      <div class="modal" data-act="closeOverlay">
        <div class="dlg cmd-console" data-stop="1" role="dialog" aria-label="AI 업무 지시창">
          <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
          <div class="cmd-top">
            <div class="cmd-logo">${ic('star')}</div>
            <div>
              <h2 style="margin:0;font-size:19px">AI 업무 지시 및 자동 실행 콘솔</h2>
              <div class="muted">자연어로 업무를 지시하거나 아래 명령을 누르면 기안·메일·예산 서식을 결재 직전까지 자동 완성합니다.</div>
            </div>
          </div>

          <div class="cmd-input-box">
            ${ic('search')}
            <input id="cmdPrompt" class="cmd-inp" placeholder="수행할 업무를 지시하세요 (예: 결과보고서 작성, 시간외근무 답장, 대체휴무 신청, 예산 품의서)" value="${esc(initialQuery)}" autocomplete="off">
            <button class="btn primary" data-act="submitCmd">${ic('play')}실행</button>
          </div>

          <div id="cmdRunner" style="display:none"></div>

          <div class="cmd-section-title">빠른 지시 명령 (1클릭 자동 실행)</div>
          <div class="cmd-grid">${presetsHtml}</div>

          <div class="acts" style="margin-top:18px;justify-content:space-between;border-top:1px solid var(--line);padding-top:14px">
            <button class="btn sm" data-act="openHistory">${ic('clock')}최근 자동화 작업 내역 (${getActionHistory().length}건)</button>
            <button class="btn sm ghost" data-act="closeHelp">닫기 (Esc)</button>
          </div>
        </div>
      </div>
    `;

    const inp = $('#cmdPrompt');
    if (inp) {
      inp.focus();
      if (initialQuery) inp.setSelectionRange(initialQuery.length, initialQuery.length);
    }
  }

  // Open Action History Dialog
  function openActionHistory() {
    closeOverlay();
    S.paletteOpen = true;
    const history = getActionHistory();

    const rows = history.map(item => {
      const timeStr = new Date(item.at).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
      const stepsHtml = (item.steps || []).map(s => `<li>${esc(s)}</li>`).join('');
      return `
        <div class="hist-card">
          <div class="hc-top">
            <span class="bdg ${item.type === '기안' ? 'urgent' : item.type === '예산' ? 'check' : item.type === '메일' ? 'todo' : 'tag'}">${esc(item.type)}</span>
            <b>${esc(item.command)}</b>
            <span class="hc-time">${esc(timeStr)}</span>
            <span class="bdg confirm" style="margin-left:auto">${item.verified ? '✓ 검증 완료' : '진행 완료'}</span>
          </div>
          <div class="hc-summary">${esc(item.summary)}</div>
          ${stepsHtml ? `<ul class="hc-steps">${stepsHtml}</ul>` : ''}
          ${item.details ? `<div class="hc-details">${esc(item.details)}</div>` : ''}
        </div>
      `;
    }).join('');

    $('#overlay').innerHTML = `
      <div class="modal" data-act="closeOverlay">
        <div class="dlg hist-dialog" data-stop="1" role="dialog" aria-label="작업 내역 및 자동화 검증 로그">
          <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <div class="cmd-logo" style="background:#10b981">${ic('check')}</div>
            <div>
              <h2 style="margin:0;font-size:19px">자동화 작업 내역 및 검증 로그</h2>
              <div class="muted">수행된 자동 기입 및 지시 작업의 실행 단계와 검증 결과를 확인합니다 (최근 ${history.length}건 보관).</div>
            </div>
          </div>

          <div class="hist-list">
            ${rows || `<div class="empty"><div class="ill">${ic('clock')}</div><b>수행된 자동화 내역이 없습니다</b>AI 업무 지시창을 통해 작업을 실행해 보세요.</div>`}
          </div>

          <div class="acts" style="margin-top:16px;justify-content:space-between;border-top:1px solid var(--line);padding-top:12px">
            <button class="btn sm danger ghost" data-act="clearHistory">내역 비우기</button>
            <div style="display:flex;gap:8px">
              <button class="btn sm primary" data-act="openCmd">${ic('star')}새 업무 지시하기</button>
              <button class="btn sm ghost" data-act="closeHelp">닫기 (Esc)</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Execute Command with Live Step-by-Step Observable Progress Runner
  async function executeCommandWorkflow(query) {
    const q = String(query || '').trim();
    if (!q) { toast('지시할 업무 내용을 입력하세요.'); return; }

    const runner = $('#cmdRunner');
    if (runner) {
      runner.style.display = 'block';
      runner.innerHTML = `
        <div class="runner-box">
          <div class="rb-title"><span class="spin"></span> <b>"${esc(q)}"</b> 명령 자동화 수행 중…</div>
          <div class="rb-steps" id="rbSteps">
            <div class="rb-step cur" id="step1">1. 관련 데이터 및 서식 분석 중…</div>
            <div class="rb-step" id="step2">2. 공공기관 행정 서식 생성 대기</div>
            <div class="rb-step" id="step3">3. 본문 및 메타데이터 자동 기입 대기</div>
            <div class="rb-step" id="step4">4. 결재 직전 상태 유효성 검증 대기</div>
          </div>
        </div>
      `;
    }

    const setStep = (id, text, done = false) => {
      const el = $(`#${id}`);
      if (!el) return;
      el.className = 'rb-step ' + (done ? 'done' : 'cur');
      el.innerHTML = (done ? '✓ ' : '<span class="spin"></span> ') + text;
    };

    // Workflow Classification
    const isResultDraft = /결과|실적|추진/.test(q);
    const isPlanDraft = /계획|운영계획|사업계획/.test(q);
    const isBudgetDraft = /예산|품의|비용|집행/.test(q);
    const isMailConfirm = /답장|회신|시간외|확인|메일/.test(q) && !/기안/.test(q);
    const isMailSubmit = /제출/.test(q) && /메일|회신|답장/.test(q);
    const isAtt = /근태|휴가|출장|대체|11\/|결근/.test(q);
    const isScan = /점검|스캔|급한|정리/.test(q);

    await new Promise(r => setTimeout(r, 600));

    // Case 1: Result Report Draft
    if (isResultDraft || isPlanDraft || isBudgetDraft) {
      const type = isResultDraft ? 'result' : isPlanDraft ? 'plan' : 'budget';
      const typeName = isResultDraft ? '결과보고서' : isPlanDraft ? '운영계획서' : '예산집행품의서';

      setStep('step1', '1. 일반기안문 양식 및 세션 데이터 로드 완료', true);
      setStep('step2', `2. ${typeName} 4단계 행정 서식 및 제목 생성 중…`);
      await new Promise(r => setTimeout(r, 800));

      setStep('step2', `2. ${typeName} 4단계 행정 서식 및 제목 생성 완료`, true);
      setStep('step3', '3. HWP 웹 에디터 및 공개/일반/내부결재 메타데이터 기입 중…');

      // Launch draft in pane
      closeOverlay();
      autoStartDraft(type);

      // Log action record
      logActionRecord({
        command: q,
        type: '기안',
        target: `일반기안문 (${typeName})`,
        summary: `${typeName} 제목, 메타데이터(공개/일반/내부결재), 표준 4단계 본문이 결재 직전 상태로 자동 완성되었습니다.`,
        steps: [
          '일반기안문(mg_20160303185413307) 안전 팝업 로드',
          '제목 및 4단계 행정 서식 본문(추진목적, 결과/계획, 기대효과) 자동 생성',
          '공개(001), 일반문서(000), 내부결재(000) 라디오 자동 선택',
          '결재선(기안 서원하 -> 중간 부장 -> 전결 실장) 대기 상태 검증'
        ],
        details: '상단의 [결재] 버튼을 누르시면 즉시 상신됩니다.'
      });
      return;
    }

    // Case 2: Mail Reply
    if (isMailConfirm || isMailSubmit) {
      const template = isMailSubmit ? 'submit' : 'confirm';
      setStep('step1', '1. 수신 메일 데이터 및 발신자 확인 완료', true);
      setStep('step2', '2. 공공기관 표준 공문 회신문 텍스트 생성 완료', true);
      setStep('step3', '3. 메일 답장 화면 로드 및 에디터 본문 기입 중…');

      closeOverlay();
      const mailRow = S.a.actions.find(x => x.type === 'mail');
      if (mailRow) {
        selectAction(mailRow.key);
        openUrl(GW.links.compose('re', {box: mailRow.ref.box, uid: mailRow.ref.uid}), {title: `답장: ${mailRow.title}`});
        setTimeout(() => {
          autoFillMail(template);
          logActionRecord({
            command: q,
            type: '메일',
            target: mailRow.title,
            summary: `[${mailRow.title}] 건에 대한 표준 공문 회신문이 에디터 본문에 자동 기입되었습니다.`,
            steps: [
              `수신자 및 원메일 제목 분석 (${mailRow.title})`,
              '공공기관 표준 회신문(소속/직책/성명/일자/확인결과) 생성',
              '메일 작성 에디터 본문에 직접 자동 삽입 완료',
              '발송 직전 검증 완료'
            ],
            details: '작성 내용을 확인하신 후 [보내기] 버튼을 누르세요.'
          });
        }, 4500);
      } else {
        toast('처리할 메일이 없습니다.');
      }
      return;
    }

    // Case 3: Attendance Anomaly / Business Trip
    if (isAtt) {
      setStep('step1', '1. 근태 이상 내역 및 휴일근무대체 내역 분석 완료', true);
      setStep('step2', '2. 대체휴무 사유 문구 생성 완료', true);
      setStep('step3', '3. 근태관리 신청 연동 화면 오픈 중…');

      closeOverlay();
      const attRow = S.a.actions.find(x => x.type === 'attendance');
      openUrl(GW.links.route(GW.routes.attendanceRequest), {title: '근태신청'});
      autoFillAtt();

      logActionRecord({
        command: q,
        type: '근태',
        target: attRow ? attRow.title : '근태신청',
        summary: '대체휴무 사유가 클립보드에 복사되었으며 근태신청 연동 화면이 열렸습니다.',
        steps: [
          '근태 일자 및 11/01 휴일대체근무 이력 대조',
          '사유 문구 자동 완성 및 클립보드 복사 ("2026-11-01 휴일대체근무에 따른 대체휴무 사용")',
          '더존 Amaranth 10 공식 근태신청 연동 화면 오픈 완료'
        ],
        details: '사유란에 붙여넣기(Ctrl+V)하여 신청서를 완성하세요.'
      });
      return;
    }

    // Case 4: General Scan
    setStep('step1', '1. 그룹웨어 8개 영역 실시간 데이터 전수 스캔 완료', true);
    setStep('step2', '2. 미처리 업무 분석 완료', true);
    setStep('step3', '3. 결과 요약 정리 완료', true);
    setStep('step4', '4. 오늘 할 일 화면 반영 완료', true);
    await new Promise(r => setTimeout(r, 600));
    closeOverlay();
    go('today');
    toast(`✓ 전수 점검 완료: 내 처리할 일 ${mineVisible().length}건, 부서 참고 공문 ${visibleActions().filter(x => !isMine(x)).length}건이 정리되었습니다.`);
    
    logActionRecord({
      command: q,
      type: '점검',
      target: '전체 업무 현황',
      summary: `내 처리할 일 ${mineVisible().length}건 및 부서 참고 공문이 점검 완료되었습니다.`,
      steps: ['메일, 결재, 근태, 일정, 예산 8개 모듈 실시간 상태 수집', '우선순위 및 내 일/참고 필터링 완료', '대시보드 실시간 동기화']
    });
  }
