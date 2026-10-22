import {validateModelConfig, summarize} from '../src/model.mjs';
import {createDemoDataset} from '../src/demo.mjs';
import {buildBriefing} from '../src/tasks.mjs';

const probe = process.argv.includes('--probe');
const warmup = process.argv.includes('--warmup');
try {
  const config = validateModelConfig({model: process.env.OLLAMA_MODEL || '', baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'});
  if (!config.enabled) {
    console.log('NOT_CONFIGURED: .env에 로컬 OLLAMA_MODEL이 없습니다. 모델 설치·다운로드·실제 추론은 수행하지 않았습니다.');
    process.exitCode = 2;
  } else {
    const response = await fetch(config.baseUrl + '/api/tags', {redirect: 'error', signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error('service');
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 256000) { await reader.cancel(); throw new Error('size'); } chunks.push(Buffer.from(value)); }
    const catalog = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const names = Array.isArray(catalog.models) ? catalog.models.map(item => item.name) : [];
    if (!names.some(name => name === config.model || name === config.model + ':latest')) {
      console.log('MODEL_MISSING: 설정한 모델이 로컬 서비스 목록에 없습니다. 설치된 모델 이름을 확인하세요.'); process.exitCode = 2;
    } else if (!probe && !warmup) {
      console.log('READY: 설정한 모델이 로컬 서비스에 있습니다. 합성 근거로 추론 검사: npm run doctor:model -- --probe');
    } else {
      if (warmup) {
        const loaded = await fetch(config.baseUrl + '/api/generate', {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180000), headers: {'content-type': 'application/json'}, body: JSON.stringify({model: config.model, prompt: '', stream: false, keep_alive: '15m', options: {num_batch: 64}})});
        await loaded.body?.cancel();
        if (!loaded.ok) throw new Error('warmup');
        console.log('WARMUP_COMPLETED: 빈 입력으로 모델 로딩을 완료했습니다.');
      }
      if (probe) {
        const result = await summarize(buildBriefing(createDemoDataset()), config);
        console.log(JSON.stringify({status: 'PROBE_COMPLETED', mode: result.mode, claims: result.claims.length, evidence: 'synthetic-only', limitation: '출력 형식·근거 ID만 검사. 의미적 정확도와 운영 자료 품질은 별도 평가.'}, null, 2));
      }
    }
  }
} catch { console.error('MODEL_UNAVAILABLE: 로컬 서비스 주소·실행 상태·모델 응답을 확인하세요. 운영 자료는 전송하지 않았습니다.'); process.exitCode = 1; }
