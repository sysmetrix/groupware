// Builds the in-browser bundle (collector + analysis + integrated work center) and bookmarklets.
// Usage: node scripts/live-build.mjs [--out-dir <dir>] [--copy-to <dir>]
//   <out>/gw-live.js            bundle (Aside injection / DevTools snippet)
//   <out>/bookmarklet.txt       install bookmark: stores the bundle in this browser and opens the work center
//   <out>/bookmarklet-mini.txt  launch bookmark: opens the stored work center (tiny)
//   <out>/install.html          page with both draggable bookmarks
//   <out>/extension/            Chrome/Edge extension (policy.js is kept when an administrator changed it)
// <out> defaults to build/live. Use --out-dir for isolated builds (tests) so the real build and its policy stay untouched.
// The output is a pure function of the sources: no clock or machine value goes into the bundle, so the SHA-256 is reproducible.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OUT_DIR = path.join(ROOT, 'build', 'live');
export const EXTRA_MODULES = ['home-model.mjs', 'chat.mjs'];
const PARTS_MARK = '  /*@WC_PARTS@*/';
const CSS_MARK = "'/*@WC_CSS@*/'";
const lf = s => s.replace(/\r\n?/g, '\n');

const runner = `
(() => {
  const KEY = 'bwyfgw:state';
  // One-shot briefing in a new tab (kept for the v1 bookmark and quick checks).
  window.BWYFGW_RUN = async function run(options = {}) {
    const win = options.window === false ? null : window.open('', '_blank');
    if (win) win.document.write('<meta charset="utf-8"><title>그룹웨어 브리핑</title><p style="font:15px sans-serif;padding:24px">그룹웨어 자료를 읽는 중입니다… (읽기 전용)</p>');
    try {
      const raw = await window.BWYFGW.collect(options);
      let prev = null; try { prev = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
      const analysis = BWYFGW_REPORT.analyze(raw, prev && Date.parse(prev.at) < Date.parse(raw.collectedAt) ? prev : null);
      if (!raw.sessionExpired) localStorage.setItem(KEY, JSON.stringify(BWYFGW_REPORT.nextState(raw, prev)));
      if (win) { win.document.open(); win.document.write(BWYFGW_REPORT.renderHtml(analysis)); win.document.close(); }
      return {raw, analysis};
    } catch (e) {
      if (win) win.document.body.innerHTML = '<p style="font:15px sans-serif;padding:24px;color:#c00">실행하지 못했습니다: ' + String((e && e.message) || e).replace(/</g, '&lt;') + '</p>';
      throw e;
    }
  };
})();`;

// Default administrator policy. Kept byte-identical across versions so an untouched file is recognised as "not configured".
export const DEFAULT_POLICY = `// GW 통합 업무센터 관리자 정책. 이 파일만 수정해 배포하면 조직 전체 설정을 바꿀 수 있습니다.
// 값이 없거나 잘못되면 안전한 기본값이 쓰입니다. (기록기 재생 확인은 끌 수 없습니다.)
window.BWYFGW_POLICY = {
  orgName: '',            // 안내 화면에 표시할 기관명
  enabled: true,          // false: 업무센터 전체 중지(긴급 차단)
  message: '',            // 기능이 꺼졌을 때 사용자에게 보여 줄 문구(예: 문의 부서)
  retentionDays: 90,      // 학습한 결재문서 보관일(7~365)
  features: {             // false로 바꾸면 해당 기능 차단
    briefing: true, draftResult: true, draftPlan: true, draftPay: true, draftGoods: true,
    recorder: true, aiConsole: true, updateCheck: true, googleCalendar: true
  }
};
`;

