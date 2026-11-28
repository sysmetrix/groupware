import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFile(path.join(root, 'src', 'live', 'ext', f), 'utf8');
const listeners = () => { const a = []; return {add: fn => a.push(fn), fire: (...x) => a.forEach(f => f(...x)), list: a}; };

function fakePort(origin, name = 'ai-proxy') {
  const onMsg = listeners(), onDis = listeners(), sent = [];
  return {
    name, sender: {origin}, sent,
    onMessage: {addListener: onMsg.add},
    onDisconnect: {addListener: onDis.add},
    postMessage: m => sent.push(m),
    disconnect() { onDis.fire(); },
    _msg: m => onMsg.fire(m),
    _dis: () => onDis.fire(),
  };
}

function memStorage() {
  const map = new Map();
  return {
    _map: map,
    get: async k => ({[k]: map.get(k)}),
    set: async obj => { for (const [k, v] of Object.entries(obj)) map.set(k, v); },
    remove: async k => { map.delete(k); },
  };
}

async function loadBgForAi(fetchImpl) {
  const onConnect = listeners();
  const local = memStorage(), session = memStorage();
  const calls = [];
  const chrome = {
    runtime: {onConnect: {addListener: onConnect.add}},
    storage: {local, session},
    tabs: {create: async () => ({id: 1}), update: async () => {}, remove: async () => {}},
    scripting: {executeScript: async () => []},
  };
  const fetch = async (url, init) => { calls.push({url, init}); return fetchImpl(url, init); };
  const ctx = vm.createContext({chrome, fetch, AbortController, TextDecoder, setTimeout, clearTimeout, Date, JSON, Promise, Array, Set, Object, Error, URL, RegExp, String});
  vm.runInContext(await read('background.js'), ctx, {filename: 'background.js'});
  return {connect: p => onConnect.fire(p), local, session, calls};
}

const wait = async (fn, ms = 3000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise(r => setTimeout(r, 10)); } };
const TEST_KEY = 'AIzaSyTestKey1234567890abcdefghijk';

test('P2-2 background ai-proxy: 키를 SW 저장소에 격리하고 MAIN world로 키 원문을 절대 반환하지 않는다', async () => {
  const bg = await loadBgForAi(async (url, init) => ({
    ok: true, status: 200,
    json: async () => ({candidates: [{content: {parts: [{text: '응답완료'}]}}]}),
  }));

  // 1) 타 origin 차단
  const evil = fakePort('https://evil.example', 'ai-proxy');
  let evilClosed = false; evil.disconnect = () => { evilClosed = true; };
  bg.connect(evil);
  assert.equal(evilClosed, true);

  // 2) 키 저장 (local)
  const pSave = fakePort('https://gw.bwyf.or.kr', 'ai-proxy');
  bg.connect(pSave);
  pSave._msg({op: 'save', key: TEST_KEY, model: 'gemini-2.5-flash', sessionOnly: false});
  await wait(() => pSave.sent.length);
  assert.equal(pSave.sent[0].ok, true);
  assert.equal(pSave.sent[0].hasKey, true);
  assert.equal(JSON.stringify(pSave.sent[0]).includes(TEST_KEY), false, '응답에 키 원문 미노출');
  assert.equal(bg.local._map.get('aiKeyCfg').key, TEST_KEY);

  // 3) status 조회: 키 원문 절대 반환 안 함
  const pSt = fakePort('https://gw.bwyf.or.kr', 'ai-proxy');
  bg.connect(pSt);
  pSt._msg({op: 'status'});
  await wait(() => pSt.sent.length);
  assert.deepEqual({...pSt.sent[0]}, {type: 'result', ok: true, hasKey: true, model: 'gemini-2.5-flash', sessionOnly: false});

  // 4) SSRF 경로 차단
  for (const badPath of ['../secret', 'https://evil.example/x', 'models/foo:delete', 'files/123']) {
    const pBad = fakePort('https://gw.bwyf.or.kr', 'ai-proxy');
    bg.connect(pBad);
    pBad._msg({op: 'request', path: badPath});
    await wait(() => pBad.sent.length);
    assert.equal(pBad.sent[0].ok, false);
    assert.equal(pBad.sent[0].error, 'bad-path');
  }
  assert.equal(bg.calls.length, 0);

  // 5) 정상 요청: SW가 저장된 키를 헤더에 주입하여 Gemini API 호출
  const pReq = fakePort('https://gw.bwyf.or.kr', 'ai-proxy');
  bg.connect(pReq);
  pReq._msg({op: 'request', path: 'models/gemini-2.5-flash:generateContent', body: {contents: []}});
  await wait(() => pReq.sent.length);
  assert.equal(pReq.sent[0].ok, true);
  assert.equal(bg.calls.length, 1);
  assert.equal(bg.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(bg.calls[0].init.headers['x-goog-api-key'], TEST_KEY);

  // 6) sessionOnly 저장 시 local 키 제거
  const pSess = fakePort('https://gw.bwyf.or.kr', 'ai-proxy');
  bg.connect(pSess);
  pSess._msg({op: 'save', key: TEST_KEY, model: 'gemini-2.5-flash', sessionOnly: true});
  await wait(() => pSess.sent.length);
  assert.equal(bg.local._map.has('aiKeyCfg'), false);
  assert.equal(bg.session._map.get('aiKeyCfg').sessionOnly, true);

  // 7) clear 시 양쪽 저장소 모두 삭제
  const pClr = fakePort('https://gw.bwyf.or.kr', 'ai-proxy');
  bg.connect(pClr);
  pClr._msg({op: 'clear'});
  await wait(() => pClr.sent.length);
  assert.equal(bg.local._map.has('aiKeyCfg'), false);
  assert.equal(bg.session._map.has('aiKeyCfg'), false);
});

test('P2-2 background ai-proxy: SSE 스트리밍 청크를 순차 전달한다', async () => {
  const chunks = [
    new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"안녕"}]}}]}\n\n'),
    new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"하세요"}]}}]}\n\n'),
  ];
  let idx = 0;
  const bg = await loadBgForAi(async () => ({
    ok: true, status: 200,
    body: {getReader: () => ({read: async () => idx < chunks.length ? {done: false, value: chunks[idx++]} : {done: true}})},
  }));
  const pSave = fakePort('https://gw.bwyf.or.kr', 'ai-proxy');
  bg.connect(pSave); pSave._msg({op: 'save', key: TEST_KEY, model: 'gemini-2.5-flash', sessionOnly: false});
  await wait(() => pSave.sent.length);

  const pStream = fakePort('https://gw.bwyf.or.kr', 'ai-proxy');
  bg.connect(pStream);
  pStream._msg({op: 'request', path: 'models/gemini-2.5-flash:streamGenerateContent?alt=sse', body: {contents: []}, stream: true});
  await wait(() => pStream.sent.some(m => m.type === 'result'));
  assert.deepEqual(pStream.sent.filter(m => m.type === 'chunk').map(m => m.text), ['안녕', '하세요']);
  assert.equal(pStream.sent.at(-1).ok, true);
  assert.equal(pStream.sent.at(-1).streamed, true);
});

