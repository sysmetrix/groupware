// 새 버전 준비(bump)와 릴리스 글 만들기: 손으로 세 파일을 고치던 일을 한 명령으로 줄인 도구의 약속.
import test from 'node:test';
import assert from 'node:assert/strict';
import {bumpSources} from '../scripts/bump.mjs';
import {releaseNotes} from '../scripts/release-notes.mjs';

const SRC = {workcenter: "  const VERSION = '0.71.0';\n", collector: "  const VERSION = '0.71.0';\n", briefing: 'export const CHANGELOG = [\n  {v: "0.71.0", date: "2026-11-15", old: "", title: "이전", items: ["a"]},\n];\n'};

test('bumpSources changes both VERSION lines and puts the new entry on top of the changelog', () => {
  const out = bumpSources(SRC, {version: '0.72.0', title: ' 새 제목 ', items: ['첫째 "따옴표"', '  ', '둘째'], date: '2026-11-16'});
  assert.equal(out.from, '0.71.0');
  assert.match(out.workcenter, /const VERSION = '0\.72\.0';/);
  assert.match(out.collector, /const VERSION = '0\.72\.0';/);
  const lines = out.briefing.split('\n');
  assert.equal(lines[1], '  {v: "0.72.0", date: "2026-11-16", old: "", title: "새 제목", items: ["첫째 \\"따옴표\\"", "둘째"]},');
  assert.match(lines[2], /v: "0\.71\.0"/, 'the previous entry stays right below');
});

test('bumpSources raises the package.json version with the others and leaves the rest of the file alone', () => {
  const pkg = '{\n  "name": "groupware-assistant",\n  "version": "0.2.0",\n  "engines": { "node": ">=24" }\n}\n';
  const out = bumpSources({...SRC, pkg}, {version: '0.72.0', title: 't', items: ['x'], date: '2026-11-16'});
  assert.equal(out.pkg, pkg.replace('"0.2.0"', '"0.72.0"'));
  assert.equal('pkg' in bumpSources(SRC, {version: '0.72.0', title: 't', items: ['x'], date: '2026-11-16'}), false, 'no package.json given, none returned');
  assert.throws(() => bumpSources({...SRC, pkg: '{"name": "x"}'}, {version: '0.72.0', title: 't', items: ['x'], date: '2026-11-16'}));
});

test('package.json carries the same version as the assistant', async () => {
  const fs = await import('node:fs/promises');
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const wc = await fs.readFile(new URL('../src/live/workcenter.browser.js', import.meta.url), 'utf8');
  assert.equal(pkg.version, (wc.match(/const VERSION = '(\d+\.\d+\.\d+)';/) || [])[1]);
  const lock = JSON.parse(await fs.readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
});

test('bumpSources refuses a version that does not go up, and empty titles or items', () => {
  const ok = {version: '0.72.0', title: 't', items: ['x'], date: '2026-11-16'};
  for (const bad of [{version: '0.71.0'}, {version: '0.70.9'}, {version: 'v0.72'}, {title: ' '}, {items: []}, {items: ['  ']}, {date: '11/16'}]) assert.throws(() => bumpSources(SRC, {...ok, ...bad}));
  assert.throws(() => bumpSources({...SRC, collector: 'no version here'}, ok));
});

test('releaseNotes makes the title and bullet list for a version, and fails for an unknown one', () => {
  const log = [{v: '0.72.0', title: '새 제목', items: ['하나', '둘']}];
  assert.deepEqual(releaseNotes('0.72.0', log), {title: 'v0.72.0 새 제목', body: '- 하나\n- 둘\n'});
  assert.throws(() => releaseNotes('9.9.9', log));
});

test('trimChangelog keeps details only for the newest versions and leaves odd-looking sources alone', async () => {
  const {trimChangelog, assemble, readSources, CHANGELOG_DETAIL} = await import('../scripts/live-build.mjs');
  const src = 'x\nexport const CHANGELOG = [\n  {v: "0.3.0", date: "d", old: "", title: "c", items: ["3"]},\n  {"v":"0.2.0","date":"d","old":"","title":"b","items":["2", "]}"]},\n  {v: "0.1.0", date: "d", old: "3", title: "a", items: ["1"]},\n];\ny';
  const out = trimChangelog(src, 1);
  assert.ok(out.includes('title: "c", items: ["3"]},'), 'newest keeps its list');
  assert.ok(out.includes('"title":"b","items":[]},'), 'older (quoted style) loses its list but keeps the title');
  assert.ok(out.includes('title: "a", items: []},'));
  assert.ok(out.startsWith('x\n') && out.endsWith('\n];\ny'));
  const odd = 'export const CHANGELOG = [\n  {v: "0.1.0",\n   items: ["multi-line"]},\n];';
  assert.equal(trimChangelog(odd, 0), odd);
  assert.equal(trimChangelog('no changelog here'), 'no changelog here');
  // 실제 번들: 최근 것은 목록이 있고 오래된 것은 비어 있으며, 소스의 전체 내역은 그대로다
  const {CHANGELOG} = await import('../src/live/briefing.mjs');
  assert.ok(CHANGELOG.length > CHANGELOG_DETAIL && CHANGELOG.every(c => c.items.length), 'source keeps every detail');
  const {bundle} = assemble(await readSources(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
  const old = CHANGELOG[CHANGELOG_DETAIL];
  assert.ok(!bundle.includes(old.items[0]), 'an old detail line is not shipped');
  assert.ok(bundle.includes(CHANGELOG[0].items[0]), 'the newest detail line is shipped');
  assert.ok(bundle.includes(old.title), 'old titles stay');
});
