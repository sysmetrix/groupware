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

/** Minifies formatting only: no AST compression or identifier/property mangling. */
export async function minifySafely(code) {
  const terser = await loadTerser();
  const result = await terser.minify(code, {
    compress: false,
    mangle: false,
    format: {comments: false},
  });
  if (result.error) throw result.error;
  if (typeof result.code !== 'string') throw new Error('vendored Terser 5.44.1 returned no code');
  return result.code;
}

export const TERSER_VERSION = '5.44.1';
