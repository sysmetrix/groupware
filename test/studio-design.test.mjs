// 디자인 레이어(v0.69 결재판 → v0.70 차분한 작업 화면): 하루 띠 계산, 디자인 레이어와 움직임 모듈이 지켜야 할 약속.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {homeDayRail} from '../src/live/home-model.mjs';
import {readSources, assemble} from '../scripts/live-build.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = f => fs.readFile(path.join(root, f), 'utf8');

test('homeDayRail places timed events on an 08-19 rail and keeps all-day and out-of-range items apart', () => {
  const r = homeDayRail([
    {from: '10:00', to: '11:00', label: '회의', kind: 'etc'},
    {from: '', label: '연차', allDay: true},
    {from: '14:00', to: '', label: '협의'},
    {from: '06:00', to: '07:00', label: '새벽'},
    {from: '17:00', to: '17:30', label: '차량', kind: 'car'},
  ], {nowMin: 13 * 60 + 20});
  assert.deepEqual(r.blocks.map(b => b.label), ['회의', '협의', '차량']);
  assert.deepEqual(r.blocks[0], {left: 18.18, width: 9.09, label: '회의', time: '10:00~11:00', kind: 'etc', done: true});
  assert.equal(r.blocks[1].time, '14:00~14:30', 'an event without an end time gets 30 minutes');
  assert.equal(r.blocks[2].kind, 'car');
  assert.deepEqual(r.allDay, ['연차']);
  assert.equal(r.outside, 1);
  assert.deepEqual(r.now, {left: 48.48, label: '13:20', inRange: true, edge: ''});
  assert.deepEqual(r.next, {label: '협의', inMin: 40});
  assert.equal(r.leftMin, 280, 'minutes until 18:00');
  assert.equal(r.ticks.length, 12);
  assert.deepEqual([r.ticks[0], r.ticks.at(-1)], [{h: 8, left: 0}, {h: 19, left: 100}]);
});

test('homeDayRail clamps long events, marks the needle at the edges and tolerates bad input', () => {
  const r = homeDayRail([{from: '07:00', to: '20:30', label: '종일 교육'}, {from: '25:00', label: '잘못된 시각'}, null], {nowMin: 8 * 60 + 5});
  assert.deepEqual([r.blocks[0].left, r.blocks[0].width], [0, 100]);
  assert.deepEqual(r.allDay, ['잘못된 시각'], 'an unparsable time is listed, never drawn at a guessed place');
  assert.equal(r.now.edge, 'l');
  assert.equal(homeDayRail([], {nowMin: 18 * 60 + 50}).now.edge, 'r');
  const night = homeDayRail([], {nowMin: 21 * 60 + 40});
  assert.equal(night.now.inRange, false);
  assert.equal(night.leftMin, 0);
  assert.equal(night.next, null);
  assert.equal(homeDayRail(undefined, {nowMin: 'x'}).blocks.length, 0);
});

test('studio layer is bundled last, respects reduced motion and keeps text at 12px or more', async () => {
  const css = await read('src/live/wc-studio.css');
  const {css: all} = await readSources(root);
  assert.ok(all.trimEnd().endsWith(css.replace(/\r\n?/g, '\n').trimEnd()), 'wc-studio.css must be the last stylesheet so its tokens win');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^}]*animation:none!important;transition:none!important/);
  assert.match(css, /\.wc\.m-off \*/);
  for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(+m[1] >= 12, `font-size ${m[1]}px`);
  // 밝게·어둡게 모두 같은 토큰 이름을 정의한다
  const tokens = block => new Set([...block.matchAll(/(--[a-z0-9-]+):/g)].map(m => m[1]));
  const light = tokens(css.slice(css.indexOf('.wc{'), css.indexOf('.wc.dark{'))), dark = tokens(css.slice(css.indexOf('.wc.dark{'), css.indexOf('.wc .hm,')));
  for (const t of ['--bg', '--card', '--fg', '--muted', '--line', '--accent', '--pri', '--hi', '--ok', '--md', '--hl', '--sel']) assert.ok(light.has(t) && dark.has(t), `${t} in both themes`);
});

test('motion module only observes and flags: no data-act handlers, no network, stops on destroy', async () => {
  const js = await read('src/live/wc/39-motion.js');
  for (const banned of ['fetch(', 'GW.', 'innerHTML', 'data-act', 'localStorage']) assert.ok(!js.includes(banned), `39-motion.js must not use ${banned}`);
  assert.match(js, /prefers-reduced-motion/);
  assert.match(js, /function motionStop\(\)/);
  assert.match(await read('src/live/wc/17-lifecycle.js'), /motionStop\(\)/, 'destroy() stops the observers and the needle timer');
  // 조립된 번들에서 움직임 조각이 화면 조각 뒤에 온다(관찰 대상 #main, #nav가 이미 있어야 한다)
  const {workcenter} = assemble(await readSources(root));
  assert.ok(workcenter.indexOf('function motionSync') > workcenter.indexOf('function vHome'));
});
