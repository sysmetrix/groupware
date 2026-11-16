import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFile(path.join(root, 'src', 'live', 'ext', f), 'utf8');
const listeners = () => { const a = []; return {add: fn => a.push(fn), fire: (...x) => a.forEach(f => f(...x)), list: a}; };

function fakePort(origin, name = 'gcal-read') {
  const onMsg = listeners(), onDis = listeners(), sent = [];
  return {name, sender: {origin}, sent, onMessage: {addListener: onMsg.add}, onDisconnect: {addListener: onDis.add},
    postMessage: m => sent.push(m), disconnect() { onDis.fire(); }, _msg: m => onMsg.fire(m), _dis: () => onDis.fire()};
}

async function loadBackground(dayTexts) {
  const onConnect = listeners(), onUpdated = listeners(), created = [], removed = [], visited = [];
  let tabSeq = 0;
  const chrome = {
    runtime: {onConnect: {addListener: onConnect.add}},
    tabs: {
      onUpdated: {addListener: onUpdated.add, removeListener: fn => { const i = onUpdated.list.indexOf(fn); if (i >= 0) onUpdated.list.splice(i, 1); }},
      create: async o => { const t = {id: ++tabSeq, url: o.url, active: o.active}; created.push(t); return t; },
      update: async (id, o) => { visited.push(o.url); const t = created.find(x => x.id === id); t.url = o.url; setTimeout(() => onUpdated.fire(id, {status: 'complete'}), 0); },
      remove: async id => { removed.push(id); },
    },
    scripting: {executeScript: async ({target}) => {
      const t = created.find(x => x.id === target.tabId);
      const m = t.url.match(/day\/(\d+)\/(\d+)\/(\d+)/);
      const ymd = m ? m[1] + String(m[2]).padStart(2, '0') + String(m[3]).padStart(2, '0') : '';
      const spec = dayTexts[ymd];
      if (spec === 'login') return [{result: {texts: [], host: 'accounts.google.com', main: true}}];
      return [{result: {texts: spec || [], host: 'calendar.google.com', href: t.url, main: true}}];
    }},
  };
  const ctx = vm.createContext({chrome, setTimeout, clearTimeout, Date, JSON, Promise, Array, Set, Object, Error, URL, RegExp, String});
  vm.runInContext(await read('background.js'), ctx, {filename: 'background.js'});
  return {connect: p => onConnect.fire(p), created, removed, visited};
}
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise(r => setTimeout(r, 20)); } };

test('background: reads the requested day views in hidden tabs and closes them', async () => {
  const ev = '09:00~15:00, 관내출장(5), 캘린더: 5 BWYF 근태, 위치 없음, 2026년 11월 17일';
  const bg = await loadBackground({20261117: [ev], 20261119: [ev, 'x']});
  const port = fakePort('https://gw.bwyf.or.kr');
  bg.connect(port);
  port._msg({dates: ['20261119', '20261117', '20261117']});
  await until(() => port.sent.some(m => m.type === 'result'));
  const res = port.sent.find(m => m.type === 'result');
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(res.days).sort(), ['20261117', '20261119']);
  assert.deepEqual(res.days['20261117'], [ev]);
  assert.ok(bg.created.every(t => t.active === false), 'tabs open in the background');
  assert.deepEqual(bg.removed.sort(), bg.created.map(t => t.id).sort(), 'every opened tab is closed');
  assert.ok(bg.visited.every(u => /^https:\/\/calendar\.google\.com\/calendar\/u\/0\/r\/day\/\d{4}\/\d+\/\d+\?pli=1$/.test(u)), 'only calendar day views');
  assert.ok(port.sent.some(m => m.type === 'progress' && m.total === 2));
});

test('background: rejects other origins, bad dates, too many dates; reports login', async () => {
  const bg = await loadBackground({20261117: 'login'});
  const foreign = fakePort('https://evil.example');
  let disconnected = false; foreign.disconnect = () => { disconnected = true; };
  bg.connect(foreign); assert.equal(disconnected, true);
  for (const dates of [[], ['2026-11-17'], ['20261317'], ['20190101'], Array.from({length: 61}, (_, i) => `2026${String(1 + Math.floor(i / 28)).padStart(2, '0')}${String(1 + i % 28).padStart(2, '0')}`)]) {
    const p = fakePort('https://gw.bwyf.or.kr'); bg.connect(p); p._msg({dates});
    await until(() => p.sent.length);
    assert.deepEqual([p.sent[0].ok, p.sent[0].error], [false, 'bad-dates'], JSON.stringify(dates).slice(0, 40));
  }
  assert.equal(bg.created.length, 0, 'no tab opened for rejected requests');
  const p = fakePort('https://gw.bwyf.or.kr'); bg.connect(p); p._msg({dates: ['20261117']});
  await until(() => p.sent.some(m => m.type === 'result'));
  assert.deepEqual([p.sent.at(-1).ok, p.sent.at(-1).error], [false, 'login']);
  assert.equal(bg.removed.length, bg.created.length);
});

test('bridge: marks the page, relays only well-formed requests and replies to the same id', async () => {
  const posted = [], handlers = [], attrs = {};
  const port = fakePort('x');
  const win = {top: null, addEventListener: (t, f) => { if (t === 'message') handlers.push(f); }, postMessage: (m, o) => posted.push([m, o])};
  win.top = win;
  const ctx = vm.createContext({window: win, document: {documentElement: {setAttribute: (k, v) => { attrs[k] = v; }}}, location: {origin: 'https://gw.bwyf.or.kr'}, chrome: {runtime: {connect: () => port}}, Object, Array});
  vm.runInContext(await read('bridge.js'), ctx, {filename: 'bridge.js'});
  assert.equal(attrs['data-bwyfgw-gcal'], '1');
  const send = (data, o = {}) => handlers[0]({source: win, origin: 'https://gw.bwyf.or.kr', data, ...o});
  send({bwyfgw: 'gcal-read', id: 'a', dates: 'nope'}); send({bwyfgw: 'other', id: 'a', dates: []}); send({bwyfgw: 'gcal-read', id: 'a', dates: []}, {origin: 'https://evil.example'}); send({bwyfgw: 'gcal-read', id: 'a', dates: []}, {source: {}});
  assert.equal(port.sent.length, 0, 'ignored: wrong shape, wrong type, foreign origin, foreign source');
  send({bwyfgw: 'gcal-read', id: 'req1', dates: ['20261117', '<script>', 5]});
  assert.equal(JSON.stringify(port.sent[0]), JSON.stringify({dates: ['20261117'], careful: false}));
  port._msg({type: 'progress', done: 1, total: 2}); port._msg({type: 'result', ok: true, days: {20261117: []}});
  assert.deepEqual(posted.map(([m, o]) => [m.bwyfgw, m.id, m.type, o]), [['gcal-reply', 'req1', 'progress', 'https://gw.bwyf.or.kr'], ['gcal-reply', 'req1', 'result', 'https://gw.bwyf.or.kr']]);
});
