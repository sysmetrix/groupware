// GW 비서 · 대화 도구: 내 할 일 조회, 예상 집행률 (v1.17). 읽기 전용(쓰기는 add_todo와 화면 버튼만).
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  if (typeof chatRegisterTool === 'function') {
    chatRegisterTool({
      name: 'list_todos', label: '내 할 일 보기', kind: 'read',
      description: '내 할 일(그룹웨어 개인 ToDo) 목록. scope: open(진행 중) | due(오늘·지난 기한) | week(7일 안) | important | plan(예산 계획) | done(끝낸 일).',
      params: {type: 'object', properties: {scope: {type: 'string', enum: ['open', 'due', 'week', 'important', 'plan', 'done']}}},
      run: async a => {
        if (typeof todoLoad !== 'function' || !todoGwOk()) return {ok: false, text: '그룹웨어 ToDo에 연결하지 못했습니다.'};
        if (!TD.list || Date.now() - TD.lastLoad > 60000) await todoLoad({force: true, sweep: false});
        if (!TD.list) return {ok: false, text: '그룹웨어 ToDo를 읽지 못했습니다' + (TD.err ? `: ${TD.err}` : '.')};
        const scope = ['open', 'due', 'week', 'important', 'plan', 'done'].includes(a.scope) ? a.scope : 'open', t0 = today();
        const pick = {open: t => !t.done, due: t => !t.done && t.due && t.due <= t0, week: t => !t.done && t.due && R.dday(t.due) <= 7, important: t => !t.done && t.important, plan: t => !t.done && t.meta && t.meta.b && t.meta.b.c, done: t => t.done && t.doneDate && R.dday(t.doneDate) >= -7}[scope];
        const list = R.tdSort(TD.list.filter(pick));
        const s = R.tdSummary(TD.list);
        const label = {open: '진행 중인 내 할 일', due: '오늘까지인 내 할 일', week: '7일 안에 기한인 내 할 일', important: '중요한 내 할 일', plan: '예산 집행 계획', done: '최근 7일에 끝낸 할 일'}[scope];
        const line = t => `${t.important ? '★ ' : ''}${t.title}${t.due ? ` (${t.due.slice(5).replace('-', '/')} · ${R.dday(t.due) < 0 ? -R.dday(t.due) + '일 지남' : R.dday(t.due) === 0 ? '오늘' : 'D-' + R.dday(t.due)})` : ''}${t.meta && t.meta.b && t.meta.b.c ? ` · ${t.meta.b.n || ''} ${won(t.meta.b.a)}원` : ''}`;
        const text = list.length ? `${label} ${list.length}건입니다.${scope === 'open' ? ` (지난 기한 ${s.late} · 오늘 ${s.today} · 중요 ${s.important})` : ''}\n${list.slice(0, 10).map((t, i) => `${i + 1}. ${line(t)}`).join('\n')}${list.length > 10 ? `\n외 ${list.length - 10}건` : ''}` : `${label}이 없습니다.`;
        return {ok: true, text, llm: text, data: {count: list.length, items: list.slice(0, 10).map(t => ({title: t.title, due: t.due, important: t.important, done: t.done}))}, cards: [{type: 'nav', label: '내 할 일 열기', view: 'mytodo'}, ...(scope === 'due' && list.length ? [{type: 'nav', label: '퇴근 전 마무리 열기', view: 'mytodo', v: 'wrap'}] : [])]};
      },
    });
    chatRegisterTool({
      name: 'budget_forecast', label: '예상 집행률', kind: 'read',
      description: '내 관심 사업(항)의 현재 집행률과 집행 계획을 반영한 연말 예상 집행률, 목표까지 남은 금액. project: 사업명 일부(비우면 첫 관심 사업).',
      params: {type: 'object', properties: {project: {type: 'string'}}},
      run: async a => {
        const pins = (S.settings.budget || []).filter(p => p && p.project && p.filter);
        if (!pins.length) return {ok: false, text: '예산 집행 화면에서 내 관심 사업(항)을 먼저 저장해 주세요. 그 사업의 예상 집행률을 계산합니다.', cards: [{type: 'nav', label: '예산 집행 열기', view: 'budget'}]};
        const q = String(a.project || '').replace(/(예상|전망|예측|집행률|집행|예산|계획|알려\s*줘|보여\s*줘|얼마|돼|될까|[?？])/g, ' ').replace(/\s+/g, '').toLowerCase();
        const hit = q && pins.find(p => `${p.label || ''}${p.filter}${p.project}`.replace(/\s+/g, '').toLowerCase().includes(q));
        // v1.18.1: 사업을 집지 않았고 내 사업이 여러 개면 모두와 합계를 답한다
        if (!hit && pins.length > 1) {
          try {
            const all = [];
            for (const p of pins.slice(0, 8)) { const c = await bpForecastFor(p.project, p.filter); if (c.f.budget) all.push({p, f: c.f, sug: Object.keys(c.sug || {}).length, led: !!c.led}); }
            if (!all.length) return {ok: false, text: '내 사업의 예산 자료를 읽지 못했습니다.'};
            const s = k => all.reduce((a, x) => a + (x.f[k] || 0), 0), B = s('budget'), E = s('executed'), P = s('planned'), F = s('forecast');
            const lines = [`내 사업 ${all.length}개 합계 집행률은 지금 ${pct(B ? E / B * 100 : 0)}, 집행 계획을 반영하면 ${pct(B ? F / B * 100 : 0)}로 예상됩니다. 계획 없는 잔액은 ${won(Math.max(0, B - F))}원입니다.`];
            for (const x of all) lines.push(`• ${x.p.label || x.p.filter}: ${pct(x.f.rate)} → 예상 ${pct(x.f.forecastRate)} · 계획 없는 잔액 ${won(Math.max(0, x.f.budget - x.f.forecast))}원${x.sug ? ` · 짝 확인 ${x.sug}건` : ''}${x.f.warnings.length ? ` · 확인할 것 ${x.f.warnings.length}건` : ''}`);
            if (all.some(x => !x.led)) lines.push('확인 제한: 일부 사업은 결의 내역을 읽지 못해 짝짓기가 빠졌습니다.');
            return {ok: true, text: lines.join('\n'), llm: lines.join(' '), data: {projects: all.map(x => ({project: x.p.label || x.p.filter, rate: Math.round(x.f.rate * 10) / 10, forecast: Math.round(x.f.forecastRate * 10) / 10})), total_rate: B ? Math.round(E / B * 1000) / 10 : 0}, cards: [{type: 'nav', label: '내 사업 한눈에 열기', view: 'budget', v: 'mine'}]};
          } catch (e) { logError('chat.forecastAll', e.message); return {ok: false, text: '예상 집행률을 계산하지 못했습니다: ' + String(e.message || e).slice(0, 80)}; }
        }
        const pin = hit || pins[0];
        try {
          const c = await bpForecastFor(pin.project, pin.filter), f = c.f;
          if (!f.budget) return {ok: false, text: `${pin.label || pin.filter}의 예산 자료를 읽지 못했습니다.`};
          const lines = [`${pin.label || pin.filter} 집행률은 지금 ${pct(f.rate)}이고, 집행 계획을 반영하면 ${pct(f.forecastRate)}로 예상됩니다.`, `• 예산 ${won(f.budget)}원 · 집행 ${won(f.executed)}원 · 남은 계획 ${won(f.planned)}원`, f.gap > 0 ? `• 목표 ${f.target}%까지 ${won(f.gap)}원은 아직 계획이 없습니다` : f.gap < 0 ? `• 목표보다 ${won(-f.gap)}원 많게 계획했습니다` : `• 목표 ${f.target}%와 계획이 같습니다`];
          if (Object.keys(c.sug).length) lines.push(`• 결의가 들어온 것 같은 계획 ${Object.keys(c.sug).length}건은 확인이 필요합니다`);
          for (const w of f.warnings.slice(0, 3)) lines.push('• ' + w.text);
          if (!c.led) lines.push('확인 제한: 결의 내역을 읽지 못해 짝짓기와 월별 곡선은 빠졌습니다.');
          return {ok: true, text: lines.join('\n'), llm: lines.join(' '), data: {project: pin.label || pin.filter, rate: Math.round(f.rate * 10) / 10, forecast: Math.round(f.forecastRate * 10) / 10, gap: f.gap}, cards: [{type: 'nav', label: '집행 계획·예상 열기', view: 'budget', v: 'plan'}]};
        } catch (e) { logError('chat.forecast', e.message); return {ok: false, text: '예상 집행률을 계산하지 못했습니다: ' + String(e.message || e).slice(0, 80)}; }
      },
    });
  }
