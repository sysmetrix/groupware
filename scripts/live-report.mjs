// Usage: node scripts/live-report.mjs <raw.json> [--out data/live] [--scope data/browser-capture/principal.json] [--import http://127.0.0.1:3210] [--keep-days 60]
// Builds the briefing (HTML/Markdown/analysis JSON), updates the diff state and
// writes an assistant dataset. Optionally imports it into the running local app.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {analyze, nextState, renderHtml, renderMarkdown, toDataset, kstNow} from '../src/live/briefing.mjs';
import {validateDataset} from '../src/schema.mjs';

function args(argv) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
    else out._.push(argv[i]);
  }
  return out;
}
const readJson = async (file, fallback = null) => { try { return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')); } catch { return fallback; } };
const writeAtomic = async (file, text) => { await fs.mkdir(path.dirname(file), {recursive: true}); const tmp = `${file}.${process.pid}.tmp`; await fs.writeFile(tmp, text, {mode: 0o600}); await fs.rename(tmp, file); };

export async function buildReport({rawPath, outDir = 'data/live', scopePath = 'data/browser-capture/principal.json', keepDays = 60, now = new Date()}) {
  const raw = await readJson(rawPath);
  if (!raw || raw.schemaVersion !== 1 || !raw.data || !raw.collectedAt) throw new Error('수집 결과(raw JSON) 형식이 아닙니다. BWYFGW.collect() 결과를 저장했는지 확인하세요.');
  if (raw.origin !== 'https://gw.bwyf.or.kr') throw new Error('다른 출처의 수집 결과입니다.');
  const statePath = path.join(outDir, 'state.json');
  const prev = await readJson(statePath);
  const usablePrev = prev && prev.at && Date.parse(prev.at) < Date.parse(raw.collectedAt) ? prev : null;
  const analysis = analyze(raw, usablePrev, now);
  const day = kstNow(new Date(raw.collectedAt)).date;
  const html = renderHtml(analysis);
  const md = renderMarkdown(analysis);
  await writeAtomic(path.join(outDir, 'latest.html'), html);
  await writeAtomic(path.join(outDir, 'latest.md'), md);
  await writeAtomic(path.join(outDir, 'latest.json'), JSON.stringify(analysis, null, 1));
  await writeAtomic(path.join(outDir, 'history', `${day}.html`), html);
  await writeAtomic(path.join(outDir, 'raw', `${day}.json`), JSON.stringify(raw));
  // Only move the diff baseline forward when the run itself is usable.
  if (!raw.sessionExpired) await writeAtomic(statePath, JSON.stringify(nextState(raw, usablePrev), null, 1));

  let dataset = null;
  const scope = await readJson(scopePath, {userId: 'local-browser-user', displayName: raw.principal?.name || '사용자', organizationId: 'local-browser-organization'});
  try {
    dataset = validateDataset(toDataset(raw, scope));
    await writeAtomic(path.join(outDir, 'dataset.json'), JSON.stringify(dataset, null, 2));
  } catch (error) { analysis.datasetError = error.message; }

  // Retention: keep the latest N days of history/raw files.
  const cutoff = Date.parse(day + 'T00:00:00Z') - keepDays * 86400000;
  for (const sub of ['history', 'raw']) {
    for (const name of await fs.readdir(path.join(outDir, sub)).catch(() => [])) {
      const m = name.match(/^(\d{4}-\d{2}-\d{2})\./);
      if (m && Date.parse(m[1] + 'T00:00:00Z') < cutoff) await fs.rm(path.join(outDir, sub, name), {force: true});
    }
  }
  return {analysis, dataset, files: {html: path.resolve(outDir, 'latest.html'), md: path.resolve(outDir, 'latest.md'), history: path.resolve(outDir, 'history', `${day}.html`), dataset: dataset ? path.resolve(outDir, 'dataset.json') : null}};
}

async function importToAssistant(dataset, address) {
  if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(address)) throw new Error('가져오기 주소는 http://127.0.0.1:포트 형식이어야 합니다.');
  const status = await (await fetch(address + '/api/status', {signal: AbortSignal.timeout(5000)})).json();
  if (status.source.kind !== 'demo' && (status.source.kind !== 'browser-snapshot' || status.principal.userId !== dataset.principal.userId)) throw new Error('업무도우미에 다른 범위의 실제 자료가 있어 자동으로 바꾸지 않았습니다.');
  const response = await fetch(address + '/api/import', {method: 'POST', headers: {'content-type': 'application/json', 'x-csrf-token': status.csrf}, body: JSON.stringify(dataset), signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || '가져오기 실패');
  return (await response.json()).revision;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const a = args(process.argv.slice(2));
  if (!a._[0]) { console.error('Usage: node scripts/live-report.mjs <raw.json> [--out data/live] [--scope principal.json] [--import http://127.0.0.1:3210]'); process.exit(1); }
  try {
    const result = await buildReport({rawPath: a._[0], outDir: a.out || 'data/live', scopePath: a.scope || 'data/browser-capture/principal.json', keepDays: Number(a['keep-days'] || 60)});
    let imported = null;
    if (a.import && result.dataset) { try { imported = await importToAssistant(result.dataset, a.import === true ? 'http://127.0.0.1:3210' : a.import); } catch (e) { imported = `실패: ${e.message}`; } }
    const s = result.analysis.summary;
    console.log(JSON.stringify({ok: true, collectedAt: result.analysis.collectedAt, sessionExpired: result.analysis.sessionExpired, failed: result.analysis.failed.map(f => f.name), summary: s, actions: result.analysis.actions.length, high: result.analysis.actions.filter(x => x.priority === 'high').length, deadlines: result.analysis.deadlines.length, newSince: result.analysis.newSince, datasetError: result.analysis.datasetError || null, imported, files: result.files}, null, 1));
  } catch (error) { console.error(error.message); process.exit(1); }
}
