import {AppError, validateDataset} from './schema.mjs';

// The browser driver supplies only values read from rendered UI. This adapter
// neither opens a browser nor reads cookies, storage or application internals.
export function buildBrowserSnapshot(capture, expectedPrincipal) {
  if (capture?.schemaVersion !== 1 || capture?.source?.kind !== 'browser-snapshot') throw new AppError('브라우저 조회 자료 형식이 필요합니다.');
  const dataset = validateDataset(capture);
  for (const key of ['userId', 'displayName', 'organizationId']) {
    if (!expectedPrincipal?.[key] || dataset.principal[key] !== expectedPrincipal[key]) throw new AppError('로그인 사용자·조직이 기대 범위와 다릅니다.');
  }
  for (const item of dataset.items) {
    if (item.organizationId !== dataset.principal.organizationId || item.allowedUserIds.length !== 1 || item.allowedUserIds[0] !== dataset.principal.userId) throw new AppError('브라우저 조회 자료는 확인한 현재 사용자에게만 연결합니다.');
  }
  return dataset;
}
