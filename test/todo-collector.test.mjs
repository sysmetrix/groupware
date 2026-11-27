// v1.17 수집기의 개인 ToDo 읽기·쓰기 경계: 내 ToDo 확인, 지우기의 사용자 동작, 폭주 제한, 날짜 처리
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const ORIGIN = 'https://gw.bwyf.or.kr';
const ME = {ucUserInfo: {empSeq: '1', groupSeq: 'g', compSeq: 'c', deptSeq: 'd', loginId: 'u', empName: '홍길동'}};
async function load({detail = {}, gesture = false, list = [], session = () => JSON.stringify(ME)} = {}) {
  const src = await fs.readFile(new URL('../src/live/collector.browser.js', import.meta.url), 'utf8');
  const calls = [];
  const respond = (p, body) => {
    if (p.endsWith('prj001A12')) return {resultCode: 0, resultData: {totalCnt: list.length, todoList: list}};
    if (p.endsWith('prj001A05')) return {resultCode: 0, resultData: {todoSeq: body.todoSeq, loginUserTodoOwnerYn: 'Y', loginUserTodoCreateYn: 'Y', ownerEmpSeq: '1', createEmpSeq: '1', prjSeq: '', todoName: '기존', startDate: '20261124', endDate: '20261124', contents: '메모', importDegree: '0', todoStatus: '0', processRate: 0, fileCount: 0, todoLevel: 1, ...detail}};
    if (p.endsWith('prj001A01')) return {resultCode: 0, resultData: 'td777'};
    if (p.endsWith('prj001A09')) return {resultCode: 0, resultData: {}};
    if (p.endsWith('prj001A02') || p.endsWith('prj001A03') || p.endsWith('prj001A07')) return {resultCode: 0, resultData: {todoSeq: body.todoSeq, todoStatus: body.processRate === '100' ? '2' : '0'}};
    return {resultCode: 0, resultData: {}};
  };
  const client = {call() {}, post: (p, body) => { calls.push({p, body}); return Promise.resolve(respond(p, body)); }};
  const req = () => ({A: client});
  req.m = {42: function signer() { return 'wehago-sign getTransactionId'; }};
  const window = {webpackChunkklago_ui_gw: {push: ([, , cb]) => cb(req)}};
  const sandbox = {window, location: {origin: ORIGIN}, navigator: {userActivation: {isActive: gesture}}, sessionStorage: {getItem: () => session()}, performance: {now: () => 0}, Intl, Date, JSON, Promise, setTimeout, clearTimeout, Object, Array, String, Number, Set, Map, Math, Function, Error};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return {api: window.BWYFGW, calls, writes: () => calls.filter(c => /prj001A0[12379]$/.test(c.p))};
}

test('ToDo 목록: 전체 기간으로 읽고 하위 ToDo를 children으로 정리', async () => {
  const {api, calls} = await load({list: [{todoSeq: 'td1', todoName: '보고', endDate: '20261125', todoStatus: '0', contents: 'x', children: [{todoSeq: 'td2', todoName: '자료', todoStatus: '2'}]}]});
  const r = await api.todoList();
  assert.equal(calls[0].body.startDate, '20000101');
  assert.equal(r.todos[0].children[0].todoSeq, 'td2');
  assert.equal(r.complete, true);
});

test('ToDo 만들기: 하루짜리 기한은 시작=기한, 담당자는 나, 하위 ToDo는 상위 소유 확인', async () => {
  const {api, writes, calls} = await load();
  const r = await api.todoCreate({title: '  결과 보고  ', due: '2026-11-28', contents: '메모', important: true});
  assert.equal(r.id, 'td777');
  const b = writes()[0].body;
  assert.equal(b.todoName, '결과 보고');
  assert.equal(b.startDate, '20261128');
  assert.equal(b.endDate, '20261128');
  assert.equal(b.importDegree, '2'); // 예전 important(참)는 그룹웨어 '중요'(2)
  assert.equal(b.ownerUserList[0].empSeq, '1');
  await api.todoCreate({title: '세부', parent: 'td5'});
  assert.ok(calls.some(c => c.p.endsWith('prj001A05') && c.body.todoSeq === 'td5'));
  assert.equal(writes()[1].body.todoLevel, '2');
  assert.equal(writes()[1].body.prtSeq, 'td5');
  await assert.rejects(api.todoCreate({title: ''}), /제목/);
  await assert.rejects(api.todoCreate({title: 'x', due: '2026-02-30'}), /날짜/);
  await assert.rejects(api.todoCreate({title: 'x', contents: 'a'.repeat(1501)}), /1,500/);
});

