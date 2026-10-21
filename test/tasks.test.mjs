import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoDataset} from '../src/demo.mjs';
import {validateDataset, visibleItems, kstDate} from '../src/schema.mjs';
import {buildBriefing, searchDocuments, validateDraft, runTask} from '../src/tasks.mjs';
const now = new Date('2026-10-22T00:00:00Z');
const demo = () => createDemoDataset(now);

test('authorization and organization are filtered before returning records', () => {
  const dataset = demo();
  assert.equal(visibleItems(dataset).length, 10);
  assert.equal(visibleItems(dataset).some(x => ['hidden-doc', 'other-org-doc'].includes(x.id)), false);
  assert.equal(searchDocuments(dataset, '테스트용', now).hits.length, 0);
});
test('empty ACL never grants access', () => {
  const dataset = demo(); dataset.items.forEach(x => { x.allowedUserIds = []; });
  assert.equal(visibleItems(validateDataset(dataset)).length, 0);
});
test('briefing excludes completed approval and counts overdue in Korea', () => {
  const result = buildBriefing(demo(), now);
  assert.deepEqual(result.counts, {pending: 2, overdue: 1, schedules: 2, notices: 2});
  assert.equal(result.approvals[0].id, 'approval-002');
  assert.equal(kstDate(new Date('2026-10-21T15:05:00Z')), '2026-10-22');
});
test('schedules exclude cancelled, completed, ended, and seven-day boundary', () => {
  const dataset = demo(), sample = dataset.items.find(x => x.type === 'schedule');
  dataset.items = [
    {...sample, id: 'cancelled', status: 'cancelled'},
    {...sample, id: 'completed', status: 'completed'},
    {...sample, id: 'ended', startsAt: '2026-10-21T22:00:00Z', endsAt: '2026-10-21T23:00:00Z'},
    {...sample, id: 'future', startsAt: '2026-10-29T00:00:00+09:00', endsAt: '2026-10-29T01:00:00+09:00'},
    {...sample, id: 'ongoing', startsAt: '2026-10-21T23:30:00Z', endsAt: '2026-10-22T00:30:00Z'},
  ];
  assert.deepEqual(buildBriefing(validateDataset(dataset), now).schedules.map(x => x.id), ['ongoing']);
});
test('document search excludes expired and future effective documents', () => {
  const dataset = demo(); dataset.items.push({...dataset.items.find(x => x.id === 'doc-001'), id: 'future', effectiveFrom: '2026-10-23'});
  const result = searchDocuments(validateDataset(dataset), '운영계획', now);
  assert.deepEqual(result.hits.map(x => x.id), ['doc-001']);
  assert.match(result.hits[0].excerpt, /실제 기관의 규정이 아닙니다/);
});
test('missing evidence gives abstention, not fabricated content', () => {
  const result = searchDocuments(demo(), '찾을수없는키워드', now);
  assert.equal(result.hits.length, 0); assert.match(result.message, /찾지 못했습니다/);
  assert.throws(() => searchDocuments(demo(), '!!!', now));
});
test('schema rejects secrets, duplicate ids, invalid dates, and unsafe links', () => {
  for (const mutate of [
    d => { d.authToken = 'do-not-persist'; },
    d => { d.items.push(d.items[0]); },
    d => { d.items[0].dueDate = '2026-02-30'; },
    d => { d.items[0].dueDate = 0; },
    d => { d.items[0].allowedUserIds = '*'; },
    d => { d.items[0].url = 'javascript:alert(1)'; },
    d => { d.source.baseUrl = 'https://example.com'; d.items[0].url = 'https://elsewhere.example/document'; },
    d => { d.source.baseUrl = 'https://example.com'; d.items[0].url = 'https://example.com/#/doc?accessToken=secret'; },
    d => { d.source.baseUrl = 'https://example.com'; d.items[0].url = 'https://example.com/#/%ZZ'; },
  ]) { const dataset = demo(); mutate(dataset); assert.throws(() => validateDataset(dataset)); }
});
test('valid same-origin source URL and explicit ACL survive import', () => {
  const dataset = demo(); dataset.source.baseUrl = 'https://example.com'; dataset.items[0].url = 'https://example.com/#/document/one';
  assert.equal(validateDataset(dataset).items[0].url, dataset.items[0].url);
});
test('money mismatch and invalid dates fail deterministic draft checks', () => {
  const result = validateDraft({title: '제목', purpose: '목적', businessDate: '2026-02-30', amount: '1,000', attachmentAmount: '900', attachmentNames: '예제.pdf'});
  assert.equal(result.passed, false);
  assert.deepEqual(result.findings.map(x => x.code), ['INVALID_DATE', 'AMOUNT_MISMATCH']);
});
test('missing draft fields and malformed money cannot pass', () => {
  assert.equal(validateDraft({}).passed, false);
  for (const value of ['1e3', '-1', '12,34', '9007199254740992']) {
    const result = validateDraft({title: '제목', purpose: '목적', businessDate: '2026-10-22', amount: value});
    assert.equal(result.passed, false);
  }
});
test('zero amount is a real amount and no attachment claim is invented', () => {
  const result = validateDraft({title: '제목', purpose: '목적', businessDate: '2026-10-22', amount: '0', attachmentAmount: '0'});
  assert.equal(result.passed, true); assert.deepEqual(result.findings.map(x => x.code), ['ATTACHMENT_UNCONFIRMED']);
  assert.match(result.limitations.join(' '), /실제 첨부 파일은 열지 않습니다/);
});
test('unknown or mutation operations are rejected', () => {
  for (const task of ['approve', 'submit', 'send', 'fetch', 'delete']) assert.throws(() => runTask(demo(), {task}, now));
  assert.throws(() => runTask(demo(), {task: 'briefing', url: 'https://example.com'}, now));
});
