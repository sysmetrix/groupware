import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const src=readFileSync(new URL('../src/live/wc/10-calendar-budget.js',import.meta.url),'utf8');
const fragment=src.slice(src.indexOf('    const monthChart ='),src.indexOf('    const lrows ='));
function charts(count=14){
 const leaves=Array.from({length:count},(_,i)=>({name:'같은 이름',code:'A',rate:i===0?150:i,executed:i*100,balance:100-i}));
 const monthly={code:'A',months:[{rows:[{code:'A',executed:120}]},{error:'fail'},{rows:[{code:'A',executed:0}]}]};
 const ctx={leaves,leafShort:leaves.map(()=>'같은 이름'),monthly,b:{month:'01',filter:'A'},el:50,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),won:n=>String(n),pct:n=>n+'%',ic:()=>''};
 vm.createContext(ctx);vm.runInContext(fragment+'\nthis.result={barChart,monthChart}',ctx);return ctx.result;
}
test('상위 12개와 나머지를 제공하고 레이블을 구분한다',()=>{
 const {barChart}=charts();assert.match(barChart,/상위 12개 \/ 전체 14개/);const top=barChart.split('<details')[0];
 assert.equal((top.match(/data-act="ledger"/g)||[]).length,12);assert.match(top,/A · 14/);assert.doesNotMatch(top,/A · 1\)/);
 const labels=[...barChart.matchAll(/aria-label="([^"]+)"/g)].map(x=>x[1]);assert.equal(labels.length,14);assert.equal(new Set(labels).size,14);assert.match(barChart,/150%/);assert.match(barChart,/width:100%/);
});
test('월별 차트는 버튼과 선택 상태 및 실패를 구분한다',()=>{
 const {monthChart}=charts();assert.match(monthChart,/<button type="button" class="budget-month" data-act="budgetMonth" data-v="01" aria-pressed="true"/);assert.match(monthChart,/1월 집행 120원/);assert.match(monthChart,/2월 조회 실패/);assert.doesNotMatch(monthChart,/data-v="02"/);assert.match(monthChart,/3월 집행 0원/);
});
test('12개 이하는 전체만 표시한다',()=>{const {barChart}=charts(12);assert.doesNotMatch(barChart,/<details/);assert.match(barChart,/전체 12개/);});
test('Chrome 렌더: 닫힘 12개, 펼침 14개, 다시 닫힘 12개',t=>{
 const chrome=process.env.CHROME_BIN||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'/usr/bin/google-chrome');
 if(!existsSync(chrome)){t.skip('Chrome이 없어 렌더 검사를 실행할 수 없습니다');return;}
 const dir=mkdtempSync(join(tmpdir(),'budget-render-'));
 try{
  const css=readFileSync(new URL('../src/live/wc-theme.css',import.meta.url),'utf8');
  const script="const d=document.querySelector('details');const visible=()=>[...document.querySelectorAll('.budget-bar-row')].filter(e=>e.checkVisibility({visibilityProperty:true,contentVisibilityAuto:true})).length;const a=visible();d.open=true;const b=visible();d.open=false;document.body.setAttribute('data-result',[a,b,visible()].join(','));";
  const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body><main class="wc">'+charts().barChart+'</main><script>'+script+'</'+'script></body></html>';
  const file=join(dir,'chart.html');writeFileSync(file,html);const run=spawnSync(chrome,['--headless','--disable-gpu','--no-sandbox','--user-data-dir='+join(dir,'profile'),'--dump-dom',pathToFileURL(file).href],{encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,run.stderr);assert.equal(run.stdout.match(/data-result="([^"]+)"/)?.[1],"12,14,12");
 }finally{rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
