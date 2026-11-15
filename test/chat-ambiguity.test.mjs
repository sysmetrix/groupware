import test from 'node:test';
import assert from 'node:assert/strict';
import {chatIntent, chatSystemPrompt} from '../src/live/chat.mjs';
const now = new Date('2026-11-15T17:00:00Z');
test('사업명이나 행사명을 직원 이름으로 단정하지 않는다', () => {
 for (const text of ['이주배경 일정 있잖아', '리빙랩 일정 알려줘', '이주배경 사업 일정 언제야', '리빙랩 행사 일정 알려줘', '김철수 일정 알려줘']) assert.notEqual(chatIntent(text, now).tool, 'get_staff_status', text);
});
test('직함과 명시적인 근태는 직원 일정으로 조회한다', () => {
 for (const text of ['김철수 님 일정 알려줘', '김철수 출장 언제야']) assert.equal(chatIntent(text, now).tool, 'get_staff_status', text);
});
test('일반 날짜 일정과 구글 범위는 기존대로 분리한다', () => {
 assert.equal(chatIntent('내일 일정', now).tool, 'get_schedule');
 assert.equal(chatIntent('구글 일정', now).tool, 'get_gcal_access');
 assert.match(chatSystemPrompt(), /행사명/);
});

test('직전 일정의 날짜를 이용해 행사 제목만 검색한다', async () => {
 const {chatScheduleFollowup} = await import('../src/live/chat.mjs');
 const prev = {tool:'get_schedule',args:{date:'2026-11-17',days:1}};
 assert.deepEqual(chatScheduleFollowup('이주배경 일정 있잖아',prev).args,{date:'2026-11-17',days:1,query:'이주배경'});
 assert.equal(chatScheduleFollowup('이주배경 일정 등록해줘',prev),null);
 assert.equal(chatScheduleFollowup('김지은 님 일정',prev),null);
});
