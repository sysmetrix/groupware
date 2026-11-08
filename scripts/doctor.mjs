import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJsonFile, validateAutomation} from '../src/automation.mjs';
import {validateModelConfig} from '../src/model.mjs';
let failures = 0;
function result(name, ok, detail = '') { console.log(`${ok ? 'OK' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`); if (!ok) failures++; }
result('Node.js >=24', Number(process.versions.node.split('.')[0]) >= 24, process.version);
const git = spawnSync('git', ['--version'], {encoding: 'utf8'}); result('Git', git.status === 0);
for (const file of ['.env', 'config/automation.json', 'config/csv-profile.json']) {
  try { await fs.access(file); result(file, true); } catch { result(file, false, 'npm run setup 실행 필요'); }
}
const ignored = spawnSync('git', ['check-ignore', '.env', 'data/dataset.json', 'config/automation.json'], {encoding: 'utf8'});
result('로컬 파일 Git 제외', ignored.status === 0 && ignored.stdout.trim().split(/\r?\n/).length === 3);
try { const config = validateAutomation(await readJsonFile(process.env.AUTOMATION_CONFIG || 'config/automation.json', 32_768), process.cwd()); result('자동화 설정', true, config.enabled ? '활성 (파일 경로·사용자 범위는 실행 시 검사)' : '비활성'); } catch { result('자동화 설정', false, '자동화 설정 파일 확인'); }
try { validateModelConfig({model: process.env.OLLAMA_MODEL || '', baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'}); result('AI 설정', true, process.env.OLLAMA_MODEL ? '로컬 모델 응답은 별도 확인 필요' : '선택 기능 미설정'); } catch { result('AI 설정', false); }
try {
  const directory = path.resolve(process.env.DATA_DIR || 'data'); await fs.mkdir(directory, {recursive: true, mode: 0o700});
  const file = path.join(directory, `.doctor-${process.pid}.tmp`); await fs.writeFile(file, '', {flag: 'wx', mode: 0o600}); await fs.unlink(file); result('자료 폴더 쓰기', true);
} catch { result('자료 폴더 쓰기', false); }
console.log('실제 그룹웨어 로그인/API 연동은 이 진단으로 확인되지 않습니다.');
process.exitCode = failures ? 1 : 0;
