import fs from 'node:fs/promises';
import path from 'node:path';
import {convertCsv} from '../src/csv.mjs';
import {readJsonFile} from '../src/automation.mjs';

const [input, profile, output] = process.argv.slice(2);
if (!input || !profile || !output || process.argv.length !== 5) {
  console.error('사용법: npm run convert:csv -- 입력.csv config/csv-profile.json data/inbox/dataset.json'); process.exitCode = 1;
} else {
  try {
    const stat = await fs.stat(input); if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('CSV 파일은 최대 5 MB입니다.');
    const raw = await fs.readFile(input); if (raw.length > 5 * 1024 * 1024) throw new Error('CSV 파일은 최대 5 MB입니다.');
    const dataset = convertCsv(new TextDecoder('utf-8', {fatal: true}).decode(raw), await readJsonFile(profile, 32_768));
    if (Buffer.byteLength(JSON.stringify(dataset)) > 5 * 1024 * 1024) throw new Error('변환 결과가 5 MB를 초과했습니다.');
    await fs.mkdir(path.dirname(path.resolve(output)), {recursive: true, mode: 0o700});
    // Never overwrite an existing file or accidentally destroy the source/profile.
    await fs.writeFile(output, JSON.stringify(dataset, null, 2), {flag: 'wx', mode: 0o600});
    console.log(`변환 완료: ${dataset.items.length}건. 기존 파일은 덮어쓰지 않습니다.`);
  } catch (error) { console.error(error.code === 'EEXIST' ? '출력 파일이 이미 있습니다. 새 이름으로 저장한 후 내용을 확인하여 교체하세요.' : error.message); process.exitCode = 1; }
}
