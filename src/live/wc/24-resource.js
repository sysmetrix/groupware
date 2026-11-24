// GW 비서 · 자원 예약 (공용차량·회의실 현황 + 바로 예약)
// 읽기: 자원 목록, 날짜별 예약 현황, 빈 시간. 쓰기: 예약 한 가지 동작만, 입력 검증 -> 중복·한도 확인 -> 사용자 최종 확인 -> 서버 응답 확인.
// 취소·변경은 하지 않는다(그룹웨어 자원 화면에서 한다).
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const resOwner = () => typeof currentKey === 'undefined' ? S.userKey || '' : currentKey;
  const resOwnerValid = owner => owner === resOwner() && (typeof getUserKey !== 'function' || getUserKey() === owner);
  const ymdDash = d8 => `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6)}`;
  const resToday = () => R.kstNow(new Date()).date.replace(/-/g, '');
  const resOnDate = d8 => new Date(ymdDash(d8) + 'T00:00:00Z');
  const resShift = (d8, n) => new Date(resOnDate(d8).getTime() + n * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  const wdName = d8 => '일월화수목금토'[resOnDate(d8).getUTCDay()];
  function resState() {
    const owner = resOwner();
    if (!S.res || (S.res.owner !== undefined && S.res.owner !== owner)) S.res = {date: '', list: null, sel: '', bookings: null, busy: false, err: '', form: {title: '', start: '09:00', end: '10:00'}, check: null, confirm: false, done: null, rev: 0};
    S.res.owner = owner;
    return S.res;
  }
  const resInScope = (s, q = s.request) => !!q && S.res === s && resOwnerValid(q.owner) && s.date === q.date && s.sel === q.sel;
  const resHm = v => v.slice(8, 10) + ':' + v.slice(10);

  const resPeriod = v => ymdDash(v.slice(0, 8)) + ' ' + resHm(v);
  function resTimeline(bookings, date, opts, me) {
    const free = R.freeSlots(bookings, date, {minMin: 1});
    const timeline = bookings.map(b => {
      const start = b.start.slice(0, 8) === date ? resHm(b.start) : '00:00';
      const end = b.end.slice(0, 8) === date ? resHm(b.end) : '24:00';
      const period = b.start.slice(0, 8) !== b.end.slice(0, 8) ? `<br><small class="muted">원래 예약 기간 ${resPeriod(b.start)} ~ ${resPeriod(b.end)}</small>` : '';
      return {start, html: `<div class="trow"><span><b>${esc(start)}~${esc(end)}</b> · 예약됨 · ${esc(b.title)}${period}</span><span class="muted">${esc(b.who)}${me && b.who === me ? ' (나)' : ''}</span></div>`};
    });
    for (const f of free) {
      const a = opts.find(o => o >= f.start), z = opts.findLast(o => o <= f.end);
      timeline.push({start: f.start, html: `<div class="trow"><span><b>${esc(f.start)}~${esc(f.end)}</b> · 비어 있음</span>${a < z ? `<button class="chip" data-act="resFree" data-s="${esc(a)}" data-e="${esc(z)}">예약 칸에 채우기</button>` : '<span class="muted">30분 단위 선택 불가</span>'}</div>`});
    }
    return `${!bookings.length ? '<p class="muted">예약이 없습니다</p>' : ''}${!free.length ? '<p class="muted">이 날은 빈 시간이 없습니다 (09:00~18:00)</p>' : ''}${timeline.sort((a, b) => a.start.localeCompare(b.start)).map(x => x.html).join('')}`;
  }

  function vResource() {
    if (!allowed('resource')) return pgh('일정·예약', '관리자 설정으로 꺼져 있습니다', '');
    const s = resState();
    if (!s.date) s.date = resToday();
    if (!resOwnerValid(s.owner)) return pgh('일정·예약', '로그인 정보 변경을 확인한 뒤 다시 조회할 수 있습니다', '');
    const sel = (s.list || []).find(r => r.resSeq === s.sel);
    const scoped = resInScope(s), bookings = scoped ? s.bookings : null, err = scoped ? s.err : '';
    const upcoming = scoped ? s.upcoming : null, upcomingErr = scoped ? s.upcomingErr : '';
    const check = scoped ? s.check : null;
    const opts = R.timeOptions();
    const selOpt = cur => opts.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
    const me = (S.raw && S.raw.principal && S.raw.principal.name) || '';
    const fmtB = b => `${b.start.slice(4, 6)}/${b.start.slice(6, 8)}${b.end.slice(0, 8) !== b.start.slice(0, 8) ? `~${b.end.slice(4, 6)}/${b.end.slice(6, 8)}` : ''} ${resHm(b.start)}~${resHm(b.end)}`;
    const retry = (label, error) => `<div class="box warn">${label}: ${esc(error)} <button class="btn sm" data-act="resReload">다시 시도</button></div>`;
    const body = !s.list ? err ? retry('자원 정보를 읽지 못했습니다', err) : '<div role="status">자원 목록을 조회하는 중입니다…</div>'
      : !s.list.length ? '<div class="empty"><b>예약할 수 있는 자원이 없습니다</b></div>'
      : `<div class="bar"><div class="seg">${s.list.map(r => `<button class="${r.resSeq === s.sel ? 'on' : ''}" data-act="resSel" aria-pressed="${r.resSeq === s.sel}" data-v="${esc(r.resSeq)}">${esc(r.name)}</button>`).join('')}</div>
          <button class="btn sm icon" data-act="resDay" data-v="-1" aria-label="이전 날">${ic('back')}</button>
          <input class="inp" type="date" id="resDate" value="${ymdDash(s.date)}" style="height:34px" aria-label="날짜">
          <button class="btn sm icon" data-act="resDay" data-v="1" aria-label="다음 날" style="transform:scaleX(-1)">${ic('back')}</button>
          <button class="btn sm" data-act="resDay" data-v="0">오늘</button></div>
        <div class="muted" style="margin:4px 0 8px">${esc(sel ? sel.name : '')} · ${esc(ymdDash(s.date))}(${wdName(s.date)})${sel && sel.apprYn === 'Y' ? ' · <b>예약 후 관리자 승인이 필요한 자원입니다</b>' : ''}</div>
        <div class="card2"><div class="ct">이 날의 예약 시간표 <span class="muted">빈 시간 기준 09:00~18:00</span></div>
          ${err ? retry('예약 현황과 빈 시간을 확인할 수 없습니다', err) : bookings ? resTimeline(bookings, s.date, opts, me) : '<div class="muted" role="status">예약 현황을 조회하는 중입니다. 빈 시간을 조회하는 중입니다…</div>'}</div>
        <h2>예약하기</h2>
        <div class="box" id="resForm" aria-busy="${s.confirm || !!check?.pending}"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted);flex:1;min-width:200px">예약명<input class="inp" id="resTitle" value="${esc(s.form.title)}" placeholder="예) 학교 방문, 교육 참석" style="height:36px"></label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)">시작<select class="inp" id="resStart" style="height:36px">${selOpt(s.form.start)}</select></label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)">종료<select class="inp" id="resEnd" style="height:36px">${selOpt(s.form.end)}</select></label>
          <button class="btn primary" data-act="resCheck" ${!bookings || s.confirm || check?.pending ? 'disabled' : ''}>예약 가능한지 확인</button></div>
          ${check ? `<div role="status" aria-live="polite" class="box ${check.ok || check.pending ? 'tip' : 'warn'}" style="margin-top:10px">${check.pending ? '확인하는 중입니다…' : check.ok ? `<b>예약할 수 있습니다</b> ${esc(ymdDash(s.date))}(${wdName(s.date)}) ${esc(s.form.start)}~${esc(s.form.end)} · ${esc(s.form.title)}${sel && sel.apprYn === 'Y' ? '<div class="muted">예약을 올리면 관리자 승인 대기 상태가 됩니다.</div>' : ''}<div class="acts"><button class="btn primary" data-act="resBook" ${s.confirm || !bookings ? 'disabled' : ''}>이 내용으로 예약 확정</button><button class="btn ghost" data-act="resCancelForm">취소</button></div>` : check.errors.map(x => `<div style="color:var(--hi)">✗ ${esc(x)}</div>`).join('')}</div>` : ''}
          ${s.done ? `<div role="status" aria-live="polite" class="box tip" style="margin-top:10px"><b>예약을 올렸습니다.</b> ${esc(s.done)}<div class="muted">변경·취소는 그룹웨어 자원 화면의 “나의예약현황”에서 합니다.</div></div>` : ''}</div>
        <h2>다가오는 예약 ${upcoming ? `<span class="muted">${upcoming.length}건${upcoming.length > 12 ? ' · 최대 12건 표시' : ''}</span>` : ''}</h2>
        ${scoped && s.request.upFrom ? `<div class="muted">${ymdDash(s.request.upFrom)}~${ymdDash(s.request.upTo)}</div>` : ''}
        ${upcomingErr ? retry('다가오는 예약을 확인할 수 없습니다', upcomingErr) : !upcoming ? '<div class="list"><div class="empty" role="status">다가오는 예약을 조회하는 중입니다…</div></div>' : upcoming.length ? `<div class="list">${upcoming.slice(0, 12).map(b => `<div class="row" style="grid-template-columns:150px 1fr auto"><span class="muted">${esc(fmtB(b))}</span><div class="mn"><div class="t">${esc(b.title)}</div></div><div class="w">${esc(b.who)}${me && b.who === me ? ' (나)' : ''}</div></div>`).join('')}</div>` : '<div class="list"><div class="empty"><b>다가오는 예약이 없습니다</b></div></div>'}`;
    return `${pgh('일정·예약', '', `<button class="btn sm" data-act="openUrl" data-url="${esc(GW.links.route('#/UK/UKA/UKA0000?specialLnb=Y&moduleCode=UK&menuCode=UKA&pageCode=UKA0000'))}" data-title="그룹웨어 자원 화면">${ic('ext')}그룹웨어 자원 화면</button>`)}${body}`;
  }

  function resEnsure() {
    if (!allowed('resource')) return;
    const s = resState();
    if (resOwnerValid(s.owner) && (!resInScope(s) || (!s.busy && !s.bookings && !s.err))) resLoad();
  }
  function resRender() { if (S.view === 'resource') { resSyncForm(); renderMain(); } }
  function resRows(rows, sel) {
    const stamp = v => /^\d{8}(?:(?:[01]\d|2[0-3])[0-5]\d|2400)$/.test(v) && resOnDate(v.slice(0, 8)).toJSON()?.startsWith(ymdDash(v.slice(0, 8)));
    const matched = Array.isArray(rows) && rows.filter(b => !b?.resSeq || String(b.resSeq) === String(sel));
    if (!matched || matched.some(b => !b || typeof b.start !== 'string' || typeof b.end !== 'string' || !stamp(b.start) || !stamp(b.end) || b.start.endsWith('2400') || b.end <= b.start)) throw new Error('예약 날짜·시간을 확인할 수 없는 응답입니다');
    return matched;
  }
  async function resLoad(force) {
    const s = resState();
    if (!resOwnerValid(s.owner) || (!force && s.busy && resInScope(s))) return;
    if (!s.date) s.date = resToday();
    const q = s.request = {owner: s.owner, date: s.date, sel: s.sel};
    const active = () => s.request === q && resInScope(s, q);
    const fail = (field, e) => { if (active()) { s[field] = String(e?.message || e).slice(0, 100); logError('resource', s[field]); } };
    s.busy = true; s.err = ''; s.upcomingErr = ''; s.bookings = null; s.upcoming = null; s.check = null;
    try {
      const list = s.list || (await GW.resourceList()).filter(r => r.useYn !== 'N');
      if (!active()) return;
      s.list = list;
      s.sel = q.sel = (list.find(r => r.resSeq === q.sel) || list[0])?.resSeq || '';
      if (!q.sel) { s.bookings = []; return; }
      const today = resToday();
      q.upFrom = q.date > today ? q.date : today;
      q.upTo = resShift(q.upFrom, 30);
      const read = async (field, err, from, to) => {
        try {
          const rows = await GW.resourceBookings({from, to, resSeqs: [q.sel]});
          if (active()) s[field] = resRows(rows, q.sel)
            .filter(b => b.start.slice(0, 8) <= to && (b.end.slice(0, 8) > from || R.bookingSpanOnDay(b, from)))
            .sort((a, b) => a.start.localeCompare(b.start));
        } catch (e) { fail(err, e); }
        if (active()) resRender();
      };
      if (S.view === 'resource') renderMain();
      await Promise.all([read('bookings', 'err', q.date, q.date), read('upcoming', 'upcomingErr', q.upFrom, q.upTo)]);
    } catch (e) { fail('err', e); }
    finally { if (active()) { s.busy = false; resRender(); } }
  }
  function resSyncForm() {
    const s = resState();
    const t = $('#resTitle'), a = $('#resStart'), z = $('#resEnd');
    if (t) s.form.title = t.value;
    if (a) s.form.start = a.value;
    if (z) s.form.end = z.value;
  }
  const resInvalidate = () => { const s = resState(); s.rev++; s.check = null; s.done = null; };
  function resDay(v) { resSyncForm(); const s = resState(); const n = Number(v); s.date = n ? resShift(s.date || resToday(), n) : resToday(); resInvalidate(); return resLoad(true); }
  function resSel(v) { resSyncForm(); resState().sel = v; resInvalidate(); return resLoad(true); }
  function resFree(a, z) { resSyncForm(); const s = resState(); if (!resInScope(s) || !s.bookings) return; s.form.start = a; const cap = R.minToHm(Number(a.slice(0, 2)) * 60 + Number(a.slice(3)) + 240); s.form.end = z > cap ? cap : z; resInvalidate(); if (z > cap) toast('한 번에 최대 4시간으로 채웠습니다. 필요하면 종료 시간을 바꾸세요.'); renderMain(); }
  function resReload() { resSyncForm(); resInvalidate(); return resLoad(true); }
  async function resCheck() {
    resSyncForm();
    const s = resState(), sel = (s.list || []).find(r => r.resSeq === s.sel);
    if (s.confirm || s.check?.pending || !sel || !resInScope(s) || !s.bookings) return;
    // 확인하는 순간의 값을 고정해 두고, 응답이 오기 전에 입력이 바뀌면 그 응답은 버린다
    const snap = Object.freeze({resSeq: sel.resSeq, date: s.date, title: s.form.title.trim(), start: s.form.start, end: s.form.end});
    const q = s.request, rev = ++s.rev;
    s.done = null;
    const v = R.validateBooking({title: snap.title, date: snap.date, start: snap.start, end: snap.end});
    if (!v.ok) { s.check = {ok: false, errors: v.errors}; renderMain(); return; }
    s.check = {pending: true}; renderMain();
    let result;
    try {
      const det = await GW.resourceDetail(snap.resSeq);
      const v2 = R.validateBooking({title: snap.title, date: snap.date, start: snap.start, end: snap.end, limitMin: det.limitMin});
      if (!v2.ok) result = {ok: false, errors: v2.errors};
      else {
        const c = await GW.resourceCheck({resSeq: snap.resSeq, start: v2.start12, end: v2.end12});
        result = c.conflict ? {ok: false, errors: ['같은 시간에 이미 예약이 있습니다. 빈 시간에서 다른 시간을 고르세요.']} : c.limit ? {ok: false, errors: ['예약 한도를 넘었습니다']} : {ok: true, errors: [], payload: Object.freeze({resSeq: snap.resSeq, title: snap.title, start12: v2.start12, end12: v2.end12})};
      }
    } catch (e) { result = {ok: false, errors: ['확인하지 못했습니다: ' + String(e.message || e).slice(0, 80)]}; }
    if (s.request !== q || !resInScope(s, q) || rev !== s.rev) return;
    s.check = result; resRender();
  }
  async function resBook(ev) {
    if (gated('resource')) return;
    if (ev && ev.isTrusted === false) return; // 사람이 직접 누른 클릭만 인정
    const s = resState();
    if (!s.check || !s.check.ok || !s.check.payload || s.confirm || !resOwnerValid(s.owner)) return;
    resSyncForm();
    if (s.request && (!resInScope(s) || !s.bookings)) return;
    // The confirmed payload is immutable, including its title.
    const p = Object.freeze({...s.check.payload});
    const owner = s.owner;
    const submittedRev = s.rev;
    const vt = R.validateBooking({title: p.title, date: s.date, start: s.form.start, end: s.form.end});
    if (!vt.ok) { s.check = {ok: false, errors: vt.errors}; renderMain(); return; }
    // 확정 직전, 화면의 시간·자원이 확인한 값과 같은지 다시 비교한다
    if (p.title !== s.form.title.trim() || p.resSeq !== s.sel || p.start12 !== s.date + s.form.start.replace(':', '') || p.end12 !== s.date + s.form.end.replace(':', '')) { s.check = null; renderMain(); toast('내용이 바뀌어 다시 확인이 필요합니다.'); return; }
    s.confirm = true; renderMain();
    const sel = (s.list || []).find(r => r.resSeq === p.resSeq);
    try {
      const out = await GW.reserveResource({resSeq: p.resSeq, title: p.title, start: p.start12, end: p.end12});
      if (!out || out.ok !== true || (out.verifiedAfterTimeout && out.identityVerified !== true)) throw Object.assign(new Error('저장 여부 미확인. 그룹웨어 나의예약현황에서 확인하기 전에는 다시 예약하지 마세요.'), {code: 'UNKNOWN'});
      if (S.res !== s || !resOwnerValid(owner)) return;
      const date = p.start12.slice(0, 8), start = p.start12.slice(8, 10) + ':' + p.start12.slice(10), end = p.end12.slice(8, 10) + ':' + p.end12.slice(10);
      s.done = `${sel ? sel.name + ' ' : ''}${ymdDash(date)} ${start}~${end} “${p.title}”${out.needsApproval ? ' (승인 대기)' : ''}${out.verifiedAfterTimeout ? ' (응답이 늦었지만 저장된 것을 확인했습니다)' : ''}`;
      logActionRecord({command: `자원 예약: ${sel ? sel.name : p.resSeq}`, type: '자원', target: p.title, summary: `${ymdDash(date)} ${start}~${end} 예약을 올렸습니다${out.needsApproval ? '(승인 대기)' : ''}.`, steps: [], verified: true});
      if (s.rev === submittedRev) { s.check = null; s.form.title = ''; s.rev++; }
      toast('예약을 올렸습니다.');
      s.confirm = false; await resLoad(true);
    } catch (e) {
      if (S.res !== s || !resOwnerValid(owner)) return;
      s.confirm = false;
      if (s.rev !== submittedRev) { toast('예약 결과를 현재 입력과 구분해 확인하세요: ' + String(e.message || e)); renderMain(); return; }
      s.check = {ok: false, errors: [(e.code === 'UNKNOWN' || e.code === 'TIMEOUT' ? '저장 여부 미확인. 중복 예약 방지를 위해 그룹웨어에서 먼저 확인하세요: ' : '예약하지 못했습니다: ') + String(e.message || e).slice(0, 120)]};
      logError('reserve', e.message);
      renderMain();
    }
  }
  function resCancelForm() { resInvalidate(); renderMain(); }
  function resGo() {
    const d = $('#resDate');
    if (!d?.value || !/^\d{4}-\d{2}-\d{2}$/.test(d.value)) return;
    resState().date = d.value.replace(/-/g, '');
    return resReload();
  }
