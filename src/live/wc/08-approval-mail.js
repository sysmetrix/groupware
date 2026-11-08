// GW 통합 업무센터 · 결재·문서유통
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ----- 결재·문서유통 -----
  const AP_VERB = {distWaiting: '배부하기', deptWaiting: '접수하기', pending: '결재하기', sendWaiting: '발송하기', viewing: '열람하기', submitted: '열기'};
  const AP_STATUS = {distWaiting: '배부 전', deptWaiting: '접수 전'};
  function vApproval() {
    const lists = S.a.approval.lists, counts = S.a.approval.counts;
    const tabs = [['pending', '결재 대기'], ['deptWaiting', '부서 접수 대기'], ['distWaiting', '배부 대기'], ['sendWaiting', '발송 대기'], ['viewing', '열람문서'], ['submitted', '내 상신문서']];
    // Automatically select the first tab that has documents if the active tab is empty
    if (!lists[S.apTab] || !lists[S.apTab].docs || lists[S.apTab].docs.length === 0) {
      const firstWithDocs = tabs.find(([k]) => lists[k] && lists[k].docs && lists[k].docs.length > 0);
      if (firstWithDocs) S.apTab = firstWithDocs[0];
    }
    const l = lists[S.apTab];
    const more = S.apMore[S.apTab] || [];
    const docs = l && !l.error ? [...l.docs, ...more] : [];
    const withRec = ['distWaiting', 'deptWaiting'].includes(S.apTab);
    const hist = S.routing ? (S.apTab === 'distWaiting' ? S.routing.dist : S.routing.dept) : [];
    const target = S.apTab === 'distWaiting' ? 'toDept' : 'toEmp';
    const myTab = k => k === 'pending' || k === 'submitted' || k === 'viewing' || ({distWaiting: S.settings.roles?.distributor, deptWaiting: S.settings.roles?.deptReceiver, sendWaiting: S.settings.roles?.sender}[k]);
    const roleMine = {distWaiting: S.settings.roles?.distributor, deptWaiting: S.settings.roles?.deptReceiver, sendWaiting: S.settings.roles?.sender}[S.apTab];
    const rows = docs.map(d => {
      const rec = withRec && hist.length ? R.recommendRouting(d, hist, {target, limit: 2}) : Object.assign([], {group: null});
      const recHtml = !withRec ? '' : !S.routing ? '<span class="spin"></span>' : rec.group && rec.group.targets.length >= 2 ? `<b>${rec.group.targets.length}곳 함께</b><div class="muted">${esc(rec.group.targets.slice(0, 3).join(', '))}${rec.group.targets.length > 3 ? ' 외' : ''}</div>` : rec.length ? rec.map(r => `<div>${esc(r.name)} <span class="muted">· 비슷한 ${r.of}건 중 ${r.count}건</span></div>`).join('') : '<span class="muted">비슷한 이력 없음</span>';
      return `<tr class="click ${S.sel && S.sel.type === 'doc' && S.sel.docId === d.docId ? 'sel' : ''}" data-act="selDoc" data-kind="${S.apTab}" data-id="${esc(d.docId)}" tabindex="0"><td><div style="font-weight:700">${esc(R.cleanTitle ? R.cleanTitle(d.title) : d.title)}</div><div class="muted">${d.unread ? '<span class="bdg check" style="margin-right:6px">아직 안 봄</span>' : ''}${esc(d.docNo)}${d.attachments ? ` · 첨부 ${d.attachments}` : ''}</div></td><td>${esc(d.sender || d.drafter || d.drafterDept)}</td><td class="nowrap">${esc(AP_STATUS[S.apTab] || d.status)}</td>${withRec ? `<td>${recHtml}</td>` : ''}<td class="nowrap">${esc(shortWhen(d.date))}</td><td class="nowrap"><button class="btn sm ${roleMine === false || S.apTab === 'submitted' || S.apTab === 'viewing' ? '' : 'primary'}" data-act="apOpen" data-kind="${S.apTab}" data-id="${esc(d.docId)}">${roleMine === false ? '원래 화면 보기' : AP_VERB[S.apTab]}</button></td></tr>`;
    }).join('');
    const total = l ? (l.total ?? l.docs.length) : 0;
    const note = roleMine === false ? `<div class="box" style="margin:0 0 12px">이 목록은 설정상 <b>참고</b>(부서 담당자가 처리)로 분류되어 "오늘 할 일"에는 나오지 않습니다. 내 업무라면 <a class="btn sm" data-act="view" data-v="settings">설정에서 바꾸기</a></div>` : '';
    return `${pgh('결재·문서유통', '', `${l ? `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">${ic('ext')}그룹웨어 목록</a>` : ''}${docs.length && ['distWaiting', 'deptWaiting', 'pending', 'sendWaiting'].includes(S.apTab) ? `<button class="btn sm primary" data-act="focusList">${ic('play')}이 목록 하나씩 처리</button>` : ''}`)}
<div class="bar"><div class="seg" role="tablist">${tabs.map(([k, n]) => { const c = lists[k]; const cnt = c ? (c.error ? '?' : c.total ?? c.docs.length) : '-'; return `<button role="tab" aria-selected="${S.apTab === k}" class="${S.apTab === k ? 'on' : ''}" data-act="apTab" data-v="${k}">${n}<span class="c">${cnt}</span></button>`; }).join('')}</div></div>
${note}
${l && l.error ? `<div class="box errb">${esc(l.message)} <button class="btn sm" data-act="refresh">다시 시도</button></div>` : docs.length ? `<table><tr><th>제목</th><th>보낸 곳·기안</th><th>상태</th>${withRec ? `<th title="최근 180일 동안 제목 주제가 비슷한 문서가 어디로 갔는지 센 값">지난번엔 어디로?</th>` : ''}<th>받은 날</th><th></th></tr>${rows}</table>` : `<div class="list"><div class="empty"><b>${esc((tabs.find(t => t[0] === S.apTab) || [])[1] || '')} 문서가 없습니다</b>${tabs.filter(([k]) => k !== S.apTab && lists[k] && !lists[k].error && (lists[k].total ?? lists[k].docs.length) > 0 && !['viewing', 'submitted'].includes(k)).map(([k, n]) => `<button class="chip" data-act="apTab" data-v="${k}" style="margin:8px 4px 0">${n} ${lists[k].total ?? lists[k].docs.length}건 보기${myTab(k) ? '' : ' (참고)'}</button>`).join('') || '<div>지금 처리할 결재 문서가 없습니다.</div>'}</div></div>`}
${docs.length < total ? `<div class="acts"><button class="btn" data-act="apMore">더 보기 (${docs.length}/${total})</button></div>` : ''}
<details style="margin-top:18px"><summary class="muted" style="cursor:pointer">그룹웨어 메뉴별 건수</summary><table style="margin-top:8px"><tr><th>메뉴</th><th class="num">건수</th></tr>${counts.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.count}</td></tr>`).join('')}</table></details>`;
  }

  // ----- 메일 -----
  const cleanPreview = p => String(p || '').replace(/대용량 파일첨부[\s\S]*?보관\)/, '').replace(/\s+/g, ' ').trim();
  function vMail() {
    const m = S.a.mail;
    const all = [...(S.raw.data.mail?.inbox.records || []), ...(S.raw.data.mail?.otherUnseen || [])];
    const actKeys = new Map(S.a.actions.filter(x => x.type === 'mail').map(x => [x.ref.box + x.ref.uid, x]));
    const f = S.mailFilter;
    const rows = all.filter(x => f === 'all' || (f === 'unread' && !x.seen) || (f === 'todo' && actKeys.has(x.box + x.uid) && isMine(actKeys.get(x.box + x.uid))) || (f === 'attach' && (x.attach || /대용량 파일첨부/.test(x.preview))) || (f === 'other' && x.box !== 'INBOX'));
    const sr = S.mailSearch.res;
    const rowHtml = x => { const a = actKeys.get(x.box + x.uid); const st = a ? stateOf(a) : ''; const att = x.attach || /대용량 파일첨부/.test(x.preview); return `<div class="row ${S.sel && S.sel.type === 'mail' && S.sel.uid === x.uid ? 'sel' : ''}" role="listitem" tabindex="0" data-act="selMail" data-box="${esc(x.box)}" data-uid="${esc(x.uid)}" style="grid-template-columns:170px 1fr auto"><div style="${x.seen ? '' : 'font-weight:800'}">${x.seen ? '' : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-right:6px"></span>'}${esc(x.from)}</div><div class="mn"><div class="t" style="${x.seen ? 'font-weight:600' : ''}">${esc(x.subject || '(제목 없음)')}</div><div class="hl">${a && st !== 'info' ? `<span class="bdg ${st}">${STATE_NAME[st]}</span>` : ''}${att ? `<span class="bdg tag">${ic('clip')}첨부</span>` : ''}${x.box !== 'INBOX' ? `<span class="bdg tag">${esc(x.box)}</span>` : ''}<span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:520px">${esc(cleanPreview(x.preview).slice(0, 90))}</span></div></div><div class="w">${esc(shortWhen(x.date))}</div></div>`; };
    const listHtml = rows.length ? `<div class="list" role="list">${rows.map(rowHtml).join('')}</div>` : `<div class="list"><div class="empty"><b>해당하는 메일이 없습니다</b></div></div>`;
    return `${pgh('메일', `처리할 메일 ${S.a.actions.filter(x => x.type === 'mail' && isMine(x)).length}통 · 안 읽음 ${all.filter(x => !x.seen).length}통 · 최근 ${all.length}통`, `<a class="btn sm" href="${esc(m.url)}" target="_blank" rel="noopener">${ic('ext')}받은메일함</a><button class="btn sm primary" data-act="openUrl" data-url="${esc(GW.links.compose('plain'))}" data-title="새 메일 쓰기">${ic('plus')}새 메일</button>`)}
<div class="bar"><div class="seg" role="tablist">${[['all', '전체'], ['todo', '처리할 메일'], ['unread', '안 읽음'], ['attach', '첨부 있음'], ['other', '내 메일함']].map(([k, n]) => `<button role="tab" aria-selected="${f === k}" class="${f === k ? 'on' : ''}" data-act="mailFilter" data-v="${k}">${n}</button>`).join('')}</div>
<input class="inp grow" id="mailq" placeholder="메일 본문까지 검색 후 Enter" value="${esc(S.mailSearch.kw)}" aria-label="메일 검색">${S.mailSearch.busy ? '<span class="spin"></span>' : ''}</div>
${sr ? `<h2>"${esc(sr.keyword)}" 검색 결과 ${sr.groups.mail?.total ?? 0}건 <button class="btn sm ghost" data-act="clearMailSearch">${ic('x')}지우기</button></h2><div class="list">${(sr.groups.mail?.items || []).map(x => `<div class="row" tabindex="0" data-act="selMailSearch" data-uid="${esc(x.uid)}" style="grid-template-columns:170px 1fr auto"><div>${esc(x.from)}</div><div class="mn"><div class="t">${hl(x.subject || '(제목 없음)', sr.keyword)}</div><div class="fx">${hl(x.snippet, sr.keyword)}</div></div><div class="w">${esc(shortWhen(x.date))}</div></div>`).join('') || '<div class="empty"><b>결과가 없습니다</b>다른 단어로 찾아보세요.</div>'}</div><h2>최근 메일</h2>` : ''}
${listHtml}
<p class="muted" style="margin-top:12px">메일 목록을 보는 것만으로는 읽음 처리되지 않습니다.</p>`;
  }
  async function runMailSearch(kw) {
    S.mailSearch.kw = kw;
    if (kw.length < 2) { toast('검색어를 두 글자 이상 입력하세요.'); return; }
    S.mailSearch.busy = true; if (S.view === 'mail') renderMain();
    try { S.mailSearch.res = await GW.search(kw, {types: ['mail'], pageSize: 20}); } catch (e) { toast('메일을 검색하지 못했습니다: ' + e.message); }
    S.mailSearch.busy = false;
    if (S.view === 'mail') renderMain();
  }

