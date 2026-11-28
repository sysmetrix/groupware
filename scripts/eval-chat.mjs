// 대화 평가: eval/chat-questions.json 의 문항을 로컬 라우터(chatIntent)에 넣어 채점한다.
// Usage: node scripts/eval-chat.mjs [--json] [--all]
//   --all  맞은 문항까지 모두 출력
// 종료 코드 1: 새로 틀린 문항이 있거나, known 으로 적어 둔 문항이 이제 맞는다(known 을 지워야 한다).
// AI(Gemini) 쪽 채점은 실제 키와 화면의 도구 정의가 필요해 이 스크립트가 하지 않는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import * as ChatMod from '../src/live/chat.mjs';
import {chatIntent} from '../src/live/chat.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const QUESTIONS_FILE = path.join(ROOT, 'eval', 'chat-questions.json');

/** 한 문항 채점. {ok, got, reason} */
export function gradeItem(item, now) {
  const r = chatIntent(item.q, now);
  const want = Array.isArray(item.tool) ? item.tool : [item.tool];
  if ((item.notTool || []).includes(r.tool)) return {ok: false, got: r, reason: `${r.tool} 로 가면 안 됨`};
  if (!want.includes(r.tool)) return {ok: false, got: r, reason: `기대 ${want.map(t => t || '(넘김)').join(' 또는 ')}, 실제 ${r.tool || '(넘김)'}`};
  for (const [k, v] of Object.entries(item.args || {})) {
    if (r.args[k] !== v) return {ok: false, got: r, reason: `${k}: 기대 ${JSON.stringify(v)}, 실제 ${JSON.stringify(r.args[k])}`};
  }
  return {ok: true, got: r, reason: ''};
}

/** 전체 채점. 분류별 점수와, 새로 틀린 것(regressed)·고쳐진 것(fixed)을 나눠 돌려준다. */
export function gradeAll(set) {
  const now = new Date(set.now);
  const rows = set.items.map(item => ({item, ...gradeItem(item, now)}));
  const cats = {};
  for (const r of rows) { const c = cats[r.item.cat] ||= {pass: 0, total: 0}; c.total++; if (r.ok) c.pass++; }
  return {
    rows, cats,
    pass: rows.filter(r => r.ok).length, total: rows.length,
    regressed: rows.filter(r => !r.ok && !r.item.known),
    fixed: rows.filter(r => r.ok && r.item.known),
    known: rows.filter(r => !r.ok && r.item.known),
  };
}

export async function loadQuestions(file = QUESTIONS_FILE) { return JSON.parse(await fs.readFile(file, 'utf8')); }

