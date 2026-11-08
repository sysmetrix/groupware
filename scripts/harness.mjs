// 품질 하네스: 한 번의 명령으로 구문, 코드 그래프, 단위 테스트, 빌드, 예산, 안전 규칙, 비밀 점검을 돌리고 보고서를 남긴다.
//   node scripts/harness.mjs            전체
//   node scripts/harness.mjs --fast     구문 + 그래프 + 핵심 테스트 (저장할 때마다 돌려도 되는 속도)
//   node scripts/harness.mjs --json     기계가 읽는 결과만 출력(에이전트 루프용)
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {graphReport} from './graph.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const FAST = args.has('--fast'), AS_JSON = args.has('--json');
const BUDGET = {bundleKB: 640, wcFileLines: 600, minFontPx: 12};
const node = process.execPath;
const sh = (cmd, a, opt = {}) => spawnSync(cmd, a, {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opt});

const results = [];
async function stage(name, fn) {
  const t0 = Date.now();
  let r;
  try { r = await fn(); } catch (e) { r = {ok: false, fails: [`예외: ${e.message}`]}; }
  results.push({name, ms: Date.now() - t0, ok: r.ok !== false && !(r.fails && r.fails.length), fails: r.fails || [], warns: r.warns || [], info: r.info || ''});
}

const liveFiles = async () => {
  const wcDir = path.join(root, 'src', 'live', 'wc');
  return [...(await fs.readdir(wcDir)).filter(n => n.endsWith('.js')).sort().map(n => path.join(wcDir, n)),
    path.join(root, 'src', 'live', 'collector.browser.js'), path.join(root, 'src', 'live', 'workcenter.browser.js'), path.join(root, 'src', 'live', 'briefing.mjs'),
    path.join(root, 'scripts', 'live-build.mjs'), path.join(root, 'scripts', 'harness.mjs'), path.join(root, 'scripts', 'graph.mjs')];
};

await stage('구문 검사', async () => {
  const fails = [];
  for (const f of await liveFiles()) { const r = sh(node, ['--check', f]); if (r.status) fails.push(`${path.relative(root, f)}: ${(r.stderr || '').split('\n').find(l => /Error/.test(l)) || '구문 오류'}`); }
  return {fails, info: `${(await liveFiles()).length}개 파일`};
});

await stage('코드 그래프', async () => {
  const g = await graphReport();
  const fails = [
    ...g.badR.map(x => `R.${x.name} 는 briefing.mjs에 없음 (${x.file}:${x.line})`),
    ...g.badGW.map(x => `GW.${x.name} 는 수집기가 내보내지 않음 (${x.file}:${x.line})`),
    ...g.undef.map(x => `미정의 호출 ${x.name}() (${x.file}:${x.line})`),
    ...g.actsNoHandler.map(a => `data-act="${a}" 처리기 없음`),
  ];
  const warns = [...g.handlersNoTrigger.map(a => `화면에서 쓰이지 않는 처리기: ${a}`), ...g.dead.map(d => `죽은 코드 의심: ${d.name}() (${d.file})`)];
  return {fails, warns, info: `모듈 ${g.files.length}, 이벤트 ${g.acts.length}, 처리기 ${g.cases.length}`};
});

