import test from 'node:test';
import assert from 'node:assert/strict';
import {stripNonCode, analyze} from '../scripts/lib/wc-analyze.mjs';
import {MARK, parseResults, classify, verdict, validKnown, testEnv} from '../scripts/lib/test-results.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

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

// ---------- test result parsing and failure quarantine ----------
const line = o => MARK + JSON.stringify({ok: false, nesting: 0, suite: false, failureType: 'testCodeFailure', error: '', file: 'test/a.test.mjs', ...o});
const pdfKnown = {name: 'real upload', file: 'test/library-http.test.mjs', signature: "jbig2dec_binary' is a field", reason: 'env', since: '2026-11-09'};

test('parseResults reads reporter lines, ignores noise and parent "subtest failed" echoes', () => {
  const out = ['noise', MARK + JSON.stringify({ok: true, name: 'p', file: 'test/a.test.mjs', nesting: 0}),
    line({name: 'child', nesting: 1}), line({name: 'parent', failureType: 'subtestsFailed', error: '1 subtest failed'}),
    MARK + '{broken json', line({name: 'suite', suite: true, failureType: 'subtestsFailed'})].join('\n');
  const r = parseResults(out);
  assert.equal(r.passed, 1);
  assert.deepEqual(r.failures.map(f => f.name), ['child']);
});

test('quarantine needs exact name, file and error signature; name-only entries are ignored', () => {
  const env = {name: 'real upload', file: 'test/library-http.test.mjs', error: "TypeError: 'jbig2dec_binary' is a field but has no type annotation"};
  assert.equal(classify([env], [pdfKnown]).quarantined.length, 1);
  // Same test, different reason -> real failure.
  assert.equal(classify([{...env, error: 'AssertionError: 500 !== 200'}], [pdfKnown]).unexpected.length, 1);
  // Name containing the known name (old substring matching) -> real failure.
  assert.equal(classify([{...env, name: 'real upload and more'}], [pdfKnown]).unexpected.length, 1);
  // Same name in another file -> real failure.
  assert.equal(classify([{...env, file: 'test/other.test.mjs'}], [pdfKnown]).unexpected.length, 1);
  // Old name-only entry cannot quarantine anything.
  const nameOnly = {name: 'real upload', reason: 'env'};
  const c = classify([env], [nameOnly]);
  assert.equal(c.unexpected.length, 1);
  assert.equal(c.invalid.length, 1);
  assert.equal(validKnown([{...pdfKnown, signature: '('}]).valid.length, 0, 'bad regex is rejected');
  assert.deepEqual(classify([], [pdfKnown]).stale.map(k => k.name), ['real upload'], 'unused entries are reported');
});

test('verdict: unrelated failure always fails, even next to a quarantined one; empty or unparsed runs fail', () => {
  const quarantinedOnly = {status: 1, stdout: line({name: 'real upload', file: 'test/library-http.test.mjs', error: "'jbig2dec_binary' is a field"}), stderr: ''};
  assert.deepEqual(verdict(quarantinedOnly, [pdfKnown]).fails, []);
  assert.equal(verdict(quarantinedOnly, [pdfKnown]).quarantined, 1);
  const both = {...quarantinedOnly, stdout: quarantinedOnly.stdout + '\n' + line({name: 'something else', error: 'boom'})};
  const v = verdict(both, [pdfKnown]);
  assert.equal(v.fails.length, 1);
  assert.match(v.fails[0], /something else/);
  assert.equal(verdict({status: 1, stdout: '', stderr: 'SyntaxError: x'}, []).fails.length >= 1, true, 'crash without results fails');
  assert.ok(verdict({status: 0, stdout: '', stderr: ''}, []).fails.includes('실행된 테스트가 없음'));
  assert.ok(verdict({error: new Error('spawn ENOENT'), stdout: '', stderr: ''}, []).fails[0].includes('spawn ENOENT'));
});

test('harness-known.json has no name-only quarantine entries', async () => {
  const known = JSON.parse(await fs.readFile(new URL('../scripts/harness-known.json', import.meta.url), 'utf8')).tests;
  assert.equal(validKnown(known).invalid.length, 0);
});

test('testEnv drops host PYTHONHOME (any case) for test children and keeps everything else', () => {
  const env = testEnv({PYTHONHOME: 'x', PythonHome: 'y', PATH: 'p', ATTACHMENT_PYTHON: 'a', VIRTUAL_ENV: 'v'});
  assert.deepEqual(Object.keys(env).sort(), ['ATTACHMENT_PYTHON', 'PATH', 'VIRTUAL_ENV']);
});

test('real node --test run through the reporter is parsed and judged correctly', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-harness-reporter-'));
  try {
    const file = path.join(dir, 'sample.test.mjs');
    await fs.writeFile(file, [
      "import test from 'node:test';", "import assert from 'node:assert/strict';",
      "test('passes', () => {});",
      "test('env flaky', () => { throw new Error('ENV-SIGNATURE-123'); });",
      "test('parent', async t => { await t.test('child breaks', () => { assert.equal(1, 2); }); });",
    ].join('\n'));
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=./scripts/lib/test-results.mjs', '--test-reporter-destination=stdout', file], {cwd: root, encoding: 'utf8', env: Object.fromEntries(Object.entries(testEnv()).filter(([k]) => k !== 'NODE_TEST_CONTEXT'))}); // own runner, not a child of this one
    const r = parseResults(run.stdout);
    assert.equal(r.passed, 1);
    assert.deepEqual(r.failures.map(f => f.name).sort(), ['child breaks', 'env flaky']);
    const sampleFile = r.failures[0].file;
    const known = [{name: 'env flaky', file: sampleFile, signature: 'ENV-SIGNATURE-\\d+', reason: 'test', since: '2026-11-10'}];
    const v = verdict(run, known);
    assert.equal(v.quarantined, 1);
    assert.equal(v.fails.length, 1, JSON.stringify(v.fails));
    assert.match(v.fails[0], /child breaks/);
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});
