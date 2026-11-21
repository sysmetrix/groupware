import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weeklyDraftPeriod, unseenActivityCount, isNoiseMail} from '../src/live/briefing.mjs';

const read = p => readFileSync(new URL('../src/live/' + p, import.meta.url), 'utf8');
const NOW = new Date('2026-11-21T02:00:00Z'); // 11/21(토) 11:00 KST

test('주간 초안 기간: 끝난 지 7일이 넘으면 지난 초안으로 본다', () => {
  const old = weeklyDraftPeriod('[자료 범위: 상신 3건]\n\n□ 주간 업무 실적 (11.1. ~ 11.8.) — 전략경영실 홍길동\n', NOW);
  assert.deepEqual(old, {label: '11/1~11/8', ageDays: 13, stale: true});
  const fresh = weeklyDraftPeriod('□ 주간 업무 실적 (11.16. ~ 11.20.)', NOW);
  assert.equal(fresh.stale, false); assert.equal(fresh.ageDays, 1);
  assert.equal(weeklyDraftPeriod('직접 쓴 메모', NOW), null);
  assert.equal(weeklyDraftPeriod('', NOW), null);
});

test('주간 초안 기간: 오늘보다 뒤의 날짜는 지난해로 본다(1월에 본 12월 초안)', () => {
  const p = weeklyDraftPeriod('□ 주간 업무 실적 (12.22. ~ 12.26.)', new Date('2027-01-05T01:00:00Z'));
  assert.equal(p.ageDays, 10); assert.equal(p.stale, true);
});

test('머리글 새 항목 수: 같은 항목은 한 번, 사라진 항목과 이미 본 항목은 빼고 센다', () => {
  const act = [{at: 5, key: 'a'}, {at: 6, key: 'a'}, {at: 7, key: 'b'}, {at: 8, key: 'gone'}, {at: 1, key: 'c'}];
  assert.equal(unseenActivityCount(act, 2, ['a', 'b', 'c']), 2);
  assert.equal(unseenActivityCount(act, 2, null), 3);
  assert.equal(unseenActivityCount(act, 10, ['a']), 0);
  assert.equal(unseenActivityCount(null, 0, []), 0);
});

test('왼쪽 메뉴: 읽히는 이름이 보이는 메뉴 이름으로 시작하고 숫자 배지는 따로 읽히지 않는다', () => {
  const src = read('wc/05-views.js');
  assert.match(src, /aria-label="\$\{esc\(v\.label\)\}/);
  assert.match(src, /<span class="n [^`]*aria-hidden="true">/);
  assert.doesNotMatch(src, /tip: '퇴근 지문 확인'\}/);
});

test('광고성 메일은 업무 메일보다 아래 접힌 묶음으로 간다', () => {
  assert.equal(isNoiseMail({subject: '(광고) 겨울 특가 안내', fromEmail: 'shop@example.com'}), true);
  const src = read('wc/08-approval-mail.js');
  assert.match(src, /<details class="mail-ads"/);
  assert.match(src, /work\.map\(rowHtml\)[\s\S]*ads\.map\(rowHtml\)/);
});

test('설정 화면에는 진한 주 버튼을 두지 않고, 머리글 AI 지시도 테두리 버튼이다', () => {
  const settings = read('wc/12-report-settings.js').split('function vSettings')[1].split('function budgetSettingRows')[0];
  assert.doesNotMatch(settings, /btn sm primary/);
  assert.match(read('wc/02-shell.js'), /<button class="hb" data-act="openCmd"/);
});

test('일정 목록은 앞으로 7일의 직원 휴가·출장도 날짜순으로 함께 보인다', () => {
  const src = read('wc/10-calendar-budget.js');
  assert.match(src, /teamSoon/);
  assert.match(src, /\[\.\.\.teamRows, \.\.\.upcoming\.map/);
  assert.doesNotMatch(src, /다가오는 일정이 없습니다/);
});

test('자동화 켜기 스위치는 24px 이상, 좁은 화면 머리글은 한 줄', () => {
  const css = read('wc.css');
  assert.match(css, /\.wc \.hm-sw\{width:40px;height:24px\}/);
  assert.match(css, /@media \(max-width:640px\)\{\.wc header\{flex-wrap:nowrap/);
});
