// GW 비서 · 채팅 화면(비서 머리말, 첫 브리핑과 기능 카드, 메시지 목록, 추천 질문, 입력창, 카드 렌더링)
// 모든 동적 문자열은 esc()를 거친다. AI 답변은 굵게·목록·줄바꿈만 허용하는 작은 마크다운으로 그린다(링크·HTML 불가).
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const chatRich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[ \t]*[*-] /gm, '• ').replace(/\n/g, '<br>');
  const CHAT_TONES = ['urgent', 'todo', 'ok', 'info', 'warn'];
  const chatTone = t => (CHAT_TONES.includes(t) ? t : 'info');
  const CHAT_CARD_ACTS = ['chatOpenItem', 'chatNav', 'chatOpenUrl'];
  const CHAT_MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l1.9 5.6a3 3 0 0 0 1.9 1.9l5.7 2-5.7 2a3 3 0 0 0-1.9 1.9L12 21.5l-1.9-5.6a3 3 0 0 0-1.9-1.9l-5.7-2 5.7-2a3 3 0 0 0 1.9-1.9z"/></svg>';
  const CHAT_AV = `<span class="ch-av" aria-hidden="true">${CHAT_MARK}</span>`;

  function chatCardHtml(c) {
    if (!c || typeof c !== 'object') return '';
    if (c.type === 'list') {
      const items = (c.items || []).map(it => {
        const inner = `<span class="ch-li-t">${esc(it.title)}</span>${it.sub ? `<span class="ch-li-s">${esc(it.sub)}</span>` : ''}${it.badge ? `<span class="ch-li-b ch-tone-${chatTone(it.tone)}">${esc(it.badge)}</span>` : ''}`;
        return it.act && CHAT_CARD_ACTS.includes(it.act.act) ? `<li><button class="ch-li ch-li-btn" data-act="${it.act.act}" data-v="${esc(it.act.v)}">${inner}</button></li>` : `<li class="ch-li">${inner}</li>`;
      }).join('');
      return `<div class="ch-card ch-card-list">${c.title ? `<div class="ch-card-t">${esc(c.title)}</div>` : ''}${items ? `<ul class="ch-ul">${items}</ul>` : '<div class="ch-card-empty">해당하는 항목이 없습니다.</div>'}${c.more ? `<div class="ch-card-more">외 ${esc(c.more)}건</div>` : ''}</div>`;
    }
    if (c.type === 'kpi') return `<div class="ch-card ch-card-kpi">${(c.items || []).map(k => `<div class="ch-kpi ch-tone-${chatTone(k.tone)}"><b>${esc(k.value)}</b><span>${esc(k.label)}</span></div>`).join('')}</div>`;
    if (c.type === 'nav') return `<button class="ch-card ch-card-nav" data-act="chatNav" data-v="${esc((c.view || '') + '|' + (c.v || ''))}">${esc(c.label || '열기')} <span aria-hidden="true">→</span></button>`;
    if (c.type === 'note') return `<div class="ch-card ch-card-note ch-tone-${chatTone(c.tone)}">${chatRich(c.text)}</div>`;
    if (c.type === 'timeline') return `<div class="ch-card ch-card-time">${c.title ? `<div class="ch-card-t">${esc(c.title)}</div>` : ''}<ul class="ch-ul">${(c.items || []).map(r => `<li class="ch-li"><span class="ch-li-t"><span class="ch-time">${esc(r.from || '종일')}${r.to ? '~' + esc(r.to) : ''}</span> ${esc(r.label)}</span></li>`).join('') || '<li class="ch-card-empty">일정이 없습니다.</li>'}</ul></div>`;
    // 예시 문장 묶음: 누르면 그 문장을 그대로 보낸다.
    if (c.type === 'chips') return `<div class="ch-card ch-card-chips">${c.title ? `<div class="ch-card-t">${esc(c.title)}</div>` : ''}<div class="ch-chips">${(c.items || []).slice(0, 8).map(q => `<button class="ch-chip" data-act="chatChip" data-v="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
    if (c.type === 'setup') return `<div class="ch-card ch-card-note ch-tone-info"><b>AI 연결이 필요합니다</b><br>${esc(c.reason || '말로 자유롭게 시키려면 구글 AI 키를 한 번 연결하세요(무료, 약 3분).')}<div class="ch-actions"><button class="ch-btn ch-btn-primary" data-act="chatSetupAi">AI 연결하기</button></div></div>`;
    if (c.type === 'confirm') {
      const done = c.state === 'running' || c.state === 'done' || c.state === 'cancel' || c.state === 'err';
      const rows = (c.rows || []).map(r => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('');
      return `<div class="ch-card ch-card-confirm ch-risk-${c.risk === 'high' ? 'high' : 'low'}${done ? ' ch-done' : ''}" role="group" aria-label="확인 카드"><div class="ch-card-t">${esc(c.title)}</div>${rows ? `<dl class="ch-rows">${rows}</dl>` : ''}${c.warn ? `<div class="ch-warn">${esc(c.warn)}</div>` : ''}${done ? `<div class="ch-result">${c.state === 'cancel' ? '취소했습니다.' : esc(c.result || (c.state === 'err' ? '처리하지 못했습니다.' : '처리했습니다.'))}</div>` : `<div class="ch-actions"><button class="ch-btn ${c.risk === 'high' ? 'ch-btn-danger' : 'ch-btn-primary'}" data-act="chatConfirm" data-v="${esc(c.id)}">${esc(c.confirmLabel || '확인')}</button><button class="ch-btn ch-btn-ghost" data-act="chatCancel" data-v="${esc(c.id)}" ${c.fresh ? 'data-autofocus="1"' : ''}>${esc(c.cancelLabel || '취소')}</button></div>`}</div>`;
    }
    return '';
  }

  // 저장된 at은 응답이 만들어진 시각이다. 과거의 '오늘/내일'을 현재로 오인하지 않도록 절대 시각을 표시한다.
  const chatHistoryCurrent = (at, now = Date.now()) => {
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0 || at > now + 60000) return false;
    const d = new Date(at + 9 * 3600000), n = new Date(now + 9 * 3600000);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === n.toISOString().slice(0, 10);
  };
  function chatTimeHtml(m, now = Date.now()) {
    const at = typeof m.at === 'number' && Number.isFinite(m.at) && m.at > 0 && m.at <= now + 60000 ? m.at : 0;
    const date = at ? new Date(at + 9 * 3600000) : null;
    const iso = date && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
    const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
    const label = iso ? iso.slice(0, 10) + ' ' + iso.slice(11, 16) + ' KST' : '시각 확인 불가';
    const warning = m.role !== 'user' && (!iso || iso.slice(0, 10) !== today)
      ? ' · 이전 기록: 당시 기준 응답입니다. 최신 정보는 다시 질문해 주세요.' : '';
    return `<div class="ch-meta"><small>${esc(label + warning)}</small></div>`;
  }
  function chatMsgHtml(m) {
    const time = chatTimeHtml(m);
    if (m.role === 'user') return `<article class="ch-msg ch-user">${m.auto ? `<span class="ch-auto">${ic('clock')}자동화 · ${esc(m.auto)}</span>` : ''}<div class="ch-bubble">${esc(m.text).replace(/\n/g, '<br>')}</div>${time}</article>`;
    const tools = (m.tools || []).map(t => `<span class="ch-tool ch-tool-${esc(t.state)}" title="${esc(t.name)}">${t.state === 'run' ? '<span class="spin"></span>' : t.state === 'err' ? '!' : '✓'} ${esc(t.label)}</span>`).join('');
    const body = m.text ? `<div class="ch-bubble">${chatRich(m.text)}</div>` : m.state === 'pending' ? '<div class="ch-bubble"><span class="ch-dots" aria-label="생각하는 중"><i></i><i></i><i></i></span></div>' : '';
    // 답 글에 이미 내용이 들어 있으면(AI 정리·긴 답) 긴 목록 카드는 "자세히 보기"로 접어 같은 말을 두 번 보이지 않는다.
    const cards = m.cards || [], fold = m.composed;
    const detail = fold ? cards.filter(c => c && (c.type === 'list' || c.type === 'timeline') && (c.items || []).length > 0) : [], rest = cards.filter(c => !detail.includes(c) && !(m.composed && c && (c.type === 'list' || c.type === 'timeline') && !(c.items || []).length));
    const cardsHtml = rest.map(chatCardHtml).join('') + (detail.length ? `<details class="ch-more"><summary>자세히 보기 (${detail.reduce((n, c) => n + (c.items || []).length, 0)}건)</summary>${detail.map(chatCardHtml).join('')}</details>` : '');
    return `<article class="ch-msg ${m.role === 'sys' ? 'ch-sys' : 'ch-ai'}${m.state === 'error' ? ' ch-err' : ''}">${CHAT_AV}<div class="ch-body">${tools ? `<div class="ch-tools">${tools}</div>` : ''}${body}${cardsHtml ? `<div class="ch-cards">${cardsHtml}</div>` : ''}${time}</div></article>`;
  }

  // 화면을 자정 넘겨 열어 둔 경우에도 이전 답변의 날짜 경고를 갱신한다.
  let chatRenderedDay = '';
  const chatDayTimer = setInterval(() => {
    const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    if (chatRenderedDay && day !== chatRenderedDay && $('#chLog')) chatRefresh();
    chatRenderedDay = day;
  }, 30000);

  // 새 대화가 없을 때: 비서가 먼저 건네는 브리핑(조회된 숫자 그대로)과 맡길 수 있는 일.
  const CHAT_CAPS_HOME = [['sun', '오늘 브리핑', '급한 일·일정·메일을 한 번에', '아침 브리핑 해줘'], ['mail', '메일', '안 읽은 메일, 답장할 메일', '안 읽은 메일 보여줘'], ['doc', '결재·문서', '결재할 문서, 올린 문서 진행', '결재 현황 알려줘'], ['cal', '일정·근태', '내 일정, 직원 부재, 연차', '이번 주 일정 알려줘'], ['wallet', '예산', '사업·과목별 집행과 잔액', '예산 집행 현황 알려줘'], ['clock', '자동화', '정한 시각에 먼저 알려 드림', '자동화 목록 보여줘']];
  function chatBriefHtml() {
    if (typeof homeData !== 'function') return '';
    let d; try { d = homeData(); } catch (e) { logError('chat.brief', e.message); return ''; }
    const wrap = inner => `<article class="ch-msg ch-ai ch-brief">${CHAT_AV}<div class="ch-body">${inner}</div></article>`;
    if (!d.loaded) return wrap(`<div class="ch-bubble">${S.error ? '그룹웨어 자료를 읽지 못했습니다. 위쪽의 새로 고침을 누른 뒤 다시 확인해 주세요.' : '<span class="ch-dots" aria-hidden="true"><i></i><i></i><i></i></span> 그룹웨어 자료를 읽고 있습니다.'}</div>`);
    const total = d.urgent + d.todo + d.check, teamGap = !!(d.teamLoading || d.teamError || d.teamUnknown);
    const next = R.homeNextAction(d.mine.map(x => ({key: x.key, title: x.title, state: stateOf(x)})));
    const b = R.homeBriefing({urgent: d.urgent, total, wait: d.wait, events: d.events.length, away: teamGap ? null : d.away.length, unread: d.unread, leave: d.leave, refN: d.refN, gaps: d.taskGaps, first: next ? next.title : ''});
    const facts = b.facts.map(f => `<button class="ch-fact ch-tone-${chatTone(f.tone)}" data-act="homeTile" data-v="${esc(f.id)}"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></button>`).join('');
    const say = b.first ? `먼저 볼 일은 <b>${esc(b.first)}</b>입니다.` : total ? '' : '새로 도착한 처리할 일이 없습니다.';
    return wrap(`<div class="ch-bubble">지금까지 확인한 내용입니다. ${say}${b.note ? `<br><span class="ch-brief-note">${esc(b.note)}</span>` : ''}</div><div class="ch-facts">${facts}</div><div class="ch-actions">${next ? `<button class="ch-btn ch-btn-primary" data-act="homeNext" data-v="${esc(next.key)}">먼저 볼 일 열기</button>` : ''}<button class="ch-btn ch-btn-ghost" data-act="chatChip" data-v="아침 브리핑 해줘">자세한 브리핑 듣기</button></div>`);
  }
  const chatWelcomeHtml = () => `<div class="ch-welcome">${chatBriefHtml()}<div class="ch-caps-k">이런 일을 맡길 수 있습니다</div><div class="ch-caps">${CHAT_CAPS_HOME.map(([i, t, s, q]) => `<button class="ch-cap" data-act="chatChip" data-v="${esc(q)}"><span class="ch-cap-i">${ic(i)}</span><span class="ch-cap-b"><b>${esc(t)}</b><span>${esc(s)}</span></span></button>`).join('')}</div><button class="ch-link ch-caps-more" data-act="chatChip" data-v="뭘 할 수 있어?">할 수 있는 일 전체 보기</button></div>`;

  function chatLogHtml() {
    chatRenderedDay = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const st = chatState();
    const past = st.msgs.filter(m => m.restored), current = st.msgs.filter(m => !m.restored);
    return (past.length ? `<details class="ch-more ch-past" data-chat-history ${st.historyExpanded ? 'open' : ''}><summary>이전 대화 보기 (${past.length}개 메시지)</summary>${past.map(chatMsgHtml).join('')}</details>` : '') + (current.length ? current.map(chatMsgHtml).join('') : chatWelcomeHtml());
  }
  const chatChipsHtml = () => { const st = chatState(); if (st.busy) return ''; const fresh = !st.msgs.some(m => !m.restored); return chatSuggestions().slice(0, fresh ? 4 : 3).map(q => `<button class="ch-chip" data-act="chatChip" data-v="${esc(q)}">${esc(q)}</button>`).join(''); };
  function chatFootHtml() {
    const m = chatMode();
    return `<span class="ch-mode ${m.ready && !m.limited ? 'ch-mode-ai' : ''}" ${m.ready && m.model ? `title="${esc(m.model)}"` : ''}><i class="ch-dot" aria-hidden="true"></i>${m.ready ? (m.limited ? 'AI 사용 한도에 도달해 기본 모드로 답합니다(잠시 뒤 자동 재시도)' : `AI 연결됨${m.model ? ' · ' + esc(m.model) : ''}`) : '기본 모드 · 정해진 질문을 이해합니다'}</span>`;
  }
  const chatHeadActsHtml = () => `${chatState().msgs.length ? `<button class="ch-hbtn" data-act="chatClear" title="대화 기록을 지우고 새로 시작합니다">${ic('refresh')}<span>새 대화</span></button>` : ''}<button class="ch-hbtn" data-act="chatSetupAi" aria-label="${chatMode().ready ? 'AI 설정' : 'AI 연결하기'}" title="${chatMode().ready ? 'AI 설정' : 'AI 연결하기'}">${ic('gear')}<span>${chatMode().ready ? 'AI 설정' : 'AI 연결하기'}</span></button>`;

  function chatView() {
    const st = chatState();
    queueMicrotask(() => { const l = $('#chLog'); if (l) l.scrollTop = Number.isFinite(st.logTop) ? st.logTop : (st.msgs.some(m => !m.restored) ? l.scrollHeight : 0); chatAutosize($('#chInput')); });
    return `<section class="ch" aria-label="AI 도우미"><header class="ch-head"><span class="ch-mark" aria-hidden="true">${CHAT_MARK}</span><div class="ch-head-t"><h2 class="ch-heading">GW 비서에게 묻기</h2><div class="ch-foot" id="chFoot">${chatFootHtml()}</div></div><div class="ch-head-a" id="chHeadA">${chatHeadActsHtml()}</div></header><div class="ch-log" id="chLog" role="log" aria-live="polite" aria-relevant="additions" tabindex="0">${chatLogHtml()}</div><div class="ch-dock"><div class="ch-chips" id="chChips">${chatChipsHtml()}</div><div class="ch-composer" role="group" aria-label="AI에게 지시하기"><textarea class="ch-input" id="chInput" rows="1" maxlength="1000" placeholder="무엇이든 물어보거나 시켜 보세요. 예) 안 읽은 메일 보여줘 · 매일 9시에 브리핑 해줘" aria-label="AI에게 지시하기" aria-describedby="chInputHelp">${esc(st.draft || '')}</textarea><span id="chBtns">${chatBtnsHtml()}</span></div><small class="ch-help" id="chInputHelp">Enter로 보내기 · Shift+Enter로 줄바꿈 · 신청·예약은 확인 카드를 직접 눌러야 진행됩니다</small></div><div class="ch-sr" id="chStatus" role="status" aria-live="polite"></div></section>`;
  }
  const chatBtnsHtml = () => (chatState().busy ? `<button class="ch-stop" data-act="chatStop" aria-label="중지">${ic('x')}<span>중지</span></button>` : `<button class="ch-send" data-act="chatSend" aria-label="보내기">${ic('play')}<span>보내기</span></button>`);

  function chatAutosize(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 168) + 'px'; }

  // 대화 영역만 다시 그린다. 입력창(값·선택·포커스·IME)은 건드리지 않는다.
  function chatRefresh(force) {
    const log = $('#chLog');
    if (!log) return;
    const st = chatState();
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
    const top = log.scrollTop, hasCurrent = st.msgs.some(m => !m.restored);
    const opened = [...log.querySelectorAll('details.ch-more')].map(d => d.open);
    const active = root.activeElement;
    const activeAct = active && active.dataset.act, activeValue = active && active.dataset.v;
    log.innerHTML = chatLogHtml();
    log.querySelectorAll('details.ch-more').forEach((d, i) => { if (opened[i] !== undefined) d.open = opened[i]; });
    if (activeAct) { const replacement = [...log.querySelectorAll('[data-act]')].find(el => el.dataset.act === activeAct && el.dataset.v === activeValue); if (replacement) replacement.focus({preventScroll: true}); }
    const chips = $('#chChips'); if (chips) chips.innerHTML = chatChipsHtml();
    const b = $('#chBtns'); if (b) b.innerHTML = chatBtnsHtml();
    const f = $('#chFoot'); if (f) f.innerHTML = chatFootHtml();
    const h = $('#chHeadA'); if (h) h.innerHTML = chatHeadActsHtml();
    const last = st.msgs[st.msgs.length - 1];
    if (!hasCurrent) log.scrollTop = top; // 환영 화면은 읽던 위치를 지킨다
    else if (force || near) log.scrollTop = log.scrollHeight;
    else log.scrollTop = top;
    st.logTop = log.scrollTop;
    const fresh = log.querySelector('[data-autofocus]');
    if (fresh) { if (root.activeElement !== $('#chInput')) fresh.focus({preventScroll: true}); st.msgs.forEach(m => (m.cards || []).forEach(c => { if (c.fresh) c.fresh = false; })); }
    if (last && last.role !== 'user' && last.state === 'done' && st.announced !== last.id) { st.announced = last.id; const sr = $('#chStatus'); if (sr) sr.textContent = '답변이 도착했습니다.'; }
  }
  const chatFocusInput = () => { const i = $('#chInput'); if (i) { i.scrollIntoView({behavior: 'smooth', block: 'center'}); i.focus(); } };

  function chatSubmitFromInput() {
    const i = $('#chInput');
    const text = ((i && i.value) || '').trim();
    if (!text) { if (i) i.focus(); return; }
    if (chatState().busy) { toast('답변을 만드는 중입니다. 끝난 뒤 보내 주세요.'); return; }
    if (i) { i.value = ''; chatAutosize(i); }
    chatState().draft = '';
    chatSend(text);
  }

  HOME_ACTS.chatChip = (el, v) => { if (v) chatSend(v); };
  HOME_ACTS.chatSend = () => chatSubmitFromInput();
  HOME_ACTS.chatStop = () => chatStop();
  HOME_ACTS.chatClear = () => { chatClear(); const st = chatState(); st.logTop = 0; const log = $('#chLog'); if (log) log.scrollTop = 0; const input = $('#chInput'); if (input) { input.value = ''; chatAutosize(input); } chatRefresh(); };
  HOME_ACTS.chatConfirm = (el, v, e) => chatConfirm(v, e);
  HOME_ACTS.chatCancel = (el, v) => chatCancel(v);
  HOME_ACTS.chatSetupAi = () => { if (typeof openAi === 'function') openAi(); };
  HOME_ACTS.chatFocus = () => chatFocusInput();
  HOME_ACTS.chatOpenItem = (el, v) => { if (v && go('today')) selectAction(v); };
  // 대화 카드의 원문 링크: 그룹웨어 같은 출처의 주소만 연다(저장된 대화 기록이 바뀌어도 다른 곳으로 가지 않게).
  HOME_ACTS.chatOpenUrl = (el, v) => { const u = String(v || ''); if (u.startsWith(location.origin + '/')) openUrl(u, {title: (el && el.querySelector && el.querySelector('.ch-li-t') || {}).textContent || ''}); };
  HOME_ACTS.chatNav = (el, v) => {
    const [view, param] = String(v || '').split('|');
    if (!VIEWS.some(x => x.id === view)) return;
    if (view === 'search' && param) { if (go('search')) { S.search.kw = param; runSearch(); } return; }
    if (view === 'approval' && ['pending', 'deptWaiting', 'distWaiting', 'sendWaiting', 'submitted', 'viewing'].includes(param)) { if (go('approval') !== false) { S.apTab = param; S.apTabPinned = true; renderMain(); } return; }
    if (view === 'today' && param === 'ref') { S.filter = {...S.filter, level: 'all', area: 'all', q: '', onlyNew: false, showHidden: false}; S.todayTab = 'ref'; go('today'); return; }
    go(view);
  };

  // 04-timers-keys.js의 handleKey가 입력창 키를 넘겨 준다(문서 단계에서 이미 처리되므로 root 리스너는 쓰지 않는다).
  function chatKey(e, t) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); chatSubmitFromInput(); return; }
    if (e.key === 'ArrowUp' && !t.value && !e.isComposing) {
      const last = [...chatState().msgs].reverse().find(m => m.role === 'user' && !m.auto);
      if (last) { e.preventDefault(); t.value = last.text; chatState().draft = last.text; chatAutosize(t); }
    }
  }
  root.addEventListener('input', e => {
    const t = e.composedPath()[0];
    if (!t || t.id !== 'chInput') return;
    chatState().draft = t.value;
    chatAutosize(t);
  });

  root.addEventListener('scroll', e => { if (e.target && e.target.id === 'chLog') chatState().logTop = e.target.scrollTop; }, true);
  root.addEventListener('toggle', e => { if (e.target && e.target.matches && e.target.matches('[data-chat-history]') && e.target.isConnected) chatState().historyExpanded = e.target.open; }, true);
