import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {AppError, object, validateDataset, visibleItems} from './schema.mjs';

const execute = promisify(execFile);
const extractor = fileURLToPath(new URL('../scripts/extract-attachment.py', import.meta.url));
const messages = {
  UNSUPPORTED_FORMAT: '지원 형식은 PDF·XLSX·HWPX입니다. 구형 HWP는 HWPX 또는 텍스트 PDF로 내보내세요.',
  PDF_DEPENDENCY_MISSING: '첨부용 Python 환경에 requirements-attachments.txt를 설치하세요.',
  ENCRYPTED: '암호화된 첨부는 처리하지 않습니다. 열람 가능한 내보내기 파일을 준비하세요.',
  NO_TEXT: '추출할 텍스트가 없습니다. 스캔 PDF에는 별도 OCR이 필요할 수 있습니다.',
};
export async function extractAttachment(file, {python = process.env.ATTACHMENT_PYTHON || 'python'} = {}) {
  try {
    const {stdout} = await execute(python, [extractor, file], {timeout: 30000, maxBuffer: 5 * 1024 * 1024, windowsHide: true, encoding: 'utf8'});
    return JSON.parse(stdout);
  } catch (error) {
    let code;
    try { code = JSON.parse(error.stdout).error; } catch { /* Never disclose raw parser errors or file contents. */ }
    if (error.code === 'ENOENT') throw new AppError('Python을 찾지 못했습니다. ATTACHMENT_PYTHON에 실행 파일 경로를 설정하세요.');
    throw new AppError(messages[code] || '첨부 형식·크기·복잡도 또는 처리 시간을 초과했습니다. 원본을 확인하세요.');
  }
}
export function bindExtraction(raw, documentId, attachmentId, result, now = new Date()) {
  const dataset = validateDataset(raw);
  const document = visibleItems(dataset).find(item => item.id === documentId && item.type === 'document');
  if (!document || !document.version) throw new AppError('접근 가능한 문서 ID와 원문 버전이 필요합니다.');
  object(result, 'extraction', ['schemaVersion', 'filename', 'format', 'sha256', 'warnings', 'units']);
  if (result.schemaVersion !== 1) throw new AppError('첨부 추출 결과 버전을 확인하세요.');
  const attachment = {id: attachmentId, filename: result.filename, format: result.format, sha256: result.sha256, documentVersion: document.version, documentUpdatedAt: document.updatedAt, extractedAt: now.toISOString(), warnings: result.warnings, units: result.units};
  document.attachments = [...(document.attachments || []).filter(item => item.id !== attachmentId), attachment];
  // visibleItems returns references to the validated clone. Parent ACL stays authoritative.
  const validated = validateDataset(dataset);
  if (Buffer.byteLength(JSON.stringify(validated, null, 2)) > 5 * 1024 * 1024) throw new AppError('첨부를 포함한 자료가 5 MB를 초과했습니다.');
  return validated;
}
