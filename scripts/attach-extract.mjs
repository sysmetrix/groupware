import path from 'node:path';
import {realpath} from 'node:fs/promises';
import {readJsonFile, atomicJson} from '../src/automation.mjs';
import {extractAttachment, bindExtraction} from '../src/attachments.mjs';
import {AppError, validateDataset, visibleItems} from '../src/schema.mjs';

const [input, documentId, file, attachmentId, output, ...extra] = process.argv.slice(2);
try {
  if (!input || !documentId || !file || !attachmentId || !output || extra.length) throw new AppError('사용법: npm run attach:extract -- dataset.json document-id attachment.pdf attachment-id output.json');
  const paths = [await realpath(input), await realpath(file), path.join(await realpath(path.dirname(path.resolve(output))), path.basename(output))];
  const keys = paths.map(value => process.platform === 'win32' ? value.toLowerCase() : value);
  if (new Set(keys).size !== 3) throw new AppError('원본 자료·첨부·결과는 서로 다른 경로를 사용하세요.');
  const dataset = validateDataset(await readJsonFile(paths[0]));
  if (!visibleItems(dataset).some(item => item.id === documentId && item.type === 'document' && item.version)) throw new AppError('접근 가능한 문서 ID와 원문 버전을 먼저 확인하세요.');
  const extraction = await extractAttachment(paths[1]);
  const result = bindExtraction(dataset, documentId, attachmentId, extraction);
  await atomicJson(paths[2], result);
  console.log(JSON.stringify({ok: true, format: extraction.format, units: extraction.units.length, warnings: extraction.warnings, note: '검색용 텍스트 추출. 기관 규정·첨부 금액의 자동 판정은 아님.'}, null, 2));
} catch (error) { console.error(error instanceof AppError ? error.message : '첨부를 연결하지 못했습니다. 입력 파일과 경로·쓰기 권한을 확인하세요.'); process.exitCode = 1; }
