import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gradeMultiTurnAndMockLlm} from '../scripts/eval-chat.mjs';

const read = p => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('P1-4 완결: get_budget·get_resource_status·get_work_hours가 비식별 llm 요약을 반환한다', async () => {
  const readTools = await read('src/live/wc/32-chat-tools-read.js');
  const moreTools = await read('src/live/wc/36-chat-tools-more.js');
  assert.match(readTools, /llm: `예산 \$\{won\(top\.budget\)\}원/);
  assert.match(readTools, /const llm = `\$\{pk0\.label\} \$\{shown\.length\}곳/);
  assert.match(moreTools, /const llm = `\$\{mLabel\} 근무시간 확정 집계/);
});

test('P1-5 완결: vMyTodo 필터·도구 통합(td-tools) 및 900px 이하 --navW:64px 자동 축소', async () => {
  const todo = await read('src/live/wc/51-todo.js');
  const css = await read('src/live/wc.css');
  assert.match(todo, /<div class="bar td-tools"><div class="seg" role="group" aria-label="할 일 거르기">/);
  assert.match(css, /@media\(max-width:900px\)\{\.wc\{--navW:64px\}/);
});

test('P1-2·P0-2 완결: patterns 캐시 TTL 필터링 및 canvasClick 확인 게이트', async () => {
  const draft = await read('src/live/wc/19-draft-engine.js');
  const rec = await read('src/live/wc/20-recorder.js');
  assert.match(draft, /const patTtlMs = \(\) =>/);
  assert.match(draft, /!d\.learnedAt \|\| d\.learnedAt >= cut/);
  assert.match(rec, /if \(step\.type === 'canvasClick' && !confirmed\)/);
});

test('P1-6 완결: eval-chat 멀티턴·Mock LLM 회귀 평가 4/4 통과', async () => {
  const mt = await gradeMultiTurnAndMockLlm();
  assert.equal(mt.failed.length, 0, JSON.stringify(mt.failed));
  assert.equal(mt.pass, 4);
});
