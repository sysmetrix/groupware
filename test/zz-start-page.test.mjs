// 시작 페이지(배포물): 격리 빌드로 만들어 보고, 확장 프로그램 묶음과 버전 정보가 함께 나오는지 확인한다.
// 이 스크립트는 main에 합쳐진 뒤 배포 때만 돌기 때문에, 깨지면 배포가 멈춘다. 그래서 여기서 먼저 돌려 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

test('start page ships the bookmark, the extension zip and a version file that matches the bundle', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-pages-'));
  const cwd = new URL('..', import.meta.url);
  try {
    execFileSync(process.execPath, ['scripts/live-build.mjs', '--out-dir', path.join(dir, 'live')], {cwd});
    execFileSync(process.execPath, ['scripts/quick-install-page.mjs', path.join(dir, 'pages'), path.join(dir, 'live')], {cwd});
    const cur = JSON.parse(await fs.readFile(path.join(dir, 'pages', 'current.json'), 'utf8'));
    assert.match(cur.version, /^\d+\.\d+\.\d+$/);
    const bundle = await fs.readFile(path.join(dir, 'pages', cur.file));
    assert.equal(createHash('sha256').update(bundle).digest('hex'), cur.sha256);
    assert.ok(bundle.subarray(0, 120).toString().includes(`live bundle v${cur.version}`), 'auto-update reads the version from the banner');
    const zip = await fs.readFile(path.join(dir, 'pages', 'gw-bisu-extension.zip'));
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    for (const n of ['manifest.json', 'mount.js', 'gw-live.js', 'policy.js']) assert.ok(zip.includes(Buffer.from(`gw-bisu-extension/${n}`)), n);
    const html = await fs.readFile(path.join(dir, 'pages', 'index.html'), 'utf8');
    assert.match(html, /href="gw-bisu-extension\.zip" download/);
    assert.match(html, /href="javascript:/);
    assert.ok(html.includes(`v${cur.version}`));
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});
