import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const read = f => readFile(new URL('../src/live/' + f, import.meta.url), 'utf8');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function notifications(items) {
  const source = await read('wc/38-notifications-people.js');
  const context = vm.createContext({URL, location:{href:'https://gw.example/#/', origin:'https://gw.example'}, currentKey:'A', getUserKey:() => 'A', S:{view:'notifications'}, GW:{}, esc, ic:() => '',
    pgh:(t, s = '', a = '') => `<div class="pgh"><h1>${t}</h1>${s}${a}</div>`, renderMain(){}, toast(){}, openUrl(){}, root:{querySelectorAll:() => []}, $:() => null});
  vm.runInContext(source + '\nglobalThis.api = {NTF, vNotifications, notificationTime};', context);
  context.api.NTF.items = items;
  return context.api;
}

test('통합알림: 하이픈·점·숫자 날짜를 같은 날로 묶고 최신순, 날짜 미상은 맨 뒤 한 묶음', async () => {
  const api = await notifications([
    {title:'메일 A', time:'202611200157', type:'MAIL', read:true},
    {title:'결재 B', head:'[결재진행] 결재자:이승봉', time:'2026-11-20 08:46', type:'EAPPROVAL'},
    {title:'모름 C', time:'', type:'BOARD'},
    {title:'배부 D', time:'2026.11.19 18:29', type:'EAPPROVAL'},
    {title:'발송 E', time:'2026-11-19 15:28', type:'EAPPROVAL'},
  ]);
  assert.equal(api.notificationTime('2026-11-20 08:46'), '2026.11.20 08:46');
  assert.equal(api.notificationTime('2026-1-5'), '2026.01.05');
  const html = api.vNotifications();
  const days = [...html.matchAll(/<h2 class="ntf-day">([^<]+)<\/h2>/g)].map(m => m[1]);
  assert.deepEqual(days, ['2026.11.20', '2026.11.19', '날짜 미상']);
  const titles = [...html.matchAll(/<\/i>([^<]+)<\/b>/g)].map(m => m[1]);
  assert.deepEqual(titles, ['결재 B', '메일 A', '배부 D', '발송 E', '모름 C']);
  assert.match(html, /\[결재진행\] 결재자:이승봉/, '제목과 다른 머리말은 보조 줄에 남는다');
  assert.doesNotMatch(html, /class="card2"/, '알림은 상자가 아니라 한 줄 목록');
  assert.match(html, /class="vh">읽음 · /, '읽음 상태는 낭독기용 글자로 남는다');
});

test('메일 목록 미리보기는 전화번호 가운데 자리를 가린다(본문은 그대로)', async () => {
  const src = await read('wc/08-approval-mail.js');
  const line = src.split('\n').find(l => l.includes('const cleanPreview ='));
  const cleanPreview = vm.runInNewContext(line.trim().replace(/^const cleanPreview = /, '').replace(/;$/, ''));
  assert.equal(cleanPreview('연락처 010-1234-5678 입니다'), '연락처 010-****-5678 입니다');
  assert.equal(cleanPreview('사무실 032.123.4567'), '사무실 032-***-4567');
  assert.equal(cleanPreview('문서번호 2026-11201 · 금액 1,234,567원'), '문서번호 2026-11201 · 금액 1,234,567원');
});

test('화면 제목은 왼쪽 메뉴 이름과 같고, 하위 탭은 제목 아래에 놓인다', async () => {
  const views = await read('wc/05-views.js');
  assert.match(views, /el\.innerHTML = fn\(\);/);
  assert.match(views, /querySelector\(':scope > \.pgh'\)[\s\S]{0,80}insertAdjacentHTML\('afterend', vt\)/);
  const labels = {'09-search-board.js':"pgh('검색·문서'", '35-docs.js':"pgh('검색·문서'", '12-report-settings.js':"pgh('보고·현황'", '07-charts.js':"pgh('보고·현황'", '10-calendar-budget.js':"pgh('일정·예약'", '28-gcal.js':"pgh('일정·예약'", '34-gsync.js':"pgh('일정·예약'", '24-resource.js':"pgh('일정·예약'", '38-notifications-people.js':"pgh('조직·사람'"};
  for (const [f, needle] of Object.entries(labels)) assert.ok((await read('wc/' + f)).includes(needle), f + ' 제목');
  const css = await read('wc.css');
  assert.doesNotMatch(css, /#194957|#d8eeed|#b2e6d8/, '홈 강조면은 테마 토큰만 쓴다');
  assert.doesNotMatch(css, /font-size:\s*1[2-5]\.5px/, '반 픽셀 글자 단계는 쓰지 않는다');
});
