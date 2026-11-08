import test from 'node:test';
import assert from 'node:assert/strict';
import {attachmentMoney} from '../src/money.mjs';
import {createDemoDataset} from '../src/demo.mjs';
import {bindExtraction} from '../src/attachments.mjs';
import {searchDocuments, runTask} from '../src/tasks.mjs';
const now = new Date('2026-10-23T00:00:00Z');
function fixture(text = '1,000원') {
  const dataset = bindExtraction(createDemoDataset(now), 'doc-001', 'amount', {schemaVersion: 1, filename: 'synthetic.xlsx', format: 'xlsx', sha256: 'b'.repeat(64), warnings: ['XLSX_RAW_CELL_VALUES'], units: [{id: 's1-B2', location: {sheet: '예산', cell: 'B2'}, text}]}, now);
  const doc = dataset.items.find(x => x.id === 'doc-001');
  const selection = {documentId: doc.id, attachmentId: 'amount', unitId: 's1-B2', version: doc.version, updatedAt: doc.updatedAt, sha256: 'b'.repeat(64), confirmed: true};
  return {dataset, request: {task: 'validate', attachmentEvidence: selection, draft: {title: '합성', purpose: '검증', businessDate: '2026-10-23', amount: '900', attachmentAmount: '900', attachmentNames: 'synthetic.xlsx'}}};
}

test('money accepts exact integer units and rejects ambiguous text, formulas and multipliers', () => {
  for (const [text, expected] of [['0', 0], ['1,000원', 1000], ['₩ 2000', 2000]]) assert.equal(attachmentMoney(text), expected);
  for (const text of ['총액 1000원', '1,000 2,000', '=SUM(A1)', '100만원', '10 USD', '-100', '1.5', '1e3', '001', '12,34', '9007199254740992', '2026-10-23']) assert.equal(attachmentMoney(text), null);
});

test('attachment comparison derives amount from current evidence, not supplied amount', () => {
  const f = fixture(), result = runTask(f.dataset, f.request, now);
  assert.equal(result.evidenceAmount, 1000); assert.equal(result.passed, false);
  assert.equal(result.findings[0].code, 'AMOUNT_MISMATCH'); assert.equal(result.references[0].locationLabel, '예산 · B2');
  f.request.draft.amount = '1000'; assert.equal(runTask(f.dataset, f.request, now).passed, true);
  const zero = fixture('0'); zero.request.draft.amount = '0'; assert.equal(runTask(zero.dataset, zero.request, now).passed, true);
});

test('evidence comparison rejects unconfirmed, revoked, changed and malformed references', () => {
  for (const mutate of [
    f => { f.request.attachmentEvidence.confirmed = false; },
    f => { f.request.attachmentEvidence.sha256 = 'a'.repeat(64); },
    f => { f.request.attachmentEvidence.version = 'new'; },
    f => { f.request.attachmentEvidence.unitId = 'missing'; },
    f => { f.request.attachmentEvidence.amount = 900; },
    f => { f.dataset.items.find(x => x.id === 'doc-001').allowedUserIds = []; },
    f => { f.dataset.items.find(x => x.id === 'doc-001').effectiveTo = '2026-10-22'; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => runTask(f.dataset, f.request, now)); }
  const ambiguous = fixture('총액 1000원'); assert.throws(() => runTask(ambiguous.dataset, ambiguous.request, now));
});

test('search offers selection only for a whole numeric evidence unit', () => {
  const f = fixture(), hit = searchDocuments(f.dataset, '1000', now).hits[0];
  // Commas remain part of the original keyword search; select by the visible currency term.
  assert.equal(hit, undefined);
  const numeric = searchDocuments(f.dataset, '원', now).hits.find(x => x.selection);
  assert.equal(numeric.amountCandidate, 1000); assert.equal(numeric.selection.unitId, 's1-B2');
  const ambiguous = fixture('총액 1000원'); assert.equal(searchDocuments(ambiguous.dataset, '1000', now).hits[0].selection, undefined);
});
