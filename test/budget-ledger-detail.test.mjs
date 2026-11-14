import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/live/wc/13-detail-pane.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('  function paneInfo()'), source.indexOf('  function docPane('));
function pane(row, url = 'https://gw.bwyf.or.kr/budget') {
  const S = {sel: {type: 'ledger', row}, a: {budget: {url}}, pane: {}};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ctx = {S, esc, ymd8: s => s.replace(/^(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'), won: n => Number(n).toLocaleString('ko-KR')};
  vm.createContext(ctx); vm.runInContext(code + '\nthis.run = paneInfo;', ctx); return ctx.run();
}

test('원장 내역과 검색·원본 열기·복사 경로를 독립적으로 제공한다', () => {
  const p = pane({date:'20261114',amount:12500,docNo:'부서-1',writer:'작성자',dept:'부서',slip:'전표1',code:'A01',name:'과목',desc:'적요 <확인>'});
  assert.equal(p.url, 'https://gw.bwyf.or.kr/budget');
  for (const text of ['2026-11-14','12,500원','부서-1','작성자','부서','전표1','A01','과목','적요 &lt;확인&gt;', '결재문서의 내용이나 열람 권한은 확인되지 않았습니다.']) assert.ok(p.body.includes(text), text);
  for (const act of ['findDocNo','openUrl','copy','todoFromSel']) assert.ok(p.body.includes('data-act="' + act + '"'));
  assert.match(p.body, /data-date="20261114"/); assert.match(p.body, /data-url="https:\/\/gw\.bwyf\.or\.kr\/budget"/);
  assert.match(p.body, /결의일: 2026-11-14&#10;금액: 12,500원/); assert.ok(p.body.includes('id="docNoResult"'));
});

test('누락 항목과 원본 주소는 확인 불가로 표시하고 0원은 유지한다', () => {
  const p = pane({amount:0}, ''); assert.equal(p.url, ''); assert.match(p.body, /0원/);
  assert.match(p.body, /문서번호<\/b><span>확인 불가/); assert.match(p.body, /예실대비현황 원본 주소 확인 불가/);
  assert.doesNotMatch(p.body, /data-act="(?:findDocNo|openUrl)"/); assert.match(p.body, /data-act="copy"/);
  assert.match(pane({amount:'invalid'}).body, /금액<\/b><span>확인 불가/);
});

test('복사 값과 원본 주소의 특수 문자는 속성에서 이스케이프한다', () => {
  const p = pane({desc:'"<script> & 테스트',docNo:'X"1'}, 'https://example.test/?a=1&b="2"');
  assert.doesNotMatch(p.body, /<script>/); assert.match(p.body, /&quot;&lt;script&gt; &amp; 테스트/);
  assert.match(p.body, /data-no="X&quot;1"/); assert.match(p.body, /a=1&amp;b=&quot;2&quot;/);
});
