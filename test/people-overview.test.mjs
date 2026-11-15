import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = f => readFile(new URL('../src/live/' + f, import.meta.url), 'utf8');
test('직원 목록은 업무와 내선을 노출하고 개인 연락처를 추가 수집하지 않는다', async () => {
  const src = await read('collector.browser.js');
  const section = src.slice(src.indexOf('async function organizationMembers'), src.indexOf('// ---------- on-demand functions ----------'));
  assert.match(section, /extension:str\(x\.extNum,30\)/);
  assert.match(section, /work:str\(x\.mainWork,300\)/);
  assert.doesNotMatch(section, /mobile_tel_num|homeTelNum|bday/);
});
test('직원 표는 검색어와 결과 수를 동기화하고 원래 수신자 인덱스를 보존한다', async () => {
  const src = await read('wc/38-notifications-people.js');
  assert.match(src, /data-person-row/); assert.match(src, /p\.extension,p\.email,p\.work/);
  assert.match(src, /data-i="\$\{i\}"/); assert.match(src, /row\.hidden/);
  assert.match(src, /count \+ '명 표시'/);
  const events = await read('wc/16-events.js');
  assert.match(events, /t\.id === 'peopleFilter'/); assert.match(events, /peopleFilterRows\(\)/);
});
