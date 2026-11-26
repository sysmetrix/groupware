// GW 비서 · 구글 캘린더 동기화 (그룹웨어 → 구글, 스킬 bwyf-gcal-sync 원칙)
// 원칙: 결재완료 건만 등록 후보 / 레이어(캘린더) 격리 / 메모는 스킬 표준 서식 / 사전 승인 — 이 화면은 구글 일정 작성 화면을
//       미리 채워 열 뿐이고 [저장]은 사용자가 직접 누른다. 구글 캘린더 내용은 읽지 않으므로 "등록함"은 사용자가 표시한 값이다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const gsyncState = () => (S.gsync = S.gsync || {open: '', status: '', layer: 'all'});
  const gsyncCfg = () => (S.settings.gcal = S.settings.gcal || {});
  // 등록한 캘린더 전체(내 계정 포함)에 "어느 레이어에 쓸지" 고른 표시를 붙인다. 고른 것은 settings.gcal.layers = {attend: id, personal: id}.
  function gsyncCals() {
    const c = gsyncCfg(), m = c.layers || {};
    return gcalList(c).map(x => ({...x, layer: Object.keys(m).find(k => m[k] === x.id) || ''}));
  }
  function gsyncPick(key, id) {
    if (!['attend', 'personal'].includes(key)) return;
    const c = gsyncCfg(), ok = id && gcalList(c).some(x => x.id === id);
    c.layers = {...(c.layers || {})};
    if (ok) c.layers[key] = id; else delete c.layers[key];
    saveLocal(); renderMain();
    toast(ok ? `${key === 'attend' ? '근태' : '기한'} 일정을 올릴 캘린더를 정했습니다.` : '캘린더 선택을 지웠습니다.');
  }
  function gsyncGet() {
    const c = S.appsC && S.appsC.user === currentKey && S.appsC.data;
    if (!c) return null;
    const cfg = gsyncCfg();
    return R.gsyncPlan({apps: c.apps, me: c.me, deadlines: gsyncDeadlines(), cals: gsyncCals(), synced: cfg.synced || {}, existing: store.get('gsyncExisting', null), now: new Date()});
  }
  // 기한 후보는 내가 처리할 일(급함·할 일·확인)에 딸린 것만. 광고·뉴스레터는 제외하되 "홍보 실적 제출" 같은 업무는 남긴다.
  function gsyncDeadlines() {
    if (!S.a) return [];
    return (S.a.deadlines || []).filter(d => { const ow = d.key && S.a.actions.find(a => a.key === d.key); return ow && isMine(ow) && ['overdue', 'urgent', 'todo', 'check'].includes(stateOf(ow)) && !/^\[?(?:광고|뉴스레터|이벤트)\]?|수신거부/.test(d.title || ''); });
  }
  const gsyncMd = ev => { const f = y => `${Number(y.slice(4, 6))}/${Number(y.slice(6, 8))}(${'일월화수목금토'[new Date(Date.UTC(+y.slice(0, 4), +y.slice(4, 6) - 1, +y.slice(6, 8))).getUTCDay()]})`; return ev.endYmd !== ev.startYmd ? `${f(ev.startYmd)}~${f(ev.endYmd)}` : f(ev.startYmd); };
  const GSYNC_STATE_NAME = {ready: '구글에 없음', similar: '비슷한 일정 있음', synced: '등록됨', unverified: '대조 전', hold: '결재 중 · 보류'};

  const gsyncIsStale = p => !!(p && p.compared && (!p.comparedAt || Date.now() - p.comparedAt > 24 * 60 * 60 * 1000 || p.comparedAt > Date.now() + 5 * 60 * 1000));
  function vGsync() {
    if (!allowed('googleCalendar')) return pgh('설정', '관리자 설정으로 꺼져 있습니다', '');
    const st = gsyncState(), plan = gsyncGet();
    const stale = gsyncIsStale(plan);
    const cmpBtn = plan ? gsyncCompareButton(st) : '';
    const head = pgh('설정', '', cmpBtn + (plan && plan.counts.ready && !stale ? `<button class="btn sm primary" data-act="gsyncNext">${ic('plus')}구글에 없는 일정 하나 열기</button>` : ''));
    const rules = `<details class="box tip gs-rules"><summary style="cursor:pointer"><b>이렇게 올립니다</b></summary><ul><li>그룹웨어에 <b>결재완료</b>된 내 근태(출장·시간외·휴가)와 문서에서 읽은 기한만 후보가 됩니다. 결재 중인 건은 보류합니다.</li><li>근태는 <b>5 BWYF 근태</b>, 기한은 <b>4 BWYF 개인</b> 캘린더로 나눕니다(섞지 않습니다).</li><li>[구글에 올리기]를 누르면 내용이 채워진 구글 일정 작성 화면이 열립니다. <b>캘린더와 내용을 확인하고 [저장]은 직접 누르세요.</b> GW 비서는 대신 저장하지 않습니다.</li><li>이미 올렸는지는 <b>구글 캘린더를 실제로 읽어 대조</b>한 결과로 보여 줍니다(아래 대조 상태 참고). 대조하지 않은 건 “대조 전”이며 “등록 전”이라고 단정하지 않습니다.</li></ul></details>`;
    if (!plan) return `${head}${rules}<div class="list">${'<div class="sk row"></div>'.repeat(4)}</div><p class="muted"><span class="spin"></span> 내 근태 신청 내역을 읽는 중입니다…</p>`;
    const googleCnt = plan.items.filter(i => i.state === 'synced' && i.verified === 'google').length;
    const userCnt = plan.items.filter(i => i.state === 'synced' && i.verified === 'user').length;
    const cmpBanner = plan.compared ? `<div class="box tip" role="status" aria-live="polite">구글 캘린더 대조: <b>${esc(new Date(plan.comparedAt).toLocaleString('ko-KR', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}))}</b> 기준 · 검증된 날짜 ${(plan.comparedDates || []).length}일${plan.unknownDates && plan.unknownDates.length ? ` · 파싱·조회 미확인 ${plan.unknownDates.length}일` : ''} · 구글 확인 ${googleCnt}${userCnt ? ` · 직접 표시 ${userCnt}` : ''} · 비슷한 일정 ${plan.counts.similar} · 구글에 없음 ${plan.counts.ready}${plan.counts.unverified ? ` · 대조 전 ${plan.counts.unverified}` : ''}${gsyncCompareNote(st)}</div>` : `<div class="box warn"><b>아직 구글 캘린더와 대조하지 않았습니다.</b> 아래 후보는 “대조 전”이며 이미 구글에 있을 수 있습니다.${gsyncCompareNote(st)}</div>`;
    const staleBanner = stale ? '<div class="box warn"><b>오래된 대조 결과입니다.</b> 구글 일정은 변경됐을 수 있으니 새로 대조하기 전에는 아래 결과를 현재 상태로 판단하거나 중복 등록하지 마세요.</div>' : '';
    const diffBanner = plan.diffs && plan.diffs.length ? `<div class="box warn"><b>구글 캘린더 변경·취소 확인 필요 (${plan.diffs.length}건)</b>${plan.diffs.slice(0, 6).map(df => `<div class="trow"><span><span class="bdg ${df.action === 'cancel' ? 'urgent' : 'check'}">${df.action === 'cancel' ? '취소됨' : df.action === 'update' ? '변경 확인' : '미일치'}</span> ${esc(df.date.slice(4, 6) + '/' + df.date.slice(6))} <b>${esc(df.googleTitle || df.title)}</b> · <span class="muted">${esc(df.detail)}</span></span><a class="btn sm" href="${esc('https://calendar.google.com/calendar/u/0/r/search?q=' + encodeURIComponent(df.docNo || df.googleTitle || df.title))}" target="_blank" rel="noopener">구글에서 확인</a></div>`).join('')}</div>` : '';
    // 올릴 캘린더: 이름으로 찾지 못해도 여기서 직접 고르면 연결된다(이름을 정확히 맞춰 적을 필요가 없다).
    const calsAll = gsyncCals();
    const needKeys = ['attend', ...(plan.items.some(i => i.source === 'deadline') ? ['personal'] : [])];
    const calName = x => x.name || x.id.replace(/@.*/, '').slice(0, 24);
    const pickRow = k => { const cur = R.gsyncCalendarId(calsAll, R.GSYNC_LAYERS[k]); return `<label class="gs-pick"><span>${k === 'attend' ? '근태(출장·시간외·휴가)' : '기한'}</span><select class="f${cur ? '' : ' on'}" data-gsl="${k}" aria-label="${k === 'attend' ? '근태' : '기한'} 일정을 올릴 캘린더"><option value="">고르지 않음</option>${calsAll.map(x => `<option value="${esc(x.id)}"${x.id === cur ? ' selected' : ''}>${esc(calName(x))}</option>`).join('')}</select></label>`; };
    const missing = needKeys.filter(k => !R.gsyncCalendarId(calsAll, R.GSYNC_LAYERS[k]));
    const warn = !calsAll.length
      ? `<div class="box warn">구글 일정에 등록한 캘린더가 없습니다. 먼저 내 구글 계정을 등록해 주세요. <button class="btn sm" data-act="view" data-v="gcal">구글 일정에서 등록하기</button></div>`
      : `<div class="box${missing.length ? ' warn' : ''} gs-picks"><b>${missing.length ? '올릴 캘린더를 골라 주세요' : '올릴 캘린더'}</b>${needKeys.map(pickRow).join('')}${missing.length ? '<div class="muted">고르지 않으면 구글 작성 화면에서 캘린더를 직접 골라야 합니다. 등록한 캘린더는 그대로 연결되어 있습니다.</div>' : ''}</div>`;
    if (!st.status) st.status = plan.compared ? (plan.counts.ready ? 'todo' : plan.counts.similar || plan.counts.unverified ? 'check' : 'synced') : 'check';
    const stOk = i => st.status === 'all' || (st.status === 'todo' ? i.state === 'ready' : st.status === 'check' ? i.state === 'similar' || i.state === 'unverified' : st.status === 'hold' ? i.state === 'hold' : i.state === 'synced');
    const lyOk = i => st.layer === 'all' || (st.layer === 'attend' ? i.source === 'attend' : i.source === 'deadline');
    const list = plan.items.filter(i => stOk(i) && lyOk(i));
    const c = plan.counts, seg = (cur, act, arr) => `<div class="seg">${arr.map(([k, n]) => `<button class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}" data-act="${act}" data-v="${k}">${n}</button>`).join('')}</div>`;
    const bar = `<div class="bar">${seg(st.status, 'gsyncStatus', [['todo', `구글에 없음 ${c.ready}`], ['check', `확인 필요 ${c.similar + c.unverified}`], ['synced', `등록됨 ${c.synced}`], ['hold', `보류 ${c.hold}`], ['all', '전체']])}${seg(st.layer, 'gsyncLayer', [['all', '모든 레이어'], ['attend', '근태'], ['deadline', '기한']])}</div>`;
    const row = (ev, index) => {
      const open = st.open === ev.key;
      const detail = open ? `<div class="gs-detail" id="gs-detail-${index}" role="region" aria-label="${esc(ev.title)} 상세"><dl class="gs-kv"><div><dt>레이어</dt><dd>${esc(ev.layer)}${ev.calId ? '' : ' <span class="muted">(캘린더 미연결)</span>'}</dd></div><div><dt>일시</dt><dd>${esc(gsyncMd(ev))}${ev.time ? ' ' + esc(ev.time) : ' 종일'}</dd></div>${ev.location ? `<div><dt>장소</dt><dd>${esc(ev.location)}</dd></div>` : ''}${ev.docNo ? `<div><dt>문서번호</dt><dd>${esc(ev.docNo)}</dd></div>` : ''}</dl>${ev.match && ev.match.title ? `<div class="gs-found">${ev.state === 'synced' ? '구글 캘린더에서 확인됨' : '구글에 있는 비슷한 일정'}: <b>${esc(ev.match.title)}</b>${ev.match.cal ? ` <span class="muted">(${esc(ev.match.cal)})</span>` : ''}</div>` : ev.verified === 'user' ? '<div class="gs-found">사용자가 “올렸어요”로 표시함</div>' : ''}<div class="gs-memo-k">새로 올린다면 구글 일정 메모(설명)에 들어갈 내용</div><pre class="gs-memo">${esc(ev.details)}</pre><div class="acts">${ev.state === 'hold' ? '<span class="muted">결재가 끝나면 등록할 수 있습니다.</span>' : `<button class="btn ${ev.state === 'ready' || ev.state === 'unverified' ? 'primary' : ''}" data-act="gsyncUp" data-v="${esc(ev.key)}">${ic('ext')}${ev.state === 'synced' ? '그래도 새로 올리기' : ev.state === 'similar' ? '새로 올리기' : '구글에 올리기'}</button>`}<button class="btn" data-act="gsyncFind" data-v="${esc(ev.key)}">구글에서 찾아보기</button>${ev.state === 'hold' || ev.verified === 'google' ? '' : ev.state === 'synced' ? `<button class="btn" data-act="gsyncMark" data-v="${esc(ev.key)}">등록됨 표시 해제</button>` : `<button class="btn" data-act="gsyncMark" data-v="${esc(ev.key)}">이미 올려져 있어요 (등록됨 표시)</button>`}</div></div>` : '';
      return `<div class="gs-row gs-${ev.state}"><button class="gs-main" data-act="gsyncOpen" data-v="${esc(ev.key)}" aria-expanded="${open}"${open ? ` aria-controls="gs-detail-${index}"` : ''}><span class="gs-l"><span class="gs-date">${esc(gsyncMd(ev))}</span><span class="gs-title">${esc(ev.title)}</span><span class="gs-sub">${esc(ev.time || '종일')}${ev.location ? ' · ' + esc(ev.location) : ''}</span></span><span class="gs-r"><span class="bdg ${ev.source === 'deadline' ? 'tag' : 'info'}">${esc(ev.source === 'deadline' ? '기한' : '근태')}</span><span class="bdg ${ev.state === 'synced' ? 'confirm' : ev.state === 'hold' ? 'check' : 'todo'}">${esc(GSYNC_STATE_NAME[ev.state])}</span></span></button>${detail}</div>`;
    };
    const busyBanner = st.busy ? '<div class="box warn" role="status" aria-live="polite"><b>구글 캘린더를 읽는 중입니다.</b> 읽을 때까지 아래 표시는 확정이 아니므로 등록하지 마세요. 읽는 동안 보이지 않는 탭이 잠시 열렸다 닫힙니다.</div>' : '';
    return `${head}${busyBanner}${staleBanner}${plan.unknownDates && plan.unknownDates.length ? `<div class="box warn" role="status">파싱·조회 미확인 ${plan.unknownDates.length}일: ${plan.unknownDates.map(d => esc(d)).join(', ')}. 해당 날짜는 비어 있거나 동기화 완료된 것으로 판단하지 않습니다.</div>` : ''}${cmpBanner}${diffBanner}${rules}${warn}${bar}${list.length ? `<div class="gs-list">${list.map(row).join('')}</div>` : `<div class="list"><div class="empty"><b>${st.status === 'todo' ? '구글에 없는 일정이 없습니다' : '해당하는 항목이 없습니다'}</b>${plan.compared ? '현재 필터에 해당하는 항목이 없습니다. 다른 상태·레이어와 미확인 날짜도 확인하세요.' : '구글 캘린더와 대조한 뒤 다시 확인하세요.'}</div></div>`}<p class="muted" style="margin-top:10px">부서 행사·공지(3 BWYF 부서)와 메신저 일정은 원문 확인이 필요해 자동으로 후보를 만들지 않습니다.</p>`;
  }

  // ── 구글 캘린더 대조: 확장 프로그램(bridge.js → 서비스 워커)이 보이지 않는 탭에서 구글 일 보기를 읽어 온다(읽기 전용).
  //    확장이 없거나 오래되었으면(북마크릿 등) 버튼 대신 Aside에게 맡기는 안내만 보인다.
  const gsyncHasBridge = () => document.documentElement.getAttribute('data-bwyfgw-gcal') === '1';
  const GSYNC_ERR = {
    login: '구글 캘린더에 로그인되어 있지 않습니다. 이 브라우저에서 구글 캘린더(calendar.google.com)에 로그인한 뒤 다시 눌러 주세요.',
    busy: '다른 대조가 진행 중입니다. 끝난 뒤 다시 눌러 주세요.',
    'no-extension': '확장 프로그램이 응답하지 않습니다. 확장 프로그램 페이지에서 GW 비서를 새로고침한 뒤 그룹웨어를 새로고침(F5) 해 주세요.',
    disconnected: '확장 프로그램과의 연결이 끊겼습니다. 그룹웨어를 새로고침(F5)한 뒤 다시 눌러 주세요.',
    timeout: '구글 캘린더를 읽는 데 시간이 너무 오래 걸렸습니다. 잠시 뒤 다시 눌러 주세요.',
    'bad-dates': '대조할 날짜가 올바르지 않습니다.',
    failed: '구글 캘린더를 읽지 못했습니다. 잠시 뒤 다시 눌러 주세요.',
  };
  function gsyncCompareButton(st) {
    if (!gsyncHasBridge()) return '';
    return st.busy ? `<button class="btn sm" disabled>${st.busy.pass ? '다시 확인 ' : ''}${st.busy.done || 0}/${st.busy.total || '?'}일 읽는 중…</button>` : `<button class="btn sm" data-act="gsyncCompare">구글 캘린더와 지금 대조</button>`;
  }
  function gsyncCompareNote(st) {
    if (gsyncHasBridge()) return `<div class="muted" style="margin-top:4px">[구글 캘린더와 지금 대조]를 누르면 보이지 않는 탭에서 후보 날짜의 구글 일정을 읽어 반영합니다(읽기만 하며 구글 캘린더는 바꾸지 않습니다). 구글에 로그인되어 있어야 합니다.${st.err ? `<br><b>${esc(st.err)}</b>` : ''}</div>`;
    return `<div class="muted" style="margin-top:4px">이 화면의 확장 프로그램에는 대조 기능이 없습니다. 확장 프로그램을 최신판으로 새로고침하거나, Aside에게 “구글 캘린더와 대조해줘”라고 말하세요.</div>`;
  }
  function gsyncRead(dates, careful, onProgress) {
    return new Promise(resolve => {
      const id = 'gs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      let timer;
      const done = r => { clearTimeout(timer); window.removeEventListener('message', on); resolve(r); };
      const on = ev => {
        const m = ev.data;
        if (ev.source !== window || !m || m.bwyfgw !== 'gcal-reply' || m.id !== id) return;
        if (m.type === 'progress') { onProgress({done: Math.max(0, Math.floor(+m.done) || 0), total: Math.max(0, Math.floor(+m.total) || 0)}); return; }
        if (m.type === 'result') done(m);
      };
      window.addEventListener('message', on);
      timer = setTimeout(() => done({ok: false, error: 'timeout'}), 150000);
      window.postMessage({bwyfgw: 'gcal-read', id, dates, careful: !!careful}, location.origin);
    });
  }
  async function gsyncCompare() {
    const st = gsyncState();
    if (st.busy) return;
    if (!gsyncHasBridge()) { toast(GSYNC_ERR['no-extension']); return; }
    const plan = gsyncGet();
    const dates = plan ? R.gsyncNeedDates(plan.items) : [];
    if (!dates.length) { toast('대조할 날짜가 없습니다.'); return; }
    st.err = ''; st.busy = {done: 0, total: dates.length};
    renderMain();
    // 구글 탭이 눈에 보이지 않으면 일정이 늦게 그려져 일부가 빠진 채 읽힐 수 있다. "구글에 없음"·"대조 전"으로 남은 날짜는 천천히 다시 읽어(최대 2번)
    // 이전에 본 일정에 합친다. 한 번이라도 본 일정은 실제로 있는 것이므로 합치는 방향이 안전하다.
    const days = {};
    let pending = dates, out = null, failed = null;
    for (let pass = 0; pass < 3 && pending.length; pass++) {
      const r = await gsyncRead(pending, pass > 0, m => { st.busy = {done: m.done, total: m.total, pass}; if (S.open && S.view === 'gsync') renderMain(); });
      if (!r.ok) { failed = r; break; }
      for (const [d, list] of Object.entries(r.days || {})) {
        if (Array.isArray(list)) days[d] = [...new Set([...(days[d] || []), ...list])];
        else if (!(d in days)) days[d] = null;
      }
      out = gsyncImport({at: Date.now(), days});
      const p = gsyncGet();
      pending = p ? R.gsyncNeedDates(p.items.filter(i => i.state === 'ready' || i.state === 'unverified')) : [];
    }
    st.busy = null;
    if (failed && out) st.err = '다시 확인하는 중 멈췄습니다. 아래 “구글에 없음”·“대조 전”은 확실하지 않으니 [구글에서 찾아보기]로 확인한 뒤 등록하세요.';
    if (failed && !out) { st.err = GSYNC_ERR[failed.error] || GSYNC_ERR.failed; renderMain(); toast(st.err); return; }
    st.status = '';
    renderMain();
    if (!out || !out.ok) { toast((out && out.error) || GSYNC_ERR.failed); return; }
    const c = out.counts;
    toast(`구글 캘린더 대조 완료: ${out.dates}일 확인${out.unknownDates.length ? ` · 읽지 못한 날 ${out.unknownDates.length}일` : ''}${c ? ` · 등록됨 ${c.synced} · 구글에 없음 ${c.ready} · 비슷한 일정 ${c.similar}` : ''}`);
  }
  HOME_ACTS.gsyncCompare = () => { gsyncCompare(); };

  function gsyncEv(key) { const p = gsyncGet(); return p ? p.items.find(i => i.key === key) : null; }
  HOME_ACTS.gsyncOpen = (el, v) => { const st = gsyncState(); st.open = st.open === v ? '' : v; renderMain(); };
  HOME_ACTS.gsyncStatus = (el, v) => { gsyncState().status = v; renderMain(); };
  HOME_ACTS.gsyncLayer = (el, v) => { gsyncState().layer = v; renderMain(); };
  function gsyncOpenForm(ev) {
    if (!ev || ev.state === 'hold') return;
    if (gsyncIsStale(gsyncGet())) { toast('대조 결과가 오래되었습니다. 새로 대조한 뒤 등록해 주세요.'); return; }
    if (!openExternalTab(R.gsyncUrl(ev, ev.calId))) { toast('새 탭이 막혔습니다. 팝업을 허용한 뒤 다시 눌러 주세요.'); return; }
    toast(ev.calId ? '구글 일정 작성 화면을 열었습니다. 캘린더와 내용을 확인하고 [저장]을 눌러 주세요.' : '구글 일정 작성 화면을 열었습니다. 캘린더를 “' + ev.layer + '”로 고른 뒤 [저장]을 눌러 주세요.');
  }
  HOME_ACTS.gsyncUp = (el, v) => gsyncOpenForm(gsyncEv(v));
  HOME_ACTS.gsyncNext = () => { const p = gsyncGet(); const ev = p && p.items.find(i => i.state === 'ready'); if (!ev) { toast('구글에 없는 일정이 없습니다.'); return; } gsyncState().open = ev.key; gsyncOpenForm(ev); renderMain(); };
  HOME_ACTS.gsyncFind = (el, v) => { const ev = gsyncEv(v); if (!ev) return; if (!openExternalTab('https://calendar.google.com/calendar/u/0/r/search?q=' + encodeURIComponent(ev.docNo || ev.title))) toast('새 탭이 막혔습니다. 팝업을 허용한 뒤 다시 눌러 주세요.'); };
  HOME_ACTS.gsyncMark = (el, v) => {
    const ev = gsyncEv(v); if (!ev || ev.state === 'hold') return;
    const c = gsyncCfg(); c.synced = {...(c.synced || {})};
    if (c.synced[v]) delete c.synced[v]; else c.synced[v] = Date.now();
    saveLocal(); renderMain(); toast(c.synced[v] ? '등록됨으로 표시했습니다(이 PC에만 기록).' : '표시를 해제했습니다.');
  };

  // Aside(스킬 bwyf-gcal-sync)가 구글 캘린더 일 보기에서 읽은 문장을 넣어 대조 상태를 갱신한다. payload: {at?, days: {YYYYMMDD: [문장…]}}
  function gsyncImport(payload) {
    const ex = R.gsyncNormalizeExisting(payload);
    if (!ex.dates.length && !ex.unknownDates.length) return {ok: false, error: '대조할 날짜가 없습니다'};
    store.set('gsyncExisting', ex);
    if (S.open && S.view === 'gsync') renderMain();
    const p = gsyncGet();
    return {ok: true, dates: ex.dates.length, unknownDates: ex.unknownDates, records: ex.records.length, counts: p ? p.counts : null};
  }
  // 대조가 필요한 날짜와 후보 목록(에이전트용, 읽기 전용)
  async function gsyncPlanForAgent() {
    await loadApps();
    const p = gsyncGet();
    if (!p) return null;
    return {compared: p.compared, counts: p.counts, needDates: R.gsyncNeedDates(p.items), items: p.items.map(i => ({key: i.key, title: i.title, layer: i.layer, source: i.source, kind: i.kind, calId: i.calId || '', startYmd: i.startYmd, endYmd: i.endYmd, time: i.time, state: i.state, docNo: i.docNo, match: i.match || null, url: i.state === 'ready' && i.source === 'attend' && i.calId ? R.gsyncUrl(i, i.calId) : ''}))};
  }
