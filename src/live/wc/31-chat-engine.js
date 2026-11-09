// GW 통합 업무센터 · 채팅 엔진(도구 등록소, 로컬 의도 라우터, Gemini 함수 호출 루프, 확인 카드)
// 원칙: 쓰기(신청·발송·예약)는 도구가 확인 카드만 만들고, 사용자가 카드의 버튼을 직접 눌러야 실행된다.
//       외부 AI에는 chatSanitizeForLlm을 거친 최소 정보만 보낸다. 도구 결과 문자열은 신뢰할 수 없는 데이터로 취급한다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs. 32·33 조각이 로드될 때 chatRegisterTool을 부른다.

  const CHAT_TOOLS = new Map();
  function chatRegisterTool(def) { if (def && def.name && typeof def.run === 'function') CHAT_TOOLS.set(def.name, def); }

  function chatState() {
    if (!S.chat) {
      let h = [];
      try { h = S.settings.chatSave === false ? [] : store.get('chatHist', []); } catch { h = []; }
      S.chat = {msgs: (Array.isArray(h) ? h : []).slice(-30).filter(m => m && m.text).map(m => ({id: m.id || 'm' + Math.random().toString(36).slice(2), role: m.role === 'user' ? 'user' : 'ai', text: String(m.text).slice(0, 2000), at: m.at || 0, state: 'done', cards: [], tools: []})), busy: false, pending: {}, draft: '', abort: null, stopped: false, seq: 0, announced: ''};
    }
    return S.chat;
  }
  function chatSave() {
    try {
      if (S.settings.chatSave === false) { store.del('chatHist'); return; }
      store.set('chatHist', chatState().msgs.filter(m => m.state !== 'pending' && m.text).slice(-30).map(m => ({id: m.id, role: m.role, text: m.text.slice(0, 2000), at: m.at})));
    } catch (e) { logError('chatSave', e.message); }
  }
  function chatPush(role, text, extra = {}) {
    const st = chatState();
    const m = {id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), role, text: text || '', at: Date.now(), state: 'done', cards: [], tools: [], ...extra};
    st.msgs.push(m);
    if (st.msgs.length > 60) st.msgs.splice(0, st.msgs.length - 60);
    return m;
  }
  function chatClear() { const st = chatState(); if (st.abort) st.abort.abort(); st.msgs = []; st.pending = {}; st.busy = false; st.draft = ''; try { store.del('chatHist'); } catch {} }
  function chatStop() { const st = chatState(); st.stopped = true; if (st.abort) st.abort.abort(); }

  function chatMode() {
    const ready = typeof aiReady === 'function' && aiReady();
    return {mode: ready ? 'ai' : 'local', model: ready ? (aiCfg().model || '') : '', ready};
  }
  function chatSuggestions() {
    const out = [];
    const urgent = S.a ? mineVisible().filter(x => ['overdue', 'urgent'].includes(stateOf(x))).length : 0;
    out.push(urgent ? '급한 일 알려줘' : '오늘 요약해줘', '내일 일정 알려줘', '오늘 누가 출장이야?', '남은 연차 알려줘', '차량 예약 가능한 시간', '다음 주 일정 보여줘', '받은 메일 처리할 거 있어?');
    return [...new Set(out)];
  }
  const chatNowStr = () => { const p = R.kstNow(new Date()); return `${p.date} (${R.chatDowName(p.date)}) ${new Date(Date.now() + 9 * 3600000).toISOString().slice(11, 16)}`; };

  // ---------- 도구 실행 ----------
  async function chatExec(name, args, msg, ctx) {
    const def = CHAT_TOOLS.get(name);
    if (!def) return {ok: false, text: '지원하지 않는 기능입니다.'};
    const chip = {name, label: def.label || name, state: 'run'};
    msg.tools.push(chip); chatRefresh();
    let res;
    try {
      res = await Promise.race([def.run(args && typeof args === 'object' ? args : {}, {S, now: new Date(), userText: ctx.userText || '', viaAi: !!ctx.viaAi}), new Promise((_, rej) => setTimeout(() => rej(new Error('시간이 너무 오래 걸립니다')), 25000))]);
      if (!res || typeof res !== 'object') res = {ok: false, text: '결과를 받지 못했습니다.'};
    } catch (e) { logError('chatTool.' + name, e.message); res = {ok: false, text: '처리하지 못했습니다: ' + String(e.message || e).slice(0, 100)}; }
    chip.state = res.ok ? 'ok' : 'err';
    const st = chatState();
    for (const c of res.cards || []) {
      if (c && c.type === 'confirm') {
        const id = 'cf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const card = {...c, id, fresh: true, state: '', result: ''}; const fn = c.onConfirm; delete card.onConfirm;
        st.pending[id] = {fn, at: Date.now(), card, msg};
        msg.cards.push(card);
      } else if (c) msg.cards.push(c);
    }
    return res;
  }

  // ---------- 확인 카드 ----------
  function chatCancel(id) {
    const st = chatState(), p = st.pending[id];
    if (!p) return;
    delete st.pending[id]; p.card.state = 'cancel'; chatRefresh();
  }
  async function chatConfirm(id, ev) {
    const st = chatState(), p = st.pending[id];
    if (!p) { toast('이 확인 카드는 더 이상 유효하지 않습니다. 다시 요청해 주세요.'); return; }
    if (ev && ev.isTrusted === false) return;
    if (Date.now() - p.at > 10 * 60000) { delete st.pending[id]; p.card.state = 'cancel'; p.card.result = ''; chatRefresh(); toast('시간이 지나 취소되었습니다. 다시 요청해 주세요.'); return; }
    if (!(navigator.userActivation && navigator.userActivation.isActive)) { toast('화면의 버튼을 직접 눌러 주세요.'); return; }
    delete st.pending[id]; p.card.state = 'done'; p.card.result = '진행 중…'; chatRefresh();
    try {
      const r = await p.fn();
      p.card.result = (r && r.text) || '처리했습니다.';
      for (const c of (r && r.cards) || []) if (c && c.type !== 'confirm') p.msg.cards.push(c);
    } catch (e) { logError('chatConfirm', e.message); p.card.result = '처리하지 못했습니다: ' + String(e.message || e).slice(0, 100); }
    chatRefresh(); chatSave();
  }

  // ---------- 로컬 라우터(키 없이도 동작) ----------
  async function chatRunLocal(text, ai, note) {
    const it = R.chatIntent(text, new Date());
    if (note) ai.cards.push({type: 'note', tone: 'warn', text: note});
    if (it.tool && CHAT_TOOLS.has(it.tool)) {
      const res = await chatExec(it.tool, it.args, ai, {userText: text, viaAi: false});
      ai.text = res.text || '';
      return;
    }
    ai.text = '아직 이해하지 못했습니다. 이렇게 말씀해 보세요.\n• 내일 일정 알려줘\n• 김지은 언제 출장이야?\n• 급한 일 알려줘\n• 11/12 연차 신청해줘\n• 차량 예약 가능한 시간';
    if (!chatMode().ready) ai.cards.push({type: 'setup', reason: 'AI를 연결하면 이렇게 정해진 문장이 아니어도 자유롭게 시킬 수 있습니다.'});
  }

  // ---------- Gemini 함수 호출 루프 ----------
  async function chatGemini(body, ctl) {
    const c = aiCfg();
    let model = (typeof aiModelName === 'function' && aiModelName()) || 'gemini-flash-latest';
    for (let attempt = 0; attempt < 3; attempt++) {
      const tm = setTimeout(() => ctl.abort(), 30000);
      try {
        const r = await fetch(`${AI_HOST}/models/${model}:generateContent`, {method: 'POST', headers: {'x-goog-api-key': c.key, 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: ctl.signal});
        const j = await r.json().catch(() => ({}));
        if (r.ok) return j;
        const msg = (j.error && j.error.message) || 'HTTP ' + r.status;
        if (r.status === 404 && attempt === 0) { store.set('ai', {key: c.key, model: ''}); model = 'gemini-flash-latest'; continue; }
        if ((r.status === 429 || r.status === 503) && attempt < 1) { await new Promise(res => setTimeout(res, 1300)); continue; }
        throw Object.assign(new Error(msg), {status: r.status});
      } catch (e) {
        if (e.status) throw e;
        throw Object.assign(new Error(e.name === 'AbortError' ? 'abort' : String(e.message || e)), {status: 0, kind: 'net', aborted: e.name === 'AbortError'});
      } finally { clearTimeout(tm); }
    }
    throw Object.assign(new Error('retry'), {status: 503});
  }
  async function chatRunAi(text, ai) {
    const st = chatState(), ctl = new AbortController();
    st.abort = ctl;
    const name = (S.raw && S.raw.principal && S.raw.principal.name) || '';
    const contents = [];
    for (const m of st.msgs.slice(-9, -2)) if (m.text && m.state === 'done' && (m.role === 'user' || m.role === 'ai')) contents.push({role: m.role === 'user' ? 'user' : 'model', parts: [{text: R.chatSanitizeText(m.text, 400)}]});
    contents.push({role: 'user', parts: [{text: R.chatSanitizeText(text, 600)}]});
    const tools = R.chatToGeminiTools([...CHAT_TOOLS.values()]);
    const system = R.chatSystemPrompt(chatNowStr(), name);
    const texts = [];
    for (let round = 0; round < 4; round++) {
      const j = await chatGemini(R.chatBuildRequest({system, contents, tools, maxTokens: 1024}), ctl);
      const r = R.chatParseResponse(j);
      if (r.blocked) throw Object.assign(new Error('blocked'), {status: 200, kind: 'blocked'});
      if (r.error && !r.calls.length) throw Object.assign(new Error(r.error), {status: 200, kind: 'server'});
      if (!r.calls.length) { ai.text = r.text || texts.join('\n'); return; }
      contents.push({role: 'model', parts: r.parts});
      const resp = [];
      for (const call of r.calls.slice(0, 4)) {
        const res = await chatExec(call.name, call.args, ai, {userText: text, viaAi: true});
        if (res.text) texts.push(res.text);
        resp.push({functionResponse: {name: call.name, response: {result: R.chatSanitizeForLlm({ok: res.ok, text: res.llm !== undefined ? res.llm : res.text, data: res.data})}}});
      }
      contents.push({role: 'user', parts: resp});
    }
    ai.text = texts.join('\n') || '요청을 정리하지 못했습니다. 조금 더 구체적으로 말씀해 주세요.';
  }

  async function chatSend(text) {
    const st = chatState();
    text = String(text || '').trim().slice(0, 1000);
    if (!text || st.busy) return;
    st.busy = true; st.stopped = false;
    chatPush('user', text);
    const ai = chatPush('ai', '', {state: 'pending'});
    chatRefresh();
    try {
      if (chatMode().ready && allowed('aiAssistant')) {
        try { await chatRunAi(text, ai); }
        catch (e) {
          if (st.stopped || e.aborted && st.stopped) { ai.text = ai.text || '중지했습니다.'; }
          else {
            logError('chatAi', e.message);
            const msg = R.chatErrorMessage(e.status || 0, e.message, e.kind || '');
            if (ai.tools.length) { ai.text = ai.text || '일부만 처리했습니다.'; ai.cards.push({type: 'note', tone: 'warn', text: msg}); }
            else { await chatRunLocal(text, ai, msg); if ((e.status === 401 || e.status === 403 || e.kind === 'key') && !ai.cards.some(c => c.type === 'setup')) ai.cards.push({type: 'setup', reason: '저장된 AI 키가 거절되었습니다. 다시 연결해 주세요.'}); }
          }
        }
      } else await chatRunLocal(text, ai, '');
    } catch (e) { logError('chatSend', e.message); ai.text = '처리하지 못했습니다: ' + String(e.message || e).slice(0, 100); ai.state = 'error'; }
    if (ai.state === 'pending') ai.state = 'done';
    if (!ai.text && !ai.cards.length) ai.text = '결과가 없습니다.';
    st.busy = false; st.abort = null;
    chatSave(); chatRefresh();
  }
