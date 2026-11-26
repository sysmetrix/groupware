import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../src/live/wc/10-calendar-budget.js',import.meta.url),'utf8');
const home=readFileSync(new URL('../src/live/wc/54-budget-home.js',import.meta.url),'utf8');
const events=readFileSync(new URL('../src/live/wc/16-events.js',import.meta.url),'utf8');
test('v1.23 budget menu: three tabs, search lives in 재단 전체, detail is a drill-down with one project selector',()=>{
  // 하위 탭 세 개(내 사업 · 카드·세금계산서 · 재단 전체)와 처리기. 사업 상세는 내 사업 탭 안의 상세다.
  assert.match(home,/data-act="bMode" data-v="\$\{ids\[0\]\}"/); for (const t of [String.raw`\['mine', 'detail'\], '내 사업'`, String.raw`\['card', 'etax'\], '카드·세금계산서'`, String.raw`\['all'\], '재단 전체'`]) assert.match(home,new RegExp(String.raw`tab\(`+t));
  assert.match(home,/내 사업으로/);
  // 과목 검색은 재단 전체 탭에, 찾기 칸은 다시 그리지 않는 입력
  assert.match(home,/data-act="bSearch"/); assert.match(home,/data-act="bSearchClear"/); assert.match(home,/id="bAllFilter"/);
  assert.match(events,/t\.id === 'bAllFilter'/);
  // 사업 상세: 선택 칸 하나 + 별, 상세에서는 검색 결과로 바뀌지 않음
  assert.match(home,/id="bSel"/); assert.match(ui,/budgetDetailHead\(curName\)/); assert.match(ui,/const searching = typeof budgetMode === 'function' \? false/);
  // 사업을 고르면 상세로 간다
  assert.match(events,/case 'bPick':[\s\S]{0,150}mode = 'detail'/);
  assert.match(events,/case 'bHit':[\s\S]{0,200}mode = 'detail'/);
});
