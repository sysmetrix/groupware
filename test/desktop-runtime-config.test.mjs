import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {once} from 'node:events';
import {resolveRuntimeConfiguration as resolve} from '../desktop/runtime-config.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test('desktop ports: defaults, Node dotenv syntax, and environment precedence', () => {
  assert.deepEqual(resolve(), {appPort: 3210, ollamaPort: 11434});
  assert.deepEqual(resolve('export PORT="4321" # app\nOLLAMA_BASE_URL=\'http://localhost:14567/\'\n'), {appPort: 4321, ollamaPort: 14567});
  assert.deepEqual(resolve('PORT=4321\nPORT=4322\nOLLAMA_BASE_URL=http://127.0.0.1:14567', {PORT: '4323'}), {appPort: 4323, ollamaPort: 14567});
  assert.deepEqual(resolve('PORT=invalid\nOLLAMA_BASE_URL=http://remote.invalid', {PORT: '', OLLAMA_BASE_URL: ''}), {appPort: 3210, ollamaPort: 11434});
  assert.deepEqual(resolve('OLLAMA_HOST=localhost:14567'), {appPort: 3210, ollamaPort: 14567});
  assert.deepEqual(resolve('OLLAMA_BASE_URL=http://localhost'), {appPort: 3210, ollamaPort: 80});
  assert.deepEqual(resolve('OLLAMA_BASE_URL=http://127.0.0.1:14567\nOLLAMA_HOST=http://localhost:14567/'), {appPort: 3210, ollamaPort: 14567});
  assert.deepEqual(resolve('UNRELATED="multiline\nPORT=9999\n"\nPORT=4321'), {appPort: 4321, ollamaPort: 11434});
});

test('desktop refuses ambiguous, nonlocal, and conflicting endpoints', () => {
  for (const port of ['0', '65536', '-1', '+3210', '03210', '3e3', '3210.0', '3210; whoami']) {
    assert.throws(() => resolve(`PORT=${port}`), /Invalid port/);
  }
  for (const url of [
    'https://localhost:11434', 'http://remote.invalid:11434', 'http://0.0.0.0:11434',
    'http://[::1]:11434', 'http://127.1:11434', 'http://2130706433:11434',
    'http://127.0.0.2:11434', 'http://localhost.:11434', 'http://localhost:65536',
    'http://user:FAKE_SECRET@localhost:11434', 'http://localhost:11434/api',
    'http://localhost:11434?key=FAKE_SECRET', 'http://localhost:11434/#fragment',
    'http://localhost:11434/../', 'http://localhost:011434', 'localhost:11434',
  ]) assert.throws(() => resolve(`OLLAMA_BASE_URL='${url}'`));
  assert.throws(() => resolve('OLLAMA_BASE_URL=http://localhost:14567\nOLLAMA_HOST=127.0.0.1:11434'), /Conflicting/);
  assert.throws(() => resolve('PORT=11434'), /Conflicting/);
  assert.throws(() => resolve('OLLAMA_HOST=0.0.0.0:11434'));
});