test('ToDo 고치기: 내 개인 ToDo가 아니거나 첨부가 있으면 쓰지 않는다', async () => {
  for (const detail of [{loginUserTodoOwnerYn: 'N'}, {createEmpSeq: '2'}, {prjSeq: 'P1'}]) {
    const {api, writes} = await load({detail});
    await assert.rejects(api.todoUpdate('td9', {title: '바꿈'}), /내가 만든 개인 ToDo/);
    assert.equal(writes().length, 0);
  }
  const {api, writes} = await load({detail: {fileCount: 2}});
  await assert.rejects(api.todoUpdate('td9', {title: '바꿈'}), /첨부/);
  assert.equal(writes().length, 0);
});

test('ToDo 고치기: 하루짜리는 기한과 함께 시작도 옮기고, 끝낸 ToDo의 완료는 유지', async () => {
  const one = await load();
  await one.api.todoUpdate('td9', {due: '20261130'});
  const b = one.writes()[0].body;
  assert.equal(b.startDate, '20261130');
  assert.equal(b.endDate, '20261130');
  assert.equal(b.contents, '메모'); // 바꾸지 않은 칸은 지금 값
  const span = await load({detail: {startDate: '20261120', endDate: '20261124'}});
  await span.api.todoUpdate('td9', {due: '20261130'});
  assert.equal(span.writes()[0].body.startDate, '20261120');
  const done = await load({detail: {todoStatus: '2', processRate: 100}});
  await done.api.todoUpdate('td9', {contents: '새 메모'});
  assert.equal(done.writes()[0].body.processRate, '100');
});

test('ToDo 고치기: 그 사이 다른 곳에서 내용이 바뀌었으면 멈추고, 고치지 않은 긴 제목은 그대로 보낸다', async () => {
  const c = await load({detail: {contents: '다른 PC가 고침'}});
  await assert.rejects(c.api.todoUpdate('td9', {contents: '내 메모'}, {base: '메모'}), /다른 곳에서/);
  assert.equal(c.writes().length, 0);
  const long = await load({detail: {todoName: '가'.repeat(150)}});
  await long.api.todoUpdate('td9', {due: '20261201'});
  assert.equal(long.writes()[0].body.todoName.length, 150);
});

test('ToDo 고치기: 상세에 없는 중요도는 목록 값으로 지킨다', async () => {
  const c = await load({detail: {importDegree: undefined}, list: [{todoSeq: 'td9', todoName: '기존', importDegree: '1', children: []}]});
  await c.api.todoUpdate('td9', {due: '20261201'});
  assert.equal(c.writes()[0].body.importDegree, '1');
});

test('ToDo 지우기: 화면에서 직접 누른 경우에만', async () => {
  const no = await load({gesture: false});
  await assert.rejects(no.api.todoDelete('td9'), /직접 누른/);
  assert.equal(no.writes().length, 0);
  const yes = await load({gesture: true});
  await yes.api.todoDelete('td9');
  assert.equal(yes.writes()[0].p, '/kiss/APIHandler/prj001A03');
  await assert.rejects(yes.api.todoDelete('x; drop'), /번호/);
});

test('ToDo 쓰기 폭주 제한: 1분에 40번까지', async () => {
  const {api, writes} = await load();
  for (let i = 0; i < 40; i++) await api.todoSetDone('td9', i % 2 === 0);
  await assert.rejects(api.todoSetDone('td9', true), /너무 자주/);
  assert.equal(writes().length, 40);
});

