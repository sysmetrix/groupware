  // ---------- 46. 자유 질문 품질 (v0.91.0) ----------
  // 실사용 자유 질문 10개 점검에서 틀리던 유형: 놓치기 쉬운 일·휴가 전 처리, 신청 횟수, 사업 예산 상태, ○○ 건(메일 아니면 문서).

  const cuMdw = iso => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}(${'일월화수목금토'[new Date(iso + 'T00:00:00Z').getUTCDay()]})` : '');

  chatRegisterTool({
    name: 'check_risks', label: '놓치기 쉬운 일 점검', kind: 'read',
    description: '지난·임박 기한, 오래 안 읽은 요청 메일, 오래된 답장 확인, 근태 확인, 반려 문서와 앞으로 사흘(또는 until 전날까지) 일정의 확인 사항을 모아 놓치기 쉬운 일을 알려준다. until(YYYY-MM-DD)은 휴가·출장 시작일로, 그 전에 끝낼 일을 고른다.',
    params: {type: 'object', properties: {until: {type: 'string'}, reason: {type: 'string'}}},
    run: async a => {
      if (!S.a) return chatNotReady();
      const t = today(), start = /^\d{4}-\d{2}-\d{2}$/.test(String(a.until || '')) && a.until > t ? a.until : '';
      // 휴가 전날이 주말·휴일이면 그 앞 근무일까지(예: 월요일 휴가 → 금요일)
      const hol = (S.raw && S.raw.data && S.raw.data.schedule && S.raw.data.schedule.holidays) || [];
      let before = start ? chatAddDays(start, -1) : '';
      for (let i = 0; before && i < 7; i++) { const info = R.homeDayInfo({date: before, holidays: hol}); if (!(info.weekend || info.holiday) || before <= t) break; before = chatAddDays(before, -1); }
      const items = mineVisible().map(x => ({key: x.key, title: x.title, state: stateOf(x), base: x.base, type: x.type, deadline: x.deadline && x.deadline.date || '', when: x.when || ''}));
      const risks = R.cuRisks(items, {today: t, until: before});
      // 일정 확인 사항: 오늘~사흘(또는 휴가 전날까지)의 내 근태 일정
      const span = start ? Math.max(1, Math.min(7, Math.round((Date.parse(start) - Date.parse(t)) / 86400000) + 1)) : 3;
      const isos = Array.from({length: span}, (_, i) => chatAddDays(t, i));
      let teamOk = true; try { teamOk = await chatLoadTeam(isos); } catch { teamOk = false; }
      const tips = [], startLabels = [];
      for (const iso of isos) {
        const d8 = iso.replace(/-/g, ''), tm = S.team && S.team[d8.slice(0, 6)];
        const labels = ((tm && tm.cal && tm.cal.byDate[d8]) || []).filter(x => x.mine).map(x => (x.kind === 'ot' ? '시간외 근무 신청' : x.label || ''));
        if (iso === start) startLabels.push(...labels);
        for (const tip of R.cuPrepTips(labels)) tips.push(`${cuMdw(iso)} ${tip}`);
      }
      const why = a.reason || '휴가';
      const head = start ? `${cuMdw(start)} ${why}${startLabels.length ? `(${startLabels.join(', ')})` : ''} 전, ${cuMdw(before)}까지 처리하면 좋은 일 ${risks.length}건입니다.` : risks.length ? `놓치기 쉬운 일 ${risks.length}건입니다.` : '놓치기 쉬운 일은 찾지 못했습니다.';
      const basis = '기준: 기한, 하루 넘게 안 읽은 요청 메일, 이틀 넘은 답장 확인, 근태 확인, 반려 문서. 메일 본문 속 기한은 메일을 읽어야 보입니다.';
      const cards = [];
      if (risks.length) cards.push({type: 'list', title: start ? `${why} 전에 처리` : '놓치기 쉬운 일', items: risks.slice(0, 8).map(r => ({title: r.title, sub: r.why.join(' · '), badge: r.level === 0 ? '먼저' : r.level === 1 ? '확인' : '권장', tone: r.level === 0 ? 'urgent' : r.level === 1 ? 'todo' : 'info', act: {act: 'chatOpenItem', v: r.key}})), more: Math.max(0, risks.length - 8)});
      if (tips.length) cards.push({type: 'note', tone: 'info', text: `**일정 확인 사항**\n${[...new Set(tips)].map(x => '• ' + x).join('\n')}`});
      if (!teamOk) cards.push({type: 'note', tone: 'warn', text: '근태 일정을 읽지 못해 일정 확인 사항이 빠졌을 수 있습니다.'});
      return {ok: true, text: `${head}${tips.length ? ` 일정 확인 사항 ${new Set(tips).size}가지도 있습니다.` : ''}\n${basis}`, llm: `놓치기 쉬운 일 ${risks.length}건, 일정 확인 사항 ${new Set(tips).size}가지를 화면에 표시했습니다.`,
        data: {count: risks.length, items: risks.slice(0, 8).map(r => ({itemId: r.key, title: r.title}))}, cards};
    },
  });

  // 신청 횟수: "이번 달 출장 몇 번 갔어?" → 기간·종류별 승인 건수와 일수
  { const def = CHAT_TOOLS.get('list_my_requests'); if (def) {
    const run0 = def.run;
    def.description += ' kind(출장|휴가|시간외|외출|교육)와 period(이번 달·지난달·N월·올해·지난주 같은 말)를 주면 그 기간의 승인 건수와 일수를 센다.';
    def.params = {type: 'object', properties: {limit: {type: 'number'}, kind: {type: 'string', enum: ['출장', '휴가', '시간외', '외출', '교육']}, period: {type: 'string'}}};
    def.run = async (a, ctx) => {
      if (!a.kind) return run0(a, ctx);
      if (!S.raw) return chatNotReady();
      let dt; try { dt = await loadApps(); } catch (e) { return {ok: false, text: '근태 신청 내역을 읽지 못했습니다: ' + cuCut(e.message, 80)}; }
      const p = R.cuPeriod(a.period || '', today()), c = R.cuRequestCount(dt.apps || [], {me: dt.me, kind: a.kind, from: p.from, to: p.to});
      const cutoff = chatAddDays(today(), -150).replace(/-/g, ''), partial = p.from < cutoff;
      const md8 = d => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;
      const text = `${p.label} ${a.kind}${c.count ? `은 ${c.count}번(${c.days}일)입니다` : ' 기록은 없습니다'}.${c.pending ? ` 결재 중인 신청 ${c.pending}건은 따로입니다.` : ''}\n승인된 근태 신청 기준입니다.${partial ? ' 신청 자료는 최근 150일만 읽으므로 그보다 앞선 기간은 빠졌을 수 있습니다.' : ''}`;
      return {ok: true, text, llm: `${p.label} ${a.kind} ${c.count}번(${c.days}일).`, data: {count: c.count, days: c.days, pending: c.pending},
        cards: c.items.length ? [{type: 'list', title: `${p.label} ${a.kind}`, items: c.items.slice(0, 10).map(x => ({title: `${md8(x.start)}${x.end !== x.start ? '~' + md8(x.end) : ''} ${x.name}`})), more: Math.max(0, c.items.length - 10)}, {type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'}] : [{type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'}]};
    };
  } }

  // 예산: "내가 맡은 사업 예산 괜찮아?"처럼 사업 이름이 없으면 관심 사업 전체의 집행 상태(경과율 대비)를 답한다
  { const def = CHAT_TOOLS.get('get_budget'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const rest = String(a.project || '').replace(/(요즘|최근|요새|내가|제가|맡은|담당|담당한|우리|내|저희|사업들?|예산|집행률?|괜찮[가-힣]*|어때|어떤가요?|잘|되고|되는지|돼|있어|있나|현황|전체|부서|관심|상태|좀|해\s*줘|알려\s*줘|봐\s*줘|확인|[?？!.,])/g, ' ').replace(/\s+/g, '').trim();
    if (rest.length >= 2 || !S.a || !S.a.budget) return run0(a, ctx);
    const el = Number(S.a.budget.elapsedPct) || 0;
    const list = (S.a.budget.projects || []).filter(p => !p.error && p.rows && p.rows.length).map(p => { const top = p.rows[0]; return {name: (S.settings.budget.find(b => b.project === p.project) || {}).label || p.label || p.project, budget: top.budget, executed: top.executed, balance: top.balance, rate: top.rate}; });
    const nav = {type: 'nav', label: '예산 집행 화면 열기', view: 'budget'};
    if (!list.length) return {ok: true, text: '관심 사업이 정해져 있지 않아 사업별 상태를 볼 수 없습니다. 예산 화면에서 내 사업을 관심 사업으로 추가하거나 사업 이름으로 물어봐 주세요.', data: {count: 0}, cards: [nav]};
    const h = R.cuBudgetHealth(list, el), slow = h.filter(x => x.flag === 'slow'), fast = h.filter(x => x.flag === 'fast'), over = h.filter(x => x.flag === 'over');
    const text = `관심 사업 ${h.length}개의 집행 상태입니다(올해 경과율 ${el}%). ${slow.length || fast.length || over.length ? [slow.length ? `집행이 느린 사업 ${slow.length}개` : '', fast.length ? `빠른 사업 ${fast.length}개` : '', over.length ? `잔액이 마이너스인 사업 ${over.length}개` : ''].filter(Boolean).join(', ') + '가 있습니다.' : '모두 경과율과 비슷한 속도로 집행되고 있습니다.'}\n느림: 경과율보다 20%p 이상 낮음, 빠름: 15%p 이상 높음. 연말 일괄 집행 사업은 느리게 보일 수 있습니다.`;
    return {ok: true, text, llm: `관심 사업 ${h.length}개: 느림 ${slow.length}, 빠름 ${fast.length}, 경과율 ${el}%.`, data: {count: h.length, elapsed_pct: el},
      cards: [{type: 'list', title: '관심 사업 집행 상태', items: h.slice(0, 8).map(x => ({title: x.name, sub: `집행 ${pct(x.rate)} (경과율 대비 ${x.gap >= 0 ? '+' : ''}${x.gap}%p) · 잔액 ${won(x.balance)}원`, badge: {slow: '느림', fast: '빠름', over: '초과', ok: '보통'}[x.flag], tone: x.flag === 'ok' ? 'ok' : x.flag === 'slow' ? 'todo' : 'urgent'}))}, nav]};
  }; } }

  // "○○ 건 마감 언제야 / 어떻게 처리해?" — 메일에서 못 찾으면 문서(공문·결재)에서 찾는다
  { const def = CHAT_TOOLS.get('read_mail'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const r = await run0(a, ctx);
    if (!a.query || a.uid || a.mail_key || !r || !r.data || r.data.count !== 0 || !CHAT_TOOLS.has('read_doc')) return r;
    const d = await CHAT_TOOLS.get('read_doc').run({query: a.query}, ctx);
    return d && d.data && (d.data.read || d.data.count > 0) ? d : r;
  }; } }

  // 주간 실적 비교: 지난주와 이번 주를 같은 기준(상신 문서, 업무·복무 구분)으로 나란히
  { const def = CHAT_TOOLS.get('get_weekly_summary'); if (def) { const run0 = def.run; def.params.properties.compare = {type: 'boolean'}; def.run = async (a, ctx) => {
    if (!a.compare) return run0(a, ctx);
    const [p, c] = [await run0({week: 'last', draft: true}, ctx), await run0({week: 'this', draft: true}, ctx)];
    if (!p.ok || !c.ok) return p.ok ? c : p;
    const nums = r => { const txt = String(r.llm || ''), w = txt.match(/기안·보고\s*(\d+)건\s*\(결재완료\s*(\d+),\s*진행\s*(\d+)\)/), m = txt.match(/복무 신청\s*(\d+)건/); return {all: (r.data && r.data.count) || 0, work: w ? +w[1] : 0, done: w ? +w[2] : 0, going: w ? +w[3] : 0, personal: m ? +m[1] : 0}; };
    const A = nums(p), B = nums(c), md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`, sign = n => (n > 0 ? `+${n}` : String(n));
    const text = `지난주(${md(p.data.from)}~${md(p.data.to)}) 상신 ${A.all}건 → 이번 주(${md(c.data.from)}~${md(c.data.to)}) ${B.all}건(${sign(B.all - A.all)}).\n• 기안·보고: ${A.work}건 → ${B.work}건(${sign(B.work - A.work)}), 이번 주 결재완료 ${B.done}건·진행 ${B.going}건\n• 복무 신청: ${A.personal}건 → ${B.personal}건\n상신 문서 목록 기준이라 회의·외부 활동 같은 실적은 포함되지 않습니다. 이번 주는 오늘까지입니다.`;
    return {ok: true, text, llm: `지난주 ${A.all}건, 이번 주 ${B.all}건.`, data: {last: A, this: B}, cards: [...(p.cards || []).filter(x => x.type === 'note'), ...(c.cards || [])]};
  }; } }
