// Wave 3(w3-chat) 회귀 테스트:
// 1. 주간·누적 근무시간 자연어 변형(보조사·어순 변형, p32 포함)
// 2. 날짜 없는 비차량 자원 예약 요청이 AI 키 없을 때 CHAT_HELP 대신 사실 문장으로 안내
// 3. 미등록 차종·인승 단서('모닝', '9인승' 등) 및 정비·수리·불가 사유절에서 확인 카드 없이 차량 목록과 함께 되묻기
// 4. get_resource_status 다중 자원(차량·LED·회의실) 전체 표시 및 단일 자원 단서 우선 표시
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as B from '../src/live/briefing.mjs';
import * as CH from '../src/live/chat.mjs';
import * as CU from '../src/live/chat-understand.mjs';

const R = {...B, ...CH, cuJosa: CU.cuJosa};
const src = f => readFile(new URL('../src/live/wc/' + f, import.meta.url), 'utf8');
const [ui30, eng31, read32, act33] = await Promise.all([
  src('30-chat-ui.js'), src('31-chat-engine.js'), src('32-chat-tools-read.js'), src('33-chat-tools-act.js'),
]);

const NOW = new Date('2026-11-16T01:00:00Z');
const DATE = '2099-03-10', D8 = '20990310';
const NOT_CAR = '회의실 등 차량이 아닌 자원은 여기서 예약을 준비하지 않습니다. 자원 예약 화면에서 예약해 주세요.';

const RESOURCES = [
  {resSeq: '11', name: '2층 회의실', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '12', name: '다목적홀', attr: '회의실', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '13', name: '상담실 1', attr: '회의실', apprYn: 'N', useYn: 'Y'},
  {resSeq: '21', name: '업무용 승합차 (12가 3456)', attr: '차량', apprYn: 'Y', useYn: 'Y'},
  {resSeq: '22', name: '업무용 승용차 (34나 5678)', attr: '차량', apprYn: 'N', useYn: 'Y'},
  {resSeq: '7', name: '1층 LED패널(1)', attr: '예시센터 LED패널(1층)', apprYn: 'N', useYn: 'Y'},
  {resSeq: '8', name: '1층 LED패널(2)', attr: '', apprYn: 'N', useYn: 'Y'},
];

function makeChat({list = RESOURCES, bookings = []} = {}) {
  const db = {chatHistV: 3}, gwCalls = [];
  const GW = {
    resourceList: async () => { gwCalls.push(['list']); return list.map(r => ({...r})); },
    resourceBookings: async q => { gwCalls.push(['bookings', q.resSeqs]); return bookings.filter(b => q.resSeqs.includes(b.resSeq)); },
    resourceDetail: async seq => { gwCalls.push(['detail', seq]); const r = list.find(x => x.resSeq === seq) || {}; return {resSeq: seq, apprYn: r.apprYn || 'N', limitMin: 0}; },
    resourceCheck: async ({resSeq}) => { gwCalls.push(['check', resSeq]); return {conflict: false, limit: false}; },
    reserveResource: async () => { throw new Error('확인 카드를 누르지 않았는데 예약 요청이 나갔습니다'); },
  };
  const ctx = {
    R, GW, S: {settings: {}, userKey: 'u1'}, HOME_ACTS: {}, root: {addEventListener() {}},
    setInterval() {}, setTimeout: (f, n) => { const t = setTimeout(f, n); t.unref(); return t; }, clearTimeout, console,
    store: {get: (k, d) => (k in db ? db[k] : d), set: (k, v) => (db[k] = v), del: k => delete db[k]},
    allowed: k => k === 'resource', logError() {}, logActionRecord() {}, $: () => null, esc: x => String(x ?? ''),
    resState: () => ({}), today: () => '2099-03-09',
  };
  vm.createContext(ctx);
  vm.runInContext(ui30 + '\n' + eng31 + '\n' + read32 + '\n' + act33 + '\nthis.api={chatSend,chatState,CHAT_TOOLS}', ctx);
  const lastAi = () => ctx.api.chatState().msgs.filter(m => m.role === 'ai').at(-1);
  const confirms = () => ctx.api.chatState().msgs.flatMap(m => m.cards || []).filter(c => c && c.type === 'confirm');
  return {
    send: text => ctx.api.chatSend(text),
    status: (a, c) => ctx.api.CHAT_TOOLS.get('get_resource_status').run({date: DATE, ...a}, c),
    reserve: (a, userText = '') => ctx.api.CHAT_TOOLS.get('reserve_vehicle').run({date: DATE, start: '14:00', end: '16:00', ...a}, {userText}),
    lastAi, confirms, gwCalls,
  };
}

