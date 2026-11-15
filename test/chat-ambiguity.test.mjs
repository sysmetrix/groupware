import test from 'node:test';
import assert from 'node:assert/strict';
import {chatIntent, chatSystemPrompt} from '../src/live/chat.mjs';
const now = new Date('2026-11-15T17:00:00Z');
test('사업명이나 행사명을 직원 이름으로 단정하지 않는다', () => {
 for (const text of ['이주배경 일정 있잖아', '리빙랩 일정 알려줘', '김철수 일정 알려줘']) assert.notEqual(chatIntent(text, now).tool, 'get_staff_status', text);
});
test('직함과 명시적인 근태는 직원 일정으로 조회한다', () => {
 for (const text of ['김철수 님 일정 알려줘', '김철수 출장 언제야']) assert.equal(chatIntent(text, now).tool, 'get_staff_status', text);
});
test('일반 날짜 일정과 구글 범위는 기존대로 분리한다', () => {
 assert.equal(chatIntent('내일 일정', now).tool, 'get_schedule');
 assert.equal(chatIntent('구글 일정', now).tool, 'get_gcal_access');
 assert.match(chatSystemPrompt(), /행사명/);
});
