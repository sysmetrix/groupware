import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readSources, assemble} from '../scripts/live-build.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const order = ['style', 'theme', 'home', 'chat', 'premium', 'lean', 'studio'];

test('workcenter has one mandatory stylesheet, not seven optional override files', async () => {
  const files = (await fs.readdir(new URL('../src/live/', import.meta.url))).filter(f => /^wc.*\.css$/.test(f));
  assert.deepEqual(files, ['wc.css']);
  const css = (await fs.readFile(new URL('../src/live/wc.css', import.meta.url), 'utf8')).replace(/\r\n?/g, '\n');
  assert.equal((await readSources(root)).css, css);
});

test('consolidated sections preserve the previous cascade order without CSS layers or imports', async () => {
  const {css} = await readSources(root);
  assert.deepEqual([...css.matchAll(/\/\* === Workcenter section: (\w+) === \*\//g)].map(m => m[1]), order);
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(rules, /@(?:layer|import)\b/);
  assert.ok(rules.startsWith(':host{all:initial}'));
});

test('section documentation has no effect on the assembled workcenter', async () => {
  const sources = await readSources(root);
  const withoutComments = sources.css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(assemble(sources).workcenter, assemble({...sources, css: withoutComments}).workcenter);
});
