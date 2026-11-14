import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
async function tools(file, extra = {}) {
  const src = await readFile(new URL('../src/live/wc/' + file, import.meta.url), 'utf8');
  const defs = new Map();
  vm.runInNewContext(src, {chatRegisterTool: x => defs.set(x.name, x), ...extra});
  return defs;
}
test('메일 확인 전 상세 API를 호출하지 않고 본문은 결과 카드에만 담는다', async () => {
  let calls = 0;
  const S = {raw: {data: {mail: {inbox: {records: [{uid: '1', box: 'INBOX', subject: '제목', from: '발신', seen: false, date: '2026-11-14'}], fetched: 1, unseen: 1}}}}, a: {actions: []}};
  const defs = await tools('36-chat-tools-more.js', {S, GW: {mailDetail: async a => {calls++; assert.equal(a.allowMarkRead, true); assert.equal(a.seen, false); return {text: 'SECRET_MAIL_BODY'};}}, chatModuleOk: () => true, chatLim: () => 8, today: () => '2026-11-14', R: {isNoiseMail: () => false}});
  const r = await defs.get('list_mail').run({});
  assert.equal(calls, 0); assert.doesNotMatch(JSON.stringify(r), /SECRET_MAIL_BODY/);
  const card = r.cards.find(c => c.type === 'confirm'); assert.ok(card); assert.match(card.warn, /읽음/);
  const out = await card.onConfirm(); assert.equal(calls, 1); assert.doesNotMatch(out.text, /SECRET_MAIL_BODY/); assert.match(out.cards[0].text, /SECRET_MAIL_BODY/);
});
test('문서 선택 전에는 본문을 조회하지 않고 모호하거나 불완전한 결과를 차단한다', async () => {
  let calls = 0, result = {found: false, reason: 'ambiguous'};
  const GW = {search: async () => ({groups: {doc: {items: [{docNo: '문서-12', title: '제목'}], total: 1}}}), docPreview: async () => {calls++; return result;}};
  const defs = await tools('32-chat-tools-read.js', {GW, ymd8: x => x || ''});
  const r = await defs.get('search_documents').run({query: '제목', scope: 'approval'});
  assert.equal(calls, 0); const card = r.cards.find(c => c.type === 'confirm'); assert.ok(card);
  let out = await card.onConfirm(); assert.equal(out.ok, false); assert.match(out.text, /특정/);
  result = {found: false, reason: 'incomplete'}; out = await card.onConfirm(); assert.equal(out.ok, false);
  result = {found: true, text: 'SECRET_DOC_BODY'}; out = await card.onConfirm(); assert.equal(out.ok, true); assert.doesNotMatch(out.text, /SECRET_DOC_BODY/); assert.match(out.cards[0].text, /SECRET_DOC_BODY/);
});
test('확인 결과는 메시지 카드로만 추가되고 AI의 과거 대화에는 메시지 텍스트만 전달한다', async () => {
  const engine = await readFile(new URL('../src/live/wc/31-chat-engine.js', import.meta.url), 'utf8');
  assert.match(engine, /p\.card\.result = \(r && r\.text\)/);
  assert.match(engine, /p\.msg\.cards\.push\(c\)/);
  assert.match(engine, /text: R\.chatSanitizeText\(m\.text, 400\)/);
  assert.match(engine, /text: res\.llm !== undefined \? res\.llm : res\.text, data: res\.data/);
});