test('1. 주간·누적 근무시간: 보조사·어순 변형이 모두 get_work_hours로 연결된다', () => {
  const weekly = [
    '이번 주 내가 몇 시간이나 일했나',
    '금주 총 몇 시간쯤 근무했어',
    '이번 주 일 몇 시간 했지',
    '이번 주 일을 몇 시간이나 했어',
    '이번 주 몇 시간 정도 더 일했어',
    '금주 근무 얼마나 했어',
  ];
  for (const q of weekly) {
    const r = CH.chatIntent(q, NOW);
    assert.equal(r.tool, 'get_work_hours', q);
    assert.equal(r.args.week, true, q);
  }
  for (const q of ['오늘 몇 시간이나 일했지', '이번 달 일 몇 시간 했어', '이번 달 총 몇 시간쯤 근무했나']) {
    const r = CH.chatIntent(q, NOW);
    assert.equal(r.tool, 'get_work_hours', q);
    assert.equal(r.args.week, undefined, q);
  }
  // 타인 근무시간·시간외 신청은 여전히 get_work_hours로 가지 않는다
  assert.notEqual(CH.chatIntent('한지우 팀장 이번 주 몇 시간이나 일했어?', NOW).tool, 'get_work_hours');
  assert.equal(CH.chatIntent('오늘 18시부터 20시까지 시간외 신청해줘', NOW).tool, 'prepare_overtime_request');
});

test('2. 날짜 없는 비차량 자원 예약 요청: tool은 빈 문자열을 유지하되 AI 없어도 사실 문장으로 안내한다', async () => {
  for (const q of ['회의실 예약해줘', '회의실 하나 잡아줘', '세미나실 좀 빌려줘', 'LED 패널 예약해줘', '다목적홀 예약해줘']) {
    assert.equal(CH.chatIntent(q, NOW).tool, '', q);
    assert.equal(CH.chatNotDoing(q), NOT_CAR, q);
    const chat = makeChat();
    await chat.send(q);
    assert.equal(chat.lastAi().text, NOT_CAR, q);
    assert.doesNotMatch(chat.lastAi().text, /이해하지 못했습니다/, q);
    assert.equal(chat.confirms().length, 0, q);
  }
  // 취소·중단·변경·할일 추가·일정 잡기·현황 조회·메일/기안/출장 문장과 충돌하지 않는다
  assert.match(CH.chatNotDoing('회의실 예약 취소 좀 해 줘'), /취소는 GW 비서가 대신 하지 않습니다/);
  assert.equal(CH.chatNotDoing('회의실 예약하지 마'), '');
  assert.equal(CH.chatNotDoing('회의실 예약 변경해줘'), '');
  assert.equal(CH.chatNotDoing('회의실 예약 요청 메일 써줘'), '');
  assert.equal(CH.chatIntent('회의실 예약 요청 메일 써줘', NOW).tool, 'compose_mail');
  assert.equal(CH.chatNotDoing('교육장 잡아서 교육 출장 신청 준비해줘'), '');
  assert.equal(CH.chatNotDoing('강당 빌려서 행사 계획 기안 작성해줘'), '');
  assert.equal(CH.chatIntent('할 일에 회의실 예약하기 추가해줘', NOW).tool, 'add_todo');
  assert.equal(CH.chatIntent('다목적홀에서 팀 회의 일정 잡아줘', NOW).tool, 'prepare_schedule');
  assert.equal(CH.chatIntent('회의실 예약 현황 알려줘', NOW).tool, 'get_resource_status');
});

