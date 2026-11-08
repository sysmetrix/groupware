import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const exec = promisify(execFile);

test('Windows controller owns its launch tree, refuses port conflicts and stale identities', {skip: process.platform !== 'win32', timeout: 180000}, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gw runtime isolated '));
  for (const folder of ['scripts', 'src', 'data']) await fs.mkdir(path.join(dir, folder));
  const script = path.join(dir, 'scripts/windows-services.ps1');
  await fs.copyFile(fileURLToPath(new URL('../scripts/windows-services.ps1', import.meta.url)), script);
  await fs.writeFile(path.join(dir, 'src/server.mjs'), `
import http from 'node:http'; import fs from 'node:fs'; import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
fs.writeFileSync('data/dummy-child.json',JSON.stringify({pid:child.pid}));
http.createServer((q,r)=>r.end('isolated')).listen(Number(process.env.PORT),'127.0.0.1');
`);
  const occupied = http.createServer((q,r) => r.end('unmanaged'));
  occupied.listen(0, '127.0.0.1'); await once(occupied, 'listening');
  const port = occupied.address().port;
  const run = async (action, service = 'App') => {
    try { return await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, '-Action', action, '-Service', service, '-AppPort', String(port), '-TimeoutSeconds', '15'], {timeout: 45000, windowsHide: true, encoding: 'utf8'}); }
    catch (error) {
      if (action === 'Start') error.message += '\nSupervisor: ' + await fs.readFile(path.join(dir, 'data/runtime-control/App.err.log'), 'utf8').catch(() => 'not launched');
      throw error;
    }
  };
  let saved;
  const stateFile = path.join(dir, 'data/runtime-control/app.json');
  t.after(async () => {
    occupied.close();
    if (saved) await fs.writeFile(stateFile, saved);
    await run('Stop').catch(() => {});
    const target = path.resolve(dir), base = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(target.startsWith(base) && path.basename(target).startsWith('gw runtime isolated '));
    await fs.rm(target, {recursive: true, force: true});
  });
  assert.equal(JSON.parse((await run('Status')).stdout)[0].status, 'unmanaged-listener');
  await assert.rejects(run('Start'), /already in use/);
  await run('Stop');
  assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'unmanaged');
  await new Promise(resolve => occupied.close(resolve));
  await run('Start');
  const status = JSON.parse((await run('Status')).stdout)[0];
  assert.equal(status.status, 'running-owned');
  assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'isolated');
  await assert.rejects(run('Start'), /live recorded/);
  saved = await fs.readFile(stateFile, 'utf8');
  const original = JSON.parse(saved), forged = structuredClone(original);
  forged.supervisor.started = '1';
  await fs.writeFile(stateFile, JSON.stringify(forged));
  await assert.rejects(run('Stop'), /ownership mismatch/);
  assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'isolated');
  await fs.writeFile(stateFile, saved); saved = null;
  const child = JSON.parse(await fs.readFile(path.join(dir, 'data/dummy-child.json'), 'utf8'));
  await run('Stop');
  assert.equal(JSON.parse((await run('Status')).stdout)[0].status, 'stale-or-stopped');
  for (const pid of [original.supervisor.pid, original.child.pid, child.pid]) assert.throws(() => process.kill(pid, 0), {code: 'ESRCH'});
});
