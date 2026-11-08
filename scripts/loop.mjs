// 개발 루프: 파일을 저장할 때마다 하네스(--fast)를 돌리고, 직전 결과와 비교해 "새로 깨진 것 / 고쳐진 것"만 알려 준다.
//   node scripts/loop.mjs            감시 모드 (Ctrl+C 종료)
//   node scripts/loop.mjs --once     한 번 실행하고 직전 대비 변화만 출력 (에이전트가 수정 후 호출)
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateFile = path.join(root, 'build', 'harness', 'last-fast.json');
const mode = process.argv.includes('--full') ? [] : ['--fast'];

function run() {
  const r = spawnSync(process.execPath, ['scripts/harness.mjs', ...mode, '--json'], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  let cur;
  try { cur = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { cur = {ok: false, failures: [{stage: '하네스', message: (r.stderr || r.stdout || '실행 실패').slice(0, 300)}]}; }
  let prev = {failures: []};
  try { prev = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
  fs.mkdirSync(path.dirname(stateFile), {recursive: true});
  fs.writeFileSync(stateFile, JSON.stringify(cur));
  const key = f => `${f.stage}|${f.message}`;
  const was = new Set(prev.failures.map(key)), now = new Set(cur.failures.map(key));
  const added = cur.failures.filter(f => !was.has(key(f))), fixed = prev.failures.filter(f => !now.has(key(f)));
  const stamp = new Date().toLocaleTimeString('ko-KR', {hour12: false});
  console.log(`[${stamp}] ${cur.ok ? '통과' : `실패 ${cur.failures.length}건`}${added.length ? ` · 새로 깨짐 ${added.length}` : ''}${fixed.length ? ` · 고쳐짐 ${fixed.length}` : ''}`);
  added.forEach(f => console.log(`  + [${f.stage}] ${f.message}`));
  fixed.forEach(f => console.log(`  - 해결 [${f.stage}] ${f.message}`));
  if (!cur.ok && !added.length) cur.failures.slice(0, 5).forEach(f => console.log(`  = 계속 [${f.stage}] ${f.message}`));
  return cur.ok;
}

if (process.argv.includes('--once')) process.exit(run() ? 0 : 1);

console.log('감시 시작: src/live, scripts, test (Ctrl+C 종료)');
run();
let timer = null;
const trigger = (_e, name) => { if (!name || /build|harness|node_modules|\.git/.test(name)) return; clearTimeout(timer); timer = setTimeout(run, 600); };
for (const d of ['src/live', 'scripts', 'test']) fs.watch(path.join(root, d), {recursive: true}, trigger);
