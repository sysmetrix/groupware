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
