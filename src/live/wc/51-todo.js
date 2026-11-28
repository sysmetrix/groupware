// GW 비서 · 내 할 일 (v1.17): 그룹웨어 개인 ToDo와 연동되는 할 일 관리.
// 진실의 원천은 그룹웨어 ToDo다(세 PC·모바일에서 같은 목록). 이 PC에는 화면을 빨리 그리기 위한 캐시만 둔다.
// 기한·중요는 ToDo 칸, 체크리스트는 하위 ToDo, 반복·예산·연결은 '내용' 끝의 GW 비서 정보 묶음(R.tdMetaCompose)에 담는다.
// 설계: docs/design/todo-budget-plan.md
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const TD = {list: null, at: '', busy: null, err: '', sel: '', filter: 'open', q: '', saving: false, seq: 0, lastLoad: 0, dirty: false, complete: true, notice: '', view: 'list', sort: 'smart', imp: 'all', doneSpan: 'month'};
  // 보기·정렬·중요도 거르기는 이 PC에 기억한다(그룹웨어 화면의 필터 기억과 같은 방식)
  try { const p = typeof store === 'object' ? store.get('tdPrefs', null) : null; if (p && typeof p === 'object') for (const k of ['view', 'sort', 'imp', 'doneSpan']) if (typeof p[k] === 'string') TD[k] = p[k]; } catch {}
  const todoPrefsSave = () => { try { store.set('tdPrefs', {view: TD.view, sort: TD.sort, imp: TD.imp, doneSpan: TD.doneSpan}); } catch {} };
  const todoGwOk = () => !!(typeof GW === 'object' && GW && typeof GW.todoList === 'function' && typeof R === 'object' && typeof R.tdFromGw === 'function');
  const todoIsGwId = id => /^td\d+$/.test(String(id || ''));
  // 예전 버전에서 이 PC에만 저장한 할 일(그룹웨어 ToDo로 옮기기 전)
  const todoLegacy = () => { try { const l = store.get('todosLegacy', null); return Array.isArray(l) ? l.filter(t => t && t.title && t.status !== 'done') : []; } catch { return []; } };
  (() => {
    try {
      if (typeof store !== 'object' || typeof S !== 'object') return;
      const cur = Array.isArray(S.todos) ? S.todos.filter(t => t && !todoIsGwId(t.id)) : [];
      if (cur.length && !store.get('todosLegacy', null)) store.set('todosLegacy', cur);
      const c = store.get('gwTodoCache', null);
      if (c && Array.isArray(c.items)) { TD.list = c.items; TD.at = c.at || ''; TD.cached = true; }
    } catch {}
  })();

  // GW 비서의 다른 화면(보드·달력·할 일 추가)은 S.todos 모양을 쓴다. 그룹웨어 ToDo를 그 모양으로 비춘다.
  function todoMirror() {
    if (!Array.isArray(TD.list)) return;
    // 그룹웨어에 연결되기 전에 이 PC에 넣은 할 일은 버리지 않고 '옮기기' 대상으로 모은다
    try { const local = (S.todos || []).filter(t => t && t.title && !todoIsGwId(t.id) && t.status !== 'done'); if (local.length) { const leg = todoLegacy(), ids = new Set(leg.map(x => x.id)); store.set('todosLegacy', [...leg, ...local.filter(x => !ids.has(x.id))]); } } catch {}
    S.todosGw = true;
    S.todos = TD.list.filter(t => !t.done || !t.doneDate || R.dday(t.doneDate) >= -35).map(t => ({id: t.id, title: t.title, due: t.due || '', status: t.done ? 'done' : 'todo', source: (t.meta && t.meta.src) || '그룹웨어 ToDo', url: (t.meta && t.meta.u) || '', key: (t.meta && t.meta.k) || '', at: Date.parse((t.created || '2000-01-01') + 'T00:00:00+09:00') || 0}));
  }
  const todoCacheSave = () => { try { store.set('gwTodoCache', {at: TD.at, items: (TD.list || []).filter(t => !t.done || (t.doneDate && R.dday(t.doneDate) >= -35)).slice(0, 250).map(t => ({...t, contents: ''}))}); } catch {} }; // 내용 원문은 빼고(메모·정보는 남김) 저장. 캐시 상태에서는 저장하기 전에 새로 읽는다
  function todoRerender() {
    try {
      if (typeof renderNav === 'function') renderNav();
      if (S.view === 'mytodo') { if (TD.sel) todoRefreshList(); else renderMain(); }
      else if (['board', 'calendar'].includes(S.view)) renderMain();
      else if (S.view === 'today' && S.todoSrc !== 'gw' && typeof refreshQueue === 'function') refreshQueue();
      else if (S.view === 'home' && typeof homePartialRefresh === 'function') homePartialRefresh();
      else if (S.view === 'budget' && S.budget && S.budget.budgetTab === 'plan') renderMain();
    } catch (e) { logError('todo.render', e.message); }
  }
  // force: 쓰기 직후처럼 반드시 새 목록이 필요할 때. 읽는 중이면 그 뒤에 한 번 더 읽는다(낡은 목록을 돌려주지 않게).
  // sweep: 반복 다음 회차 만들기. 브리핑·대화 같은 조회 경로는 false로 불러 쓰기를 하지 않는다.
  async function todoLoad({force = false, sweep = true} = {}) {
    if (!todoGwOk()) return;
    if (TD.busy) { if (!force) return TD.busy; if (!TD.next) TD.next = TD.busy.then(() => { TD.next = null; return todoLoad({force: true, sweep}); }); return TD.next; }
    if (!force && TD.lastLoad && Date.now() - TD.lastLoad < 20000) return;
    const owner = currentKey, seq = ++TD.seq;
    TD.busy = (async () => {
      try {
        const r = await GW.todoList();
        if (owner !== currentKey || seq !== TD.seq) return;
        TD.list = r.todos.filter(x => Number(x.todoLevel) <= 1).map(todoNorm);
        const ck = typeof R.contractCheckOnDemand === 'function' ? R.contractCheckOnDemand('todoList', r) : {ok: true};
        TD.at = r.at; TD.err = ''; TD.complete = r.complete !== false; TD.lastLoad = Date.now(); TD.cached = false; TD.notice = ck.ok ? '' : (typeof R.contractMessage === 'function' ? R.contractMessage(ck) : '');
        todoMirror(); todoCacheSave(); saveLocal();
        if (sweep && TD.complete) await todoRepeatSweep();
        todoAlertSweep();
      } catch (e) { if (owner === currentKey) { TD.err = String(e.message || e); logError('todo.load', TD.err); } }
      finally { TD.busy = null; todoRerender(); }
    })();
    return TD.busy;
  }
  const todoNorm = x => { const t = R.tdFromGw(x); if (!t.mine || t.project) { t.meta = {}; t.readonly = true; } return t; };
  const todoFind = id => (TD.list || []).find(t => t.id === id);
  const todoErr = e => { const m = String((e && e.message) || e || ''); return m.length > 120 ? m.slice(0, 120) + '…' : m; };
  const todoFail = (e, h) => (e && e.code === 'UNKNOWN' ? '통신 오류 또는 응답 지연으로 반영됐는지 확인하지 못했습니다. 새로 읽은 목록을 먼저 확인해 주세요.' : `${h}: ${todoErr(e)}`);
  const todoSubErr = async (e, h) => { if (e && e.code === 'UNKNOWN') await todoLoad({force: true}); toast(todoFail(e, h)); };
  const todoYmd = iso => String(iso || '').replace(/-/g, '');

  // 날짜 칸은 모든 화면이 함께 쓰는 날짜 고르기(57번 조각)를 쓴다. 값은 ISO, 버튼에는 날짜와 요일.
  function todoDateField(id, value, label, disabled = '') {
    return typeof dateField === 'function' ? dateField(id, value, label, {clear: true, empty: '날짜 없음', disabled: !!disabled, minOf: id === 'tdeDue' ? 'tdeStart' : '', maxOf: id === 'tdeStart' ? 'tdeDue' : ''}) : '';
  }

  // ---------- 쓰기(모두 그룹웨어 ToDo로) ----------
  // 만들기: 체크리스트는 하위 ToDo로 이어서 만든다. 결과를 그대로 돌려준다(하지 않은 일을 했다고 하지 않음).
  async function todoCreate({title, due = '', start = '', important = false, importance, dday = true, manHour = '', memo = '', meta = {}, checklist = [], files} = {}) {
    if (!todoGwOk()) return {ok: false, text: '그룹웨어 ToDo에 연결하지 못했습니다. 그룹웨어를 새로고침한 뒤 다시 시도하세요.'};
    const c = R.tdMetaCompose(memo, meta);
    if (!c.ok) return {ok: false, text: `메모와 정보가 너무 깁니다(${c.length}자, 1,500자까지).`};
    try {
      const r = await GW.todoCreate({title, due: todoYmd(due), start: todoYmd(start), contents: c.text, important, importance, dday, manHour, files});
      let subFail = 0, subUnk = 0;
      for (const s of checklist.filter(Boolean).slice(0, 30)) { try { await GW.todoCreate({title: s, parent: r.id}); } catch (e) { if (e && e.code === 'UNKNOWN') subUnk++; else subFail++; logError('todo.sub', e.message); } }
      await todoLoad({force: true});
      const subMsg = [subFail && `체크리스트 ${subFail}줄은 저장하지 못했습니다`, subUnk && `체크리스트 ${subUnk}줄은 반영 여부를 확인하지 못했습니다(목록에서 먼저 확인)`].filter(Boolean);
      return {ok: true, id: r.id, subFail, subUnk, text: subMsg.length ? `만들었지만 ${subMsg.join(', ')}.` : ''};
    } catch (e) { logError('todo.create', e.message); if (e && e.code === 'UNKNOWN') { todoLoad({force: true}); return {ok: false, uncertain: true, text: '저장 여부를 확인하지 못했습니다. 목록에서 확인한 뒤 편집기를 닫고 다시 시도하세요.'}; } return {ok: false, text: '할 일을 그룹웨어에 저장하지 못했습니다: ' + todoErr(e)}; }
  }
  // 고치기. 중요도·진행률은 그룹웨어 화면처럼 전용 호출로 따로 저장한다(첨부가 있는 ToDo·받은 ToDo도 된다).
  async function todoSave(id, {title, due, start, important, importance, rate, dday, manHour, memo, meta, files} = {}) {
    if (TD.cached || !TD.lastLoad) await todoLoad({force: true});
    const t = todoFind(id);
    if (!t) return {ok: false, text: '목록에서 이 할 일을 찾지 못했습니다. 새로 고친 뒤 다시 시도하세요.'};
    const impWant = importance !== undefined ? String(importance) : important !== undefined ? (important ? (t.imp !== '0' ? t.imp : '2') : '0') : undefined;
    const impChg = impWant !== undefined && impWant !== t.imp, rateChg = rate !== undefined && Number(rate) !== Number(t.rate);
    const bodyChg = !!files?.length || manHour !== undefined || [title, due, start, dday, memo, meta].some(v => v !== undefined) && (title !== undefined && title !== t.title || due !== undefined && due !== (t.due || '') || start !== undefined && start !== (t.start || '') || dday !== undefined && !!dday !== !!t.dday || memo !== undefined || meta !== undefined);
    if (t.readonly && (impChg || bodyChg)) return {ok: false, text: '다른 사람이 준 ToDo나 프로젝트 ToDo는 진행률·완료만 바꿀 수 있습니다. 나머지는 그룹웨어에서 고쳐 주세요.'};

    if (!bodyChg) {
      try {
        if (impChg) await GW.todoSetImportance(id, impWant);
        if (rateChg) await GW.todoSetProgress(id, Number(rate));
        if (impChg || rateChg) await todoLoad({force: true});
        return {ok: true};
      } catch (e) { logError('todo.save', e.message); await todoLoad({force: true}); return {ok: false, text: todoFail(e, '그룹웨어에 저장하지 못했습니다')}; }
    }
    if ((memo !== undefined || meta !== undefined) && t.broken) return {ok: false, text: '그룹웨어에서 GW 비서 정보 줄이 바뀌어 메모·반복·예산을 고칠 수 없습니다. 그룹웨어에서 내용 칸을 확인해 주세요.'};
    const patch = files?.length ? {files} : {};
    if (title !== undefined) patch.title = title;
    if (due !== undefined) patch.due = todoYmd(due);
    if (start !== undefined) patch.start = todoYmd(start);
    if (dday !== undefined) patch.dday = !!dday;
    if (manHour !== undefined) patch.manHour = manHour;
    if (impChg) patch.importance = impWant;
    if (memo !== undefined || meta !== undefined) {
      const c = R.tdMetaCompose(memo !== undefined ? memo : t.memo, meta !== undefined ? meta : t.meta);
      if (!c.ok) return {ok: false, text: `메모와 정보가 너무 깁니다(${c.length}자, 1,500자까지).`};
      patch.contents = c.text;
    }
    try { await GW.todoUpdate(id, patch, patch.contents !== undefined ? {base: t.contents} : {}); if (rateChg) await GW.todoSetProgress(id, Number(rate)); await todoLoad({force: true}); return {ok: true}; }
    catch (e) { logError('todo.save', e.message); await todoLoad({force: true}); return {ok: false, conflict: e && e.code === 'CONFLICT', text: e && e.code === 'CONFLICT' ? '그 사이 다른 PC나 모바일에서 이 할 일이 바뀌었습니다. 새로 읽은 내용을 확인하고 다시 고쳐 주세요.' : todoFail(e, '그룹웨어에 저장하지 못했습니다')}; }
  }
  async function todoToggle(id, done) {
    const t = todoFind(id);
    if (!t) return {ok: false, text: '목록에서 이 할 일을 찾지 못했습니다.'};
    if (!t.canProgress) return {ok: false, text: '이 ToDo는 그룹웨어에서 처리해 주세요(내가 담당자가 아닙니다).'};
    const want = done === undefined ? !t.done : !!done;
    t.done = want; t.rate = want ? 100 : 0; t.doneDate = want ? today() : ''; todoMirror(); todoRerender(); // 먼저 화면에 반영하고 그룹웨어 결과로 다시 맞춘다
    try {
      await GW.todoSetDone(id, want);
      await todoLoad({force: true});
      return {ok: true, done: want};
    } catch (e) { logError('todo.toggle', e.message); await todoLoad({force: true}); return {ok: false, text: todoFail(e, '완료 표시를 저장하지 못했습니다')}; }
  }
  async function todoRemove(id) {
    const t = todoFind(id);
    if (!t) return {ok: false, text: '목록에서 이 할 일을 찾지 못했습니다.'};
    try {
      await GW.todoDelete(id); // 상위를 지우면 그룹웨어가 하위(체크리스트)도 함께 지운다(2026-11-21 확인)
      if (TD.sel === id) { TD.sel = ''; TD.dirty = false; }
      await todoLoad({force: true});
      return {ok: true};
    } catch (e) { logError('todo.delete', e.message); await todoLoad({force: true}); return {ok: false, text: todoFail(e, '지우지 못했습니다')}; }
  }
  // 반복: 완료한 회차의 다음 회차를 만든다. 여러 탭·PC가 동시에 만들지 않게 잠그고, 만들기 직전에 목록을 다시 읽는다.
  async function todoSpawnNext(t, holidays) {
    const rp = t.meta && t.meta.rp;
    const base = t.due && t.due > today() ? t.due : today(); // 늦게 끝내도 지난 날짜 회차를 만들지 않는다
    const due = R.tdNextDue(rp, base, holidays);
    if (!due) return null;
    // 다른 PC와 동시에 만들지 않게 먼저 '만드는 중' 표시를 남기고 다시 읽어 내 표시인지 확인한다
    const claim = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
    await GW.todoUpdate(t.id, {contents: R.tdMetaCompose(t.memo, {...t.meta, nx: claim}).text}, {base: t.contents});
    const chk = await GW.todoDetail(t.id);
    if (R.tdMetaParse(chk.contents).meta.nx !== claim) return null;
    const meta = {...t.meta, nx: undefined, sid: t.meta.sid};
    if (meta.b) meta.b = {...meta.b, m: [], x: [], st: 'plan', d: due};
    const r = await GW.todoCreate({title: t.title, due: todoYmd(due), contents: R.tdMetaCompose(t.memo, meta).text, important: t.important});
    for (const c of (t.checklist || []).slice(0, 30)) await GW.todoCreate({title: c.title, parent: r.id}).catch(e => logError('todo.repeatSub', e.message));
    // 이전 회차에 다음 회차 번호를 적어 다시 만들지 않게 한다(완료 상태는 그대로)
    await GW.todoUpdate(t.id, {contents: R.tdMetaCompose(t.memo, {...t.meta, nx: r.id}).text}).catch(e => logError('todo.repeatMark', e.message));
    return r.id;
  }
  let todoRepeatRunning = false;
  async function todoRepeatSweep() {
    if (todoRepeatRunning || !TD.list || !R.tdRepeatDue(TD.list).length) return;
    if (!navigator.locks || typeof navigator.locks.request !== 'function') return;
    todoRepeatRunning = true;
    try {
      await navigator.locks.request('bwyfgw:todo-repeat:' + currentKey, {ifAvailable: true}, async lock => {
        if (!lock) return;
        const fr = await GW.todoList();
        if (fr.complete === false) return;
        const fresh = fr.todos.filter(x => Number(x.todoLevel) <= 1).map(todoNorm).filter(t => !t.readonly);
        const hol = (S.raw && S.raw.data && S.raw.data.schedule && S.raw.data.schedule.holidays) || [];
        let made = 0;
        for (const t of R.tdRepeatDue(fresh, new Date()).slice(0, 5)) { try { if (await todoSpawnNext(t, hol)) made++; } catch (e) { logError('todo.repeat', e.message); } }
        if (made) { const r = await GW.todoList(); TD.list = r.todos.filter(x => Number(x.todoLevel) <= 1).map(todoNorm); TD.at = r.at; todoMirror(); todoCacheSave(); TD.notice = `반복 할 일 ${made}건의 다음 회차를 만들었습니다.`; }
      });
    } catch (e) { logError('todo.repeatSweep', e.message); }
    finally { todoRepeatRunning = false; }
  }
  // 기한 알림: D-3·D-1·당일·지남을 하루 한 번. 바탕화면 알림은 설정의 '알림'을 켠 경우에만.
  function todoAlertSweep() {
    if (!TD.list) return;
    const alerts = R.tdAlerts(TD.list, new Date());
    const seen = store.get('tdAlertSeen', {}) || {};
    const t0 = today();
    for (const k of Object.keys(seen)) if (!k.endsWith(':' + t0)) delete seen[k];
    const fresh = alerts.filter(a => !seen[a.key]);
    if (!fresh.length) return;
    for (const a of fresh) seen[a.key] = 1;
    store.set('tdAlertSeen', seen);
    if (S.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('GW 비서 · 내 할 일 기한 ' + fresh.length + '건', {body: fresh.slice(0, 4).map(a => `[${a.label}] ${a.title}`).join('\n'), tag: 'bwyfgw-todo'}); } catch {}
    }
    const urgent = fresh.filter(a => a.stage === 'late' || a.stage === 'd0');
    if (urgent.length && typeof toast === 'function') toast(`내 할 일: ${urgent.map(a => a.label).filter((v, i, l) => l.indexOf(v) === i).join(', ')} ${urgent.length}건이 있습니다.`);
  }

  // ---------- 화면 ----------
  const TODO_FILTERS = [['open', '남은 일'], ['due', '오늘·지난 기한'], ['doing', '진행'], ['important', '중요도 있음'], ['mine-other', '받은 ToDo'], ['plan', '예산 계획'], ['repeat', '반복'], ['done', '끝낸 일'], ['all', '전체']];
  function todoFiltered() {
    const q = TD.q.trim().toLowerCase(), t0 = today();
    return (TD.list || []).filter(t => {
      if (q && !(`${t.title} ${t.memo} ${(t.meta && t.meta.b && t.meta.b.n) || ''} ${t.creatorName || ''} ${t.projectName || ''}`.toLowerCase().includes(q))) return false;
      if (TD.imp !== 'all' && t.imp !== TD.imp) return false;
      switch (TD.filter) {
        case 'open': return !t.done;
        case 'due': return !t.done && t.due && t.due <= t0;
        case 'doing': return R.tdState(t) === 'doing';
        case 'late': return R.tdState(t) === 'late';
        case 'todo': return R.tdState(t) === 'todo';
        case 'important': return !t.done && t.imp !== '0';
        case 'mine-other': return !t.done && t.readonly;
        case 'plan': return !!(t.meta && t.meta.b && t.meta.b.c);
        case 'repeat': return !t.done && !!(t.meta && t.meta.rp);
        case 'done': return R.tdDoneWithin(t, TD.doneSpan);
        default: return !t.done || R.tdDoneWithin(t, TD.doneSpan);
      }
    });
  }
  const todoDdayText = due => { const n = R.dday(due); return n === 0 ? '오늘' : n < 0 ? `${-n}일 지남` : `D-${n}`; };
  const todoMd = iso => iso ? iso.slice(5).replace('-', '/') : '';
  const todoPeriod = t => t.start && t.due && t.start !== t.due ? `${todoMd(t.start)}~${todoMd(t.due)}` : todoMd(t.due);
  const todoImpBadge = t => t.imp && t.imp !== '0' ? `<span class="td-imp-b td-imp-${esc(t.imp)}">${esc(R.tdImpLabel(t.imp))}</span>` : '';
  const todoProg = t => `<span class="td-prog" aria-label="진행률 ${Number(t.rate) || 0}%"><span class="td-bar"><i style="width:${Math.max(0, Math.min(100, Number(t.rate) || 0))}%"></i></span>${Number(t.rate) || 0}%</span>`;
  function todoRow(t) {
    const b = t.meta && t.meta.b, rp = t.meta && t.meta.rp, ln = (t.meta && t.meta.ln) || [];
    const cl = t.checklist || [], cd = cl.filter(c => c.done).length;
    const st = R.tdState(t), late = st === 'late';
    const sub = [
      t.due ? `<span class="${late ? 'td-late' : ''}">${esc(todoPeriod(t))} · ${esc(late ? '지연 ' + todoDdayText(t.due) : todoDdayText(t.due))}</span>` : '',
      st === 'doing' ? todoProg(t) : '',
      t.readonly ? `<span>${esc(t.creatorName || '다른 사람')}님이 준 ToDo${t.projectName ? ' · ' + esc(t.projectName) : ''}</span>` : '',
      rp ? `<span>${ic('refresh')}${esc(R.tdRepeatLabel(rp))}</span>` : '',
      cl.length ? `<span>체크 ${cd}/${cl.length}</span>` : '',
      b && b.c ? `<span>예산 ${esc(b.n || b.c)} ${won(b.a)}원${b.st === 'done' ? ' · 집행됨' : ''}</span>` : '',
      ln.length ? `<span>연결 ${ln.length}</span>` : '',
      t.files ? `<span>${ic('clip')}첨부 ${t.files}</span>` : '',
      t.replies ? `<span>댓글 ${t.replies}</span>` : '',
      t.memo ? `<span class="td-memo-snip">${esc(t.memo.split('\n')[0].slice(0, 40))}</span>` : '',
    ].filter(Boolean).join('');
    const chk = t.canProgress ? `<button class="td-chk" data-act="tdToggle" data-id="${esc(t.id)}" aria-pressed="${t.done}" aria-label="${esc(t.title)} ${t.done ? '끝냄 취소' : '끝냄으로 표시'}">${t.done ? ic('check') : ''}</button>` : `<span class="td-chk ro" aria-hidden="true">${t.done ? ic('check') : ''}</span>`;
    return `<div class="td-row ${t.done ? 'done' : ''} ${TD.sel === t.id ? 'sel' : ''}" role="listitem">${chk}<button class="td-main" data-act="tdSel" data-id="${esc(t.id)}"><span class="td-t">${todoImpBadge(t)}${esc(t.title)}</span>${sub ? `<span class="td-sub">${sub}</span>` : ''}</button></div>`;
  }
  function todoListHtml() {
    if (!TD.list) return TD.err ? `<div class="empty"><div class="ill">${ic('alert')}</div><b>그룹웨어 ToDo를 읽지 못했습니다</b>${esc(TD.err)}<div class="acts" style="justify-content:center"><button class="btn primary" data-act="tdReload">다시 읽기</button></div></div>` : `<div class="list">${'<div class="sk row"></div>'.repeat(4)}</div>`;
    const list = R.tdSortBy(todoFiltered(), TD.sort);
    if (TD.view === 'kanban' && typeof todoKanbanHtml === 'function') return todoKanbanHtml(list);
    if (TD.view === 'timeline' && typeof todoTimelineHtml === 'function') return todoTimelineHtml(list);
    if (!list.length) return `<div class="empty"><div class="ill">${ic('check')}</div><b>${TD.cached || TD.complete === false || TD.err ? '최신 전체 목록을 확인할 수 없습니다' : TD.filter === 'done' ? '끝낸 개인 할 일이 없습니다' : TD.q || TD.imp !== 'all' ? '찾는 개인 할 일이 없습니다' : '개인 할 일이 없습니다'}</b>${TD.filter === 'open' && !TD.q ? '위 입력칸에 쓰고 Enter를 누르면 그룹웨어 ToDo에 저장됩니다.' : ''}</div>`;
    if (TD.filter === 'done' || TD.sort !== 'smart') return `<div class="td-list" role="list">${list.slice(0, 100).map(todoRow).join('')}</div>`;
    const groups = R.TD_BUCKETS.map(([k, n]) => [k, n, list.filter(t => R.tdBucketOf(t) === k)]).filter(g => g[2].length);
    return groups.map(([k, n, g]) => `<section class="td-grp" aria-label="${esc(n)}"><h3 class="td-gh ${k === 'late' ? 'td-late' : ''}">${esc(n)} <span class="muted">${g.length}</span></h3><div class="td-list" role="list">${g.slice(0, 80).map(todoRow).join('')}</div></section>`).join('');
  }
  function todoRefreshList() { const el = $('#tdList'); if (el) el.innerHTML = todoListHtml(); const st = $('#tdStatus'); if (st) st.innerHTML = todoStatusHtml(); }
  function todoStatusHtml() {
    const parts = [];
    if (TD.busy) parts.push('<span class="spin"></span> 그룹웨어 ToDo를 읽는 중…');
    else if (TD.at) parts.push(`그룹웨어 ToDo ${esc(new Date(TD.at).toLocaleTimeString('ko-KR', {timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}))} 기준${TD.cached ? ' (지난번에 읽은 목록)' : ''}`);
    if (TD.err && TD.list) parts.push(`<span class="err">새로 읽지 못했습니다: ${esc(TD.err)}</span>`);
    if (!TD.complete) parts.push('<span class="err">그룹웨어가 목록 일부만 돌려줬습니다</span>');
    if (TD.notice) parts.push(esc(TD.notice));
    return parts.join(' · ');
  }
  function vMyTodo() {
    if (!TD.list && !TD.busy && !TD.err) todoLoad();
    const s = TD.list ? R.tdSummary(TD.list) : null;
    const legacy = todoLegacy();
    const wrapN = TD.list ? R.tdWrapUp(TD.list).length : 0;
    const sc = TD.list ? R.tdStateCounts(TD.list) : null;
    const filt = TODO_FILTERS.map(([k, n]) => { const c = !TD.list ? '' : k === 'open' ? s.total : k === 'due' ? s.late + s.today : k === 'doing' ? sc.doing : k === 'mine-other' ? TD.list.filter(t => !t.done && t.readonly).length : k === 'important' ? TD.list.filter(t => !t.done && t.imp !== '0').length : k === 'plan' ? TD.list.filter(t => t.meta && t.meta.b && t.meta.b.c && !t.done).length : k === 'repeat' ? TD.list.filter(t => !t.done && t.meta && t.meta.rp).length : ''; return `<button class="${TD.filter === k ? 'on' : ''}" aria-pressed="${TD.filter === k}" data-act="tdFilter" data-v="${k}">${esc(n)}${c !== '' ? ` <span class="c">${c}</span>` : ''}</button>`; }).join('');
    const stBar = sc ? `<div class="td-states" role="group" aria-label="상태별 할 일">${R.TD_STATES.map(([k, n]) => `<button class="td-st td-st-${k} ${TD.filter === k || (k === 'done' && TD.filter === 'done') ? 'on' : ''}" data-act="tdFilter" data-v="${k}" aria-pressed="${TD.filter === k}"><b>${k === 'done' ? TD.list.filter(t => R.tdDoneWithin(t, TD.doneSpan)).length : sc[k]}</b>${esc(n)}</button>`).join('')}</div>` : '';
    return `${pgh('할 일', s ? `${TD.cached || TD.complete === false || TD.err ? '조회된 ' : ''}미완료 ${s.total}건${s.late ? ` · 지난 기한 ${s.late}` : ''}${s.today ? ` · 오늘 ${s.today}` : ''}` : '', `<button class="btn sm ${wrapN ? '' : 'ghost'}" data-act="tdWrap">${ic('clock')}퇴근 전 마무리${wrapN ? ` ${wrapN}` : ''}</button><button class="btn sm" data-act="tdReload" aria-label="그룹웨어 ToDo 새로 읽기">${ic('refresh')}새로 읽기</button><button class="btn sm" data-act="openUrl" data-url="${esc(GW.links.route(GW.routes.schedule))}" data-title="그룹웨어 일정·ToDo">${ic('ext')}그룹웨어 ToDo</button>`)}
${typeof todoSrcSeg === 'function' ? `<div class="bar">${todoSrcSeg()}</div>` : ''}${stBar}
<div class="bar td-add"><label for="tdQuick" class="vh">새 할 일</label><input class="inp grow" id="tdQuick" placeholder="할 일을 쓰고 Enter (예: '11/28', '11/24~11/28', '!긴급')" title="날짜를 쓰지 않으면 오늘 시작·종료합니다. 끝에 '11/24~11/28'처럼 쓰면 기간, '!긴급'·'!즉시'·'!중요'를 넣으면 중요도가 됩니다." autocomplete="off">${todoDateField('tdQuickDue', today(), '기한')}<label for="tdQuickImp" class="vh">중요도</label><select class="inp" id="tdQuickImp" aria-label="중요도">${R.TD_IMPS.slice().reverse().map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select><button class="btn primary" data-act="tdAdd">${ic('plus')}추가</button><button class="btn" data-act="tdNew">자세히 쓰기</button><button class="btn" data-act="tdBulk">여러 개 추가</button></div>
${legacy.length ? `<div class="box warn td-legacy">이 PC에만 저장된 예전 할 일 ${legacy.length}건이 있습니다. 그룹웨어 ToDo로 옮기면 다른 PC와 모바일에서도 보입니다. <button class="btn sm primary" data-act="tdMigrate">그룹웨어 ToDo로 옮기기</button> <button class="btn sm ghost" data-act="tdMigrateSkip">옮기지 않고 지우기</button></div>` : ''}
<div class="bar td-tools"><div class="seg" role="group" aria-label="할 일 거르기">${filt}</div>${typeof todoViewSeg === 'function' ? todoViewSeg() : ''}<label class="td-sel">정렬 <select class="inp" id="tdSort">${R.TD_SORTS.map(([v, n]) => `<option value="${v}" ${TD.sort === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label><label class="td-sel">중요도 <select class="inp" id="tdImpF"><option value="all">모두</option>${R.TD_IMPS.map(([v, n]) => `<option value="${v}" ${TD.imp === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label><label class="td-sel">끝낸 일 <select class="inp" id="tdDoneSpan"><option value="week" ${TD.doneSpan === 'week' ? 'selected' : ''}>최근 1주</option><option value="month" ${TD.doneSpan === 'month' ? 'selected' : ''}>최근 1달</option><option value="all" ${TD.doneSpan === 'all' ? 'selected' : ''}>전체</option></select></label><label for="tdQ" class="vh">할 일 찾기</label><input class="inp" id="tdQ" placeholder="찾기(제목·메모·준 사람)" value="${esc(TD.q)}" style="width:180px"></div>
<p class="muted td-status" id="tdStatus" role="status">${todoStatusHtml()}</p>
<div class="td-wrap ${TD.sel ? 'with-ed' : ''}"><div id="tdList">${todoListHtml()}</div>${TD.sel ? `<aside class="td-ed" id="tdEd" aria-label="할 일 자세히">${todoEditorHtml()}</aside>` : ''}</div>`;
  }

  // ----- 편집기 -----
  const TODO_WD = ['일', '월', '화', '수', '목', '금', '토'];
  function todoBudgetOptions(cur) {
    const out = [];
    for (const p of (S.settings.budget || []).filter(x => x && x.project)) {
      const rows = typeof bpRows === 'function' ? bpRows(p.project, p.filter || '') : null;
      const se = rows ? rows.filter(r => r.level === '세') : [];
      for (const r of se) out.push({v: `${p.project}|${p.filter || ''}|${r.code}`, label: `${p.label || p.filter || p.project} · ${String(r.name).replace(/^[○●·\s]+/, '')}`, name: String(r.name).replace(/^[○●·\s]+/, '')});
    }
    if (cur && cur.c && !out.some(o => o.v === `${cur.p || ''}|${cur.h || ''}|${cur.c}`)) out.unshift({v: `${cur.p || ''}|${cur.h || ''}|${cur.c}`, label: `${cur.h || ''} · ${cur.n || cur.c}`, name: cur.n || cur.c});
    return out;
  }
  function todoLinkCandidates(q) {
    const s = String(q || '').trim().toLowerCase();
    const items = [];
    for (const x of (S.a && S.a.actions) || []) items.push({t: x.type || 'item', k: x.key, ti: String(x.title || '').slice(0, 80), u: x.url || '', sub: x.kind || ''});
    const sub = S.raw && S.raw.data && S.raw.data.approval && S.raw.data.approval.lists && S.raw.data.approval.lists.submitted;
    for (const d of (sub && sub.docs) || []) items.push({t: 'doc', k: 'sub:' + d.docId, ti: String(d.title || '').slice(0, 80), u: GW.links.doc(d, 'submitted'), no: d.docNo || '', sub: '내 상신 ' + (d.docNo || '')});
    // 받은 메일(처리할 일에 없는 메일도). 여는 것은 메일 읽기 화면이며, 안 읽은 메일은 열기 전에 묻는다(openItem).
    const ml = S.raw && S.raw.data && S.raw.data.mail;
    for (const m of [...((ml && ml.inbox && ml.inbox.records) || []), ...((ml && ml.otherUnseen) || [])]) if (m && m.uid) items.push({t: 'mail', k: `mail:${m.box || 'INBOX'}:${m.uid}`, ti: String(m.subject || '(제목 없음)').slice(0, 80), mb: m.box || 'INBOX', uid: String(m.uid), sub: '메일 · ' + String(m.from || '').slice(0, 20)});
    const seen = new Set();
    return items.filter(i => i.ti && !seen.has(i.k) && seen.add(i.k) && (!s || `${i.ti} ${i.no || ''} ${i.sub || ''}`.toLowerCase().includes(s))).slice(0, 10);
  }
  function todoFilesHint(t) {
    const names = (TD.edFiles || []).map(f => f.name).join(', ');
    return esc((t?.files ? '기존 첨부 ' + t.files + '개를 유지합니다. ' : '') + (names ? '추가 예정: ' + names : '여러 파일을 선택할 수 있습니다.') + ' 저장할 때 업로드합니다.');
  }
  function todoEditorHtml() {
    const isNew = TD.sel === 'new';
    const t = isNew ? (TD.draft || {title: '', due: '', important: false, memo: '', meta: {}, checklist: []}) : todoFind(TD.sel);
    if (!t) return `<p class="muted">이 할 일은 목록에 없습니다(다른 곳에서 지웠을 수 있습니다).</p><button class="btn" data-act="tdClose">닫기</button>`;
    if (!isNew && t.readonly && typeof todoEditorReadonlyHtml === 'function') return todoEditorReadonlyHtml(t);
    const meta = t.meta || {}, rp = meta.rp || null, b = meta.b || null, ln = meta.ln || [];
    const repV = !rp ? '' : rp.f === 'm' && rp.md === -1 ? 'me' : rp.f;
    const opts = todoBudgetOptions(b);

    const bv = b && b.c ? (opts.find(o => o.v === `${b.p || ''}|${b.h || ''}|${b.c}`) || {}).v || '' : '';
    return `<div class="td-ed-h"><h2>${isNew ? '새 할 일' : '할 일 자세히'}</h2><div class="acts"><button class="btn sm primary" data-act="tdSave" ${TD.saving ? 'disabled' : ''}>${TD.saving ? '저장 중…' : '저장'}</button><button class="btn sm ghost" data-act="tdClose" aria-label="닫기">${ic('x')}닫기</button></div></div>
<label class="td-f">제목<input class="inp" id="tdeTitle" value="${esc(t.title)}" maxlength="100" autocomplete="off"></label>
${!isNew && typeof todoEditorInfoHtml === 'function' ? todoEditorInfoHtml(t) : ''}
<div class="td-f2"><div class="td-f">시작일${todoDateField('tdeStart', t.start || t.due || '', '시작일')}</div><div class="td-f">기한(종료일)${todoDateField('tdeDue', t.due || '', '기한(종료일)')}</div></div>
<div class="td-f2"><label class="td-f">중요도<select class="inp" id="tdeImp">${R.TD_IMPS.slice().reverse().map(([v, n]) => `<option value="${v}" ${(t.imp || (t.important ? '2' : '0')) === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>${isNew ? '' : `<label class="td-f">진행률 <b id="tdeRateV">${Number(t.rate) || 0}%</b><input class="td-range" type="range" id="tdeRate" min="0" max="100" step="10" value="${Number(t.rate) || 0}"></label>`}</div>
<label class="chk td-dd"><input type="checkbox" id="tdeDday" ${(isNew ? t.dday !== false : t.dday) ? 'checked' : ''}> 그룹웨어 첫 화면 D-day에 보이기</label>
<details class="td-more" ${rp ? 'open' : ''}><summary>반복 설정</summary><label class="td-f">반복<select class="inp" id="tdeRep"><option value="">반복 안 함</option><option value="wd" ${repV === 'wd' ? 'selected' : ''}>평일 매일</option><option value="w" ${repV === 'w' ? 'selected' : ''}>매주 요일</option><option value="m" ${repV === 'm' ? 'selected' : ''}>매월 날짜</option><option value="me" ${repV === 'me' ? 'selected' : ''}>매월 말일</option></select></label>
<div class="td-rep-w" id="tdeRepW" ${repV === 'w' ? '' : 'hidden'} role="group" aria-label="반복 요일">${[1, 2, 3, 4, 5, 6, 0].map(n => `<label class="chk"><input type="checkbox" id="tdeW${n}" ${rp && rp.f === 'w' && (rp.wd || []).includes(n) ? 'checked' : ''}> ${TODO_WD[n]}</label>`).join('')}</div>
<label class="td-f" id="tdeRepM" ${repV === 'm' ? '' : 'hidden'}>매월 며칠<input class="inp" type="number" id="tdeMd" min="1" max="31" value="${rp && rp.f === 'm' && rp.md > 0 ? rp.md : ''}"></label>
<p class="muted td-hint">반복 할 일은 끝냄으로 표시하면 다음 회차가 그룹웨어 ToDo에 생깁니다. 주말·휴일이면 앞 평일로 당깁니다.</p></details>
<label class="td-f">투입공수 (시간)<input class="inp" id="tdeHours" inputmode="decimal" placeholder="예: 1.5" value="${esc(isNew ? '' : TD.hours?.id === t.id ? TD.hours.value : '')}" ${!isNew && TD.hours?.id !== t.id ? 'disabled' : ''}></label>
<label class="td-f">메모<textarea class="inp td-memo" id="tdeMemo" rows="4">${esc(t.memo || '')}</textarea></label>
<div class="td-sec"><h3>첨부파일</h3><label class="td-f">추가할 파일<input class="inp" type="file" multiple id="tdeFiles" ${TD.saving ? 'disabled' : ''}></label><p class="muted td-hint" id="tdeFilesHint" aria-live="polite">${todoFilesHint(t)}</p></div>
<div class="td-sec" id="tdeCl">${todoChecklistHtml(t, isNew)}</div>
<details class="td-sec td-more" ${b && b.c ? 'open' : ''}><summary>예산 연결</summary>${opts.length ? `<label class="td-f">사업·세목<select class="inp" id="tdeBud"><option value="">연결 안 함</option>${opts.map(o => `<option value="${esc(o.v)}" ${o.v === bv ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label><div class="td-f2"><label class="td-f">집행 예정 금액(원)<input class="inp" id="tdeAmt" inputmode="numeric" value="${b && b.a ? won(b.a) : ''}" placeholder="예: 300,000"></label><div class="td-f">집행 예정일${todoDateField('tdeBudDate', (b && b.d) || '', '집행 예정일')}</div></div>${b && b.pd ? `<p class="muted">근거 계획서 ${esc(b.pd)}${b.pt ? ' · ' + esc(String(b.pt).slice(0, 40)) : ''}</p>` : ''}${b && Array.isArray(b.m) && b.m.length ? `<p class="muted">짝지은 결의 ${b.m.length}건 · ${won(b.m.reduce((s, x) => s + (Number(x.a) || 0), 0))}원${b.st === 'done' ? ' · 집행됨' : ''}</p>` : ''}<p class="muted td-hint">금액을 넣으면 예산 집행 화면의 '집행 계획' 예상 집행률에 더해집니다.</p>` : `<p class="muted">예산 집행 화면에서 내 관심 사업을 저장하면 여기서 세목을 고를 수 있습니다. ${(S.settings.budget || []).length ? '<span class="spin"></span> 세목을 불러오는 중…' : ''}</p>`}</details>
<details class="td-sec td-more" ${ln.length ? 'open' : ''}><summary>문서·메일 연결</summary><div id="tdeLn">${todoLinksHtml(t)}</div></details>${!isNew && typeof todoCommentsHtml === 'function' ? todoCommentsHtml(t) : ''}
<div class="acts td-ed-acts">${isNew ? '' : `<button class="btn" data-act="tdToggle" data-id="${esc(t.id)}">${t.done ? '끝냄 취소' : '끝냄'}</button><button class="btn" data-act="openUrl" data-url="${esc(GW.todoLink ? GW.todoLink(t.id) : '')}" data-title="그룹웨어 ToDo">${ic('ext')}그룹웨어에서 보기</button><button class="btn" data-act="tdCopyLink" data-id="${esc(t.id)}">링크 복사</button><button class="btn danger" data-act="tdDel" data-id="${esc(t.id)}">지우기</button>`}</div>
<p class="muted td-hint">그룹웨어 개인 ToDo에 저장됩니다(나만 보임). 기한을 넣으면 그룹웨어 일정 화면에도 '종일'로 보입니다.</p>`;
  }
  function todoChecklistHtml(t, isNew) {
    const cl = isNew ? ((t && t.checklist) || []).map((c, i) => ({id: 'n' + i, title: c, done: false})) : ((t && t.checklist) || []);
    return `<h3>체크리스트 <span class="muted">${cl.filter(c => c.done).length}/${cl.length}</span></h3>${cl.map(c => `<div class="td-cl ${c.done ? 'done' : ''}"><label class="chk"><input type="checkbox" data-act="tdSubToggle" data-id="${esc(c.id)}" ${c.done ? 'checked' : ''} ${isNew ? 'disabled' : ''}> ${esc(c.title)}</label><button class="btn sm ghost" data-act="tdSubDel" data-id="${esc(c.id)}" aria-label="${esc(c.title)} 지우기">${ic('x')}</button></div>`).join('')}<div class="bar"><label for="tdeSub" class="vh">체크리스트 추가</label><input class="inp grow" id="tdeSub" placeholder="세부 단계를 쓰고 Enter" autocomplete="off"><button class="btn sm" data-act="tdSubAdd">추가</button></div>`;
  }
  function todoLinksHtml(t) {
    const m = (TD.sel !== 'new' && TD.edMeta) || (t && t.meta) || {}, ln = m.ln || [], lq = TD.linkQ || '';
    return `<h3>연결한 문서·메일</h3>${ln.map((l, i) => `<div class="td-ln"><button class="btn sm ghost" data-act="tdLinkOpen" data-i="${i}">${ic(l.t === 'mail' ? 'mail' : 'doc')}${esc(l.no ? l.no + ' ' : '')}${esc(l.ti || '(제목 없음)')}</button><button class="btn sm ghost" data-act="tdLinkDel" data-i="${i}" aria-label="연결 끊기">${ic('x')}</button></div>`).join('') || '<p class="muted">없음</p>'}<div class="bar"><label for="tdeLinkQ" class="vh">연결할 문서 찾기</label><input class="inp grow" id="tdeLinkQ" placeholder="처리할 일·내 상신문서·받은 메일 제목으로 찾기" value="${esc(lq)}" autocomplete="off"><button class="btn sm" data-act="tdLinkFind">찾기</button></div>${TD.linkOpen ? `<div class="td-lc">${todoLinkCandidates(lq).map((c, i) => `<button class="btn sm ghost" data-act="tdLinkAdd" data-i="${i}">${esc(c.sub ? c.sub + ' · ' : '')}${esc(c.ti)}</button>`).join('') || '<p class="muted">찾은 항목이 없습니다.</p>'}</div>` : ''}`;
  }
  // 체크리스트·연결 칸만 다시 그린다(고치던 제목·메모는 그대로)
  function todoRefreshSections() {
    const isNew = TD.sel === 'new', t = isNew ? TD.draft : todoFind(TD.sel);
    const a = $('#tdeCl'); if (a) a.innerHTML = todoChecklistHtml(t, isNew);
    const b = $('#tdeLn'); if (b) b.innerHTML = todoLinksHtml(t);
  }
  const todoDirtyField = id => /^tde/.test(id || '') && !/^(tdeSub|tdeLinkQ|tdeBulk)$/.test(id);
  // 편집기 값 → 저장할 값. 잘못된 값은 {err}
  function todoReadEditor() {
    const v = id => (($('#' + id) || {}).value || '').trim();
    const title = v('tdeTitle');
    if (!title) return {err: '제목을 입력하세요.'};
    const due = v('tdeDue');
    const repV = v('tdeRep');
    let rp = null;
    if (repV === 'wd') rp = {f: 'wd'};
    else if (repV === 'w') { const wd = [0, 1, 2, 3, 4, 5, 6].filter(n => ($('#tdeW' + n) || {}).checked); if (!wd.length) return {err: '반복할 요일을 고르세요.'}; rp = {f: 'w', wd}; }
    else if (repV === 'm') { const md = Number(v('tdeMd')); if (!Number.isInteger(md) || md < 1 || md > 31) return {err: '매월 며칠인지 1~31로 입력하세요.'}; rp = {f: 'm', md}; }
    else if (repV === 'me') rp = {f: 'm', md: -1};
    if (rp && !due) return {err: '반복 할 일은 첫 기한을 넣어 주세요.'};
    const cur = TD.sel === 'new' ? (TD.draft || {meta: {}}) : todoFind(TD.sel);
    const meta = {...((TD.sel !== 'new' && TD.edMeta) || (cur && cur.meta) || {})};
    meta.rp = rp || undefined;
    if (rp && !meta.sid) meta.sid = 's' + Date.now().toString(36);
    if (rp) meta.stop = undefined;
    else if (meta.sid) meta.stop = 1; // 반복을 끄면 묶음 번호는 두고 멈춤 표시(예전 회차에서 다시 만들어지지 않게)
    const bud = v('tdeBud');
    if ($('#tdeBud')) {
      if (bud) {
        const [p, h, c] = bud.split('|');
        const amt = Number(v('tdeAmt').replace(/[^0-9]/g, ''));
        if (!amt) return {err: '집행 예정 금액을 입력하세요.'};
        const opt = todoBudgetOptions(meta.b).find(o => o.v === bud);
        const old = meta.b && meta.b.c === c ? meta.b : {};
        meta.b = {...old, p, h, c, n: (opt && opt.name) || old.n || c, a: amt, d: v('tdeBudDate') || due || '', st: old.st || 'plan'};
      } else meta.b = undefined;
    }
    let start = v('tdeStart');
    if (start && !due) return {err: '시작일을 넣으면 기한(종료일)도 넣어 주세요.'};
    if (start && start > due) return {err: '시작일이 기한보다 뒤입니다.'};
    if (!start) start = due;
    const out = {title, due, start, importance: v('tdeImp') || '0', dday: !!($('#tdeDday') || {}).checked && !!due, memo: (($('#tdeMemo') || {}).value || '').replace(/\s+$/, ''), meta};
    if ($('#tdeHours') && !$('#tdeHours').disabled) { const hours = v('tdeHours'); if (hours && !/^\d{1,10}(?:\.\d{1,2})?$/.test(hours)) return {err: '투입공수는 0 이상의 숫자로 소수 둘째 자리까지 입력하세요.'}; out.manHour = hours && Number(hours) ? hours : ''; }
    if (TD.edFiles?.length) out.files = TD.edFiles;
    if ($('#tdeRate')) out.rate = Number(v('tdeRate')) || 0;
    return out;
  }
  // 있던 할 일을 고칠 때는 바뀐 칸만 보낸다(첨부가 있는 ToDo도 중요도·진행률은 저장되게)
  function todoEditorDiff(t, f) {
    const out = {};
    if (f.files?.length) out.files = f.files;
    if (f.title !== t.title) out.title = f.title;
    if (f.due !== (t.due || '')) out.due = f.due;
    if (f.start !== (t.start || t.due || '')) out.start = f.start;
    if (!!f.dday !== !!t.dday) out.dday = f.dday;
    if (f.importance !== (t.imp || '0')) out.importance = f.importance;
    if (f.rate !== undefined && f.rate !== Number(t.rate || 0)) out.rate = f.rate;
    if (f.manHour !== undefined && TD.hours?.id === t.id && Number(f.manHour || 0) !== Number(TD.hours.value || 0)) out.manHour = f.manHour;
    const clean = m => JSON.stringify(Object.fromEntries(Object.entries(m || {}).filter(([, x]) => x !== undefined && x !== null && x !== '' && !(Array.isArray(x) && !x.length)).sort(([a], [b]) => a.localeCompare(b))));
    if (f.memo !== (t.memo || '') || clean(f.meta) !== clean(t.meta)) { out.memo = f.memo; out.meta = f.meta; }
    return out;
  }
  async function todoSaveEditor() {
    if (TD.saving) return;
    if (TD.uncertain) { toast('저장 여부를 목록에서 먼저 확인한 뒤 편집기를 닫아 주세요.'); return; }
    const f = todoReadEditor();
    if (f.err) { toast(f.err); return; }
    TD.saving = true; TD.dirty = true; const saveButton = root.querySelector('#tdEd [data-act="tdSave"]'); if (saveButton) { saveButton.disabled = true; saveButton.textContent = '저장 중…'; }
    const picker = $('#tdeFiles'); if (picker) picker.disabled = true;
    const editor = $('#tdEd'); if (editor) editor.inert = true;
    let r;
    if (TD.sel === 'new') { r = await todoCreate({...f, checklist: (TD.draft && TD.draft.checklist) || []}); if (r.ok) { TD.sel = r.id; TD.draft = null; } }
    else { const t = todoFind(TD.sel), base = TD.editBase; const changed = !t || !base || ['title','due','start','contents','imp','rate','dday','files'].some(k => (t[k] ?? '') !== (base[k] ?? '')); if (changed) r = {ok: false, text: '다른 곳에서 할 일이 바뀌었습니다. 입력 내용을 확인한 뒤 닫고 다시 열어 주세요.'}; else { const d = todoEditorDiff(base, f); r = Object.keys(d).length ? await todoSave(TD.sel, d) : {ok: true, text: '바뀐 내용이 없습니다.'}; } }
    if (editor) editor.inert = false;
    TD.saving = false; TD.dirty = !r.ok; TD.uncertain = !!r.uncertain; if (r.ok) { TD.edMeta = null; TD.edFiles = null; }
    if (r.ok) { toast(r.text || '그룹웨어 ToDo에 저장했습니다.'); }
    else { if (picker) picker.disabled = false; toast(r.text); }
    if (S.view === 'mytodo') { if (r.ok) renderMain(); else if (saveButton) { saveButton.disabled = false; saveButton.textContent = '저장'; } }
  }
  function todoRerenderEditor() { const ed = $('#tdEd'); if (ed) ed.innerHTML = todoEditorHtml(); }
  function todoOpen(id) {
    if (TD.saving || (TD.sel === id && TD.dirty)) return;
    if (TD.dirty && TD.sel && TD.sel !== id && !confirm('고치던 내용이 저장되지 않았습니다. 버리고 다른 할 일을 열까요?')) return;
    TD.sel = id; TD.uncertain = false; TD.editBase = id === 'new' ? null : {...todoFind(id)}; TD.edFiles = null; TD.dirty = false; TD.linkOpen = false; TD.linkQ = ''; TD.edMeta = null; TD.hours = null;
    if (id !== 'new' && todoGwOk()) GW.todoDetail(id).then(d => { if (TD.sel !== id) return; TD.hours = {id, value: String(d.manHour ?? '')}; const el = $('#tdeHours'); if (el && !el.dataset.changed) { el.value = TD.hours.value; el.disabled = false; } }).catch(() => { if (TD.sel === id) toast('투입공수를 불러오지 못했습니다. 다른 내용은 그대로 확인할 수 있습니다.'); });
    if (typeof bpEnsurePinnedRows === 'function') bpEnsurePinnedRows().then(() => { if (S.view === 'mytodo' && TD.sel && !TD.dirty) todoRerenderEditor(); });
    if (S.view !== 'mytodo') go('mytodo'); else renderMain();
    setTimeout(() => { const i = $('#tdeTitle'); if (i && id === 'new') i.focus(); }, 30);
  }
  // 빠른 추가: 끝에 붙은 날짜 말("금요일", "다음주 월요일", "11/28", "내일")을 기한으로 읽는다
  // 빠른 추가: 끝에 붙은 날짜 말(기한)·기간(11/24~11/28)·중요도(!긴급)를 읽는다(todo-plan.mjs tdParseQuick)
  function todoSplitQuick(text) { return R.tdParseQuick(text); }
  async function todoQuickAdd() {
    const i = $('#tdQuick'); if (!i || TD.adding) return;
    const raw = i.value.trim();
    if (!raw) { i.focus(); toast('할 일을 입력하세요.'); return; }
    const sp = todoSplitQuick(raw);
    const picked = ($('#tdQuickDue') || {}).value || '';
    const due = ($('#tdQuickDue') || {}).dataset?.userSet ? picked : sp.due || today();
    const start = sp.due === due && sp.start ? sp.start : due;
    const sel = ($('#tdQuickImp') || {}).value || '0', importance = sel !== '0' ? sel : sp.imp || '0';
    i.disabled = true; TD.adding = true;
    const r = await todoCreate({title: sp.title, due, start, importance}).finally(() => { TD.adding = false; });
    const i2 = $('#tdQuick'); if (i2) i2.disabled = false;
    if (r.ok) { const q = $('#tdQuick'); if (q) q.value = ''; const d = $('#tdQuickDue'); if (d) { d.value = today(); delete d.dataset.userSet; if (typeof dateFieldSync === 'function') dateFieldSync('tdQuickDue'); } const c = $('#tdQuickImp'); if (c) c.value = '0'; toast(`그룹웨어 ToDo에 추가했습니다${due ? ` (${sp.start && due === sp.due && sp.start !== due ? '기간 ' + todoMd(sp.start) + '~' : '기한 '}${todoMd(due)})` : ''}${importance !== '0' ? ' · ' + R.tdImpLabel(importance) : ''}.`); }
    else toast(r.text);
    setTimeout(() => $('#tdQuick')?.focus(), 30);
  }
  // 다른 화면의 "할 일로" 버튼과 대화 도구가 부르는 공용 추가(예전 addTodo 대신). 결과 객체를 돌려준다.
  async function todoAddFrom({title, due = '', source = '', url = '', key = '', link = null} = {}) {
    if (!todoGwOk()) return {ok: false, text: '그룹웨어 ToDo에 연결하지 못했습니다.'};
    if (!TD.list) await todoLoad({force: true});
    if (key && (TD.list || []).some(t => !t.done && t.meta && t.meta.k === key)) return {ok: true, dup: true, text: '이미 내 할 일에 있습니다.'};
    const meta = {src: source || undefined, u: url || undefined, k: key || undefined, ln: link ? [link] : undefined};
    return todoCreate({title: String(title || '').slice(0, 100), due, meta});
  }
  // 그룹웨어 처리 건수와 따로 보여 줄 개인 ToDo(오늘까지).
  function todoNavDue() { try { return TD.list ? R.tdWrapUp(TD.list).filter(t => !t.readonly) : []; } catch { return []; } }


  async function todoBriefLines(kind) {
    if (!todoGwOk()) return null;
    if (!TD.list || Date.now() - TD.lastLoad > 5 * 60000) await todoLoad({force: true, sweep: false});
    if (!TD.list) return {lines: ['• 내 할 일은 그룹웨어 ToDo를 읽지 못해 확인할 수 없습니다'], card: null};
    const s = R.tdSummary(TD.list), lines = [];
    if (kind === 'evening') {
      const w = R.tdWrapUp(TD.list);
      lines.push(w.length ? `• 오늘까지인데 끝내지 않은 내 할 일 ${w.length}건` : '• 오늘까지 남은 내 할 일이 없습니다');
      return {lines, card: w.length ? {type: 'nav', label: '퇴근 전 마무리 열기', view: 'mytodo', v: 'wrap'} : null};
    }
    if (kind === 'week') { lines.push(`• 7일 안에 기한인 내 할 일 ${s.today + s.tomorrow + s.week}건${s.late ? `, 지난 기한 ${s.late}건` : ''}`); return {lines, card: null}; }
    lines.push(s.total ? `• 내 할 일 ${s.total}건: 오늘 마감 ${s.today}건, 지난 기한 ${s.late}건, 중요 ${s.important}건` : '• 내 할 일이 없습니다');
    const top = R.tdSort(TD.list.filter(t => !t.done && ((t.due && t.due <= today()) || t.important))).slice(0, 4);
    return {lines, card: top.length ? {type: 'nav', label: `내 할 일 보기 (오늘까지 ${s.today + s.late}건 · 중요 ${s.important}건)`, view: 'mytodo'} : null};
  }

  // 주간 실적 초안에 넣을 '처리한 할 일' 줄(마지막으로 읽은 목록 기준)
  function todoWeeklyFor(from, to) { try { return TD.list ? R.tdWeeklyLines(TD.list, from, to) : []; } catch { return []; } }

  // 편집 중 전체 화면을 다시 그리는 조작은 입력값을 지울 수 있으므로 먼저 저장하거나 닫게 한다.
  function todoCanChangeView() {
    if (!TD.dirty) return true;
    toast('편집 중인 할 일을 저장하거나 닫은 뒤 보기를 바꿔 주세요.');
    return false;
  }
  // ---------- 처리기 ----------
  HOME_ACTS.tdReload = () => todoLoad({force: true});
  HOME_ACTS.tdFilter = (el, v) => { if (!todoCanChangeView()) return; if (TODO_FILTERS.some(f => f[0] === v) || R.TD_STATES.some(f => f[0] === v)) { TD.filter = v; renderMain(); root.querySelector(`[data-act="tdFilter"][data-v="${v}"]`)?.focus(); } };
  HOME_ACTS.tdAdd = () => todoQuickAdd();
  HOME_ACTS.tdNew = () => { const q = ($('#tdQuick') || {}).value || ''; const sp = todoSplitQuick(q); const sel = ($('#tdQuickImp') || {}).value || '0'; const picked = ($('#tdQuickDue') || {}).value || ''; const due = ($('#tdQuickDue') || {}).dataset?.userSet ? picked : sp.due || today(); TD.draft = {title: sp.title, due, start: sp.due === due && sp.start ? sp.start : due, imp: sel !== '0' ? sel : sp.imp || '0', memo: '', meta: {}, checklist: []}; todoOpen('new'); };
  HOME_ACTS.tdSel = (el) => todoOpen(el.dataset.id);
  HOME_ACTS.tdClose = () => { if (TD.saving) return; if (TD.dirty && !confirm('고치던 내용이 저장되지 않았습니다. 닫을까요?')) return; TD.sel = ''; TD.edFiles = null; TD.dirty = false; TD.draft = null; TD.edMeta = null; renderMain(); };
  HOME_ACTS.tdSave = () => todoSaveEditor();
  HOME_ACTS.tdToggle = async el => {
    const id = el.dataset.id, t = todoFind(id); if (!t) return;
    const r = await todoToggle(id);
    if (!r.ok) { toast(r.text); return; }
    if (r.done && t.meta && t.meta.rp) toast(`끝냄으로 표시했습니다. 다음 회차(${R.tdRepeatLabel(t.meta.rp)})를 만듭니다.`);
    else toast(r.done ? '끝냄으로 표시했습니다(그룹웨어 ToDo 완료).' : '끝냄을 취소했습니다.');
  };
  // 지우기 확인은 화면 안의 창으로 받는다(그 버튼을 누른 동작으로 지우기가 허용된다)
  HOME_ACTS.tdDel = el => {
    const t = todoFind(el.dataset.id); if (!t) return;
    if (t.readonly) { toast('다른 사람이 준 ToDo는 그룹웨어에서 처리해 주세요.'); return; }
    closeOverlay(); S.paletteOpen = true;
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" role="dialog" aria-label="할 일 지우기" style="width:min(460px,94vw)"><h2 style="margin-top:0">할 일 지우기</h2><p>“${esc(t.title)}”을(를) 그룹웨어 ToDo에서 지웁니다.${(t.checklist || []).length ? ` 체크리스트 ${t.checklist.length}줄도 함께 지워집니다.` : ''}${t.meta && t.meta.b && t.meta.b.c ? ' 예산 집행 계획에서도 빠집니다.' : ''}</p><div class="acts" style="justify-content:flex-end"><button class="btn" data-act="closeOverlay">취소</button><button class="btn danger" data-act="tdDelYes" data-id="${esc(t.id)}">지우기</button></div></div></div>`;
    setTimeout(() => $('#overlay [data-act="tdDelYes"]')?.focus(), 30);
  };
  HOME_ACTS.tdDelYes = async el => {
    const id = el.dataset.id; el.disabled = true;
    const mark = typeof overlayMark === 'function' ? overlayMark() : 0;
    const r = await todoRemove(id);
    if (typeof overlayLive !== 'function' || overlayLive(mark)) closeOverlay();
    toast(r.ok ? '지웠습니다.' : r.text);
  };
  HOME_ACTS.tdSubAdd = async () => {
    const i = $('#tdeSub'); const v = i ? i.value.trim() : '';
    if (!v) { i?.focus(); return; }
    if (TD.sel === 'new') { TD.draft = {...(TD.draft || {meta: {}}), ...todoDraftFromEditor(), checklist: [...((TD.draft && TD.draft.checklist) || []), v]}; todoRefreshSections(); $('#tdeSub')?.focus(); return; }
    i.disabled = true;
    try { await GW.todoCreate({title: v, parent: TD.sel}); await todoLoad({force: true}); }
    catch (e) { await todoSubErr(e, '체크리스트를 저장하지 못했습니다'); }
    todoRefreshSections();
    $('#tdeSub')?.focus();
  };
  // 새 할 일을 쓰는 중 체크리스트를 더할 때 입력한 값을 잃지 않게 보관한다
  function todoDraftFromEditor() { const v = id => (($('#' + id) || {}).value || ''); return {title: v('tdeTitle'), due: v('tdeDue'), start: v('tdeStart'), imp: v('tdeImp') || '0', dday: !!($('#tdeDday') || {}).checked, memo: v('tdeMemo')}; }
  HOME_ACTS.tdSubToggle = async el => {
    const id = el.dataset.id; if (!todoIsGwId(id)) return;
    const parent = todoFind(TD.sel), c = parent && (parent.checklist || []).find(x => x.id === id); if (!c) return;
    try { await GW.todoSetDone(id, !c.done); await todoLoad({force: true}); } catch (e) { await todoSubErr(e, '체크 표시를 저장하지 못했습니다'); }
    todoRefreshSections();
  };
  HOME_ACTS.tdSubDel = async el => {
    const id = el.dataset.id;
    if (TD.sel === 'new') { const i = Number(id.slice(1)); TD.draft = {...(TD.draft || {}), ...todoDraftFromEditor(), checklist: ((TD.draft && TD.draft.checklist) || []).filter((_, k) => k !== i)}; todoRefreshSections(); return; }
    if (!todoIsGwId(id)) return;
    try { await GW.todoDelete(id); await todoLoad({force: true}); } catch (e) { await todoSubErr(e, '지우지 못했습니다'); }
    todoRefreshSections();
  };
  HOME_ACTS.tdLinkFind = () => { TD.linkQ = ($('#tdeLinkQ') || {}).value || ''; TD.linkOpen = true; todoRefreshSections(); const q = $('#tdeLinkQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } };
  HOME_ACTS.tdLinkAdd = el => {
    const c = todoLinkCandidates(TD.linkQ)[Number(el.dataset.i)]; if (!c) return;
    const link = {t: c.t === 'mail' ? 'mail' : 'doc', k: c.k, ti: c.ti, u: c.u || undefined, no: c.no || undefined, mb: c.mb || undefined, uid: c.uid || undefined};
    if (TD.sel === 'new') { const d = {...(TD.draft || {meta: {}}), ...todoDraftFromEditor()}; d.meta = {...(d.meta || {}), ln: [...((d.meta && d.meta.ln) || []), link].slice(0, 5)}; TD.draft = d; }
    else { const t = todoFind(TD.sel); if (!t) return; const m = TD.edMeta || t.meta || {}; TD.edMeta = {...m, ln: [...(m.ln || []).filter(x => x.k !== link.k), link].slice(0, 5)}; }
    TD.linkOpen = false; TD.dirty = true; todoRefreshSections(); toast('연결했습니다. [저장]을 누르면 그룹웨어에 남습니다.');
  };
  HOME_ACTS.tdLinkDel = el => {
    const i = Number(el.dataset.i);
    if (TD.sel === 'new') { const d = {...(TD.draft || {meta: {}}), ...todoDraftFromEditor()}; d.meta = {...(d.meta || {}), ln: ((d.meta && d.meta.ln) || []).filter((_, k) => k !== i)}; TD.draft = d; }
    else { const t = todoFind(TD.sel); if (!t) return; const m = TD.edMeta || t.meta || {}; TD.edMeta = {...m, ln: (m.ln || []).filter((_, k) => k !== i)}; }
    TD.dirty = true; todoRefreshSections();
  };
  HOME_ACTS.tdLinkOpen = el => {
    const t = TD.sel === 'new' ? TD.draft : todoFind(TD.sel);
    const lm = (TD.sel !== 'new' && TD.edMeta) || (t && t.meta) || {}; const l = (lm.ln || [])[Number(el.dataset.i)]; if (!l) return;
    const act = S.a && S.a.actions.find(x => x.key === l.k);
    if (act) { if (TD.dirty && !confirm('고치던 내용이 저장되지 않았습니다. 문서를 열면 이 화면을 떠납니다. 계속할까요?')) return; TD.dirty = false; if (go('today')) selectAction(act.key); return; }
    if (l.t === 'mail' && l.uid && typeof openItem === 'function') { openItem({type: 'mail', ref: {box: l.mb || 'INBOX', uid: l.uid}, title: l.ti, url: S.a && S.a.mail && S.a.mail.url}); return; }
    if (l.u) openUrl(l.u, {title: l.ti || '연결 문서'});
    else toast('이 항목은 지금 목록에 없어 열 수 없습니다. 그룹웨어에서 찾아 주세요.');
  };
  // 편집기의 선택 칸(반복 방식)과 찾기 입력
  function todoChange(t) {
    if (t.id === 'tdeFiles') {
      if (TD.saving) return;
      TD.edFiles = Array.from(t.files || []); TD.dirty = true;
      const hint = $('#tdeFilesHint'); if (hint) hint.innerHTML = todoFilesHint(todoFind(TD.sel));
      return;
    }
    if (t.id === 'tdQuickDue') { t.dataset.userSet = '1'; return; }
    if (/^bp/.test(t.id) && typeof bpChange === 'function') { bpChange(t); return; }
    if (t.id === 'tdeRep') { const v = t.value; const w = $('#tdeRepW'), m = $('#tdeRepM'); if (w) w.hidden = v !== 'w'; if (m) m.hidden = v !== 'm'; TD.dirty = true; return; }
    if (t.id === 'tdeBud') { const d = $('#tdeBudDate'); if (d && !d.value) { d.value = (($('#tdeDue') || {}).value || ''); if (typeof dateFieldSync === 'function') dateFieldSync('tdeBudDate'); } TD.dirty = true; return; }
    if (t.id === 'tdQ') { TD.q = t.value; todoRefreshList(); return; }
    if (t.id === 'tdSort' && R.TD_SORTS.some(s => s[0] === t.value)) { if (!todoCanChangeView()) { t.value = TD.sort; return; } TD.sort = t.value; todoPrefsSave(); renderMain(); root.querySelector('#tdSort')?.focus(); return; }
    if (t.id === 'tdImpF' && (t.value === 'all' || R.TD_IMPS.some(s => s[0] === t.value))) { if (!todoCanChangeView()) { t.value = TD.imp; return; } TD.imp = t.value; todoPrefsSave(); renderMain(); root.querySelector('#tdImpF')?.focus(); return; }
    if (t.id === 'tdDoneSpan' && ['week', 'month', 'all'].includes(t.value)) { if (!todoCanChangeView()) { t.value = TD.doneSpan; return; } TD.doneSpan = t.value; todoPrefsSave(); renderMain(); root.querySelector('#tdDoneSpan')?.focus(); return; }
    if (todoDirtyField(t.id)) TD.dirty = true;
  }
  function todoInput(t, composing = false) {
    if (t.id === 'tdQ') { if (!composing) { TD.q = t.value; todoRefreshList(); } return; }
    if (t.id === 'tdeBulk') { if (typeof todoBulkPreview === 'function') todoBulkPreview(); return; }
    if (t.id === 'tdeRate') { const o = $('#tdeRateV'); if (o) o.textContent = t.value + '%'; }
    if (t.id === 'tdeHours') t.dataset.changed = '1';
    if (todoDirtyField(t.id)) TD.dirty = true;
  }
  function todoEnter(t) {
    if (t.id === 'tdQuick') { todoQuickAdd(); return true; }
    if (t.id === 'tdeSub') { HOME_ACTS.tdSubAdd(); return true; }
    if (t.id === 'tdeLinkQ') { HOME_ACTS.tdLinkFind(); return true; }
    return false;
  }
  // 다른 PC·모바일에서 바꾼 것을 따라잡는다: 창으로 돌아올 때(1분 넘게 지났으면)와 5분마다
  if (typeof document === 'object' && typeof setInterval === 'function' && typeof root === 'object') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && TD.lastLoad && Date.now() - TD.lastLoad > 60000) todoLoad({force: true}); });
    setInterval(() => { if (document.visibilityState === 'visible' && todoGwOk() && S.a) todoLoad({force: true}); }, 5 * 60000);
    setTimeout(() => { if (todoGwOk()) todoLoad({force: true}); }, 2500);
  }
