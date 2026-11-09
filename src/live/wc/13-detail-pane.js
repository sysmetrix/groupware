// GW 통합 업무센터 · detail pane
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- detail pane ----------
  function renderPane() {
    const pane = $('#pane');
    const show = !!(S.sel || S.pane.url || S.focus);
    wcEl.classList.toggle('nopane', !show);
    wcEl.classList.toggle('expanded', show && S.pane.expanded);
    if (!show) { pane.innerHTML = ''; S.pane.mounted = ''; return; }
    if (!pane.querySelector('#ph')) pane.innerHTML = '<div class="ph" id="ph"></div><div id="autofill"></div><div class="frame" id="frame"></div><div id="fbar"></div>';
    const info = paneInfo();
    const ph = $('#ph');
    const keepScroll = ph.querySelector('.in') ? ph.scrollTop : 0;
    const isViewer = S.pane.url && /ecm001A07|SynapDocViewServer/.test(decodeURIComponent(S.pane.url));
    ph.className = 'ph' + (S.pane.url ? (isViewer ? ' viewer' : '') : ' min');
    const x = selectedAction();
    const st = x ? stateOf(x) : '';
    ph.innerHTML = `<div class="top"><button class="btn sm ghost" data-act="closePane" title="상세 창 닫기 (Esc)">${ic('x')}닫기</button><span class="sp"></span>${isViewer ? '<span class="muted">문서 미리보기</span>' : ''}${S.pane.url ? `<button class="btn sm ghost" data-act="paneExpand" title="${S.pane.expanded ? '목록과 나란히 보기' : '원래 화면을 넓게 보기'}">${ic('expand')}${S.pane.expanded ? '나란히' : '넓게'}</button><a class="btn sm ghost" href="${esc(S.pane.url)}" target="_blank" rel="noopener" title="새 창으로 열기">${ic('ext')}새 창</a>` : ''}</div>
<div class="in"><div class="box warn" id="dirtyNote" style="display:${S.pane.dirty ? 'block' : 'none'};margin:0 0 10px">${ic('alert')} 원래 화면에 입력 중입니다. 보내기·저장·상신 전에 다른 곳으로 옮기면 먼저 여쭤봅니다.</div>
${x ? `<div class="state"><span class="bdg ${st}">${STATE_NAME[st]}</span>${x.headline ? `<b class="${['overdue', 'urgent'].includes(st) ? 'err' : ''}">${esc(x.headline)}</b>` : ''}</div>` : ''}<div class="t">${esc(info.title || '')}</div>${info.body || ''}</div>`;
    ph.scrollTop = keepScroll;
    const frame = $('#frame');
    if (S.pane.url !== S.pane.mounted) {
      frame.innerHTML = '';
      S.pane.dirty = false;
      if (S.pane.url) { const f = document.createElement('iframe'); f.src = S.pane.url; f.title = '그룹웨어 원래 화면'; const u = S.pane.url; f.addEventListener('load', () => { scanFrame(f, u); watchDirty(f, u); }); frame.append(f); }
      S.pane.mounted = S.pane.url;
    }
    frame.classList.toggle('idle', !S.pane.url);
    if (!S.pane.url) frame.innerHTML = `<div class="fe">${info.url ? `<div>${ic('ext', 'style="width:30px;height:30px"')}</div><div>그룹웨어 원래 화면을 여기에 열어 그대로 처리할 수 있습니다.<br><span class="muted">원래 화면의 버튼(결재·접수·배부·발송·보내기)은 실제로 처리됩니다.</span></div><button class="btn primary" data-act="paneOpenMain">원래 화면 열기</button>` : '<div class="muted">이 항목은 열 화면이 없습니다.</div>'}</div>`;
    $('#fbar').innerHTML = focusBar();
    const af = $('#autofill'); if (af) af.innerHTML = autoFillBar();
  }
  // Mark the pane "dirty" as soon as the user types anything in the embedded groupware screen
  // (답장 본문, 결재 의견, 기안 제목 ...), including nested editor iframes.
  function watchDirty(f, url) {
    const seen = new WeakSet();
    const mark = () => { if (S.pane.url === url && !S.pane.dirty) { S.pane.dirty = true; const b = $('#dirtyNote'); if (b) b.style.display = 'block'; } };
    const attach = doc => {
      if (!doc || seen.has(doc)) return;
      seen.add(doc);
      // ONLY listen to genuine user typing (trusted keydown with printable key, paste, drop)
      // NEVER trigger on programmatic change/input events fired during form initialization!
      ['keydown', 'paste', 'drop'].forEach(ev => doc.addEventListener(ev, e => {
        if (!e.isTrusted) return;
        if (ev === 'keydown') {
          if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) mark();
        } else {
          mark();
        }
      }, true));
    };
    const scan = () => { if (!f.isConnected || S.pane.url !== url) return false; try { const walk = doc => { attach(doc); for (const i of doc.querySelectorAll('iframe')) { try { walk(i.contentDocument); } catch {} } }; walk(f.contentDocument); } catch {} return true; };
    scan();
    const t = setInterval(() => { if (!scan()) clearInterval(t); }, 1500);
  }
  // Ask before throwing away what the user typed in the pane.
  function leavePane() {
    if (!S.pane.url || !S.pane.dirty) return true;
    const ok = confirm('처리 창에 입력하던 내용이 있습니다(답장·의견·기안 등).\n보내기·저장·상신을 하지 않았다면 이동할 때 사라집니다.\n(메일은 그룹웨어 설정에 따라 임시보관함에 자동 저장됐을 수 있습니다.)\n그래도 이동할까요?');
    if (ok) S.pane.dirty = false;
    return ok;
  }
  // After the user opens a document, read its text (same origin) and pull out deadlines.
  function scanFrame(f, url, tries = 0) {
    if (!f.isConnected || url !== S.pane.url) return;
    let text = '';
    try {
      const collect = doc => { if (!doc || !doc.body) return; text += '\n' + doc.body.innerText; for (const ta of doc.querySelectorAll('textarea,input[type=text],input:not([type])')) text += '\n' + (ta.value || ''); for (const inner of doc.querySelectorAll('iframe')) { try { collect(inner.contentDocument); } catch {} } };
      collect(f.contentDocument);
    } catch { return; }
    // Detect interlocked document error (연동본문 데이터 조회 실패)
    if (text.includes('연동본문 데이터 조회 실패') || (text.includes('연동본문') && text.includes('실패'))) {
      S.pane.dirty = false;
      const b = $('#dirtyNote'); if (b) b.style.display = 'none';
      try {
        const allBtns = [...f.contentDocument.querySelectorAll('button')];
        const ok = allBtns.find(btn => btn.innerText.trim() === '확인');
        if (ok) ok.click();
      } catch {}
      toast('이 양식은 근태관리/회계 화면에서 상신해야 하는 연동 양식입니다. 관련 화면(근태신청/전체양식)을 이용하세요.');
      return;
    }
    if (text.replace(/\s/g, '').length < 80 && tries < 8) { setTimeout(() => scanFrame(f, url, tries + 1), 1200); return; }
    const deadlines = R.extractAllDeadlines(text).filter(x => x.dday >= -1 && x.dday <= 120);
    const flat = text.replace(/\s+/g, ' ');
    const asks = (flat.match(/[^.。]*?(?:제출|회신|요청|협조|참석|신청)[^.。]{0,60}(?:바랍니다|주시기|요청드|부탁)/g) || []).slice(0, 3);
    const attach = (text.match(/붙임\s*[^\n]{0,80}/g) || []).slice(0, 4);
    const amounts = [...new Set((flat.match(/\d{1,3}(?:,\d{3})+\s*원/g) || []))].slice(0, 5);
    S.pane.extract = {url, deadlines, asks, attach, amounts};
    const box = $('#extract');
    if (box) box.innerHTML = extractHtml();
  }
  const extractHtml = () => {
    const x = S.pane.extract;
    if (!x || x.url !== S.pane.url) return S.pane.url ? '<span class="muted"><span class="spin"></span> 열린 원문에서 기한·요청을 찾는 중…</span>' : '<span class="muted">원문을 열면 본문에서 기한·요청·금액을 자동으로 찾아 보여 줍니다.</span>';
    const nx = R.nextDeadline(x.deadlines);
    return `<b>원문 자동 추출</b>${x.deadlines.length ? `<div>${x.deadlines.map(d => `<span class="pill ${d.dday <= 1 ? 'solid' : d.dday <= 3 ? 'high' : 'medium'}" title="${esc(d.context)}">${esc(d.date.slice(5))}${d.time ? ' ' + esc(d.time) : ''} ${ddayText(d.dday)}</span>`).join('')}</div><div class="muted">${esc(nx ? nx.context : '')}</div>` : '<div class="muted">기한 표현을 찾지 못했습니다.</div>'}${x.asks.length ? `<div style="margin-top:4px">${x.asks.map(a => `· ${esc(a.trim().slice(0, 140))}`).join('<br>')}</div>` : ''}${x.amounts.length ? `<div class="muted">금액: ${x.amounts.map(esc).join(', ')}</div>` : ''}${x.attach.length ? `<div class="muted" style="margin-top:4px">${x.attach.map(esc).join('<br>')}</div>` : ''}<div class="acts">${nx ? `<button class="btn sm" data-act="todoFromExtract">${esc(nx.date.slice(5))} 기한으로 할 일 추가</button>` : ''}</div>`;
  };
  const relatedQ = t => String(t || '').replace(/\(.*?\)|\[.*?\]|「|」|『|』|20\d{2}년?/g, ' ').split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');
  function paneInfo() {
    const sel = S.sel;
    if (!sel) return {title: S.focus ? '연속 처리' : '그룹웨어 화면', url: S.pane.url, body: ''};
    if (sel.type === 'action') {
      const x = selectedAction();
      if (!x) return {title: '항목이 목록에서 사라졌습니다', body: '<div class="box okb">그룹웨어에서 처리됐거나 조건이 바뀌었습니다. 새로고침 후 목록에서 다시 선택하세요.</div>'};
      const why = `${x.context && x.type !== 'attendance' ? `<div class="box tip" style="margin-top:8px">${esc(x.context)}</div>` : ''}${x.scope === 'ref' && x.refReason ? `<div class="box" style="margin-top:8px"><b>참고로 분류한 이유</b> ${esc(x.refReason)} <button class="btn sm" data-act="rowMenu" data-k="${esc(x.key)}">내 일로 지정</button></div>` : ''}${x.why && x.why.length ? `<div class="muted" style="margin-top:6px">판단 근거: ${esc(x.why.join(', '))}</div>` : ''}`;
      if (x.type === 'doc') return docPane(findDoc(x.ref.kind, x.ref.docId) || {title: x.title, url: x.url, docId: x.ref.docId}, x.ref.kind, x, why);
      if (x.type === 'mail') return mailPane(findMail(x.ref.box, x.ref.uid), x, why);
      if (x.type === 'notice') return {title: x.title, url: x.url, body: `${why}<div class="kv"><b>구분</b><span>${esc(x.kind)}</span><b>작성</b><span>${esc(x.detail)}</span><b>등록</b><span>${esc(x.when)}</span></div><div class="box warn">원문을 열면 게시글이 읽음 처리되고 조회수가 올라갑니다.</div>${actsFor(x.url, {key: x.key, q: relatedQ(x.title), title: x.title, unread: true, what: '게시글'})}<div class="box" id="extract">${extractHtml()}</div>`};
      if (x.type === 'attendance') return {title: x.title, url: x.url, body: `<div class="kv"><b>그룹웨어 기록</b><span>${esc(x.att ? `${x.att.result}${x.att.status ? `(${x.att.status})` : ''}${x.att.item ? ` · ${x.att.item}` : ''}` : x.detail)}</span><b>알아 둘 것</b><span>${esc(x.context || x.detail)}</span></div>${x.att && x.att.applied ? '<div class="muted">근태신청 결재가 끝나면 그룹웨어 기록이 바뀌고 이 항목은 저절로 사라집니다.</div>' : '<div class="muted">"정상입니다"는 이 화면에서만 내리는 표시입니다. 그룹웨어 기록은 근태신청 결재가 끝나야 바뀝니다.</div>'}${actsFor(x.url, {key: x.key, title: '근태신청', primaryLabel: '근태신청 화면 열기', extra: x.att && x.att.applied ? '' : `<button class="btn" data-act="markDone" data-k="${esc(x.key)}">${ic('check')}정상입니다</button>`})}<div class="acts" style="margin-top:4px"><button class="btn sm ghost" data-act="goAttendanceDay" data-v="${esc(x.ref.date)}">${ic('cal')}근태 달력에서 이 날 보기</button></div>`};
      if (x.type === 'conflict') return {title: x.title, url: x.url, body: `${why}<div class="box warn"><b>휴가일 마감</b> ${esc(x.detail)}</div>${actsFor(x.url, {key: x.key, title: x.title})}`};
      return {title: x.title, url: x.url, body: `${why}<div class="kv"><b>구분</b><span>${esc(x.area)} · ${esc(x.kind)}</span><b>내용</b><span>${esc(x.detail)}</span></div>${actsFor(x.url, {key: x.key, title: x.title})}`};
    }
    if (sel.type === 'doc') { const d = findDoc(sel.kind, sel.docId) || (S.apMore[sel.kind] || []).find(x => x.docId === sel.docId); return docPane(d || {title: '문서', docId: sel.docId}, sel.kind, null, ''); }
    if (sel.type === 'mail') return mailPane(findMail(sel.box, sel.uid), null, '');
    if (sel.type === 'search') return searchPane(sel.item);
    if (sel.type === 'ledger') {
      const r = sel.row;
      return {title: r.desc, url: '', body: `<div class="kv"><b>결의일</b><span>${esc(ymd8(r.date))}</span><b>금액</b><span>${won(r.amount)}원</span><b>문서번호</b><span>${esc(r.docNo)}</span><b>작성</b><span>${esc(r.dept)} ${esc(r.writer)}</span><b>전표</b><span>${esc(r.slip)}</span><b>과목</b><span>${esc(r.name)} (${esc(r.code)})</span></div><div class="acts">${r.docNo ? `<button class="btn primary" data-act="findDocNo" data-no="${esc(r.docNo)}" data-t="${esc(r.desc)}">결재문서 찾아 열기</button>` : ''}<button class="btn" data-act="todoFromSel">할 일 추가</button></div><div id="docNoResult"></div>`};
    }
    if (sel.type === 'frame') return {title: sel.title, url: sel.url, body: ''};
    return {title: '', url: '', body: ''};
  }
  function docPane(d, kind, action, why) {
    const url = d.url || (action && action.url);
    const hist = S.routing ? (kind === 'distWaiting' ? S.routing.dist : kind === 'deptWaiting' ? S.routing.dept : []) : [];
    const rec = hist.length ? R.recommendRouting(d, hist, {target: kind === 'distWaiting' ? 'toDept' : 'toEmp', limit: 3}) : null;
    let recBox = '';
    if (['distWaiting', 'deptWaiting'].includes(kind)) {
      const label = kind === 'distWaiting' ? '배부 추천' : '접수 추천 담당자';
      if (!S.routing) recBox = `<div class="box tip"><b>${label}</b> <button class="btn sm" data-act="reloadRouting">처리 이력 읽고 추천 받기</button></div>`;
      else {
        const grp = rec && rec.group;
        recBox = `<div class="box tip"><b>${label}</b> <span class="muted">최근 180일 비슷한 문서 ${rec ? rec.similar : 0}건 기준</span>${grp ? `<div style="margin:4px 0">가장 비슷한 지난 문서는 <b>${grp.targets.length}곳</b>에 함께 ${kind === 'distWaiting' ? '배부' : '접수'}: ${esc(grp.targets.join(', '))}<div class="muted">${esc(grp.title)} · ${esc(grp.from)} · ${esc(String(grp.date).slice(0, 10))}</div></div>` : ''}${rec && rec.length ? rec.map(r => `<div>${esc(r.name)} <span class="pill ${r.level === '높음' ? 'ok' : 'low'}">${r.level === '높음' ? '가능성 높음' : '가능성 낮음'}</span><span class="muted">비슷한 ${r.of}건 중 ${r.count}건 · ${esc(r.reasons.join(', '))}</span>${r.examples[0] ? `<div class="muted">예: ${esc(r.examples[0].title)} (${esc(String(r.examples[0].date).slice(0, 10))})</div>` : ''}</div>`).join('') : '<div class="muted">제목 주제가 겹치는 처리 이력이 없습니다.</div>'}</div>`;
      }
    }
    const waiting = ['distWaiting', 'deptWaiting'].includes(kind);
    const pv = waiting ? {found: false} : S.pane.preview && S.pane.preview.key === (d.docNo || d.title) ? S.pane.preview.data : null;
    const pvBox = `<div class="box" id="pvbox">${pv === null ? '<span class="muted"><span class="spin"></span> 열람 기록 없이 미리보기를 찾는 중…</span>' : pv.found ? `<b>미리보기</b> <span class="muted">통합검색 색인에서 읽음 · 열람 기록 없음</span>${(() => { const dl = R.extractAllDeadlines(pv.text || '').filter(x => x.dday >= -1); return dl.length ? `<div>${dl.map(x => `<span class="pill ${x.dday <= 1 ? 'solid' : 'medium'}" title="${esc(x.context)}">${esc(x.date.slice(5))} ${ddayText(x.dday)}</span>`).join('')}</div>` : ''; })()}<div class="pv">${esc((pv.text || '').slice(0, 2500))}</div>${pv.files && pv.files.length ? `<div class="muted">첨부: ${pv.files.map(f => esc(f.name)).join(', ')}</div>` : ''}` : `<span class="muted">미리보기 없음: ${['distWaiting', 'deptWaiting'].includes(kind) ? '접수·배부 전 문서는 통합검색 색인에 아직 없어 원문으로만 볼 수 있습니다.' : '통합검색 색인에서 이 문서를 찾지 못했습니다.'}</span>`}</div>`;
    if (pv === null) loadPreview(d).then(p => { S.pane.preview = {key: d.docNo || d.title, data: p}; const b = $('#pvbox'); if (b && S.sel) renderPane(); });
    const warn = d.unread ? '<div class="box warn">아직 열람하지 않은 문서입니다. 처리 창에 열면 그룹웨어에 열람으로 기록됩니다.</div>' : '';
    const title = d.title || (action && action.title) || '';
    return {title, url, body: `${why || ''}<div class="kv"><b>구분</b><span>${esc((S.a.approval.lists[kind] || {}).label || kind)}</span><b>문서번호</b><span>${esc(d.docNo || '-')}</span><b>보낸 곳</b><span>${esc(d.sender || '-')}</span><b>기안·담당</b><span>${esc([d.drafterDept, d.drafter, d.toEmp].filter(Boolean).join(' ') || '-')}</span><b>상태</b><span>${esc(d.status || '-')}</span><b>일시</b><span>${esc(d.date || '-')}</span><b>첨부</b><span>${d.attachments || 0}개</span>${action && action.deadline ? `<b>기한</b><span>${esc(action.deadline.date)}${action.deadline.time ? ' ' + esc(action.deadline.time) : ''} (${ddayText(action.deadline.dday)})</span>` : ''}</div>${recBox}${warn}${actsFor(url, {key: action ? action.key : `doc:${kind}:${d.docId}`, q: relatedQ(title), title, unread: d.unread})}${pvBox}<div class="box" id="extract">${extractHtml()}</div>`};
  }
  function actsFor(url, {key, q, title, unread, what, extra, primaryLabel} = {}) {
    return `<div class="acts">${url ? `<button class="btn primary" data-act="openUrl" data-url="${esc(url)}" data-title="${esc(title || '')}" ${unread ? `data-unread="1" data-what="${esc(what || '문서')}"` : ''}>${ic('ext')}${esc(primaryLabel || '원래 화면 열기')}</button>` : ''}${extra || ''}<button class="btn" data-act="todoFromSel">${ic('plus')}할 일에 추가</button>${q ? `<button class="btn" data-act="related" data-q="${esc(q)}">${ic('search')}관련 문서</button>` : ''}${key ? `<button class="btn icon" data-act="rowMenu" data-k="${esc(key)}" aria-label="더 보기" title="내일 다시 보기 · 숨기기 · 상관없음">${ic('more')}</button>` : ''}</div>`;
  }
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const extOf = name => (String(name).match(/\.([A-Za-z0-9]{1,5})$/) || [])[1]?.toLowerCase() || '';
  // Attachments: read once for mails already read (no state change); unread mails need consent.
  async function loadMailDetail(m, allowMarkRead = false) {
    S.mailDet = S.mailDet || {}; S.mailDetBusy = S.mailDetBusy || {};
    if (S.mailDetBusy[m.uid]) return;
    S.mailDetBusy[m.uid] = 1;
    try {
      const r = await GW.mailDetail({uid: m.uid, seen: m.seen === true, allowMarkRead});
      S.mailDet[m.uid] = r;
      if (allowMarkRead) m.seen = true;
    } catch (e) { S.mailDet[m.uid] = {error: e.message}; }
    delete S.mailDetBusy[m.uid];
    if (S.sel && (S.sel.uid === m.uid || (S.sel.key || '').endsWith(':' + m.uid))) renderPane();
  }
  // The groupware's own document viewer (HWP·PDF·엑셀 등), same request the mail read view makes.
  const previewUrl = (c, uid, f) => '/#popup?' + new URLSearchParams({authKeyMap: JSON.stringify({email: `link@${(c.account || '').split('@')[1] || location.hostname.replace(/^gw\./, '')}`, muid: String(uid), empSeq: '-1'}), fileSn: f.sn, moduleGbn: 'MAIL', path: '/ecm/ecm001A07', pathSeq: '700', callComp: 'UAA0700', popupUUID: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))}).toString();
  async function downloadMailFile(uid, i, btn) {
    const c = S.mailDet && S.mailDet[uid];
    const f = c && c.files[i];
    if (!f) return false;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 받는 중'; }
    try {
      const blob = await GW.mailAttachment({uid, sn: f.sn, account: c.account});
      GW.saveBlob(blob, f.name);
      if (btn) { btn.innerHTML = `${ic('check')}받음`; }
      return true;
    } catch (e) {
      if (btn) { btn.disabled = false; btn.innerHTML = `${ic('down')}다시 받기`; }
      toast(`"${f.name}"을(를) 받지 못했습니다: ${e.message}. "메일 원문 열기"에서 받을 수 있습니다.`);
      return false;
    }
  }
  function mailFilesBox(m) {
    S.mailDet = S.mailDet || {};
    const c = S.mailDet[m.uid];
    if (!c) {
      if (m.seen) { setTimeout(() => loadMailDetail(m), 0); return `<div class="sec"><div class="sh">${ic('clip')}첨부파일</div><div class="sk"></div><div class="sk" style="width:70%"></div></div>`; }
      return `<div class="sec"><div class="sh">${ic('clip')}본문·첨부파일</div><div class="box warn" style="margin-top:0">아직 읽지 않은 메일입니다. 본문과 첨부를 불러오면 그룹웨어에 <b>읽음</b>으로 표시됩니다.<div class="acts"><button class="btn primary sm" data-act="mailDetail" data-uid="${esc(m.uid)}" data-box="${esc(m.box)}">본문·첨부 불러오기</button></div></div></div>`;
    }
    if (c.error) return `<div class="sec"><div class="sh">${ic('clip')}첨부파일</div><div class="box errb" style="margin-top:0">첨부 정보를 불러오지 못했습니다(${esc(c.error)}). <button class="btn sm" data-act="mailDetailRetry" data-uid="${esc(m.uid)}" data-box="${esc(m.box)}">다시 시도</button></div></div>`;
    const n = c.files.length + c.bigFiles.length;
    const fileRow = (name, size, btn) => `<div class="file"><span class="ext ${esc(extOf(name))}">${esc((extOf(name) || 'file').toUpperCase().slice(0, 4))}</span><div class="nm"><b title="${esc(name)}">${esc(name)}</b><span>${esc(size)}</span></div>${btn}</div>`;
    const rows = [
      ...c.files.map((f, i) => fileRow(f.name, kb(f.size), `${c.account ? `<button class="btn sm ghost" data-act="pvFile" data-uid="${esc(m.uid)}" data-i="${i}" title="내려받지 않고 바로 보기">${ic('eye')}미리보기</button>` : ''}<button class="btn sm" data-act="dlFile" data-uid="${esc(m.uid)}" data-i="${i}">${ic('down')}받기</button>`)),
      ...c.bigFiles.map(f => fileRow(f.name, `${f.size} · 대용량${c.bigUntil ? ` · ${c.bigUntil}까지 받을 수 있음` : ''}`, `<a class="btn sm" href="${esc(f.href)}" target="_blank" rel="noopener">${ic('down')}받기</a>`)),
    ];
    const text = c.text ? c.text.replace(/대용량 파일첨부[\s\S]*?보관\)/, '').trim() : '';
    return `${text ? `<div class="sec"><div class="sh">${ic('mail')}본문</div><div class="body-text ${S.bodyOpen ? 'open' : ''}" id="bodyText">${esc(text.slice(0, 6000))}</div>${text.length > 240 ? `<button class="btn sm ghost" data-act="bodyToggle" style="margin-top:6px">${S.bodyOpen ? '접기' : '본문 전체 보기'}</button>` : ''}</div>` : ''}
<div class="sec"><div class="sh">${ic('clip')}첨부파일 ${n}개${c.files.length > 1 ? `<button class="btn sm" data-act="dlAll" data-uid="${esc(m.uid)}" style="margin-left:auto">${ic('down')}모두 받기</button>` : ''}</div>${n ? `<div class="files">${rows.join('')}</div>` : '<div class="muted">첨부파일이 없습니다.</div>'}${c.readUrl ? `<div class="acts"><button class="btn sm ghost" data-act="openUrl" data-url="${esc(c.readUrl)}" data-title="메일 원문: ${esc(m.subject)}">${ic('ext')}그룹웨어에서 메일 원문 보기</button></div>` : ''}</div>`;
  }
  function mailPane(m, action, why) {
    if (!m) return {title: action ? action.title : '메일', url: S.a.mail.url, body: actsFor(S.a.mail.url, {key: action && action.key, title: '받은메일함', primaryLabel: '받은메일함 열기'})};
    const ur = m.seen ? '' : 'data-unread="1" data-what="메일"';
    const c = S.mailDet && S.mailDet[m.uid];
    const to = c && c.to ? c.to.replace(/<[^>]+>/g, '').replace(/\s*,\s*/g, ', ') : '';
    const reply = `<button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('reall', m))}" data-title="전체 답장: ${esc(m.subject)}" ${ur}>전체 답장</button><button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('fw', m))}" data-title="전달: ${esc(m.subject)}" ${ur}>전달</button>`;
    return {title: m.subject || '(제목 없음)', url: GW.links.compose('re', m), body: `${why || ''}<div class="kv"><b>보낸 사람</b><span>${esc(m.from)} <span class="muted">${esc(m.fromEmail)}</span></span><b>받은 시각</b><span>${esc(m.date.slice(0, 16))}</span>${to ? `<b>받는 사람</b><span title="${esc(to)}">${esc(to.length > 90 ? to.slice(0, 90) + '…' : to)}</span>` : ''}<b>상태</b><span>${m.seen ? '읽음' : '안 읽음'}${m.answered ? ' · 답장함' : ''}${m.forwarded ? ' · 전달함' : ''}</span></div>
${c && !c.error ? '' : `<div class="body-text open" style="max-height:120px">${esc((m.preview || '').replace(/대용량 파일첨부[\s\S]*?보관\)/, '').trim()) || '미리보기 없음'}</div>`}
${mailFilesBox(m)}
<div class="acts"><button class="btn primary" data-act="openUrl" data-url="${esc(GW.links.compose('re', m))}" data-title="답장: ${esc(m.subject)}" ${ur}>${ic('mail')}답장 쓰기</button><button class="btn" data-act="mailToDraft" data-uid="${esc(m.uid)}" title="메일 내용을 바탕으로 기안문 서식을 결재 직전 상태로 자동 완성합니다">${ic('doc')}이 메일로 기안문 작성</button>${reply}${action ? `<button class="btn icon" data-act="rowMenu" data-k="${esc(action.key)}" aria-label="더 보기">${ic('more')}</button>` : ''}</div>
<p class="muted" style="margin-top:10px">답장 창은 받는 사람·제목이 채워진 채 열리고 "보내기"를 눌러야 발송됩니다.${m.seen ? '' : ' 안 읽은 메일은 답장 창을 열 때 읽음으로 바뀔 수 있어 먼저 묻습니다.'}</p>`};
  }
  function searchPane(it) {
    if (!it) return {title: '검색 결과를 찾을 수 없습니다', url: '', body: ''};
    const kw = S.search.res && S.search.res.keyword;
    if (it.type === 'doc' || it.type === 'board') {
      const dl = R.extractAllDeadlines(it.text || '').filter(x => x.dday >= -1);
      const meta = it.type === 'doc' ? `<b>문서번호</b><span>${esc(it.docNo)}</span><b>양식</b><span>${esc(it.form)}</span><b>기안</b><span>${esc(it.dept)} ${esc(it.drafter)}</span><b>일자</b><span>${esc(ymd8(it.date))}</span>` : `<b>게시판</b><span>${esc(it.catTitle)}</span><b>작성</b><span>${esc(it.writer)}</span><b>등록</b><span>${esc(it.date)}</span>`;
      return {title: it.title, url: it.url, body: `<div class="kv">${meta}<b>첨부</b><span>${it.files.map(f => esc(f.name)).join('<br>') || '-'}</span></div>${dl.length ? `<div class="box tip"><b>본문 기한</b> ${dl.map(d => `<span class="pill ${d.dday <= 1 ? 'solid' : 'medium'}" title="${esc(d.context)}">${esc(d.date.slice(5))} ${ddayText(d.dday)}</span>`).join('')}</div>` : ''}<div class="box"><b>본문 미리보기</b> <span class="muted">열람 기록 없음</span><div class="pv">${hl((it.text || it.snippet || '').slice(0, 4000), kw)}</div></div>${actsFor(it.url, {q: relatedQ(it.title), title: it.title})}<div class="box" id="extract">${extractHtml()}</div>`};
    }
    if (it.type === 'file') return {title: it.name, url: it.url, body: `<div class="kv"><b>출처</b><span>${esc(it.parent)}</span><b>올린 사람</b><span>${esc(it.owner)}</span><b>일자</b><span>${esc(it.date)}</span><b>크기</b><span>${won(it.size)} B</span></div>${actsFor(it.url, {q: relatedQ(it.parent), title: it.name})}<div class="box tip">첨부파일 미리보기(그룹웨어 문서 뷰어)가 열립니다.</div>`};
    if (it.type === 'mail') return {title: it.subject || '(제목 없음)', url: S.a.mail.url, body: `<div class="kv"><b>메일함</b><span>${esc(it.box)}</span><b>보낸 사람</b><span>${esc(it.from)}</span><b>받는 사람</b><span>${esc(it.to)}</span><b>일시</b><span>${esc(it.date)}</span></div><div class="box">${hl(it.snippet, kw)}</div><div class="acts"><button class="btn primary" data-act="openUrl" data-url="${esc(GW.links.compose('re', it))}" data-title="답장">답장 쓰기</button><button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('fw', it))}" data-title="전달">전달</button></div>${actsFor(S.a.mail.url, {q: relatedQ(it.subject), title: '받은메일함'})}`};
    return {title: it.title || it.name, url: '', body: `<div class="box">${esc(it.snippet || '')}</div>`};
  }
  const findDoc = (kind, id) => ((S.a.approval.lists[kind] || {}).docs || []).find(d => d.docId === id);
  const findMail = (box, uid) => [...(S.raw.data.mail?.inbox.records || []), ...(S.raw.data.mail?.otherUnseen || [])].find(m => m.box === box && m.uid === uid);

  function selectAction(key, {keepPane = false} = {}) {
    if (!keepPane && S.sel && S.sel.key === key) {
      if (!leavePane()) return;
      S.sel = null; S.pane.url = ''; S.pane.expanded = false;
      if (S.view === 'today') {
        root.querySelectorAll('.row.sel').forEach(r => r.classList.remove('sel'));
        renderNav();
      } else renderMain();
      renderPane();
      return;
    }
    if (!keepPane && S.sel && S.sel.key !== key && !leavePane()) return;
    S.sel = {type: 'action', key};
    if (!keepPane) { S.pane.url = ''; S.pane.extract = null; S.pane.preview = null; }
    if (S.newKeys.delete(key)) saveLocal();
    const x = selectedAction();
    if (x && x.type === 'doc' && ['distWaiting', 'deptWaiting'].includes(x.ref.kind) && !S.routing) loadRouting().then(() => renderPane());
    if (S.view === 'today') { root.querySelectorAll('.row.sel').forEach(r => r.classList.remove('sel')); const row = root.querySelector(`.row[data-k="${CSS.escape(key)}"]`); if (row) { row.classList.add('sel'); row.querySelector('.bdg.new')?.remove(); setTimeout(() => row.scrollIntoView({block: 'nearest'}), 50); } renderNav(); }
    else renderMain();
    renderPane();
  }
  function openUrl(url, {title = '', unread = false, what = '문서'} = {}) {
    if (!url) return;
    if (url !== S.pane.url && !leavePane()) return;
    if (unread && !confirm(`아직 읽지 않은 ${what}입니다. 처리 창에 열면 그룹웨어에 읽음(열람)으로 기록될 수 있습니다. 열까요?`)) return;
    if (!S.sel) S.sel = {type: 'frame', title: title || '그룹웨어 화면', url};
    S.pane.url = url; S.pane.extract = null;
    // Full groupware screens (근태신청, 메일함, 결재작성) need width: open the pane wide.
    // Full screens, viewers, and new draft compose popups require full wide view
    if (/ecm001A07|SynapDocViewServer/.test(decodeURIComponent(url)) || /MicroModuleCode=ea.*(?:tiKeyCode|draft)/.test(url) || !/#\/?popup\?/.test(url)) {
      S.pane.expanded = true;
    } else {
      S.pane.expanded = false;
    }
    renderPane();
  }
  // Would opening this item record a read/열람 in the groupware?
  function marksRead(x) {
    if (!x) return false;
    if (x.type === 'doc') { const d = findDoc(x.ref.kind, x.ref.docId); return !!(d && d.unread); }
    if (x.type === 'notice') return true;
    if (x.type === 'mail') { const m = findMail(x.ref.box, x.ref.uid); return !!(m && !m.seen); }
    return false;
  }
  function openItem(x) {
    const what = x.type === 'mail' ? '메일' : x.type === 'notice' ? '게시글' : '문서';
    if (x.type === 'mail') { const m = findMail(x.ref.box, x.ref.uid); openUrl(m ? GW.links.compose('re', m) : x.url, {title: x.title, unread: marksRead(x), what}); return; }
    openUrl(x.url, {title: x.title, unread: marksRead(x), what});
  }
  function openWindow(url, x) {
    const d = x && x.type === 'doc' ? findDoc(x.ref.kind, x.ref.docId) : null;
    if (d && d.unread && !confirm('아직 열람하지 않은 문서입니다. 새 창으로 열면 열람으로 기록됩니다. 열까요?')) return;
    window.open(url, '_blank');
  }



  
  // ---------- Smart Auto-Submission & Auto-Fill Service Engine ----------
  // 프레임 안 문서가 준비될 때까지 기다린다(고정 대기 대신). 화면이 바뀌면 중단.
  async function waitFrameDoc(url, test, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (S.pane.url !== url) return null;
      const f = $('#frame iframe');
      try { const d = f && f.contentDocument; if (d && d.readyState !== 'loading' && test(d)) return d; } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  }
  async function mailToDraft(uid) {
    const m = findMail('INBOX', uid) || [...(S.raw.data.mail?.inbox.records || []), ...(S.raw.data.mail?.otherUnseen || [])].find(x => x.uid === uid);
    if (!m) { toast('메일 정보를 찾을 수 없습니다.'); return; }
    const url = GW.links.draft('mg_20160303185413307', '일반기안문');
    openUrl(url, {title: `새 기안: [공문] ${m.subject}`});
    if (S.pane.url !== url) return; // 사용자가 이동을 취소함
    S.pane.expanded = true; renderPane();
    toast('기안 화면이 열리면 메일 내용으로 초안을 넣습니다…');
    const d = await waitFrameDoc(url, doc => !!doc.querySelector('input[placeholder="제목을 입력해주세요"]'));
    if (!d) { if (S.pane.url === url) toast('기안 화면을 준비하지 못해 자동 입력을 건너뛰었습니다. 직접 입력하세요.'); return; }
    const cleanSubj = String(m.subject || '').replace(/^(Re|Fw|전달|회신)\s*:\s*/i, '').trim();
    const previewText = (m.preview || '').replace(/대용량 파일첨부[\s\S]*?보관\)/, '').trim().slice(0, 300);
    const done = [];
    const titleInput = d.querySelector('input[placeholder="제목을 입력해주세요"]');
    if (titleInput) {
      titleInput.value = `[업무협조] ${cleanSubj}`;
      titleInput.dispatchEvent(new Event('input', {bubbles: true}));
      titleInput.dispatchEvent(new Event('change', {bubbles: true}));
      done.push('제목');
    }
    const bodyHtml = `
<p><b>1. 관련 근거</b></p>
<p>&nbsp; 가. ${esc(m.from)} 발송 메일 ("${esc(cleanSubj)}", ${esc(String(m.date || '').slice(0, 10))})</p>
<p>&nbsp; 나. (관련 계획·공문이 있으면 적으세요)</p>
<p><br></p>
<p><b>2. 요청 사항</b></p>
<p>&nbsp; 가. 발신: ${esc(m.from)}${m.fromEmail ? ' (' + esc(m.fromEmail) + ')' : ''}</p>
<p>&nbsp; 나. 개요: ${esc(previewText || cleanSubj)}</p>
<p><br></p>
<p><b>3. 추진 계획</b></p>
<p>&nbsp; 가. 일시: (적으세요)</p>
<p>&nbsp; 나. 내용: (적으세요)</p>
<p><br></p>
<p><b>4. 행정 사항</b></p>
<p>&nbsp; 가. (협조 부서·회신 기한 등)</p>`;
    let injected = false;
    const walk = doc => {
      if (!doc || injected) return;
      const hwp = doc.querySelector('#hwpEditorBoardContent') || doc.body;
      if (hwp && (hwp.isContentEditable || doc.designMode === 'on')) { hwp.innerHTML = bodyHtml; hwp.dispatchEvent(new Event('input', {bubbles: true})); injected = true; return; }
      for (const ifr of doc.querySelectorAll('iframe')) { try { walk(ifr.contentDocument); } catch {} }
    };
    // 본문 편집기는 제목보다 늦게 뜨므로 잠시 더 기다린다
    for (let i = 0; i < 20 && !injected && S.pane.url === url; i++) { walk(d); if (!injected) await new Promise(r => setTimeout(r, 400)); }
    if (injected) done.push('본문 틀');
    toast(done.length ? `메일 내용으로 ${done.join('·')}을 넣었습니다. (괄호 칸은 직접 채우고, 기록물철·결재선을 확인한 뒤 상신하세요)` : '기안 화면에서 입력칸을 찾지 못했습니다. 직접 입력하세요.');
  }

  
  function quickAttendanceApplication(type) {
    closeOverlay();
    const todayKst = R.kstNow(new Date());
    const todayLabel = `${todayKst.date}(${'일월화수목금토'[new Date(todayKst.date + 'T00:00:00Z').getUTCDay()]})`;
    let reasonText = '';
    let formTitle = '';

    if (type === 'trip') {
      formTitle = '관내출장신청';
      reasonText = `${todayLabel} 재단 주요 현안 및 업무 추진을 위한 관내출장`;
    } else if (type === 'leave') {
      formTitle = '휴가신청';
      reasonText = `${todayLabel} 개인 용무에 따른 연차 휴가 사용`;
    } else if (type === 'overtime') {
      formTitle = '휴일/시간외근무신청';
      reasonText = `${todayLabel} 재단 당면 주요 과제 완수를 위한 시간외/휴일근무`;
    }

    copyText(reasonText);
    openUrl(GW.links.route(GW.routes.attendanceRequest), {title: `근태신청: ${formTitle}`});
    S.pane.expanded = true;
    toast(`${formTitle}: 근태신청 화면을 열고 사유 예시("${reasonText.slice(0, 20)}…")를 복사했습니다. 날짜·시간을 고르고 사유란에 붙여넣기(Ctrl+V)한 뒤 직접 [신청]하세요. 오늘이 아닌 날이면 날짜를 바꾸세요.`);
  }

  async function autoFillMail(templateType) {
    const f = $('#frame iframe');
    const d = f?.contentDocument;
    if (!d) { toast('메일 작성 화면이 열려 있지 않습니다.'); return; }

    const sel = S.sel;
    const item = sel && sel.type === 'action' ? selectedAction() : (sel && sel.type === 'mail' ? findMail(sel.box, sel.uid) : null);
    const originTitle = (item ? item.title || item.subject : '').replace(/^(Re|Fw|전달|회신)\s*:\s*/i, '').trim();
    const myName = (S.raw && S.raw.principal && S.raw.principal.name) || '';
    const myDept = (S.raw && S.raw.principal && S.raw.principal.deptName) || '';
    const myDuty = (S.raw && S.raw.principal && (S.raw.principal.duty || S.raw.principal.position)) || '';
    const me = [myDept, myName, myDuty].filter(Boolean).join(' ') || '담당자';
    const hasAttach = (() => { try { const fd = f.contentDocument; return !!(fd && fd.querySelector('[class*=attach] li, [class*=file] li, .fileName, .file-name')); } catch { return false; } })();
    if ((() => { let hit = false; const look = doc => { if (!doc || hit) return; if (doc.querySelector('[data-bwyfgw-tpl]')) { hit = true; return; } for (const i of doc.querySelectorAll('iframe')) { try { look(i.contentDocument); } catch {} } }; look(d); return hit; })()) { if (!confirm('이미 넣은 회신 문구가 있습니다. 새 문구로 바꿀까요?')) return; }
    const todayStr = R.kstNow(new Date()).date;

    let bodyText = '';
    if (templateType === 'confirm') {
      bodyText = `<p>안녕하십니까, ${esc(me)}입니다.</p>
<p><br></p>
<p>보내주신 <b>[${esc(originTitle)}]</b> 건과 관련하여 담당 사항에 대한 확인 및 검토를 완료하였음을 회신드립니다.</p>
<p>&nbsp; 1. 확인 일자: ${esc(todayStr)}</p>
<p>&nbsp; 2. 확인 결과: (확인한 내용을 적으세요)</p>
<p><br></p>
<p>감사합니다.</p><p><br></p>`;
    } else if (templateType === 'submit') {
      bodyText = `<p>안녕하십니까, ${esc(me)}입니다.</p>
<p><br></p>
<p>요청하신 <b>[${esc(originTitle)}]</b> 관련 자료를 아래와 같이 작성하여 제출합니다.</p>
<p>&nbsp; 1. 제출 건명: ${esc(originTitle)}</p>
<p>&nbsp; 2. 제출 일자: ${esc(todayStr)}</p>
<p>&nbsp; 3. 제출자: ${esc(me)}</p>
<p>&nbsp; 4. 비고: ${hasAttach ? '세부 사항은 첨부파일을 참조하여 주시기 바랍니다.' : '(첨부파일을 붙이거나 내용을 적으세요)'}</p>
<p><br></p>
<p>감사합니다.</p><p><br></p>`;
    } else if (templateType === 'extend') {
      bodyText = `<p>안녕하십니까, ${esc(me)}입니다.</p>
<p><br></p>
<p>보내주신 <b>[${esc(originTitle)}]</b> 건과 관련하여, 부서 내 추가 검토 및 자료 취합 일정으로 인하여 부득이하게 제출 기한의 조정을 요청드리고자 합니다.</p>
<p>&nbsp; - 기존 기한: (공지된 기한)</p>
<p>&nbsp; - 요청 기한: (요청할 기한)</p>
<p><br></p>
<p>일정에 차질을 드려 양해 부탁드리며, 신속히 검토하여 제출하도록 하겠습니다. 감사합니다.</p><p><br></p>`;
    }

    let injected = false;
    const walk = (doc) => {
      if (!doc) return;
      for (const ifr of doc.querySelectorAll('iframe')) {
        try {
          const idoc = ifr.contentDocument;
          const ibody = idoc?.body;
          if (ibody && (ibody.isContentEditable || idoc.designMode === 'on')) {
            const old = ibody.querySelector('[data-bwyfgw-tpl]'); if (old) old.remove();
            ibody.insertAdjacentHTML('afterbegin', `<div data-bwyfgw-tpl="1">${bodyText}</div>`);
            ibody.dispatchEvent(new Event('input', {bubbles: true}));
            injected = true;
            return;
          }
          walk(idoc);
        } catch (e) {}
      }
    };
    walk(d);
    if (injected) toast(`회신 문구를 본문 맨 위에 넣었습니다. 괄호 칸을 채우고${templateType === 'submit' && !hasAttach ? ' 첨부파일을 붙인 뒤' : ''} 직접 보내세요.`);
    else toast('메일 편집기를 찾지 못했습니다. 화면이 다 뜬 뒤 다시 누르세요.');
    return injected;
  }

  function autoFillAtt() {
    const sel = S.sel;
    const x = sel && sel.type === 'action' ? selectedAction() : null;
    let reason = '휴일대체근무에 따른 대체휴무 사용';
    if (x && x.type === 'attendance') {
      const dStr = String(x.when).slice(0, 10);
      reason = x.context || `${dStr} 휴일대체근무에 따른 대체휴무 사용`;
    }
    copyText(reason);
    toast(`✓ 대체휴무 사유가 복사되었습니다 ("${reason.slice(0, 25)}..."). 근태신청 사유란에 붙여넣기(Ctrl+V)하세요.`);
  }

  function autoFillBar() {
    const u = S.pane.url || '';
    if (!u) return '';
    const isMail = u.includes('MicroModuleCode=mail');
    const isDraft = u.includes('MicroModuleCode=ea') && !u.includes('diKeyCode');
    const isAtt = u.includes('HPD0100');
    
    if (isMail) {
      return `<div class="autofill-bar"><span class="lbl">${ic('star')} 회신 자동 기입:</span><button class="btn sm" data-act="autoFillMail" data-v="confirm">✉️ 확인 회신문</button><button class="btn sm" data-act="autoFillMail" data-v="submit">✉️ 자료 제출 회신문</button><button class="btn sm" data-act="autoFillMail" data-v="extend">✉️ 기한 연장 요청</button></div>`;
    }
    if (isDraft) {
      return `<div class="autofill-bar"><span class="lbl">${ic('star')} 새로 쓰기 (내 결재문서 패턴):</span><button class="btn sm primary" data-act="quickDraft" data-t="result">📝 결과보고(계획서 선택)</button><button class="btn sm" data-act="quickDraft" data-t="plan">📝 계획서</button><button class="btn sm" data-act="quickDraft" data-t="goods">📦 물품구입</button></div>`;
    }
    if (isAtt) {
      return `<div class="autofill-bar"><span class="lbl">${ic('star')} 근태 도우미:</span><button class="btn sm" data-act="autoFillAtt">📅 대체휴무 사유 복사</button></div>`;
    }
    return '';
  }
