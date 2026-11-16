import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const data = readFileSync(new URL('../src/live/wc/03-data.js', import.meta.url), 'utf8');
const dataCode = data.slice(data.indexOf('  async function refresh('), data.indexOf('  // ----- 내 일'));
const events = readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8');

test('silent busy refresh keeps the visible ledger until pending refresh is applied', async () => {
  const ledger = {bgtCd: 'A1', rows: [{desc: 'visible'}]};
  const S = {loading: false, error: '', settings: {budget: [], mailCount: 1, days: 1, roles: {}}, budget: {generation: 2, seq: 4, mreq: 5, allReq: 6, ledger}, apEpoch: 0, apMore: {}, apPages: {}, apBusy: {}, snooze: {}, hidden: {}, plan: {}, todos: [], history: [], newKeys: new Set(), activity: []};
  const raw = {collectedAt: '2026-11-15T00:00:00.000Z', sessionExpired: false, status: {}};
  const ctx = {S, currentKey: '', getUserKey: () => '', isUserBusy: () => true, root: {activeElement: {tagName: 'INPUT', id: 'ledgerQuery'}}, GW: {collect: async () => raw}, R: {analyze: () => ({actions: [], summary: {high: 0, approvalAction: 0, mailUnread: 0}, status: []}), nextState: () => ({})}, store: {get: () => null, set: () => true}, switchUserStorage: () => false, syncLocal() {}, applyUrgentWords() {}, today: () => '2026-11-15', saveLocal() {}, notifyNew() {}, renderHead() {}, renderBand() {}, renderNav() {}, render() {}, loadForms() {}, toast() {}, mineVisible: () => [], logError() {}, Date, Object, Set};
  vm.createContext(ctx); vm.runInContext(dataCode + '\nthis.refresh = refresh; this.apply = applyDeferredBudgetInvalidation;', ctx);
  await ctx.refresh({silent: true});
  assert.equal(S.budget.ledger, ledger);
  assert.equal(S.budget.refreshInvalidationPending, true);
  assert.equal(S.pendingRefresh, true);
  ctx.apply();
  assert.equal(S.budget.ledger, null);
  assert.equal(S.budget.refreshInvalidationPending, false);
  assert.equal(S.budget.seq, 5);
});

test('refresh discards old-account response when the live account changes during collection', async () => {
  let resolve, live = 'A'; const pending = new Promise(r => { resolve = r; }); let stored = 0;
  const S = {loading:false, error:'', settings:{budget:[],mailCount:1,days:1}, raw:{principal:{empSeq:'A'}}, a:{}, budget:{}};
  const states = [];
  const ctx = {S, getUserKey:()=>live, GW:{collect:()=>pending}, render(){states.push({loading:S.loading,error:S.error});}, renderHead(){}, toast(){}, logError(){}, isUserBusy:()=>false, Date, Object, Set, store:{set(){stored++;}}};
  vm.createContext(ctx); vm.runInContext(dataCode + '\nthis.refresh = refresh;', ctx);
  const running = ctx.refresh({silent:true}); live = 'B'; resolve({principal:{empSeq:'A'}}); await running;
  assert.equal(S.raw,null); assert.equal(S.a,null); assert.equal(stored,0); assert.match(S.error,/계정이 변경/); assert.equal(S.loading,false); assert.equal(states.at(-1).loading,false); assert.match(states.at(-1).error,/계정이 변경/);
});

test('stale ledger-row click is ignored instead of dereferencing a cleared ledger', async () => {
  const listeners = {};
  const split = {addEventListener() {}};
  const toasts = [];
  const S = {menuOpen: '', paletteOpen: false, helpOpen: false, coach: false, budget: {ledger: null}, pane: {}};
  const ctx = {root: {addEventListener(type, fn) { listeners[type] = fn; }, querySelector() { return null; }, querySelectorAll() { return []; }}, S, AUTO: {running: false}, $: selector => selector === '#split' ? split : null, HOME_ACTS: {}, toast: msg => toasts.push(msg), document: {addEventListener() {}, removeEventListener() {}}, window: {innerWidth: 1200}, setTimeout, clearTimeout};
  vm.createContext(ctx); vm.runInContext(events, ctx); ctx.toast = msg => toasts.push(msg);
  const button = {dataset: {act: 'ledgerRow', i: '0'}, tagName: 'BUTTON', getAttribute: () => null};
  await listeners.click({composedPath: () => [button], preventDefault() {}, stopPropagation() {}});
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /결의 내역이 새로 고쳐졌습니다/);
});
