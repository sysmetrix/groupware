// v1.21 카드 사용내역: 기간·상태 계산, 수집기 복호화·필드 제한, 화면 연결
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as C from '../src/live/card-usage.mjs';

const NOW = new Date('2026-11-25T03:00:00Z'); // 2026-11-25(수) 12:00 KST
const ORIGIN = 'https://gw.bwyf.or.kr';

test('기간 단추: 이번 달·지난달·최근 3개월·올해, 잘못된 직접 기간은 이번 달', () => {
  assert.deepEqual(C.cduPeriod('month', NOW), {kind: 'month', from: '20261101', to: '20261125'});
  assert.deepEqual(C.cduPeriod('last', NOW), {kind: 'last', from: '20261001', to: '20261031'});
  assert.deepEqual(C.cduPeriod('m3', NOW), {kind: 'm3', from: '20260901', to: '20261125'});
  assert.deepEqual(C.cduPeriod('year', NOW), {kind: 'year', from: '20260101', to: '20261125'});
  assert.deepEqual(C.cduPeriod('custom', NOW, {from: '2026-10-05', to: '2026-10-20'}), {kind: 'custom', from: '20261005', to: '20261020'});
  assert.equal(C.cduPeriod('custom', NOW, {from: '2026-10-20', to: '2026-10-05'}).kind, 'month');
  // 1월의 지난달은 전년도 12월
  assert.deepEqual(C.cduPeriod('last', new Date('2027-01-10T03:00:00Z')), {kind: 'last', from: '20261201', to: '20261231'});
  // 한국 시간 자정 직후도 그날로 계산
  assert.equal(C.cduPeriod('month', new Date('2026-11-30T15:30:00Z')).from, '20261201');
});

const ROWS = [
  {date: '20261124', time: '18:49', card: '(가)법인카드1', place: '김밥집', amount: 18000, status: 'open', approvalNo: '111'},
  {date: '20261103', time: '19:05', card: '(가)법인카드1', place: '인쇄소', amount: 307670, status: 'done', resolution: '20261104-8'},
  {date: '20261112', time: '10:27', card: '(나)법인카드2', place: '복사집', amount: 1540000, status: 'open', approvalNo: '222'},
  {date: '20261102', time: '12:09', card: '(나)법인카드2', place: '법원', amount: 3000, status: 'other'},
  {date: '20261110', time: '09:00', card: '(가)법인카드1', place: '꽃집', amount: 30000, status: 'open', returned: true},
];

test('상태·카드·찾기어로 거르고 거른 줄만 더한다', () => {
  const v = C.cduView(ROWS, {state: 'open'});
  assert.deepEqual(v.counts, {open: 3, done: 1, other: 1, all: 5});
  assert.equal(v.rows.length, 3);
  assert.equal(v.amount, 18000 + 1540000 + 30000);
  assert.equal(v.openAmount, 18000 + 1540000 + 30000);
  assert.equal(v.oldestOpen, '20261110');
  assert.deepEqual(v.cards.map(c => [c.card, c.count]), [['(가)법인카드1', 2], ['(나)법인카드2', 1]]);
  const one = C.cduView(ROWS, {state: 'open', card: '(나)법인카드2'});
  assert.equal(one.amount, 1540000);
  assert.equal(C.cduView(ROWS, {state: 'all', q: '복 사'}).rows.length, 1); // 띄어쓰기 무시
  assert.equal(C.cduView(ROWS, {state: 'all', q: '1540000'}).rows.length, 1);
  assert.equal(C.cduView(ROWS, {state: 'done'}).rows[0].resolution, '20261104-8');
  assert.equal(C.cduView(null).rows.length, 0);
});

test('표시 문구: 요일·결의 상태·지난 날수', () => {
  assert.equal(C.cduDayLabel('20261125'), '11/25(수)');
  assert.equal(C.cduDash('20261105'), '2026-11-05');
  assert.equal(C.cduStatusLabel(ROWS[0]), '결의 전');
  assert.equal(C.cduStatusLabel(ROWS[4]), '결의 전(회수됨)');
  assert.equal(C.cduStatusLabel(ROWS[1]), '결의 20261104-8');
  assert.match(C.cduStatusLabel(ROWS[3]), /다른 처리/);
  assert.equal(C.cduAgeDays('20261110', NOW), 15);
  assert.equal(C.cduAgeDays('', NOW), null);
});