test('ToDo 주소는 읽기 전용 목록과 쓰기 목록에 알맞게 들어 있다', async () => {
  const {api} = await load();
  const ro = api.readOnlyEndpoints();
  assert.ok(ro.includes('/kiss/APIHandler/prj001A12') && ro.includes('/kiss/APIHandler/prj001A05'));
  for (const w of ['prj001A01', 'prj001A02', 'prj001A03', 'prj001A07', 'prj001A09']) assert.ok(!ro.includes('/kiss/APIHandler/' + w));
  await assert.rejects(api.call('/kiss/APIHandler/prj001A03', {todoSeq: 'td1'}), /허용 목록/);
});

test('ToDo 만들기: 로그인 화면에서 먼저 실린 뒤 로그인해도 저장되고, 다른 사용자로 바뀌면 막는다', async () => {
  let who = null; // 스크립트가 실릴 때는 아직 로그인 전(같은 문서의 #/ 로그인 화면)
  const {api, writes} = await load({session: () => (who ? JSON.stringify(who) : null)});
  who = ME;
  const r = await api.todoCreate({title: '로그인 뒤 할 일'});
  assert.equal(r.id, 'td777');
  assert.equal(writes().length, 1);
  who = {ucUserInfo: {...ME.ucUserInfo, empSeq: '2'}};
  await assert.rejects(api.todoCreate({title: '다른 사람'}), /로그인 정보가 바뀌었습니다/);
  assert.equal(writes().length, 1);
});
test('ToDo 고치기: 바꾸지 않은 긴급·중요·즉시는 그대로 보낸다(일반으로 바뀌지 않음)', async () => {
  for (const imp of ['1', '2', '3']) {
    const c = await load({detail: {importDegree: undefined}, list: [{todoSeq: 'td9', todoName: '기존', importDegree: imp, children: []}]});
    await c.api.todoUpdate('td9', {title: '새 제목'});
    assert.equal(c.writes()[0].body.importDegree, imp);
  }
  const c = await load();
  await c.api.todoUpdate('td9', {importance: '3', dday: true});
  assert.equal(c.writes()[0].body.importDegree, '3');
  assert.equal(c.writes()[0].body.dDayYn, 'Y');
  await assert.rejects(c.api.todoUpdate('td9', {importance: '7'}), /중요도/);
});

test('ToDo 만들기: 중요도 4단계·기간·D-day', async () => {
  const {api, writes} = await load();
  await api.todoCreate({title: '보고서', start: '2026-11-24', due: '2026-11-28', importance: '1', dday: true});
  const b = writes()[0].body;
  assert.equal(b.importDegree, '1');
  assert.equal(b.startDate, '20261124');
  assert.equal(b.endDate, '20261128');
  assert.equal(b.dDayYn, 'Y');
});

test('진행률: 내가 담당자면 받은 ToDo·프로젝트 ToDo도 바꾸고, 담당자가 아니면 막는다', async () => {
  const got = await load({detail: {createEmpSeq: '2', loginUserTodoCreateYn: 'N', prjSeq: 'P1', proccessYn: 'Y'}});
  const r = await got.api.todoSetProgress('td9', 40);
  assert.equal(r.rate, 40);
  assert.equal(got.writes()[0].p, '/kiss/APIHandler/prj001A07');
  assert.deepEqual(JSON.parse(JSON.stringify(got.writes()[0].body)), {prjSeq: 'P1', todoSeq: 'td9', processRate: '40'});
  await got.api.todoSetDone('td9', true);
  assert.equal(got.writes()[1].body.processRate, '100');
  for (const detail of [{loginUserTodoOwnerYn: 'N'}, {ownerEmpSeq: '2'}, {proccessYn: 'N'}]) {
    const no = await load({detail});
    await assert.rejects(no.api.todoSetProgress('td9', 50), /담당자/);
    assert.equal(no.writes().length, 0);
  }
  const bad = await load();
  await assert.rejects(bad.api.todoSetProgress('td9', 101), /0~100/);
  await assert.rejects(bad.api.todoSetProgress('td9', 12.5), /0~100/);
});

