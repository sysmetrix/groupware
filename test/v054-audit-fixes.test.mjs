import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isNoiseMail, extractDeadlineInfo, extractAllDeadlines, analyze, buildAiContext} from '../src/live/briefing.mjs';
import {gsyncMatch, gsyncNormalizeExisting} from '../src/live/gcal-sync.mjs';
import {chatSanitizeText} from '../src/live/chat.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-11-14T09:00:00+09:00');

test('v0.54 domain: trusted agency action mail containing webinar is not suppressed as noise', () => {
  assert.equal(isNoiseMail({subject: '공공기관 웨비나 참석 결과 제출 요청', fromEmail: 'staff@bwyf.or.kr'}), false);
  assert.equal(isNoiseMail({subject: '무료 AI 웨비나 초대 및 수강 안내', fromEmail: 'marketing@example.com'}), true);
});

test('v0.54 domain: deadline parser rejects impossible dates, keeps explicit years and multiple times on same day', () => {
  assert.deepEqual(extractAllDeadlines('제출기한: 2026.2.30.', NOW), []);
  assert.equal(extractDeadlineInfo('2028.11.20.까지 제출', NOW).date, '2028-11-20');
  const multi = extractAllDeadlines('11월 20일 10:00까지 1차 제출, 11월 20일 17:00까지 최종 제출', NOW);
  assert.equal(multi.length, 2);
  assert.deepEqual(multi.map(x => [x.date, x.time]), [['2026-11-20', '10:00'], ['2026-11-20', '17:00']]);
});

test('v0.54 domain: analyze skips holidays when advancing leave-conflicted deadlines', () => {
  const raw = {
    collectedAt: NOW.toISOString(),
    principal: {name: '서원하', loginId: 'swh'},
    data: {
      mail: {inbox: {records: [{uid: 'm1', box: 'INBOX', subject: '11/19까지 자료 제출 요청', from: '홍길동', fromEmail: 'h@bwyf.or.kr', date: '2026-11-13 10:00:00', seen: false}]}, otherUnseen: []},
      leave: {upcoming: [{start: '20261119', end: '20261119', kind: '연차', days: 1}]},
      schedule: {holidays: [{date: '20261118', title: '기관특별휴무'}]},
    },
  };
  const a = analyze(raw, null, NOW);
  const item = a.actions.find(x => x.key === 'mail:INBOX:m1');
  assert.equal(item.leaveConflict.before, '2026-11-17');
});

test('v0.54 gcal-sync: overlapping different times in same layer return similar, not exact', () => {
  const existing = gsyncNormalizeExisting({days: {'20261110': ['10:00~11:00, 관내출장(1), 캘린더: 5 BWYF 근태, 위치 없음, 2026년 11월 10일']}});
  const m = gsyncMatch({startYmd: '20261110', endYmd: '20261110', layer: '5 BWYF 근태', kind: 'trip', time: '09:00~18:00', source: 'attend'}, existing);
  assert.equal(m.level, 'similar');
});

test('v0.54 security & AI: phone masking and dynamic org in buildAiContext', () => {
  assert.equal(chatSanitizeText('문의 032-123-4567 또는 010-1234-5678'), '문의 ***-***-**** 또는 ***-****-****');
  const ctx = buildAiContext({name: '김철수', orgName: '테스트재단', deptName: '기획팀', mine: [], now: NOW});
  assert.match(ctx, /김철수 \(테스트재단 기획팀\)/);
  assert.doesNotMatch(ctx, /부천여성청소년재단/);
});

