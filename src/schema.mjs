export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const itemTypes = ['approval', 'notice', 'document', 'schedule'];
export const statuses = ['pending', 'in-progress', 'completed', 'published', 'cancelled'];
const itemKeys = ['id', 'type', 'title', 'body', 'organizationId', 'allowedUserIds', 'status', 'dueDate', 'updatedAt', 'url', 'startsAt', 'endsAt', 'effectiveFrom', 'effectiveTo', 'version', 'tags', 'attachments'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function object(value, name, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(`${name}: 객체가 필요합니다.`);
  if (keys && Object.keys(value).some(key => !keys.includes(key))) throw new AppError(`${name}: 지원하지 않는 필드가 있습니다.`);
  return value;
}

export function string(value, name, max = 200, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError(`${name}: 1~${max}자의 문자열이 필요합니다.`);
  return value.trim();
}

export function date(value, name, optional = true) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !datePattern.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new AppError(`${name}: 유효한 YYYY-MM-DD 날짜가 필요합니다.`);
  return value;
}

function timestamp(value, name, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new AppError(`${name}: 시간대가 포함된 ISO 시각이 필요합니다.`);
  date(value.slice(0, 10), name, false);
  return new Date(value).toISOString();
}

function strings(value, name, maxCount = 100) {
  if (!Array.isArray(value) || value.length > maxCount) throw new AppError(`${name}: 최대 ${maxCount}개 배열이 필요합니다.`);
  return [...new Set(value.map(v => string(v, name, 120)))];
}

function sourceUrl(value, baseUrl) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new AppError('원문 URL 형식이 잘못되었습니다.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !baseUrl || url.origin !== new URL(baseUrl).origin) throw new AppError('원문 URL은 지정한 출처와 같은 origin이어야 합니다.');
  let decoded;
  try { decoded = decodeURIComponent(url.search + url.hash); } catch { throw new AppError('URL 인코딩이 잘못되었습니다.'); }
  if (/(?:token|auth|secret|signkey|password|sessionid)=/i.test(decoded)) throw new AppError('인증 정보가 포함된 URL은 가져올 수 없습니다.');
  return url.href;
}

const attachmentWarnings = ['PDF_LAYOUT_NOT_PRESERVED', 'PDF_TEXTLESS_PAGES', 'XLSX_RAW_CELL_VALUES', 'XLSX_HIDDEN_SHEETS_SKIPPED', 'XLSX_FORMULAS_NOT_EVALUATED', 'HWPX_LAYOUT_NOT_PRESERVED'];
function validateAttachments(values, parent) {
  if (parent.type !== 'document' || !parent.version || !Array.isArray(values) || values.length > 10) throw new AppError('첨부 근거는 버전이 있는 document에 최대 10개까지 연결합니다.');
  const seen = new Set(); let total = 0;
  return values.map(value => {
    object(value, 'attachment', ['id', 'filename', 'format', 'sha256', 'documentVersion', 'documentUpdatedAt', 'extractedAt', 'warnings', 'units']);
    const id = string(value.id, 'attachment.id', 100), filename = string(value.filename, 'filename', 200);
    if (!/^[a-zA-Z0-9_.:-]+$/.test(id) || seen.has(id) || /[\\/\x00-\x1f]/.test(filename)) throw new AppError('첨부 ID 중복 또는 파일 이름 형식을 확인하세요.');
    seen.add(id);
    if (!['pdf', 'xlsx', 'hwpx'].includes(value.format) || !filename.toLowerCase().endsWith('.' + value.format) || !/^[a-f0-9]{64}$/.test(value.sha256)) throw new AppError('첨부 형식과 SHA-256을 확인하세요.');
    const documentUpdatedAt = timestamp(value.documentUpdatedAt, 'documentUpdatedAt');
    if (value.documentVersion !== parent.version || documentUpdatedAt !== parent.updatedAt) throw new AppError('첨부 근거의 문서 버전·시각이 현재 원문과 다릅니다. 다시 추출하세요.');
    if (!Array.isArray(value.warnings) || value.warnings.some(x => !attachmentWarnings.includes(x)) || value.warnings.length > 6) throw new AppError('첨부 추출 경고 형식을 확인하세요.');
    if (!Array.isArray(value.units) || !value.units.length || value.units.length > 1000) throw new AppError('첨부 추출 단위는 1~1,000개입니다.');
    const unitIds = new Set();
    const units = value.units.map(unit => {
      object(unit, 'attachment unit', ['id', 'location', 'text']);
      const unitId = string(unit.id, 'unit.id', 100), text = string(unit.text, 'unit.text', 30000);
      if (!/^[a-zA-Z0-9_.:-]+$/.test(unitId) || unitIds.has(unitId)) throw new AppError('첨부 추출 단위 ID가 중복되거나 형식이 잘못됐습니다.');
      unitIds.add(unitId); total += text.length;
      if (total > 300000) throw new AppError('문서별 첨부 텍스트는 최대 300,000자입니다.');
      const keys = value.format === 'pdf' ? ['page'] : value.format === 'xlsx' ? ['sheet', 'cell'] : ['section', 'paragraph'];
      object(unit.location, 'location', keys);
      const location = {};
      for (const key of keys) {
        if (key === 'sheet') location[key] = string(unit.location[key], key, 100);
        else if (key === 'cell') { if (!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(unit.location[key])) throw new AppError('셀 위치를 확인하세요.'); location[key] = unit.location[key]; }
        else { if (!Number.isInteger(unit.location[key]) || unit.location[key] < 1 || unit.location[key] > 10000) throw new AppError('페이지·문단 위치를 확인하세요.'); location[key] = unit.location[key]; }
      }
      return {id: unitId, location, text};
    });
    return {id, filename, format: value.format, sha256: value.sha256, documentVersion: parent.version, documentUpdatedAt, extractedAt: timestamp(value.extractedAt, 'extractedAt'), warnings: [...new Set(value.warnings)], units};
  });
}

