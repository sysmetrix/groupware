import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaultAutomation} from '../src/automation.mjs';
import {exampleCsvProfile} from '../src/csv.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 이상이 필요합니다.');
for (const dir of ['config', 'data/inbox', 'data/reports']) await fs.mkdir(path.join(root, dir), {recursive: true, mode: 0o700});
async function create(file, content) {
  try { await fs.writeFile(path.join(root, file), content, {flag: 'wx', mode: 0o600}); console.log(`생성: ${file}`); }
  catch (error) { if (error.code !== 'EEXIST') throw error; console.log(`기존 설정 유지: ${file}`); }
}
await create('.env', await fs.readFile(path.join(root, '.env.example'), 'utf8'));
await create('config/automation.json', JSON.stringify(defaultAutomation, null, 2) + '\n');
await create('config/csv-profile.json', JSON.stringify(exampleCsvProfile, null, 2) + '\n');
console.log('준비 완료. npm start 후 http://127.0.0.1:3210 을 여세요. 자동화 설정: docs/other-computers.md');
