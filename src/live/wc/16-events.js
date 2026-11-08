// GW 통합 업무센터 · events
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- events ----------
  root.addEventListener('click', async e => {
    const path = e.composedPath();
    const hasStop = path.some(n => n && n.dataset && n.dataset.stop);
    const actEl = path.find(n => n && n.dataset && n.dataset.act);
    const act = actEl ? actEl.dataset.act : '';
    const v = actEl ? actEl.dataset.v : '';

    // 1. If any overlay, dropdown menu, modal, or coachmark is open, clicking outside it closes it IMMEDIATELY
    if ((S.menuOpen || S.paletteOpen || S.helpOpen || S.coach) && !hasStop) {
      if (!['menuNew', 'menuBell', 'menuView', 'help', 'openPalette'].includes(act)) {
        closeOverlay();
      }
    }
    if (!actEl) return;
    const el = actEl;
    if (act === 'closeOverlay' && hasStop) return;
    if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
    switch (act) {
      case 'refresh': refresh(); break;
      case 'applyRefresh': S.pendingRefresh = false; render(); break;
      case 'relogin': if (!S.pane.dirty || confirm('처리 창에 입력 중인 내용이 있습니다. 그룹웨어를 새로 고치면 사라집니다. 계속할까요?')) location.reload(); break;
      case 'close': if (leavePane()) close(); break;
      case 'home': goHome(); break;
      case 'apOpen': { e.stopPropagation(); const d = findDoc(el.dataset.kind, el.dataset.id) || (S.apMore[el.dataset.kind] || []).find(x => x.docId === el.dataset.id); if (!d || !leavePane()) break; S.sel = {type: 'doc', kind: el.dataset.kind, docId: d.docId}; S.pane.url = ''; renderMain(); openUrl(d.url, {title: d.title, unread: d.unread}); break; }
      case 'copyErrors': copyText((S.errors || []).map(x => `${new Date(x.at).toISOString()} ${x.where}: ${x.msg}`).join('\n')); break;
      case 'setTodayTab': S.todayTab = v; S.filter.level = 'all'; renderMain(); break;
      case 'stateFilter': S.filter.level = S.filter.level === v || v === 'all' ? 'all' : v; renderMain(); break;
      case 'rowMenu': e.stopPropagation(); openMenu('row:' + el.dataset.k, el); break;
      case 'markDone': e.stopPropagation(); { pushUndo('끝냄'); S.hidden[el.dataset.k] = Date.now(); saveLocal(); afterMark(); toastUndo(el.dataset.k.startsWith('att:') ? '확인 완료 처리했습니다. 그룹웨어 기록이 3일 뒤에도 그대로면 다시 보여 드립니다.' : '처리 완료되었습니다. 그룹웨어에 아직 남아 있으면 하루 뒤 다시 보여 드립니다.'); } break;
      case 'coach': startCoach(); break;
      case 'coachNext': coachNext(); break;
      case 'coachEnd': endCoach(); break;
      case 'paneOpenMain': { const x = selectedAction(); if (x) openItem(x); else { const info = paneInfo(); if (info.url) openUrl(info.url, {title: info.title}); } break; }
      case 'pvFile': { const c = S.mailDet && S.mailDet[el.dataset.uid]; const f = c && c.files[Number(el.dataset.i)]; if (!f) break; el.disabled = true; try { const u = await GW.mailAttachmentPreview({uid: el.dataset.uid, sn: f.sn, account: c.account}); openUrl(u, {title: '미리보기: ' + f.name}); } catch (err) { toast('미리보기를 열지 못했습니다: ' + err.message); } el.disabled = false; break; }
      case 'dlFile': downloadMailFile(el.dataset.uid, Number(el.dataset.i), el); break;
      case 'dlAll': { const c = S.mailDet[el.dataset.uid]; el.disabled = true; let ok = 0; for (let i = 0; i < c.files.length; i++) { if (await downloadMailFile(el.dataset.uid, i, root.querySelector('[data-act="dlFile"][data-uid="' + CSS.escape(el.dataset.uid) + '"][data-i="' + i + '"]'))) ok++; } el.disabled = false; toast('첨부 ' + ok + '/' + c.files.length + '개를 받았습니다. 브라우저 다운로드 폴더를 확인하세요.'); break; }
      case 'bodyToggle': S.bodyOpen = !S.bodyOpen; renderPane(); break;
      case 'mailDetailRetry': { const m = findMail(el.dataset.box, el.dataset.uid); if (m) { delete S.mailDet[m.uid]; loadMailDetail(m); renderPane(); } break; }
      case 'rmSnooze': snooze([el.dataset.k]); closeOverlay(); break;
      case 'rmTodo': { const x = S.a.actions.find(a => a.key === el.dataset.k); closeOverlay(); if (x) addTodo(x.title, x.deadline && x.deadline.date || '', x.kind, x.url, x.key); break; }
      case 'rmHide': hide([el.dataset.k]); closeOverlay(); break;
      case 'rmMute': openMenu('mute:' + el.dataset.k); break;
      case 'rmMine': openMenu('mine:' + el.dataset.k); break;
      case 'rmWindow': { const x = S.a.actions.find(a => a.key === el.dataset.k); closeOverlay(); if (x) openWindow(x.url, x); break; }
      case 'relMenu': e.stopPropagation(); openMenu(`${el.dataset.l}:${el.dataset.k}`); break;
      case 'relAdd': {
        if (el.dataset.l === 'mine' && el.dataset.t === 'kind' && ['deptWaiting', 'distWaiting', 'sendWaiting'].includes(el.dataset.v)) { const ro = S.settings.roles = {...(S.settings.roles || {})}; ro[{deptWaiting: 'deptReceiver', distWaiting: 'distributor', sendWaiting: 'sender'}[el.dataset.v]] = true; saveLocal(); reanalyze(); closeOverlay(); render(); toast('설정의 “내 업무 범위”에 반영했습니다.'); break; }
        addRule(el.dataset.l, el.dataset.t, el.dataset.v, el.dataset.label);
        toast(el.dataset.l === 'mute' ? '목록에서 뺐습니다. Ctrl+Z 또는 설정에서 되돌릴 수 있습니다.' : '내 처리할 일로 옮겼습니다.');
        break;
      }
      case 'delRule': { const r = rel(); r[el.dataset.l].splice(Number(el.dataset.i), 1); saveLocal(); if (S.raw) reanalyze(); render(); break; }
      case 'refToggle': S.refOpen = !el.open; break;
      case 'mailDetail': { const m = findMail(el.dataset.box, el.dataset.uid); if (m && confirm('이 메일을 불러오면 그룹웨어에 읽음으로 표시됩니다. 불러올까요?')) loadMailDetail(m, true); break; }
      case 'crumbView': if (S.focus) { stopFocus(); break; } if (!leavePane()) break; S.sel = null; S.pane.url = ''; S.pane.expanded = false; render(); break;
      case 'toggleCharts': S.settings.showCharts = !showCharts(); saveLocal(); renderMain(); break;
      case 'searchExample': S.search.kw = el.dataset.v; runSearch(); break;
      case 'view': go(v); break;
      case 'help': toggleHelp(); break;
      case 'closeHelp': case 'closeOverlay': closeOverlay(); break;
      case 'menuNew': openMenu('new'); break;
      case 'menuBell': openMenu('bell'); break;
      case 'bellItem': closeOverlay(); go('today'); selectAction(el.dataset.k); break;
      case 'fsUp': fontStep(1); if (S.menuOpen === 'view') { S.menuOpen = ''; openMenu('view'); } break;
      case 'fsDown': fontStep(-1); if (S.menuOpen === 'view') { S.menuOpen = ''; openMenu('view'); } break;
      case 'theme': toggleTheme(); if (S.menuOpen === 'view') { S.menuOpen = ''; openMenu('view'); } break;
      case 'openPalette': closeOverlay(); openPalette(''); break;
      case 'palRun': { const c = palItems[Number(el.dataset.i)]; closeOverlay(); if (c) c.run(); break; }
      case 'tileLevel': S.filter.level = S.filter.level === v ? 'all' : v; S.filter.area = 'all'; renderMain(); break;
      case 'tileArea': S.filter.area = S.filter.area === v ? 'all' : v; S.filter.level = 'all'; renderMain(); break;
      case 'goApproval': if (v) S.apTab = v; go('approval'); break;
      case 'goCalendar': go('calendar'); break;
      case 'goBudgetCode': go('budget'); break;
      case 'goAttendanceDay': S.att.day = v; if (S.att.month !== v.slice(0, 6)) { S.att.rows = null; S.att.month = v.slice(0, 6); } go('attendance'); break;
      case 'selDeadline': if (el.dataset.k && S.a.actions.some(x => x.key === el.dataset.k)) { go('today'); selectAction(el.dataset.k); } else { S.search.kw = relatedQ(el.dataset.title); runSearch(); } break;
      case 'area': S.filter.area = v; renderMain(); break;
      case 'level': S.filter.level = v; renderMain(); break;
      case 'onlyNew': S.filter.onlyNew = !S.filter.onlyNew; renderMain(); break;
      case 'showHidden': S.filter.showHidden = !S.filter.showHidden; renderMain(); break;
      case 'multi': {
        e.stopPropagation();
        const k = el.dataset.k;
        if (e.shiftKey && S.lastClickKey) { const q = queue().map(x => x.key); const a = q.indexOf(S.lastClickKey), b = q.indexOf(k); if (a >= 0 && b >= 0) for (const kk of q.slice(Math.min(a, b), Math.max(a, b) + 1)) S.multi.add(kk); }
        else if (S.multi.has(k)) S.multi.delete(k); else S.multi.add(k);
        S.lastClickKey = k; refreshQueue(); return;
      }
      case 'selAction': if (path.some(n => n && n.tagName === 'INPUT')) return; selectAction(el.dataset.k); break;
      case 'quickOpen': e.stopPropagation(); { const x = S.a.actions.find(a => a.key === el.dataset.k); if (x) { selectAction(x.key); openItem(x); } } break;
      case 'quickHide': e.stopPropagation(); hide([el.dataset.k]); break;
      case 'quickSnooze': e.stopPropagation(); snooze([el.dataset.k]); break;
      case 'quickTodo': e.stopPropagation(); { const x = S.a.actions.find(a => a.key === el.dataset.k); if (x) addTodo(x.title, x.deadline && x.deadline.date || '', x.kind, x.url, x.key); } break;
      case 'batchHide': hide([...S.multi]); break;
      case 'batchSnooze': snooze([...S.multi]); break;
      case 'batchTodo': { const keys = [...S.multi]; pushUndo(`${keys.length}건 할 일로`); for (const k of keys) { const x = S.a.actions.find(a => a.key === k); if (x) { S.todos.unshift({id: uid(), title: x.title, due: x.deadline && x.deadline.date || '', status: 'todo', source: x.kind, url: x.url, at: Date.now()}); S.plan[k] = S.plan[k] || 'today'; } } S.multi.clear(); saveLocal(); refreshQueue(); toastUndo(`${keys.length}건을 할 일에 넣었습니다.`); break; }
      case 'batchCsv': { const rows = S.a.actions.filter(x => S.multi.has(x.key)); download(`선택항목_${today()}.csv`, R.toCsv(rows, csvCols), 'text/csv;charset=utf-8'); break; }
      case 'batchFocus': startFocus([...S.multi]); S.multi.clear(); break;
      case 'batchClear': S.multi.clear(); refreshQueue(); break;
      case 'focusStart': startFocus(); break;
      case 'focusList': { const l = S.a.approval.lists[S.apTab]; startFocus(((l && l.docs) || []).map(d => `doc:${S.apTab}:${d.docId}`).filter(k => S.a.actions.some(a => a.key === k))); break; }
      case 'focusNext': focusNext(true); break;
      case 'focusSkip': if (S.focus && !S.focus.busy && leavePane()) { S.focus.results[S.focus.keys[S.focus.i]] = 'skip'; if (S.focus.i >= S.focus.keys.length - 1) finishFocus(); else { S.focus.i++; focusOpen(); } } break;
      case 'focusOpenGate': if (S.focus) { const x = S.a.actions.find(a => a.key === S.focus.keys[S.focus.i]); S.focus.gate = false; if (x) { S.pane.url = x.url; renderPane(); } } break;
      case 'menuView': openMenu('view'); break;
      case 'focusPrev': focusPrev(); break;
      case 'focusStop': stopFocus(); break;
      case 'apTab': S.apTab = v; renderMain(); break;
      case 'apMore': { const l = S.a.approval.lists[S.apTab]; const have = l.docs.length + (S.apMore[S.apTab] || []).length; try { const r = await GW.approvalPage(S.apTab, Math.floor(have / 30) + 1); S.apMore[S.apTab] = [...(S.apMore[S.apTab] || []), ...r.docs.filter(d => !l.docs.some(x => x.docId === d.docId))]; } catch (err) { toast(err.message); } renderMain(); break; }
      case 'selDoc': if (!leavePane()) break; S.sel = {type: 'doc', kind: el.dataset.kind, docId: el.dataset.id}; S.pane.url = ''; S.pane.extract = null; S.pane.preview = null; renderMain(); renderPane(); break;
      case 'reloadRouting': toast('배부·접수 이력을 읽는 중…'); await loadRouting(true); render(); break;
      case 'mailFilter': S.mailFilter = v; renderMain(); break;
      case 'mailGroup': S.mailGroup = !S.mailGroup; renderMain(); break;
      case 'selMail': if (!leavePane()) break; S.sel = {type: 'mail', box: el.dataset.box, uid: el.dataset.uid}; S.pane.url = ''; renderMain(); renderPane(); break;
      case 'selMailSearch': { if (!leavePane()) break; const it = (S.mailSearch.res && S.mailSearch.res.groups.mail.items || []).find(x => x.uid === el.dataset.uid); if (it) { S.sel = {type: 'search', item: it}; S.pane.url = ''; renderPane(); } break; }
      case 'clearMailSearch': S.mailSearch = {kw: '', res: null}; renderMain(); break;
      case 'stype': S.search.types = S.search.types.includes(v) ? S.search.types.filter(t => t !== v) : [...S.search.types, v]; renderMain(); break;
      case 'doSearch': S.search.kw = ($('#sq') || {}).value?.trim() || S.search.kw; S.search.period = ($('#speriod') || {}).value || ''; runSearch(); break;
      case 'searchMore': { const t = el.dataset.t; const s = S.search; const g = s.res.groups[t]; const page = (s.more[t] || 1) + 1; try { const r = await GW.search(s.kw, {types: [t], pageSize: 10, page, from: periodFrom(s.period)}); const add = r.groups[t].items; g.items = [...g.items, ...add]; s.more[t] = page; } catch (err) { toast(err.message); } renderMain(); break; }
      case 'selSearch': { if (!leavePane()) break; const g = S.search.res && S.search.res.groups[el.dataset.t]; const it = g && g.items.find(x => (x.docId || x.uid || x.id || x.fileId) === el.dataset.id); if (it) { S.sel = {type: 'search', item: it}; S.pane.url = ''; S.pane.extract = null; renderMain(); renderPane(); } break; }
      case 'related': S.search.kw = el.dataset.q; runSearch(['doc', 'board', 'mail', 'file']); break;
      case 'openUrl': closeOverlay(); openUrl(el.dataset.url, {title: el.dataset.title || el.textContent.trim(), unread: el.dataset.unread === '1', what: el.dataset.what || '문서'}); break;
      case 'copy': copyText(v); break;
      case 'paneExpand': S.pane.expanded = !S.pane.expanded; renderPane(); break;
      case 'closePane': if (S.focus) { stopFocus(); break; } if (!leavePane()) break; S.sel = null; S.pane.url = ''; S.pane.expanded = false; render(); break;
      case 'todoFromSel': { const t = selInfo(); const x = selectedAction(); addTodo(t.title, x && x.deadline && x.deadline.date || '', x ? x.kind : '업무센터 항목', t.url, x ? x.key : ''); break; }
      case 'todoFromExtract': { const nx = S.pane.extract && R.nextDeadline(S.pane.extract.deadlines); const t = selInfo(); if (nx) addTodo(t.title, nx.date, '원문 기한 자동 추출', t.url); break; }
      case 'boardCard': { const k = el.dataset.k; if (path.some(n => n && n.tagName === 'BUTTON')) break; if (k.startsWith('todo:')) { const t = S.todos.find(x => `todo:${x.id}` === k); if (t && t.url) { S.sel = {type: 'frame', title: t.title, url: t.url}; openUrl(t.url, {title: t.title}); } } else { go('today'); selectAction(k); } break; }
      case 'addTodo': addTodoFromInput(); break;
      case 'todoDel': { const t = S.todos.find(x => x.id === el.dataset.id); if (!t) break; pushUndo('할 일 삭제'); S.todos = S.todos.filter(x => x.id !== t.id); delete S.plan[`todo:${t.id}`]; saveLocal(); renderMain(); renderNav(); toastUndo(`"${t.title.slice(0, 20)}" 할 일을 지웠습니다.`); break; }
      case 'todoEdit': { const t = S.todos.find(x => x.id === el.dataset.id); if (!t) break; const nt = prompt('할 일 내용', t.title); if (nt === null) break; const nd = prompt('기한 (YYYY-MM-DD, 비우면 없음)', t.due || ''); pushUndo('할 일 고치기'); t.title = nt.trim() || t.title; t.due = /^\d{4}-\d{2}-\d{2}$/.test((nd || '').trim()) ? nd.trim() : ''; saveLocal(); renderMain(); break; }
      case 'calPrev': S.cal.offset--; renderMain(); break;
      case 'calNext': S.cal.offset++; renderMain(); break;
      case 'calToday': S.cal.offset = 0; renderMain(); break;
      case 'calItem': if (el.dataset.k && S.a.actions.some(x => x.key === el.dataset.k)) { go('today'); selectAction(el.dataset.k); } else if (el.dataset.url) openUrl(el.dataset.url, {title: el.textContent.trim()}); break;
      case 'goBudgetPick': S.budget.pickOpen = true; go('budget'); break;
      case 'bTogglePick': S.budget.pickOpen = !S.budget.pickOpen; renderMain(); break;
      case 'bPick': e.stopPropagation(); S.budget.project = el.dataset.p; S.budget.filter = el.dataset.f || ''; loadBudget(); break;
      case 'bPin': { e.stopPropagation(); const p = el.dataset.p, f = el.dataset.f || '', l = el.dataset.l || f || p; const i = S.settings.budget.findIndex(x => x.project === p && (x.filter || '') === f); if (i >= 0) { S.settings.budget.splice(i, 1); toast('내 관심 사업에서 뺐습니다.'); } else { S.settings.budget.push({project: p, filter: f, label: l}); toast('내 관심 사업에 추가했습니다.'); } /* allow empty budget */ saveLocal(); renderMain(); break; }
      case 'bUnpin': { e.stopPropagation(); S.settings.budget.splice(Number(el.dataset.i), 1); /* allow empty budget */ saveLocal(); renderMain(); toast('내 관심 사업에서 뺐습니다.'); break; }
      case 'loadBudget': S.budget.project = $('#bcode').value.trim(); S.budget.filter = $('#bfilter').value.trim(); if (!S.budget.project) { toast('프로젝트 코드를 입력하세요.'); break; } loadBudget(); break;
      case 'ledger': loadLedger(el.dataset.code); break;
      case 'loadMonthly': loadMonthly(); break;
      case 'budgetMonth': { const m = S.budget.month === v ? '' : v; if (!S.budget.ledger || S.budget.ledger.bgtCd !== '__ALL') { await loadLedgerAll(); } S.budget.month = m; renderMain(); break; }
      case 'ledgerAll': loadLedgerAll(); break;
      case 'budgetMonthClear': S.budget.month = ''; renderMain(); break;
      case 'ledgerRow': { if (!leavePane()) break; const r = S.budget.ledger.rows[Number(el.dataset.i)]; S.sel = {type: 'ledger', row: r}; S.pane.url = ''; renderPane(); break; }
      case 'findDocNo': findAndOpenDocNo(el.dataset.no, el.dataset.t); break;
      case 'csvBudget': { const t = S.budget.table; download(`예산_${t.project}_${today()}.csv`, R.toCsv(t.rows, [{label: '구분', key: 'level'}, {label: '코드', key: 'code'}, {label: '과목', key: 'name'}, {label: '예산', key: 'budget'}, {label: '집행', key: 'executed'}, {label: '잔액', key: 'balance'}, {label: '집행률(%)', key: 'rate'}]), 'text/csv;charset=utf-8'); break; }
      case 'richBudget': { const t = S.budget.table; const html = `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-size:10pt"><tr><th>과목</th><th>예산</th><th>집행</th><th>잔액</th><th>집행률</th></tr>${t.rows.map(r => `<tr><td>${esc(r.level)} ${esc(r.name)}</td><td align="right">${won(r.budget)}</td><td align="right">${won(r.executed)}</td><td align="right">${won(r.balance)}</td><td align="right">${pct(r.rate)}</td></tr>`).join('')}</table>`; copyRich(html, t.rows.map(r => `${r.level} ${r.name}\t${won(r.budget)}\t${won(r.executed)}\t${won(r.balance)}\t${pct(r.rate)}`).join('\n')); break; }
      case 'csvLedger': { const l = S.budget.ledger; download(`결의내역_${l.bgtCd}_${today()}.csv`, R.toCsv(l.rows, [{label: '결의일', value: r => ymd8(r.date)}, {label: '적요', key: 'desc'}, {label: '금액', key: 'amount'}, {label: '문서번호', key: 'docNo'}, {label: '작성', key: 'writer'}, {label: '전표', key: 'slip'}]), 'text/csv;charset=utf-8'); break; }
      case 'attMonth': loadAttendance(v); break;
      case 'attDay': S.att.day = S.att.day === v ? '' : v; renderMain(); break;
      case 'csvAtt': download(`근태_${S.att.month}.csv`, R.toCsv(S.att.rows, [{label: '날짜', value: r => ymd8(r.date)}, {label: '근무유형', key: 'workType'}, {label: '출결', key: 'result'}, {label: '근태항목', key: 'item'}, {label: '상태', key: 'status'}, {label: '출근', value: r => hm4(r.come)}, {label: '퇴근', value: r => hm4(r.leave)}, {label: '인정(분)', key: 'recognizedMin'}]), 'text/csv;charset=utf-8'); break;
      case 'dlBrief': download(`그룹웨어_브리핑_${today()}.html`, R.renderHtml(S.a), 'text/html;charset=utf-8'); break;
      case 'printBrief': { const w = window.open('', '_blank'); if (w) { w.document.write(R.renderHtml(S.a)); w.document.close(); setTimeout(() => w.print(), 400); } break; }
      case 'richBrief': copyRich(briefHtml(), R.renderMarkdown(S.a)); break;
      case 'csvQueue': download(`할일목록_${today()}.csv`, R.toCsv(queue(), csvCols), 'text/csv;charset=utf-8'); break;
      case 'mkWeekly': makeWeekly(); break;
      case 'cpWeekly': copyText(S.weekly); break;
      case 'richWeekly': copyRich(weeklyHtml(S.weekly), S.weekly); break;
      case 'dlWeekly': download(`주간업무실적_${today()}.txt`, S.weekly); break;
      case 'budgetRowAdd': S.settings.budget.push({project: '', filter: '', label: ''}); renderMain(); break;
      case 'budgetRowDel': S.settings.budget.splice(Number(el.dataset.i), 1); renderMain(); break;
      case 'saveSettings': {
        const st = S.settings;
        st.refreshMin = Number($('#setRefresh').value);
        st.notify = $('#setNotify').checked;
        if (st.notify && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
        st.fontSize = $('#setFs').value; st.theme = $('#setTheme').value; st.beginner = $('#setBeginner').checked;
        const rows = {};
        root.querySelectorAll('#budgetRows input').forEach(i => { (rows[i.dataset.i] = rows[i.dataset.i] || {})[i.dataset.b] = i.value.trim(); });
        st.budget = Object.values(rows).filter(b => /^[A-Za-z0-9가-힣]+$/.test(b.project || '')).map(b => ({project: b.project, filter: b.filter || '', label: b.label || ''}));
        if (!st.budget.length) st.budget = DEFAULT_SETTINGS.budget;
        st.urgentWords = $('#setWords').value.split(',').map(w => w.trim()).filter(Boolean);
        st.mailCount = Number($('#setMail').value);
        st.roles = {deptReceiver: $('#roleDept').checked, distributor: $('#roleDist').checked, sender: $('#roleSend').checked};
        saveLocal(); schedule(); applyLook(); toast('설정을 저장했습니다.'); S.budget.table = null; refresh(); break;
      }
      case 'resetDone': pushUndo('표시 초기화'); S.hidden = {}; S.snooze = {}; S.plan = {}; saveLocal(); render(); toastUndo('숨기기·미루기·보드 계획을 지웠습니다.'); break;
      case 'resetRouting': S.routing = null; store.del('routing'); toast('추천 이력을 지웠습니다.'); break;
      case 'tourAgain': S.settings.tourDone = false; saveLocal(); toggleHelp(true); break;
      case 'resetAll': if (confirm('이 브라우저에 저장된 내 업무센터 설정·할 일·표시를 모두 지울까요? (그룹웨어 자료는 바뀌지 않습니다)')) { const p = getPrefix(); for (const k of Object.keys(localStorage)) if (k.startsWith(p)) localStorage.removeItem(k); S.hidden = {}; S.snooze = {}; S.plan = {}; S.todos = []; S.newKeys.clear(); S.activity = []; S.history = []; S.settings = {...DEFAULT_SETTINGS}; S.routing = null; S.forms = null; applyLook(); render(); } break;
      case 'toastUndo': undo(); root.querySelector('.toast')?.remove(); break;
      default: break;
    }
  });
  const csvCols = [{label: '우선순위', value: x => PRI[x.priority]}, {label: '점수', key: 'score'}, {label: '영역', key: 'area'}, {label: '구분', key: 'kind'}, {label: '제목', key: 'title'}, {label: '내용', key: 'detail'}, {label: '기한', value: x => x.deadline ? x.deadline.date : ''}, {label: '일시', key: 'when'}];

  // IME-safe inputs: update only the list, never rebuild the input while typing.
  root.addEventListener('input', e => {
    const t = e.composedPath()[0];
    if (t.id === 'qfilter') { S.filter.q = t.value; if (!e.isComposing) refreshQueue(); }
    else if (t.id === 'bq') { S.budget.q = t.value; }
    else if (t.id === 'weekly') { S.weekly = t.value; store.set('weekly', S.weekly); const w = $('#wkSaved'); if (w) { w.classList.add('on'); } }
    else if (t.id === 'palq') palRender(t.value);
  });
  root.addEventListener('compositionend', e => { const t = e.composedPath()[0]; if (t.id === 'qfilter') { S.filter.q = t.value; refreshQueue(); } });
  root.addEventListener('change', e => {
    const t = e.composedPath()[0];
    if (t.id === 'bproj' && t.value === '__custom') { S.budget.custom = true; renderMain(); }
    if (t.id === 'bproj' && t.value !== '__custom') { S.budget.custom = false; const [p, f] = t.value.split('|'); S.budget.project = p; S.budget.filter = f; loadBudget(); }
    if (t.id === 'bCatProj') { S.budget.project = t.value; S.budget.filter = ''; loadBudget(); }
    if (t.id === 'bq') renderMain();
    if (t.classList && t.classList.contains('setc')) saveSettingField(t);
    if (t.dataset && t.dataset.b) saveBudgetRows();
  });
  root.addEventListener('keyup', e => { const t = e.composedPath()[0]; if (t.id === 'bq' && !e.isComposing && e.key === 'Enter') renderMain(); });
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
  // Resizable pane.
  const split = $('#split');
  split.addEventListener('mousedown', e => {
    e.preventDefault(); split.classList.add('drag');
    const shield = document.createElement('div'); shield.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:col-resize'; document.body.append(shield);
    const move = ev => { S.settings.paneWidth = Math.max(360, Math.min(window.innerWidth * 0.75, window.innerWidth - ev.clientX)); applyLook(); };
    const up = () => { split.classList.remove('drag'); shield.remove(); document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true); saveLocal(); };
    document.addEventListener('mousemove', move, true); document.addEventListener('mouseup', up, true);
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

