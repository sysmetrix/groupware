import fs from 'node:fs/promises';
import path from 'node:path';
import {buildBrowserSnapshot} from '../src/browser-snapshot.mjs';
import {readJsonFile} from '../src/automation.mjs';

const [input, scope, address = 'http://127.0.0.1:3210'] = process.argv.slice(2);
if (!input || !scope || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(address) || Number(new URL(address).port) > 65535) {
  console.error('Usage: node scripts/import-browser-snapshot.mjs capture.json principal.json [http://127.0.0.1:3210]');
  process.exitCode = 1;
} else {
  try {
    const dataset = buildBrowserSnapshot(await readJsonFile(input), await readJsonFile(scope, 32768));
    const statusResponse = await fetch(address + '/api/status', {signal: AbortSignal.timeout(10000)});
    if (!statusResponse.ok) throw new Error('업무도우미 상태를 확인할 수 없습니다.');
    const status = await statusResponse.json();
    // Never silently discard existing real data. The user can review/replace it
    // through the existing import UI; repeated CLI updates are same-scope only.
    if (status.source.kind !== 'demo' && (status.source.kind !== 'browser-snapshot' || status.principal.userId !== dataset.principal.userId || status.principal.organizationId !== dataset.principal.organizationId)) throw new Error('다른 범위의 실제 자료가 있습니다. UI에서 검토 후 가져오세요.');
    if (status.source.kind === 'browser-snapshot' && Date.parse(status.source.exportedAt) > Date.parse(dataset.source.exportedAt)) throw new Error('이전 시점의 자료로 교체할 수 없습니다.');
    const response = await fetch(address + '/api/import', {method:'POST', headers:{'content-type':'application/json','x-csrf-token':status.csrf}, body:JSON.stringify(dataset), signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error((await response.json()).error || '가져오기 실패');
    const result = await response.json();
    await fs.writeFile(path.resolve(path.dirname(input), 'last-import.json'), JSON.stringify({at:new Date().toISOString(),revision:result.revision,counts:dataset.source.coverage.map(({type,collected,state})=>({type,collected,state}))},null,2), {mode:0o600});
    console.log(JSON.stringify({imported:dataset.items.length, revision:result.revision, liveConnected:false}));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
