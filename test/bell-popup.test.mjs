import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL('../src/live/' + p, import.meta.url), 'utf8');

// 38-notifications-people.js에서 종 팝업에 필요한 함수만 떼어 VM에서 돌린다.
function load(items, {at = new Date().toISOString(), error = ''} = {}) {
  const src = read('wc/38-notifications-people.js');
  const cut = (start, end) => { const a = src.indexOf(start), b = src.indexOf(end, a); assert.ok(a >= 0 && b > a, start); return src.slice(a, b); };
  const code = [
    "const NTF = {items: null, loading: false, error: '', filter: 'all', type: 'all', query: '', search: '', page: 1, at: '', seq: 0};",
    cut('  const notificationLabel', '  async function loadNotifications'),
    cut('  function notificationUrl', '  function vNotifications'),
    cut('  let ntfPopBusy', '  function ntfPopDraw'),
    'this.NTF = NTF; this.ntfPopHtml = ntfPopHtml;'
  ].join('\n');
  const ctx = vm.createContext({URL, location: {href: 'https://gw.example/#/', origin: 'https://gw.example'}, esc: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), hhmm: d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')});
  vm.runInContext(code, ctx);
  ctx.NTF.items = items; ctx.NTF.at = items ? at : ''; ctx.NTF.error = error;
  return ctx;
}
const alert = (n, read, extra = {}) => ({type: 'MAIL', title: '알림 ' + n, time: '2026112' + (n % 10) + '0900', read, ...extra});

test('종 팝업: 안 읽은 알림을 먼저 최신순으로 보이고 숫자를 머리에 적는다', () => {
  const ctx = load([alert(1, true), alert(3, false), alert(2, false, {type: 'EAPPROVAL', url: '/#/popup?x=1'}), alert(4, true)]);
  const html = ctx.ntfPopHtml();
  assert.match(html, /role="dialog" aria-label="통합알림 미리보기"/);
  assert.match(html, /안 읽음 2건/);
  assert.ok(html.indexOf('알림 3') < html.indexOf('알림 2'), '최신 안 읽음이 먼저');
  assert.ok(html.indexOf('안 읽음</div>') < html.indexOf('최근 알림</div>'));
  // 원문 주소가 있으면 원문 열기, 없으면 그룹웨어 알림 목록
  assert.match(html, /data-act="bellOpen" data-i="2"/);
  assert.match(html, /data-act="nativeNotifications"/);
  // 5건까지 채움: 안 읽음 2 + 최근 2(전체가 4건)
  assert.equal((html.match(/class="ntf-pi/g) || []).length, 4);
  assert.match(html, /data-act="bellAll" data-v="unread"/);
});

test('종 팝업: 안 읽은 알림은 8건까지만 보이고 나머지 수를 알려 준다', () => {
  const ctx = load(Array.from({length: 11}, (_, i) => alert(i, false)));
  const html = ctx.ntfPopHtml();
  assert.equal((html.match(/class="ntf-pi unread/g) || []).length, 8);
  assert.match(html, /안 읽음 3건 더/);
  assert.doesNotMatch(html, /최근 알림<\/div>/);
});

test('종 팝업: 모두 읽었으면 새 알림 없음, 아직 못 읽었으면 읽는 중, 실패하면 다시 시도', () => {
  const read = load([alert(1, true)]).ntfPopHtml();
  assert.match(read, /새 알림이 없습니다/); assert.match(read, /모두 읽음/); assert.match(read, /data-act="bellAll" data-v="all"/);
  assert.match(load(null).ntfPopHtml(), /그룹웨어 알림을 읽고 있습니다/);
  assert.match(load(null, {error: '네트워크'}).ntfPopHtml(), /알림을 불러오지 못했습니다[\s\S]*data-act="bellRefresh"/);
});

test('종 팝업: 종 버튼·이벤트·닫기 연결', () => {
  assert.match(read('wc/02-shell.js'), /data-act="menuBell" id="bell"[^>]*aria-haspopup="dialog" aria-expanded="false"/);
  const ev = read('wc/16-events.js');
  for (const act of ['bellOpen', 'bellAll', 'bellRefresh']) assert.match(ev, new RegExp(`case '${act}':`));
  assert.doesNotMatch(ev, /case 'bellItem'/);
  const ov = read('wc/15-overlays-palette-help-menus.js');
  assert.match(ov, /which === 'bell'[\s\S]*ntfPopHtml\(\)[\s\S]*ntfPopRefresh\(false\)/);
  assert.match(ov, /function closeOverlay\(\) \{\s*[^\n]*\$\('#bell'\)\?\.setAttribute\('aria-expanded', 'false'\)/);
});
