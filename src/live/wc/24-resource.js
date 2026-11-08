// GW 통합 업무센터 · 자원 예약 (공용차량·회의실 현황 + 바로 예약)
// 읽기: 자원 목록, 날짜별 예약 현황, 빈 시간. 쓰기: 예약 한 가지 동작만, 입력 검증 -> 중복·한도 확인 -> 사용자 최종 확인 -> 서버 응답 확인.
// 취소·변경은 하지 않는다(그룹웨어 자원 화면에서 한다).
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const resState = () => (S.res = S.res || {date: '', list: null, sel: '', bookings: null, busy: false, err: '', form: {title: '', start: '09:00', end: '10:00'}, check: null, confirm: false, done: null, detail: {}, seq: 0});
  const ymdDash = d8 => `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6)}`;
  const resToday = () => R.kstNow(new Date()).date.replace(/-/g, '');
  const wdName = d8 => '일월화수목금토'[new Date(Number(d8.slice(0, 4)), Number(d8.slice(4, 6)) - 1, Number(d8.slice(6))).getDay()];

  function vResource() {
    if (!allowed('resource')) return pgh('자원 예약', '관리자 설정으로 꺼져 있습니다', '');
    const s = resState();
    if (!s.date) s.date = resToday();
    const sel = (s.list || []).find(r => r.resSeq === s.sel);
    const dayB = (s.bookings || []).filter(b => R.bookingSpanOnDay(b, s.date)).sort((a, b) => a.start.localeCompare(b.start));
    const free = s.bookings ? R.freeSlots(dayB, s.date) : [];
    const opts = R.timeOptions();
    const selOpt = (v, cur) => opts.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
    const upcoming = (s.bookings || []).filter(b => b.end.slice(0, 8) >= resToday()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 12);
    const me = (S.raw && S.raw.principal && S.raw.principal.name) || '';
    const fmtB = b => `${b.start.slice(4, 6)}/${b.start.slice(6, 8)} ${b.start.slice(8, 10)}:${b.start.slice(10)}~${b.end.slice(8, 10)}:${b.end.slice(10)}`;
    const body = s.err ? `<div class="box warn">자원 정보를 읽지 못했습니다: ${esc(s.err)} <button class="btn sm" data-act="resReload">다시 시도</button></div>`
      : !s.list ? '<div class="sk" style="height:120px"></div>'
      : !s.list.length ? '<div class="empty"><b>예약할 수 있는 자원이 없습니다</b></div>'
      : `<div class="bar"><div class="seg">${s.list.map(r => `<button class="${r.resSeq === s.sel ? 'on' : ''}" data-act="resSel" data-v="${esc(r.resSeq)}">${esc(r.name)}</button>`).join('')}</div>
          <button class="btn sm icon" data-act="resDay" data-v="-1" aria-label="이전 날">${ic('back')}</button>
          <input class="inp" type="date" id="resDate" value="${ymdDash(s.date)}" style="height:34px" aria-label="날짜">
          <button class="btn sm icon" data-act="resDay" data-v="1" aria-label="다음 날" style="transform:scaleX(-1)">${ic('back')}</button>
          <button class="btn sm" data-act="resGo">이 날짜로 이동</button><button class="btn sm" data-act="resDay" data-v="0">오늘</button></div>
        <div class="muted" style="margin:4px 0 8px">${esc(sel ? sel.name : '')} · ${esc(ymdDash(s.date))}(${wdName(s.date)})${sel && sel.apprYn === 'Y' ? ' · <b>예약 후 관리자 승인이 필요한 자원입니다</b>' : ''}</div>
        <div class="cards">
          <div class="card2"><div class="ct">이 날의 예약 ${s.busy ? '<span class="spin"></span>' : ''}</div>${dayB.length ? dayB.map(b => `<div class="trow"><span><b>${esc(b.start.slice(8, 10))}:${esc(b.start.slice(10))}~${esc(b.end.slice(8, 10))}:${esc(b.end.slice(10))}</b> ${esc(b.title)}</span><span class="muted">${esc(b.who)}${me && b.who === me ? ' (나)' : ''}</span></div>`).join('') : '<span class="muted">예약이 없습니다</span>'}</div>
          <div class="card2"><div class="ct">비어 있는 시간 (09:00~18:00)</div>${free.length ? free.map(f => `<button class="chip" data-act="resFree" data-s="${esc(f.start)}" data-e="${esc(f.end)}">${esc(f.start)}~${esc(f.end)}</button>`).join(' ') : '<span class="muted">이 날은 빈 시간이 없습니다</span>'}<div class="muted" style="font-size:12px;margin-top:6px">누르면 아래 예약 칸에 채워집니다</div></div>
        </div>
        <h2>예약하기</h2>
        <div class="box" id="resForm"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted);flex:1;min-width:200px">예약명<input class="inp" id="resTitle" value="${esc(s.form.title)}" placeholder="예) 학교 방문, 교육 참석" style="height:36px"></label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)">시작<select class="inp" id="resStart" style="height:36px">${selOpt('s', s.form.start)}</select></label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)">종료<select class="inp" id="resEnd" style="height:36px">${selOpt('e', s.form.end)}</select></label>
          <button class="btn primary" data-act="resCheck" ${s.busy ? 'disabled' : ''}>예약 가능한지 확인</button></div>
          ${s.check ? `<div class="box ${s.check.ok ? 'tip' : 'warn'}" style="margin-top:10px">${s.check.ok ? `<b>예약할 수 있습니다</b> ${esc(ymdDash(s.date))}(${wdName(s.date)}) ${esc(s.form.start)}~${esc(s.form.end)} · ${esc(s.form.title)}${sel && sel.apprYn === 'Y' ? '<div class="muted">예약을 올리면 관리자 승인 대기 상태가 됩니다.</div>' : ''}<div class="acts"><button class="btn primary" data-act="resBook">이 내용으로 예약 확정</button><button class="btn ghost" data-act="resCancelForm">취소</button></div>` : s.check.errors.map(x => `<div style="color:var(--hi)">✗ ${esc(x)}</div>`).join('')}</div>` : ''}
          ${s.done ? `<div class="box tip" style="margin-top:10px"><b>예약을 올렸습니다.</b> ${esc(s.done)}<div class="muted">변경·취소는 그룹웨어 자원 화면의 “나의예약현황”에서 합니다.</div></div>` : ''}</div>
        <h2>다가오는 예약 <span class="muted">${upcoming.length}건</span></h2>
        ${upcoming.length ? `<div class="list">${upcoming.map(b => `<div class="row" style="grid-template-columns:150px 1fr auto"><span class="muted">${esc(fmtB(b))}</span><div class="mn"><div class="t">${esc(b.title)}</div></div><div class="w">${esc(b.who)}${me && b.who === me ? ' (나)' : ''}</div></div>`).join('')}</div>` : '<div class="list"><div class="empty"><b>다가오는 예약이 없습니다</b></div></div>'}`;
    return `${pgh('자원 예약', '공용차량 현황과 바로 예약', `<a class="btn sm" href="${esc(GW.links.route('#/UK/UKA/UKA0000?specialLnb=Y&moduleCode=UK&menuCode=UKA&pageCode=UKA0000'))}" target="_blank" rel="noopener">${ic('ext')}그룹웨어 자원 화면</a>`)}${body}`;
  }

  async function resLoad(force) {
    const s = resState();
    if (s.busy && !force) return;
    s.busy = true; s.err = '';
    const seq = ++s.seq;
    try {
      if (!s.list) { s.list = (await GW.resourceList()).filter(r => r.useYn !== 'N'); if (!s.sel && s.list[0]) s.sel = s.list[0].resSeq; }
      const d = s.date || resToday();
      const first = d.slice(0, 6) + '01', last = d.slice(0, 6) + String(new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)), 0).getDate()).padStart(2, '0');
      const to2 = (() => { const n = new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)), 0); n.setDate(n.getDate() + 31); return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}`; })();
      s.bookings = s.sel ? await GW.resourceBookings({from: first, to: to2 > last ? to2 : last, resSeqs: [s.sel]}) : [];
    } catch (e) { s.err = String(e.message || e).slice(0, 100); logError('resource', e.message); }
    if (seq === s.seq) { s.busy = false; if (S.view === 'resource') renderMain(); }
  }
  function resSyncForm() {
    const s = resState();
    const t = $('#resTitle'), a = $('#resStart'), z = $('#resEnd');
    if (t) s.form.title = t.value;
    if (a) s.form.start = a.value;
    if (z) s.form.end = z.value;
    const d = $('#resDate'); if (d && d.value) s.date = d.value.replace(/-/g, '');
  }
  function resDay(v) { resSyncForm(); const s = resState(); const n = Number(v); if (n === 0) s.date = resToday(); else { const d = new Date(Number(s.date.slice(0, 4)), Number(s.date.slice(4, 6)) - 1, Number(s.date.slice(6)) + n); s.date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; } s.check = null; s.done = null; s.bookings = null; renderMain(); resLoad(true); }
  function resSel(v) { resSyncForm(); const s = resState(); s.sel = v; s.check = null; s.bookings = null; renderMain(); resLoad(true); }
  function resFree(a, z) { resSyncForm(); const s = resState(); s.form.start = a; const cap = R.minToHm(Number(a.slice(0, 2)) * 60 + Number(a.slice(3)) + 240); s.form.end = z > cap ? cap : z; s.check = null; renderMain(); }
  async function resCheck() {
    resSyncForm();
    const s = resState(), sel = (s.list || []).find(r => r.resSeq === s.sel);
    if (!sel) return;
    const v = R.validateBooking({title: s.form.title, date: s.date, start: s.form.start, end: s.form.end});
    s.done = null;
    if (!v.ok) { s.check = {ok: false, errors: v.errors}; renderMain(); return; }
    s.busy = true; s.check = {ok: false, errors: ['확인하는 중입니다…']}; renderMain();
    try {
      const det = await GW.resourceDetail(sel.resSeq);
      s.detail[sel.resSeq] = det;
      const v2 = R.validateBooking({title: s.form.title, date: s.date, start: s.form.start, end: s.form.end, limitMin: det.limitMin});
      if (!v2.ok) { s.check = {ok: false, errors: v2.errors}; }
      else {
        const c = await GW.resourceCheck({resSeq: sel.resSeq, start: v2.start12, end: v2.end12});
        s.check = c.conflict ? {ok: false, errors: ['같은 시간에 이미 예약이 있습니다. 빈 시간에서 다른 시간을 고르세요.']} : c.limit ? {ok: false, errors: ['예약 한도를 넘었습니다']} : {ok: true, errors: [], start12: v2.start12, end12: v2.end12};
      }
    } catch (e) { s.check = {ok: false, errors: ['확인하지 못했습니다: ' + String(e.message || e).slice(0, 80)]}; }
    s.busy = false; renderMain();
  }
  async function resBook() {
    if (gated('resource')) return;
    const s = resState();
    if (!s.check || !s.check.ok || s.confirm) return;
    s.confirm = true;
    const sel = (s.list || []).find(r => r.resSeq === s.sel);
    try {
      const r = await GW.reserveResource({resSeq: s.sel, title: s.form.title, start: s.check.start12, end: s.check.end12});
      s.done = `${sel ? sel.name + ' ' : ''}${ymdDash(s.date)} ${s.form.start}~${s.form.end} “${s.form.title}”${r.needsApproval ? ' (승인 대기)' : ''}`;
      logActionRecord({command: `자원 예약: ${sel ? sel.name : s.sel}`, type: '자원', target: s.form.title, summary: `${ymdDash(s.date)} ${s.form.start}~${s.form.end} 예약을 올렸습니다${r.needsApproval ? '(승인 대기)' : ''}.`, steps: [], verified: true});
      s.check = null; s.form.title = '';
      toast('예약을 올렸습니다.');
      s.bookings = null; s.confirm = false; renderMain(); await resLoad(true);
    } catch (e) {
      s.confirm = false;
      s.check = {ok: false, errors: ['예약하지 못했습니다: ' + String(e.message || e).slice(0, 100)]};
      logError('reserve', e.message);
      renderMain();
    }
  }
  function resCancelForm() { const s = resState(); s.check = null; renderMain(); }
  function resGo() { resSyncForm(); const s = resState(); s.check = null; s.done = null; s.bookings = null; renderMain(); resLoad(true); }
