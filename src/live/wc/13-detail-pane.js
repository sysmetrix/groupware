// GW 비서 · detail pane
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
    ph.innerHTML = `<div class="top"><button class="btn sm ghost" data-act="closePane" title="상세 창 닫기 (Esc)">${ic('x')}<span class="pane-back-txt">닫기</span></button>${S.pane.previewBack ? `<button class="btn sm ghost" data-act="returnAttachmentPreview" title="첨부 미리보기 전의 메일 처리 화면으로 돌아가기">${ic('back')}이전 메일 처리 화면으로</button>` : ''}<span class="sp"></span>${isViewer ? '<span class="muted">문서 미리보기</span>' : ''}${S.pane.url ? `<button class="btn sm ghost" data-act="paneExpand" title="${S.pane.expanded ? '목록과 나란히 보기' : '원래 화면을 넓게 보기'}">${ic('expand')}${S.pane.expanded ? '나란히' : '넓게'}</button><a class="btn sm ghost" href="${esc(S.pane.url)}" target="_blank"${/^https:\/\/gw\.bwyf\.or\.kr\//i.test(S.pane.url) ? '' : ' rel="noopener"'} title="새 창으로 열기">${ic('ext')}새 창</a>` : ''}</div>
<div class="in"><div class="box warn" id="dirtyNote" style="display:${S.pane.dirty ? 'block' : 'none'};margin:0 0 10px">${ic('alert')} 원래 화면에 입력 중입니다. 보내기·저장·상신 전에 다른 곳으로 옮기면 먼저 여쭤봅니다.</div>
${x ? `<div class="state"><span class="bdg ${st}">${STATE_NAME[st]}</span>${x.headline ? `<b class="${['overdue', 'urgent'].includes(st) ? 'err' : ''}">${esc(x.headline)}</b>` : ''}</div>` : ''}<div class="t">${esc(info.title || '')}</div>${info.body || ''}</div>`;
    ph.scrollTop = keepScroll;
    const frame = $('#frame');
    if (S.pane.url !== S.pane.mounted) {
      if (!S.pane.previewBack || !S.pane.previewBack.frame) frame.innerHTML = '';
      S.pane.dirty = false;
      if (S.pane.url) {
        const f = document.createElement('iframe'); f.src = S.pane.url; f.title = '그룹웨어 원래 화면'; if (S.pane.previewBack) f.dataset.panePreview = '1'; const u = S.pane.url;
        f.addEventListener('error', () => { if (S.pane.url === u) frame.innerHTML = `<div class="fe"><div>${ic('alert', 'style="width:28px;height:28px"')}</div><div>그룹웨어 화면을 불러오지 못했습니다.</div><a class="btn primary" href="${esc(u)}" target="_blank" rel="noopener">${ic('ext')}새 창으로 열기</a></div>`; });
        f.addEventListener('load', () => { hookFrameWindow(f, u); scanFrame(f, u); watchDirty(f, u); }); frame.append(f);
      }
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
  // 메일 쓰기(새 메일·답장·전체답장·전달) 화면인가. 메일 읽기 화면(UDAP007)과 구분한다.
  const isMailCompose = u => /MicroModuleCode=mail/.test(u || '') && /callComp=UDAP001(?:&|$)/.test(u || '');
  // 지금 처리 창에서 다루는 메일(목록에서 고른 메일 · 할 일 · 검색 결과).
  function paneMailRef() {
    const sel = S.sel;
    if (!sel) return null;
    if (sel.type === 'mail' && sel.uid) return findMail(sel.box, sel.uid) || {uid: sel.uid, box: sel.box, subject: '', seen: true};
    if (sel.type === 'action') { const x = selectedAction(); return x && x.type === 'mail' && x.ref && x.ref.uid ? (findMail(x.ref.box, x.ref.uid) || {uid: x.ref.uid, box: x.ref.box, subject: x.title || '', seen: true}) : null; }
    if (sel.type === 'search' && sel.item && sel.item.type === 'mail' && sel.item.uid) return {uid: sel.item.uid, box: sel.item.box, subject: sel.item.subject || '', seen: true};
    return null;
  }
  // 처리 창 안의 그룹웨어 화면이 새 창을 띄우려 할 때: 메일 쓰기(답장·전체답장·전달)는 새 창 대신 이 처리 창에 연다.
  // 새 창으로 뜨면 회신 문구를 넣을 수 없고 화면도 흩어진다. 그 밖의 팝업은 그룹웨어가 하던 대로 둔다.
  // 그룹웨어 화면이 스스로 닫으려 하면(보내기·취소 뒤) 처리 창을 닫아 준다. 프레임 안에서는 window.close()가 아무 일도 하지 않기 때문이다.
  function hookFrameWindow(f, url) {
    let w = null;
    try { w = f.contentWindow; if (!w || w.__bwyfgwHooked) return; w.__bwyfgwHooked = true; } catch { return; }
    const nativeOpen = w.open, nativeClose = w.close;
    const live = () => f.isConnected && S.pane.url === url;
    w.open = function (target, ...rest) {
      try {
        const s = String(target || '');
        if (live() && /#\/?popup\?/.test(s) && isMailCompose(s)) {
          const abs = new URL(s, location.origin).href;
          setTimeout(() => { if (live() && openUrl(abs, {title: '메일 쓰기'})) toast('답장·전달 화면을 새 창 대신 이 처리 창에 열었습니다. 위의 회신문 버튼을 쓸 수 있습니다.'); }, 0);
          const noop = () => {}; return {closed: false, focus: noop, blur: noop, close: noop, postMessage: noop};
        }
      } catch {}
      // 기록기는 처리 창 안의 화면만 기록한다. 새 창으로 나가면 알려 준다.
      try { if (live() && recorder) toast('새 창이 열렸습니다. 새 창에서 한 동작은 기록기에 기록되지 않습니다.'); } catch {}
      return nativeOpen.call(w, target, ...rest);
    };
    w.close = function () {
      if (!live()) return nativeClose.call(w);
      S.pane.dirty = false; delete S.pane.previewBack; S.pane.url = ''; S.pane.expanded = false; render();
      toast('그룹웨어 화면이 닫혔습니다. 처리 결과는 목록을 새로 읽어 확인합니다.');
      setTimeout(() => { try { refresh({silent: true}); } catch {} }, 1200);
    };
  }
  // Ask before throwing away what the user typed in the pane.
  function leavePane() {
    const back = S.pane.previewBack;
    const dirty = S.pane.dirty || !!(back && back.dirty);
    if (!S.pane.url || !dirty) { delete S.pane.previewBack; return true; }
    const ok = confirm('처리 창에 입력하던 내용이 있습니다(답장·의견·기안 등).\n보내기·저장·상신을 하지 않았다면 이동할 때 사라집니다.\n(메일은 그룹웨어 설정에 따라 임시보관함에 자동 저장됐을 수 있습니다.)\n그래도 이동할까요?');
    if (ok) { S.pane.dirty = false; delete S.pane.previewBack; }
    return ok;
  }
  // After the user opens a document, read its text (same origin) and pull out deadlines.
  function scanFrame(f, url, tries = 0) {
    if (!f.isConnected || url !== S.pane.url) return;
    let text = '';
    try {
      const fd = f.contentDocument;
      if (fd && (fd.querySelector('input[type="password"]') || /#\/?login/i.test(fd.location?.hash || ''))) {
        const b = $('#dirtyNote');
        if (b) { b.style.display = 'block'; b.innerHTML = `${ic('alert')} 그룹웨어 세션이 만료되었습니다. <button class="btn sm primary" data-act="relogin">다시 로그인</button>`; }
        return;
      }
      const collect = doc => { if (!doc || !doc.body) return; text += '\n' + doc.body.innerText; for (const ta of doc.querySelectorAll('textarea,input[type=text],input:not([type])')) text += '\n' + (ta.value || ''); for (const inner of doc.querySelectorAll('iframe')) { try { collect(inner.contentDocument); } catch {} } };
      collect(fd);
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
      if (x.type === 'attendance') return {title: x.title, url: x.url, body: `<div class="kv"><b>그룹웨어 기록</b><span>${esc(x.att ? `${x.att.result}${x.att.status ? `(${x.att.status})` : ''}${x.att.item ? ` · ${x.att.item}` : ''}` : x.detail)}</span>${(() => { if (GW.teamPlanned) loadApps().catch(() => {}); const ai = x.ref && x.ref.date ? myAppInfos(String(x.ref.date).replace(/-/g, '')) : null; return ai && ai.length ? `<b>신청 내용</b><span>${appInfoHtml(ai)}</span>` : ''; })()}<b>알아 둘 것</b><span>${esc(x.context || x.detail)}</span></div><div class="muted">시간외 신청일의 퇴근 지문 기록을 확인해 주세요. 이 화면의 확인 표시는 그룹웨어 기록을 변경하지 않습니다.</div>${actsFor(x.url, {key: x.key, title: '근태신청', primaryLabel: '근태신청 화면 열기', extra: `<button class="btn" data-act="markDone" data-k="${esc(x.key)}">${ic('check')}확인했습니다</button>`})}<div class="acts" style="margin-top:4px"><button class="btn sm ghost" data-act="goAttendanceDay" data-v="${esc(x.ref.date)}">${ic('cal')}근태 달력에서 이 날 보기</button></div>`};
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
    if (pv === null) { const owner = currentKey; loadPreview(d).then(p => { if (owner !== currentKey) return; S.pane.preview = {key: d.docNo || d.title, data: p}; const b = $('#pvbox'); if (b && S.sel) renderPane(); }); }
    const warn = d.unread ? '<div class="box warn">아직 열람하지 않은 문서입니다. 처리 창에 열면 그룹웨어에 열람으로 기록됩니다.</div>' : '';
    const title = d.title || (action && action.title) || '';
    return {title, url, body: `${why || ''}<div class="kv"><b>구분</b><span>${esc((S.a.approval.lists[kind] || {}).label || kind)}</span><b>문서번호</b><span>${esc(d.docNo || '-')}</span><b>보낸 곳</b><span>${esc(d.sender || '-')}</span><b>기안·담당</b><span>${esc([d.drafterDept, d.drafter, d.toEmp].filter(Boolean).join(' ') || '-')}</span><b>상태</b><span>${esc(d.status || '-')}</span><b>일시</b><span>${esc(d.date || '-')}</span><b>첨부</b><span>${d.attachments || 0}개</span>${action && action.deadline ? `<b>기한</b><span>${esc(action.deadline.date)}${action.deadline.time ? ' ' + esc(action.deadline.time) : ''} (${ddayText(action.deadline.dday)})</span>` : ''}</div>${recBox}${warn}${actsFor(url, {key: action ? action.key : `doc:${kind}:${d.docId}`, q: relatedQ(title), title, unread: d.unread})}<div id="caseFlow"></div>${pvBox}<div class="box" id="extract">${extractHtml()}</div>`};
  }
  function actsFor(url, {key, q, title, unread, what, extra, primaryLabel} = {}) {
    return `<div class="acts">${url ? `<button class="btn primary" data-act="openUrl" data-url="${esc(url)}" data-title="${esc(title || '')}" ${unread ? `data-unread="1" data-what="${esc(what || '문서')}"` : ''}>${ic('ext')}${esc(primaryLabel || '원래 화면 열기')}</button>` : ''}${extra || ''}<button class="btn" data-act="todoFromSel">${ic('plus')}할 일에 추가</button>${q ? `<button class="btn" data-act="paneCaseFlow" data-q="${esc(q)}">${ic('doc')}사안 흐름</button><button class="btn" data-act="related" data-q="${esc(q)}">${ic('search')}관련 문서</button>` : ''}${key ? `<button class="btn icon" data-act="rowMenu" data-k="${esc(key)}" aria-label="더 보기" title="내일 다시 보기 · 숨기기 · 상관없음">${ic('more')}</button>` : ''}</div>`;
  }
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const extOf = name => (String(name).match(/\.([A-Za-z0-9]{1,5})$/) || [])[1]?.toLowerCase() || '';
  // Attachments: read once for mails already read (no state change); unread mails need consent.
  async function loadMailDetail(m, allowMarkRead = false) {
    S.mailDet = S.mailDet || {}; S.mailDetBusy = S.mailDetBusy || {};
    if (S.mailDet[m.uid] && !S.mailDet[m.uid].error) return S.mailDet[m.uid];
    if (S.mailDetBusy[m.uid]) return S.mailDetBusy[m.uid];
    const owner = currentKey, epoch = S.apEpoch;
    S.mailDetBusy[m.uid] = (async () => {
      try {
        const r = await GW.mailDetail({uid: m.uid, seen: m.seen === true, allowMarkRead});
        if (owner !== currentKey || epoch !== S.apEpoch) return r;
        S.mailDet[m.uid] = r;
        if (allowMarkRead) m.seen = true;
        return r;
      } catch (e) {
        if (owner !== currentKey || epoch !== S.apEpoch) return {error: e.message};
        S.mailDet[m.uid] = {error: e.message};
        return S.mailDet[m.uid];
      } finally {
        if (owner !== currentKey || epoch !== S.apEpoch) return;
        delete S.mailDetBusy[m.uid];
        if (S.sel && (S.sel.uid === m.uid || (S.sel.key || '').endsWith(':' + m.uid))) renderPane();
      }
    })();
    return S.mailDetBusy[m.uid];
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
    const highlights = R.mailHighlights(text);
    return `<div class="sec"><div class="sh">${ic('mail')}핵심 내용 <span class="muted">본문에서 발췌 · 외부 전송 없음</span></div>${highlights.length ? `<ul class="box" style="margin:0;padding:12px 14px 12px 30px;line-height:1.6">${highlights.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '<div class="muted">발췌할 본문이 없습니다. 원문에서 확인해 주세요.</div>'}<div class="muted" style="margin-top:6px;font-size:12px">본문 앞부분(최대 4,000자)에서 자동 발췌하므로 중요한 내용이 빠질 수 있습니다. 전체 내용은 원문에서 확인하세요.</div></div>
<div class="sec"><div class="sh">${ic('clip')}첨부파일 ${n}개${c.files.length > 1 ? `<button class="btn sm" data-act="dlAll" data-uid="${esc(m.uid)}" style="margin-left:auto">${ic('down')}모두 받기</button>` : ''}</div>${n ? `<div class="files">${rows.join('')}</div>` : '<div class="muted">첨부파일이 없습니다.</div>'}${c.readUrl ? `<div class="acts"><button class="btn sm ghost" data-act="openUrl" data-url="${esc(c.readUrl)}" data-title="메일 원문: ${esc(m.subject)}">${ic('ext')}그룹웨어에서 메일 원문 보기</button></div>` : ''}</div>`;
  }
  function mailPane(m, action, why) {
    if (!m) return {title: action ? action.title : '메일', url: S.a.mail.url, body: actsFor(S.a.mail.url, {key: action && action.key, title: '받은메일함', primaryLabel: '받은메일함 열기'})};
    const ur = m.seen ? '' : 'data-unread="1" data-what="메일"';
    const c = S.mailDet && S.mailDet[m.uid];
    const to = c && c.to ? c.to.replace(/<[^>]+>/g, '').replace(/\s*,\s*/g, ', ') : '';
    const mailUrl = (c && c.readUrl) || (action && action.url) || S.a.mail.url;
    const reply = `<button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('reall', m))}" data-title="전체 답장: ${esc(m.subject)}" ${ur}>전체 답장</button><button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('fw', m))}" data-title="전달: ${esc(m.subject)}" ${ur}>전달</button>`;
    const openOrigBtn = c && c.readUrl
      ? `<button class="btn ${S.pane.url === c.readUrl ? '' : 'primary'}" data-act="openUrl" data-url="${esc(c.readUrl)}" data-title="메일 원문: ${esc(m.subject)}">${ic('ext')}원문 화면 열기</button>`
      : `<button class="btn primary" data-act="mailOpenItem" data-box="${esc(m.box || '')}" data-uid="${esc(m.uid)}">${ic('ext')}원문 화면 열기</button>`;
    return {title: m.subject || '(제목 없음)', url: mailUrl, body: `${why || ''}<div class="kv"><b>보낸 사람</b><span>${esc(m.from)} <span class="muted">${esc(m.fromEmail)}</span></span><b>받은 시각</b><span>${esc(m.date.slice(0, 16))}</span>${to ? `<b>받는 사람</b><span title="${esc(to)}">${esc(to.length > 90 ? to.slice(0, 90) + '…' : to)}</span>` : ''}<b>상태</b><span>${m.seen ? '읽음' : '안 읽음'}${m.answered ? ' · 답장함' : ''}${m.forwarded ? ' · 전달함' : ''}</span></div>
${c && !c.error ? '' : `<div class="body-text open" style="max-height:120px">${esc((m.preview || '').replace(/대용량 파일첨부[\s\S]*?보관\)/, '').trim()) || '미리보기 없음'}</div>`}
${mailFilesBox(m)}
<div class="acts">${openOrigBtn}<button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('re', m))}" data-title="답장: ${esc(m.subject)}" ${ur}>${ic('mail')}답장 쓰기</button><button class="btn" data-act="mailToDraft" data-uid="${esc(m.uid)}" title="메일 내용을 바탕으로 기안문 서식을 결재 직전 상태로 자동 완성합니다">${ic('doc')}이 메일로 기안문 작성</button>${reply}${relatedQ(m.subject) ? `<button class="btn" data-act="paneCaseFlow" data-q="${esc(relatedQ(m.subject))}">${ic('doc')}사안 흐름</button>` : ''}${action ? `<button class="btn icon" data-act="rowMenu" data-k="${esc(action.key)}" aria-label="더 보기">${ic('more')}</button>` : ''}</div>
<div id="caseFlow"></div>
<p class="muted" style="margin-top:10px">답장 버튼을 누르면 받는 사람·제목이 채워진 채 열리고, 실제 발송은 그룹웨어 화면에서 "보내기"를 눌러야 처리됩니다.${m.seen ? '' : ' 안 읽은 메일은 답장 창을 열 때 읽음으로 바뀔 수 있어 먼저 묻습니다.'}</p>`};
  }
  function searchPane(it) {
    if (!it) return {title: '검색 결과를 찾을 수 없습니다', url: '', body: ''};
    const kw = (S.sel && S.sel.kw) || (S.search.res && S.search.res.keyword);
    if (it.type === 'doc' || it.type === 'board') {
      const dl = R.extractAllDeadlines(it.text || '').filter(x => x.dday >= -1);
      const meta = it.type === 'doc' ? `<b>문서번호</b><span>${esc(it.docNo)}</span><b>양식</b><span>${esc(it.form)}</span><b>기안</b><span>${esc(it.dept)} ${esc(it.drafter)}</span><b>일자</b><span>${esc(ymd8(it.date))}</span>` : `<b>게시판</b><span>${esc(it.catTitle)}</span><b>작성</b><span>${esc(it.writer)}</span><b>등록</b><span>${esc(it.date)}</span>`;
      return {title: it.title, url: it.url, body: `<div class="kv">${meta}<b>첨부</b><span>${it.files.map(f => esc(f.name)).join('<br>') || '-'}</span></div>${dl.length ? `<div class="box tip"><b>본문 기한</b> ${dl.map(d => `<span class="pill ${d.dday <= 1 ? 'solid' : 'medium'}" title="${esc(d.context)}">${esc(d.date.slice(5))} ${ddayText(d.dday)}</span>`).join('')}</div>` : ''}<div class="box"><b>본문 미리보기</b> <span class="muted">열람 기록 없음</span><div class="pv">${hl((it.text || it.snippet || '').slice(0, 4000), kw)}</div></div>${actsFor(it.url, {q: relatedQ(it.title), title: it.title})}<div id="caseFlow"></div><div class="box" id="extract">${extractHtml()}</div>`};
    }
    if (it.type === 'file') return {title: it.name, url: it.url, body: `<div class="kv"><b>출처</b><span>${esc(it.parent)}</span><b>올린 사람</b><span>${esc(it.owner)}</span><b>일자</b><span>${esc(it.date)}</span><b>크기</b><span>${won(it.size)} B</span></div>${actsFor(it.url, {q: relatedQ(it.parent), title: it.name})}<div class="box tip">첨부파일 미리보기(그룹웨어 문서 뷰어)가 열립니다.</div>`};
    if (it.type === 'mail') {
      const det = S.mailDet && S.mailDet[it.uid];
      const readUrl = det && det.readUrl;
      const openBtn = readUrl
        ? `<button class="btn primary" data-act="openUrl" data-url="${esc(readUrl)}" data-title="메일 원문: ${esc(it.subject)}">${ic('ext')}메일 원문 보기</button>`
        : `<button class="btn primary" data-act="mailOpenItem" data-box="${esc(it.box || '')}" data-uid="${esc(it.uid)}">${ic('ext')}메일 원문 보기</button>`;
      return {title: it.subject || '(제목 없음)', url: readUrl || S.a.mail.url, body: `<div class="kv"><b>메일함</b><span>${esc(it.box)}</span><b>보낸 사람</b><span>${esc(it.from)}</span><b>받는 사람</b><span>${esc(it.to)}</span><b>일시</b><span>${esc(it.date)}</span></div><div class="box">${hl(it.snippet, kw)}</div><div class="acts">${openBtn}<button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('re', it))}" data-title="답장">답장 쓰기</button><button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('fw', it))}" data-title="전달">전달</button></div>${actsFor(S.a.mail.url, {q: relatedQ(it.subject), title: '받은메일함'})}`};
    }
    return {title: it.title || it.name, url: '', body: `<div class="box">${esc(it.snippet || '')}</div>`};
  }
  const findDoc = (kind, id) => ((S.a.approval.lists[kind] || {}).docs || []).find(d => d.docId === id);
  const findMail = (box, uid) => [...(S.raw.data.mail?.inbox.records || []), ...(S.raw.data.mail?.otherUnseen || [])].find(m => (!box || m.box === box) && m.uid === uid);

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
  // 실제로 열었으면 true. 호출하는 쪽은 false면 화면에 아무것도 쓰지 말고 멈춘다.
  function openUrl(url, {title = '', unread = false, what = '문서'} = {}) {
    if (!url) return false;
    const raw = String(url).trim();
    if (/^(?:javascript|data|vbscript):/i.test(raw)) { if (typeof toast === 'function') toast('허용되지 않은 주소는 열지 않습니다.'); return false; }
    if (typeof URL === 'function' && typeof location !== 'undefined' && location.origin) {
      try {
        const p = new URL(raw, location.origin);
        const ok = /^https?:$/.test(p.protocol) && (p.origin === location.origin || /^https:\/\/(?:[a-z0-9-]+\.)*amaranth10\.co\.kr$/i.test(p.origin) || (/^http:\/\/10\.\d+\.\d+\.\d+(?::\d+)?$/i.test(p.origin) && /SynapDocViewServer/i.test(p.pathname)));
        if (!ok) { if (typeof toast === 'function') toast('허용되지 않은 주소는 열지 않습니다.'); return false; }
        url = p.href;
      } catch { if (typeof toast === 'function') toast('허용되지 않은 주소는 열지 않습니다.'); return false; }
    }
    // 같은 화면이어도 입력 중이면 묻는다. 버리기로 했으면 새로 열어 자동 기입이 사용자의 입력 위에 쓰지 않게 한다.
    const discard = !!(S.pane.dirty && S.pane.url === url);
    if (!leavePane()) return false;
    if (unread && !confirm(`아직 읽지 않은 ${what}입니다. 처리 창에 열면 그룹웨어에 읽음(열람)으로 기록될 수 있습니다. 열까요?`)) return false;
    if (discard) S.pane.mounted = '';
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
    return true;
  }
  // Keep the original mail iframe mounted while an attachment viewer is open: detaching it loses unsaved editor input.
  function enterAttachmentPreview(url) {
    if (!url || S.pane.previewBack) return false;
    const frame = $('#frame');
    const original = frame && frame.querySelector('iframe');
    S.pane.previewBack = {url: S.pane.url, mounted: S.pane.mounted, expanded: S.pane.expanded, dirty: S.pane.dirty, frame: original};
    if (original) original.hidden = true;
    S.pane.url = url; S.pane.extract = null; S.pane.expanded = true;
    renderPane();
    return true;
  }
  function returnFromAttachmentPreview() {
    const back = S.pane.previewBack;
    if (!back) return false;
    const frame = $('#frame');
    const preview = frame && frame.querySelector('iframe[data-pane-preview="1"]');
    if (preview) preview.remove();
    if (back.frame) back.frame.hidden = false;
    Object.assign(S.pane, {url: back.url, mounted: back.mounted, expanded: back.expanded, dirty: back.dirty});
    delete S.pane.previewBack;
    renderPane();
    return true;
  }
  // Would opening this item record a read/열람 in the groupware?
  function marksRead(x) {
    if (!x) return false;
    if (x.type === 'doc') { const d = findDoc(x.ref?.kind, x.ref?.docId); return !!(d && d.unread); }
    if (x.type === 'notice') return true;
    if (x.type === 'mail') { const m = findMail(x.ref?.box, x.ref?.uid); return !!(m && !m.seen); }
    return false;
  }
  async function openItem(x) {
    const what = x.type === 'mail' ? '메일' : x.type === 'notice' ? '게시글' : '문서';
    if (x.type === 'mail') {
      const m = findMail(x.ref?.box, x.ref?.uid);
      if (!m) { openUrl(x.url || S.a.mail.url, {title: x.title, unread: marksRead(x), what}); return; }
      const c = S.mailDet && S.mailDet[m.uid];
      if (c && c.readUrl) {
        openUrl(c.readUrl, {title: `메일: ${m.subject}`, unread: marksRead(x), what});
        return;
      }
      if (!m.seen && !confirm('아직 읽지 않은 메일입니다. 메일을 열면 그룹웨어에 읽음으로 표시됩니다. 열까요?')) return;
      try {
        await loadMailDetail(m, true);
        const det = S.mailDet && S.mailDet[m.uid];
        if (det && det.readUrl) { openUrl(det.readUrl, {title: `메일: ${m.subject}`, unread: false, what}); return; }
        toast(`이 메일의 원문 화면을 열지 못했습니다${det && det.error ? `(${det.error})` : ''}. 받은메일함을 대신 엽니다.`);
      } catch (err) { toast(`메일 원문을 불러오지 못했습니다: ${err.message}`); }
      openUrl(x.url || S.a.mail.url, {title: x.title, what});
      return;
    }
    openUrl(x.url, {title: x.title, unread: marksRead(x), what});
  }
  function openWindow(url, x) {
    let cleanUrl = '';
    try { const p = new URL(String(url || ''), location.origin); if (/^https?:$/.test(p.protocol) && (p.origin === location.origin || /^https:\/\/(?:[a-z0-9-]+\.)*amaranth10\.co\.kr$/i.test(p.origin))) cleanUrl = p.href; } catch {}
    if (!cleanUrl) { toast('허용되지 않은 주소는 열지 않습니다.'); return; }
    const d = x && x.type === 'doc' ? findDoc(x.ref?.kind, x.ref?.docId) : null;
    if (d && d.unread && !confirm('아직 열람하지 않은 문서입니다. 새 창으로 열면 열람으로 기록됩니다. 열까요?')) return;
    const m = x && x.type === 'mail' ? findMail(x.ref?.box, x.ref?.uid) : null;
    if (m && !m.seen && !confirm('아직 읽지 않은 메일입니다. 새 창으로 열면 그룹웨어에 읽음으로 표시됩니다. 열까요?')) return;
    window.open(cleanUrl, '_blank', 'noopener');
  }
  // ---------- Smart Auto-Submission & Auto-Fill Service Engine ----------
  // 메일로 기안: 결과보고·계획서와 같은 기안 엔진(제목·기본항목·기록물철·결재선·한글 본문)을 쓴다.
  // 본문 편집기는 한글(HWP) 웹 편집기라 contentEditable로는 들어가지 않으므로 putBody(HwpCtrl)로 넣는다.
  async function mailToDraft(uid) {
    const m = findMail('INBOX', uid) || [...(S.raw.data.mail?.inbox.records || []), ...(S.raw.data.mail?.otherUnseen || [])].find(x => x.uid === uid);
    if (!m) { toast('메일 정보를 찾을 수 없습니다.'); return; }
    const cleanSubj = String(m.subject || '').replace(/^\s*((re|fw|fwd|전달|회신|답장)\s*:\s*)+/i, '').replace(/^\s*\[[^\]]{0,12}\]\s*/, '').trim();
    const title = ((await askText('메일로 기안', '기안 제목 (확인·수정)', cleanSubj)) || '').trim();
    if (!title) return;
    const det = S.mailDet && S.mailDet[uid];
    // 요청 요지: 첨부 파일 이름·인사말·서명·이전 메일 인용을 빼고, 요청 낱말이 있는 문장을 우선 고른다
    const raw = String((det && det.text) || m.preview || '')
      .replace(/대용량 파일첨부[\s\S]*?보관\)/, ' ')
      .split(/보내는\s*사람\s*:|-{3,}\s*Original|From:\s/i)[0]
      .replace(/[^\s()]+\.(hwpx?|pdf|xlsx?|xls|docx?|pptx?|zip|jpe?g|png|hwp)\s*\([\d.,]+\s*[KMG]?B\)/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    const sents = raw.split(/(?<=[.!?。]|니다|세요|드려요|해요)\s+/).map(x => x.trim()).filter(x => x.length > 4 && !/^(안녕|수고|감사|고맙)/.test(x) && !/(T\.|☎|직통|내선|사무실)\s*\d/.test(x));
    const ask = sents.filter(x => /요청|부탁|제출|회신|검토|작성|협조|바랍니다|주시기|주세요|드려요|전달/.test(x));
    const gist = (ask.length ? ask : sents).slice(0, 2).join(' ').slice(0, 140);
    const when = String(m.date || '').slice(0, 10).split('-').map(Number);
    const ymd = when.length === 3 && when[0] ? `${when[0]}. ${when[1]}. ${when[2]}.` : '';
    const lines = [
      `1. ${m.from || '발신자'}${ymd ? `(${ymd})` : ''} 메일(제목: ${cleanSubj})과 관련입니다.`,
      `2. 위 메일과 관련하여 다음과 같이 추진하고자 합니다.`,
      `  가. 요청 내용: ${gist || '(메일의 요청 사항을 적으세요)'}`,
      '  나. 추진 내용: ',
      '  다. 추진 일정: ',
      '  라. 소요 예산: ',
      '',
      '붙임  관련 메일 1부.  끝.',
    ];
    const meta = R.predictDraftMeta(patModel(), {title});
    const fr = await openDraftFrame('mg_20160303185413307', '일반기안문', `새 기안: ${title}`);
    if (!fr) { toast('기안 화면을 열지 못했습니다. 잠시 후 다시 시도하세요.'); return; }
    const steps = await fillDraft(fr, {title, meta, body: {text: lines.join('\r\n'), lines, hang: lines.map(() => false)}});
    showDraftReport(title, steps, ['본문은 메일에서 뼈대만 만들었습니다. 추진 내용·일정·예산은 직접 채우세요.', ...(meta.confidence === 'similar' ? ['기록물철은 제목이 비슷한 과거 문서를 보고 골랐습니다. 맞는지 확인하세요.'] : meta.binder ? [] : ['기록물철을 정하지 못했습니다. 직접 고르세요.']), '메일 원문을 붙임으로 넣으려면 메일을 PDF로 저장해 첨부하세요.']);
  }

  
  // 근태 빠른 신청은 27-attendance-request.js (값을 먼저 묻고 신청서를 채움)

  // 메일 쓰기 화면의 본문 편집기(프레임 안쪽의 편집 가능한 문서)를 찾는다.
  function mailEditorBody(doc) {
    if (!doc) return null;
    for (const ifr of doc.querySelectorAll('iframe')) {
      try {
        const idoc = ifr.contentDocument, ibody = idoc && idoc.body;
        if (ibody && (ibody.isContentEditable || idoc.designMode === 'on')) return ibody;
        const inner = mailEditorBody(idoc);
        if (inner) return inner;
      } catch {}
    }
    return null;
  }
  // 편집기가 뜬 뒤 그룹웨어가 원문 인용·서명을 채워 넣을 때까지 기다린다(먼저 넣으면 덮여 사라진다).
  async function waitMailEditorSettled(url, ms = 20000) {
    const t0 = Date.now();
    let last = -1, same = 0;
    while (Date.now() - t0 < ms) {
      if (S.pane.url !== url) return null;
      let body = null;
      try { body = mailEditorBody($('#frame iframe')?.contentDocument); } catch {}
      if (body) {
        const len = body.innerHTML.length;
        same = len === last ? same + 1 : 0; last = len;
        if (same >= 3 && (body.innerText.trim().length > 0 || Date.now() - t0 > 4000)) return body;
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  }
  async function autoFillMail(templateType) {
    if (S.pane.fillBusy) return false;
    S.pane.fillBusy = true;
    try { return await autoFillMailRun(templateType); } finally { S.pane.fillBusy = false; }
  }
  async function autoFillMailRun(templateType) {
    // 메일 읽기 화면이나 빈 처리 창에서 눌러도, 고른 메일의 답장 화면을 처리 창에 먼저 연다.
    if (!isMailCompose(S.pane.url)) {
      const m = paneMailRef();
      if (!m) { toast('답장할 메일을 먼저 고르세요. 메일 목록에서 메일을 누른 뒤 회신문 버튼을 누르면 됩니다.'); return false; }
      if (!openUrl(GW.links.compose('re', m), {title: `답장: ${m.subject || ''}`, unread: m.seen === false, what: '메일'})) return false;
      toast('답장 화면을 여는 중입니다. 준비되면 회신 문구를 넣습니다.');
    }
    const url = S.pane.url;
    const ready = await waitMailEditorSettled(url);
    if (S.pane.url !== url) return false;
    const f = $('#frame iframe');
    const d = f?.contentDocument;
    if (!ready || !d) { toast('메일 편집기가 아직 준비되지 않았습니다. 답장 화면이 다 뜬 뒤 회신문 버튼을 다시 누르세요.'); return false; }

    const item = paneMailRef();
    const typedSubject = (() => { try { return [...d.querySelectorAll('input[type=text],input:not([type])')].map(i => i.value || '').find(v => /^\s*(re|fw|fwd)\s*:/i.test(v)) || ''; } catch { return ''; } })();
    const originTitle = ((item && (item.subject || item.title)) || typedSubject || '').replace(/^\s*((re|fw|fwd|전달|회신|답장)\s*:\s*)+/i, '').trim();
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
<p>보내주신 <b>“${esc(originTitle)}”</b> 건과 관련하여 담당 사항에 대한 확인 및 검토를 완료하였음을 회신드립니다.</p>
<p>&nbsp; 1. 확인 일자: ${esc(todayStr)}</p>
<p>&nbsp; 2. 확인 결과: (확인한 내용을 적으세요)</p>
<p><br></p>
<p>감사합니다.</p><p><br></p>`;
    } else if (templateType === 'submit') {
      bodyText = `<p>안녕하십니까, ${esc(me)}입니다.</p>
<p><br></p>
<p>요청하신 <b>“${esc(originTitle)}”</b> 관련 자료를 아래와 같이 작성하여 제출합니다.</p>
<p>&nbsp; 1. 제출 건명: ${esc(originTitle)}</p>
<p>&nbsp; 2. 제출 일자: ${esc(todayStr)}</p>
<p>&nbsp; 3. 제출자: ${esc(me)}</p>
<p>&nbsp; 4. 비고: ${hasAttach ? '세부 사항은 첨부파일을 참조하여 주시기 바랍니다.' : '(첨부파일을 붙이거나 내용을 적으세요)'}</p>
<p><br></p>
<p>감사합니다.</p><p><br></p>`;
    } else if (templateType === 'extend') {
      bodyText = `<p>안녕하십니까, ${esc(me)}입니다.</p>
<p><br></p>
<p>보내주신 <b>“${esc(originTitle)}”</b> 건과 관련하여, 부서 내 추가 검토 및 자료 취합 일정으로 인하여 부득이하게 제출 기한의 조정을 요청드리고자 합니다.</p>
<p>&nbsp; - 기존 기한: (공지된 기한)</p>
<p>&nbsp; - 요청 기한: (요청할 기한)</p>
<p><br></p>
<p>일정에 차질을 드려 양해 부탁드리며, 신속히 검토하여 제출하도록 하겠습니다. 감사합니다.</p><p><br></p>`;
    }

    const put = () => {
      let ibody = null;
      try { ibody = mailEditorBody($('#frame iframe')?.contentDocument); } catch {}
      if (!ibody) return false;
      const old = ibody.querySelector('[data-bwyfgw-tpl]'); if (old) old.remove();
      ibody.insertAdjacentHTML('afterbegin', `<div data-bwyfgw-tpl="1">${bodyText}</div>`);
      ibody.dispatchEvent(new Event('input', {bubbles: true}));
      return true;
    };
    const has = () => { try { const b = mailEditorBody($('#frame iframe')?.contentDocument); return !!(b && b.querySelector('[data-bwyfgw-tpl]')); } catch { return false; } };
    let injected = put();
    // 그룹웨어가 본문을 뒤늦게 다시 채워 문구가 지워졌으면 한 번 더 넣는다.
    if (injected) { await new Promise(r => setTimeout(r, 900)); if (S.pane.url !== url) return false; if (!has()) injected = put() && has(); }
    if (injected) toast(`회신 문구를 본문 맨 위에 넣었습니다. 괄호 칸을 채우고${templateType === 'submit' && !hasAttach ? ' 첨부파일을 붙인 뒤' : ''} 직접 보내세요.`);
    else toast('메일 편집기를 찾지 못했습니다. 답장 화면이 다 뜬 뒤 회신문 버튼을 다시 누르세요.');
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
    const isAtt = u.includes('HPD0100') || u.includes('HPD0110');
    if (u.includes('NCA0020') && S.expBar) return `<div class="autofill-bar"><span class="lbl" title="${esc(S.expBar.title || '')}">${ic('star')} 지출 값 복사 · ${esc(String(S.expBar.title || '').slice(0, 24))}${String(S.expBar.title || '').length > 24 ? '…' : ''}:</span><button class="btn sm ghost" data-act="expBarClear" title="다른 건을 입력할 때는 이 값을 지우세요">이 값 지우기</button>${S.expBar.items.map(([k, v]) => `<button class="btn sm" data-act="copy" data-v="${esc(v)}" title="${esc(v)}">${esc(k)}</button>`).join('')}<span class="muted" style="font-size:12px">결의서입력에서 [결재상신]은 직접 누르세요</span></div>`;
    
    if (isMail) {
      // 답장 쓰기 화면이면 바로 넣고, 읽기 화면이면 고른 메일의 답장 화면을 이 창에 연 뒤 넣는다.
      const compose = isMailCompose(u);
      if (compose ? /mailKind=(plain|fw|fwd)(&|$)/.test(u) : !paneMailRef()) return ''; // 새 메일·전달에는 "보내주신 … 건" 회신문이 맞지 않는다
      return `<div class="autofill-bar"><span class="lbl">${ic('star')} ${compose ? '회신 자동 기입:' : '답장 화면을 열고 회신문 넣기:'}</span><button class="btn sm" data-act="autoFillMail" data-v="confirm">${ic('mail')}확인 회신문</button><button class="btn sm" data-act="autoFillMail" data-v="submit">${ic('mail')}자료 제출 회신문</button><button class="btn sm" data-act="autoFillMail" data-v="extend">${ic('mail')}기한 연장 요청</button></div>`;
    }
    if (isDraft) {
      return `<div class="autofill-bar"><span class="lbl">${ic('star')} 새로 쓰기 (내 결재문서 패턴):</span><button class="btn sm primary" data-act="quickDraft" data-t="result">${ic('doc')}결과보고(계획서 선택)</button><button class="btn sm" data-act="quickDraft" data-t="plan">${ic('doc')}계획서</button><button class="btn sm" data-act="quickDraft" data-t="goods">${ic('doc')}물품구입</button></div>`;
    }
    if (isAtt) {
      return `<div class="autofill-bar"><span class="lbl">${ic('star')} 신청서 채우기:</span><button class="btn sm" data-act="quickAtt" data-t="trip">출장</button><button class="btn sm" data-act="quickAtt" data-t="leave">휴가</button><button class="btn sm" data-act="quickAtt" data-t="overtime">시간외·휴일근무</button><button class="btn sm ghost" data-act="autoFillAtt">대체휴무 사유 복사</button></div>`;
    }
    return '';
  }
