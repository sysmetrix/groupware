// GW 통합 업무센터 · AI 업무 지시창, 지능형 명령 실행 엔진 및 작업 내역 검증 로그
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
// 원칙: 화면의 "완료/확인됨" 표시는 실제로 다시 읽어 확인한 결과일 때만 쓴다. 확인하지 못한 것은 그대로 알린다.

  // ---------- Natural Korean Date & Intent Parser ----------
  function parseKoreanDate(text, baseDate = new Date()) {
    const s = String(text || '').trim();
    const kst = new Date(baseDate.getTime() + 9 * 3600_000);
    const y = kst.getUTCFullYear(), m = kst.getUTCMonth(), d = kst.getUTCDate(), dow = kst.getUTCDay();
    const dowMap = {'일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6};
    const WD_KO = ['일', '월', '화', '수', '목', '금', '토'];
    const mk = dt => { const iso = dt.toISOString().slice(0, 10), w = dt.getUTCDay(); return {iso, wd: WD_KO[w], label: `${iso}(${WD_KO[w]})`}; };
    const at = off => mk(new Date(Date.UTC(y, m, d + off)));

    if (/오늘/.test(s)) return at(0);
    if (/내일/.test(s)) return at(1);
    if (/모레/.test(s)) return at(2);

    // 주 단위 표현: 다다음 주 > 다음 주(차주) > 지난 주 > 이번 주(금주) > 요일만.
    // 긴 표현을 먼저 고르므로 "다음 주 월요일"이 이번 주로 잡히지 않는다.
    const WEEK = '(다다음\\s*주|다음\\s*주|차주|지난\\s*주|저번\\s*주|이번\\s*주|금주)';
    const wm = s.match(new RegExp(WEEK + '?\\s*(일|월|화|수|목|금|토)요일')) || s.match(new RegExp(WEEK + '\\s*(일|월|화|수|목|금|토)(?![가-힣])'));
    if (wm) {
      const word = String(wm[1] || '').replace(/\s+/g, '');
      const targetDow = dowMap[wm[2]];
      const monOffset = dow === 0 ? -6 : 1 - dow; // 이번 주 월요일 (월~일 기준)
      let off = monOffset + (targetDow === 0 ? 6 : targetDow - 1);
      if (word === '다다음주') off += 14;
      else if (word === '다음주' || word === '차주') off += 7;
      else if (word === '지난주' || word === '저번주') off -= 7;
      else if (!word && off < 0) off += 7; // 요일만 말하면 다가오는 그 요일
      else if ((word === '이번주' || word === '금주') && off < 0 && new Date(Date.UTC(y, m, d)).getUTCDay() === 0) off += 7; // 일요일에 말한 '이번주 ○요일'은 다가오는 주
      return at(off);
    }

    const matchDate = s.match(/(\d{1,2})\s*[./월]\s*(\d{1,2})\s*일?/);
    if (matchDate) {
      const mo = Number(matchDate[1]) - 1, dy = Number(matchDate[2]);
      if (mo < 0 || mo > 11 || dy < 1 || dy > 31) return null;
      return mk(new Date(Date.UTC(y, mo, dy)));
    }

    return null;
  }

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
      status: record.status || 'success',
      verified: record.verified === true, // 결과를 실제로 다시 읽어 확인한 경우에만 true (기본값은 미확인)
      details: record.details || ''
    };
    const chained = R.chainAudit(list, entry);
    list.unshift(chained);
    store.set('actionHistory', list.slice(0, 50));
    return chained;
  }

  // ---------- Command Presets (고정 날짜·과장 표현 없이 실제로 하는 일만 적는다) ----------
  const COMMAND_PRESETS = [
    { id: 'result_draft', tag: '기안', label: '결과보고서 기안', desc: '결과보고가 없는 내 계획서를 골라 기록물철·본문·참조문서를 이어받아 기입 (상신은 직접)', icon: 'doc', query: '결과보고서 기안문 작성' },
    { id: 'plan_draft', tag: '기안', label: '운영계획서 기안', desc: '지난 계획서 서식으로 제목·기본항목·본문 뼈대를 기입 (항목 값은 직접 확인)', icon: 'doc', query: '운영계획서 기안문 작성' },
    { id: 'budget_draft', tag: '예산', label: '예산 집행·지급 문서', desc: '지급 건의·물품매입 품의·지출결의서 차례를 확인하고 작성 화면으로 이동', icon: 'wallet', query: '예산 집행 지급 품의 작성' },
    { id: 'sent_check', tag: '검증', label: '보낸메일함 답장 확인', desc: '선택한(또는 고른) 메일의 답장을 보낸메일함에서 실제로 찾아 날짜·수신자·첨부 여부를 표시', icon: 'check', query: '주당근무시간 보낸메일함에서 보냈는지 확인' },
    { id: 'att_sat', tag: '근태', label: '이번주 토요일 휴일근무', desc: '이번 주 토요일 날짜를 계산해 사유를 복사하고 근태신청 화면을 엽니다 (신청은 직접)', icon: 'clock', query: '이번주 토요일 휴일근무 올려줘' },
    { id: 'mail_confirm', tag: '메일', label: '확인 회신문', desc: '선택한 메일의 답장 화면을 열고 표준 확인 회신문을 넣습니다 (보내기는 직접)', icon: 'mail', query: '시간외근무 확인 회신문 작성' },
    { id: 'mail_submit', tag: '메일', label: '자료 제출용 회신문', desc: '답장 화면에 제출 건명·제출자·첨부 안내 문구를 넣습니다 (첨부·보내기는 직접)', icon: 'mail', query: '자료 제출용 회신문 작성' },
    { id: 'att_trip', tag: '근태', label: '관내출장 신청', desc: '출장 사유를 복사하고 근태신청 화면을 엽니다 (신청은 직접)', icon: 'clock', query: '관내출장신청' },
  ];

  // Open Command Console Dialog
  function openCommandConsole(initialQuery = '') {
    if (gated('aiConsole')) return;
    closeOverlay();
    S.paletteOpen = true;
    const presetsHtml = COMMAND_PRESETS.map((p) => `
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
              <h2 style="margin:0;font-size:19px">AI 업무 지시 콘솔</h2>
              <div class="muted">자연어로 지시하거나 아래 명령을 누르세요. 상신·신청·보내기는 하지 않고 그 직전 화면까지 준비하며, 실제로 확인한 결과만 알려 드립니다.</div>
            </div>
          </div>

          <div class="cmd-input-box">
            ${ic('search')}
            <input id="cmdPrompt" class="cmd-inp" placeholder="수행할 업무를 지시하세요 (예: 다음 주 토요일 휴일근무 올려줘, 결과보고서 작성, 주당근무시간 보냈는지 확인)" value="${esc(initialQuery)}" autocomplete="off">
            <button class="btn primary" data-act="submitCmd">${ic('play')}실행</button>
          </div>

          <div id="cmdRunner" style="display:none"></div>

          <div class="cmd-section-title">빠른 지시 명령</div>
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
      const badge = item.verified ? '<span class="bdg confirm" style="margin-left:auto">✓ 결과 확인됨</span>'
        : item.status === 'error' ? '<span class="bdg urgent" style="margin-left:auto">✗ 실패</span>'
        : '<span class="bdg tag" style="margin-left:auto">확인 필요</span>';
      return `
        <div class="hist-card">
          <div class="hc-top">
            <span class="bdg ${item.type === '기안' ? 'urgent' : item.type === '예산' ? 'check' : item.type === '메일' ? 'todo' : 'tag'}">${esc(item.type)}</span>
            <b>${esc(item.command)}</b>
            <span class="hc-time">${esc(timeStr)}</span>
            ${badge}
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
              <div class="muted">지시 작업의 실행 단계와 결과입니다 (최근 ${history.length}건). “결과 확인됨”은 결과를 실제로 다시 읽어 확인한 작업에만 붙습니다.</div>
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

  // ---------- 콘솔 실행 보조 ----------
  // 단계 표시: done=확인됨(✓), cur=진행 중, fail=실패(✗), info=사용자가 할 일(·)
  function cmdStep(id, text, state = 'cur') {
    const el = $(`#${id}`);
    if (!el) return;
    el.className = 'rb-step ' + (state === 'done' ? 'done' : state === 'cur' ? 'cur' : '');
    const mark = state === 'done' ? '✓ ' : state === 'fail' ? '✗ ' : state === 'info' ? '· ' : '<span class="spin"></span> ';
    el.innerHTML = mark + esc(text);
  }
  // 실행기 아래에 결과 상자를 붙인다. 실행기가 없으면(콘솔이 닫힘) null
  function cmdResultBox(html, cls = '') {
    const runner = $('#cmdRunner');
    if (!runner) return null;
    const title = runner.querySelector('.rb-title');
    if (title) title.querySelector('.spin')?.remove();
    let box = runner.querySelector('#cmdResult');
    if (!box) { box = document.createElement('div'); box.id = 'cmdResult'; box.style.marginTop = '12px'; runner.append(box); }
    box.className = cls ? `box ${cls}` : 'box';
    box.innerHTML = html;
    return box;
  }
  async function cmdCopy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }
  const mailActions = () => ((S.a && S.a.actions) || []).filter(x => x.type === 'mail');
  const cmdSelectedMail = () => { const x = S.sel && S.sel.type === 'action' ? selectedAction() : null; return x && x.type === 'mail' ? x : null; };
  // 지시문에서 메일 제목과 맞춰 볼 낱말만 남긴다
  const CMD_STOP = /^(보낸|보낸메일|보낸메일함|메일함|메일|확인|확인은|보냈는지|보냈나|했나|했는지|내가|제가|검증|발송|발송확인|여부|좀|해줘|해|줘|있나|봐줘|봐|답장|회신)$/;
  function cmdKeywords(q) {
    return String(q || '').replace(/[?!.,~()]/g, ' ').split(/\s+/)
      .map(t => t.replace(/(은|는|이|가|을|를|에서|으로|로|도|만)$/, ''))
      .filter(t => t.length >= 2 && !CMD_STOP.test(t));
  }
  // 받은 메일 항목에서 원메일 제목/받은 시각을 찾는다 (findReply 입력)
  function mailRefOf(x) {
    let m = null;
    try { m = findMail(x.ref.box, x.ref.uid); } catch {}
    return {subject: (m && m.subject) || x.title || '', since: (m && m.date) || ''};
  }
  // 편집 가능한 메일 에디터(iframe body)가 처리 창에 생길 때까지 기다린다 (최대 ms)
  async function waitMailEditor(ms = 15000) {
    const has = doc => {
      if (!doc) return false;
      for (const ifr of doc.querySelectorAll('iframe')) {
        try { const idoc = ifr.contentDocument; if (idoc && idoc.body && (idoc.body.isContentEditable || idoc.designMode === 'on')) return true; if (has(idoc)) return true; } catch {}
      }
      return false;
    };
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      let d = null; try { d = $('#frame iframe')?.contentDocument; } catch {}
      if (has(d)) return true;
      await new Promise(r => setTimeout(r, 400));
    }
    return false;
  }

  // ---------- A. 휴일근무 ----------
  async function cmdHolidayWork(q, parsed) {
    const targetLabel = parsed.label, targetDate = parsed.iso;
    cmdStep('step1', `1. 날짜: ${targetLabel}`, 'done');
    const reasonText = `${targetLabel} 재단 주요 업무 및 당면 현안 추진을 위한 휴일근무`;
    const copied = await cmdCopy(reasonText);
    cmdStep('step2', copied ? `2. 신청 사유를 클립보드에 복사했습니다 ("${reasonText.slice(0, 24)}…")` : '2. 클립보드 복사에 실패했습니다. 사유를 직접 입력하세요', copied ? 'done' : 'fail');
    closeOverlay();
    openUrl(GW.links.route(GW.routes.attendanceRequest), {title: `근태신청: ${targetLabel} 휴일근무`});
    S.pane.expanded = true;
    toast(copied
      ? `${targetLabel} 휴일근무: 근태신청 화면을 열고 사유를 복사했습니다. 휴일근무를 고르고 사유란에 붙여넣기(Ctrl+V) 후 직접 [신청]하세요.`
      : `${targetLabel} 휴일근무: 근태신청 화면을 열었습니다. 사유 복사는 실패했으니 직접 입력하세요: ${reasonText}`);
    logActionRecord({
      command: q,
      type: '근태',
      target: `${targetLabel} 휴일근무신청`,
      summary: `${targetLabel} 휴일근무 신청 화면을 열었습니다. 신청은 아직 하지 않았습니다.`,
      steps: [
        `날짜 계산: ${targetLabel} (ISO ${targetDate})`,
        `${copied ? '✓ 사유 클립보드 복사' : '✗ 사유 클립보드 복사 실패'}: "${reasonText}"`,
        '근태신청 화면 열기 (신청 여부는 확인하지 않았습니다)'
      ],
      verified: false,
      details: '근태신청 화면에서 휴일근무를 고르고 사유를 붙여넣은 뒤 직접 신청하세요.'
    });
  }
  // 날짜를 알아듣지 못했을 때: 다가오는 토요일을 미리 넣은 날짜 칸을 보여 주고 사용자가 고르게 한다
  function cmdAskDate(q, onPick) {
    const guess = parseKoreanDate('토요일');
    cmdStep('step1', '1. 날짜를 알아듣지 못했습니다. 아래에서 날짜를 골라 주세요', 'fail');
    const box = cmdResultBox(`<b>어느 날짜로 신청할까요?</b>
      <div class="acts" style="margin-top:8px;align-items:center">
        <input id="cmdDate" type="date" value="${esc(guess ? guess.iso : '')}" style="font-size:14px;padding:6px 8px;border:1px solid var(--line2);border-radius:8px;background:transparent;color:inherit">
        <button class="btn sm primary" id="cmdDateGo">이 날짜로 진행</button>
      </div>
      <div class="muted" style="font-size:12px;margin-top:6px">다가오는 토요일을 미리 넣어 두었습니다. 다른 날이면 바꿔 주세요.</div>`, 'tip');
    if (!box) { toast('날짜를 알아듣지 못했습니다. 예: “이번주 토요일 휴일근무”처럼 날짜를 넣어 다시 지시하세요.'); return; }
    box.querySelector('#cmdDateGo').addEventListener('click', () => {
      const v = (box.querySelector('#cmdDate') || {}).value || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('날짜를 고르세요.'); return; }
      const dt = new Date(v + 'T00:00:00Z');
      const wd = ['일', '월', '화', '수', '목', '금', '토'][dt.getUTCDay()];
      onPick({iso: v, wd, label: `${v}(${wd})`});
    });
  }

  // ---------- B. 보낸메일함 답장 확인 ----------
  async function cmdSentCheck(q, x) {
    const {subject, since} = mailRefOf(x);
    cmdStep('step1', `1. 대상 메일: ${x.title}`, 'done');
    cmdStep('step2', '2. 보낸메일함에서 답장을 찾는 중…');
    let r = null, err = '';
    try { r = await GW.findReply({subject, since}); } catch (e) { err = e && e.message ? e.message : String(e); }
    if (err || !r || r.checked === false) {
      const why = err || '보낸메일함을 찾지 못했습니다';
      cmdStep('step2', `2. 보낸메일함을 확인하지 못했습니다: ${why}`, 'fail');
      cmdResultBox(`<b>✗ 확인하지 못했습니다</b><br>${esc(why)}<br><span class="muted">그룹웨어 보낸메일함에서 직접 확인하세요.</span>`, 'errb');
      logActionRecord({command: q, type: '검증', target: x.title, summary: `보낸메일함 확인 실패: ${why}`, steps: [`원메일 제목: ${subject}`], status: 'error', verified: false});
      return;
    }
    if (!r.found) {
      cmdStep('step2', '2. 보낸메일함 최근 범위에서 찾지 못했습니다', 'fail');
      cmdResultBox(`<b>보낸메일함 최근 범위에서 찾지 못했습니다</b><br>
        · 찾은 제목: Re: ${esc(subject)}${since ? `<br>· 기준: ${esc(since)} 이후 보낸 메일` : ''}<br>
        <span class="muted" style="font-size:12px">보낸메일함 최근 50건에서 같은 제목의 답장만 찾습니다. 제목을 바꿔 새 메일로 보냈다면 찾지 못할 수 있으니 보낸메일함에서 직접 확인하세요.</span>`, 'warn');
      logActionRecord({command: q, type: '검증', target: x.title, summary: '보낸메일함 최근 50건에서 이 메일의 답장을 찾지 못했습니다.', steps: [`원메일 제목: ${subject}`, since ? `기준 시각: ${since} 이후` : '기준 시각 없음'], verified: false});
      return;
    }
    cmdStep('step2', `2. 보낸메일함에서 답장을 찾았습니다 (${r.date || '날짜 정보 없음'})`, 'done');
    const rows = [
      r.subject ? `· 제목: ${esc(r.subject)}` : '',
      r.date ? `· 보낸 일시: <b>${esc(r.date)}</b>` : '',
      r.to ? `· 받는 사람: ${esc(r.to)}` : '',
      `· 첨부: ${r.hasAttach ? '있음' : '없음'}`,
      r.size ? `· 메일 크기: ${esc(kb(r.size))}` : '',
    ].filter(Boolean).join('<br>');
    cmdResultBox(`<b>✓ 보낸메일함에서 답장을 찾았습니다</b><br>${rows}<br><span class="muted" style="font-size:12px">첨부 파일의 내용(어느 시트를 채웠는지 등)은 확인하지 않았습니다. 필요하면 보낸 메일을 열어 직접 확인하세요.</span>`, 'okb');
    toast(`보낸메일함에서 답장을 찾았습니다${r.date ? ` (${r.date.slice(5, 16)})` : ''}.`);
    logActionRecord({
      command: q,
      type: '검증',
      target: x.title,
      summary: `보낸메일함에서 답장을 찾았습니다${r.date ? `: ${r.date}` : ''}${r.to ? ` → ${r.to}` : ''}${r.hasAttach ? ' (첨부 있음)' : ' (첨부 없음)'}.`,
      steps: [`원메일 제목: ${subject}`, `찾은 답장: ${r.subject || '(제목 없음)'}`, `첨부: ${r.hasAttach ? '있음' : '없음'} (첨부 내용은 확인하지 않음)`],
      verified: true
    });
  }
  // 대상 메일 고르기: 선택된 메일 → 지시문 낱말과 제목이 맞는 내 메일 → 최근 메일 목록에서 사용자가 고름
  function cmdPickMail(q, onPick) {
    const sel = cmdSelectedMail();
    if (sel) return onPick(sel);
    const toks = cmdKeywords(q);
    if (toks.length) {
      const mine = mailActions(); // 숨기거나 참고로 내려간 메일도 지시문 낱말이 맞으면 대상으로 삼는다
      const scored = mine.map(x => { const t = String(x.title || '').replace(/\s+/g, ''); return {x, n: toks.filter(k => t.includes(k)).length}; }).filter(o => o.n > 0).sort((a, b) => b.n - a.n);
      if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) return onPick(scored[0].x);
    }
    const list = mailActions().slice(0, 6);
    cmdStep('step1', list.length ? '1. 어느 메일의 답장을 확인할지 골라 주세요' : '1. 확인할 메일 항목이 없습니다', list.length ? 'info' : 'fail');
    const box = cmdResultBox(list.length
      ? `<b>어느 메일의 답장을 확인할까요?</b><div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${list.map((x, i) => `<button class="btn sm" data-i="${i}" style="justify-content:flex-start;text-align:left;font-size:13px">${esc(x.title || '(제목 없음)')}</button>`).join('')}</div>`
      : '<b>확인할 메일 항목이 없습니다</b><br><span class="muted">오늘 할 일에서 메일을 선택한 뒤 다시 지시하세요.</span>', list.length ? 'tip' : 'warn');
    if (!box) { toast('확인할 메일을 먼저 선택하세요.'); return; }
    box.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => onPick(list[Number(b.dataset.i)])));
  }

  // ---------- D. 메일 회신 ----------
  async function cmdMailReply(q, template) {
    const x = cmdSelectedMail() || (typeof mineVisible === 'function' ? mineVisible() : []).find(a => a.type === 'mail');
    if (!x) {
      cmdStep('step1', '1. 회신할 메일이 없습니다', 'fail');
      cmdResultBox('<b>회신할 메일이 없습니다</b><br><span class="muted">오늘 할 일에서 메일을 선택한 뒤 다시 지시하세요.</span>', 'warn');
      return;
    }
    closeOverlay();
    // selectAction은 이미 선택된 항목을 다시 부르면 선택을 해제하므로, 같은 항목이면 다시 부르지 않는다
    if (!(S.sel && S.sel.type === 'action' && S.sel.key === x.key)) selectAction(x.key);
    if (!(S.sel && S.sel.key === x.key)) { toast('작성 중인 화면이 있어 메일을 바꾸지 않았습니다.'); return; }
    openUrl(GW.links.compose('re', {box: x.ref.box, uid: x.ref.uid}), {title: `답장: ${x.title}`});
    const ready = await waitMailEditor(15000);
    if (ready && S.sel && S.sel.key === x.key) autoFillMail(template);
    else toast('메일 작성 화면의 에디터를 찾지 못해 회신문을 넣지 않았습니다. 화면이 열리면 [회신 자동 기입] 버튼을 누르세요.');
    logActionRecord({
      command: q,
      type: '메일',
      target: x.title,
      summary: ready ? '회신 화면을 열었습니다(문구 삽입은 화면에서 확인).' : '회신 화면을 열었지만 에디터를 찾지 못해 문구를 넣지 않았습니다.',
      steps: [`대상 메일: ${x.title}`, `회신문 종류: ${template === 'submit' ? '자료 제출' : '확인'}`, ready ? '에디터 확인 후 회신문 삽입 시도' : '에디터를 찾지 못함'],
      verified: false,
      details: '본문을 확인하고 직접 [보내기]를 누르세요.'
    });
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
          <div class="rb-title"><span class="spin"></span> <b>"${esc(q)}"</b></div>
          <div class="rb-steps" id="rbSteps">
            <div class="rb-step cur" id="step1"><span class="spin"></span> 1. 지시 내용 분석 중…</div>
            <div class="rb-step" id="step2"></div>
            <div class="rb-step" id="step3"></div>
          </div>
        </div>
      `;
    }

    // 1. Natural Language Intent & Date Parsing
    const parsedDate = parseKoreanDate(q);
    const dateLabel = parsedDate ? parsedDate.label : '';

    const isHolidayWork = /휴일\s*근무|휴일\s*대체|대체\s*근무|주말\s*근무|토요일\s*근무|일요일\s*근무|당직/.test(q);
    // "…회신문 작성"처럼 쓰는 지시는 발송 확인이 아니다. 단, "작성은 … 보냈는지 확인"처럼 보낸 여부를 묻는 문장은 확인으로 본다.
    const isWriteReq = /회신문|답장\s*(을|를)?\s*(작성|써)|회신\s*작성/.test(q) || (/작성/.test(q) && !/보냈|보낸/.test(q));
    const isSentCheck = /보낸\s*메일|보낸\s*함|보냈는지|보냈나|발송\s*확인|주당근무|시간외.*확인/.test(q) && /확인|보냈|검증/.test(q) && !isWriteReq;
    const isBizTrip = /출장|관내출장|관외출장/.test(q);
    const isLeave = /연차|반차|오전반차|오후반차|외출|휴가|연가|보상휴가|대체휴가/.test(q) && !isHolidayWork;
    const isResultDraft = /결과|실적|추진/.test(q) && /기안|보고|문서|올려|작성/.test(q);
    const isPlanDraft = /계획|운영계획|사업계획/.test(q) && /기안|문서|올려|작성/.test(q);
    const isBudgetDraft = /예산|품의|비용|집행|지급|지출/.test(q) && /기안|문서|올려|작성|결의|품의|건의/.test(q);
    const isMailConfirm = /답장|회신|메일/.test(q) && /확인|검토/.test(q);
    const isMailSubmit = /답장|회신|메일/.test(q) && /제출|자료/.test(q);

    // Case A: 휴일근무 -> 근태신청 화면 + 사유 복사 (날짜를 모르면 날짜 칸으로 묻는다)
    if (isHolidayWork) {
      if (parsedDate) await cmdHolidayWork(q, parsedDate);
      else cmdAskDate(q, p => cmdHolidayWork(q, p));
      return;
    }

    // Case B: 보낸메일함에서 실제 답장 찾기
    if (isSentCheck) {
      cmdPickMail(q, x => cmdSentCheck(q, x));
      return;
    }

    // Case C: Draft Documents (결과보고, 운영계획, 예산 집행·지급) — 결과는 각 기안 화면의 자동 기입 보고서(showDraftReport)가 기록한다
    if (isResultDraft) {
      closeOverlay();
      openResultPlanPicker();
      return;
    }
    if (isPlanDraft) {
      closeOverlay();
      autoStartDraft('plan');
      return;
    }
    if (isBudgetDraft) {
      closeOverlay();
      autoStartDraft('budget'); // 지급 문서 화면(openPaymentHub)
      return;
    }

    // Case D: Mail Reply
    if (isMailConfirm || isMailSubmit) {
      cmdStep('step1', '1. 회신할 메일을 찾는 중…');
      await cmdMailReply(q, isMailSubmit ? 'submit' : 'confirm');
      return;
    }

    // Case E: Leave / Business Trip
    if (isLeave || isBizTrip) {
      const targetLabel = dateLabel || '';
      const typeName = isBizTrip ? '출장' : '휴가';
      const reasonText = isBizTrip ? `${targetLabel ? targetLabel + ' ' : ''}재단 주요 업무 수행을 위한 관내출장` : `${targetLabel ? targetLabel + ' ' : ''}개인 용무에 따른 연차 휴가 사용`;
      const copied = await cmdCopy(reasonText);
      closeOverlay();
      openUrl(GW.links.route(GW.routes.attendanceRequest), {title: `근태신청: ${typeName}`});
      toast(copied
        ? `${typeName}: 근태신청 화면을 열고 사유를 복사했습니다. 사유란에 붙여넣기(Ctrl+V) 후 직접 [신청]하세요.${targetLabel ? '' : ' 날짜는 화면에서 고르세요.'}`
        : `${typeName}: 근태신청 화면을 열었습니다. 사유 복사는 실패했으니 직접 입력하세요.`);
      logActionRecord({
        command: q,
        type: '근태',
        target: `${targetLabel || '날짜 미지정'} ${typeName}신청`,
        summary: `${typeName} 신청 화면을 열었습니다. 신청은 아직 하지 않았습니다.`,
        steps: [`대상 일자: ${targetLabel || '지시문에 없음(화면에서 선택)'}`, `${copied ? '✓ 사유 복사' : '✗ 사유 복사 실패'}: "${reasonText}"`, '근태신청 화면 열기'],
        verified: false
      });
      return;
    }

    // Case F: 명령으로 알아듣지 못함 -> 통합검색으로 찾는다 (가짜 점검 결과를 만들지 않는다)
    closeOverlay();
    S.search.kw = q;
    go('search');
    if (S.view !== 'search') return; // 작성 중인 화면을 떠나지 않기로 한 경우
    toast('명령으로 알아듣지 못해 통합검색으로 찾았습니다.');
    runSearch();
  }
