import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {SCREENS, DENY_ACTS, DENY_TEXT, expandScreens, compareManifests, fileName, decodePng, pngDiff} from '../scripts/visual-snap.mjs';

// 가장 작은 RGB PNG(필터 0)를 만든다.
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = pixel(x, y), o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('화면 목록: 이름이 겹치지 않고 왼쪽 메뉴 9개를 모두 찍는다', () => {
  const names = SCREENS.map(s => s.name);
  assert.equal(new Set(names).size, names.length);
  for (const v of ['home', 'today', 'calendar', 'attendance', 'budget', 'approval', 'search', 'report', 'settings']) assert.ok(SCREENS.some(s => s.name === v && s.view === v), v);
});

test('실행·확정 버튼은 누르지 않는 목록에 있다', () => {
  for (const a of ['chatConfirm', 'tdDelYes', 'resetAll', 'goodsRun', 'recPlay']) assert.ok(DENY_ACTS.has(a), a);
  for (const t of ['상신', '결재', '임시저장', '삭제', '발송']) assert.ok(DENY_TEXT.test(t), t);
  assert.ok(!DENY_TEXT.test('결재·메일'));
  const clicks = SCREENS.flatMap(s => (s.steps || []).map(st => st.click).filter(Boolean));
  for (const c of clicks) for (const a of DENY_ACTS) assert.ok(!c.includes(`"${a}"`), `${c} 는 누르지 않는 버튼을 누른다`);
});

test('each 화면은 찾은 값마다 하나씩 펼친다', () => {
  const out = expandScreens([{name: 'a', view: 'x'}, {name: 'b', view: 'y', each: '#main [data-act="t"]', steps: [{wait: 1}]}], {b: ['one', 'two/x']});
  assert.deepEqual(out.map(s => s.name), ['a', 'b-one', 'b-two_x']);
  assert.deepEqual(out[1].steps, [{wait: 1}, {click: '#main [data-act="t"][data-v="one"]'}, {wait: 400}]);
  assert.equal(out[1].each, undefined);
  assert.deepEqual(expandScreens([{name: 'b', each: 'x'}], {}), []);
});

test('파일 이름과 manifest 비교', () => {
  assert.equal(fileName('dark', 760, 'home'), 'dark-760-home.png');
  assert.equal(fileName('light', 1366, 'home', 2), 'light-1366-home-s2.png');
  const r = compareManifests({files: {a: '1', b: '2', c: '3'}}, {files: {a: '1', b: '9', d: '4'}});
  assert.deepEqual(r, {same: 1, changed: ['b'], onlyA: ['c'], onlyB: ['d']});
});

test('PNG를 풀어 다른 픽셀 영역을 알려 준다', () => {
  const a = png(6, 4, () => [10, 20, 30]);
  const b = png(6, 4, (x, y) => (x === 4 && y >= 1 && y <= 2 ? [200, 0, 0] : [10, 20, 30]));
  const d = decodePng(a);
  assert.deepEqual([d.w, d.h, d.ch, d.px[0], d.px[1], d.px[2]], [6, 4, 3, 10, 20, 30]);
  assert.deepEqual(pngDiff(a, a), {pixels: 0});
  assert.deepEqual(pngDiff(a, b), {pixels: 2, box: [4, 1, 1, 2]});
  assert.ok(pngDiff(a, png(5, 4, () => [0, 0, 0])).size);
});
