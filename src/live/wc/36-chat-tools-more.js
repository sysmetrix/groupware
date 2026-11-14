// GW 비서 · 채팅 도구(조회 확대, v0.65): 연차 현황, 근무시간, 메일 목록, 결재함 내용, 공지, 알림, 부서 참고, 내 신청 현황, 예산 과목 검색, 자료 상태·새로 고침, 브리핑, 기능 안내
// 원칙은 32번 조각과 같다. 이미 읽어 둔 자료(S.raw, S.a)를 쓰고, 읽지 못한 자료는 0건으로 단정하지 않고 "확인 불가"로 답한다.
// 메일 제목·발신자·직원 이름은 화면(text, cards)에만 쓰고 외부 AI용 `llm`에는 건수만 넣는다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const chatModuleOk = k => !!(S.raw && !S.error && !S.raw.sessionExpired && S.raw.data && S.raw.data[k] && !(S.raw.status && S.raw.status[k] && (S.raw.status[k].ok === false || S.raw.status[k].error)));
  const chatMd8 = d8 => (/^\d{8}/.test(String(d8 || '')) ? chatMd(ymd8(String(d8).slice(0, 8))) : '');
  const chatSpan8 = (a, b) => chatMd8(a) + (b && b !== a ? '~' + chatMd8(b) : '');
  const chatHm4 = v => { const g = String(v || '').replace(/\D/g, ''), s = g.length >= 12 ? g.slice(8, 12) : g.slice(0, 4); return s.length === 4 && s !== '0000' ? `${s.slice(0, 2)}:${s.slice(2)}` : ''; };
  const chatMin = n => { const m = Math.max(0, Math.round(Number(n) || 0)); return `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}`; };
  const chatCut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const chatLim = (v, d, max) => Math.min(Math.max(Math.floor(Number(v)) || d, 1), max);

  chatRegisterTool({
    name: 'get_leave_status', label: '연차 현황 확인', kind: 'read',
    description: '내 연차·휴가 현황: 올해 받은 일수, 쓴 일수, 남은 일수, 결재 중인 일수, 앞으로 예정된 휴가, 최근 사용 내역. 다른 직원의 연차는 다루지 않는다.',
    params: {type: 'object', properties: {history: {type: 'number'}}},
    run: async a => {
      if (!S.raw) return chatNotReady();
      const lv = S.raw.data && S.raw.data.leave, nav = {type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'};
      if (!chatModuleOk('leave') || !Number.isFinite(Number(lv.remaining))) return {ok: false, text: '연차 자료를 읽지 못해 현황을 확인할 수 없습니다. “새로 고침해줘”라고 한 뒤 다시 물어봐 주세요.', cards: [nav]};
      const b = lv.breakdown || {}, t8 = today().replace(/-/g, ''), n = chatLim(a.history, 5, 12);
      const row = u => ({title: `${chatSpan8(u.start, u.end)} ${u.kind || '휴가'}`, sub: [fmtDays(u.days), chatHm4(u.startTime) && chatHm4(u.endTime) ? `${chatHm4(u.startTime)}~${chatHm4(u.endTime)}` : ''].filter(Boolean).join(' · '), badge: u.approved ? '승인' : '결재 중', tone: u.approved ? 'ok' : 'todo'});
      const up = (Array.isArray(lv.upcoming) ? lv.upcoming : []), past = (Array.isArray(lv.history) ? lv.history : []).filter(u => String(u.end || '') < t8).slice(0, n);
      const text = `${lv.year || ''}년 남은 연차는 ${fmtDays(lv.remaining)}입니다. 받은 ${fmtDays(lv.granted)} 가운데 ${fmtDays(lv.used)}을 썼습니다${Number(b.inApproval) > 0 ? `(결재 중 ${fmtDays(b.inApproval)} 포함)` : ''}.\n${up.length ? `앞으로 예정된 휴가는 ${up.length}건입니다.` : '앞으로 예정된 휴가 신청은 없습니다.'}`;
      return {ok: true, text, data: {year: lv.year, remaining: fmtDays(lv.remaining), granted: fmtDays(lv.granted), used: fmtDays(lv.used), in_approval: fmtDays(b.inApproval || 0), upcoming: up.length, used_count: lv.usedCount || 0},
        cards: [{type: 'kpi', items: [{label: '남은 연차', value: fmtDays(lv.remaining), tone: 'todo'}, {label: '받은 연차', value: fmtDays(lv.granted), tone: 'info'}, {label: '쓴 연차', value: fmtDays(lv.used), tone: 'info'}]},
          ...(up.length ? [{type: 'list', title: '예정된 휴가', items: up.slice(0, 8).map(row), more: Math.max(0, up.length - 8)}] : []),
          ...(past.length ? [{type: 'list', title: `최근 사용 ${past.length}건`, items: past.map(row), more: Math.max(0, (lv.usedCount || past.length) - past.length)}] : []), nav]};
    },
  });

  chatRegisterTool({
    name: 'get_work_hours', label: '근무시간 확인', kind: 'read',
    description: '오늘 내 출근·퇴근 지문 시각과 이번 달 인정 근무시간(기본·시간외·야간)을 알려준다. 다른 직원의 기록은 다루지 않는다.',
    params: {type: 'object', properties: {}},
    run: async () => {
      if (!S.raw) return chatNotReady();
      const at = S.raw.data && S.raw.data.attendance, nav = {type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'};
      if (!chatModuleOk('attendance')) return {ok: false, text: '근태 자료를 읽지 못해 근무시간을 확인할 수 없습니다.', cards: [nav]};
      const td = at.today || {}, mo = at.month || {}, bits = [];
      if (td.error) bits.push('오늘 출퇴근 기록은 읽지 못했습니다.');
      else bits.push(`오늘 출근 ${chatHm4(td.come) || '기록 없음'}, 퇴근 ${chatHm4(td.leave) || '기록 없음'}입니다.`);
      const monthOk = !mo.error && mo.recognizedMin !== null && mo.recognizedMin !== undefined;
      const mLabel = /^\d{6}/.test(String(mo.from || '')) ? `${Number(String(mo.from).slice(4, 6))}월` : '이번 달';
      bits.push(monthOk ? `${mLabel} 인정 근무시간은 ${chatMin(mo.recognizedMin)}입니다(기본 ${chatMin(mo.basicMin)}, 시간외 ${chatMin(mo.overtimeMin)}, 야간 ${chatMin(mo.nightMin)}).` : `${mLabel} 근무시간 집계는 읽지 못했습니다.`);
      bits.push('기록 없음은 지문 기록이 조회되지 않았다는 뜻이며 근태 이상 판정이 아닙니다.');
      return {ok: true, text: bits.join('\n'), data: {month_recognized: monthOk ? chatMin(mo.recognizedMin) : '', month_overtime: monthOk ? chatMin(mo.overtimeMin) : '', today_recorded: !!(chatHm4(td.come) || chatHm4(td.leave))},
        cards: [...(monthOk ? [{type: 'kpi', items: [{label: `${mLabel} 인정 근무`, value: chatMin(mo.recognizedMin), tone: 'info'}, {label: '시간외', value: chatMin(mo.overtimeMin), tone: Number(mo.overtimeMin) ? 'todo' : 'info'}, {label: '오늘 출근', value: td.error ? '확인 불가' : chatHm4(td.come) || '기록 없음', tone: 'info'}, {label: '오늘 퇴근', value: td.error ? '확인 불가' : chatHm4(td.leave) || '기록 없음', tone: 'info'}]}] : []), nav]};
    },
  });

  chatRegisterTool({
    name: 'list_mail', label: '메일 목록 확인', kind: 'read',
    description: '받은 메일 목록(제목·보낸 사람·받은 시각). filter: unread(안 읽음) | today(오늘 받은) | attach(첨부 있음) | recent(최근). from으로 보낸 사람 이름을 좁힐 수 있다. 본문은 보여주지 않는다.',
    params: {type: 'object', properties: {filter: {type: 'string', enum: ['unread', 'today', 'attach', 'recent']}, from: {type: 'string'}, limit: {type: 'number'}}},
    run: async a => {
      if (!S.raw) return chatNotReady();
      const md = S.raw.data && S.raw.data.mail, nav = {type: 'nav', label: '메일 화면 열기', view: 'mail'};
      if (!chatModuleOk('mail') || !md.inbox || !Array.isArray(md.inbox.records)) return {ok: false, text: '메일 자료를 읽지 못해 목록을 확인할 수 없습니다.', cards: [nav]};
      const filter = ['unread', 'today', 'attach', 'recent'].includes(a.filter) ? a.filter : 'recent', lim = chatLim(a.limit, 8, 15), t = today();
      const seen = new Set();
      let list = [...md.inbox.records, ...(Array.isArray(md.otherUnseen) ? md.otherUnseen : [])].filter(m => { const k = m.box + '|' + m.uid; if (seen.has(k)) return false; seen.add(k); return true; });
      if (filter === 'unread') list = list.filter(m => !m.seen);
      else if (filter === 'today') list = list.filter(m => String(m.date || '').startsWith(t));
      else if (filter === 'attach') list = list.filter(m => m.attach);
      else list = list.filter(m => m.box === 'INBOX');
      const who = String(a.from || '').replace(/\s+/g, '');
      if (who) list = list.filter(m => String(m.from || '').replace(/\s+/g, '').includes(who) || String(m.fromEmail || '').includes(who));
      list.sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
      const label = {unread: '안 읽은 메일', today: '오늘 받은 메일', attach: '첨부가 있는 메일', recent: '최근 받은 메일'}[filter];
      const scope = `받은편지함 최근 ${md.inbox.fetched}통${filter === 'unread' ? '과 다른 편지함의 안 읽은 메일' : ''} 안에서 확인했습니다.${filter === 'unread' && Number.isFinite(Number(md.inbox.unseen)) ? ` 받은편지함 전체의 안 읽음은 ${md.inbox.unseen}통으로 집계됩니다.` : ''}`;
      const acts = new Map(((S.a && S.a.actions) || []).filter(x => x.ref && x.ref.uid).map(x => [String(x.ref.uid), x.key]));
      if (!list.length) return {ok: true, text: `${who ? `“${who}” ` : ''}${label}이 없습니다.\n${scope}`, llm: `${label} 0건. ${scope}`, data: {count: 0, filter}, cards: [nav]};
      const items = list.slice(0, lim).map(m => ({title: m.subject || '(제목 없음)', sub: [m.from, m.shortDate || String(m.date || '').slice(5, 16), m.attach ? '첨부' : '', m.box && m.box !== 'INBOX' ? m.box : ''].filter(Boolean).join(' · '), badge: m.seen ? (R.isNoiseMail(m) ? '광고성' : '') : '안 읽음', tone: m.seen ? 'info' : 'todo', ...(acts.has(String(m.uid)) ? {act: {act: 'chatOpenItem', v: acts.get(String(m.uid))}} : {})}));
      // 목록의 읽음 상태가 오래되었을 수 있으므로 항상 명시적으로 확인한다.
      const previews = list.slice(0, Math.min(lim, 3)).filter(m => m.uid).map(m => {
        const uid = String(m.uid), subject = String(m.subject || '(제목 없음)'), from = String(m.from || '');
        return {type: 'confirm', title: '메일 본문 확인', risk: 'high', rows: [['제목', subject], ['보낸 사람', from], ['목록상 상태', m.seen === true ? '읽음(현재 상태는 달라졌을 수 있음)' : '안 읽음 또는 확인 불가']],
          warn: '확인하면 이 메일이 읽음으로 바뀔 수 있습니다. 본문은 외부 AI에 보내지 않습니다.', confirmLabel: '읽음 변경에 동의하고 확인', cancelLabel: '취소',
          onConfirm: async () => {
            try {
              const r = await GW.mailDetail({uid, seen: false, allowMarkRead: true});
              const body = String(r && r.text || '').trim();
              if (!body) return {ok: true, text: '메일 상세를 조회했습니다. 표시 가능한 텍스트 본문은 없습니다(읽음 상태가 변경됐을 수 있습니다).'};
              return {ok: true, text: '메일 본문을 아래에 표시합니다(읽음 상태가 변경됐을 수 있습니다).', cards: [{type: 'note', tone: 'info', sensitive: true, text: '메일 텍스트 본문(최대 4,000자)\n' + body}]};
            } catch { return {ok: false, text: '메일 상세를 조회하지 못했습니다. 요청이 처리되었다면 읽음 상태가 변경됐을 수 있습니다.'}; }
          }};
      });

      return {ok: true, text: `${who ? `“${who}” ` : ''}${label}은 ${list.length}통입니다.${list.length > lim ? ` 최근 ${lim}통만 보여 드립니다.` : ''}\n${scope}`, llm: `${label} ${list.length}통. ${scope}`,
        data: {count: list.length, filter, items: list.slice(0, lim).map(m => ({itemId: acts.get(String(m.uid)) || '', title: m.subject || '', uid: m.uid, type: 'mail'}))},
        cards: [{type: 'list', title: label, items, more: Math.max(0, list.length - lim)}, ...previews, nav]};
    },
  });

  const CHAT_AP_LABEL = {pending: '내가 결재할 문서', deptWaiting: '부서 접수 대기', distWaiting: '배부 대기', sendWaiting: '발송 대기', submitted: '내 상신문서', viewing: '열람문서'};
  chatRegisterTool({
    name: 'list_approvals', label: '결재함 확인', kind: 'read',
    description: '결재·문서유통 목록의 내용을 대화로 보여준다. queue: pending(내가 결재할 문서) | deptWaiting(부서 접수 대기) | distWaiting(배부 대기) | sendWaiting(발송 대기) | submitted(내가 올린 문서와 진행 상태) | viewing(열람문서) | all(전체 건수). 결재·접수·배부는 하지 않는다.',
    params: {type: 'object', properties: {queue: {type: 'string', enum: ['pending', 'deptWaiting', 'distWaiting', 'sendWaiting', 'submitted', 'viewing', 'all']}, limit: {type: 'number'}}},
    run: async a => {
      if (!S.a || !S.raw) return chatNotReady();
      const lists = (S.a.approval && S.a.approval.lists) || {};
      if (!chatModuleOk('approval')) return {ok: false, text: '결재 자료를 읽지 못해 결재함을 확인할 수 없습니다.', cards: [{type: 'nav', label: '결재·문서유통 화면 열기', view: 'approval'}]};
      const queue = a.queue === 'all' || CHAT_AP_LABEL[a.queue] ? a.queue : 'pending', lim = chatLim(a.limit, 8, 15);
      const cnt = k => { const l = lists[k]; return !l || l.error ? null : (Number.isFinite(Number(l.total)) ? Number(l.total) : (l.docs || []).length); };
      const inProg = Array.isArray(S.a.approval.inProgress) ? S.a.approval.inProgress : [];
      if (queue === 'all') {
        const keys = Object.keys(CHAT_AP_LABEL), failed = keys.filter(k => cnt(k) === null);
        const text = `내가 결재할 문서 ${cnt('pending') ?? '확인 불가'}건, 내가 올려 결재 진행 중인 문서 ${lists.submitted && !lists.submitted.error ? '조회분 ' + inProg.length : '확인 불가'}건입니다.\n부서 전체 기준으로 접수 대기 ${cnt('deptWaiting') ?? '확인 불가'}건, 배부 대기 ${cnt('distWaiting') ?? '확인 불가'}건, 발송 대기 ${cnt('sendWaiting') ?? '확인 불가'}건입니다.${failed.length ? `\n확인 제한: ${failed.map(k => CHAT_AP_LABEL[k]).join(', ')} 목록을 읽지 못했습니다.` : ''}`;
        return {ok: true, text, data: Object.fromEntries(keys.map(k => [k, cnt(k)])), cards: [{type: 'kpi', items: [{label: '내가 결재할 문서', value: cnt('pending') ?? '–', tone: cnt('pending') ? 'urgent' : 'ok'}, {label: '내 상신 진행 중', value: lists.submitted && !lists.submitted.error ? inProg.length : '–', tone: 'info'}, {label: '부서 접수 대기', value: cnt('deptWaiting') ?? '–', tone: 'info'}, {label: '배부 대기', value: cnt('distWaiting') ?? '–', tone: 'info'}]}, {type: 'nav', label: '결재·문서유통 화면 열기', view: 'approval'}]};
      }
      const l = lists[queue], label = CHAT_AP_LABEL[queue], nav = {type: 'nav', label: `${label} 목록 화면 열기`, view: 'approval', v: queue};
      if (!l || l.error) return {ok: false, text: `${label} 목록을 읽지 못했습니다. 0건이라는 뜻이 아니니 결재 화면에서 확인해 주세요.`, cards: [nav]};
      let docs = l.docs || [], head;
      const total = cnt(queue), partial = total > docs.length ? ` 최근 ${docs.length}건만 읽었습니다.` : '';
      if (queue === 'submitted') {
        const stalled = R.stalledSubmitted(inProg, new Date());
        head = `조회된 내가 올린 문서 가운데 결재가 진행 중인 것은 ${inProg.length}건입니다${stalled.length ? `(이 중 ${stalled.length}건은 이틀 넘게 멈춰 있습니다)` : ''}. 조회 기간의 상신문서는 모두 ${total}건입니다.${partial}`;
        const ids = new Set(inProg.map(d => d.docId)); docs = [...inProg, ...docs.filter(d => !ids.has(d.docId))];
      } else if (queue === 'pending') head = total ? `내가 결재할 문서는 ${total}건입니다.${partial}` : `내가 결재할 문서는 없습니다. 내가 올려 결재를 기다리는 문서는 ${lists.submitted && !lists.submitted.error ? inProg.length + '건' : '확인 불가'}입니다.`;
      else if (queue === 'viewing') { const un = docs.filter(d => d.unread).length; head = `열람문서는 ${total}건이고, 읽은 범위에서 안 읽은 것은 ${un}건입니다.${partial}`; docs = [...docs.filter(d => d.unread), ...docs.filter(d => !d.unread)]; }
      else head = `${label}는 부서 전체 기준 ${total}건입니다.${partial}`;
      const scope = l.from && l.to ? `\n조회 기간: ${ymd8(String(l.from))} ~ ${ymd8(String(l.to))}` : '';
      if (!docs.length) return {ok: true, text: head + scope, data: {queue, count: total, items: []}, cards: [nav]};
      const items = docs.slice(0, lim).map(d => ({title: d.title || '(제목 없음)', sub: [d.sender || d.drafterDept || d.drafter, d.docNo, String(d.date || '').slice(0, 10)].filter(Boolean).join(' · '), badge: chatCut(d.status, 14), tone: /반려/.test(d.status || '') ? 'urgent' : inProg.some(p => p.docId === d.docId) ? 'todo' : 'info', ...(d.url ? {act: {act: 'chatOpenUrl', v: d.url}} : {})}));
      return {ok: true, text: head + scope, llm: head, data: {queue, count: total, shown: items.length, items: docs.slice(0, lim).map(d => ({itemId: '', title: d.title || '', url: d.url || '', type: 'doc'}))}, cards: [{type: 'list', title: label, items, more: Math.max(0, total - items.length)}, nav]};
    },
  });

  chatRegisterTool({
    name: 'list_notices', label: '공지 확인', kind: 'read',
    description: '사내 공지 게시판의 최근 글 또는 안 읽은 글 제목을 보여준다. unread=true면 안 읽은 글만.',
    params: {type: 'object', properties: {unread: {type: 'boolean'}, limit: {type: 'number'}}},
    run: async a => {
      if (!S.a || !S.raw) return chatNotReady();
      const nt = S.a.notice || {}, raw = S.raw.data && S.raw.data.notice, nav = {type: 'nav', label: '할 일 목록에서 공지 보기', view: 'today'};
      if (!chatModuleOk('notice')) return {ok: false, text: '공지 자료를 읽지 못해 확인할 수 없습니다.', cards: [nav]};
      const lim = chatLim(a.limit, 8, 12), unreadList = Array.isArray(nt.unread) ? nt.unread : [];
      const list = a.unread === true ? unreadList : (Array.isArray(nt.recent) ? nt.recent : []);
      const unreadN = Number.isFinite(Number(raw.unread)) ? Number(raw.unread) : unreadList.length;
      const head = a.unread === true ? `안 읽은 공지는 ${unreadN}건입니다.${unreadN > list.length ? ` 최근 ${raw.fetched}건 안에서는 ${list.length}건이 보입니다.` : ''}` : `최근 공지 ${list.length}건입니다. 안 읽은 공지는 ${unreadN}건입니다.`;
      if (!list.length) return {ok: true, text: head, data: {count: 0, unread: unreadN}, cards: []};
      return {ok: true, text: head + '\n제목을 누르거나 “2번 열어줘”라고 하면 원문을 엽니다(열면 읽음으로 바뀝니다).', llm: head, data: {count: list.length, unread: unreadN, items: list.slice(0, lim).map(x => ({itemId: '', title: x.title || '', url: x.url || '', type: 'board'}))},
        cards: [{type: 'list', title: a.unread === true ? '안 읽은 공지' : '최근 공지', items: list.slice(0, lim).map((x, i) => ({title: `${i + 1}. ${x.title || '(제목 없음)'}`, sub: [x.writer, x.dept, String(x.date || '').slice(0, 10), x.files ? `첨부 ${x.files}` : ''].filter(Boolean).join(' · '), badge: x.read ? (x.top ? '상단 고정' : '') : '안 읽음', tone: x.read ? 'info' : 'todo', ...(x.url ? {act: {act: 'chatOpenUrl', v: x.url}} : {})})), more: Math.max(0, list.length - lim)}]};
    },
  });

  chatRegisterTool({
    name: 'list_alerts', label: '알림 확인', kind: 'read',
    description: '그룹웨어 알림(결재·게시판·메일 등 종 모양 알림)의 최근 내역. unread=true면 안 읽은 알림만.',
    params: {type: 'object', properties: {unread: {type: 'boolean'}, limit: {type: 'number'}}},
    run: async a => {
      if (!S.a || !S.raw) return chatNotReady();
      if (!chatModuleOk('alerts')) return {ok: false, text: '알림 자료를 읽지 못해 확인할 수 없습니다.'};
      const all = Array.isArray(S.a.alerts) ? S.a.alerts : [], un = all.filter(x => !x.read), lim = chatLim(a.limit, 8, 15);
      const list = a.unread === true ? un : [...un, ...all.filter(x => x.read)];
      const tm = s => { const g = String(s || '').replace(/\D/g, ''); return g.length >= 12 ? `${Number(g.slice(4, 6))}/${Number(g.slice(6, 8))} ${g.slice(8, 10)}:${g.slice(10, 12)}` : ''; };
      const head = `최근 알림 ${all.length}건 가운데 안 읽은 것은 ${un.length}건입니다.`;
      if (!list.length) return {ok: true, text: head, data: {count: all.length, unread: un.length}};
      return {ok: true, text: head, data: {count: all.length, unread: un.length}, cards: [{type: 'list', title: a.unread === true ? '안 읽은 알림' : '최근 알림', items: list.slice(0, lim).map(x => ({title: x.title || x.head || '(내용 없음)', sub: [chatCut(x.head, 40), x.dept, tm(x.time)].filter(Boolean).join(' · '), badge: x.read ? '' : '새 알림', tone: x.read ? 'info' : 'todo'})), more: Math.max(0, list.length - lim)}]};
    },
  });

  chatRegisterTool({
    name: 'list_reference', label: '부서 참고 확인', kind: 'read',
    description: '내 담당은 아니지만 부서에 도착한 참고 공문·문서 목록(부서 참고).',
    params: {type: 'object', properties: {limit: {type: 'number'}}},
    run: async a => {
      if (!S.a) return chatNotReady();
      const list = visibleActions().filter(x => !isMine(x)), lim = chatLim(a.limit, 8, 15), nav = {type: 'nav', label: '부서 참고 목록 열기', view: 'today', v: 'ref'};
      if (!list.length) return {ok: true, text: '부서 참고 문서가 없습니다.', data: {count: 0, items: []}, cards: []};
      return {ok: true, text: `부서 참고 문서는 ${list.length}건입니다. 내가 처리할 일로 분류되지 않은 참고용입니다.`, data: {count: list.length, items: list.slice(0, lim).map(x => ({itemId: x.key, title: x.title, area: x.area}))}, cards: [{type: 'list', title: '부서 참고', items: list.slice(0, lim).map(chatTaskItem), more: Math.max(0, list.length - lim)}, nav]};
    },
  });

  chatRegisterTool({
    name: 'list_my_requests', label: '내 신청 현황 확인', kind: 'read',
    description: '내가 올린 휴가·출장·교육·시간외 근무 신청과 승인 상태(신청일 기준 최근 150일). 다른 직원의 신청은 다루지 않는다.',
    params: {type: 'object', properties: {limit: {type: 'number'}}},
    run: async a => {
      if (!S.raw) return chatNotReady();
      let dt; try { dt = await loadApps(); } catch (e) { return {ok: false, text: '근태 신청 내역을 읽지 못했습니다: ' + String(e.message || e).slice(0, 80)}; }
      const lim = chatLim(a.limit, 8, 15), t8 = today().replace(/-/g, '');
      const mine = (dt.apps || []).filter(x => String(x.empCd) === String(dt.me) && x.deleteReqYn !== 'Y').sort((x, y) => String(y.startDt).localeCompare(String(x.startDt)));
      const up = mine.filter(x => String(x.endDt || x.startDt) >= t8).reverse(), pend = mine.filter(x => String(x.approState) !== '1');
      const row = x => { const i = R.appInfo(x); return {title: `${chatSpan8(x.startDt, x.endDt)} ${x.atNm || '신청'}`, sub: [i.time, chatCut(i.place, 24), chatCut(i.reason, 32)].filter(Boolean).join(' · '), badge: i.pending ? '승인 전' : '승인', tone: i.pending ? 'todo' : 'ok'}; };
      const head = `최근 150일 동안 올린 근태 신청은 ${mine.length}건이고, 오늘 이후 일정은 ${up.length}건, 아직 승인 전인 신청은 ${pend.length}건입니다.`;
      const cards = [];
      if (up.length) cards.push({type: 'list', title: '오늘 이후 일정', items: up.slice(0, lim).map(row), more: Math.max(0, up.length - lim)});
      const past = mine.filter(x => String(x.endDt || x.startDt) < t8);
      if (past.length) cards.push({type: 'list', title: '지난 신청', items: past.slice(0, 5).map(row), more: Math.max(0, past.length - 5)});
      cards.push({type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'});
      return {ok: true, text: head + '\n신청서를 준비만 하고 제출하지 않은 것은 그룹웨어에 기록이 없어 여기에 나오지 않습니다.', llm: head, data: {count: mine.length, upcoming: up.length, pending: pend.length}, cards};
    },
  });

  chatRegisterTool({
    name: 'search_budget', label: '예산 과목 찾기', kind: 'read',
    description: '재단 전체 사업에서 예산 과목을 이름으로 찾아 예산·집행·잔액·집행률을 알려준다. 예) 출장비, 사무용품, A201 홍보.',
    params: {type: 'object', properties: {query: {type: 'string'}}, required: ['query']},
    run: async a => {
      const q = String(a.query || '').replace(/(예산|집행률?|잔액|현황|얼마나?|남았어?|남은|어때|알려\s*줘|보여\s*줘|확인|해\s*줘|좀|[?？])/g, ' ').replace(/\s+/g, ' ').trim();
      const nav = {type: 'nav', label: '예산 집행 화면 열기', view: 'budget'};
      if (q.length < 2) return {ok: false, text: '찾을 사업이나 예산 과목 이름을 알려 주세요. 예) 출장비 잔액 알려줘', cards: [nav]};
      if (!GW.budgetAll) return {ok: false, text: '전체 사업 예산 조회를 쓸 수 없습니다.', cards: [nav]};
      let all; try { all = await GW.budgetAll({}); } catch (e) { return {ok: false, text: '전체 사업 예산을 읽지 못했습니다: ' + String(e.message || e).slice(0, 80), cards: [nav]}; }
      const res = R.searchBudget(R.budgetRecords(all), q, {max: 8}), failed = (all.projects || []).filter(p => p.error).length;
      const limit = failed ? `\n확인 제한: 사업 ${failed}개는 읽지 못해 결과에서 빠졌을 수 있습니다.` : '';
      if (!res.rows.length) return {ok: true, text: `“${q}”에 해당하는 예산 과목을 찾지 못했습니다. 과목 이름의 일부나 사업 코드로 다시 물어봐 주세요.${limit}`, data: {count: 0}, cards: [nav]};
      const top = res.rows[0];
      const line = r => `${r.name}: 예산 ${won(r.budget)}원 · 집행 ${won(r.executed)}원(${pct(r.rate)}) · 잔액 ${won(r.balance)}원`;
      return {ok: true, text: `“${q}” 과목은 ${res.total}건 찾았습니다${res.mode === 'any' ? '(일부 단어만 일치)' : ''}.${res.total === 1 ? ` ${top.projectName || top.project}의 ${line(top)}입니다.` : ' 여러 사업이 일치합니다. 아래 목록에서 사업과 과목을 확인해 주세요.'}${limit}`,
        data: {count: res.total, items: res.rows.map(r => ({project: r.projectName || r.project, name: r.name, level: r.level, budget: r.budget, executed: r.executed, balance: r.balance, rate: r.rate}))},
        cards: [{type: 'list', title: '예산 과목', items: res.rows.map(r => ({title: `${r.name} (${r.level})`, sub: [r.projectName || r.project, ...r.trail.slice(-2)].filter(Boolean).join(' › ') + ` · 집행 ${won(r.executed)}원 / 잔액 ${won(r.balance)}원`, badge: r.empty ? '미사용' : pct(r.rate), tone: 'info'})), more: Math.max(0, res.total - res.rows.length)}, nav]};
    },
  });

  const CHAT_SRC_NAME = {mail: '메일', approval: '결재·문서유통', notice: '공지', schedule: '일정', attendance: '근태', leave: '연차', budget: '예산', alerts: '알림'};
  function chatDataStatus(prefix = '') {
    if (!S.raw) return chatNotReady();
    const d = S.raw.data || {}, ms = Date.parse(S.raw.collectedAt || ''), at = Number.isFinite(ms) ? new Date(ms + 9 * 3600000).toISOString().slice(11, 16) : '';
    const scopeOf = {mail: () => d.mail && d.mail.inbox ? `받은편지함 최근 ${d.mail.inbox.fetched}통 / 전체 ${d.mail.inbox.total}통` : '', approval: () => d.approval ? Object.values(d.approval.lists || {}).filter(l => l && !l.error).map(l => `${l.label} ${l.fetched}/${l.total ?? l.fetched}`).join(', ') : '', notice: () => d.notice ? `최근 ${d.notice.fetched}건 / 전체 ${d.notice.total}건` : '', schedule: () => d.schedule ? `${ymd8(String(d.schedule.start))} ~ ${ymd8(String(d.schedule.end))}` : '', attendance: () => d.attendance ? '이번 달과 최근 30일 지문, 신청 150일' : '', leave: () => d.leave ? `${d.leave.year}년` : '', budget: () => d.budget ? (d.budget.skipped ? '관심 사업 없음' : `관심 사업 ${(d.budget.projects || []).length}개`) : '', alerts: () => d.alerts ? `최근 ${(d.alerts.alerts || []).length}건` : ''};
    const rows = Object.keys(CHAT_SRC_NAME).map(k => { const ok = chatModuleOk(k), listErr = k === 'approval' && ok ? Object.values(d.approval.lists || {}).filter(l => l && l.error).map(l => l.label) : []; return {k, ok, part: listErr.length > 0, sub: !ok ? '읽지 못했습니다' : (scopeOf[k]() || '') + (listErr.length ? ` · 읽지 못한 목록: ${listErr.join(', ')}` : '')}; });
    const bad = rows.filter(r => !r.ok), part = rows.filter(r => r.ok && r.part);
    const text = `${prefix}자료는 ${at ? at + ' 기준' : '수집 시각 확인 불가'}입니다. ${rows.length}개 영역 가운데 ${rows.length - bad.length}개를 읽었습니다${bad.length ? `. 읽지 못한 영역: ${bad.map(r => CHAT_SRC_NAME[r.k]).join(', ')}` : ''}${part.length ? `. 일부만 읽은 영역: ${part.map(r => CHAT_SRC_NAME[r.k]).join(', ')}` : ''}.${S.raw.sessionExpired ? '\n그룹웨어 로그인이 만료된 것으로 보입니다. 그룹웨어에 다시 로그인해 주세요.' : ''}\n구글 캘린더 일정과 메일·문서 본문은 수집 대상이 아닙니다.`;
    return {ok: true, text, data: {collected_at: at, ok: rows.length - bad.length, failed: bad.map(r => r.k)}, cards: [{type: 'list', title: '영역별 수집 범위', items: rows.map(r => ({title: CHAT_SRC_NAME[r.k], sub: r.sub, badge: !r.ok ? '실패' : r.part ? '일부' : '정상', tone: !r.ok ? 'urgent' : r.part ? 'todo' : 'ok'}))}]};
  }
  chatRegisterTool({name: 'get_data_status', label: '자료 상태 확인', kind: 'read', description: '비서가 그룹웨어에서 읽어 둔 자료의 기준 시각, 영역별 수집 범위, 읽지 못한 영역을 알려준다.', params: {type: 'object', properties: {}}, run: async () => chatDataStatus()});
  chatRegisterTool({
    name: 'refresh_data', label: '자료 새로 고침', kind: 'read',
    description: '그룹웨어 자료를 지금 다시 읽는다(읽기 전용). 끝나면 기준 시각과 수집 상태를 알려준다.',
    params: {type: 'object', properties: {}},
    run: async () => {
      if (S.loading) await chatWait(() => !S.loading, 20000);
      else await refresh({silent: true});
      if (S.error) return {ok: false, text: '자료를 다시 읽지 못했습니다: ' + String(S.error).slice(0, 100)};
      return chatDataStatus('새로 읽었습니다. ');
    },
  });

  // 브리핑: 다른 조회 도구의 결과를 한 번에 묶는다(새 자료를 만들지 않는다).
  const chatRunTool = async (name, args) => { try { const t = CHAT_TOOLS.get(name); return t ? await t.run(args || {}, {S, now: new Date(), userText: '', viaAi: false}) : null; } catch (e) { logError('brief.' + name, e.message); return null; } };
  chatRegisterTool({
    name: 'run_briefing', label: '브리핑 준비', kind: 'read',
    description: '여러 자료를 한 번에 묶은 브리핑. kind: morning(오늘 할 일·기한·일정·부재·메일·결재) | evening(퇴근 전 점검: 남은 일, 시간외 지문 알림, 다음 평일 일정) | week(7일간 일정과 기한).',
    params: {type: 'object', properties: {kind: {type: 'string', enum: ['morning', 'evening', 'week']}}},
    run: async a => {
      const d = homeData();
      if (!d.loaded) return chatNotReady();
      const kind = ['morning', 'evening', 'week'].includes(a.kind) ? a.kind : 'morning', t = today();
      const day = R.homeDayInfo({date: t, holidays: (S.raw.data.schedule && S.raw.data.schedule.holidays) || []});
      const total = d.urgent + d.todo + d.check, teamGap = !!(d.teamLoading || d.teamError || d.teamUnknown), lines = [], cards = [];
      const top = d.mine.slice(0, 3), sum = (S.a && S.a.summary) || {};
      const dl = (await chatRunTool('list_deadlines', {days: 7})) || {}, dlN = dl.data ? dl.data.count : null;
      if (kind === 'week') {
        const sc = await chatRunTool('get_schedule', {date: t, days: 7});
        lines.push(`${chatMd(t)}부터 7일간 브리핑입니다.`, `• 처리·확인할 일 ${total}건(급한 일 ${d.urgent}건)`, `• 7일 안에 닿는 기한 ${dlN ?? '확인 불가'}건`, sc ? '• ' + String(sc.text || '').split('\n')[0] : '• 일정은 확인하지 못했습니다');
        cards.push(...((dl.cards) || []), ...((sc && sc.cards) || []));
      } else if (kind === 'evening') {
        const t8 = t.replace(/-/g, ''), tm = (S.team || {})[t8.slice(0, 6)];
        const ot = !teamGap && tm && tm.cal ? (tm.cal.byDate[t8] || []).find(x => x.mine && x.kind === 'ot') : null;
        lines.push(`${day.label} 퇴근 전 점검입니다.`, total ? `• 아직 남은 처리·확인할 일 ${total}건${d.urgent ? `(급한 일 ${d.urgent}건)` : ''}` : '• 남은 처리·확인할 일이 없습니다');
        lines.push(teamGap ? '• 시간외 근무 신청 여부는 근태 자료를 읽지 못해 확인할 수 없습니다' : ot ? `• 오늘 시간외 근무 신청${ot.time ? `(${ot.time})` : ''}이 있습니다. 퇴근 전 지문을 찍어 주세요` : '• 오늘 시간외 근무 신청은 조회되지 않습니다');
        if (day.next) { const sc = await chatRunTool('get_schedule', {date: day.next, days: 1}); lines.push(sc ? `• 다음 평일 ${String(sc.text || '').split('\n')[0]}` : `• 다음 평일 ${day.nextLabel} 일정은 확인하지 못했습니다`); cards.push(...((sc && sc.cards) || [])); }
        if (top.length) cards.unshift({type: 'list', title: '남은 일', items: top.map(chatTaskItem), more: Math.max(0, total - top.length)});
      } else {
        const b = R.homeBriefing({urgent: d.urgent, total, weekend: day.weekend, nextLabel: day.nextLabel, gaps: d.taskGaps});
        lines.push(`${day.label} 브리핑입니다. ${b.lead}`);
        lines.push(`• 7일 안에 닿는 기한 ${dlN ?? '확인 불가'}건`, `• 오늘 일정 ${d.scheduleUnknown ? '확인 불가' : d.events.length + '건'}, 부서 자리 비움 ${teamGap ? '확인 불가' : d.away.length + '명'}`);
        lines.push(`• 안 읽은 메일 ${d.unread == null ? '확인 불가' : '조회분 ' + d.unread + '건'}, 내가 결재할 문서 ${sum.pending ?? '확인 불가'}건, 기다리는 중 ${d.wait}건`);
        if (d.leave) lines.push(`• 남은 연차 ${d.leave}`);
        if (top.length) cards.push({type: 'list', title: '먼저 볼 일', items: top.map(chatTaskItem), more: Math.max(0, total - top.length)});
        if (d.timeline.length) cards.push({type: 'timeline', title: '오늘 일정', items: R.homeTimelineCompact(d.timeline, 6).rows});
        cards.push(...((dl.cards) || []));
      }
      if (d.taskGaps) lines.push('확인 제한: 일부 자료를 읽지 못해 확인된 범위만 알려 드립니다.');
      return {ok: true, text: lines.join('\n'), llm: lines.join(' '), data: {kind, urgent: d.urgent, total, deadlines_7d: dlN, events_today: d.scheduleUnknown ? null : d.events.length, items: top.map(x => ({itemId: x.key, title: x.title, area: x.area}))}, cards: cards.slice(0, 4)};
    },
  });

  const CHAT_CAPS = [
    ['오늘·할 일', ['오늘 요약해줘', '아침 브리핑 해줘', '급한 일 알려줘', '앞으로 2주 마감 기한 알려줘', '퇴근 전 점검해줘']],
    ['메일·결재·공지', ['안 읽은 메일 보여줘', '답장 필요한 메일 있어?', '결재할 문서 있어?', '내가 올린 문서 진행 상황', '새 공지 있어?', '알림 보여줘', '부서 참고 공문 보여줘']],
    ['일정·근태', ['내일 일정 알려줘', '오늘 누가 출장이야?', '연차 현황 알려줘', '내 신청 현황 알려줘', '이번 달 근무시간 알려줘', '차량 예약 가능한 시간']],
    ['예산·문서', ['예산 집행 현황 알려줘', '출장비 잔액 알려줘', '월간업무보고 찾아줘', '이번 주 실적 정리해줘']],
    ['준비해 드리는 일 (제출은 직접)', ['다음 주 월요일 연차 신청해줘', '내일 14시부터 16시까지 차량 예약해줘', '결과보고 작성해줘', '새 메일 쓰기', '첫 번째 끝냄 표시해줘']],
    ['자동화', ['매일 9시에 아침 브리핑 해줘', '평일 17시 30분에 퇴근 전 점검해줘', '자동화 목록 보여줘', '자료 상태 알려줘']],
  ];
  chatRegisterTool({
    name: 'get_capabilities', label: '기능 안내', kind: 'read',
    description: '비서가 할 수 있는 일(조회, 신청·예약 준비, 자동화)과 예시 문장을 안내한다.',
    params: {type: 'object', properties: {}},
    run: async () => ({ok: true, text: '그룹웨어에서 읽을 수 있는 자료는 모두 물어볼 수 있고, 신청·예약·기안은 준비까지 해 드립니다. 제출과 발송은 확인 카드나 그룹웨어 화면에서 직접 눌러야 진행됩니다.\n아래 예시를 누르면 바로 실행합니다.', llm: '조회(할 일, 메일, 결재함, 공지, 알림, 일정, 직원 부재, 연차, 근무시간, 예산, 문서 검색), 준비(휴가·출장·시간외 신청서, 차량 예약, 기안, 메일 답장), 자동화(정해진 시각에 조회 실행)를 지원한다.', cards: CHAT_CAPS.map(([title, qs]) => ({type: 'chips', title, items: qs}))}),
  });

  // ---------- 실행(확인 카드) ----------
  chatRegisterTool({
    name: 'mark_task', label: '할 일 표시 준비', kind: 'act',
    description: '할 일 항목을 끝냄으로 표시(done)하거나 내일 오전 8시까지 미룬다(snooze). GW 비서 목록에서만 바뀌고 그룹웨어 자료는 바꾸지 않는다. 확인 카드에서 눌러야 적용된다. index는 직전 목록의 순서, query는 제목 일부.',
    params: {type: 'object', properties: {action: {type: 'string', enum: ['done', 'snooze']}, index: {type: 'number'}, itemId: {type: 'string'}, query: {type: 'string'}}, required: ['action']},
    run: async a => {
      if (!S.a) return chatNotReady();
      const action = a.action === 'snooze' ? 'snooze' : 'done', list = mineVisible();
      const q = String(a.query || '').replace(/\s+/g, '').toLocaleLowerCase();
      let hit = a.itemId ? list.filter(x => x.key === a.itemId) : a.index ? [list[Number(a.index) - 1]].filter(Boolean) : q.length >= 2 ? list.filter(x => String(x.title || '').replace(/\s+/g, '').toLocaleLowerCase().includes(q)) : [];
      if (!hit.length) return {ok: false, text: '어느 항목인지 찾지 못했습니다. “할 일 보여줘”로 목록을 본 뒤 “2번 끝냄 표시해줘”처럼 말씀해 주세요.', cards: list.length ? [{type: 'list', title: '처리할 일', items: list.slice(0, 6).map((x, i) => ({...chatTaskItem(x), title: `${i + 1}. ${x.title}`}))}] : []};
      if (hit.length > 1) return {ok: false, text: `일치하는 항목이 ${hit.length}건입니다. 더 구체적인 제목이나 번호로 알려 주세요.`, cards: [{type: 'list', title: '일치하는 항목', items: hit.slice(0, 8).map(chatTaskItem)}]};
      const x = hit[0], key = x.key, title = x.title || '(제목 없음)', what = action === 'done' ? '끝냄 표시' : '내일 오전 8시까지 미루기';
      return {ok: true, text: `“${chatCut(title, 40)}”을(를) ${what} 할 준비를 했습니다. 그룹웨어 자료는 바뀌지 않습니다.`, cards: [{type: 'confirm', title: what, risk: 'low', rows: [['항목', title], ['적용 범위', 'GW 비서 목록에서만'], ['되돌리기', '적용 뒤 알림의 [되돌리기] 또는 Ctrl+Z']], confirmLabel: action === 'done' ? '끝냄으로 표시' : '내일로 미루기', cancelLabel: '취소', onConfirm: async () => {
        if (!S.a || !visibleActions().some(t => t.key === key)) return {ok: false, text: '항목이 이미 목록에서 사라졌습니다.'};
        if (action === 'done') markDoneKeys([key]); else snooze([key]);
        return {ok: true, text: action === 'done' ? '끝냄으로 표시했습니다. 그룹웨어에 아직 남아 있으면 다시 보여 드립니다.' : '내일 오전 8시까지 미뤘습니다.'};
      }}]};
    },
  });

  chatRegisterTool({
    name: 'compose_mail', label: '새 메일 작성 준비', kind: 'act',
    description: '새 메일 작성 창을 열 준비를 한다. 내용은 직접 쓰고 [보내기]도 직접 누른다. 받는 사람이나 본문을 대신 채우거나 보내지 않는다.',
    params: {type: 'object', properties: {}},
    run: async () => ({ok: true, text: '새 메일 작성 창을 열 준비를 했습니다. 받는 사람과 내용은 직접 입력하고, 보내기도 직접 눌러야 합니다.', cards: [{type: 'confirm', title: '새 메일 작성 창 열기', risk: 'low', rows: [['동작', '그룹웨어 메일 쓰기 창 열기'], ['보내기', '직접 눌러야 합니다']], confirmLabel: '작성 창 열기', cancelLabel: '취소', onConfirm: async () => (openUrl(GW.links.compose('plain'), {title: '새 메일 쓰기'}) === false ? {ok: false, text: '작성 중인 화면이 있어 열지 않았습니다.'} : {ok: true, text: '메일 작성 창을 열었습니다. 보내기는 직접 눌러 주세요.'})}]}),
  });
