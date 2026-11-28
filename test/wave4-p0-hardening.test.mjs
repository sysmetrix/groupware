import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {assemble, readSources, MAX_SHIPPED_BUNDLE_BYTES} from '../scripts/live-build.mjs';

const read = p => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('P0-1: 23-ai.js 모델 404 폴백 시 sessionOnly 키를 localStorage에 영구 저장하지 않는다', async () => {
  const src = await read('src/live/wc/23-ai.js');
  assert.match(src, /if \(c\.sessionOnly\) \{ try \{ sessionStorage\.setItem\(aiSessKey\(\), JSON\.stringify\(\{key: c\.key, model: '', sessionOnly: true\}\)\); \}/);
});

test('P0-2: 비가역 차단 정규식 부분일치·Space·중첩 iframe·click 속성 검사·근태 이탈 가드', async () => {
  const draft = await read('src/live/wc/19-draft-engine.js');
  const rec = await read('src/live/wc/20-recorder.js');
  const att = await read('src/live/wc/27-attendance-request.js');

  const deny = new Function('return ' + draft.match(/const DENY_BTN = (\/.*\/);/)[1])();
  const recDeny = new Function('return ' + rec.match(/const REC_DANGER = (\/.*\/);/)[1])();
  for (const re of [deny, recDeny]) {
    for (const bad of ['상신', '결재상신', '결재상신(2건)', '문서발송', '전체삭제', '임시저장하기', '최종승인', '폐기', '등록']) {
      assert.ok(re.test(bad), `차단해야 함: ${bad}`);
    }
    for (const safe of ['일정등록', '결재라인지정', '내결재라인', '확인', '취소', '닫기', '조회', '반영']) {
      assert.ok(!re.test(safe), `오탐하면 안 됨: ${safe}`);
    }
  }
  assert.match(draft, /e\.key === 'Enter' \|\| e\.key === ' ' \|\| e\.key === 'Spacebar'/);
  assert.match(draft, /querySelectorAll\('iframe'\)/);
  assert.match(draft, /denyTextOf\(this\)/);
  assert.match(rec, /step\.key === ' ' \|\| step\.key === 'Spacebar'/);
  assert.match(att, /const assertLive = \(\) =>/);
  assert.match(att, /180000/);
});

test('P0-3: 번들 CSS 패킹 확장 및 CHANGELOG 축소 실패 감지', async () => {
  const src = await readSources();
  const {bundle} = assemble(src);
  assert.ok(bundle.includes('.replace(/~[A-N]/g,'));
  const badBriefing = src.briefing.replace(/\{v: "1\./, '{broken: "1.');
  assert.throws(() => assemble({...src, briefing: badBriefing}), /CHANGELOG 축소 실패/);
  assert.ok(MAX_SHIPPED_BUNDLE_BYTES >= 1360 * 1024);
});

test('P0-4: collector.browser.js 실코드 버그 3종 수정 확인', async () => {
  const col = await read('src/live/collector.browser.js');
  assert.match(col, /isUnk\(e\) && path !== TODO_P \+ 'prj001A01'/);
  assert.match(col, /async function readAlert\(id\)[\s\S]{0,400}String\(ctx\.empSeq\) !== String\(loadedEmpSeq\)/);
  const bm = col.slice(col.indexOf('async function budgetMonthly'), col.indexOf('async function sentMail'));
  assert.match(bm, /abgtFg: '2'/);
  assert.doesNotMatch(bm, /abgtFg: '1'/);
});
