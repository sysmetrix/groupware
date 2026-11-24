import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as docs from '../src/live/doc-find.mjs';
import * as plans from '../src/live/todo-plan.mjs';
import {weeklyDraftPeriod} from '../src/live/briefing.mjs';

const read = n => readFileSync(new URL(`../src/live/wc/${n}`, import.meta.url), 'utf8');
const section = (n, end) => read(n).split(end)[0];
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const html = {esc, pgh: (title, sub = '', actions = '') => `<h1>${title}</h1>${sub}${actions}`, ic: () => '', hl: esc, ymd8: esc, shortWhen: esc};

function searchFixture(responses) {
  const S = {view: 'search', search: {kw: '', period: '', types: ['doc', 'mail'], more: {}}, raw: {principal: {deptName: '전략경영실'}}};
  const inputs = {}, calls = [];
  const R = {...docs, kstNow: d => ({date: new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10)})};
  const ctx = {...html, S, R, GW: {searchLabels: {doc: '문서', mail: '메일'}, search: async (kw, opts) => { calls.push({kw, ...opts}); return {keyword: kw, groups: responses.shift()}; }}, $: sel => inputs[sel], render() {}, renderMain() {}, toast() {}, go: v => { S.view = v; }, store: {get: (_, fallback) => fallback, set() {}}};
  const api = runInNewContext(section('09-search-board.js', '  // ----- 할 일 보드') + read('35-docs.js') + '\n({carrySearchInputs, runSearch, searchMore, vSearch, dfRun, dfState, dfChange, vDocs});', ctx);
  return {S, inputs, calls, ...api};
}
const doc = {docId: 'd1', title: '감사 계획', form: '접수문서', dept: '전략경영실'};
const found = {items: [doc], total: 2, reliableTotal: 2};
const zero = {items: [], total: 0, reliableTotal: 0};

test('search tabs carry edited keyword/period without searching or replacing prior results', async () => {
  const h = searchFixture([{doc: found, mail: zero}, {doc: {items: [], total: 2, reliableTotal: 2}}]);
  h.S.search.kw = '실행한 검색'; h.S.search.period = '1'; await h.runSearch();
  h.inputs['#sq'] = {value: '  편집 중인 검색  '}; h.inputs['#speriod'] = {value: '3'};
  h.carrySearchInputs('search', 'docs');
  assert.match(h.vDocs(), /결재문서 찾기/);
  assert.match(h.vDocs(), /value="  편집 중인 검색  "/);
  assert.match(h.vDocs(), /value="3" selected/);
  h.dfChange({id: 'dfPeriod', value: '12'});
  h.inputs['#dfq'] = {value: '반대 방향 검색'}; h.carrySearchInputs('docs', 'search');
  assert.equal(h.S.search.kw, '반대 방향 검색'); assert.equal(h.S.search.period, '12');
  assert.match(h.vSearch(), /“실행한 검색” · \d{4}-\d{2}-\d{2} ~ \d{4}-\d{2}-\d{2}/);
  assert.equal(h.calls.length, 1);
  await h.searchMore('doc');
  assert.equal(h.calls[1].kw, h.calls[0].kw); assert.equal(h.calls[1].from, h.calls[0].from); assert.equal(h.calls[1].to, h.calls[0].to);
  assert.match(h.vSearch(), /추가 응답이 없어 전체 결과를 확인하지 못했습니다/);
});

test('integrated search distinguishes confirmed zero from unavailable sources or counts', async () => {
  const h = searchFixture([{doc: zero, mail: zero}, {doc: found, mail: {...zero, error: true, message: '읽기 실패'}}, {doc: {...zero, reliableTotal: null}, mail: {...zero, reliableTotal: null}}]);
  h.S.search.kw = '감사 자료'; await h.runSearch();
  assert.match(h.vSearch(), /이 범위에서 결과 0건/);
  await h.runSearch();
  assert.match(h.vSearch(), /일부 조회 실패 또는 범위 미확인/);
  assert.match(h.vSearch(), /<span class="bdg tag">결재문서<\/span>/);
  assert.match(h.vSearch(), /2건 중 1건 확인/);
  assert.doesNotMatch(h.vSearch(), /이 범위에서 결과 0건/);
  await h.runSearch();
  assert.match(h.vSearch(), /전체 건수 미확인/);
  assert.doesNotMatch(h.vSearch(), /이 범위에서 결과 0건/);
});

