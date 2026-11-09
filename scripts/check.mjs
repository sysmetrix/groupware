// Syntax CI: every .js/.mjs file parses, the work center fragments (src/live/wc) parse as boot() bodies,
// and the assembled browser bundle parses as a whole. Nothing is written to build/.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkLiveSyntax} from './live-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WC_DIR = path.join(root, 'src', 'live', 'wc');
const files = [];
async function visit(directory) {
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    const full = path.join(directory, entry.name);
    // Fragments are not standalone modules (they live inside boot()); checkLiveSyntax covers them below.
    if (entry.isDirectory()) { if (full !== WC_DIR && entry.name !== 'node_modules') await visit(full); } else if (/\.(mjs|js)$/.test(entry.name)) files.push(full);
  }
}
for (const directory of ['src', 'public', 'test', 'scripts', 'desktop']) await visit(path.join(root, directory));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
const live = await checkLiveSyntax(root);
for (const e of live.errors) console.error(`${e.file}${e.line ? `:${e.line}` : ''}: SyntaxError: ${e.message}`);
if (live.errors.length) process.exit(1);
console.log(`Syntax checked ${files.length} files, ${live.fragments} work center fragments and the assembled bundle (${live.bundleKB}KB).`);
