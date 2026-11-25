// GW 비서 · 날짜 고르기 하나로 통일 (v1.21)
// 할 일에서 만든 날짜 버튼(날짜와 요일을 함께 표시)과 요일 달력을 모든 날짜 칸에 쓴다. 브라우저 기본 날짜 칸은 쓰지 않는다.
// - 값은 같은 id의 숨은 input에 YYYY-MM-DD로 둔다. 고르면 input·change 이벤트를 보내 기존 처리기가 그대로 받는다.
// - 달력은 #overlay가 아닌 전용 층(#dpLayer)에 그려, 명령 창 같은 다른 창 위에서도 그 창을 닫지 않는다.
// - 방향키(하루·한 주), PageUp/PageDown(한 달), Home/End(주 처음·끝), Esc(닫기)로 고를 수 있다. 키는 04번 조각 handleKey가 먼저 넘겨준다.
// 상태는 함수 속성(dpFields.m)에 둔다: 함수 선언은 끌어올려지므로 다른 조각이 먼저 불러도 TDZ가 없다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  function dpFields() { return dpFields.m || (dpFields.m = {}); }
  function dpIso(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) ? String(v) : ''; }
  function dateText(value, empty = '날짜 선택') {
    const v = dpIso(value);
    if (!v) return empty;
    return `${v.slice(0, 4)}. ${v.slice(5, 7)}. ${v.slice(8, 10)}. (${['일', '월', '화', '수', '목', '금', '토'][new Date(v + 'T00:00:00Z').getUTCDay()]})`;
  }
  // opt: clear(날짜 지우기 허용), min·max(YYYY-MM-DD), minOf·maxOf(다른 날짜 칸 id: 시작일 이후·종료일 이전), empty(빈 값 문구), disabled, cls
  function dateField(id, value, label, opt = {}) {
    const f = dpFields()[id] = {label: label || '날짜', clear: !!opt.clear, min: opt.min || '', max: opt.max || '', minOf: opt.minOf || '', maxOf: opt.maxOf || '', empty: opt.empty || '날짜 선택'};
    const text = dateText(value, f.empty);
    return `<span class="td-date-field${opt.cls ? ' ' + esc(opt.cls) : ''}"><input type="hidden" id="${esc(id)}" value="${esc(dpIso(value))}"><button type="button" class="td-date-btn" data-act="dpOpen" data-id="${esc(id)}" aria-haspopup="dialog" aria-label="${esc(f.label)}: ${esc(text)}, 날짜 선택"${opt.disabled ? ' disabled' : ''}>${ic('cal')}<span>${esc(text)}</span></button></span>`;
  }
  // 코드에서 값을 바꾼 뒤 버튼 글자를 맞춘다
  function dateFieldSync(id) {
    const input = $('#' + id), b = root.querySelector(`[data-act="dpOpen"][data-id="${id}"]`), f = dpFields()[id] || {label: '날짜', empty: '날짜 선택'};
    if (!input || !b) return;
    const text = dateText(input.value, f.empty);
    const s = b.querySelector('span'); if (s) s.textContent = text;
    b.setAttribute('aria-label', `${f.label}: ${text}, 날짜 선택`);
  }
  function dpIsOpen() { const l = $('#dpLayer'); return !!(l && l.dataset.open); }
  function dpClose(focusBack = true) {
    const l = $('#dpLayer'); if (!l || !l.dataset.open) return;
    const id = l.dataset.open; l.innerHTML = ''; delete l.dataset.open;
    if (focusBack) root.querySelector(`[data-act="dpOpen"][data-id="${id}"]`)?.focus();
  }
  function dpRange(f) {
    const other = k => dpIso(k && ($('#' + k) || {}).value);
    return {min: dpIso(f.min) || other(f.minOf), max: dpIso(f.max) || other(f.maxOf)};
  }
  function dpOpen(id, month, focusIso) {
    const input = $('#' + id), f = dpFields()[id], l = $('#dpLayer');
    if (!input || !f || !l) return;
    const sel = dpIso(input.value), td = today(), {min, max} = dpRange(f), ok = d => (!min || d >= min) && (!max || d <= max);
    const want = dpIso(focusIso) || sel || (ok(td) ? td : min || max || td);
    const base = /^\d{4}-\d{2}$/.test(month || '') ? month : want.slice(0, 7);
    const y = Number(base.slice(0, 4)), m = Number(base.slice(5, 7));
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const shift = delta => new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
    const isoOf = day => `${base}-${String(day).padStart(2, '0')}`;
    let focus = want.slice(0, 7) === base && ok(want) ? want : '';
    if (!focus) for (let d = 1; d <= count; d++) if (ok(isoOf(d))) { focus = isoOf(d); break; }
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<span class="td-cal-blank" aria-hidden="true"></span>');
    for (let d = 1; d <= count; d++) {
      const iso = isoOf(d), wd = (first + d - 1) % 7, can = ok(iso);
      cells.push(`<button type="button" class="td-cal-day${iso === sel ? ' selected' : ''}${iso === td ? ' today' : ''}${wd === 0 ? ' sun' : wd === 6 ? ' sat' : ''}" data-act="dpPick" data-id="${esc(id)}" data-v="${iso}" tabindex="${iso === focus ? 0 : -1}" aria-label="${dateText(iso)}${iso === td ? ', 오늘' : ''}${can ? '' : ', 고를 수 없음'}" aria-pressed="${iso === sel}"${can ? '' : ' disabled'}>${d}</button>`);
    }
    const prevOk = !min || shift(-1) >= min.slice(0, 7), nextOk = !max || shift(1) <= max.slice(0, 7);
    const hint = min || max ? `<p class="dp-hint">${min ? esc(dateText(min)) + ' 이후' : ''}${min && max ? ', ' : ''}${max ? esc(dateText(max)) + ' 이전' : ''}만 고를 수 있습니다.</p>` : '';
    l.innerHTML = `<div class="modal" data-act="dpClose" data-stop="1"><div class="dlg td-cal-dialog" data-stop="1" role="dialog" aria-modal="true" aria-label="${esc(f.label)} 선택">`
      + `<div class="td-cal-heading"><div><span class="td-cal-eyebrow">${esc(f.label)}</span><h2>${sel ? esc(dateText(sel)) : '날짜 선택'}</h2></div><button type="button" class="btn icon ghost" data-act="dpClose" aria-label="날짜 선택 닫기">${ic('x')}</button></div>`
      + `<div class="td-cal-nav"><button type="button" class="btn sm icon ghost" data-act="dpMonth" data-id="${esc(id)}" data-v="${shift(-1)}" aria-label="이전 달"${prevOk ? '' : ' disabled'}>‹</button><strong aria-live="polite">${y}년 ${m}월</strong><button type="button" class="btn sm icon ghost" data-act="dpMonth" data-id="${esc(id)}" data-v="${shift(1)}" aria-label="다음 달"${nextOk ? '' : ' disabled'}>›</button></div>`
      + `<div class="td-cal-grid" role="group" aria-label="${y}년 ${m}월 달력">${['일', '월', '화', '수', '목', '금', '토'].map((w, i) => `<span class="td-cal-week${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}" aria-hidden="true">${w}</span>`).join('')}${cells.join('')}</div>${hint}`
      + `<div class="td-cal-footer">${f.clear ? `<button type="button" class="btn sm ghost" data-act="dpPick" data-id="${esc(id)}" data-v="">날짜 지우기</button>` : '<span class="muted">방향키로 옮기고 Enter로 고릅니다</span>'}<button type="button" class="btn sm" data-act="dpPick" data-id="${esc(id)}" data-v="${td}"${ok(td) ? '' : ' disabled'}>오늘</button></div></div></div>`;
    l.dataset.open = id;
    setTimeout(() => (l.querySelector('.td-cal-day[tabindex="0"]') || l.querySelector('.td-cal-day:not([disabled])') || l.querySelector('[data-act="dpClose"].btn'))?.focus(), 20);
  }
  function dpPick(id, v) {
    const input = $('#' + id); if (!input) { dpClose(false); return; }
    const f = dpFields()[id] || {};
    const val = dpIso(v);
    if (!val && !f.clear) return;
    input.value = val;
    dateFieldSync(id);
    dpClose();
    input.dispatchEvent(new Event('input', {bubbles: true, composed: true}));
    input.dispatchEvent(new Event('change', {bubbles: true, composed: true}));
  }
  function dpKey(e) {
    const l = $('#dpLayer'); if (!l || !l.dataset.open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dpClose(); return; }
    if (e.key === 'Tab') { // 달력 안에서만 돈다
      const items = [...l.querySelectorAll('button:not([disabled])')].filter(b => b.tabIndex >= 0);
      if (!items.length) return;
      const i = items.indexOf(root.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); } else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      e.stopPropagation(); return;
    }
    const t = e.composedPath()[0];
    if (!t || !t.classList || !t.classList.contains('td-cal-day')) { if (['Enter', ' '].includes(e.key)) e.stopPropagation(); return; }
    const cur = t.dataset.v, d = new Date(cur + 'T00:00:00Z'), wd = d.getUTCDay();
    const step = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -wd, End: 6 - wd}[e.key];
    let next = '';
    if (step !== undefined) next = new Date(d.getTime() + step * 86400000).toISOString().slice(0, 10);
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (e.key === 'PageUp' ? -1 : 1), 1));
      const last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)).getUTCDate();
      next = `${n.toISOString().slice(0, 7)}-${String(Math.min(d.getUTCDate(), last)).padStart(2, '0')}`;
    } else { if (['Enter', ' '].includes(e.key)) e.stopPropagation(); return; }
    e.preventDefault(); e.stopPropagation();
    const f = dpFields()[l.dataset.open] || {}, {min, max} = dpRange(f);
    if ((min && next < min) || (max && next > max)) return;
    const btn = l.querySelector(`.td-cal-day[data-v="${next}"]`);
    if (btn) { l.querySelectorAll('.td-cal-day[tabindex="0"]').forEach(b => { b.tabIndex = -1; }); btn.tabIndex = 0; btn.focus(); return; }
    dpOpen(l.dataset.open, next.slice(0, 7), next);
  }

  // 날짜+시각 칸(근태 신청 등): 날짜는 같은 달력, 시각은 10분 단위 고르기. 값은 숨은 input(id)에 YYYY-MM-DDTHH:MM으로 두고,
  // 둘 중 하나를 바꾸면 합친 값을 넣고 change를 보낸다(16번 조각 change 처리기가 data-dt를 보고 dtCompose를 부른다).
  function dpTimes(cur) {
    const out = [];
    for (let m = 0; m < 1440; m += 10) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    if (/^\d{2}:\d{2}$/.test(cur || '') && !out.includes(cur)) { out.push(cur); out.sort(); }
    return out;
  }
  function dateTimeField(id, value, label, opt = {}) {
    const v = String(value || ''), d = dpIso(v.slice(0, 10)), t = /^\d{2}:\d{2}$/.test(v.slice(11, 16)) ? v.slice(11, 16) : '';
    const date = dateField(id + '_d', d, label, {clear: !!opt.clear, minOf: opt.minOf ? opt.minOf + '_d' : '', empty: opt.empty || '날짜 선택'}).replace('<input type="hidden"', `<input type="hidden" data-dt="${esc(id)}"`);
    const time = `<label for="${esc(id)}_t" class="vh">${esc(label)} 시각</label><select class="inp dt-time" id="${esc(id)}_t" data-dt="${esc(id)}">${opt.clear ? `<option value=""${t ? '' : ' selected'}>시각</option>` : ''}${dpTimes(t).map(x => `<option value="${x}"${x === t ? ' selected' : ''}>${x}</option>`).join('')}</select>`;
    return `<div class="dt-field" role="group" aria-label="${esc(label)}"><input type="hidden" id="${esc(id)}" value="${d ? esc(d + 'T' + (t || '09:00')) : ''}">${date}${time}</div>`;
  }
  function dtCompose(id) {
    const out = $('#' + id), d = dpIso(($('#' + id + '_d') || {}).value), sel = $('#' + id + '_t');
    if (!out) return;
    let t = (sel && sel.value) || '';
    if (d && !t) { t = '09:00'; if (sel) sel.value = t; }
    const next = d ? `${d}T${t}` : '';
    if (out.value === next) return;
    out.value = next;
    out.dispatchEvent(new Event('change', {bubbles: true, composed: true}));
  }
  // 코드에서 합친 값을 바꾼 뒤 날짜 버튼과 시각 고르기를 맞춘다
  function dateTimeSync(id) {
    const v = String(($('#' + id) || {}).value || ''), di = $('#' + id + '_d'), sel = $('#' + id + '_t');
    if (di) { di.value = dpIso(v.slice(0, 10)); dateFieldSync(id + '_d'); }
    const t = v.slice(11, 16);
    if (sel) { if (t && ![...sel.options].some(o => o.value === t)) sel.add(new Option(t, t)); sel.value = t || (sel.options[0] ? sel.options[0].value : ''); }
  }

  HOME_ACTS.dpOpen = el => { if (!el.disabled) dpOpen(el.dataset.id); };
  HOME_ACTS.dpMonth = el => { if (!el.disabled) dpOpen(el.dataset.id, el.dataset.v); };
  HOME_ACTS.dpPick = el => { if (!el.disabled) dpPick(el.dataset.id, el.dataset.v); };
  HOME_ACTS.dpClose = (el, v, e) => { const t = e && e.composedPath ? e.composedPath()[0] : null; if (el.classList.contains('modal') && t !== el) return; dpClose(); };
