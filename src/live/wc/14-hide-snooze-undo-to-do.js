// GW 통합 업무센터 · hide / snooze / undo / to-do
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- hide / snooze / undo / to-do ----------
  function pushUndo(label) { S.undo.push({label, hidden: {...S.hidden}, snooze: {...S.snooze}, plan: {...S.plan}, todos: JSON.parse(JSON.stringify(S.todos)), rel: label === '관련성 규칙' ? JSON.parse(JSON.stringify((S.settings && S.settings.rel) || null)) : undefined}); if (S.undo.length > 20) S.undo.shift(); }
  function undo() {
    const u = S.undo.pop();
    if (!u) { toast('되돌릴 작업이 없습니다.'); return; }
    S.hidden = u.hidden; S.snooze = u.snooze; S.plan = u.plan; S.todos = u.todos; if (u.rel !== undefined) { S.settings.rel = u.rel || undefined; if (S.raw) reanalyze(); } saveLocal(); render(); toast(`되돌렸습니다: ${u.label}`);
  }
  function hide(keys) { pushUndo(`${keys.length}건 숨기기`); for (const k of keys) S.hidden[k] = Date.now(); S.multi.clear(); saveLocal(); afterMark(); toastUndo(`${keys.length}건을 이 화면에서 숨겼습니다. 그룹웨어에서 처리해야 완전히 사라집니다.`); }
  function snooze(keys) { pushUndo(`${keys.length}건 미루기`); const t = tomorrow8(); for (const k of keys) S.snooze[k] = t; S.multi.clear(); saveLocal(); afterMark(); toastUndo(`${keys.length}건을 내일 오전 8시까지 미뤘습니다.`); }
  // 끝냄 표시(업무센터 목록에서만). 그룹웨어 처리 여부와 별개라는 점을 문구로 분명히 한다.
  function markDoneKeys(keys) {
    if (!keys.length) return;
    pushUndo('끝냄 ' + keys.length + '건'); for (const k of keys) S.hidden[k] = Date.now(); S.multi.clear(); saveLocal(); afterMark();
    toastUndo(keys.every(k => k.startsWith('att:')) ? '확인 끝냄으로 표시했습니다. 그룹웨어 기록이 3일 뒤에도 그대로면 다시 보여 드립니다.' : '끝냄으로 표시했습니다(업무센터 목록에서만). 그룹웨어에 아직 남아 있으면 하루 뒤 다시 보여 드립니다.');
  }
  function afterMark() { if (S.view === 'today') refreshQueue(); else render(); if (S.sel && S.sel.type === 'action' && (isHidden(S.sel.key) || isSnoozed(S.sel.key)) && !S.focus) { const q = queue(); if (q[0]) selectAction(q[0].key); else { S.sel = null; renderPane(); } } }
  function addTodo(title, due = '', source = '', url = '', key = '') {
    if (!title) { const i = $('#tdTitle'); if (i) { i.focus(); toast('할 일 제목을 입력하세요.'); } return; }
    if (key) { const ex = S.todos.find(t => t.key === key && t.status !== 'done'); if (ex) { S.plan[key] = S.plan[key] || 'today'; saveLocal(); toast('이미 할 일에 있습니다' + (ex.due ? ` (기한 ${ex.due.slice(5)})` : '') + '.'); return; } }
    pushUndo('할 일 추가');
    const t = {id: uid(), title, due, status: 'todo', source, url, key: key || '', at: Date.now()};
    S.todos.unshift(t);
    if (key) S.plan[key] = S.plan[key] || 'today';
    saveLocal(); renderNav(); if (S.view === 'board' || S.view === 'calendar') renderMain();
    toastUndo(`할 일에 추가했습니다${due ? ` (기한 ${due.slice(5)})` : ''}.`);
  }
  function addTodoFromInput() { const title = ($('#tdTitle') || {}).value?.trim(); addTodo(title, parseDue(($('#tdDue') || {}).value), '직접 추가'); }
  function selInfo() { const info = S.sel ? paneInfo() : null; return info ? {title: info.title, url: info.url} : {title: '', url: ''}; }

  // ---------- 연속 처리 모드 ----------
  function startFocus(keys) {
    const list = (keys && keys.length ? keys : queue().filter(x => x.scope !== 'ref' && ['doc', 'mail', 'attendance', 'conflict', 'notice'].includes(x.type)).map(x => x.key));
    if (!list.length) { toast('처리할 항목이 없습니다.'); return; }
    if (!leavePane()) return;
    S.focus = {keys: list, i: 0, results: {}, busy: false};
    if (S.view !== 'today' && S.view !== 'approval') S.view = 'today';
    focusOpen();
    toast('연속 처리: 그룹웨어 원래 화면에서 처리한 뒤 아래 초록 버튼을 누르세요. 실제로 처리됐는지 확인해 드립니다.');
  }
  // Items that would record a read are not opened automatically: the pane shows a gate instead.
  function focusOpen() {
    const f = S.focus;
    const k = f.keys[f.i];
    const x = S.a.actions.find(a => a.key === k);
    S.sel = {type: 'action', key: k};
    S.pane.extract = null; S.pane.preview = null; S.pane.dirty = false;
    f.gate = false;
    if (!x) S.pane.url = '';
    else if (x.type === 'mail') S.pane.url = ''; // 답장·전달·메일함 중 고르게 한다
    else if (marksRead(x)) { S.pane.url = ''; f.gate = true; }
    else S.pane.url = x.url;
    S.pane.expanded = !!(S.pane.url && !/#\/?popup\?/.test(S.pane.url));
    if (!f.started) f.started = new Date();
    render();
  }
  function focusBar() {
    const f = S.focus;
    if (!f) return '';
    const cnt = r => Object.values(f.results).filter(v => v === r).length;
    const k = f.keys[f.i];
    const x = S.a.actions.find(a => a.key === k);
    const label = x && x.type === 'doc' ? '처리했음 → 확인하고 다음' : x && x.type === 'mail' ? '답장했음 → 보낸메일 확인하고 다음' : '직접 확인했음 → 다음';
    const gate = f.gate ? `<div class="box warn" style="margin:0 10px 6px">이 항목은 열면 그룹웨어에 읽음(열람)으로 기록됩니다. <button class="btn sm primary" data-act="focusOpenGate">열고 처리하기</button> <button class="btn sm" data-act="focusSkip">열지 않고 건너뛰기</button></div>` : '';
    const summary = [cnt('done') ? `처리 확인 ${cnt('done')}` : '', cnt('manual') ? `직접 확인 ${cnt('manual')}` : '', cnt('remain') ? `아직 남음 ${cnt('remain')}` : '', cnt('hadReply') ? `이전 답장만 ${cnt('hadReply')}` : '', cnt('unsent') ? `답장 못 찾음 ${cnt('unsent')}` : ''].filter(Boolean).join(' · ');
    return `${gate}<div class="fbar"><span class="prog">연속 처리 ${f.i + 1} / ${f.keys.length}${summary ? ' · ' + summary : ''}</span><button class="btn sm" data-act="focusPrev" ${f.i === 0 || f.busy ? 'disabled' : ''}>◀ 이전</button><button class="btn sm" data-act="focusSkip" ${f.busy ? 'disabled' : ''}>건너뛰기</button><button class="btn ok" data-act="focusNext" ${f.busy ? 'disabled' : ''}>${f.busy ? '<span class="spin"></span> 확인 중…' : label}</button><button class="btn sm" data-act="focusStop" ${f.busy ? 'disabled' : ''}>끝내기</button></div>`;
  }
  async function focusNext(verify = true) {
    const f = S.focus;
    if (!f || f.busy) return;
    if (!leavePane()) return;
    const k = f.keys[f.i];
    const x = S.a.actions.find(a => a.key === k);
    f.busy = true; $('#fbar').innerHTML = focusBar();
    try {
      if (verify && x && x.type === 'doc' && ['distWaiting', 'deptWaiting', 'pending', 'sendWaiting'].includes(x.ref.kind)) {
        // Re-read the whole list (up to 200) so that long lists are not misjudged.
        const r = await GW.approvalPage(x.ref.kind, 1, {size: 200});
        const still = r.docs.some(d => d.docId === x.ref.docId);
        f.results[k] = still ? 'remain' : 'done';
        toast(still ? '아직 그룹웨어 목록에 남아 있습니다. 처리가 저장되지 않았을 수 있습니다.' : '✓ 그룹웨어에서 처리된 것을 확인했습니다.');
      } else if (verify && x && x.type === 'mail') {
        const m = findMail(x.ref.box, x.ref.uid);
        const r = await GW.findReply({subject: m ? m.subject : x.title, since: m ? m.date : ''});
        const k0 = R.kstNow(f.started || new Date());
        const startText = `${k0.date} ${String(k0.hh).padStart(2, '0')}:${String(k0.mm).padStart(2, '0')}`;
        if (r.found && r.date.slice(0, 16) >= startText) { pushUndo('연속 처리 확인'); f.results[k] = 'done'; S.hidden[k] = Date.now(); saveLocal(); toast(`✓ 방금 보낸 답장을 보낸메일함에서 찾았습니다 (${r.date.slice(5, 16)}).`); }
        else if (r.found) { f.results[k] = 'hadReply'; toast(`이전에 보낸 답장(${r.date.slice(5, 16)})만 있습니다. 제출까지 끝났는지 확인하세요. 목록에 남겨 둡니다.`); }
        else { f.results[k] = 'unsent'; toast('보낸메일함에서 이 메일의 답장을 찾지 못했습니다. 목록에 남겨 둡니다.'); }
      } else if (verify && x) { pushUndo('연속 처리 확인'); f.results[k] = 'manual'; S.hidden[k] = Date.now(); saveLocal(); }
    } catch (e) { f.results[k] = 'unknown'; toast('확인하지 못했습니다: ' + e.message); }
    f.busy = false;
    if (!S.focus) return;
    if (f.i >= f.keys.length - 1) { finishFocus(); return; }
    f.i++; focusOpen();
  }
  function focusPrev() { if (S.focus && S.focus.i > 0 && !S.focus.busy && leavePane()) { S.focus.i--; focusOpen(); } }
  function finishFocus() {
    const f = S.focus;
    const cnt = r => f.keys.filter(k => f.results[k] === r).length;
    S.focus = null; S.pane.url = ''; S.sel = null; S.pane.dirty = false;
    if (S.raw) reanalyze();
    render();
    toast(`연속 처리 끝: 그룹웨어에서 처리 확인 ${cnt('done')}건${cnt('manual') ? ` · 직접 확인 ${cnt('manual')}건` : ''}${cnt('remain') ? ` · 아직 남음 ${cnt('remain')}건` : ''}${cnt('hadReply') ? ` · 이전 답장만 ${cnt('hadReply')}건` : ''}${cnt('unsent') ? ` · 답장 못 찾음 ${cnt('unsent')}건` : ''}${cnt('skip') ? ` · 건너뜀 ${cnt('skip')}건` : ''}.`);
    refresh({silent: true});
  }
  function stopFocus() { if (!S.focus || S.focus.busy) return; if (!leavePane()) return; finishFocus(); }

