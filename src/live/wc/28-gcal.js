// GW 통합 업무센터 · 구글 일정 (내 Google 캘린더를 업무센터 안에서 보기)
// 읽기 전용 화면: Google 캘린더 공식 "퍼가기(embed)" 화면을 넣을 뿐이며, 구글 계정 정보나 일정 내용은 업무센터가 읽거나 저장하지 않는다.
// 저장하는 것은 이메일(캘린더 ID)과 보기 방식뿐이다. 이 브라우저에 구글 로그인이 되어 있어야 내 일정이 보인다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const GCAL_MODES = [['WEEK', '주'], ['MONTH', '월'], ['AGENDA', '목록']];
  const gcalCfg = () => (S.settings.gcal = S.settings.gcal || {});
  const gcalIdOk = v => /^[A-Za-z0-9._#+\-]+@[A-Za-z0-9._\-]+$/.test(v) && v.length <= 200;
  const gcalIds = c => [c.email, ...(c.extra || [])].filter(Boolean);
  function gcalUrl(c) {
    const p = new URLSearchParams();
    gcalIds(c).slice(0, 12).forEach(id => p.append('src', id));
    p.set('ctz', 'Asia/Seoul'); p.set('hl', 'ko'); p.set('mode', GCAL_MODES.some(m => m[0] === c.mode) ? c.mode : 'WEEK');
    p.set('showTitle', '0'); p.set('showPrint', '0'); p.set('showTz', '0');
    return 'https://calendar.google.com/calendar/embed?' + p.toString();
  }
  function vGcal() {
    if (!allowed('googleCalendar')) return pgh('구글 일정', '관리자 설정으로 꺼져 있습니다', '');
    const c = gcalCfg();
    const setup = !c.email || S.gcalEdit;
    if (setup) {
      return `${pgh('구글 일정', '내 Google 캘린더를 업무센터 안에서 봅니다')}
      <div class="box" id="gcalSetup"><div style="display:flex;flex-direction:column;gap:10px;max-width:560px">
        <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)">내 구글 계정 이메일<input class="inp" id="gcalEmail" type="email" value="${esc(c.email || '')}" placeholder="예) name@gmail.com" style="height:36px"></label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)">함께 볼 다른 캘린더 ID (선택, 쉼표로 구분)<input class="inp" id="gcalExtra" value="${esc((c.extra || []).join(', '))}" placeholder="예) xxxx@group.calendar.google.com" style="height:36px"></label>
        <div class="muted" style="font-size:12px">다른 캘린더 ID는 구글 캘린더 → 해당 캘린더 설정 → "캘린더 통합"의 "캘린더 ID"에 있습니다. 이 브라우저에서 구글에 로그인되어 있어야 하며, 일정 내용은 업무센터에 저장되지 않고 구글 화면이 그대로 표시됩니다.</div>
        <div class="acts"><button class="btn primary" data-act="gcalSave">저장하고 보기</button>${c.email ? '<button class="btn" data-act="gcalCancel">취소</button>' : ''}</div>
      </div></div>`;
    }
    const tools = `<div class="seg">${GCAL_MODES.map(([k, n]) => `<button class="${(c.mode || 'WEEK') === k ? 'on' : ''}" data-act="gcalMode" data-v="${k}">${n}</button>`).join('')}</div>
      <button class="btn sm primary" data-act="gcalNew">${ic('plus')}새 일정</button>
      <button class="btn sm" data-act="gcalOpen">구글 캘린더 열기</button>
      <button class="btn sm" data-act="gcalEdit">계정·캘린더 설정</button>`;
    return `${pgh('구글 일정', esc(c.email) + (c.extra && c.extra.length ? ` 외 ${c.extra.length}개` : ''), tools)}
      <iframe id="gcalFrame" title="구글 캘린더" src="${esc(gcalUrl(c))}" referrerpolicy="no-referrer" style="width:100%;height:calc(100vh - 250px);min-height:520px;border:1px solid var(--line, #d0d5dd);border-radius:12px;background:#fff"></iframe>
      <div class="muted" style="font-size:12px;margin-top:6px">일정이 안 보이고 로그인 화면이 나오면 "구글 캘린더 열기"로 로그인한 뒤 다시 들어오세요. 일정을 고치려면 "구글 캘린더 열기"를 누르세요.</div>`;
  }
  function gcalSave() {
    const email = ($('#gcalEmail') || {}).value ? $('#gcalEmail').value.trim() : '';
    const extra = String(($('#gcalExtra') || {}).value || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
    if (!gcalIdOk(email)) { toast('구글 이메일 형식이 맞지 않습니다.'); return; }
    const bad = extra.find(x => !gcalIdOk(x));
    if (bad) { toast(`캘린더 ID 형식이 맞지 않습니다: ${bad.slice(0, 40)}`); return; }
    const c = gcalCfg(); c.email = email; c.extra = [...new Set(extra)].slice(0, 11);
    S.gcalEdit = false; saveLocal(); renderMain(); toast('구글 일정을 연결했습니다.');
  }
  const gcalOpenTab = url => { const w = window.open(url, '_blank', 'noopener'); if (!w) toast('새 탭이 막혔습니다. 팝업 허용 후 다시 눌러 주세요.'); };