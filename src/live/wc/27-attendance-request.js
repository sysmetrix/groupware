// GW 비서 · 근태신청 준비 (출장·휴가·시간외/휴일근무)
// 먼저 날짜·종류·사유를 묻고, 그룹웨어 근태신청서(HPD0110)의 해당 양식을 열어 칸을 채운 뒤 [신청완료] 직전에서 멈춘다.
// 신청완료·추가신청·신청취소는 누르지 않는다(사람이 직접). 채운 값은 화면에서 다시 읽어 맞는지 보고한다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const ATT_FORM = {trip: '출장신청서', leave: '연차휴가신청서', overtime: '연장근무신청서'};
  const ATT_TYPES = [['trip', '출장'], ['leave', '휴가'], ['overtime', '시간외·휴일근무']];
  const ATT_LEAVE_KINDS = ['연차', '오전반차', '오후반차', '외출', '조퇴', '대체휴가', '보상휴가', '오전반차(보상)', '오후반차(보상)'];
  const ATT_KINDS = {trip: ['관내출장', '관외출장'], leave: ATT_LEAVE_KINDS, overtime: ['연장근무', '휴일근무', '조기근무']};
  const ATT_TRANSPORTS = ['대중교통', '자가용', '관용차량'];
  // 종류별 기본 시각 [시작, 종료, 신청서에서 시간이 고정되는가]. 고정 종류는 신청서의 시간칸이 잠겨 있어 날짜만 반영한다.
  const ATT_TIMES = {trip: ['09:00', '18:00', false], 연차: ['09:00', '18:00', true], 오전반차: ['09:00', '14:00', true], 오후반차: ['14:00', '18:00', true], 대체휴가: ['09:00', '18:00', true], 보상휴가: ['09:00', '18:00', true], '오전반차(보상)': ['09:00', '14:00', true], '오후반차(보상)': ['14:00', '18:00', true], 외출: ['09:00', '10:00', false], 조퇴: ['16:00', '18:00', false], 연장근무: ['18:00', '21:00', false], 휴일근무: ['09:00', '18:00', false], 조기근무: ['07:00', '09:00', false]};
  const attTimesOf = (type, kind) => ATT_TIMES[type === 'trip' ? 'trip' : kind] || ['09:00', '18:00', false];
  // 날짜 검증·연도 판단은 parseKoreanDate 한 곳에서 한다(2/30 거부, 적은 연도 우선). '11-20'만 여기서 11/20으로 바꿔 넘긴다.
  const attYmd = s => { const v = String(s || '').trim(); const p = v && parseKoreanDate(v.replace(/^(\d{1,2})-(\d{1,2})$/, '$1/$2')); return p ? p.iso : ''; };

  // 근태 신청 준비 창: 구분(출장·휴가·시간외/휴일근무)과 종류를 고르고, 시작·종료를 일시로 고른다. 취소하면 null.
  function askAttendance(st, model) {
    return new Promise(res => {
      S.paletteOpen = true; S.menuOpen = ''; S.helpOpen = false;
      const ov = $('#overlay');
      const kindOf = () => (st.type === 'overtime' && st.pay === '보상' ? st.kind + '(보상)' : st.kind);
      const setDefaults = () => { const [a, b, fixed] = attTimesOf(st.type, st.kind); if (st.timeTouched && !fixed) return; const d1 = String(st.s).slice(0, 10), d2 = st.type === 'overtime' ? d1 : String(st.e || st.s).slice(0, 10); st.s = d1 + 'T' + a; st.e = d2 + 'T' + b; st.timeTouched = false; };
      const retitle = () => {
        if (st.titleTouched) return;
        const from = String(st.s).slice(0, 10), to = st.type === 'overtime' ? from : String(st.e || st.s).slice(0, 10);
        const r = R.predictAttendanceTitle(model, {type: st.type, kind: kindOf(), from, to});
        st.title = r ? r.title : ''; st.basis = r ? r.basis : '';
        const ti = $('#att_title'), bs = $('#att_basis');
        if (ti) ti.value = st.title; if (bs) bs.textContent = st.basis;
      };
      const read = () => { for (const [k, id] of [['kind', 'att_kind'], ['pay', 'att_pay'], ['s', 'att_s'], ['e', 'att_e'], ['visit', 'att_visit'], ['purpose', 'att_purpose'], ['content', 'att_content'], ['reason', 'att_reason'], ['transport', 'att_tr'], ['title', 'att_title']]) { const el = $('#' + id); if (el) st[k] = String(el.value || '').trim(); } };
      const paint = () => {
        const [ts, te, fixed] = attTimesOf(st.type, st.kind);
        const lab = (t, inner) => '<label style="display:flex;flex-direction:column;gap:4px;margin:10px 0 0;font-size:13px;color:var(--muted)">' + t + inner + '</label>';
        const inp = (id, v, ph = '', typ = 'text') => '<input class="inp" id="' + id + '" type="' + typ + '" value="' + esc(v || '') + '" placeholder="' + esc(ph) + '" autocomplete="off" style="height:40px;font-size:14px;color:var(--fg)">';
        const sel = (id, opts, cur) => '<select class="inp" id="' + id + '" style="height:40px;font-size:14px;color:var(--fg)">' + opts.map(([v, t]) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>';
        const w = {trip: '출장', leave: '휴가', overtime: '근무'}[st.type];
        const note = fixed ? '“' + st.kind + '”은 신청서에서 시간이 ' + ts + '~' + te + '로 정해집니다(날짜만 반영).' : st.type === 'trip' ? '여러 날이면 시각은 매일 같은 시작·종료 시각으로 들어갑니다.' : st.type === 'overtime' ? '종료 일시를 비우면 신청서의 작성기준(태깅 시간 등)대로 둡니다.' : '';
        ov.innerHTML = '<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(600px,94vw);padding:22px 24px;max-height:92vh;overflow:auto" role="dialog" aria-label="근태 신청 준비"><h2 style="margin:0 0 6px;font-size:17px">근태 신청 준비</h2>'
          + '<div class="muted" style="margin-bottom:8px">구분과 일시를 고르면 신청서를 채우고 [신청완료] 직전에서 멈춥니다.</div>'
          + '<div role="radiogroup" aria-label="신청 구분" style="display:flex;gap:8px;margin:6px 0 2px">' + ATT_TYPES.map(([v, t]) => '<button type="button" class="btn' + (v === st.type ? ' primary' : '') + '" role="radio" aria-checked="' + (v === st.type) + '" data-atype="' + v + '">' + t + '</button>').join('') + '</div>'
          + lab('종류', sel('att_kind', ATT_KINDS[st.type].map(k => [k, k]), st.kind))
          + (st.type === 'overtime' ? lab('신청 구분 (수당 / 보상)', sel('att_pay', [['수당', '수당'], ['보상', '보상']], st.pay)) : '')
          + lab(w + ' 시작 일시', inp('att_s', st.s, '', 'datetime-local')) + lab(w + ' 종료 일시' + (st.type === 'overtime' ? ' (선택)' : ''), inp('att_e', st.e, '', 'datetime-local'))
          + (note ? '<div class="muted" style="font-size:12.5px;margin-top:4px">' + esc(note) + '</div>' : '')
          + (st.type === 'trip' ? lab('방문처', inp('att_visit', st.visit, '예) 부천시청')) + lab('출장목적', inp('att_purpose', st.purpose, '예) 업무 협의')) + lab('업무내용', inp('att_content', st.content, '예) 청소년 정책 협의 회의 참석 (비우면 출장목적과 같게)')) + lab('교통수단', sel('att_tr', [['', '선택 안 함'], ...ATT_TRANSPORTS.map(t => [t, t])], st.transport)) : lab('비고(사유)', inp('att_reason', st.reason, '예) 결과보고서 작성')))
          + lab('제목 (내 지난 근태 문서 형식으로 자동 결정 · 직접 고칠 수 있음)', inp('att_title', st.title, '')) + '<div class="muted" id="att_basis" style="font-size:12.5px;margin-top:4px">' + esc(st.basis || '') + '</div>'
          + '<div id="att_err" role="alert" style="color:var(--hi);font-size:13px;margin-top:8px;min-height:1em"></div>'
          + '<div class="acts" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="askNo">취소</button><button class="btn primary" id="askOk">신청서 채우기</button></div></div></div>';
        const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
        ov.querySelectorAll('[data-atype]').forEach(b => b.addEventListener('click', () => { read(); st.type = b.dataset.atype; st.kind = ATT_KINDS[st.type][0]; st.titleTouched = false; setDefaults(); retitle(); paint(); }));
        on('#att_kind', 'change', () => { read(); setDefaults(); retitle(); paint(); });
        on('#att_pay', 'change', () => { read(); retitle(); });
        for (const id of ['#att_s', '#att_e']) on(id, 'change', () => {
          read();
          const [a, b, fx] = attTimesOf(st.type, st.kind);
          if (id === '#att_s' && st.e && st.e.slice(0, 10) < st.s.slice(0, 10)) st.e = st.s.slice(0, 10) + st.e.slice(10);
          if (st.type === 'overtime' && st.e) st.e = st.s.slice(0, 10) + st.e.slice(10);
          if (!fx && (st.s.slice(11, 16) !== a || (st.e && st.e.slice(11, 16) !== b))) st.timeTouched = true;
          const e2 = $('#att_e'); if (e2) e2.value = st.e || '';
          retitle();
        });
        on('#att_title', 'input', () => { const v = ($('#att_title').value || '').trim(); st.titleTouched = !!v; if (!v) retitle(); });
        let settled = false;
        const obs = new MutationObserver(() => { if (!ov.querySelector('#askOk') && !settled) { settled = true; obs.disconnect(); res(null); } });
        const done = v => { if (settled) return; settled = true; obs.disconnect(); closeOverlay(); res(v); };
        const err = t => { const x = $('#att_err'); if (x) x.textContent = t; };
        on('#askNo', 'click', () => done(null));
        on('#askOk', 'click', () => {
          read();
          const [dS, tS] = [String(st.s).slice(0, 10), String(st.s).slice(11, 16)], [dE, tE] = [String(st.e || '').slice(0, 10), String(st.e || '').slice(11, 16)];
          const fix = attTimesOf(st.type, st.kind)[2];
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dS) || !/^\d{2}:\d{2}$/.test(tS)) { err('시작 일시를 골라 주세요.'); return; }
          const tm = s => { const m = String(s).match(/^(\d{2}):(\d{2})$/); return m ? [Number(m[1]), Number(m[2])] : null; };
          let from = dS, to = dE || dS, time = null;
          if (st.type !== 'overtime' && (!dE || !/^\d{2}:\d{2}$/.test(tE))) { err('종료 일시를 골라 주세요.'); return; }
          if (to < from) { err('종료 일시가 시작 일시보다 빨라요.'); return; }
          if (!fix && dE) {
            const a = tm(tS), b = tm(tE);
            if (!a || !b) { err('시각을 알아보지 못했습니다.'); return; }
            if (b[0] * 60 + b[1] <= a[0] * 60 + a[1]) { err(st.type === 'overtime' ? '끝나는 시각이 시작보다 늦어야 합니다(자정을 넘기는 근무는 화면에서 직접 입력).' : '종료 시각이 시작 시각보다 늦어야 합니다.'); return; }
            if (st.type === 'overtime' && dE !== dS) { err('시간외·휴일근무는 같은 날 안에서 골라 주세요.'); return; }
            time = {s: a, e: b};
          }
          if (st.type === 'leave' && (st.kind === '외출' || st.kind === '조퇴') && from !== to) { err(st.kind + '은 하루 안에서만 신청할 수 있어요.'); return; }
          if (st.type === 'overtime') to = from;
          const common = {type: st.type, kind: st.kind, from, to, time, title: st.title};
          if (st.type === 'trip') done({...common, visit: st.visit, purpose: st.purpose, content: st.content || st.purpose, transport: st.transport});
          else if (st.type === 'leave') done({...common, reason: st.reason});
          else done({...common, pay: st.pay === '보상' ? '보상근무 신청' : '수당근무 신청', reason: st.reason});
        });
        obs.observe(ov, {childList: true});
        setTimeout(() => { const i = $('#att_s'); if (i) i.focus(); }, 30);
      };
      setDefaults(); retitle(); paint();
    });
  }

  async function quickAttendanceApplication(type, preset = {}) {
    closeOverlay();
    type = ATT_FORM[type] ? type : 'trip';
    const today = R.kstNow(new Date()).date;
    const sel = selectedAction();
    const selDate = sel && sel.type === 'attendance' ? String(sel.when || '').slice(0, 10) : '';
    const d0 = attYmd(preset.date) || selDate || today, d1 = attYmd(preset.to) || d0;
    // 내 지난 근태 신청 제목에서 제목 형식을 배운다(목록을 못 읽으면 기본 형식)
    const ap = GW.teamPlanned ? await Promise.race([loadApps().catch(() => null), wait(4000).then(() => null)]) : null;
    const model = ap ? R.learnAttendanceTitles(ap.apps, ap.me) : null;
    const pk = String(preset.kind || '').replace(/\s+/g, '');
    const kind = type === 'trip' ? (/관외/.test(pk) ? '관외출장' : '관내출장') : type === 'leave' ? ([...ATT_LEAVE_KINDS].sort((x, y) => y.length - x.length).find(k => pk.includes(k)) || '연차') : (/휴일/.test(pk) ? '휴일근무' : /조기/.test(pk) ? '조기근무' : '연장근무');
    const tp = String(preset.time || '').match(/(\d{1,2}):?(\d{2})\s*[~\-–]\s*(\d{1,2}):?(\d{2})/);
    const hh = (h, m) => String(h).padStart(2, '0') + ':' + m;
    const tr = ATT_TRANSPORTS.find(t => String(preset.transport || '').includes(t.slice(0, 2))) || '';
    const st = {type, kind, pay: /보상/.test(String(preset.pay || '') + pk) ? '보상' : '수당', s: d0 + 'T09:00', e: d1 + 'T18:00', visit: preset.visit || '', purpose: preset.purpose || '', content: preset.content || '', reason: preset.reason || '', transport: tr, title: '', basis: '', titleTouched: false, timeTouched: !!tp};
    if (tp) { st.s = d0 + 'T' + hh(tp[1], tp[2]); st.e = d0 + 'T' + hh(tp[3], tp[4]); }
    const spec = await askAttendance(st, model);
    if (!spec) return;
    return fillAttendanceForm(spec);
  }

  async function fillAttendanceForm(spec) {
    const url = GW.links.route(GW.routes.attendanceRequest);
    if (!openUrl(url, {title: `근태신청: ${ATT_FORM[spec.type]}`})) return; // 이동을 취소함(같은 화면이어도): 아무 칸도 건드리지 않는다
    S.pane.expanded = true; renderPane();
    toast(`${ATT_FORM[spec.type]}을 여는 중…`);
    const vis = e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0; };
    const leaf = (d, t) => [...d.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent || '').trim() === t && vis(e));
    let f = null, d = null, w = null;
    for (let i = 0; i < 40 && S.pane.url === url; i++) { await wait(500); f = $('#frame iframe'); try { d = f && f.contentDocument; w = f && f.contentWindow; } catch {} if (d && leaf(d, ATT_FORM[spec.type])) break; d = null; }
    if (!d) { if (S.pane.url === url) toast('근태신청서 화면을 열지 못했습니다. 화면에서 직접 고르세요.'); return; }
    // 이미 열린 신청서(입력 중일 수 있음)에 덮어쓰지 않는다. 방금 새로 연 화면이면 이 창은 뜨지 않는다.
    if (leaf(d, '신청정보') && !confirm('근태신청 화면에 이미 열려 있는 신청서가 있습니다. 자동 기입으로 덮어쓸까요?')) { toast('열려 있는 신청서를 그대로 두었습니다.'); return; }
    installGuard(w); AUTO.running = true; AUTO.blocked = []; AUTO.tok = {};
    const steps = [];
    const step = (name, ok, detail = '') => steps.push({name, ok: !!ok, detail});
    const press = el => { for (const ev of ['mousedown', 'mouseup', 'click']) el.dispatchEvent(new w.MouseEvent(ev, {bubbles: true, cancelable: true, view: w})); };
    const btn = t => [...d.querySelectorAll('button')].filter(vis).find(b => (b.innerText || '').trim() === t);
    const rowInputs = (label, sel = 'input:not([type=radio]):not([type=checkbox]):not([type=hidden]):not([type=button]), textarea') => { const lab = leaf(d, label); if (!lab) return []; const lq = lab.getBoundingClientRect(), cy = lq.top + lq.height / 2; return [...d.querySelectorAll(sel)].filter(vis).filter(i => { const q = i.getBoundingClientRect(); return Math.abs(q.top + q.height / 2 - cy) < 16 && q.left > lq.right - 2; }).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left); };
    const type = async (el, v, enter = false) => { el.focus(); if (el.select) el.select(); d.execCommand('insertText', false, v); await wait(150); if (enter) { el.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true})); await wait(150); } el.blur(); el.dispatchEvent(new w.FocusEvent('focusout', {bubbles: true})); await wait(200); };
    const infoDlgs = () => [...d.querySelectorAll('.obtdialog.open, ._isDialog')].filter(x => vis(x) && /중복근태|참고사항/.test(x.innerText || '') && [...x.querySelectorAll('button')].some(b => vis(b) && (b.innerText || '').trim() === '확인'));
    const dismissInfo = async () => { let seen = ''; for (let k = 0; k < 3; k++) { const x = infoDlgs().pop(); if (!x) break; seen = seen || (x.innerText || '').replace(/\s+/g, ' '); const ok = [...x.querySelectorAll('button')].find(b => vis(b) && (b.innerText || '').trim() === '확인'); if (!ok) break; ok.click(); await wait(600); } return seen; };
    const dupOf = txt => { const m = txt.match(/결재상태\s+([\s\S]*?)\s+grid table indicator/); return m ? m[1].replace(/근무일자 신청시간 사원 근태항목 제목 결재상태/g, '').trim().slice(0, 120) : ''; };
    // 종류를 고르거나 날짜를 바꾸면 그룹웨어가 중복근태 안내창을 늦게 띄운다 → 닫고 나서 넣고, 안 들어갔으면 한 번 더
    const setDates = async (label, a, b) => {
      const read = () => rowInputs(label).filter(i => /DatePicker/.test(i.className)).map(i => i.value);
      const ok = () => { const now = read(); return now[0] === a && (now.length < 2 || !b || now[1] === b); };
      for (let attempt = 0; attempt < 3 && !ok(); attempt++) {
        if (await waitFor(() => infoDlgs().length, attempt ? 600 : 1500)) await dismissInfo();
        const ins = rowInputs(label).filter(i => /DatePicker/.test(i.className)); if (!ins.length) return false;
        await type(ins[0], a.replace(/-/g, ''), true); if (ins[1] && b) await type(ins[1], b.replace(/-/g, ''), true);
        await wait(400);
      }
      return ok();
    };
    // 시작/종료시간 칸(오전·오후/시/분 6칸)에 시각을 넣고 읽어서 맞는지 확인한다. 잠긴(비활성) 칸은 건드리지 않는다.
    const hm = ([h, m]) => String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    const setTimes = async (label, tm) => {
      const ap = ([h, m]) => [h < 12 ? '오전' : '오후', String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0'), String(m).padStart(2, '0')];
      const want = [...ap(tm.s), ...ap(tm.e)], tp = () => rowInputs(label, 'input[class*=OBTTimePicker2_input]');
      // 시·분은 글자로 넣고, 오전/오후 칸은 글자를 받지 않아 위·아래 화살표 키로 바꾼다(오후=↓, 오전=↑). 맞을 때까지 최대 3번 훑는다
      const flip = async (el, to) => { el.focus(); const up = to === '오전'; el.dispatchEvent(new w.KeyboardEvent('keydown', {key: up ? 'ArrowUp' : 'ArrowDown', code: up ? 'ArrowUp' : 'ArrowDown', keyCode: up ? 38 : 40, bubbles: true})); await wait(250); };
      for (let pass = 0; pass < 3 && tp().map(i => i.value).join() !== want.join(); pass++) {
        for (const k of [1, 2, 4, 5]) { const el = tp()[k]; if (el && !el.disabled && el.value !== want[k]) await type(el, want[k], true); }
        for (const k of [0, 3]) { const el = tp()[k]; if (el && !el.disabled && el.value !== want[k]) await flip(el, want[k]); }
      }
      return tp().map(i => i.value).join() === want.join();
    };
    try {
      // 1) 양식 카드 열기
      // 카드는 화면이 막 뜬 직후엔 눌러도 반응이 없을 때가 있어 몇 번 다시 누른다
      let opened = null;
      for (let k = 0; k < 4 && !opened; k++) {
        const card = leaf(d, ATT_FORM[spec.type]);
        if (card) { const li = card.closest('li') || card; press(k % 2 ? card : li); }
        opened = await waitFor(() => leaf(d, '신청정보'), k ? 3000 : 4000);
      }
      step('양식 열기', opened, ATT_FORM[spec.type]);
      if (!opened) throw new Error('신청서 입력 화면이 열리지 않았습니다(이미 작성 중인 신청서가 있으면 닫고 다시 시도하세요)');
      if (await waitFor(() => infoDlgs().length, 3000)) await dismissInfo(); // 오늘 날짜로 열릴 때 뜨는 중복 안내는 닫는다
      if (spec.type === 'trip') {
        const kb = btn(spec.kind); if (kb) { kb.click(); await wait(500); } step('출장구분', !!kb, spec.kind);
        step('출장기간', await setDates('출장기간', spec.from, spec.to), spec.from === spec.to ? spec.from : `${spec.from} ~ ${spec.to}`);
        { const dup = (await waitFor(() => infoDlgs().length, 2000)) ? await dismissInfo() : ''; if (dup) step('중복 근태', false, '같은 기간에 이미 근태가 있습니다: ' + (dupOf(dup) || '화면의 중복근태 목록 확인')); }
        if (spec.time) step('시작/종료시간', await setTimes('시작/종료시간', spec.time), hm(spec.time.s) + '~' + hm(spec.time.e) + (spec.from !== spec.to ? ' (매일)' : ''));
        if (spec.transport) {
          const dd = rowInputs('교통수단', '[class*=OBTDropDownList_default], [class*=OBTDropDownList_root]')[0];
          // 목록이 늦게 뜨거나 안내창이 먼저 뜰 수 있어, 선택될 때까지 최대 3번 다시 시도한다
          for (let k = 0; dd && k < 3 && (dd.innerText || '').trim() !== spec.transport; k++) {
            if (await waitFor(() => infoDlgs().length, k ? 300 : 100)) await dismissInfo();
            press(dd.querySelector('button') || dd); await wait(700 + k * 400);
            const opt = [...d.querySelectorAll('*')].filter(vis).filter(e => e.children.length === 0 && (e.textContent || '').trim() === spec.transport).pop(); if (opt) { press(opt); await wait(700); }
          }
          step('교통수단', !!(dd && (dd.innerText || '').trim() === spec.transport), spec.transport);
        } else step('교통수단', true, '선택 안 함(기본값) — 신청서의 교통수단 칸은 비워 둡니다');
        for (const [lab, val] of [['방문처', spec.visit], ['출장목적', spec.purpose], ['업무내용', spec.content]]) {
          if (!val) { step(lab, false, '비어 있음(직접 입력)'); continue; }
          const i = rowInputs(lab)[0]; if (i) await type(i, val);
          step(lab, !!(i && rowInputs(lab)[0].value === val), val);
        }
        const reg = btn('일정등록');
        if (reg && spec.visit && spec.content) { reg.click(); await wait(1200); }
        const gridTxt = d.body.innerText.replace(/\s+/g, ' ');
        const regOk = gridTxt.includes(`${spec.kind} ${spec.from}`) && (!spec.visit || gridTxt.includes(spec.visit));
        step('일별 업무계획 등록', regOk, regOk ? '일정등록으로 일별 계획을 넣었습니다' : '일정등록을 확인하지 못했습니다(화면에서 [일정등록]을 누르세요)');
      } else if (spec.type === 'leave') {
        const kb = btn(spec.kind); if (kb) { kb.click(); await wait(600); } step('휴가구분', !!kb, spec.kind);
        step('휴가기간', await setDates('휴가기간', spec.from, spec.to), spec.from === spec.to ? spec.from : `${spec.from} ~ ${spec.to}`);
        { const dup = (await waitFor(() => infoDlgs().length, 2000)) ? await dismissInfo() : ''; if (dup) step('중복 근태', false, '같은 기간에 이미 근태가 있습니다: ' + (dupOf(dup) || '화면의 중복근태 목록 확인')); }
        if (spec.time) step('시작/종료시간', await setTimes('시작/종료시간', spec.time), hm(spec.time.s) + '~' + hm(spec.time.e));
        if (spec.reason) { const i = rowInputs('비고(사유)')[0]; if (i) await type(i, spec.reason); step('비고(사유)', !!(i && rowInputs('비고(사유)')[0].value === spec.reason), spec.reason); } else step('비고(사유)', false, '비어 있음(직접 입력)');
        const days = (rowInputs('신청일수')[0] || {}).value || '';
        if (days) step('신청일수', true, `${days}일 (화면 계산)`);
      } else {
        const radio = [...d.querySelectorAll('input[type=radio]')].filter(vis).find(r => { const lab = r.closest('label') || r.parentElement; return lab && (lab.innerText || '').trim() === spec.pay; }) || (() => { const l = leaf(d, spec.pay); return l && l.closest('label') && l.closest('label').querySelector('input[type=radio]'); })();
        if (radio) { radio.click(); await wait(400); } step('신청구분', !!(radio && radio.checked), spec.pay);
        step('근무일', await setDates('연장근무시작일', spec.from, spec.to), spec.from);
        { const dup = (await waitFor(() => infoDlgs().length, 2000)) ? await dismissInfo() : ''; if (dup) step('중복 근태', false, '같은 날에 이미 근태가 있습니다: ' + (dupOf(dup) || '화면의 중복근태 목록 확인')); }
        // 근무구분 버튼은 신청구분이 보상이면 ‘휴일근무(보상)’처럼 이름이 바뀌고, 휴일근무는 근무일을 넣은 뒤에야 누를 수 있다
        { const names = /보상/.test(spec.pay) ? [spec.kind + '(보상)', spec.kind] : [spec.kind]; const kb = names.map(btn).find(Boolean); if (kb) { kb.click(); await wait(600); } step('근무구분', !!(kb && !kb.disabled), kb ? (kb.innerText || '').trim() : names[0]); }
        if (spec.reason) { const i = rowInputs('비고(사유)')[0]; if (i) await type(i, spec.reason); step('비고(사유)', !!(i && rowInputs('비고(사유)')[0].value === spec.reason), spec.reason); } else step('비고(사유)', false, '비어 있음(직접 입력)');
        if (spec.time) {
          const r2 = [...d.querySelectorAll('input[type=radio]')].find(x => x.value === 'MANUAL_RANGE');
          if (r2) { r2.click(); await wait(600); }
          const okT = await setTimes('연장근무시작일', spec.time);
          step('근무 시간', !!(r2 && r2.checked && okT), hm(spec.time.s) + '~' + hm(spec.time.e) + ' (작성기준: 시작/종료시간)');
        } else step('작성기준·시간', true, '시간은 화면의 작성기준(태깅시간 등)대로 둡니다. 다르면 화면에서 고치세요');
      }
      if (spec.title) {
        const ti = rowInputs('제목')[0];
        if (ti) { await type(ti, spec.title); step('제목', ti.value === spec.title, spec.title); }
        else step('제목(예상)', true, spec.title + ' — 근태신청서에는 제목 칸이 없어, 신청완료 때 그룹웨어가 정하는 제목입니다(내 지난 신청 형식 기준)');
      }
    } catch (e) { step('중단', false, e.message); }
    finally { AUTO.running = false; }
    step('안전장치', AUTO.blocked.length === 0, AUTO.blocked.length ? `자동 실행 중 ${AUTO.blocked.join(', ')} 클릭을 막았습니다` : '[신청완료]는 누르지 않았습니다. 화면에서 확인한 뒤 직접 누르세요');
    const bad = steps.filter(s => !s.ok).length;
    logActionRecord({command: `근태신청 준비: ${ATT_FORM[spec.type]}`, type: '근태', target: `${spec.from} ${spec.kind || ''}`, summary: bad ? `${steps.length - bad}/${steps.length} 항목을 채웠습니다. 신청은 하지 않았습니다.` : '모든 항목을 채웠습니다. 신청은 하지 않았습니다.', steps: steps.map(s => `${s.ok ? '✓' : '✗'} ${s.name}: ${s.detail}`), status: bad ? 'partial' : 'success', verified: !bad});
    S.paletteOpen = true;
    $('#overlay').innerHTML = `<div class="modal peek"><div class="dlg" data-stop="1" style="width:min(560px,94vw);padding:20px 24px;position:absolute;right:24px;bottom:24px;top:auto;left:auto;transform:none" role="dialog" aria-label="근태신청 준비 결과">
      <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
      <h2 style="margin:0 0 4px;font-size:17px">${bad ? '신청서를 일부 채웠습니다 (확인 필요)' : '신청서를 채웠습니다 · [신청완료] 전 확인'}</h2>
      <div class="muted" style="margin-bottom:8px">${esc(ATT_FORM[spec.type])} · ${esc(spec.from)}${spec.to && spec.to !== spec.from ? ' ~ ' + esc(spec.to) : ''}${spec.time ? ' · ' + hm(spec.time.s) + '~' + hm(spec.time.e) : ''}</div>
      ${steps.map(s => `<div style="display:flex;gap:8px;padding:5px 0;border-top:1px solid var(--line)"><b style="color:${s.ok ? 'var(--ok)' : 'var(--hi)'};width:18px">${s.ok ? '✓' : '✗'}</b><div><b>${esc(s.name)}</b><div class="muted" style="font-size:12.5px">${esc(s.detail)}</div></div></div>`).join('')}
      <div class="acts" style="margin-top:12px;justify-content:flex-end"><button class="btn sm primary" data-act="closeHelp">확인하고 계속</button></div></div></div>`;
  }
