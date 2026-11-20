  // ---------- 46. 자유 질문 품질 (v0.91.0) ----------
  // 실사용 자유 질문 10개 점검에서 틀리던 유형: 놓치기 쉬운 일·휴가 전 처리, 신청 횟수, 사업 예산 상태, ○○ 건(메일 아니면 문서).

  // v0.95.0: 메일 할 일에 기한이 없으면, 회신·제출을 요구하는 본문의 날짜를 기한으로 본다(이미 읽은 메일만 본문을 연다: 읽음 상태가 바뀌지 않음)
  function cuRiskItem(x, det) {
    const it = {key: x.key, title: x.title, state: stateOf(x), base: x.base, type: x.type, deadline: x.deadline && x.deadline.date || '', when: x.when || ''};
    if (!it.deadline && det && !det.error) {
      const body = cuBodyText(det), d = R.cuBodyDeadline(R.extractAllDeadlines(body, new Date()), R.cuReplyNeed({subject: det.subject || x.title, text: body}), today(), {body, self: (S.raw && S.raw.principal && S.raw.principal.name) || ''});
      if (d) { it.deadline = d; it.dlSource = 'body'; }
    }
    return it;
  }
  const cuCachedDet = x => (x.type === 'mail' && x.ref && S.mailDet && S.mailDet[x.ref.uid] && !S.mailDet[x.ref.uid].error ? S.mailDet[x.ref.uid] : null);
  function cuRiskItemsCached() { return mineVisible().map(x => cuRiskItem(x, cuCachedDet(x))); }
  async function cuRiskItemsLoad(max = 8) {
    const out = []; let opened = 0, unread = 0;
    for (const x of mineVisible()) {
      let det = cuCachedDet(x);
      if (!det && x.type === 'mail' && x.ref && x.ref.uid && !(x.deadline && x.deadline.date)) {
        const rec = findMail(x.ref.box, x.ref.uid) || findMail('', x.ref.uid);
        if (rec && rec.seen === true && opened < max) { opened++; try { det = await loadMailDetail(rec, false); } catch { det = null; } }
        else if (rec && rec.seen !== true) unread++;
      }
      out.push(cuRiskItem(x, det));
    }
    return {items: out, unread};
  }

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
      const {items, unread} = await cuRiskItemsLoad(8);
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
      const basis = `기준: 기한(회신·제출을 요구하는 메일은 본문의 날짜 포함), 하루 넘게 안 읽은 요청 메일, 이틀 넘은 답장 확인, 근태 확인, 반려 문서.${unread ? ` 안 읽은 메일 ${unread}통은 열면 읽음으로 바뀌어 본문 기한을 보지 않았습니다.` : ''}`;
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
      const text = `${p.label} ${c.count ? `${R.cuJosa(a.kind, '은는')} ${c.count}번입니다(${c.days ? `하루 단위 ${c.days}일` : ''}${c.days && c.partial ? ', ' : ''}${c.partial ? `외출·반차 ${c.partial}번` : ''})` : `${a.kind} 기록은 없습니다`}.${c.pending ? ` 결재 중인 신청 ${c.pending}건은 따로입니다.` : ''}\n승인된 근태 신청 기준입니다.${partial ? ' 신청 자료는 최근 150일만 읽으므로 그보다 앞선 기간은 빠졌을 수 있습니다.' : ''}`;
      return {ok: true, text, llm: `${p.label} ${a.kind} ${c.count}번(${c.days}일).`, data: {count: c.count, days: c.days, pending: c.pending},
        cards: c.items.length ? [{type: 'list', title: `${p.label} ${a.kind}`, items: c.items.slice(0, 10).map(x => ({title: `${md8(x.start)}${x.end !== x.start ? '~' + md8(x.end) : ''} ${x.name}`})), more: Math.max(0, c.items.length - 10)}, {type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'}] : [{type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'}]};
    };
  } }

  // 예산: "내가 맡은 사업 예산 괜찮아?"처럼 사업 이름이 없으면 관심 사업 전체의 집행 상태(경과율 대비)를 답한다
  { const def = CHAT_TOOLS.get('get_budget'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const rest = String(a.project || '').replace(/(이번\s*달|이번\s*년|올해|지금|현재|요즘|최근|요새|내가|제가|맡은|담당|담당한|우리|내|저희|사업들?|예산|집행률?|괜찮[가-힣]*|어때|어떤가요?|잘|되고|되는지|돼|있어|있나|현황|전체|부서|관심|상태|좀|해\s*줘|알려\s*줘|봐\s*줘|확인|[?？!.,])/g, ' ').replace(/\s+/g, '').trim();
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

  // ---------- v0.93.0: 자유 질문 2차 ----------
  // 문서 금액: "○○ 문서 금액 얼마였지?" → 문서 색인 본문에서 금액과 맥락
  { const def = CHAT_TOOLS.get('read_doc'); if (def) { const run0 = def.run; def.params.properties.want = {type: 'string', enum: ['amount']}; def.run = async (a, ctx) => {
    const st = chatState(), before = st.ctx.docFocus, r = await run0(a, ctx);
    if (a.want !== 'amount' || !r || !r.ok || !(r.data && r.data.read) || st.ctx.docFocus === before || !st.ctx.docFocus) return r;
    const am = R.cuAmounts(st.ctx.docFocus.body || '', 6);
    const head = am.length ? `문서에 적힌 금액 가운데 가장 큰 것은 ${won(am[0].won)}원${am[0].label ? `(${am[0].label})` : ''}입니다.` : '문서 색인 본문에서 금액을 찾지 못했습니다. 붙임 파일에 있을 수 있으니 “그 문서 첨부 내용 정리해줘”로 확인해 보세요.';
    return {...r, text: `${head}\n${r.text}`, cards: [...(am.length ? [{type: 'list', sensitive: true, title: '문서에 적힌 금액 (큰 순)', items: am.map(x => ({title: `${won(x.won)}원${x.label ? ' · ' + x.label : ''}`, sub: x.text}))}] : []), ...(r.cards || [])]};
  }; } }

  // 공지 관련성: 내 부서·관심 사업·최근 내 문서 제목 낱말과 겹치는 공지만
  { const def = CHAT_TOOLS.get('list_notices'); if (def) { const run0 = def.run; def.params.properties.relevant = {type: 'boolean'}; def.run = async (a, ctx) => {
    if (!a.relevant) return run0(a, ctx);
    if (!S.a || !S.raw) return chatNotReady();
    const nt = S.a.notice || {}, list = Array.isArray(nt.recent) ? nt.recent : [];
    const mineDocs = ((S.a.approval && S.a.approval.lists && S.a.approval.lists.submitted && S.a.approval.lists.submitted.docs) || []).slice(0, 40).map(d => d.title);
    const kw = [String((S.raw.principal && S.raw.principal.deptName) || ''), ...(S.settings.budget || []).map(b => b.label || ''), ...mineDocs].flatMap(x => R.cuKeywords(x));
    const hits = R.cuNoticeRelevance(list, kw);
    if (!list.length) return {ok: true, text: '최근 공지가 없습니다.', data: {count: 0}};
    return {ok: true, text: hits.length ? `최근 공지 ${list.length}건 가운데 내 부서·사업·최근 문서와 낱말이 겹치는 공지는 ${hits.length}건입니다.` : `최근 공지 ${list.length}건 가운데 내 부서·사업·최근 문서와 낱말이 겹치는 공지는 없습니다.`, llm: `관련 공지 ${hits.length}건.`,
      data: {count: hits.length, items: hits.slice(0, 8).map(x => ({itemId: '', title: x.title || '', url: x.url || '', type: 'board'}))},
      cards: [...(hits.length ? [{type: 'list', title: '관련 있어 보이는 공지', items: hits.slice(0, 8).map(x => ({title: x.title || '(제목 없음)', sub: `겹친 낱말: ${x.matched.slice(0, 3).join(', ')} · ${String(x.date || '').slice(0, 10)}`, badge: x.read ? '' : '안 읽음', tone: x.read ? 'info' : 'todo', ...(x.url ? {act: {act: 'chatOpenUrl', v: x.url}} : {})}))}] : []), {type: 'note', tone: 'info', text: '판단 기준: 부서 이름, 관심 사업, 최근 내가 올린 문서 제목의 낱말. 낱말이 겹치지 않는 관련 공지는 놓칠 수 있습니다.'}]};
  }; } }

  // 결재 기다리는 내 신청: 승인 전 근태 신청만
  { const def = CHAT_TOOLS.get('list_my_requests'); if (def) { const run0 = def.run; def.params.properties.pending = {type: 'boolean'}; def.run = async (a, ctx) => {
    if (!a.pending) return run0(a, ctx);
    if (!S.raw) return chatNotReady();
    let dt; try { dt = await loadApps(); } catch (e) { return {ok: false, text: '근태 신청 내역을 읽지 못했습니다: ' + cuCut(e.message, 80)}; }
    const pend = (dt.apps || []).filter(x => String(x.empCd) === String(dt.me) && x.deleteReqYn !== 'Y' && String(x.approState) === '0').sort((x, y) => String(x.startDt).localeCompare(String(y.startDt)));
    const md8 = d => `${+String(d).slice(4, 6)}/${+String(d).slice(6, 8)}`;
    return {ok: true, text: pend.length ? `결재를 기다리는 내 근태 신청은 ${pend.length}건입니다.` : '결재를 기다리는 내 근태 신청은 없습니다(최근 150일 신청 기준).', llm: `승인 전 신청 ${pend.length}건.`, data: {count: pend.length},
      cards: pend.length ? [{type: 'list', title: '승인 전 신청', items: pend.slice(0, 8).map(x => ({title: `${md8(x.startDt)}${x.endDt && x.endDt !== x.startDt ? '~' + md8(x.endDt) : ''} ${x.atNm || '신청'}`, badge: '승인 전', tone: 'todo'}))}, {type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'}] : [{type: 'note', tone: 'info', text: '결재문서(상신 문서)의 진행 상황은 “결재 올린 거 중에 안 끝난 거 있어?”로 확인할 수 있습니다.'}]};
  }; } }

  // ---------- v0.97.0: 업무 문장 쓰기 ----------
  // 앞에서 다룬 메일에서 확인한 사실(요청 문장·기한·첨부, AI 정리가 있으면 그 요약)만으로 상급자 보고 문장·부서 공유 문구를 만든다. 새로 외부로 보내지 않는다.
  chatRegisterTool({
    name: 'write_text', label: '업무 문장 쓰기', kind: 'read',
    description: '앞에서 다룬 메일로 상급자 보고 문장(kind=report)이나 부서 공유 메일 문구(kind=share)를 만든다. 확인된 사실만 쓰고 모르는 칸은 (작성 필요)로 남긴다. 공유는 전달 창에 넣을 수 있다(보내기는 직접).',
    params: {type: 'object', properties: {kind: {type: 'string', enum: ['report', 'share']}}},
    run: async a => {
      if (!S.a || !S.raw) return chatNotReady();
      const f = cuFocus(), kind = a.kind === 'share' ? 'share' : 'report';
      if (!f) return {ok: true, text: '어느 메일로 쓸지 먼저 정해 주세요. 예) “○○ 메일 요약해줘” 다음에 “팀장님께 보고할 문장으로 써줘”', data: {count: 0}};
      const x = {type: 'mail', key: f.key, title: f.title, ref: {box: f.box, uid: f.uid}};
      const rec = findMail(f.box, f.uid) || findMail('', f.uid);
      let det = S.mailDet && S.mailDet[f.uid] && !S.mailDet[f.uid].error ? S.mailDet[f.uid] : null;
      if (!det && rec && rec.seen === true) { try { det = await loadMailDetail(rec, false); } catch { det = null; } }
      if (!det || det.error) return {ok: true, text: `“${cuCut(f.title, 40)}” 메일 본문을 아직 읽지 않았습니다. 먼저 “그 메일 요약해줘”로 읽은 뒤 다시 말씀해 주세요.`, data: {count: 0}};
      const body = cuBodyText(det), need = R.cuReplyNeed({subject: det.subject || f.title, text: body});
      const dls = R.extractAllDeadlines(body, new Date()).map(d => d.date), ai = f.ai || null;
      const lines = R.cuWriteLines({subject: det.subject || f.title, from: String(det.from || '').replace(/<[^>]*>/g, '').replace(/["']/g, '').trim(), asks: ai && ai.asks.length ? ai.asks.map(q => q.what + (q.due ? ` (${cuMd(q.due)})` : '')) : R.mailHighlights(body).map(h => h.replace(/\s*\/?\s*\[[^\]]{2,20}\]\s*\d*\.?\s*$/, '').trim()).filter(h => h.length >= 15 && !/^\[/.test(h)).slice(0, 2), summary: ai ? ai.summary : [], need: ai ? ai.reply_needed : need.need, deadlines: ai && ai.asks.some(q => q.due) ? ai.asks.map(q => q.due).filter(Boolean) : dls, files: cuFiles(det)}, kind);
      copyText(lines.join('\n'));
      const cards = [{type: 'note', sensitive: true, tone: 'info', text: `**${kind === 'share' ? '부서 공유 문구' : '보고 문장'}** (복사해 두었습니다)\n${lines.join('\n')}`}];
      if (kind === 'share') cards.push({type: 'confirm', title: '전달 창 열고 공유 문구 넣기', risk: 'low', rows: [['대상 메일', f.title], ['동작', '이 메일의 전달 창을 열고 위 문구를 맨 위에 넣습니다'], ['받는 사람·보내기', '직접 정하고 직접 누릅니다']], confirmLabel: '전달 창 열기', cancelLabel: '취소', onConfirm: async () => { const r = await cmdMailReplyTo('공유 메일', 'custom', x, lines, 'fw'); return r === 'filled' ? {ok: true, text: '전달 창에 공유 문구를 넣었습니다. 받는 사람을 정하고 [보내기]는 직접 누르세요.'} : r === 'opened' ? {ok: true, text: '전달 창은 열었지만 문구를 넣지 못했습니다. 복사해 둔 문구를 붙여넣기(Ctrl+V) 하세요.'} : {ok: false, text: '전달 창을 열지 않았습니다.'}; }});
      return {ok: true, text: `“${cuCut(det.subject || f.title, 40)}” 메일로 ${kind === 'share' ? '부서 공유 문구를' : '보고 문장을'} 만들었습니다. 메일에서 확인한 사실만 썼습니다.${lines.some(l => /작성 필요|확인 필요/.test(l)) ? ' (작성 필요)·(확인 필요) 칸은 직접 채워 주세요.' : ''}${ai ? ' AI 정리 결과를 함께 썼습니다.' : ''}`, llm: `${kind === 'share' ? '공유 문구를' : '보고 문장을'} 화면에 표시했습니다.`, data: {count: lines.length}, cards};
    },
  });

  // 주간 실적 "한 문단으로" → 줄글
  { const def = CHAT_TOOLS.get('get_weekly_summary'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const r = await run0(a, ctx);
    if (!r || !r.ok || a.compare || !/(문단|문장으로|줄글|서술|한\s*단락)/.test((ctx && ctx.userText) || '') || typeof r.llm !== 'string') return r;
    const txt = r.llm, w = txt.match(/기안·보고\s*(\d+)건\s*\(결재완료\s*(\d+),\s*진행\s*(\d+)\)/), m = txt.match(/복무 신청\s*(\d+)건/);
    const titles = [...txt.matchAll(/^\s+-\s+(.+?)(?:\s+\(.*\))?$/gm)].map(x => x[1].replace(/\s*—.*$/, '')).slice(0, 3);
    const span = (r.text.match(/^(.+?\))\s*상신/) || [])[1] || '이번 주';
    const para = `${span}에는 기안·보고 ${w ? w[1] : 0}건(결재완료 ${w ? w[2] : 0}건, 진행 ${w ? w[3] : 0}건)을 처리했습니다.${titles.length ? ` 주요 업무는 ${titles.join(', ')} 등입니다.` : ''}${m ? ` 이 밖에 복무 신청 ${m[1]}건이 있었습니다.` : ''}`;
    copyText(para);
    return {...r, text: `${para}\n(복사해 두었습니다. 상신 문서 기준이라 회의·외부 활동은 직접 보태 주세요.)`, cards: (r.cards || []).filter(c => c.type === 'nav')};
  }; } }
