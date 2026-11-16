// 새 버전 준비: 두 곳의 VERSION, package.json 버전, 업데이트 내역 맨 위 줄을 한 번에 바꾼다(손으로 여러 파일을 고치다 하나를 빠뜨리지 않게).
// Usage: npm run bump -- 0.72.0 "제목" "바뀐 점 1" "바뀐 점 2" ...
//   src/live/workcenter.browser.js, src/live/collector.browser.js 의 VERSION
//   src/live/briefing.mjs 의 CHANGELOG 맨 위(날짜는 한국 시간 오늘)
//   package.json, package-lock.json 의 version
// 그 뒤는 평소대로: npm run harness → 커밋 → PR. main에 합쳐지면 배포와 GitHub 릴리스는 자동이다(.github/workflows/pages.yml).
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_RE = /const VERSION = '(\d+\.\d+\.\d+)';/;
const PKG_RE = /^(\s*"version":\s*")\d+\.\d+\.\d+(")/m;
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; };

/** 파일 내용만 받아 새 내용을 돌려주는 순수 함수(테스트용). 잘못된 입력은 Error. */
export function bumpSources({workcenter, collector, briefing, pkg}, {version, title, items, date}) {
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('버전은 0.72.0 같은 형식이어야 합니다.');
  if (!String(title || '').trim()) throw new Error('제목을 적어 주세요.');
  const list = (items || []).map(x => String(x).trim()).filter(Boolean);
  if (!list.length) throw new Error('바뀐 점을 한 가지 이상 적어 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('날짜 형식이 올바르지 않습니다.');
  const cur = (workcenter.match(VERSION_RE) || [])[1];
  if (!cur || !VERSION_RE.test(collector)) throw new Error('VERSION 줄을 찾지 못했습니다.');
  if (cmp(version, cur) <= 0) throw new Error(`새 버전(${version})은 현재 버전(${cur})보다 커야 합니다.`);
  if (pkg != null && !PKG_RE.test(pkg)) throw new Error('package.json의 version 줄을 찾지 못했습니다.');
  const mark = 'export const CHANGELOG = [\n';
  if (!briefing.includes(mark)) throw new Error('업데이트 내역(CHANGELOG)을 찾지 못했습니다.');
  const entry = `  {v: ${JSON.stringify(version)}, date: ${JSON.stringify(date)}, old: "", title: ${JSON.stringify(String(title).trim())}, items: [${list.map(x => JSON.stringify(x)).join(', ')}]},\n`;
  return {
    from: cur,
    workcenter: workcenter.replace(VERSION_RE, `const VERSION = '${version}';`),
    collector: collector.replace(VERSION_RE, `const VERSION = '${version}';`),
    briefing: briefing.replace(mark, mark + entry),
    ...(pkg != null ? {pkg: pkg.replace(PKG_RE, `$1${version}$2`)} : {}),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [version, title, ...items] = process.argv.slice(2);
  const files = {workcenter: 'src/live/workcenter.browser.js', collector: 'src/live/collector.browser.js', briefing: 'src/live/briefing.mjs', pkg: 'package.json'};
  try {
    const src = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([k, f]) => [k, await fs.readFile(path.join(ROOT, f), 'utf8')])));
    const date = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const out = bumpSources(src, {version, title, items, date});
    await Promise.all(Object.entries(files).map(([k, f]) => fs.writeFile(path.join(ROOT, f), out[k])));
    // package-lock.json 의 맨 위 버전 두 곳도 맞춘다(의존 패키지가 없어 이 두 줄뿐이다).
    const lockFile = path.join(ROOT, 'package-lock.json');
    const lock = await fs.readFile(lockFile, 'utf8').catch(() => null);
    if (lock != null) await fs.writeFile(lockFile, lock.replace(/^( {2}"version":\s*")\d+\.\d+\.\d+(")/m, `$1${version}$2`).replace(/^( {6}"version":\s*")\d+\.\d+\.\d+(")/m, `$1${version}$2`));
    console.log(`v${out.from} → v${version} (${date}). 다음: npm run harness → 커밋 → PR. 배포와 릴리스는 main에 합쳐지면 자동입니다.`);
  } catch (e) {
    console.error((e && e.message) || e);
    console.error('사용법: npm run bump -- 0.72.0 "제목" "바뀐 점 1" "바뀐 점 2"');
    process.exit(1);
  }
}
