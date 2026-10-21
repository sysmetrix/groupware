export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const itemTypes = ['approval', 'notice', 'document', 'schedule'];
export const statuses = ['pending', 'completed', 'published', 'cancelled'];
const itemKeys = ['id', 'type', 'title', 'body', 'organizationId', 'allowedUserIds', 'status', 'dueDate', 'updatedAt', 'url', 'startsAt', 'endsAt', 'effectiveFrom', 'effectiveTo', 'version', 'tags'];
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

export function validateDataset(value) {
  object(value, 'dataset', ['schemaVersion', 'source', 'principal', 'items']);
  if (value.schemaVersion !== 1) throw new AppError('schemaVersion은 1이어야 합니다.');
  object(value.source, 'source', ['kind', 'label', 'exportedAt', 'baseUrl']);
  if (!['demo', 'manual-export'].includes(value.source.kind)) throw new AppError('source.kind는 demo 또는 manual-export여야 합니다.');
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
    return result;
  });
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
