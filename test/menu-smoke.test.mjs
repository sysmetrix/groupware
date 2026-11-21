import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = path.join(root, 'scripts', '90-menu-smoke.browser.js');
const viewsPath = path.join(root, 'src', 'live', 'wc', '05-views.js');
const sidebar = ['home', 'today', 'approval', 'mail', 'calendar', 'attendance', 'search', 'budget', 'report', 'notifications', 'people', 'settings'];
const subtabs = ['board', 'mytodo', 'resource', 'gcal', 'gsync', 'docs', 'overview'];

test('work90 menu smoke is syntactically valid and read-only', async () => {
  const source = await fs.readFile(scriptPath, 'utf8');
  assert.doesNotThrow(() => new vm.Script(source, {filename: '90-menu-smoke.browser.js'}));
  for (const id of [...sidebar, ...subtabs]) assert.match(source, new RegExp(`['\"]${id}['\"]`), `${id} contract missing`);
  for (const required of ['aria-current', 'aria-selected', "querySelector('h1')", 'page error events', 'no visible error']) assert.ok(source.includes(required), `${required} check missing`);
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'localStorage.', 'sessionStorage.', 'data-act="refresh"', 'submit', 'delete', 'remove(', 'window.open']) {
    assert.ok(!source.includes(forbidden), `read-only smoke must not contain ${forbidden}`);
  }
});

test('work90 menu smoke matches the 12 sidebar and seven embedded-view contracts', async () => {
  const views = await fs.readFile(viewsPath, 'utf8');
  const declared = [...views.matchAll(/\{id: '([^']+)', label: '([^']+)'\}/g)].map(match => match[1]);
  const parentBlock = views.match(/const VIEW_PARENT = \{([^}]+)\}/)?.[1] ?? '';
  const parents = Object.fromEntries([...parentBlock.matchAll(/(\w+): '([^']+)'/g)].map(match => [match[1], match[2]]));
  const visibleSidebar = declared.filter(id => !parents[id]);
  assert.deepEqual(visibleSidebar, sidebar);
  assert.deepEqual(Object.keys(parents), subtabs);
  assert.deepEqual(parents, {board: 'today', mytodo: 'today', resource: 'calendar', gcal: 'calendar', gsync: 'calendar', docs: 'search', overview: 'report'});
});
