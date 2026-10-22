import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoDataset} from '../src/demo.mjs';
import {bindExtraction} from '../src/attachments.mjs';
import {validateDataset} from '../src/schema.mjs';
import {searchDocuments} from '../src/tasks.mjs';
import {collectPages} from '../src/sync.mjs';
import {summarize, validateModelConfig} from '../src/model.mjs';
const now = new Date('2026-10-22T00:00:00Z');
const extraction = () => ({schemaVersion: 1, filename: 'synthetic.pdf', format: 'pdf', sha256: 'a'.repeat(64), warnings: ['PDF_LAYOUT_NOT_PRESERVED'], units: [{id: 'p2', location: {page: 2}, text: '합성첨부검색키 확인 문장'}]});
const bound = () => bindExtraction(createDemoDataset(now), 'doc-001', 'fixture', extraction(), now);

test('attachment binding clones input and replaces only the same attachment ID', () => {
  const original = createDemoDataset(now), before = structuredClone(original);
  const first = bindExtraction(original, 'doc-001', 'fixture', extraction(), now);
  assert.deepEqual(original, before);
  const second = bindExtraction(first, 'doc-001', 'fixture', {...extraction(), sha256: 'b'.repeat(64)}, now);
  const doc = second.items.find(x => x.id === 'doc-001');
  assert.equal(doc.attachments.length, 1); assert.equal(doc.attachments[0].sha256, 'b'.repeat(64));
  assert.equal(first.items.find(x => x.id === doc.id).attachments[0].sha256, 'a'.repeat(64));
  assert.deepEqual(second.source, first.source);
});

test('binding requires an accessible versioned document', () => {
  for (const id of ['hidden-doc', 'other-org-doc', 'approval-001', 'missing']) assert.throws(() => bindExtraction(createDemoDataset(now), id, 'fixture', extraction(), now));
  const data = createDemoDataset(now); data.items.find(x => x.id === 'doc-001').version = '';
  assert.throws(() => bindExtraction(data, 'doc-001', 'fixture', extraction(), now));
});

test('stale version and updated time invalidate attached evidence', () => {
  for (const mutate of [d => { d.version = 'new'; }, d => { d.updatedAt = '2026-10-23T00:00:00Z'; }]) {
    const data = bound(); mutate(data.items.find(x => x.id === 'doc-001'));
    assert.throws(() => validateDataset(data), /버전·시각/);
  }
});

test('attachment schema rejects unsafe locations, duplicate units, and oversized text', () => {
  for (const mutate of [
    a => { a.filename = '../secret.pdf'; }, a => { a.sha256 = 'invalid'; },
    a => { a.units[0].location.page = 0; }, a => { a.units[0].location.url = 'file:///secret'; },
    a => { a.units.push(a.units[0]); }, a => { a.units[0].text = 'x'.repeat(30001); },
    a => { a.warnings = ['unknown']; }, a => { a.units = []; },
  ]) { const data = bound(); mutate(data.items.find(x => x.id === 'doc-001').attachments[0]); assert.throws(() => validateDataset(data)); }
});

test('search carries attachment location and fingerprint into references', () => {
  const result = searchDocuments(bound(), '합성첨부검색키', now);
  assert.equal(result.hits.length, 1);
  const hit = result.hits[0];
  assert.equal(hit.id, 'attachment#doc-001#fixture#p2'); assert.equal(hit.documentId, 'doc-001');
  assert.equal(hit.locationLabel, 'PDF 2쪽'); assert.equal(hit.attachment.sha256, 'a'.repeat(64));
  assert.deepEqual(result.references[0].attachment, hit.attachment);
  for (const [format, location, label] of [['xlsx', {sheet: '예산', cell: 'B12'}, '예산 · B12'], ['hwpx', {section: 2, paragraph: 3}, '구역 2 · 문단 3']]) {
    const data = bindExtraction(createDemoDataset(now), 'doc-001', 'fixture', {...extraction(), filename: `fixture.${format}`, format, warnings: [], units: [{id: 'unit', location, text: '합성첨부검색키'}]}, now);
    assert.equal(searchDocuments(data, '합성첨부검색키', now).hits[0].locationLabel, label);
  }
});

test('attachment results disappear with parent ACL, organization, expiry, status or deletion', () => {
  for (const mutate of [d => { d.allowedUserIds = []; }, d => { d.organizationId = 'other'; }, d => { d.effectiveTo = '2026-10-21'; }, d => { d.status = 'cancelled'; }]) {
    const data = bound(); mutate(data.items.find(x => x.id === 'doc-001'));
    assert.equal(searchDocuments(validateDataset(data), '합성첨부검색키', now).hits.length, 0);
  }
  const data = bound(); data.items = data.items.filter(x => x.id !== 'doc-001');
  assert.equal(searchDocuments(data, '합성첨부검색키', now).hits.length, 0);
});

test('sync delta revocation, deletion and new document version remove old attachment hits', async () => {
  const data = bound(); data.source.kind = 'manual-export'; data.source.baseUrl = 'https://example.invalid';
  const scope = {connectorId: 'fixture', contractVersion: '1', ...data.principal, baseUrl: data.source.baseUrl, queryKey: 'all'};
  delete scope.displayName;
  const page = {cursor: null, nextCursor: null, checkpoint: 'v1', total: data.items.length, items: data.items, deletedIds: []};
  const input = {scope, expectedScope: scope, mode: 'full', fromCheckpoint: null, source: data.source, principal: data.principal, pages: [page], now};
  const {state: previous} = await collectPages(input);
  const doc = previous.dataset.items.find(x => x.id === 'doc-001');
  const updated = {...doc, version: 'new'}; delete updated.attachments;
  for (const change of [{items: [], deletedIds: [doc.id]}, {items: [{...doc, allowedUserIds: []}], deletedIds: []}, {items: [updated], deletedIds: []}]) {
    const {state} = await collectPages({...input, previous, mode: 'delta', fromCheckpoint: 'v1', pages: [{...page, ...change, total: 1, checkpoint: 'v2'}]});
    assert.equal(searchDocuments(state.dataset, '합성첨부검색키', now).hits.length, 0);
  }
});

test('model receives attachment location and accepts only returned evidence IDs', async () => {
  const result = searchDocuments(bound(), '합성첨부검색키', now), id = result.hits[0].id;
  const config = validateModelConfig({model: 'fixture', baseUrl: 'http://127.0.0.1:11434'});
  let payload;
  const output = await summarize(result, config, async (url, options) => {
    payload = JSON.parse(JSON.parse(options.body).messages[1].content);
    return new Response(JSON.stringify({message: {content: JSON.stringify({claims: [{text: '합성 문장', sourceIds: [id]}]})}}));
  });
  assert.equal(payload.evidence[0].locationLabel, 'PDF 2쪽');
  assert.equal(output.claims[0].sourceIds[0], result.references[0].id);
  await assert.rejects(summarize(result, config, async () => new Response(JSON.stringify({message: {content: JSON.stringify({claims: [{text: '틀린 위치', sourceIds: [id + '3']}]})}}))));
});
