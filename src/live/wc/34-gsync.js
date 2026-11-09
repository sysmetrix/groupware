// GW 통합 업무센터 · 구글 캘린더 동기화 (그룹웨어 → 구글, 스킬 bwyf-gcal-sync 원칙)
// 원칙: 결재완료 건만 등록 후보 / 레이어(캘린더) 격리 / 메모는 스킬 표준 서식 / 사전 승인 — 이 화면은 구글 일정 작성 화면을
//       미리 채워 열 뿐이고 [저장]은 사용자가 직접 누른다. 구글 캘린더 내용은 읽지 않으므로 "등록함"은 사용자가 표시한 값이다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const gsyncState = () => (S.gsync = S.gsync || {open: '', status: '', layer: 'all'});
  const gsyncCfg = () => (S.settings.gcal = S.settings.gcal || {});
  function gsyncGet() {
    const c = S.appsC && S.appsC.user === currentKey && S.appsC.data;
    if (!c) return null;
    const cfg = gsyncCfg();
    return R.gsyncPlan({apps: c.apps, me: c.me, deadlines: gsyncDeadlines(), cals: cfg.cals || [], synced: cfg.synced || {}, existing: store.get('gsyncExisting', null), now: new Date()});
  }
  // 기한 후보는 내가 처리할 일(급함·할 일·확인)에 딸린 것만. 광고·참고 문서의 기한은 제외한다.
  function gsyncDeadlines() {
    if (!S.a) return [];
    return (S.a.deadlines || []).filter(d => { const ow = d.key && S.a.actions.find(a => a.key === d.key); return ow && isMine(ow) && ['overdue', 'urgent', 'todo', 'check'].includes(stateOf(ow)) && !/광고|뉴스레터|홍보|이벤트/.test(d.title || ''); });
  }
  const gsyncMd = ev => { const f = y => `${Number(y.slice(4, 6))}/${Number(y.slice(6, 8))}(${'일월화수목금토'[new Date(Date.UTC(+y.slice(0, 4), +y.slice(4, 6) - 1, +y.slice(6, 8))).getUTCDay()]})`; return ev.endYmd !== ev.startYmd ? `${f(ev.startYmd)}~${f(ev.endYmd)}` : f(ev.startYmd); };
  const GSYNC_STATE_NAME = {ready: '구글에 없음', similar: '비슷한 일정 있음', synced: '등록됨', unverified: '대조 전', hold: '결재 중 · 보류'};

  function vGsync() {
    if (!allowed('googleCalendar')) return pgh('구글 캘린더 동기화', '관리자 설정으로 꺼져 있습니다', '');
    const st = gsyncState(), plan = gsyncGet();
    const head = pgh('구글 캘린더 동기화', '그룹웨어의 내 근태·기한을 구글 캘린더와 맞춥니다', plan && plan.counts.ready ? `<button class="btn sm primary" data-act="gsyncNext">${ic('plus')}구글에 없는 일정 하나 열기</button>` : '');
    const rules = `<div class="box tip gs-rules"><b>이렇게 올립니다</b><ul><li>그룹웨어에 <b>결재완료</b>된 내 근태(출장·시간외·휴가)와 문서에서 읽은 기한만 후보가 됩니다. 결재 중인 건은 보류합니다.</li><li>근태는 <b>5 BWYF 근태</b>, 기한은 <b>4 BWYF 개인</b> 캘린더로 나눕니다(섞지 않습니다).</li><li>[구글에 올리기]를 누르면 내용이 채워진 구글 일정 작성 화면이 열립니다. <b>캘린더와 내용을 확인하고 [저장]은 직접 누르세요.</b> 업무센터는 대신 저장하지 않습니다.</li><li>이미 올렸는지는 <b>구글 캘린더를 실제로 읽어 대조</b>한 결과로 보여 줍니다(아래 대조 상태 참고). 대조하지 않은 건 “대조 전”이며 “등록 전”이라고 단정하지 않습니다.</li></ul></div>`;
    if (!plan) return `${head}${rules}<div class="list">${'<div class="sk row"></div>'.repeat(4)}</div><p class="muted"><span class="spin"></span> 내 근태 신청 내역을 읽는 중입니다…</p>`;
    const cmpBanner = plan.compared ? `<div class="box tip">구글 캘린더 대조: <b>${esc(new Date(plan.comparedAt).toLocaleString('ko-KR', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}))}</b> 기준 · 구글에서 확인됨 ${plan.counts.synced} · 비슷한 일정 ${plan.counts.similar} · 구글에 없음 ${plan.counts.ready}${plan.counts.unverified ? ` · 대조 전 ${plan.counts.unverified}` : ''}<div class="muted" style="margin-top:4px">대조는 Aside가 구글 캘린더의 해당 날짜를 읽어 반영합니다. 새로 대조하려면 Aside에게 “구글 캘린더와 대조해줘”라고 말하세요.</div></div>` : `<div class="box warn"><b>아직 구글 캘린더와 대조하지 않았습니다.</b> 아래 후보는 “대조 전”이며 이미 구글에 있을 수 있습니다. Aside에게 <b>“구글 캘린더와 대조해줘”</b>라고 말하면 후보 날짜의 구글 일정을 읽어 이 화면에 반영합니다.</div>`;
    const missing = [R.GSYNC_LAYERS.attend, ...(plan.items.some(i => i.source === 'deadline') ? [R.GSYNC_LAYERS.personal] : [])].filter(l => !R.gsyncCalendarId(gsyncCfg().cals || [], l));
    const warn = missing.length ? `<div class="box warn">“${esc(missing.join(', '))}” 캘린더를 연결하지 않아 구글 작성 화면에서 캘린더를 직접 골라야 합니다. <button class="btn sm" data-act="view" data-v="gcal">구글 일정에서 캘린더 연결하기</button></div>` : '';
    if (!st.status) st.status = plan.compared ? (plan.counts.ready ? 'todo' : plan.counts.similar ? 'check' : 'synced') : 'check';
    const stOk = i => st.status === 'all' || (st.status === 'todo' ? i.state === 'ready' : st.status === 'check' ? i.state === 'similar' || i.state === 'unverified' : st.status === 'hold' ? i.state === 'hold' : i.state === 'synced');
    const lyOk = i => st.layer === 'all' || (st.layer === 'attend' ? i.source === 'attend' : i.source === 'deadline');
    const list = plan.items.filter(i => stOk(i) && lyOk(i));
    const c = plan.counts, seg = (cur, act, arr) => `<div class="seg">${arr.map(([k, n]) => `<button class="${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}">${n}</button>`).join('')}</div>`;
    const bar = `<div class="bar">${seg(st.status, 'gsyncStatus', [['todo', `구글에 없음 ${c.ready}`], ['check', `확인 필요 ${c.similar + c.unverified}`], ['synced', `등록됨 ${c.synced}`], ['hold', `보류 ${c.hold}`], ['all', '전체']])}${seg(st.layer, 'gsyncLayer', [['all', '모든 레이어'], ['attend', '근태'], ['deadline', '기한']])}</div>`;
    const row = ev => {
      const open = st.open === ev.key;
      const detail = open ? `<div class="gs-detail"><dl class="gs-kv"><div><dt>레이어</dt><dd>${esc(ev.layer)}${ev.calId ? '' : ' <span class="muted">(캘린더 미연결)</span>'}</dd></div><div><dt>일시</dt><dd>${esc(gsyncMd(ev))}${ev.time ? ' ' + esc(ev.time) : ' 종일'}</dd></div>${ev.location ? `<div><dt>장소</dt><dd>${esc(ev.location)}</dd></div>` : ''}${ev.docNo ? `<div><dt>문서번호</dt><dd>${esc(ev.docNo)}</dd></div>` : ''}</dl>${ev.match && ev.match.title ? `<div class="gs-found">${ev.state === 'synced' ? '구글 캘린더에서 확인됨' : '구글에 있는 비슷한 일정'}: <b>${esc(ev.match.title)}</b>${ev.match.cal ? ` <span class="muted">(${esc(ev.match.cal)})</span>` : ''}</div>` : ev.verified === 'user' ? '<div class="gs-found">사용자가 “올렸어요”로 표시함</div>' : ''}<div class="gs-memo-k">새로 올린다면 구글 일정 메모(설명)에 들어갈 내용</div><pre class="gs-memo">${esc(ev.details)}</pre><div class="acts">${ev.state === 'hold' ? '<span class="muted">결재가 끝나면 등록할 수 있습니다.</span>' : `<button class="btn ${ev.state === 'ready' || ev.state === 'unverified' ? 'primary' : ''}" data-act="gsyncUp" data-v="${esc(ev.key)}">${ic('ext')}${ev.state === 'synced' ? '그래도 새로 올리기' : ev.state === 'similar' ? '새로 올리기' : '구글에 올리기'}</button>`}<button class="btn" data-act="gsyncFind" data-v="${esc(ev.key)}">구글에서 찾아보기</button>${ev.state === 'hold' || ev.verified === 'google' ? '' : ev.state === 'synced' ? `<button class="btn" data-act="gsyncMark" data-v="${esc(ev.key)}">등록됨 표시 해제</button>` : `<button class="btn" data-act="gsyncMark" data-v="${esc(ev.key)}">이미 올려져 있어요 (등록됨 표시)</button>`}</div></div>` : '';
      return `<div class="gs-row gs-${ev.state}"><button class="gs-main" data-act="gsyncOpen" data-v="${esc(ev.key)}" aria-expanded="${open}"><span class="gs-l"><span class="gs-date">${esc(gsyncMd(ev))}</span><span class="gs-title">${esc(ev.title)}</span><span class="gs-sub">${esc(ev.time || '종일')}${ev.location ? ' · ' + esc(ev.location) : ''}</span></span><span class="gs-r"><span class="bdg ${ev.source === 'deadline' ? 'tag' : 'info'}">${esc(ev.source === 'deadline' ? '기한' : '근태')}</span><span class="bdg ${ev.state === 'synced' ? 'confirm' : ev.state === 'hold' ? 'check' : 'todo'}">${esc(GSYNC_STATE_NAME[ev.state])}</span></span></button>${detail}</div>`;
    };
    return `${head}${cmpBanner}${rules}${warn}${bar}${list.length ? `<div class="gs-list">${list.map(row).join('')}</div>` : `<div class="list"><div class="empty"><b>${st.status === 'todo' ? '구글에 없는 일정이 없습니다' : '해당하는 항목이 없습니다'}</b>${plan.compared ? '대조한 날짜 안에서는 모두 구글 캘린더에 있습니다.' : '구글 캘린더와 대조한 뒤 다시 확인하세요.'}</div></div>`}<p class="muted" style="margin-top:10px">부서 행사·공지(3 BWYF 부서)와 메신저 일정은 원문 확인이 필요해 자동으로 후보를 만들지 않습니다.</p>`;
  }

  function gsyncEv(key) { const p = gsyncGet(); return p ? p.items.find(i => i.key === key) : null; }
  HOME_ACTS.gsyncOpen = (el, v) => { const st = gsyncState(); st.open = st.open === v ? '' : v; renderMain(); };
  HOME_ACTS.gsyncStatus = (el, v) => { gsyncState().status = v; renderMain(); };
  HOME_ACTS.gsyncLayer = (el, v) => { gsyncState().layer = v; renderMain(); };
  function gsyncOpenForm(ev) {
    if (!ev || ev.state === 'hold') return;
    const w = window.open(R.gsyncUrl(ev, ev.calId), '_blank', 'noopener');
    if (!w) { toast('새 탭이 막혔습니다. 팝업을 허용한 뒤 다시 눌러 주세요.'); return; }
    toast(ev.calId ? '구글 일정 작성 화면을 열었습니다. 캘린더와 내용을 확인하고 [저장]을 눌러 주세요.' : '구글 일정 작성 화면을 열었습니다. 캘린더를 “' + ev.layer + '”로 고른 뒤 [저장]을 눌러 주세요.');
  }
  HOME_ACTS.gsyncUp = (el, v) => gsyncOpenForm(gsyncEv(v));
  HOME_ACTS.gsyncNext = () => { const p = gsyncGet(); const ev = p && p.items.find(i => i.state === 'ready'); if (!ev) { toast('구글에 없는 일정이 없습니다.'); return; } gsyncState().open = ev.key; gsyncOpenForm(ev); renderMain(); };
  HOME_ACTS.gsyncFind = (el, v) => { const ev = gsyncEv(v); if (!ev) return; window.open('https://calendar.google.com/calendar/u/0/r/search?q=' + encodeURIComponent(ev.docNo || ev.title), '_blank', 'noopener'); };
  HOME_ACTS.gsyncMark = (el, v) => {
    const ev = gsyncEv(v); if (!ev || ev.state === 'hold') return;
    const c = gsyncCfg(); c.synced = {...(c.synced || {})};
    if (c.synced[v]) delete c.synced[v]; else c.synced[v] = Date.now();
    saveLocal(); renderMain(); toast(c.synced[v] ? '등록됨으로 표시했습니다(이 PC에만 기록).' : '표시를 해제했습니다.');
  };

  // Aside(스킬 bwyf-gcal-sync)가 구글 캘린더 일 보기에서 읽은 문장을 넣어 대조 상태를 갱신한다. payload: {at?, days: {YYYYMMDD: [문장…]}}
  function gsyncImport(payload) {
    const ex = R.gsyncNormalizeExisting(payload);
    if (!ex.dates.length) return {ok: false, error: '대조할 날짜가 없습니다'};
    store.set('gsyncExisting', ex);
    if (S.open && S.view === 'gsync') renderMain();
    const p = gsyncGet();
    return {ok: true, dates: ex.dates.length, records: ex.records.length, counts: p ? p.counts : null};
  }
  // 대조가 필요한 날짜와 후보 목록(에이전트용, 읽기 전용)
  async function gsyncPlanForAgent() {
    await loadApps();
    const p = gsyncGet();
    if (!p) return null;
    return {compared: p.compared, counts: p.counts, needDates: R.gsyncNeedDates(p.items), items: p.items.map(i => ({key: i.key, title: i.title, layer: i.layer, startYmd: i.startYmd, endYmd: i.endYmd, time: i.time, state: i.state, docNo: i.docNo, match: i.match || null}))};
  }
