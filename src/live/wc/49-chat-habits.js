  // ---------- v1.3.0: 대화 습관 ----------
  // "고마워", "응", "방금 거 취소" — 외부로 보내지 않고 바로 답한다. "응"으로는 확인 카드를 실행하지 않는다.
  chatRegisterTool({
    name: 'small_talk', label: '대화', kind: 'read',
    description: '감사·짧은 대답·되돌리기 요청에 답한다(외부 전송 없음). kind: thanks | ack | undo',
    params: {type: 'object', properties: {kind: {type: 'string', enum: ['thanks', 'ack', 'undo', 'send', 'remind']}}},
    run: async a => {
      const st = chatState(), pend = Object.values(st.pending || {}).filter(p => p && p.card && !p.card.state).pop(), btn = pend ? `[${pend.card.confirmLabel || '확인'}]` : '';
      if (a.kind === 'remind') return {ok: true, text: '정해진 시각에 한 번만 알려 주는 기능은 아직 없습니다. “○○ 할 일로 추가해줘”라고 하면 할 일 목록과 아침 브리핑에 나오고, 매일 같은 시각이면 “매일 9시에 ○○ 알려줘”로 자동화를 등록할 수 있습니다.'};
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
    const subject = chatCut(String(a.subject || '').trim() || '안내', 60), to0 = String(a.to || '').trim(), to = chatCut(to0 === '나' ? `나(${(S.raw && S.raw.principal && S.raw.principal.name) || '본인'})` : to0, 20);
    return {ok: true, text: `새 메일 창에 아래 제목과 본문을 채울까요? ${to ? `받는 사람(${to})은 ${to0 === '나' ? '조직도에서 골라 넣고' : '직접 넣고'}, ` : '받는 사람은 직접 넣고, '}[보내기]도 직접 누르셔야 합니다.`, cards: [{type: 'confirm', title: '새 메일 창 채우기', risk: 'low', rows: [...(to ? [['받는 사람', `${to} (${to0 === '나' ? '자동 선택' : '직접 선택'})`]] : []), ['제목', subject], ['본문', body], ['보내기', '직접 눌러야 합니다']], confirmLabel: '메일 창 채우기', cancelLabel: '취소', onConfirm: async () => {
      if (!openUrl(GW.links.compose('plain'), {title: '새 메일', what: '메일'})) return {ok: false, text: '메일 쓰기 창을 열지 않았습니다.'};
      const ok = await autoFillMail('custom', [body]);
      let subj = false;
      try { const d = $('#frame iframe').contentDocument, w = $('#frame iframe').contentWindow, lab = [...d.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent || '').trim() === '제목' && e.offsetParent), lt = lab ? lab.getBoundingClientRect().top : -99, i = [...d.querySelectorAll('input[type=text],input:not([type])')].find(x => x.offsetParent && !x.closest('[class*=AutoCompleteChips]') && Math.abs(x.getBoundingClientRect().top - lt) < 15); if (i && !i.value) { i.focus(); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(i, subject); i.dispatchEvent(new w.Event('input', {bubbles: true})); i.dispatchEvent(new w.Event('change', {bubbles: true})); i.blur(); subj = i.value === subject; } } catch {}
      let self = false;
      if (to0 === '나') try { const fr = $('#frame iframe'), d = fr.contentDocument, w = fr.contentWindow, pr = (S.raw && S.raw.principal) || {}, inp = [...d.querySelectorAll('input')].find(i => /받는사람/.test(i.placeholder || '')); if (inp && pr.name) { inp.focus(); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(inp, pr.name); inp.dispatchEvent(new w.Event('input', {bubbles: true})); let li = null; for (let k = 0; k < 20 && !li; k++) { await new Promise(r => setTimeout(r, 250)); const all = [...d.querySelectorAll('li[class*="OBTAutoCompleteChips_dropdownItem"]')].filter(l => (l.textContent || '').includes(pr.name)), byId = pr.loginId ? all.filter(l => (l.textContent || '').toLowerCase().includes(String(pr.loginId).toLowerCase())) : []; const mails = new Set(all.map(l => ((l.textContent || '').match(/<([^>]+@[^>]+)>/) || [])[1]).filter(Boolean)); if (byId.length) li = byId[0]; else if (all.length && mails.size === 1) li = all[0]; } if (li) { li.dispatchEvent(new w.MouseEvent('mousedown', {bubbles: true})); li.click(); await new Promise(r => setTimeout(r, 600)); self = [...d.querySelectorAll('[class*="OBTAutoCompleteChips_item__"]')].some(i => !/uncorrect/.test(i.className) && (i.textContent || '').includes(pr.name)); } if (!self) { for (const b of d.querySelectorAll('[class*="OBTAutoCompleteChips_uncorrect"] img[alt=remove]')) b.parentElement.click(); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(inp, ''); inp.dispatchEvent(new w.Event('input', {bubbles: true})); } } } catch {}
      return {ok: true, text: `메일 창에 ${[self && '받는 사람(나)', subj && '제목', ok && '본문'].filter(Boolean).join(', ') || '아무것도'} 넣었습니다.${!subj || !ok || (to0 === '나' && !self) ? ' 넣지 못한 칸은 직접 채워 주세요.' : ''} ${self ? '' : to ? `받는 사람에 ${to} 님을 넣고 ` : '받는 사람을 넣고 '}[보내기]는 직접 누르세요.`};
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

  // v1.7.0: "오늘 출근 몇 시에 했어?" → 오늘 출퇴근 기록만
  { const def = CHAT_TOOLS.get('get_work_hours'); if (def) { const run0 = def.run; def.params.properties.today_only = {type: 'boolean'}; def.run = async (a, ctx) => {
    if (!a.today_only || !S.raw) return run0(a, ctx);
    const t = today(), day = R.homeDayInfo({date: t, holidays: (S.raw.data.schedule && S.raw.data.schedule.holidays) || []}), td = (S.raw.data.attendance || {}).today || {};
    if (td.error) return {ok: false, text: '오늘 출퇴근 기록을 읽지 못했습니다.'};
    return {ok: true, text: `오늘 ${chatMd(t)} 출근 ${chatHm4(td.come) || '기록 없음'}, 퇴근 ${chatHm4(td.leave) || '기록 없음'}입니다.${day.weekend || day.holiday ? ` 오늘은 ${day.holiday || '주말'}입니다.` : ''}${!td.come ? ' 기록 없음은 지문 기록이 조회되지 않았다는 뜻이며 근태 이상 판정이 아닙니다.' : ''}`};
  }; } }

  // v1.7.0: 주말에 "이번 주 금요일 관용차 비어?"처럼 지난 요일을 물으면 다음 주 같은 요일로 본다
  { const def = CHAT_TOOLS.get('get_resource_status'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const t = today(), d = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : '';
    if (!d || d >= t || Date.parse(t) - Date.parse(d) >= 7 * 864e5 || !/이번\s*주/.test((ctx && ctx.userText) || '')) return run0(a, ctx);
    const nd = chatAddDays(d, 7), r = await run0({...a, date: nd}, ctx);
    return r && r.ok ? {...r, text: `${chatMd(d)}은 지났으므로 다음 주 ${chatMd(nd)} 기준입니다.\n${r.text}`} : r;
  }; } }

  // v1.7.0: "이번 달 ○○비 얼마 썼어?" → 예산 집행액은 올해 누계라는 점을 밝힌다
  { const def = CHAT_TOOLS.get('get_budget'); if (def) { const run0 = def.run; def.params.properties.month = {type: 'boolean'}; def.run = async (a, ctx) => { const r = await run0(a, ctx); return r && r.ok && a.month ? {...r, text: r.text + '\n(집행액은 올해 누계입니다. 달마다 쓴 금액은 예산 화면의 월별 차트에서 볼 수 있습니다)'} : r; }; } }
