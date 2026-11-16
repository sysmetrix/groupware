// 지금 소스의 버전과 그 버전의 업데이트 내역을 릴리스 글로 만든다(배포 워크플로가 GitHub 릴리스를 자동으로 만들 때 쓴다).
// Usage: node scripts/release-notes.mjs [notes.md]
//   표준 출력: 버전 번호(예: 0.71.0)
//   notes.md : 첫 줄 = 릴리스 제목, 빈 줄, 그 아래 = 바뀐 점 목록
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHANGELOG} from '../src/live/changelog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function releaseNotes(version, changelog = CHANGELOG) {
  const c = changelog.find(x => x.v === version);
  if (!c) throw new Error(`업데이트 내역에 v${version} 항목이 없습니다.`);
  return {title: `v${version} ${c.title}`, body: c.items.map(x => `- ${x}`).join('\n') + '\n'};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const src = await fs.readFile(path.join(ROOT, 'src', 'live', 'workcenter.browser.js'), 'utf8');
    const version = (src.match(/const VERSION = '(\d+\.\d+\.\d+)';/) || [])[1];
    if (!version) throw new Error('VERSION 줄을 찾지 못했습니다.');
    const n = releaseNotes(version);
    if (process.argv[2]) await fs.writeFile(path.resolve(process.argv[2]), `${n.title}\n\n${n.body}`);
    console.log(version);
  } catch (e) { console.error((e && e.message) || e); process.exit(1); }
}
