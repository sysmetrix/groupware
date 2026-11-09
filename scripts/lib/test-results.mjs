// node --test results for the harness, without scraping human-readable output.
//  - default export: a node:test custom reporter that prints one JSON line per finished test (prefixed with MARK).
//    Use it with: node --test --test-reporter=./scripts/lib/test-results.mjs --test-reporter-destination=stdout ...
//  - parseResults(): reads those lines back.
//  - classify(): decides which failures are quarantined. A quarantine entry must match the exact test name,
//    the exact test file and an error signature, so an unrelated failure (or the same test failing for a
//    different reason) always fails the harness.
//  - testEnv(): environment for test child processes without host interpreter overrides (see FOREIGN_ENV).
import path from 'node:path';

export const MARK = '@@gw-test@@ ';

// Variables a host application (e.g. an AI browser that ships its own Python) may export into the shell.
// PYTHONHOME makes the project's own interpreter (.venv-attachments) load a different standard library,
// which breaks pypdf and friends with errors unrelated to this code.
export const FOREIGN_ENV = ['PYTHONHOME'];

export function testEnv(env = process.env) {
  const drop = new Set(FOREIGN_ENV.map(k => k.toUpperCase()));
  return Object.fromEntries(Object.entries(env).filter(([k]) => !drop.has(k.toUpperCase())));
}

const relFile = file => {
  if (!file) return '';
  let f = String(file);
  if (f.startsWith('file:')) { try { f = new URL(f).pathname.replace(/^\/([A-Za-z]:)/, '$1'); f = decodeURIComponent(f); } catch {} }
  const rel = path.isAbsolute(f) ? path.relative(process.cwd(), f) : f;
  return rel.split(path.sep).join('/');
};

function errorText(err, depth = 0) {
  if (!err || depth > 3) return '';
  if (typeof err !== 'object') return String(err);
  // Codes and messages only: stack frames carry file paths that a signature could match by accident.
  const own = [err.code, err.message || (!err.cause && err.stack)].filter(Boolean).join('\n');
  return [own, errorText(err.cause, depth + 1)].filter(Boolean).join('\n');
}

export default async function* reporter(source) {
  for await (const ev of source) {
    if (ev.type !== 'test:pass' && ev.type !== 'test:fail') continue;
    const d = ev.data || {}, det = d.details || {}, err = det.error;
    if (det.type === 'suite' && ev.type === 'test:pass') continue;
    yield MARK + JSON.stringify({
      ok: ev.type === 'test:pass', name: d.name, file: relFile(d.file), nesting: d.nesting || 0,
      suite: det.type === 'suite', skip: !!d.skip, todo: !!d.todo,
      failureType: err && (err.failureType || (err.cause && err.cause.failureType)) || '',
      error: ev.type === 'test:fail' ? errorText(err).slice(0, 4000) : '',
    }) + '\n';
  }
}

/** Reads reporter lines out of mixed stdout. */
export function parseResults(text) {
  const tests = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.startsWith(MARK)) continue;
    try { tests.push(JSON.parse(line.slice(MARK.length))); } catch {}
  }
  const failed = tests.filter(t => !t.ok && !t.todo);
  // A parent that failed only because a subtest failed is not a separate failure.
  const failures = failed.filter(t => !(t.failureType === 'subtestsFailed' && failed.some(c => c.file === t.file && c.nesting > t.nesting)));
  return {tests, passed: tests.filter(t => t.ok && !t.suite).length, failures};
}

/** Validates quarantine entries. Name-only entries are rejected so they cannot hide other failures. */
export function validKnown(entries) {
  const valid = [], invalid = [];
  for (const k of Array.isArray(entries) ? entries : []) {
    let re = null;
    try { re = k && typeof k.signature === 'string' && k.signature ? new RegExp(k.signature) : null; } catch {}
    if (k && typeof k.name === 'string' && k.name && typeof k.file === 'string' && k.file && re && k.reason) valid.push({...k, re});
    else invalid.push(k);
  }
  return {valid, invalid};
}

/** Splits failures into unexpected and quarantined; reports quarantine entries that no longer match anything. */
export function classify(failures, entries) {
  const {valid, invalid} = validKnown(entries);
  const used = new Set();
  const unexpected = [], quarantined = [];
  for (const f of failures) {
    const k = valid.find(k => k.name === f.name && k.file === f.file && k.re.test(f.error || ''));
    if (k) { quarantined.push({...f, reason: k.reason}); used.add(k); } else unexpected.push(f);
  }
  return {unexpected, quarantined, stale: valid.filter(k => !used.has(k)).map(({re, ...k}) => k), invalid};
}

/**
 * Harness verdict for one node --test run. `run` is a spawnSync result.
 * Fails on: any unexpected failure, a non-zero exit with nothing parsed, no tests at all, or a spawn error.
 */
export function verdict(run, entries) {
  const out = String(run.stdout || '');
  const {tests, passed, failures} = parseResults(out);
  const {unexpected, quarantined, stale, invalid} = classify(failures, entries);
  const fails = [], warns = [];
  const firstLine = s => String(s || '').split('\n').map(l => l.trim()).find(Boolean) || '';
  if (run.error) fails.push(`테스트 실행 실패: ${run.error.message}`);
  for (const f of unexpected) fails.push(`테스트 실패: ${f.name} (${f.file})${firstLine(f.error) ? ' - ' + firstLine(f.error).slice(0, 200) : ''}`);
  if (!run.error && run.status && !failures.length) fails.push(`테스트 실행 실패(종료 코드 ${run.status}, 결과 없음): ${firstLine(run.stderr).slice(0, 200)}`);
  if (!run.error && !tests.length) fails.push('실행된 테스트가 없음');
  if (!run.error && run.status === 0 && failures.length) fails.push('테스트 결과와 종료 코드가 맞지 않음');
  for (const q of quarantined) warns.push(`알려진 환경 문제로 격리됨: ${q.name} (${q.reason})`);
  for (const k of stale) warns.push(`격리 항목이 더 이상 실패하지 않음(harness-known.json에서 지우세요): ${k.name}`);
  for (const k of invalid) warns.push(`무시된 격리 항목(name·file·signature·reason 필요): ${JSON.stringify(k).slice(0, 120)}`);
  return {fails, warns, passed, failed: failures.length, quarantined: quarantined.length};
}
