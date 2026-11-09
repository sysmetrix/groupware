// GW 통합 업무센터 · 거버넌스 (관리자 정책, 데이터 관리, 진단, 업데이트 확인, 사용 안내)
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  // ---------- 관리자 정책 (확장 폴더의 policy.js가 window.BWYFGW_POLICY로 지정) ----------
  const POLICY = R.normalizePolicy(window.BWYFGW_POLICY);
  const NOTICE_VER = '1';
  const FEATURE_NAME = {briefing: '업무 브리핑', teamAttendance: '직원 근태 달력', aiAssistant: 'AI 도우미', resource: '자원 예약', googleCalendar: '구글 일정', draftResult: '결과보고 기안', draftPlan: '계획서 기안', draftPay: '지급 건의 기안', draftGoods: '물품매입 기안', recorder: '기록기', aiConsole: 'AI 지시창', updateCheck: '업데이트 확인'};
  function allowed(f) { return R.featureAllowed(POLICY, f); }
  // 막힌 기능이면 안내하고 true를 돌려준다. 호출부는 true면 바로 return 한다.
  function gated(f) {
    if (allowed(f)) return false;
    toast(`${FEATURE_NAME[f] || f} 기능은 관리자 설정으로 꺼져 있습니다.${POLICY.message ? ' ' + POLICY.message : ''}`);
    return true;
  }

  // ---------- 보존기간 (학습한 문서는 기간이 지나면 지운다) ----------
  function govPurge() {
    try {
      const key = 'bwyfgw:wc:' + currentKey + ':patterns';
      const raw = localStorage.getItem(key);
      if (!raw) return 0;
      const r = R.purgeExpired(JSON.parse(raw), Date.now(), POLICY.retentionDays);
      if (r.removed) localStorage.setItem(key, JSON.stringify(r.patterns));
      return r.removed;
    } catch (e) { logError('govPurge', e.message); return 0; }
  }

  // ---------- 감사 기록 검증 ----------
  const auditState = () => R.verifyAudit(store.get('actionHistory', []));

  // ---------- 업데이트 확인 ----------
  async function checkUpdate(force) {
    if (!allowed('updateCheck')) return null;
    const cached = store.get('updateInfo', null);
    if (!force && cached && /^0\./.test(cached.latest || '') && Date.now() - cached.at < 12 * 3600e3) return cached; // 옛 번호 체계(4.x 등)로 저장된 확인 결과는 버린다
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch('https://api.github.com/repos/sysmetrix/groupware/releases/latest', {signal: ctl.signal, headers: {Accept: 'application/vnd.github+json'}});
      clearTimeout(tm);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const tag = String(j.tag_name || '').replace(/^v/, '');
      const info = {at: Date.now(), latest: /^0\.\d+\.\d+$/.test(tag) ? tag : '', url: /^https:\/\/github\.com\/sysmetrix\//.test(j.html_url || '') ? j.html_url : ''};
      store.set('updateInfo', info);
      return info;
    } catch (e) { const info = {at: Date.now(), latest: '', url: '', err: String(e.message || e).slice(0, 80)}; store.set('updateInfo', info); return info; }
  }

  // ---------- 데이터 관리 ----------
  const DATA_LABEL = {patterns: ['학습한 내 결재문서(기안 패턴)', '결재문서 본문·기록물철을 학습한 자료'], macros: ['기록기 기록', '내가 저장한 동작 기록'], actionHistory: ['자동 작업 감사 기록', '자동 기안·재생 결과(변조 감지 포함)'], errors: ['오류 기록', '최근 오류 30건'], settings: ['설정', '화면·예산·알림 설정'], todos: ['내 할 일', ''], hidden: ['숨기기 표시', ''], snooze: ['미루기 표시', ''], plan: ['오늘 계획', ''], history: ['처리 이력', ''], updateInfo: ['업데이트 확인 결과', ''], routing: ['배부 추천 이력', '문서 배부 추천용 캐시(12시간)'], state: ['처리 상태', '처리 완료·확인 표시'], forms: ['양식 목록 캐시', ''], activity: ['활동 기록', ''], weekly: ['주간 보고 캐시', ''], weeklyRecovery: ['주간 보고 복구본', '다른 탭과 동시 편집할 때 보관한 초안'], newKeys: ['새 항목 표시', ''], seenActivity: ['확인한 활동', '']};
  function inventory() {
    const p = 'bwyfgw:wc:' + currentKey + ':';
    const rows = [];
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(p)) continue;
      const name = k.slice(p.length), v = localStorage.getItem(k) || '';
      rows.push({key: name, kb: Math.round(v.length * 2 / 102.4) / 10, label: (DATA_LABEL[name] || [name, ''])[0], note: (DATA_LABEL[name] || ['', ''])[1]});
    }
    return rows.sort((a, b) => b.kb - a.kb);
  }
  function openDataCenter() {
    closeOverlay();
    S.paletteOpen = true;
    const inv = inventory(), total = inv.reduce((a, r) => a + r.kb, 0);
    const au = auditState();
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(760px,95vw);padding:22px 24px;max-height:88vh;overflow:auto" role="dialog" aria-label="데이터 관리">
      <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
      <h2 style="margin:0 0 4px;font-size:18px">데이터 관리</h2>
      <div class="muted" style="margin-bottom:10px">모든 자료는 이 브라우저(사용자별)에만 저장되며 외부 서버로 보내지 않습니다. 학습한 결재문서는 ${POLICY.retentionDays}일이 지나면 자동으로 지워집니다.</div>
      <div class="box ${au.ok ? 'tip' : 'warn'}" style="margin-bottom:10px">감사 기록 무결성: <b>${au.ok ? '이상 없음' : '변조 또는 누락 의심 (' + esc(au.reason || '') + ')'}</b>${au.legacy ? ` · 이전 버전 기록 ${au.legacy}건은 검증 대상 아님` : ''}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>
      ${inv.map(r => `<tr style="border-top:1px solid var(--line)"><td style="padding:6px 4px"><b>${esc(r.label)}</b>${r.note ? `<div class="muted" style="font-size:12px">${esc(r.note)}</div>` : ''}</td><td style="text-align:right;white-space:nowrap">${r.kb}KB</td><td style="text-align:right">${['patterns', 'macros', 'errors', 'routing', 'forms', 'weekly'].includes(r.key) ? `<button class="btn sm danger ghost" data-act="govDel" data-k="${esc(r.key)}">지우기</button>` : ''}</td></tr>`).join('')}
      </tbody></table>
      <div class="muted" style="margin-top:6px">합계 약 ${Math.round(total)}KB</div>
      <div class="acts" style="margin-top:12px"><button class="btn sm" data-act="govExportAudit">감사 기록 내보내기(JSON)</button><button class="btn sm" data-act="openDiag">진단 열기</button><button class="btn sm danger" data-act="resetAll">내 업무센터 자료 모두 지우기</button></div>
      <div class="muted" style="font-size:12px;margin-top:8px">공용 PC에서는 사용 후 위 버튼으로 모두 지워 주세요. 로그인 정보와 비밀번호는 저장하지 않습니다.</div></div></div>`;
  }
  function govDel(k) {
    const lab = (DATA_LABEL[k] || [k])[0];
    if (!confirm(`“${lab}”을(를) 지울까요? 되돌릴 수 없습니다.`)) return;
    store.del(k);
    if (k === 'weekly') S.weekly = ''; else if (k === 'errors') S.errors = []; else if (k === 'routing') S.routing = null; else if (k === 'forms') S.forms = null; else if (k === 'history') S.history = [];
    if (k === 'macros') toast('기록기 기록을 지웠습니다.'); else toast(`${lab}을(를) 지웠습니다.`);
    openDataCenter();
  }
  function govExportAudit() {
    const list = store.get('actionHistory', []);
    const out = JSON.stringify({exportedAt: new Date().toISOString(), version: VERSION, integrity: auditState(), records: list}, null, 2);
    copyText(out);
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], {type: 'application/json'})); a.download = `업무센터_감사기록_${new Date().toISOString().slice(0, 10)}.json`; a.click(); } catch {}
    toast('감사 기록을 복사하고 파일로 저장했습니다.');
  }

  // ---------- 진단 ----------
  function diagChecks() {
    const out = [];
    const add = (name, ok, detail) => out.push({name, ok, detail});
    add('업무센터 버전', true, `${VERSION} (수집기 ${GW.version})`);
    add('관리자 정책', POLICY.enabled, POLICY.enabled ? `${POLICY.orgName || '기본 정책'} · 꺼진 기능 ${Object.entries(POLICY.features).filter(([, v]) => !v).map(([k]) => FEATURE_NAME[k]).join(', ') || '없음'}` : '관리자가 업무센터를 끈 상태입니다');
    let ui = null; try { ui = JSON.parse(sessionStorage.getItem('userInfo') || 'null'); } catch {}
    add('로그인 세션', !!ui, ui ? '사용자 정보 확인됨' : '그룹웨어 로그인 정보를 읽지 못했습니다');
    add('사용자별 저장소', currentKey !== 'default', currentKey !== 'default' ? '사용자별로 분리되어 저장됩니다' : '사용자를 식별하지 못해 공용 저장소를 쓰는 중입니다');
    let w = false; try { localStorage.setItem('bwyfgw:diag', '1'); localStorage.removeItem('bwyfgw:diag'); w = true; } catch {}
    add('브라우저 저장소', w, w ? `쓰기 가능 · 사용 ${Math.round(inventory().reduce((a, r) => a + r.kb, 0))}KB` : '저장할 수 없습니다(저장 공간 부족 또는 차단)');
    const pat = store.get('patterns', null), n = pat && pat.docs ? Object.keys(pat.docs).length : 0;
    add('기안 패턴 학습', n > 0, n ? `${n}건 학습됨` : '아직 학습 전입니다(새로 만들기 → 결과보고를 열면 자동 학습)');
    const au = auditState();
    add('감사 기록 무결성', au.ok, au.ok ? `${au.checked}건 검증` : `이상 감지: ${au.reason}`);
    add('조회 전용 연결', true, `${GW.readOnlyEndpoints().length}개 엔드포인트(쓰기 요청 없음)`);
    const up = store.get('updateInfo', null);
    if (up && up.latest) { const c = R.compareVersions(up.latest, VERSION); add('최신 버전', c <= 0, c > 0 ? `새 버전 ${up.latest} 이 있습니다` : '최신입니다'); }
    else add('최신 버전', true, up && up.err ? `확인하지 못함(${up.err})` : '아직 확인 전');
    const errs = store.get('errors', []);
    add('최근 오류', errs.length === 0, errs.length ? `${errs.length}건 (마지막: ${R.maskSensitive(errs[errs.length - 1].where)})` : '없음');
    return out;
  }
  function diagText(rows) {
    const errs = store.get('errors', []).slice(-10).map(e => `- ${new Date(e.at).toISOString()} ${e.where}: ${e.msg}`).join('\n');
    return R.maskSensitive(`GW 통합 업무센터 진단 보고서\n생성: ${new Date().toISOString()}\n버전: ${VERSION}\n브라우저: ${navigator.userAgent}\n\n` + rows.map(r => `[${r.ok ? 'OK' : '확인필요'}] ${r.name}: ${r.detail}`).join('\n') + (errs ? `\n\n최근 오류\n${errs}` : ''));
  }
  async function openDiag() {
    closeOverlay();
    S.paletteOpen = true;
    await checkUpdate(false);
    const rows = diagChecks();
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1" style="width:min(720px,95vw);padding:22px 24px;max-height:88vh;overflow:auto" role="dialog" aria-label="진단">
      <button class="btn icon ghost x" data-act="closeHelp" aria-label="닫기">${ic('x')}</button>
      <h2 style="margin:0 0 4px;font-size:18px">진단</h2><div class="muted" style="margin-bottom:10px">문제가 생기면 이 보고서를 복사해 담당자에게 전달하세요. 이메일·전화번호·사번은 자동으로 가려집니다.</div>
      ${rows.map(r => `<div style="display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--line)"><b style="width:20px;color:${r.ok ? 'var(--ok)' : 'var(--hi)'}">${r.ok ? '✓' : '!'}</b><div style="flex:1"><b>${esc(r.name)}</b><div class="muted" style="font-size:12.5px">${esc(r.detail)}</div></div></div>`).join('')}
      <div class="acts" style="margin-top:12px"><button class="btn sm primary" data-act="govCopyDiag">진단 보고서 복사</button><button class="btn sm" data-act="govUpdate">업데이트 다시 확인</button><button class="btn sm" data-act="openData">데이터 관리</button></div></div></div>`;
  }
  async function govUpdate() {
    const i = await checkUpdate(true);
    if (i && i.latest && R.compareVersions(i.latest, VERSION) > 0) toast(`새 버전 ${i.latest} 이 있습니다. 관리자에게 알려 주세요.`); else toast(i && i.err ? '업데이트를 확인하지 못했습니다.' : '최신 버전입니다.');
    openDiag();
  }

  // ---------- 최초 사용 안내 ----------
  function showNoticeIfNeeded() {
    if (S.settings.noticeAck === NOTICE_VER) return false;
    S.paletteOpen = true;
    $('#overlay').innerHTML = `<div class="modal"><div class="dlg" data-stop="1" style="width:min(640px,95vw);padding:24px 26px;max-height:88vh;overflow:auto" role="dialog" aria-label="사용 안내">
      <h2 style="margin:0 0 8px;font-size:19px">GW 통합 업무센터 사용 안내</h2>
      <ul style="line-height:1.8;padding-left:18px;margin:0 0 10px">
        <li>이 도구는 <b>내 화면에서 조회</b>하고, 기안 화면에 <b>값을 채워 주는 보조 도구</b>입니다.</li>
        <li><b>상신·결재·임시저장·발송·삭제는 하지 않습니다.</b> 모든 자동 입력은 결재 직전에서 멈추며, 내용 확인과 상신은 본인이 합니다.</li>
        <li>내 결재문서를 읽어 기안 서식을 학습합니다. 학습 자료는 <b>이 브라우저에만</b> 저장되고 ${POLICY.retentionDays}일 뒤 자동 삭제됩니다. 외부 서버로 보내지 않습니다.</li>
        <li>비밀번호는 기록·저장하지 않습니다. 공용 PC에서는 사용 후 설정의 “데이터 관리”에서 지워 주세요.</li>
        <li>자동 입력 결과는 단계별로 ✓/✗로 보고합니다. ✗ 항목과 금액·결재라인·기록물철은 반드시 직접 확인하세요.</li>
        ${POLICY.orgName ? `<li>배포 기관: ${esc(POLICY.orgName)}${POLICY.message ? ' · ' + esc(POLICY.message) : ''}</li>` : ''}
      </ul>
      <div class="acts" style="justify-content:flex-end"><button class="btn primary" data-act="govAck">확인했습니다</button></div></div></div>`;
    return true;
  }
  function govAck() { S.settings.noticeAck = NOTICE_VER; saveLocal(); closeOverlay(); }