test('v0.54 UI/A11y/Storage: semantic chart tokens, singleKey toggle, focus trap, legacy cleanup', async () => {
  const charts = await fs.readFile(path.join(root, 'src/live/wc/07-charts.js'), 'utf8');
  assert.doesNotMatch(charts, /#1d2330|#9aa4b2|#e6f4ea|#e7ebf2/);
  const keys = await fs.readFile(path.join(root, 'src/live/wc/04-timers-keys.js'), 'utf8');
  assert.match(keys, /singleKeyShortcuts === false/);
  assert.match(keys, /#overlay \.modal \.dlg, #overlay \.menu/);
  const storage = await fs.readFile(path.join(root, 'src/live/wc/01-storage.js'), 'utf8');
  assert.match(storage, /cleanupLegacyStorage/);
  assert.match(storage, /pruneStorageForQuota/);
  const chatEng = await fs.readFile(path.join(root, 'src/live/wc/31-chat-engine.js'), 'utf8');
  assert.match(chatEng, /chatComposePrompt\(qSafe, rSafe, dSafe\)/);
});

test('v0.55 Phase 2: ordinal AI intents, sent-check/weekly-summary intents, IndexedDB & unified IA', async () => {
  const {chatIntent} = await import('../src/live/chat.mjs');
  assert.deepEqual(chatIntent('첫 번째 열어줘', NOW).tool, 'open_item');
  assert.equal(chatIntent('첫 번째 열어줘', NOW).args.index, 1);
  assert.equal(chatIntent('2번 메일 답장해줘', NOW).tool, 'draft_mail_reply');
  assert.equal(chatIntent('2번 메일 답장해줘', NOW).args.index, 2);
  assert.equal(chatIntent('주당근무시간 보냈는지 확인해줘', NOW).tool, 'check_sent_reply');
  assert.equal(chatIntent('이번 주 실적 정리해줘', NOW).tool, 'get_weekly_summary');

  const views = await fs.readFile(path.join(root, 'src/live/wc/05-views.js'), 'utf8');
  assert.match(views, /docs:\s*'search'/);
  assert.match(views, /resource:\s*'calendar'/);
  assert.match(views, /overview:\s*'report'/);
  assert.doesNotMatch(views, /data-act="navMore"/);

  const storage = await fs.readFile(path.join(root, 'src/live/wc/01-storage.js'), 'utf8');
  assert.match(storage, /bwyfgw_db/);
  assert.match(storage, /BroadcastChannel/);

  const draft = await fs.readFile(path.join(root, 'src/live/wc/19-draft-engine.js'), 'utf8');
  assert.match(draft, /결과보고 사전 실적 입력/);
});

test('v0.56 Phase 3: bidirectional gcal diffs, policy aiEndpoint & session-only AI key', async () => {
  const {gsyncPlan} = await import('../src/live/gcal-sync.mjs');
  const {normalizePolicy} = await import('../src/live/briefing.mjs');
  const p = gsyncPlan({
    me: '016025',
    now: NOW,
    cals: [{id: 'c1', name: '5 BWYF 근태'}],
    apps: [
      {empCd: '016025', atNm: '관내출장', startDt: '20261110', endDt: '20261110', startTm: '0900', endTm: '1800', appTm: 480, approState: '1', noDoc: 'DOC-1'},
      {empCd: '016025', atNm: '연차', startDt: '20261112', endDt: '20261112', approState: '1', deleteReqYn: 'Y', noDoc: 'DOC-DEL'},
    ],
    existing: {
      dates: ['20261110', '20261112'],
      records: [
        {date: '20261110', cal: '5 BWYF 근태', title: '관내출장(2)', from: '10:00', to: '12:00'},
        {date: '20261112', cal: '5 BWYF 근태', title: '연차', from: '', to: ''},
      ],
    },
  });
  assert.equal(p.diffs.some(d => d.action === 'update' && d.date === '20261110'), true);
  assert.equal(p.diffs.some(d => d.action === 'cancel' && d.date === '20261112'), true);

  assert.equal(normalizePolicy({aiEndpoint: 'https://ai.internal.or.kr/v1beta/'}).aiEndpoint, 'https://ai.internal.or.kr/v1beta');
  assert.equal(normalizePolicy({aiEndpoint: 'http://evil.example.com/v1'}).aiEndpoint, '');

  const aiSrc = await fs.readFile(path.join(root, 'src/live/wc/23-ai.js'), 'utf8');
  assert.match(aiSrc, /aiSessionOnly/);
  assert.match(aiSrc, /POLICY\.aiEndpoint/);
});

test('v0.57 gap closure: year-scoped budget delta, FW action mail, toolMode, guard submit & default write block', async () => {
  const {nextState, analyze} = await import('../src/live/briefing.mjs');
  const {chatBuildRequest} = await import('../src/live/chat.mjs');
  const raw2026 = {
    collectedAt: '2026-12-31T10:00:00+09:00',
    status: {budget: {ok: true}, mail: {ok: true}},
    data: {budget: {projects: [{project: 'A201', year: 2026, rows: [{code: '노121', executed: 5000000}]}]}},
  };
  const st2026 = nextState(raw2026);
  const raw2027 = {
    collectedAt: '2027-01-05T10:00:00+09:00',
    status: {budget: {ok: true}, mail: {ok: true}},
    data: {
      budget: {projects: [{project: 'A201', year: 2027, rows: [{code: '노121', executed: 100000}]}]},
      mail: {inbox: {records: [{uid: 'fw1', box: 'INBOX', subject: '전달: 1/10까지 자료 제출 요청', from: '팀장', fromEmail: 'a@bwyf.or.kr', date: '2027-01-05 09:00:00', seen: false}]}, otherUnseen: []},
    },
  };
  const a2027 = analyze(raw2027, st2026, new Date('2027-01-05T10:00:00+09:00'));
  assert.equal(a2027.budget.projects[0].rows[0].executedDelta, null);
  assert.ok(a2027.actions.some(x => x.key === 'mail:INBOX:fw1' && x.base !== 'mailReplyIn'));
  assert.equal(chatBuildRequest({tools: [{fn: 1}], toolMode: 'ANY'}).toolConfig.functionCallingConfig.mode, 'ANY');

  const guardSrc = await fs.readFile(path.join(root, 'src/live/wc/19-draft-engine.js'), 'utf8');
  assert.match(guardSrc, /addEventListener\('submit'/);
  const storageSrc = await fs.readFile(path.join(root, 'src/live/wc/01-storage.js'), 'utf8');
  assert.match(storageSrc, /if \(currentKey === 'default'\) return false;/);
});
