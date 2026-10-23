import {AppError, object, string, validateDataset, visibleItems} from './schema.mjs';

export class SyncError extends AppError {
  constructor(code, message) { super(message, 409); this.code = code; }
}
const fail = (code, message) => { throw new SyncError(code, message); };
const identityKeys = ['connectorId', 'contractVersion', 'userId', 'organizationId', 'baseUrl', 'queryKey'];
export function validateScope(value) {
  object(value, 'scope', identityKeys);
  const scope = Object.fromEntries(identityKeys.map(key => [key, string(value[key], `scope.${key}`, key === 'baseUrl' ? 2048 : 120)]));
  let url;
  try { url = new URL(scope.baseUrl); } catch { fail('INVALID_SCOPE', '수집 출처 origin을 확인하세요.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.origin !== scope.baseUrl) fail('INVALID_SCOPE', '수집 출처는 경로·인증값이 없는 origin이어야 합니다.');
  return scope;
}
const sameScope = (a, b) => identityKeys.every(key => a[key] === b[key]);
function cursor(value, name) { return value === null ? null : string(value, name, 2048); }
function scopedDataset(value, scope) {
  const data = validateDataset(value);
  if (data.source.kind !== 'manual-export' || data.source.baseUrl !== scope.baseUrl || data.principal.userId !== scope.userId || data.principal.organizationId !== scope.organizationId) fail('SCOPE_CHANGED', '수집 사용자·조직·출처가 설정과 다릅니다.');
  return data;
}
export function validateSyncState(value) {
  object(value, 'sync state', ['schemaVersion', 'scope', 'checkpoint', 'dataset']);
  if (value.schemaVersion !== 1) fail('INVALID_STATE', '수집 상태 버전을 확인하세요.');
  const scope = validateScope(value.scope), checkpoint = string(value.checkpoint, 'checkpoint', 2048);
  const dataset = scopedDataset(value.dataset, scope);
  if (visibleItems(dataset).length !== dataset.items.length) fail('INVALID_STATE', '수집 상태에는 현재 권한 내 자료만 보관해야 합니다.');
  return {schemaVersion: 1, scope, checkpoint, dataset};
}

// A normalized adapter boundary, not an Amaranth protocol or authentication client.
// This function has no persistence or network effects; callers publish only a complete result.
export async function collectPages({scope: rawScope, expectedScope, previous = null, mode, fromCheckpoint, source, principal, pages, now = new Date(), maxAgeHours = 72, maxPages = 1000}) {
  const scope = validateScope(rawScope), expected = validateScope(expectedScope);
  if (!sameScope(scope, expected)) fail('SCOPE_CHANGED', '수집 범위가 설정과 다릅니다.');
  if (!['full', 'delta'].includes(mode)) fail('INVALID_MODE', 'full 또는 delta 수집만 지원합니다.');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000 || !Number.isInteger(maxAgeHours) || maxAgeHours < 1 || maxAgeHours > 720) fail('INVALID_LIMIT', '수집 제한을 확인하세요.');
  const base = previous && validateSyncState(previous);
  if (base && !sameScope(base.scope, scope)) fail('SCOPE_CHANGED', '범위가 바뀌었습니다. 별도 상태 파일로 전체 수집하세요.');
  if (mode === 'delta' && (!base || fromCheckpoint !== base.checkpoint)) fail('CHECKPOINT_MISMATCH', '증분 기준이 맞지 않습니다. 체크포인트를 확인하거나 전체 수집하세요.');
  if (mode === 'full' && fromCheckpoint !== null) fail('CHECKPOINT_MISMATCH', '전체 수집은 fromCheckpoint가 null이어야 합니다.');
  const header = scopedDataset({schemaVersion: 1, source, principal, items: []}, scope);
  const time = new Date(header.source.exportedAt).getTime(), age = now.getTime() - time;
  if (!Number.isFinite(age) || age < -300000 || age > maxAgeHours * 3600000) fail('STALE_SOURCE', '수집 기준 시각을 확인하세요.');
  if (base && time < Date.parse(base.dataset.source.exportedAt)) fail('SOURCE_ROLLBACK', '기존 수집보다 과거인 자료입니다.');
  if (!pages || (!pages[Symbol.iterator] && !pages[Symbol.asyncIterator])) fail('INVALID_PAGES', '수집 페이지가 필요합니다.');
  const records = new Map((mode === 'delta' ? base.dataset.items : []).map(item => [item.id, item]));
  const visited = new Set(), changed = new Set();
  let next = null, checkpoint = null, declaredTotal, received = 0, pageCount = 0, done = false;
  for await (const raw of pages) {
    if (done) fail('EXTRA_PAGE', '마지막 페이지 뒤에 자료가 있습니다.');
    if (++pageCount > maxPages) fail('PAGE_LIMIT', '수집 페이지 제한을 초과했습니다.');
    object(raw, 'page', ['cursor', 'nextCursor', 'checkpoint', 'total', 'items', 'deletedIds']);
    const current = cursor(raw.cursor, 'cursor'), following = cursor(raw.nextCursor, 'nextCursor');
    if (current !== next || visited.has(current)) fail('CURSOR_MISMATCH', '페이지 순서가 맞지 않거나 반복됐습니다.');
    visited.add(current);
    if (following !== null && visited.has(following)) fail('CURSOR_MISMATCH', '페이지 커서가 순환합니다.');
    if (!Number.isInteger(raw.total) || raw.total < 0 || raw.total > 3000 || (declaredTotal !== undefined && raw.total !== declaredTotal)) fail('TOTAL_MISMATCH', '전체 변경 건수가 일관되지 않습니다.');
    declaredTotal = raw.total;
    const part = scopedDataset({...header, items: raw.items}, scope);
    if (!Array.isArray(raw.deletedIds) || raw.deletedIds.length > 3000 || (mode === 'full' && raw.deletedIds.length)) fail('INVALID_DELETE', '삭제 목록은 증분 수집에서만 사용할 수 있습니다.');
    for (const id of [...part.items.map(item => item.id), ...raw.deletedIds]) {
      if (typeof id !== 'string' || id.length > 100 || !/^[a-zA-Z0-9_.:-]+$/.test(id) || changed.has(id)) fail('DUPLICATE_CHANGE', '동일 ID의 중복·상충 변경을 허용하지 않습니다.');
      changed.add(id);
    }
    received += part.items.length + raw.deletedIds.length;
    if (received > 3000 || received > declaredTotal) fail('TOTAL_MISMATCH', '수집 건수가 선언한 범위를 초과했습니다.');
    for (const item of part.items) {
      if (item.organizationId === scope.organizationId && item.allowedUserIds.includes(scope.userId)) records.set(item.id, item);
      else records.delete(item.id); // A permission-revoked update also removes old content.
    }
    for (const id of raw.deletedIds) records.delete(id);
    if (following === null) {
      checkpoint = string(raw.checkpoint, 'final checkpoint', 2048); done = true;
    } else if (raw.checkpoint !== null) fail('EARLY_CHECKPOINT', '마지막 페이지 전에 체크포인트를 확정할 수 없습니다.');
    next = following;
  }
  if (!done || !pageCount) fail('INCOMPLETE', '마지막 페이지를 확인하지 못했습니다.');
  if (received !== declaredTotal) fail('TOTAL_MISMATCH', '전체 수집 건수가 일치하지 않습니다.');
  const dataset = scopedDataset({...header, items: [...records.values()]}, scope);
  if (Buffer.byteLength(JSON.stringify(dataset)) > 5 * 1024 * 1024) fail('SIZE_LIMIT', '완성된 자료가 5 MB를 초과했습니다.');
  return {state: {schemaVersion: 1, scope, checkpoint, dataset}, summary: {mode, pageCount, received, visibleCount: dataset.items.length}};
}
