// GW 통합 업무센터 · 근태신청 준비 (출장·휴가·시간외/휴일근무)
// 먼저 날짜·종류·사유를 묻고, 그룹웨어 근태신청서(HPD0110)의 해당 양식을 열어 칸을 채운 뒤 [신청완료] 직전에서 멈춘다.
// 신청완료·추가신청·신청취소는 누르지 않는다(사람이 직접). 채운 값은 화면에서 다시 읽어 맞는지 보고한다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const ATT_FORM = {trip: '출장신청서', leave: '연차휴가신청서', overtime: '연장근무신청서'};
  const ATT_LEAVE_KINDS = ['연차', '오전반차', '오후반차', '대체휴가', '보상휴가', '외출', '조퇴'];
  // 날짜 검증·연도 판단은 parseKoreanDate 한 곳에서 한다(2/30 거부, 적은 연도 우선). '11-20'만 여기서 11/20으로 바꿔 넘긴다.
  const attYmd = s => { const v = String(s || '').trim(); const p = v && parseKoreanDate(v.replace(/^(\d{1,2})-(\d{1,2})$/, '$1/$2')); return p ? p.iso : ''; };

  async function quickAttendanceApplication(type, preset = {}) {
    if (!ATT_FORM[type]) return;
    closeOverlay();
    const today = R.kstNow(new Date()).date;
    const sel = selectedAction();
    const selDate = sel && sel.type === 'attendance' ? String(sel.when || '').slice(0, 10) : '';
    const d0 = preset.date || selDate || today;
    let spec = null;
    if (type === 'trip') {
      const v = await askForm({title: '출장 신청 준비', desc: '적은 값으로 출장신청서를 채우고 [신청완료] 직전에서 멈춥니다. 날짜는 “내일”, “다음 주 수요일”, “11/20”처럼 적어도 됩니다.', okLabel: '신청서 채우기', fields: [
        {label: '구분 (관내 / 관외)', value: preset.kind || '관내'}, {label: '시작일', value: d0}, {label: '종료일 (하루면 비워 두기)', value: preset.to || ''},
        {label: '방문처', value: preset.visit || '', placeholder: '예) 부천시청'}, {label: '출장목적', value: preset.purpose || '', placeholder: '예) 업무 협의'}, {label: '업무내용', value: preset.content || '', placeholder: '예) 청소년 정책 협의 회의 참석'},
        {label: '교통수단 (대중교통 / 자가용 / 관용차량)', value: preset.transport || '대중교통'}]});
      if (!v) return;
      const from = attYmd(v[1]), to = attYmd(v[2]) || from;
      if (!from || to < from) { toast('날짜를 알아보지 못했습니다. 예) 2026-11-20, 내일, 다음 주 수요일'); return; }
      spec = {type, kind: /관외/.test(v[0]) ? '관외출장' : '관내출장', from, to, visit: v[3], purpose: v[4], content: v[5] || v[4], transport: /자가/.test(v[6]) ? '자가용' : /관용/.test(v[6]) ? '관용차량' : '대중교통'};
    } else if (type === 'leave') {
      const v = await askForm({title: '휴가 신청 준비', desc: `종류: ${ATT_LEAVE_KINDS.join(' · ')}`, okLabel: '신청서 채우기', fields: [
        {label: '휴가 종류', value: preset.kind || '연차'}, {label: '시작일', value: d0}, {label: '종료일 (하루면 비워 두기)', value: preset.to || ''}, {label: '비고(사유)', value: preset.reason || '', placeholder: '예) 개인 용무'}]});
      if (!v) return;
      const kind = ATT_LEAVE_KINDS.find(k => v[0].replace(/\s+/g, '').includes(k)) || '';
      const from = attYmd(v[1]), to = attYmd(v[2]) || from;
      if (!kind) { toast(`휴가 종류를 알아보지 못했습니다: ${ATT_LEAVE_KINDS.join(', ')} 중에서 적어 주세요.`); return; }
      if (!from || to < from) { toast('날짜를 알아보지 못했습니다. 예) 2026-11-20, 내일, 다음 주 금요일'); return; }
      spec = {type, kind, from, to, reason: v[3]};
    } else {
      const v = await askForm({title: '시간외·휴일근무 신청 준비', desc: '근무 구분: 연장근무 · 휴일근무 · 조기근무 / 신청 구분: 수당 · 보상', okLabel: '신청서 채우기', fields: [
        {label: '근무 구분', value: preset.kind || '연장근무'}, {label: '신청 구분 (수당 / 보상)', value: preset.pay || '수당'}, {label: '근무일', value: d0}, {label: '비고(사유)', value: preset.reason || '', placeholder: '예) 결과보고서 작성'}, {label: '근무 시간 (예: 10:00~15:00, 비우면 화면의 작성기준대로)', value: preset.time || '', placeholder: '10:00~15:00'}]});
      if (!v) return;
      const kind = /휴일/.test(v[0]) ? '휴일근무' : /조기/.test(v[0]) ? '조기근무' : '연장근무';
      const from = attYmd(v[2]);
      if (!from) { toast('근무일을 알아보지 못했습니다. 예) 11/14, 이번 주 토요일'); return; }
      const tm = String(v[4] || '').match(/(\d{1,2}):?(\d{2})\s*[~\-–]\s*(\d{1,2}):?(\d{2})/);
      if (v[4] && !tm) { toast('근무 시간을 알아보지 못했습니다. 예) 10:00~15:00'); return; }
      if (tm) { const [sh, sm, eh, em] = [1, 2, 3, 4].map(i => Number(tm[i])); if (sh > 23 || eh > 23 || sm > 59 || em > 59) { toast('시간은 00:00~23:59 사이로 적어 주세요.'); return; } if (eh * 60 + em <= sh * 60 + sm) { toast('끝나는 시간이 시작보다 늦어야 합니다(자정을 넘기는 근무는 화면에서 직접 입력).'); return; } }
      spec = {type, kind, pay: /보상/.test(v[1]) ? '보상근무 신청' : '수당근무 신청', from, to: from, reason: v[3], time: tm ? {s: [Number(tm[1]), Number(tm[2])], e: [Number(tm[3]), Number(tm[4])]} : null};
    }
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
        const dd = rowInputs('교통수단', '[class*=OBTDropDownList_default], [class*=OBTDropDownList_root]')[0];
        if (dd) { press(dd.querySelector('button') || dd); await wait(600); const opt = [...d.querySelectorAll('*')].filter(vis).filter(e => e.children.length === 0 && (e.textContent || '').trim() === spec.transport).pop(); if (opt) { press(opt); await wait(500); } }
        const tr = !!(dd && (dd.innerText || '').trim() === spec.transport);
        step('교통수단', tr, spec.transport);
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
        if (spec.reason) { const i = rowInputs('비고(사유)')[0]; if (i) await type(i, spec.reason); step('비고(사유)', !!(i && rowInputs('비고(사유)')[0].value === spec.reason), spec.reason); } else step('비고(사유)', false, '비어 있음(직접 입력)');
        const days = (rowInputs('신청일수')[0] || {}).value || '';
        if (days) step('신청일수', true, `${days}일 (화면 계산)`);
      } else {
        const radio = [...d.querySelectorAll('input[type=radio]')].filter(vis).find(r => { const lab = r.closest('label') || r.parentElement; return lab && (lab.innerText || '').trim() === spec.pay; }) || (() => { const l = leaf(d, spec.pay); return l && l.closest('label') && l.closest('label').querySelector('input[type=radio]'); })();
        if (radio) { radio.click(); await wait(400); } step('신청구분', !!(radio && radio.checked), spec.pay);
        const kb = btn(spec.kind); if (kb) { kb.click(); await wait(500); } step('근무구분', !!kb, spec.kind);
        step('근무일', await setDates('연장근무시작일', spec.from, spec.to), spec.from);
        { const dup = (await waitFor(() => infoDlgs().length, 2000)) ? await dismissInfo() : ''; if (dup) step('중복 근태', false, '같은 날에 이미 근태가 있습니다: ' + (dupOf(dup) || '화면의 중복근태 목록 확인')); }
        if (spec.reason) { const i = rowInputs('비고(사유)')[0]; if (i) await type(i, spec.reason); step('비고(사유)', !!(i && rowInputs('비고(사유)')[0].value === spec.reason), spec.reason); } else step('비고(사유)', false, '비어 있음(직접 입력)');
        if (spec.time) {
          const r2 = [...d.querySelectorAll('input[type=radio]')].find(x => x.value === 'MANUAL_RANGE');
          if (r2) { r2.click(); await wait(600); }
          const ap = ([h, m]) => [h < 12 ? '오전' : '오후', String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0'), String(m).padStart(2, '0')];
          const want = [...ap(spec.time.s), ...ap(spec.time.e)];
          for (let k = 0; k < 6; k++) { const tp = rowInputs('연장근무시작일', 'input[class*=OBTTimePicker2_input]')[k]; if (tp) await type(tp, want[k], true); }
          const got = rowInputs('연장근무시작일', 'input[class*=OBTTimePicker2_input]').map(i => i.value);
          step('근무 시간', !!(r2 && r2.checked && got.join() === want.join()), `${want.slice(0, 3).join(' ')} ~ ${want.slice(3).join(' ')} (작성기준: 시작/종료시간)`);
        } else step('작성기준·시간', true, '시간은 화면의 작성기준(태깅시간 등)대로 둡니다. 다르면 화면에서 고치세요');
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
      <div class="muted" style="margin-bottom:8px">${esc(ATT_FORM[spec.type])} · ${esc(spec.from)}${spec.to && spec.to !== spec.from ? ' ~ ' + esc(spec.to) : ''}</div>
      ${steps.map(s => `<div style="display:flex;gap:8px;padding:5px 0;border-top:1px solid var(--line)"><b style="color:${s.ok ? 'var(--ok)' : 'var(--hi)'};width:18px">${s.ok ? '✓' : '✗'}</b><div><b>${esc(s.name)}</b><div class="muted" style="font-size:12.5px">${esc(s.detail)}</div></div></div>`).join('')}
      <div class="acts" style="margin-top:12px;justify-content:flex-end"><button class="btn sm primary" data-act="closeHelp">확인하고 계속</button></div></div></div>`;
  }
