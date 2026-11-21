  // ---------- v0.98.0: 묻는 것에 정확히 답하기 ----------
  // 반차·연차 써도 되는지: 남은 연차, 그날 이미 잡힌 내 휴가·일정, 같은 날 부서 부재, 휴일 여부를 한 번에 본다. 신청은 하지 않는다.
  chatRegisterTool({
    name: 'check_leave_day', label: '휴가 가능 여부 확인', kind: 'read',
    description: '특정 날짜에 연차·반차를 써도 되는지 판단 자료(남은 연차, 그날 내 일정·이미 신청한 휴가, 같은 날 부서 부재, 휴일)를 모아 답한다. 신청은 하지 않는다. amount: full | half | quarter',
    params: {type: 'object', properties: {date: {type: 'string'}, amount: {type: 'string', enum: ['full', 'half', 'quarter']}}},
    run: async a => {
      if (!S.raw) return chatNotReady();
      const t = today(), d0 = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : '';
      // 주말에 "이번 주 금요일"처럼 이미 지난 요일을 말하면 다음 주 같은 요일로 본다
      const past = d0 && d0 < t && Date.parse(t) - Date.parse(d0) < 7 * 864e5, d = past ? new Date(Date.parse(d0) + 7 * 864e5).toISOString().slice(0, 10) : d0;
      if (!d) return {ok: true, text: '언제 쓰실지 날짜를 함께 말씀해 주세요. 예) “다음 주 금요일 반차 써도 돼?”', data: {count: 0}};
      const amt = {half: ['반차', 0.5], quarter: ['반반차', 0.25]}[a.amount] || ['연차', 1], lv = S.raw.data && S.raw.data.leave;
      const day = R.homeDayInfo({date: d, holidays: (S.raw.data.schedule && S.raw.data.schedule.holidays) || []}), dl = chatMd(d);
      if (d < t) return {ok: true, text: `${dl}은 이미 지난 날입니다. 앞으로의 날짜로 다시 말씀해 주세요.`, data: {count: 0}};
      if (day.weekend || day.holiday) return {ok: true, text: `${dl}은 ${day.holiday || '주말'}이라 ${amt[0]}를 쓸 필요가 없습니다.`, data: {count: 0}};
      const out = [], d8 = d.replace(/-/g, '');
      const rem = lv && Number.isFinite(lv.remaining) ? lv.remaining : null;
      out.push(rem == null ? '• 남은 연차: 확인하지 못했습니다' : `• 남은 연차: ${fmtDays(rem)}${rem >= amt[1] ? ` → ${amt[0]}(${fmtDays(amt[1])}) 쓸 수 있습니다` : ` → ${amt[0]}(${fmtDays(amt[1])})에 모자랍니다`}`);
      const dup = (lv && Array.isArray(lv.upcoming) ? lv.upcoming : []).filter(u => String(u.start || '') <= d8 && String(u.end || u.start || '') >= d8);
      if (dup.length) out.push(`• 이미 신청한 휴가: ${dup.map(u => `${u.kind || '휴가'}(${u.approved ? '승인' : '결재 중'})`).join(', ')}`);
      const sc = await chatRunTool('get_schedule', {date: d, days: 1}), its = sc && sc.data && sc.data.days && sc.data.days[0] ? sc.data.days[0].items : [];
      out.push(sc && sc.ok ? (its.length ? `• 그날 내 일정 ${its.length}건: ${its.slice(0, 3).map(i => (i.time ? i.time + ' ' : '') + i.label).join(', ')}` : '• 그날 내 일정: 없음') : '• 그날 내 일정: 확인하지 못했습니다');
      const st = await chatRunTool('get_staff_status', {date: d, days: 1});
      out.push(st && st.ok ? `• 부서 부재: ${st.data && st.data.count === 0 ? '없음' : String(st.text || '').split('\n').slice(1, 4).map(x => x.replace(/^•\s*/, '')).join(', ') || String(st.text || '').split('\n')[0]}` : '• 부서 부재: 확인하지 못했습니다');
      const ok = rem != null && rem >= amt[1] && !dup.length;
      return {ok: true, text: `${past ? `${chatMd(d0)}은 지났으므로 다음 주 같은 요일 기준입니다.\n` : ''}${dl} ${amt[0]} 판단 자료입니다.${ok ? ' 연차는 충분합니다. 일정과 부서 상황을 보고 정하세요.' : ''}\n${out.join('\n')}\n신청은 근태신청 화면에서 직접 하세요(비서는 신청하지 않습니다).`, llm: out.join(' / '), data: {count: out.length, ok}, cards: [{type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'}]};
    },
  });

  // 조직도에 없는 사람(외부 기관)은 받은 메일의 보낸 사람에서 찾는다.
  { const def = CHAT_TOOLS.get('lookup_person'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const r = await run0(a, ctx), nm = String(a.name || '').replace(/\s+/g, '');
    if (!r || !nm || !/찾지 못했/.test(r.text || '')) return r;
    const rows = mailSnapshot().rows.filter(m => String(m.from || '').replace(/[\s"']/g, '').includes(nm)).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
    if (!rows.length) return r;
    const m = rows[0], who = String(m.from || '').replace(/["']/g, '').trim();
    return {ok: true, text: `“${nm}” 님은 재단 조직도에는 없고, 받은 메일의 보낸 사람으로 확인됩니다.\n• ${who}${m.fromEmail ? ` <${m.fromEmail}>` : ''}\n• 최근 메일: ${chatCut(m.subject || '(제목 없음)', 50)} (${String(m.date || '').slice(5, 10).replace('-', '/')})${rows.length > 1 ? ` 외 ${rows.length - 1}통` : ''}\n전화번호는 메일 본문 서명에서 확인하세요.`, llm: `${who}: 재단 조직도에 없음, 받은 메일 ${rows.length}통의 보낸 사람(주소는 화면에만 표시)`, data: {found: true, external: true}};
  }; } }

  // "○○ 메일 첨부파일 이름이 뭐야?" → 그 메일을 찾아 첨부 이름부터 답한다.
  { const def = CHAT_TOOLS.get('read_mail'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const r = await run0(a, ctx);
    if (!a.files || !r || !r.ok) return r;
    const f = cuFocus(), det = f && S.mailDet && S.mailDet[f.uid];
    if (!det || det.error) return r;
    const n = cuFiles(det);
    return {...r, text: n.length ? `첨부는 ${n.length}개입니다.\n${n.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n“그 메일 첨부 내용 정리해줘”라고 하면 내용까지 읽습니다.` : `“${cuCut(f.title, 40)}” 메일에는 첨부가 없습니다.`, cards: []};
  }; } }

  // v0.99.0: 두세 가지 조회를 한 번에("내일 일정이랑 할 일 같이")
  chatRegisterTool({
    name: 'multi_read', label: '여러 가지 함께 확인', kind: 'read',
    description: '서로 다른 조회 2~3개를 차례로 실행해 한 답으로 묶는다. steps: [{tool, args}] — 조회 도구만.',
    params: {type: 'object', properties: {steps: {type: 'array', items: {type: 'object'}}}, required: ['steps']},
    run: async (a, ctx) => {
      const steps = (Array.isArray(a.steps) ? a.steps : []).filter(x => x && CHAT_TOOLS.has(x.tool) && CHAT_TOOLS.get(x.tool).kind === 'read' && x.tool !== 'multi_read').slice(0, 3);
      if (!steps.length) return {ok: false, text: '함께 확인할 조회를 알아보지 못했습니다. 하나씩 말씀해 주세요.'};
      const out = [];
      for (const x of steps) out.push({def: CHAT_TOOLS.get(x.tool), r: await chatRunTool(x.tool, x.args || {}, ctx) || {ok: false, text: '확인하지 못했습니다.'}});
      return {ok: out.some(o => o.r.ok), text: out.map(o => `【${o.def.label}】\n${o.r.text || ''}${o.r.data && Array.isArray(o.r.data.days) ? '\n' + o.r.data.days.flatMap(x => x.items.map(i => `• ${o.r.data.days.length > 1 ? chatMd(x.date) + ' ' : ''}${i.time ? i.time + ' ' : ''}${i.label}`)).slice(0, 6).join('\n') : ''}`).join('\n\n'), llm: out.map(o => `[${o.def.label}] ${o.r.llm || o.r.text || ''}`).join(' '), data: {count: out.length}, cards: out.flatMap(o => (o.r.cards || []).filter(c => c.type !== 'confirm')).slice(0, 6)};
    },
  });

  // v0.99.0: "오후에 뭐 있어?" → 그날 일정 가운데 오전(12시 전)·오후만
  { const def = CHAT_TOOLS.get('get_schedule'); if (def) { const run0 = def.run; def.params.properties.part = {type: 'string', enum: ['am', 'pm']}; def.run = async (a, ctx) => {
    const r = await run0(a, ctx);
    if (r && r.ok && r.data && !a.part && !a.kw) { const ds = r.data.days || [], n = ds.reduce((k, x) => k + x.items.length, 0); return n && n <= 4 && (+a.days || 1) <= 2 ? {...r, text: r.text.replace(/\n/, '\n' + ds.flatMap(x => x.items.map(i => `• ${ds.length > 1 ? chatMd(x.date) + ' ' : ''}${i.time ? i.time + ' ' : ''}${i.label}`)).join('\n') + '\n')} : r; }
    if (!r || !r.ok || !r.data || !(['am', 'pm'].includes(a.part) || a.kw)) return r;
    const days = r.data.days || [], all = days.flatMap(x => x.items.map(i => ({...i, d: x.date}))), pm = a.part === 'pm', nm = a.part ? (pm ? '오후' : '오전') : '';
    const inPart = i => { const h = /^(\d{1,2}):/.exec(i.time || ''); return !a.part || !h || (pm ? +h[1] >= 12 : +h[1] < 12); };
    const lbl = chatMd(/^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : today()) + ((+a.days || 1) > 1 ? `부터 ${+a.days}일` : '');
    if (a.kw) { // "○○ 있어?" → 있다/없다로 먼저 답한다
      const KW = {회의: /회의|미팅|간담회|협의|워크숍/, 미팅: /회의|미팅|간담회|협의/, 출장: /출장|외근/, 외근: /출장|외근/}[a.kw] || new RegExp(a.kw);
      const hit = all.filter(i => inPart(i) && KW.test(i.label)), rest = all.filter(i => inPart(i) && !KW.test(i.label)), ln = i => `• ${(+a.days || 1) > 1 ? chatMd(i.d) + ' ' : ''}${i.time ? i.time + ' ' : ''}${i.label}`;
      return {...r, text: `${hit.length ? `네, ${lbl}${nm ? ' ' + nm : ''}에 ${a.kw} 관련 일정이 ${hit.length}건 있습니다.\n${hit.slice(0, 6).map(ln).join('\n')}` : `아니요, ${lbl}${nm ? ' ' + nm : ''}에 ${a.kw} 일정은 없습니다.`}${rest.length ? `\n그 밖의 일정: ${rest.slice(0, 3).map(i => (i.time ? i.time + ' ' : '') + i.label).join(', ')}` : ''}\n(그룹웨어 일정·내 근태 기준, 구글 캘린더 제외)`, cards: (r.cards || []).filter(c => c.type === 'nav')};
    }
    const its = all.filter(inPart);
    return {...r, text: its.length ? `${lbl} ${nm} 일정은 ${its.length}건입니다(시간이 없는 일정 포함).\n${its.slice(0, 8).map(i => '• ' + (i.time ? i.time + ' ' : '') + i.label).join('\n')}` : `${lbl} ${nm}에는 일정이 없습니다.${all.length ? ` 그날 다른 시간대 일정은 ${all.length}건입니다.` : ''}`, cards: (r.cards || []).filter(c => c.type === 'nav')};
  }; } }

  // v1.0.0: 그룹웨어 일정 등록 창을 열고 제목·날짜·시간·메모를 채운다. [등록]은 사람이 누른다(자동 클릭 차단 목록에 '등록').
  chatRegisterTool({
    name: 'prepare_schedule', label: '일정 등록 준비', kind: 'act',
    description: '그룹웨어 일정 등록 창을 열고 제목·날짜·시작/끝 시각·메모를 채운다. 등록은 사용자가 직접 누른다. 참여자는 넣지 않는다(초대 알림이 가므로 직접).',
    params: {type: 'object', properties: {date: {type: 'string'}, start: {type: 'string'}, end: {type: 'string'}, title: {type: 'string'}, memo: {type: 'string'}}},
    run: async a => {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : '', hm = x => /^\d{2}:\d{2}$/.test(x || '') ? x : '';
      if (!d) return {ok: false, text: '언제로 잡을까요? 날짜와 시간을 말씀해 주세요. 예) 내일 오후 3시'};
      const s = hm(a.start); if (!s) return {ok: false, text: `${chatMd(d)} 몇 시로 잡을까요? 시작 시간을 말씀해 주세요. 예) 오후 3시, 14시~15시`};
      const e = hm(a.end) > s ? hm(a.end) : String(Math.min(+s.slice(0, 2) + 1, 23)).padStart(2, '0') + s.slice(2);
      const sp = {date: d, start: s, end: e, title: chatCut(String(a.title || '').trim() || '일정', 60), memo: chatCut(String(a.memo || '').trim(), 200)};
      // v1.14.0: 그날 내 휴가·출장 신청과 겹치면 먼저 알린다(11/23 대체휴가 날에 회의를 잡을 뻔했음).
      const clash = (typeof myAppInfos === 'function' ? (myAppInfos(d.replace(/-/g, '')) || []) : []).filter(x => x && x.item && !/시간외|연장|휴일근무|조기/.test(x.item)).map(x => `${x.item}${x.time ? ' ' + x.time : ''}`);
      return {ok: true, text: `${clash.length ? `그날 내 신청이 있습니다: ${clash.slice(0, 2).join(', ')}. 시간이 겹치지 않는지 확인하세요.\n` : ''}그룹웨어 일정 등록 창에 아래 내용을 채울까요? [등록]은 직접 누르셔야 합니다.`, cards: [{type: 'confirm', title: '일정 등록 창 채우기', risk: 'low', rows: [['제목', sp.title], ['일시', `${chatMd(d)} ${s}~${e}`], ...(clash.length ? [['그날 내 신청', clash.slice(0, 2).join(', ')]] : []), ...(sp.memo ? [['메모', sp.memo]] : []), ['캘린더', '개인캘린더(기본값)'], ['등록', '직접 눌러야 합니다'], ['참여자', '넣지 않습니다(추가하면 초대 알림이 가므로 직접)']], confirmLabel: '등록 창 채우기', cancelLabel: '취소', onConfirm: () => fillScheduleForm(sp)}]};
    },
  });

  async function fillScheduleForm(sp) {
    const url = GW.links.route(GW.routes.schedule);
    if (!openUrl(url, {title: '일정'})) return {ok: false, text: '일정 화면을 열지 않았습니다.'};
    S.pane.expanded = true; renderPane();
    const vis = e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0; };
    let d = null, w = null;
    const btn = t => [...d.querySelectorAll('button')].filter(vis).find(b => (b.innerText || '').trim() === t);
    for (let i = 0; i < 40 && S.pane.url === url; i++) { await wait(500); const f = $('#frame iframe'); try { d = f && f.contentDocument; w = f && f.contentWindow; } catch {} if (d && btn('일정 등록')) break; d = null; }
    if (!d) return {ok: false, text: '일정 화면을 열지 못했습니다. 화면에서 [일정 등록]을 직접 눌러 주세요.'};
    const titleIn = () => [...d.querySelectorAll('input')].find(i => vis(i) && i.placeholder === '제목을 입력하세요.');
    if (titleIn() && titleIn().value) return {ok: false, text: '일정 등록 창에 작성 중인 내용이 있어 덮어쓰지 않았습니다.'};
    installGuard(w); AUTO.running = true; AUTO.blocked = []; AUTO.tok = {};
    const got = {};
    try {
      // 화면이 막 뜬 직후엔 눌러도 반응이 늦거나 없어 몇 번 다시 누른다(이미 열려 있으면 누르지 않음)
      for (let k = 0; k < 4 && !titleIn(); k++) { const b = btn('일정 등록'); if (b) b.click(); await waitFor(titleIn, k ? 3000 : 4000); }
      if (!titleIn()) return {ok: false, text: '일정 등록 창이 열리지 않았습니다. 화면에서 [일정 등록]을 직접 눌러 주세요.'};
      const set = async (el, v, enter) => { el.focus(); w.HTMLInputElement.prototype && Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('input', {bubbles: true})); el.dispatchEvent(new w.Event('change', {bubbles: true})); if (enter) el.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true})); await wait(300); el.blur(); await wait(250); };
      await set(titleIn(), sp.title);
      // 일시 줄("2026.11.21 (토) 05:00 ~ 06:00")을 눌러 날짜·시각 칸을 편다
      const sum = [...d.querySelectorAll('*')].find(e => vis(e) && e.children.length === 0 && /^\d{4}\.\d{2}\.\d{2}\s*\(.\)\s*\d{2}:\d{2}\s*~\s*\d{2}:\d{2}$/.test((e.textContent || '').trim()));
      if (sum) { sum.click(); await wait(800); }
      const box = (() => { let n = titleIn(); while (n && !(n.querySelectorAll('input[class*=OBTComplete2_wrapperInput]').length >= 2)) n = n.parentElement; return n; })();
      const dates = () => box ? [...box.querySelectorAll('input[class*=OBTDatePickerRebuild_inputYMD]')].filter(vis) : [], times = () => box ? [...box.querySelectorAll('input[class*=OBTComplete2_wrapperInput]')].filter(vis) : [];
      if (dates().length >= 2 && times().length >= 2) {
        await set(dates()[0], sp.date.replace(/-/g, ''), true); await set(times()[0], sp.start, true);
        await set(dates()[1], sp.date.replace(/-/g, ''), true); await set(times()[1], sp.end, true);
      }
      if (sp.memo) { const m = [...d.querySelectorAll('[contenteditable=true]')].find(e => vis(e) && /메모를 입력/.test(e.getAttribute('placeholder') || '')); if (m) { m.focus(); d.execCommand('insertText', false, sp.memo); await wait(300); m.blur(); got.memo = (m.innerText || '').trim() === sp.memo; } }
      got.title = titleIn() && titleIn().value === sp.title;
      got.when = dates().map(i => i.value).join() === [sp.date, sp.date].join() && times().map(i => i.value).join() === [sp.start, sp.end].join();
    } finally { AUTO.running = false; }
    const miss = [!got.title && '제목', !got.when && '날짜·시각', sp.memo && !got.memo && '메모'].filter(Boolean);
    if (typeof markPaneDirty === 'function') { const pf = $('#frame iframe'); if (pf) markPaneDirty(pf); }
    return {ok: true, text: `일정 등록 창에 ${miss.length ? `채웠지만 ${miss.join('·')}은 확인하지 못했습니다. 화면에서 확인해 주세요.` : `“${sp.title}” ${chatMd(sp.date)} ${sp.start}~${sp.end}을 채웠습니다.`} 내용을 확인하고 [등록]은 직접 누르세요. 참여자는 직접 추가하세요(추가하면 초대 알림이 갑니다).`};
  }

  // v1.1.0: "오늘 할 일 다 끝났어?" → 끝났는지부터 답한다(표시는 하지 않음)
  { const def = CHAT_TOOLS.get('list_tasks'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const r = await run0(a, ctx);
    if (!a.ask_done || !r || !r.ok || !r.data) return r;
    const n = r.data.count || 0;
    return {...r, text: n ? `아직 남아 있습니다. ${r.text}` : '네, 지금 처리할 일이 없습니다.'};
  }; } }