// ---------- 수집기 ----------
const enc = s => '@!E!@' + Buffer.from(String(s)).toString('base64') + '@!E!@';
async function loadCollector(respond, {crypto = true} = {}) {
  const src = readFileSync(new URL('../src/live/collector.browser.js', import.meta.url), 'utf8');
  const calls = [];
  const client = {call() {}, post: (p, body, opts) => { calls.push({p, body, opts}); return respond(p, body, opts); }};
  const keys = [];
  const util = {encrypt: s => s, decrypt: (s, key, kind) => { keys.push([key, kind]); return Buffer.from(s, 'base64').toString(); }};
  const req = id => (id === '7' ? {default: util} : {A: client});
  req.m = {42: function signer() { return 'wehago-sign getTransactionId'; }};
  if (crypto) req.m[7] = function fetchUtil() { return 'this.decryptResult=(e)=>e.indexOf("@!E!@")'; };
  const window = {webpackChunkklago_ui_gw: {push: ([, , cb]) => cb(req)}};
  const userInfo = {ucUserInfo: {empSeq: '1', groupSeq: 'grp', compSeq: 'c', deptSeq: 'd', loginId: 'u', erpEmpSeq: 'E1', erpCompSeq: '1000', empName: '홍길동'}, erpUserInfo: {userCode: 'E1', deptCode: 'D9', companyCode: '1000'}};
  const sandbox = {window, location: {origin: ORIGIN}, sessionStorage: {getItem: () => JSON.stringify(userInfo)}, performance: {now: () => 0}, Intl, Date, JSON, Promise, setTimeout, clearTimeout, Object, Array, String, Number, Set, Map, Math, Function, Error};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return {api: window.BWYFGW, calls, keys};
}
const RAW = [
  {issDt: enc('20261102'), issSq: 1, issTime: enc('12:56'), attrNm: enc('(가)법인카드1'), trCd: enc('96'), cardNb: enc('1234********5678'), chainName: enc('국밥집'), chainRegnb: enc('1234567890'), chainCeoNm: enc('대표'), chainTel: enc('0321234567'), chainAddr: enc('주소'), sunginNb: enc('30001234'), sunginAm: enc('54000.0000'), vatAm: enc('0.0000'), gisuDt: enc('20261109'), gisuNb: enc('20261109-7'), isuDt: enc('00000000'), docuNb: '', getNb: null, approState: null, getbackFg: enc('N'), transferFg: enc('N')},
  {issDt: enc('20261124'), issSq: 2, issTime: enc('15:13'), attrNm: enc('(가)법인카드1'), trCd: enc('96'), cardNb: enc('1234********5678'), chainName: enc('통신사'), sunginNb: enc('30005678'), sunginAm: enc('131600.0000'), vatAm: enc('0.0000'), gisuDt: null, gisuNb: '', isuDt: enc('00000000'), docuNb: '', getNb: null, approState: null, getbackFg: null, transferFg: enc('N')},
  {issDt: enc('20261105'), issSq: 3, issTime: enc('09:00'), attrNm: enc('(나)법인카드2'), chainName: enc('문구점'), sunginAm: enc('9000'), gisuDt: enc('20261106'), gisuNb: enc('20261106-1'), isuDt: enc('00000000'), getbackFg: enc('Y'), approState: null},
  {issDt: enc('20261106'), issSq: 4, issTime: enc('10:00'), attrNm: enc('(나)법인카드2'), chainName: enc('서점'), sunginAm: enc('12000'), gisuDt: null, isuDt: enc('00000000'), approState: '1'},
];