test('approval document pagination keeps edited inputs, type text and prior rows on failure', async () => {
  const h = searchFixture([{doc: found}, {doc: {...zero, error: true, message: '접근 오류'}}, {doc: {...zero, reliableTotal: null}}]);
  await h.dfRun('원래 검색');
  h.dfState().kw = '아직 미실행'; h.dfChange({id: 'dfPeriod', value: '1'});
  await h.dfRun('원래 검색', true);
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].from, h.calls[0].from);
  assert.match(h.vDocs(), /추가 조회 실패.*불러온 결과만 표시/);
  assert.match(h.vDocs(), /df-b df-recv">접수<\/span>/);
  assert.match(h.vDocs(), /value="아직 미실행"/);
  await h.dfRun('새 문서');
  assert.match(h.vDocs(), /결과 유무를 확인하지 못했습니다/);
  assert.doesNotMatch(h.vDocs(), /이 검색 범위에서 결과 0건/);
});

test('budget actual and forecast stay separate and missing plans do not become zero', () => {
  const rows = [{level: '항', code: 'A1', name: '사업'}, {level: '세', code: 'A10', name: '여비', budget: 1000, executed: 400}];
  const b = {project: 'P1', filter: 'A1', table: {rows, year: 2026, asOf: '2026-11-24T03:00:00Z'}};
  const TD = {list: null};
  const ctx = {...html, R: plans, S: {view: 'budget', budget: b, settings: {budget: []}}, TD, won: String, pct: v => `${v}%`, today: () => '2026-11-24'};
  const api = runInNewContext(section('52-budget-plan.js', '  // ----- 계획서에서 가져오기') + `
    BP.ledger[bpKey('P1','A1')] = {fails:['A10'], rows:[], at:'2026-11-24T03:00:00Z', sum:0, exec:400};
    ({render: () => bpView(S.budget)});`, ctx);
  assert.match(api.render(), /실집행 400원 \(40%\) · 실제 잔액 600원/);
  assert.match(api.render(), /회계연도 2026 · 자료 조회 기준 2026-11-24 12:00 KST/);
  assert.match(api.render(), /계획 자료 미확인/);
  assert.match(api.render(), /결의 합계 0원이 집행액 400원과 400원 다릅니다/);
  TD.list = [{id: 'p', title: '출장', meta: {b: {p: 'P1', h: 'A1', c: 'A10', a: 150, d: '2026-12-01'}}}];
  assert.match(api.render(), /연말 계획 반영 예상<\/b> · 550원/);
  assert.match(api.render(), /확정 집행액이 아닙니다/);
  assert.match(api.render(), /일부 세목의 결의 자료가 없어/);
});

test('report copy and exports preserve scope, as-of time and coverage warnings', () => {
  const S = {weekly: '[자료 범위: 접수 미조회]\n[자료 조회 기준: 2026-11-24 12:00 KST]\n[보고 기간: 20261121 ~ 20261124]\n초안', a: {collectedAt: '2026-11-24T03:00:00Z', sessionExpired: true, summary: {}, failed: [{name: '<메일>&'}]}};
  const R = {weeklyDraftPeriod, renderHtml: () => '<h1>그룹웨어 업무 브리핑</h1>', renderMarkdown: () => '# 브리핑'};
  const api = runInNewContext(section('12-report-settings.js', '  // ----- 설정') + '\n({vReport, weeklyExportText, briefHtml, briefExportText, briefExportHtml});', {...html, S, R, store: {get: () => null}, mineVisible: () => [], fmtDays: () => '-'});
  assert.match(api.vReport(), /주간 초안 복사.*브리핑 요약 복사/s);
  assert.match(api.vReport(), /그룹웨어에는 제출되지 않습니다/);
  assert.equal(api.weeklyExportText(), S.weekly);
  S.weekly = '메모만 있는 옛 초안';
  assert.match(api.weeklyExportText(), /보고 기간: 확인 불가.*자료 조회 기준: 확인 불가.*자료 범위: 확인 불가/s);
  for (const output of [api.briefHtml(), api.briefExportHtml(), api.briefExportText()]) {
    assert.match(output, /2026-11-24 12:00 KST/);
    assert.match(output, /일부 자료 미조회.*미조회는 0건이 아닙니다/);
  }
  assert.match(api.briefExportHtml(), /&lt;메일&gt;&amp;/);
});
