import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('팝업 배경은 전체 화면 실시간 블러를 사용하지 않고 peek는 투명하다', () => {
  const css = readFileSync(new URL('../src/live/wc.css', import.meta.url), 'utf8');
  const modal = [...css.matchAll(/\.wc \.modal\{([^}]*)\}/g)].at(-1)?.[1] || '';
  assert.match(modal, /backdrop-filter:none/);
  assert.match(modal, /-webkit-backdrop-filter:none/);
  assert.match(modal, /background:rgba\(/);
  assert.match(css, /\.wc \.modal\.peek\{[^}]*background:transparent!important/);
});
