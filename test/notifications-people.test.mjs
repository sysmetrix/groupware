import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = f => readFile(new URL('../src/live/' + f, import.meta.url), 'utf8');
test('조직도는 읽기 전용 API와 부서 식별자 검증을 사용한다', async () => {
  const src = await read('collector.browser.js');
  assert.match(src, /gw102A01/); assert.match(src, /gw102A02/);
  assert.match(src, /\^\[dcb\]\[0-9\]\+\$/); assert.match(src, /Array\.isArray\(data\)/);
});
test('알림은 조회 범위와 실패, 미확인 URL을 구분하고 수신자 메일은 작성만 한다', async () => {
  const src = await read('wc/38-notifications-people.js');
  assert.match(src, /alertCount:100/); assert.match(src, /전체 알림 수가 아닌 조회 범위/);
  assert.match(src, /NTF\.items = null; NTF\.error/); assert.match(src, /\[\{\}\]/);
  assert.match(src, /mailKind=link&to=/); assert.doesNotMatch(src, /\.send\(/);
  assert.match(src, /owner !== getUserKey\(\)/);
});
test('비서 메뉴는 기존 단축키 순서를 보존한다', async () => {
 const src = await read('wc/05-views.js');
 assert.ok(src.indexOf("id: 'budget'") < src.indexOf("id: 'notifications'"));
 assert.match(src, /notifications: vNotifications, people: vPeople/);
});
