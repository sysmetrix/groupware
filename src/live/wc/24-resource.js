// GW 비서 · 자원 예약 (관용차량·LED패널 현황 + 바로 예약 + 내 예약 승인 여부)
// v1.26: 그룹웨어 자원 예약 창처럼 '예약명 · 일시 · 내용'만 쓰고 [예약 신청] 한 번으로 올린다. 시간은 지금 뒤의 빈 칸으로 미리 채우고,
//        겹침·지난 시각은 고르는 동안 바로 알려 준다. 저장 직전 그룹웨어가 중복·한도를 다시 확인한다(collector reserveResource).
//        내 예약은 그룹웨어 '나의예약현황'과 같은 조회로 승인 대기·승인 완료·반려·취소를 보여 준다. 취소·변경은 그룹웨어 자원 화면에서 한다.
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
    if (!S.res || (S.res.owner !== undefined && S.res.owner !== owner)) S.res = {date: '', list: null, sel: '', bookings: null, busy: false, err: '', form: {title: '', start: '09:00', end: '10:00', desc: '', auto: true}, check: null, confirm: false, done: null, rev: 0, mine: null, mineErr: ''};
    S.res.owner = owner;
    if (S.res.form && S.res.form.desc === undefined) { S.res.form.desc = ''; S.res.form.auto = true; }
    return S.res;
  }
  const resInScope = (s, q = s.request) => !!q && S.res === s && resOwnerValid(q.owner) && s.date === q.date && s.sel === q.sel;
  const resHm = v => v.slice(8, 10) + ':' + v.slice(10);
  const resPeriod = v => ymdDash(v.slice(0, 8)) + ' ' + resHm(v);
  const resMd = v => `${Number(v.slice(4, 6))}/${Number(v.slice(6, 8))}(${wdName(v.slice(0, 8))})`;
  const resBadge = code => { const x = typeof R.resStatusLabel === 'function' ? R.resStatusLabel(code) : {label: ''}; return x.label ? `<span class="bdg ${x.tone === 'urgent' ? 'urgent' : x.tone === 'todo' ? 'check' : x.tone === 'ok' ? 'confirm' : 'tag'}">${esc(x.label)}</span>` : ''; };
  const resTimeOpts = () => R.timeOptions({from: '06:00', to: '23:30'});

  function resTimeline(bookings, date, opts, me) {
    const free = R.freeSlots(bookings, date, {minMin: 1});
    const timeline = bookings.map(b => {
      const start = b.start.slice(0, 8) === date ? resHm(b.start) : '00:00';
      const end = b.end.slice(0, 8) === date ? resHm(b.end) : '24:00';
      const period = b.start.slice(0, 8) !== b.end.slice(0, 8) ? `<br><small class="muted">원래 예약 기간 ${resPeriod(b.start)} ~ ${resPeriod(b.end)}</small>` : '';
      return {start, html: `<div class="trow"><span><b>${esc(start)}~${esc(end)}</b> · 예약됨 · ${esc(b.title)} ${resBadge(b.status)}${period}</span><span class="muted">${esc(b.who)}${me && b.who === me ? ' (나)' : ''}</span></div>`};
    });
    for (const f of free) {
      const a = opts.find(o => o >= f.start), z = opts.findLast(o => o <= f.end);
      timeline.push({start: f.start, html: `<div class="trow"><span><b>${esc(f.start)}~${esc(f.end)}</b> · 비어 있음</span>${a < z ? `<button class="chip" data-act="resFree" data-s="${esc(a)}" data-e="${esc(z)}">이 시간으로 예약</button>` : '<span class="muted">30분 단위 선택 불가</span>'}</div>`});
    }
    return `${!bookings.length ? '<p class="muted">예약이 없습니다</p>' : ''}${!free.length ? '<p class="muted">이 날은 빈 시간이 없습니다 (09:00~18:00)</p>' : ''}${timeline.sort((a, b) => a.start.localeCompare(b.start)).map(x => x.html).join('')}`;
  }

  // 입력하는 동안 보여 줄 상태: 예약명 · 시간 순서 · 지난 시각 · 그날 예약과 겹침(화면이 읽은 예약 기준). 저장 직전 그룹웨어가 한 번 더 확인한다.
  function resFormState() {
    const s = resState(), f = s.form;
    if (!resInScope(s) || !s.bookings) return {ok: false, text: '예약 현황을 확인한 뒤 예약할 수 있습니다.', tone: 'muted'};
    if (typeof R.validateBooking !== 'function') return {ok: false, text: '', tone: 'muted'};
    const v = R.validateBooking({title: f.title, date: s.date, start: f.start, end: f.end});
    const hard = v.errors.filter(x => !/예약명/.test(x));
    if (hard.length) return {ok: false, text: hard[0], tone: 'bad'};
    const hit = typeof R.resConflict === 'function' ? R.resConflict(s.bookings, s.date, f.start, f.end) : null;
    if (hit) return {ok: false, text: `${resHm(hit.start.slice(0, 8) === s.date ? hit.start : s.date + '0000')}~${hit.end.slice(0, 8) === s.date ? resHm(hit.end) : '24:00'} ${hit.title}${hit.who ? '(' + hit.who + ')' : ''} 예약과 겹칩니다. 다른 시간을 고르세요.`, tone: 'bad'};
    if (!String(f.title || '').trim()) return {ok: false, text: `${f.start}~${f.end} 비어 있습니다. 예약명을 쓰면 신청할 수 있습니다.`, tone: 'muted'};
    return {ok: true, text: `${f.start}~${f.end} 비어 있습니다.`, tone: 'good'};
  }
  function resPaintStatus() {
    const st = resFormState(), s = resState(), el = $('#resStatus'), b = $('#resBookBtn');
    if (el) { el.textContent = (st.tone === 'good' ? '✓ ' : st.tone === 'bad' ? '✗ ' : '') + st.text; el.className = 'res-status res-' + st.tone; }
    if (b) b.disabled = !st.ok || s.confirm;
  }

  function vResource() {
    if (!allowed('resource')) return pgh('일정·예약', '관리자 설정으로 꺼져 있습니다', '');
    const s = resState();
    if (!s.date) s.date = resToday();
    if (!resOwnerValid(s.owner)) return pgh('일정·예약', '로그인 정보 변경을 확인한 뒤 다시 조회할 수 있습니다', '');
    const sel = (s.list || []).find(r => r.resSeq === s.sel);
    const scoped = resInScope(s), bookings = scoped ? s.bookings : null, err = scoped ? s.err : '';
    const upcoming = scoped ? s.upcoming : null, upcomingErr = scoped ? s.upcomingErr : '';
    const opts = resTimeOpts();
    const selOpt = cur => opts.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
    const me = (S.raw && S.raw.principal && S.raw.principal.name) || '';
    const fmtB = b => `${b.start.slice(4, 6)}/${b.start.slice(6, 8)}${b.end.slice(0, 8) !== b.start.slice(0, 8) ? `~${b.end.slice(4, 6)}/${b.end.slice(6, 8)}` : ''} ${resHm(b.start)}~${resHm(b.end)}`;
    const retry = (label, error) => `<div class="box warn">${label}: ${esc(error)} <button class="btn sm" data-act="resReload">다시 시도</button></div>`;
    const appr = sel && sel.apprYn === 'Y';
    const st = resFormState();
    const durs = [['60', '1시간'], ['120', '2시간'], ['240', '4시간'], ['day', '근무시간(09~18)']];
    const form = `<section class="box res-book" id="resForm" aria-label="예약하기" aria-busy="${s.confirm}">
        <div class="res-book-h"><h2>예약하기</h2><span class="muted">${esc(sel ? sel.name : '')} · ${esc(ymdDash(s.date))}(${wdName(s.date)})${appr ? ' · 관리자 승인 필요' : ''}</span></div>
        <label class="res-f"><span>예약명</span><input class="inp" id="resTitle" value="${esc(s.form.title)}" placeholder="예) 학교 방문, 교육 참석" autocomplete="off"></label>
        <div class="res-f"><span>일시</span><div class="res-time"><b>${esc(ymdDash(s.date))}(${wdName(s.date)})</b>
          <label class="vh" for="resStart">시작</label><select class="inp" id="resStart">${selOpt(s.form.start)}</select> ~ <label class="vh" for="resEnd">종료</label><select class="inp" id="resEnd">${selOpt(s.form.end)}</select>
          <span class="seg" role="group" aria-label="사용 시간">${durs.map(([v, n]) => `<button type="button" class="chip" data-act="resDur" data-v="${v}">${n}</button>`).join('')}</span></div></div>
        <label class="res-f"><span>내용 <small class="muted">(선택)</small></span><input class="inp" id="resDesc" value="${esc(s.form.desc || '')}" placeholder="${appr ? '예) 행선지·목적 (승인 담당자가 봅니다)' : '예) 사용 목적'}" autocomplete="off"></label>
        <div class="res-act"><p id="resStatus" class="res-status res-${st.tone}" role="status" aria-live="polite">${st.tone === 'good' ? '✓ ' : st.tone === 'bad' ? '✗ ' : ''}${esc(st.text)}</p>
          <button class="btn primary" id="resBookBtn" data-act="resBook" ${!st.ok || s.confirm ? 'disabled' : ''}>${s.confirm ? '예약을 올리는 중…' : appr ? '예약 신청 (승인 요청)' : '예약하기'}</button></div>
        ${s.check && !s.check.ok ? `<div role="alert" class="box warn" style="margin-top:10px">${s.check.errors.map(x => `<div>✗ ${esc(x)}</div>`).join('')}</div>` : ''}
        ${s.done ? `<div role="status" aria-live="polite" class="box tip" style="margin-top:10px"><b>${esc(s.done.head)}</b> ${esc(s.done.text)}<div class="muted">${s.done.appr ? '승인되면 아래 내 예약 현황에서 ‘승인 완료’로 바뀝니다. ' : ''}변경·취소는 그룹웨어 자원 화면의 ‘나의예약현황’에서 합니다.</div></div>` : ''}
      </section>`;
    const mine = s.mine, mineErr = s.mineErr;
    const mineList = mine ? [...mine].sort((a, b) => (a.end < resToday() + '0000') - (b.end < resToday() + '0000') || a.start.localeCompare(b.start)) : null;
    const mineHtml = s.mineOff ? '' : `<h2>내 예약 현황 ${mine ? `<span class="muted">${mine.length}건 · 승인 대기 ${mine.filter(x => ['RE', '10'].includes(x.status)).length}건</span>` : ''}</h2>
      ${mineErr ? retry('내 예약 현황을 확인할 수 없습니다', mineErr) : !mine ? '<div class="list"><div class="empty" role="status">내 예약 현황을 조회하는 중입니다…</div></div>' : mine.length ? `<div class="list">${mineList.slice(0, 15).map(b => `<div class="row res-mine" style="grid-template-columns:150px 1fr auto"><span class="muted">${esc(fmtB(b))}</span><div class="mn"><div class="t">${esc(b.title)}</div><div class="muted">${esc(b.name)}${b.desc ? ' · ' + esc(b.desc) : ''}</div></div><div class="w">${resBadge(b.status)}</div></div>`).join('')}</div>` : '<div class="list"><div class="empty"><b>최근 30일과 앞으로 90일 사이의 내 예약이 없습니다</b></div></div>'}`;
    const body = !s.list ? err ? retry('자원 정보를 읽지 못했습니다', err) : '<div role="status">자원 목록을 조회하는 중입니다…</div>'
      : !s.list.length ? '<div class="empty"><b>예약할 수 있는 자원이 없습니다</b></div>'
      : `<div class="bar"><div class="seg">${s.list.map(r => `<button class="${r.resSeq === s.sel ? 'on' : ''}" data-act="resSel" aria-pressed="${r.resSeq === s.sel}" data-v="${esc(r.resSeq)}">${esc(r.name)}</button>`).join('')}</div>
          <button class="btn sm icon" data-act="resDay" data-v="-1" aria-label="이전 날">${ic('back')}</button>
          ${typeof dateField === 'function' ? dateField('resDate', ymdDash(s.date), '예약 날짜', {}) : ''}
          <button class="btn sm icon" data-act="resDay" data-v="1" aria-label="다음 날" style="transform:scaleX(-1)">${ic('back')}</button>
          <button class="btn sm" data-act="resDay" data-v="0">오늘</button></div>
        ${form}
        <div class="card2"><div class="ct">이 날의 예약 시간표 <span class="muted">빈 시간 기준 09:00~18:00</span></div>
          ${err ? retry('예약 현황과 빈 시간을 확인할 수 없습니다', err) : bookings ? resTimeline(bookings, s.date, opts, me) : '<div class="muted" role="status">예약 현황을 조회하는 중입니다. 빈 시간을 조회하는 중입니다…</div>'}</div>
        ${mineHtml}
        <h2>다가오는 예약 <span class="muted">${esc(sel ? sel.name : '')}${upcoming ? ` · ${upcoming.length}건${upcoming.length > 12 ? ' · 최대 12건 표시' : ''}` : ''}</span></h2>
        ${scoped && s.request.upFrom ? `<div class="muted">${ymdDash(s.request.upFrom)}~${ymdDash(s.request.upTo)}</div>` : ''}
        ${upcomingErr ? retry('다가오는 예약을 확인할 수 없습니다', upcomingErr) : !upcoming ? '<div class="list"><div class="empty" role="status">다가오는 예약을 조회하는 중입니다…</div></div>' : upcoming.length ? `<div class="list">${upcoming.slice(0, 12).map(b => `<div class="row" style="grid-template-columns:150px 1fr auto"><span class="muted">${esc(fmtB(b))}</span><div class="mn"><div class="t">${esc(b.title)} ${resBadge(b.status)}</div></div><div class="w">${esc(b.who)}${me && b.who === me ? ' (나)' : ''}</div></div>`).join('')}</div>` : '<div class="list"><div class="empty"><b>다가오는 예약이 없습니다</b></div></div>'}`;
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
  // 아직 손대지 않은 예약 칸이면 그날의 다음 빈 시간(1시간)으로 채운다.
  function resAutoTimes(s) {
    if (!s.form.auto || !s.bookings || typeof R.resDefaultTimes !== 'function') return;
    const t = R.resDefaultTimes({date: s.date, bookings: s.bookings});
    if (t) { s.form.start = t.start; s.form.end = t.end; }
  }
  async function resLoadMine(s) {
    if (typeof GW.myReservations !== 'function') { s.mineOff = true; return; } // 이 조회가 없는 수집기(옛 북마크)에서는 칸을 숨긴다
    const owner = s.owner, today = resToday();
    try {
      const rows = await GW.myReservations({from: resShift(today, -30), to: resShift(today, 90)});
      if (S.res === s && resOwnerValid(owner)) { s.mine = rows; s.mineErr = ''; }
    } catch (e) { if (S.res === s && resOwnerValid(owner)) { s.mine = null; s.mineErr = String(e?.message || e).slice(0, 100); logError('resource.mine', s.mineErr); } }
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
      const raw = s.list || (await GW.resourceList()).filter(r => r.useYn !== 'N');
      const list = typeof R.resSortList === 'function' ? R.resSortList(raw) : raw; // 관용차량을 첫 번째로
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
          if (active() && field === 'bookings') resAutoTimes(s);
        } catch (e) { fail(err, e); }
        if (active()) resRender();
      };
      if (S.view === 'resource') renderMain();
      if (!s.mine && !s.mineErr && !s.mineOff) resLoadMine(s).then(() => { if (S.res === s) resRender(); });
      await Promise.all([read('bookings', 'err', q.date, q.date), read('upcoming', 'upcomingErr', q.upFrom, q.upTo)]);
    } catch (e) { fail('err', e); }
    finally { if (active()) { s.busy = false; resRender(); } }
  }
  function resSyncForm() {
    const s = resState();
    const t = $('#resTitle'), a = $('#resStart'), z = $('#resEnd'), d = $('#resDesc');
    if (t) s.form.title = t.value;
    // 시간을 아직 손대지 않았으면(auto) 화면의 칸보다 자동으로 고른 빈 시간이 우선이다(다시 그리기 전에 옛 값으로 덮지 않게).
    if (a && !s.form.auto) s.form.start = a.value;
    if (z && !s.form.auto) s.form.end = z.value;
    if (d) s.form.desc = d.value;
  }
  const resInvalidate = () => { const s = resState(); s.rev++; s.check = null; s.done = null; s.form.auto = true; };
  function resDay(v) { resSyncForm(); const s = resState(); const n = Number(v); s.date = n ? resShift(s.date || resToday(), n) : resToday(); resInvalidate(); return resLoad(true); }
  function resSel(v) { resSyncForm(); resState().sel = v; resInvalidate(); return resLoad(true); }
  // 시간표의 빈 칸 → 예약 칸(1시간, 빈 칸이 더 짧으면 그만큼)을 채우고 예약명으로 간다.
  function resFree(a, z) {
    resSyncForm(); const s = resState(); if (!resInScope(s) || !s.bookings) return;
    const m = v => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
    s.form.start = a; s.form.end = R.minToHm(Math.min(m(z), m(a) + 60)); s.form.auto = false; s.check = null; s.done = null;
    renderMain(); const t = $('#resTitle'); if (t) t.focus();
  }
  // 사용 시간 단추: 시작 시각에서 1·2·4시간, 또는 근무시간 09:00~18:00.
  function resDur(v) {
    resSyncForm(); const s = resState(); const m = x => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
    if (v === 'day') { s.form.start = '09:00'; s.form.end = '18:00'; }
    else { const n = Number(v); if (!(n > 0)) return; s.form.end = R.minToHm(Math.min(m(s.form.start) + n, 23 * 60 + 30)); }
    s.form.auto = false; s.check = null; s.done = null; renderMain();
  }
  function resReload() { resSyncForm(); resInvalidate(); const s = resState(); s.mine = null; s.mineErr = ''; return resLoad(true); }
  // [예약하기] 한 번: 화면의 값을 그 순간 고정해 확인하고 그룹웨어에 올린다(그룹웨어가 중복·한도·지난 시각을 저장 직전에 다시 확인).
  async function resBook(ev) {
    if (gated('resource')) return;
    if (ev && ev.isTrusted === false) return; // 사람이 직접 누른 클릭만 인정
    const s = resState();
    if (s.confirm || !resOwnerValid(s.owner)) return;
    resSyncForm();
    const sel = (s.list || []).find(r => r.resSeq === s.sel);
    if (!sel || !resInScope(s) || !s.bookings) return;
    const p = Object.freeze({resSeq: sel.resSeq, date: s.date, title: String(s.form.title || '').trim(), start: s.form.start, end: s.form.end, desc: String(s.form.desc || '').trim()});
    const v = R.validateBooking({title: p.title, date: p.date, start: p.start, end: p.end});
    const hit = v.ok && typeof R.resConflict === 'function' ? R.resConflict(s.bookings, p.date, p.start, p.end) : null;
    if (!v.ok || hit) { s.check = {ok: false, errors: v.ok ? ['같은 시간에 이미 예약이 있습니다. 다른 시간을 고르세요.'] : v.errors}; renderMain(); return; }
    const owner = s.owner, submittedRev = ++s.rev;
    s.check = null; s.done = null; s.confirm = true; renderMain();
    try {
      const out = await GW.reserveResource({resSeq: p.resSeq, title: p.title, start: p.date + p.start.replace(':', ''), end: p.date + p.end.replace(':', ''), desc: p.desc});
      if (!out || out.ok !== true || (out.verifiedAfterTimeout && out.identityVerified !== true)) throw Object.assign(new Error('저장 여부 미확인. 그룹웨어 나의예약현황에서 확인하기 전에는 다시 예약하지 마세요.'), {code: 'UNKNOWN'});
      if (S.res !== s || !resOwnerValid(owner)) return;
      const appr = !!out.needsApproval;
      s.done = {head: appr ? '예약을 신청했습니다(승인 대기).' : '예약했습니다.', text: `${sel.name} ${ymdDash(p.date)}(${wdName(p.date)}) ${p.start}~${p.end} “${p.title}”`, appr};
      logActionRecord({command: `자원 예약: ${sel.name}`, type: '자원', target: p.title, summary: `${ymdDash(p.date)} ${p.start}~${p.end} 예약을 올렸습니다${appr ? '(승인 대기)' : ''}.`, steps: [], verified: true});
      if (s.rev === submittedRev) { s.form.title = ''; s.form.desc = ''; s.form.auto = true; }
      toast(appr ? '예약을 신청했습니다. 관리자 승인을 기다립니다.' : '예약했습니다.');
      s.confirm = false; s.mine = null; s.mineErr = '';
      const done = s.done; await resLoad(true); if (S.res === s) { s.done = done; resRender(); }
    } catch (e) {
      if (S.res !== s || !resOwnerValid(owner)) return;
      s.confirm = false;
      s.check = {ok: false, errors: [(e.code === 'UNKNOWN' || e.code === 'TIMEOUT' ? '저장 여부 미확인. 중복 예약 방지를 위해 그룹웨어에서 먼저 확인하세요: ' : '예약하지 못했습니다: ') + String(e.message || e).slice(0, 120)]};
      logError('reserve', e.message);
      renderMain();
    }
  }
  function resGo() {
    const d = $('#resDate');
    if (!d?.value || !/^\d{4}-\d{2}-\d{2}$/.test(d.value)) return;
    resState().date = d.value.replace(/-/g, '');
    return resReload();
  }
  // 고르는 동안 겹침·지난 시각을 바로 알린다(화면을 다시 그리지 않아 입력 중인 칸이 그대로다).
  if (typeof root === 'object' && root && typeof root.addEventListener === 'function') root.addEventListener('input', e => {
    const id = e.target && e.target.id;
    if (!['resTitle', 'resStart', 'resEnd', 'resDesc'].includes(id)) return;
    if (id === 'resStart' || id === 'resEnd') resState().form.auto = false;
    resSyncForm();
    resPaintStatus();
  }, true);
