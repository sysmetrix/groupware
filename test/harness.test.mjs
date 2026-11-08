import test from 'node:test';
import assert from 'node:assert/strict';
import {stripNonCode, analyze} from '../scripts/lib/wc-analyze.mjs';

const model = (wc, extra = {}) => ({
  parts: [{file: '01-a.js', raw: wc, code: stripNonCode(wc)}, ...(extra.parts || [])],
  workcenter: 'function boot(){}', collector: 'window.BWYFGW = Object.freeze({ version: V, collect, links: L });',
  briefing: 'export function known() {}\nexport const alsoKnown = 1;',
});

test('stripNonCode blanks strings, comments and regex but keeps template expressions', () => {
  const out = stripNonCode("const a = 'foo(bar)'; // baz(1)\nconst b = `x ${qux(2)} y`; const r = /abc(d)/g;");
  assert.ok(!out.includes('foo(') && !out.includes('baz(') && !out.includes('abc('));
  assert.ok(out.includes('qux(2)'));
});

test('analyzer finds undefined calls and bad R./GW. contracts, and ignores declared names', () => {
  const wc = "  function ok() { return helper(1); }\n  const helper = x => x;\n  function bad() { return ghost(); }\n  function c() { return R.known() + R.missing() + GW.collect() + GW.nope(); }\n";
  const r = analyze(model(wc));
  assert.deepEqual(r.undef.map(x => x.name), ['ghost']);
  assert.deepEqual(r.badR.map(x => x.name), ['missing']);
  assert.deepEqual(r.badGW.map(x => x.name), ['nope']);
});

test('analyzer links data-act to handlers and reports orphans', () => {
  const tpl = "  function v() { return `<button data-act=\"go\">a</button><button data-act=\"lost\">b</button>`; }\n";
  const ev = "  function go() {}\n  function on(el) {\n    switch (el.dataset.act) {\n    case 'go': go(); break;\n    case 'orphan': go(); break;\n    }\n  }\n";
  const r = analyze({...model(tpl), parts: [{file: '01-a.js', raw: tpl, code: stripNonCode(tpl)}, {file: '16-events.js', raw: ev, code: stripNonCode(ev)}]});
  assert.deepEqual(r.actsNoHandler, ['lost']);
  assert.ok(r.handlersNoTrigger.includes('orphan'));
  assert.deepEqual(r.cases.find(c => c.act === 'go').calls, ['go']);
});
