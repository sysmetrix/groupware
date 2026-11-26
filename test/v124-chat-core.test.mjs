// v1.24 비서 대화: 핵심 4(할 일·예산 집행)에 맞춘 답 — 결의 전 증빙, 사업 합계, 먼저 할 일에 개인 ToDo
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {budgetProjectTotals, budgetPickProject} from '../src/live/briefing.mjs';
import {chatIntent} from '../src/live/chat.mjs';

const read = f => readFileSync(new URL('../src/live/' + f, import.meta.url), 'utf8');
const now = new Date('2026-11-26T06:00:00Z');

test('사업 합계: 재단 전체 화면과 같은 관 단위 합, 세입·실패 사업 구분', () => {
  const all = {projects: [
    {project: 'A201', name: '전략경영실운영', rows: [{level: '관', code: '1', name: '○행정운영비', budget: 1000, executed: 813}, {level: '항', code: '11', name: '인력', budget: 900, executed: 700}, {level: '관', code: '2', name: '기본경비', budget: 0, executed: 0}]},
    {project: 'A001', name: '세입', rows: [{level: '관', code: '9', name: '수입', budget: 0, executed: 500}]},
    {project: 'Y101', name: '청소년 자치활동 지원', error: true},
  ]};
  const t = budgetProjectTotals(all);
  assert.equal(t.length, 2);
  assert.deepEqual({b: t[0].budget, e: t[0].executed, bal: t[0].balance, r: t[0].rate, top: t[0].top.map(x => x.name)}, {b: 1000, e: 813, bal: 187, r: 81.3, top: ['행정운영비']});
  assert.equal(t[1].income, true);
  assert.equal(budgetPickProject(t, '전략경영실운영').project, 'A201');
  assert.equal(budgetPickProject(t, 'A201 야').project, 'A201');
  assert.equal(budgetPickProject(t, '세입'), null, '세입 사업은 지출 합계로 답하지 않는다');
  assert.equal(budgetPickProject(t, '출장비'), null, '과목 이름은 사업으로 고르지 않는다');
});

test('결의 전 증빙 질문은 직원 근태가 아니라 증빙 도구로 간다', () => {
  for (const [q, args] of [['이번 달 결의 안 한 카드 있어?', {kind: 'card', state: 'open', period: 'month'}], ['결의 전 세금계산서 있어?', {kind: 'etax'}], ['지난달 카드 결의 다 했어?', {period: 'last'}], ['카드 사용내역 보여줘', {kind: 'card', state: 'all'}]]) {
    const r = chatIntent(q, now);
    assert.equal(r.tool, 'get_unresolved_evidence', q);
    for (const [k, v] of Object.entries(args)) assert.equal(r.args[k], v, q + ' ' + k);
  }
  for (const q of ['지출결의서 작성해줘', '카드 승인 내역 결의서 써줘', '결재할 문서 있어?']) assert.notEqual(chatIntent(q, now).tool, 'get_unresolved_evidence', q);
});

test('증빙 도구: 같은 조회를 쓰고, 외부 AI에는 건수·금액만, 결의서는 만들지 않는다', () => {
  const src = read('wc/58-budget-etax.js');
  const tool = src.slice(src.indexOf("name: 'get_unresolved_evidence'"));
  assert.match(tool, /GW\.cardUsage/);
  assert.match(tool, /GW\.etaxInvoices/);
  assert.match(tool, /llm: text\.replace/);
  assert.doesNotMatch(tool, /data:[^\n]*(place|supplier)/, 'data(외부 AI로 가는 값)에 사용처·공급자 이름을 넣지 않는다');
  assert.match(tool, /상신은 직접 합니다/);
  assert.match(read('wc/30-chat-ui.js'), /view === 'budget' && \['card', 'etax'\]\.includes\(param\)/);
});

test('먼저 할 일: 홈과 같은 순서로 개인 ToDo를 넣고, 목록을 글과 카드에 두 번 쓰지 않는다', () => {
  const src = read('wc/43-chat-understand.js');
  const tool = src.slice(src.indexOf("name: 'plan_priorities'"), src.indexOf("// 직원 출근 여부는"));
  assert.match(tool, /top = \[\.\.\.hot, \.\.\.pItems, \.\.\.gwTop\.filter\(t => !hot\.includes\(t\)\)\]/);
  assert.match(tool, /act: t\.td \? \{act: 'chatNav', v: 'mytodo\|' \+ t\.td\}/);
  assert.doesNotMatch(tool, /top\.map\(\(t, i\) => `\$\{i \+ 1\}\. \$\{t\.title\}\$\{t\.why/, '글에는 건수만, 항목은 카드에');
  assert.match(read('wc/30-chat-ui.js'), /view === 'mytodo' && param && param !== 'wrap' && typeof todoOpen === 'function'/);
});

test('사업 이름으로 물으면 과목 나열 대신 사업 합계를 먼저 답한다', () => {
  const src = read('wc/36-chat-tools-more.js');
  assert.match(src, /R\.budgetPickProject\(R\.budgetProjectTotals\(all\), q\)/);
  assert.ok(src.indexOf('R.budgetPickProject(') < src.indexOf('let res = R.searchBudget('), '사업 합계 판단이 과목 검색보다 먼저');
});
