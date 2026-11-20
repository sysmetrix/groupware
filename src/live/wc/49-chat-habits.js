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