test('중요도만 바꾸기: 그룹웨어 화면과 같은 prj001A09, 내가 만든 개인 ToDo만(첨부가 있어도 됨)', async () => {
  const c = await load({detail: {fileCount: 2, processRate: 30}});
  await c.api.todoSetImportance('td9', '3');
  assert.equal(c.writes()[0].p, '/kiss/APIHandler/prj001A09');
  assert.deepEqual(JSON.parse(JSON.stringify(c.writes()[0].body)), {todoSeq: 'td9', importDegree: '3', processRate: '30'});
  const other = await load({detail: {createEmpSeq: '2'}});
  await assert.rejects(other.api.todoSetImportance('td9', '1'), /내가 만든/);
  assert.equal(other.writes().length, 0);
});
test('댓글 읽기: 그룹웨어 ToDo 댓글 조회(읽기 전용 목록), 지운 댓글은 내용 없이, 접속 IP는 버린다', async () => {
  const src = await fs.readFile(new URL('../src/live/collector.browser.js', import.meta.url), 'utf8');
  const calls = [];
  const client = {call() {}, post: (p, body) => { calls.push({p, body}); return Promise.resolve(p.endsWith('gw026A03') ? {resultCode: 0, resultData: {moreYn: 'N', commentList: [{commentSeq: '1', empName: '홍길동', deptName: '기획팀', createDate: '2026-11-22 11:55:37', useYn: 'Y', depth: 1, createSeq: '1', contents: '첫 줄', createIp: '10.0.0.1', fileSnList: []}, {commentSeq: '2', empName: '김민수', useYn: 'N', depth: 2, createSeq: '2', contents: '지운 글'}]}} : {resultCode: 0, resultData: {}}); }};
  const req = () => ({A: client}); req.m = {42: function signer() { return 'wehago-sign getTransactionId'; }};
  const window = {webpackChunkklago_ui_gw: {push: ([, , cb]) => cb(req)}};
  const sandbox = {window, location: {origin: ORIGIN}, navigator: {userActivation: {isActive: false}}, sessionStorage: {getItem: () => JSON.stringify(ME)}, performance: {now: () => 0}, Intl, Date, JSON, Promise, setTimeout, clearTimeout, Object, Array, String, Number, Set, Map, Math, Function, Error};
  vm.createContext(sandbox); vm.runInContext(src, sandbox);
  const api = window.BWYFGW;
  assert.ok(api.readOnlyEndpoints().includes('/gw/api/gw026A03'));
  const r = JSON.parse(JSON.stringify(await api.todoComments('td9')));
  assert.equal(calls[0].body.moduleSeq, 'td9'); assert.equal(calls[0].body.moduleGbnCode, 'project'); assert.equal(calls[0].body.commentType, '200');
  assert.deepEqual(r.comments[0], {id: '1', who: '홍길동', dept: '기획팀', at: '2026-11-22 11:55:37', deleted: false, reply: false, mine: true, text: '첫 줄', files: 0});
  assert.equal(r.comments[1].deleted, true); assert.equal(r.comments[1].text, ''); assert.equal(r.comments[1].reply, true);
  assert.ok(!JSON.stringify(r).includes('10.0.0.1'));
  await assert.rejects(api.todoComments('x'), /번호/);
});


test('투입공수: 원본 값 보존, 소수 입력과 잘못된 값 차단', async () => {
  const c = await load({detail: {manHour: 2.75}});
  await c.api.todoUpdate('td9', {title: '변경'});
  assert.equal(c.writes()[0].body.manHour, 2.75);
  await c.api.todoUpdate('td9', {manHour: '1.25'});
  assert.equal(c.writes()[1].body.manHour, '1.25');
  await c.api.todoUpdate('td9', {manHour: '0'});
  assert.equal(c.writes()[2].body.manHour, '');
  for (const manHour of ['-1', '1.234', '1e3']) await assert.rejects(c.api.todoUpdate('td9', {manHour}), /투입공수/);
  const n = await load();
  await n.api.todoCreate({title: '할 일', manHour: '3.5'});
  assert.equal(n.writes()[0].body.manHour, '3.5');
});
