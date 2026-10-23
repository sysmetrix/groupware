import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const files = [];
async function visit(directory) {
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await visit(path); else if (/\.(mjs|js)$/.test(path)) files.push(path);
  }
}
for (const directory of ['src', 'public', 'test', 'scripts', 'desktop']) await visit(directory);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length} files.`);
