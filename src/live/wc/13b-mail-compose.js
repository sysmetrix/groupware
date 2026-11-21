// GW 비서 · 처리 창의 메일 쓰기(회신 문구 넣기)와 원문 틀 맞춤
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs. 13-detail-pane.js에서 나눔(v1.16.0).
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
  async function autoFillMail(templateType, custom = null) {
    if (S.pane.fillBusy) return false;
    S.pane.fillBusy = true;
    try { return await autoFillMailRun(templateType, custom); } finally { S.pane.fillBusy = false; }
  }
  async function autoFillMailRun(templateType, custom = null) {
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
    // 인사말은 직위 없이 두 줄: '안녕하세요.' / '전략경영실 서원하입니다.'
    const greetMe = [myDept, myName].filter(Boolean).join(' ') || '담당자';
    const hasAttach = (() => { try { const fd = f.contentDocument; return !!(fd && fd.querySelector('[class*=attach] li, [class*=file] li, .fileName, .file-name')); } catch { return false; } })();
    if ((() => { let hit = false; const look = doc => { if (!doc || hit) return; if (doc.querySelector('[data-bwyfgw-tpl]')) { hit = true; return; } for (const i of doc.querySelectorAll('iframe')) { try { look(i.contentDocument); } catch {} } }; look(d); return hit; })()) { if (!confirm('이미 넣은 회신 문구가 있습니다. 새 문구로 바꿀까요?')) return; }
    const todayStr = R.kstNow(new Date()).date;

    let bodyText = '';
    if (templateType === 'confirm') {
      bodyText = `<p>안녕하세요.</p>
<p>${esc(greetMe)}입니다.</p>
<p><br></p>
<p>보내주신 <b>“${esc(originTitle)}”</b> 건과 관련하여 담당 사항에 대한 확인 및 검토를 완료하였음을 회신드립니다.</p>
<p>&nbsp; 1. 확인 일자: ${esc(todayStr)}</p>
<p>&nbsp; 2. 확인 결과: (확인한 내용을 적으세요)</p>
<p><br></p>
<p>감사합니다.</p><p><br></p>`;
    } else if (templateType === 'submit') {
      bodyText = `<p>안녕하세요.</p>
<p>${esc(greetMe)}입니다.</p>
<p><br></p>
<p>요청하신 <b>“${esc(originTitle)}”</b> 관련 자료를 아래와 같이 작성하여 제출합니다.</p>
<p>&nbsp; 1. 제출 건명: ${esc(originTitle)}</p>
<p>&nbsp; 2. 제출 일자: ${esc(todayStr)}</p>
<p>&nbsp; 3. 제출자: ${esc(me)}</p>
<p>&nbsp; 4. 비고: ${hasAttach ? '세부 사항은 첨부파일을 참조하여 주시기 바랍니다.' : '(첨부파일을 붙이거나 내용을 적으세요)'}</p>
<p><br></p>
<p>감사합니다.</p><p><br></p>`;
    } else if (templateType === 'custom' && Array.isArray(custom) && custom.length) {
      // AI 초안(v0.86.0): 인사·맺음은 여기서 붙이고, 초안 문단은 글자로만 넣는다(HTML로 해석하지 않음).
      bodyText = `<p>안녕하세요.</p>
<p>${esc(greetMe)}입니다.</p>
<p><br></p>
${custom.slice(0, 12).map(l => `<p>${esc(String(l).slice(0, 400))}</p>`).join('\n')}
<p><br></p>
<p>감사합니다.</p><p><br></p>`;
    } else if (templateType === 'extend') {
      bodyText = `<p>안녕하세요.</p>
<p>${esc(greetMe)}입니다.</p>
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
    if (injected && typeof markPaneDirty === 'function') { const pf = $('#frame iframe'); if (pf) markPaneDirty(pf); clearDirtyWhenGone(doc => !!mailEditorBody(doc)); }
    const sec = injected && typeof secureMailOn === 'function' && secureMailOn() ? SECURE_NOTE : '';
    if (injected && templateType === 'custom') toast('초안을 본문 맨 위에 넣었습니다. 사실관계와 (확인 필요) 칸을 확인한 뒤 직접 보내세요.' + sec);
    else if (injected) toast(`회신 문구를 본문 맨 위에 넣었습니다. 괄호 칸을 채우고${templateType === 'submit' && !hasAttach ? ' 첨부파일을 붙인 뒤' : ''} 직접 보내세요.` + sec);
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

  // v1.11.0: 노트북(세로 900px 미만) 원문 틀에서는 전자결재 문서 본문이 150px 남짓만 보였다. 첨부 목록(약 170px)을 한 번 접어 본문을 두 배로 보이게 한다.
  function roomyDocFrame(f, u) {
    if (!/MicroModuleCode=ea/.test(u)) return;
    let tries = 0;
    const tick = () => {
      if (!f.isConnected || S.pane.url !== u || ++tries > 20) return;
      if (f.getBoundingClientRect().height >= 760) return;
      try {
        const acc = f.contentDocument && f.contentDocument.querySelector('#accordionSingle');
        if (!acc) { setTimeout(tick, 300); return; }
        if (/Accordion2_opened/.test(acc.className)) { const h = acc.querySelector('[class*="OBTAccordion2_accordion"]'); if (h) h.click(); }
      } catch {}
    };
    if (typeof setTimeout === 'function') setTimeout(tick, 300);
  }

  // v1.14.0: 그룹웨어 전체 화면(일정 등 팝업이 아닌 화면)은 최소 너비가 처리 창보다 조금 넓어(1232 > 1138px) 오른쪽 등록 창이 잘렸다.
  // 넘친 정도가 20% 이내면 처리 창 안에서만 화면 배율을 줄여 한눈에 들어오게 한다. 그룹웨어 자료는 바꾸지 않는다.
  function fitFrameWidth(f, u) {
    if (/#\/?popup\?/.test(u)) return;
    let tries = 0;
    const tick = () => {
      if (!f.isConnected || S.pane.url !== u || ++tries > 12) return;
      try {
        const d = f.contentDocument, cw = f.getBoundingClientRect().width;
        if (!d || !cw) { setTimeout(tick, 400); return; }
        let need = 0; d.querySelectorAll('div,main,section').forEach(e => { if (e.clientWidth > 600 && e.scrollWidth > e.clientWidth + 8 && /auto|scroll/.test(getComputedStyle(e).overflowX)) need = Math.max(need, e.scrollWidth / e.clientWidth); });
        if (!need) { setTimeout(tick, 600); return; }
        if (need <= 1.25) { d.documentElement.style.zoom = String(Math.floor(100 / need) / 100); }
      } catch {}
    };
    if (typeof setTimeout === 'function') setTimeout(tick, 800);
  }
