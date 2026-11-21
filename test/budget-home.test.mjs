// v1.18 예산 집행 메뉴: 관심 사업 목록 정리와 재단 전체 합계 규칙
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/live/wc/54-budget-home.js', import.meta.url), 'utf8');
const pick = name => { const i = src.indexOf(`function ${name}(`); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } throw new Error(name); };

test('관심 사업 정리: 빈 코드·겹친 항목을 없애고 바뀐 때만 저장', () => {
  let saves = 0;
  const ctx = {S: {settings: {budget: [{project: '', filter: '', label: ''}, {project: 'A201', filter: '노121', label: '젠더'}, {project: 'A201', filter: '노121', label: '겹침'}, null, {project: 'A201 ', filter: '코121', label: 'ESG'}, {project: 'x;y', filter: ''}]}}, saveLocal: () => { saves++; return true; }, logError: () => {}};
  vm.createContext(ctx); vm.runInContext(pick('bmCleanPins') + '; bmCleanPins();', ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.S.settings.budget)), [{project: 'A201', filter: '노121', label: '젠더'}, {project: 'A201', filter: '코121', label: 'ESG'}]);
  assert.equal(saves, 1);
  vm.runInContext('bmCleanPins();', ctx);
  assert.equal(saves, 1); // 이미 깨끗하면 저장하지 않음
});

test('재단 전체 합계는 세입(수입) 사업과 자료 없는 사업을 빼고 계산한다', () => {
  assert.match(src, /const income = \/세입\/\.test\(p\.name \|\| ''\) \|\| \(!budget && executed > 0\)/);
  assert.match(src, /const spend = projs\.filter\(x => !x\.income && !x\.empty\)/);
  assert.match(src, /const TB = spend\.reduce/);
});

test('하위 탭 기본값: 내 사업이 있으면 내 사업 한눈에, 없으면 재단 전체', () => {
  const run = pins => { const ctx = {S: {budget: {}, settings: {budget: pins}}}; vm.createContext(ctx); vm.runInContext("const bmPins = () => (S.settings.budget || []).filter(p => p && p.project);\n" + pick('budgetMode') + '; globalThis.m = budgetMode();', ctx); return ctx.m; };
  assert.equal(run([{project: 'A201', filter: '노121'}]), 'mine');
  assert.equal(run([]), 'all');
});
