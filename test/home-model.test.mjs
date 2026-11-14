import test from 'node:test';
import assert from 'node:assert/strict';
import {homeGreeting, homeTiles, homeNextAction, homeTimelineCompact, homeAwayLine} from '../src/live/home-model.mjs';

test('homeGreeting: time of day, urgent/total/loading/empty', () => {
  assert.equal(homeGreeting({hour: 9, name: '서원하', urgent: 2, total: 5}).title, '좋은 아침입니다, 서원하 님');
  assert.equal(homeGreeting({hour: 14, urgent: 0, total: 3}).sub, '남은 처리·확인할 일은 3건입니다');
  assert.equal(homeGreeting({hour: 19, urgent: 1}).tone, 'urgent');
  assert.equal(homeGreeting({hour: 10}).sub, '지금 처리할 일이 없습니다');
  assert.equal(homeGreeting({loading: true}).tone, 'info');
  assert.equal(homeGreeting({hour: 'x', name: '  '}).title.includes('님'), false);
});

test('homeTiles: always 5 stable tiles, dashes while loading, safe on garbage', () => {
  const t = homeTiles({urgent: 2, todo: 3, check: 1, wait: 1, events: 4, away: 2});
  assert.deepEqual(t.map(x => x.id), ['urgent', 'todo', 'wait', 'schedule', 'away']);
  assert.equal(t[0].value, 2); assert.equal(t[0].tone, 'urgent'); assert.equal(t[1].value, 6); assert.match(t[1].sub, /확인 필요 1건/);
  const z = homeTiles({}); assert.equal(z[0].value, 0); assert.equal(z[0].tone, 'ok'); assert.equal(z[1].tone, 'ok');
  assert.match(z.find(x => x.id === 'schedule').label, /그룹웨어/);
  assert.match(z.find(x => x.id === 'schedule').sub, /구글 일정 별도/);
  assert.equal(homeTiles({loaded: false})[0].value, '–');
  assert.equal(homeTiles({urgent: -3, todo: 'abc'})[0].value, 0);
});

test('homeNextAction: highest priority state wins, long titles are cut, empty -> null', () => {
  const a = [{key: 'a', title: '확인', state: 'check'}, {key: 'b', title: '급함', state: 'urgent', headline: '오늘까지'}, {key: 'c', title: '참고', state: 'ref'}, {key: 'd', title: '지남', state: 'overdue'}];
  assert.equal(homeNextAction(a).key, 'd');
  assert.equal(homeNextAction(a.slice(0, 2)).key, 'b');
  assert.equal(homeNextAction([{key: 'x', title: '가'.repeat(200), state: 'todo'}]).title.length, 70);
  assert.equal(homeNextAction([]), null); assert.equal(homeNextAction(null), null);
  assert.equal(homeNextAction([{key: 'r', state: 'ref', title: 't'}]), null);
});

test('homeTimelineCompact: all-day first, sorted, truncated with more count', () => {
  const r = homeTimelineCompact([{from: '14:00', label: '회의'}, {from: '09:00', label: '교육'}, {allDay: true, label: '종일 행사'}, {from: '10:00', label: 'a'}, {from: '11:00', label: 'b'}, {from: '12:00', label: 'c'}], 4);
  assert.equal(r.rows[0].label, '종일 행사'); assert.equal(r.rows[1].label, '교육'); assert.equal(r.rows.length, 4); assert.equal(r.more, 2);
  assert.deepEqual(homeTimelineCompact(null), {rows: [], more: 0});
});

test('homeAwayLine', () => {
  assert.equal(homeAwayLine([]), '');
  assert.equal(homeAwayLine([{name: '이승봉', label: '관내출장'}, {name: '김소연', label: '연차'}]), '이승봉 출장 · 김소연 연차');
  assert.equal(homeAwayLine([1, 2, 3, 4, 5].map(i => ({name: 'n' + i, label: '휴가'})), 3), 'n1 휴가 · n2 휴가 · n3 휴가 외 2명');
});
