import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {build, MAX_SHIPPED_BUNDLE_BYTES} from '../scripts/live-build.mjs';
import {minifySafely, TERSER_VERSION} from '../scripts/terser-minify.mjs';

test('work90 minifier is local, formatting-only, and deterministic', async () => {
  const source = '/* removable */ function keepName(longArgument) { const untouched = longArgument + 1; return untouched; }';
  const first = await minifySafely(source);
  const second = await minifySafely(source);
  assert.equal(first, second);
  assert.match(first, /function keepName\(longArgument\)/);
  assert.match(first, /const untouched=longArgument\+1/);
  assert.doesNotMatch(first, /removable/);
  assert.equal(TERSER_VERSION, '5.44.1');
});

test('work90 ships reproducible minified bundle within exact 1060KB limit', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'work90-minify-test-'));
  try {
    const [first, second] = await Promise.all([
      build({outDir: path.join(tmp, 'a')}),
      build({outDir: path.join(tmp, 'b')}),
    ]);
    const [a, b] = await Promise.all([fs.readFile(first.bundle), fs.readFile(second.bundle)]);
    assert.ok(a.length <= MAX_SHIPPED_BUNDLE_BYTES, `${a.length} exceeds ${MAX_SHIPPED_BUNDLE_BYTES}`);
    assert.equal(a.toString('hex'), b.toString('hex'));
    assert.ok(a.length < 1060 * 1024);
    assert.equal(first.bundleBytes, a.length);
    assert.equal(first.terser, '5.44.1');
  } finally {
    await fs.rm(tmp, {recursive: true, force: true});
  }
});