await stage('이벤트 데이터 계약', async () => {
  // 처리기가 el.dataset.X 를 읽으면, 그 data-act 를 만드는 모든 템플릿 태그에 data-X 가 있어야 한다(없으면 클릭 시 undefined).
  const dir = path.join(root, 'src', 'live', 'wc');
  const files = (await fs.readdir(dir)).filter(n => n.endsWith('.js')).sort();
  const srcs = {}; for (const n of files) srcs[n] = await fs.readFile(path.join(dir, n), 'utf8');
  const ev = srcs[files.find(n => n.includes('events'))];
  const all = Object.values(srcs).join('\n');
  const fails = [], warns = [];
  const re = /case '([\w-]+)':((?:\s*case '[\w-]+':)*)([^]*?)(?=\n\s*case '|\n\s*default:)/g;
  for (const m of ev.matchAll(re)) {
    const acts = [m[1], ...[...m[2].matchAll(/case '([\w-]+)'/g)].map(x => x[1])];
    const need = [...new Set([...m[3].matchAll(/(?:el|actEl)\.dataset\.(\w+)/g)].map(x => x[1]))];
    const optional = k => new RegExp('!\\s*(?:el|actEl)\\.dataset\\.' + k + '\\b|(?:el|actEl)\\.dataset\\.' + k + '\\s*(?:\\|\\||\\?\\?)').test(m[3]);
    if (!need.length) continue;
    for (const a of acts) {
      const tags = [...all.matchAll(new RegExp('<[^<>]*data-act="' + a + '"[^<>]*>', 'g'))].map(x => x[0]);
      if (!tags.length) continue;
      for (const k of need.filter(k => !optional(k))) {
        const missing = tags.filter(tg => !new RegExp('data-' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()) + '=').test(tg));
        if (missing.length === tags.length) fails.push('data-act="' + a + '" 처리기는 dataset.' + k + ' 를 읽는데 템플릿에 data-' + k + ' 가 없음');
        else if (missing.length) warns.push('data-act="' + a + '" 일부 템플릿(' + missing.length + '곳)에 data-' + k + ' 없음');
      }
    }
  }
  return {fails, warns, info: '처리기 데이터 요구 검사'};
});
await stage('단위 테스트', async () => {
  const files = FAST ? ['test/live.test.mjs', 'test/harness.test.mjs'] : (await fs.readdir(path.join(root, 'test'))).filter(n => n.endsWith('.test.mjs')).map(n => 'test/' + n);
  const r = sh(node, ['--test', ...files]);
  const out = (r.stdout || '') + (r.stderr || '');
  const pass = +(out.match(/ℹ pass (\d+)/) || [])[1] || 0, fail = +(out.match(/ℹ fail (\d+)/) || [])[1] || 0;
  const names = [...out.matchAll(/^✖ (.+?) \(\d/gm)].map(m => m[1]);
  let known = []; try { known = JSON.parse(await fs.readFile(path.join(root, 'scripts', 'harness-known.json'), 'utf8')).tests; } catch {}
  const isKnown = n => known.some(k => n.includes(k.name));
  const uniq = [...new Set(names)];
  const fails = r.status ? (uniq.length ? uniq.filter(n => !isKnown(n)).map(n => `테스트 실패: ${n}`) : ['테스트 실행 실패']) : [];
  const warns = uniq.filter(isKnown).map(n => `알려진 환경 문제로 격리됨: ${n}`);
  return {fails, warns, info: `통과 ${pass} / 실패 ${fail}` + (warns.length ? ` (격리 ${warns.length})` : '')};
});

if (!FAST) {
  await stage('빌드와 예산', async () => {
    const b = sh(node, ['scripts/live-build.mjs']);
    if (b.status) return {fails: ['빌드 실패: ' + (b.stderr || '').split('\n')[0]]};
    const fails = [], warns = [];
    const bundle = await fs.readFile(path.join(root, 'build', 'live', 'gw-live.js'));
    const kb = Math.round(bundle.length / 1024);
    if (kb > BUDGET.bundleKB) fails.push(`번들 ${kb}KB > 예산 ${BUDGET.bundleKB}KB`);
    for (const f of (await fs.readdir(path.join(root, 'src', 'live', 'wc'))).filter(n => n.endsWith('.js'))) {
      const lines = (await fs.readFile(path.join(root, 'src', 'live', 'wc', f), 'utf8')).split('\n').length;
      if (lines > BUDGET.wcFileLines) warns.push(`${f} ${lines}줄 (분리 권장, 기준 ${BUDGET.wcFileLines})`);
    }
    const ver = f => fs.readFile(path.join(root, f), 'utf8').then(t => (t.match(/const VERSION = '([\d.]+)'/) || [])[1]);
    const [vw, vc] = [await ver('src/live/workcenter.browser.js'), await ver('src/live/collector.browser.js')];
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'build', 'live', 'extension', 'manifest.json'), 'utf8')).version;
    if (new Set([vw, vc, manifest]).size !== 1) fails.push(`버전 불일치: 업무센터 ${vw}, 수집기 ${vc}, 확장 ${manifest}`);
    const sha = (await fs.readFile(path.join(root, 'build', 'live', 'gw-live.sha256'), 'utf8')).trim().split(/\s+/)[0];
    const { createHash } = await import('node:crypto');
    if (sha && !sha.startsWith(createHash('sha256').update(bundle).digest('hex').slice(0, Math.min(sha.length, 64)))) warns.push('gw-live.sha256 이 번들과 다름');
    return {fails, warns, info: `번들 ${kb}KB, 버전 ${vw}`};
  });
}

