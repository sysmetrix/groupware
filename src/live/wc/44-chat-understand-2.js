  // ---------- 44. AI 이해 기능 2 (v0.87.0) ----------
  // 공문·결재문서 읽기(read_doc), 여러 메일 한꺼번에 정리(digest_mail), 일정 준비(관련 자료·확인 사항), 대화 초점 유지.
  // 원칙은 43과 같다: 원문 문장 우선, 외부 AI는 별도 확인 뒤 가린 본문만, 본문에서 나온 내용은 대화 기록에 저장하지 않음.

  // 대화 초점을 새로 고침 뒤에도 30분 동안 이어 쓴다(계정별 저장소에 메일 식별자·제목만. 본문·AI 결과는 저장하지 않음).
  { const set0 = cuSetFocus; cuSetFocus = x => { set0(x); const f = chatState().ctx.focus; if (f) try { store.set('chatFocus', {type: f.type, key: f.key, box: f.box, uid: f.uid, title: f.title, owner: f.owner, at: f.at}); } catch {} }; }
  { const get0 = cuFocus; cuFocus = () => {
      const f = get0(); if (f) return f;
      try {
        const s = store.get('chatFocus', null), st = chatState();
        if (s && s.owner === S.userKey && Date.now() - s.at < CU_FOCUS_MS && !(st.ctx && st.ctx.focus)) { st.ctx.focus = {...s, local: null, ai: null}; return st.ctx.focus; }
      } catch {}
      return null;
    }; }

  // 문서 후보: 내 할 일·부서 참고의 문서 + 결재 목록의 문서(문서 ID로 중복 제거)
  function cuDocPool(scope) {
    const out = [], seen = new Set();
    const add = (d, extra) => {
      const id = String(d.docId || (d.ref && d.ref.docId) || ''), k = id || d.title;
      if (!d.title || seen.has(k)) return;
      seen.add(k);
      out.push({key: d.key || (id ? `doc:${(d.ref && d.ref.kind) || 'list'}:${id}` : ''), title: d.title, docNo: d.docNo || '', year: String(d.date || d.when || '').slice(0, 4), docId: id, ...extra});
    };
    for (const x of visibleActions().filter(x => x.type === 'doc')) if (scope !== 'ref' || !isMine(x)) add(x, {mine: isMine(x)});
    if (scope !== 'ref') for (const l of Object.values((S.a && S.a.approval && S.a.approval.lists) || {})) for (const d of (l && l.docs) || []) add(d, {mine: false});
    return out;
  }
  function cuPickDoc(a = {}) {
    const pool = cuDocPool(a.scope);
    const id = String(a.itemId || a.mail_key || '');
    if (/^doc:/.test(id)) {
      const docId = id.split(':').pop(), x = pool.find(d => d.docId === docId || d.key === id);
      if (x) return {x};
      if (a.query) return {x: {key: id, title: String(a.query), docNo: String(a.docNo || ''), year: /^\d{4}$/.test(a.year || '') ? a.year : '', docId}};
    }
    const q = String(a.query || '').trim();
    if (q) {
      const toks = cmdKeywords(q).filter(t => !/^(문서|공문|내용|요약|요점|핵심|정리)$/.test(t));
      const scored = toks.length ? pool.map(d => ({d, n: toks.filter(k => String(d.title).replace(/\s+/g, '').includes(k.replace(/\s+/g, ''))).length})).filter(o => o.n > 0).sort((p, r) => r.n - p.n || (r.d.mine - p.d.mine)) : [];
      if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) return {x: scored[0].d};
      if (scored.length) return {choices: scored.slice(0, 6).map(o => o.d)};
      return {none: true, q};
    }
    return {choices: pool.slice(0, 6)};
  }

  chatRegisterTool({
    name: 'read_doc', label: '문서 읽고 정리', kind: 'read',
    description: '결재문서·공문(부서 참고 포함) 한 건의 검색 색인 본문을 읽어 요청 문장·기한·회신 필요 여부를 정리한다. query는 문서 제목 일부, index는 직전 목록 순번, scope=ref는 부서 참고 공문만. 열람 처리하지 않는다.',
    params: {type: 'object', properties: {query: {type: 'string'}, index: {type: 'number'}, scope: {type: 'string', enum: ['ref']}}},
    run: async a => {
      if (!S.a) return chatNotReady();
      let p = cuPickDoc(a);
      if (p.none && GW.search) {
        try {
          const res = await GW.search(p.q, {types: ['doc'], pageSize: 20});
          const g = res && res.groups && res.groups.doc, toks = cmdKeywords(p.q).map(k => k.replace(/\s+/g, ''));
          const hits = ((g && g.items) || []).filter(x => x && x.title && toks.every(k => String(x.title).replace(/\s+/g, '').includes(k)));
          if (hits.length === 1) p = {x: {key: `doc:search:${hits[0].docId || ''}`, title: hits[0].title, docNo: hits[0].docNo || '', year: String(hits[0].date || '').slice(0, 4), docId: String(hits[0].docId || '')}};
          else if (hits.length > 1) p = {choices: hits.slice(0, 6).map(x => ({key: `doc:search:${x.docId || ''}`, title: x.title, docNo: x.docNo || '', mine: false}))};
        } catch (e) { logError('cu.docSearch', e.message); }
      }
      if (p.none) return {ok: true, text: `“${cuCut(p.q, 30)}”와 제목이 맞는 문서를 내 할 일·부서 참고·결재 목록에서 찾지 못했습니다. “${cuCut(p.q, 20)} 검색해줘”로 전체 문서를 찾아볼 수 있습니다.`, data: {count: 0}};
      if (p.choices) {
        if (!p.choices.length) return {ok: false, text: a.scope === 'ref' ? '부서 참고 공문이 없습니다.' : '읽을 문서가 없습니다.'};
        return {ok: true, text: '어느 문서를 읽을까요? 번호로 말씀해 주세요. 예) “2번 문서 요약해줘”', data: {count: p.choices.length, items: p.choices.map(d => ({itemId: d.key, title: d.title, type: 'doc'}))},
          cards: [{type: 'list', title: a.scope === 'ref' ? '부서 참고 공문 고르기' : '문서 고르기', items: p.choices.map((d, i) => ({title: `${i + 1}. ${d.title}`, sub: [d.docNo, d.mine ? '내 처리' : ''].filter(Boolean).join(' · ')}))}]};
      }
      const d = p.x;
      let r;
      try { r = await GW.docPreview({docNo: d.docNo, title: d.title, year: /^\d{4}$/.test(d.year) ? d.year : ''}); } catch (e) { return {ok: false, text: '문서 색인을 조회하지 못했습니다: ' + cuCut(e.message, 60)}; }
      const openCard = d.key && !/^doc:search:/.test(d.key) ? [{type: 'list', title: '원문 열기', items: [{title: d.title, sub: [d.docNo, '그룹웨어 화면에서 열기(안 읽은 문서는 열람으로 바뀔 수 있음)'].filter(Boolean).join(' · '), act: {act: 'chatOpenItem', v: d.key}}]}] : [];
      if (!r || !r.found) return {ok: false, text: r && r.reason === 'ambiguous' ? '같은 제목의 문서가 여러 건이라 하나로 정하지 못했습니다. 문서번호로 말씀해 주세요.' : r && r.reason === 'incomplete' ? '검색 결과를 끝까지 확인하지 못해 본문을 읽지 않았습니다.' : `“${cuCut(d.title, 40)}” 문서는 통합검색 색인에서 찾지 못해 본문을 읽지 못했습니다. 최근 도착한 공문은 색인에 늦게 반영되거나 권한 밖일 수 있습니다. 원문을 열어 확인해 주세요.`, cards: openCard};
      const body = R.cuMaskBody(String(r.text || ''), 6000);
      if (!body.replace(/\s/g, '')) return {ok: false, text: '검색 색인에 이 문서의 본문 글자가 없습니다. 원문이 없다는 뜻은 아닙니다(한글 붙임 위주 문서일 수 있음).'};
      const hl = R.cuDocHighlights(body, 4).concat(R.mailHighlights(body)).filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 4), dls = R.extractAllDeadlines(body, new Date()).slice(0, 3), need = R.cuReplyNeed({subject: d.title, text: body});
      const needTxt = need.need === 'yes' ? '회신·제출을 요구하는 문장이 있습니다' : need.need === 'no' ? '안내·공유 문서로 보입니다' : need.act ? '해 달라는 일은 있지만 회신 요구 문장은 찾지 못했습니다' : '요청 여부는 원문 확인이 필요합니다';
      const x = {type: 'doc', title: d.title, ref: null};
      const cards = [
        {type: 'list', sensitive: true, title: '요청·핵심 문장 (검색 색인 원문)', items: (hl.length ? hl : [cuCut(body, 140)]).slice(0, 4).map(s => ({title: s}))},
        {type: 'kpi', sensitive: true, items: [{value: {yes: '필요', no: '불필요', maybe: '확인'}[need.need], label: '회신', tone: need.need === 'yes' ? 'urgent' : 'info'}, {value: dls.length ? cuMd(dls[0].date) : '없음', label: '본문 날짜·기한', tone: dls.length && dls[0].dday <= 1 ? 'urgent' : 'info'}, {value: r.docNo || d.docNo || '-', label: '문서번호'}]},
        {type: 'note', sensitive: true, tone: 'info', text: `판단 근거: ${need.reason}\n검색 색인의 일부(최대 6,000자)로 판단했습니다. 붙임 파일 내용은 빠졌을 수 있습니다.`},
      ];
      if (cuAiOk()) {
        const det = {subject: d.title, date: String(r.date || ''), files: [], bigFiles: []};
        if (cuMode() === 'always') { const z = await cuAnalyze(x, det, body); cards.push(...(z.cards || [])); }
        else cards.push({...cuAnalyzeCard(x, det, body), rows: [['보내는 내용', `이 문서의 제목·색인 본문 ${Math.min(body.length, 6000).toLocaleString()}자 (이메일·전화·계좌·주민번호는 가림)`], ['받는 곳', 'Google Gemini (외부)'], ['주의', '이름·기관명은 가려지지 않습니다. 설정에서 끌 수 있습니다']]});
      }
      // 문서 초점: 이어서 "그 문서 첨부 내용 정리해줘"가 이 문서의 첨부를 가리키게 한다(메모리에만)
      const files = (Array.isArray(r.files) ? r.files : []).filter(f => f && f.id && f.name);
      chatState().ctx.docFocus = {title: d.title, docNo: r.docNo || d.docNo || '', drafter: String(r.drafter || ''), files, body, at: Date.now(), owner: S.userKey};
      if (files.some(f => CU_DOC_EXT.test(String(f.name).split('.').pop() || ''))) cards.push({type: 'chips', title: '이어서', items: ['그 문서 첨부 내용 정리해줘']});
      return {ok: true, text: `“${cuCut(d.title, 50)}” 문서를 읽었습니다(열람 처리 없음). ${needTxt}.${dls.length ? ` 본문에 적힌 날짜·기한: ${dls.map(z => cuMd(z.date)).join(', ')}.` : ''}`, llm: `문서 1건을 읽고 화면에 정리했습니다. 회신 필요: ${need.need}.`, data: {read: true}, cards};
    },
  });
  // 메일용 cuAnalyze가 문서(x.ref 없음)를 받으면 대화 초점(메일)을 바꾸지 않게 감싼다
  { const an0 = cuAnalyze; cuAnalyze = async (x, det, body) => { if (x && x.ref) return an0(x, det, body); const st = chatState(), keep = st.ctx.focus, ai0 = keep && keep.ai, l0 = keep && keep.local; const r = await an0({...x, ref: {uid: '', box: ''}}, det, body); st.ctx.focus = keep; if (keep) { keep.ai = ai0; keep.local = l0; } return r; }; }
  // read_mail로 들어온 순번이 문서를 가리키면 read_doc으로 넘긴다
  { const def = CHAT_TOOLS.get('read_mail'); if (def) { const run0 = def.run; def.run = async (a, ctx) => (/^doc:/.test(String(a.itemId || a.mail_key || '')) ? CHAT_TOOLS.get('read_doc').run(a, ctx) : run0(a, ctx)); } }

  // ---------- 여러 메일 한꺼번에 정리: 읽은 메일은 바로, 안 읽은 메일은 한 번에 확인받고 읽는다 ----------
  function cuDigestPool(filter) {
    const d = (S.raw && S.raw.data && S.raw.data.mail) || {};
    const recs = [...((d.inbox && d.inbox.records) || []), ...(d.otherUnseen || [])].filter(m => m && m.uid && !R.isNoiseMail(m));
    const t8 = today().replace(/-/g, ''), day = m => String(m.date || '').replace(/\D/g, '').slice(0, 8);
    const seen = new Set(), out = [];
    const push = (m, title) => { const k = String(m.uid); if (seen.has(k)) return; seen.add(k); out.push({rec: m, x: {type: 'mail', title: title || m.subject || '', ref: {box: m.box || 'INBOX', uid: m.uid}}}); };
    if (filter === 'unread') { for (const m of recs) if (!m.seen) push(m); }
    else if (filter === 'today') { for (const m of recs) if (day(m) === t8) push(m); }
    else for (const x of mailActions()) { const m = x.ref && (findMail(x.ref.box, x.ref.uid) || findMail('', x.ref.uid)); if (m) push(m, x.title); }
    return out.slice(0, 6);
  }
  async function cuDigestRun(items, allowMark) {
    const rows = [];
    for (const it of items) {
      const det = await loadMailDetail(it.rec, !!allowMark);
      if (!det || det.error) { rows.push({title: it.x.title, failed: true}); continue; }
      const body = cuBodyText(det), need = R.cuReplyNeed({subject: det.subject || it.x.title, text: body}), hl = R.mailHighlights(body), dl = R.extractAllDeadlines(body, new Date())[0];
      rows.push({title: det.subject || it.x.title, need: need.need, act: need.act, first: hl[0] || '', due: dl ? dl.date : '', body, x: it.x});
    }
    const ok = R.cuDigestSort(rows.filter(r => !r.failed)), failed = rows.filter(r => r.failed).length;
    const label = r => (r.need === 'yes' ? '답장 필요' : r.need === 'no' ? '안내' : r.act ? '요청 있음' : '확인');
    const cards = [{type: 'list', sensitive: true, title: `메일 ${ok.length}통 정리 (답장 필요한 것부터)`, items: ok.map((r, i) => ({title: `${i + 1}. ${r.title}`, sub: [r.first && cuCut(r.first, 90), r.due ? `날짜 ${cuMd(r.due)}` : ''].filter(Boolean).join(' · '), badge: label(r), tone: r.need === 'yes' ? 'urgent' : r.act ? 'todo' : 'info'}))}];
    // 다음 말("1번 메일 요약해줘")이 이 순서를 가리키게 한다
    chatState().ctx.lastItems = ok.map(r => ({itemId: '', title: r.title, uid: r.x.ref.uid, url: '', type: 'mail'}));
    if (cuAiOk() && ok.length) {
      const send = ok.slice(0, 5);
      const run = async () => {
        let raw;
        try { raw = await cuGeminiText(R.CU_DIGEST_SYSTEM, R.cuDigestUserPrompt(send.map(r => ({subject: R.cuMaskBody(r.title, 160), body: R.cuMaskBody(r.body, 1500)})), today()), true, 1500); }
        catch (e) { logError('cu.digest', e.message); return {ok: false, text: 'AI 정리를 하지 못했습니다: ' + cuAiErr(e)}; }
        const list = R.cuParseDigest(raw, send.length);
        if (!list) return {ok: false, text: 'AI 응답을 알아보지 못했습니다. 위의 원문 문장으로 확인해 주세요.'};
        if (typeof usageNote === 'function') usageNote('toolAi', 'mail_digest');
        return {ok: true, text: `AI가 ${list.length}통을 정리했습니다. 기한·숫자는 원문과 대조해 주세요.`, cards: [{type: 'list', sensitive: true, title: 'AI 정리', items: list.map(z => ({title: `${z.n}. ${z.summary}`, sub: [z.ask && `할 일: ${z.ask}`, z.due && `기한 ${cuMd(z.due)}`].filter(Boolean).join(' · '), badge: {yes: '답장 필요', no: '답장 불필요', maybe: '확인'}[z.reply_needed], tone: z.reply_needed === 'yes' ? 'urgent' : 'info'}))}]};
      };
      if (cuMode() === 'always') { const z = await run(); if (z.ok) cards.push(...(z.cards || [])); else cards.push({type: 'note', tone: 'warn', text: z.text}); }
      else cards.push({type: 'confirm', title: 'AI로 한 줄 요약·할 일 정리', risk: 'low', rows: [['보내는 내용', `위 메일 ${send.length}통의 제목·본문 앞 1,500자씩 (이메일·전화·계좌·주민번호는 가림)`], ['받는 곳', 'Google Gemini (외부)'], ['주의', '이름·기관명은 가려지지 않습니다']], confirmLabel: 'AI로 정리', cancelLabel: '그만두기', onConfirm: run});
    }
    if (ok.length) cards.push({type: 'chips', title: '이어서', items: ['1번 메일 요약해줘', '1번 메일 답장 써줘']});
    return {ok: true, text: `메일 ${ok.length}통을 읽고 답장이 필요한 것부터 정리했습니다.${failed ? ` ${failed}통은 본문을 읽지 못했습니다.` : ''}`, llm: `메일 ${ok.length}통을 화면에 정리했습니다(본문은 외부로 보내지 않음).`, data: {count: ok.length}, cards};
  }
  chatRegisterTool({
    name: 'digest_mail', label: '메일 한꺼번에 정리', kind: 'read',
    description: '여러 메일(filter: unread 안 읽은 메일 | today 오늘 받은 메일 | todo 메일 할 일)을 최대 6통 읽어 답장 필요·요청 문장·날짜로 정리한다. 안 읽은 메일은 사용자가 확인한 뒤 읽는다.',
    params: {type: 'object', properties: {filter: {type: 'string', enum: ['unread', 'today', 'todo']}}},
    run: async a => {
      if (!S.raw) return chatNotReady();
      const f = ['unread', 'today', 'todo'].includes(a.filter) ? a.filter : 'todo', items = cuDigestPool(f);
      const name = {unread: '안 읽은 메일', today: '오늘 받은 메일', todo: '메일 할 일'}[f];
      if (!items.length) return {ok: true, text: `${name}이 없습니다.`, data: {count: 0}};
      const unread = items.filter(it => !it.rec.seen && !(S.mailDet && S.mailDet[it.rec.uid] && !S.mailDet[it.rec.uid].error));
      if (!unread.length) return cuDigestRun(items, false);
      return {ok: true, text: `${name} ${items.length}통 가운데 ${unread.length}통은 아직 읽지 않았습니다. 정리하려면 본문을 읽어야 하고, 그러면 그룹웨어에서 읽음으로 표시됩니다.`,
        cards: [{type: 'list', title: `${name} ${items.length}통`, items: items.map(it => ({title: it.x.title || '(제목 없음)', badge: it.rec.seen ? '' : '안 읽음', tone: it.rec.seen ? 'info' : 'todo'}))},
          {type: 'confirm', title: `메일 ${items.length}통 읽고 정리`, risk: 'low', rows: [['바뀌는 것', `안 읽은 ${unread.length}통이 읽음으로 표시됩니다`], ['외부 전송', '없음 (이 화면에서만 정리)']], confirmLabel: '읽고 정리하기', cancelLabel: '취소', onConfirm: async () => cuDigestRun(items, true)}]};
    },
  });

  // ---------- 일정 + 준비: "내일 일정 확인하고 준비할 거" → 일정별 관련 메일·문서와 확인 사항 ----------
  { const def = CHAT_TOOLS.get('get_schedule'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
      const r = await run0(a, ctx);
      if (!r || !r.ok || !/(준비|챙길|챙겨|필요한\s*(?:거|것)|미리\s*볼|관련\s*자료|(?:끝나면|마치면|끝나고|마치고|다녀와서|다녀오면|후에|뒤에)\s*(?:\S+\s*)?(?:뭐|무엇|할\s*일|해야))/.test((ctx && ctx.userText) || '') || !r.data || !Array.isArray(r.data.days)) return r;
      const labels = r.data.days.flatMap(d => d.items.map(i => i.label));
      const titles = labels.filter(l => !/^시간외 근무 신청/.test(l)).map(l => l.replace(/^기한:\s*/, ''));
      const pool = [...mailActions().map(m => ({title: m.title, kind: '메일', key: m.key || ''})), ...cuDocPool().map(d => ({title: d.title, kind: '문서', key: d.key}))];
      const rel = R.cuRelated(titles, pool, {max: 5}), tips = R.cuPrepTips(labels);
      const cards = [...(r.cards || [])];
      if (rel.length) cards.push({type: 'list', title: '관련 자료 (일정 제목과 낱말이 겹치는 것)', items: rel.map(x => ({title: x.title, sub: `${x.kind} · “${cuCut(x.event, 24)}”와 겹침: ${x.matched.join(', ')}`, ...(x.key ? {act: {act: 'chatOpenItem', v: x.key}} : {})}))});
      if (tips.length) cards.push({type: 'note', tone: 'info', text: `**챙길 것**\n${tips.map(t => '• ' + t).join('\n')}`});
      const add = rel.length || tips.length ? `\n준비할 것을 아래에 붙였습니다: ${[rel.length ? `관련 자료 ${rel.length}건` : '', tips.length ? `확인 사항 ${tips.length}가지` : ''].filter(Boolean).join(' · ')}.` : '\n일정 제목과 겹치는 메일·문서는 찾지 못했습니다.';
      return {...r, text: r.text + add, cards};
    }; } }
