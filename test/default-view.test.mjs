// v1.21.1 화면 기본값: 결재·문서유통은 '내 상신문서', 일정·예약은 이번 달과 오늘 날짜를 고른 상태로 연다
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = f => readFileSync(new URL('../src/live/wc/' + f, import.meta.url), 'utf8');
const views = read('05-views.js');
const pick = (src, name) => { const i = src.indexOf(`function ${name}(`); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } throw new Error(name); };

test('화면에 들어올 때: 결재는 내 상신문서 고정, 일정은 이번 달·오늘', () => {
  const ctx = {S: {apTab: 'pending', apTabPinned: false, cal: {offset: -2, day: ''}}, today: () => '2026-11-25'};
  vm.createContext(ctx);
  vm.runInContext(pick(views, 'viewDefaults') + '; globalThis.vd = viewDefaults;', ctx);
  ctx.vd('approval');
  assert.equal(ctx.S.apTab, 'submitted');
  assert.equal(ctx.S.apTabPinned, true);
  ctx.vd('calendar');
  assert.equal(ctx.S.cal.offset, 0);
  assert.equal(ctx.S.cal.day, '20261125');
  ctx.S.apTab = 'pending'; ctx.vd('mail');
  assert.equal(ctx.S.apTab, 'pending'); // 다른 화면은 건드리지 않음
});

test('go()와 주소로 바로 열기가 같은 기본값을 쓰고, [오늘]은 오늘 날짜를 고른다', () => {
  assert.match(views, /S\.apTabPinned = false;\n\s+viewDefaults\(v\);/);
  assert.match(read('17-lifecycle.js'), /typeof viewDefaults === 'function'\) viewDefaults\(target\)/);
  assert.match(read('16-events.js'), /case 'calToday': S\.cal\.offset = 0; teamCfg\(\)\.day = today\(\)\.replace\(\/-\/g, ''\);/);
  // 홈의 '결재 대기'처럼 다른 탭이 필요한 곳은 go() 뒤에 탭을 다시 정한다
  assert.match(read('29-home-view.js'), /if \(go\('approval'\)\) \{ S\.apTab = 'pending'; S\.apTabPinned = true;/);
});
