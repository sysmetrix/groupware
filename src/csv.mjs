import {AppError, object, validateDataset, itemTypes, statuses} from './schema.mjs';

// RFC 4180-style CSV, including quoted commas, escaped quotes and multiline cells.
export function parseCsv(text, delimiter = ',') {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 5 * 1024 * 1024 || ![',', '\t'].includes(delimiter)) throw new AppError('UTF-8 CSV/TSV 파일은 최대 5 MB입니다.');
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  const pushCell = () => { row.push(cell); cell = ''; closed = false; };
  const pushRow = () => { pushCell(); if (row.some(x => x !== '')) rows.push(row); row = []; if (rows.length > 3001) throw new AppError('CSV는 최대 3,000개 자료입니다.'); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; }
    else if (c === delimiter) pushCell();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (c === '"' && !cell && !closed) quoted = true;
    else { if (closed || c === '"') throw new AppError('CSV 따옴표 형식이 잘못되었습니다.'); cell += c; }
  }
  if (quoted) throw new AppError('CSV 따옴표가 닫히지 않았습니다.');
  if (cell || row.length || closed) pushRow();
  if (rows.length < 2) throw new AppError('CSV에 머리글과 자료 행이 필요합니다.');
  const headers = rows.shift().map(x => x.trim());
  if (headers.some(x => !x) || new Set(headers).size !== headers.length) throw new AppError('CSV 머리글은 비어 있거나 중복될 수 없습니다.');
  return rows.map(row => { if (row.length !== headers.length) throw new AppError('CSV 행의 열 개수가 머리글과 다릅니다.'); return Object.fromEntries(headers.map((h, i) => [h, row[i]])); });
}

export const exampleCsvProfile = {
  schemaVersion: 1,
  principal: {userId: 'my-user', displayName: '내 이름', organizationId: 'my-org'},
  source: {label: '내보낸 업무자료', baseUrl: 'https://groupware.example', exportedAt: '2026-01-01T09:00:00+09:00'},
  delimiter: ',',
  columns: {id: '문서번호', type: '유형', title: '제목', body: '본문', status: '상태', updatedAt: '수정시각', dueDate: '기한', url: '원문URL', startsAt: '시작시각', endsAt: '종료시각'},
};
export function convertCsv(text, profile) {
  object(profile, 'CSV profile', ['schemaVersion', 'principal', 'source', 'delimiter', 'columns', 'valueMaps']);
  if (profile.schemaVersion !== 1) throw new AppError('CSV profile 버전은 1이어야 합니다.');
  object(profile.source, 'source', ['label', 'baseUrl', 'exportedAt']);
  const fields = ['id', 'type', 'title', 'body', 'status', 'updatedAt', 'dueDate', 'url', 'startsAt', 'endsAt', 'effectiveFrom', 'effectiveTo', 'version'];
  object(profile.columns, 'columns', fields);
  for (const key of ['id', 'type', 'title', 'status', 'updatedAt']) if (!profile.columns[key]) throw new AppError(`CSV 열 매핑에 ${key}가 필요합니다.`);
  for (const header of Object.values(profile.columns)) if (typeof header !== 'string' || !header.trim()) throw new AppError('CSV 열 매핑에는 머리글 이름을 지정하세요.');
  const valueMaps = profile.valueMaps ?? {};
  object(valueMaps, 'valueMaps', ['type', 'status']);
  for (const [field, mapping] of Object.entries(valueMaps)) {
    object(mapping, `valueMaps.${field}`);
    if (!Object.keys(mapping).length || Object.keys(mapping).length > 100) throw new AppError('값 매핑은 1~100개 항목이어야 합니다.');
    const allowed = field === 'type' ? itemTypes : statuses;
    for (const [from, to] of Object.entries(mapping)) if (!from.trim() || from !== from.trim() || !allowed.includes(to)) throw new AppError('값 매핑의 출처 값 또는 표준 값이 잘못되었습니다.');
  }
  const rows = parseCsv(text, profile.delimiter);
  const items = rows.map(row => {
    const item = {};
    for (const [field, header] of Object.entries(profile.columns)) {
      if (!Object.hasOwn(row, header)) throw new AppError(`CSV에 매핑된 머리글이 없습니다: ${header}`);
      item[field] = row[header].trim();
      if (Object.hasOwn(valueMaps, field)) {
        if (!Object.hasOwn(valueMaps[field], item[field])) throw new AppError(`CSV ${field}에 매핑되지 않은 값이 있습니다. 설정을 확인하세요.`);
        item[field] = valueMaps[field][item[field]];
      }
    }
    return {...item, organizationId: profile.principal?.organizationId, allowedUserIds: [profile.principal?.userId]};
  });
  return validateDataset({schemaVersion: 1, principal: profile.principal, source: {...profile.source, kind: 'manual-export'}, items});
}
