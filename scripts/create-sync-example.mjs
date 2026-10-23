import fs from 'node:fs/promises';
import path from 'node:path';
import {createDemoDataset} from '../src/demo.mjs';

const dir = path.resolve(process.argv[2] || './data/sync-demo');
const dataset = createDemoDataset();
dataset.source.kind = 'manual-export'; dataset.source.label = '합성 수집 검증 · 실제 내보내기 아님'; dataset.source.baseUrl = 'https://example.invalid';
const scope = {connectorId: 'synthetic-export', contractVersion: '1', userId: dataset.principal.userId, organizationId: dataset.principal.organizationId, baseUrl: dataset.source.baseUrl, queryKey: 'all'};
const shared = {total: dataset.items.length, deletedIds: []};
const bundle = {schemaVersion: 1, scope, mode: 'full', fromCheckpoint: null, source: dataset.source, principal: dataset.principal, pages: [
  {...shared, cursor: null, nextCursor: 'page-2', checkpoint: null, items: dataset.items.slice(0, 2)},
  {...shared, cursor: 'page-2', nextCursor: 'page-3', checkpoint: null, items: []},
  {...shared, cursor: 'page-3', nextCursor: null, checkpoint: 'synthetic-v1', items: dataset.items.slice(2)},
]};
try {
  await fs.mkdir(dir, {recursive: true});
  for (const [name, value] of [['scope.json', scope], ['pages.json', bundle]]) await fs.writeFile(path.join(dir, name), JSON.stringify(value, null, 2), {flag: 'wx', mode: 0o600});
  console.log(`합성 입력 생성: ${dir}. 실제 자료를 수집하지 않았습니다. 기존 파일은 덮어쓰지 않습니다.`);
} catch { console.error('합성 입력을 만들지 못했습니다. 기존 파일이 없는 폴더와 쓰기 권한을 확인하세요.'); process.exitCode = 1; }