// Extension launcher. Runs in every top-level gw.bwyf.or.kr page (all_frames: false keeps it out of iframes).
export const MOUNT_JS = `// Shows the "업무센터" launcher once the groupware app has loaded (retries up to ~20 s).
(function () {
  try { if (window.top !== window) return; } catch (e) { return; }
  // The groupware opens its own screens (결재문서, 메일 쓰기, 게시글 등) as top-level popup windows at /#popup?… or /#/popup?….
  // They are not the main app: no launcher, no data read there.
  if (/^#\\/?popup(?:[?/&]|$)/i.test(location.hash || '')) return;
  var started = false;
  function wait(n) {
    try { if (Object.keys(window).some(function (k) { return k.indexOf('webpackChunk') === 0; }) && document.body) { window.BWYFGW_WC.mount(); return; } } catch (e) {}
    if (n < 40) { setTimeout(function () { wait(n + 1); }, 500); return; }
    // Could not start: tell the user instead of failing silently.
    var d = document.createElement('div');
    d.textContent = '업무센터를 불러오지 못했습니다. 그룹웨어에 로그인한 뒤 새로고침(F5) 해 주세요.';
    d.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483500;background:#fff4e0;color:#7a4b00;border:1px solid #f0d68a;border-radius:10px;padding:8px 14px;font:13px "Malgun Gothic",sans-serif';
    if (document.body) { document.body.append(d); setTimeout(function () { d.remove(); }, 12000); }
  }
  function start() { if (started) return; started = true; wait(0); }
  // mount() reads the groupware once to fill the launcher badge. A tab opened in the background does not need that
  // until the user actually looks at it, so wait for it to become visible instead of reading in every hidden tab.
  if (document.visibilityState === 'hidden') {
    document.addEventListener('visibilitychange', function onVisible() {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', onVisible);
      start();
    });
  } else start();
})();
`;

/** Reads every source the bundle is made of (line endings normalised, so CRLF checkouts hash the same). */
export async function readSources(root = ROOT) {
  const live = path.join(root, 'src', 'live');
  const read = async f => lf(await fs.readFile(path.join(live, f), 'utf8'));
  const partNames = (await fs.readdir(path.join(live, 'wc'))).filter(n => n.endsWith('.js')).sort();
  return {
    collector: await read('collector.browser.js'),
    css: (await read('wc-style.css')) + '\n' + (await read('wc-theme.css')) + '\n' + (await read('wc-home.css').catch(() => '')) + '\n' + (await read('wc-chat.css').catch(() => '')),
    parts: await Promise.all(partNames.map(async file => ({file, src: await read(`wc/${file}`)}))),
    template: await read('workcenter.browser.js'),
    // 순수 로직 모듈: briefing.mjs 뒤에 이어 붙여 한 범위(R.*)로 내보낸다. 서로 import 하지 않고, 이름이 겹치지 않도록 home-model은 hm*, chat은 ch* 접두를 쓴다.
    briefing: [await read('briefing.mjs'), ...(await Promise.all(EXTRA_MODULES.map(f => read(f).catch(() => ''))))].join('\n'),
  };
}

