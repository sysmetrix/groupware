import test from 'node:test';
import assert from 'node:assert/strict';
import {mailHighlights} from '../src/live/briefing.mjs';

test('메일 핵심 문장은 요청과 기한을 원문에서 발췌하고 이전 메일은 제외', () => {
  const text = '안녕하세요. 자료를 공유드립니다. 11월 20일까지 검토 후 회신 부탁드립니다. 감사합니다.\n보내는사람: 다른 사람\n이전 메일의 내용입니다.';
  const result = mailHighlights(text);
  assert.ok(result.some(s => s.includes('11월 20일까지 검토 후 회신')));
  assert.ok(!result.some(s => s.includes('이전 메일')));
  assert.ok(result.every(s => text.includes(s)));
});
test('빈 본문과 HTML을 처리하고 인용되지 않은 사실을 만들지 않는다', () => {
  assert.deepEqual(mailHighlights(''), []);
  const result = mailHighlights('<p>일정 확인을 부탁드립니다.</p>');
  assert.deepEqual(result, ['일정 확인을 부탁드립니다.']);
  assert.deepEqual(mailHighlights('안녕하세요. 감사합니다.'), []);
  assert.deepEqual(mailHighlights('안녕하세요.11월 20일 행사가 있습니다.일정에 참고해 주세요.'), ['11월 20일 행사가 있습니다.', '일정에 참고해 주세요.']);
});
