import fs from 'node:fs';
// v0.87.0 화면 조각(43·44)을 가짜 그룹웨어 자료로 실행한다: 여러 메일 정리, 공문 읽기, 일정 준비, 대화 초점 유지.
// 실제 계정에서는 안 읽은 메일을 읽음으로 바꾸게 되므로 이 흐름은 여기서 검증한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as B from '../src/live/briefing.mjs';
import * as C from '../src/live/chat.mjs';
import * as CU from '../src/live/chat-understand.mjs';

const R = {...B, ...C, ...CU, kstNow: () => ({date: '2026-11-20'})};
const part = n => readFile(new URL(`../src/live/wc/${n}`, import.meta.url), 'utf8');
const src = (await Promise.all(['30-chat-ui.js', '31-chat-engine.js', '32-chat-tools-read.js', '43-chat-understand.js', '44-chat-understand-2.js', '45-chat-attach.js'].map(part))).join('\n');

function harness({mails = [], details = {}, docs = [], preview = async () => ({found: false}), search = async () => ({groups: {doc: {items: []}}}), events = [], db = {}, attachPages = null, docPages = null, me = '홍길동'} = {}) {
  const store0 = {chatHistV: 3, ...db};
  const loads = [];
  const records = mails.map(m => ({box: 'INBOX', ...m}));
  const ctx = {
    R, console, HOME_ACTS: {}, root: {addEventListener() {}}, setInterval() {}, queueMicrotask() {}, setTimeout: (f, n) => { const t = setTimeout(f, n); t.unref(); return t; }, clearTimeout,
    S: {settings: {}, userKey: 'u1', a: {deadlines: [], actions: [], approval: {lists: {}}}, raw: {principal: {name: me}, data: {mail: {inbox: {records}}, schedule: {start: '20260101', end: '20261231', events}}}, team: {202611: {cal: {byDate: {}}}, 202612: {cal: {byDate: {}}}}},
    store: {get: (k, d) => (k in store0 ? store0[k] : d), set: (k, v) => { store0[k] = v; }, del: k => { delete store0[k]; }},
    esc: x => String(x ?? ''), ic: () => '', $: () => null, allowed: () => false, logError() {}, toast() {}, saveLocal() {}, copyText() {},
    today: () => '2026-11-20', ensureTeam() {}, mineVisible: () => [], stateOf: x => x.state || 'todo', STATE_NAME: {todo: '할 일'}, isMine: x => x.scope !== 'ref',
    visibleActions: () => docs, mailActions: () => records.map(m => ({type: 'mail', key: 'mail:' + m.uid, title: m.subject, ref: {box: 'INBOX', uid: m.uid}})),
    findMail: (box, uid) => records.find(m => String(m.uid) === String(uid)),
    loadMailDetail: async (m, allow) => { loads.push({uid: m.uid, allow}); return details[m.uid] || {error: 'none'}; },
    cmdKeywords: q => String(q || '').split(/\s+/).filter(t => t.length >= 2),
    GW: {docPreview: preview, search, ...(attachPages ? {mailAttachmentPages: attachPages} : {}), ...(docPages ? {docAttachmentPages: docPages} : {})},
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.api={chatState,chatSend,chatClear,CHAT_TOOLS,cuFocus,cuSetFocus};', ctx);
  return {api: ctx.api, loads, store0, ctx};
}

test('여러 메일 정리: 읽은 메일만이면 바로 읽고 답장 필요한 것부터 정렬한다', async () => {
  const h = harness({
    mails: [{uid: 1, subject: '행사 안내', seen: true, date: '2026-11-20 09:00'}, {uid: 2, subject: '자료 제출 요청', seen: true, date: '2026-11-20 10:00'}],
    details: {1: {subject: '행사 안내', text: '다음 주 행사 일정을 안내드립니다. 참고하시기 바랍니다.'}, 2: {subject: '자료 제출 요청', text: '첨부 양식을 작성하여 11월 25일까지 회신 부탁드립니다.'}},
  });
  const r = await h.api.CHAT_TOOLS.get('digest_mail').run({filter: 'today'});
  assert.equal(r.ok, true);
  assert.deepEqual(h.loads.map(x => x.allow), [false, false]);
  const list = r.cards[0];
  assert.equal(list.sensitive, true);
  assert.match(list.items[0].title, /자료 제출 요청/);
  assert.equal(list.items[0].badge, '답장 필요');
  assert.equal(list.items[1].badge, '안내');
  // 다음 말 "1번 메일 요약해줘"가 정렬된 순서를 가리킨다
  assert.equal(String(h.api.chatState().ctx.lastItems[0].uid), '2');
});

test('여러 메일 정리: 안 읽은 메일이 있으면 확인 카드 전에는 읽지 않는다', async () => {
  const h = harness({mails: [{uid: 5, subject: '새 요청', seen: false}], details: {5: {subject: '새 요청', text: '참석 여부를 알려 주세요.'}}});
  const r = await h.api.CHAT_TOOLS.get('digest_mail').run({filter: 'unread'});
  assert.equal(h.loads.length, 0);
  const card = r.cards.find(c => c.type === 'confirm');
  assert.match(card.rows[0][1], /읽음으로 표시/);
  const done = await card.onConfirm();
  assert.deepEqual(h.loads, [{uid: 5, allow: true}]);
  assert.equal(done.cards[0].items[0].badge, '답장 필요');
});

test('공문 읽기: 내 목록에서 찾아 색인 본문을 정리하고, 없으면 원문 열기를 안내한다', async () => {
  const docs = [{type: 'doc', key: 'doc:deptWaiting:9', title: '마을축제 홍보 협조 요청', docNo: '문화과-1', ref: {kind: 'deptWaiting', docId: '9'}, scope: 'ref', when: '2026-11-19'}];
  const h = harness({docs, preview: async a => (a.docNo === '문화과-1' ? {found: true, docNo: '문화과-1', text: '수신 각 기관장. 기관 게시판에 포스터를 게시하여 주시기 바랍니다. 11월 30일까지 결과를 회신하여 주시기 바랍니다.'} : {found: false})});
  const r = await h.api.CHAT_TOOLS.get('read_doc').run({query: '마을축제 협조'});
  assert.equal(r.ok, true);
  assert.match(r.text, /회신·제출을 요구/);
  assert.equal(r.cards[1].items[2].value, '문화과-1');
  const miss = harness({docs, preview: async () => ({found: false})});
  const m = await miss.api.CHAT_TOOLS.get('read_doc').run({query: '마을축제'});
  assert.equal(m.ok, false);
  assert.match(m.text, /색인/);
  assert.equal(m.cards[0].items[0].act.v, 'doc:deptWaiting:9');
});

test('공문 읽기: 내 목록에 없으면 통합검색에서 낱말이 모두 맞는 문서 하나를 쓴다', async () => {
  const h = harness({search: async () => ({groups: {doc: {items: [{title: '분석캠프 참가계획', docNo: '전략-1', docId: 'a', date: '20261110'}, {title: '분석캠프 결과보고', docNo: '전략-2', docId: 'b'}]}}}), preview: async a => ({found: a.docNo === '전략-1', docNo: a.docNo, text: '교육에 참가하고자 합니다.'})});
  const r = await h.api.CHAT_TOOLS.get('read_doc').run({query: '분석캠프 참가계획'});
  assert.equal(r.ok, true);
  assert.match(r.text, /분석캠프 참가계획/);
});

test('일정 준비: 시간외 일정에는 퇴근 지문 확인 사항을 붙인다', async () => {
  const h = harness({events: [{start: '202611210900', end: '202611211000', title: '마을실험실 파일럿 회의'}], mails: [{uid: 7, subject: '[마을실험실] 파일럿 결과 공유', seen: true}]});
  h.ctx.S.team['202611'].cal.byDate['20261121'] = [{mine: true, kind: 'ot', time: '15:00-18:00'}];
  const r = await h.api.CHAT_TOOLS.get('get_schedule').run({date: '2026-11-21'}, {userText: '내일 일정 확인하고 준비할 거 알려줘'});
  assert.equal(r.ok, true);
  const rel = r.cards.find(c => /관련 자료/.test(c.title || ''));
  assert.match(rel.items[0].title, /마을실험실/);
  assert.ok(r.cards.some(c => c.type === 'note' && /퇴근 지문/.test(c.text)));
  // 준비를 묻지 않으면 붙이지 않는다
  const plain = await h.api.CHAT_TOOLS.get('get_schedule').run({date: '2026-11-21'}, {userText: '내일 일정 알려줘'});
  assert.ok(!plain.cards.some(c => /관련 자료/.test(c.title || '')));
});

test('대화 초점: 저장소에 식별자·제목만 남기고 새로 고침 뒤 30분 안에는 이어 쓴다', () => {
  const h = harness();
  h.api.cuSetFocus({key: 'mail:3', title: '정산 요청', ref: {box: 'INBOX', uid: 3}});
  const saved = h.store0.chatFocus;
  assert.deepEqual(Object.keys(saved).sort(), ['at', 'box', 'key', 'owner', 'title', 'type', 'uid']);
  const again = harness({db: {chatFocus: saved}});
  assert.equal(again.api.cuFocus().uid, '3');
  const stale = harness({db: {chatFocus: {...saved, at: Date.now() - 31 * 60000}}});
  assert.equal(stale.api.cuFocus(), null);
  const other = harness({db: {chatFocus: {...saved, owner: 'u2'}}});
  assert.equal(other.api.cuFocus(), null);
  // 새 대화는 기억한 메일도 잊는다
  again.api.chatClear();
  assert.equal(again.store0.chatFocus, undefined);
  assert.equal(again.api.cuFocus(), null);
});

// ---------- v0.88.0 첨부 읽기 ----------
const xmlOf = lines => '<?xml version="1.0"?><document><page w="793" h="1121">' + lines.map((ln, i) => [...ln].map((ch, j) => `<text l='${100 + j * 10}' t='${100 + i * 20}' w='9' h='${ch === ' ' ? 0 : ch === '.' ? 2 : 12}' >${ch.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`).join('')).join('') + '</page></document>';

test('cuSynapText: 줄 나눔·작은 글자(마침표)·엔티티를 되살린다', () => {
  const x = xmlOf(['제목 자료 제출 요청', '1. 양식을 작성하여 회신 바랍니다.', 'A&B <안내>']);
  assert.equal(CU.cuSynapText(x), '제목 자료 제출 요청\n1. 양식을 작성하여 회신 바랍니다.\nA&B <안내>');
  assert.equal(CU.cuSynapText(''), '');
});

test('cuDocHighlights: 끊긴 줄을 잇고 머리말·인사말을 빼며 제목과 요청을 먼저 고른다', () => {
  const t = ['저장 : 홍길동 / 가상과 (2026-11-18 13:21 : 15)', '문서관리카드가상과-1 1 /2', '제목 마을축제 홍보 협조', '1. 귀 기관의 무궁한 발전을 기원합니다.', '2. 마을축제를 아래와 같이 개최하오니 포스터 게시에', '협조하여 주시기 바랍니다.', '가. 일시: 2026. 12. 1.', '전화번호 ***-***-****'].join('\n');
  const h = CU.cuDocHighlights(t);
  assert.equal(h[0], '제목 마을축제 홍보 협조');
  assert.equal(h[1], '2. 마을축제를 아래와 같이 개최하오니 포스터 게시에 협조하여 주시기 바랍니다.');
  assert.ok(!h.some(x => /무궁한|저장|전화번호/.test(x)));
});

test('cuMaskBody: 날짜·시각은 남기고 띄어 쓴 이메일은 가린다', () => {
  const m = CU.cuMaskBody('저장 (2026-11-18 13:21) 문의 gil dong r1999@korea. kr');
  assert.match(m, /2026-11-18 13:21/);
  assert.doesNotMatch(m, /r1999/);
});

test('첨부 읽기: 초점 메일의 문서 첨부만 읽고, 그림 첨부는 건너뛰며, 결과는 기록에 남기지 않는다', async () => {
  const calls = [];
  const h = harness({
    mails: [{uid: 8, subject: '마을축제 홍보 요청', seen: true}],
    details: {8: {subject: '마을축제 홍보 요청', account: 'a@b', text: '첨부 공문을 확인해 주세요.', files: [{name: '공문.pdf', ext: 'pdf', sn: '1'}, {name: '포스터.jpg', ext: 'jpg', sn: '2'}, {name: '계획.hwp', ext: 'hwp', sn: '3'}]}},
    attachPages: async a => { calls.push(a.sn); return {total: 3, pages: [xmlOf(['제목 마을축제 홍보 협조', '포스터를 게시하여 주시기 바랍니다.'])]}; },
  });
  h.api.cuSetFocus({key: 'mail:8', title: '마을축제 홍보 요청', ref: {box: 'INBOX', uid: 8}});
  const r = await h.api.CHAT_TOOLS.get('read_attachment').run({});
  assert.equal(r.ok, true);
  assert.deepEqual(calls, ['1', '3']);
  const list = r.cards.filter(c => c.type === 'list');
  assert.equal(list.length, 2);
  assert.ok(list.every(c => c.sensitive === true));
  assert.match(list[0].title, /3쪽 중 앞 1쪽/);
  assert.equal(list[0].items[0].title, '제목 마을축제 홍보 협조');
  // 파일 이름으로 하나만
  calls.length = 0;
  await h.api.CHAT_TOOLS.get('read_attachment').run({query: '계획'});
  assert.deepEqual(calls, ['3']);
});

test('첨부 읽기: 안 읽은 메일은 확인 전에는 열지 않는다', async () => {
  const calls = [];
  const h = harness({mails: [{uid: 9, subject: '새 공문', seen: false}], details: {9: {subject: '새 공문', account: 'a@b', text: '본문', files: [{name: 'a.pdf', ext: 'pdf', sn: '1'}]}}, attachPages: async a => { calls.push(a.sn); return {total: 1, pages: [xmlOf(['내용'])]}; }});
  h.api.cuSetFocus({key: 'mail:9', title: '새 공문', ref: {box: 'INBOX', uid: 9}});
  const r = await h.api.CHAT_TOOLS.get('read_attachment').run({});
  assert.equal(h.loads.length, 0);
  assert.equal(calls.length, 0);
  assert.ok(r.cards.some(c => c.type === 'confirm'));
});

// ---------- v0.89.0 결재문서 첨부 ----------
test('문서 첨부: 문서를 읽으면 첨부를 기억하고, 내가 기안한 문서는 바로 읽는다', async () => {
  const docs = [{type: 'doc', key: 'doc:submitted:5', title: '마을축제 운영계획', docNo: '전략-5', ref: {kind: 'submitted', docId: '5'}, scope: 'mine'}];
  const calls = [];
  const h = harness({docs, preview: async () => ({found: true, docNo: '전략-5', drafter: '홍길동', text: '마을축제를 아래와 같이 운영하고자 합니다.', files: [{id: 'AAAABBBBCCCCDDDD1111', name: '세부계획.hwp'}, {id: 'AAAABBBBCCCCDDDD2222', name: '사진.jpg'}]}),
    docPages: async a => { calls.push(a.fileId); return {total: 2, pages: [xmlOf(['제목 마을축제 세부 운영계획', '참가 신청은 12월 1일까지 받습니다.'])]}; }});
  const r0 = await h.api.CHAT_TOOLS.get('read_doc').run({query: '마을축제 운영계획'});
  assert.ok(r0.cards.some(c => c.type === 'chips' && c.items.includes('그 문서 첨부 내용 정리해줘')));
  const r = await h.api.CHAT_TOOLS.get('read_attachment').run({}, {userText: '그 문서 첨부 내용 정리해줘'});
  assert.equal(r.ok, true);
  // v0.90.0: 그림 첨부도 뷰어 키를 받아 두어(글자 없음) AI 그림 읽기로 이어 줄 수 있다
  assert.deepEqual(calls, ['AAAABBBBCCCCDDDD1111', 'AAAABBBBCCCCDDDD2222']);
  assert.equal(r.cards[0].items[0].title, '제목 마을축제 세부 운영계획');
  assert.ok(r.cards[0].sensitive);
});

test('문서 첨부: 남이 기안한 문서는 확인 카드 전에는 열지 않는다', async () => {
  const docs = [{type: 'doc', key: 'doc:deptWaiting:6', title: '협조 요청', docNo: '문화-6', ref: {kind: 'deptWaiting', docId: '6'}, scope: 'ref'}];
  const calls = [];
  const h = harness({docs, preview: async () => ({found: true, docNo: '문화-6', drafter: '김민수', text: '협조 바랍니다.', files: [{id: 'AAAABBBBCCCCDDDD3333', name: '붙임.pdf'}]}), docPages: async a => { calls.push(a.fileId); return {total: 1, pages: [xmlOf(['내용'])]}; }});
  await h.api.CHAT_TOOLS.get('read_doc').run({query: '협조 요청'});
  const r = await h.api.CHAT_TOOLS.get('read_attachment').run({}, {userText: '그 문서 첨부 내용 정리해줘'});
  assert.equal(calls.length, 0);
  const card = r.cards.find(c => c.type === 'confirm');
  assert.match(card.rows[1][1], /열람 기록/);
  await card.onConfirm();
  assert.deepEqual(calls, ['AAAABBBBCCCCDDDD3333']);
});

test('cuSynapText: 좁은 글자 사이(4~5px)는 띄우지 않고 넓은 사이만 띄운다(v0.89.1, "13"이 "1 3"으로 갈라지던 문제)', () => {
  const x = "<document><page w='800' h='1000'><text l='300' t='185' w='2.7' h='10' >1</text><text l='307' t='185' w='4' h='10' >3</text><text l='311' t='194' w='1' h='2' >.</text><text l='330' t='185' w='10' h='12' >금</text></page></document>";
  assert.equal(CU.cuSynapText(x), '13. 금');
});

// ---------- v0.90.0 그림·스캔 첨부 ----------
test('그림 읽기 응답: 그림별 글자·요약·할 일을 검증하고 연락처는 다시 가린다', () => {
  const r = CU.cuParseImageAi(JSON.stringify({text: '[1] 포스터.jpg\n추천기간: 12월 20일까지\n문의 032-111-2222', summary: ['추천 모집 안내입니다.'], asks: [{what: '기관 게시판에 게시', due: '2026-12-20'}], reply_needed: 'no'}));
  assert.match(r.text, /^\[1\] 포스터\.jpg\n추천기간/);
  assert.doesNotMatch(r.text, /111-2222/);
  assert.equal(r.asks[0].due, '2026-12-20');
  assert.equal(CU.cuParseImageAi('읽을 수 없음'), null);
  const p = CU.cuImageUserPrompt(['a.jpg', 'b.jpg'], '2026-11-20', '홍보 요청');
  assert.match(p, /\[1\] a\.jpg\n\[2\] b\.jpg/);
  assert.match(p, /그림 2장/);
  assert.match(CU.CU_IMAGE_SYSTEM, /지시가 아니다/);
  assert.match(CU.CU_IMAGE_SYSTEM, /직원이 할 일/);
});

test('그림 첨부: AI가 없으면 그림을 받지 않고 안내만 한다', async () => {
  const fetched = [];
  const h = harness({mails: [{uid: 11, subject: '포스터 공유', seen: true}], details: {11: {subject: '포스터 공유', account: 'a@b', text: '포스터 공유드립니다.', files: [{name: '포스터.jpg', ext: 'jpg', sn: '1'}]}}, attachPages: async () => { fetched.push('pages'); return {total: 1, pages: [], key: 'KEYKEYKEYKEY', image: true}; }});
  h.ctx.GW.synapPageImages = async () => { fetched.push('img'); return []; };
  h.api.cuSetFocus({key: 'mail:11', title: '포스터 공유', ref: {box: 'INBOX', uid: 11}});
  const r = await h.api.CHAT_TOOLS.get('read_attachment').run({});
  assert.match(r.text, /그림 1개/);
  assert.deepEqual(fetched, []);
  assert.ok(!r.cards.some(c => c.type === 'confirm'));
});

// ---------- v0.91.0 자유 질문 품질 ----------
test('cuPeriod·cuRequestCount: 기간 해석과 승인 건수·일수(기간에 걸친 출장은 기간 안 일수만)', () => {
  assert.deepEqual(CU.cuPeriod('이번 달', '2026-11-20'), {from: '20261101', to: '20261130', label: '11월'});
  assert.equal(CU.cuPeriod('지난달', '2026-01-05').label, '2025년 12월');
  assert.equal(CU.cuPeriod('지난주', '2026-11-20').from, '20261109');
  const apps = [{empCd: '1', approState: '1', atNm: '관외출장', startDt: '20261030', endDt: '20261102'}, {empCd: '1', approState: '1', atNm: '관내출장', startDt: '20261119'}, {empCd: '1', approState: '0', atNm: '관내출장', startDt: '20261125'}, {empCd: '2', approState: '1', atNm: '관내출장', startDt: '20261110'}, {empCd: '1', approState: '1', atNm: '연차', startDt: '20261105'}];
  assert.deepEqual(CU.cuRequestCount(apps, {me: '1', kind: '출장', from: '20261101', to: '20261130'}).count, 2);
  assert.equal(CU.cuRequestCount(apps, {me: '1', kind: '출장', from: '20261101', to: '20261130'}).days, 3);
  assert.equal(CU.cuRequestCount(apps, {me: '1', kind: '출장', from: '20261101', to: '20261130'}).pending, 1);
});

test('cuRisks: 지난 기한·휴가 전 기한·오래 안 읽은 요청 메일·근태·반려를 고르고 우선순위로 정렬', () => {
  const items = [
    {key: 'a', title: '평범한 메일', state: 'todo', type: 'mail', base: 'mailReply', when: '2026-11-20'},
    {key: 'b', title: '요청 메일', state: 'todo', type: 'mail', base: 'mailUnreadAsk', when: '2026-11-18'},
    {key: 'c', title: '기한 지난 제출', state: 'overdue', type: 'mail', deadline: '2026-11-18'},
    {key: 'd', title: '근태', state: 'check', type: 'attendance'},
    {key: 'e', title: '휴가 중 기한', state: 'todo', type: 'mail', deadline: '2026-11-27'},
    {key: 'f', title: '참고', state: 'info'},
  ];
  const r = CU.cuRisks(items, {today: '2026-11-20'});
  assert.deepEqual(r.map(x => x.key), ['c', 'b', 'd']);
  const before = CU.cuRisks(items, {today: '2026-11-20', until: '2026-11-27'});
  assert.ok(before.some(x => x.key === 'e' && x.level === 0));
  assert.ok(before.some(x => x.key === 'a' && x.level === 2 && /11\/27까지 회신해 두면/.test(x.why.join(' '))));
});

test('cuBudgetHealth: 경과율 대비 느림·빠름·초과를 가리고 차이가 큰 순으로', () => {
  const h = CU.cuBudgetHealth([{name: 'A', budget: 100, executed: 60, balance: 40, rate: 60}, {name: 'B', budget: 100, executed: 99, balance: 1, rate: 99}, {name: 'C', budget: 100, executed: 85, balance: 15, rate: 85}, {name: 'D', budget: 0}], 85);
  assert.deepEqual(h.map(x => [x.name, x.flag]), [['A', 'slow'], ['B', 'ok'], ['C', 'ok']]);
  assert.equal(CU.cuBudgetHealth([{name: 'E', budget: 100, executed: 120, balance: -20, rate: 120}], 85)[0].flag, 'fast');
});

// ---------- v0.92.0 저장 공간 ----------
test('저장 공간: 문서 첨부를 읽은 뒤 뷰어 캐시를 지우고, 저장 공간이 모자라면 뷰어 캐시부터 지운다', () => {
  const col = fs.readFileSync(new URL('../src/live/collector.browser.js', import.meta.url), 'utf8');
  const fn = col.slice(col.indexOf('async function docAttachmentPages'), col.indexOf('async function docAttachmentPages') + 2500);
  assert.match(fn, /finally \{[\s\S]*startsWith\('synap_' \+ key\)[\s\S]*removeItem/);
  const st = fs.readFileSync(new URL('../src/live/wc/01-storage.js', import.meta.url), 'utf8');
  const pr = st.slice(st.indexOf('function pruneStorageForQuota'), st.indexOf('function cleanupLegacyStorage'));
  assert.ok(pr.indexOf("startsWith('synap_')") > 0 && pr.indexOf("startsWith('synap_')") < pr.indexOf("'chatHist'"), '뷰어 캐시를 비서 자료보다 먼저 지운다');
});

test('v0.93.0: 관외출장은 외출·휴가로 세지 않고, 근무일대체는 휴가가 아니며, 외출·반차는 일수에서 따로 센다', () => {
  const apps = [{empCd: '1', approState: '1', atNm: '관외출장', startDt: '20261103', endDt: '20261104'}, {empCd: '1', approState: '1', atNm: '외출', startDt: '20261105'}, {empCd: '1', approState: '1', atNm: '근무일대체', startDt: '20261106'}, {empCd: '1', approState: '1', atNm: '대체휴가', startDt: '20261109'}, {empCd: '1', approState: '1', atNm: '오후반차', startDt: '20261110'}];
  const v = CU.cuRequestCount(apps, {me: '1', kind: '휴가', from: '20261101', to: '20261130'});
  assert.deepEqual([v.count, v.days, v.partial], [3, 1, 2]);
  assert.deepEqual(CU.cuRequestCount(apps, {me: '1', kind: '출장', from: '20261101', to: '20261130'}).days, 2);
  assert.equal(CU.cuJosa('휴가', '은는'), '휴가는');
  assert.equal(CU.cuJosa('출장', '은는'), '출장은');
});

test('v0.93.0: 문서 금액·공지 관련성(흔한 낱말 제외)', () => {
  const am = CU.cuAmounts('소요 예산: 금1,250,000원(부가세 포함) 단가 25,000원, 사업비 총 4천만원, 대학별 1,000만원');
  assert.deepEqual(am.map(x => x.won), [40000000, 10000000, 1250000, 25000]);
  const notices = ['청소년 정책 간담회', '청소년 활동 공모', '청소년 축제', '청년 히어로', '마을축제 홍보 안내', '데이터 분석 교육'].map(t => ({title: t}));
  const hits = CU.cuNoticeRelevance(notices, ['청소년', '마을축제', '데이터']);
  assert.deepEqual(hits.map(h => h.title), ['마을축제 홍보 안내', '데이터 분석 교육']);
});

test('v0.94.0: 홈 "챙겨 둘 것"에 놓치기 쉬운 일 신호가 있고, 누르면 비서가 점검한다', () => {
  const home = fs.readFileSync(new URL('../src/live/wc/29-home-view.js', import.meta.url), 'utf8');
  assert.match(home, /\$\{homeRiskSig\(\)\}/);
  assert.match(home, /data-v="risks"/);
  assert.match(home, /v === 'risks'[\s\S]{0,200}chatSend\('이번 주에 내가 놓치기 쉬운 거 있어\?'\)/);
  const read = fs.readFileSync(new URL('../src/live/wc/32-chat-tools-read.js', import.meta.url), 'utf8');
  assert.match(read, /name: 'get_resource_status', label: '자원 예약 현황'/);
});

test('v0.95.0: 본문 기한 — 회신·제출 요구 메일만, 지난 7일~앞으로, 답장에 인용된 내 요청의 기한은 제외', () => {
  const yes = CU.cuReplyNeed({text: '양식을 작성하여 11월 25일까지 회신 부탁드립니다.'});
  assert.equal(CU.cuBodyDeadline([{date: '2026-11-30'}, {date: '2026-11-25'}], yes, '2026-11-21'), '2026-11-25');
  assert.equal(CU.cuBodyDeadline([{date: '2026-11-25'}], CU.cuReplyNeed({text: '행사를 안내드립니다.'}), '2026-11-21'), '');
  assert.equal(CU.cuBodyDeadline([{date: '2026-10-01'}], yes, '2026-11-21'), '');
  const quoted = '센터 의견입니다. 원문: 11월 18일(수)까지 회신해 주시면 반영하겠습니다. 감사합니다. 전략경영실 홍길동 T. 032';
  assert.equal(CU.cuBodyDeadline([{date: '2026-11-18'}], CU.cuReplyNeed({text: quoted}), '2026-11-21', {body: quoted, self: '홍길동'}), '');
  const r = CU.cuRisks([{key: 'm', title: '자료 요청', state: 'todo', type: 'mail', base: 'mailReply', deadline: '2026-11-22', dlSource: 'body', when: '2026-11-21'}], {today: '2026-11-21'});
  assert.match(r[0].why[0], /^본문의 기한 11\/22/);
});

test('v0.96.0: 대화 이어가기 — 고쳐 말하기 순번, 말투만 바꾸기, 그날', async () => {
  const C2 = await import('../src/live/chat.mjs');
  assert.equal(C2.chatCorrectIndex('아니 두 번째 거'), 2);
  assert.equal(C2.chatCorrectIndex('두 번째 거요'), 2);
  assert.equal(C2.chatCorrectIndex('말고 3번'), 3);
  assert.equal(C2.chatCorrectIndex('두 번째 메일 답장 써줘'), 0);
  assert.ok(C2.chatStyleOnly('더 짧게 한 줄로'));
  assert.ok(C2.chatStyleOnly('요점만 정리해줘'));
  assert.ok(!C2.chatStyleOnly('짧게 내일 일정 알려줘'));
  assert.equal(C2.chatIntent('짧게 내일 일정 알려줘', new Date('2026-11-20T18:30:00Z')).tool, 'get_schedule');
  assert.ok(C2.chatRefersDay('그날 부서 사람들 휴가는?'));
  const eng = fs.readFileSync(new URL('../src/live/wc/31-chat-engine.js', import.meta.url), 'utf8');
  assert.match(eng, /st\.ctx\.lastIndexed = \{tool: it\.tool/);
  assert.match(eng, /R\.chatRefersDay\(text\) && st\.ctx\.lastRead/);
  assert.match(eng, /typeof R\.chatCorrectIndex === 'function'/); // 일부 도우미만 주는 시험 환경에서도 대화가 멈추지 않게
});