test('P2-2 bridge: data-bwyfgw-ai 마커 설정, ai-proxy 중계 및 abort 포트 종료', async () => {
  const posted = [], handlers = [], attrs = {}, ports = [];
  const win = {top: null, addEventListener: (t, f) => { if (t === 'message') handlers.push(f); }, postMessage: (m, o) => posted.push([m, o])};
  win.top = win;
  const ctx = vm.createContext({
    window: win,
    document: {documentElement: {setAttribute: (k, v) => { attrs[k] = v; }}},
    location: {origin: 'https://gw.bwyf.or.kr'},
    chrome: {runtime: {connect: opts => { const p = fakePort('x', opts.name); ports.push(p); return p; }}},
    Object, Array, String,
  });
  vm.runInContext(await read('bridge.js'), ctx, {filename: 'bridge.js'});
  assert.equal(attrs['data-bwyfgw-ai'], '1');

  const send = data => handlers[0]({source: win, origin: 'https://gw.bwyf.or.kr', data});
  send({bwyfgw: 'ai-proxy', id: 'r1', op: 'bad-op'});
  assert.equal(ports.length, 0, '허용되지 않은 op 차단');

  send({bwyfgw: 'ai-proxy', id: 'r2', op: 'request', path: 'models/gemini-2.5-flash:generateContent', body: {a: 1}});
  assert.equal(ports.length, 1);
  assert.equal(ports[0].name, 'ai-proxy');
  ports[0]._msg({type: 'chunk', text: '조각'});
  ports[0]._msg({type: 'result', ok: true, streamed: true});
  assert.deepEqual(posted.map(([m]) => [m.bwyfgw, m.id, m.type]), [['ai-reply', 'r2', 'chunk'], ['ai-reply', 'r2', 'result']]);

  let aborted = false;
  send({bwyfgw: 'ai-proxy', id: 'r3', op: 'request', path: 'models/gemini-2.5-flash:generateContent', body: {}});
  ports[1].disconnect = () => { aborted = true; };
  send({bwyfgw: 'ai-proxy', id: 'r3', op: 'abort'});
  assert.equal(aborted, true, 'abort 메시지가 활성 포트를 즉시 disconnect');
});
