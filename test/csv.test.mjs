import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv, convertCsv} from '../src/csv.mjs';
const profile = {schemaVersion: 1, source: {label: '테스트', baseUrl: 'https://example.test', exportedAt: '2026-10-22T09:00:00+09:00'}, principal: {userId: 'u1', displayName: '사용자', organizationId: 'org1'}, delimiter: ',', columns: {id: 'id', type: 'type', title: 'title', status: 'status', updatedAt: 'updatedAt'}};
const csv = 'id,type,title,status,updatedAt\r\nx,notice,안내,published,2026-10-22T09:00:00+09:00\r\n';
test('CSV supports UTF-8 BOM, quoted multiline text, delimiters and escaped quotes', () => {
  assert.deepEqual(parseCsv('\uFEFF제목,본문\r\n"공고, 안내","첫줄\r\n""둘째줄"""\r\n'), [{'제목': '공고, 안내', '본문': '첫줄\r\n"둘째줄"'}]);
  assert.deepEqual(parseCsv('a\tb\n1\t2', '\t'), [{a: '1', b: '2'}]);
});
test('CSV profile creates a strict dataset scoped to the exporting user', () => {
  const dataset = convertCsv(csv, profile);
  assert.equal(dataset.source.kind, 'manual-export'); assert.deepEqual(dataset.items[0].allowedUserIds, ['u1']); assert.equal(dataset.items[0].organizationId, 'org1');
  assert.equal(dataset.items[0].updatedAt, '2026-10-22T00:00:00.000Z');
});
test('malformed rows, duplicate headers, unclosed quotes and duplicate ids fail', () => {
  for (const value of ['a,a\n1,2', 'a,b\n1', 'a\n"open', 'a\n"closed"x', 'a\nab"cd', 'a\n']) assert.throws(() => parseCsv(value));
  assert.throws(() => convertCsv(csv + csv.split('\r\n')[1], profile), /id/);
});
test('missing mappings, unknown columns, invalid statuses and auth URLs fail', () => {
  assert.throws(() => convertCsv(csv, {...profile, columns: {...profile.columns, body: 'missing'}}), /머리글/);
  assert.throws(() => convertCsv(csv, {...profile, columns: {...profile.columns, cookies: 'title'}}));
  assert.throws(() => convertCsv(csv.replace('published', 'anything'), profile), /status/);
  assert.throws(() => convertCsv('id,type,title,status,updatedAt,url\nx,notice,a,published,2026-10-22T09:00:00Z,https://example.test/?token=secret', {...profile, columns: {...profile.columns, url: 'url'}}), /인증/);
});
