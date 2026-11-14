import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as chat from '../src/live/chat.mjs';
import {kstNow} from '../src/live/briefing.mjs';

const source = readFileSync(new URL('../src/live/wc/37-automation.js', import.meta.url), 'utf8');
const copy = x => structuredClone(x);
function world() {
  const data = new Map(), locks = new Set(), calls = [], logs = [];
  let clock = Date.parse('2026-11-15T23:59:00Z'); // 월요일 08:59 KST
  const rule = {id: 'one', name: '메일', prompt: '안 읽은 메일 보여줘', time: '09:00', days: [1], on: true, last: '', lastAt: 0};
  data.set('A', [rule]);
  const lockApi = {async request(key, opt, fn) { if (locks.has(key)) return fn(null); locks.add(key); try { return await fn({}); } finally { locks.delete(key); } }};
  function tab() {
    let owner = 'A', session = 'A', failSave = false, send = null, refreshFn = null;
    const st = {busy: false, msgs: []};
    class Clock extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } }
    const S = {a: {}, raw: {}, loading: false, error: '', lastRefresh: new Date(clock), view: 'none'};
    const c = {Date: Clock, S, R: {...chat, kstNow}, HOME_ACTS: {}, CHAT_TOOLS: new Map([['list_mail',{kind:'read'}]]), CHAT_AUTO_BLOCK: new Set(),
      navigator: {locks: lockApi}, getUserKey: () => session, chatState: () => st,
      store: {get: () => copy(data.get(owner) || []), set: (_, v) => {if (failSave) return false; data.set(owner, copy(v)); return true;}},
      chatSend: (...args) => { calls.push([owner, ...args]); return send ? send(st) : (st.busy = true, Promise.resolve().then(() => {st.busy = false;})); },
      refresh: () => refreshFn ? refreshFn() : Promise.resolve(), logError: (...a) => logs.push(a), toast() {},
      setInterval: fn => (c.tick = fn, 1), setTimeout: fn => (c.start = fn, 2), chatRegisterTool() {}, esc: String, ic: () => '',
    };
    Object.defineProperty(c, 'currentKey', {get: () => owner, set: v => owner = v});
    vm.runInNewContext(source + '\nthis.run = autoRun; this.list = autoList;', c);
    return {c, st, S, setOwner(v) {owner = v;}, setSession(v) {session = v;}, setSend(v) {send = v;}, setRefresh(v) {refreshFn = v;}, fail(v) {failSave = v;}};
  }
  return {tab, data, calls, logs, setTime(t) {clock = Date.parse(t);}, advance(ms) {clock += ms;}};
}
const flush = () => new Promise(r => setImmediate(r));

test('지정된 KST 시각 전에는 실행하지 않고 정각에 한 번 실행하며 재시작 후에도 중복되지 않는다', async () => {
  const w = world(), t = w.tab(); t.c.start(); await flush(); assert.equal(w.calls.length, 0);
  w.setTime('2026-11-16T00:00:00Z'); t.c.tick(); await flush(); assert.equal(w.calls.length, 1);
  assert.equal(w.data.get('A')[0].last, '2026-11-16'); t.c.tick(); w.tab().c.start(); await flush(); assert.equal(w.calls.length, 1);
});
test('탭 동시 실행은 계정 잠금으로 한 번만 실행한다', async () => {
  const w = world(); w.setTime('2026-11-16T00:00:00Z'); const a = w.tab(), b = w.tab();
  let done; a.setSend(st => {st.busy = true; return new Promise(r => {done = () => {st.busy = false; r();};});});
  a.c.tick(); b.c.tick(); await flush(); assert.equal(w.calls.length, 1); done(); await flush(); b.c.tick(); await flush(); assert.equal(w.calls.length, 1);
});
test('저장 실패와 시작 실패는 완료로 기록하지 않고 재시도하며 다른 규칙을 막지 않는다', async () => {
  const w = world(); w.setTime('2026-11-16T00:00:00Z'); const t = w.tab();
  t.fail(true); t.c.tick(); await flush(); assert.equal(w.calls.length, 0); assert.equal(w.data.get('A')[0].last, '');
  t.fail(false); w.advance(60000); t.setSend(() => Promise.resolve()); t.c.tick(); await flush(); assert.equal(w.data.get('A')[0].last, '');
  t.setSend(null); w.advance(60000); t.c.tick(); await flush(); assert.equal(w.data.get('A')[0].last, '2026-11-16');
});
test('새로 고치는 중 계정이 전환되거나 규칙이 꺼지면 이전 규칙을 실행하지 않는다', async () => {
  for (const change of ['account', 'off']) {
    const w = world(); w.setTime('2026-11-16T00:00:00Z'); const t = w.tab(); t.S.lastRefresh = new Date(0);
    let resume; t.setRefresh(() => new Promise(r => {resume = r;})); t.c.tick(); await flush();
    if (change === 'account') {t.setOwner('B'); t.setSession('B');} else {const rules = w.data.get('A'); rules[0].on = false;}
    resume(); await flush(); assert.equal(w.calls.length, 0); assert.equal(w.data.get('A')[0].last, '');
  }
});
test('시작 후 불확실한 실패는 중복 방지를 위해 재시작 후 자동 재실행하지 않는다', async () => {
  const w = world(); w.setTime('2026-11-16T00:00:00Z'); const t = w.tab();
  t.setSend(st => {st.busy = true; return Promise.reject(new Error('failure'));}); t.c.tick(); await flush();
  w.tab().c.start(); await flush(); assert.equal(w.calls.length, 1); assert.equal(w.data.get('A')[0].last, '2026-11-16');
});

test('정각이 지난 뒤 재시작하면 오늘 일정은 한 번 보충 실행한다', async () => {
  const w = world(); w.setTime('2026-11-16T02:00:00Z'); w.tab().c.start(); await flush();
  assert.equal(w.calls.length, 1); assert.equal(w.data.get('A')[0].last, '2026-11-16');
});
test('시작 실패한 규칙의 대기 시간 중 다음 규칙을 실행한다', async () => {
  const w = world(); w.setTime('2026-11-16T00:00:00Z');
  w.data.get('A').push({...w.data.get('A')[0], id: 'two', name: '둘째'});
  const t = w.tab(); let first = true;
  t.setSend(st => {if (first) {first = false; return Promise.resolve();} st.busy = true; return Promise.resolve().then(() => {st.busy = false;});});
  t.c.tick(); await flush(); t.c.tick(); await flush();
  assert.equal(w.calls.length, 2); assert.equal(w.data.get('A')[0].last, ''); assert.equal(w.data.get('A')[1].last, '2026-11-16');
});
test('세션 계정이 이미 달라졌거나 잠금 기능이 없으면 실행하지 않는다', async () => {
  const w = world(); w.setTime('2026-11-16T00:00:00Z');
  const a = w.tab(); a.setSession('B'); a.c.tick(); await flush();
  const b = w.tab(); b.c.navigator.locks = undefined; b.c.tick(); await flush(); assert.equal(w.calls.length, 0);
});
