// GW 통합 업무센터 · AI 도우미 (Google Gemini)
// 내 업무 요약(제목, 상태, 마감)만 보내 우선순위 정리와 질문 답변을 받는다. 메일·문서 본문과 계좌번호는 보내지 않는다.
// API 키는 이 PC의 이 브라우저에만 저장한다. 키 발급은 화면 안내를 따라 3분이면 된다(무료 사용량 있음).
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const AI_HOST = 'https://generativelanguage.googleapis.com/v1beta';
  const aiCfg = () => store.get('ai', {key: '', model: ''});
  const aiShell = body => `<div class="modal"><div class="dlg" data-stop="1" style="width:min(780px,96vw);padding:24px 26px;max-height:90vh;overflow:auto" role="dialog" aria-label="AI 도우미"><button class="btn icon ghost x" data-act="aiClose" aria-label="닫기">${ic('x')}</button>${body}</div></div>`;
  const aiRich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[ \t]*[*-] /gm, '• ').replace(/\n/g, '<br>');

  function aiContext() {
    const mine = mineVisible().map(x => ({state: STATE_LABEL_OF(x), title: x.title, headline: x.headline, deadline: x.deadline && x.deadline.date ? (x.deadline.date.slice(5) + (x.deadline.time ? ' ' + x.deadline.time : '')) : ''}));
    const p = R.kstNow(new Date()), mk = p.date.slice(0, 7).replace('-', '');
    const team = (S.team || {})[mk];
    const sum = team && team.cal ? R.teamHomeSummary(team.cal, new Date()) : {leave: [], trip: [], problems: []};
    return R.buildAiContext({name: (S.raw && S.raw.principal && S.raw.principal.name) || '', mine, deadlines: S.a.deadlines || [], todayAway: [...sum.leave, ...sum.trip], ownProblems: sum.problems, leave: S.raw && S.raw.data && S.raw.data.leave});
  }
  const STATE_LABEL_OF = x => ({overdue: '기한 지남', urgent: '급함', todo: '할 일', check: '확인', confirm: '제출 확인', wait: '결재 대기', verify: '확인'}[stateOf(x)] || stateOf(x));

  function openAi() {
    if (gated('aiAssistant')) return;
    S.paletteOpen = true;
    const c = aiCfg();
    if (!c.key) { aiSetup(); return; }
    $('#overlay').innerHTML = aiShell(`
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px"><div class="cmd-logo">${ic('doc')}</div><div><h2 style="margin:0;font-size:18px">AI 도우미</h2><div class="muted">내 업무 요약을 보고 답합니다. 상신·결재 같은 실행은 하지 않고 제안만 합니다.</div></div></div>
      <div class="acts" style="margin-top:0">
        <button class="btn" data-act="aiAsk" data-q="오늘 무엇부터 처리해야 하는지 우선순위를 정하고 이유를 한 줄씩 설명해 주세요.">오늘 우선순위 정리</button>
        <button class="btn" data-act="aiAsk" data-q="마감이 가까운 일과 놓치기 쉬운 일을 짚어 주세요.">마감·놓친 일 점검</button>
        <button class="btn" data-act="aiAsk" data-q="오늘 업무를 아침 브리핑처럼 5줄 이내로 요약해 주세요.">아침 브리핑</button>
        <button class="btn" data-act="aiAsk" data-q="오늘 직원 부재와 내 일정을 고려해 협조 요청이 필요한 일이 있는지 알려 주세요.">협조·부재 확인</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px"><input id="aiQ" class="inp" style="flex:1;height:40px" placeholder="무엇이든 물어보세요 (예: 이번 주에 먼저 끝내야 할 일은?)" aria-label="AI에게 질문"><button class="btn primary" data-act="aiAsk">물어보기</button></div>
      <div id="aiOut" class="box" style="margin-top:14px;min-height:80px;line-height:1.8"><span class="muted">질문을 고르거나 입력하세요.</span></div>
      <details style="margin-top:10px"><summary class="muted" style="cursor:pointer">AI에게 보내는 내용 보기</summary><pre style="white-space:pre-wrap;font:inherit;font-size:12.5px;margin:6px 0 0">${esc(aiContext())}</pre><div class="muted" style="font-size:12px">업무 제목·상태·마감과 직원 이름·휴가 구분만 보냅니다. 메일·문서 본문, 계좌번호, 비밀번호는 보내지 않습니다.</div></details>
      <div class="acts"><button class="btn sm ghost" data-act="aiSetup">키 바꾸기</button><button class="btn sm ghost danger" data-act="aiForget">키 지우기</button></div>`);
  }

  function aiSetup(msg = '') {
    S.paletteOpen = true;
    $('#overlay').innerHTML = aiShell(`
      <h2 style="margin:0 0 4px;font-size:18px">AI 도우미 연결 (처음 한 번, 약 3분)</h2>
      <div class="muted" style="margin-bottom:12px">Google의 Gemini를 사용합니다. 개인 구글 계정이면 무료 사용량으로 충분합니다. 카드 등록은 필요 없습니다.</div>
      <ol style="line-height:2;padding-left:20px;margin:0 0 10px">
        <li>아래 버튼을 눌러 구글 AI 스튜디오를 엽니다. 구글 로그인이 되어 있어야 합니다.<br><a class="btn primary" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">${ic('ext')}API 키 발급 페이지 열기</a></li>
        <li>화면의 <b>“API 키 만들기(Create API key)”</b> 버튼을 누릅니다. 프로젝트를 고르라고 하면 <b>“새 프로젝트에서 API 키 만들기”</b>를 선택합니다.</li>
        <li>만들어진 키(<b>AIza</b> 또는 <b>AQ.</b>로 시작하는 긴 글자) 옆의 <b>복사</b> 아이콘을 누릅니다.</li>
        <li>여기에 붙여넣고 <b>연결 시험</b>을 누릅니다.</li>
      </ol>
      <div style="display:flex;gap:8px"><input id="aiKey" class="inp" style="flex:1;height:40px" type="password" placeholder="AIza 또는 AQ. 로 시작하는 키 붙여넣기" autocomplete="off" aria-label="Gemini API 키"><button class="btn primary" data-act="aiSaveKey">연결 시험</button></div>
      ${msg ? `<div class="box warn" style="margin-top:10px">${esc(msg)}</div>` : ''}
      <div class="muted" style="font-size:12px;margin-top:10px">키는 이 PC의 브라우저에만 저장되며 업무센터 밖으로 보내지 않습니다(구글 호출에만 사용). 키가 새어 나갔다고 느끼면 같은 페이지에서 삭제하고 새로 만드세요.</div>`);
  }

  async function aiRequest(path, body, key) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(`${AI_HOST}/${path}`, {method: body ? 'POST' : 'GET', headers: {'x-goog-api-key': key, ...(body ? {'Content-Type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal});
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { const m = (j.error && j.error.message) || ('HTTP ' + r.status); const err = new Error(m); err.status = r.status; throw err; }
      return j;
    } finally { clearTimeout(tm); }
  }
  async function aiSaveKey() {
    const key = (($('#aiKey') || {}).value || '').trim();
    if (!R.isGeminiKey(key)) { aiSetup('키 형식이 맞지 않습니다. AIza 또는 AQ. 로 시작하는 긴 글자를 그대로 붙여넣으세요(앞뒤 공백, 줄바꿈 없이).'); return; }
    $('#overlay').innerHTML = aiShell('<div class="muted"><span class="spin"></span> 연결을 시험하고 있습니다…</div>');
    try {
      const list = await aiRequest('models?pageSize=100', null, key);
      const names = (list.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
      const pick = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'].find(n => names.includes(n)) || names.find(n => /flash/.test(n) && !/(preview|exp|lite|thinking|image|tts)/.test(n)) || names[0];
      if (!pick) throw new Error('사용할 수 있는 모델이 없습니다');
      await aiRequest(`models/${pick}:generateContent`, {contents: [{parts: [{text: '연결 시험입니다. "연결됨" 두 글자만 답하세요.'}]}]}, key);
      store.set('ai', {key, model: pick});
      toast(`AI 도우미가 연결되었습니다 (${pick})`);
      openAi();
    } catch (e) {
      logError('aiSaveKey', e.message);
      aiSetup(e.status === 400 || e.status === 403 ? '키가 거절되었습니다. 키를 다시 복사해 붙여넣거나 새 키를 만들어 보세요. (' + e.message.slice(0, 80) + ')' : '연결하지 못했습니다: ' + e.message.slice(0, 120));
    }
  }
  async function aiAsk(q) {
    const c = aiCfg();
    q = (q || (($('#aiQ') || {}).value || '')).trim();
    if (!q) { toast('질문을 입력하세요.'); return; }
    const out = $('#aiOut');
    if (out) out.innerHTML = '<span class="muted"><span class="spin"></span> 생각하는 중…</span>';
    try {
      const j = await aiRequest(`models/${c.model || 'gemini-2.5-flash'}:generateContent`, {systemInstruction: {parts: [{text: R.AI_SYSTEM}]}, contents: [{role: 'user', parts: [{text: `[내 업무 요약]\n${aiContext()}\n\n[질문]\n${q}`}]}], generationConfig: {temperature: 0.3, maxOutputTokens: 900}}, c.key);
      const text = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || []).map(p => p.text || '').join('').trim();
      if (!text) throw new Error('답변이 비어 있습니다(안전 필터 또는 사용량 제한일 수 있습니다)');
      if ($('#aiOut')) $('#aiOut').innerHTML = aiRich(text) + '<div class="muted" style="font-size:12px;margin-top:8px">AI 답변은 참고용입니다. 마감·금액은 원문으로 확인하세요.</div>';
      logActionRecord({command: 'AI 질문: ' + q.slice(0, 60), type: 'AI', target: '', summary: 'AI 도우미 답변을 받았습니다(실행 없음).', steps: [], verified: true});
    } catch (e) {
      logError('aiAsk', e.message);
      const msg = e.status === 429 ? '무료 사용량을 잠시 다 썼습니다. 1분 뒤 다시 시도하세요.' : e.status === 400 || e.status === 403 ? '키가 거절되었습니다. "키 바꾸기"로 다시 연결하세요.' : e.name === 'AbortError' ? '응답이 늦습니다. 잠시 뒤 다시 시도하세요.' : '답을 받지 못했습니다: ' + e.message.slice(0, 120);
      if ($('#aiOut')) $('#aiOut').innerHTML = `<span style="color:var(--hi)">${esc(msg)}</span>`;
    }
  }
  function aiForget() { if (confirm('저장된 API 키를 지울까요?')) { store.del('ai'); toast('키를 지웠습니다.'); aiSetup(); } }
  function aiClose() { closeOverlay(); }
