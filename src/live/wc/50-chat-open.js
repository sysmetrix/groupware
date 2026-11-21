  // ---------- v1.8.0: 열기·기간·언제 ----------
  // "홍보요청 메일 열어줘" → 그 메일을 오른쪽 창에(화면 이동 없이). 안 읽은 메일은 읽음으로 바뀐다고 먼저 묻는다.
  // "공지 첫 번째 거 열어줘" → 공지 목록의 그 글(열면 읽음).
  { const def = CHAT_TOOLS.get('open_item'); if (def) { const run0 = def.run; Object.assign(def.params.properties, {query: {type: 'string'}, kind: {type: 'string', enum: ['mail', 'doc', 'board']}}); def.run = async (a, ctx) => {
    if (a.kind === 'board') {
      const nl = await chatRunTool('list_notices', {}, ctx), its = (nl && nl.data && nl.data.items) || [], it = its[(Number(a.index) || 1) - 1];
      if (!it || !it.url) return {ok: true, text: '열 공지를 찾지 못했습니다. “공지 보여줘”로 목록을 먼저 보세요.'};
      if (!String(it.url).startsWith(location.origin + '/')) return {ok: false, text: '안전하지 않은 주소라 열지 않았습니다.'};
      return {ok: true, text: `“${chatCut(it.title, 50)}” 공지를 열까요? 원문을 열면 그룹웨어에서 읽음으로 바뀝니다(내용은 원문에서 확인).`, cards: [{type: 'confirm', title: '공지 원문 열기', risk: 'low', rows: [['공지', it.title], ['바뀌는 것', '읽음으로 표시']], confirmLabel: '열기', cancelLabel: '취소', onConfirm: async () => openUrl(it.url, {title: it.title}) === false ? {ok: false, text: '작성 중인 화면이 있어 열지 않았습니다.'} : {ok: true, text: '공지를 오른쪽 창에 열었습니다.'}}]};
    }
    if (!a.query) return run0(a, ctx);
    if (a.kind === 'doc') { const p = cuPickDoc({query: a.query}); if (p.x && p.x.key && S.a.actions.some(t => t.key === p.x.key)) { selectAction(p.x.key); return {ok: true, text: `“${chatCut(p.x.title, 50)}” 문서를 오른쪽 창에 열었습니다.`}; } return {ok: true, text: `“${chatCut(a.query, 30)}” 문서를 내 할 일·결재 목록에서 바로 찾지 못했습니다. “${chatCut(a.query, 20)} 문서 찾아줘”로 검색한 뒤 번호로 열어 주세요.`}; }
    const p = cuPickMail({query: a.query});
    if (p.none) return {ok: true, text: `“${chatCut(a.query, 30)}”와 제목이 맞는 메일을 찾지 못했습니다.`, data: {count: 0}};
    if (p.choices) return p.choices.length ? cuChoices(p.choices, '을 열까요') : {ok: false, text: '열 메일이 없습니다.'};
    const x = p.x, unread = typeof marksRead === 'function' && marksRead({type: 'mail', ref: x.ref});
    const open = () => { if (x.key && S.a.actions.some(t => t.key === x.key)) { if (!(S.sel && S.sel.key === x.key)) selectAction(x.key); } else { if (!leavePane()) return {ok: false, text: '작성 중인 화면이 있어 열지 않았습니다.'}; S.sel = {type: 'mail', box: x.ref.box, uid: x.ref.uid}; renderPane(); } cuSetFocus(x); return {ok: true, text: `“${chatCut(x.title, 50)}” 메일을 오른쪽 창에 열었습니다.`}; };
    if (!unread) return open();
    return {ok: true, text: `“${chatCut(x.title, 50)}” 메일은 아직 읽지 않았습니다. 열면 그룹웨어에서 읽음으로 바뀝니다.`, cards: [{type: 'confirm', title: '메일 열기', risk: 'low', rows: [['메일', x.title], ['바뀌는 것', '읽음으로 표시']], confirmLabel: '열기', cancelLabel: '취소', onConfirm: async () => open()}]};
  }; } }

  // "이번 주 몇 시간 일했어?" → 날마다 출퇴근 기록(체류 시간)과 그룹웨어 확정 인정 시간
  { const def = CHAT_TOOLS.get('get_work_hours'); if (def) { const run0 = def.run; def.params.properties.week = {type: 'boolean'}; def.run = async (a, ctx) => {
    if (!a.week || !S.raw) return run0(a, ctx);
    const at = S.raw.data.attendance || {}, t = today(), mon = chatAddDays(t, -((new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7));
    const days = (Array.isArray(at.days) ? at.days : []).filter(d => { const iso = `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`; return iso >= mon && iso <= t; });
    const mm = s => /^\d{4}$/.test(s || '') ? +s.slice(0, 2) * 60 + +s.slice(2) : null, hm = m => `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}`;
    let stay = 0, rec = 0, recN = 0, both = 0; const lines = [];
    for (const d of days) { const c = mm(d.come), l = mm(d.leave), s = c != null && l != null && l > c ? l - c : 0; stay += s; if (s) both++; if (d.recognizedMin > 0) { rec += d.recognizedMin; recN++; } if (c != null || l != null || d.item) lines.push(`• ${+d.date.slice(4, 6)}/${+d.date.slice(6, 8)} ${chatHm4(d.come) || '–'}~${chatHm4(d.leave) || '–'}${s ? ` (${hm(s)})` : ''}${d.item ? ' · ' + d.item : ''}`); }
    if (mon.slice(0, 7) !== t.slice(0, 7) && !days.length) return run0({}, ctx);
    return {ok: true, text: `이번 주(${chatMd(mon)}~${chatMd(t)}) ${both ? `출근·퇴근 기록이 모두 있는 ${both}일의 머문 시간은 ${hm(stay)}입니다(점심시간 포함).` : '출근·퇴근 지문이 함께 남은 날이 없어(출장·외출 등) 머문 시간을 계산할 수 없습니다.'}${recN ? ` 그룹웨어 근무시간 집계는 확정된 ${recN}일 기준 ${hm(rec)}입니다.` : ' 이번 주 근무시간 집계는 아직 확정되지 않았습니다.'}${mon.slice(0, 7) !== t.slice(0, 7) ? ' (지난달에 걸친 날은 빠졌을 수 있습니다)' : ''}\n${lines.join('\n')}`, data: {count: lines.length}};
  }; } }

  // "다음 주 월화 연차 써도 돼?" → 날마다 판단 자료를 모아 한 번에
  { const def = CHAT_TOOLS.get('check_leave_day'); if (def) { const run0 = def.run; def.params.properties.end = {type: 'string'}; def.run = async (a, ctx) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.end || '') || !(a.end > a.date)) return run0(a, ctx);
    const out = [], n = Math.min(Math.round((Date.parse(a.end) - Date.parse(a.date)) / 864e5) + 1, 10); let rem = '';
    for (let k = 0; k < n; k++) { const r = await run0({...a, date: chatAddDays(a.date, k), end: ''}, ctx), ls = String(r.text || '').split('\n'); rem = rem || (ls.find(l => /남은 연차/.test(l)) || '').replace(/^•\s*/, '').replace(/\s*→.*/, ''); out.push(`• ${chatMd(chatAddDays(a.date, k))}: ${ls.filter(l => /이미 신청한|그날 내 일정|부서 부재|주말|지난 날|휴일/.test(l)).map(l => l.replace(/^•\s*/, '')).join(' / ') || '확인할 것 없음'}`); }
    const per = {half: 0.5, quarter: 0.25}[a.amount] || 1, need = per * n, lv = S.raw && S.raw.data.leave, ok = lv && Number.isFinite(lv.remaining) ? lv.remaining >= need : null;
    return {ok: true, text: `${chatMd(a.date)}~${chatMd(a.end)} 휴가 판단 자료입니다. ${rem}${ok == null ? '' : ok ? ` → ${fmtDays(need)} 쓸 수 있습니다.` : ` → ${fmtDays(need)}에 모자랍니다.`}\n${out.join('\n')}\n신청은 근태신청 화면에서 직접 하세요(비서는 신청하지 않습니다).`, cards: [{type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'}]};
  }; } }

  // "청년 포럼 언제야?" → 일정·메일·문서 검색에서 날짜를 찾는다(제목·일정 시작일 기준)
  chatRegisterTool({
    name: 'find_when', label: '날짜 찾기', kind: 'read',
    description: '행사·회의·사업 이름으로 그룹웨어 일정·메일·결재문서를 검색해 날짜를 찾는다(일정 시작일, 제목의 날짜).',
    params: {type: 'object', properties: {query: {type: 'string'}}, required: ['query']},
    run: async a => {
      const q = String(a.query || '').trim(); if (q.length < 2) return {ok: false, text: '무엇의 날짜인지 이름으로 말씀해 주세요.'};
      let res; try { res = await GW.search(q, {types: ['schedule', 'mail', 'doc'], pageSize: 5}); } catch (e) { return {ok: false, text: '검색하지 못했습니다.'}; }
      const dt = s => { const m = String(s || '').match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일|(?<![\d.])(\d{1,2})[./](\d{1,2})(?![\d])/); return m ? `${+(m[1] || m[3])}/${+(m[2] || m[4])}` : ''; };
      const rows = [];
      for (const x of (res.groups.schedule && res.groups.schedule.items) || []) rows.push({src: '일정', title: x.title, when: x.start ? `${+x.start.slice(4, 6)}/${+x.start.slice(6, 8)}${x.start.length > 8 ? ' ' + x.start.slice(8, 10) + ':' + x.start.slice(10, 12) : ''}` : dt(x.title)});
      for (const x of (res.groups.mail && res.groups.mail.items) || []) rows.push({src: '메일', title: x.subject, when: dt(x.subject) || dt(x.snippet)});
      for (const x of (res.groups.doc && res.groups.doc.items) || []) rows.push({src: '문서', title: x.title, when: dt(x.title)});
      const seen = new Set(), hit = rows.filter(r => r.when && !seen.has(r.when + r.src) && seen.add(r.when + r.src)), show = (hit.length ? hit : rows).slice(0, 5);
      if (!rows.length) return {ok: true, text: `“${q}”를 그룹웨어 일정·메일·결재문서에서 찾지 못했습니다.`, data: {count: 0}};
      return {ok: true, text: hit.length ? `“${q}” 관련 날짜는 ${hit[0].when}로 보입니다(${hit[0].src}: ${chatCut(hit[0].title, 50)}).${hit.length > 1 ? `\n다른 후보: ${hit.slice(1, 4).map(r => `${r.when}(${r.src})`).join(', ')}` : ''}\n일정 시작일이나 제목에 적힌 날짜 기준이니 원문에서 확인하세요.` : `“${q}” 관련 자료 ${rows.length}건을 찾았지만 제목에서 날짜를 찾지 못했습니다.`, llm: show.map(r => `${r.src} ${r.when || '날짜 없음'}`).join('; '), data: {count: show.length},
        cards: [{type: 'list', title: '찾은 자료', items: show.map(r => ({title: r.title || '(제목 없음)', sub: [r.src, r.when].filter(Boolean).join(' · '), tone: 'info'}))}]};
    },
  });