test('3. 미등록 차종·인승 단서 및 정비·수리·불가 사유절: 첫 차량 확인 카드를 만들지 않고 차량 목록과 함께 되묻는다', async () => {
  // '9인승 1호' 계약 유지: 이름에 종류 말이 없고 분류(attr)로만 차량
  assert.equal(B.resKindOf({name: '9인승 1호', attr: ''}), '');
  assert.equal(B.resKindOf({name: '9인승 1호', attr: '공용차량'}), 'car');

  const modelClues = [
    '내일 2시부터 4시까지 모닝 예약해줘',
    '내일 2시부터 4시까지 9인승 차량 예약해줘',
    '내일 2시부터 4시까지 레이 빌려줘',
    '내일 2시부터 4시까지 포터 예약해줘',
    '내일 2시부터 4시까지 전기차 잡아줘',
    '내일 2시부터 4시까지 경차 예약해줘',
  ];
  for (const q of modelClues) {
    const it = CH.chatIntent(q, NOW);
    assert.equal(it.tool, 'reserve_vehicle', q);
    assert.ok(it.args.resource, `resource 단서가 전달되어야 함: ${q}`);
    const chat = makeChat();
    await chat.send(q);
    assert.equal(chat.confirms().length, 0, `확인 카드가 나오면 안 됨: ${q}`);
    assert.match(chat.lastAi().text, /꼭 맞는 차량을 하나로 정하지 못해 고르지 않았습니다/, q);
    assert.match(chat.lastAi().text, /업무용 승합차 \(12가 3456\), 업무용 승용차 \(34나 5678\)/, q);
  }

  // '9인승 1호'가 목록에 있어도 '9인승'만 말하면 일부 일치(숫자 포함 단서)라 되묻는다
  {
    const chat = makeChat({list: [{resSeq: '31', name: '9인승 1호', attr: '공용차량', apprYn: 'N', useYn: 'Y'}, ...RESOURCES]});
    const r = await chat.reserve({kind: 'car', resource: '9인승'}, '내일 2시부터 4시까지 9인승 차량 예약해줘');
    assert.equal(r.ok, false);
    assert.ok(!(r.cards || []).some(c => c.type === 'confirm'));
    assert.match(r.text, /“9인승”에 꼭 맞는 차량을 하나로 정하지 못해/);
  }

  // 정비·수리·점검·불가 사유절이 낀 문장: 확인 카드 미생성
  const reasonClauses = [
    '승합차는 내일 정비라 내일 2시부터 4시까지 차량 예약해줘',
    '니로는 수리 중이라 내일 2시부터 4시까지 다른 차 빌려줘',
    '승용차 점검이라 내일 2시부터 3시까지 차 잡아줘',
    '승합차는 사고 나서 내일 2시부터 4시까지 관용차 예약해줘',
    '승합차는 내일 사용 중이라 내일 2시부터 4시까지 차 빌려줘',
    '승합차는 배차 안 돼서 내일 2시부터 4시까지 차량 잡아줘',
  ];
  for (const q of reasonClauses) {
    const ra = CH.chatResourceAsk(q);
    assert.ok(ra.neg || ra.odd, `neg 또는 odd여야 함: ${q}`);
    const chat = makeChat();
    await chat.send(q);
    assert.equal(chat.confirms().length, 0, `확인 카드가 나오면 안 됨: ${q}`);
    assert.match(chat.lastAi().text, /있는 차량: 업무용 승합차 \(12가 3456\), 업무용 승용차 \(34나 5678\)/, q);
  }

  // 외래어 일부('릴레이', '리포터', '모닝 브리핑') 오탐 방지
  assert.equal(CH.chatResourceAsk('릴레이 캠페인 일정').found, false);
  assert.equal(CH.chatResourceAsk('서포터즈 모집 안내').found, false);
  assert.equal(CH.chatIntent('모닝 브리핑 해줘', NOW).tool, 'run_briefing');
});

