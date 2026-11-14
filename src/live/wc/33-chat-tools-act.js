// GW 비서 · 채팅 도구(실행): 신청서·기안·메일 답장·예약을 "확인 카드"로 준비한다.
// 절대 규칙: 도구는 스스로 제출·발송·저장하지 않는다. 카드의 버튼을 사용자가 직접 눌러야 기존의 미리 채워진 흐름이 열리고,
// 그 흐름에서도 최종 [신청완료]·[보내기]는 사람이 누른다. 차량 예약만 확정 버튼이 곧 저장이므로 위험 표시(high)를 붙인다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const chatDow = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
  function chatBizDays(a, b) { let n = 0; for (let t = Date.parse(a + 'T00:00:00Z'), z = Date.parse(b + 'T00:00:00Z'); t <= z; t += 86400000) { const d = new Date(t).getUTCDay(); if (d !== 0 && d !== 6) n++; } return n; }
  const chatNeedDate = ex => ({ok: false, text: `어느 날짜인지 알려 주세요. 예) ${ex}`});
  // URL만으로 자동 기입의 성공을 판단하지 않는다. 확인된 결과가 없으면 성공으로 보고하지 않는다.
  const chatAttResult = (name, outcome) => {
    if (outcome && outcome.status === 'success') return {ok: true, text: `${name}를 열고 자동 기입을 마쳤습니다. 내용을 확인하고 [신청완료]는 직접 눌러 주세요. 아직 제출하지 않았습니다.`};
    if (outcome && outcome.status === 'partial') return {ok: true, text: `${name}를 일부만 자동 기입했습니다. 준비 결과에서 누락·실패 항목을 확인하고 직접 보완하세요. 아직 제출하지 않았으며 [신청완료]는 직접 눌러야 합니다.`};
    if (outcome && outcome.status === 'failed') return {ok: false, text: `${name}의 자동 기입을 완료하지 못했습니다. 처리 창을 확인해 주세요. 제출하지 않았습니다.`};
    return {ok: false, text: `${name} 준비가 취소되었거나 결과를 확인하지 못했습니다. 자동 기입 성공으로 확인되지 않았으며 제출하지 않았습니다.`};
  };
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
        onConfirm: async () => { const outcome = await quickAttendanceApplication('leave', {date: iso, to: end, kind, reason}); return chatAttResult('휴가 신청서', outcome); }}]};
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
      const hm = /^([01]\d|2[0-3]):[0-5]\d$/, ts = hm.test(a.start || '') ? a.start : '', te = hm.test(a.end || '') ? a.end : '';
      if (ts && te && ts >= te) return {ok: false, text: '시작 시각이 종료 시각보다 늦습니다. 시간을 다시 알려 주세요.'};
      const tripTime = ts && te && !end ? `${ts}~${te}` : '';
      return {ok: true, text: `${chatSpan(iso, end)} ${scope}출장 신청을 준비했습니다.${place && reason ? '' : ' 출장지와 목적은 신청서에서 입력하세요.'} 아직 제출하지 않았습니다. 확인 카드의 [신청서 열고 채우기]를 눌러 진행하세요.`, cards: [{type: 'confirm', title: '출장 신청서 준비', risk: 'low', rows: [['구분', scope + '출장'], ['기간', chatSpan(iso, end)], ['시간', tripTime || '09:00~18:00 (신청서에서 바꿀 수 있음)'], ['출장지', place || '신청서에서 입력'], ['목적', reason || '신청서에서 입력']], warn: chatDateWarn(iso, end).join(' '), confirmLabel: '신청서 열고 채우기', cancelLabel: '취소',
        onConfirm: async () => { const outcome = await quickAttendanceApplication('trip', {kind: scope, date: iso, to: end, visit: place, purpose: reason, content: reason, time: tripTime}); return chatAttResult('출장 신청서', outcome); }}]};
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
        onConfirm: async () => { const outcome = await quickAttendanceApplication('overtime', {kind, date: iso, reason, time: s && e ? `${s}~${e}` : ''}); return chatAttResult('시간외 신청서', outcome); }}]};
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
        onConfirm: async () => {
          const r = await cmdMailReplyTo(String(a.query || '채팅 요청'), tpl, x);
          if (r !== 'filled' && r !== 'opened') return {ok: false, text: '답장 창을 열지 않았습니다(작성 중인 화면을 그대로 두었거나 취소했습니다).'};
          if (points) copyText(points);
          return {ok: true, text: `${r === 'filled' ? '답장 창을 열고 표준 문구를 넣었습니다.' : '답장 창은 열었지만 표준 문구는 넣지 못했습니다. 답장 화면 위의 회신문 버튼을 눌러 주세요.'}${points ? ' 말씀하신 요점은 복사해 두었으니 붙여넣기(Ctrl+V)로 쓰세요.' : ''} 내용을 확인하고 [보내기]는 직접 눌러 주세요.`};
        }}]};
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
      return {ok: true, text: `${m[0]} 시작을 준비했습니다. 제출은 하지 않습니다.`, cards: [{type: 'confirm', title: `${m[0]} 시작`, risk: 'low', rows: [['진행', m[2]], ['제출', '초안 화면에서 직접 상신합니다']], confirmLabel: '시작하기', cancelLabel: '취소', onConfirm: async () => {
        const feat = {result: 'draftResult', plan: 'draftPlan', pay: 'draftPay', goods: 'draftGoods'}[m[1]];
        if (feat && !allowed(feat)) return {ok: false, text: `${m[0]} 기능이 관리자 설정으로 꺼져 있어 열지 않았습니다.`};
        await autoStartDraft(m[1]);
        return {ok: true, text: `${m[0]} 시작 화면을 띄웠습니다. 대상을 고르면 초안 화면이 열립니다.`};
      }}]};
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
        // 차량이 아닌 자원(회의실 등)을 대신 예약하지 않는다.
        const car = list.find(r => /차량|관용|니로|승용|승합|자동차|카니발|스타리아/.test(r.name));
        if (!car) return {ok: false, text: `자원 목록에서 차량을 찾지 못했습니다${list.length ? ` (있는 자원: ${list.slice(0, 5).map(r => r.name).join(', ')})` : ''}. 자원 예약 화면에서 직접 골라 주세요.`, cards: [{type: 'nav', label: '자원 예약 화면 열기', view: 'resource'}]};
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

  // 실제 처리 버튼을 누르지 않고, 사용자가 확인할 목록 또는 비서의 상세 패널만 연다.
  chatRegisterTool({
    name: 'prepare_approval_queue', label: '결재·문서유통 목록 열기 준비', kind: 'act',
    description: '결재 대기, 부서 접수 대기, 배부 대기, 발송 대기, 열람문서 또는 내 상신문서 목록을 열 준비를 한다. 확인 카드만 만들며 결재·접수·배부·발송은 하지 않는다.',
    params: {type: 'object', properties: {queue: {type: 'string', enum: ['pending', 'deptWaiting', 'distWaiting', 'sendWaiting', 'viewing', 'submitted']}}, required: ['queue']},
    run: async a => {
      const labels = {pending: '결재 대기', deptWaiting: '부서 접수 대기', distWaiting: '배부 대기', sendWaiting: '발송 대기', viewing: '열람문서', submitted: '내 상신문서'};
      if (!Object.prototype.hasOwnProperty.call(labels, a.queue)) return {ok: false, text: '열 목록을 알려 주세요. 결재 대기, 부서 접수 대기, 배부 대기, 발송 대기, 열람문서, 내 상신문서 중 선택할 수 있습니다.'};
      if (!S.a) return chatNotReady();
      const queue = a.queue, label = labels[queue];
      return {ok: true, text: `${label} 목록을 열 준비를 했습니다. 결재·접수·배부·발송은 하지 않습니다.`, cards: [{type: 'confirm', title: `${label} 목록 열기`, risk: 'low', rows: [['대상', label], ['동작', '비서의 목록 화면만 열기'], ['실제 처리', '하지 않음']], confirmLabel: '목록 열기', cancelLabel: '취소', onConfirm: async () => {
        if (!S.a) return chatNotReady();
        if (go('approval') === false) return {ok: false, text: '작성 중인 화면이 있어 이동하지 않았습니다.'};
        S.apTab = queue; S.apTabPinned = true; renderMain();
        return {ok: true, text: `${label} 목록 화면을 열었습니다. 문서 처리나 발송은 하지 않았습니다.`};
      }}]};
    },
  });

  chatRegisterTool({
    name: 'prepare_task_screen', label: '업무 항목 상세 확인 준비', kind: 'act',
    description: '할 일의 정확한 itemId 또는 제목으로 대상을 찾아 비서 상세 패널을 열 준비를 한다. 여러 항목이 일치하면 선택지를 보여 주며 자동 선택하지 않는다. 그룹웨어 원문은 열지 않고 결재·접수·배부·발송하지 않는다.',
    params: {type: 'object', properties: {itemId: {type: 'string'}, query: {type: 'string'}, area: {type: 'string', enum: ['결재', '메일', '근태', '공지']}}},
    run: async a => {
      if (!S.a || !Array.isArray(S.a.actions)) return chatNotReady();
      const id = typeof a.itemId === 'string' ? a.itemId.trim() : '';
      const q = typeof a.query === 'string' ? a.query.trim().replace(/\s+/g, '').toLocaleLowerCase() : '';
      const areas = ['결재', '메일', '근태', '공지'];
      if (a.area && !areas.includes(a.area)) return {ok: false, text: '업무 구분을 알 수 없습니다.'};
      if (!id && !q) return {ok: false, text: '확인할 항목의 제목 또는 목록에서 받은 항목 ID를 알려 주세요.'};
      let candidates = visibleActions().filter(x => !a.area || x.area === a.area);
      if (id) candidates = candidates.filter(x => x.key === id);
      else candidates = candidates.filter(x => String(x.title || '').replace(/\s+/g, '').toLocaleLowerCase().includes(q));
      if (!candidates.length) return {ok: false, text: '일치하는 항목을 찾지 못했습니다. 제목이나 항목 ID를 확인해 주세요.'};
      if (candidates.length > 1) return {ok: false, text: `일치하는 항목이 ${candidates.length}건입니다. 목록에서 항목을 고르거나 더 구체적인 제목을 알려 주세요.`, cards: [{type: 'list', title: '일치하는 업무', items: candidates.slice(0, 10).map(chatTaskItem), more: Math.max(0, candidates.length - 10)}]};
      const x = candidates[0], key = x.key, originalTitle = x.title, area = x.area, title = x.title || '(제목 없음)';
      return {ok: true, text: `“${title}”의 상세 확인을 준비했습니다. 원문 열기나 실제 처리는 하지 않습니다.`, cards: [{type: 'confirm', title: '업무 상세 확인', risk: 'low', rows: [['항목', title], ['구분', x.area || '업무'], ['동작', '비서 상세 패널만 열기'], ['원문 및 실제 처리', '열거나 실행하지 않음']], confirmLabel: '상세 확인', cancelLabel: '취소', onConfirm: async () => {
        const current = S.a && visibleActions().find(t => t.key === key);
        if (!current || current.title !== originalTitle || current.area !== area) return {ok: false, text: '항목이 변경되었거나 목록에서 사라졌습니다. 다시 찾아 주세요.'};
        if (go('today') === false) return {ok: false, text: '작성 중인 화면이 있어 이동하지 않았습니다.'};
        if (!(S.sel && S.sel.type === 'action' && S.sel.key === key)) selectAction(key);
        if (!(S.sel && S.sel.type === 'action' && S.sel.key === key)) return {ok: false, text: '상세 패널을 열지 못했습니다. 작성 중인 화면을 확인해 주세요.'};
        return {ok: true, text: `“${title}”의 비서 상세 패널을 열었습니다. 그룹웨어 원문과 실제 처리 버튼은 열거나 실행하지 않았습니다.`};
      }}]};
    },
  });