await stage('안전 규칙', async () => {
  const fails = [], warns = [];
  const read = f => fs.readFile(path.join(root, f), 'utf8');
  const col = await read('src/live/collector.browser.js');
  const m = col.match(/const READ_ONLY\s*=\s*new Set\(\[([^\]]*)\]/) || col.match(/const READ_ONLY\s*=\s*\[([^\]]*)\]/);
  const eps = m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
  if (!eps.length) warns.push('READ_ONLY 허용 목록을 찾지 못함');
  for (const e of eps) if (/save|insert|update|delete|remove|submit|approve|send|regist|create|modify|apply/i.test(e)) fails.push(`읽기 전용 목록에 쓰기로 보이는 주소: ${e}`);
  const eng = await read('src/live/wc/19-draft-engine.js');
  const deny = (eng.match(/const DENY_BTN = .*/) || [''])[0];
  for (const w of ['상신', '결재', '임시저장', '삭제', '발송']) if (!deny.includes(w)) fails.push(`비가역 버튼 차단 목록에 '${w}' 없음`);
  const rec = await read('src/live/wc/20-recorder.js');
  const rd = (rec.match(/const REC_DANGER = .*/) || [''])[0];
  for (const w of ['상신', '결재', '삭제', '발송']) if (!rd.includes(w)) fails.push(`기록기 위험 버튼 목록에 '${w}' 없음`);
  if (!/recorderPlayConfirm/.test(await read('src/live/briefing.mjs'))) fails.push('기록기 재생 확인 정책 누락');
  // 라이브 코드의 모든 외부 호스트: 허용 목록만
  const hosts = new Set();
  for (const f of ['src/live/collector.browser.js', 'src/live/workcenter.browser.js', ...(await fs.readdir(path.join(root, 'src/live/wc'))).map(n => 'src/live/wc/' + n)]) {
    for (const x of (await read(f)).matchAll(/https?:\/\/([\w.-]+)/g)) hosts.add(x[1]);
  }
  const okHosts = /^(gw\.bwyf\.or\.kr|api\.github\.com|github\.com|www\.w3\.org|localhost|127\.0\.0\.1|generativelanguage\.googleapis\.com|aistudio\.google\.com)$/;
  for (const h of hosts) if (!okHosts.test(h)) warns.push(`허용 목록에 없는 외부 주소: ${h}`);
  // 글자 크기 12px 미만 금지 (접근성)
  const css = (await read('src/live/wc-style.css')) + (await read('src/live/wc-theme.css'));
  for (const x of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) if (+x[1] < BUDGET.minFontPx) { fails.push(`글자 크기 ${x[1]}px < ${BUDGET.minFontPx}px`); break; }
  return {fails, warns, info: `읽기 전용 주소 ${eps.length}개, 외부 호스트 ${hosts.size}개`};
});

await stage('비밀·개인정보', async () => {
  const fails = [];
  const files = sh('git', ['ls-files']).stdout.split('\n').filter(Boolean);
  const bad = files.filter(f => /기안패턴_수집원본|\.env$|credentials|secret/i.test(f) && !/\.example$/.test(f));
  for (const f of bad) fails.push(`커밋 대상에 민감 파일: ${f}`);
  const pats = [[/ghp_[A-Za-z0-9]{30,}/, 'GitHub 토큰'], [/sk-[A-Za-z0-9]{32,}/, 'API 키'], [/AKIA[0-9A-Z]{16}/, 'AWS 키'], [/\b\d{6}-[1-4]\d{6}\b/, '주민등록번호 형태'], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '개인 키']];
  for (const f of files.filter(f => /^(src|scripts|docs|test)\//.test(f) && /\.(m?js|md|json|css|html|ps1)$/.test(f))) {
    let t; try { t = await fs.readFile(path.join(root, f), 'utf8'); } catch { continue; }
    for (const [re, n] of pats) if (re.test(t)) fails.push(`${n} 의심: ${f}`);
  }
  return {fails, info: `${files.length}개 추적 파일`};
});

const failed = results.filter(r => !r.ok);
const report = {at: new Date().toISOString(), mode: FAST ? 'fast' : 'full', ok: !failed.length, stages: results};
await fs.mkdir(path.join(root, 'build', 'harness'), {recursive: true});
await fs.writeFile(path.join(root, 'build', 'harness', 'report.json'), JSON.stringify(report, null, 2));
const md = [`# 하네스 보고서 (${report.mode}) ${report.ok ? '통과' : '실패'}`, '', '| 단계 | 결과 | 시간 | 요약 |', '|---|---|---|---|', ...results.map(r => `| ${r.name} | ${r.ok ? '통과' : '실패'} | ${r.ms}ms | ${r.info} |`), '',
  ...results.flatMap(r => [...r.fails.map(f => `- 실패 [${r.name}] ${f}`), ...r.warns.slice(0, 15).map(w => `- 주의 [${r.name}] ${w}`)])].join('\n');
await fs.writeFile(path.join(root, 'build', 'harness', 'report.md'), md);

if (AS_JSON) console.log(JSON.stringify({ok: report.ok, failures: results.flatMap(r => r.fails.map(f => ({stage: r.name, message: f})))}));
else {
  for (const r of results) {
    console.log(`${r.ok ? '[통과]' : '[실패]'} ${r.name} (${r.ms}ms) ${r.info}`);
    r.fails.forEach(f => console.log('   x ' + f));
    r.warns.slice(0, 5).forEach(w => console.log('   ! ' + w));
    if (r.warns.length > 5) console.log(`   ! 외 주의 ${r.warns.length - 5}건 (build/harness/report.md)`);
  }
  console.log(report.ok ? '\n하네스 통과' : `\n하네스 실패 ${failed.length}단계`);
}
process.exit(report.ok ? 0 : 1);
