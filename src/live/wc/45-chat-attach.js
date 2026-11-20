  // ---------- 45. 메일 첨부 내용 읽기 (v0.88.0) ----------
  // 그룹웨어 문서 뷰어가 하는 것과 같은 요청(변환 → 쪽별 글자 XML)으로 첨부(HWP·PDF·오피스) 글자를 읽어 정리한다.
  // 첨부 글자는 화면 카드(sensitive)에만 두고, 외부 AI에는 별도 확인 뒤 메일 본문과 함께 가려서 보낸다.

  const CU_DOC_EXT = /^(hwp|hwpx|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|odt|rtf|hml)$/i;
  const CU_ATT_PAGES = 8;
  const CU_IMG_EXT = /^(jpe?g|png|gif|bmp)$/i;

  // ---------- 그림·스캔 첨부를 AI로 읽기 (v0.90.0) ----------
  // 글자가 없는 첨부(그림·스캔 PDF)는 쪽 그림(최대 4장)을 Gemini로 보내 읽는다. 그림 속 이름·연락처는 가릴 수 없으므로 설정과 관계없이 매번 묻는다.
  function cuVisionCard(items, title) {
    const list = items.slice(0, 4);
    return {type: 'confirm', title: 'AI로 그림·스캔 첨부 읽기', risk: 'high',
      rows: [['대상', list.map(i => i.name).join(', ')], ['보내는 내용', `첨부 쪽 그림 최대 4장(파일당 첫 쪽부터)`], ['받는 곳', 'Google Gemini (외부)'], ['주의', '그림 속 이름·전화번호·주소는 가려지지 않고 그대로 갑니다. 개인정보가 담긴 그림이면 보내지 마세요']],
      confirmLabel: '그림 보내 읽기', cancelLabel: '그만두기', onConfirm: async () => cuVisionRun(list, title)};
  }
  async function cuVisionRun(items, title) {
    if (!cuAiOk()) return {ok: false, text: 'AI가 연결되어 있지 않거나 설정에서 꺼져 있습니다.'};
    const imgs = [], names = [], fails = [];
    for (const it of items) {
      if (imgs.length >= 4) break;
      try {
        const key = it.key || (await it.getKey());
        const got = await GW.synapPageImages({key, pages: Math.min(Math.max(1, it.total || 1), 4 - imgs.length)});
        for (const g of got) { imgs.push(g); names.push(got.length > 1 ? `${it.name} (${g.page + 1}쪽)` : it.name); }
      } catch (e) { logError('cu.vision', e.message); fails.push(it.name); }
    }
    if (!imgs.length) return {ok: false, text: `첨부 그림을 받지 못했습니다${fails.length ? `(${fails.map(n => cuCut(n, 30)).join(', ')})` : ''}.`};
    let raw;
    try {
      const body = {systemInstruction: {parts: [{text: R.CU_IMAGE_SYSTEM}]}, contents: [{role: 'user', parts: [{text: R.cuImageUserPrompt(names, today(), R.cuMaskBody(title || '', 120))}, ...imgs.map(g => ({inlineData: {mimeType: g.mime, data: g.data}}))]}], generationConfig: {temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json'}};
      const j = await chatGemini(body, new AbortController());
      raw = ((j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');
    } catch (e) { logError('cu.vision.ai', e.message); return {ok: false, text: '그림을 AI로 읽지 못했습니다: ' + cuAiErr(e)}; }
    const ai = R.cuParseImageAi(raw);
    if (!ai) return {ok: false, text: 'AI 응답을 알아보지 못했습니다. 첨부를 직접 열어 확인해 주세요.'};
    if (typeof usageNote === 'function') usageNote('toolAi', 'vision');
    const cards = [
      ...(ai.text ? [{type: 'note', sensitive: true, tone: 'info', text: `**그림에서 읽은 글자 (AI)**\n${ai.text}`}] : []),
      ...(ai.summary.length ? [{type: 'note', sensitive: true, tone: 'info', text: `**AI 요약**\n${ai.summary.map(x => '• ' + x).join('\n')}`}] : []),
      ...(ai.asks.length ? [{type: 'list', sensitive: true, title: '내가 할 일 (AI 추출)', items: ai.asks.map(a => ({title: a.what, badge: a.due ? cuMd(a.due) : '', tone: a.due && a.due <= today() ? 'urgent' : 'todo'}))}] : []),
    ];
    return {ok: true, text: `그림 ${imgs.length}장을 AI로 읽었습니다(${(chatState().model || 'Gemini').replace(/^models\//, '')}). 그림 읽기는 틀릴 수 있으니 날짜·숫자는 원본과 대조해 주세요.${fails.length ? ` ${fails.length}개는 그림을 받지 못했습니다.` : ''}`, cards};
  }

  async function cuReadAttachments(x, q, allowMark) {
    const {det} = await cuLoad(x, allowMark);
    if (!det || det.error) return {ok: false, text: '메일을 읽지 못해 첨부를 열지 않았습니다.'};
    const docs = (det.files || []).filter(f => CU_DOC_EXT.test((f.ext || String(f.name).split('.').pop() || '')));
    const pics = (det.files || []).filter(f => CU_IMG_EXT.test((f.ext || String(f.name).split('.').pop() || '')));
    const others = (det.files || []).length - docs.length - pics.length + (det.bigFiles || []).length;
    if (!docs.length && pics.length) {
      if (!det.account) return {ok: false, text: '메일 계정 정보를 읽지 못해 첨부 미리보기를 열 수 없습니다.'};
      cuSetFocus(x);
      const items = pics.slice(0, 4).map(f => ({name: f.name, total: 1, getKey: async () => (await GW.mailAttachmentPages({uid: x.ref.uid, sn: f.sn, account: det.account, maxPages: 1})).key}));
      return {ok: true, text: `“${cuCut(det.subject || x.title, 40)}” 메일의 첨부는 그림 ${pics.length}개라 글자로 바로 읽을 수 없습니다.${cuAiOk() ? ' 동의하시면 AI가 그림을 읽습니다.' : ' AI를 연결하면 그림 속 글자도 읽을 수 있습니다.'}`, data: {count: 0}, cards: cuAiOk() ? [cuVisionCard(items, det.subject || x.title)] : []};
    }
    if (!docs.length) return {ok: true, text: `“${cuCut(det.subject || x.title, 40)}” 메일에는 글자로 읽을 수 있는 첨부(한글·PDF·오피스)가 없습니다.${others ? ` 그림·대용량 첨부 ${others}개는 직접 열어 확인해 주세요.` : ''}`, data: {count: 0}};
    const toks = cmdKeywords(String(q || '')).filter(t => !/^(pdf|hwp|첨부|파일)$/i.test(t));
    const named = toks.length ? docs.filter(f => toks.some(k => String(f.name).replace(/\s+/g, '').includes(k.replace(/\s+/g, '')))) : [];
    const pick = (named.length ? named : docs).slice(0, 3);
    if (!det.account) return {ok: false, text: '메일 계정 정보를 읽지 못해 첨부 미리보기를 열 수 없습니다. 메일 화면의 미리보기를 써 주세요.'};
    const read = [];
    for (const f of pick) {
      try {
        const r = await GW.mailAttachmentPages({uid: x.ref.uid, sn: f.sn, account: det.account, maxPages: CU_ATT_PAGES});
        const text = R.cuMaskBody(R.cuSynapText(r.pages.join('\n')), 8000);
        read.push({name: f.name, total: r.total, got: r.pages.length, text, key: r.key});
      } catch (e) { logError('cu.attach', e.message); read.push({name: f.name, error: cuCut(e.message, 60)}); }
    }
    cuSetFocus(x);
    const ok = read.filter(r => !r.error && r.text.replace(/\s/g, '').length > 10);
    const f0 = cuFocus(); if (f0) f0.attach = ok.map(r => ({name: r.name, text: r.text})); // 메모리에만(저장하지 않음)
    const cards = [];
    for (const r of read) {
      if (r.error || !r.text.replace(/\s/g, '').length) { cards.push({type: 'note', tone: 'warn', text: `${r.name}: ${r.error ? `읽지 못했습니다(${r.error})` : '글자가 없습니다(그림으로 된 문서일 수 있음)'}`}); continue; }
      const hl = R.cuDocHighlights(r.text, 4), dls = R.extractAllDeadlines(r.text, new Date()).slice(0, 3);
      cards.push({type: 'list', sensitive: true, title: `${r.name} · ${r.got < r.total ? `${r.total}쪽 중 앞 ${r.got}쪽` : `${r.total}쪽`}`, items: [...(hl.length ? hl : r.text.split('\n').filter(l => l.length > 12).slice(0, 3)).slice(0, 4).map(s => ({title: cuCut(s, 160)})), ...(dls.length ? [{title: `본문 날짜·기한: ${dls.map(d => cuMd(d.date)).join(', ')}`, tone: 'todo'}] : [])]});
    }
    if (ok.length && cuAiOk()) {
      const body = [cuBodyText(det), ...ok.map(r => `[첨부: ${r.name}]\n${r.text}`)].join('\n\n');
      const meta = {subject: det.subject || x.title, date: det.date, files: ok.map(r => ({name: r.name})), bigFiles: []};
      if (cuMode() === 'always') { const z = await cuAnalyze(x, meta, body); cards.push(...(z.ok ? z.cards || [] : [{type: 'note', tone: 'warn', text: z.text}])); }
      else cards.push({...cuAnalyzeCard(x, meta, body), title: 'AI로 메일+첨부 요약·할 일 정리', rows: [['보내는 내용', `메일 본문과 첨부 ${ok.length}개의 글자 앞부분 최대 6,000자 (이메일·전화·계좌·주민번호는 가림)`], ['받는 곳', 'Google Gemini (외부)'], ['주의', '이름·기관명은 가려지지 않습니다. 설정에서 끌 수 있습니다']]});
    }
    // 글자가 없는 첨부(스캔)와 그림 첨부는 AI 그림 읽기로 이어 준다
    const blank = read.filter(r => !r.error && r.key && !r.text.replace(/\s/g, '').length).map(r => ({name: r.name, key: r.key, total: Math.min(r.total || 1, 2)}));
    const vis = [...blank, ...pics.slice(0, 3).map(f => ({name: f.name, total: 1, getKey: async () => (await GW.mailAttachmentPages({uid: x.ref.uid, sn: f.sn, account: det.account, maxPages: 1})).key}))];
    if (vis.length && cuAiOk()) cards.push(cuVisionCard(vis, det.subject || x.title));
    else if (vis.length) cards.push({type: 'note', tone: 'info', text: `그림·스캔 첨부 ${vis.length}개는 글자가 없어 읽지 못했습니다. AI를 연결하면 그림 속 글자도 읽을 수 있습니다.`});
    if (ok.length) cards.push({type: 'chips', title: '이어서', items: ['그 메일 답장 초안 써줘', '그 메일 할 일로 추가해줘']});
    const fail = read.length - ok.length;
    return {ok: ok.length > 0 || vis.length > 0, text: !ok.length && vis.length ? `첨부에 글자가 없습니다(그림·스캔). ${cuAiOk() ? '아래에서 AI 그림 읽기를 고를 수 있습니다.' : 'AI를 연결하면 그림 속 글자도 읽을 수 있습니다.'}` : ok.length ? `첨부 ${ok.length}개를 읽었습니다(${ok.map(r => cuCut(r.name, 30)).join(', ')}).${fail ? ` ${fail}개는 읽지 못했습니다.` : ''}${docs.length > pick.length ? ` 나머지 첨부 ${docs.length - pick.length}개는 파일 이름으로 말씀해 주세요.` : ''}` : '첨부를 글자로 읽지 못했습니다. 메일 화면의 미리보기로 확인해 주세요.',
      llm: `첨부 ${ok.length}개를 화면에 정리했습니다(외부로 보내지 않음).`, data: {count: ok.length}, cards};
  }

  chatRegisterTool({
    name: 'read_attachment', label: '첨부 내용 읽기', kind: 'read',
    description: '메일 첨부(한글·PDF·오피스, 최대 3개·각 8쪽)의 글자를 그룹웨어 문서 뷰어로 읽어 핵심 문장과 날짜를 정리한다. query는 파일 이름이나 메일 제목 일부. 앞에서 다룬 메일이 기본 대상.',
    params: {type: 'object', properties: {query: {type: 'string'}, mail_key: {type: 'string'}}},
    run: async (a, ctx) => {
      if (!S.a || !S.raw) return chatNotReady();
      // 문서(결재·공문) 첨부: 말에 문서·공문이 있거나, 방금 다룬 것이 메일보다 문서일 때
      const st = chatState(), df = st.ctx.docFocus && st.ctx.docFocus.owner === S.userKey && Date.now() - st.ctx.docFocus.at < CU_FOCUS_MS ? st.ctx.docFocus : null, mf = cuFocus();
      const wantDoc = /(문서|공문|결재|기안|보고서|계획서)/.test((ctx && ctx.userText) || '') || (df && (!mf || df.at > mf.at));
      if (wantDoc) {
        const q = String(a.query || '').trim();
        // 낱말이 지금 문서 제목에 없으면 그 낱말로 문서를 먼저 찾는다(파일 이름일 수도 있으니 첨부 이름도 본다)
        const fits = df && (!q || cmdKeywords(q).some(k => (df.title + ' ' + (df.files || []).map(x => x.name).join(' ')).replace(/\s+/g, '').includes(k)));
        if (fits) return cuDocAttach(df, q && !cmdKeywords(q).some(k => df.title.replace(/\s+/g, '').includes(k)) ? q : '');
        if (!q) return {ok: true, text: '어느 문서의 첨부인지 먼저 정해 주세요. 예) “○○ 문서 요약해줘” 다음에 “그 문서 첨부 내용 정리해줘”', data: {count: 0}};
        const before = st.ctx.docFocus, r0 = await CHAT_TOOLS.get('read_doc').run({query: q}, ctx), now = st.ctx.docFocus;
        return now && now !== before ? cuDocAttach(now, '') : r0;
      }
      if (!GW.mailAttachmentPages) return {ok: false, text: '이 버전의 수집기는 첨부 글자 읽기를 지원하지 않습니다. 새로 고침해 주세요.'};
      // 낱말이 파일 이름일 수 있으므로: 초점 메일이 있으면 그 메일에서 먼저 찾고, 없을 때만 낱말로 메일을 고른다
      const f = cuFocus();
      const p = a.uid || a.mail_key ? cuPickMail(a) : f ? {x: {type: 'mail', key: f.key, title: f.title, ref: {box: f.box, uid: f.uid}}} : cuPickMail({query: a.query});
      if (p.none) return {ok: true, text: `“${cuCut(p.q, 30)}”와 맞는 메일을 찾지 못했습니다. 먼저 “○○ 메일 요약해줘”로 메일을 고른 뒤 “첨부 내용 정리해줘”라고 해 주세요.`, data: {count: 0}};
      if (p.choices) return p.choices.length ? cuChoices(p.choices, '을 읽을까요') : {ok: false, text: '첨부를 읽을 메일이 없습니다.'};
      const x = p.x, rec = findMail(x.ref.box, x.ref.uid) || findMail('', x.ref.uid);
      const cached = S.mailDet && S.mailDet[x.ref.uid] && !S.mailDet[x.ref.uid].error;
      const q = a.query && f && !(a.uid || a.mail_key) ? a.query : '';
      if (cached || !rec || rec.seen) return cuReadAttachments(x, q, false);
      return {ok: true, text: `“${cuCut(x.title, 50)}” 메일은 아직 읽지 않았습니다. 첨부를 열면 그룹웨어에 읽음으로 표시됩니다.`,
        cards: [{type: 'confirm', title: '메일 첨부 읽기', risk: 'low', rows: [['대상 메일', x.title || '(제목 없음)'], ['바뀌는 것', '그룹웨어에서 읽음으로 표시됩니다'], ['외부 전송', '없음 (이 화면에서만 정리)']], confirmLabel: '첨부 읽고 정리하기', cancelLabel: '취소', onConfirm: async () => cuReadAttachments(x, q, true)}]};
    },
  });

  // 메일을 읽은 결과에 글자로 읽을 수 있는 첨부가 있으면 "첨부 내용 정리"를 이어서 제안한다
  { const def = CHAT_TOOLS.get('read_mail'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
      const r = await run0(a, ctx);
      const f = cuFocus(), det = f && S.mailDet && S.mailDet[f.uid];
      if (r && r.ok && r.data && r.data.read && det && (det.files || []).some(x => CU_DOC_EXT.test(x.ext || String(x.name).split('.').pop() || ''))) {
        const chips = (r.cards || []).find(c => c.type === 'chips');
        if (chips && !chips.items.includes('그 메일 첨부 내용 정리해줘')) chips.items = ['그 메일 첨부 내용 정리해줘', ...chips.items];
      }
      return r;
    }; } }

  // ---------- 결재문서·공문 첨부 (v0.89.0) ----------
  // 그룹웨어 파일 미리보기 창(문서관리)이 변환한 결과를 읽는다. 내가 기안한 문서가 아니면 미리보기 기록이 남을 수 있어 먼저 묻는다.
  async function cuDocAttachRun(df, pick) {
    const read = [];
    for (const f of pick) {
      try { const r = await GW.docAttachmentPages({fileId: f.id, maxPages: CU_ATT_PAGES}); read.push({name: f.name, total: r.total, got: r.pages.length, key: r.key, image: !!r.image, text: R.cuMaskBody(R.cuSynapText(r.pages.join('\n')), 8000)}); }
      catch (e) { logError('cu.docAttach', e.message); read.push({name: f.name, error: cuCut(e.message, 70)}); }
    }
    const ok = read.filter(r => !r.error && r.text.replace(/\s/g, '').length > 10);
    df.attach = ok.map(r => ({name: r.name, text: r.text})); // 메모리에만
    const cards = [];
    for (const r of read) {
      if (r.error || !r.text.replace(/\s/g, '').length) { cards.push({type: 'note', tone: 'warn', text: `${r.name}: ${r.error ? `읽지 못했습니다(${r.error})` : '글자가 없습니다(그림으로 된 문서일 수 있음)'}`}); continue; }
      const hl = R.cuDocHighlights(r.text, 4), dls = R.extractAllDeadlines(r.text, new Date()).slice(0, 3);
      cards.push({type: 'list', sensitive: true, title: `${r.name} · ${r.got < r.total ? `${r.total}쪽 중 앞 ${r.got}쪽` : `${r.total}쪽`}`, items: [...(hl.length ? hl : r.text.split('\n').filter(l => l.length > 12).slice(0, 3)).slice(0, 4).map(x => ({title: cuCut(x, 160)})), ...(dls.length ? [{title: `본문 날짜·기한: ${dls.map(d => cuMd(d.date)).join(', ')}`, tone: 'todo'}] : [])]});
    }
    if (ok.length && cuAiOk()) {
      const x = {type: 'doc', title: df.title, ref: null};
      const body = [df.body || '', ...ok.map(r => `[첨부: ${r.name}]\n${r.text}`)].join('\n\n');
      const meta = {subject: df.title, date: '', files: ok.map(r => ({name: r.name})), bigFiles: []};
      if (cuMode() === 'always') { const z = await cuAnalyze(x, meta, body); cards.push(...(z.ok ? z.cards || [] : [{type: 'note', tone: 'warn', text: z.text}])); }
      else cards.push({...cuAnalyzeCard(x, meta, body), title: 'AI로 문서+첨부 요약·할 일 정리', rows: [['보내는 내용', `문서 색인 본문과 첨부 ${ok.length}개의 글자 앞부분 최대 6,000자 (이메일·전화·계좌·주민번호는 가림)`], ['받는 곳', 'Google Gemini (외부)'], ['주의', '이름·기관명은 가려지지 않습니다. 설정에서 끌 수 있습니다']]});
    }
    const blank = read.filter(r => !r.error && r.key && !r.text.replace(/\s/g, '').length).map(r => ({name: r.name, key: r.key, total: Math.min(r.total || 1, 2)}));
    if (blank.length && cuAiOk()) cards.push(cuVisionCard(blank, df.title));
    else if (blank.length) cards.push({type: 'note', tone: 'info', text: `그림·스캔 첨부 ${blank.length}개는 글자가 없어 읽지 못했습니다. AI를 연결하면 그림 속 글자도 읽을 수 있습니다.`});
    const fail = read.length - ok.length;
    return {ok: ok.length > 0 || blank.length > 0, text: ok.length ? `“${cuCut(df.title, 40)}” 문서의 첨부 ${ok.length}개를 읽었습니다(${ok.map(r => cuCut(r.name, 30)).join(', ')}).${fail ? ` ${fail}개는 읽지 못했습니다.` : ''}` : '문서 첨부를 글자로 읽지 못했습니다. 그룹웨어에서 첨부 미리보기로 확인해 주세요.',
      llm: `문서 첨부 ${ok.length}개를 화면에 정리했습니다(외부로 보내지 않음).`, data: {count: ok.length}, cards};
  }
  async function cuDocAttach(df, q) {
    if (!GW.docAttachmentPages) return {ok: false, text: '이 버전의 수집기는 문서 첨부 읽기를 지원하지 않습니다. 새로 고침해 주세요.'};
    const docs = (df.files || []).filter(f => CU_DOC_EXT.test(String(f.name).split('.').pop() || '') || CU_IMG_EXT.test(String(f.name).split('.').pop() || ''));
    if (!docs.length) return {ok: true, text: `“${cuCut(df.title, 40)}” 문서에는 글자로 읽을 수 있는 첨부(한글·PDF·오피스)가 없습니다.${(df.files || []).length ? ' 그림 등 다른 첨부는 직접 열어 확인해 주세요.' : ''}`, data: {count: 0}};
    const toks = cmdKeywords(String(q || '')).filter(t => !/^(pdf|hwp|첨부|파일|문서|공문)$/i.test(t));
    const named = toks.length ? docs.filter(f => toks.some(k => String(f.name).replace(/\s+/g, '').includes(k.replace(/\s+/g, '')))) : [];
    const pick = (named.length ? named : docs).slice(0, 3);
    const me = String((S.raw && S.raw.principal && S.raw.principal.name) || '').trim();
    if (me && df.drafter && df.drafter.replace(/\s/g, '') === me.replace(/\s/g, '')) return cuDocAttachRun(df, pick);
    return {ok: true, text: `“${cuCut(df.title, 40)}” 문서의 첨부 ${pick.length}개를 읽으려면 그룹웨어 첨부 미리보기를 거칩니다.`,
      cards: [{type: 'list', title: '읽을 첨부', items: pick.map(f => ({title: f.name}))}, {type: 'confirm', title: '문서 첨부 읽기', risk: 'low', rows: [['방법', '그룹웨어 첨부 미리보기(문서관리)로 변환된 글자를 읽습니다'], ['바뀌는 것', '그룹웨어에서 첨부를 미리 볼 때와 같은 열람 기록이 남을 수 있습니다'], ['외부 전송', '없음 (이 화면에서만 정리)']], confirmLabel: '첨부 읽고 정리하기', cancelLabel: '취소', onConfirm: async () => cuDocAttachRun(df, pick)}]};
  }
