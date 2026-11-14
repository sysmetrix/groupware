import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('../src/live/wc/10-calendar-budget.js', import.meta.url), 'utf8');
const ledgerCode = src.slice(src.indexOf('  async function loadLedgerAll()'), src.indexOf('  async function loadMonthly()'));
const viewCode = src.slice(src.indexOf('  const bKey ='), src.indexOf('  // 모든 사업에서 찾은 과목'));
const row = (code, level, executed, extra = {}) => ({code, name: code, level, executed, budget: 100, balance: 100-executed, rate: executed, path: code+'|', ...extra});
function context(table, filter = '', ledger = async ({bgtCd}) => ({rows: [{date:'20260101', amount: 0, name:bgtCd}], checkSum:0})) {
  const S = {view:'budget', a:{budget:{elapsedPct:50,url:''}}, settings:{budget:[]}, budget:{table, full:table, filter, project:'P', catalog:[{project:'P',name:'사업전체'}], seq:0, q:'', month:'03'}};
  const ctx = {S, GW:{budgetLedger:ledger}, renderMain(){}, won:String, pct:String, esc:String, ic:()=>'', pgh:(...a)=>a.join(' '), shortLabels:x=>x, ymd8:String};
  vm.createContext(ctx); vm.runInContext(viewCode+'\n'+ledgerCode+'\nthis.view=vBudget; this.load=loadLedgerAll;',ctx); return ctx;
}
test('사업 전체 요약은 첫 관이 아니라 원본 전체 합계를 사용', () => {
  const c=context({project:'P', rows:[row('첫관','관',20),row('둘째관','관',30)], total:row('합계','계',50)});
  assert.match(c.view(), /<b>사업전체<\/b> 예산 100원 · 집행 50원/);
});
test('선택 과목 요약은 순서와 무관하게 정확한 코드 사용, 없으면 생략', () => {
  const t={project:'P',rows:[row('다른','관',11),row('선택','항',40)]};
  const c=context(t,'선택'); assert.match(c.view(), /<b>선택<\/b> 예산 100원 · 집행 40원/);
  c.S.budget.filter='없는코드'; assert.doesNotMatch(c.view(), /<b>다른<\/b> 예산/);
});
test('전체 결의는 전체 합계와 대조하며 0과 음수 세목도 조회', async () => {
  const calls=[]; const t={project:'P',year:2026,gisu:'12',rows:[row('관','관',20), row('A','세',20),row('B','세',0),row('C','세',-5)],total:row('합계','계',15)};
  const c=context(t,'',async ({bgtCd})=>{calls.push(bgtCd); const n={A:20,B:0,C:-5}[bgtCd];return {rows:[{date:'20260101',amount:n,name:bgtCd}],checkSum:n};});
  await c.load(); assert.deepEqual(calls,['A','B','C']); assert.match(c.S.budget.ledger.check,/✓ 15원과 일치/); assert.equal(c.S.budget.month,'');
});
test('선택 과목 대조는 첫 행이 아닌 선택 코드와 비교', async () => {
  const t={project:'P',rows:[row('다른','관',90),row('선택','항',20),row('세목','세',20)]};
  const c=context(t,'선택',async()=>({rows:[{date:'20260101',amount:20,name:'세목'}],checkSum:20})); await c.load(); assert.match(c.S.budget.ledger.check,/✓ 20원과 일치/);
});
test('기준 누락과 실패·잘못된 응답은 일치라고 표시하지 않음', async () => {
  const t={project:'P',rows:[row('A','세',0),row('B','세',0)]};
  let c=context(t,'',async()=>({rows:[],checkSum:0})); await c.load(); assert.match(c.S.budget.ledger.check,/대조 기준 없음/); assert.doesNotMatch(c.S.budget.ledger.check,/✓/);
  c=context({...t,total:row('합계','계',0)},'',async({bgtCd})=>bgtCd==='A'?null:Promise.reject(Error('offline'))); await c.load(); assert.match(c.S.budget.ledger.check,/A, B 조회 실패/);
});
test('집계 불일치는 세목 확인 경고 표시', async () => {
  const t={project:'P',rows:[row('A','세',20),row('B','세',10)],total:row('합계','계',30)};
  const c=context(t,'',async({bgtCd})=>({rows:[{date:'20260101',amount:bgtCd==='A'?10:20,name:bgtCd}],checkSum:bgtCd==='A'?10:20})); await c.load(); assert.match(c.S.budget.ledger.check,/확인 필요 세목 A, B/); assert.doesNotMatch(c.S.budget.ledger.check,/✓/);
});
test('빈 관심사업은 렌더링과 조회 중 보존', async () => {
  const t={project:'P',rows:[],total:row('합계','계',0)}; const c=context(t); c.view(); await c.load(); assert.equal(c.S.settings.budget.length,0);
});

test('세목이 없으면 합계가 0이어도 대조 완료로 표시하지 않음', async () => {
  const c=context({project:'P',rows:[],total:row('합계','계',0)}); await c.load(); assert.match(c.S.budget.ledger.check,/대조할 수 없습니다/); assert.doesNotMatch(c.S.budget.ledger.check,/✓/);
});

test('빈 핀은 표시하지 않고 유효 핀의 원본 인덱스를 유지한다', () => {
  const t={project:'P',rows:[row('A','세',0),row('B','세',0)],total:row('합계','계',0)};
  const c=context(t); const pins=[null,{}, {project:'   '}, {project:'P',label:'유효 사업'}]; c.S.settings.budget=pins;
  const before=JSON.stringify(pins), html=c.view(); assert.match(html,/유효 사업/); assert.match(html,/data-act="bUnpin" data-i="3"/); assert.doesNotMatch(html,/data-act="bUnpin" data-i="[012]"/); assert.equal(JSON.stringify(pins),before);
});
test('전체 결의 버튼의 세목 수는 0원·음수 세목 포함 실제 조회 수와 같다', () => {
  const t={project:'P',rows:[row('A','세',10),row('B','세',0),row('C','세',-1)],total:row('합계','계',9)};
  assert.match(context(t).view(),/전체 결의 내역 보기 \(세목 3개\)/);
});
test('사업 전체 월별 차트는 기존 첫 관 데이터도 숨기고 안내한다', () => {
  const t={project:'P',rows:[row('관','관',20),row('A','세',20)],total:row('합계','계',20)}; const c=context(t);
  c.S.budget.monthly={code:'관',months:[{rows:[row('관','관',777)]}]}; const html=c.view();
  assert.match(html,/사업 전체 월별 합계는 확인할 수 없어/); assert.doesNotMatch(html,/1월 집행 777원/); assert.doesNotMatch(html,/data-act="loadMonthly"/);
});
test('사업 전체 월별 직접 호출은 API 요청을 차단하고 단위사업은 요청한다', async () => {
  const code=src.slice(src.indexOf('  async function loadMonthly()'),src.indexOf('  async function loadMonthly()')+src.slice(src.indexOf('  async function loadMonthly()')).indexOf('\n  }')+5);
  const calls=[], messages=[]; const S={view:'other',budget:{project:'P',filter:'',table:{year:2026},mreq:0}};
  const ctx={S,GW:{budgetMonthly:async x=>{calls.push(x);return {months:[]};}},renderMain(){},toast:x=>messages.push(x)};
  vm.createContext(ctx); vm.runInContext(code+'\nthis.load=loadMonthly;',ctx); await ctx.load(); assert.equal(calls.length,0); assert.match(messages[0],/단위사업/);
  S.budget.filter='항'; await ctx.load(); assert.equal(calls.length,1); assert.equal(calls[0].code,'항');
});