/** 멀티턴(슬롯 이어받기·재서술) 및 Mock Gemini Function Calling 회귀 평가. */
export async function gradeMultiTurnAndMockLlm() {
  const ui = await fs.readFile(path.join(ROOT, 'src', 'live', 'wc', '30-chat-ui.js'), 'utf8');
  const engine = await fs.readFile(path.join(ROOT, 'src', 'live', 'wc', '31-chat-engine.js'), 'utf8');
  const reply = parts => ({candidates: [{content: {parts}, finishReason: 'STOP'}]});
  const mk = (replies = [], ready = true) => {
    const requests = [], db = {chatHistV: 3, chatModels: {at: Date.now(), list: ['gemini-test']}};
    const ctx = {
      R: {...ChatMod, kstNow: () => ({date: '2026-11-29'}), resKindOfText: s => /회의실/.test(s) ? 'room' : 'car'},
      S: {settings: {}, userKey: 'eval'}, HOME_ACTS: {}, root: {addEventListener() {}},
      setInterval() {}, setTimeout: (f, n) => { const t = setTimeout(f, n); t.unref(); return t; }, clearTimeout, AbortController, console,
      store: {get: (k, d) => k in db ? db[k] : d, set: (k, v) => { db[k] = v; }, del: k => { delete db[k]; }},
      allowed: () => ready, aiReady: () => ready, aiCfg: () => ({key: 'fake'}), AI_HOST: 'https://example.invalid',
      logError() {}, $: () => null, esc: x => String(x ?? ''),
      fetch: async (u, opt) => { requests.push(JSON.parse(opt.body)); const b = replies.shift(); if (!b) throw new Error('unexpected fetch'); return {ok: true, json: async () => b}; },
    };
    vm.createContext(ctx);
    vm.runInContext(ui + '\n' + engine + '\nthis.api={chatSend,chatState,chatRegisterTool}', ctx);
    return {api: ctx.api, requests};
  };
  const cases = [];
  const runCase = async (id, name, fn) => {
    try { await fn(); cases.push({id, name, ok: true, reason: ''}); }
    catch (e) { cases.push({id, name, ok: false, reason: String(e && e.message || e)}); }
  };
  await runCase('mt01', '멀티턴 슬롯 이어받기: 차량 예약 시간 되묻기 → 이어 말 병합', async () => {
    const {api} = mk([], false);
    const seen = [];
    api.chatRegisterTool({name: 'reserve_vehicle', kind: 'act', run: async a => {
      seen.push(a);
      if (!a.start || !a.end) return {ok: false, text: '날짜와 시간을 알려 주세요.'};
      return {ok: true, text: `예약 준비 완료(${a.date} ${a.start}~${a.end})`, cards: [{type: 'confirm', title: '차량 예약 확정', onConfirm: async () => ({ok: true, text: 'ok'})}]};
    }});
    await api.chatSend('내일 차량 예약해줘');
    await api.chatSend('오후 2시부터 4시까지');
    const last = api.chatState().msgs.at(-1);
    if (seen.length !== 2 || seen[1].start !== '14:00' || seen[1].end !== '16:00') throw new Error(`슬롯 병합 실패: ${JSON.stringify(seen)}`);
    if (!last.cards.some(c => c.type === 'confirm')) throw new Error('확인 카드가 생성되지 않음');
  });
  await runCase('mt02', '멀티턴 재서술(rephrase): historyText(res.llm)만 외부 AI로 전송하고 화면 원문 보호', async () => {
    const {api, requests} = mk([reply([{text: '예산 잔액은 100만원입니다.'}])], true);
    api.chatRegisterTool({name: 'get_budget', kind: 'read', run: async () => ({ok: true, text: '비밀사업명(A999) 예산 500만원 · 잔액 100만원', llm: '예산 500만원 · 집행 400만원(80%) · 잔액 100만원.'})});
    await api.chatSend('예산 현황 알려줘');
    await api.chatSend('방금 거 한 줄로 다시 요약해줘');
    const wire = JSON.stringify(requests);
    if (!requests.length) throw new Error('재서술 AI 요청이 발생하지 않음');
    if (wire.includes('비밀사업명') || wire.includes('A999')) throw new Error('화면용 원문(사업명)이 외부 AI로 유출됨');
    if (!wire.includes('잔액 100만원')) throw new Error('비식별 historyText가 전달되지 않음');
  });
  await runCase('llm01', 'Mock Gemini Function Calling: 비식별 llm 요약 기반 합성 응답', async () => {
    const {api, requests} = mk([reply([{functionCall: {name: 'get_unresolved_evidence', args: {kind: 'card', period: 'month', state: 'open'}}}]), reply([{text: '이번 달 결의 전 카드는 2건 15만원입니다.'}])], true);
    api.chatRegisterTool({name: 'get_unresolved_evidence', kind: 'read', run: async () => ({ok: true, text: '카드 2건(비밀가맹점 포함)', llm: '이번 달 결의 전 카드 사용 2건 150,000원.'})});
    await api.chatSend('이번 달 증빙 상황을 자세히 비교해서 설명해줘');
    const wire = JSON.stringify(requests), last = api.chatState().msgs.at(-1);
    if (wire.includes('비밀가맹점')) throw new Error('상세 가맹점명이 외부 AI로 유출됨');
    if (!/15만원/.test(last.text)) throw new Error(`합성 응답 불일치: ${last.text}`);
  });
  await runCase('llm02', 'Mock Gemini 안전 차단: 요청에 없는 쓰기 도구 호출 거부', async () => {
    let called = 0;
    const {api} = mk([reply([{functionCall: {name: 'reserve_vehicle', args: {date: '2026-11-30', start: '10:00', end: '12:00'}}}]), reply([{text: '예약했습니다.'}])], true);
    api.chatRegisterTool({name: 'reserve_vehicle', kind: 'act', run: async () => { called++; return {ok: true, text: '예약'}; }});
    await api.chatSend('차량 관리 규정이 궁금해요');
    if (called !== 0) throw new Error('요청에 없는 쓰기 도구가 실행됨');
  });
  return {cases, pass: cases.filter(c => c.ok).length, total: cases.length, failed: cases.filter(c => !c.ok)};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const g = gradeAll(await loadQuestions());
  const mt = await gradeMultiTurnAndMockLlm();
  if (argv.includes('--json')) {
    console.log(JSON.stringify({pass: g.pass, total: g.total, cats: g.cats, regressed: g.regressed.map(r => ({id: r.item.id, q: r.item.q, reason: r.reason})), fixed: g.fixed.map(r => r.item.id), known: g.known.map(r => r.item.id), multiTurn: {pass: mt.pass, total: mt.total, failed: mt.failed}}, null, 2));
  } else {
    console.log(`로컬 라우터 ${g.pass}/${g.total} (${Math.round(g.pass / g.total * 100)}%)`);
    for (const [c, v] of Object.entries(g.cats)) console.log(`  ${c}: ${v.pass}/${v.total}`);
    console.log(`멀티턴·Mock LLM ${mt.pass}/${mt.total} (${Math.round(mt.pass / mt.total * 100)}%)`);
    for (const c of mt.failed) console.log(`  ✗ ${c.id} ${c.name}: ${c.reason}`);
    const show = (title, list) => { if (list.length) { console.log(`\n${title}`); for (const r of list) console.log(`  ${r.item.id} "${r.item.q}" → ${r.reason || r.got.tool}`); } };
    show('새로 틀림', g.regressed);
    show('알려진 틀림(known)', g.known);
    show('이제 맞음(known 을 지우세요)', g.fixed);
    if (argv.includes('--all')) show('맞음', g.rows.filter(r => r.ok && !r.item.known));
  }
  process.exit(g.regressed.length || g.fixed.length || mt.failed.length ? 1 : 0);
}
