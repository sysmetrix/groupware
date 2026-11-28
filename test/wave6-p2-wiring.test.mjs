import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = p => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('P2-6 실효 완결: manifest.json에 storage 권한 포함 및 비차량 예약 딥링크 연결', async () => {
  const build = await read('scripts/live-build.mjs');
  const readTools = await read('src/live/wc/32-chat-tools-read.js');
  assert.match(build, /permissions: \['scripting', 'storage'\]/);
  assert.match(readTools, /view: 'resource', \.\.\.\(dIso \? \{v: `,\$\{dIso\.replace\(\/-\/g, ''\)\}`\} : \{\}\)/);
});

test('P2-3 실효 완결: contractCheckOnDemand가 카드·세금계산서·ToDo 화면에 실제 연결되어 있다', async () => {
  const card = await read('src/live/wc/56-budget-card.js');
  const etax = await read('src/live/wc/58-budget-etax.js');
  const todo = await read('src/live/wc/51-todo.js');
  assert.match(card, /R\.contractCheckOnDemand\('cardUsage', d\)/);
  assert.match(etax, /R\.contractCheckOnDemand\('etaxInvoices', d\)/);
  assert.match(todo, /R\.contractCheckOnDemand\('todoList', r\)/);
});

test('P2-5 실효 완결: 공용 askConfirm 커스텀 모달 도입 및 aiForget·autoDel·tdMigrateSkip 적용', async () => {
  const ov = await read('src/live/wc/15-overlays-palette-help-menus.js');
  const ai = await read('src/live/wc/23-ai.js');
  const auto = await read('src/live/wc/37-automation.js');
  const tv = await read('src/live/wc/55-todo-views.js');
  assert.match(ov, /function askConfirm\(title, message/);
  assert.match(ai, /await askConfirm\('API 키 지우기'/);
  assert.match(auto, /await askConfirm\('자동화 삭제'/);
  assert.match(tv, /await askConfirm\('예전 할 일 지우기'/);
});
