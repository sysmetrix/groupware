import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as home from '../src/live/home-model.mjs';
import * as todo from '../src/live/todo-plan.mjs';

const source = ['06-today', '08-approval-mail', '29-home-view', '55-todo-views'].map(name =>
  readFileSync(new URL('../src/live/wc/' + name + '.js', import.meta.url), 'utf8')).join('\n');
const day = '2026-11-24';
const action = (key, state = 'todo', extra = {}) => ({key, state, title: key, area: '결재', ...extra});
const mail = (uid, box = 'INBOX') => ({uid, box, subject: uid, date: day, seen: false});
const doc = docId => ({docId, title: '문서 "가"', docNo: 'DOC-' + docId, date: day});
function setup() {
  const lists = Object.fromEntries(['pending', 'deptWaiting', 'distWaiting', 'sendWaiting', 'viewing', 'submitted'].map(k => [k, {docs: []}]));
  const S = {
    a: {actions: [], approval: {lists, counts: []}, mail: {}, failed: []},
    raw: {data: {mail: {inbox: {records: []}, otherUnseen: []}}},
    settings: {}, filter: {level: 'all', area: 'all', q: ''}, apTab: 'pending', apMore: {}, apBusy: {},
    mailSearch: {}, mailFilter: 'all', multi: new Set(), newKeys: new Set(), plan: {},
  };
  const TD = {complete: true, list: [], q: '', imp: 'all', sort: 'smart', doneSpan: 'all'};
  const visibleActions = () => S.a.actions;
  const isMine = x => x.scope !== 'ref';
  const STATE_NAME = {wait: '기다리는 중', todo: '할 일', urgent: '급함', check: '확인', confirm: '끝났는지 확인'};
  const c = {
    S, TD, visibleActions, isMine, stateOf: x => x.state, queue: visibleActions,
    mineVisible: () => visibleActions().filter(x => isMine(x) && x.state !== 'wait'),
    STATE_NAME, STATE_GROUP: {...STATE_NAME, overdue: STATE_NAME.urgent},
    R: {...home, ...todo, kstNow: () => ({date: day}), isNoiseMail: x => x.subject.includes('광고')},
    GW: {links: {compose: () => ''}}, ic: () => '', esc: x => String(x ?? '').replaceAll('"', '&quot;'),
    today: () => day, isHidden: () => false, isSnoozed: () => false, todoMd: String,
    todoNavDue: () => todo.tdWrapUp(TD.list, new Date(day+'T03:00:00Z')).filter(t => !t.readonly),
    pgh: (title, sub, tools) => '<h1>' + title + '</h1>' + (sub || '') + (tools || ''),
  };
  vm.runInNewContext(source + '\nthis.view = {vToday, todayQueue, queueRows, homeData, homeTopHtml, vApproval, vMail, todoTimelineHtml};', c);
  return {...c.view, S, TD, lists};
}

test('Home separates personal deadlines from the groupware process/check count', () => {
  const c = setup();
  c.S.a.actions = [action('결재 문서', 'urgent', {base: 'pending', headline: '결재하기'}), ...Array.from({length: 13}, (_, i) => action('그룹웨어 ' + i)), action('대기 중', 'wait'), action('참고 문서', 'info', {scope: 'ref'})];
  c.TD.list = [
    {id: '1', title: '오늘 첫째', due: day}, {id: '2', title: '오늘 둘째', due: day},
    {id: '3', title: '다음 주', due: '2026-11-30'}, {id: '4', title: '언젠가', due: ''},
  ];
  const html = c.homeTopHtml(c.homeData());
  assert.ok(html.indexOf('개인 ToDo · 오늘까지') < html.indexOf('그룹웨어에서 먼저 볼 업무'));
  assert.match(html, /오늘 마감 2건 · 기한 지남 0건/);
  assert.match(html, /그룹웨어 처리·확인 14건 보기/);
  assert.match(html, /내 결재가 대기 중입니다 · 확인된 기한 없음<br>다음: 결재하기/);
  assert.match(c.vToday(), /그룹웨어 처리·확인 14건.*개인 ToDo 제외/);
  c.TD.list[0].due = '2026-11-23';
  assert.match(c.homeTopHtml(c.homeData()), /오늘 마감 1건 · 기한 지남 1건/);
  c.S.filter.level = 'wait';
  assert.equal(c.todayQueue().map(x => x.key).join(','), '대기 중');
});

test('partial groupware and personal lists do not imply definitive empty results', () => {
  const c = setup();
  c.S.raw.data.mail.partial = true;
  c.TD.complete = false;
  assert.match(c.vToday(), /확인된 그룹웨어 처리·확인 0건/);
  assert.match(c.queueRows(), /전체 목록을 확인할 수 없습니다/);
  assert.match(c.homeTopHtml(c.homeData()), /오늘 마감 0건 · 기한 지남 0건 · 전체 목록 확인 불가/);
  assert.match(c.todoTimelineHtml(), /전체 목록을 확인할 수 없습니다/);
  c.TD.list = null; c.TD.err = 'ToDo 조회 실패';
  assert.match(c.homeTopHtml(c.homeData()), /개인 ToDo를 읽지 못했습니다/);
});

test('approval keeps workflow/history routing keys and gives open buttons document names', () => {
  const c = setup();
  c.lists.submitted.docs = [doc('1'), doc('2')];
  assert.match(c.vApproval(), /aria-label="처리 대기".+aria-label="열람·상신 내역"/);
  assert.equal(c.S.apTab, 'pending');
  c.lists.deptWaiting.error = true;
  assert.match(c.vApproval(), /다른 처리 목록 중 일부를 확인할 수 없습니다/);
  c.S.apTab = 'submitted'; c.S.apTabPinned = true;
  const html = c.vApproval();
  assert.match(html, /<th>작성일<\/th>/);
  assert.doesNotMatch(html, /받은 날|data-act="focusList"/);
  for (const id of ['1', '2']) assert.ok(html.includes('data-kind="submitted" data-id="' + id + '" aria-label="열기: 문서 &quot;가&quot; · DOC-' + id + '"'));
  c.S.apTab = 'deptWaiting';
  assert.match(c.vApproval(), /결재 목록을 읽지 못했습니다/);
});

test('recent Mail scope and one-step ad filtering preserve partial results', () => {
  const c = setup(), m = c.S.raw.data.mail;
  m.inbox.records = [mail('업무'), mail('광고 A')];
  m.otherUnseen = [mail('광고 B', 'OTHER')];
  assert.match(c.vMail(), /최근 조회 범위: 받은메일함의 최근 메일 2통과/);
  assert.match(c.vMail(), /data-v="ads">광고·소식만/);
  assert.match(c.vMail(), /<details class="mail-ads">/);
  c.S.mailFilter = 'ads';
  assert.match(c.vMail(), /data-uid="광고 A"/);
  assert.match(c.vMail(), /data-uid="광고 B"/);
  assert.doesNotMatch(c.vMail(), /data-uid="업무"|<details class="mail-ads"/);
  m.partial = true;
  assert.match(c.vMail(), /메일함 일부를 확인할 수 없습니다/);
  assert.match(c.vMail(), /data-uid="광고 A"/);
  m.inbox.records.length = 0; m.otherUnseen.length = 0;
  assert.doesNotMatch(c.vMail(), /메일이 없습니다/);
});
