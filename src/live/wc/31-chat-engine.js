// GW 비서 · 채팅 엔진(도구 등록소, 로컬 의도 라우터, Gemini 호출, 확인 카드)
// 흐름: ① 말을 먼저 로컬 라우터로 알아듣고 도구를 바로 실행해 결과를 보여 준다(AI가 없어도·느려도 즉시 답이 보임).
//       ② AI가 연결돼 있으면 그 결과를 근거로 한 번만 더 "정리"를 요청해 답을 다듬는다(실패해도 ①의 답이 그대로 남는다).
//       ③ 로컬 라우터가 못 알아들은 말은 AI가 도구를 골라 부르는 함수 호출(최대 3단계)로 처리한다.
// 원칙: 쓰기(신청·발송·예약)는 도구가 확인 카드만 만들고 사용자가 직접 눌러야 실행된다. 외부 AI에는 chatSanitizeForLlm을 거친 최소 정보만 보낸다.
// Gemini 무료 사용량은 모델마다 따로 세므로, lite 계열부터 쓰고 한도(429)·없음(404)·과부하(503)가 나면 그 모델을 쉬게 하고 다음 모델로 넘어간다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs. 32·33 조각이 로드될 때 chatRegisterTool을 부른다.

  const CHAT_TOOLS = new Map();
  function chatRegisterTool(def) { if (def && def.name && typeof def.run === 'function') CHAT_TOOLS.set(def.name, def); }
  const CHAT_COMPOSE = new Set(['get_overview', 'list_tasks', 'get_schedule', 'get_my_attendance', 'search_documents', 'get_resource_status', 'get_gcal_sync']); // 직원 실명(get_staff_status)과 연락처(lookup_person)는 외부 AI 정리로 보내지 않는다
  const CHAT_HIST_VER = 3; // 올리면 예전 대화 기록을 한 번 비운다(형식이 바뀌었을 때)

  function chatState() {
    if (!S.chat) {
      let h = [];
      try {
        if (store.get('chatHistV', 0) !== CHAT_HIST_VER) { store.del('chatHist'); store.set('chatHistV', CHAT_HIST_VER); }
        h = S.settings.chatSave === false ? [] : store.get('chatHist', []);
      } catch { h = []; }
      S.chat = {msgs: (Array.isArray(h) ? h : []).slice(-30).filter(m => m && (m.text || (m.cards && m.cards.length))).map(m => ({id: m.id || 'm' + Math.random().toString(36).slice(2), role: m.role === 'user' ? 'user' : 'ai', text: String(m.text || '').slice(0, 2000), at: m.at || 0, state: 'done', cards: Array.isArray(m.cards) ? m.cards.slice(0, 4) : [], tools: []})), busy: false, pending: {}, draft: '', abort: null, stopped: false, seq: 0, announced: '', model: '', ctx: {lastItems: []}};
    }
    if (!S.chat.ctx) S.chat.ctx = {lastItems: []};
    return S.chat;
  }
  function chatSave() {
    try {
      if (S.settings.chatSave === false) { store.del('chatHist'); return; }
      const keep = c => c && !['confirm', 'setup'].includes(c.type);
      store.set('chatHist', chatState().msgs.filter(m => m.state === 'done' && (m.text || m.cards.length)).slice(-24).map((m, i, a) => ({id: m.id, role: m.role, text: m.text.slice(0, 2000), at: m.at, cards: i >= a.length - 8 ? m.cards.filter(keep).slice(0, 3) : []})));
    } catch (e) { logError('chatSave', e.message); }
  }
  function chatPush(role, text, extra = {}) {
    const st = chatState();
    const m = {id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), role, text: text || '', at: Date.now(), state: 'done', cards: [], tools: [], ...extra};
    st.msgs.push(m);
    if (st.msgs.length > 60) st.msgs.splice(0, st.msgs.length - 60);
    return m;
  }
  function chatClear() { const st = chatState(); st.seq++; if (st.abort) st.abort.abort(); st.msgs = []; st.pending = {}; st.busy = false; st.draft = ''; st.ctx = {lastItems: []}; try { store.del('chatHist'); } catch {} }
  function chatStop() { const st = chatState(); st.stopped = true; st.seq++; if (st.abort) st.abort.abort(); }

  // ---------- 모델 선택과 한도 ----------
  const chatCool = () => store.get('chatCool', {});
  function chatSetCool(model, ms) { if (!ms) return; const c = chatCool(), now = Date.now(); for (const k of Object.keys(c)) if (c[k] <= now) delete c[k]; c[model] = now + ms; store.set('chatCool', c); }
  const chatAvailable = list => { const c = chatCool(), now = Date.now(); return list.filter(m => !(c[m] > now)); };
  async function chatModelList() {
    const cached = store.get('chatModels', null);
    if (cached && Array.isArray(cached.list) && cached.list.length && Date.now() - cached.at < 12 * 3600000) return cached.list;
    try {
      const j = await aiRequest('models?pageSize=200', null, aiCfg().key);
      const names = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name);
      const list = R.chatRankModels(names);
      if (list.length) { store.set('chatModels', {at: Date.now(), list}); return list; }
    } catch (e) { logError('chatModels', e.message); }
    return (cached && cached.list) || ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  }
  function chatMode() {
    const ready = typeof aiReady === 'function' && aiReady();
    const cached = store.get('chatModels', null);
    const limited = ready && !!cached && Array.isArray(cached.list) && cached.list.length > 0 && chatAvailable(cached.list).length === 0;
    return {mode: ready ? 'ai' : 'local', model: ready ? (chatState().model || (cached && chatAvailable(cached.list || [])[0]) || '') : '', ready, limited};
  }
  function chatSuggestions() {
    const out = [];
    const urgent = S.a ? mineVisible().filter(x => ['overdue', 'urgent'].includes(stateOf(x))).length : 0;
    out.push(urgent ? '급한 일 알려줘' : '오늘 요약해줘', '내일 일정 알려줘', '오늘 누가 출장이야?', '답장 필요한 메일 있어?', '남은 연차 알려줘', '차량 예약 가능한 시간', '구글 캘린더에 올릴 거 있어?');
    return [...new Set(out)];
  }
  const chatNowStr = () => { const p = R.kstNow(new Date()); return `${p.date} (${R.chatDowName(p.date)}) ${new Date(Date.now() + 9 * 3600000).toISOString().slice(11, 16)}`; };

  // ---------- 도구 실행 ----------
  async function chatExec(name, args, msg, ctx) {
    const def = CHAT_TOOLS.get(name);
    if (!def) return {ok: false, text: '지원하지 않는 기능입니다.'};
    const chip = {name, label: def.label || name, state: 'run'};
    msg.tools.push(chip); chatRefresh();
    const st = chatState();
    const runArgs = args && typeof args === 'object' ? {...args} : {};
    if (runArgs.index && !runArgs.itemId && !runArgs.key && st.ctx && Array.isArray(st.ctx.lastItems)) {
      const hit = st.ctx.lastItems[Number(runArgs.index) - 1];
      if (hit) {
        if (hit.itemId) runArgs.itemId = hit.itemId;
        if (hit.title && !runArgs.query) runArgs.query = hit.title;
        if (hit.uid && !runArgs.mail_key) runArgs.mail_key = hit.itemId || '';
      }
    }
    let res;
    try {
      res = await Promise.race([def.run(runArgs, {S, now: new Date(), userText: ctx.userText || '', viaAi: !!ctx.viaAi}), new Promise((_, rej) => setTimeout(() => rej(new Error('시간이 너무 오래 걸립니다')), 25000))]);
      if (!res || typeof res !== 'object') res = {ok: false, text: '결과를 받지 못했습니다.'};
    } catch (e) { logError('chatTool.' + name, e.message); res = {ok: false, text: '처리하지 못했습니다: ' + String(e.message || e).slice(0, 100)}; }
    chip.state = res.ok ? 'ok' : 'err';
    if (res.ok && res.data && Array.isArray(res.data.items) && res.data.items.length) {
      st.ctx.lastItems = res.data.items.map(it => ({itemId: it.itemId || '', title: it.title || '', uid: it.uid || ''}));
    }
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
    delete st.pending[id]; p.card.state = 'running'; p.card.result = '진행 중…'; chatRefresh();
    try {
      const r = await p.fn();
      p.card.state = r && r.ok === false ? 'err' : 'done';
      p.card.result = (r && r.text) || '처리했습니다.';
      for (const c of (r && r.cards) || []) if (c && c.type !== 'confirm') p.msg.cards.push(c);
    } catch (e) { logError('chatConfirm', e.message); p.card.state = 'err'; p.card.result = '처리하지 못했습니다: ' + String(e.message || e).slice(0, 100); }
    chatRefresh(true); chatSave();
  }

  const CHAT_HELP = '아직 이해하지 못했습니다. 이렇게 말씀해 보세요.\n• 내일 일정 알려줘\n• 직원 이름 + 언제 출장이야?\n• 급한 일 알려줘\n• 답장 필요한 메일 있어?\n• 11/12 연차 신청해줘\n• 차량 예약 가능한 시간';

  // ---------- Gemini 호출 (모델 자동 전환) ----------
  async function chatGemini(body, ctl) {
    const c = aiCfg();
    const avail = chatAvailable(await chatModelList());
    if (!avail.length) throw Object.assign(new Error('quota'), {status: 429, kind: 'quota', cooled: true});
    let last = null;
    for (const model of avail.slice(0, 3)) {
      // 모델마다 새 중단 신호를 쓴다. 같은 신호를 다시 쓰면 한 모델이 시간 초과된 뒤 다음 모델 요청도 즉시 끊긴다.
      const mc = new AbortController();
      const onStop = () => mc.abort();
      if (ctl.signal.aborted) mc.abort(); else ctl.signal.addEventListener('abort', onStop, {once: true});
      let timedOut = false;
      const tm = setTimeout(() => { timedOut = true; mc.abort(); }, 25000);
      try {
        const r = await fetch(`${AI_HOST}/models/${model}:generateContent`, {method: 'POST', headers: {'x-goog-api-key': c.key, 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: mc.signal});
        const j = await r.json().catch(() => ({}));
        if (r.ok) { chatState().model = model; return j; }
        const msg = (j.error && j.error.message) || 'HTTP ' + r.status;
        const ri = ((j.error && j.error.details) || []).find(d => /RetryInfo/.test(d['@type'] || ''));
        chatSetCool(model, R.chatCooldownFor(r.status, msg, ri && ri.retryDelay));
        last = Object.assign(new Error(msg), {status: r.status, kind: r.status === 429 ? 'quota' : r.status === 404 ? 'model' : r.status >= 500 ? 'server' : /API key|key not valid/i.test(msg) || r.status === 401 || r.status === 403 ? 'key' : ''});
        if (r.status === 429 || r.status === 404 || r.status >= 500) continue; // 다음 모델로
        throw last;
      } catch (e) {
        if (e === last) throw e;
        if (e.name === 'AbortError') { if (chatState().stopped || !timedOut) throw Object.assign(new Error('abort'), {status: 0, kind: 'net', aborted: true}); chatSetCool(model, 60000); last = Object.assign(new Error('timeout'), {status: 0, kind: 'net'}); continue; }
        throw Object.assign(new Error(String(e.message || e)), {status: 0, kind: 'net'});
      } finally { clearTimeout(tm); ctl.signal.removeEventListener('abort', onStop); }
    }
    throw last || Object.assign(new Error('retry'), {status: 503, kind: 'server'});
  }

  // ② 조회 결과를 근거로 답을 다듬는다(가능하면 SSE 스트리밍, 실패해도 로컬 답이 남는다).
  async function chatCompose(text, res, ai, runSeq) {
    const chip = {name: 'compose', label: 'AI 정리', state: 'run'};
    ai.tools.push(chip); chatRefresh();
    const st = chatState(), ctl = new AbortController();
    st.abort = ctl;
    try {
      const org = (S.raw && S.raw.principal && S.raw.principal.compName) || '';
      const qSafe = R.chatSanitizeText(text, 300);
      const rSafe = R.chatSanitizeText(res.llm !== undefined ? res.llm : res.text, 1800);
      const dSafe = JSON.stringify(R.chatSanitizeForLlm(res.data || {}));
      const body = R.chatBuildRequest({system: R.chatSystemPrompt(chatNowStr(), (S.raw && S.raw.principal && S.raw.principal.name) || '', org), contents: [{role: 'user', parts: [{text: R.chatComposePrompt(qSafe, rSafe, dSafe)}]}], maxTokens: 500});
      const c = aiCfg();
      const avail = chatAvailable(await chatModelList());
      let streamed = '';
      if (avail.length) {
        const model = avail[0];
        const mc = new AbortController();
        const onStop = () => mc.abort();
        if (ctl.signal.aborted) mc.abort(); else ctl.signal.addEventListener('abort', onStop, {once: true});
        const tm = setTimeout(() => mc.abort(), 20000);
        try {
          const resp = await fetch(`${AI_HOST}/models/${model}:streamGenerateContent?alt=sse`, {method: 'POST', headers: {'x-goog-api-key': c.key, 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: mc.signal});
          if (resp.ok && resp.body && typeof resp.body.getReader === 'function') {
            const reader = resp.body.getReader(), dec = new TextDecoder();
            let buf = '';
            while (true) {
              const {done, value} = await reader.read();
              if (done || st.stopped || st.seq !== runSeq) break;
              buf += dec.decode(value, {stream: true});
              const lines = buf.split('\n'); buf = lines.pop() || '';
              for (const ln of lines) {
                if (!ln.startsWith('data:')) continue;
                try {
                  const j = JSON.parse(ln.slice(5));
                  const chunk = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
                  if (chunk) { streamed += chunk; ai.text = streamed; ai.composed = true; chatRefresh(); }
                } catch {}
              }
            }
            if (streamed.trim() && !st.stopped && st.seq === runSeq) { st.model = model; chip.state = 'ok'; return; }
          }
        } catch {} finally { clearTimeout(tm); ctl.signal.removeEventListener('abort', onStop); }
      }
      if (st.stopped || st.seq !== runSeq) return;
      const r = R.chatParseResponse(await chatGemini(body, ctl));
      if (st.stopped || st.seq !== runSeq) return;
      if (r.text) { ai.text = r.text; ai.composed = true; chip.state = 'ok'; return; }
    } catch (e) {
      if (!st.stopped && st.seq === runSeq) logError('chatCompose', e.message);
      if (e.kind === 'key' && st.seq === runSeq && !ai.cards.some(c => c.type === 'setup')) ai.cards.push({type: 'setup', reason: '저장된 AI 키가 거절되었습니다. 다시 연결해 주세요.'});
    }
    ai.tools = ai.tools.filter(t => t !== chip);
  }

  // ③ 로컬이 못 알아들은 말: AI가 도구를 골라 부른다.
  async function chatRunAi(text, ai, runSeq) {
    const st = chatState(), ctl = new AbortController();
    st.abort = ctl;
    const name = (S.raw && S.raw.principal && S.raw.principal.name) || '';
    const org = (S.raw && S.raw.principal && S.raw.principal.compName) || '';
    const contents = [];
    for (const m of st.msgs.slice(-9, -2)) if (m.text && m.state === 'done' && chatHistoryCurrent(m.at) && (m.role === 'user' || m.role === 'ai')) contents.push({role: m.role === 'user' ? 'user' : 'model', parts: [{text: R.chatSanitizeText(m.text, 400)}]});
    contents.push({role: 'user', parts: [{text: R.chatSanitizeText(text, 600)}]});
    const tools = R.chatToGeminiTools([...CHAT_TOOLS.values()]);
    const system = R.chatSystemPrompt(chatNowStr(), name, org);
    const texts = [];
    for (let round = 0; round < 3; round++) {
      if (st.stopped || st.seq !== runSeq) return;
      const j = await chatGemini(R.chatBuildRequest({system, contents, tools, maxTokens: 1024}), ctl);
      if (st.stopped || st.seq !== runSeq) return;
      const r = R.chatParseResponse(j);
      if (r.blocked) throw Object.assign(new Error('blocked'), {status: 200, kind: 'blocked'});
      if (r.error && !r.calls.length) throw Object.assign(new Error(r.error), {status: 200, kind: 'server'});
      if (!r.calls.length) { ai.text = r.text || texts.join('\n'); return; }
      let fc = 0;
      const keptParts = r.parts.filter(p => !p.functionCall || (++fc <= 4));
      contents.push({role: 'model', parts: keptParts});
      const resp = [];
      for (const call of r.calls.slice(0, 4)) {
        if (st.stopped || st.seq !== runSeq) return;
        const res = await chatExec(call.name, call.args, ai, {userText: text, viaAi: true});
        if (st.stopped || st.seq !== runSeq) return;
        if (res.text) texts.push(res.text);
        resp.push({functionResponse: {name: call.name, response: {result: R.chatSanitizeForLlm({ok: res.ok, text: res.llm !== undefined ? res.llm : res.text, data: res.data})}}});
      }
      contents.push({role: 'user', parts: resp});
    }
    if (!st.stopped && st.seq === runSeq) ai.text = texts.join('\n') || '요청을 정리하지 못했습니다. 조금 더 구체적으로 말씀해 주세요.';
  }

  async function chatSend(text) {
    const st = chatState();
    text = String(text || '').trim().slice(0, 1000);
    if (!text || st.busy) return;
    st.busy = true; st.stopped = false;
    const runSeq = ++st.seq;
    chatPush('user', text);
    const ai = chatPush('ai', '', {state: 'pending'});
    chatRefresh();
    try {
      const ready = chatMode().ready && allowed('aiAssistant');
      const it = R.chatIntent(text, new Date());
      const known = it.tool && it.confidence >= (ready ? 0.9 : 0.6) && CHAT_TOOLS.has(it.tool); // AI가 있으면 확신이 낮은 추측은 AI에게 맡긴다
      if (known) {
        const res = await chatExec(it.tool, it.args, ai, {userText: text, viaAi: false});
        if (st.stopped || st.seq !== runSeq) { ai.text = ai.text || '중지했습니다.'; }
        else {
          ai.text = res.text || '';
          ai.state = 'done'; chatRefresh();   // ① 로컬 답을 먼저 보여 준다
          const def = CHAT_TOOLS.get(it.tool);
          if (ready && res.ok && def.kind !== 'act' && CHAT_COMPOSE.has(it.tool) && !st.stopped && (res.cards || []).length + (res.text || '').length > 30 && chatAvailable(await chatModelList()).length) await chatCompose(text, res, ai, runSeq);
        }
      } else if (ready && chatAvailable(await chatModelList()).length) {
        try { await chatRunAi(text, ai, runSeq); }
        catch (e) {
          if (st.stopped || st.seq !== runSeq) ai.text = ai.text || '중지했습니다.';
          else {
            logError('chatAi', e.message);
            if (!ai.text) { ai.text = CHAT_HELP; if (e.kind === 'key') ai.cards.push({type: 'setup', reason: '저장된 AI 키가 거절되었습니다. 다시 연결해 주세요.'}); else if (!e.cooled) ai.cards.push({type: 'note', tone: 'warn', text: R.chatErrorMessage(e.status || 0, e.message, e.kind || '')}); }
          }
        }
      } else {
        ai.text = CHAT_HELP;
        if (!ready) ai.cards.push({type: 'setup', reason: 'AI를 연결하면 이렇게 정해진 문장이 아니어도 자유롭게 시킬 수 있습니다.'});
      }
    } catch (e) { logError('chatSend', e.message); ai.text = '처리하지 못했습니다: ' + String(e.message || e).slice(0, 100); ai.state = 'error'; }
    if (ai.state === 'pending') ai.state = 'done';
    if (!ai.text && !ai.cards.length) ai.text = '결과가 없습니다.';
    if (st.seq === runSeq) { st.busy = false; st.abort = null; }
    chatSave(); chatRefresh(true); // 답이 끝나면 맨 아래(확인 카드 포함)가 보이게
  }
