// 내보낸 사용 기록으로 동결·수정 후보 보고서를 만든다. 파일은 이 PC에서만 읽고 어디로도 보내지 않는다.
//   node scripts/usage-report.mjs <내보낸 파일> [더 많은 파일...] [--days 28] [--out 파일.md]
// 직원마다 가장 최근 파일 하나씩 넣는다. 저장 모양의 JSON과 앱이 내보낸 Markdown을 읽는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadWc, analyze} from './lib/wc-analyze.mjs';
import {buildUsageReport, codeNames, formatUsageReport, parseUsageInput} from './lib/usage-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = '사용법: node scripts/usage-report.mjs <내보낸 파일> [더 많은 파일...] [--days 28] [--out 파일.md]';
const MAX_BYTES = 5 * 1024 * 1024;

function parseArgs(argv) {
  const opt = {files: [], days: 28, out: ''};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') { opt.days = Number(argv[++i]); if (!Number.isInteger(opt.days) || opt.days < 1 || opt.days > 3650) throw new Error('--days 에는 1 이상의 정수를 적어 주세요.'); }
    else if (a === '--out') { opt.out = argv[++i] || ''; if (!opt.out || opt.out.startsWith('--')) throw new Error('--out 에는 파일 이름을 적어 주세요.'); }
    else if (a.startsWith('--')) throw new Error(`모르는 옵션입니다: ${a}`);
    else opt.files.push(a);
  }
  if (!opt.files.length) throw new Error('읽을 파일을 적어 주세요.');
  // 결과를 입력 파일에 덮어쓰지 않는다.
  if (opt.out && opt.files.some(f => path.resolve(f).toLowerCase() === path.resolve(opt.out).toLowerCase())) throw new Error('--out 이 입력 파일과 같습니다.');
  return opt;
}

async function readInput(file) {
  try {
    if ((await fs.stat(file)).size > MAX_BYTES) return {type: 'bad', reason: '파일이 너무 큽니다'};
    return parseUsageInput(await fs.readFile(file, 'utf8'));
  } catch { return {type: 'bad', reason: '파일을 열지 못했습니다'}; }
}

let opt;
try { opt = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`${e.message}\n${USAGE}`); process.exit(2); }

const model = await loadWc(root);
const names = codeNames(model, analyze(model));
const version = (model.workcenter.match(/const VERSION = '([\d.]+)'/) || [])[1] || '';
const sources = await Promise.all(opt.files.map(readInput));
// 파일 이름에는 사람 이름이 들어갈 수 있어 보고서에는 번호만 적고, 어느 파일인지는 화면에만 알린다.
sources.forEach((s, i) => { if (s.type === 'bad') console.error(`읽지 못함 (${i + 1}번째) ${opt.files[i]}: ${s.reason}`); });
if (sources.every(s => s.type === 'bad')) { console.error('읽을 수 있는 사용 기록이 없어 보고서를 만들지 않았습니다.'); process.exit(1); }

const text = formatUsageReport(buildUsageReport(sources, names, {days: opt.days}), {version});
if (opt.out) {
  await fs.mkdir(path.dirname(path.resolve(opt.out)), {recursive: true});
  await fs.writeFile(opt.out, text, 'utf8');
  console.log(`보고서를 만들었습니다: ${opt.out}`);
} else process.stdout.write(text);
