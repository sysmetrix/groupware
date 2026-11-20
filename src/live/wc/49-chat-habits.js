  // ---------- v1.3.0: 대화 습관 ----------
  // "고마워", "응", "방금 거 취소" — 외부로 보내지 않고 바로 답한다. "응"으로는 확인 카드를 실행하지 않는다.
  chatRegisterTool({
    name: 'small_talk', label: '대화', kind: 'read',
    description: '감사·짧은 대답·되돌리기 요청에 답한다(외부 전송 없음). kind: thanks | ack | undo',
    params: {type: 'object', properties: {kind: {type: 'string', enum: ['thanks', 'ack', 'undo', 'send']}}},
    run: async a => {
      const st = chatState(), pend = Object.values(st.pending || {}).filter(p => p && p.card && !p.card.state).pop(), btn = pend ? `[${pend.card.confirmLabel || '확인'}]` : '';
      if (a.kind === 'send') return {ok: true, text: '메일 [보내기]는 비서가 대신 누르지 않습니다. 답장이면 “그 메일 답장 써줘”, 새 메일이면 “○○한테 …라고 메일 보내줘”라고 하시면 창을 열어 내용을 채워 드리고, [보내기]는 직접 누르시면 됩니다.'};
      if (a.kind === 'thanks') return {ok: true, text: '천만에요. 더 필요한 일이 있으면 말씀해 주세요.'};
      if (a.kind === 'ack') return {ok: true, text: pend ? `실행하려면 위 확인 카드의 ${btn} 버튼을 눌러 주세요. 말로 대답하는 것만으로는 실행하지 않습니다.` : '네. 다른 필요한 일이 있으면 말씀해 주세요.'};
      return {ok: true, text: pend ? `아직 실행하지 않았습니다. 위 확인 카드의 [${pend.card.cancelLabel || '취소'}]를 누르면 됩니다.` : '비서가 그룹웨어에 저장하거나 보낸 것은 없습니다. 할 일 끝냄·미루기는 할 일 목록에서 되돌릴 수 있고, 메일·일정·신청 창은 [보내기]·[등록]·[상신] 전이면 창을 닫으면 됩니다.'};
    },
  });

  // "김소연한테 내일 회의 취소됐다고 메일 보내줘" → 새 메일 창에 제목·본문을 채운다. 받는 사람과 [보내기]는 직접.
  { const def = CHAT_TOOLS.get('compose_mail'); if (def) { const run0 = def.run; def.params = {type: 'object', properties: {to: {type: 'string'}, subject: {type: 'string'}, body: {type: 'string'}}}; def.run = async (a, ctx) => {
    const body = String(a.body || '').trim();
    if (!body) return run0(a, ctx);
    const subject = chatCut(String(a.subject || '').trim() || '안내', 60), to = chatCut(String(a.to || '').trim(), 20);
    return {ok: true, text: `새 메일 창에 아래 제목과 본문을 채울까요? ${to ? `받는 사람(${to})은 직접 넣고, ` : '받는 사람은 직접 넣고, '}[보내기]도 직접 누르셔야 합니다.`, cards: [{type: 'confirm', title: '새 메일 창 채우기', risk: 'low', rows: [...(to ? [['받는 사람', `${to} (직접 선택)`]] : []), ['제목', subject], ['본문', body], ['보내기', '직접 눌러야 합니다']], confirmLabel: '메일 창 채우기', cancelLabel: '취소', onConfirm: async () => {
      if (!openUrl(GW.links.compose('plain'), {title: '새 메일', what: '메일'})) return {ok: false, text: '메일 쓰기 창을 열지 않았습니다.'};
      const ok = await autoFillMail('custom', [body]);
      let subj = false;
      try { const d = $('#frame iframe').contentDocument, w = $('#frame iframe').contentWindow, lab = [...d.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent || '').trim() === '제목' && e.offsetParent), lt = lab ? lab.getBoundingClientRect().top : -99, i = [...d.querySelectorAll('input[type=text],input:not([type])')].find(x => x.offsetParent && !x.closest('[class*=AutoCompleteChips]') && Math.abs(x.getBoundingClientRect().top - lt) < 15); if (i && !i.value) { i.focus(); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(i, subject); i.dispatchEvent(new w.Event('input', {bubbles: true})); i.dispatchEvent(new w.Event('change', {bubbles: true})); i.blur(); subj = i.value === subject; } } catch {}
      return {ok: true, text: `메일 창에 ${[subj && '제목', ok && '본문'].filter(Boolean).join('과 ') || '아무것도'} 넣었습니다.${!subj || !ok ? ' 넣지 못한 칸은 직접 채워 주세요.' : ''} ${to ? `받는 사람에 ${to} 님을 넣고 ` : '받는 사람을 넣고 '}[보내기]는 직접 누르세요.`};
    }}]};
  }; } }

  // v1.6.0: "왜 ○○ 메일이 먼저야?" → 그 항목의 순위와 이유, 순서를 정하는 기준
  { const def = CHAT_TOOLS.get('plan_priorities'); if (def) { const run0 = def.run; def.params.properties.why = {type: 'string'}; def.run = async (a, ctx) => {
    if (a.why === undefined) return run0(a, ctx);
    const r = await run0({n: 5}, ctx); if (!r || !r.ok || !r.cards || !r.cards[0]) return r;
    const nm = String(a.why || '').match(/(\d)\s*번|(첫|두|세)\s*번째/), ks = nm ? [] : cmdKeywords(String(a.why || '').replace(/(제일|가장|더)/g, ' ')), its = r.cards[0].items, i = nm ? Math.min(+(nm[1] || {첫: 1, 두: 2, 세: 3}[nm[2]]) - 1, its.length - 1) : ks.length ? its.findIndex(x => ks.some(k => x.title.replace(/\s+/g, '').includes(k.replace(/\s+/g, '')))) : 0;
    const rule = '순서는 ① 기한이 지났거나 오늘·내일인 일 ② 내 결재 차례·반려 ③ 요청이 담긴 안 읽은 메일 ④ 답장 확인이 필요한 메일 순이고, 같은 단계에서는 오래된 것부터입니다.';
    if (i < 0) return {ok: true, text: `“${ks.join(' ')}”은 지금 먼저 할 일 5가지에 들어 있지 않습니다. ${rule}`, cards: r.cards};
    const x = its[i];
    return {ok: true, text: `${x.title.replace(/^\d+\.\s*/, '')}은 ${i + 1}순위입니다. 이유: ${x.sub || '기본 순서(받은 순서)'}.\n${rule}`, llm: `${i + 1}순위, 이유: ${x.sub}`, cards: r.cards};
  }; } }

  // v1.6.0: "다음 주 바쁜 날이 언제야?" → 날마다 내 일정 수와 부서 부재 수를 세어 가장 바쁜(한가한) 날
  chatRegisterTool({
    name: 'busy_days', label: '바쁜 날 확인', kind: 'read',
    description: '기간의 날마다 내 일정 수와 부서 자리 비움 수를 세어 가장 바쁜(free=true면 한가한) 날을 알려준다. 주말 제외.',
    params: {type: 'object', properties: {date: {type: 'string'}, days: {type: 'number'}, free: {type: 'boolean'}}},
    run: async (a, ctx) => {
      const d0 = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : today(), n = Math.min(Math.max(+a.days || 5, 1), 14);
      const sc = await chatRunTool('get_schedule', {date: d0, days: n}, ctx);
      if (!sc || !sc.ok || !sc.data) return {ok: false, text: '일정을 읽지 못해 바쁜 날을 셀 수 없습니다.'};
      const mine = Object.fromEntries((sc.data.days || []).map(x => [x.date, x.items]));
      const rows = [];
      for (let k = 0; k < n; k++) { const iso = chatAddDays(d0, k), w = new Date(iso + 'T00:00:00Z').getUTCDay(); if (w === 0 || w === 6) continue; const st = await chatRunTool('get_staff_status', {date: iso, days: 1}, ctx); rows.push({iso, my: (mine[iso] || []).length, away: st && st.data ? +(st.data.people || st.data.count || 0) : 0, items: mine[iso] || []}); }
      if (!rows.length) return {ok: true, text: '그 기간에는 평일이 없습니다.'};
      const sc2 = x => x.my * 2 + x.away, sorted = [...rows].sort((x, y) => a.free ? sc2(x) - sc2(y) : sc2(y) - sc2(x)), top = sorted[0];
      const line = x => `${chatMd(x.iso)} 내 일정 ${x.my}건 · 부서 자리 비움 ${x.away}명${x.items.length ? ` (${x.items.slice(0, 2).map(i => (i.time ? i.time + ' ' : '') + i.label).join(', ')})` : ''}`;
      return {ok: true, text: `${a.free ? '가장 한가한' : '가장 바쁜'} 날은 ${line(top)}입니다.\n${rows.map(x => '• ' + line(x)).join('\n')}\n(그룹웨어 일정·내 근태와 부서 근태 기준, 구글 캘린더 제외)`, llm: rows.map(line).join('; '), data: {count: rows.length}};
    },
  });

  // v1.6.0: "요즘 내 업무 상황 한 문단으로" → 요약·먼저 할 일·놓치기 쉬운 일을 줄글 한 문단으로(로컬, 외부 전송 없음)
  { const def = CHAT_TOOLS.get('get_overview'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const r = await run0(a, ctx);
    if (!r || !r.ok || !r.data || !/(문단|줄글|서술|한\s*단락)/.test((ctx && ctx.userText) || '')) return r;
    const d = r.data, n = (d.urgent || 0) + (d.todo || 0) + (d.check || 0);
    const pr = await chatRunTool('plan_priorities', {n: 1}, ctx), it = pr && pr.cards && pr.cards[0] && pr.cards[0].items[0];
    const rk = await chatRunTool('check_risks', {}, ctx), rn = rk && rk.data ? +rk.data.count || 0 : 0;
    const para = [`지금 처리하거나 확인할 일은 ${n}건이고 ${d.urgent ? `그중 급한 일이 ${d.urgent}건입니다` : '급한 일은 없습니다'}.`, it ? ` 가장 먼저 볼 것은 「${it.title.replace(/^\d+\.\s*/, '')}」(${String(it.sub || '').split(' · ')[0]})입니다.` : '', rn ? ` 놓치기 쉬운 일은 ${rn}건 있습니다.` : '', d.waiting ? ` 결재를 기다리는 일이 ${d.waiting}건입니다.` : '', d.unread_mail != null ? ` 안 읽은 메일은 ${d.unread_mail}통${d.reference_docs ? `, 부서 참고 공문은 ${d.reference_docs}건` : ''}입니다.` : '', d.remaining_leave ? ` 남은 연차는 ${d.remaining_leave}입니다.` : ''].join('');
    copyText(para);
    return {...r, text: para + '\n(복사해 두었습니다)', cards: []};
  }; } }
