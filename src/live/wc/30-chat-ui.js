// GW 비서 · 채팅 화면(메시지 목록, 입력창, 추천 질문, 카드 렌더링)
// 모든 동적 문자열은 esc()를 거친다. AI 답변은 굵게·목록·줄바꿈만 허용하는 작은 마크다운으로 그린다(링크·HTML 불가).
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const chatRich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[ \t]*[*-] /gm, '• ').replace(/\n/g, '<br>');
  const CHAT_TONES = ['urgent', 'todo', 'ok', 'info', 'warn'];
  const chatTone = t => (CHAT_TONES.includes(t) ? t : 'info');
  const CHAT_CARD_ACTS = ['chatOpenItem', 'chatNav'];

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
    if (c.type === 'setup') return `<div class="ch-card ch-card-note ch-tone-info"><b>AI 연결이 필요합니다</b><br>${esc(c.reason || '말로 자유롭게 시키려면 구글 AI 키를 한 번 연결하세요(무료, 약 3분).')}<div class="ch-actions"><button class="ch-btn ch-btn-primary" data-act="chatSetupAi">AI 연결하기</button></div></div>`;
    if (c.type === 'confirm') {
      const done = c.state === 'done' || c.state === 'cancel';
      const rows = (c.rows || []).map(r => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('');
      return `<div class="ch-card ch-card-confirm ch-risk-${c.risk === 'high' ? 'high' : 'low'}${done ? ' ch-done' : ''}" role="group" aria-label="확인 카드"><div class="ch-card-t">${esc(c.title)}</div>${rows ? `<dl class="ch-rows">${rows}</dl>` : ''}${c.warn ? `<div class="ch-warn">${esc(c.warn)}</div>` : ''}${done ? `<div class="ch-result">${c.state === 'cancel' ? '취소했습니다.' : esc(c.result || '처리했습니다.')}</div>` : `<div class="ch-actions"><button class="ch-btn ${c.risk === 'high' ? 'ch-btn-danger' : 'ch-btn-primary'}" data-act="chatConfirm" data-v="${esc(c.id)}">${esc(c.confirmLabel || '확인')}</button><button class="ch-btn ch-btn-ghost" data-act="chatCancel" data-v="${esc(c.id)}" ${c.fresh ? 'data-autofocus="1"' : ''}>${esc(c.cancelLabel || '취소')}</button></div>`}</div>`;
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
    return `<div><small>${esc(label + warning)}</small></div>`;
  }
  function chatMsgHtml(m) {
    const time = chatTimeHtml(m);
    if (m.role === 'user') return `<article class="ch-msg ch-user"><div class="ch-bubble">${esc(m.text).replace(/\n/g, '<br>')}</div>${time}</article>`;
    const tools = (m.tools || []).map(t => `<span class="ch-tool ch-tool-${esc(t.state)}" title="${esc(t.name)}">${t.state === 'run' ? '<span class="spin"></span>' : t.state === 'err' ? '!' : '✓'} ${esc(t.label)}</span>`).join('');
    const body = m.text ? `<div class="ch-bubble">${chatRich(m.text)}</div>` : m.state === 'pending' ? '<div class="ch-bubble"><span class="ch-dots" aria-label="생각하는 중"><i></i><i></i><i></i></span></div>' : '';
    // 답 글에 이미 내용이 들어 있으면(AI 정리·긴 답) 긴 목록 카드는 "자세히 보기"로 접어 같은 말을 두 번 보이지 않는다.
    const cards = m.cards || [], fold = m.composed || (m.text && m.text.length >= 80);
    const detail = fold ? cards.filter(c => c && (c.type === 'list' || c.type === 'timeline') && (c.items || []).length > 0 && ((c.items || []).length > 3 || m.composed)) : [], rest = cards.filter(c => !detail.includes(c) && !(m.composed && c && (c.type === 'list' || c.type === 'timeline') && !(c.items || []).length));
    const cardsHtml = rest.map(chatCardHtml).join('') + (detail.length ? `<details class="ch-more"><summary>자세히 보기 (${detail.reduce((n, c) => n + (c.items || []).length, 0)}건)</summary>${detail.map(chatCardHtml).join('')}</details>` : '');
    return `<article class="ch-msg ${m.role === 'sys' ? 'ch-sys' : 'ch-ai'}${m.state === 'error' ? ' ch-err' : ''}">${tools ? `<div class="ch-tools">${tools}</div>` : ''}${body}${cardsHtml ? `<div class="ch-cards">${cardsHtml}</div>` : ''}${time}</article>`;
  }

  // 화면을 자정 넘겨 열어 둔 경우에도 이전 답변의 날짜 경고를 갱신한다.
  let chatRenderedDay = '';
  setInterval(() => {
    const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    if (chatRenderedDay && day !== chatRenderedDay && $('#chLog')) chatRefresh();
    chatRenderedDay = day;
  }, 30000);

  function chatLogHtml() {
    chatRenderedDay = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const st = chatState();
    if (!st.msgs.length) return `<div class="ch-empty"><p>말로 시키면 조회부터 신청서 준비까지 돕습니다. 신청과 예약은 항상 확인한 뒤에만 진행합니다.</p></div>`;
    return st.msgs.map(chatMsgHtml).join('');
  }
  const CHAT_STARTERS = [['오늘 요약', '급한 일·결재·일정을 한눈에', '오늘 요약해줘'], ['오늘 누가 자리에 없어?', '휴가·출장·교육 현황', '오늘 누가 출장이야?'], ['답장할 메일', '답장이 필요한 메일만', '답장 필요한 메일 있어?'], ['내일 일정', '일정·기한 확인', '내일 일정 알려줘'], ['연차 신청 준비', '날짜만 말하면 신청서까지', '다음 주 월요일 연차 신청해줘'], ['차량 예약', '가능한 시간 확인', '차량 예약 가능한 시간']];
  const chatChipsHtml = () => { const st = chatState(); if (!st.busy && !st.msgs.length) return CHAT_STARTERS.map(([t, s, q]) => `<button class="ch-chip" data-act="chatChip" data-v="${esc(q)}" title="${esc(s)}">${esc(t)}</button>`).join(''); return st.busy ? '' : chatSuggestions().slice(0, st.msgs.length ? 3 : 6).map(q => `<button class="ch-chip" data-act="chatChip" data-v="${esc(q)}">${esc(q)}</button>`).join(''); };
  function chatFootHtml() {
    const m = chatMode();
    return `<span class="ch-mode ${m.ready && !m.limited ? 'ch-mode-ai' : ''}">${m.ready ? (m.limited ? 'AI 사용 한도에 도달해 기본 모드로 답합니다(잠시 뒤 자동 재시도)' : `AI 연결됨${m.model ? ' · ' + esc(m.model) : ''}`) : '기본 모드 · 정해진 질문만 이해합니다'}</span><button class="ch-link" data-act="chatSetupAi">${m.ready ? 'AI 설정' : 'AI 연결하기'}</button>${chatState().msgs.length ? '<button class="ch-link" data-act="chatClear">대화 지우기</button>' : ''}`;
  }

  function chatView() {
    const st = chatState();
    queueMicrotask(() => { const l = $('#chLog'); if (l) l.scrollTop = l.scrollHeight; chatAutosize($('#chInput')); });
    return `<section class="ch" aria-label="AI 도우미"><div class="ch-log" id="chLog" role="log" aria-live="polite" aria-relevant="additions" tabindex="0">${chatLogHtml()}</div><div class="ch-chips" id="chChips">${chatChipsHtml()}</div><div class="ch-composer" role="group" aria-label="AI에게 지시하기"><textarea class="ch-input" id="chInput" rows="1" maxlength="1000" placeholder="예) 내일 일정 알려줘 · 직원 이름 + 언제 출장이야? · 11/12 연차 신청해줘" aria-label="AI에게 지시하기">${esc(st.draft || '')}</textarea><span id="chBtns">${chatBtnsHtml()}</span></div><div class="ch-foot" id="chFoot">${chatFootHtml()}</div><div class="ch-sr" id="chStatus" role="status" aria-live="polite"></div></section>`;
  }
  const chatBtnsHtml = () => (chatState().busy ? `<button class="ch-stop" data-act="chatStop" aria-label="중지">${ic('x')}<span>중지</span></button>` : `<button class="ch-send" data-act="chatSend" aria-label="보내기">${ic('play')}<span>보내기</span></button>`);

  function chatAutosize(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 168) + 'px'; }

  // 대화 영역만 다시 그린다. 입력창(값·선택·포커스·IME)은 건드리지 않는다.
  function chatRefresh(force) {
    const log = $('#chLog');
    if (!log) return;
    const st = chatState();
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
    log.innerHTML = chatLogHtml();
    const chips = $('#chChips'); if (chips) chips.innerHTML = chatChipsHtml();
    const b = $('#chBtns'); if (b) b.innerHTML = chatBtnsHtml();
    const f = $('#chFoot'); if (f) f.innerHTML = chatFootHtml();
    const last = st.msgs[st.msgs.length - 1];
    if (force || near || (last && last.role === 'user')) log.scrollTop = log.scrollHeight;
    const fresh = log.querySelector('[data-autofocus]');
    if (fresh) { fresh.focus({preventScroll: true}); st.msgs.forEach(m => (m.cards || []).forEach(c => { if (c.fresh) c.fresh = false; })); }
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
  HOME_ACTS.chatClear = () => { chatClear(); chatRefresh(); };
  HOME_ACTS.chatConfirm = (el, v, e) => chatConfirm(v, e);
  HOME_ACTS.navMore = () => { S.settings.navMore = !S.settings.navMore; saveLocal(); renderNav(); };
  HOME_ACTS.chatCancel = (el, v) => chatCancel(v);
  HOME_ACTS.chatSetupAi = () => { if (typeof openAi === 'function') openAi(); };
  HOME_ACTS.chatFocus = () => chatFocusInput();
  HOME_ACTS.chatOpenItem = (el, v) => { if (v && go('today')) selectAction(v); };
  HOME_ACTS.chatNav = (el, v) => {
    const [view, param] = String(v || '').split('|');
    if (!VIEWS.some(x => x.id === view)) return;
    if (view === 'search' && param) { if (go('search')) { S.search.kw = param; runSearch(); } return; }
    go(view);
  };

  // 04-timers-keys.js의 handleKey가 입력창 키를 넘겨 준다(문서 단계에서 이미 처리되므로 root 리스너는 쓰지 않는다).
  function chatKey(e, t) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); chatSubmitFromInput(); return; }
    if (e.key === 'ArrowUp' && !t.value && !e.isComposing) {
      const last = [...chatState().msgs].reverse().find(m => m.role === 'user');
      if (last) { e.preventDefault(); t.value = last.text; chatState().draft = last.text; chatAutosize(t); }
    }
  }
  root.addEventListener('input', e => {
    const t = e.composedPath()[0];
    if (!t || t.id !== 'chInput') return;
    chatState().draft = t.value;
    chatAutosize(t);
  });
