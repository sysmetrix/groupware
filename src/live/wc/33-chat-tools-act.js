// GW 비서 · 채팅 도구(실행): 신청서·기안·메일 답장·예약을 "확인 카드"로 준비한다.
// 절대 규칙: 도구는 스스로 제출·발송·저장하지 않는다. 카드의 버튼을 사용자가 직접 눌러야 기존의 미리 채워진 흐름이 열리고,
// 그 흐름에서도 최종 [신청완료]·[보내기]는 사람이 누른다. 차량 예약만 확정 버튼이 곧 저장이므로 위험 표시(high)를 붙인다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const chatDow = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
  function chatBizDays(a, b) { let n = 0; for (let t = Date.parse(a + 'T00:00:00Z'), z = Date.parse(b + 'T00:00:00Z'); t <= z; t += 86400000) { const d = new Date(t).getUTCDay(); if (d !== 0 && d !== 6) n++; } return n; }
  const chatNeedDate = ex => ({ok: false, text: `어느 날짜인지 알려 주세요. 예) ${ex}`});
  function chatDateWarn(iso, end) {
    const w = [];
    if (iso < today()) w.push('이미 지난 날짜입니다.');
    if (chatDow(iso) === 0 || chatDow(iso) === 6) w.push('주말입니다.');
    if (end && end < iso) w.push('종료일이 시작일보다 빠릅니다.');
    return w;
  }
  const chatSpan = (iso, end) => (end && end !== iso ? `${iso} ~ ${end}` : iso);

  chatRegisterTool({
    name: 'prepare_leave_request', label: '휴가 신청 준비', kind: 'act',
    description: '휴가·반차 신청을 준비한다. 확인 카드만 만들며 제출하지 않는다. date 필수(YYYY-MM-DD), end_date 선택, kind: 연차|오전반차|오후반차|대체휴가|보상휴가.',
    params: {type: 'object', properties: {date: {type: 'string'}, end_date: {type: 'string'}, kind: {type: 'string', enum: ['연차', '오전반차', '오후반차', '대체휴가', '보상휴가']}, reason: {type: 'string'}}, required: ['date']},
    run: async a => {
      if (!a.date) return chatNeedDate('11/12 연차 신청해줘');
      const iso = chatDateArg(a.date), end = a.end_date ? chatDateArg(a.end_date) : '';
      if (!iso || (a.end_date && !end)) return {ok: false, text: '날짜를 알아보지 못했습니다. 예) 11/12, 내일, 다음 주 월요일'};
      const kind = ['연차', '오전반차', '오후반차', '대체휴가', '보상휴가'].includes(a.kind) ? a.kind : '연차';
      const warn = chatDateWarn(iso, end);
      if (end && end < iso) return {ok: false, text: '종료일이 시작일보다 빠릅니다. 날짜를 다시 알려 주세요.'};
      const lv = S.raw && S.raw.data && S.raw.data.leave;
      if (lv && kind === '연차' && Number.isFinite(Number(lv.remaining))) { const need = chatBizDays(iso, end || iso); if (need > Number(lv.remaining)) warn.push(`남은 연차(${fmtDays(lv.remaining)})보다 많이 쓰는 신청입니다.`); }
      const reason = String(a.reason || '').slice(0, 100);
      return {ok: true, text: `${chatSpan(iso, end)} ${kind} 신청을 준비했습니다. 아직 아무것도 제출하지 않았습니다. 확인 카드의 [신청서 열고 채우기]를 누르면 신청서가 열리고, [신청완료]는 직접 눌러야 합니다.`, cards: [{type: 'confirm', title: '휴가 신청서 준비', risk: 'low', rows: [['종류', kind], ['기간', chatSpan(iso, end)], ['사유', reason || '신청서에서 입력']], warn: warn.join(' '), confirmLabel: '신청서 열고 채우기', cancelLabel: '취소',
        onConfirm: async () => { await quickAttendanceApplication('leave', {date: iso, to: end, kind, reason}); return {ok: true, text: '신청서 준비 창을 열었습니다. 내용을 확인하고 [신청완료]는 직접 눌러 주세요.'}; }}]};
    },
  });

  chatRegisterTool({
    name: 'prepare_trip_request', label: '출장 신청 준비', kind: 'act',
    description: '출장 신청을 준비한다. 확인 카드만 만들며 제출하지 않는다. date 필수(YYYY-MM-DD). 출장지(place)와 목적(reason)을 사용자에게 물어서 채우는 것이 좋다.',
    params: {type: 'object', properties: {date: {type: 'string'}, end_date: {type: 'string'}, scope: {type: 'string', enum: ['관내', '관외']}, place: {type: 'string'}, reason: {type: 'string'}, start: {type: 'string'}, end: {type: 'string'}}, required: ['date']},
    run: async a => {
      if (!a.date) return chatNeedDate('11/20 관내출장 신청해줘');
      const iso = chatDateArg(a.date), end = a.end_date ? chatDateArg(a.end_date) : '';
      if (!iso || (a.end_date && !end)) return {ok: false, text: '날짜를 알아보지 못했습니다. 예) 11/20, 내일'};
      if (end && end < iso) return {ok: false, text: '종료일이 시작일보다 빠릅니다. 날짜를 다시 알려 주세요.'};
      const scope = a.scope === '관외' ? '관외' : '관내', place = String(a.place || '').slice(0, 60), reason = String(a.reason || '').slice(0, 100);
      return {ok: true, text: `${chatSpan(iso, end)} ${scope}출장 신청을 준비했습니다.${place && reason ? '' : ' 출장지와 목적은 신청서에서 입력하세요.'} 아직 제출하지 않았습니다. 확인 카드의 [신청서 열고 채우기]를 눌러 진행하세요.`, cards: [{type: 'confirm', title: '출장 신청서 준비', risk: 'low', rows: [['구분', scope + '출장'], ['기간', chatSpan(iso, end)], ['출장지', place || '신청서에서 입력'], ['목적', reason || '신청서에서 입력']], warn: chatDateWarn(iso, end).join(' '), confirmLabel: '신청서 열고 채우기', cancelLabel: '취소',
        onConfirm: async () => { await quickAttendanceApplication('trip', {kind: scope, date: iso, to: end, visit: place, purpose: reason, content: reason}); return {ok: true, text: '출장 신청서 준비 창을 열었습니다. 내용을 확인하고 [신청완료]는 직접 눌러 주세요.'}; }}]};
    },
  });

  chatRegisterTool({
    name: 'prepare_overtime_request', label: '시간외 신청 준비', kind: 'act',
    description: '시간외·휴일근무 신청을 준비한다. 확인 카드만 만들며 제출하지 않는다. date 필수, start/end는 HH:MM.',
    params: {type: 'object', properties: {date: {type: 'string'}, start: {type: 'string'}, end: {type: 'string'}, reason: {type: 'string'}}, required: ['date']},
    run: async a => {
      if (!a.date) return chatNeedDate('내일 시간외 근무 신청, 18시부터 21시까지');
      const iso = chatDateArg(a.date);
      if (!iso) return {ok: false, text: '날짜를 알아보지 못했습니다. 예) 내일, 11/20'};
      const hm = /^([01]\d|2[0-3]):[0-5]\d$/, s = hm.test(a.start || '') ? a.start : '', e = hm.test(a.end || '') ? a.end : '';
      if (s && e && s >= e) return {ok: false, text: '시작 시각이 종료 시각보다 늦습니다. 시간을 다시 알려 주세요.'};
      const kind = chatDow(iso) === 0 || chatDow(iso) === 6 ? '휴일근무' : '연장근무', reason = String(a.reason || '').slice(0, 100);
      return {ok: true, text: `${iso} ${kind} 신청을 준비했습니다. 아직 제출하지 않았습니다. 확인 카드의 [신청서 열고 채우기]를 눌러 진행하세요.`, cards: [{type: 'confirm', title: '시간외·휴일근무 신청서 준비', risk: 'low', rows: [['근무 구분', kind], ['근무일', iso], ['시간', s && e ? `${s}~${e}` : '신청서에서 입력'], ['사유', reason || '신청서에서 입력']], warn: chatDateWarn(iso, '').filter(w => !/주말/.test(w)).join(' '), confirmLabel: '신청서 열고 채우기', cancelLabel: '취소',
        onConfirm: async () => { await quickAttendanceApplication('overtime', {kind, date: iso, reason, time: s && e ? `${s}~${e}` : ''}); return {ok: true, text: '시간외 신청서 준비 창을 열었습니다. 내용을 확인하고 [신청완료]는 직접 눌러 주세요.'}; }}]};
    },
  });

  chatRegisterTool({
    name: 'draft_mail_reply', label: '메일 답장 초안', kind: 'act',
    description: '받은 메일에 대한 답장 작성창을 연다(보내지 않는다). query는 메일 제목의 일부, mail_key는 list_tasks가 돌려준 key.',
    params: {type: 'object', properties: {query: {type: 'string'}, mail_key: {type: 'string'}, points: {type: 'string'}}},
    run: async a => {
      if (!S.a) return chatNotReady();
      const mails = mailActions();
      let x = a.mail_key ? mails.find(m => m.key === a.mail_key) : null;
      if (!x) {
        const toks = cmdKeywords(String(a.query || '')).filter(t => !/^(답장|회신|메일|작성|써|초안|보내|확인|표준)$/.test(t));
        const scored = toks.length ? mails.map(m => ({m, n: toks.filter(k => String(m.title || '').replace(/\s+/g, '').includes(k)).length})).filter(o => o.n > 0).sort((p, q) => q.n - p.n) : [];
        if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) x = scored[0].m;
        else {
          const pool = (scored.length ? scored.map(o => o.m) : mails).slice(0, 6);
          if (!pool.length) return {ok: false, text: '답장할 메일 항목이 없습니다.'};
          return {ok: true, text: '어느 메일에 답장할까요? 제목의 일부를 넣어 다시 말씀해 주세요. 예) “정산 자료 메일 답장 써줘”', cards: [{type: 'list', title: '최근 메일', items: pool.map(m => ({title: m.title || '(제목 없음)', sub: m.headline || ''}))}]};
        }
      }
      const points = String(a.points || '').slice(0, 300), tpl = /제출|자료|첨부/.test(points + (a.query || '')) ? 'submit' : 'confirm';
      return {ok: true, text: `“${String(x.title).slice(0, 40)}” 메일의 답장 작성창을 열 준비를 했습니다. 보내기는 하지 않습니다.`, cards: [{type: 'confirm', title: '메일 답장 작성창 열기', risk: 'low', rows: [['대상 메일', x.title || '(제목 없음)'], ['동작', `답장 창을 열고 ${tpl === 'submit' ? '자료 제출' : '확인'} 표준 문구를 넣습니다`], ['보내기', '직접 눌러야 합니다']], confirmLabel: '답장 창 열기', cancelLabel: '취소',
        onConfirm: async () => { if (points) copyText(points); await cmdMailReplyTo(String(a.query || '채팅 요청'), tpl, x); return {ok: true, text: `답장 창을 열었습니다.${points ? ' 말씀하신 요점은 복사해 두었으니 붙여넣기(Ctrl+V)로 쓰세요.' : ''} 내용을 확인하고 [보내기]는 직접 눌러 주세요.`}; }}]};
    },
  });

  chatRegisterTool({
    name: 'prepare_draft', label: '기안 시작 준비', kind: 'act',
    description: '기안 작성을 시작할 준비를 한다(제출하지 않는다). kind: result(결과보고) | plan(운영계획) | payment(지급 문서) | goods(물품매입).',
    params: {type: 'object', properties: {kind: {type: 'string', enum: ['result', 'plan', 'payment', 'goods']}, hint: {type: 'string'}}, required: ['kind']},
    run: async a => {
      const map = {result: ['결과보고 기안', 'result', '내 계획서 중 결과보고가 없는 것을 골라 시작합니다'], plan: ['운영·참가계획 기안', 'plan', '과거 계획서 서식으로 시작합니다'], payment: ['지급·지출 문서', 'pay', '지급 문서 허브가 열립니다'], goods: ['물품매입 기안', 'goods', '계획서를 고른 뒤 시작합니다']};
      const m = map[a.kind];
      if (!m) return {ok: false, text: '기안 종류를 알 수 없습니다. 결과보고, 운영계획, 지급, 물품매입 중에서 말씀해 주세요.'};
      return {ok: true, text: `${m[0]} 시작을 준비했습니다. 제출은 하지 않습니다.`, cards: [{type: 'confirm', title: `${m[0]} 시작`, risk: 'low', rows: [['진행', m[2]], ['제출', '초안 화면에서 직접 상신합니다']], confirmLabel: '시작하기', cancelLabel: '취소', onConfirm: async () => { await autoStartDraft(m[1]); return {ok: true, text: `${m[0]} 화면을 열었습니다.`}; }}]};
    },
  });

  chatRegisterTool({
    name: 'reserve_vehicle', label: '차량 예약 준비', kind: 'act',
    description: '공용차량 예약을 준비한다. 가능 여부를 먼저 확인하고, 확인 카드에서 사용자가 [예약 확정]을 눌러야 실제로 예약된다. date, start, end(HH:MM), title(예약명) 필요.',
    params: {type: 'object', properties: {date: {type: 'string'}, start: {type: 'string'}, end: {type: 'string'}, title: {type: 'string'}}, required: ['date', 'start', 'end']},
    run: async a => {
      if (!allowed('resource')) return {ok: false, text: '자원 예약 기능이 관리자 설정으로 꺼져 있습니다.'};
      if (!a.date || !a.start || !a.end) return {ok: false, text: '날짜와 시간을 알려 주세요. 예) 내일 14시부터 16시까지 차량 예약해줘'};
      const iso = chatDateArg(a.date);
      if (!iso) return {ok: false, text: '날짜를 알아보지 못했습니다. 예) 내일, 11/20'};
      const d8 = iso.replace(/-/g, ''), title = String(a.title || '').trim().slice(0, 40) || '업무 이동';
      let v = R.validateBooking({title, date: d8, start: a.start, end: a.end});
      if (!v.ok) return {ok: false, text: '예약할 수 없는 조건입니다: ' + v.errors.join(' ')};
      try {
        const list = ((resState().list) || await GW.resourceList()).filter(r => r.useYn !== 'N');
        const car = list.find(r => /차량|관용|니로/.test(r.name)) || list[0];
        if (!car) return {ok: false, text: '예약할 수 있는 차량을 찾지 못했습니다.'};
        const det = await GW.resourceDetail(car.resSeq);
        v = R.validateBooking({title, date: d8, start: a.start, end: a.end, limitMin: det.limitMin});
        if (!v.ok) return {ok: false, text: '예약할 수 없는 조건입니다: ' + v.errors.join(' ')};
        const c = await GW.resourceCheck({resSeq: car.resSeq, start: v.start12, end: v.end12});
        if (c.conflict || c.limit) {
          const day = (await GW.resourceBookings({from: d8, to: d8, resSeqs: [car.resSeq]})).filter(b => R.bookingSpanOnDay(b, d8)), free = R.freeSlots(day, d8);
          return {ok: true, text: `${c.limit ? '예약 한도를 넘습니다.' : '그 시간에는 이미 예약이 있습니다.'} 비어 있는 시간: ${free.length ? free.map(f => `${f.start}~${f.end}`).join(', ') : '없음'}`, cards: [{type: 'note', tone: 'warn', text: `${chatMd(iso)} ${a.start}~${a.end}은(는) 예약할 수 없습니다.`}, {type: 'timeline', title: `비어 있는 시간 (${chatMd(iso)})`, items: free.map(f => ({from: f.start, to: f.end, label: '예약 가능'}))}]};
        }
        const nm = car.name.replace(/\(.*$/, '');
        return {ok: true, text: `${nm}을(를) ${chatMd(iso)} ${a.start}~${a.end}에 예약할 수 있습니다. 확정하면 실제로 예약이 올라갑니다.`, cards: [{type: 'confirm', title: '차량 예약 확정', risk: 'high', rows: [['차량', nm], ['일시', `${iso} ${a.start}~${a.end}`], ['예약명', title], ['승인', car.apprYn === 'Y' ? '관리자 승인 필요' : '승인 없이 확정']], warn: '[예약 확정]을 누르면 그룹웨어에 실제로 예약이 올라가고, 취소는 그룹웨어 자원 화면에서 해야 합니다.', confirmLabel: '예약 확정', cancelLabel: '취소',
          onConfirm: async () => {
            const out = await GW.reserveResource({resSeq: car.resSeq, title, start: v.start12, end: v.end12});
            logActionRecord({command: `채팅 자원 예약: ${nm}`, type: '자원', target: title, summary: `${iso} ${a.start}~${a.end} 예약을 올렸습니다${out.needsApproval ? '(승인 대기)' : ''}.`, steps: [], verified: true});
            if (S.res) { S.res.bookings = null; }
            return {ok: true, text: `${nm} ${iso} ${a.start}~${a.end} 예약을 올렸습니다${out.needsApproval ? '(관리자 승인 대기)' : ''}.${out.verifiedAfterTimeout ? ' 응답이 늦었지만 저장된 것을 확인했습니다.' : ''}`};
          }}]};
      } catch (e) { logError('chat.reserve', e.message); return {ok: false, text: '차량 예약 가능 여부를 확인하지 못했습니다: ' + String(e.message || e).slice(0, 80)}; }
    },
  });

  chatRegisterTool({
    name: 'add_todo', label: '할 일 추가', kind: 'act',
    description: '내 할 일 목록(이 PC에만 저장되는 메모)에 항목을 추가한다. 그룹웨어에는 아무것도 보내지 않는다. due는 YYYY-MM-DD.',
    params: {type: 'object', properties: {title: {type: 'string'}, due: {type: 'string'}}, required: ['title']},
    run: async a => {
      const title = String(a.title || '').trim().slice(0, 80);
      if (title.length < 2) return {ok: false, text: '추가할 할 일의 내용을 알려 주세요.'};
      const due = a.due ? chatDateArg(a.due) : '';
      if (a.due && !due) return {ok: false, text: '기한 날짜를 알아보지 못했습니다.'};
      addTodo(title, due, '채팅');
      return {ok: true, text: `“${title}”을(를) 내 할 일에 추가했습니다${due ? ` (기한 ${chatMd(due)})` : ''}. 그룹웨어에는 보내지 않는 이 PC의 메모입니다.`, cards: [{type: 'nav', label: '할 일 보드에서 보기', view: 'board'}]};
    },
  });
