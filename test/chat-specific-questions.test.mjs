import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as chat from '../src/live/chat.mjs';
import * as home from '../src/live/home-model.mjs';

const NOW = Date.parse('2026-11-14T10:00:00Z');

test('주말 인사와 다음 평일은 KST 날짜로 계산하고 휴일 이름을 휴무로 단정하지 않는다', () => {
  const d = home.homeDayInfo({date: '2026-11-14', holidays: [{date: '20261114', title: '기념일'}]});
  assert.equal(d.weekend, true); assert.equal(d.next, '2026-11-16'); assert.equal(d.holiday, '기념일');
  assert.match(home.homeGreeting({hour: 21, weekend: d.weekend, nextLabel: d.nextLabel, total: 3}).title, /안녕하세요/);
  assert.match(home.homeGreeting({hour: 21, weekend: true, nextLabel: d.nextLabel, total: 3}).sub, /다음 평일/);
  assert.equal(home.homeDayInfo({date: '2026-02-30'}).date, '');
  assert.equal(home.homeBriefing({unread: null}).facts.find(x => x.id === 'mail').value, '확인 불가');
});

test('대화는 연차·메일·결재·공지·자동화 등 구체적 질문을 해당 도구로 보낸다', () => {
  for (const [q, tool] of [
    ['연차 현황', 'get_leave_status'], ['이번 달 근무시간 알려줘', 'get_work_hours'],
    ['안 읽은 메일 보여줘', 'list_mail'], ['결재 현황 알려줘', 'list_approvals'], ['결재할 문서 있어?', 'list_approvals'],
    ['내 신청 현황 알려줘', 'list_my_requests'], ['새 공지 있어?', 'list_notices'], ['알림 보여줘', 'list_alerts'],
    ['부서 참고 공문 보여줘', 'list_reference'], ['아침 브리핑 해줘', 'run_briefing'], ['퇴근 전 점검해줘', 'run_briefing'],
    ['자동화 목록 보여줘', 'list_automations'], ['새 메일 쓰기', 'compose_mail'], ['뭘 할 수 있어?', 'get_capabilities'],
  ]) assert.equal(chat.chatIntent(q, new Date(NOW)).tool, tool, q);
});

test('자동화 시간·요일·문장을 분리하며 다른 주제의 매주 브리핑은 오인하지 않는다', () => {
  const a = chat.chatParseSchedule('매일 9시에 아침 브리핑 해줘');
  assert.deepEqual(a.days, [0,1,2,3,4,5,6]); assert.equal(a.time, '09:00'); assert.equal(a.prompt, '아침 브리핑 해줘');
  assert.deepEqual(chat.chatParseSchedule('평일 17시 30분에 퇴근 전 점검해줘').days, [1,2,3,4,5]);
  assert.deepEqual(chat.chatParseSchedule('매주 월요일 9시 10분에 이번 주 브리핑 해줘').days, [1]);
  assert.equal(chat.chatParseSchedule('이번 주 브리핑 해줘'), null);
  assert.equal(chat.chatIntent('매일 9시에 아침 브리핑 해줘').tool, 'create_automation');
});

test('자동 실행은 KST 날짜별 1회이고 끄거나 잘못된 시각은 실행하지 않는다', () => {
  const r = {on: true, days: [6], time: '09:00', last: ''};
  assert.equal(chat.chatAutoDue(r, NOW), true);
  assert.equal(chat.chatAutoDue({...r, last: '2026-11-14'}, NOW), false);
  assert.equal(chat.chatAutoDue({...r, on: false}, NOW), false);
  assert.equal(chat.chatAutoDue({...r, time: '25:00'}, NOW), false);
  assert.equal(chat.chatAutoDue(r, NaN), false);
  assert.equal(chat.chatAutoNext({...r, last: '2026-11-14'}, NOW).date, '2026-11-21');
});

test('확인 카드 실패는 재시도 가능한 것처럼 버튼을 남기지 않는다', async () => {
  const src = await readFile(new URL('../src/live/wc/30-chat-ui.js', import.meta.url), 'utf8');
  const c = {HOME_ACTS: {}, root: {addEventListener() {}}, setInterval() {}, queueMicrotask() {}, esc: s => String(s ?? ''), ic: () => ''};
  vm.runInNewContext(src + '\nthis.card = chatCardHtml;', c);
  const html = c.card({type: 'confirm', state: 'err', title: '시험', result: '저장하지 못했습니다.', id: '1'});
  assert.match(html, /저장하지 못했습니다/); assert.doesNotMatch(html, /data-act="chatConfirm"/);
});

test('자동화는 직원 개인 조회를 막고 탭 간 잠금과 실행 중 재확인을 사용한다', async () => {
  const src = await readFile(new URL('../src/live/wc/37-automation.js', import.meta.url), 'utf8');
  assert.match(src, /get_staff_status.*lookup_person/);
  assert.match(src, /navigator\.locks\.request/);
  assert.match(src, /if \(chatState\(\)\.busy \|\| S\.loading/);
  assert.match(src, /if \(autoSave\(latest\) === false\)/);
});
