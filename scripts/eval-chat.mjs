// 대화 평가: eval/chat-questions.json 의 문항을 로컬 라우터(chatIntent)에 넣어 채점한다.
// Usage: node scripts/eval-chat.mjs [--json] [--all]
//   --all  맞은 문항까지 모두 출력
// 종료 코드 1: 새로 틀린 문항이 있거나, known 으로 적어 둔 문항이 이제 맞는다(known 을 지워야 한다).
// AI(Gemini) 쪽 채점은 실제 키와 화면의 도구 정의가 필요해 이 스크립트가 하지 않는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const g = gradeAll(await loadQuestions());
  if (argv.includes('--json')) {
    console.log(JSON.stringify({pass: g.pass, total: g.total, cats: g.cats, regressed: g.regressed.map(r => ({id: r.item.id, q: r.item.q, reason: r.reason})), fixed: g.fixed.map(r => r.item.id), known: g.known.map(r => r.item.id)}, null, 2));
  } else {
    console.log(`로컬 라우터 ${g.pass}/${g.total} (${Math.round(g.pass / g.total * 100)}%)`);
    for (const [c, v] of Object.entries(g.cats)) console.log(`  ${c}: ${v.pass}/${v.total}`);
    const show = (title, list) => { if (list.length) { console.log(`\n${title}`); for (const r of list) console.log(`  ${r.item.id} "${r.item.q}" → ${r.reason || r.got.tool}`); } };
    show('새로 틀림', g.regressed);
    show('알려진 틀림(known)', g.known);
    show('이제 맞음(known 을 지우세요)', g.fixed);
    if (argv.includes('--all')) show('맞음', g.rows.filter(r => r.ok && !r.item.known));
  }
  process.exit(g.regressed.length || g.fixed.length ? 1 : 0);
}
