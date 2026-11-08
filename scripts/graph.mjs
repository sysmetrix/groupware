// 코드 그래프 리포트: node scripts/graph.mjs [--json] [--write]
// 모듈 의존, 이벤트->함수 그래프, 미정의 호출, 죽은 코드, R./GW. 계약 위반을 보여 준다.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadWc, analyze, toMermaid, actMermaid} from './lib/wc-analyze.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function graphReport() { return analyze(await loadWc(root)); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = await graphReport();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(res, null, 2)); process.exit(0); }
  const sec = (t, a, f) => { console.log(`\n## ${t} (${a.length})`); a.slice(0, 40).forEach(x => console.log('- ' + f(x))); if (a.length > 40) console.log(`- ... 외 ${a.length - 40}건`); };
  console.log(`# 코드 그래프: 모듈 ${res.files.length}개, 이벤트 ${res.acts.length}개, 처리기 ${res.cases.length}개`);
  sec('R. 계약 위반(briefing.mjs에 없는 함수 호출)', res.badR, x => `${x.file}:${x.line} R.${x.name}`);
  sec('GW. 계약 위반(수집기가 내보내지 않는 함수 호출)', res.badGW, x => `${x.file}:${x.line} GW.${x.name}`);
  sec('미정의 호출 의심', res.undef, x => `${x.file}:${x.line} ${x.name}()`);
  sec('처리기 없는 화면 이벤트', res.actsNoHandler, x => x);
  sec('화면에서 쓰이지 않는 처리기', res.handlersNoTrigger, x => x);
  sec('죽은 코드 의심(정의만 있고 참조 없음)', res.dead, x => `${x.file} ${x.name}()`);
  if (process.argv.includes('--write')) {
    const md = `# 업무센터 코드 그래프\n\n자동 생성: \`npm run graph:write\`. 직접 수정하지 마세요.\n\n## 모듈 의존 (가중치 2 이상)\n\n\`\`\`mermaid\n${toMermaid(res)}\n\`\`\`\n\n## 화면 이벤트 -> 처리 함수 (일부)\n\n\`\`\`mermaid\n${actMermaid(res)}\n\`\`\`\n\n## 규모\n\n| 파일 | 줄 | 정의 |\n|---|---|---|\n${res.files.map(f => `| ${f.file} | ${f.lines} | ${f.defs} |`).join('\n')}\n`;
    await fs.mkdir(path.join(root, 'docs', 'engineering'), {recursive: true});
    await fs.writeFile(path.join(root, 'docs', 'engineering', 'code-graph.md'), md);
    console.log('\ndocs/engineering/code-graph.md 갱신');
  }
}
