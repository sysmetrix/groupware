import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const src = readFileSync(new URL('../src/live/wc/10-calendar-budget.js', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8');
const code = src.slice(src.indexOf('  const bKey ='), src.indexOf('  // 모든 사업에서 찾은 과목'));
function render(filter = '') {
 const rows = Array.from({length: 131}, (_, i) => ({code: `C${i}`, level: i === 0 ? '관' : i === 1 ? '항' : '세', name: `과목${i}`, budget: 100, executed: 10, balance: 90, rate: 10}));
 const b = {project:'A', filter, q:'', table:{project:'A', rows}, ledger:null};
 const ctx = {S:{budget:b, settings:{budget:[]}, a:{budget:{elapsedPct:50,url:''}}}, esc:x=>String(x ?? ''), won:String, pct:String, ic:()=>'', pgh:()=>'', shortLabels:a=>a, ymd8:String, budgetHitsHtml:()=>''};
 vm.createContext(ctx); vm.runInContext(code+'\nthis.render = vBudget;',ctx);
 return {html:ctx.render(),rows};
}
test('과목표는 닫힌 details 안에 전체 행과 항·세목 동작을 유지한다', () => {
 const {html, rows} = render();
 const section = html.match(/<details class="budget-subjects">([\s\S]*?)<\/details>/)?.[1];
 assert.ok(section); assert.match(section, /<summary>예산 과목표 전체 보기 \/ 접기 \(131개\)<\/summary>/);
 assert.equal((section.match(/<tr\b/g)||[]).length, 132);
 assert.match(section, /data-act="bPick" data-p="A" data-f="C1"/);
 assert.match(section, /data-act="ledger" data-code="C2"/);
 assert.match(render('C1').html, /data-act="ledger" data-code="C2"/);
 assert.equal(rows.length,131);
});
test('CSV는 펼침 상태와 관계없이 테이블 전체 데이터를 사용한다', () => {
 const line = events.match(/case 'csvBudget':[^\n]+/)[0];
 assert.match(line, /R\.toCsv\(t\.rows,/); assert.doesNotMatch(line, /querySelector|details|slice|filter/);
});
test('Chrome에서 131개 행이 기본 숨김이고 펼침과 다시 접기가 작동한다', t => {
 const chrome=process.env.CHROME_BIN||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'/usr/bin/google-chrome');
 if(!existsSync(chrome)){t.skip('Chrome을 찾지 못했습니다');return;}
 const dir=mkdtempSync(join(tmpdir(),'budget-subjects-'));
 try {
  const css=readFileSync(new URL('../src/live/wc-theme.css',import.meta.url),'utf8');
  const script=`const d=document.querySelector('.budget-subjects');const rows=[...d.querySelectorAll('tr')].slice(1);const n=()=>rows.filter(r=>r.checkVisibility()).length;const a=n(), h1=d.getBoundingClientRect().height;d.querySelector('summary').click();const b=n(), h2=d.getBoundingClientRect().height;d.querySelector('summary').click();document.body.dataset.result=[a,b,n(),h2>h1].join(',');`;
  const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body><main class="wc">'+render().html+'</main><script>'+script+'</'+'script></body></html>';
  const file=join(dir,'table.html');writeFileSync(file,html);
  const run=spawnSync(chrome,['--headless','--disable-gpu','--no-sandbox','--user-data-dir='+join(dir,'profile'),'--dump-dom',pathToFileURL(file).href],{encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,run.stderr); assert.equal(run.stdout.match(/data-result="([^"]+)"/)?.[1],'0,131,0,true');
 } finally {rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
