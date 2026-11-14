// GW 비서 · 자동화(v0.65): 정해 둔 시각에 조회 문장을 대신 실행해 대화창에 올려 둔다.
// 안전 원칙: ① 등록할 수 있는 것은 로컬 라우터가 "조회 도구"로 알아듣는 문장뿐이다(신청·예약·작성·화면 이동은 거절).
//           ② 자동 실행은 외부 AI를 부르지 않는다(31번 조각 chatSend의 auto 경로). ③ 그룹웨어 탭이 열려 있는 동안에만 돈다.
//           ④ 같은 규칙은 하루 한 번만 실행한다(늦게 켜면 그날 한 번은 실행).
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const AUTO_MAX = 8;
  const AUTO_PRESETS = [
    {id: 'morning', name: '아침 브리핑', prompt: '아침 브리핑 해줘', time: '09:00', days: [1, 2, 3, 4, 5]},
    {id: 'evening', name: '퇴근 전 점검', prompt: '퇴근 전 점검해줘', time: '17:30', days: [1, 2, 3, 4, 5]},
    {id: 'week', name: '주간 미리 보기', prompt: '이번 주 브리핑 해줘', time: '09:10', days: [1]},
    {id: 'mail', name: '안 읽은 메일 확인', prompt: '안 읽은 메일 보여줘', time: '13:30', days: [1, 2, 3, 4, 5]},
  ];
  const autoValid = r => !!(r && typeof r.id === 'string' && r.id && typeof r.prompt === 'string' && r.prompt.trim() && Array.isArray(r.days) && r.days.length && r.days.every(n => Number.isInteger(n) && n >= 0 && n <= 6) && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.time || '')));
  const autoList = () => { const a = store.get('autos', []); return (Array.isArray(a) ? a : []).filter(autoValid).slice(0, AUTO_MAX); };
  const autoSave = list => store.set('autos', list.filter(autoValid).slice(0, AUTO_MAX));
  // 자동 실행에 올릴 수 있는 문장인가: 로컬 라우터가 조회 도구로 알아듣는 말만.
  function autoCheckPrompt(prompt) {
    const it = R.chatIntent(String(prompt || ''), new Date()), def = it.tool && it.confidence >= 0.9 ? CHAT_TOOLS.get(it.tool) : null;
    if (!def) return {ok: false, why: '이 문장은 정해진 조회로 알아듣지 못해 자동화로 등록할 수 없습니다. “오늘 요약 알려줘”, “안 읽은 메일 보여줘”처럼 조회하는 말로 정해 주세요.'};
    if (['get_staff_status', 'lookup_person'].includes(it.tool)) return {ok: false, why: '다른 직원의 개인 일정·연락처는 반복 자동 조회하지 않습니다. 필요할 때 직접 물어봐 주세요.'};
    if (def.kind === 'act' || CHAT_AUTO_BLOCK.has(it.tool)) return {ok: false, why: '신청·예약·작성·화면 이동은 자동으로 실행하지 않습니다. 조회와 브리핑만 자동화할 수 있습니다.'};
    return {ok: true, tool: it.tool, label: def.label || it.tool};
  }
  function autoAdd({name = '', prompt = '', time = '', days = []} = {}) {
    const rule = {id: 'au' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: String(name || prompt).replace(/\s+/g, ' ').trim().slice(0, 24), prompt: String(prompt).replace(/\s+/g, ' ').trim().slice(0, 120), time: String(time), days: [...new Set((Array.isArray(days) ? days : []).map(Number))].sort((a, b) => a - b), on: true, last: '', lastAt: 0, made: Date.now()};
    if (!autoValid(rule)) return {ok: false, text: '실행 시각이나 요일을 알아보지 못했습니다.'};
    const chk = autoCheckPrompt(rule.prompt);
    if (!chk.ok) return {ok: false, text: chk.why};
    const list = autoList();
    if (list.some(r => r.prompt === rule.prompt && r.time === rule.time && r.days.join() === rule.days.join())) return {ok: false, text: '같은 자동화가 이미 있습니다.'};
    if (list.length >= AUTO_MAX) return {ok: false, text: `자동화는 ${AUTO_MAX}개까지 둘 수 있습니다. 쓰지 않는 것을 지운 뒤 추가해 주세요.`};
    // 오늘 이미 지난 시각이면 내일부터 실행한다(등록하자마자 실행되어 놀라지 않게).
    if (R.chatAutoDue(rule, Date.now())) rule.last = R.kstNow(new Date()).date;
    list.push(rule);
    if (autoSave(list) === false) return {ok: false, text: '저장 공간이 부족해 자동화를 저장하지 못했습니다.'};
    return {ok: true, rule, text: `자동화 “${rule.name}”을(를) 등록했습니다. ${R.chatScheduleLabel(rule.days, rule.time)}에 실행합니다.`};
  }
  const autoCardRefresh = () => { try { if (S.view === 'home' && typeof homePartialRefresh === 'function') homePartialRefresh(); } catch (e) { logError('auto.card', e.message); } };
  let autoBusy = false;
  // 실패한 규칙이 다른 규칙을 가로막거나 30초마다 반복되지 않게 잠시 쉰다.
  const autoRetry = new Map();
  const autoOwner = owner => owner !== 'default' && currentKey === owner && getUserKey() === owner;
  async function autoRun(id, manual = false) {
    const owner = currentKey, list = autoList(), r = list.find(x => x.id === id);
    if (!r || autoBusy || !autoOwner(owner)) return false;
    if (chatState().busy) { if (manual) toast('답변을 만드는 중입니다. 끝난 뒤 다시 눌러 주세요.'); return false; }
    if (!navigator.locks || typeof navigator.locks.request !== 'function') { if (manual) toast('중복 실행 방지 기능을 사용할 수 없어 실행하지 않았습니다.'); return false; }
    autoBusy = true;
    let ran = false, attempted = false;
    try {
      // 규칙별이 아니라 계정별로 잠가 서로 다른 규칙의 대화 저장도 겹치지 않게 한다.
      await navigator.locks.request('bwyfgw:auto:' + owner, {ifAvailable: true}, async lock => {
        if (!lock || !autoOwner(owner)) return;
        let latest = autoList(), cur = latest.find(x => x.id === id);
        if (!cur || (!manual && !R.chatAutoDue(cur, Date.now())) || chatState().busy) return;
        if (!manual && !S.loading && S.lastRefresh && Date.now() - new Date(S.lastRefresh).getTime() > 10 * 60000) { try { await refresh({silent: true}); } catch (e) { logError('auto.refresh', e.message); } }
        if (!autoOwner(owner)) return;
        // 새로 고침 중 규칙의 삭제·변경·끄기와 날짜 변경을 다시 확인한다.
        latest = autoList(); cur = latest.find(x => x.id === id);
        if (!cur || (!manual && !R.chatAutoDue(cur, Date.now()))) return;
        if (chatState().busy || S.loading || S.error || !S.a || !S.raw || S.raw.sessionExpired) return;
        if (!autoCheckPrompt(cur.prompt).ok) { logError('auto.run', '허용되지 않은 자동화 문장'); attempted = true; return; }
        const oldLast = cur.last, oldAt = cur.lastAt, stamp = Date.now();
        // 실행 전에 영구 기록한다. 시작 후 탭 종료/오류는 결과가 불확실하므로 자동 재실행하지 않는다.
        if (!manual) cur.last = R.kstNow(new Date(stamp)).date;
        cur.lastAt = stamp;
        attempted = true;
        if (autoSave(latest) === false) { logError('auto.save', '실행 기록 저장 실패'); return; }
        let promise;
        try {
          promise = chatSend(cur.prompt, {auto: cur.name || '자동화'});
          if (!chatState().busy) throw new Error('대화 실행을 시작하지 못함');
        } catch (e) {
          // 실제 시작 전의 확실한 실패만 되돌린다. 다른 탭의 변경은 보존한다.
          if (autoOwner(owner)) {
            const nowList = autoList(), nowRule = nowList.find(x => x.id === id);
            if (nowRule && nowRule.lastAt === stamp) { nowRule.last = oldLast; nowRule.lastAt = oldAt; if (autoSave(nowList) === false) logError('auto.save', '실행 기록 복구 실패'); }
          }
          throw e;
        }
        ran = true;
        await promise;
        if (autoOwner(owner) && S.open) toast(`“${cur.name}” 실행 결과를 홈 대화창에서 확인하세요.`);
      });
    } catch (e) { if (autoOwner(owner)) logError('auto.run', e.message || String(e)); }
    finally {
      if (attempted && !ran) autoRetry.set(owner + ':' + id, Date.now() + 60000);
      else if (ran) autoRetry.delete(owner + ':' + id);
      autoBusy = false;
      if (autoOwner(owner)) autoCardRefresh();
    }
    return ran;
  }
  function autoTick() {
    try {
      if (!autoOwner(currentKey) || !S.a || !S.raw || S.loading || S.error || S.raw.sessionExpired || autoBusy || chatState().busy) return;
      const now = Date.now(), due = autoList().find(r => (autoRetry.get(currentKey + ':' + r.id) || 0) <= now && R.chatAutoDue(r, now));
      if (due) autoRun(due.id);
    } catch (e) { logError('auto.tick', e.message); }
  }
  const autoTimer = setInterval(autoTick, 30000);
  // 재시작 시 다음 주기까지 기다리지 않고 놓친 오늘 일정을 확인한다.
  const autoStartTimer = setTimeout(autoTick, 0);

  // 홈 오른쪽 '자동화' 카드
  function autoCardHtml() {
    const list = autoList(), now = Date.now(), tday = R.kstNow(new Date()).date;
    const ranAt = r => { if (!r.lastAt) return ''; const k = new Date(r.lastAt + 9 * 3600000).toISOString(); return k.slice(0, 10) === tday ? `오늘 ${k.slice(11, 16)} 실행` : `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))} 실행`; };
    const rows = list.map(r => {
      const nx = R.chatAutoNext(r, now), on = r.on !== false;
      return `<li class="hm-auto${on ? '' : ' off'}"><button class="hm-sw" role="switch" aria-checked="${on}" data-act="autoToggle" data-v="${esc(r.id)}" aria-label="${esc(r.name)} 자동 실행" title="${on ? '끄기' : '켜기'}"><i></i></button><div class="hm-auto-b"><b>${esc(r.name)}</b><span>${esc(R.chatScheduleLabel(r.days, r.time))}${on ? (nx ? ' · 다음 ' + esc(nx.label) : '') : ' · 꺼짐'}${ranAt(r) ? ' · ' + esc(ranAt(r)) : ''}</span></div><button class="hm-ico" data-act="autoRun" data-v="${esc(r.id)}" title="지금 실행" aria-label="${esc(r.name)} 지금 실행">${ic('play')}</button><button class="hm-ico" data-act="autoDel" data-v="${esc(r.id)}" title="삭제" aria-label="${esc(r.name)} 삭제">${ic('x')}</button></li>`;
    }).join('');
    const have = new Set(list.map(r => r.prompt));
    const presets = list.length >= AUTO_MAX ? '' : AUTO_PRESETS.filter(p => !have.has(p.prompt)).slice(0, 3).map(p => `<button class="hm-chip" data-act="autoPreset" data-v="${esc(p.id)}" title="${esc(R.chatScheduleLabel(p.days, p.time))}에 “${esc(p.prompt)}” 실행">${ic('plus')}<span>${esc(p.name)}</span><small>${esc(R.chatScheduleLabel(p.days, p.time))}</small></button>`).join('');
    return `<section class="hm-card hm-autos" aria-label="자동화"><div class="hm-card-h"><h2 class="hm-card-k">자동화</h2><button class="hm-link" data-act="autoNew">직접 만들기</button></div>${rows ? `<ul class="hm-auto-l">${rows}</ul>` : '<p class="hm-empty">정해 둔 시각에 비서가 먼저 조회해 대화창에 올려 둡니다.</p>'}${presets ? `<div class="hm-auto-p">${presets}</div>` : ''}<p class="hm-note">그룹웨어 탭이 열려 있는 동안 실행합니다. 조회만 하며 신청·발송은 하지 않습니다.</p></section>`;
  }
  HOME_ACTS.autoPreset = (el, v) => { const p = AUTO_PRESETS.find(x => x.id === v); if (!p) return; const r = autoAdd(p); toast(r.text); autoCardRefresh(); };
  HOME_ACTS.autoToggle = (el, v) => { const list = autoList(), r = list.find(x => x.id === v); if (!r) return; r.on = r.on === false; if (r.on && R.chatAutoDue(r, Date.now())) r.last = R.kstNow(new Date()).date; autoSave(list); toast(`“${r.name}” 자동 실행을 ${r.on ? '켰습니다' : '껐습니다'}.`); autoCardRefresh(); };
  HOME_ACTS.autoRun = (el, v) => { autoRun(v, true); };
  HOME_ACTS.autoDel = (el, v) => { const list = autoList(), r = list.find(x => x.id === v); if (!r) return; if (!confirm(`자동화 “${r.name}”을(를) 삭제할까요?`)) return; autoSave(list.filter(x => x.id !== v)); toast(`자동화 “${r.name}”을(를) 삭제했습니다.`); autoCardRefresh(); };
  HOME_ACTS.autoNew = () => { const i = $('#chInput'); if (!i) return; if (!i.value.trim()) { i.value = '매일 9시에 '; chatState().draft = i.value; chatAutosize(i); } i.focus(); i.setSelectionRange(i.value.length, i.value.length); toast('언제, 무엇을 알려 드릴지 이어서 적어 주세요. 예) 매일 9시에 안 읽은 메일 알려줘'); };

  // ---------- 대화 도구 ----------
  const AUTO_EXAMPLES = ['매일 9시에 아침 브리핑 해줘', '평일 17시 30분에 퇴근 전 점검해줘', '매주 월요일 9시 10분에 이번 주 브리핑 해줘', '평일 13시 30분에 안 읽은 메일 보여줘'];
  const AUTO_NAMES = {run_briefing: '브리핑', get_overview: '오늘 요약', list_mail: '메일 확인', list_tasks: '할 일 확인', list_deadlines: '마감 기한 확인', get_schedule: '일정 확인', list_approvals: '결재함 확인', list_notices: '공지 확인', list_alerts: '알림 확인', get_staff_status: '직원 부재 확인', get_leave_status: '연차 현황', get_budget: '예산 확인'};
  chatRegisterTool({
    name: 'create_automation', label: '자동화 등록 준비', kind: 'act',
    description: '정해진 시각에 조회 문장을 자동 실행하는 자동화를 등록할 준비를 한다(확인 카드). text에 사용자의 말을 그대로 넣거나, prompt(실행할 조회 문장)·time(HH:MM)·days(0=일~6=토 배열)를 준다. 조회·브리핑만 가능하고 신청·예약·발송은 등록할 수 없다.',
    params: {type: 'object', properties: {text: {type: 'string'}, prompt: {type: 'string'}, time: {type: 'string'}, days: {type: 'array', items: {type: 'number'}}, name: {type: 'string'}}},
    run: async a => {
      const sc = R.chatParseSchedule(String(a.text || '')) || {};
      const prompt = String(a.prompt || sc.prompt || '').trim(), time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(a.time || '')) ? a.time : sc.time || '';
      const days = Array.isArray(a.days) && a.days.length ? a.days.map(Number) : sc.days || [];
      if (!prompt || !time || !days.length) return {ok: true, text: '언제, 무엇을 알려 드릴지 한 문장으로 말씀해 주세요. 조회와 브리핑을 자동화할 수 있습니다.', cards: [{type: 'chips', title: '이렇게 말해 보세요', items: AUTO_EXAMPLES}]};
      const chk = autoCheckPrompt(prompt);
      if (!chk.ok) return {ok: false, text: chk.why, cards: [{type: 'chips', title: '자동화할 수 있는 예', items: AUTO_EXAMPLES}]};
      const name = String(a.name || '').trim().slice(0, 24) || (/아침|출근/.test(prompt) && chk.tool === 'run_briefing' ? '아침 브리핑' : /퇴근|마무리/.test(prompt) ? '퇴근 전 점검' : /주간|이번\s*주/.test(prompt) && chk.tool === 'run_briefing' ? '주간 미리 보기' : AUTO_NAMES[chk.tool] || chatCut(prompt, 20));
      const label = R.chatScheduleLabel(days, time);
      return {ok: true, text: `${label}에 “${prompt}”를 자동으로 실행하도록 준비했습니다. 등록하려면 확인 카드의 버튼을 눌러 주세요.`, cards: [{type: 'confirm', title: '자동화 등록', risk: 'low', rows: [['이름', name], ['실행 시각', label], ['실행할 말', prompt], ['하는 일', `${chk.label} (조회만)`], ['실행 조건', '그룹웨어 탭이 열려 있을 때']], confirmLabel: '자동화 등록', cancelLabel: '취소', onConfirm: async () => { const r = autoAdd({name, prompt, time, days}); autoCardRefresh(); return {ok: r.ok, text: r.text}; }}]};
    },
  });
  chatRegisterTool({
    name: 'list_automations', label: '자동화 목록 확인', kind: 'read',
    description: '등록된 자동화(이름, 실행 시각, 켜짐 여부, 다음 실행)를 보여준다.',
    params: {type: 'object', properties: {}},
    run: async () => {
      const list = autoList(), now = Date.now();
      if (!list.length) return {ok: true, text: '등록된 자동화가 없습니다. 예시를 누르면 등록 확인 카드를 만들어 드립니다.', data: {count: 0}, cards: [{type: 'chips', title: '자동화 예', items: AUTO_EXAMPLES}]};
      return {ok: true, text: `등록된 자동화는 ${list.length}개이고, 켜져 있는 것은 ${list.filter(r => r.on !== false).length}개입니다. 그룹웨어 탭이 열려 있는 동안 실행합니다.`, data: {count: list.length, on: list.filter(r => r.on !== false).length},
        cards: [{type: 'list', title: '자동화', items: list.map((r, i) => { const nx = R.chatAutoNext(r, now); return {title: `${i + 1}. ${r.name}`, sub: `${R.chatScheduleLabel(r.days, r.time)} · “${r.prompt}”${r.on !== false && nx ? ' · 다음 ' + nx.label : ''}`, badge: r.on === false ? '꺼짐' : '켜짐', tone: r.on === false ? 'info' : 'ok'}; })}]};
    },
  });
  chatRegisterTool({
    name: 'manage_automation', label: '자동화 변경 준비', kind: 'act',
    description: '등록된 자동화를 끄거나(off) 켜거나(on) 삭제(delete)할 준비를 한다(확인 카드). query는 자동화 이름의 일부, index는 목록 순서.',
    params: {type: 'object', properties: {action: {type: 'string', enum: ['on', 'off', 'delete']}, query: {type: 'string'}, index: {type: 'number'}}, required: ['action']},
    run: async a => {
      const list = autoList(), action = ['on', 'off', 'delete'].includes(a.action) ? a.action : 'off';
      if (!list.length) return {ok: false, text: '등록된 자동화가 없습니다.'};
      const q = String(a.query || '').replace(/\s+/g, '');
      const hit = a.index ? [list[Number(a.index) - 1]].filter(Boolean) : q ? list.filter(r => (r.name + r.prompt).replace(/\s+/g, '').includes(q)) : list.length === 1 ? list : [];
      if (hit.length !== 1) return {ok: false, text: hit.length ? `일치하는 자동화가 ${hit.length}개입니다. 이름을 더 구체적으로 알려 주세요.` : '어느 자동화인지 이름을 알려 주세요.', cards: [{type: 'list', title: '자동화', items: list.map((r, i) => ({title: `${i + 1}. ${r.name}`, sub: R.chatScheduleLabel(r.days, r.time), badge: r.on === false ? '꺼짐' : '켜짐', tone: 'info'}))}]};
      const r = hit[0], what = {on: '켜기', off: '끄기', delete: '삭제'}[action];
      return {ok: true, text: `자동화 “${r.name}” ${what}를 준비했습니다.`, cards: [{type: 'confirm', title: `자동화 ${what}`, risk: 'low', rows: [['이름', r.name], ['실행 시각', R.chatScheduleLabel(r.days, r.time)], ['실행할 말', r.prompt]], confirmLabel: what, cancelLabel: '취소', onConfirm: async () => {
        const cur = autoList(), t = cur.find(x => x.id === r.id);
        if (!t) return {ok: false, text: '이미 없는 자동화입니다.'};
        let saved;
        if (action === 'delete') saved = autoSave(cur.filter(x => x.id !== r.id));
        else { t.on = action === 'on'; if (t.on && R.chatAutoDue(t, Date.now())) t.last = R.kstNow(new Date()).date; saved = autoSave(cur); }
        if (saved === false) return {ok: false, text: '저장하지 못했습니다. 다시 시도해 주세요.'};
        autoCardRefresh();
        return {ok: true, text: `자동화 “${r.name}”을(를) ${action === 'delete' ? '삭제했습니다' : action === 'on' ? '켰습니다' : '껐습니다'}.`};
      }}]};
    },
  });
