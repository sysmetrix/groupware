import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../src/live/' + p, import.meta.url), 'utf8');

test('근태 선택은 유형과 상세 종류를 라디오 그룹으로 분리하고 값 읽기를 유지한다', () => {
  const src = read('wc/27-attendance-request.js');
  for (const id of ['att_type', 'att_kind', 'att_pay', 'att_tr']) assert.match(src, new RegExp("choices\\('" + id + "'"));
  assert.match(src, /role="radiogroup" aria-labelledby=/);
  assert.match(src, /input\[name="' \+ id \+ '"\]:checked/);
  assert.match(src, /name="att_kind"\]\:checked/);
  assert.match(src, /st\.pay === '보상' \? '보상근무 신청' : '수당근무 신청'/);
  assert.doesNotMatch(src, /sel\('att_(kind|pay|tr)'/);
});

test('업무 범위는 여러 개 선택할 수 있는 체크박스 그룹이다', () => {
  const src = read('wc/12-report-settings.js');
  assert.match(src, /aria-label="내 업무 범위 \(복수 선택\)"/);
  for (const key of ['deptReceiver', 'distributor', 'sender']) assert.match(src, new RegExp('data-k="roles\\.' + key + '"'));
  assert.match(src, /el\.type === 'checkbox' \? el\.checked/);
  const css = read('wc.css');
  assert.match(css, /att-choice input:focus-visible\+span/);
  assert.match(css, /att-choice input\[type=checkbox\]:checked\+span::before/);
});
