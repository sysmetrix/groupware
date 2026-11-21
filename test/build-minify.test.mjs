import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {build, MAX_SHIPPED_BUNDLE_BYTES} from '../scripts/live-build.mjs';
import {minifySafely, TERSER_VERSION} from '../scripts/terser-minify.mjs';

test('work90 minifier is local and deterministic; shortens only function-local names and keeps behavior', async () => {
  const source = '/* removable */ function keepName(longArgument) { const untouched = longArgument + 1; return untouched; }';
  const first = await minifySafely(source);
  const second = await minifySafely(source);
  assert.equal(first, second);
  assert.match(first, /function keepName\(\w+\)/); // 최상위 이름은 그대로, 지역 이름(인자·지역 변수)만 짧아진다
  // v0.92.0: 기본 압축을 켜도 동작은 같아야 한다
  const box = {}; new Function('box', first + '; box.r = keepName(41);')(box);
  assert.equal(box.r, 42);
  // 선언되지 않은 전역의 typeof 검사는 그대로 둔다(typeofs: false)
  const guard = await minifySafely('function hasPolicy() { return typeof POLICY !== "undefined" && !!POLICY; }');
  assert.match(guard, /typeof POLICY/);
  const box2 = {}; new Function('box', guard + '; box.r = hasPolicy();')(box2);
  assert.equal(box2.r, false);
  assert.doesNotMatch(first, /removable/);
  assert.equal(TERSER_VERSION, '5.44.1');
});

test('work90 ships reproducible minified bundle within exact shipped bundle limit', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'work90-minify-test-'));
  try {
    const [first, second] = await Promise.all([
      build({outDir: path.join(tmp, 'a')}),
      build({outDir: path.join(tmp, 'b')}),
    ]);
    const [a, b] = await Promise.all([fs.readFile(first.bundle), fs.readFile(second.bundle)]);
    assert.ok(a.length <= MAX_SHIPPED_BUNDLE_BYTES, `${a.length} exceeds ${MAX_SHIPPED_BUNDLE_BYTES}`);
    assert.equal(a.toString('hex'), b.toString('hex'));
    assert.ok(a.length <= MAX_SHIPPED_BUNDLE_BYTES);
    assert.equal(first.bundleBytes, a.length);
    assert.equal(first.terser, '5.44.1');
  } finally {
    await fs.rm(tmp, {recursive: true, force: true});
  }
});
