import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {zipSync} from './lib/zip.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const out = path.resolve(process.argv[2] || 'build/pages');
const live = path.resolve(process.argv[3] || 'build/live');
const bundle = await readFile(path.join(live, 'gw-live.js'), 'utf8');
const hash = (await readFile(path.join(live, 'gw-live.sha256'), 'utf8')).trim();
if (!/^[a-f0-9]{64}$/.test(hash) || createHash('sha256').update(bundle).digest('hex') !== hash) throw Error('Invalid bundle');
const version = (bundle.match(/live bundle v(\d+\.\d+\.\d+)/) || [])[1] || '';
if (!version) throw Error('Bundle version not found');
const root = 'https://sysmetrix.github.io/groupware/';
const loader = `(async function(){if(location.origin!=='https://gw.bwyf.or.kr'){alert('그룹웨어에 로그인한 화면에서 눌러 주세요.');return}try{var base=${JSON.stringify(root)},opt={cache:'no-store',credentials:'omit',redirect:'error'},r=await fetch(base+'current.json',opt);if(!r.ok)throw Error('버전 정보 HTTP '+r.status);var m=await r.json();if(!/^[a-f0-9]{64}$/.test(m.sha256)||m.file!=='gw-live-'+m.sha256+'.js')throw Error('버전 정보가 올바르지 않습니다.');var b=await fetch(base+m.file,opt);if(!b.ok)throw Error('실행 파일 HTTP '+b.status);var s=await b.text(),d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)),h=Array.from(new Uint8Array(d),x=>x.toString(16).padStart(2,'0')).join('');if(h!==m.sha256)throw Error('실행 파일 무결성 확인에 실패했습니다.');(0,eval)(s);window.BWYFGW_WC.open()}catch(e){alert('GW 비서를 열지 못했습니다. 인터넷 연결과 브라우저 정책을 확인하세요.\\n'+e.message)}})();`;
const bookmark = 'javascript:' + encodeURIComponent(loader);
const safe = bookmark.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
// 확장 프로그램 묶음: 한 번 설치하면 그룹웨어를 열 때마다 버튼이 뜨고, 새 버전은 GW 비서가 스스로 받아 온다.
const extDir = path.join(live, 'extension');
const extFiles = await Promise.all((await readdir(extDir)).sort().map(async n => ({name: `gw-bisu-extension/${n}`, data: await readFile(path.join(extDir, n))})));
if (!extFiles.some(f => f.name.endsWith('/manifest.json')) || !extFiles.some(f => f.name.endsWith('/mount.js'))) throw Error('Extension files missing');
const extZip = zipSync(extFiles);
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GW 비서 시작하기</title><style>
body{font-family:"Pretendard","Malgun Gothic",system-ui,sans-serif;background:#f2f3f5;color:#191f28;max-width:780px;margin:0 auto;padding:32px 20px 56px;line-height:1.7;word-break:keep-all}
h1{font-size:26px;line-height:1.3;letter-spacing:-.03em;margin:0 0 6px}h2{font-size:18px;letter-spacing:-.02em;margin:0 0 4px}
.lead{color:#4e5968;margin:0 0 22px}.ver{display:inline-block;font-size:13px;font-weight:600;color:#1f5eda;background:#e8f0ff;border-radius:999px;padding:1px 10px;margin-left:8px;vertical-align:3px}
.card{background:#fff;border:1px solid #e9ebee;border-radius:16px;padding:24px 26px;margin:0 0 16px}
.tag{display:inline-block;font-size:12.5px;font-weight:700;border-radius:6px;padding:1px 8px;margin-bottom:8px;background:#191f28;color:#fff}.tag.alt{background:#eef0f3;color:#4e5968}
.why{color:#4e5968;margin:0 0 12px}ol{margin:0;padding-left:20px}li{margin:9px 0}
.btn{display:inline-block;background:#191f28;color:#fff!important;text-decoration:none;border-radius:10px;padding:11px 20px;font-weight:700;margin:4px 0}.btn.drag{background:#1f5eda;cursor:grab}
code,kbd{font-family:inherit;font-size:14px;background:#f4f5f7;border-radius:6px;padding:1px 7px}
.note{background:#f4f5f7;border-radius:10px;padding:12px 14px;font-size:14.5px;color:#4e5968;margin-top:14px}
small{display:block;color:#626d7a;overflow-wrap:anywhere;margin-top:18px;font-size:13px}
</style></head><body>
<h1>GW 비서 시작하기<span class="ver">v${version}</span></h1>
<p class="lead">재단 그룹웨어 위에서 내 할 일·결재·메일·일정을 한 화면에 모아 봅니다. 쓰는 PC마다 아래 둘 중 하나를 한 번만 해 두면 됩니다.</p>
<section class="card"><span class="tag">권장 · PC마다 한 번</span><h2>확장 프로그램으로 설치</h2>
<p class="why">그룹웨어를 열면 <b>“GW 비서” 버튼이 항상 떠 있고</b>, 새 버전이 나오면 <b>저절로 바뀝니다</b>. 다시 설치할 일이 없습니다.</p>
<ol><li><a class="btn" href="gw-bisu-extension.zip" download>확장 프로그램 내려받기 (zip)</a><br>내려받은 파일의 압축을 풀어 지워지지 않을 곳에 둡니다. 예) <code>문서\\gw-bisu-extension</code></li>
<li>Chrome 주소창에 <code>chrome://extensions</code>를 입력해 엽니다. (Edge는 <code>edge://extensions</code>)</li>
<li>오른쪽 위 <b>개발자 모드</b>를 켜고, <b>압축해제된 확장 프로그램을 로드합니다</b>를 눌러 방금 푼 <code>gw-bisu-extension</code> 폴더를 고릅니다.</li>
<li><a href="https://gw.bwyf.or.kr/" target="_blank" rel="noopener">그룹웨어</a>를 열거나 새로고침(F5)하면 오른쪽 아래에 <b>GW 비서</b> 버튼이 나타납니다.</li></ol>
<div class="note"><b>예전에 확장 프로그램을 설치해 두었다면</b> 이번 한 번만 새 것으로 바꿔 주세요(예전 것은 스스로 최신화하지 못합니다). <code>chrome://extensions</code>에서 예전 “GW 비서”를 <b>삭제</b>한 뒤 위 순서대로 다시 설치하면 됩니다. 설정과 할 일은 그대로 남습니다.<br>Chrome이 시작할 때 “개발자 모드 확장 프로그램” 안내를 띄울 수 있습니다. 닫고 쓰시면 됩니다.</div></section>
<section class="card"><span class="tag alt">설치 없이</span><h2>북마크로 열기</h2>
<p class="why">확장 프로그램을 설치할 수 없는 PC에서 씁니다. 누를 때마다 최신 버전이 열리지만, <b>그룹웨어를 새로 열 때마다 북마크를 눌러야 버튼이 나타납니다.</b></p>
<ol><li>북마크바가 보이지 않으면 <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>를 누릅니다.</li>
<li>아래 버튼을 북마크바로 <b>끌어다 놓습니다</b>.<br><a class="btn drag" href="${safe}" onclick="event.preventDefault();alert('이 버튼은 누르는 대신 북마크바로 끌어다 놓아 주세요.')">GW 비서 열기</a></li>
<li><a href="https://gw.bwyf.or.kr/" target="_blank" rel="noopener">그룹웨어</a>에 로그인한 뒤 북마크바의 <b>GW 비서 열기</b>를 누릅니다.</li></ol></section>
<section class="card"><h2>알아 둘 점</h2>
<ul style="margin:6px 0 0;padding-left:20px"><li>새 버전은 배포 뒤 10분쯤 안에 각 PC가 알아채고, GW 비서를 쓰고 있지 않을 때(닫혀 있을 때나 그룹웨어를 새로 열 때) 바뀝니다. 쓰는 중에는 바뀌지 않습니다.</li>
<li>설정·할 일·숨김 표시는 PC와 브라우저마다 따로 저장됩니다. 옮기려면 설정 → “다른 PC로 설정 옮기기”를 쓰세요.</li>
<li>GW 비서는 이 페이지(GitHub Pages)에 게시된 코드를 그룹웨어 화면 안에서 실행합니다. 저장소와 배포 권한을 가진 계정을 보호해야 합니다. 해시 검사는 전송 중 바뀐 파일을 걸러 낼 뿐, 배포 계정이 침해된 경우를 막지는 못합니다. 업무자료나 비밀번호를 이 페이지로 보내지 않습니다.</li></ul>
<small>현재 코드 v${version} · SHA-256 ${hash}<br>인터넷 연결과 최신 Chrome 또는 Edge가 필요합니다. 브라우저·기관 네트워크 정책에 따라 제한될 수 있습니다.</small></section>
</body></html>`;
await mkdir(out,{recursive:true});
await Promise.all([writeFile(path.join(out,'index.html'),html),writeFile(path.join(out,`gw-live-${hash}.js`),bundle),writeFile(path.join(out,'gw-bisu-extension.zip'),extZip),writeFile(path.join(out,'current.json'),JSON.stringify({sha256:hash,file:`gw-live-${hash}.js`,version}))]);
console.log(JSON.stringify({page:path.join(out,'index.html'),hash,bookmarkBytes:bookmark.length}));
