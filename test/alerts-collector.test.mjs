// v1.19.1 통합알림 수집: 메일 알림 원문 주소 채우기, 제목·보낸 사람, 알림 읽음 표시(쓰기 한 개)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const ORIGIN = 'https://gw.bwyf.or.kr';
const ME = {ucUserInfo: {empSeq: '1', groupSeq: 'g', compSeq: 'c', bizSeq: 'b', deptSeq: 'd', loginId: 'u', empName: '홍길동', emailAdd: 'me', emailDomain: 'example.or.kr'}};
const MAIL = (over = {}) => ({alertId: 'aaaa_1111', eventType: 'MAIL', eventSubType: 'MA001', readDate: '', mailUid: '11409844', mailBoxSeq: '571', createDate: '20261121223832312',
  message: {alertTitle: '[메일] 회의 자료', alertContent: '보낸사람 : 김철수<kim@example.or.kr>'},
  url: '/#/popup?{0}&{1}&{2}&{3}&print=false&callComp=UDAP006&MicroModuleCode=mail&inOutCheck=1&rejectFromEmail=me@example.or.kr',
  data: JSON.stringify({senderName: '김철수', sendEmail: 'kim@example.or.kr', title: '회의 자료', recvList: [{muid: 11409844, email: 'me@example.or.kr', mboxSeq: 571, boxName: 'INBOX'}]}), ...over});
async function load(alertList) {
  const src = await fs.readFile(new URL('../src/live/collector.browser.js', import.meta.url), 'utf8');
  const calls = [];
  const client = {call() {}, post: (p, body) => { calls.push({p, body}); return Promise.resolve(p === '/event/event02A01' ? {resultCode: 0, resultData: {alertList}} : {resultCode: 0, resultData: null}); }};
  const req = () => ({A: client});
  req.m = {42: function signer() { return 'wehago-sign getTransactionId'; }};
  const window = {webpackChunkklago_ui_gw: {push: ([, , cb]) => cb(req)}};
  const sandbox = {window, location: {origin: ORIGIN}, navigator: {userActivation: {isActive: false}}, sessionStorage: {getItem: () => JSON.stringify(ME)}, performance: {now: () => 0}, Intl, Date, JSON, Promise, setTimeout, clearTimeout, Object, Array, String, Number, Set, Map, Math, Function, Error, URL, encodeURIComponent};
  vm.createContext(sandbox); vm.runInContext(src, sandbox);
  return {api: window.BWYFGW, calls};
}

test('메일 알림: 자리표시자 주소를 그룹웨어와 같은 값으로 채우고 제목·보낸 사람을 바로 잡는다', async () => {
  const {api} = await load([MAIL(), MAIL({alertId: 'bbbb_2222', message: {alertTitle: '[메일] (제목없음)', alertContent: '보낸사람 : 김철수<kim@example.or.kr>'}, data: JSON.stringify({senderName: '김철수', sendEmail: 'kim@example.or.kr', title: '', recvList: [{email: 'me@example.or.kr', boxName: 'INBOX'}]})}), MAIL({alertId: 'cccc_3333', mailUid: ''})]);
  const r = await api.collect({modules: ['alerts'], alertCount: 10});
  const [a, b, c] = r.data.alerts.alerts;
  assert.equal(a.id, 'aaaa_1111');
  assert.equal(a.url, ORIGIN + '/#/popup?muid=11409844&email=me%40example.or.kr&mbodSeq=571&boxName=INBOX&MicroModuleCode=mail&print=false&rejectFromEmail=kim%40example.or.kr&callComp=UDAP006');
  assert.doesNotMatch(a.url, /[{}]/);
  assert.equal(a.who, '김철수'); assert.equal(a.title, '회의 자료');
  assert.equal(b.title, '(제목 없음)', '제목 없는 메일에 "보낸사람 : …"이 제목으로 나오지 않는다');
  assert.equal(c.url, '', '메일 번호가 없으면 열지 않는다');
});

test('다른 알림: 여러 줄 내용은 첫 줄만 제목으로, 게시판 글쓴이도 채운다, 자리표시자 주소는 버린다', async () => {
  const {api} = await load([
    {alertId: 'hp_000001', eventType: 'HPD', eventSubType: 'HP013', readDate: '1', createDate: '20261119182700000', message: {alertTitle: '[급여명세서 도착 알림]', alertContent: '(재단)2026년 11월 급여명세서가 발송되었습니다.\r\n2026년 11월 19일 18:27부터 조회가 가능합니다.'}, url: '/#/HP/HPP0120/HPP0120?rvrsYm=202611&sq=13', data: JSON.stringify({titleNm: '', rvrsYm: '202611', senderName: ''})},
    {alertId: 'bo_000001', eventType: 'BOARD', eventSubType: 'BO001', readDate: '', createDate: '20261120100000000', message: {alertTitle: '[게시판새글] 우윤지', alertContent: '[고리울] 공모전 수상'}, url: '/#/popup?callComp=UFAP003&art_seq_no=1', data: JSON.stringify({title: '[고리울] 공모전 수상', senderName: '우윤지', empName: '우윤지'})},
    {alertId: 'x_0000001', eventType: 'WORK', eventSubType: 'X', readDate: '', createDate: '20261120100000000', message: {alertTitle: '[업무]', alertContent: '업무'}, url: '/#/popup?{0}', data: '{}'},
  ]);
  const [h, bo, w] = (await api.collect({modules: ['alerts'], alertCount: 10})).data.alerts.alerts;
  assert.equal(h.title, '(재단)2026년 11월 급여명세서가 발송되었습니다.');
  assert.equal(h.url, ORIGIN + '/#/HP/HPP0120/HPP0120?rvrsYm=202611&sq=13');
  assert.equal(bo.who, '우윤지');
  assert.equal(w.url, '');
});

test('알림 읽음 표시: 그룹웨어 종 목록과 같은 호출 한 번, 잘못된 ID는 거절', async () => {
  const {api, calls} = await load([]);
  const r = await api.readAlert('11tU_qEBWoCP72cNfY4N');
  assert.equal(r.ok, true);
  const w = calls.filter(c => c.p === '/event/event02A03');
  assert.equal(w.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(w[0].body)), {header: {groupSeq: 'g', empSeq: '1', pid: '', tid: ''}, body: {companyInfo: {compSeq: 'c', bizSeq: 'b', deptSeq: 'd', emailAddr: 'me', emailDomain: 'example.or.kr'}, alertIds: ['11tU_qEBWoCP72cNfY4N']}});
  await assert.rejects(api.readAlert('../x'), /알림 ID/);
  await assert.rejects(api.readAlert(''), /알림 ID/);
  assert.equal(calls.filter(c => c.p === '/event/event02A03').length, 1);
  assert.ok(!api.readOnlyEndpoints().includes('/event/event02A03'), '쓰기 주소는 읽기 전용 목록에 없다');
});

test('통합알림 열기: 취소하면 읽음으로 바꾸지 않고, 열면 그룹웨어 알림도 읽음 표시', async () => {
  const src = await fs.readFile(new URL('../src/live/wc/38-notifications-people.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('  function openNotification'), src.indexOf('  // 홈페이지 기준 공식 순서'));
  assert.match(fn, /if \(!wasUnread \|\| opened === false\) return;/);
  assert.match(fn, /GW\.readAlert\(x\.id\)/);
  assert.match(src, /HPD:'급여·인사'/);
  assert.match(src, /notificationTag\(x\)/);
});
