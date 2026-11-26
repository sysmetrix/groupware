// v1.25.2 예산 집행 > 재단 전체: 들어올 때 모든 사업이 접힌 채로 시작(내 사업이 있는 전략경영실운영도), 검색하면 맞는 사업만 펼침
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = f => readFileSync(new URL('../src/live/wc/' + f, import.meta.url), 'utf8');

test('재단 전체 사업은 내 사업 여부로 펼치지 않는다', () => {
  const s = read('54-budget-home.js');
  assert.doesNotMatch(s, /x\.mine \|\| BM\.q \? 'open'/);
  assert.match(s, /\$\{BM\.q \|\| BM\.open\.has\(x\.p\.project\) \? 'open' : ''\}/);
  assert.match(s, /if \(v === 'all' && S\.budget\.mode !== 'all'\) BM\.open\.clear\(\);/);
  assert.match(s, /root\.addEventListener\('toggle', e => \{ const d = e\.target; if \(!d \|\| !d\.matches \|\| !d\.matches\('\[data-bm-proj\]'\)/);
  assert.match(read('05-views.js'), /if \(v === 'budget' && typeof BM === 'object' && BM && BM\.open\) BM\.open\.clear\(\);/);
});