/** Assembles the bundle text from sources. Pure: same input, same output. Returns a line map for error reporting. */
export function assemble({collector, css, parts, template, briefing: briefingSrc}) {
  if (parts.length < 10) throw new Error('work center parts missing');
  const halves = template.split(PARTS_MARK);
  if (halves.length !== 2) throw new Error('work center parts were not assembled (workcenter.browser.js needs exactly one /*@WC_PARTS@*/ marker)');
  const wcCss = css.replace(/\n+/g, '\n');
  // The CSS marker is replaced once, in source order (template head, parts, template tail). JSON keeps it on one line.
  const wcSegs = [{label: 'workcenter.browser.js', text: halves[0]}, ...parts.map((p, i) => ({label: `wc/${p.file}`, text: p.src + (i < parts.length - 1 ? '\n' : '')})), {label: 'workcenter.browser.js', text: halves[1]}];
  const cssAt = wcSegs.findIndex(s => s.text.includes(CSS_MARK));
  if (cssAt >= 0) wcSegs[cssAt] = {...wcSegs[cssAt], text: wcSegs[cssAt].text.replace(CSS_MARK, () => JSON.stringify(wcCss))};
  const workcenter = wcSegs.map(s => s.text).join('');
  if (workcenter.includes('/*@WC_PARTS@*/')) throw new Error('work center parts were not assembled');
  if (!workcenter.includes(':host{all:initial}')) throw new Error('wc-style.css was not inlined');
  if (/^\s*import\s/m.test(briefingSrc)) throw new Error('briefing.mjs must stay dependency-free to be bundled.');
  const briefing = briefingSrc.replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, '');
  const exported = [...briefingSrc.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_]+)/gm)].map(m => m[1]);
  const version = (workcenter.match(/const VERSION = '([^']+)'/) || [])[1] || '';
  const segs = [
    {label: 'header', text: `/* BWYF groupware live bundle v${version} — generated by scripts/live-build.mjs */\n`},
    {label: 'collector.browser.js', text: `${collector}\n`},
    {label: 'briefing.mjs', text: `(() => {\n${briefing}\nwindow.BWYFGW_REPORT = Object.freeze({${exported.join(', ')}});\n})();\n`},
    {label: 'runner', text: `${runner}\n`},
    ...wcSegs, {label: 'footer', text: '\n'},
  ];
  const bundle = segs.map(s => s.text).join('');
  const lineMap = [];
  let line = 1;
  for (const s of segs) { const n = s.text.split('\n').length - 1; lineMap.push({label: s.label, start: line, end: line + Math.max(n, 1) - 1}); line += n; }
  return {bundle, workcenter, exported, version, lineMap};
}

const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** Parses `code` as a classic script without running it. Returns null or {line, message}. */
export function syntaxError(code, filename, lineOffset = 0) {
  try { new vm.Script(code, {filename, lineOffset}); return null; } catch (e) {
    if (!e || e.name !== 'SyntaxError') throw e;
    const m = String(e.stack || '').match(/^[^\n]*:(\d+)\n/);
    return {line: m ? +m[1] : null, message: e.message};
  }
}

/**
 * Syntax CI for the work center: every src/live/wc fragment must parse on its own as the body of boot()
 * (it may call functions defined in other fragments), and the assembled bundle must parse as a whole
 * (catches errors that only appear when fragments are joined, e.g. a name declared twice).
 */
export async function checkLiveSyntax(root = ROOT) {
  const src = await readSources(root);
  const errors = [];
  for (const p of src.parts) {
    // Same shape as the real host: a strict function body inside an IIFE. The wrapper line is offset away.
    const e = syntaxError(`(function boot() { 'use strict';\n${p.src}\n});`, `src/live/wc/${p.file}`, -1);
    if (e) errors.push({file: `src/live/wc/${p.file}`, line: e.line, message: e.message});
  }
  let bundleKB = 0;
  try {
    const {bundle, lineMap} = assemble(src);
    bundleKB = Math.round(bundle.length / 1024);
    const e = syntaxError(bundle, 'gw-live.js (assembled)');
    if (e) {
      const seg = lineMap.find(s => e.line >= s.start && e.line <= s.end);
      errors.push({file: 'gw-live.js (assembled)', line: e.line, message: e.message + (seg ? ` (in ${seg.label} near line ${e.line - seg.start + 1})` : '')});
    }
  } catch (e) { errors.push({file: 'gw-live.js (assembled)', line: null, message: e.message}); }
  return {fragments: src.parts.length, bundleKB, errors};
}

/** Runs a policy.js text in an empty sandbox and returns its BWYFGW_POLICY object (or an error). */
export function evaluatePolicy(text) {
  try {
    const sandbox = {window: {}};
    vm.runInNewContext(text, sandbox, {timeout: 200, filename: 'policy.js'});
    const p = sandbox.window.BWYFGW_POLICY;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {ok: false, error: 'window.BWYFGW_POLICY 객체를 정의하지 않습니다'};
    return {ok: true, value: JSON.parse(JSON.stringify(p))};
  } catch (e) { return {ok: false, error: (e && e.message) || String(e)}; }
}
const canonical = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(n => [n, x[n]])) : x);

