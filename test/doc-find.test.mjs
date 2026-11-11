import test from 'node:test';
import assert from 'node:assert/strict';
import {dfRecipient, dfKind, dfSameDept, dfPrepare, dfApply, dfCounts, dfMonths, dfKeywords} from '../src/live/doc-find.mjs';

const doc = (o = {}) => ({type: 'doc', docId: '1', docNo: '시험부서-1', title: '시험 문서', form: '기안문', date: '20261110', drafter: '김시험', dept: '시험부서', text: '수신자 내부결재 (경유) 제목 시험 문서', ...o});

test('dfRecipient reads the recipient line, tolerates spacing and missing parts', () => {
  assert.equal(dfRecipient('수신자 내부결재 (경유) 제목 시험'), '내부결재');
  assert.equal(dfRecipient('수신자  한빛시장(청소년과장)  제목 협조 요청'), '한빛시장(청소년과장)');
  assert.equal(dfRecipient('수신: 수신자 참조 (경유)'), '수신자 참조');
  assert.equal(dfRecipient('본문만 있는 글'), ''); assert.equal(dfRecipient(null), '');
});

test('dfKind: received by form, sent by an outside recipient, otherwise draft', () => {
  assert.equal(dfKind(doc({form: '접수문서', text: ''})), 'recv');
  assert.equal(dfKind(doc({text: '수신자 한빛시장 (경유) 제목 결과 통보'})), 'send');
  assert.equal(dfKind(doc()), 'draft');
  assert.equal(dfKind(doc({text: '수신자 내부 결재 제목 계획'})), 'draft');
  assert.equal(dfKind(doc({text: ''})), 'draft'); assert.equal(dfKind(null), 'draft');
});

test('dfSameDept matches exact and containing names, never empty ones', () => {
  assert.equal(dfSameDept('전략경영실', '전략 경영실'), true);
  assert.equal(dfSameDept('재단 전략경영실', '전략경영실'), true);
  assert.equal(dfSameDept('정책연구팀', '전략경영실'), false);
  assert.equal(dfSameDept('', '전략경영실'), false); assert.equal(dfSameDept('전략경영실', ''), false);
});

const LIST = dfPrepare([
  doc({docId: 'a', date: '2026-11-10', title: '운영 계획'}),
  doc({docId: 'b', date: '20261005', form: '접수문서', dept: '정책연구팀', title: '협조 요청', text: ''}),
  doc({docId: 'c', date: '20261111', title: '결과 통보', text: '수신자 한빛시장 (경유) 제목 결과 통보'}),
  doc({docId: 'a', title: '중복'}), null, {title: 'docId 없음'},
], '시험부서');

test('dfPrepare tags kind, date, own department and drops duplicates', () => {
  assert.deepEqual(LIST.map(d => [d.docId, d.kind, d.ymd, d.mine]), [['a', 'draft', '20261110', true], ['b', 'recv', '20261005', false], ['c', 'send', '20261111', true]]);
  assert.equal(LIST[2].to, '한빛시장'); assert.equal(LIST[0].to, '');
  assert.deepEqual(dfPrepare(null), []);
});

test('dfApply filters by kind, department, form, words and sorts', () => {
  assert.deepEqual(dfApply(LIST, {}).map(d => d.docId), ['c', 'a', 'b']);
  assert.deepEqual(dfApply(LIST, {sort: 'old'}).map(d => d.docId), ['b', 'a', 'c']);
  assert.deepEqual(dfApply(LIST, {sort: 'rel'}).map(d => d.docId), ['a', 'b', 'c']);
  assert.deepEqual(dfApply(LIST, {kind: 'send'}).map(d => d.docId), ['c']);
  assert.deepEqual(dfApply(LIST, {dept: 'mine'}).map(d => d.docId), ['c', 'a']);
  assert.deepEqual(dfApply(LIST, {dept: '정책연구팀'}).map(d => d.docId), ['b']);
  assert.deepEqual(dfApply(LIST, {form: '접수문서'}).map(d => d.docId), ['b']);
  assert.deepEqual(dfApply(LIST, {q: '결과 통보'}).map(d => d.docId), ['c']);
  assert.deepEqual(dfApply(LIST, {kind: 'recv', dept: 'mine'}), []);
});

test('dfCounts counts each filter with the others applied', () => {
  const c = dfCounts(LIST, {dept: 'mine'});
  assert.deepEqual(c.kinds, {all: 2, draft: 1, recv: 0, send: 1});
  assert.equal(c.deptAll, 3); assert.equal(c.mine, 2);
  assert.deepEqual(c.depts, [['시험부서', 2], ['정책연구팀', 1]]);
  assert.deepEqual(dfCounts(LIST, {kind: 'recv'}).depts, [['정책연구팀', 1]]);
  assert.deepEqual(dfCounts(LIST, {}).forms, [['기안문', 2], ['접수문서', 1]]);
});

test('dfMonths groups consecutive documents by month', () => {
  const g = dfMonths(dfApply([...LIST, {docId: 'z', kind: 'draft', ymd: ''}], {}));
  assert.deepEqual(g.map(x => [x.label, x.items.length]), [['2026년 11월', 2], ['2026년 10월', 1], ['날짜 없음', 1]]);
});

test('dfKeywords trims, dedupes and limits', () => {
  assert.deepEqual(dfKeywords([' 예산 ', '예산', 'a', '', null, '계획'], 2), ['예산', '계획']);
  assert.deepEqual(dfKeywords(null), []);
});
