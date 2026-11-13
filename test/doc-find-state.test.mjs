import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as R from '../src/live/doc-find.mjs';

const source = readFileSync(new URL('../src/live/wc/35-docs.js', import.meta.url), 'utf8');
function setup(responses) {
  const values = new Map();
  const ctx = {
    S: {view: 'docs', raw: {principal: {deptName: '시험부서'}}}, R,
    GW: {search: async () => { const value = responses.shift(); if (value instanceof Error) throw value; return value; }},
    store: {get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value)},
    periodFrom: () => '', renderMain: () => {}, go: () => {}, toast: () => {},
    esc: s => String(s), hl: s => String(s), ic: () => '', pgh: (title, sub, action) => `<header>${sub}${action || ''}</header>`,
  };
  vm.createContext(ctx);
  vm.runInContext(`${source}\nthis.api = {dfRun, dfState, vDocs};`, ctx);
  return ctx.api;
}
const result = (items, total = items.length) => ({groups: {doc: {items, total}}});
const doc = {docId: '1', title: '기존 문서', dept: '시험부서'};

test('failed new search clears old header and save action, then retry succeeds', async () => {
  const api = setup([result([doc]), new Error('검색 실패'), result([])]);
  await api.dfRun('이전');
  assert.match(api.vDocs(), /“이전” 1건/);
  await api.dfRun('새로운');
  const st = api.dfState();
  assert.equal(st.searched, '');
  assert.equal(st.done, false);
  assert.equal(st.widened, false);
  assert.equal(st.err, '검색 실패');
  assert.doesNotMatch(api.vDocs(), /“이전”|data-act="dfSave"|data-act="dfUnsave"/);
  assert.match(api.vDocs(), /검색 실패/);
  await api.dfRun(st.kw);
  assert.equal(st.searched, '새로운');
  assert.equal(st.done, true);
  assert.match(api.vDocs(), /“새로운” 0건/);
});

test('failed load more preserves the successful search and its results', async () => {
  const api = setup([result([doc], 2), {groups: {doc: {error: true, message: '추가 실패'}}}]);
  await api.dfRun('이전');
  await api.dfRun('이전', true);
  const st = api.dfState();
  assert.equal(st.searched, '이전');
  assert.equal(st.items.length, 1);
  assert.equal(st.total, 2);
  assert.equal(st.page, 1);
  assert.equal(st.done, false);
  assert.equal(st.err, '추가 실패');
  assert.match(api.vDocs(), /“이전” 2건/);
});