test('카드 사용내역: 결의서 [카드승인내역]과 같은 조건으로 암호화 요청하고 필요한 칸만 풀어 돌려준다', async () => {
  const {api, calls, keys} = await loadCollector(() => Promise.resolve({resultCode: 0, resultData: RAW}));
  const r = await api.cardUsage({from: '2026-11-01', to: '20261125'});
  const c = calls.find(x => x.p === '/nonprofit/cardAuth/0BN00001');
  assert.ok(c);
  assert.equal(c.opts.encrypt, true);
  assert.deepEqual(JSON.parse(JSON.stringify(c.body)), {trCds: '', issDtFrom: '20261101', issDtTo: '20261125', searchText: '', docuFg: '', commitFg: '0', authFg: ['1', '2', '3'], empCd: 'E1', deptCd: 'D9'});
  assert.ok(keys.every(([k, kind]) => k === 'grp' && kind === 'AES'), '그룹 키로 그룹웨어 복호화 함수 사용');
  assert.deepEqual(r.rows.map(x => [x.date, x.status]), [['20261124', 'open'], ['20261106', 'other'], ['20261105', 'open'], ['20261102', 'done']]); // 최근 순
  const done = r.rows.find(x => x.date === '20261102');
  assert.equal(done.amount, 54000);
  assert.equal(done.place, '국밥집');
  assert.equal(done.resolution, '20261109-7');
  assert.equal(done.time, '12:56');
  assert.equal(r.rows.find(x => x.date === '20261105').returned, true); // 회수된 결의는 다시 결의 전
  const text = JSON.stringify(r);
  for (const secret of ['1234********5678', '1234567890', '0321234567', '대표', '주소', '@!E!@']) assert.ok(!text.includes(secret), '버리는 칸: ' + secret);
  assert.match(r.url, /NCA0020/);
  const open = await api.cardUsage({from: '20261101', to: '20261125', state: 'open'});
  assert.equal(calls.at(-1).body.commitFg, '2');
  assert.equal(open.state, 'open');
});

test('카드 사용내역: 기간 확인과 복호화 기능이 없을 때의 실패', async () => {
  const {api, calls} = await loadCollector(() => Promise.resolve({resultCode: 0, resultData: RAW}), {crypto: false});
  await assert.rejects(api.cardUsage({from: '20261125', to: '20261101'}), e => e.code === 'BAD_QUERY');
  await assert.rejects(api.cardUsage({from: '20250101', to: '20261125'}), e => e.code === 'BAD_QUERY');
  assert.equal(calls.length, 0, '잘못된 기간은 요청하지 않음');
  await assert.rejects(api.cardUsage({from: '20261101', to: '20261125'}), e => e.code === 'DECRYPT_NOT_FOUND');
  // 암호화되지 않은 응답은 복호화 기능 없이도 읽는다
  const plain = await loadCollector(() => Promise.resolve({resultCode: 0, resultData: [{issDt: '20261101', issTime: '10:00', attrNm: '카드', chainName: '가게', sunginAm: '1000', gisuDt: null, isuDt: '00000000'}]}), {crypto: false});
  assert.equal((await plain.api.cardUsage({from: '20261101', to: '20261125'})).rows[0].status, 'open');
  const bad = await loadCollector(() => Promise.resolve({resultCode: 0, resultData: {}}));
  await assert.rejects(bad.api.cardUsage({from: '20261101', to: '20261125'}), e => e.code === 'BAD_RESPONSE');
});

test('카드 사용내역 화면: 예산 집행의 하위 탭으로 연결되고 처리기가 있다', () => {
  const frag = readFileSync(new URL('../src/live/wc/56-budget-card.js', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/live/wc/54-budget-home.js', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/live/wc/10-calendar-budget.js', import.meta.url), 'utf8');
  assert.match(home, /tab\('card', '카드 사용내역'\)/);
  assert.match(home, /\['mine', 'detail', 'all', 'card'\]\.includes\(v\)/);
  assert.match(view, /m === 'card' && typeof vBudgetCard === 'function'/);
  for (const act of new Set([...frag.matchAll(/data-act="(cdu\w+)"/g)].map(m => m[1]))) assert.match(frag, new RegExp(`HOME_ACTS\\.${act} =`), act);
  assert.ok(!/cardNb|chainRegnb/.test(frag), '화면은 카드번호·사업자번호를 다루지 않음');
  assert.match(frag, /esc\(r\.place\)/);
  assert.match(frag, /esc\(r\.card\)/);
});
