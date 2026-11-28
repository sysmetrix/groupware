import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {contractCheck, contractCheckOnDemand} from '../src/live/contract.mjs';

const read = p => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('P2-6: background.js가 chrome.storage.session으로 작업 탭을 추적하고 고아 탭을 정리한다', async () => {
  const bg = await read('src/live/ext/background.js');
  assert.match(bg, /SESSION_TABS_KEY = 'gcalWorkerTabs'/);
  assert.match(bg, /function trackTab\(id, add\)/);
  assert.match(bg, /async function cleanupOrphanTabs\(force = false\)/);
  assert.match(bg, /busy = true;\s*try \{\s*await cleanupOrphanTabs\(true\);/);
  assert.match(bg, /onStartup\.addListener/);
  assert.match(bg, /await trackTab\(tab\.id, true\)/);
  assert.match(bg, /await trackTab\(id, false\)/);
});

test('P2-6: chatNav가 자원 예약 날짜·시간 프리필 딥링크(,YYYYMMDD,HH:MM-HH:MM)를 지원한다', async () => {
  const ui = await read('src/live/wc/30-chat-ui.js');
  assert.match(ui, /if \(view === 'resource' && \/\^,\\d\{8\}\(\?:,\\d\{2\}:\\d\{2\}-\\d\{2\}:\\d\{2\}\)\?\$\/\.test\(param/);
  assert.match(ui, /if \(tm && rs\.form\) \{ const \[s, e\] = tm\.split\('-'\);/);
});

test('P2-3: contractCheck 근태 days·month 보강 및 contractCheckOnDemand 5종 검증', () => {
  const badAtt = contractCheck({data: {attendance: {today: {date: '20261129'}, days: [{}, {}, {}], month: {recognizedMin: 'bad'}}}});
  assert.equal(badAtt.ok, false);
  assert.ok(badAtt.issues.some(i => i.where === '일별 근태'));
  assert.ok(badAtt.issues.some(i => i.where === '월 근무시간'));

  assert.equal(contractCheckOnDemand('cardUsage', {rows: [{date: '20261128', place: 'A', amount: 1000}, {date: '20261127', place: 'B', amount: 2000}, {date: '20261126', place: 'C', amount: 3000}]}).ok, true);
  assert.equal(contractCheckOnDemand('cardUsage', {rows: [{}, {}, {}]}).ok, false);
  assert.equal(contractCheckOnDemand('etaxInvoices', {rows: [{}, {}, {}]}).ok, false);
  assert.equal(contractCheckOnDemand('resourceList', [{}, {}, {}]).ok, false);
  assert.equal(contractCheckOnDemand('todoList', {todos: [{}, {}, {}]}).ok, false);
  assert.equal(contractCheckOnDemand('search', {}).ok, false);
  assert.equal(contractCheckOnDemand('search', {groups: {}}).ok, true);
});

test('P2-5: 외부 FAB 기관 청록 브랜드·12px+ 폰트 및 모달 포커스 트랩·메뉴 화살표 탐색', async () => {
  const shell = await read('src/live/wc/02-shell.js');
  const ov = await read('src/live/wc/15-overlays-palette-help-menus.js');
  assert.doesNotMatch(shell, /#6366f1|#a5b4ff|13\.5px|12\.5px|font:[^;]*11px/);
  assert.match(shell, /#16667c/);
  assert.match(ov, /<div class="menu new-menu" role="menu"/);
  assert.match(ov, /<div class="menu" role="menu" aria-label="보기 및 도구"/);
  assert.match(ov, /if \(e\.key === 'Tab'\)/);
  assert.match(ov, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]/);
});