export function validateDataset(value) {
  object(value, 'dataset', ['schemaVersion', 'source', 'principal', 'items']);
  if (value.schemaVersion !== 1) throw new AppError('schemaVersion은 1이어야 합니다.');
  object(value.source, 'source', ['kind', 'label', 'exportedAt', 'baseUrl', 'coverage']);
  if (!['demo', 'manual-export', 'browser-snapshot'].includes(value.source.kind)) throw new AppError('지원하지 않는 자료 출처입니다.');
  const source = {kind: value.source.kind, label: string(value.source.label, 'source.label'), exportedAt: timestamp(value.source.exportedAt, 'source.exportedAt'), baseUrl: ''};
  if (value.source.baseUrl) {
    let url;
    try { url = new URL(value.source.baseUrl); } catch { throw new AppError('source.baseUrl 형식이 잘못되었습니다.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new AppError('baseUrl에는 http(s) 출처만 지정하세요.');
    source.baseUrl = url.origin;
  }
  object(value.principal, 'principal', ['userId', 'displayName', 'organizationId']);
  const principal = Object.fromEntries(['userId', 'displayName', 'organizationId'].map(key => [key, string(value.principal[key], `principal.${key}`, 120)]));
  if (!Array.isArray(value.items) || value.items.length > 3000) throw new AppError('items는 최대 3,000개 배열이어야 합니다.');
  const seen = new Set();
  const items = value.items.map((item, index) => {
    object(item, `items[${index}]`, itemKeys);
    const id = string(item.id, 'id', 100);
    if (!/^[a-zA-Z0-9_.:-]+$/.test(id) || seen.has(id)) throw new AppError('id는 중복 없는 영문·숫자·_.:- 조합이어야 합니다.');
    seen.add(id);
    if (!itemTypes.includes(item.type) || !statuses.includes(item.status)) throw new AppError('지원하지 않는 type 또는 status입니다.');
    const result = {
      id, type: item.type, status: item.status,
      title: string(item.title, 'title', 300), body: string(item.body, 'body', 30000, true),
      organizationId: string(item.organizationId, 'organizationId', 120),
      allowedUserIds: strings(item.allowedUserIds, 'allowedUserIds'),
      updatedAt: timestamp(item.updatedAt, 'updatedAt'), url: sourceUrl(item.url, source.baseUrl),
      dueDate: date(item.dueDate, 'dueDate'), effectiveFrom: date(item.effectiveFrom, 'effectiveFrom'), effectiveTo: date(item.effectiveTo, 'effectiveTo'),
      startsAt: timestamp(item.startsAt, 'startsAt', true), endsAt: timestamp(item.endsAt, 'endsAt', true),
      version: string(item.version, 'version', 60, true), tags: strings(item.tags || [], 'tags', 20),
    };
    if (result.effectiveFrom && result.effectiveTo && result.effectiveFrom > result.effectiveTo) throw new AppError('문서의 유효 기간이 뒤바뀌었습니다.');
    if (result.type === 'schedule' && (!result.startsAt || !result.endsAt || result.startsAt >= result.endsAt)) throw new AppError('일정에는 시작보다 늦은 종료 시각이 필요합니다.');
    if (item.attachments !== undefined) result.attachments = validateAttachments(item.attachments, result);
    return result;
  });
  if (source.kind === 'browser-snapshot') {
    if (!source.baseUrl || !Array.isArray(value.source.coverage) || value.source.coverage.length !== itemTypes.length) throw new AppError('브라우저 자료에는 유형별 조회 범위가 필요합니다.');
    const covered = new Set();
    source.coverage = value.source.coverage.map(entry => {
      object(entry, 'coverage', ['type', 'state', 'query', 'collected', 'total', 'url']);
      if (!itemTypes.includes(entry.type) || covered.has(entry.type) || !['complete', 'partial', 'unobserved'].includes(entry.state)) throw new AppError('조회 범위의 유형·상태를 확인하세요.');
      covered.add(entry.type);
      const count = items.filter(item => item.type === entry.type).length;
      if (!Number.isSafeInteger(entry.collected) || entry.collected !== count || (entry.total !== null && (!Number.isSafeInteger(entry.total) || entry.total < count))) throw new AppError('조회 범위와 자료 건수가 일치하지 않습니다.');
      if (entry.state === 'complete' && entry.total !== count) throw new AppError('전체 조회는 합계와 수집 건수가 같아야 합니다.');
      if (entry.state === 'unobserved' && (count !== 0 || entry.total !== null)) throw new AppError('미조회 범위를 빈 조회 결과로 표시할 수 없습니다.');
      const url = sourceUrl(entry.url, source.baseUrl);
      if (entry.state !== 'unobserved' && !url) throw new AppError('조회 화면 주소가 필요합니다.');
      return {type: entry.type, state: entry.state, query: string(entry.query, 'coverage.query', 1000), collected: count, total: entry.total, url};
    });
  } else if (value.source.coverage !== undefined) throw new AppError('조회 범위는 browser-snapshot 자료에서만 사용합니다.');
  return {schemaVersion: 1, source, principal, items};
}

export function visibleItems(dataset) {
  const {userId, organizationId} = dataset.principal;
  return dataset.items.filter(item => item.organizationId === organizationId && item.allowedUserIds.includes(userId));
}

export function kstDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function effectiveDocument(item, today) {
  return item.status === 'published' && (!item.effectiveFrom || item.effectiveFrom <= today) && (!item.effectiveTo || item.effectiveTo >= today);
}
