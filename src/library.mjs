import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createStore} from './store.mjs';
import {AppError, string} from './schema.mjs';
import {extractAttachment, bindExtraction} from './attachments.mjs';

export const documentLimit = 20 * 1024 * 1024;
export function documentFilename(value) {
  const filename = string(value, '파일 이름', 200);
  if (/[\\/\x00-\x1f\x7f]/.test(filename) || !/\.(pdf|xlsx|hwpx)$/i.test(filename)) throw new AppError('PDF·XLSX·HWPX 파일을 선택하세요. 구형 HWP는 HWPX로 내보내세요.');
  return filename;
}
const emptyLibrary = () => ({schemaVersion: 1,
  source: {kind: 'manual-export', label: '직접 넣은 내 문서', exportedAt: new Date().toISOString(), baseUrl: ''},
  principal: {userId: 'local-library', displayName: '이 PC의 문서', organizationId: 'local-library'}, items: []});

// A separate store keeps a scheduled groupware import from replacing personal documents.
export async function createLibrary(directory, {extract = extractAttachment} = {}) {
  const store = await createStore(directory, {initialDataset: emptyLibrary()});
  const files = path.join(directory, 'files');
  await fs.mkdir(files, {recursive: true, mode: 0o700});
  let busy = false;
  const filePath = item => path.join(files, item.id + '.' + item.attachments[0].format);
  function list() {
    const {dataset, revision} = store.snapshot();
    return {revision, documents: dataset.items.map(item => ({id: item.id, title: item.title, updatedAt: item.updatedAt,
      filename: item.attachments[0].filename, format: item.attachments[0].format, units: item.attachments[0].units.length,
      warnings: item.attachments[0].warnings, url: `/api/documents/${item.id}/file`}))};
  }
  return {
    snapshot: store.snapshot,
    list,
    preview(id, offset = 0) {
      if (!Number.isSafeInteger(offset) || offset < 0) throw new AppError('문서 위치를 확인하세요.');
      const item = store.snapshot().dataset.items.find(item => item.id === id);
      if (!item) throw new AppError('문서를 찾을 수 없습니다.', 404);
      const attachment = item.attachments[0];
      return {title: item.title, format: attachment.format, warnings: attachment.warnings, total: attachment.units.length,
        units: attachment.units.slice(offset, offset + 10), nextOffset: offset + 10 < attachment.units.length ? offset + 10 : null};
    },
    async add(filename, bytes) {
      filename = documentFilename(filename);
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > documentLimit) throw new AppError('문서는 0바이트보다 크고 20 MB 이하여야 합니다.', 413);
      if (busy) throw new AppError('문서 처리 중입니다. 완료 후 다시 시도하세요.', 429);
      busy = true;
      let temporary, destination, committed = false;
      try {
        const {dataset, revision} = store.snapshot();
        const digest = createHash('sha256').update(bytes).digest('hex');
        const duplicate = dataset.items.find(item => item.attachments[0].sha256 === digest);
        if (duplicate) return {duplicate: true, id: duplicate.id, ...list()};
        if (dataset.items.length >= 50) throw new AppError('내 문서는 최대 50개입니다. 사용하지 않는 문서를 먼저 삭제하세요.');
        const sizes = await Promise.all(dataset.items.map(item => fs.stat(filePath(item))));
        if (sizes.reduce((sum, stat) => sum + stat.size, bytes.length) > 200 * 1024 * 1024) throw new AppError('내 문서 원본은 합계 200 MB까지 보관합니다.');
        const id = 'local-' + randomUUID(), format = filename.split('.').at(-1).toLowerCase();
        temporary = path.join(files, 'upload-' + randomUUID() + '.' + format);
        await fs.writeFile(temporary, bytes, {flag: 'wx', mode: 0o600});
        const extraction = await extract(temporary);
        if (extraction.sha256 !== digest || extraction.format !== format) throw new AppError('추출한 문서와 업로드한 파일이 일치하지 않습니다.');
        extraction.filename = filename;
        const now = new Date().toISOString();
        dataset.source.exportedAt = now;
        dataset.items.push({id, type: 'document', status: 'published', title: filename, body: '',
          organizationId: dataset.principal.organizationId, allowedUserIds: [dataset.principal.userId],
          updatedAt: now, version: digest.slice(0, 16), tags: ['개인 문서']});
        const next = bindExtraction(dataset, id, 'original', extraction);
        destination = path.join(files, id + '.' + format);
        await fs.rename(temporary, destination);
        await store.replace(next, {expectedRevision: revision});
        committed = true;
        return {duplicate: false, id, ...list()};
      } finally {
        // A completed index write can precede an audit failure; never remove its original.
        const retained = destination && store.snapshot().dataset.items.some(item => filePath(item) === destination);
        try {
          if (temporary) await fs.rm(temporary, {force: true});
          if (destination && !committed && !retained) await fs.rm(destination, {force: true});
        } finally { busy = false; }
      }
    },
    async remove(id, expectedRevision) {
      if (busy) throw new AppError('문서 처리 중입니다. 완료 후 다시 시도하세요.', 429);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new AppError('문서 목록을 새로고침하세요.');
      busy = true;
      try {
        const {dataset, revision} = store.snapshot();
        if (revision !== expectedRevision) throw new AppError('문서 목록이 변경되었습니다. 다시 확인하세요.', 409);
        const item = dataset.items.find(item => item.id === id);
        if (!item) throw new AppError('문서를 찾을 수 없습니다.', 404);
        dataset.items = dataset.items.filter(item => item.id !== id);
        dataset.source.exportedAt = new Date().toISOString();
        await store.replace(dataset, {expectedRevision});
        await fs.rm(filePath(item), {force: true});
        return list();
      } finally { busy = false; }
    },
    async original(id) {
      const item = store.snapshot().dataset.items.find(item => item.id === id);
      if (!item) throw new AppError('문서를 찾을 수 없습니다.', 404);
      const content = await fs.readFile(filePath(item));
      if (createHash('sha256').update(content).digest('hex') !== item.attachments[0].sha256) throw new AppError('원본 파일이 변경되었습니다. 다시 가져오세요.', 409);
      return {content, filename: item.attachments[0].filename};
    },
  };
}

export function linkLibraryResults(result) {
  for (const item of [...(result.hits || []), ...result.references]) item.url = `/api/documents/${encodeURIComponent(item.documentId || item.id)}/file`;
  return result;
}
