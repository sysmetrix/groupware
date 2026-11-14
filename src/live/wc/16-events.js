// GW 비서 · events
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- events ----------
  root.addEventListener('click', async e => {
    const path = e.composedPath();
    const hasStop = path.some(n => n && n.dataset && n.dataset.stop);
    const actEl = path.find(n => n && n.dataset && n.dataset.act);
    const act = actEl ? actEl.dataset.act : '';
    const v = actEl ? actEl.dataset.v : '';

    if (AUTO.running && $('#recplay') && !hasStop) { recAbort(); toast('재생 중지를 요청했습니다.'); return; }
    // 1. If any overlay, dropdown menu, modal, or coachmark is open, clicking outside it closes it IMMEDIATELY
    if ((S.menuOpen || S.paletteOpen || S.helpOpen || S.coach) && !hasStop) {
      if (!['menuNew', 'menuBell', 'menuView', 'help', 'openPalette', 'rowMenu'].includes(act)) {
        closeOverlay();
      }
    }
    if (!actEl) return;
    const el = actEl;
    if (act === 'closeOverlay' && hasStop && !actEl.closest('[data-stop]')) return;
    if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
    switch (act) {
      case 'refresh': refresh({announce: true}); break;
      case 'applyRefresh': S.pendingRefresh = false; render(); break;
      case 'relogin': if (!S.pane.dirty || confirm('처리 창에 입력 중인 내용이 있습니다. 그룹웨어를 새로 고치면 사라집니다. 계속할까요?')) location.reload(); break;
      case 'close': if (leavePane()) close(); break;
      case 'home': goHome(); break;
      case 'apOpen': { e.stopPropagation(); const d = findDoc(el.dataset.kind, el.dataset.id) || (S.apMore[el.dataset.kind] || []).find(x => x.docId === el.dataset.id); if (!d || !leavePane()) break; S.sel = {type: 'doc', kind: el.dataset.kind, docId: d.docId}; S.pane.url = ''; renderMain(); openUrl(d.url, {title: d.title, unread: d.unread}); break; }
      case 'copyErrors': copyText((S.errors || []).map(x => `${new Date(x.at).toISOString()} ${x.where}: ${x.msg}`).join('\n')); break;
      case 'setTodayTab': S.todayTab = v; S.filter.level = 'all'; renderMain(); break;
      case 'stateFilter': S.filter.level = S.filter.level === v || v === 'all' ? 'all' : v; renderMain(); break;
      case 'rowMenu': e.stopPropagation(); if (S.menuOpen === 'row:' + el.dataset.k) closeOverlay(); else { closeOverlay(); openMenu('row:' + el.dataset.k, el); } break;
      case 'markDone': e.stopPropagation(); markDoneKeys([el.dataset.k]); break;
      case 'coach': startCoach(); break;
      case 'coachNext': coachNext(); break;
      case 'coachEnd': endCoach(); break;
      case 'openCmd': openCommandConsole(); break;
      case 'openChatHome': closeOverlay(); if (go('home')) setTimeout(chatFocusInput, 80); break;
      case 'openHistory': openActionHistory(); break;
      case 'submitCmd': { const q = ($('#cmdPrompt') || {}).value; executeCommandWorkflow(q); break; }
      case 'runPreset': { const pr = COMMAND_PRESETS.find(x => x.id === el.dataset.id); if (pr) executeCommandWorkflow(pr.query); break; }
      case 'recoverWeekly': { const r = store.get('weeklyRecovery', null); if (r && confirm('보관된 다른 탭의 초안으로 바꿀까요? 현재 초안도 복구본으로 보관합니다.')) { const old = S.weekly; S.weekly = r.text; if (!saveLocal()) { S.weekly = old; toast('저장하지 못해 복구하지 않았습니다.'); break; } store.set('weeklyRecovery', {at: Date.now(), text: old}); renderMain(); toast('복구본을 불러왔습니다.'); } break; }
      case 'clearHistory': if (confirm('자동 작업 감사 기록을 모두 지울까요? 되돌릴 수 없습니다.')) { store.del('actionHistory'); logActionRecord({command: '작업 내역 초기화', type: '관리', summary: '사용자가 이전 감사 기록을 삭제했습니다.', status: 'cleared', verified: true}); openActionHistory(); toast('이전 기록을 지우고 초기화 이력을 남겼습니다.'); } break;
      case 'mailToDraft': mailToDraft(el.dataset.uid); break;
      case 'quickDraft': {
        if (el.dataset.t === 'result' && !el.dataset.custom) {
          openResultPlanPicker();
        } else {
          autoStartDraft(el.dataset.t);
        }
        break;
      }
      case 'openPay': openPaymentHub(); break;
    case 'openChangelog': openChangelog(); break;
    case 'goResource': closeOverlay(); go('resource'); break;
    case 'gcalMode': { gcalCfg().mode = v; saveLocal(); renderMain(); break; }
    case 'gcalSave': gcalSave(); break;
    case 'gcalCancel': S.gcalEdit = false; renderMain(); break;
    case 'gcalEdit': S.gcalEdit = true; renderMain(); break;
    case 'gcalNew': gcalOpenTab('https://calendar.google.com/calendar/u/0/r/eventedit'); break;
    case 'gcalOpen': gcalOpenTab('https://calendar.google.com/calendar/u/0/r/' + ({MONTH: 'month', AGENDA: 'agenda'}[gcalCfg().mode] || 'week')); break;
    case 'resSel': resSel(el.dataset.v); break;
    case 'resDay': resDay(el.dataset.v); break;
    case 'resFree': resFree(el.dataset.s, el.dataset.e); break;
    case 'resCheck': resCheck(); break;
    case 'resBook': resBook(e); break;
    case 'resCancelForm': resCancelForm(); break;
    case 'resReload': { const s = resState(); s.err = ''; s.list = null; s.bookings = null; renderMain(); resLoad(true); break; }
    case 'openAi': openAi(); break;
    case 'aiSetup': aiSetup(); break;
    case 'aiSaveKey': aiSaveKey(); break;
    case 'aiAsk': aiAsk(el.dataset.q || ''); break;
    case 'aiForget': aiForget(); break;
    case 'aiClose': aiClose(); break;
    case 'expOpen': expOpen(el.dataset.id); break;
    case 'expAdd': expAdd(el.dataset.kind); break;
    case 'expDel': expDel(el.dataset.kind, +el.dataset.i); break;
    case 'expCheck': expCheck(); break;
    case 'expGo': expGo(); break;
    case 'expClose': expClose(); break;
    case 'expBarClear': S.expBar = null; renderPane(); toast('지출 값 복사 막대를 지웠습니다.'); break;
    case 'openData': openDataCenter(); break;
      case 'setExport': settingsExport(); break;
      case 'setImport': { const fi = $('#setImportFile'); if (fi) fi.click(); break; }
    case 'openDiag': openDiag(); break;
    case 'govDel': govDel(el.dataset.k); break;
    case 'govExportAudit': govExportAudit(); break;
    case 'govCopyDiag': copyText(diagText(diagChecks())); toast('진단 보고서를 복사했습니다.'); break;
    case 'govUpdate': govUpdate(); break;
    case 'govAck': govAck(); break;
    case 'payPickBase': payForm(el.dataset.id); break;
    case 'payRun': payRun(); break;
    case 'goodsPickPlan': goodsPickPlan(); break;
    case 'goodsRun': goodsRun(el.dataset.id); break;
    case 'openRec': openRecorder(); break;
    case 'recStart': recStart(); break;
    case 'recSavePending': savePendingRecording(); break;
    case 'recStop': recStop(); break;
    case 'recPlay': recPlay(+el.dataset.i, el.dataset.mode); break;
    case 'recDetail': recDetail(+el.dataset.i); break;
    case 'recVar': recVar(+el.dataset.i, +el.dataset.s); break;
    case 'recStepDel': recStepDel(+el.dataset.i, +el.dataset.s); break;
    case 'recDel': recDel(+el.dataset.i); break;
    case 'recExport': recExport(+el.dataset.i); break;
    case 'recImport': recImport(); break;
    case 'recAbort': recAbort(); break;
    case 'selectPlanForResult': { startResultFromPlan(el.dataset.id); break; }
      case 'quickAtt': quickAttendanceApplication(el.dataset.t); break;
      case 'autoFillMail': autoFillMail(v); break;
      case 'autoFillAtt': autoFillAtt(); break;
      case 'paneOpenMain': {
        const x = selectedAction();
        if (x) openItem(x);
        else if (S.sel && S.sel.type === 'mail') {
          const m = findMail(S.sel.box, S.sel.uid);
          if (m) openItem({ type: 'mail', ref: { box: m.box, uid: m.uid }, title: m.subject, url: S.a?.mail?.url });
        } else {
          const info = paneInfo();
          if (info.url) openUrl(info.url, {title: info.title});
        }
        break;
      }
      case 'mailOpenItem': {
        const m = findMail(el.dataset.box, el.dataset.uid);
        if (m) openItem({ type: 'mail', ref: { box: m.box, uid: m.uid }, title: m.subject, url: S.a?.mail?.url });
        break;
      }
      case 'pvFile': { const c = S.mailDet && S.mailDet[el.dataset.uid]; const f = c && c.files[Number(el.dataset.i)]; if (!f) break; const source = {sel: S.sel, url: S.pane.url}; el.disabled = true; try { const u = await GW.mailAttachmentPreview({uid: el.dataset.uid, sn: f.sn, account: c.account}); if (S.sel === source.sel && S.pane.url === source.url) enterAttachmentPreview(u); } catch (err) { toast('미리보기를 열지 못했습니다: ' + err.message); } el.disabled = false; break; }
      case 'returnAttachmentPreview': returnFromAttachmentPreview(); break;
      case 'dlFile': downloadMailFile(el.dataset.uid, Number(el.dataset.i), el); break;
      case 'dlAll': { const c = S.mailDet[el.dataset.uid]; el.disabled = true; let ok = 0; for (let i = 0; i < c.files.length; i++) { if (await downloadMailFile(el.dataset.uid, i, root.querySelector('[data-act="dlFile"][data-uid="' + CSS.escape(el.dataset.uid) + '"][data-i="' + i + '"]'))) ok++; } el.disabled = false; toast('첨부 ' + ok + '/' + c.files.length + '개를 받았습니다. 브라우저 다운로드 폴더를 확인하세요.'); break; }
      case 'mailDetailRetry': { const m = findMail(el.dataset.box, el.dataset.uid); if (m) { delete S.mailDet[m.uid]; loadMailDetail(m); renderPane(); } break; }
      case 'rmSnooze': snooze([el.dataset.k]); closeOverlay(); break;
      case 'rmTodo': { const x = S.a.actions.find(a => a.key === el.dataset.k); closeOverlay(); if (x) addTodo(x.title, x.deadline && x.deadline.date || '', x.kind, x.url, x.key); break; }
      case 'rmHide': hide([el.dataset.k]); closeOverlay(); break;
      case 'rmMute': openMenu('mute:' + el.dataset.k); break;
      case 'rmMine': openMenu('mine:' + el.dataset.k); break;
      case 'rmWindow': { const x = S.a.actions.find(a => a.key === el.dataset.k); closeOverlay(); if (x) openWindow(x.url, x); break; }
      case 'relAdd': {
        if (el.dataset.l === 'mine' && el.dataset.t === 'kind' && ['deptWaiting', 'distWaiting', 'sendWaiting'].includes(el.dataset.v)) { const ro = S.settings.roles = {...(S.settings.roles || {})}; ro[{deptWaiting: 'deptReceiver', distWaiting: 'distributor', sendWaiting: 'sender'}[el.dataset.v]] = true; saveLocal(); reanalyze(); closeOverlay(); render(); toast('설정의 “내 업무 범위”에 반영했습니다.'); break; }
        addRule(el.dataset.l, el.dataset.t, el.dataset.v, el.dataset.label);
        toast(el.dataset.l === 'mute' ? '목록에서 뺐습니다. Ctrl+Z 또는 설정에서 되돌릴 수 있습니다.' : '내 처리할 일로 옮겼습니다.');
        break;
      }
      case 'delRule': { const r = rel(); r[el.dataset.l].splice(Number(el.dataset.i), 1); saveLocal(); if (S.raw) reanalyze(); render(); break; }
      case 'mailDetail': { const m = findMail(el.dataset.box, el.dataset.uid); if (m && confirm('이 메일을 불러오면 그룹웨어에 읽음으로 표시됩니다. 불러올까요?')) loadMailDetail(m, true); break; }
      case 'searchExample': S.search.kw = el.dataset.v; runSearch(); break;
      case 'view': closeOverlay(); go(v); break;
      case 'help': toggleHelp(); break;
      case 'closeHelp': case 'closeOverlay': closeOverlay(); break;
      case 'menuNew': openMenu('new'); break;
      case 'menuBell': openMenu('bell'); break;
      case 'bellItem': closeOverlay(); if (go('today')) selectAction(el.dataset.k); break;
      case 'fsUp': fontStep(1); if (S.menuOpen === 'view') { S.menuOpen = ''; openMenu('view'); } break;
      case 'fsDown': fontStep(-1); if (S.menuOpen === 'view') { S.menuOpen = ''; openMenu('view'); } break;
      case 'theme': toggleTheme(); toast(S.settings.theme === 'dark' ? '다크 모드' : '라이트 모드'); if (S.menuOpen === 'view') { S.menuOpen = ''; openMenu('view'); } break;
      case 'openPalette': closeOverlay(); openPalette(''); break;
      case 'palRun': palExec(palItems[Number(el.dataset.i)]); break;
      case 'goApproval': if (go('approval') && v) { S.apTab = v; S.apTabPinned = true; renderMain(); } break;
      case 'goBudgetCode': { const b = S.budget, pj = el.dataset.p || ''; if (S.view !== 'budget' && !S.focus && !leavePane()) break; if (pj && pj !== b.project) { b.seq++; b.busy = false; b.project = pj; b.filter = ''; b.table = null; b.full = null; } if (v && !(b.table && !b.table.error && !b.busy && (!pj || b.table.project === pj))) b.pendingLedger = v; if (!go('budget')) break; if (v && b.table && !b.table.error && !b.busy && (!pj || b.table.project === pj)) { b.pendingLedger = ''; loadLedger(v); } else renderMain(); break; }
      case 'goAttendanceDay': if (!go('attendance')) break; S.att.day = v; if (S.att.month !== v.slice(0, 6)) { S.att.rows = null; S.att.month = v.slice(0, 6); loadAttendance(v.slice(0, 6)); } else renderMain(); break;
      case 'selDeadline': if (el.dataset.k && S.a.actions.some(x => x.key === el.dataset.k)) { if (go('today')) selectAction(el.dataset.k); } else { S.search.kw = relatedQ(el.dataset.title); runSearch(['doc', 'mail', 'board', 'file']); } break;
      case 'area': S.filter.area = v; renderMain(); break;
      case 'showHidden': S.filter.showHidden = !S.filter.showHidden; renderMain(); break;
      case 'multi': {
        e.stopPropagation();
        const k = el.dataset.k;
        if (e.shiftKey && S.lastClickKey) { const q = queue().map(x => x.key); const a = q.indexOf(S.lastClickKey), b = q.indexOf(k); if (a >= 0 && b >= 0) for (const kk of q.slice(Math.min(a, b), Math.max(a, b) + 1)) S.multi.add(kk); }
        else if (S.multi.has(k)) S.multi.delete(k); else S.multi.add(k);
        S.lastClickKey = k; refreshQueue(); return;
      }
      case 'selAction': if (path.some(n => n && n.tagName === 'INPUT')) return; selectAction(el.dataset.k); break;
      case 'batchHide': hide([...S.multi]); break;
      case 'batchSnooze': snooze([...S.multi]); break;
      case 'batchTodo': { const keys = [...S.multi]; pushUndo(`${keys.length}건 할 일로`); for (const k of keys) { const x = S.a.actions.find(a => a.key === k); if (x) { if (!S.todos.some(t => t.key === k && t.status !== 'done')) S.todos.unshift({id: uid(), title: x.title, due: x.deadline && x.deadline.date || '', status: 'todo', source: x.kind, url: x.url, key: k, at: Date.now()}); S.plan[k] = S.plan[k] || 'today'; } } S.multi.clear(); saveLocal(); refreshQueue(); toastUndo(`${keys.length}건을 할 일에 넣었습니다.`); break; }
      case 'batchCsv': { const rows = S.a.actions.filter(x => S.multi.has(x.key)); download(`선택항목_${today()}.csv`, R.toCsv(rows, csvCols), 'text/csv;charset=utf-8'); break; }
      case 'batchFocus': startFocus([...S.multi]); S.multi.clear(); break;
      case 'batchClear': S.multi.clear(); refreshQueue(); break;
      case 'focusStart': startFocus(); break;
      case 'focusList': { const l = S.a.approval.lists[S.apTab]; const ks = [...((l && l.docs) || []), ...(S.apMore[S.apTab] || [])].map(d => `doc:${S.apTab}:${d.docId}`).filter(k => S.a.actions.some(a => a.key === k)); if (!ks.length) { toast('이 목록의 문서는 처리할 일로 분류되지 않았습니다. 행의 버튼으로 하나씩 여세요.'); break; } startFocus(ks); break; }
      case 'focusNext': focusNext(true); break;
      case 'focusSkip': if (S.focus && !S.focus.busy && leavePane()) { S.focus.results[S.focus.keys[S.focus.i]] = 'skip'; if (S.focus.i >= S.focus.keys.length - 1) finishFocus(); else { S.focus.i++; focusOpen(); } } break;
      case 'focusOpenGate': if (S.focus) { const x = S.a.actions.find(a => a.key === S.focus.keys[S.focus.i]); S.focus.gate = false; if (x) { S.pane.url = x.url; renderPane(); } } break;
      case 'menuView': openMenu('view'); break;
      case 'focusPrev': focusPrev(); break;
      case 'focusStop': stopFocus(); break;
      case 'apTab': S.apTab = v; S.apTabPinned = true; renderMain(); break;
      case 'apMore': await loadApprovalMore(); break;
      case 'selDoc': if (!leavePane()) break; S.sel = {type: 'doc', kind: el.dataset.kind, docId: el.dataset.id}; S.pane.url = ''; S.pane.extract = null; S.pane.preview = null; renderMain(); renderPane(); break;
      case 'reloadRouting': toast('배부·접수 이력을 읽는 중…'); await loadRouting(true); render(); break;
      case 'mailFilter': S.mailFilter = v; renderMain(); break;
      case 'selMail': if (!leavePane()) break; S.sel = {type: 'mail', box: el.dataset.box, uid: el.dataset.uid}; S.pane.url = ''; renderMain(); renderPane(); break;
      case 'selMailSearch': { if (!leavePane()) break; const it = (S.mailSearch.res && S.mailSearch.res.groups.mail.items || []).find(x => x.uid === el.dataset.uid); if (it) { S.sel = {type: 'search', item: it}; S.pane.url = ''; renderPane(); } break; }
      case 'clearMailSearch': S.mailSearch = {kw: '', res: null}; renderMain(); break;
      case 'stype': S.search.types = S.search.types.includes(v) ? S.search.types.filter(t => t !== v) : [...S.search.types, v]; renderMain(); break;
      case 'doSearch': searchFromInputs(); break;
      case 'searchMore': searchMore(el.dataset.t); break;
      case 'selSearch': { if (!leavePane()) break; const g = S.search.res && S.search.res.groups[el.dataset.t]; const it = g && g.items.find(x => (x.docId || x.uid || x.id || x.fileId) === el.dataset.id); if (it) { S.sel = {type: 'search', item: it}; S.pane.url = ''; S.pane.extract = null; renderMain(); renderPane(); } break; }
      case 'related': S.search.kw = el.dataset.q; runSearch(['doc', 'board', 'mail', 'file']); break;
      case 'paneCaseFlow': loadCaseFlow(el.dataset.q || ''); break;
      case 'openUrl': closeOverlay(); openUrl(el.dataset.url, {title: el.dataset.title || el.textContent.trim(), unread: (el.dataset.unread ?? '') === '1', what: el.dataset.what || '문서'}); break;
      case 'copy': copyText(v); break;
      case 'paneExpand': S.pane.expanded = !S.pane.expanded; renderPane(); break;
      case 'closePane': if (S.focus) { stopFocus(); break; } if (!leavePane()) break; S.pane.dirty = false; S.sel = null; S.pane.url = ''; S.pane.expanded = false; render(); break;
      case 'todoFromSel': { const t = selInfo(); const x = selectedAction(); addTodo(t.title, x && x.deadline && x.deadline.date || '', x ? x.kind : 'GW 비서 항목', t.url, x ? x.key : ''); break; }
      case 'todoFromExtract': { const nx = S.pane.extract && R.nextDeadline(S.pane.extract.deadlines); const t = selInfo(); if (nx) addTodo(t.title, nx.date, '원문 기한 자동 추출', t.url); break; }
      case 'boardCard': { const k = el.dataset.k; if (path.some(n => n && n.tagName === 'BUTTON')) break; if (k.startsWith('todo:')) { const t = S.todos.find(x => `todo:${x.id}` === k); if (t && t.url) { S.sel = {type: 'frame', title: t.title, url: t.url}; openUrl(t.url, {title: t.title}); } } else { if (go('today')) selectAction(k); } break; }
      case 'addTodo': addTodoFromInput(); break;
      case 'todoDel': { const t = S.todos.find(x => x.id === el.dataset.id); if (!t) break; pushUndo('할 일 삭제'); S.todos = S.todos.filter(x => x.id !== t.id); delete S.plan[`todo:${t.id}`]; saveLocal(); renderMain(); renderNav(); toastUndo(`"${t.title.slice(0, 20)}" 할 일을 지웠습니다.`); break; }
      case 'todoEdit': { const t = S.todos.find(x => x.id === el.dataset.id); if (!t) break; (async () => { let values = [t.title, t.due || '']; while (true) { const v = await askForm({title: '할 일 고치기', fields: [{label: '할 일 내용', value: values[0]}, {label: '기한 (예: 11/20 또는 2026-11-20, 비우면 없음)', value: values[1]}]}); if (!v || !v[0]) return; const cur = S.todos.find(x => x.id === t.id); if (!cur) { toast('다른 탭에서 지워진 할 일입니다.'); return; } const due = parseDue(v[1]); if (due === null) { toast(dueError); values = v; continue; } pushUndo('할 일 수정'); cur.title = v[0]; cur.due = due; saveLocal(); renderMain(); renderNav(); toastUndo('할 일을 고쳤습니다.'); return; } })(); break; }
      case 'calLayer': { const cf = teamCfg(); cf.layers[el.dataset.v] = !cf.layers[el.dataset.v]; renderMain(); break; }
    case 'calDept': teamCfg().dept = el.dataset.v; renderMain(); break;
    case 'calOpts': S.cal.opts = !S.cal.opts; renderMain(); break;
    case 'calMine': { const cf = teamCfg(); cf.mine = !cf.mine; renderMain(); break; }
    case 'calDay': { const cf = teamCfg(); cf.day = el.dataset.v === cf.day ? '' : el.dataset.v; renderMain(); break; }
    case 'calTeamReload': delete (S.team || {})[monthKey()]; renderMain(); break;
    case 'calPrev': S.cal.offset--; renderMain(); break;
      case 'calNext': S.cal.offset++; renderMain(); break;
      case 'calToday': S.cal.offset = 0; renderMain(); break;
      case 'calItem': if (el.dataset.k && S.a.actions.some(x => x.key === el.dataset.k)) { if (go('today')) selectAction(el.dataset.k); } else if (el.dataset.url) openUrl(el.dataset.url, {title: el.textContent.trim()}); break;
      case 'goBudgetPick': S.budget.pickOpen = true; go('budget'); break;
      case 'bTogglePick': S.budget.pickOpen = !S.budget.pickOpen; renderMain(); break;
      case 'bPick': e.stopPropagation(); S.budget.project = el.dataset.p; S.budget.filter = el.dataset.f || ''; loadBudget(); break;
      case 'bPin': { e.stopPropagation(); const p = el.dataset.p, f = el.dataset.f || '', l = el.dataset.l || f || p; const i = S.settings.budget.findIndex(x => x.project === p && (x.filter || '') === f); if (i >= 0) { S.settings.budget.splice(i, 1); toast('내 관심 사업에서 뺐습니다.'); } else { S.settings.budget.push({project: p, filter: f, label: l}); toast('내 관심 사업에 추가했습니다.'); } /* allow empty budget */ saveLocal(); renderMain(); break; }
      case 'bUnpin': { e.stopPropagation(); S.settings.budget.splice(Number(el.dataset.i), 1); /* allow empty budget */ saveLocal(); renderMain(); toast('내 관심 사업에서 뺐습니다.'); break; }
      case 'ledger': loadLedger(el.dataset.code); break;
      case 'bSearchRetry': loadBudgetAll(true); break;
      case 'bHit': { const d = el.dataset; if (d.empty) { toast('이 과목은 올해 예산·집행이 없습니다(공통 과목표에만 있는 과목).'); break; } const b = S.budget; b.project = d.p; b.filter = d.h || ''; b.q = ''; b.pendingLedger = d.lv === '세' && Number(d.x) > 0 ? d.code : ''; loadBudget(); break; }
      case 'loadMonthly': loadMonthly(); break;
      case 'budgetMonth': { const m = S.budget.month === v ? '' : v; if (!S.budget.ledger || S.budget.ledger.bgtCd !== '__ALL') { await loadLedgerAll(); } S.budget.month = m; renderMain(); break; }
      case 'ledgerAll': loadLedgerAll(); break;
      case 'budgetMonthClear': S.budget.month = ''; renderMain(); break;
      case 'ledgerRow': { if (!leavePane()) break; const r = S.budget.ledger.rows[Number(el.dataset.i)]; S.sel = {type: 'ledger', row: r}; S.pane.url = ''; renderPane(); break; }
      case 'findDocNo': findAndOpenDocNo(el.dataset.no, el.dataset.t); break;
      case 'csvBudget': { const t = S.budget.table; download(`예산_${t.project}_${today()}.csv`, R.toCsv(t.rows, [{label: '구분', key: 'level'}, {label: '코드', key: 'code'}, {label: '과목', key: 'name'}, {label: '예산', key: 'budget'}, {label: '집행', key: 'executed'}, {label: '잔액', key: 'balance'}, {label: '집행률(%)', key: 'rate'}]), 'text/csv;charset=utf-8'); break; }
      case 'richBudget': { const t = S.budget.table; const html = `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-size:10pt"><tr><th>과목</th><th>예산</th><th>집행</th><th>잔액</th><th>집행률</th></tr>${t.rows.map(r => `<tr><td>${esc(r.level)} ${esc(r.name)}</td><td align="right">${won(r.budget)}</td><td align="right">${won(r.executed)}</td><td align="right">${won(r.balance)}</td><td align="right">${pct(r.rate)}</td></tr>`).join('')}</table>`; copyRich(html, t.rows.map(r => `${r.level} ${r.name}\t${won(r.budget)}\t${won(r.executed)}\t${won(r.balance)}\t${pct(r.rate)}`).join('\n')); break; }
      case 'csvLedger': { const l = S.budget.ledger, month = S.budget.month, rows = l.rows.filter(r => !month || r.date.slice(4, 6) === month); download(`결의내역_${l.bgtCd}${month ? '_' + month + '월' : ''}_${today()}.csv`, R.toCsv(rows, [{label: '결의일', value: r => ymd8(r.date)}, {label: '적요', key: 'desc'}, {label: '금액', key: 'amount'}, {label: '문서번호', key: 'docNo'}, {label: '작성', key: 'writer'}, {label: '전표', key: 'slip'}]), 'text/csv;charset=utf-8'); break; }
      case 'attMonth': loadAttendance(v); break;
      case 'attDay': S.att.day = S.att.day === v ? '' : v; renderMain(); break;
      case 'csvAtt': download(`근태_${S.att.month}.csv`, R.toCsv(S.att.rows, [{label: '날짜', value: r => ymd8(r.date)}, {label: '근무유형', key: 'workType'}, {label: '출결', key: 'result'}, {label: '근태항목', key: 'item'}, {label: '상태', key: 'status'}, {label: '출근', value: r => hm4(r.come)}, {label: '퇴근', value: r => hm4(r.leave)}, {label: '인정(분)', key: 'recognizedMin'}]), 'text/csv;charset=utf-8'); break;
      case 'dlBrief': download(`그룹웨어_브리핑_${today()}.html`, R.renderHtml(S.a), 'text/html;charset=utf-8'); break;
      case 'printBrief': { const w = window.open('', '_blank'); if (w) { w.document.write(R.renderHtml(S.a)); w.document.close(); setTimeout(() => w.print(), 400); } break; }
      case 'richBrief': copyRich(briefHtml(), R.renderMarkdown(S.a)); break;
      case 'csvQueue': download(`할일목록_${today()}.csv`, R.toCsv(queue(), csvCols), 'text/csv;charset=utf-8'); break;
      case 'mkWeekly': makeWeekly(); break;
      case 'richWeekly': copyRich(weeklyHtml(S.weekly), S.weekly); break;
      case 'dlWeekly': download(`주간업무실적_${today()}.txt`, S.weekly); break;
      case 'budgetRowAdd': S.settings.budget.push({project: '', filter: '', label: ''}); renderMain(); break;
      case 'budgetRowDel': S.settings.budget.splice(Number(el.dataset.i), 1); S.budget.table = null; saveLocal(); renderMain(); break;
      case 'cleanSynap': {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('synap_'));
        if (!keys.length) { toast('정리할 그룹웨어 미리보기 캐시가 없습니다.'); break; }
        if (!confirm(`그룹웨어 문서 미리보기 캐시 ${keys.length}건을 이 브라우저에서 지울까요? (그룹웨어 원본 문서는 바뀌지 않으며, 다시 미리보기할 때 재로드됩니다)`)) break;
        for (const k of keys) try { localStorage.removeItem(k); } catch {}
        toast(`문서 미리보기 캐시 ${keys.length}건을 정리했습니다.`);
        if ($('#overlay [aria-label="데이터 관리"]')) openDataCenter(); else if (S.view === 'settings') renderMain();
        break;
      }
      case 'resetDone': pushUndo('표시 초기화'); S.hidden = {}; S.snooze = {}; S.plan = {}; saveLocal(); render(); toastUndo('숨기기·미루기·보드 계획을 지웠습니다.'); break;
      case 'resetRouting': S.routing = null; store.del('routing'); toast('추천 이력을 지웠습니다.'); break;
      case 'resetAll': if (confirm('이 브라우저에 저장된 내 GW 비서 설정·할 일·표시를 모두 지울까요? (그룹웨어 자료는 바뀌지 않습니다)')) { const p = getPrefix(); for (const k of Object.keys(localStorage)) if (k.startsWith(p)) localStorage.removeItem(k); for (const k of Object.keys(localStorage)) if (k.startsWith('bwyfgw:wc:migrated:') && localStorage.getItem(k) === currentKey) localStorage.removeItem('bwyfgw:wc:' + k.slice('bwyfgw:wc:migrated:'.length)); reloadUserState(); clearUserViews(); localBaseline = localValues(); schedule(); applyLook(); refresh(); } break;
      case 'toastUndo': undo(); root.querySelector('.toast')?.remove(); break;
      case 'dfSearch': case 'dfChip': case 'dfMore': case 'dfKind': case 'dfDept': case 'dfReset': case 'dfSave': case 'dfUnsave': case 'dfSel':
        dfAct(act, actEl, v); break; // 문서 찾기(35번 조각)
      case 'homeTile':
      case 'homeNext':
      case 'homeOpenToday':
      case 'chatChip':
      case 'chatSend':
      case 'chatStop':
      case 'chatClear':
      case 'chatConfirm':
      case 'chatCancel':
      case 'chatSetupAi':
      case 'chatFocus':
      case 'chatOpenItem':
      case 'chatNav':
      case 'gsyncOpen':
      case 'gsyncStatus':
      case 'gsyncLayer':
      case 'gsyncUp':
      case 'gsyncNext':
      case 'gsyncFind':
      case 'gsyncMark':
        HOME_ACTS[act](actEl, v, e); break; // 홈·채팅 화면의 처리기 등록소(29~30번 조각)
      default: break;
    }
  });
  const csvCols = [{label: '우선순위', value: x => PRI[x.priority]}, {label: '점수', key: 'score'}, {label: '영역', key: 'area'}, {label: '구분', key: 'kind'}, {label: '제목', key: 'title'}, {label: '내용', key: 'detail'}, {label: '기한', value: x => x.deadline ? x.deadline.date : ''}, {label: '일시', key: 'when'}];

  // IME-safe inputs: update only the list, never rebuild the input while typing.
  root.addEventListener('input', e => {
    const t = e.composedPath()[0];
    if (t.id === 'qfilter') { S.filter.q = t.value; if (!e.isComposing) refreshQueue(); }
    else if (t.id === 'dfIn') { dfState().filter.q = t.value; if (!e.isComposing) dfRefreshList(); }
    else if (t.id === 'bq') { S.budget.q = t.value; }
    else if (t.id === 'sq') { S.search.kw = t.value; }
    else if (t.id === 'weekly') { const shown = t.dataset.prev ?? t.defaultValue; if (S.weekly && S.weekly !== shown) store.set('weeklyRecovery', {at: Date.now(), text: S.weekly}); /* 다른 탭에서 바뀐 초안을 덮기 전에 보관 */ S.weekly = t.value; t.dataset.prev = t.value; const saved = saveLocal(); const w = $('#wkSaved'); if (w) { w.classList.toggle('on', saved); w.textContent = saved ? '자동 저장됨' : '저장 실패 · 내용을 복사하세요'; } }
    else if (t.id === 'palq') palRender(t.value);
  });
  root.addEventListener('compositionend', e => { const t = e.composedPath()[0]; if (t.id === 'qfilter') { S.filter.q = t.value; refreshQueue(); } else if (t.id === 'dfIn') { dfState().filter.q = t.value; dfRefreshList(); } });
  root.addEventListener('change', e => {
    const t = e.composedPath()[0];
    if (t.id && t.id.startsWith('df') && dfChange(t)) return;
    if (t.id === 'speriod') S.search.period = t.value;
    if (t.id === 'bproj' && t.value === '__custom') { S.budget.custom = true; renderMain(); }
    if (t.id === 'bproj' && t.value !== '__custom') { S.budget.custom = false; const [p, f] = t.value.split('|'); S.budget.project = p; S.budget.filter = f; loadBudget(); }
    if (t.id === 'bCatProj') { S.budget.project = t.value; S.budget.filter = ''; loadBudget(); }
    if (t.id === 'bq') budgetQuery();
    if (t.id === 'resDate') resGo();
    if (t.id === 'payPlan') payPlanChanged();
    if (t.id === 'resTitle') resSyncForm(); // 예약명만 바꾸면 겹침 확인 결과는 그대로 둔다(다시 그리면 누르려던 버튼이 사라져 클릭이 씹힘)
    if (t.id === 'resStart' || t.id === 'resEnd') { resSyncForm(); const rs = resState(); if (rs.check) { rs.rev++; rs.check = null; renderMain(); } }
    if (t.id === 'setImportFile') settingsImport(t);
    if (t.classList && t.classList.contains('setc')) saveSettingField(t);
    if (t.dataset && t.dataset.b) saveBudgetRows();
  });
  root.addEventListener('keyup', e => { const t = e.composedPath()[0]; if (t.id === 'bq' && !e.isComposing && e.key === 'Enter') budgetQuery(); });
  // Drag & drop: board columns and calendar dates.
  root.addEventListener('dragstart', e => { const n = e.composedPath().find(x => x && x.dataset && x.dataset.drag); if (n) { e.dataTransfer.setData('text/plain', n.dataset.drag); e.dataTransfer.effectAllowed = 'move'; } });
  root.addEventListener('dragover', e => { const z = e.composedPath().find(x => x && x.dataset && (x.dataset.drop || x.dataset.dropDate)); if (z) { e.preventDefault(); z.classList.add('drop'); } });
  root.addEventListener('dragleave', e => { const z = e.composedPath().find(x => x && x.dataset && (x.dataset.drop || x.dataset.dropDate)); if (z) z.classList.remove('drop'); });
  root.addEventListener('drop', e => {
    const z = e.composedPath().find(x => x && x.dataset && (x.dataset.drop || x.dataset.dropDate));
    if (!z) return;
    e.preventDefault(); z.classList.remove('drop');
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    if (z.dataset.drop) dropTo(id, z.dataset.drop);
    else if (z.dataset.dropDate && id.startsWith('todo:')) { const t = S.todos.find(x => `todo:${x.id}` === id); if (t) { pushUndo('기한 변경'); t.due = z.dataset.dropDate; delete S.plan[id]; saveLocal(); renderMain(); toastUndo(`기한을 ${t.due.slice(5)}로 바꿨습니다.`); } }
  });
  // Resizable pane (pointer + keyboard).
  const split = $('#split');
  split.addEventListener('pointerdown', e => {
    e.preventDefault(); split.classList.add('drag');
    try { split.setPointerCapture(e.pointerId); } catch {}
    const shield = document.createElement('div'); shield.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:col-resize'; document.body.append(shield);
    const move = ev => { S.settings.paneWidth = Math.max(360, Math.min(window.innerWidth * 0.75, window.innerWidth - ev.clientX)); applyLook(); };
    const up = () => { split.classList.remove('drag'); shield.remove(); document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true); saveLocal(); };
    document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  });
  split.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const cur = S.settings.paneWidth || 560, max = Math.max(360, Math.round(window.innerWidth * 0.75));
    if (e.key === 'ArrowLeft') S.settings.paneWidth = Math.min(max, cur + 24);
    else if (e.key === 'ArrowRight') S.settings.paneWidth = Math.max(360, cur - 24);
    else if (e.key === 'Home') S.settings.paneWidth = 360;
    else if (e.key === 'End') S.settings.paneWidth = max;
    applyLook(); saveLocal();
  });

  let toastTimer = null;
  function toast(msg, withUndo = false) {
    let t = root.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; wcEl.append(t); }
    t.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button data-act="toastUndo">되돌리기</button>' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), withUndo ? 6000 : 3800);
  }
  const toastUndo = msg => toast(msg, true);

