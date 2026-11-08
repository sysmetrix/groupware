/*
 * GW 통합 업무센터 v3.0.0 — one interactive page on top of the logged-in https://gw.bwyf.or.kr tab.
 *
 * Data comes from window.BWYFGW (allow-listed read/search APIs) and window.BWYFGW_REPORT (analysis).
 * The right-hand pane embeds the groupware's own screens (approval document, board article, mail
 * compose, new draft, attendance request). Real processing (결재·접수·배부·발송·답장) happens there,
 * with the groupware's own buttons. This script itself never writes to the groupware.
 * Local state (hidden/snooze/plan/to-do/settings/caches) lives in this browser's localStorage.
 */
(() => {
  'use strict';
  const VERSION = '3.0.0';
  let api = null;
  const lazy = {
    version: VERSION,
    open() { if (!api) api = boot(); api.open(); },
    close() { if (api) api.close(); },
    destroy() { if (api) api.destroy(); api = null; },
    refresh() { if (!api) api = boot(); return api.refresh(); },
    install(src) { if (typeof src !== 'string' || src.length < 1000) return false; try { localStorage.setItem('bwyfgw:wc:src', src); return true; } catch { return false; } },
    state() { return api ? api.state() : {booted: false}; },
    debug() { return api ? api.debug() : null; },
  };
  if (window.BWYFGW_WC && typeof window.BWYFGW_WC.destroy === 'function') { try { window.BWYFGW_WC.destroy(); } catch {} }
  window.BWYFGW_WC = Object.freeze(lazy);

  function boot() {
  const GW = window.BWYFGW, R = window.BWYFGW_REPORT;
  if (!GW || !R) throw new Error('BWYFGW 수집기와 분석 모듈이 먼저 로드되어야 합니다.');

  // ---------- storage ----------
  const LS = 'bwyfgw:wc:';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(LS + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(LS + k); } catch {} },
  };
  const DEFAULT_SETTINGS = {refreshMin: 5, notify: false, budget: [{project: 'A201', label: '전략경영실운영', filter: '노121'}], urgentWords: [], mailCount: 100, days: 14, fontSize: 'm', theme: 'light', paneWidth: 560, beginner: true, tourDone: false};
  const migrateTodos = list => (Array.isArray(list) ? list : []).map(t => ({id: t.id || `t${t.at || Date.now()}${Math.random().toString(36).slice(2, 6)}`, title: t.title, due: t.due || '', status: t.status || (t.done ? 'done' : 'todo'), source: t.source || '', url: t.url || '', at: t.at || Date.now()}));
  const S = {
    settings: {...DEFAULT_SETTINGS, ...store.get('settings', {})},
    hidden: store.get('hidden', store.get('done', {})), snooze: store.get('snooze', {}), plan: store.get('plan', {}),
    todos: migrateTodos(store.get('todos', [])), newKeys: new Set(store.get('newKeys', [])), activity: store.get('activity', []), seenActivity: store.get('seenActivity', 0),
    history: store.get('history', []), routing: store.get('routing', null), forms: store.get('forms', null),
    raw: null, a: null, view: 'today', loading: false, error: '', lastRefresh: null, pendingRefresh: false,
    filter: {area: 'all', level: 'all', q: '', onlyNew: false, showHidden: false}, multi: new Set(), lastClickKey: '',
    apTab: 'distWaiting', apMore: {}, mailFilter: 'all', mailGroup: false,
    sel: null, pane: {url: '', mounted: '', expanded: false, extract: null, preview: null},
    focus: null, focusConfirmed: false,
    search: {kw: '', types: ['doc', 'mail', 'board', 'file', 'person'], period: '', res: null, busy: false, more: {}}, mailSearch: {kw: '', res: null},
    budget: {project: '', filter: '', table: null, ledger: null, monthly: null, month: '', busy: false, q: '', seq: 0},
    att: {month: '', rows: null, busy: false, seq: 0, day: ''}, cal: {offset: 0},
    weekly: store.get('weekly', ''), undo: [], open: false, paletteOpen: false, helpOpen: false, menuOpen: '',
  };
  const saveLocal = () => {
    store.set('hidden', S.hidden); store.set('snooze', S.snooze); store.set('plan', S.plan); store.set('todos', S.todos); store.set('settings', S.settings);
    store.set('newKeys', [...S.newKeys]); store.set('activity', S.activity.slice(-150)); store.set('seenActivity', S.seenActivity); store.set('history', S.history.slice(-40)); store.set('weekly', S.weekly);
  };

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const won = n => Math.round(Number(n || 0)).toLocaleString('ko-KR');
  const pct = n => `${(Math.round(Number(n || 0) * 10) / 10).toFixed(1)}%`;
  const ymd8 = s => (s && /^\d{8}/.test(s)) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || '');
  const hm4 = s => (s && /^\d{4}$/.test(s)) ? `${s.slice(0, 2)}:${s.slice(2)}` : (s || '');
  const dtm12 = s => (s && /^\d{12}/.test(s)) ? `${ymd8(s)} ${s.slice(8, 10)}:${s.slice(10, 12)}` : ymd8(s);
  const mins = m => m === null || m === undefined ? '-' : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const today = () => R.kstNow(new Date()).date;
  const hhmm = d => { const k = R.kstNow(d); return `${String(k.hh).padStart(2, '0')}:${String(k.mm).padStart(2, '0')}`; };
  const ddayText = n => n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`;
  const PRI = {high: '긴급', medium: '보통', low: '참고'};
  const download = (name, text, type = 'text/plain;charset=utf-8') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const copyText = async text => { try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); } catch { toast('복사하지 못했습니다.'); } };
  // Rich copy: 한글/워드에 붙여넣으면 표·굵게가 유지된다.
  const copyRich = async (html, text) => {
    try { await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([html], {type: 'text/html'}), 'text/plain': new Blob([text], {type: 'text/plain'})})]); toast('한글에 붙여넣을 수 있게 복사했습니다.'); }
    catch { copyText(text); }
  };
  const hl = (text, kw) => { const t = String(text ?? ''); if (!kw) return esc(t); const i0 = []; const low = t.toLowerCase(), k = String(kw).toLowerCase(); let i = low.indexOf(k); while (i >= 0 && i0.length < 50) { i0.push(i); i = low.indexOf(k, i + k.length); } if (!i0.length) return esc(t); let out = '', p = 0; for (const s of i0) { out += esc(t.slice(p, s)) + `<mark>${esc(t.slice(s, s + k.length))}</mark>`; p = s + k.length; } return out + esc(t.slice(p)); };
  const isHidden = k => !!S.hidden[k];
  const isSnoozed = k => S.snooze[k] && S.snooze[k] > Date.now();
  const tomorrow8 = () => { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(8, 0, 0, 0); return t.getTime(); };
  const uid = () => `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

  // ---------- shell ----------
  const host = document.createElement('div');
  host.id = 'bwyfgw-workcenter';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:none';
  const root = host.attachShadow({mode: 'open'});
  const fab = document.createElement('div');
  fab.id = 'bwyfgw-wc-fab';
  fab.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483500;background:#1a73e8;color:#fff;font:600 13px "Malgun Gothic",sans-serif;padding:9px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;user-select:none';
  fab.textContent = '업무센터';
  fab.title = '통합 업무센터 열기 (Alt+G)';
  fab.addEventListener('click', () => open());
  document.body.append(host, fab);

  root.innerHTML = `<style>
:host{all:initial}
*{box-sizing:border-box}
.wc{--fs:14px;--bg:#f3f5f9;--fg:#1d2330;--muted:#5f6b7a;--line:#e1e5ec;--card:#fff;--soft:#f7f9fc;--sel:#e8f0fe;--accent:#1a73e8;--hi:#c5221f;--md:#c76a00;--lo:#5f6368;--ok:#188038;--head:#1d2b4f;
 position:absolute;inset:0;display:grid;grid-template-columns:168px minmax(380px,1fr) 6px var(--paneW,560px);grid-template-rows:54px auto 1fr;background:var(--bg);color:var(--fg);font:var(--fs)/1.55 "Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif}
.wc[data-fs="s"]{--fs:12.5px}.wc[data-fs="l"]{--fs:16px}.wc[data-fs="xl"]{--fs:18px}
.wc.dark{--bg:#14171c;--fg:#e6e9ee;--muted:#9aa4b2;--line:#2a313b;--card:#1b2027;--soft:#20262e;--sel:#1f3350;--head:#0f1622}
.wc.nopane{grid-template-columns:168px 1fr 0 0}.wc.expanded{grid-template-columns:168px 0 6px 1fr}.wc.expanded main{display:none}
header{grid-column:1/5;display:flex;align-items:center;gap:8px;padding:0 12px;background:var(--head);color:#fff}
header .ttl{font-weight:700;font-size:calc(var(--fs)*1.08);white-space:nowrap}
header .badge{font-size:calc(var(--fs)*.78);background:rgba(255,255,255,.14);border-radius:999px;padding:2px 9px;white-space:nowrap}
header input{flex:1;max-width:460px;min-width:140px;border:0;border-radius:6px;padding:7px 10px;font:inherit}
header .meta{font-size:calc(var(--fs)*.82);opacity:.9;white-space:nowrap}header .meta.stale{color:#ffd166}
.hb{border:1px solid #40548a;background:#2e3f6b;color:#fff;border-radius:6px;padding:5px 9px;font:inherit;font-size:calc(var(--fs)*.9);cursor:pointer;white-space:nowrap;position:relative}
.hb:hover{background:#3a4d80}.hb .dot{position:absolute;top:-5px;right:-5px;background:#ff5252;color:#fff;border-radius:999px;font-size:10px;padding:0 5px}
.band{grid-column:2/5;padding:0}.band .b{padding:7px 14px;font-size:calc(var(--fs)*.9);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.band .b.err{background:#fdecea;color:#8c1d18}.band .b.warn{background:#fff6e0;color:#7a4b00}.band .b.info{background:#e8f0fe;color:#174ea6}
.wc.dark .band .b.err{background:#3b1f1f;color:#ffb4ab}.wc.dark .band .b.warn{background:#3a2f12;color:#ffd166}.wc.dark .band .b.info{background:#1c2c48;color:#a8c7fa}
nav{grid-row:2/4;background:var(--card);border-right:1px solid var(--line);padding:8px 0;overflow:auto}
nav a{display:flex;justify-content:space-between;align-items:center;padding:9px 14px;color:var(--fg);text-decoration:none;cursor:pointer;border-left:3px solid transparent}
nav a:hover{background:var(--soft)}nav a.on{background:var(--sel);border-left-color:var(--accent);font-weight:700}
nav a .n{font-size:calc(var(--fs)*.8);background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:0 7px}nav a .n.hot{background:#fde3e1;color:var(--hi);border-color:#f6c7c3}
nav .sep{height:1px;background:var(--line);margin:6px 0}nav .tip{padding:8px 14px;color:var(--muted);font-size:calc(var(--fs)*.8);line-height:1.8}
main{overflow:auto;padding:14px 16px 40px;position:relative}
.split{background:var(--line);cursor:col-resize}.split:hover,.split.drag{background:var(--accent)}
aside{overflow:hidden;border-left:1px solid var(--line);background:var(--card);display:flex;flex-direction:column;min-width:0}
h2{font-size:calc(var(--fs)*1.12);margin:2px 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}h3{font-size:calc(var(--fs)*1.0);margin:16px 0 6px;display:flex;align-items:center;gap:8px}
.btn{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:7px;padding:5px 11px;font:inherit;font-size:calc(var(--fs)*.92);cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;gap:4px}
.btn:hover{border-color:var(--accent);color:var(--accent)}.btn.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.btn.primary:hover{filter:brightness(1.08);color:#fff}
.btn.warn{color:var(--hi);border-color:#f1b0ad}.btn.ok{color:#fff;background:var(--ok);border-color:var(--ok)}.btn.sm{padding:2px 8px;font-size:calc(var(--fs)*.82)}.btn:disabled{opacity:.45;cursor:default}
.muted{color:var(--muted);font-size:calc(var(--fs)*.86)}.err{color:var(--hi)}.ok{color:var(--ok)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:9px 12px;cursor:pointer;transition:box-shadow .15s,transform .15s}
.tile:hover{box-shadow:0 4px 14px rgba(20,40,80,.12);transform:translateY(-1px)}.tile.on{outline:2px solid var(--accent)}
.tile .l{color:var(--muted);font-size:calc(var(--fs)*.84)}.tile .v{font-size:calc(var(--fs)*1.6);font-weight:700}.tile .s{color:var(--muted);font-size:calc(var(--fs)*.8)}.tile.hot .v{color:var(--hi)}.tile.unk .v{color:var(--muted);font-size:calc(var(--fs)*1.1)}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px;margin-bottom:12px}
.chart{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:9px 12px}.chart .ct{font-weight:700;font-size:calc(var(--fs)*.9);margin-bottom:4px;display:flex;justify-content:space-between}
svg text{font-family:inherit}svg .hit{cursor:pointer}svg .hit:hover{opacity:.75}
.bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}
.chip{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:2px 11px;cursor:pointer;font-size:calc(var(--fs)*.88);white-space:nowrap}.chip:hover{border-color:var(--accent)}.chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
input.f,select.f,textarea{font:inherit;border:1px solid var(--line);border-radius:7px;padding:6px 9px;background:var(--card);color:var(--fg)}
textarea{width:100%;min-height:260px}
.list{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.row{display:grid;grid-template-columns:22px 58px 1fr auto;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line);cursor:pointer;align-items:start;position:relative}
.row:last-child{border-bottom:0}.row:hover{background:var(--soft)}.row.sel{background:var(--sel)}.row.hid{opacity:.5}.row.multi{background:#fff8e1}.wc.dark .row.multi{background:#3a3220}
.row .t{font-weight:600;word-break:break-all}.row .d{color:var(--muted);font-size:calc(var(--fs)*.86)}.row .w{color:var(--muted);font-size:calc(var(--fs)*.82);white-space:nowrap;text-align:right}
.row .qa{display:none;position:absolute;right:8px;bottom:6px;gap:4px}.row:hover .qa{display:flex}
.pill{display:inline-block;padding:0 7px;border-radius:999px;font-size:calc(var(--fs)*.76);border:1px solid currentColor;margin:0 4px 2px 0;white-space:nowrap;line-height:1.6}
.pill.high{color:var(--hi)}.pill.medium{color:var(--md)}.pill.low{color:var(--lo)}.pill.new{color:var(--accent)}.pill.ok{color:var(--ok)}.pill.solid{background:var(--hi);color:#fff;border-color:var(--hi)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:calc(var(--fs)*.92)}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600;background:var(--soft);position:sticky;top:0;z-index:1}th.sort{cursor:pointer}
tr.click{cursor:pointer}tr.click:hover td{background:var(--soft)}tr.sel td{background:var(--sel)}tr.bad td{background:#fff4f3}.wc.dark tr.bad td{background:#3a2020}
.num{text-align:right;white-space:nowrap}.nowrap{white-space:nowrap}
.lv-관 td,.lv-항 td{font-weight:700}.lv-목 td:first-child{padding-left:18px}.lv-세 td:first-child{padding-left:30px}
.rate{height:6px;background:var(--soft);border:1px solid var(--line);border-radius:3px;margin-top:2px;position:relative}.rate i{display:block;height:100%;background:var(--accent);border-radius:3px}.rate i.low{background:var(--md)}.rate i.over{background:var(--hi)}.rate b{position:absolute;top:-3px;width:2px;height:10px;background:var(--fg);opacity:.55}
.ph{padding:12px 14px;border-bottom:1px solid var(--line);overflow:auto;max-height:46%;flex:0 0 auto}.ph.min{max-height:none}.ph.collapsed .body{display:none}
.ph .t{font-size:calc(var(--fs)*1.06);font-weight:700;word-break:break-all}
.kv{display:grid;grid-template-columns:88px 1fr;gap:2px 8px;font-size:calc(var(--fs)*.9);margin:6px 0}.kv b{color:var(--muted);font-weight:400}
.acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.box{border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-top:8px;background:var(--soft)}.box.tip{background:#eef4ff;border-color:#cfe0fb}.box.warn{background:#fff8ec;border-color:#f6d9a8}.box.okb{background:#eaf6ec;border-color:#bfe3c6}
.wc.dark .box.tip{background:#1c2c48;border-color:#2c4a7a}.wc.dark .box.warn{background:#3a2f12;border-color:#5a4718}.wc.dark .box.okb{background:#16301d;border-color:#245c33}
.frame{flex:1;position:relative;background:var(--soft);min-height:120px}.frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
.frame .empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);padding:20px;text-align:center;line-height:1.8}
.fbar{display:flex;gap:6px;align-items:center;padding:8px 10px;border-top:1px solid var(--line);background:var(--soft);flex-wrap:wrap}.fbar .prog{font-weight:700;margin-right:auto}
.pv{white-space:pre-wrap;max-height:220px;overflow:auto;font-size:calc(var(--fs)*.88);background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px}
mark{background:#fff1a8;color:inherit}.wc.dark mark{background:#5c4d00}
.toast{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);background:#1d2330;color:#fff;padding:9px 14px;border-radius:9px;font-size:calc(var(--fs)*.92);z-index:20;display:flex;gap:10px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.3)}
.toast button{background:transparent;color:#8ab4f8;border:1px solid #8ab4f8;border-radius:6px;padding:2px 8px;cursor:pointer;font:inherit}
.spin{display:inline-block;width:12px;height:12px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:sp 1s linear infinite;vertical-align:-2px}@keyframes sp{to{transform:rotate(360deg)}}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.cal .h{font-size:calc(var(--fs)*.8);color:var(--muted);text-align:center}
.cal .c{background:var(--card);border:1px solid var(--line);border-radius:7px;min-height:86px;padding:4px 5px;font-size:calc(var(--fs)*.8);overflow:hidden}.cal .c.out{opacity:.4}.cal .c.today{outline:2px solid var(--accent)}.cal .c.drop{background:var(--sel)}
.cal .c .dn{font-weight:700}.cal .c.sun .dn{color:var(--hi)}.cal .c.sat .dn{color:#1a5fc2}
.cal .ev{display:block;border-radius:4px;padding:0 4px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.ev.e{background:#e8f0fe;color:#174ea6}.ev.l{background:#e6f4ea;color:#137333}.ev.d{background:#fce8e6;color:#a50e0e}.ev.t{background:#fef7e0;color:#8a5a00}.ev.h{background:#f1f3f4;color:#5f6368}
.wc.dark .ev.e{background:#1c2c48;color:#a8c7fa}.wc.dark .ev.l{background:#16301d;color:#81c995}.wc.dark .ev.d{background:#3b1f1f;color:#f28b82}.wc.dark .ev.t{background:#3a2f12;color:#fdd663}.wc.dark .ev.h{background:#2a2f36;color:#bdc1c6}
.att{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.att .c{border-radius:7px;padding:6px;min-height:58px;font-size:calc(var(--fs)*.8);cursor:pointer;border:1px solid var(--line);background:var(--card)}
.att .c.okd{background:#e6f4ea}.att .c.bad{background:#fce8e6}.att .c.part{background:#fef7e0}.att .c.off{background:var(--soft);color:var(--muted)}.att .c.lv{background:#e8f0fe}.att .c.sel{outline:2px solid var(--accent)}
.wc.dark .att .c.okd{background:#16301d}.wc.dark .att .c.bad{background:#3b1f1f}.wc.dark .att .c.part{background:#3a2f12}.wc.dark .att .c.lv{background:#1c2c48}
.board{display:grid;grid-template-columns:repeat(5,minmax(170px,1fr));gap:8px;align-items:start}
.col{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:8px;min-height:240px}.col.drop{outline:2px dashed var(--accent)}
.col .ch{font-weight:700;margin-bottom:6px;display:flex;justify-content:space-between}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 9px;margin-bottom:6px;cursor:grab;font-size:calc(var(--fs)*.88)}.card:active{cursor:grabbing}.card .d{color:var(--muted);font-size:calc(var(--fs)*.8)}
.card.todo{border-left:3px solid #f9ab00}.card.act{border-left:3px solid var(--accent)}.card.act.high{border-left-color:var(--hi)}
.modal{position:absolute;inset:0;background:rgba(10,15,25,.45);display:flex;align-items:flex-start;justify-content:center;padding-top:9vh;z-index:30}
.dlg{background:var(--card);color:var(--fg);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.35);width:min(720px,92vw);max-height:78vh;overflow:auto;padding:16px 18px}
.pal input{width:100%;font-size:calc(var(--fs)*1.08);padding:10px 12px}.pal .it{padding:8px 10px;border-radius:7px;cursor:pointer;display:flex;justify-content:space-between;gap:10px}.pal .it.on,.pal .it:hover{background:var(--sel)}.pal .it .k{color:var(--muted);font-size:calc(var(--fs)*.8);white-space:nowrap}
.menu{position:absolute;top:50px;right:12px;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.25);min-width:300px;max-height:70vh;overflow:auto;z-index:25;padding:6px}
.menu .mi{padding:8px 10px;border-radius:7px;cursor:pointer}.menu .mi:hover{background:var(--sel)}.menu .mh{padding:6px 10px;color:var(--muted);font-size:calc(var(--fs)*.8)}
kbd{font:11px monospace;border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:0 4px;background:var(--card);color:var(--fg)}
.batch{position:sticky;top:0;z-index:3;background:#fff8e1;border:1px solid #f6d9a8;border-radius:9px;padding:6px 10px;margin-bottom:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.wc.dark .batch{background:#3a3220;border-color:#5a4718}
.term{border-bottom:1px dotted var(--muted);cursor:help}
</style><div class="wc nopane" id="wc"><header><div class="ttl">GW 통합 업무센터</div><span class="badge" title="이 화면이 그룹웨어 자료를 읽을 때는 아무것도 바꾸지 않습니다. 오른쪽 처리 창에 열리는 그룹웨어 원래 화면의 버튼은 실제로 처리됩니다.">조회는 안전 · 처리는 원래 화면에서</span><input id="gsearch" placeholder="통합검색 또는 명령 (Ctrl+K)" autocomplete="off"><span class="meta" id="meta"></span>
<button class="hb" data-act="menuNew" title="새 메일·새 기안·근태신청">+ 새로 만들기</button><button class="hb" data-act="focusStart" title="처리할 항목을 하나씩 차례로 처리 (F)">연속 처리</button><button class="hb" data-act="menuBell" id="bell" title="새로 들어온 항목">알림</button><button class="hb" data-act="fsDown" title="글자 작게">가−</button><button class="hb" data-act="fsUp" title="글자 크게">가+</button><button class="hb" data-act="theme" title="밝게/어둡게">테마</button><button class="hb" data-act="help" title="도움말 (?)">?</button><button class="hb" data-act="refresh" title="새로고침 (R)">새로고침</button><button class="hb" data-act="close" title="닫기 (Esc)">닫기</button></header>
<div class="band" id="band"></div><nav id="nav"></nav><main id="main"></main><div class="split" id="split" title="끌어서 처리 창 너비 조절"></div><aside id="pane"></aside><div id="overlay"></div></div>`;
  const $ = sel => root.querySelector(sel);
  const wcEl = $('#wc');
  const applyLook = () => {
    wcEl.dataset.fs = S.settings.fontSize;
    wcEl.classList.toggle('dark', S.settings.theme === 'dark');
    wcEl.style.setProperty('--paneW', `${Math.max(360, Math.min(window.innerWidth * 0.75, S.settings.paneWidth))}px`);
  };
  applyLook();

  // ---------- data ----------
  async function refresh({silent = false} = {}) {
    if (S.loading) return;
    S.loading = true; S.error = '';
    if (!silent) renderHead();
    try {
      const raw = await GW.collect({budget: S.settings.budget, mailCount: S.settings.mailCount, days: S.settings.days});
      ingest(raw);
    } catch (e) { S.error = e && e.message || String(e); }
    finally { S.loading = false; }
    if (silent && isUserBusy()) { S.pendingRefresh = true; renderHead(); renderBand(); renderNav(); return; }
    render();
  }
  function ingest(raw) {
    const prev = store.get('state', null);
    const usablePrev = prev && prev.at && Date.parse(prev.at) < Date.parse(raw.collectedAt) ? prev : null;
    const a = R.analyze(raw, usablePrev);
    applyUrgentWords(a);
    const fresh = a.actions.filter(x => x.isNew);
    for (const x of fresh) { S.newKeys.add(x.key); S.activity.push({at: Date.now(), key: x.key, title: x.title, kind: x.kind, area: x.area, priority: x.priority}); }
    if (!raw.sessionExpired) store.set('state', R.nextState(raw, usablePrev));
    // Clean local marks only for areas that were read successfully this time.
    const okAreas = new Set(a.status.filter(s => s.ok).map(s => s.name));
    const areaOf = k => k.startsWith('doc:') ? 'approval' : k.startsWith('mail:') ? 'mail' : k.startsWith('notice:') ? 'notice' : k.startsWith('att:') ? 'attendance' : k.startsWith('leave:') ? 'leave' : '';
    const live = new Set(a.actions.map(x => x.key));
    for (const k of Object.keys(S.snooze)) if (S.snooze[k] < Date.now() || (okAreas.has(areaOf(k)) && !live.has(k))) delete S.snooze[k];
    for (const k of Object.keys(S.hidden)) if (okAreas.has(areaOf(k)) && !live.has(k)) delete S.hidden[k];
    for (const k of Object.keys(S.plan)) if (k.startsWith('todo:') ? !S.todos.some(t => `todo:${t.id}` === k) : (okAreas.has(areaOf(k)) && !live.has(k))) delete S.plan[k];
    const d = today();
    const h = S.history.find(x => x.date === d);
    const entry = {date: d, total: a.actions.length, high: a.summary.high, approval: a.summary.approvalAction, mail: a.summary.mailUnread};
    if (h) Object.assign(h, entry); else S.history.push(entry);
    S.raw = raw; S.a = a; S.lastRefresh = new Date(); S.pendingRefresh = false;
    if (raw.sessionExpired) S.error = 'SESSION';
    saveLocal();
    notifyNew(fresh.filter(x => x.priority === 'high'));
  }
  function applyUrgentWords(a) {
    const words = (S.settings.urgentWords || []).filter(Boolean);
    if (!words.length) return;
    const re = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
    for (const x of a.actions) if (re.test(x.title)) { x.score += 30; x.why = [...(x.why || []), '내 긴급 키워드']; if (x.priority !== 'high') x.priority = x.score >= 70 ? 'high' : 'medium'; }
    a.actions.sort((p, q) => q.score - p.score);
  }
  function notifyNew(items) {
    if (!items.length) return;
    toast(`새 긴급 항목 ${items.length}건: ${items[0].title.slice(0, 40)}`);
    if (S.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('GW 업무센터 · 새 긴급 항목 ' + items.length + '건', {body: items.slice(0, 3).map(x => `[${x.kind}] ${x.title}`).join('\n'), tag: 'bwyfgw-wc'}); } catch {}
    }
  }
  async function loadRouting(force = false) {
    const fresh = S.routing && S.routing.fetchedAt && Date.now() - Date.parse(S.routing.fetchedAt) < 12 * 3600_000;
    if (fresh && !force) return S.routing;
    try { S.routing = await GW.routingHistory({days: 180, size: 500}); store.set('routing', S.routing); } catch (e) { toast('배부·접수 이력을 읽지 못했습니다: ' + e.message); }
    return S.routing;
  }
  async function loadForms(force = false) {
    if (S.forms && !force && Date.now() - (S.forms.at || 0) < 7 * 86400_000) return S.forms.list;
    try { const list = await GW.frequentForms(); S.forms = {at: Date.now(), list}; store.set('forms', S.forms); } catch (e) { toast('양식 목록을 읽지 못했습니다: ' + e.message); }
    return S.forms ? S.forms.list : [];
  }
  const previewCache = new Map();
  async function loadPreview(doc) {
    const k = doc.docNo || doc.title;
    if (previewCache.has(k)) return previewCache.get(k);
    const p = GW.docPreview({docNo: doc.docNo, title: doc.title}).catch(() => ({found: false}));
    previewCache.set(k, p);
    return p;
  }
  const isUserBusy = () => {
    const ae = root.activeElement;
    if (ae && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName) && ae.id !== 'gsearch') return true;
    return !!S.focus || S.paletteOpen;
  };

  // ---------- timers & keys ----------
  let timer = null;
  function schedule() {
    clearInterval(timer);
    const m = Number(S.settings.refreshMin || 0);
    if (m > 0) timer = setInterval(() => refresh({silent: true}), m * 60_000);
  }
  const onDocKey = e => {
    if (e.altKey && e.code === 'KeyG') { e.preventDefault(); e.stopPropagation(); S.open ? close() : open(); return; }
    if (S.open) handleKey(e);
  };
  document.addEventListener('keydown', onDocKey, true);
  const onResize = () => applyLook();
  window.addEventListener('resize', onResize);
  function handleKey(e) {
    const t = e.composedPath()[0] || {};
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName || '') || t.isContentEditable;
    e.stopPropagation(); // keep groupware shortcuts from firing behind the work center
    if (e.isComposing || e.keyCode === 229) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); openPalette(typing && t.id === 'gsearch' ? t.value : ''); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !typing) { e.preventDefault(); undo(); return; }
    if (e.key === 'Escape') {
      if (S.paletteOpen || S.helpOpen || S.menuOpen) { closeOverlay(); return; }
      if (typing) { t.blur(); return; }
      if (S.focus) { stopFocus(); return; }
      if (S.pane.url) { S.pane.url = ''; renderPane(); return; }
      if (S.sel) { S.sel = null; render(); return; }
      close(); return;
    }
    if (S.paletteOpen) { paletteKey(e); return; }
    if (typing) {
      if (e.key !== 'Enter') return;
      if (t.id === 'gsearch') { const v = t.value.trim(); if (v) { S.search.kw = v; runSearch(); } }
      else if (t.id === 'sq') { S.search.kw = t.value.trim(); runSearch(); }
      else if (t.id === 'mailq') runMailSearch(t.value.trim());
      else if (t.id === 'tdTitle') addTodoFromInput();
      else if (t.id === 'bcode' || t.id === 'bfilter') { S.budget.project = $('#bcode').value.trim(); S.budget.filter = $('#bfilter').value.trim(); loadBudget(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code;
    if (c === 'Slash' && e.shiftKey) { toggleHelp(); return; }
    if (c === 'Slash') { e.preventDefault(); $('#gsearch').focus(); return; }
    if (c === 'KeyR') { refresh(); return; }
    if (c === 'KeyF') { startFocus(); return; }
    if (/^Digit[1-9]$/.test(c)) { const v = VIEWS[Number(c.slice(5)) - 1]; if (v) go(v.id); return; }
    if (S.focus) { if (c === 'Enter' || c === 'KeyN') focusNext(true); else if (c === 'KeyB') focusPrev(); return; }
    if (S.view === 'today' && ['KeyJ', 'KeyK', 'ArrowDown', 'ArrowUp'].includes(c)) { e.preventDefault(); moveSel(c === 'KeyJ' || c === 'ArrowDown' ? 1 : -1); return; }
    const x = selectedAction();
    if (!x) return;
    if (c === 'Enter') openItem(x);
    else if (c === 'KeyO') openWindow(x.url, x);
    else if (c === 'KeyX') hide([x.key]);
    else if (c === 'KeyS') snooze([x.key]);
    else if (c === 'KeyT') addTodo(x.title, x.deadline && x.deadline.date || '', x.kind, x.url, x.key);
  }
  root.addEventListener('keyup', e => e.stopPropagation());

  // ---------- views ----------
  const VIEWS = [
    {id: 'today', label: '오늘 할 일'}, {id: 'approval', label: '결재·문서유통'}, {id: 'mail', label: '메일'}, {id: 'search', label: '통합검색'},
    {id: 'board', label: '할 일 보드'}, {id: 'calendar', label: '일정 달력'}, {id: 'budget', label: '예산 집행'}, {id: 'attendance', label: '근태·연차'},
    {id: 'report', label: '보고서'}, {id: 'settings', label: '설정'},
  ];
  const go = v => { S.view = v; S.multi.clear(); render(); };
  // Hidden items come back after 24h if the groupware still lists them (숨겼지만 아직 남음).
  const resurfaced = k => isHidden(k) && Date.now() - S.hidden[k] > 86400_000;
  const visibleActions = () => S.a ? S.a.actions.filter(x => S.filter.showHidden ? (isHidden(x.key) || isSnoozed(x.key)) : ((!isHidden(x.key) || resurfaced(x.key)) && !isSnoozed(x.key))) : [];
  const queue = () => {
    const f = S.filter;
    return visibleActions().filter(x => (f.area === 'all' || x.area === f.area) && (f.level === 'all' || x.priority === f.level) && (!f.onlyNew || S.newKeys.has(x.key))
      && (!f.q || (x.title + x.detail + x.kind).toLowerCase().includes(f.q.toLowerCase())));
  };
  const selectedAction = () => S.sel && S.sel.type === 'action' ? S.a && S.a.actions.find(x => x.key === S.sel.key) : null;
  function moveSel(step) {
    const q = queue();
    if (!q.length) return;
    let i = q.findIndex(x => S.sel && S.sel.key === x.key);
    i = Math.max(0, Math.min(q.length - 1, i + step));
    selectAction(q[i].key);
    const row = root.querySelector(`.row[data-k="${CSS.escape(q[i].key)}"]`);
    if (row) row.scrollIntoView({block: 'nearest'});
  }

  function render() {
    if (!S.open) return;
    renderHead(); renderBand(); renderNav(); renderMain(); renderPane();
  }
  function renderHead() {
    const m = $('#meta');
    if (!m) return;
    const age = S.lastRefresh ? Math.floor((Date.now() - S.lastRefresh.getTime()) / 60000) : null;
    m.className = 'meta' + (age !== null && age >= 10 ? ' stale' : '');
    m.innerHTML = S.loading ? '<span class="spin"></span> 읽는 중…' : S.lastRefresh ? `자료 ${hhmm(S.lastRefresh)}${age ? ` (${age}분 전)` : ''} · ${S.raw ? S.raw.durationMs : '-'}ms${S.settings.refreshMin ? ` · 자동 ${S.settings.refreshMin}분` : ''}` : '';
    const unseen = S.activity.filter(x => x.at > S.seenActivity).length;
    $('#bell').innerHTML = `알림${unseen ? `<span class="dot">${unseen}</span>` : ''}`;
    const high = S.a ? visibleActions().filter(x => x.priority === 'high').length : 0;
    fab.textContent = `업무센터${S.a ? ` · 긴급 ${high}` : ''}`;
  }
  function renderBand() {
    const b = $('#band');
    const parts = [];
    if (S.error === 'SESSION') parts.push(`<div class="b err"><b>그룹웨어 로그인이 끊겼습니다.</b> 지금 보이는 숫자는 믿을 수 없습니다. <button class="btn sm" data-act="relogin">그룹웨어 다시 로그인</button></div>`);
    else if (S.error) parts.push(`<div class="b err">자료를 읽지 못했습니다: ${esc(S.error)} <button class="btn sm" data-act="refresh">다시 시도</button></div>`);
    if (S.a && S.a.failed.length) parts.push(`<div class="b warn">일부 자료를 읽지 못했습니다: ${S.a.failed.map(f => esc(MODNAME[f.name] || f.name)).join(', ')} → 해당 카드는 "확인 불가"로 표시합니다. <button class="btn sm" data-act="refresh">다시 시도</button></div>`);
    if (S.pendingRefresh) parts.push(`<div class="b info">새 자료를 받아 두었습니다. 작업 중이라 화면은 그대로 두었습니다. <button class="btn sm primary" data-act="applyRefresh">지금 반영</button></div>`);
    const age = S.lastRefresh ? (Date.now() - S.lastRefresh.getTime()) / 60000 : 0;
    if (age >= 15 && !S.loading) parts.push(`<div class="b warn">${Math.floor(age)}분 전 자료입니다. <button class="btn sm" data-act="refresh">새로고침</button></div>`);
    b.innerHTML = parts.join('');
  }
  const MODNAME = {mail: '메일', approval: '전자결재', notice: '공지', schedule: '일정', attendance: '근태', leave: '연차', budget: '예산', alerts: '알림'};
  function renderNav() {
    const s = S.a && S.a.summary, u = S.a ? S.a.unknown : {};
    const all = visibleActions();
    const counts = {
      today: all.length, approval: u.approval ? '?' : s ? s.approvalAction + (s.sendWaiting || 0) : '', mail: u.mail ? '?' : s ? s.mailUnread : '',
      attendance: S.a ? S.a.anomalies.length : '', board: S.todos.filter(t => t.status !== 'done').length, calendar: S.a ? S.a.deadlines.filter(x => x.dday >= 0 && x.dday <= 7).length : '',
    };
    const hot = {today: all.some(x => x.priority === 'high'), approval: s && s.approvalAction > 0, attendance: S.a && S.a.anomalies.length > 0, calendar: S.a && S.a.deadlines.some(x => x.dday >= 0 && x.dday <= 2)};
    const tips = S.settings.beginner ? '<div class="tip">항목을 누르면 오른쪽에 내용과 처리 화면이 열립니다.<br>"연속 처리"로 하나씩 차례로 처리하세요.<br><b>?</b> 도움말</div>'
      : `<div class="tip"><kbd>J</kbd><kbd>K</kbd> 이동 <kbd>Enter</kbd> 열기<br><kbd>X</kbd> 숨기기 <kbd>S</kbd> 미루기 <kbd>T</kbd> 할 일<br><kbd>F</kbd> 연속 처리 <kbd>/</kbd> 검색<br><kbd>Ctrl</kbd>+<kbd>K</kbd> 명령 <kbd>Ctrl</kbd>+<kbd>Z</kbd> 되돌리기<br><kbd>Alt</kbd>+<kbd>G</kbd> 열기·닫기</div>`;
    $('#nav').innerHTML = VIEWS.map((v, i) => `${i === 8 ? '<div class="sep"></div>' : ''}<a data-act="view" data-v="${v.id}" class="${S.view === v.id ? 'on' : ''}" title="${i + 1}"><span>${esc(v.label)}</span>${counts[v.id] !== undefined && counts[v.id] !== '' ? `<span class="n ${hot[v.id] ? 'hot' : ''}">${counts[v.id]}</span>` : ''}</a>`).join('') + '<div class="sep"></div>' + tips;
  }
  function renderMain() {
    const el = $('#main');
    if (!S.a) { el.innerHTML = S.error && S.error !== 'SESSION' ? `<p class="err">${esc(S.error)}</p>` : '<p><span class="spin"></span> 그룹웨어 자료를 읽는 중입니다…</p>'; return; }
    const scroll = el.scrollTop;
    const fn = {today: vToday, approval: vApproval, mail: vMail, search: vSearch, board: vBoard, calendar: vCalendar, budget: vBudget, attendance: vAttendance, report: vReport, settings: vSettings}[S.view] || vToday;
    el.innerHTML = fn();
    el.scrollTop = scroll;
    if (S.view === 'report') { const f = $('#briefFrame'); if (f) f.srcdoc = R.renderHtml(S.a); }
    if (S.view === 'budget' && !S.budget.table && !S.budget.busy) loadBudget();
    if (S.view === 'attendance' && !S.att.rows && !S.att.busy) loadAttendance();
    if (S.view === 'approval' && ['distWaiting', 'deptWaiting'].includes(S.apTab) && !S.routing) loadRouting().then(() => { if (S.view === 'approval') renderMain(); });
  }

  // ----- 오늘 할 일 (dashboard + queue) -----
  function vToday() {
    const s = S.a.summary, u = S.a.unknown;
    const vis = visibleActions();
    const tile = (label, v, sub, act, data, hot, unk) => `<div class="tile ${hot ? 'hot' : ''} ${unk ? 'unk' : ''}" data-act="${act}" data-v="${esc(data || '')}" title="누르면 아래 목록을 이 기준으로 거릅니다">${'<div class="l">' + esc(label) + '</div><div class="v">' + (unk ? '확인 불가' : esc(v)) + '</div><div class="s">' + esc(unk ? '자료를 읽지 못함' : sub) + '</div>'}</div>`;
    const dl7 = S.a.deadlines.filter(x => x.dday >= 0 && x.dday <= 7);
    const high = vis.filter(x => x.priority === 'high').length;
    const areas = [['all', '전체'], ['결재', '결재'], ['메일', '메일'], ['기한', '기한'], ['공지', '공지'], ['근태', '근태']];
    const levels = [['all', '모든 단계'], ['high', '긴급'], ['medium', '보통'], ['low', '참고']];
    const cnt = a => a === 'all' ? vis.length : vis.filter(x => x.area === a).length;
    const lcnt = l => l === 'all' ? vis.length : vis.filter(x => x.priority === l).length;
    const hiddenN = S.a.actions.filter(x => isHidden(x.key) || isSnoozed(x.key)).length;
    const newN = vis.filter(x => S.newKeys.has(x.key)).length;
    return `<div class="tiles">
${tile('긴급', high + '건', '기한 임박·오래 기다린 순', 'tileLevel', 'high', high > 0)}
${tile('결재·접수·배부', s.approvalAction + '건', `결재 ${s.pending ?? '-'} · 접수 ${s.deptWaiting ?? '-'} · 배부 ${s.distWaiting ?? '-'}`, 'tileArea', '결재', s.approvalAction > 0, u.approval)}
${tile('메일', vis.filter(x => x.area === '메일').length + '건', `안 읽음 ${s.mailUnread} · 기한·답장 확인 포함`, 'tileArea', '메일', false, u.mail)}
${tile('7일 내 기한', dl7.length + '건', dl7[0] ? `${dl7[0].date.slice(5)} ${dl7[0].title.slice(0, 16)}` : '제목·미리보기 기준', 'goCalendar', '', dl7.some(x => x.dday <= 1))}
${tile('근태 확인', S.a.anomalies.length + '건', `잔여 연차 ${s.leaveRemaining ?? '-'}일`, 'tileArea', '근태', false, u.attendance)}
${tile('발송·반려', (s.sendWaiting ?? 0) + s.rejectedSubmitted + '건', `발송 대기 ${s.sendWaiting ?? '-'} · 반려 ${s.rejectedSubmitted}`, 'goApproval', 'sendWaiting', s.rejectedSubmitted > 0, u.approval)}
</div>
<div class="charts">${chartFlow()}${chartDeadlines()}${chartBudget()}${chartAttendance()}${chartTrend()}</div>
<h2>처리할 일 <span class="muted">${vis.length}건 · 점수 높은 순(기한·대기일·긴급 표현)</span><button class="btn primary sm" data-act="focusStart">▶ 연속 처리 시작</button></h2>
<div class="bar">${areas.map(([a, n]) => `<span class="chip ${S.filter.area === a ? 'on' : ''}" data-act="area" data-v="${a}">${n} ${cnt(a)}</span>`).join('')}</div>
<div class="bar">${levels.map(([l, n]) => `<span class="chip ${S.filter.level === l ? 'on' : ''}" data-act="level" data-v="${l}">${n} ${lcnt(l)}</span>`).join('')}<span class="chip ${S.filter.onlyNew ? 'on' : ''}" data-act="onlyNew">새 항목 ${newN}</span><span class="chip ${S.filter.showHidden ? 'on' : ''}" data-act="showHidden" title="이 화면에서 숨기거나 미룬 항목">숨긴·미룬 ${hiddenN}</span>
<input class="f" id="qfilter" placeholder="목록 안에서 찾기" value="${esc(S.filter.q)}" style="flex:1;min-width:120px"></div>
<div id="batch">${batchBar()}</div>
<div class="list" id="qlist">${queueRows()}</div>
<p class="muted">숨기기·미루기는 이 화면에서만 감추는 개인 표시입니다. 그룹웨어에서 처리해야 목록에서 완전히 사라집니다. 숨긴 항목이 그룹웨어에 계속 남아 있으면 하루 뒤 다시 보여 드립니다.</p>`;
  }
  const queueRows = () => {
    const q = queue();
    if (!q.length) return `<div class="row"><div></div><div></div><div class="muted">${S.a.failed.length ? '일부 자료를 읽지 못해 목록이 비어 있을 수 있습니다.' : S.filter.showHidden ? '숨기거나 미룬 항목이 없습니다.' : '처리할 항목이 없습니다.'}</div><div></div></div>`;
    return q.map(x => actionRow(x)).join('');
  };
  function actionRow(x) {
    const dl = x.deadline && x.deadline.date ? `<span class="pill ${x.deadline.dday <= 1 ? 'solid' : x.deadline.dday <= 3 ? 'high' : 'medium'}">${esc(x.deadline.date.slice(5))}${x.deadline.time ? ' ' + esc(x.deadline.time) : ''} ${ddayText(x.deadline.dday)}</span>` : '';
    const stale = isHidden(x.key) && Date.now() - S.hidden[x.key] > 86400_000;
    const plan = S.plan[x.key] ? `<span class="pill low">${esc(BUCKET_NAME[S.plan[x.key]] || '')}</span>` : '';
    return `<div class="row ${S.sel && S.sel.key === x.key ? 'sel' : ''} ${isHidden(x.key) || isSnoozed(x.key) ? 'hid' : ''} ${S.multi.has(x.key) ? 'multi' : ''}" data-act="selAction" data-k="${esc(x.key)}">
<div><input type="checkbox" data-act="multi" data-k="${esc(x.key)}" ${S.multi.has(x.key) ? 'checked' : ''} title="여러 개 선택(Shift로 범위)"></div>
<div><span class="pill ${x.priority}" title="${esc(['점수 ' + x.score, ...(x.why || [])].join(' · '))}">${PRI[x.priority]}</span>${S.newKeys.has(x.key) ? '<br><span class="pill new">새</span>' : ''}</div>
<div><div class="t">${esc(x.title)}</div><div class="d">${dl}${plan}${stale ? '<span class="pill high">숨겼지만 아직 남음</span>' : ''}${esc(x.area)} · ${esc(x.kind)} · ${esc(x.detail)}</div></div>
<div class="w">${esc(String(x.when).slice(5, 16))}${isSnoozed(x.key) ? '<br>미룸' : ''}${isHidden(x.key) ? '<br>숨김' : ''}</div>
<div class="qa"><button class="btn sm" data-act="quickOpen" data-k="${esc(x.key)}" title="처리 창에 열기">열기</button><button class="btn sm" data-act="quickHide" data-k="${esc(x.key)}" title="이 화면에서 숨기기 (X)">숨기기</button><button class="btn sm" data-act="quickSnooze" data-k="${esc(x.key)}" title="내일 오전 8시까지 (S)">내일</button><button class="btn sm" data-act="quickTodo" data-k="${esc(x.key)}" title="할 일 보드에 추가 (T)">할 일</button></div></div>`;
  }
  const batchBar = () => S.multi.size ? `<div class="batch"><b>${S.multi.size}건 선택</b><button class="btn sm" data-act="batchFocus">선택 항목 연속 처리</button><button class="btn sm" data-act="batchHide">숨기기</button><button class="btn sm" data-act="batchSnooze">내일로 미루기</button><button class="btn sm" data-act="batchTodo">할 일로</button><button class="btn sm" data-act="batchCsv">CSV</button><button class="btn sm" data-act="batchClear">선택 해제</button></div>` : '';
  const refreshQueue = () => { const l = $('#qlist'); if (l) l.innerHTML = queueRows(); const b = $('#batch'); if (b) b.innerHTML = batchBar(); renderNav(); renderHead(); };

  // ----- charts (inline SVG, clickable) -----
  function chartFlow() {
    const lists = S.a.approval.lists, counts = Object.fromEntries(S.a.approval.counts.map(c => [c.name, c]));
    const rows = [['distWaiting', '배부 대기', lists.distWaiting?.total ?? 0], ['deptWaiting', '부서 접수 대기', lists.deptWaiting?.total ?? 0], ['pending', '결재 대기', lists.pending?.total ?? 0], ['sendWaiting', '발송 대기', lists.sendWaiting?.total ?? 0], ['viewing', '미열람 열람문서', counts['열람문서']?.count ?? 0], ['progress', '부서 진행', counts['부서진행문서']?.count ?? 0]];
    const max = Math.max(1, ...rows.map(r => r[2]));
    const svg = rows.map(([k, n, v], i) => `<g class="hit" data-act="goApproval" data-v="${k === 'progress' ? 'deptWaiting' : k}"><text x="0" y="${i * 22 + 14}" font-size="11" fill="currentColor">${esc(n)}</text><rect x="96" y="${i * 22 + 4}" width="${Math.max(2, v / max * 150)}" height="13" rx="3" fill="${k === 'progress' ? '#9aa4b2' : v ? '#1a73e8' : '#c9d1de'}"><title>${esc(n)} ${v}건</title></rect><text x="${100 + Math.max(2, v / max * 150)}" y="${i * 22 + 14}" font-size="11" fill="currentColor">${v}</text></g>`).join('');
    return `<div class="chart"><div class="ct"><span>결재·문서유통 흐름</span><span class="muted">막대를 누르면 목록</span></div><svg viewBox="0 0 280 ${rows.length * 22}" width="100%" height="${rows.length * 22}">${svg}</svg></div>`;
  }
  function chartDeadlines() {
    const items = S.a.deadlines.filter(x => x.dday >= -1 && x.dday <= 14);
    const W = 280, x0 = 10, w = 260;
    const pos = d => x0 + (Math.max(-1, Math.min(14, d)) + 1) / 15 * w;
    const off = new Set((S.raw.data.leave?.upcoming || []).map(u => R.dday(ymd8(u.start))));
    const ticks = Array.from({length: 16}, (_, i) => i - 1).map(d => `<line x1="${pos(d)}" x2="${pos(d)}" y1="34" y2="40" stroke="#9aa4b2"/>${d % 7 === 0 ? `<text x="${pos(d)}" y="52" font-size="10" text-anchor="middle" fill="currentColor">${d === 0 ? '오늘' : `+${d}`}</text>` : ''}${off.has(d) ? `<rect x="${pos(d) - 8}" y="8" width="16" height="30" fill="#e6f4ea" opacity=".9"><title>휴가</title></rect>` : ''}`).join('');
    const dots = items.map((x, i) => `<circle class="hit" data-act="selDeadline" data-k="${esc(x.key || '')}" data-title="${esc(x.title)}" cx="${pos(x.dday)}" cy="${30 - (i % 3) * 8}" r="5" fill="${x.dday <= 1 ? '#c5221f' : x.dday <= 3 ? '#e37400' : '#1a73e8'}"><title>${esc(`${x.date}${x.time ? ' ' + x.time : ''} ${ddayText(x.dday)} · ${x.title}`)}</title></circle>`).join('');
    return `<div class="chart"><div class="ct"><span>2주 기한</span><span class="muted">${items.length}건 · 점을 누르면 항목</span></div><svg viewBox="0 0 ${W} 58" width="100%" height="64"><line x1="${x0}" x2="${x0 + w}" y1="37" y2="37" stroke="#9aa4b2"/>${ticks}${dots}</svg></div>`;
  }
  function chartBudget() {
    const p = S.a.budget.projects.find(x => !x.error && x.rows.length);
    if (!p) return '';
    const head = p.rows[0], el = S.a.budget.elapsedPct;
    const leaves = p.rows.filter(r => r.level === '세').slice(0, 5);
    const bar = (r, y, label) => `<g class="hit" data-act="goBudgetCode" data-v="${esc(r.code)}"><text x="0" y="${y + 10}" font-size="10.5" fill="currentColor">${esc(label.slice(0, 13))}</text><rect x="100" y="${y + 1}" width="150" height="11" rx="3" fill="#e7ebf2"/><rect x="100" y="${y + 1}" width="${Math.min(150, r.rate * 1.5)}" height="11" rx="3" fill="${r.rate < el - 30 ? '#e37400' : '#1a73e8'}"><title>${esc(r.name)} 집행 ${pct(r.rate)} (예산 ${won(r.budget)}원)</title></rect><line x1="${100 + el * 1.5}" x2="${100 + el * 1.5}" y1="${y - 1}" y2="${y + 14}" stroke="#1d2330" stroke-width="1.5"><title>연간 경과율 ${el}%</title></line><text x="254" y="${y + 10}" font-size="10" fill="currentColor">${Math.round(r.rate)}%</text></g>`;
    const rows = [bar(head, 0, head.name), ...leaves.map((r, i) => bar(r, (i + 1) * 18, r.name.replace(/^○\s*/, '').replace(/젠더유스 거버넌스\s*/, '')))].join('');
    return `<div class="chart"><div class="ct"><span>예산 ${esc(p.project)} ${esc(p.filter)}</span><span class="muted">세로선 = 연간 경과 ${el}%</span></div><svg viewBox="0 0 280 ${(leaves.length + 1) * 18}" width="100%" height="${(leaves.length + 1) * 18}">${rows}</svg></div>`;
  }
  function chartAttendance() {
    const days = S.raw.data.attendance?.days || [];
    if (!days.length) return '';
    const bad = new Set(S.a.anomalies.map(x => x.date));
    const cells = days.map((r, i) => { const cls = bad.has(r.date) ? '#f28b82' : r.holiday || /휴일/.test(r.result) ? '#dadce0' : /정상/.test(r.result) ? '#81c995' : '#fdd663'; return `<rect class="hit" data-act="goAttendanceDay" data-v="${r.date}" x="${(i % 7) * 38}" y="${Math.floor(i / 7) * 30}" width="34" height="26" rx="5" fill="${cls}"><title>${esc(`${ymd8(r.date)} ${r.result} ${r.item} ${r.status}`)}</title></rect><text x="${(i % 7) * 38 + 17}" y="${Math.floor(i / 7) * 30 + 17}" font-size="10.5" text-anchor="middle" fill="#1d2330" pointer-events="none">${Number(r.date.slice(6))}</text>`; }).join('');
    const h = Math.ceil(days.length / 7) * 30;
    return `<div class="chart"><div class="ct"><span>이번 달 근태</span><span class="muted">빨강 = 확인 필요</span></div><svg viewBox="0 0 266 ${h}" width="100%" height="${h}">${cells}</svg></div>`;
  }
  function chartTrend() {
    const h = S.history.slice(-14);
    if (h.length < 2) return `<div class="chart"><div class="ct"><span>처리할 일 추이</span></div><p class="muted">며칠 사용하면 하루 단위 추이가 그려집니다.</p></div>`;
    const max = Math.max(1, ...h.map(x => x.total));
    const pts = (k) => h.map((x, i) => `${10 + i * (250 / (h.length - 1))},${70 - x[k] / max * 60}`).join(' ');
    return `<div class="chart"><div class="ct"><span>처리할 일 추이</span><span class="muted">파랑 전체 · 빨강 긴급</span></div><svg viewBox="0 0 270 78" width="100%" height="78"><polyline points="${pts('total')}" fill="none" stroke="#1a73e8" stroke-width="2"/><polyline points="${pts('high')}" fill="none" stroke="#c5221f" stroke-width="2"/>${h.map((x, i) => `<circle cx="${10 + i * (250 / (h.length - 1))}" cy="${70 - x.total / max * 60}" r="3" fill="#1a73e8"><title>${esc(x.date)} 전체 ${x.total} · 긴급 ${x.high}</title></circle>`).join('')}</svg></div>`;
  }

  // ----- 결재·문서유통 -----
  const recText = (rec, kind) => {
    if (!S.routing) return '<span class="spin"></span>';
    const grp = rec.group;
    if (grp && grp.targets.length >= 2) return `<b>${grp.targets.length}곳 동시 ${kind === 'distWaiting' ? '배부' : '접수'}</b><div class="muted">지난 비슷한 문서: ${esc(grp.targets.slice(0, 4).join(', '))}${grp.targets.length > 4 ? ' 외' : ''}</div>`;
    if (!rec.length) return '<span class="muted">비슷한 이력 없음</span>';
    return rec.slice(0, 2).map(r => `${esc(r.name)} <span class="pill ${r.level === '높음' ? 'ok' : 'low'}">${r.level}</span><span class="muted">비슷한 ${r.of}건 중 ${r.count}건</span>`).join('<br>');
  };
  function vApproval() {
    const lists = S.a.approval.lists, counts = S.a.approval.counts;
    const tabs = [['distWaiting', '배부 대기'], ['deptWaiting', '부서 접수 대기'], ['pending', '결재 대기'], ['sendWaiting', '발송 대기'], ['viewing', '열람문서'], ['submitted', '내 상신문서']];
    const l = lists[S.apTab];
    const more = S.apMore[S.apTab] || [];
    const docs = l && !l.error ? [...l.docs, ...more] : [];
    const withRec = ['distWaiting', 'deptWaiting'].includes(S.apTab);
    const hist = S.routing ? (S.apTab === 'distWaiting' ? S.routing.dist : S.routing.dept) : [];
    const target = S.apTab === 'distWaiting' ? 'toDept' : 'toEmp';
    const rows = docs.map(d => {
      const rec = withRec && hist.length ? R.recommendRouting(d, hist, {target, limit: 3}) : Object.assign([], {group: null});
      return `<tr class="click ${S.sel && S.sel.type === 'doc' && S.sel.docId === d.docId ? 'sel' : ''}" data-act="selDoc" data-kind="${S.apTab}" data-id="${esc(d.docId)}"><td>${d.unread ? '<span class="pill high">미열람</span>' : ''}${esc(d.title)}${d.attachments ? ` <span class="muted">첨부${d.attachments}</span>` : ''}<div class="muted">${esc(d.docNo)}${d.form ? ' · ' + esc(d.form) : ''}</div></td><td>${esc(d.sender || d.drafter || d.drafterDept)}</td><td class="nowrap">${esc(d.status)}</td>${withRec ? `<td>${recText(rec, S.apTab)}</td>` : ''}<td class="nowrap">${esc(String(d.date).slice(0, 16))}</td></tr>`;
    }).join('');
    const total = l ? (l.total ?? l.docs.length) : 0;
    return `<h2>전자결재·문서유통 ${l ? `<a class="btn sm" href="${esc(l.url)}" target="_blank">그룹웨어 목록</a>` : ''}${docs.length && ['distWaiting', 'deptWaiting', 'pending', 'sendWaiting'].includes(S.apTab) ? `<button class="btn sm primary" data-act="focusList">▶ 이 목록 연속 처리</button>` : ''}${withRec ? '<button class="btn sm" data-act="reloadRouting">추천 이력 다시 읽기</button>' : ''}</h2>
<div class="bar">${tabs.map(([k, n]) => { const c = lists[k]; const cnt = c ? (c.error ? '?' : c.total ?? c.docs.length) : '-'; return `<span class="chip ${S.apTab === k ? 'on' : ''}" data-act="apTab" data-v="${k}">${n} ${cnt}</span>`; }).join('')}</div>
${l && l.error ? `<p class="err">${esc(l.message)}</p>` : `<table><tr><th>제목</th><th>보낸 곳/기안</th><th>상태</th>${withRec ? `<th>${S.apTab === 'distWaiting' ? '배부 추천' : '접수 추천'} <span class="term" title="최근 180일에 처리된 비슷한 문서(제목 주제가 겹치는 문서)가 어디로 갔는지 센 값입니다. '높음'은 비슷한 문서 3건 이상 중 절반 이상이 같은 곳으로 간 경우입니다.">?</span></th>` : ''}<th>일시</th></tr>${rows || `<tr><td colspan="5" class="muted">없음</td></tr>`}</table>`}
${docs.length < total ? `<p><button class="btn" data-act="apMore">더 보기 (${docs.length}/${total})</button></p>` : ''}
<h3>메뉴별 건수</h3><table><tr><th>메뉴</th><th class="num">건수</th><th class="num">전체</th></tr>${counts.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.count}</td><td class="num muted">${c.total ?? ''}</td></tr>`).join('')}</table>`;
  }

  // ----- 메일 -----
  function vMail() {
    const m = S.a.mail;
    const all = [...(S.raw.data.mail?.inbox.records || []), ...(S.raw.data.mail?.otherUnseen || [])];
    const needReply = new Set(m.recentAction.map(x => x.box + x.uid));
    const withDl = new Set(S.a.actions.filter(x => x.type === 'mail' && x.deadline).map(x => x.ref.box + x.ref.uid));
    const f = S.mailFilter;
    const rows = all.filter(x => f === 'all' || (f === 'unread' && !x.seen) || (f === 'reply' && needReply.has(x.box + x.uid)) || (f === 'deadline' && withDl.has(x.box + x.uid)) || (f === 'attach' && x.attach) || (f === 'other' && x.box !== 'INBOX'));
    const sr = S.mailSearch.res;
    const rowHtml = x => `<div class="row ${S.sel && S.sel.type === 'mail' && S.sel.uid === x.uid ? 'sel' : ''}" data-act="selMail" data-box="${esc(x.box)}" data-uid="${esc(x.uid)}"><div></div><div>${x.seen ? '' : '<span class="pill high">안읽음</span>'}${withDl.has(x.box + x.uid) ? '<span class="pill solid">기한</span>' : ''}${needReply.has(x.box + x.uid) ? '<span class="pill medium" title="받은 지 3일 이내, 요청 표현이 있고 답장·전달 기록이 없음">답장?</span>' : ''}${x.box !== 'INBOX' ? `<span class="pill low">${esc(x.box)}</span>` : ''}</div><div><div class="t">${esc(x.subject || '(제목 없음)')}${x.attach ? ' <span class="muted">· 첨부</span>' : ''}</div><div class="d">${esc(x.from)} · ${esc(x.preview.slice(0, 110))}</div></div><div class="w">${esc(x.shortDate || x.date)}</div></div>`;
    let listHtml;
    if (S.mailGroup) {
      const g = new Map();
      for (const x of rows) { const k = x.from || '(알 수 없음)'; (g.get(k) || g.set(k, []).get(k)).push(x); }
      listHtml = [...g.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, xs]) => `<h3>${esc(k)} <span class="muted">${xs.length}통</span></h3><div class="list">${xs.map(rowHtml).join('')}</div>`).join('');
    } else listHtml = `<div class="list">${rows.map(rowHtml).join('') || '<div class="row"><div></div><div></div><div class="muted">없음</div><div></div></div>'}</div>`;
    return `<h2>메일 <a class="btn sm" href="${esc(m.url)}" target="_blank">받은메일함</a><button class="btn sm primary" data-act="openUrl" data-url="${esc(GW.links.compose('plain'))}" data-title="새 메일 쓰기">새 메일 쓰기</button></h2>
<div class="bar">${[['all', '전체'], ['unread', '안 읽음'], ['deadline', '기한 있음'], ['reply', '답장 확인'], ['attach', '첨부'], ['other', '내 메일함']].map(([k, n]) => `<span class="chip ${f === k ? 'on' : ''}" data-act="mailFilter" data-v="${k}">${n}</span>`).join('')}<span class="chip ${S.mailGroup ? 'on' : ''}" data-act="mailGroup">보낸 사람별</span>
<input class="f" id="mailq" placeholder="메일 본문까지 검색 (Enter)" value="${esc(S.mailSearch.kw)}" style="flex:1;min-width:160px"></div>
${sr ? `<h3>"${esc(sr.keyword)}" 메일 검색 ${sr.groups.mail?.total ?? 0}건 <button class="btn sm" data-act="clearMailSearch">지우기</button></h3><div class="list">${(sr.groups.mail?.items || []).map(x => `<div class="row" data-act="selMailSearch" data-uid="${esc(x.uid)}"><div></div><div><span class="pill low">${esc(x.box)}</span></div><div><div class="t">${hl(x.subject || '(제목 없음)', sr.keyword)}</div><div class="d">${esc(x.from)} → ${esc(x.to)} · ${hl(x.snippet, sr.keyword)}</div></div><div class="w">${esc(x.date)}</div></div>`).join('') || '<div class="row"><div></div><div></div><div class="muted">결과 없음</div><div></div></div>'}</div>` : ''}
<h3>최근 메일 ${rows.length}통</h3>${listHtml}
<p class="muted">목록·검색 API만 쓰므로 여기서 보는 것만으로는 메일이 읽음 처리되지 않습니다. 답장 쓰기 창은 보내기를 누르기 전까지 아무것도 보내지 않습니다.</p>`;
  }
  async function runMailSearch(kw) {
    S.mailSearch.kw = kw;
    if (kw.length < 2) { toast('검색어를 두 글자 이상 입력하세요.'); return; }
    try { S.mailSearch.res = await GW.search(kw, {types: ['mail'], pageSize: 20}); } catch (e) { toast(e.message); }
    if (S.view === 'mail') renderMain();
  }

  // ----- 통합검색 -----
  const periodFrom = p => { if (!p) return ''; const d = new Date(); d.setMonth(d.getMonth() - Number(p)); return R.kstNow(d).date.replace(/-/g, ''); };
  function vSearch() {
    const s = S.search, res = s.res;
    const types = Object.entries(GW.searchLabels).filter(([k]) => k !== 'note');
    const group = (type, render) => { const g = res && res.groups[type]; if (!g) return ''; return `<h3>${esc(g.label)} <span class="muted">${g.total}건${g.total > g.items.length ? ` 중 ${g.items.length}건` : ''}</span>${g.total > g.items.length ? `<button class="btn sm" data-act="searchMore" data-t="${type}">더 보기</button>` : ''}</h3>${g.error ? `<p class="err">${esc(g.message)}</p>` : g.items.length ? `<div class="list">${g.items.map(render).join('')}</div>` : '<p class="muted">결과 없음</p>'}`; };
    const row = (t, id, pill, title, desc, when) => `<div class="row ${S.sel && S.sel.type === 'search' && S.sel.item && (S.sel.item.docId || S.sel.item.uid || S.sel.item.id || S.sel.item.fileId) === id ? 'sel' : ''}" data-act="selSearch" data-t="${t}" data-id="${esc(id)}"><div></div><div><span class="pill low">${esc(pill)}</span></div><div><div class="t">${title}</div><div class="d">${desc}</div></div><div class="w">${esc(when)}</div></div>`;
    return `<h2>통합검색</h2><div class="bar"><input class="f" id="sq" placeholder="검색어 (예: 월간업무보고, 문서번호, 사람 이름)" value="${esc(s.kw)}" style="flex:1;min-width:200px"><select class="f" id="speriod">${[['', '전체 기간'], ['1', '최근 1개월'], ['3', '최근 3개월'], ['12', '최근 1년']].map(([v, n]) => `<option value="${v}" ${s.period === v ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="btn primary" data-act="doSearch">${s.busy ? '<span class="spin"></span>' : '검색'}</button></div>
<div class="bar">${types.map(([k, n]) => `<span class="chip ${s.types.includes(k) ? 'on' : ''}" data-act="stype" data-v="${k}">${esc(n)}</span>`).join('')}</div>
${!res ? '<p class="muted">전자결재 문서는 본문까지, 메일은 본문 일부까지 찾습니다. 결과를 누르면 오른쪽에 본문 미리보기가 열리며, 미리보기는 열람 기록을 남기지 않습니다. 검색어는 그룹웨어 최근 검색어에 남기지 않습니다.</p>' : ''}
${res ? group('doc', x => row('doc', x.docId, x.form || '문서', hl(x.title, res.keyword), `${esc(x.docNo)} · ${esc(x.dept)} ${esc(x.drafter)} · ${hl(x.snippet, res.keyword)}`, ymd8(x.date))) : ''}
${res ? group('mail', x => row('mail', x.uid, x.box, hl(x.subject || '(제목 없음)', res.keyword), `${esc(x.from)} → ${esc(x.to)} · ${hl(x.snippet, res.keyword)}`, x.date)) : ''}
${res ? group('board', x => row('board', x.id, x.catTitle || '게시판', hl(x.title, res.keyword), `${esc(x.writer)} · ${hl(x.snippet, res.keyword)}`, String(x.date).slice(0, 10))) : ''}
${res ? group('file', x => row('file', x.fileId, x.ext || '파일', hl(x.name, res.keyword), `${esc(x.parent)} · ${esc(x.owner)}`, String(x.date).slice(0, 10))) : ''}
${res ? group('schedule', x => row('schedule', x.id, '일정', hl(x.title, res.keyword), hl(x.snippet, res.keyword), String(x.start).slice(0, 10))) : ''}
${res ? group('person', x => `<div class="row"><div></div><div><span class="pill low">인물</span></div><div><div class="t">${esc(x.name)} ${esc(x.duty || x.position)}</div><div class="d">${esc(x.dept)}${x.tel ? ' · ☎ ' + esc(x.tel) : ''}${x.email ? ' · ' + esc(x.email) : ''}</div></div><div class="w">${x.email ? `<button class="btn sm" data-act="copy" data-v="${esc(x.email)}">메일 주소 복사</button>` : ''}</div></div>`) : ''}
${res ? group('contact', x => `<div class="row"><div></div><div><span class="pill low">연락처</span></div><div><div class="t">${esc(x.name)} ${esc(x.rank)}</div><div class="d">${esc(x.company)} ${esc(x.dept)}${x.tel ? ' · ☎ ' + esc(x.tel) : ''}${x.email ? ' · ' + esc(x.email) : ''}</div></div><div class="w"></div></div>`) : ''}`;
  }
  async function runSearch(types) {
    const s = S.search;
    if (!s.kw || s.kw.length < 2) { toast('검색어를 두 글자 이상 입력하세요.'); return; }
    s.busy = true; S.view = 'search'; render();
    try { s.res = await GW.search(s.kw, {types: types || s.types, pageSize: 10, from: periodFrom(s.period)}); s.more = {}; } catch (e) { toast(e.message); }
    s.busy = false; render();
  }

  // ----- 할 일 보드 (drag & drop) -----
  const BUCKETS = [['today', '오늘'], ['tomorrow', '내일'], ['week', '이번 주'], ['later', '나중에'], ['done', '끝냄']];
  const BUCKET_NAME = Object.fromEntries(BUCKETS);
  const endOfWeek = () => { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return R.kstNow(d).date; };
  const plusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return R.kstNow(d).date; };
  function bucketOfTodo(t) {
    if (t.status === 'done') return 'done';
    if (S.plan[`todo:${t.id}`]) return S.plan[`todo:${t.id}`];
    if (!t.due) return 'later';
    const n = R.dday(t.due);
    return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : t.due <= endOfWeek() ? 'week' : 'later';
  }
  function bucketOfAction(x) {
    if (S.plan[x.key]) return S.plan[x.key];
    if (isHidden(x.key)) return 'done';
    if (isSnoozed(x.key)) return 'tomorrow';
    if (x.priority === 'high' || (x.deadline && x.deadline.dday <= 0)) return 'today';
    if (x.deadline && x.deadline.dday === 1) return 'tomorrow';
    return 'week';
  }
  function vBoard() {
    const cards = [];
    for (const x of S.a.actions) if (S.plan[x.key] || x.priority !== 'low' || isHidden(x.key)) cards.push({id: x.key, kind: 'act', b: bucketOfAction(x), title: x.title, sub: `${x.area} · ${x.kind}${x.deadline ? ' · ' + ddayText(x.deadline.dday) : ''}`, pri: x.priority});
    for (const t of S.todos) cards.push({id: `todo:${t.id}`, kind: 'todo', b: bucketOfTodo(t), title: t.title, sub: `${t.due ? `기한 ${t.due.slice(5)} (${ddayText(R.dday(t.due))})` : '기한 없음'}${t.source ? ' · ' + t.source : ''}`});
    return `<h2>할 일 보드 <span class="muted">카드를 끌어 칸을 옮기면 계획이 저장됩니다 · "끝냄"으로 옮기면 숨김/완료</span></h2>
<div class="bar"><input class="f" id="tdTitle" placeholder="새 할 일 (Enter)" style="flex:1;min-width:200px"><input class="f" id="tdDue" type="date"><button class="btn primary" data-act="addTodo">추가</button></div>
<div class="board">${BUCKETS.map(([b, n]) => { const cs = cards.filter(c => c.b === b); return `<div class="col" data-drop="${b}"><div class="ch"><span>${n}</span><span class="muted">${cs.length}</span></div>${cs.map(c => `<div class="card ${c.kind} ${c.pri || ''}" draggable="true" data-drag="${esc(c.id)}" data-act="boardCard" data-k="${esc(c.id)}" title="끌어서 옮기기 · 누르면 상세"><div>${c.kind === 'todo' ? '☐ ' : ''}${esc(c.title)}</div><div class="d">${esc(c.sub)}</div>${c.kind === 'todo' ? `<div class="acts"><button class="btn sm" data-act="todoEdit" data-id="${esc(c.id.slice(5))}">고치기</button><button class="btn sm warn" data-act="todoDel" data-id="${esc(c.id.slice(5))}">삭제</button></div>` : ''}</div>`).join('')}</div>`; }).join('')}</div>
<p class="muted">업무 항목(파란 줄)은 그룹웨어에서 처리해야 사라집니다. 할 일(노란 줄)은 이 브라우저에만 저장됩니다.</p>`;
  }
  function dropTo(id, bucket) {
    pushUndo('보드 이동');
    if (id.startsWith('todo:')) {
      const t = S.todos.find(x => `todo:${x.id}` === id);
      if (!t) return;
      if (bucket === 'done') { t.status = 'done'; delete S.plan[id]; }
      else { t.status = 'todo'; t.due = bucket === 'today' ? today() : bucket === 'tomorrow' ? plusDays(1) : bucket === 'week' ? endOfWeek() : ''; delete S.plan[id]; }
    } else {
      if (bucket === 'done') { S.hidden[id] = Date.now(); delete S.plan[id]; }
      else { delete S.hidden[id]; if (bucket === 'tomorrow') S.snooze[id] = tomorrow8(); else delete S.snooze[id]; S.plan[id] = bucket; }
    }
    saveLocal(); render();
    toastUndo(`"${BUCKET_NAME[bucket]}" 칸으로 옮겼습니다.`);
  }

  // ----- 일정 달력 (month grid, drag to change to-do due) -----
  function vCalendar() {
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + S.cal.offset);
    const y = base.getFullYear(), mo = base.getMonth();
    const first = new Date(y, mo, 1), startDow = first.getDay(), last = new Date(y, mo + 1, 0).getDate();
    const items = calendarItems();
    const t0 = today();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div class="c out"></div>');
    for (let dnum = 1; dnum <= last; dnum++) {
      const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(dnum).padStart(2, '0')}`;
      const dow = (startDow + dnum - 1) % 7;
      const its = items.filter(x => x.date === iso);
      cells.push(`<div class="c ${iso === t0 ? 'today' : ''} ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}" data-drop-date="${iso}"><div class="dn">${dnum}</div>${its.slice(0, 5).map(it => `<span class="ev ${it.cls}" ${it.todo ? `draggable="true" data-drag="todo:${esc(it.todo)}"` : ''} data-act="calItem" data-k="${esc(it.key || '')}" data-url="${esc(it.url || '')}" title="${esc(it.tag + ' · ' + it.text)}">${esc(it.text)}</span>`).join('')}${its.length > 5 ? `<span class="muted">+${its.length - 5}</span>` : ''}</div>`);
    }
    const upcoming = items.filter(x => x.date >= t0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
    return `<h2>일정 달력 <button class="btn sm" data-act="calPrev">◀</button><b>${y}년 ${mo + 1}월</b><button class="btn sm" data-act="calNext">▶</button><button class="btn sm" data-act="calToday">이번 달</button><a class="btn sm" href="${esc(S.raw.data.schedule?.url || '')}" target="_blank">그룹웨어 일정</a></h2>
<div class="bar"><span class="ev e">일정</span><span class="ev l">내 휴가</span><span class="ev d">기한</span><span class="ev t">내 할 일(끌어서 날짜 변경)</span><span class="ev h">휴일</span></div>
<div class="cal">${WD.map(w => `<div class="h">${w}</div>`).join('')}${cells.join('')}</div>
<h3>다가오는 항목</h3><div class="list">${upcoming.map(it => `<div class="row" data-act="calItem" data-k="${esc(it.key || '')}" data-url="${esc(it.url || '')}"><div></div><div><span class="pill ${it.cls === 'd' ? 'high' : 'low'}">${esc(it.tag)}</span></div><div><div class="t">${esc(it.text)}</div></div><div class="w">${esc(it.date.slice(5))} ${ddayText(R.dday(it.date))}</div></div>`).join('') || '<div class="row"><div></div><div></div><div class="muted">없음</div><div></div></div>'}</div>`;
  }
  function calendarItems() {
    const out = [];
    const sc = S.raw.data.schedule;
    for (const e of sc?.events || []) out.push({date: ymd8(e.start), text: `${e.allDay ? '' : dtm12(e.start).slice(11) + ' '}${e.title}`, tag: e.calendar, cls: 'e'});
    for (const h of sc?.holidays || []) out.push({date: ymd8(h.date), text: h.title, tag: '휴일', cls: 'h'});
    for (const u of S.raw.data.leave?.history || S.raw.data.leave?.upcoming || []) out.push({date: ymd8(u.start), text: `${u.kind}${u.days ? ' ' + u.days + '일' : ''}`, tag: '내 휴가', cls: 'l'});
    for (const d of S.a.deadlines) out.push({date: d.date, text: `${d.time ? d.time + ' ' : ''}${d.title}`, tag: `기한 · ${d.source}`, cls: 'd', key: d.key, url: d.url});
    if (S.pane.extract) for (const x of S.pane.extract.deadlines) out.push({date: x.date, text: x.context, tag: '본문 기한', cls: 'd'});
    for (const t of S.todos.filter(t => t.due && t.status !== 'done')) out.push({date: t.due, text: t.title, tag: '내 할 일', cls: 't', todo: t.id, url: t.url});
    return out;
  }

  // ----- 예산 집행 (charts, forecast, ledger) -----
  function vBudget() {
    const b = S.budget, t = b.table, el = S.a.budget.elapsedPct;
    const projOptions = S.settings.budget.map(p => `<option value="${esc(p.project + '|' + (p.filter || ''))}" ${b.project === p.project && b.filter === (p.filter || '') ? 'selected' : ''}>${esc(p.project)} ${esc(p.label || '')}${p.filter ? ' · ' + esc(p.filter) : ''}</option>`).join('');
    const flag = r => r.balance < 0 ? '<span class="pill high">초과</span>' : (r.budget > 0 && r.rate >= 95) ? '<span class="pill medium">소진 임박</span>' : (r.budget > 0 && ['목', '세'].includes(r.level) && r.rate < el - 35) ? '<span class="pill low">집행 저조</span>' : '';
    const rows = t && !t.error ? t.rows.filter(r => !b.q || (r.name + r.code).includes(b.q)) : [];
    const head = rows[0];
    const fc = r => { const f = Math.max(0.05, el / 100); const proj = Math.min(r.budget * 1.5, r.executed / f); return {proj, rate: r.budget ? proj / r.budget * 100 : 0, unused: Math.max(0, r.budget - proj)}; };
    const summary = head ? (() => { const f = fc(head); return `<div class="box ${f.rate < 85 ? 'warn' : 'okb'}"><b>${esc(head.name)}</b> 예산 ${won(head.budget)}원 · 집행 ${won(head.executed)}원(${pct(head.rate)}) · 잔액 ${won(head.balance)}원<br>지금 속도(연간 경과 ${el}%)로 가면 연말 집행률 약 <b>${pct(f.rate)}</b>, 쓰지 못할 예상액 약 <b>${won(f.unused)}원</b>. <span class="muted">단순 비례 추정이며 행사 일정에 따라 달라집니다.</span></div>`; })() : '';
    const leaves = rows.filter(r => r.level === '세');
    const ledger = b.ledger;
    const monthly = b.monthly && b.monthly.code === (b.filter || head?.code) ? b.monthly : null;
    const monthChart = monthly ? (() => {
      const vals = monthly.months.map(m => { const r = (m.rows || []).find(x => x.code === monthly.code) || (m.rows || [])[0]; return r ? r.executed : 0; });
      const max = Math.max(1, ...vals);
      return `<div class="chart"><div class="ct"><span>월별 집행 (${esc(monthly.code)})</span><span class="muted">막대를 누르면 그 달 결의만 보기</span></div><svg viewBox="0 0 300 120" width="100%" height="130">${vals.map((v, i) => `<g class="hit" data-act="budgetMonth" data-v="${String(i + 1).padStart(2, '0')}"><rect x="${8 + i * 24}" y="${100 - v / max * 88}" width="18" height="${Math.max(1, v / max * 88)}" rx="3" fill="${b.month === String(i + 1).padStart(2, '0') ? '#c5221f' : '#1a73e8'}"><title>${i + 1}월 ${won(v)}원</title></rect><text x="${17 + i * 24}" y="114" font-size="10" text-anchor="middle" fill="currentColor">${i + 1}</text></g>`).join('')}</svg></div>`;
    })() : (b.monthlyBusy ? '<p class="muted"><span class="spin"></span> 월별 집행을 읽는 중…</p>' : `<p><button class="btn sm" data-act="loadMonthly">월별 집행 그래프 보기</button></p>`);
    const barChart = leaves.length ? `<div class="chart"><div class="ct"><span>세목별 집행률</span><span class="muted">세로선 = 연간 경과 ${el}% · 막대를 누르면 결의 내역</span></div><svg viewBox="0 0 300 ${leaves.length * 22}" width="100%" height="${leaves.length * 22}">${leaves.map((r, i) => `<g class="hit" data-act="ledger" data-code="${esc(r.code)}"><text x="0" y="${i * 22 + 13}" font-size="10.5" fill="currentColor">${esc(r.name.replace(/^○\s*/, '').slice(0, 15))}</text><rect x="118" y="${i * 22 + 3}" width="150" height="12" rx="3" fill="#e7ebf2"/><rect x="118" y="${i * 22 + 3}" width="${Math.min(150, r.rate * 1.5)}" height="12" rx="3" fill="${r.balance < 0 ? '#c5221f' : r.rate < el - 35 ? '#e37400' : '#1a73e8'}"><title>${esc(r.name)} ${pct(r.rate)} · 잔액 ${won(r.balance)}원</title></rect><line x1="${118 + el * 1.5}" x2="${118 + el * 1.5}" y1="${i * 22}" y2="${i * 22 + 18}" stroke="#1d2330" stroke-width="1.5"/><text x="272" y="${i * 22 + 13}" font-size="10" fill="currentColor">${Math.round(r.rate)}%</text></g>`).join('')}</svg></div>` : '';
    const lrows = ledger && ledger.rows ? ledger.rows.filter(r => !b.month || r.date.slice(4, 6) === b.month) : [];
    const multiLedger = ledger && ledger.bgtCd === '__ALL';
    return `<h2>예산 집행 <a class="btn sm" href="${esc(S.a.budget.url)}" target="_blank">예실대비현황</a></h2>
<div class="bar"><select class="f" id="bproj">${projOptions}<option value="__custom">직접 입력…</option></select><input class="f" id="bcode" placeholder="프로젝트 코드" value="${esc(b.project)}" style="width:110px"><input class="f" id="bfilter" placeholder="항·목 코드(선택)" value="${esc(b.filter)}" style="width:120px"><button class="btn primary" data-act="loadBudget">${b.busy ? '<span class="spin"></span>' : '조회'}</button><input class="f" id="bq" placeholder="과목 이름 찾기" value="${esc(b.q)}" style="flex:1;min-width:120px">${t && !t.error ? '<button class="btn sm" data-act="csvBudget">CSV</button><button class="btn sm" data-act="richBudget">한글용 복사</button>' : ''}</div>
${t && t.error ? `<p class="err">${esc(t.message)}</p>` : ''}
${t && !t.error ? `${summary}<div class="charts">${barChart}${monthChart}</div>
<table><tr><th>과목</th><th class="num">예산</th><th class="num">집행</th><th class="num">잔액</th><th class="num">집행률</th></tr>${rows.map(r => `<tr class="lv-${esc(r.level)} ${r.level === '세' ? 'click' : ''} ${ledger && ledger.bgtCd === r.code ? 'sel' : ''}" ${r.level === '세' ? `data-act="ledger" data-code="${esc(r.code)}"` : ''}><td><span class="muted">${esc(r.level)}</span> ${esc(r.name)} ${flag(r)}<div class="muted">${esc(r.code)}</div></td><td class="num">${won(r.budget)}</td><td class="num">${won(r.executed)}</td><td class="num">${won(r.balance)}</td><td class="num">${pct(r.rate)}<div class="rate"><i class="${r.balance < 0 ? 'over' : r.rate < el - 35 ? 'low' : ''}" style="width:${Math.min(100, Math.max(0, r.rate))}%"></i><b style="left:${el}%"></b></div></td></tr>`).join('')}</table>
${leaves.length > 1 ? `<p><button class="btn" data-act="ledgerAll">${esc(head ? head.name : '')} 전체 결의 내역 보기 (세목 ${leaves.filter(r => r.executed > 0).length}개)</button></p>` : ''}
${t.total ? `<p class="muted">참고: ${esc(t.project)} 프로젝트 전체(인건비 포함) 예산 ${won(t.total.budget)}원 · 집행 ${won(t.total.executed)}원 · ${pct(t.total.rate)}</p>` : ''}` : (b.busy ? '<p><span class="spin"></span> 조회 중…</p>' : '')}
${ledger ? `<h3>결의 내역 · ${esc(ledger.name || ledger.bgtCd)} <span class="muted">${ledger.rows ? `${lrows.length}건${b.month ? ` (${Number(b.month)}월)` : ''}` : ''}</span>${b.month ? '<button class="btn sm" data-act="budgetMonthClear">모든 달</button>' : ''}${ledger.rows ? ' <button class="btn sm" data-act="csvLedger">CSV</button>' : ''}</h3>${ledger.error ? `<p class="err">${esc(ledger.error)}</p>` : ledger.rows ? `<table><tr><th>결의일</th>${multiLedger ? '<th>세목</th>' : ''}<th>적요</th><th class="num">금액</th><th>문서번호</th><th>작성</th><th>전표</th></tr>${lrows.map(r => `<tr class="click" data-act="ledgerRow" data-i="${ledger.rows.indexOf(r)}"><td class="nowrap">${esc(ymd8(r.date))}</td>${multiLedger ? `<td class="muted">${esc(r.name.replace(/^○\s*/, '').slice(0, 18))}</td>` : ''}<td>${esc(r.desc)}</td><td class="num">${won(r.amount)}</td><td class="nowrap">${esc(r.docNo)}</td><td class="nowrap">${esc(r.writer)}</td><td class="nowrap muted">${esc(r.slip)}</td></tr>`).join('')}<tr class="lv-관"><td colspan="${multiLedger ? 3 : 2}">${b.month ? `${Number(b.month)}월 합계 <span class="muted">(연간 ${esc(ledger.check)})</span>` : esc(ledger.check)}</td><td class="num">${won(lrows.reduce((s, r) => s + r.amount, 0))}</td><td colspan="3"></td></tr></table>` : '<p><span class="spin"></span></p>'}` : ''}`;
  }
  async function loadBudget() {
    const b = S.budget;
    if (!b.project) { const p = S.settings.budget[0] || {project: 'A201', filter: ''}; b.project = p.project; b.filter = p.filter || ''; }
    const seq = ++b.seq;
    b.busy = true; b.ledger = null; b.monthly = null; b.month = ''; if (S.view === 'budget') renderMain();
    let table;
    try { table = await GW.budgetProject({project: b.project, filter: b.filter}); } catch (e) { table = {error: true, message: e.message}; }
    if (seq !== b.seq) return;
    b.table = table; b.busy = false; if (S.view === 'budget') renderMain();
  }
  async function loadLedger(code) {
    const b = S.budget;
    const row = b.table && b.table.rows.find(r => r.code === code);
    const seq = ++b.seq;
    b.ledger = {bgtCd: code, name: row ? row.name : code, rows: null}; b.month = '';
    renderMain();
    let res;
    try { res = await GW.budgetLedger({project: b.project, bgtCd: code, year: b.table && b.table.year, gisu: b.table && b.table.gisu}); } catch (e) { res = {error: e.message}; }
    if (seq !== b.seq || !b.ledger || b.ledger.bgtCd !== code) return;
    if (res.error) b.ledger.error = res.error;
    else { const ok = row ? res.checkSum === row.executed : null; Object.assign(b.ledger, {rows: res.rows, checkSum: res.checkSum, check: ok === null ? '합계' : ok ? `합계 ✓ 집행액 ${won(row.executed)}원과 일치` : `합계 ⚠ 집행액 ${won(row.executed)}원과 ${won(row.executed - res.checkSum)}원 차이`}); }
    if (S.view === 'budget') renderMain();
  }
  // All subjects under the selected 항 at once (예: 노121 → 26건), checked against the 항 total.
  async function loadLedgerAll() {
    const b = S.budget;
    const t = b.table;
    if (!t || t.error) return;
    const head = t.rows[0];
    const leaves = t.rows.filter(r => r.level === '세' && r.executed > 0);
    const seq = ++b.seq;
    b.ledger = {bgtCd: '__ALL', name: `${head ? head.name : ''} 전체`, rows: null};
    renderMain();
    try {
      const parts = await Promise.all(leaves.map(r => GW.budgetLedger({project: b.project, bgtCd: r.code, year: t.year, gisu: t.gisu}).then(l => ({r, l}))));
      if (seq !== b.seq) return;
      const rows = parts.flatMap(p => p.l.rows).sort((x, y) => x.date.localeCompare(y.date));
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      const bad = parts.filter(p => p.l.checkSum !== p.r.executed);
      const target = head ? head.executed : sum;
      Object.assign(b.ledger, {rows, checkSum: sum, check: sum === target && !bad.length ? `합계 ✓ ${won(target)}원과 일치 (세목 ${parts.length}개, ${rows.length}건)` : `합계 ⚠ ${won(target)}원과 ${won(target - sum)}원 차이${bad.length ? ` · 확인 필요 세목 ${bad.map(p => p.r.code).join(', ')}` : ''}`});
    } catch (e) { if (seq === b.seq) b.ledger.error = e.message; }
    if (S.view === 'budget') renderMain();
  }
  async function loadMonthly() {
    const b = S.budget;
    const code = b.filter || (b.table && b.table.rows[0] && b.table.rows[0].code) || '';
    b.monthlyBusy = true; renderMain();
    try { b.monthly = await GW.budgetMonthly({project: b.project, code, year: b.table && b.table.year}); b.monthly.code = code; } catch (e) { toast('월별 집행을 읽지 못했습니다: ' + e.message); }
    b.monthlyBusy = false; if (S.view === 'budget') renderMain();
  }

  // ----- 근태·연차 (calendar heat grid) -----
  function vAttendance() {
    const at = S.raw.data.attendance, lv = S.raw.data.leave, st = S.att;
    const p = R.kstNow(new Date());
    const thisM = `${p.y}${String(p.m).padStart(2, '0')}`;
    const prevD = new Date(Date.UTC(p.y, p.m - 2, 1));
    const prevM = `${prevD.getUTCFullYear()}${String(prevD.getUTCMonth() + 1).padStart(2, '0')}`;
    const month = st.month || thisM;
    const rows = st.rows || [];
    const anomalies = R.attendanceAnomalies(rows, {leaves: lv?.history || []});
    const bad = new Map(anomalies.map(x => [x.date, x]));
    const y = Number(month.slice(0, 4)), mo = Number(month.slice(4, 6));
    const startDow = new Date(y, mo - 1, 1).getDay(), last = new Date(y, mo, 0).getDate();
    const byDate = new Map(rows.map(r => [r.date, r]));
    const leaveDays = new Set();
    for (const u of lv?.history || []) if (u.approved) leaveDays.add(u.start);
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div></div>');
    for (let dnum = 1; dnum <= last; dnum++) {
      const d8 = `${month}${String(dnum).padStart(2, '0')}`;
      const r = byDate.get(d8);
      const cls = !r ? 'off' : bad.has(d8) ? 'bad' : r.holiday || /휴일/.test(r.result) ? 'off' : leaveDays.has(d8) ? 'lv' : /정상/.test(r.result) ? 'okd' : 'part';
      cells.push(`<div class="c ${cls} ${st.day === d8 ? 'sel' : ''}" data-act="attDay" data-v="${d8}" title="${esc(r ? `${r.result} ${r.item} ${r.status}` : '')}"><b>${dnum}</b>${r ? `<div>${esc(r.result)}</div><div class="muted">${esc(r.item || '')}${r.come ? ' ' + hm4(r.come) : ''}</div>` : ''}</div>`);
    }
    const selRow = st.day ? byDate.get(st.day) : null;
    return `<h2>근태·연차 <a class="btn sm" href="${esc(at?.url || '')}" target="_blank">근무시간현황</a><button class="btn sm primary" data-act="openUrl" data-url="${esc(at?.requestUrl || '')}" data-title="근태신청">근태신청 화면 열기</button></h2>
<div class="grid2"><div class="box"><b>오늘</b> 출근 ${esc(hm4(at?.today.come) || '기록 없음')} · 퇴근 ${esc(hm4(at?.today.leave) || '기록 없음')}<br><b>이번 달</b> 인정 ${mins(at?.month.recognizedMin)} · 기본 ${mins(at?.month.basicMin)} · 초과 ${mins(at?.month.overtimeMin)} · 제외 ${mins(at?.month.exceptMin)}</div>
<div class="box"><b>${esc(lv?.year)}년 연차</b> 부여 ${lv?.granted} · 사용 ${lv?.used} · <b>잔여 ${lv?.remaining}일</b><br>${(lv?.upcoming || []).map(u => `예정 ${esc(ymd8(u.start))} ${esc(u.kind)} ${u.days}일(${u.approved ? '결재완료' : '진행 중'})`).join('<br>') || '<span class="muted">예정된 휴가 없음</span>'}</div></div>
<div class="bar" style="margin-top:10px"><span class="chip ${month === thisM ? 'on' : ''}" data-act="attMonth" data-v="${thisM}">이번 달</span><span class="chip ${month === prevM ? 'on' : ''}" data-act="attMonth" data-v="${prevM}">지난달</span>${st.rows ? '<button class="btn sm" data-act="csvAtt">CSV</button>' : ''}<span class="muted">초록 정상 · 노랑 부분(외출·조퇴 등) · 파랑 휴가 · 회색 휴일 · 빨강 확인 필요</span></div>
${st.busy ? '<p><span class="spin"></span></p>' : `<div class="att">${WD.map(w => `<div class="muted" style="text-align:center">${w}</div>`).join('')}${cells.join('')}</div>`}
${selRow ? `<div class="box ${bad.has(st.day) ? 'warn' : ''}"><b>${esc(ymd8(st.day))}</b> ${esc(selRow.workType)} · 출결 ${esc(selRow.result)} · ${esc(selRow.item || '근태항목 없음')} · 상태 ${esc(selRow.status)} · 출근 ${esc(hm4(selRow.come) || '-')} · 퇴근 ${esc(hm4(selRow.leave) || '-')} · 인정 ${selRow.recognizedMin === null ? '-' : mins(selRow.recognizedMin)}${bad.has(st.day) ? `<br>${esc(bad.get(st.day).advice)}` : ''}<div class="acts"><button class="btn sm primary" data-act="openUrl" data-url="${esc(at?.requestUrl || '')}" data-title="근태신청 ${esc(ymd8(st.day))}">이 날짜 근태신청 하러 가기</button></div></div>` : ''}
${anomalies.length ? `<h3>확인이 필요한 날 ${anomalies.length}일</h3><div class="list">${anomalies.map(x => `<div class="row" data-act="attDay" data-v="${x.date}"><div></div><div><span class="pill ${x.priority}">${PRI[x.priority]}</span></div><div><div class="t">${esc(ymd8(x.date))} 출결 '${esc(x.result)}' ${x.status ? `(${esc(x.status)})` : ''}</div><div class="d">${esc(x.advice)}</div></div><div class="w"></div></div>`).join('')}</div>` : ''}
<h3>올해 연차·휴가 사용 내역 <span class="muted">${(lv?.history || []).length}건</span></h3><table><tr><th>기간</th><th>구분</th><th class="num">일수</th><th>제목</th><th>상태</th></tr>${(lv?.history || []).slice(0, 40).map(u => `<tr><td class="nowrap">${esc(ymd8(u.start))}${u.end !== u.start ? '~' + esc(ymd8(u.end).slice(5)) : ''}</td><td>${esc(u.kind)}</td><td class="num">${u.days}</td><td>${esc(u.title)}</td><td>${u.approved ? '완료' : '진행'}</td></tr>`).join('')}</table>`;
  }
  async function loadAttendance(month) {
    const p = R.kstNow(new Date());
    const m = month || S.att.month || `${p.y}${String(p.m).padStart(2, '0')}`;
    const seq = ++S.att.seq;
    S.att.month = m; S.att.busy = true; if (!S.att.day.startsWith(m)) S.att.day = ''; renderMain();
    const y = Number(m.slice(0, 4)), mo = Number(m.slice(4, 6));
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const t = today().replace(/-/g, '');
    const to = `${m}${String(last).padStart(2, '0')}`;
    let rows;
    try { rows = await GW.attendanceDays({from: `${m}01`, to: to > t ? t : to}); } catch (e) { rows = []; toast('근태 자료를 읽지 못했습니다: ' + e.message); }
    if (seq !== S.att.seq) return;
    S.att.rows = rows; S.att.busy = false; if (S.view === 'attendance') renderMain();
  }

  // ----- 보고서 -----
  function vReport() {
    return `<h2>보고서</h2><div class="bar"><button class="btn primary" data-act="mkWeekly">주간 업무 실적 초안 만들기</button><button class="btn" data-act="richBrief">오늘 브리핑 한글용 복사</button><button class="btn" data-act="printBrief">브리핑 인쇄·PDF</button><button class="btn" data-act="dlBrief">브리핑 HTML 저장</button><button class="btn" data-act="csvQueue">할 일 목록 CSV(엑셀)</button></div>
${S.weekly ? `<h3>주간 업무 실적 초안 <button class="btn sm primary" data-act="richWeekly">한글용 복사</button><button class="btn sm" data-act="cpWeekly">글자만 복사</button><button class="btn sm" data-act="dlWeekly">TXT 저장</button><span class="muted">고친 내용은 자동 저장됩니다</span></h3><textarea id="weekly">${esc(S.weekly)}</textarea>` : '<p class="muted">주간 실적 초안은 최근 7일 내 상신문서와 내가 담당한 부서 접수 문서로 만듭니다. "한글용 복사"는 한글·워드에 붙여넣을 때 굵게·들여쓰기가 유지됩니다.</p>'}
<h3>오늘 브리핑 미리보기</h3><iframe id="briefFrame" sandbox="allow-popups allow-popups-to-escape-sandbox allow-modals" style="width:100%;height:560px;border:1px solid var(--line);border-radius:9px;background:#fff"></iframe>`;
  }
  const weeklyHtml = text => `<div style="font-family:'함초롬바탕','맑은 고딕',serif;font-size:11pt;line-height:1.7">${text.split('\n').map(l => l.startsWith('□') ? `<p><b>${esc(l)}</b></p>` : l.startsWith('○') ? `<p style="margin-left:10pt"><b>${esc(l)}</b></p>` : l.startsWith('  -') ? `<p style="margin-left:24pt">${esc(l.trim())}</p>` : l.startsWith('※') ? `<p style="color:#666;font-size:9pt">${esc(l)}</p>` : l ? `<p>${esc(l)}</p>` : '').join('')}</div>`;
  const briefHtml = () => {
    const a = S.a, s = a.summary;
    const rows = visibleActions().slice(0, 30).map(x => `<tr><td>${PRI[x.priority]}</td><td>${esc(x.area)}</td><td>${esc(x.title)}</td><td>${esc(x.deadline ? x.deadline.date.slice(5) + ' ' + ddayText(x.deadline.dday) : '')}</td></tr>`).join('');
    return `<p><b>그룹웨어 업무 브리핑 (${esc(R.kstNow(new Date(a.collectedAt)).date)} ${hhmm(new Date(a.collectedAt))} 기준)</b></p><p>결재·접수·배부 ${s.approvalAction}건, 발송 대기 ${s.sendWaiting ?? '-'}건, 안 읽은 메일 ${s.mailUnread}건, 남은 연차 ${s.leaveRemaining ?? '-'}일</p><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-size:10pt"><tr><th>구분</th><th>영역</th><th>내용</th><th>기한</th></tr>${rows}</table>`;
  };

  // ----- 설정 -----
  function vSettings() {
    const st = S.settings;
    const hasMini = !!localStorage.getItem(LS + 'src');
    return `<h2>설정</h2><table>
<tr><td style="width:170px">자동 새로고침</td><td><select class="f" id="setRefresh">${[0, 3, 5, 10, 30].map(m => `<option value="${m}" ${Number(st.refreshMin) === m ? 'selected' : ''}>${m ? m + '분마다' : '끄기'}</option>`).join('')}</select> <span class="muted">작업 중일 때는 화면을 바꾸지 않고 "새 자료 반영" 안내만 띄웁니다.</span></td></tr>
<tr><td>새 긴급 항목 알림</td><td><label><input type="checkbox" id="setNotify" ${st.notify ? 'checked' : ''}> 바탕화면 알림 보내기</label> <span class="muted">${'Notification' in window ? '권한: ' + Notification.permission : '이 브라우저는 알림을 지원하지 않습니다'}</span></td></tr>
<tr><td>글자 크기·테마</td><td><select class="f" id="setFs">${[['s', '작게'], ['m', '보통'], ['l', '크게'], ['xl', '아주 크게']].map(([v, n]) => `<option value="${v}" ${st.fontSize === v ? 'selected' : ''}>${n}</option>`).join('')}</select> <select class="f" id="setTheme"><option value="light" ${st.theme === 'light' ? 'selected' : ''}>밝게</option><option value="dark" ${st.theme === 'dark' ? 'selected' : ''}>어둡게</option></select> <label><input type="checkbox" id="setBeginner" ${st.beginner ? 'checked' : ''}> 쉬운 안내 보기(단축키 대신 설명)</label></td></tr>
<tr><td>예산 조회 대상</td><td><div id="budgetRows">${st.budget.map((b, i) => `<div class="bar"><input class="f" data-b="project" data-i="${i}" value="${esc(b.project)}" placeholder="프로젝트 코드" style="width:110px"><input class="f" data-b="filter" data-i="${i}" value="${esc(b.filter || '')}" placeholder="항·목 코드(선택)" style="width:130px"><input class="f" data-b="label" data-i="${i}" value="${esc(b.label || '')}" placeholder="이름" style="flex:1"><button class="btn sm warn" data-act="budgetRowDel" data-i="${i}">삭제</button></div>`).join('')}</div><button class="btn sm" data-act="budgetRowAdd">+ 대상 추가</button></td></tr>
<tr><td>내 긴급 키워드</td><td><input class="f" id="setWords" style="width:100%" value="${esc((st.urgentWords || []).join(', '))}" placeholder="쉼표로 구분 (예: 행정사무감사, 시의회, 감사)"><div class="muted">제목에 이 단어가 있으면 점수를 크게 올립니다.</div></td></tr>
<tr><td>받은메일 읽는 수</td><td><select class="f" id="setMail">${[50, 100, 200].map(n => `<option ${Number(st.mailCount) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></td></tr>
<tr><td>정리</td><td><button class="btn sm" data-act="resetDone">숨기기·미루기·보드 계획 초기화</button> <button class="btn sm" data-act="resetRouting">추천 이력 지우기</button> <button class="btn sm" data-act="tourAgain">처음 안내 다시 보기</button> <button class="btn sm warn" data-act="resetAll">업무센터 자료 모두 지우기</button></td></tr>
<tr><td>설치 상태</td><td>${hasMini ? '이 브라우저에 설치됨 (작은 "GW 업무센터" 북마크로 열 수 있음)' : '설치 북마크로 한 번 실행하면 이 브라우저에 저장됩니다.'}<br><span class="muted">수집기 v${esc(GW.version)} · 업무센터 v${VERSION} · 허용 API ${GW.readOnlyEndpoints().length}개(모두 조회용)</span></td></tr></table>
<p><button class="btn primary" data-act="saveSettings">설정 저장</button></p>`;
  }

  // ---------- detail pane ----------
  function renderPane() {
    const pane = $('#pane');
    const show = !!(S.sel || S.pane.url || S.focus);
    wcEl.classList.toggle('nopane', !show);
    wcEl.classList.toggle('expanded', show && S.pane.expanded);
    if (!show) { pane.innerHTML = ''; S.pane.mounted = ''; return; }
    if (!pane.querySelector('#ph')) pane.innerHTML = '<div class="ph" id="ph"></div><div class="frame" id="frame"></div><div id="fbar"></div>';
    const info = paneInfo();
    const ph = $('#ph');
    ph.className = 'ph' + (S.pane.url ? '' : ' min');
    ph.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div class="t">${esc(info.title || '')}</div><div style="display:flex;gap:4px">${S.pane.url ? `<button class="btn sm" data-act="paneExpand" title="처리 창을 넓게">${S.pane.expanded ? '목록 보기' : '크게'}</button><a class="btn sm" href="${esc(S.pane.url)}" target="_blank" title="새 창으로">새 창</a>` : ''}<button class="btn sm" data-act="closePane" title="닫기 (Esc)">✕</button></div></div><div class="body">${info.body || ''}</div>`;
    const frame = $('#frame');
    if (S.pane.url !== S.pane.mounted) {
      frame.innerHTML = '';
      if (S.pane.url) { const f = document.createElement('iframe'); f.src = S.pane.url; f.addEventListener('load', () => scanFrame(f, S.pane.url)); frame.append(f); }
      S.pane.mounted = S.pane.url;
    }
    if (!S.pane.url && !frame.querySelector('.empty')) frame.innerHTML = `<div class="empty">${info.url ? '"처리 창에 열기"를 누르면 그룹웨어 원래 화면이 여기에 열립니다.<br>그 화면의 버튼(결재·접수·배부·발송·보내기)은 실제로 처리됩니다.' : '이 항목은 열 화면이 없습니다.'}</div>`;
    $('#fbar').innerHTML = focusBar();
  }
  // After the user opens a document, read its text (same origin) and pull out deadlines.
  function scanFrame(f, url, tries = 0) {
    if (!f.isConnected || url !== S.pane.url) return;
    let text = '';
    try {
      const collect = doc => { if (!doc || !doc.body) return; text += '\n' + doc.body.innerText; for (const ta of doc.querySelectorAll('textarea,input[type=text],input:not([type])')) text += '\n' + (ta.value || ''); for (const inner of doc.querySelectorAll('iframe')) { try { collect(inner.contentDocument); } catch {} } };
      collect(f.contentDocument);
    } catch { return; }
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
  function actsFor(url, {key, q, title, unread, extra} = {}) {
    return `<div class="acts">${url ? `<button class="btn primary" data-act="openUrl" data-url="${esc(url)}" data-title="${esc(title || '')}" ${unread ? 'data-unread="1"' : ''}>처리 창에 열기</button>` : ''}${extra || ''}${key ? `<button class="btn" data-act="quickHide" data-k="${esc(key)}" title="이 화면에서만 숨김. 그룹웨어 상태는 그대로">숨기기</button><button class="btn" data-act="quickSnooze" data-k="${esc(key)}">내일까지 미루기</button>` : ''}<button class="btn" data-act="todoFromSel">할 일 추가</button>${q ? `<button class="btn" data-act="related" data-q="${esc(q)}">관련 문서 찾기</button>` : ''}</div>`;
  }
  function paneInfo() {
    const sel = S.sel;
    if (!sel) return {title: S.focus ? '연속 처리' : '그룹웨어 화면', url: S.pane.url, body: ''};
    if (sel.type === 'action') {
      const x = selectedAction();
      if (!x) return {title: '항목이 목록에서 사라졌습니다', body: '<div class="box okb">그룹웨어에서 처리됐거나 조건이 바뀌었습니다. 새로고침 후 목록에서 다시 선택하세요.</div>'};
      const why = `<div class="muted">${PRI[x.priority]} · 점수 ${x.score}${x.why && x.why.length ? ' · ' + esc(x.why.join(', ')) : ''}</div>`;
      if (x.type === 'doc') return docPane(findDoc(x.ref.kind, x.ref.docId) || {title: x.title, url: x.url, docId: x.ref.docId}, x.ref.kind, x, why);
      if (x.type === 'mail') return mailPane(findMail(x.ref.box, x.ref.uid), x, why);
      if (x.type === 'notice') return {title: x.title, url: x.url, body: `${why}<div class="kv"><b>구분</b><span>${esc(x.kind)}</span><b>작성</b><span>${esc(x.detail)}</span><b>등록</b><span>${esc(x.when)}</span></div><div class="box warn">원문을 열면 게시글이 읽음 처리되고 조회수가 올라갑니다.</div>${actsFor(x.url, {key: x.key, q: relatedQ(x.title), title: x.title})}<div class="box" id="extract">${extractHtml()}</div>`};
      if (x.type === 'attendance') return {title: x.title, url: x.url, body: `${why}<div class="box warn">${esc(x.detail)}</div>${actsFor(x.url, {key: x.key, title: '근태신청'})}<div class="box tip">근태신청 화면이 열립니다. 해당 날짜의 출장·휴가·근무일대체 신청 여부를 확인하세요. <button class="btn sm" data-act="goAttendanceDay" data-v="${esc(x.ref.date)}">근태 달력에서 보기</button></div>`};
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
        recBox = `<div class="box tip"><b>${label}</b> <span class="muted">최근 180일 비슷한 문서 ${rec ? rec.similar : 0}건 기준</span>${grp ? `<div style="margin:4px 0">가장 비슷한 지난 문서는 <b>${grp.targets.length}곳</b>에 함께 ${kind === 'distWaiting' ? '배부' : '접수'}: ${esc(grp.targets.join(', '))}<div class="muted">${esc(grp.title)} · ${esc(grp.from)} · ${esc(String(grp.date).slice(0, 10))}</div></div>` : ''}${rec && rec.length ? rec.map(r => `<div>${esc(r.name)} <span class="pill ${r.level === '높음' ? 'ok' : 'low'}">${r.level}</span><span class="muted">비슷한 ${r.of}건 중 ${r.count}건 · ${esc(r.reasons.join(', '))}</span>${r.examples[0] ? `<div class="muted">예: ${esc(r.examples[0].title)} (${esc(String(r.examples[0].date).slice(0, 10))})</div>` : ''}</div>`).join('') : '<div class="muted">제목 주제가 겹치는 처리 이력이 없습니다.</div>'}</div>`;
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
  function mailPane(m, action, why) {
    if (!m) return {title: action ? action.title : '메일', url: S.a.mail.url, body: actsFor(S.a.mail.url, {key: action && action.key, title: '받은메일함'})};
    const dl = R.extractAllDeadlines(m.subject + ' ' + m.preview).filter(x => x.dday >= -1);
    const reply = `<button class="btn primary" data-act="openUrl" data-url="${esc(GW.links.compose('re', m))}" data-title="답장: ${esc(m.subject)}">답장 쓰기</button><button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('reall', m))}" data-title="전체 답장: ${esc(m.subject)}">전체 답장</button><button class="btn" data-act="openUrl" data-url="${esc(GW.links.compose('fw', m))}" data-title="전달: ${esc(m.subject)}">전달</button><button class="btn" data-act="openUrl" data-url="${esc(S.a.mail.url)}" data-title="받은메일함">메일함에서 원문</button>`;
    return {title: m.subject || '(제목 없음)', url: S.a.mail.url, body: `${why || ''}<div class="kv"><b>보낸 사람</b><span>${esc(m.from)} &lt;${esc(m.fromEmail)}&gt;</span><b>받은 시각</b><span>${esc(m.date)}</span><b>메일함</b><span>${esc(m.box)}</span><b>상태</b><span>${m.seen ? '읽음' : '안 읽음'}${m.answered ? ' · 답장함' : ''}${m.forwarded ? ' · 전달함' : ''}${m.attach ? ' · 첨부' : ''}</span></div><div class="box">${esc(m.preview) || '<span class="muted">미리보기 없음</span>'}</div>${dl.length ? `<div class="box tip"><b>찾은 기한</b> ${dl.map(d => `<span class="pill ${d.dday <= 1 ? 'solid' : 'medium'}">${esc(d.date.slice(5))}${d.time ? ' ' + esc(d.time) : ''} ${ddayText(d.dday)}</span>`).join('')}</div>` : ''}<div class="acts">${reply}</div>${actsFor('', {key: action ? action.key : `mail:${m.box}:${m.uid}`, q: relatedQ(m.subject)})}<div class="muted">답장 쓰기 창은 받는 사람·제목이 채워진 채 열리며, 보내기를 눌러야 발송됩니다. 안 읽은 메일이라도 답장 창을 여는 것만으로는 읽음 처리되지 않는지 그룹웨어 동작을 꼭 확인하세요.</div>`};
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
    S.sel = {type: 'action', key};
    if (!keepPane) { S.pane.url = ''; S.pane.extract = null; S.pane.preview = null; }
    if (S.newKeys.delete(key)) saveLocal();
    const x = selectedAction();
    if (x && x.type === 'doc' && ['distWaiting', 'deptWaiting'].includes(x.ref.kind) && !S.routing) loadRouting().then(() => renderPane());
    if (S.view === 'today') { root.querySelectorAll('.row.sel').forEach(r => r.classList.remove('sel')); const row = root.querySelector(`.row[data-k="${CSS.escape(key)}"]`); if (row) { row.classList.add('sel'); row.querySelector('.pill.new')?.remove(); } renderNav(); }
    else renderMain();
    renderPane();
  }
  function openUrl(url, {title = '', unread = false} = {}) {
    if (!url) return;
    if (unread && !confirm('아직 열람하지 않은 문서입니다. 처리 창에 열면 그룹웨어에 열람으로 기록됩니다. 열까요?')) return;
    if (!S.sel) S.sel = {type: 'frame', title: title || '그룹웨어 화면', url};
    S.pane.url = url; S.pane.extract = null;
    renderPane();
  }
  function openItem(x) {
    const d = x.type === 'doc' ? findDoc(x.ref.kind, x.ref.docId) : null;
    if (x.type === 'mail') { const m = findMail(x.ref.box, x.ref.uid); openUrl(m ? GW.links.compose('re', m) : x.url, {title: x.title}); return; }
    openUrl(x.url, {title: x.title, unread: !!(d && d.unread)});
  }
  function openWindow(url, x) {
    const d = x && x.type === 'doc' ? findDoc(x.ref.kind, x.ref.docId) : null;
    if (d && d.unread && !confirm('아직 열람하지 않은 문서입니다. 새 창으로 열면 열람으로 기록됩니다. 열까요?')) return;
    window.open(url, '_blank');
  }

  // ---------- hide / snooze / undo / to-do ----------
  function pushUndo(label) { S.undo.push({label, hidden: {...S.hidden}, snooze: {...S.snooze}, plan: {...S.plan}, todos: JSON.parse(JSON.stringify(S.todos))}); if (S.undo.length > 20) S.undo.shift(); }
  function undo() {
    const u = S.undo.pop();
    if (!u) { toast('되돌릴 작업이 없습니다.'); return; }
    S.hidden = u.hidden; S.snooze = u.snooze; S.plan = u.plan; S.todos = u.todos; saveLocal(); render(); toast(`되돌렸습니다: ${u.label}`);
  }
  function hide(keys) { pushUndo(`${keys.length}건 숨기기`); for (const k of keys) S.hidden[k] = Date.now(); S.multi.clear(); saveLocal(); afterMark(); toastUndo(`${keys.length}건을 이 화면에서 숨겼습니다. 그룹웨어에서 처리해야 완전히 사라집니다.`); }
  function snooze(keys) { pushUndo(`${keys.length}건 미루기`); const t = tomorrow8(); for (const k of keys) S.snooze[k] = t; S.multi.clear(); saveLocal(); afterMark(); toastUndo(`${keys.length}건을 내일 오전 8시까지 미뤘습니다.`); }
  function afterMark() { if (S.view === 'today') refreshQueue(); else render(); if (S.sel && S.sel.type === 'action' && (isHidden(S.sel.key) || isSnoozed(S.sel.key)) && !S.focus) { const q = queue(); if (q[0]) selectAction(q[0].key); else { S.sel = null; renderPane(); } } }
  function addTodo(title, due = '', source = '', url = '', key = '') {
    if (!title) return;
    pushUndo('할 일 추가');
    const t = {id: uid(), title, due, status: 'todo', source, url, at: Date.now()};
    S.todos.unshift(t);
    if (key) S.plan[key] = S.plan[key] || 'today';
    saveLocal(); renderNav(); if (S.view === 'board' || S.view === 'calendar') renderMain();
    toastUndo(`할 일에 추가했습니다${due ? ` (기한 ${due.slice(5)})` : ''}.`);
  }
  function addTodoFromInput() { const title = ($('#tdTitle') || {}).value?.trim(); if (!title) return; addTodo(title, ($('#tdDue') || {}).value || '', '직접 추가'); }
  function selInfo() { const info = S.sel ? paneInfo() : null; return info ? {title: info.title, url: info.url} : {title: '', url: ''}; }

  // ---------- 연속 처리 모드 ----------
  function startFocus(keys) {
    const list = (keys && keys.length ? keys : queue().filter(x => ['doc', 'mail', 'attendance', 'conflict', 'notice'].includes(x.type)).map(x => x.key));
    if (!list.length) { toast('처리할 항목이 없습니다.'); return; }
    const unreadN = list.filter(k => { const x = S.a.actions.find(a => a.key === k); const d = x && x.type === 'doc' ? findDoc(x.ref.kind, x.ref.docId) : null; return d && d.unread; }).length;
    if (unreadN && !S.focusConfirmed && !confirm(`연속 처리를 시작합니다 (${list.length}건).\n원문을 차례로 처리 창에 엽니다. 미열람 문서 ${unreadN}건은 열면 열람으로 기록됩니다. 계속할까요?`)) return;
    S.focusConfirmed = true;
    S.focus = {keys: list, i: 0, results: {}};
    if (S.view !== 'today' && S.view !== 'approval') S.view = 'today';
    focusOpen();
    toast('연속 처리: 원래 화면에서 처리한 뒤 "처리했음 → 다음"을 누르세요. 그룹웨어에서 실제로 처리됐는지 확인해 드립니다.');
  }
  function focusOpen() {
    const f = S.focus;
    const k = f.keys[f.i];
    const x = S.a.actions.find(a => a.key === k);
    S.sel = {type: 'action', key: k};
    S.pane.extract = null; S.pane.preview = null;
    if (x) S.pane.url = x.type === 'mail' ? (findMail(x.ref.box, x.ref.uid) ? GW.links.compose('re', findMail(x.ref.box, x.ref.uid)) : x.url) : x.url;
    render();
  }
  function focusBar() {
    const f = S.focus;
    if (!f) return '';
    const done = Object.values(f.results).filter(r => r === 'done').length, remain = Object.values(f.results).filter(r => r === 'remain').length;
    const k = f.keys[f.i];
    const x = S.a.actions.find(a => a.key === k);
    const label = x && x.type === 'doc' ? '처리했음 → 확인하고 다음' : '확인했음 → 다음';
    return `<div class="fbar"><span class="prog">연속 처리 ${f.i + 1} / ${f.keys.length}${done || remain ? ` · 처리 확인 ${done}${remain ? ` · 아직 남음 ${remain}` : ''}` : ''}</span><button class="btn sm" data-act="focusPrev" ${f.i === 0 ? 'disabled' : ''}>◀ 이전</button><button class="btn sm" data-act="focusSkip">건너뛰기</button><button class="btn ok" data-act="focusNext">${label}</button><button class="btn sm" data-act="focusStop">끝내기</button></div>`;
  }
  async function focusNext(verify = true) {
    const f = S.focus;
    if (!f) return;
    const k = f.keys[f.i];
    const x = S.a.actions.find(a => a.key === k);
    if (verify && x && x.type === 'doc' && ['distWaiting', 'deptWaiting', 'pending', 'sendWaiting'].includes(x.ref.kind)) {
      toast('그룹웨어에서 처리됐는지 확인하는 중…');
      try {
        const r = await GW.collect({modules: ['approval']});
        const still = ((r.data.approval?.lists[x.ref.kind] || {}).docs || []).some(d => d.docId === x.ref.docId);
        f.results[k] = still ? 'remain' : 'done';
        if (S.raw && r.data.approval) { S.raw.data.approval = r.data.approval; S.raw.status.approval = r.status.approval; }
        toast(still ? '아직 그룹웨어 목록에 남아 있습니다. 처리가 저장되지 않았을 수 있습니다.' : '✓ 그룹웨어에서 처리된 것을 확인했습니다.');
      } catch (e) { f.results[k] = 'unknown'; toast('확인하지 못했습니다: ' + e.message); }
    } else if (verify && x) { pushUndo('연속 처리 확인'); f.results[k] = 'done'; S.hidden[k] = Date.now(); saveLocal(); }
    if (f.i >= f.keys.length - 1) { finishFocus(); return; }
    f.i++; focusOpen();
  }
  function focusPrev() { if (S.focus && S.focus.i > 0) { S.focus.i--; focusOpen(); } }
  function finishFocus() {
    const f = S.focus;
    const done = Object.values(f.results).filter(r => r === 'done').length, remain = f.keys.filter(k => f.results[k] === 'remain');
    S.focus = null; S.pane.url = ''; S.sel = null;
    if (S.raw) { const a = R.analyze(S.raw, store.get('state', null)); applyUrgentWords(a); S.a = a; }
    render();
    toast(`연속 처리를 마쳤습니다: 처리 확인 ${done}건${remain.length ? `, 아직 남은 ${remain.length}건` : ''}.`);
    refresh({silent: true});
  }
  function stopFocus() { if (!S.focus) return; finishFocus(); }

  // ---------- overlays: palette, help, menus ----------
  let palItems = [], palIndex = 0;
  function openPalette(q = '') {
    S.paletteOpen = true; S.menuOpen = ''; S.helpOpen = false;
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg pal" data-stop="1"><input id="palq" placeholder="무엇을 할까요? 예) 배부, A201, 지난달 근태, 새 메일, 전략경영실-1234, 회의록" value="${esc(q)}" autocomplete="off"><div id="pallist" style="margin-top:8px"></div><div class="muted" style="margin-top:6px">↑↓ 이동 · Enter 실행 · Esc 닫기</div></div></div>`;
    const inp = $('#palq');
    inp.focus(); inp.setSelectionRange(q.length, q.length);
    palRender(q);
  }
  function palCommands(q) {
    const cmds = [];
    const add = (label, hint, run, extra = '') => cmds.push({label, hint, run, text: label + ' ' + hint + ' ' + extra});
    const VIEW_WORDS = {today: '할 일 오늘 긴급 대시보드', approval: '배부 접수 결재 발송 열람 공문 문서유통', mail: '메일 답장 받은메일', search: '검색 찾기', board: '할 일 계획 보드', calendar: '일정 달력 기한', budget: '예산 집행 결의 예실', attendance: '근태 연차 휴가 출근 퇴근', report: '보고서 주간 브리핑 실적', settings: '설정 글자 테마 알림'};
    for (const v of VIEWS) add(`${v.label} 화면`, '이동', () => go(v.id), VIEW_WORDS[v.id] || '');
    add('연속 처리 시작', '처리할 일을 하나씩', () => startFocus(), '처리 모드');
    add('새로고침', '자료 다시 읽기', () => refresh());
    add('새 메일 쓰기', '메일', () => openUrl(GW.links.compose('plain'), {title: '새 메일 쓰기'}), 'mail');
    for (const f of (S.forms && S.forms.list) || []) add(`새 기안: ${f.name}`, f.count ? `최근 6개월 ${f.count}번 사용` : '추천 양식', () => openUrl(f.url, {title: `새 기안: ${f.name}`}), '기안 결재작성 양식');
    add('전체 양식에서 기안', '결재작성', () => openUrl(GW.links.route(GW.routes.draft), {title: '결재작성'}), '기안 양식');
    add('근태신청', '출장·휴가·대체', () => openUrl(GW.links.route(GW.routes.attendanceRequest), {title: '근태신청'}), '휴가 출장');
    add('근태 지난달 보기', '근태·연차', () => { go('attendance'); const p = R.kstNow(new Date()); const d = new Date(Date.UTC(p.y, p.m - 2, 1)); loadAttendance(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`); });
    for (const p of S.settings.budget) add(`예산 ${p.project} ${p.filter || ''}`, p.label || '예산 집행', () => { S.budget.project = p.project; S.budget.filter = p.filter || ''; S.budget.table = null; go('budget'); });
    add('주간 업무 실적 초안', '보고서', () => { go('report'); makeWeekly(); }, '보고');
    add('오늘 브리핑 한글용 복사', '보고서', () => copyRich(briefHtml(), R.renderMarkdown(S.a)));
    add('도움말', '사용법·용어', () => toggleHelp(true));
    add('글자 크게', '보기', () => fontStep(1)); add('글자 작게', '보기', () => fontStep(-1));
    add(S.settings.theme === 'dark' ? '밝은 테마' : '어두운 테마', '보기', () => toggleTheme());
    for (const x of visibleActions().slice(0, 60)) add(x.title, `${PRI[x.priority]} · ${x.kind}`, () => { go('today'); selectAction(x.key); }, x.detail);
    const qq = q.trim();
    if (/^[A-Za-z]\d{3}$/.test(qq)) add(`예산 ${qq.toUpperCase()} 조회`, '프로젝트 코드', () => { S.budget.project = qq.toUpperCase(); S.budget.filter = ''; S.budget.table = null; go('budget'); });
    if (/[가-힣A-Za-z0-9]+-\d{2,}/.test(qq)) add(`문서번호 ${qq} 찾아 열기`, '결재문서', () => findAndOpenDocNo(qq, ''));
    if (qq.length >= 2) add(`통합검색: ${qq}`, 'Enter', () => { S.search.kw = qq; runSearch(); }, qq);
    return cmds;
  }
  const fuzzy = (text, q) => {
    if (!q) return 1;
    const t = text.toLowerCase(), k = q.toLowerCase().replace(/\s+/g, '');
    if (t.includes(q.toLowerCase())) return 100 - t.indexOf(q.toLowerCase());
    let i = 0, score = 0;
    for (const ch of k) { const j = t.indexOf(ch, i); if (j < 0) return 0; score += j === i ? 3 : 1; i = j + 1; }
    return score;
  };
  function palRender(q) {
    const cmds = palCommands(q);
    palItems = cmds.map(c => ({...c, s: fuzzy(c.text, q.trim())})).filter(c => c.s > 0).sort((a, b) => b.s - a.s).slice(0, 14);
    if (q.trim().length >= 2 && !palItems.some(c => c.label.startsWith('통합검색'))) palItems.push(cmds.find(c => c.label.startsWith('통합검색')));
    palItems = palItems.filter(Boolean);
    palIndex = 0;
    $('#pallist').innerHTML = palItems.map((c, i) => `<div class="it ${i === palIndex ? 'on' : ''}" data-act="palRun" data-i="${i}"><span>${esc(c.label)}</span><span class="k">${esc(c.hint)}</span></div>`).join('') || '<div class="muted">해당하는 명령이 없습니다.</div>';
  }
  function paletteKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); palIndex = Math.max(0, Math.min(palItems.length - 1, palIndex + (e.key === 'ArrowDown' ? 1 : -1))); root.querySelectorAll('.pal .it').forEach((n, i) => n.classList.toggle('on', i === palIndex)); return; }
    if (e.key === 'Enter') { e.preventDefault(); const c = palItems[palIndex]; closeOverlay(); if (c) c.run(); }
  }
  function toggleHelp(force) {
    S.helpOpen = force === undefined ? !S.helpOpen : force; S.paletteOpen = false; S.menuOpen = '';
    if (!S.helpOpen) { $('#overlay').innerHTML = ''; return; }
    $('#overlay').innerHTML = `<div class="modal" data-act="closeOverlay"><div class="dlg" data-stop="1"><h2>GW 통합 업무센터 사용법</h2>
<p><b>1. 오늘 할 일</b>에서 위 카드·그래프를 누르면 아래 목록이 그 기준으로 걸러집니다. 목록은 <b>기한이 가깝고 오래 기다린 순</b>입니다. 빨간 <b>긴급</b>은 최대 6건만 붙입니다.</p>
<p><b>2. 항목을 누르면</b> 오른쪽에 요약·추천·미리보기가 나옵니다. <b>처리 창에 열기</b>를 누르면 그룹웨어 원래 화면이 옆에 열리고, 그 화면의 버튼으로 결재·접수·배부·발송·답장을 합니다.</p>
<p><b>3. 연속 처리</b>를 누르면 처리할 일을 하나씩 엽니다. 처리 후 <b>처리했음 → 다음</b>을 누르면 그룹웨어에서 실제로 처리됐는지 확인해 드립니다.</p>
<p><b>4. 숨기기·미루기</b>는 이 화면에서만 감추는 개인 표시이고, <b>되돌리기</b>(Ctrl+Z)로 취소할 수 있습니다. 그룹웨어 상태는 바뀌지 않습니다.</p>
<p><b>5. 할 일 보드</b>에서 카드를 끌어 오늘·내일·이번 주로 옮기고, <b>일정 달력</b>에서 할 일을 다른 날짜로 끌어 기한을 바꿉니다.</p>
<p><b>6. Ctrl+K</b>(또는 위 검색칸)에 "배부", "A201", "새 메일", "전략경영실-1234"처럼 쓰면 바로 이동·실행합니다.</p>
<h3>용어</h3><p><span class="term">배부</span> 기관 밖에서 온 공문을 담당 부서로 나눠 보내는 일 · <span class="term">부서 접수</span> 부서로 온 문서를 담당자가 받는 일 · <span class="term">열람</span> 참고하라고 보내 준 문서 · <span class="term">발송 대기</span> 결재가 끝나 밖으로 보낼 차례인 문서 · <span class="term">근무일대체</span> 휴일 근무 대신 다른 날 쉬는 것</p>
<h3>안전</h3><p>이 화면이 자료를 읽을 때(목록·검색·미리보기)는 그룹웨어를 바꾸지 않습니다. 처리 창에 열린 그룹웨어 화면의 버튼은 실제로 처리되니 평소처럼 확인하고 누르세요. 미열람 문서를 처리 창에 열면 열람으로 기록되어 미리 물어봅니다.</p>
<h3>단축키</h3><p><kbd>J</kbd>/<kbd>K</kbd> 이동 · <kbd>Enter</kbd> 처리 창에 열기 · <kbd>X</kbd> 숨기기 · <kbd>S</kbd> 미루기 · <kbd>T</kbd> 할 일 · <kbd>F</kbd> 연속 처리 · <kbd>R</kbd> 새로고침 · <kbd>/</kbd> 검색 · <kbd>Ctrl</kbd>+<kbd>K</kbd> 명령 · <kbd>Ctrl</kbd>+<kbd>Z</kbd> 되돌리기 · <kbd>Alt</kbd>+<kbd>G</kbd> 열기·닫기 (한글 입력 상태에서도 동작)</p>
<p><button class="btn primary" data-act="closeHelp">시작하기</button></p></div></div>`;
    if (!S.settings.tourDone) { S.settings.tourDone = true; saveLocal(); }
  }
  async function openMenu(which) {
    if (S.menuOpen === which) { closeOverlay(); return; }
    S.menuOpen = which; S.paletteOpen = false; S.helpOpen = false;
    if (which === 'new') {
      $('#overlay').innerHTML = `<div class="menu" data-stop="1"><div class="mh">새로 만들기 (처리 창에 열림, 저장·발송 전까지 아무것도 남지 않음)</div><div class="mi" data-act="openUrl" data-url="${esc(GW.links.compose('plain'))}" data-title="새 메일 쓰기">✉ 새 메일 쓰기</div><div class="mh">새 기안 · 내가 자주 쓰는 양식</div><div id="formList"><div class="mi muted"><span class="spin"></span> 양식을 읽는 중…</div></div><div class="mi" data-act="openUrl" data-url="${esc(GW.links.route(GW.routes.draft))}" data-title="결재작성">전체 양식에서 고르기</div><div class="mi" data-act="openUrl" data-url="${esc(GW.links.route(GW.routes.attendanceRequest))}" data-title="근태신청">근태신청(휴가·출장·대체)</div></div>`;
      const list = await loadForms();
      const fl = $('#formList');
      if (fl) fl.innerHTML = (list || []).slice(0, 10).map(f => `<div class="mi" data-act="openUrl" data-url="${esc(f.url)}" data-title="새 기안: ${esc(f.name)}">📝 ${esc(f.name)} <span class="muted">${f.count ? `${f.count}번 사용` : '추천'}</span></div>`).join('') || '<div class="mi muted">양식이 없습니다.</div>';
    } else if (which === 'bell') {
      const items = S.activity.slice(-40).reverse();
      $('#overlay').innerHTML = `<div class="menu" data-stop="1"><div class="mh">새로 들어온 항목 (업무센터가 확인한 시각 기준)</div>${items.map(x => `<div class="mi" data-act="bellItem" data-k="${esc(x.key)}"><span class="pill ${x.priority || 'low'}">${PRI[x.priority] || '참고'}</span>${esc(x.title)}<div class="muted">${esc(x.kind)} · ${hhmm(new Date(x.at))}${x.at > S.seenActivity ? ' · 새' : ''}</div></div>`).join('') || '<div class="mi muted">아직 없습니다.</div>'}</div>`;
      S.seenActivity = Date.now(); saveLocal(); renderHead();
    }
  }
  function closeOverlay() { S.paletteOpen = false; S.helpOpen = false; S.menuOpen = ''; $('#overlay').innerHTML = ''; }
  const fontStep = n => { const order = ['s', 'm', 'l', 'xl']; const i = Math.max(0, Math.min(3, order.indexOf(S.settings.fontSize) + n)); S.settings.fontSize = order[i]; saveLocal(); applyLook(); };
  const toggleTheme = () => { S.settings.theme = S.settings.theme === 'dark' ? 'light' : 'dark'; saveLocal(); applyLook(); };

  async function findAndOpenDocNo(no, t) {
    const out = $('#docNoResult');
    if (out) out.innerHTML = '<p><span class="spin"></span> 문서를 찾는 중…</p>';
    try {
      const p = await GW.docPreview({docNo: no, title: t});
      if (p.found) { if (out) out.innerHTML = `<div class="box okb">${esc(p.title)} (${esc(p.docNo)})</div>`; if (!S.sel) S.sel = {type: 'frame', title: p.title, url: p.url}; openUrl(p.url, {title: p.title}); }
      else if (out) out.innerHTML = '<div class="box warn">통합검색에서 같은 문서번호를 찾지 못했습니다. 권한이 없거나 아직 색인되지 않은 문서일 수 있습니다.</div>'; else toast('문서를 찾지 못했습니다.');
    } catch (err) { if (out) out.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  }
  async function makeWeekly() {
    toast('최근 7일 자료를 읽는 중…');
    try {
      const [sub, hist] = await Promise.all([GW.submittedRange({days: 7, size: 100}), loadRouting()]);
      const me = S.raw.principal.name;
      const receipts = (hist ? hist.dept : []).filter(r => String(r.toEmp).replace(/\s/g, '') === String(me).replace(/\s/g, '') && String(r.date).replace(/-/g, '').slice(0, 8) >= sub.from);
      S.weekly = R.weeklyReport({submitted: sub.docs, receipts, me: `${S.raw.principal.deptName} ${me}`, from: sub.from, to: sub.to});
      saveLocal();
    } catch (err) { toast('주간 초안을 만들지 못했습니다: ' + err.message); }
    if (S.view === 'report') renderMain();
  }

  // ---------- events ----------
  root.addEventListener('click', async e => {
    const path = e.composedPath();
    const el = path.find(n => n && n.dataset && n.dataset.act);
    if (!el) return;
    const act = el.dataset.act, v = el.dataset.v;
    if (act === 'closeOverlay' && path.some(n => n && n.dataset && n.dataset.stop)) return;
    if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
    if (S.menuOpen && !path.some(n => n && n.dataset && n.dataset.stop) && !['menuNew', 'menuBell'].includes(act)) closeOverlay();
    switch (act) {
      case 'refresh': refresh(); break;
      case 'applyRefresh': S.pendingRefresh = false; render(); break;
      case 'relogin': location.reload(); break;
      case 'close': close(); break;
      case 'view': go(v); break;
      case 'help': toggleHelp(); break;
      case 'closeHelp': case 'closeOverlay': closeOverlay(); break;
      case 'menuNew': openMenu('new'); break;
      case 'menuBell': openMenu('bell'); break;
      case 'bellItem': closeOverlay(); go('today'); selectAction(el.dataset.k); break;
      case 'fsUp': fontStep(1); break;
      case 'fsDown': fontStep(-1); break;
      case 'theme': toggleTheme(); break;
      case 'palRun': { const c = palItems[Number(el.dataset.i)]; closeOverlay(); if (c) c.run(); break; }
      case 'tileLevel': S.filter.level = S.filter.level === v ? 'all' : v; S.filter.area = 'all'; renderMain(); break;
      case 'tileArea': S.filter.area = S.filter.area === v ? 'all' : v; S.filter.level = 'all'; renderMain(); break;
      case 'goApproval': if (v) S.apTab = v; go('approval'); break;
      case 'goCalendar': go('calendar'); break;
      case 'goBudgetCode': go('budget'); break;
      case 'goAttendanceDay': S.att.day = v; if (S.att.month !== v.slice(0, 6)) { S.att.rows = null; S.att.month = v.slice(0, 6); } go('attendance'); break;
      case 'selDeadline': if (el.dataset.k && S.a.actions.some(x => x.key === el.dataset.k)) { go('today'); selectAction(el.dataset.k); } else { S.search.kw = relatedQ(el.dataset.title); runSearch(); } break;
      case 'area': S.filter.area = v; renderMain(); break;
      case 'level': S.filter.level = v; renderMain(); break;
      case 'onlyNew': S.filter.onlyNew = !S.filter.onlyNew; renderMain(); break;
      case 'showHidden': S.filter.showHidden = !S.filter.showHidden; renderMain(); break;
      case 'multi': {
        e.stopPropagation();
        const k = el.dataset.k;
        if (e.shiftKey && S.lastClickKey) { const q = queue().map(x => x.key); const a = q.indexOf(S.lastClickKey), b = q.indexOf(k); if (a >= 0 && b >= 0) for (const kk of q.slice(Math.min(a, b), Math.max(a, b) + 1)) S.multi.add(kk); }
        else if (S.multi.has(k)) S.multi.delete(k); else S.multi.add(k);
        S.lastClickKey = k; refreshQueue(); return;
      }
      case 'selAction': if (path.some(n => n && n.tagName === 'INPUT')) return; selectAction(el.dataset.k); break;
      case 'quickOpen': e.stopPropagation(); { const x = S.a.actions.find(a => a.key === el.dataset.k); if (x) { selectAction(x.key); openItem(x); } } break;
      case 'quickHide': e.stopPropagation(); hide([el.dataset.k]); break;
      case 'quickSnooze': e.stopPropagation(); snooze([el.dataset.k]); break;
      case 'quickTodo': e.stopPropagation(); { const x = S.a.actions.find(a => a.key === el.dataset.k); if (x) addTodo(x.title, x.deadline && x.deadline.date || '', x.kind, x.url, x.key); } break;
      case 'batchHide': hide([...S.multi]); break;
      case 'batchSnooze': snooze([...S.multi]); break;
      case 'batchTodo': { const keys = [...S.multi]; pushUndo(`${keys.length}건 할 일로`); for (const k of keys) { const x = S.a.actions.find(a => a.key === k); if (x) { S.todos.unshift({id: uid(), title: x.title, due: x.deadline && x.deadline.date || '', status: 'todo', source: x.kind, url: x.url, at: Date.now()}); S.plan[k] = S.plan[k] || 'today'; } } S.multi.clear(); saveLocal(); refreshQueue(); toastUndo(`${keys.length}건을 할 일에 넣었습니다.`); break; }
      case 'batchCsv': { const rows = S.a.actions.filter(x => S.multi.has(x.key)); download(`선택항목_${today()}.csv`, R.toCsv(rows, csvCols), 'text/csv;charset=utf-8'); break; }
      case 'batchFocus': startFocus([...S.multi]); S.multi.clear(); break;
      case 'batchClear': S.multi.clear(); refreshQueue(); break;
      case 'focusStart': startFocus(); break;
      case 'focusList': { const l = S.a.approval.lists[S.apTab]; startFocus(((l && l.docs) || []).map(d => `doc:${S.apTab}:${d.docId}`).filter(k => S.a.actions.some(a => a.key === k))); break; }
      case 'focusNext': focusNext(true); break;
      case 'focusSkip': if (S.focus) { S.focus.results[S.focus.keys[S.focus.i]] = 'skip'; if (S.focus.i >= S.focus.keys.length - 1) finishFocus(); else { S.focus.i++; focusOpen(); } } break;
      case 'focusPrev': focusPrev(); break;
      case 'focusStop': stopFocus(); break;
      case 'apTab': S.apTab = v; renderMain(); break;
      case 'apMore': { const l = S.a.approval.lists[S.apTab]; const have = l.docs.length + (S.apMore[S.apTab] || []).length; try { const r = await GW.approvalPage(S.apTab, Math.floor(have / 30) + 1); S.apMore[S.apTab] = [...(S.apMore[S.apTab] || []), ...r.docs.filter(d => !l.docs.some(x => x.docId === d.docId))]; } catch (err) { toast(err.message); } renderMain(); break; }
      case 'selDoc': S.sel = {type: 'doc', kind: el.dataset.kind, docId: el.dataset.id}; S.pane.url = ''; S.pane.extract = null; S.pane.preview = null; renderMain(); renderPane(); break;
      case 'reloadRouting': toast('배부·접수 이력을 읽는 중…'); await loadRouting(true); render(); break;
      case 'mailFilter': S.mailFilter = v; renderMain(); break;
      case 'mailGroup': S.mailGroup = !S.mailGroup; renderMain(); break;
      case 'selMail': S.sel = {type: 'mail', box: el.dataset.box, uid: el.dataset.uid}; S.pane.url = ''; renderMain(); renderPane(); break;
      case 'selMailSearch': { const it = (S.mailSearch.res && S.mailSearch.res.groups.mail.items || []).find(x => x.uid === el.dataset.uid); if (it) { S.sel = {type: 'search', item: it}; S.pane.url = ''; renderPane(); } break; }
      case 'clearMailSearch': S.mailSearch = {kw: '', res: null}; renderMain(); break;
      case 'stype': S.search.types = S.search.types.includes(v) ? S.search.types.filter(t => t !== v) : [...S.search.types, v]; renderMain(); break;
      case 'doSearch': S.search.kw = ($('#sq') || {}).value?.trim() || S.search.kw; S.search.period = ($('#speriod') || {}).value || ''; runSearch(); break;
      case 'searchMore': { const t = el.dataset.t; const s = S.search; const g = s.res.groups[t]; const page = (s.more[t] || 1) + 1; try { const r = await GW.search(s.kw, {types: [t], pageSize: 10, page, from: periodFrom(s.period)}); const add = r.groups[t].items; g.items = [...g.items, ...add]; s.more[t] = page; } catch (err) { toast(err.message); } renderMain(); break; }
      case 'selSearch': { const g = S.search.res && S.search.res.groups[el.dataset.t]; const it = g && g.items.find(x => (x.docId || x.uid || x.id || x.fileId) === el.dataset.id); if (it) { S.sel = {type: 'search', item: it}; S.pane.url = ''; S.pane.extract = null; renderMain(); renderPane(); } break; }
      case 'related': S.search.kw = el.dataset.q; runSearch(['doc', 'board', 'mail', 'file']); break;
      case 'openUrl': closeOverlay(); openUrl(el.dataset.url, {title: el.dataset.title || el.textContent.trim(), unread: el.dataset.unread === '1'}); break;
      case 'copy': copyText(v); break;
      case 'paneExpand': S.pane.expanded = !S.pane.expanded; renderPane(); break;
      case 'closePane': if (S.focus) stopFocus(); S.sel = null; S.pane.url = ''; S.pane.expanded = false; render(); break;
      case 'todoFromSel': { const t = selInfo(); const x = selectedAction(); addTodo(t.title, x && x.deadline && x.deadline.date || '', x ? x.kind : '업무센터 항목', t.url, x ? x.key : ''); break; }
      case 'todoFromExtract': { const nx = S.pane.extract && R.nextDeadline(S.pane.extract.deadlines); const t = selInfo(); if (nx) addTodo(t.title, nx.date, '원문 기한 자동 추출', t.url); break; }
      case 'boardCard': { const k = el.dataset.k; if (path.some(n => n && n.tagName === 'BUTTON')) break; if (k.startsWith('todo:')) { const t = S.todos.find(x => `todo:${x.id}` === k); if (t && t.url) { S.sel = {type: 'frame', title: t.title, url: t.url}; openUrl(t.url, {title: t.title}); } } else { go('today'); selectAction(k); } break; }
      case 'addTodo': addTodoFromInput(); break;
      case 'todoDel': { const t = S.todos.find(x => x.id === el.dataset.id); if (!t) break; pushUndo('할 일 삭제'); S.todos = S.todos.filter(x => x.id !== t.id); delete S.plan[`todo:${t.id}`]; saveLocal(); renderMain(); renderNav(); toastUndo(`"${t.title.slice(0, 20)}" 할 일을 지웠습니다.`); break; }
      case 'todoEdit': { const t = S.todos.find(x => x.id === el.dataset.id); if (!t) break; const nt = prompt('할 일 내용', t.title); if (nt === null) break; const nd = prompt('기한 (YYYY-MM-DD, 비우면 없음)', t.due || ''); pushUndo('할 일 고치기'); t.title = nt.trim() || t.title; t.due = /^\d{4}-\d{2}-\d{2}$/.test((nd || '').trim()) ? nd.trim() : ''; saveLocal(); renderMain(); break; }
      case 'calPrev': S.cal.offset--; renderMain(); break;
      case 'calNext': S.cal.offset++; renderMain(); break;
      case 'calToday': S.cal.offset = 0; renderMain(); break;
      case 'calItem': if (el.dataset.k && S.a.actions.some(x => x.key === el.dataset.k)) { go('today'); selectAction(el.dataset.k); } else if (el.dataset.url) openUrl(el.dataset.url, {title: el.textContent.trim()}); break;
      case 'loadBudget': S.budget.project = $('#bcode').value.trim(); S.budget.filter = $('#bfilter').value.trim(); if (!S.budget.project) { toast('프로젝트 코드를 입력하세요.'); break; } loadBudget(); break;
      case 'ledger': loadLedger(el.dataset.code); break;
      case 'loadMonthly': loadMonthly(); break;
      case 'budgetMonth': { const m = S.budget.month === v ? '' : v; if (!S.budget.ledger || S.budget.ledger.bgtCd !== '__ALL') { await loadLedgerAll(); } S.budget.month = m; renderMain(); break; }
      case 'ledgerAll': loadLedgerAll(); break;
      case 'budgetMonthClear': S.budget.month = ''; renderMain(); break;
      case 'ledgerRow': { const r = S.budget.ledger.rows[Number(el.dataset.i)]; S.sel = {type: 'ledger', row: r}; S.pane.url = ''; renderPane(); break; }
      case 'findDocNo': findAndOpenDocNo(el.dataset.no, el.dataset.t); break;
      case 'csvBudget': { const t = S.budget.table; download(`예산_${t.project}_${today()}.csv`, R.toCsv(t.rows, [{label: '구분', key: 'level'}, {label: '코드', key: 'code'}, {label: '과목', key: 'name'}, {label: '예산', key: 'budget'}, {label: '집행', key: 'executed'}, {label: '잔액', key: 'balance'}, {label: '집행률(%)', key: 'rate'}]), 'text/csv;charset=utf-8'); break; }
      case 'richBudget': { const t = S.budget.table; const html = `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-size:10pt"><tr><th>과목</th><th>예산</th><th>집행</th><th>잔액</th><th>집행률</th></tr>${t.rows.map(r => `<tr><td>${esc(r.level)} ${esc(r.name)}</td><td align="right">${won(r.budget)}</td><td align="right">${won(r.executed)}</td><td align="right">${won(r.balance)}</td><td align="right">${pct(r.rate)}</td></tr>`).join('')}</table>`; copyRich(html, t.rows.map(r => `${r.level} ${r.name}\t${won(r.budget)}\t${won(r.executed)}\t${won(r.balance)}\t${pct(r.rate)}`).join('\n')); break; }
      case 'csvLedger': { const l = S.budget.ledger; download(`결의내역_${l.bgtCd}_${today()}.csv`, R.toCsv(l.rows, [{label: '결의일', value: r => ymd8(r.date)}, {label: '적요', key: 'desc'}, {label: '금액', key: 'amount'}, {label: '문서번호', key: 'docNo'}, {label: '작성', key: 'writer'}, {label: '전표', key: 'slip'}]), 'text/csv;charset=utf-8'); break; }
      case 'attMonth': loadAttendance(v); break;
      case 'attDay': S.att.day = S.att.day === v ? '' : v; renderMain(); break;
      case 'csvAtt': download(`근태_${S.att.month}.csv`, R.toCsv(S.att.rows, [{label: '날짜', value: r => ymd8(r.date)}, {label: '근무유형', key: 'workType'}, {label: '출결', key: 'result'}, {label: '근태항목', key: 'item'}, {label: '상태', key: 'status'}, {label: '출근', value: r => hm4(r.come)}, {label: '퇴근', value: r => hm4(r.leave)}, {label: '인정(분)', key: 'recognizedMin'}]), 'text/csv;charset=utf-8'); break;
      case 'dlBrief': download(`그룹웨어_브리핑_${today()}.html`, R.renderHtml(S.a), 'text/html;charset=utf-8'); break;
      case 'printBrief': { const w = window.open('', '_blank'); if (w) { w.document.write(R.renderHtml(S.a)); w.document.close(); setTimeout(() => w.print(), 400); } break; }
      case 'richBrief': copyRich(briefHtml(), R.renderMarkdown(S.a)); break;
      case 'csvQueue': download(`할일목록_${today()}.csv`, R.toCsv(queue(), csvCols), 'text/csv;charset=utf-8'); break;
      case 'mkWeekly': makeWeekly(); break;
      case 'cpWeekly': copyText(S.weekly); break;
      case 'richWeekly': copyRich(weeklyHtml(S.weekly), S.weekly); break;
      case 'dlWeekly': download(`주간업무실적_${today()}.txt`, S.weekly); break;
      case 'budgetRowAdd': S.settings.budget.push({project: '', filter: '', label: ''}); renderMain(); break;
      case 'budgetRowDel': S.settings.budget.splice(Number(el.dataset.i), 1); renderMain(); break;
      case 'saveSettings': {
        const st = S.settings;
        st.refreshMin = Number($('#setRefresh').value);
        st.notify = $('#setNotify').checked;
        if (st.notify && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
        st.fontSize = $('#setFs').value; st.theme = $('#setTheme').value; st.beginner = $('#setBeginner').checked;
        const rows = {};
        root.querySelectorAll('#budgetRows input').forEach(i => { (rows[i.dataset.i] = rows[i.dataset.i] || {})[i.dataset.b] = i.value.trim(); });
        st.budget = Object.values(rows).filter(b => /^[A-Za-z0-9가-힣]+$/.test(b.project || '')).map(b => ({project: b.project, filter: b.filter || '', label: b.label || ''}));
        if (!st.budget.length) st.budget = DEFAULT_SETTINGS.budget;
        st.urgentWords = $('#setWords').value.split(',').map(w => w.trim()).filter(Boolean);
        st.mailCount = Number($('#setMail').value);
        saveLocal(); schedule(); applyLook(); toast('설정을 저장했습니다.'); S.budget.table = null; refresh(); break;
      }
      case 'resetDone': pushUndo('표시 초기화'); S.hidden = {}; S.snooze = {}; S.plan = {}; saveLocal(); render(); toastUndo('숨기기·미루기·보드 계획을 지웠습니다.'); break;
      case 'resetRouting': S.routing = null; store.del('routing'); toast('추천 이력을 지웠습니다.'); break;
      case 'tourAgain': S.settings.tourDone = false; saveLocal(); toggleHelp(true); break;
      case 'resetAll': if (confirm('이 브라우저에 저장된 업무센터 설정·할 일·표시를 모두 지울까요? (그룹웨어 자료는 바뀌지 않습니다)')) { for (const k of Object.keys(localStorage)) if (k.startsWith(LS) && k !== LS + 'src') localStorage.removeItem(k); S.hidden = {}; S.snooze = {}; S.plan = {}; S.todos = []; S.newKeys.clear(); S.activity = []; S.history = []; S.settings = {...DEFAULT_SETTINGS}; S.routing = null; S.forms = null; applyLook(); render(); } break;
      case 'toastUndo': undo(); root.querySelector('.toast')?.remove(); break;
      default: break;
    }
  });
  const csvCols = [{label: '우선순위', value: x => PRI[x.priority]}, {label: '점수', key: 'score'}, {label: '영역', key: 'area'}, {label: '구분', key: 'kind'}, {label: '제목', key: 'title'}, {label: '내용', key: 'detail'}, {label: '기한', value: x => x.deadline ? x.deadline.date : ''}, {label: '일시', key: 'when'}];

  // IME-safe inputs: update only the list, never rebuild the input while typing.
  root.addEventListener('input', e => {
    const t = e.composedPath()[0];
    if (t.id === 'qfilter') { S.filter.q = t.value; if (!e.isComposing) refreshQueue(); }
    else if (t.id === 'bq') { S.budget.q = t.value; }
    else if (t.id === 'weekly') { S.weekly = t.value; store.set('weekly', S.weekly); }
    else if (t.id === 'palq') palRender(t.value);
  });
  root.addEventListener('compositionend', e => { const t = e.composedPath()[0]; if (t.id === 'qfilter') { S.filter.q = t.value; refreshQueue(); } });
  root.addEventListener('change', e => {
    const t = e.composedPath()[0];
    if (t.id === 'bproj' && t.value !== '__custom') { const [p, f] = t.value.split('|'); S.budget.project = p; S.budget.filter = f; loadBudget(); }
    if (t.id === 'bq') renderMain();
  });
  root.addEventListener('keyup', e => { const t = e.composedPath()[0]; if (t.id === 'bq' && !e.isComposing && e.key === 'Enter') renderMain(); });
  // Drag & drop: board columns and calendar dates.
  root.addEventListener('dragstart', e => { const n = e.composedPath().find(x => x && x.dataset && x.dataset.drag); if (n) { e.dataTransfer.setData('text/plain', n.dataset.drag); e.dataTransfer.effectAllowed = 'move'; } });
  root.addEventListener('dragover', e => { const z = e.composedPath().find(x => x && x.dataset && (x.dataset.drop || x.dataset.dropDate)); if (z) { e.preventDefault(); z.classList.add('drop'); } });
  root.addEventListener('dragleave', e => { const z = e.composedPath().find(x => x && x.dataset && (x.dataset.drop || x.dataset.dropDate)); if (z) z.classList.remove('drop'); });
  root.addEventListener('drop', e => {
    const z = e.composedPath().find(x => x && x.dataset && (x.dataset.drop || x.dataset.dropDate));
    if (!z) return;
    e.preventDefault(); z.classList.remove('drop');
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    if (z.dataset.drop) dropTo(id, z.dataset.drop);
    else if (z.dataset.dropDate && id.startsWith('todo:')) { const t = S.todos.find(x => `todo:${x.id}` === id); if (t) { pushUndo('기한 변경'); t.due = z.dataset.dropDate; delete S.plan[id]; saveLocal(); renderMain(); toastUndo(`기한을 ${t.due.slice(5)}로 바꿨습니다.`); } }
  });
  // Resizable pane.
  const split = $('#split');
  split.addEventListener('mousedown', e => {
    e.preventDefault(); split.classList.add('drag');
    const shield = document.createElement('div'); shield.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:col-resize'; document.body.append(shield);
    const move = ev => { S.settings.paneWidth = Math.max(360, Math.min(window.innerWidth * 0.75, window.innerWidth - ev.clientX)); applyLook(); };
    const up = () => { split.classList.remove('drag'); shield.remove(); document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true); saveLocal(); };
    document.addEventListener('mousemove', move, true); document.addEventListener('mouseup', up, true);
  });

  let toastTimer = null;
  function toast(msg, withUndo = false) {
    let t = root.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; wcEl.append(t); }
    t.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button data-act="toastUndo">되돌리기</button>' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), withUndo ? 6000 : 3800);
  }
  const toastUndo = msg => toast(msg, true);

  // ---------- lifecycle ----------
  let prevTitle = document.title;
  function open() {
    S.open = true; host.style.display = 'block'; fab.style.display = 'none'; prevTitle = document.title;
    applyLook(); render();
    if (document.activeElement && document.activeElement !== document.body) { try { document.activeElement.blur(); } catch {} }
    if (!S.a || !S.lastRefresh || Date.now() - S.lastRefresh.getTime() > 60_000) refresh();
    if (!S.settings.tourDone) setTimeout(() => toggleHelp(true), 600);
  }
  function close() { S.open = false; host.style.display = 'none'; fab.style.display = 'block'; document.title = prevTitle; closeOverlay(); }
  function destroy() { clearInterval(timer); document.removeEventListener('keydown', onDocKey, true); window.removeEventListener('resize', onResize); host.remove(); fab.remove(); }
  schedule();
  return {open, close, destroy, refresh,
    state: () => ({booted: true, open: S.open, view: S.view, loading: S.loading, error: S.error, actions: S.a ? S.a.actions.length : 0, high: S.a ? S.a.summary.high : 0, focus: S.focus ? {i: S.focus.i, n: S.focus.keys.length} : null, lastRefresh: S.lastRefresh}),
    debug: () => ({view: S.view, sel: S.sel, paneUrl: S.pane.url, mounted: S.pane.mounted, multi: [...S.multi], todos: S.todos.length, plan: Object.keys(S.plan).length, hidden: Object.keys(S.hidden).length, undo: S.undo.length})};
  }
})();
