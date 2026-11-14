import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('home calendar scope and stale comparison are clearly guarded', async () => {
  const home = await readFile('src/live/wc/29-home-view.js', 'utf8');
  const sync = await readFile('src/live/wc/34-gsync.js', 'utf8');
  assert.match(home, /조회된 그룹웨어 일정이 없습니다\. 구글 일정은 별도로 확인하세요/);
  assert.match(sync, /const stale = gsyncIsStale\(plan\)/);
  assert.match(sync, /if \(gsyncIsStale\(gsyncGet\(\)\)\)/);
});