/**
 * Decides what to do with <ext>/policy.js. An administrator's edited policy is never overwritten:
 *  - missing, or same values as the default -> write the default template
 *  - valid and different from the default    -> keep the file byte-for-byte
 *  - present but broken                      -> stop the build (nothing is written) so the admin's setting is not lost
 */
export async function resolvePolicy(extDir) {
  const file = path.join(extDir, 'policy.js');
  let existing;
  try { existing = await fs.readFile(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return {action: 'created', text: DEFAULT_POLICY}; throw e; }
  if (existing === DEFAULT_POLICY) return {action: 'default', text: DEFAULT_POLICY};
  const cur = evaluatePolicy(existing);
  if (!cur.ok) throw new Error(`기존 관리자 정책 파일을 읽을 수 없어 빌드를 멈췄습니다(${file}): ${cur.error}. 파일을 고치거나, 기본값으로 되돌리려면 지운 뒤 다시 빌드하세요.`);
  if (canonical(cur.value) === canonical(evaluatePolicy(DEFAULT_POLICY).value)) return {action: 'default', text: DEFAULT_POLICY};
  return {action: 'preserved', text: existing};
}

export function installPage({install, mini, version, hash}) {
  const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>GW 통합 업무센터 설치</title><style>body{font:15px/1.65 "Malgun Gothic",sans-serif;max-width:760px;margin:40px auto;padding:0 18px;color:#1d2330}a.bm{display:inline-block;padding:10px 18px;border-radius:8px;background:#1a73e8;color:#fff;text-decoration:none;font-weight:700;margin:4px 8px 4px 0}a.bm.alt{background:#1d2b4f}code,kbd{background:#f1f3f4;padding:1px 5px;border-radius:4px}li{margin:4px 0}</style></head><body>
<h1>GW 통합 업무센터</h1>
<p>그룹웨어 한 화면에서 결재·문서유통·메일·공지·근태·연차·예산·일정·통합검색을 보고, 오른쪽 처리 창에 그룹웨어 원래 화면을 띄워 그 자리에서 처리합니다.</p>
<h2>설치 (처음 한 번)</h2>
<ol><li>아래 두 버튼을 브라우저 <b>북마크바로 끌어다 놓습니다</b>.</li><li>그룹웨어(gw.bwyf.or.kr)에 로그인한 화면에서 <b>GW 업무센터 설치</b>를 한 번 누릅니다. 업무센터가 열리고 이 브라우저에 저장됩니다.</li><li>다음부터는 작은 <b>GW 업무센터</b> 북마크로 엽니다. 업무센터를 한 번 연 탭에서는 오른쪽 아래 버튼이나 <kbd>Alt</kbd>+<kbd>G</kbd>로 열고 닫습니다.</li></ol>
<p><a class="bm" href="${attr(install)}">GW 업무센터 설치</a><a class="bm alt" href="${attr(mini)}">GW 업무센터</a></p>
<h2>기능</h2><ul>
<li><b>오늘 할 일</b>: 누르면 걸러지는 카드·그래프와 점수순 처리 목록(기한 임박·오래 기다린 순, 긴급은 최대 6건). 여러 개 선택, 숨기기·미루기와 되돌리기, 휴가일 마감 경고.</li><li><b>연속 처리</b>: 처리할 일을 하나씩 열고, 처리 후 그룹웨어에서 실제로 사라졌는지(문서), 보낸메일함에 답장이 있는지(메일) 확인합니다. Ctrl+K 명령 찾기.</li>
<li><b>처리 창</b>: 항목을 누르면 그룹웨어 원래 결재문서·게시글·근태신청 화면이 같은 페이지에 열립니다. 열린 문서 본문에서 기한·요청 사항·붙임을 자동으로 찾아 할 일로 넣을 수 있습니다.</li>
<li><b>배부·접수 추천</b>: 최근 180일 처리 이력으로 배부 대기 문서의 부서, 부서 접수 문서의 담당자를 추천합니다.</li>
<li><b>통합검색</b>: 결재문서 본문, 메일 본문, 게시판, 첨부파일, 일정, 인물, 연락처를 한 번에.</li>
<li><b>예산 집행</b>: 프로젝트 누계 예실, 세목별 결의 내역(결의일·적요·금액·문서번호)과 집행액 대조, 결재문서 바로 열기, CSV.</li>
<li><b>근태·연차</b>: 일별 근무 기록과 이상 근태, 연차 잔여·사용 내역. <b>일정·기한</b>, <b>내 할 일</b>, <b>보고서</b>(오늘 브리핑, 주간 업무 실적 초안).</li>
<li>자동 새로고침(기본 5분, 입력 중에는 화면 유지)과 새 긴급 항목 알림. 단축키 <kbd>J</kbd>/<kbd>K</kbd> 이동, <kbd>Enter</kbd> 처리 창에 열기, <kbd>X</kbd> 숨기기, <kbd>S</kbd> 미루기, <kbd>F</kbd> 연속 처리, <kbd>Ctrl</kbd>+<kbd>Z</kbd> 되돌리기(한글 입력 상태에서도 동작).</li></ul>
<h2>안전</h2><ul><li>업무센터가 그룹웨어에 직접 등록하는 것은 자원 예약(회의실·공용차량) 한 가지뿐이며, 중복·한도를 확인하고 사용자가 마지막으로 확인한 뒤에만 등록합니다. 기안 화면에는 값을 채우기만 하고, 결재·상신·접수·배부·발송은 처리 창의 그룹웨어 원래 버튼으로 직접 합니다.</li><li>목록·검색·미리보기만으로는 메일·문서의 읽음 상태가 바뀌지 않습니다. 읽지 않은 문서·메일·게시글을 처리 창에 열 때는 먼저 묻습니다.</li><li>처리 창에 입력하던 내용이 있으면 다른 항목으로 옮기기 전에 확인합니다.</li><li>숨기기·할 일·설정은 이 브라우저에만 저장됩니다. 로그인 정보는 읽지 않습니다.</li></ul>
<p style="color:#6b7280;font-size:13px">설치 북마크 ${Math.round(install.length / 1024)}KB · 실행 북마크 ${Math.round(mini.length / 1024)}KB · 버전 ${version} · SHA-256 ${hash.slice(0, 12)}. 새 버전은 설치 북마크를 다시 끌어다 놓고 한 번 누르면 바뀝니다.</p>
</body></html>`;
}

export function parseArgs(argv) {
  const opts = {outDir: DEFAULT_OUT_DIR, copyTo: null};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const value = () => { const v = inline ?? argv[++i]; if (!v || v.startsWith('--')) throw new Error(`${flag} 다음에 폴더를 지정하세요.`); return path.resolve(v); };
    if (flag === '--out-dir') opts.outDir = value();
    else if (flag === '--copy-to') opts.copyTo = value();
    else throw new Error(`알 수 없는 옵션: ${a} (사용법: node scripts/live-build.mjs [--out-dir <dir>] [--copy-to <dir>])`);
  }
  return opts;
}

export async function build({outDir = DEFAULT_OUT_DIR, copyTo = null, root = ROOT} = {}) {
  const {bundle, workcenter, exported, version} = assemble(await readSources(root));
  const extDir = path.join(outDir, 'extension');
  const policy = await resolvePolicy(extDir); // before any write: a broken admin policy stops the build with nothing changed
  const hash = sha256(bundle);
  await fs.mkdir(extDir, {recursive: true});
  await fs.writeFile(path.join(outDir, 'gw-live.js'), bundle);
  // Chrome/Edge extension (Manifest V3): loads the same bundle on gw.bwyf.or.kr and shows the launcher button.
  const verNum = (workcenter.match(/const VERSION = '([\d.]+)'/) || [])[1] || '4.0.0';
  await fs.writeFile(path.join(extDir, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'GW 통합 업무센터', version: verNum, minimum_chrome_version: '111',
    description: '부천여성청소년재단 그룹웨어 위에서 내 처리할 일을 한 화면에 모아 보여 줍니다(그룹웨어 화면을 읽고 기안 화면에 값을 채워 줍니다. 상신·결재·저장·삭제는 하지 않습니다).',
    icons: {16: 'icon16.png', 48: 'icon48.png', 128: 'icon128.png'},
    // MAIN world: runs in the page itself (needs the page's own groupware client); no string injection.
    content_scripts: [{matches: ['https://gw.bwyf.or.kr/*'], js: ['policy.js', 'gw-live.js', 'mount.js'], run_at: 'document_idle', world: 'MAIN', all_frames: false}],
  }, null, 2));
  if (policy.action !== 'preserved') await fs.writeFile(path.join(extDir, 'policy.js'), policy.text);
  await fs.writeFile(path.join(extDir, 'mount.js'), MOUNT_JS);
  await fs.rm(path.join(extDir, 'loader.js'), {force: true});
  for (const n of [16, 48, 128]) await fs.copyFile(path.join(root, 'src', 'live', 'ext', `icon${n}.png`), path.join(extDir, `icon${n}.png`));
  await fs.writeFile(path.join(extDir, 'gw-live.js'), bundle);

  const guard = `if(location.origin!=='https://gw.bwyf.or.kr'){alert('그룹웨어(gw.bwyf.or.kr)에 로그인한 화면에서 눌러 주세요.');return;}`;
  // Install bookmark: carries the whole bundle once, stores it, then opens the work center.
  const install = 'javascript:' + encodeURIComponent(`(function(){${guard}var s=${JSON.stringify(bundle)};try{(0,eval)(s);}catch(e){alert('업무센터를 불러오지 못했습니다: '+e.message);return;}try{window.BWYFGW_WC.install(s);}catch(e){}window.BWYFGW_WC.open();})();`);
  // Launch bookmark: tiny; runs the copy stored by the install bookmark only if its SHA-256 matches this build
  // (protects against a changed or outdated copy in localStorage).
  const wcVersion = (workcenter.match(/const VERSION = '([^']+)'/) || [])[1] || '';
  const mini = 'javascript:' + encodeURIComponent(`(function(){${guard}if(window.BWYFGW_WC&&window.BWYFGW_WC.version===${JSON.stringify(wcVersion)}){window.BWYFGW_WC.open();return;}var s=localStorage.getItem('bwyfgw:wc:src');if(!s){alert('먼저 "GW 업무센터 설치" 북마크를 한 번 눌러 주세요.');return;}crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)).then(function(b){var h=Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');if(h!==${JSON.stringify(hash)}){alert('저장된 업무센터가 이 북마크와 버전이 다르거나 바뀌었습니다. 설치 페이지에서 두 북마크를 다시 끌어다 놓고 "설치"를 한 번 누르세요.');return;}(0,eval)(s);window.BWYFGW_WC.open();});})();`);
  await fs.writeFile(path.join(outDir, 'bookmarklet.txt'), install);
  await fs.writeFile(path.join(outDir, 'bookmarklet-mini.txt'), mini);
  await fs.writeFile(path.join(outDir, 'install.html'), installPage({install, mini, version: wcVersion, hash}));
  if (copyTo) { await fs.mkdir(copyTo, {recursive: true}); await fs.writeFile(path.join(copyTo, 'gw-live.js'), bundle); }
  await fs.writeFile(path.join(outDir, 'gw-live.sha256'), hash);
  return {bundle: path.join(outDir, 'gw-live.js'), bundleKB: Math.round(bundle.length / 1024), installKB: Math.round(install.length / 1024), miniKB: Math.round(mini.length / 1024), sha256: hash.slice(0, 12), version, policy: policy.action, exported};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await build(parseArgs(process.argv.slice(2)))));
  } catch (e) {
    console.error(`live-build: ${e.message}`);
    process.exitCode = 1;
  }
}
