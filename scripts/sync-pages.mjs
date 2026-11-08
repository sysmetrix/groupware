import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {object} from '../src/schema.mjs';
import {atomicJson, readJsonFile} from '../src/automation.mjs';
import {collectPages, SyncError} from '../src/sync.mjs';

export async function syncPageFile({inputFile, scopeFile, stateFile, outputFile, now = new Date()}) {
  const files = [inputFile, scopeFile, stateFile, outputFile].map(file => path.resolve(file));
  const keys = files.map(file => process.platform === 'win32' ? file.toLowerCase() : file);
  if (new Set([...keys, keys[2] + '.lock']).size !== 5) throw new SyncError('PATH_CONFLICT', '입력·범위·상태·출력·잠금은 서로 다른 파일이어야 합니다.');
  [inputFile, scopeFile, stateFile, outputFile] = files;
  await fs.mkdir(path.dirname(stateFile), {recursive: true, mode: 0o700});
  const lockFile = stateFile + '.lock';
  let handle;
  try { handle = await fs.open(lockFile, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new SyncError('SYNC_LOCKED', '수집이 실행 중이거나 중단된 잠금 파일이 있습니다. 실행 여부를 확인하세요.'); throw error; }
  try {
    await handle.writeFile(JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()}));
    const input = await readJsonFile(inputFile);
    object(input, 'page bundle', ['schemaVersion', 'scope', 'mode', 'fromCheckpoint', 'source', 'principal', 'pages']);
    if (input.schemaVersion !== 1) throw new SyncError('INVALID_BUNDLE', '페이지 묶음 버전을 확인하세요.');
    let previous = null;
    try { previous = await readJsonFile(stateFile, 6 * 1024 * 1024); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const result = await collectPages({...input, expectedScope: await readJsonFile(scopeFile, 32768), previous, now});
    // Publish before advancing the checkpoint. A crash between writes may replay
    // the old checkpoint; both files are NOT a distributed transaction.
    await atomicJson(outputFile, result.state.dataset);
    await atomicJson(stateFile, result.state);
    return result.summary;
  } finally { await handle.close(); await fs.rm(lockFile); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [inputFile, scopeFile, stateFile = './data/sync/state.json', outputFile = './data/inbox/dataset.json', ...extra] = process.argv.slice(2);
  if (!inputFile || !scopeFile || extra.length) {
    console.error('사용법: npm run sync:pages -- pages.json scope.json [state.json] [dataset.json]'); process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify({ok: true, ...await syncPageFile({inputFile, scopeFile, stateFile, outputFile})}, null, 2)); }
    catch (error) { console.error(`${error instanceof SyncError ? error.code : 'SYNC_FAILED'}: ${error instanceof SyncError ? error.message : '페이지·범위 파일의 형식과 경로·권한을 확인하세요.'}`); process.exitCode = 1; }
  }
}
