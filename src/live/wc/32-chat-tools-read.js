// GW 통합 업무센터 · 채팅 도구(읽기 전용): 요약, 할 일, 일정, 직원 근태, 내 근태, 검색, 자원, 화면 이동
// 모든 숫자는 '오늘 할 일'과 같은 기준(mineVisible, stateOf). 아직 읽지 못한 자료는 빈 결과로 단정하지 않고 "불러오는 중"이라고 답한다.
// `llm` 필드는 외부 AI에 돌려줄 짧은 문장(개인정보 최소화)이고, `text`는 화면에 보이는 답이다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const chatSleep = ms => new Promise(r => setTimeout(r, ms));
  async function chatWait(cond, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await chatSleep(200); } return !!cond(); }
  const chatAddDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const chatMd = iso => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}(${R.chatDowName(iso)})`;
  function chatDateArg(v) {
    const s = String(v || '').trim(), t = today();
    if (!s || s === 'today') return t;
    if (s === 'tomorrow') return chatAddDays(t, 1);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return R.chatParseDate(s, new Date()) ? s : '';
    const p = R.chatParseDate(s, new Date());
    return p ? p.date : '';
  }
  const chatNotReady = () => ({ok: false, text: '아직 그룹웨어 자료를 읽는 중입니다. 잠시 뒤 다시 물어봐 주세요.'});
  const chatToneOf = x => { const s = stateOf(x); return s === 'overdue' || s === 'urgent' ? 'urgent' : s === 'todo' ? 'todo' : 'info'; };
  const chatTaskItem = x => ({title: x.title, sub: [x.area, x.headline].filter(Boolean).join(' · '), badge: STATE_NAME[stateOf(x)] || '', tone: chatToneOf(x), act: {act: 'chatOpenItem', v: x.key}});
  async function chatLoadTeam(isos) {
    const mks = [...new Set(isos.map(i => i.slice(0, 7).replace('-', '')))];
    for (const mk of mks) { try { ensureTeam(mk); } catch (e) { logError('chat.team', e.message); } }
    await chatWait(() => mks.every(mk => S.team && S.team[mk] && !S.team[mk].busy), 9000);
    return mks.every(mk => S.team && S.team[mk] && S.team[mk].cal);
  }

  chatRegisterTool({
    name: 'get_overview', label: '오늘 요약 확인', kind: 'read',
    description: '오늘의 전체 요약(급한 일, 할 일, 결재 대기, 오늘 일정 수, 오늘 자리 비운 직원 수)을 돌려준다.',
    params: {type: 'object', properties: {}},
    run: async () => {
      const d = homeData();
      if (!d.loaded) return chatNotReady();
      const total = d.urgent + d.todo + d.check;
      const top = d.mine.slice(0, 3);
      const text = total ? `급한 일 ${d.urgent}건을 포함해 처리할 일은 ${total}건입니다. 결재 대기 중 ${d.wait}건, 오늘 일정 ${d.events.length}건, 자리 비운 직원 ${d.away.length}명입니다.` : `지금 처리할 일이 없습니다. 결재 대기 중 ${d.wait}건, 오늘 일정 ${d.events.length}건입니다.`;
      return {ok: true, text, data: {urgent: d.urgent, todo: d.todo, check: d.check, waiting_approval: d.wait, events_today: d.events.length, away_today: d.away.length, top_tasks: top.map(x => ({title: x.title, state: stateOf(x)}))},
        cards: [{type: 'kpi', items: [{label: '급한 일', value: d.urgent, tone: d.urgent ? 'urgent' : 'ok'}, {label: '할 일', value: d.todo + d.check, tone: 'todo'}, {label: '결재 대기 중', value: d.wait, tone: 'info'}, {label: '오늘 일정', value: d.events.length, tone: 'info'}]}, ...(top.length ? [{type: 'list', title: '먼저 볼 일', items: top.map(chatTaskItem)}] : [])]};
    },
  });

  chatRegisterTool({
    name: 'list_tasks', label: '할 일 확인', kind: 'read',
    description: '내가 처리할 일 목록. state: urgent(급함·기한 지남) | todo | check(확인 필요) | wait(결재 대기 중) | all. area로 결재/메일/근태/공지를 좁힐 수 있다.',
    params: {type: 'object', properties: {state: {type: 'string', enum: ['urgent', 'todo', 'check', 'wait', 'all']}, area: {type: 'string', enum: ['결재', '메일', '근태', '공지']}, limit: {type: 'number'}}},
    run: async a => {
      if (!S.a) return chatNotReady();
      const st = a.state || 'all', lim = Math.min(Math.max(Number(a.limit) || 8, 1), 15);
      let list = st === 'wait' ? visibleActions().filter(x => isMine(x) && stateOf(x) === 'wait') : mineVisible();
      if (st === 'urgent') list = list.filter(x => ['overdue', 'urgent'].includes(stateOf(x)));
      else if (st === 'todo') list = list.filter(x => stateOf(x) === 'todo');
      else if (st === 'check') list = list.filter(x => ['check', 'confirm'].includes(stateOf(x)));
      if (a.area) list = list.filter(x => x.area === a.area);
      const label = {urgent: '급한 일', todo: '할 일', check: '확인이 필요한 일', wait: '결재 대기 중인 일', all: '처리할 일'}[st] || '처리할 일';
      if (!list.length) return {ok: true, text: a.area ? `${a.area}: 지금 ${st === 'all' ? '처리하거나 답할' : label} 것이 없습니다.` : `${label}이 없습니다.`, data: {count: 0, items: []}};
      return {ok: true, text: `${a.area ? a.area + ' ' : ''}${label} ${list.length}건입니다.${list.length > lim ? ` 위에서 ${lim}건만 보여 드립니다.` : ''}`, data: {count: list.length, items: list.slice(0, lim).map(x => ({title: x.title, area: x.area, state: stateOf(x), deadline: x.deadline && x.deadline.date || ''}))},
        cards: [{type: 'list', title: label, items: list.slice(0, lim).map(chatTaskItem), more: Math.max(0, list.length - lim)}]};
    },
  });

  chatRegisterTool({
    name: 'get_schedule', label: '일정 확인', kind: 'read',
    description: '내 일정(그룹웨어 일정, 내 휴가·출장·교육, 시간외 근무 신청, 기한). date는 YYYY-MM-DD 또는 today/tomorrow, days는 1~7.',
    params: {type: 'object', properties: {date: {type: 'string'}, days: {type: 'number'}}},
    run: async a => {
      if (!S.a || !S.raw) return chatNotReady();
      let d0 = chatDateArg(a.date);
      if (!d0) return {ok: false, text: '날짜를 알아보지 못했습니다. 예) 내일, 11/20, 다음 주 수요일'};
      let n = Math.min(Math.max(Number(a.days) || 1, 1), 7);
      { const t = today(), endIso = chatAddDays(d0, n - 1); if (d0 < t && endIso >= t) { n = Math.round((Date.parse(endIso) - Date.parse(t)) / 86400000) + 1; d0 = t; } } // "이번 주"는 지난 요일을 빼고 오늘부터
      const isos = Array.from({length: n}, (_, i) => chatAddDays(d0, i));
      const teamOk = await chatLoadTeam(isos);
      const sched = (S.raw.data && S.raw.data.schedule && S.raw.data.schedule.events) || [];
      const days = isos.map(iso => {
        const d8 = iso.replace(/-/g, ''), rows = [];
        for (const e of sched) { const s = String(e.start || ''), z = String(e.end || e.start || ''); if (s.slice(0, 8) <= d8 && z.slice(0, 8) >= d8) rows.push({from: e.allDay ? '' : s.slice(8, 10) + ':' + s.slice(10, 12), to: e.allDay || z.length < 12 || z.slice(0, 8) !== d8 ? '' : z.slice(8, 10) + ':' + z.slice(10, 12), label: e.title}); }
        const tm = S.team && S.team[d8.slice(0, 6)];
        for (const x of (tm && tm.cal && tm.cal.byDate[d8]) || []) if (x.mine) rows.push({from: x.time ? x.time.slice(0, 5) : '', to: x.time ? x.time.slice(6) : '', label: x.kind === 'ot' ? '시간외 근무 신청' : x.label + (x.place ? ' · ' + x.place : '')});
        for (const dl of S.a.deadlines || []) if (dl.date === iso) rows.push({from: dl.time || '', to: '', label: '기한: ' + dl.title});
        if (iso === today()) for (const b of (S.homeRes && S.homeRes.items) || []) if (String(b.start).slice(0, 8) === d8) rows.push({from: String(b.start).slice(8, 10) + ':' + String(b.start).slice(10, 12), to: String(b.end).slice(8, 10) + ':' + String(b.end).slice(10, 12), label: b.label});
        rows.sort((x, y) => (x.from || '').localeCompare(y.from || ''));
        return {iso, rows};
      });
      const total = days.reduce((s, d) => s + d.rows.length, 0);
      const lead = n === 1 ? `${chatMd(d0)} 일정` : `${chatMd(d0)}부터 ${n}일간 일정`;
      const warn = teamOk ? '' : ' (직원 근태 자료를 아직 읽지 못해 내 휴가·출장은 빠졌을 수 있습니다)';
      if (!total) return {ok: true, text: `${lead}은 없습니다.${warn}`, data: {days: []}, cards: []};
      const text = n === 1 ? `${lead} ${total}건입니다.${warn}` : `${lead}은 모두 ${total}건입니다.${warn}`;
      const cards = n === 1 ? [{type: 'timeline', title: chatMd(d0), items: days[0].rows}] : days.filter(d => d.rows.length).map(d => ({type: 'timeline', title: chatMd(d.iso), items: d.rows}));
      return {ok: true, text, data: {days: days.filter(d => d.rows.length).map(d => ({date: d.iso, items: d.rows.map(r => ({time: r.from, label: r.label}))}))}, cards};
    },
  });

  chatRegisterTool({
    name: 'get_staff_status', label: '직원 근태 확인', kind: 'read',
    description: '직원의 휴가·출장·교육 일정(시간, 장소, 사유 포함). name을 주면 그 직원의 앞으로 일정을, 안 주면 같은 부서의 해당 날짜 부재 현황을 돌려준다. 시간외 근무·지문은 다루지 않는다.',
    params: {type: 'object', properties: {name: {type: 'string'}, date: {type: 'string'}, days: {type: 'number'}}},
    run: async a => {
      if (!S.a || !S.raw) return chatNotReady();
      const d0 = chatDateArg(a.date);
      if (!d0) return {ok: false, text: '날짜를 알아보지 못했습니다. 예) 내일, 11/20, 다음 주'};
      const name = String(a.name || '').trim().replace(/\s+/g, '');
      const n = Math.min(Math.max(Number(a.days) || 1, 1), name ? 31 : 14) || 1, nn = name ? Math.max(n, 14) : n;
      const isos = Array.from({length: nn}, (_, i) => chatAddDays(d0, i));
      const ok = await chatLoadTeam(isos);
      if (!ok) return {ok: false, text: '직원 근태 자료를 읽지 못했습니다. 잠시 뒤 다시 시도하거나 일정 달력에서 확인해 주세요.'};
      const known = new Set(); for (const mk of new Set(isos.map(i => i.slice(0, 7).replace('-', '')))) for (const r of (S.team[mk] && S.team[mk].rows) || []) known.add(r.name);
      if (name && ![...known].some(k => k.includes(name))) return {ok: true, text: `“${name}” 님을 직원 근태 자료에서 찾지 못했습니다. 이름을 확인해 주세요.`, data: {found: false}};
      const dept = (typeof myDept === 'function' && myDept()) || '';
      const hits = [], seenHit = new Set();
      for (const iso of isos) {
        const d8 = iso.replace(/-/g, ''), tm = S.team[d8.slice(0, 6)];
        for (const x of (tm && tm.cal && tm.cal.byDate[d8]) || []) {
          if (x.kind === 'ot') continue;
          if (name ? !String(x.name).includes(name) : (dept && x.dept !== dept)) continue;
          const hk = [iso, x.name, x.label, x.time].join('|'); if (seenHit.has(hk)) continue; seenHit.add(hk);
          hits.push({iso, name: x.name, dept: x.dept, kind: x.kind === 'leave' ? '휴가' : x.kind === 'trip' ? '출장·교육' : '', label: x.label, time: x.time || '', place: x.place || '', reason: x.reason || '', pending: !!(x.info && x.info.pending)});
        }
      }
      const span = nn === 1 ? chatMd(d0) : `${chatMd(d0)}~${chatMd(isos[isos.length - 1])}`;
      const short = (x, n) => { x = String(x || ''); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
      if (!hits.length) return {ok: true, text: name ? `${span} 사이에 “${name}” 님의 휴가·출장·교육 일정이 없습니다.` : `${span}에 ${dept || '우리 부서'}에서 휴가·출장·교육으로 자리를 비우는 직원이 없습니다.`, data: {count: 0}};
      if (name) {
        const first = hits[0];
        const head = hits.length === 1 ? `${name} 님은 ${chatMd(first.iso)} ${first.label}${first.time ? ' ' + first.time : ''}${first.place ? ', ' + short(first.place, 30) : ''} 일정이 있습니다.` : `${name} 님의 일정은 ${hits.length}건이고, 가장 가까운 것은 ${chatMd(first.iso)} ${first.label}${first.time ? ' ' + first.time : ''}입니다.`;
        const items = hits.slice(0, 20).map(h => ({title: `${chatMd(h.iso)} ${h.label}${h.time ? ' ' + h.time : ''}`, sub: [h.place, short(h.reason, 40)].filter(Boolean).join(' · '), badge: h.pending ? '결재 중' : '', tone: 'info'}));
        return {ok: true, text: head, llm: `${head} ${hits.slice(0, 12).map(h => `${chatMd(h.iso)} ${h.label}${h.time ? ' ' + h.time : ''}`).join('; ')}`, data: {count: hits.length},
          cards: [{type: 'list', title: `${name} 님 일정`, items, more: Math.max(0, hits.length - 20)}, {type: 'nav', label: '일정 달력에서 크게 보기', view: 'calendar'}]};
      }
      // 이름이 없으면 같은 일정(날짜·종류·시간·장소·사유)을 한 줄로 묶는다
      const groups = new Map();
      for (const h of hits) { const k = [h.iso, h.kind, h.label, h.time, h.place, h.reason].join('|'); const g = groups.get(k) || {...h, names: []}; g.names.push(h.name); groups.set(k, g); }
      const gl = [...groups.values()], multiDay = nn > 1;
      const head = `${span} ${dept || '우리 부서'} 자리 비움은 ${new Set(hits.map(h => h.name)).size}명, ${gl.length}개 일정입니다.`;
      const line = g => `${g.names.join('·')} — ${multiDay ? chatMd(g.iso) + ' ' : ''}${g.label}${g.time ? ' ' + g.time : ''}${g.place ? ' · ' + short(g.place, 24) : ''}`;
      return {ok: true, text: head + '\n' + gl.slice(0, 8).map(g => '• ' + line(g)).join('\n') + (gl.length > 8 ? `\n외 ${gl.length - 8}개 일정` : ''), llm: `${head} ${gl.slice(0, 10).map(g => `${g.names.join('·')} ${multiDay ? chatMd(g.iso) + ' ' : ''}${g.label}${g.time ? ' ' + g.time : ''}`).join('; ')}`, data: {people: new Set(hits.map(h => h.name)).size, events: gl.length},
        cards: [{type: 'list', title: '자세한 내용', items: gl.slice(0, 20).map(g => ({title: `${g.names.join('·')} ${g.label}`, sub: [multiDay ? chatMd(g.iso) : '', g.time, short(g.place, 30), short(g.reason, 36)].filter(Boolean).join(' · '), badge: g.pending ? '결재 중' : '', tone: 'info'})), more: Math.max(0, gl.length - 20)}, {type: 'nav', label: '일정 달력에서 크게 보기', view: 'calendar'}]};
    },
  });

  chatRegisterTool({
    name: 'lookup_person', label: '직원 찾기', kind: 'read',
    description: '직원의 부서·직급·전화·이메일을 찾는다(조직도 검색). name은 한글 이름.',
    params: {type: 'object', properties: {name: {type: 'string'}}, required: ['name']},
    run: async a => {
      const q = String(a.name || '').trim();
      if (q.length < 2) return {ok: false, text: '찾을 직원 이름을 알려 주세요. 예) 직원 이름 + 전화번호'};
      let res; try { res = await GW.search(q, {types: ['person'], pageSize: 5}); } catch (e) { return {ok: false, text: '직원 검색에 실패했습니다: ' + String(e.message || e).slice(0, 80)}; }
      const g = res.groups.person, list = (g && g.items) || [];
      if (!list.length) return {ok: true, text: `“${q}” 님을 조직도에서 찾지 못했습니다. 이름을 확인해 주세요.`, data: {count: 0}};
      const one = x => `${x.name} ${x.duty || x.position || ''} · ${x.dept || ''}`.replace(/\s+/g, ' ').trim();
      const text = list.length === 1 ? `${one(list[0])}${list[0].tel ? ' · 전화 ' + list[0].tel : ''}${list[0].email ? ' · ' + list[0].email : ''}` : `“${q}”로 ${list.length}명이 검색됩니다.\n` + list.slice(0, 4).map(x => '• ' + one(x) + (x.tel ? ' · ' + x.tel : '')).join('\n');
      return {ok: true, text, llm: `조직도에서 ${list.length}명 찾음: ${list.slice(0, 4).map(one).join('; ')}`, data: {count: list.length},
        cards: [{type: 'list', title: '조직도 검색 결과', items: list.slice(0, 5).map(x => ({title: `${x.name} ${x.duty || x.position || ''}`.trim(), sub: [x.dept, x.tel, x.email].filter(Boolean).join(' · '), tone: 'info'}))}]};
    },
  });

  chatRegisterTool({
    name: 'get_my_attendance', label: '내 근태 확인', kind: 'read',
    description: '내 남은 연차, 오늘 출퇴근 기록, 이번 달(또는 month=YYYY-MM) 확인이 필요한 근태 날짜.',
    params: {type: 'object', properties: {month: {type: 'string'}}},
    run: async a => {
      if (!S.a || !S.raw) return chatNotReady();
      const p = R.kstNow(new Date()), thisM = p.date.slice(0, 7);
      const m = /^\d{4}-\d{2}$/.test(String(a.month || '')) ? a.month : thisM, mm = m.replace('-', '');
      const last = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate(), t8 = p.date.replace(/-/g, '');
      const to = `${mm}${String(last).padStart(2, '0')}`;
      let rows = [];
      try { rows = await GW.attendanceDays({from: mm + '01', to: to > t8 ? t8 : to}); } catch (e) { return {ok: false, text: '근태 자료를 읽지 못했습니다: ' + String(e.message || e).slice(0, 80)}; }
      const lv = S.raw.data && S.raw.data.leave, at = S.raw.data && S.raw.data.attendance;
      const an = R.attendanceAnomalies(rows, {leaves: (lv && lv.history) || []});
      const bits = [];
      if (lv) bits.push(`남은 연차는 ${fmtDays(lv.remaining)}입니다(받은 ${fmtDays(lv.granted)}, 쓴 ${fmtDays(lv.used)})`);
      if (m === thisM && at && at.today) bits.push(`오늘 출근 ${hm4(at.today.come) || '기록 없음'}, 퇴근 ${hm4(at.today.leave) || '기록 없음'}`);
      bits.push(an.length ? `${Number(m.slice(5))}월에 확인이 필요한 날이 ${an.length}일 있습니다` : `${Number(m.slice(5))}월에 확인이 필요한 근태는 없습니다`);
      return {ok: true, text: bits.join('. ') + '.', data: {remaining_leave: lv ? fmtDays(lv.remaining) : '', anomalies: an.length},
        cards: [{type: 'kpi', items: [{label: '남은 연차', value: lv ? fmtDays(lv.remaining) : '-', tone: 'info'}, {label: '확인 필요한 날', value: an.length, tone: an.length ? 'urgent' : 'ok'}]}, ...(an.length ? [{type: 'list', title: '확인이 필요한 날', items: an.slice(0, 8).map(x => ({title: `${ymd8(x.date).slice(5).replace('-', '/')} ${x.item || ''}`.trim(), sub: x.advice || '', tone: 'urgent'}))}] : []), {type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'}]};
    },
  });

  chatRegisterTool({
    name: 'search_documents', label: '문서·메일 검색', kind: 'read',
    description: '결재문서·메일·게시판을 제목 중심으로 검색한다(본문은 보여주지 않는다). scope: all | approval | mail | notice.',
    params: {type: 'object', properties: {query: {type: 'string'}, scope: {type: 'string', enum: ['all', 'approval', 'mail', 'notice']}}, required: ['query']},
    run: async a => {
      const q = String(a.query || '').trim();
      if (q.length < 2) return {ok: false, text: '검색어를 두 글자 이상 알려 주세요. 예) 월간업무보고 검색'};
      const types = {approval: ['doc'], mail: ['mail'], notice: ['board']}[a.scope] || ['doc', 'mail', 'board'];
      let res; try { res = await GW.search(q, {types, pageSize: 5}); } catch (e) { return {ok: false, text: '검색하지 못했습니다: ' + String(e.message || e).slice(0, 80)}; }
      const cards = [], data = {};
      const add = (key, title, f) => { const g = res.groups[key]; if (!g || !g.items.length) return; data[key] = g.items.slice(0, 5).map(x => f(x).title); cards.push({type: 'list', title: `${title} ${g.total}건`, items: g.items.slice(0, 5).map(f), more: Math.max(0, g.total - 5)}); };
      add('doc', '결재문서', x => ({title: x.title || '(제목 없음)', sub: [x.docNo, ymd8(x.date)].filter(Boolean).join(' · ')}));
      add('mail', '메일', x => ({title: x.subject || '(제목 없음)', sub: x.from || ''}));
      add('board', '게시판', x => ({title: x.title || '(제목 없음)', sub: String(x.date || '').slice(0, 10)}));
      if (!cards.length) return {ok: true, text: `“${q}”에 해당하는 결과가 없습니다. 검색어나 범위를 바꿔 보세요.`, data: {count: 0}};
      cards.push({type: 'nav', label: '통합검색에서 더 보기', view: 'search', v: q});
      const total = Object.values(res.groups).reduce((s, g) => s + (g.total || 0), 0);
      return {ok: true, text: `“${q}” 검색 결과는 모두 ${total}건입니다. 제목만 보여 드립니다.`, data: {total, titles: data}, cards};
    },
  });

  chatRegisterTool({
    name: 'get_budget', label: '예산 확인', kind: 'read',
    description: '예산 집행 현황 화면으로 안내하고 경과율과 관심 사업 목록을 알려준다.',
    params: {type: 'object', properties: {project: {type: 'string'}}},
    run: async () => {
      if (!S.a) return chatNotReady();
      const el = S.a.budget && S.a.budget.elapsedPct, pinned = (S.settings.budget || []).map(b => b.label || b.project).filter(Boolean);
      return {ok: true, text: `${el !== undefined && el !== null ? `올해 경과율은 ${el}%입니다. ` : ''}${pinned.length ? `관심 사업: ${pinned.slice(0, 5).join(', ')}. ` : ''}사업별 집행액은 예산 집행 화면에서 확인하세요.`, data: {elapsed_pct: el, pinned}, cards: [{type: 'nav', label: '예산 집행 화면 열기', view: 'budget'}]};
    },
  });

  chatRegisterTool({
    name: 'get_resource_status', label: '차량 예약 현황', kind: 'read',
    description: '공용차량(자원)의 해당 날짜 예약 현황과 09~18시 빈 시간.',
    params: {type: 'object', properties: {date: {type: 'string'}}},
    run: async a => {
      if (typeof allowed === 'function' && !allowed('resource')) return {ok: false, text: '자원 예약 기능이 관리자 설정으로 꺼져 있습니다.'};
      const iso = chatDateArg(a.date);
      if (!iso) return {ok: false, text: '날짜를 알아보지 못했습니다. 예) 내일, 11/20'};
      const d8 = iso.replace(/-/g, '');
      try {
        const list = ((resState().list) || await GW.resourceList()).filter(r => r.useYn !== 'N');
        const car = list.find(r => /차량|관용|니로/.test(r.name)) || list[0];
        if (!car) return {ok: true, text: '예약할 수 있는 자원이 없습니다.'};
        const all = await GW.resourceBookings({from: d8, to: d8, resSeqs: [car.resSeq]});
        const day = all.filter(b => R.bookingSpanOnDay(b, d8)).sort((x, y) => x.start.localeCompare(y.start));
        const free = R.freeSlots(day, d8);
        const nm = car.name.replace(/\(.*$/, '');
        const text = `${nm} ${chatMd(iso)}: 예약 ${day.length}건${day.length ? '(' + day.map(b => `${b.start.slice(8, 10)}:${b.start.slice(10)}~${b.end.slice(8, 10)}:${b.end.slice(10)}`).join(', ') + ')' : ''}. 비어 있는 시간은 ${free.length ? free.map(f => `${f.start}~${f.end}`).join(', ') : '없습니다'}${free.length ? '입니다' : ''}.`;
        return {ok: true, text, data: {resource: nm, date: iso, bookings: day.length, free: free.map(f => `${f.start}~${f.end}`)}, cards: [{type: 'timeline', title: `${nm} ${chatMd(iso)} 예약`, items: day.map(b => ({from: b.start.slice(8, 10) + ':' + b.start.slice(10), to: b.end.slice(8, 10) + ':' + b.end.slice(10), label: (b.title || '예약') + (b.who ? ' · ' + b.who : '')}))}, {type: 'nav', label: '자원 예약 화면 열기', view: 'resource'}]};
      } catch (e) { return {ok: false, text: '자원 현황을 읽지 못했습니다: ' + String(e.message || e).slice(0, 80)}; }
    },
  });

  chatRegisterTool({
    name: 'open_view', label: '화면 열기', kind: 'read',
    description: '업무센터의 화면을 연다. view: home, today(할 일 목록), approval, mail, search, board, calendar, gcal, budget, attendance, resource, overview, report, settings.',
    params: {type: 'object', properties: {view: {type: 'string'}}, required: ['view']},
    run: async a => {
      const v = VIEWS.find(x => x.id === a.view);
      if (!v) return {ok: false, text: '열 수 있는 화면 이름이 아닙니다.'};
      go(v.id);
      return {ok: true, text: `“${v.label}” 화면을 열었습니다.`};
    },
  });

  chatRegisterTool({
    name: 'open_item', label: '항목 열기', kind: 'read',
    description: '할 일 목록의 항목(key)을 열어 상세를 보여준다. list_tasks가 돌려준 항목만 열 수 있다.',
    params: {type: 'object', properties: {key: {type: 'string'}}, required: ['key']},
    run: async a => {
      const x = S.a && S.a.actions.find(t => t.key === a.key);
      if (!x) return {ok: false, text: '해당 항목을 찾지 못했습니다.'};
      go('today'); selectAction(x.key);
      return {ok: true, text: `“${x.title}” 항목을 열었습니다.`};
    },
  });

  chatRegisterTool({
    name: 'get_gcal_sync', label: '구글 캘린더 동기화 확인', kind: 'read',
    description: '그룹웨어의 내 결재완료 근태·기한 중 아직 구글 캘린더에 올리지 않은 것을 알려준다. 등록 자체는 하지 않고 동기화 화면으로 안내한다.',
    params: {type: 'object', properties: {}},
    run: async () => {
      if (!allowed('googleCalendar')) return {ok: false, text: '구글 캘린더 기능이 관리자 설정으로 꺼져 있습니다.'};
      if (!S.a) return chatNotReady();
      try { if (typeof loadApps === 'function') await loadApps(); } catch (e) { return {ok: false, text: '근태 신청 내역을 읽지 못했습니다: ' + String(e.message || e).slice(0, 80)}; }
      const p = gsyncGet();
      if (!p) return chatNotReady();
      const todo = p.items.filter(i => i.state === 'ready');
      const text = !p.compared ? `아직 구글 캘린더와 대조하지 않아 올렸는지 알 수 없습니다. 후보는 ${p.items.length - p.counts.hold}건입니다. Aside에게 “구글 캘린더와 대조해줘”라고 하면 읽어서 알려 드립니다.` : todo.length ? `대조 결과 구글 캘린더에 없는 일정이 ${todo.length}건 있습니다(비슷한 일정 ${p.counts.similar}건, 대조 전 ${p.counts.unverified}건 별도). 올리기 화면에서 하나씩 확인하고 저장하세요.` : `대조한 날짜 안에서는 구글에 없는 일정이 없습니다(등록됨 ${p.counts.synced}건, 비슷한 일정 ${p.counts.similar}건, 대조 전 ${p.counts.unverified}건).`;
      return {ok: true, text, data: {compared: p.compared, missing_in_google: todo.length, similar: p.counts.similar, unverified: p.counts.unverified, on_hold: p.counts.hold, registered: p.counts.synced}, cards: [...(todo.length ? [{type: 'list', title: '구글에 없는 일정', items: todo.slice(0, 6).map(i => ({title: i.title, sub: gsyncMd(i) + (i.time ? ' ' + i.time : ''), badge: i.source === 'deadline' ? '기한' : '근태', tone: 'info'})), more: Math.max(0, todo.length - 6)}] : []), {type: 'nav', label: '구글 동기화 화면 열기', view: 'gsync'}]};
    },
  });
