import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const environment = path.join(root, '.venv-attachments');
const python = path.join(environment, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
function run(command, args) {
  const result = spawnSync(command, args, {cwd: root, stdio: 'inherit', windowsHide: true});
  if (result.error || result.status !== 0) throw new Error('문서 환경 설치에 실패했습니다. Python 3.14 설치와 네트워크 연결을 확인하세요.');
}
try {
  if (!await fs.access(python).then(() => true, () => false)) {
    const candidates = process.platform === 'win32' ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]];
    const found = candidates.find(([command, args]) => spawnSync(command, [...args, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'], {stdio: 'ignore', windowsHide: true}).status === 0);
    if (!found) throw new Error('Python 3.10 이상이 필요합니다. 검증 버전은 3.14입니다. 설치 후 다시 실행하세요.');
    run(found[0], [...found[1], '-m', 'venv', environment]);
  }
  run(python, ['-m', 'pip', 'install', '-r', path.join(root, 'requirements-attachments.txt')]);
  run(python, ['-c', 'import pypdf; print("Document extraction ready (pypdf " + pypdf.__version__ + ")")']);
  console.log('문서 환경 준비 완료. npm start 후 내 문서에서 PDF·XLSX·HWPX 파일을 넣으세요.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
