  // ---------- 45. 메일 첨부 내용 읽기 (v0.88.0) ----------
  // 그룹웨어 문서 뷰어가 하는 것과 같은 요청(변환 → 쪽별 글자 XML)으로 첨부(HWP·PDF·오피스) 글자를 읽어 정리한다.
  // 첨부 글자는 화면 카드(sensitive)에만 두고, 외부 AI에는 별도 확인 뒤 메일 본문과 함께 가려서 보낸다.

  const CU_DOC_EXT = /^(hwp|hwpx|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|odt|rtf|hml)$/i;
  const CU_ATT_PAGES = 8;

  async function cuReadAttachments(x, q, allowMark) {
    const {det} = await cuLoad(x, allowMark);
    if (!det || det.error) return {ok: false, text: '메일을 읽지 못해 첨부를 열지 않았습니다.'};
    const docs = (det.files || []).filter(f => CU_DOC_EXT.test(f.ext || String(f.name).split('.').pop() || ''));
    const others = (det.files || []).length - docs.length + (det.bigFiles || []).length;
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
        read.push({name: f.name, total: r.total, got: r.pages.length, text});
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
    if (ok.length) cards.push({type: 'chips', title: '이어서', items: ['그 메일 답장 초안 써줘', '그 메일 할 일로 추가해줘']});
    const fail = read.length - ok.length;
    return {ok: ok.length > 0, text: ok.length ? `첨부 ${ok.length}개를 읽었습니다(${ok.map(r => cuCut(r.name, 30)).join(', ')}).${fail ? ` ${fail}개는 읽지 못했습니다.` : ''}${docs.length > pick.length ? ` 나머지 첨부 ${docs.length - pick.length}개는 파일 이름으로 말씀해 주세요.` : ''}` : '첨부를 글자로 읽지 못했습니다. 메일 화면의 미리보기로 확인해 주세요.',
      llm: `첨부 ${ok.length}개를 화면에 정리했습니다(외부로 보내지 않음).`, data: {count: ok.length}, cards};
  }

  chatRegisterTool({
    name: 'read_attachment', label: '첨부 내용 읽기', kind: 'read',
    description: '메일 첨부(한글·PDF·오피스, 최대 3개·각 8쪽)의 글자를 그룹웨어 문서 뷰어로 읽어 핵심 문장과 날짜를 정리한다. query는 파일 이름이나 메일 제목 일부. 앞에서 다룬 메일이 기본 대상.',
    params: {type: 'object', properties: {query: {type: 'string'}, mail_key: {type: 'string'}}},
    run: async a => {
      if (!S.a || !S.raw) return chatNotReady();
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
