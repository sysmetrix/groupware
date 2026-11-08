// GW 통합 업무센터 · shell
// Fragment of boot() in workcenter.browser.js; assembled by scripts/live-build.mjs.
  // ---------- shell ----------
  const host = document.createElement('div');
  host.id = 'bwyfgw-workcenter';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:none';
  const root = host.attachShadow({mode: 'open'});
  const fab = document.createElement('div');
  fab.id = 'bwyfgw-wc-fab';
  fab.setAttribute('role', 'button'); fab.tabIndex = 0;
  fab.setAttribute('aria-label', '통합 업무센터 열기');
  fab.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  fab.title = '통합 업무센터 열기 (Alt+G)';
  // 런처 스타일: 어두운 유리 질감의 상단 "아일랜드". 마우스를 올리면 오늘 요약이 펼쳐지고 커서를 따라 빛이 움직인다.
  if (!document.getElementById('bwyfgw-wc-fab-style')) {
    const st = document.createElement('style');
    st.id = 'bwyfgw-wc-fab-style';
    st.textContent = `
#bwyfgw-wc-fab{position:fixed;right:22px;bottom:150px;z-index:2147483500;display:flex!important;align-items:center;gap:9px;height:38px;padding:0 9px 0 6px;border-radius:999px;cursor:pointer;user-select:none;color:#eef0ff;
 font:600 13.5px/1 "Pretendard Variable","Pretendard","Malgun Gothic",system-ui,sans-serif;letter-spacing:-.01em;
 background:linear-gradient(180deg,rgba(30,33,52,.92),rgba(14,16,28,.94));-webkit-backdrop-filter:blur(14px) saturate(1.5);backdrop-filter:blur(14px) saturate(1.5);
 box-shadow:0 0 0 1px rgba(255,255,255,.08) inset,0 1px 2px rgba(0,0,0,.18),0 8px 24px -10px rgba(15,23,42,.5);
 transition:box-shadow .25s,transform .2s,padding .25s;animation:bwFabIn .5s cubic-bezier(.2,.9,.3,1.2) both}
#bwyfgw-wc-fab[style*="display: none"]{display:none!important}
#bwyfgw-wc-fab::before{content:"";position:absolute;inset:0;border-radius:inherit;overflow:hidden;background:radial-gradient(120px 60px at var(--mx,50%) var(--my,0%),rgba(139,147,255,.35),transparent 70%);opacity:0;transition:opacity .25s;pointer-events:none}
#bwyfgw-wc-fab:hover::before{opacity:1}
#bwyfgw-wc-fab:hover{box-shadow:0 0 0 1px rgba(165,180,255,.5) inset,0 1px 2px rgba(0,0,0,.2),0 10px 28px -10px rgba(15,23,42,.6);padding-right:9px}
#bwyfgw-wc-fab:active{transform:scale(.97)}
#bwyfgw-wc-fab:focus-visible{outline:2px solid #a5b4ff;outline-offset:3px}
#bwyfgw-wc-fab .lg{width:22px;height:22px;border-radius:7px;flex:0 0 auto;display:grid;place-items:center;background:linear-gradient(135deg,#4f46e5,#7c5cf0);box-shadow:0 0 0 1px rgba(255,255,255,.2) inset;position:relative}
#bwyfgw-wc-fab .lg svg{width:14px;height:14px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
#bwyfgw-wc-fab .t{position:relative;white-space:nowrap}
#bwyfgw-wc-fab{overflow:visible}
#bwyfgw-wc-fab .sm{position:absolute;bottom:calc(100% + 8px);right:0;white-space:nowrap;color:#fff;font-weight:500;font-size:12.5px;background:rgba(18,20,32,.96);padding:7px 11px;border-radius:10px;box-shadow:0 8px 24px -8px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.1) inset;opacity:0;transform:translateY(4px);pointer-events:none;transition:opacity .2s,transform .2s}
#bwyfgw-wc-fab:hover .sm,#bwyfgw-wc-fab:focus-visible .sm{opacity:1;transform:none}
#bwyfgw-wc-fab.drag{cursor:grabbing;transition:none}#bwyfgw-wc-fab.drag .sm{display:none}
#bwyfgw-wc-fab .b{position:relative;min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:inline-grid;place-items:center;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;background:#6366f1;color:#fff}
#bwyfgw-wc-fab:hover:not([data-st="urgent"]) .b{display:none}
#bwyfgw-wc-fab[data-st="urgent"] .b{background:#ff4d5a;color:#fff;box-shadow:0 0 0 0 rgba(255,77,90,.6);animation:bwFabPulse 2s infinite}
#bwyfgw-wc-fab[data-st="ok"] .b{background:transparent;color:#4ade9f;min-width:auto;padding:0 2px;font-size:14px}
#bwyfgw-wc-fab kbd{position:relative;font:600 11px/1 system-ui,sans-serif;color:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.18);border-radius:5px;padding:3px 5px;background:rgba(255,255,255,.08);max-width:0;opacity:0;overflow:hidden;padding-left:0;padding-right:0;border-width:0;transition:max-width .3s,opacity .25s,padding .25s}
#bwyfgw-wc-fab:hover kbd{max-width:48px;opacity:1;padding:4px 5px;border-width:1px}
@keyframes bwFabPulse{0%{box-shadow:0 0 0 0 rgba(255,77,90,.55)}70%{box-shadow:0 0 0 8px rgba(255,77,90,0)}100%{box-shadow:0 0 0 0 rgba(255,77,90,0)}}
@keyframes bwFabIn{from{opacity:0;transform:translateY(12px) scale(.92)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){#bwyfgw-wc-fab,#bwyfgw-wc-fab *{animation:none!important;transition:none!important}}
`;
    document.head.appendChild(st);
  }
  // 끌어서 옮기기: 다른 화면 요소와 겹치면 원하는 곳으로 옮긴다. 놓으면 가까운 좌우 끝에 붙고, 위치는 기억한다.
  try { const p = JSON.parse(localStorage.getItem('bwyfgw:fabpos') || 'null'); if (p && Number.isFinite(p.top)) { fab.style.top = Math.max(8, Math.min(p.top, innerHeight - 56)) + 'px'; fab.style.bottom = 'auto'; if (p.side === 'left') { fab.style.left = '22px'; fab.style.right = 'auto'; } } } catch {}
  let dragSt = null, wasDrag = false;
  fab.addEventListener('pointerdown', e => { if (e.button !== 0) return; const r = fab.getBoundingClientRect(); dragSt = {x: e.clientX, y: e.clientY, l: r.left, t: r.top, moved: false}; try { fab.setPointerCapture(e.pointerId); } catch {} });
  fab.addEventListener('pointermove', e => { if (!dragSt) return; const dx = e.clientX - dragSt.x, dy = e.clientY - dragSt.y; if (!dragSt.moved && Math.hypot(dx, dy) < 6) return; dragSt.moved = true; fab.classList.add('drag'); fab.style.left = Math.max(4, Math.min(innerWidth - fab.offsetWidth - 4, dragSt.l + dx)) + 'px'; fab.style.top = Math.max(4, Math.min(innerHeight - fab.offsetHeight - 4, dragSt.t + dy)) + 'px'; fab.style.right = 'auto'; fab.style.bottom = 'auto'; });
  const endDrag = () => { if (!dragSt) return; const m = dragSt.moved; dragSt = null; fab.classList.remove('drag'); if (!m) return; wasDrag = true; setTimeout(() => { wasDrag = false; }, 50); const r = fab.getBoundingClientRect(); const side = (r.left + r.width / 2) < innerWidth / 2 ? 'left' : 'right'; fab.style.transition = 'left .25s,right .25s'; if (side === 'left') { fab.style.left = '22px'; fab.style.right = 'auto'; } else { fab.style.left = 'auto'; fab.style.right = '22px'; } setTimeout(() => { fab.style.transition = ''; }, 300); try { localStorage.setItem('bwyfgw:fabpos', JSON.stringify({top: Math.round(r.top), side})); } catch {} };
  fab.addEventListener('pointerup', endDrag); fab.addEventListener('pointercancel', endDrag);
  fab.addEventListener('dblclick', () => { try { localStorage.removeItem('bwyfgw:fabpos'); } catch {} fab.style.cssText = ''; });
  fab.addEventListener('mousemove', e => { const r = fab.getBoundingClientRect(); fab.style.setProperty('--mx', (e.clientX - r.left) + 'px'); fab.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
  fab.innerHTML = '<span class="lg"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><path d="m14 17 2 2 4-4"/></svg></span><span class="t">업무센터</span>';
  // One-time bubble after closing: tells where the work center went.
  const tipBubble = document.createElement('div');
  tipBubble.style.cssText = 'position:fixed;right:22px;bottom:70px;z-index:2147483500;background:#202124;color:#fff;font:13px "Malgun Gothic",sans-serif;padding:9px 13px;border-radius:9px;box-shadow:0 4px 14px rgba(0,0,0,.3);display:none;max-width:280px;line-height:1.5';
  tipBubble.textContent = '업무센터는 화면 오른쪽 아래의 "업무센터" 버튼(또는 Alt+G)으로 다시 엽니다.';
  let tipTimer = 0;
  fab.addEventListener('click', () => { if (wasDrag) return; open(); });
  document.body.append(host, fab, tipBubble);

  const WC_CSS = '/*@WC_CSS@*/';
  // One small line-icon set (stroke icons, 24px grid) so every screen uses the same visual language.
  const ICONS = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    inbox: '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5 5h14l1 8v6H4v-6z"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.3-4.3"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="8" rx="1.5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    wallet: '<path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M16 13h2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    report: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5"/><path d="M12 17h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    down: '<path d="M12 4v12M6 11l6 6 6-6"/><path d="M5 20h14"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    play: '<path d="M7 5v14l11-7z"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    clip: '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3L14.5 7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    snooze: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  };
  const ic = (n, extra = '') => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${ICONS[n] || ''}</svg>`;
  root.innerHTML = `<style>${WC_CSS}</style><div class="wc nopane" id="wc" role="application" aria-label="GW 통합 업무센터"><header role="banner">
<button class="home" data-act="home" title="처음 화면(오늘 할 일)으로 · H" aria-label="업무센터 처음 화면"><span class="logo">${ic('home')}</span>업무센터</button>
<label class="srch" title="통합검색 또는 명령 (Ctrl+K)">${ic('search')}<input id="gsearch" placeholder="메일·문서·사람 검색 또는 명령" autocomplete="off" aria-label="통합검색"><kbd>Ctrl K</kbd></label>
<span class="sp"></span>
<button class="stat" id="meta" data-act="refresh" title="지금 다시 읽기 (R)"></button>
<button class="hb primary" data-act="openCmd" title="AI 업무 지시창 (자연어로 기안·회신·신청 자동화)">${ic('star')}AI 지시</button>
<button class="hb" data-act="menuNew" title="새 메일·새 기안·근태신청">${ic('plus')}새로 만들기</button>
<button class="hb icon" data-act="openHistory" title="자동화 작업 내역 및 검증 로그" aria-label="작업 내역">${ic('clock')}</button>
<button class="hb icon" data-act="menuBell" id="bell" title="새로 들어온 항목" aria-label="알림">${ic('bell')}</button>
<button class="hb" data-act="help" title="사용법·단축키 (?)">${ic('help')}도움말</button>
<button class="hb back" data-act="close" title="업무센터를 접고 원래 그룹웨어 화면으로 (화면 위 가운데 '업무센터' 버튼이나 Alt+G로 다시 열기)">${ic('back')}그룹웨어로 돌아가기</button></header>
<div class="band" id="band" role="status" aria-live="polite"></div><nav id="nav" aria-label="업무센터 메뉴"></nav><main id="main" tabindex="-1"></main><div class="split" id="split" title="끌어서 오른쪽 창 너비 조절"></div><aside id="pane" aria-label="선택한 항목"></aside><div id="overlay"></div></div>`;
  const $ = sel => root.querySelector(sel);
  const wcEl = $('#wc');
  const applyLook = () => {
    wcEl.dataset.fs = S.settings.fontSize;
    wcEl.classList.toggle('dark', S.settings.theme === 'dark');
    wcEl.style.setProperty('--paneW', `${Math.max(360, Math.min(window.innerWidth * 0.75, S.settings.paneWidth))}px`);
  };
  applyLook();

