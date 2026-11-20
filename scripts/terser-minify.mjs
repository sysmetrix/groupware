// Local, deterministic wrapper around the vendored Terser 5.44.1 UMD bundle.
// The UMD file is evaluated only in this Node build process; no network dependency is used.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const VENDOR_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vendor', 'terser-5.44.1.js');
let terserPromise;

async function loadTerser() {
  if (!terserPromise) terserPromise = (async () => {
    const sandbox = Object.create(null);
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;
    const source = await fs.readFile(VENDOR_FILE, 'utf8');
    vm.runInNewContext(source, sandbox, {filename: VENDOR_FILE});
    if (!sandbox.Terser || typeof sandbox.Terser.minify !== 'function') throw new Error('vendored Terser 5.44.1 did not expose minify()');
    return sandbox.Terser;
  })();
  return terserPromise;
}

/**
 * Compact equivalent expressions and declarations and shorten function-local names (v0.86.0: ~100KB smaller).
 * Top-level and property names stay intact (window.BWYFGW*, data-act dispatch, message types); sources use no eval/with,
 * so renaming locals cannot change any lookup. Tests load the unminified sources, not this output.
 */
export async function minifySafely(code) {
  const terser = await loadTerser();
  const result = await terser.minify(code, {
    // v0.92.0: 기본 압축을 켜되, 선언되지 않은 전역(POLICY 등)에 대한 typeof 검사를 바꾸지 않도록 typeofs는 끈다.
    compress: {defaults: true, passes: 2, typeofs: false, unsafe: false, keep_fargs: true, keep_infinity: true},
    mangle: {toplevel: false},
    format: {comments: false},
  });
  if (result.error) throw result.error;
  if (typeof result.code !== 'string') throw new Error('vendored Terser 5.44.1 returned no code');
  return result.code;
}

export const TERSER_VERSION = '5.44.1';
