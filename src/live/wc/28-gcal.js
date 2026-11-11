// GW 비서 · 구글 일정 (내 Google 캘린더를 GW 비서 안에서 보기)
// 읽기 전용 화면: Google 캘린더 공식 "퍼가기(embed)" 화면을 넣을 뿐이며, 구글 계정 정보나 일정 내용은 GW 비서가 읽거나 저장하지 않는다.
// 저장하는 것은 이메일(캘린더 ID)과 보기 방식뿐이다. 이 브라우저에 구글 로그인이 되어 있어야 내 일정이 보인다.
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.

  const GCAL_MODES = [['WEEK', '주'], ['MONTH', '월'], ['AGENDA', '목록']];
  const gcalCfg = () => (S.settings.gcal = S.settings.gcal || {});
  const gcalIdOk = v => /^[A-Za-z0-9._#+\-]+@[A-Za-z0-9._\-]+$/.test(v) && v.length <= 200;
  const gcalColorOk = v => /^#[0-9a-fA-F]{6}$/.test(v);
  // 캘린더 목록: 내 계정(email)이 맨 앞, 나머지는 cals(옛 버전의 extra도 읽는다). 항목은 {id, color, name}.
  function gcalList(c) {
    const meta = {};
    for (const x of (c.cals || (c.extra || []).map(id => ({id})))) if (x && x.id) meta[x.id] = x;
    const ids = [c.email, ...Object.keys(meta).filter(id => id !== c.email)].filter(Boolean);
    return ids.map(id => ({id, color: (meta[id] || {}).color || '', name: (meta[id] || {}).name || ''}));
  }
  function gcalUrl(c) {
    const q = [];
    gcalList(c).slice(0, 12).forEach(x => { q.push('src=' + encodeURIComponent(x.id)); if (gcalColorOk(x.color)) q.push('color=' + encodeURIComponent(x.color)); });
    q.push('ctz=Asia%2FSeoul', 'hl=ko', 'mode=' + (GCAL_MODES.some(m => m[0] === c.mode) ? c.mode : 'WEEK'), 'showTitle=0', 'showPrint=0', 'showTz=0');
    return 'https://calendar.google.com/calendar/embed?' + q.join('&');
  }
  // 한 줄에 하나: "캘린더ID [#색상] [이름]"
  const gcalLines = c => gcalList(c).map(x => [x.id, x.color, x.name].filter(Boolean).join(' ')).join('\n');
  function gcalParse(text) {
    const out = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const t = line.trim().split(/\s+/).filter(Boolean);
      if (!t.length) continue;
      const id = t.shift();
      if (!gcalIdOk(id)) return {bad: id};
      const ci = t.findIndex(gcalColorOk);
      const color = ci >= 0 ? t.splice(ci, 1)[0] : '';
      out.push({id, color: color.toLowerCase(), name: t.join(' ').slice(0, 30)});
    }
    return {list: out};
  }
  function vGcal() {
    if (!allowed('googleCalendar')) return pgh('구글 일정', '관리자 설정으로 꺼져 있습니다', '');
    const c = gcalCfg();
    const setup = !c.email || S.gcalEdit;
    if (setup) {
      return `${pgh('구글 일정', '내 Google 캘린더를 GW 비서 안에서 봅니다')}
      <div class="box" id="gcalSetup"><div style="display:flex;flex-direction:column;gap:10px;max-width:700px">
        <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)">내 구글 계정 이메일<input class="inp" id="gcalEmail" type="email" value="${esc(c.email || '')}" placeholder="예) name@gmail.com" style="height:36px"></label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)">캘린더 목록과 색 (한 줄에 하나: 캘린더ID 색상 이름)<textarea class="inp" id="gcalExtra" rows="9" style="font-family:inherit" placeholder="name@gmail.com #e7ba51 일상&#10;xxxx@group.calendar.google.com #489160 성장">${esc(gcalLines(c))}</textarea></label>
        <div class="muted" style="font-size:12px">색상(#e7ba51 같은 6자리)과 이름은 생략해도 됩니다. 색은 구글 캘린더 화면의 색과 같게 적으면 원본처럼 구분됩니다. 캘린더 ID는 구글 캘린더 → 해당 캘린더 설정 → "캘린더 통합"에 있습니다. 다른 PC에서 이미 설정했다면 입력하지 말고 설정 → “다른 PC로 설정 옮기기”에서 파일로 가져오세요. 이 브라우저에서 구글에 로그인되어 있어야 하며, 일정 내용은 GW 비서에 저장되지 않고 구글 화면이 그대로 표시됩니다.</div>
        <div class="acts"><button class="btn primary" data-act="gcalSave">저장하고 보기</button>${c.email ? '<button class="btn" data-act="gcalCancel">취소</button>' : ''}</div>
      </div></div>`;
    }
    const list = gcalList(c);
    const legend = list.filter(x => x.name || x.color).map(x => `<span style="display:inline-flex;align-items:center;gap:5px;margin:0 12px 4px 0"><i style="width:11px;height:11px;border-radius:3px;background:${gcalColorOk(x.color) ? x.color : '#9aa0a6'};display:inline-block"></i>${esc(x.name || x.id.replace(/@.*/, '').slice(0, 14))}</span>`).join('');
    const tools = `<div class="seg">${GCAL_MODES.map(([k, n]) => `<button class="${(c.mode || 'WEEK') === k ? 'on' : ''}" data-act="gcalMode" data-v="${k}">${n}</button>`).join('')}</div>
      <button class="btn sm primary" data-act="gcalNew">${ic('plus')}새 일정</button>
      <button class="btn sm" data-act="gcalOpen">구글 캘린더 열기</button>
      <button class="btn sm" data-act="gcalEdit">캘린더·색 설정</button>`;
    return `${pgh('구글 일정', esc(c.email) + (list.length > 1 ? ` 외 ${list.length - 1}개` : ''), tools)}
      ${legend ? `<div class="muted" style="font-size:13px;margin:2px 0 8px">${legend}</div>` : ''}
      <iframe id="gcalFrame" title="구글 캘린더" src="${esc(gcalUrl(c))}" referrerpolicy="no-referrer" style="width:100%;height:calc(100vh - 270px);min-height:520px;border:1px solid var(--line, #d0d5dd);border-radius:12px;background:#fff"></iframe>
      <div class="muted" style="font-size:12px;margin-top:6px">일정이 안 보이고 로그인 화면이 나오면 "구글 캘린더 열기"로 로그인한 뒤 다시 들어오세요. 일정을 고치려면 "구글 캘린더 열기"를 누르세요.</div>`;
  }
  function gcalSave() {
    const email = ($('#gcalEmail') || {}).value ? $('#gcalEmail').value.trim() : '';
    if (!gcalIdOk(email)) { toast('구글 이메일 형식이 맞지 않습니다.'); return; }
    const p = gcalParse(($('#gcalExtra') || {}).value);
    if (p.bad) { toast(`캘린더 ID 형식이 맞지 않습니다: ${p.bad.slice(0, 40)}`); return; }
    const seen = new Set(), cals = [];
    for (const x of p.list) if (!seen.has(x.id)) { seen.add(x.id); cals.push(x); }
    const c = gcalCfg(); c.email = email; c.cals = cals.slice(0, 12); delete c.extra;
    S.gcalEdit = false; saveLocal(); renderMain(); toast('구글 일정을 저장했습니다.');
  }
  const gcalOpenTab = url => { const w = window.open(url, '_blank', 'noopener'); if (!w) toast('새 탭이 막혔습니다. 팝업 허용 후 다시 눌러 주세요.'); };
