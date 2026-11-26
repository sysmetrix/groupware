import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = path.join(root, 'scripts', '90-menu-smoke.browser.js');
const viewsPath = path.join(root, 'src', 'live', 'wc', '05-views.js');
// v1.23: 홈 다음에 핵심 4(할 일·일정·예약·근태·연차·예산 집행), 그 뒤에 문서·소통(결재·메일·찾기·보고)과 설정. 배열 순서 = Alt+숫자 순서.
const sidebar = ['home', 'today', 'calendar', 'attendance', 'budget', 'approval', 'search', 'report', 'settings'];
const subtabs = ['mail', 'notifications', 'mytodo', 'board', 'resource', 'gcal', 'gsync', 'docs', 'people', 'overview'];

test('work90 menu smoke is syntactically valid and read-only', async () => {
  const source = await fs.readFile(scriptPath, 'utf8');
  assert.doesNotThrow(() => new vm.Script(source, {filename: '90-menu-smoke.browser.js'}));
  for (const id of [...sidebar, ...subtabs]) assert.match(source, new RegExp(`['\"]${id}['\"]`), `${id} contract missing`);
  for (const required of ['aria-current', 'aria-selected', "querySelector('h1')", 'page error events', 'no visible error']) assert.ok(source.includes(required), `${required} check missing`);
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'localStorage.', 'sessionStorage.', 'data-act="refresh"', 'submit', 'delete', 'remove(', 'window.open']) {
    assert.ok(!source.includes(forbidden), `read-only smoke must not contain ${forbidden}`);
  }
});

test('work90 menu smoke matches the 9 sidebar and ten embedded-view contracts', async () => {
  const views = await fs.readFile(viewsPath, 'utf8');
  const declared = [...views.matchAll(/\{id: '([^']+)', label: '([^']+)'\}/g)].map(match => match[1]);
  const parentBlock = views.match(/const VIEW_PARENT = \{([^}]+)\}/)?.[1] ?? '';
  const parents = Object.fromEntries([...parentBlock.matchAll(/(\w+): '([^']+)'/g)].map(match => [match[1], match[2]]));
  const visibleSidebar = declared.filter(id => !parents[id]);
  assert.deepEqual(visibleSidebar, sidebar);
  assert.deepEqual(Object.keys(parents), subtabs);
  assert.deepEqual(parents, {mail: 'approval', notifications: 'approval', mytodo: 'today', board: 'today', resource: 'calendar', gcal: 'calendar', gsync: 'settings', docs: 'search', people: 'search', overview: 'report'});
  // 왼쪽 메뉴 9개가 VIEWS 맨 앞에 있어야 Alt+1~9가 메뉴 순서와 같다.
  assert.deepEqual(declared.slice(0, sidebar.length), sidebar);
  assert.match(views, /const NAV_GROUPS = \[\['', \['home'\]\], \['핵심', \['today', 'calendar', 'attendance', 'budget'\]\], \['문서·소통', \['approval', 'search', 'report'\]\]\];/);
});