test('ServiceClient passes resolved ports, guards owned port drift, and preserves Stop', {skip: process.platform !== 'win32', timeout: 180000}, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw desktop config ' "));
  t.after(async () => {
    const target = path.resolve(dir), base = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(target.startsWith(base) && path.basename(target).startsWith('gw desktop config '));
    await fs.rm(target, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(dir, 'scripts'));
  await fs.mkdir(path.join(dir, 'desktop'));
  await fs.copyFile(path.join(root, 'desktop/runtime-config.mjs'), path.join(dir, 'desktop/runtime-config.mjs'));
  // No real controller or services run: this fixture records the exact arguments
  // crossing the compiled C# -> PowerShell boundary, including quoted root paths.
  await fs.writeFile(path.join(dir, 'scripts/windows-services.ps1'), `
param($Action, $Service, [int]$AppPort=3210, [int]$OllamaPort=11434)
$root = Split-Path -Parent $PSScriptRoot
if ($Action -eq 'Status') {
  $fixture = Join-Path $root 'status.json'
  if (Test-Path -LiteralPath $fixture) { Get-Content -LiteralPath $fixture -Raw; return }
  ConvertTo-Json -InputObject @(
    @{service='App'; status='stopped'; owned=$false; port=$AppPort},
    @{service='Ollama'; status='stopped'; owned=$false; port=$OllamaPort})
} else {
  Set-Content -LiteralPath (Join-Path $root 'called.txt') -Value $Action
  @{action=$Action; service=$Service; appPort=$AppPort; ollamaPort=$OllamaPort} | ConvertTo-Json
}
`);
  const harness = path.join(dir, 'Probe.cs');
  await fs.writeFile(harness, `
using System; using System.Text; using System.Web.Script.Serialization;
public static class RuntimeConfigProbe {
  public static int Main(string[] args) {
    Console.OutputEncoding = new UTF8Encoding(false);
    var client = new ServiceClient(args[0]);
    try {
      string result = client.Run(args[1], args[2]).GetAwaiter().GetResult();
      Console.Write(new JavaScriptSerializer().Serialize(new {result, error = client.ConfigurationError}));
      return 0;
    } catch(Exception e) { Console.Write(new JavaScriptSerializer().Serialize(new {error=e.Message})); return 0; }
  }
}
`);
  const compiler = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const exe = path.join(dir, 'Probe.exe');
  await exec(compiler, ['/nologo', '/target:exe', '/codepage:65001', '/main:RuntimeConfigProbe',
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
    '/reference:System.Core.dll', `/out:${exe}`, harness,
    path.join(root, 'desktop/GroupwareControl.cs'), path.join(root, 'desktop/ModernControls.cs')], {windowsHide: true});
  const env = {...process.env};
  for (const key of Object.keys(env)) if (['PORT', 'OLLAMA_BASE_URL', 'OLLAMA_HOST', 'NODE_OPTIONS'].includes(key.toUpperCase())) delete env[key];
  const run = async (action, service = 'All', extraEnv = {}) => JSON.parse((await exec(exe, [dir, action, service], {
    env: {...env, ...extraEnv}, windowsHide: true, timeout: 45000, encoding: 'utf8',
  })).stdout.replace(/^\uFEFF/, ''));
  const config = text => fs.writeFile(path.join(dir, '.env'), text);
  const noMutation = async () => assert.rejects(fs.access(path.join(dir, 'called.txt')), {code: 'ENOENT'});
  await t.test('custom ports reach Status and every Start selection', async () => {
    await config('PORT=4321\nOLLAMA_BASE_URL=http://localhost:14567\nUNRELATED=FAKE_SECRET');
    const status = await run('Status');
    assert.equal(status.error, null);
    assert.deepEqual(JSON.parse(status.result).map(row => row.port), [4321, 14567]);
    for (const service of ['App', 'Ollama', 'All']) {
      const result = await run('Start', service);
      assert.equal(result.error, null);
      assert.deepEqual(JSON.parse(result.result), {action: 'Start', service, appPort: 4321, ollamaPort: 14567});
    }
    const overridden = await run('Start', 'App', {PORT: '4322', OLLAMA_BASE_URL: 'http://127.0.0.1:14568'});
    assert.equal(JSON.parse(overridden.result).appPort, 4322);
    assert.equal(JSON.parse(overridden.result).ollamaPort, 14568);
    await fs.unlink(path.join(dir, 'called.txt'));
  });
  await t.test('invalid config refuses Start without leaking values but allows Status and Stop', async () => {
    await config('PORT=4321\nOLLAMA_BASE_URL=http://FAKE_SECRET@remote.invalid:14567');
    const start = await run('Start');
    assert.ok(start.error);
    assert.ok(!JSON.stringify(start).includes('FAKE_SECRET'));
    await noMutation();
    const status = await run('Status');
    assert.ok(status.error);
    assert.equal(JSON.parse(status.result).length, 2);
    const stop = await run('Stop');
    assert.equal(JSON.parse(stop.result).action, 'Stop');
    await fs.unlink(path.join(dir, 'called.txt'));
  });
  await t.test('owned old ports block starts; stale records permit configured restart', async () => {
    await config('PORT=4321\nOLLAMA_BASE_URL=http://127.0.0.1:14567');
    const states = [
      {service: 'App', status: 'stopped', owned: false, port: 4321},
      {service: 'Ollama', status: 'running-owned', owned: true, port: 11434},
    ];
    await fs.writeFile(path.join(dir, 'status.json'), JSON.stringify(states));
    assert.ok((await run('Start', 'App')).error);
    await noMutation();
    assert.equal(JSON.parse((await run('Status')).result)[1].port, 11434);
    states[1].owned = false; states[1].status = 'stale-or-stopped';
    await fs.writeFile(path.join(dir, 'status.json'), JSON.stringify(states));
    assert.equal(JSON.parse((await run('Start', 'App')).result).ollamaPort, 14567);
    await fs.unlink(path.join(dir, 'called.txt'));
    await fs.unlink(path.join(dir, 'status.json'));
  });
  await t.test('missing helper cannot launch but does not block owned shutdown', async () => {
    await fs.unlink(path.join(dir, 'desktop/runtime-config.mjs'));
    assert.ok((await run('Start')).error);
    await noMutation();
    assert.equal(JSON.parse((await run('Status')).result).length, 2);
    assert.equal(JSON.parse((await run('Stop')).result).action, 'Stop');
  });
  await t.test('real owned app starts on configured port and stops after invalid configuration', async () => {
    await fs.copyFile(path.join(root, 'desktop/runtime-config.mjs'), path.join(dir, 'desktop/runtime-config.mjs'));
    await fs.copyFile(path.join(root, 'scripts/windows-services.ps1'), path.join(dir, 'scripts/windows-services.ps1'));
    await fs.mkdir(path.join(dir, 'src'));
    await fs.writeFile(path.join(dir, 'src/server.mjs'), "import http from 'node:http'; http.createServer((q,r)=>r.end('isolated-desktop')).listen(Number(process.env.PORT),'127.0.0.1');");
    const reservation = http.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    await config(`PORT=${port}\nOLLAMA_BASE_URL=http://127.0.0.1:${port === 11434 ? 11435 : 11434}`);
    try {
      const started = await run('Start', 'App'); assert.equal(started.error, null);
      const state = JSON.parse((await run('Status')).result).find(x => x.service === 'App');
      assert.equal(state.port, port); assert.equal(state.status, 'running-owned');
      assert.equal(await (await fetch(`http://127.0.0.1:${port}`, {signal: AbortSignal.timeout(5000)})).text(), 'isolated-desktop');
      await config('PORT=invalid');
      const status = await run('Status'); assert.ok(status.error);
      assert.equal(JSON.parse(status.result).find(x => x.service === 'App').port, port);
      const stopped = await run('Stop', 'App'); assert.match(stopped.result, /Stopped owned App/);
      await assert.rejects(fetch(`http://127.0.0.1:${port}`, {signal: AbortSignal.timeout(5000)}));
    } finally { await run('Stop', 'App'); }
  });
});
