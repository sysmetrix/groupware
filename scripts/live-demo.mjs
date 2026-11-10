// GW 비서 둘러보기(데모): 그룹웨어 로그인 없이, 지어낸 자료로 GW 비서 화면을 띄운다.
// Usage: node scripts/live-demo.mjs [--out-dir <dir>] [--serve] [--port <n>]
//   <out>/index.html   둘러보기 페이지 (가짜 그룹웨어 배경 위에 GW 비서를 연다)
//   <out>/gw-demo.js   데모 수집기 + 분석 + GW 비서 (실제 번들과 같은 조립, 수집기만 바꿈)
//   <out>/pane.html    처리 창에 뜨는 안내 화면 (실제로는 그룹웨어 원래 화면이 뜨는 자리)
// <out> 기본값은 build/demo. --serve 는 127.0.0.1 에서만 연다(기본 포트 3220).
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT, readSources, assemble, syntaxError} from './live-build.mjs';

export const DEMO_OUT_DIR = path.join(ROOT, 'build', 'demo');
const lf = s => s.replace(/\r\n?/g, '\n');

export function demoPage(version) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GW 비서 둘러보기</title>
<style>
html,body{height:100%;margin:0}
body{font:15px/1.6 "Pretendard","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;color:#1f2937;background:#eef1f6}
.gw-top{height:52px;background:#1d3557;color:#fff;display:flex;align-items:center;gap:18px;padding:0 20px;font-weight:700}
.gw-top span{font-weight:400;opacity:.75;font-size:13px}
.gw-body{display:grid;grid-template-columns:220px 1fr;height:calc(100% - 52px)}
.gw-side{background:#fff;border-right:1px solid #dde3ec;padding:16px;display:grid;gap:10px;align-content:start}
.gw-side i{display:block;height:14px;border-radius:7px;background:#e6ebf2}
.gw-main{padding:32px;max-width:720px}
.gw-main h1{font-size:22px;margin:0 0 8px}
.gw-main p{margin:0 0 12px;color:#4b5563}
.gw-main button{font:inherit;font-weight:700;color:#fff;background:#2563eb;border:0;border-radius:10px;padding:10px 18px;cursor:pointer}
.gw-main button:hover{background:#1d4ed8}
.gw-note{margin-top:20px;padding:12px 14px;border-radius:10px;background:#fff7e6;border:1px solid #f3dca8;color:#7a4b00;font-size:14px}
</style></head><body>
<div class="gw-top">가상 그룹웨어 <span>둘러보기용 배경 화면입니다</span></div>
<div class="gw-body"><aside class="gw-side">${'<i></i>'.repeat(9)}</aside>
<main class="gw-main"><h1>GW 비서 둘러보기 <small style="font-size:14px;color:#6b7280;font-weight:400">v${version}</small></h1>
<p>로그인 없이 GW 비서 화면을 살펴보는 곳입니다. 보이는 기관·사람·문서·금액은 모두 지어낸 것입니다.</p>
<p><button id="open" type="button">GW 비서 열기</button></p>
<div class="gw-note">실제 그룹웨어에는 아무 요청도 보내지 않습니다. 숨기기·할 일·설정은 이 브라우저의 둘러보기 전용 저장소에만 남습니다.</div></main></div>
<script src="gw-demo.js"></script>
<script>
document.getElementById('open').addEventListener('click', function () { window.BWYFGW_WC.open(); });
if (!/[?&]closed\\b/.test(location.search)) window.BWYFGW_WC.open();
</script></body></html>`;
}

export const PANE_PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>둘러보기 화면</title>
<style>
html,body{height:100%;margin:0}
body{font:15px/1.65 "Pretendard","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;color:#1f2937;background:#f6f7fa;display:grid;place-items:center}
.card{max-width:460px;margin:24px;padding:28px;border-radius:16px;background:#fff;border:1px solid #e3e7ee;box-shadow:0 8px 28px rgba(15,23,42,.06)}
.kind{display:inline-block;font-size:13px;font-weight:700;color:#1d4ed8;background:#e8f0ff;border-radius:999px;padding:2px 10px;margin-bottom:10px}
h1{font-size:18px;line-height:1.45;margin:0 0 6px;word-break:keep-all}
.no{font-size:13px;color:#6b7280;margin:0 0 14px}
p{margin:0;color:#4b5563;font-size:14px}
</style></head><body><div class="card"><span class="kind" id="k"></span><h1 id="t"></h1><p class="no" id="n"></p>
<p>실제로 쓰실 때는 이 자리에 그룹웨어의 원래 화면이 열려, 결재·접수·답장 같은 처리를 그 화면의 버튼으로 직접 하십니다. 둘러보기에서는 안내 화면만 보여 드립니다.</p></div>
<script>
var p = new URLSearchParams(location.hash.slice(1));
document.getElementById('k').textContent = p.get('kind') || '그룹웨어 화면';
document.getElementById('t').textContent = p.get('title') || '';
document.getElementById('n').textContent = p.get('no') ? '문서번호 ' + p.get('no') : '';
</script></body></html>`;

/** 실제 번들과 같은 조립 과정을 쓰되 수집기만 데모용으로 바꾼다. */
export async function buildDemo(outDir = DEMO_OUT_DIR, root = ROOT) {
  const src = await readSources(root);
  const demoCollector = lf(await fs.readFile(path.join(root, 'src', 'live', 'demo', 'demo-collector.browser.js'), 'utf8'));
  const version = (src.template.match(/const VERSION = '([^']+)'/) || [])[1] || '';
  const {bundle} = assemble({...src, collector: demoCollector.replace('/*@DEMO_VERSION@*/', version)});
  const err = syntaxError(bundle, 'gw-demo.js');
  if (err) throw new Error(`gw-demo.js 구문 오류 (${err.line}행): ${err.message}`);
  await fs.mkdir(outDir, {recursive: true});
  await Promise.all([
    fs.writeFile(path.join(outDir, 'gw-demo.js'), bundle),
    fs.writeFile(path.join(outDir, 'index.html'), demoPage(version)),
    fs.writeFile(path.join(outDir, 'pane.html'), PANE_PAGE),
  ]);
  return {outDir, version, kb: Math.round(bundle.length / 1024)};
}

const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8'};
/** 둘러보기 폴더의 세 파일만 내주는 loopback 전용 서버. 요청마다 다시 조립해 소스 수정이 새로고침만으로 반영된다. */
export function serveDemo({outDir = DEMO_OUT_DIR, port = 3220, rebuild = true} = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
      if (!['index.html', 'gw-demo.js', 'pane.html'].includes(name)) { res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'}); res.end('없는 주소입니다.'); return; }
      if (rebuild && name === 'index.html') await buildDemo(outDir);
      const body = await fs.readFile(path.join(outDir, name));
      res.writeHead(200, {'content-type': TYPES[path.extname(name)], 'cache-control': 'no-store'});
      res.end(body);
    } catch (e) { res.writeHead(500, {'content-type': 'text/plain; charset=utf-8'}); res.end(`둘러보기를 만들지 못했습니다: ${(e && e.message) || e}`); }
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server)); });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const outDir = arg('--out-dir') ? path.resolve(arg('--out-dir')) : DEMO_OUT_DIR;
  const port = Number(arg('--port') || process.env.PORT || 3220);
  try {
    const r = await buildDemo(outDir);
    console.log(`GW 비서 둘러보기 v${r.version} · ${r.kb}KB → ${path.relative(ROOT, r.outDir)}`);
    if (argv.includes('--serve')) {
      await serveDemo({outDir, port});
      console.log(`http://127.0.0.1:${port} 에서 열립니다. (Ctrl+C 로 종료)`);
    }
  } catch (e) { console.error((e && e.message) || e); process.exit(1); }
}
