// GW 비서 · 내 할 일 보기 더하기 (v1.20): 그룹웨어 ToDo 화면과 같은 칸반·일정표(간트)·진행률·여러 개 추가.
// 51-todo.js의 TD·todo* 함수를 쓴다. 쓰기는 모두 그룹웨어 ToDo로 가며, 결과를 그대로 알린다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const TODO_VIEWS = [['list', '목록'], ['kanban', '칸반'], ['timeline', '일정표']];
  function todoViewSeg() {
    return `<div class="seg" role="group" aria-label="보기 방식">${TODO_VIEWS.map(([k, n]) => `<button class="${TD.view === k ? 'on' : ''}" aria-pressed="${TD.view === k}" data-act="tdView" data-v="${k}">${esc(n)}</button>`).join('')}</div>`;
  }
  // 칸반·일정표는 상태를 칸으로 보여 주므로 상태 거르기 대신 찾기·중요도만 적용한다
  function todoBaseFiltered() {
    const q = TD.q.trim().toLowerCase();
    return (TD.list || []).filter(t => (!q || `${t.title} ${t.memo} ${t.creatorName || ''} ${t.projectName || ''}`.toLowerCase().includes(q)) && (TD.imp === 'all' || t.imp === TD.imp));
  }

  // ---------- 진행률 ----------
  async function todoSetRate(id, rate) {
    const t = todoFind(id);
    if (!t) return {ok: false, text: '목록에서 이 할 일을 찾지 못했습니다.'};
    if (!t.canProgress) return {ok: false, text: '내가 담당자인 ToDo만 진행률을 바꿀 수 있습니다.'};
    const n = Math.max(0, Math.min(100, Math.round(Number(rate) || 0)));
    if (n >= 100) return todoToggle(id, true); // 반복 할 일의 다음 회차 만들기와 같은 길로
    t.rate = n; t.done = false; t.doneDate = ''; todoMirror(); todoRerender(); // 먼저 화면에 반영하고 그룹웨어 결과로 다시 맞춘다
    try { await GW.todoSetProgress(id, n); await todoLoad({force: true}); return {ok: true, rate: n}; }
    catch (e) { logError('todo.rate', e.message); await todoLoad({force: true}); return {ok: false, text: '진행률을 저장하지 못했습니다: ' + todoErr(e)}; }
  }

  // ---------- 칸반(예정·진행·완료) ----------
  const TODO_KAN = [['todo', '예정'], ['doing', '진행'], ['done', '완료']];
  const todoKanCol = t => { const s = R.tdState(t); return s === 'late' ? 'todo' : s; };
  function todoKanCard(t) {
    const st = R.tdState(t), i = TODO_KAN.findIndex(c => c[0] === todoKanCol(t));
    const mv = t.canProgress ? `<span class="td-kmv">${i > 0 ? `<button class="btn sm ghost" data-act="tdKanMove" data-id="${esc(t.id)}" data-v="${TODO_KAN[i - 1][0]}" aria-label="${esc(t.title)}을(를) ${TODO_KAN[i - 1][1]}(으)로">← ${esc(TODO_KAN[i - 1][1])}</button>` : ''}${i < 2 ? `<button class="btn sm ghost" data-act="tdKanMove" data-id="${esc(t.id)}" data-v="${TODO_KAN[i + 1][0]}" aria-label="${esc(t.title)}을(를) ${TODO_KAN[i + 1][1]}(으)로">${esc(TODO_KAN[i + 1][1])} →</button>` : ''}</span>` : '';
    return `<div class="td-kc ${st === 'late' ? 'late' : ''}" ${t.canProgress ? `draggable="true" data-drag="todo:${esc(t.id)}"` : ''} role="listitem"><button class="td-main" data-act="tdSel" data-id="${esc(t.id)}"><span class="td-t">${todoImpBadge(t)}${esc(t.title)}</span><span class="td-sub">${t.due ? `<span class="${st === 'late' ? 'td-late' : ''}">${esc(todoPeriod(t))} · ${esc(st === 'late' ? '지연' : todoDdayText(t.due))}</span>` : ''}${st === 'doing' ? todoProg(t) : ''}${t.readonly ? `<span>${esc(t.creatorName || '다른 사람')}님이 준 ToDo</span>` : ''}${(t.checklist || []).length ? `<span>체크 ${t.checklist.filter(c => c.done).length}/${t.checklist.length}</span>` : ''}</span></button>${mv}</div>`;
  }
  function todoKanbanHtml() {
    if (!TD.list) return '';
    const all = R.tdSortBy(todoBaseFiltered(), TD.sort);
    const cols = TODO_KAN.map(([k, n]) => [k, n, all.filter(t => todoKanCol(t) === k && (k !== 'done' || R.tdDoneWithin(t, TD.doneSpan)))]);
    return `<p class="muted td-hint">카드를 끌어 옮기거나 [→] 버튼을 누르면 그룹웨어 ToDo의 진행률이 바뀝니다(예정 0% · 진행 10% 이상 · 완료 100%). 완료 칸은 '끝낸 일' 기간(${TD.doneSpan === 'week' ? '최근 1주' : TD.doneSpan === 'month' ? '최근 1달' : '전체'})만 보입니다.</p><div class="td-kan">${cols.map(([k, n, l]) => `<section class="td-kcol" data-drop="tdk:${k}" aria-label="${esc(n)} ${l.length}건"><h3 class="td-gh">${esc(n)} <span class="muted">${l.length}</span></h3><div class="td-klist" role="list">${l.slice(0, 60).map(todoKanCard).join('') || '<p class="muted">없음</p>'}${l.length > 60 ? `<p class="muted">외 ${l.length - 60}건은 목록 보기에서 보세요.</p>` : ''}</div></section>`).join('')}</div>`;
  }
  async function todoKanbanDrop(dragId, col) {
    const id = String(dragId || '').replace(/^todo:/, '');
    const t = todoFind(id);
    if (!t || !TODO_KAN.some(c => c[0] === col) || todoKanCol(t) === col) return;
    const rate = col === 'todo' ? 0 : col === 'done' ? 100 : (t.rate > 0 && t.rate < 100 ? t.rate : 10);
    const r = await todoSetRate(id, rate);
    toast(r.ok ? `“${t.title}”을(를) ${TODO_KAN.find(c => c[0] === col)[1]}(으)로 옮겼습니다(진행률 ${rate}%).` : r.text);
  }

  // ---------- 일정표(그룹웨어 간트 보기) ----------
  const todoMonday = iso => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const todoAddDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function todoTimelineHtml() {
    if (!TD.list) return '';
    const days = 28, from = TD.tlFrom || todoMonday(today()), t0 = today();
    const src = todoBaseFiltered().filter(t => !t.done || R.tdDoneWithin(t, TD.doneSpan));
    const bars = R.tdTimeline(src, from, days);
    const noDate = src.filter(t => !t.done && !t.due).length;
    const head = Array.from({length: days}, (_, i) => { const d = todoAddDays(from, i), w = new Date(d + 'T00:00:00Z').getUTCDay(); return `<span class="tl-d ${w === 0 || w === 6 ? 'off' : ''} ${d === t0 ? 'now' : ''}" title="${esc(d)}">${i === 0 || d.endsWith('-01') ? `${Number(d.slice(5, 7))}/` : ''}${Number(d.slice(8, 10))}</span>`; }).join('');
    const tcol = (Date.parse(t0) - Date.parse(from)) / 86400000;
    const now = tcol >= 0 && tcol < days ? `<span class="tl-now" style="left:calc(${tcol} * 100% / ${days})" aria-hidden="true"></span>` : '';
    const rows = bars.slice(0, 80).map(({t, col, span, cutL, cutR}) => { const st = R.tdState(t); return `<div class="tl-row"><button class="tl-lab" data-act="tdSel" data-id="${esc(t.id)}" title="${esc(t.title)}">${todoImpBadge(t)}${esc(t.title)}</button><div class="tl-track" style="--tl-days:${days}">${now}<button class="tl-bar st-${st} ${cutL ? 'cut-l' : ''} ${cutR ? 'cut-r' : ''}" style="grid-column:${col + 1} / span ${span}" data-act="tdSel" data-id="${esc(t.id)}" aria-label="${esc(`${t.title} ${todoPeriod(t)} ${R.TD_STATES.find(s => s[0] === st)[1]}${st === 'doing' ? ' ' + t.rate + '%' : ''}`)}">${st === 'doing' ? `${t.rate}%` : st === 'late' ? '지연' : st === 'done' ? '완료' : ''}</button></div></div>`; }).join('');
    return `<div class="bar tl-nav"><button class="btn sm" data-act="tdTl" data-v="-14" aria-label="2주 앞으로">${ic('back')}2주 전</button><b>${esc(todoMd(from))} ~ ${esc(todoMd(todoAddDays(from, days - 1)))}</b><button class="btn sm" data-act="tdTl" data-v="0">이번 주</button><button class="btn sm" data-act="tdTl" data-v="14" aria-label="2주 뒤로">2주 뒤</button><span class="muted">막대를 누르면 자세히 봅니다.${noDate ? ` 기한 없는 할 일 ${noDate}건은 목록 보기에서 보세요.` : ''}</span></div>
<div class="tl" role="list" aria-label="할 일 일정표"><div class="tl-row tl-h"><span class="tl-lab">할 일</span><div class="tl-track" style="--tl-days:${days}">${head}</div></div>${rows || '<p class="muted" style="padding:10px">이 기간에 걸친 할 일이 없습니다.</p>'}${bars.length > 80 ? `<p class="muted">외 ${bars.length - 80}건</p>` : ''}</div>`;
  }

  // ---------- 댓글(읽기). 쓰기는 그룹웨어 ToDo 화면에서 한다(받은 ToDo는 준 사람에게 알림이 간다) ----------
  const TD_CM = {};
  async function todoCommentsLoad(id, force = false) {
    if (!GW.todoComments) return;
    const c = TD_CM[id];
    if (c && (c.busy || (!force && Date.now() - c.at < 60000))) return;
    TD_CM[id] = {...(c || {}), busy: true, at: Date.now()};
    try { const r = await GW.todoComments(id); TD_CM[id] = {at: Date.now(), list: r.comments, more: r.more}; }
    catch (e) { TD_CM[id] = {at: Date.now(), err: todoErr(e), list: c && c.list}; logError('todo.comments', e.message); }
    const box = $('#tdeCm'); if (box && TD.sel === id) box.innerHTML = todoCommentsInner(todoFind(id));
  }
  function todoCommentsInner(t) {
    if (!t) return '';
    const c = TD_CM[t.id];
    const n = c && c.list ? c.list.filter(x => !x.deleted).length : t.replies;
    const head = `<h3>댓글 <span class="muted">${n || 0}</span></h3>`;
    const write = `<button class="btn sm ghost" data-act="openUrl" data-url="${esc(GW.todoLink ? GW.todoLink(t.id) : '')}" data-title="그룹웨어 ToDo">${ic('ext')}그룹웨어에서 댓글 쓰기</button>`;
    if (!t.replies && !(c && c.list && c.list.length)) return `${head}<p class="muted">없음</p>${write}`;
    if (!c || (c.busy && !c.list)) return `${head}<p class="muted"><span class="spin"></span> 댓글을 읽는 중…</p>`;
    const rows = (c.list || []).map(x => `<div class="td-cm ${x.reply ? 're' : ''}"><div class="td-cm-h"><b>${esc(x.who || '(이름 없음)')}</b><span class="muted">${esc(x.dept || '')} · ${esc(String(x.at || '').slice(5, 16).replace('-', '/'))}</span></div>${x.deleted ? '<p class="muted">지운 댓글입니다.</p>' : `<p>${esc(x.text).replace(/\n/g, '<br>')}${x.files ? ` <span class="muted">${ic('clip')}파일 ${x.files}</span>` : ''}</p>`}</div>`).join('');
    return `${head}${c.err ? `<p class="err">댓글을 읽지 못했습니다: ${esc(c.err)}</p>` : ''}${rows}${c.more ? '<p class="muted">더 있는 댓글은 그룹웨어에서 보세요.</p>' : ''}${write}`;
  }
  function todoCommentsHtml(t) {
    if (!t || !GW.todoComments) return '';
    if (t.replies && !TD_CM[t.id]) setTimeout(() => todoCommentsLoad(t.id), 0);
    return `<div class="td-sec" id="tdeCm" aria-live="polite">${todoCommentsInner(t)}</div>`;
  }

  // ---------- 편집기 덧붙임 ----------
  function todoEditorInfoHtml(t) {
    const st = R.tdState(t), sn = R.TD_STATES.find(s => s[0] === st)[1];
    const bits = [`<span class="td-stb td-st-${st}">${esc(sn)}${st === 'doing' ? ' ' + t.rate + '%' : ''}</span>`, t.creatorName && t.readonly ? `준 사람 ${esc(t.creatorName)}` : '', t.projectName ? `프로젝트 ${esc(t.projectName)}` : '', t.created ? `등록 ${esc(todoMd(t.created))}` : '', t.modified ? `수정 ${esc(todoMd(t.modified))}` : '', t.files ? `${ic('clip')}첨부 ${t.files}` : '', t.replies ? `댓글 ${t.replies}` : ''].filter(Boolean);
    return `<p class="td-info">${bits.join(' · ')}${t.files || t.replies ? ` <button class="btn sm ghost" data-act="openUrl" data-url="${esc(GW.todoLink ? GW.todoLink(t.id) : '')}" data-title="그룹웨어 ToDo">${ic('ext')}첨부·댓글 보기</button>` : ''}</p>`;
  }
  // 다른 사람이 준 ToDo·프로젝트 ToDo: 그룹웨어처럼 담당자는 진행률·완료만 바꾼다
  function todoEditorReadonlyHtml(t) {
    return `<div class="td-ed-h"><h2>받은 할 일</h2><button class="btn sm ghost" data-act="tdClose" aria-label="닫기">${ic('x')}닫기</button></div>
<h3 class="td-ro-t">${todoImpBadge(t)}${esc(t.title)}</h3>${todoEditorInfoHtml(t)}
<p class="muted">${t.due ? `기간 ${esc(todoPeriod(t))} · ${esc(todoDdayText(t.due))}` : '기한 없음'}</p>
${t.memo ? `<div class="td-ro-memo">${esc(t.memo).replace(/\n/g, '<br>')}</div>` : ''}
${(t.checklist || []).length ? `<div class="td-sec"><h3>하위 ToDo <span class="muted">${t.checklist.filter(c => c.done).length}/${t.checklist.length}</span></h3>${t.checklist.map(c => `<div class="td-cl ${c.done ? 'done' : ''}"><span>${c.done ? '✓ ' : ''}${esc(c.title)}</span></div>`).join('')}</div>` : ''}
${todoCommentsHtml(t)}
${t.canProgress ? `<div class="td-sec"><label class="td-f">진행률 <b id="tdeRateV">${Number(t.rate) || 0}%</b><input class="td-range" type="range" id="tdeRate" min="0" max="100" step="10" value="${Number(t.rate) || 0}"></label><div class="acts td-ed-acts"><button class="btn primary" data-act="tdRoSave" data-id="${esc(t.id)}">진행률 저장</button><button class="btn" data-act="tdToggle" data-id="${esc(t.id)}">${t.done ? '끝냄 취소' : '끝냄'}</button></div></div>` : '<p class="muted">내가 담당자가 아니어서 여기서는 바꿀 수 없습니다.</p>'}
<div class="acts td-ed-acts"><button class="btn" data-act="openUrl" data-url="${esc(GW.todoLink ? GW.todoLink(t.id) : '')}" data-title="그룹웨어 ToDo">${ic('ext')}그룹웨어에서 보기</button><button class="btn" data-act="tdCopyLink" data-id="${esc(t.id)}">링크 복사</button></div>
<p class="muted td-hint">제목·기간·내용은 준 사람이 그룹웨어에서 고칩니다.</p>`;
  }

  // ---------- 여러 개 추가(그룹웨어 '일괄등록'을 엑셀 없이) ----------
  function todoBulkOpen() {
    closeOverlay(); S.paletteOpen = true;
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" role="dialog" aria-label="할 일 여러 개 추가" style="width:min(680px,94vw)"><button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button><h2 style="margin-top:0">할 일 여러 개 추가</h2>
<p class="muted">한 줄에 하나씩 쓰거나 메모·메일에서 목록을 붙여 넣으세요. 글머리(-, •, 1.)는 떼고, 끝의 날짜('금요일', '11/28', '11/24~11/28')와 '!긴급'·'!즉시'·'!중요'를 읽습니다. 날짜가 없는 항목은 오늘 시작·종료합니다. 30줄까지.</p>
<label for="tdeBulk" class="vh">할 일 목록</label><textarea class="inp td-bulk" id="tdeBulk" rows="8" placeholder="- 자문회의 자료 준비 금요일\n- 결과보고서 초안 11/24~11/28 !긴급\n- 다과 견적 받기"></textarea>
<div id="tdBulkPrev" class="td-bulk-prev" aria-live="polite"></div>
<div class="acts" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="closeOverlay">취소</button><button class="btn primary" data-act="tdBulkSave" id="tdBulkGo" disabled>추가</button></div></div></div>`;
    setTimeout(() => $('#tdeBulk')?.focus(), 30);
  }
  function todoBulkPreview() {
    const box = $('#tdBulkPrev'), go = $('#tdBulkGo'); if (!box) return;
    const parsed = R.tdParseBulk(($('#tdeBulk') || {}).value || '');
    const rows = parsed.rows.map(r => ({...r, due: r.due || today(), start: r.start || r.due || today()})), more = parsed.more;
    box.innerHTML = rows.length ? `<p class="muted">${rows.length}건을 그룹웨어 ToDo에 추가합니다${more ? ` (31줄째부터 ${more}건은 빠집니다)` : ''}.</p><ol>${rows.map(r => `<li>${r.imp !== '0' ? `<span class="td-imp-b td-imp-${esc(r.imp)}">${esc(R.tdImpLabel(r.imp))}</span>` : ''}${esc(r.title)}${r.due ? ` <span class="muted">· ${esc(r.start && r.start !== r.due ? todoMd(r.start) + '~' : '')}${esc(todoMd(r.due))}</span>` : ''}</li>`).join('')}</ol>` : '';
    if (go) { go.disabled = !rows.length; go.textContent = rows.length ? `${rows.length}건 추가` : '추가'; }
  }
  async function todoBulkSave(el) {
    if (TD.bulkBusy) return;
    const {rows: parsedRows} = R.tdParseBulk(($('#tdeBulk') || {}).value || '');
    const rows = parsedRows.map(r => ({...r, due: r.due || today(), start: r.start || r.due || today()}));
    if (!rows.length) return;
    if (!todoGwOk()) { toast('그룹웨어 ToDo에 연결하지 못했습니다. 그룹웨어를 새로고침한 뒤 다시 시도하세요.'); return; }
    TD.bulkBusy = true; if (el) { el.disabled = true; el.innerHTML = '<span class="spin"></span> 저장 중…'; }
    const failed = [];
    let ok = 0;
    try {
      for (const r of rows) {
        try { await GW.todoCreate({title: r.title, due: todoYmd(r.due), start: todoYmd(r.start), importance: r.imp}); ok++; }
        catch (e) { failed.push(r.title); logError('todo.bulk', e.message); if (e && e.code === 'RATE') break; }
      }
    } finally { TD.bulkBusy = false; }
    await todoLoad({force: true});
    if (failed.length) { const ta = $('#tdeBulk'); if (ta) { ta.value = failed.join('\n'); todoBulkPreview(); } if (el) el.disabled = false; toast(`${ok}건을 추가했습니다. ${failed.length}건은 저장하지 못해 입력칸에 남겼습니다.`); return; }
    closeOverlay();
    toast(`그룹웨어 ToDo에 ${ok}건을 추가했습니다.`);
  }

  // ---------- 처리기 ----------
  HOME_ACTS.tdView = (el, v) => { if (!TODO_VIEWS.some(x => x[0] === v)) return; TD.view = v; todoPrefsSave(); renderMain(); root.querySelector(`[data-act="tdView"][data-v="${v}"]`)?.focus(); };
  HOME_ACTS.tdTl = (el, v) => { const n = Number(v) || 0; TD.tlFrom = n ? todoAddDays(TD.tlFrom || todoMonday(today()), n) : ''; todoRefreshList(); };
  HOME_ACTS.tdKanMove = async el => { await todoKanbanDrop(el.dataset.id, el.dataset.v); };
  HOME_ACTS.tdRoSave = async el => { const v = Number((($('#tdeRate') || {}).value) || 0); el.disabled = true; const r = await todoSetRate(el.dataset.id, v); toast(r.ok ? `진행률 ${v}%를 그룹웨어에 저장했습니다.` : r.text); if (S.view === 'mytodo') renderMain(); };
  HOME_ACTS.tdCopyLink = el => { const u = GW.todoLink ? GW.todoLink(el.dataset.id) : ''; if (!u) return; if (typeof copyText === 'function') copyText(u); else { try { navigator.clipboard.writeText(u); toast('링크를 복사했습니다.'); } catch { toast(u); } } };
  HOME_ACTS.tdBulk = () => todoBulkOpen();
  HOME_ACTS.tdBulkSave = el => todoBulkSave(el);

  // ---------- 퇴근 전 마무리·예전 할 일 옮기기 (51-todo.js에서 옮김) ----------
  // 퇴근 전 마무리 창: 오늘까지인데 끝내지 않은 일을 끝냄·다음 평일로·날짜 지정으로 정리
  function todoNextWorkday() { const hol = (S.raw && S.raw.data && S.raw.data.schedule && S.raw.data.schedule.holidays) || []; return R.tdNextDue({f: 'wd'}, today(), hol); }
  function todoWrapHtml() {
    const list = TD.list ? R.tdWrapUp(TD.list) : [];
    const nx = todoNextWorkday();
    return `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" role="dialog" aria-label="퇴근 전 마무리" style="width:min(640px,94vw)"><button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button><h2 style="margin-top:0">퇴근 전 마무리</h2>
${list.length ? `<p class="muted">오늘까지인데 끝내지 않은 할 일 ${list.length}건입니다. 다음 평일은 ${esc(nx.slice(5).replace('-', '/'))}입니다.</p><div class="td-list" role="list">${list.map(t => `<div class="td-row" role="listitem"><span class="td-main"><span class="td-t">${t.important ? `<span class="td-star">${ic('star')}</span>` : ''}${esc(t.title)}</span><span class="td-sub"><span class="${R.dday(t.due) < 0 ? 'td-late' : ''}">${esc(t.due.slice(5).replace('-', '/'))} · ${esc(todoDdayText(t.due))}</span></span></span><span class="acts"><button class="btn sm" data-act="tdWrapDone" data-id="${esc(t.id)}">끝냄</button><button class="btn sm" data-act="tdWrapNext" data-id="${esc(t.id)}">${esc(nx.slice(5).replace('-', '/'))}로</button><button class="btn sm ghost" data-act="tdWrapPick" data-id="${esc(t.id)}">날짜</button></span></div>`).join('')}</div><div class="acts" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-act="closeOverlay">닫기</button><button class="btn primary" data-act="tdWrapAll">남은 ${list.length}건 모두 ${esc(nx.slice(5).replace('-', '/'))}로</button></div>` : `<p>오늘까지 남은 할 일이 없습니다. 수고하셨습니다.</p><div class="acts" style="justify-content:flex-end"><button class="btn primary" data-act="closeOverlay">닫기</button></div>`}</div></div>`;
  }
  function todoWrapOpen() { if (!TD.list) { todoLoad({force: true}).then(() => todoWrapOpen()); return; } closeOverlay(); S.paletteOpen = true; $('#overlay').innerHTML = todoWrapHtml(); setTimeout(() => $('#overlay button.primary')?.focus(), 30); }
  const todoWrapRefresh = () => { if ($('#overlay .dlg[aria-label="퇴근 전 마무리"]')) $('#overlay').innerHTML = todoWrapHtml(); };

  HOME_ACTS.tdWrap = () => todoWrapOpen();
  HOME_ACTS.tdWrapDone = async el => { const r = await todoToggle(el.dataset.id, true); if (!r.ok) toast(r.text); todoWrapRefresh(); };
  HOME_ACTS.tdWrapNext = async el => { const r = await todoSave(el.dataset.id, {due: todoNextWorkday()}); if (!r.ok) toast(r.text); todoWrapRefresh(); };
  HOME_ACTS.tdWrapPick = async el => {
    const id = el.dataset.id;
    const v = await askForm({title: '기한 바꾸기', fields: [{label: '새 기한 (예: 11/28, 다음주 월요일)', value: ''}]});
    if (!v) { todoWrapOpen(); return; }
    const due = R.tdParseDue(v[0]);
    if (!due) { toast('날짜를 알아보지 못했습니다.'); todoWrapOpen(); return; }
    const r = await todoSave(id, {due}); if (!r.ok) toast(r.text);
    todoWrapOpen();
  };
  HOME_ACTS.tdWrapAll = async () => {
    const list = TD.list ? R.tdWrapUp(TD.list) : [], nx = todoNextWorkday();
    let ok = 0;
    for (const t of list) { const r = await todoSave(t.id, {due: nx}); if (r.ok) ok++; }
    toast(`${ok}건을 ${nx.slice(5).replace('-', '/')}로 옮겼습니다${ok < list.length ? ` (${list.length - ok}건 실패)` : ''}.`);
    todoWrapRefresh();
  };
  HOME_ACTS.tdMigrate = async el => {
    const legacy = todoLegacy(); if (!legacy.length || TD.migrating) return;
    TD.migrating = true; if (el) el.disabled = true;
    let ok = 0;
    try {
      for (const t of legacy) {
        const r = await todoCreate({title: t.title, due: t.due || '', meta: {src: t.source || undefined, u: t.url || undefined, k: t.key || undefined}});
        if (r.ok) { ok++; store.set('todosLegacy', todoLegacy().filter(x => x.id !== t.id)); } // 옮긴 것은 바로 빼서 다시 눌러도 겹치지 않게
      }
    } finally { TD.migrating = false; }
    toast(`예전 할 일 ${ok}건을 그룹웨어 ToDo로 옮겼습니다${ok < legacy.length ? ` (${legacy.length - ok}건 실패, 다시 눌러 주세요)` : ''}.`);
    renderMain();
  };
  HOME_ACTS.tdMigrateSkip = () => { if (!confirm('이 PC에만 있던 예전 할 일을 옮기지 않고 지울까요?')) return; store.set('todosLegacy', []); renderMain(); };

