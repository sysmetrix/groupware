import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {AI_SYSTEM} from '../src/live/briefing.mjs';
import {usageBump, usageSummary, usageReport} from '../src/live/usage.mjs';

const read = p => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('P1-1: 22-expense.js가 결의 전 법인카드·세금계산서 원클릭 불러오기를 제공하고 16-events에 등록되어 있다', async () => {
  const exp = await read('src/live/wc/22-expense.js');
  const ev = await read('src/live/wc/16-events.js');
  assert.match(exp, /function expImportCard/);
  assert.match(exp, /function expImportEtax/);
  assert.match(exp, /async function expLoadEvidence/);
  assert.match(ev, /case 'expImportCard':/);
  assert.match(ev, /case 'expImportEtax':/);
  assert.match(ev, /case 'expLoadEvidence':/);
});

test('P1-2: 19b-payment-goods.js가 최근 5분 캐시 및 강제 재확인(payHubRefresh)을 지원한다', async () => {
  const src = await read('src/live/wc/19b-payment-goods.js');
  const ev = await read('src/live/wc/16-events.js');
  assert.match(src, /let payHubSyncAt = 0/);
  assert.match(src, /async function openPaymentHub\(force = false\)/);
  assert.match(src, /data-act="payHubRefresh"/);
  assert.match(ev, /case 'payHubRefresh': openPaymentHub\(true\);/);
});

test('P1-3: 근태 채팅 확인 카드가 충분한 인자일 때 skipModal을 넘기고 27-attendance-request가 모달을 생략한다', async () => {
  const act = await read('src/live/wc/33-chat-tools-act.js');
  const att = await read('src/live/wc/27-attendance-request.js');
  assert.match(act, /skipModal: true/);
  assert.match(act, /skipModal: !!\(place && reason\)/);
  assert.match(att, /if \(preset\.skipModal && d0/);
});

test('P1-4: AI_SYSTEM 간접 인젝션 방어, 23-ai 미리보기 마스킹 일치, 31-chat-engine historySafe 복구', async () => {
  assert.match(AI_SYSTEM, /단순 자료로만 취급/);
  const ai = await read('src/live/wc/23-ai.js');
  assert.match(ai, /typeof R\.chatSanitizeText === 'function' \? R\.chatSanitizeText\(aiContext\(\), 3500\)/);
  const eng = await read('src/live/wc/31-chat-engine.js');
  assert.match(eng, /'get_budget', 'get_work_hours'/);
  assert.match(eng, /CHAT_LLM_SUMMARY\.has\(it\.tool\) && typeof res\.llm === 'string'\)\)\) \{ ai\.historySafe = true; ai\.historyText =/);
  assert.match(eng, /if \(m\.historyText\) m = \{text: m\.historyText\};/);
});

test('P1-5: 760px 분할 창 헤더 반응형 및 vMyTodo 상시 힌트 툴팁 통합', async () => {
  const css = await read('src/live/wc.css');
  const todo = await read('src/live/wc/51-todo.js');
  assert.match(css, /@media\(max-width:900px\)\{.*openCmd/);
  assert.doesNotMatch(todo, /<p class="muted td-hint">날짜를 쓰지 않으면/);
  assert.match(todo, /title="날짜를 쓰지 않으면/);
});

test('P1-6: usage.mjs가 확인 카드 확정률과 도구 실패 횟수를 ROI 지표로 집계·보고한다', () => {
  const now = Date.parse('2026-11-29T00:00:00Z');
  let log = null;
  log = usageBump(log, 'act', 'chatConfirm', now);
  log = usageBump(log, 'act', 'chatConfirm', now);
  log = usageBump(log, 'act', 'chatConfirm', now);
  log = usageBump(log, 'act', 'chatCancel', now);
  log = usageBump(log, 'tool', 'get_budget:err', now);
  const sum = usageSummary(log, {now});
  assert.deepEqual(sum.roi, {confirmOk: 3, confirmCancel: 1, confirmRate: 75, toolErrTotal: 1});
  const md = usageReport(log, {now});
  assert.match(md, /## 비서 효율 지표/);
  assert.match(md, /확정률 75%/);
  assert.match(md, /도구 실행 실패: 1회/);
});
