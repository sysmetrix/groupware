import {spawnSync} from 'node:child_process';

// Diagnose installation only. Never create/claim spaces, navigate, read profiles or credentials.
const executable = process.platform === 'win32' ? 'ego-browser.exe' : 'ego-browser';
const probes = [
  ['CLI 버전', ['--version']],
  ['내장 Node 런타임', ['nodejs', '-e', "console.log(JSON.stringify({runtime:process.version}))"]],
];
let failed = false;
for (const [label, args] of probes) {
  const result = spawnSync(executable, args, {encoding: 'utf8', timeout: 15000, maxBuffer: 64 * 1024, windowsHide: true, shell: false});
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const verified = label === 'CLI 버전' ? /ego-browser \d+\.\d+/.test(output) : /"runtime"\s*:\s*"v\d+\./.test(output);
  const ok = !result.error && result.status === 0 && verified;
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}`);
  if (ok) console.log(output.slice(0, 500));
  else { failed = true; console.log(result.error?.code === 'ENOENT' ? 'ego-browser가 PATH에 없습니다. 설치와 터미널 재실행을 확인하세요.' : '진단 실패. 시간 초과 또는 앱 연결 오류를 확인하세요.'); }
}
console.log('이 검사는 설치와 런타임만 확인합니다. 브라우저 제어권·그룹웨어 로그인·조회 성공을 증명하지 않습니다.');
console.log('Task space does not exist: 작업 공간 수명 오류. 인증 오류로 단정하거나 재로그인을 반복하지 마세요.');
console.log('no longer assigned / hard stop: 제어권 해제. 자동 재시도·새 공간·다른 도구로 우회하지 말고 명시적 재개 후 복구하세요.');
console.log('자세한 절차: docs/browser-recovery.md');
process.exitCode = failed ? 1 : 0;
