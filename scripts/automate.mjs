const port = Number(process.env.PORT || 3210);
try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT를 확인하세요.');
  const base = `http://127.0.0.1:${port}`;
  const statusResponse = await fetch(base + '/api/status', {redirect: 'error', signal: AbortSignal.timeout(5000)});
  if (!statusResponse.ok) throw new Error('로컬 서버 상태를 확인하지 못했습니다.');
  const {csrf} = await statusResponse.json();
  const response = await fetch(base + '/api/automation/run', {method: 'POST', redirect: 'error', headers: {'content-type': 'application/json', 'x-csrf-token': csrf}, body: '{}', signal: AbortSignal.timeout(30000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || result.message || '자동화 실행 실패');
  console.log(`${result.message} / 보고서: ${result.reportAvailable ? '사용 가능' : '생성 전'}`);
} catch (error) { console.error(`자동화 실패: ${error.message}. npm start와 자동화 설정을 확인하세요.`); process.exitCode = 1; }
