  // ---------- 43. AI 이해 기능 (v0.86.0) ----------
  // 메일 읽고 정리(read_mail) · 먼저 할 일과 이유(plan_priorities) · AI 답장 초안 · 대화 초점("그거·그 메일").
  // 원칙: 본문은 사용자가 고른 메일 한 통만 읽는다(안 읽은 메일은 확인 카드를 눌러야 읽음으로 바뀐다).
  // Gemini에는 따로 확인을 받은 뒤 그 메일의 가린 본문만 보낸다(설정 aiBody: ask 매번 묻기 | always | off).
  // 본문에서 나온 문장은 sensitive 카드로만 보여 대화 기록(localStorage)에 남기지 않는다.

  const cuMode = () => (['ask', 'always', 'off'].includes(S.settings && S.settings.aiBody) ? S.settings.aiBody : 'ask');
  const cuAiOk = () => typeof aiReady === 'function' && aiReady() && allowed('aiAssistant') && cuMode() !== 'off';
  const cuCut = (s, n = 40) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const cuMd = iso => /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : '';
  const CU_FOCUS_MS = 30 * 60000;

  function cuFocus() {
    const st = chatState(), f = st.ctx && st.ctx.focus;
    return f && f.owner === S.userKey && Date.now() - f.at < CU_FOCUS_MS ? f : null;
  }
  function cuSetFocus(x) {
    if (!x || !x.ref || !x.ref.uid) return;
    const st = chatState(), old = st.ctx.focus;
    const same = old && old.owner === S.userKey && String(old.uid) === String(x.ref.uid);
    st.ctx.focus = {type: 'mail', key: x.key || '', box: x.ref.box || 'INBOX', uid: String(x.ref.uid), title: x.title || '', owner: S.userKey, at: Date.now(), local: same ? old.local : null, ai: same ? old.ai : null};
  }

  // 대상 메일 고르기: mail_key → uid → 제목 낱말 → 대화 초점 → 후보 목록
  function cuPickMail(a = {}) {
    const mails = mailActions();
    const byUid = uid => mails.find(m => m.ref && String(m.ref.uid) === String(uid));
    if (a.mail_key) { const x = mails.find(m => m.key && m.key === a.mail_key); if (x) return {x}; }
    if (a.uid) {
      const x = byUid(a.uid); if (x) return {x};
      const rec = findMail(a.box || '', String(a.uid)) || findMail('', String(a.uid));
      const f = cuFocus();
      if (rec) return {x: {type: 'mail', title: rec.subject || '', ref: {box: rec.box || 'INBOX', uid: rec.uid}}};
      if (f && String(f.uid) === String(a.uid)) return {x: {type: 'mail', key: f.key, title: f.title, ref: {box: f.box, uid: f.uid}}};
    }
    const q = String(a.query || '').trim();
    if (q && !/^(그거|그것|이거|그\s*메일|이\s*메일)$/.test(q)) {
      const toks = cmdKeywords(q).filter(t => !/^(메일|내용|요약|답장|회신|초안|확인|정리|요점|핵심)$/.test(t));
      const scored = toks.length ? mails.map(m => ({m, n: toks.filter(k => String(m.title || '').replace(/\s+/g, '').includes(k.replace(/\s+/g, ''))).length})).filter(o => o.n > 0).sort((p, r) => r.n - p.n) : [];
      if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) return {x: scored[0].m};
      if (scored.length) return {choices: scored.slice(0, 6).map(o => o.m)};
      if (toks.length) return {none: true, q};
    }
    const f = cuFocus();
    if (f) return {x: byUid(f.uid) || {type: 'mail', key: f.key, title: f.title, ref: {box: f.box, uid: f.uid}}};
    return {choices: mails.slice(0, 6)};
  }
  const cuChoices = (list, verb) => ({ok: true, text: `어느 메일${verb}? 번호로 말씀해 주세요. 예) “2번 메일 ${verb === '을 읽을까요' ? '요약해줘' : '답장 써줘'}”`,
    data: {count: list.length, items: list.map(m => ({itemId: m.key || '', title: m.title || '', uid: m.ref && m.ref.uid || '', type: 'mail'}))},
    cards: [{type: 'list', title: '메일 고르기', items: list.map((m, i) => ({title: `${i + 1}. ${m.title || '(제목 없음)'}`, sub: m.headline || (m.fromInbox ? '받은편지함' : '')}))}]});

  // 본문 글자: 가린 평문(collector) → 비었으면 HTML에서 글자만 → 인용된 원문 앞에서 자르고 다시 가린다.
  function cuBodyText(det) {
    let t = String(det.text || '');
    if (t.replace(/\s/g, '').length < 20 && det.html) {
      try {
        const html = String(det.html).replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, m => m + '\n');
        const d = new DOMParser().parseFromString(html, 'text/html');
        d.querySelectorAll('script,style,head').forEach(n => n.remove());
        t = (d.body && d.body.textContent || '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
      } catch {}
    }
    const cut = t.search(/\n?\s*-{2,}\s*(?:Original Message|원본 메일|원본 메시지|Forwarded message)|\n\s*(?:보낸\s*사람|From)\s*:/i);
    if (cut > 120) t = t.slice(0, cut);
    return R.cuMaskBody(t, 6000);
  }
  const cuFiles = det => [...(det.files || []).map(f => f.name), ...(det.bigFiles || []).map(f => f.name)].filter(Boolean);

  async function cuLoad(x, allowMark) {
    const rec = findMail(x.ref.box, x.ref.uid) || findMail('', x.ref.uid) || {uid: x.ref.uid, box: x.ref.box, subject: x.title || '', seen: true};
    const det = await loadMailDetail(rec, !!allowMark);
    return {rec, det};
  }

  // ① 로컬 정리(외부 전송 없음) + ② AI 정리 확인 카드
  async function cuReadResult(x, allowMark) {
    const {det} = await cuLoad(x, allowMark);
    if (!det || det.error) return {ok: false, text: `메일 본문을 읽지 못했습니다${det && det.error ? `(${cuCut(det.error, 80)})` : ''}. 메일 화면에서 직접 열어 주세요.`};
    const body = cuBodyText(det), files = cuFiles(det);
    const hl = R.mailHighlights(body), dls = R.extractAllDeadlines(body, new Date()).slice(0, 3), need = R.cuReplyNeed({subject: det.subject || x.title, text: body});
    cuSetFocus(x);
    const f = cuFocus(); if (f) f.local = {deadlines: need.need === 'yes' ? dls.map(d => d.date) : [], need: need.need};
    const needTxt = need.need === 'yes' ? '회신·제출을 요구하는 문장이 있어 답장이 필요해 보입니다' : need.need === 'no' ? '안내·공유 메일로 보여 답장이 꼭 필요하지는 않아 보입니다' : need.act ? '해 달라는 일은 있지만 회신을 요구하는 문장은 찾지 못했습니다' : '답장 필요 여부는 원문에서 확인이 필요합니다';
    const dlTxt = dls.length ? ` 본문에 적힌 기한: ${dls.map(d => `${cuMd(d.date)}${d.dday < 0 ? '(지남)' : d.dday === 0 ? '(오늘)' : `(D-${d.dday})`}`).join(', ')}.` : '';
    const cards = [
      {type: 'list', sensitive: true, title: '요청·핵심 문장 (원문 그대로)', items: (hl.length ? hl : [cuCut(body, 140) || '(본문 글자가 없습니다)']).slice(0, 4).map(s => ({title: s}))},
      {type: 'kpi', sensitive: true, items: [{value: {yes: '필요', no: '불필요', maybe: '확인'}[need.need], label: '답장', tone: need.need === 'yes' ? 'urgent' : 'info'}, {value: dls.length ? cuMd(dls[0].date) : '없음', label: '본문 날짜·기한', tone: dls.length && dls[0].dday <= 1 ? 'urgent' : 'info'}, {value: String(files.length), label: '첨부'}]},
      ...(files.length ? [{type: 'list', sensitive: true, title: '첨부파일', items: files.slice(0, 6).map(n => ({title: n}))}] : []),
      {type: 'note', sensitive: true, tone: 'info', text: `판단 근거: ${need.reason}`},
    ];
    const follow = ['그 메일 답장 초안 써줘', '그 메일 할 일로 추가해줘'];
    let text = `“${cuCut(det.subject || x.title, 50)}” 메일을 읽었습니다. ${needTxt}.${dlTxt}`;
    if (cuAiOk()) {
      if (cuMode() === 'always') {
        const r = await cuAnalyze(x, det, body);
        if (r.ok) { text += '\n' + r.text; cards.push(...(r.cards || [])); } else cards.push({type: 'note', tone: 'warn', text: r.text});
      } else cards.push(cuAnalyzeCard(x, det, body));
    } else if (typeof aiReady === 'function' && !aiReady()) cards.push({type: 'note', tone: 'info', text: 'AI를 연결하면 요약·할 일 정리·답장 초안까지 해 드립니다(설정 › AI 연결).'});
    cards.push({type: 'chips', title: '이어서', items: follow});
    return {ok: true, text, llm: `메일 1통을 읽고 화면에 정리했습니다. 답장 필요: ${need.need}. 본문은 외부로 보내지 않았습니다.`, data: {read: true}, cards};
  }

  const cuAnalyzeCard = (x, det, body) => ({type: 'confirm', title: 'AI로 요약·할 일 정리', risk: 'low',
    rows: [['보내는 내용', `이 메일의 제목·본문 앞 ${Math.min(body.length, 6000).toLocaleString()}자 (이메일·전화·계좌·주민번호는 가림)`], ['받는 곳', 'Google Gemini (외부)'], ['주의', '본문의 이름·기관명은 가려지지 않습니다. 설정에서 끌 수 있습니다']],
    confirmLabel: 'AI로 정리', cancelLabel: '그만두기', onConfirm: async () => cuAnalyze(x, det, body)});

  async function cuGeminiText(system, user, json, maxTokens = 1024) {
    const body = {systemInstruction: {parts: [{text: system}]}, contents: [{role: 'user', parts: [{text: user}]}], generationConfig: {temperature: json ? 0.1 : 0.3, maxOutputTokens: maxTokens, ...(json ? {responseMimeType: 'application/json'} : {})}};
    const j = await chatGemini(body, new AbortController());
    if (j && j.promptFeedback && j.promptFeedback.blockReason) throw Object.assign(new Error('blocked'), {kind: 'blocked', status: 200});
    return ((j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');
  }
  const cuAiErr = e => (e && e.aborted ? '중지했습니다.' : R.chatErrorMessage(e && e.status || 0, e && e.message || '', e && e.kind || ''));

  async function cuAnalyze(x, det, body) {
    if (!cuAiOk()) return {ok: false, text: 'AI가 연결되어 있지 않거나 설정에서 꺼져 있습니다.'};
    let raw;
    try { raw = await cuGeminiText(R.CU_MAIL_SYSTEM, R.cuMailUserPrompt({subject: R.cuMaskBody(det.subject || x.title, 200), date: det.date, body, today: today(), attachments: cuFiles(det)}), true); }
    catch (e) { logError('cu.analyze', e.message); return {ok: false, text: 'AI 정리를 하지 못했습니다: ' + cuAiErr(e)}; }
    const ai = R.cuParseMailAi(raw);
    if (!ai) return {ok: false, text: 'AI 응답을 알아보지 못했습니다. 위의 원문 문장으로 확인해 주세요.'};
    if (typeof usageNote === 'function') usageNote('toolAi', 'mail_ai');
    cuSetFocus(x);
    const f = cuFocus(); if (f) { f.ai = ai; const due = (ai.asks.find(a => a.due) || {}).due; if (due) f.local = {...(f.local || {}), deadlines: [due]}; }
    const needTxt = {yes: '필요', no: '불필요', maybe: '확인 필요'}[ai.reply_needed];
    const cards = [
      {type: 'note', sensitive: true, tone: 'info', text: `**AI 요약**\n${ai.summary.map(s => '• ' + s).join('\n')}`},
      ...(ai.asks.length ? [{type: 'list', sensitive: true, title: '내가 할 일 (AI 추출)', items: ai.asks.map(a => ({title: a.what, badge: a.due ? cuMd(a.due) : '', tone: a.due && a.due <= today() ? 'urgent' : 'todo'}))}] : []),
      {type: 'note', sensitive: true, tone: ai.reply_needed === 'yes' ? 'warn' : 'info', text: `답장 ${needTxt}${ai.reply_reason ? ` · ${ai.reply_reason}` : ''}${ai.reply_points.length ? `\n답장 요점: ${ai.reply_points.join(' / ')}` : ''}`},
    ];
    return {ok: true, text: `AI 정리를 마쳤습니다(${(chatState().model || 'Gemini').replace(/^models\//, '')}). AI가 만든 내용이니 기한·숫자는 원문과 대조해 주세요.`, cards};
  }

  // AI 답장 초안 → 답장 창에 넣기(보내지 않음)
  async function cuReplyDraft(x, q, points) {
    if (!cuAiOk()) return {ok: false, text: 'AI가 연결되어 있지 않거나 설정에서 꺼져 있습니다.'};
    const {det} = await cuLoad(x, true);
    if (!det || det.error) return {ok: false, text: '메일 본문을 읽지 못해 초안을 만들지 않았습니다.'};
    const body = cuBodyText(det), f = cuFocus(), asks = f && String(f.uid) === String(x.ref.uid) && f.ai ? f.ai.asks : [];
    let lines;
    try { lines = R.cuParseReply(await cuGeminiText(R.CU_REPLY_SYSTEM, R.cuReplyUserPrompt({subject: R.cuMaskBody(det.subject || x.title, 200), body: R.cuMaskBody(body, 4000), points: R.cuMaskBody(points || '', 300), asks}), false, 800)); }
    catch (e) { logError('cu.reply', e.message); return {ok: false, text: 'AI 초안을 만들지 못했습니다: ' + cuAiErr(e) + ' “표준 문구로 답장 창 열기”를 대신 쓸 수 있습니다.'}; }
    if (!lines.length) return {ok: false, text: 'AI가 빈 초안을 돌려주었습니다. 표준 문구로 답장 창을 열어 주세요.'};
    cuSetFocus(x);
    const r = await cmdMailReplyTo(String(q || '채팅 요청'), 'custom', x, lines);
    const shown = {type: 'note', sensitive: true, tone: 'info', text: `**AI 초안**\n${lines.join('\n')}`};
    if (r !== 'filled' && r !== 'opened') { copyText(lines.join('\n')); return {ok: false, text: '답장 창을 열지 않았습니다(작성 중인 화면을 지켰거나 취소). 초안은 복사해 두었습니다.', cards: [shown]}; }
    if (r === 'opened') { copyText(lines.join('\n')); return {ok: true, text: '답장 창은 열었지만 초안을 넣지 못했습니다. 초안을 복사해 두었으니 본문에 붙여넣기(Ctrl+V) 하세요. [보내기]는 직접 누릅니다.', cards: [shown]}; }
    return {ok: true, text: 'AI 초안을 답장 본문 맨 위에 넣었습니다. (확인 필요) 칸과 사실관계를 고친 뒤 [보내기]는 직접 누르세요.', cards: [shown]};
  }

  chatRegisterTool({
    name: 'read_mail', label: '메일 읽고 정리', kind: 'read',
    description: '받은 메일 한 통의 본문을 읽어 요청 문장·본문 기한·첨부·답장 필요 여부를 정리한다. 메일 내용·요청 사항·해야 할 일을 물을 때 쓴다. query는 메일 제목의 일부, index는 직전 목록의 순번. 안 읽은 메일은 사용자가 확인한 뒤에 읽는다.',
    params: {type: 'object', properties: {query: {type: 'string'}, index: {type: 'number'}, mail_key: {type: 'string'}}},
    run: async a => {
      if (!S.a || !S.raw) return chatNotReady();
      const p = cuPickMail(a);
      if (p.none) return {ok: true, text: `“${cuCut(p.q, 30)}”와 제목이 맞는 메일을 메일 할 일과 받은편지함 최근 메일에서 찾지 못했습니다. 제목의 다른 낱말로 말씀해 주세요.`, data: {count: 0}};
      if (p.choices) return p.choices.length ? cuChoices(p.choices, '을 읽을까요') : {ok: false, text: '읽을 메일이 없습니다.'};
      const x = p.x;
      cuSetFocus(x);
      const rec = findMail(x.ref.box, x.ref.uid) || findMail('', x.ref.uid);
      const cached = S.mailDet && S.mailDet[x.ref.uid] && !S.mailDet[x.ref.uid].error;
      if (cached || !rec || rec.seen) return cuReadResult(x, false);
      return {ok: true, text: `“${cuCut(x.title, 50)}” 메일은 아직 읽지 않았습니다. 본문을 읽으면 그룹웨어에 읽음으로 표시됩니다.`,
        cards: [{type: 'confirm', title: '메일 본문 읽기', risk: 'low', rows: [['대상 메일', x.title || '(제목 없음)'], ['바뀌는 것', '그룹웨어에서 읽음으로 표시됩니다'], ['외부 전송', '없음 (이 화면에서만 정리)']], confirmLabel: '읽고 정리하기', cancelLabel: '취소', onConfirm: async () => cuReadResult(x, true)}]};
    },
  });

  chatRegisterTool({
    name: 'plan_priorities', label: '먼저 할 일 정리', kind: 'read',
    description: '지금 처리할 일 가운데 먼저 할 일 1~5개와 그 이유(기한·결재 차례·요청 메일)를 알려준다. "뭐부터 해야 해?", "제일 급한 거" 같은 질문에 쓴다.',
    params: {type: 'object', properties: {n: {type: 'number'}}},
    run: async a => {
      if (!S.a) return chatNotReady();
      const all = mineVisible();
      const items = all.map(x => ({key: x.key, title: x.title, state: stateOf(x), base: x.base, type: x.type, area: x.area, deadline: x.deadline && x.deadline.date || '', headline: x.headline, from: x.from || x.sender || '', when: x.when || '', score: x.score}));
      const n = Math.min(Math.max(Number(a.n) || 3, 1), 5), gwTop = R.cuPriorities(items, {today: today(), n});
      // v1.24: 홈 '먼저 할 일'과 같은 순서로 개인 ToDo(기한 지남·오늘 마감)를 넣는다. 그룹웨어 기한 지남·급함 → 개인 기한 지남 → 개인 오늘 마감 → 그룹웨어 나머지.
      const pd = typeof personalHomeDue === 'function' && typeof TD === 'object' && TD ? personalHomeDue() : null;
      const pMd = d => String(d || '').slice(5).replace('-', '/');
      const pItems = pd ? [...pd.late, ...pd.today].map(t => ({key: 'td:' + t.id, td: t.id, title: t.title, state: t.due < today() ? 'overdue' : 'urgent', why: [t.due < today() ? `개인 ToDo · 기한 ${pMd(t.due)} 지남` : '개인 ToDo · 오늘 마감']})) : [];
      const hot = gwTop.filter(t => ['overdue', 'urgent'].includes(t.state)), top = [...hot, ...pItems, ...gwTop.filter(t => !hot.includes(t))].slice(0, n);
      const pNote = pd && !pd.known ? '\n개인 ToDo는 아직 읽지 못해 빠졌을 수 있습니다.' : pd && pd.incomplete ? '\n개인 ToDo는 확인된 목록만 반영했습니다.' : '';
      if (!top.length) return {ok: true, text: `지금 먼저 처리할 일이 없습니다. 기다리는 중인 일은 “기다리는 일 알려줘”로 볼 수 있습니다.${pNote}`, data: {count: 0, items: []}};
      const rest = Math.max(0, items.filter(x => x.state !== 'wait' && x.state !== 'info').length + pItems.length - top.length);
      const text = `${top.length === 1 ? '가장 먼저 할 일입니다.' : `먼저 할 일 ${top.length}가지입니다.`}${rest ? ` 그 밖에 ${rest}건이 할 일 목록에 있습니다.` : ''}${pNote}`;
      return {ok: true, text, llm: `먼저 할 일 ${top.length}건(개인 ToDo ${top.filter(t => t.td).length}건 포함)을 화면에 표시했습니다(제목은 외부로 보내지 않음).`,
        data: {count: top.length, items: top.map(t => ({itemId: t.key, title: t.title, type: t.td ? 'todo' : (all.find(x => x.key === t.key) || {}).type || ''}))},
        cards: [{type: 'list', title: '먼저 할 일', items: top.map((t, i) => ({title: `${i + 1}. ${t.title}`, sub: t.why.join(' · '), badge: t.td ? '개인' : STATE_NAME[t.state] || '', tone: t.state === 'overdue' || t.state === 'urgent' ? 'urgent' : 'todo', act: t.td ? {act: 'chatNav', v: 'mytodo|' + t.td} : {act: 'chatOpenItem', v: t.key}}))}]};
    },
  });

  // 직원 출근 여부는 휴가·출장·교육 기록으로만 답한다는 점을 붙인다(지문은 보지 않는다).
  { const def = CHAT_TOOLS.get('get_staff_status'); if (def && !def.cuWrapped) { const run0 = def.run; def.cuWrapped = true; def.run = async (a, ctx) => { const r = await run0(a, ctx); if (r && r.ok && /(출근|나와|나오|계셔|계시|부재)/.test((ctx && ctx.userText) || '')) {
        // 묻는 날이 주말·휴일이면 '근무 예정' 추정을 하지 않는다
        const iso = typeof chatDateArg === 'function' ? chatDateArg(a && a.date) : '';
        const info = iso ? R.homeDayInfo({date: iso, holidays: (S.raw && S.raw.data && S.raw.data.schedule && S.raw.data.schedule.holidays) || []}) : null;
        const off = info && (info.weekend || info.holiday) ? `${+iso.slice(5, 7)}월 ${+iso.slice(8, 10)}일은 ${info.holiday || (info.dow + '요일')}이라 평소 근무일이 아닙니다.` : '';
        r.text = `${r.text || ''}\n출근 지문은 보지 않고 휴가·출장·교육 기록으로만 확인했습니다. ${off || '기록이 없으면 근무 예정일 가능성이 높지만 확정은 아닙니다.'}`;
      }
      return r; }; } }

  // 설정: 메일 본문 AI 정리(매번 묻기·항상·끄기)
  HOME_ACTS.aiBodyMode = (el, v) => {
    if (!['ask', 'always', 'off'].includes(v)) return;
    S.settings.aiBody = v; saveLocal();
    toast({ask: '메일 본문은 보낼 때마다 묻습니다.', always: '고른 메일의 본문을 확인 없이 AI로 정리합니다.', off: '메일 본문을 AI로 보내지 않습니다.'}[v]);
    if (typeof openAi === 'function' && $('#aiOut')) openAi();
  };
  const cuBodyModeHtml = () => `<div style="margin-top:12px"><div style="font-size:13px;font-weight:600;margin-bottom:6px">메일 본문 AI 정리·답장 초안</div><div class="acts" style="margin-top:0">${[['ask', '보낼 때마다 묻기'], ['always', '항상 허용'], ['off', '끄기']].map(([v, l]) => `<button class="btn sm${cuMode() === v ? ' primary' : ''}" data-act="aiBodyMode" data-v="${v}" aria-pressed="${cuMode() === v}">${l}</button>`).join('')}</div><div class="muted" style="font-size:12px;margin-top:4px">대화에서 메일 정리나 AI 답장 초안을 고르면 그 메일 한 통의 본문만 가려서 보냅니다. 이메일·전화·계좌·주민번호는 가리지만 이름·기관명은 그대로 갑니다.</div></div>`;
