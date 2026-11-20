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

function harness({mails = [], details = {}, docs = [], preview = async () => ({found: false}), search = async () => ({groups: {doc: {items: []}}}), events = [], db = {}, attachPages = null} = {}) {
  const store0 = {chatHistV: 3, ...db};
  const loads = [];
  const records = mails.map(m => ({box: 'INBOX', ...m}));
  const ctx = {
    R, console, HOME_ACTS: {}, root: {addEventListener() {}}, setInterval() {}, queueMicrotask() {}, setTimeout: (f, n) => { const t = setTimeout(f, n); t.unref(); return t; }, clearTimeout,
    S: {settings: {}, userKey: 'u1', a: {deadlines: [], actions: [], approval: {lists: {}}}, raw: {data: {mail: {inbox: {records}}, schedule: {start: '20260101', end: '20261231', events}}}, team: {202611: {cal: {byDate: {}}}, 202612: {cal: {byDate: {}}}}},
    store: {get: (k, d) => (k in store0 ? store0[k] : d), set: (k, v) => { store0[k] = v; }, del: k => { delete store0[k]; }},
    esc: x => String(x ?? ''), ic: () => '', $: () => null, allowed: () => false, logError() {}, toast() {}, saveLocal() {}, copyText() {},
    today: () => '2026-11-20', ensureTeam() {}, mineVisible: () => [], stateOf: x => x.state || 'todo', STATE_NAME: {todo: '할 일'}, isMine: x => x.scope !== 'ref',
    visibleActions: () => docs, mailActions: () => records.map(m => ({type: 'mail', key: 'mail:' + m.uid, title: m.subject, ref: {box: 'INBOX', uid: m.uid}})),
    findMail: (box, uid) => records.find(m => String(m.uid) === String(uid)),
    loadMailDetail: async (m, allow) => { loads.push({uid: m.uid, allow}); return details[m.uid] || {error: 'none'}; },
    cmdKeywords: q => String(q || '').split(/\s+/).filter(t => t.length >= 2),
    GW: {docPreview: preview, search, ...(attachPages ? {mailAttachmentPages: attachPages} : {})},
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