test('4. get_resource_status: 다중 차량·LED·회의실 전체 현황을 한 번에 조회해 표시하고, 특정 자원 단서는 해당 자원을 대표로 보여 준다', async () => {
  const bookings = [
    {resSeq: '21', start: D8 + '0900', end: D8 + '1200', title: '외근', who: '김민수'},
    {resSeq: '22', start: D8 + '1400', end: D8 + '1600', title: '출장', who: '이서연'},
    {resSeq: '7', start: D8 + '1000', end: D8 + '1100', title: '홍보', who: '박지훈'},
    {resSeq: '12', start: D8 + '1300', end: D8 + '1500', title: '행사', who: '최유진'},
  ];

  // 다중 차량 조회: 대표 data.resource와 nav v는 첫 차량 유지, 본문에는 두 차량 모두 표시
  {
    const chat = makeChat({bookings});
    const r = await chat.status({kind: 'car'});
    assert.equal(r.ok, true);
    assert.equal(r.data.resource, '업무용 승합차 (12가 3456)');
    const nav = r.cards.find(c => c.type === 'nav');
    assert.equal(nav.v, `21,${D8}`);
    assert.match(r.text, /^업무용 승합차 \(12가 3456\).*예약 1건\(09:00~12:00\)/);
    assert.match(r.text, /\n• 업무용 승용차 \(34나 5678\): 예약 1건\(14:00~16:00\)\. 비어 있는 시간은 09:00~14:00, 16:00~18:00입니다\./);
    assert.deepEqual(chat.gwCalls.filter(c => c[0] === 'bookings'), [['bookings', ['21', '22']]]);
  }

  // 다중 LED 패널 조회: 1층 LED패널(1)과 (2) 모두 표시
  {
    const chat = makeChat({bookings});
    const r = await chat.status({kind: 'led'});
    assert.equal(r.data.resource, '1층 LED패널(1)');
    assert.match(r.text, /^1층 LED패널\(1\).*예약 1건\(10:00~11:00\)/);
    assert.match(r.text, /\n• 1층 LED패널\(2\): 예약 0건\. 비어 있는 시간은 09:00~18:00입니다\./);
  }

  // 다중 회의실 조회 및 reserve_ask 접두 문구 유지
  {
    const chat = makeChat({bookings});
    const r = await chat.status({kind: 'room', reserve_ask: true});
    assert.equal(r.text.indexOf(NOT_CAR), 0);
    assert.match(r.text, /2층 회의실/);
    assert.match(r.text, /\n• 다목적홀: 예약 1건\(13:00~15:00\)/);
    assert.match(r.text, /\n• 상담실 1: 예약 0건/);
  }

  // 특정 자원 하나를 짚은 단서(userText 또는 a.resource): 그 자원을 대표로 표시
  {
    const chat = makeChat({bookings});
    const r1 = await chat.status({kind: 'car'}, {userText: '내일 승용차 비어 있어?'});
    assert.equal(r1.data.resource, '업무용 승용차 (34나 5678)');
    assert.equal(r1.cards.find(c => c.type === 'nav').v, `22,${D8}`);
    assert.doesNotMatch(r1.text, /업무용 승합차/);

    const r2 = await chat.status({kind: 'led'}, {userText: '내일 1층 LED패널(2) 비어 있어?'});
    assert.equal(r2.data.resource, '1층 LED패널(2)');
    assert.equal(r2.cards.find(c => c.type === 'nav').v, `8,${D8}`);

    const r3 = await chat.status({kind: 'room', resource: '다목적홀'});
    assert.equal(r3.data.resource, '다목적홀');
    assert.equal(r3.cards.find(c => c.type === 'nav').v, `12,${D8}`);
  }

  // resSeq가 빠진 예약 행이 오면 다중 자원에서 0건으로 거짓 표시하지 않고 첫 자원만 재조회해 안내
  {
    const noSeqBookings = [{start: D8 + '1000', end: D8 + '1100', title: '미구분 예약'}];
    const chat = makeChat({bookings: noSeqBookings});
    // resSeqs 필터 없이 그대로 돌려주는 수집기 변형 흉내
    const r = await (async () => {
      const t = makeChat();
      const ctx2 = {
        R, GW: {resourceList: async () => RESOURCES, resourceBookings: async () => noSeqBookings},
        S: {}, chatRegisterTool: d => { if (d.name === 'get_resource_status') ctx2.def = d; }, allowed: () => true, resState: () => ({}), today: () => '2099-03-09',
      };
      vm.runInNewContext(read32, ctx2);
      return ctx2.def.run({date: DATE, kind: 'car'}, {});
    })();
    assert.match(r.text, /예약 1건\(10:00~11:00\)/);
    assert.match(r.text, /예약 구분 정보가 없어 자원 예약 화면에서 확인해 주세요/);
    assert.doesNotMatch(r.text, /승용차.*예약 0건/);
  }
  assert.equal(CH.chatResourceAsk('내일 모닝콜 잡아줘').found, false);
});
