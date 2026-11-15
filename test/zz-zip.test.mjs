// 확장 프로그램 묶음(zip): 외부 도구 없이 만든 파일이 표준 ZIP으로 읽히고, 같은 입력이면 같은 바이트가 나온다.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {zipSync} from '../scripts/lib/zip.mjs';

function unzip(buf) {
  const out = {};
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50, 'end record');
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const size = buf.readUInt32LE(p + 20), n = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + n).toString('utf8');
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const data = zlib.inflateRawSync(buf.subarray(start, start + size));
    assert.equal(zlib.crc32(data), buf.readUInt32LE(p + 16), `crc of ${name}`);
    out[name] = data.toString('utf8');
    p += 46 + n;
  }
  return out;
}

test('zipSync writes a readable, deterministic archive and refuses unsafe paths', () => {
  const files = [{name: 'ext/mount.js', data: 'console.log("한글");'}, {name: 'ext\\manifest.json', data: Buffer.from('{}')}];
  const z = zipSync(files);
  assert.deepEqual(unzip(z), {'ext/manifest.json': '{}', 'ext/mount.js': 'console.log("한글");'});
  assert.ok(z.equals(zipSync([...files].reverse())), 'order of input does not matter');
  for (const name of ['../x', '/abs', '']) assert.throws(() => zipSync([{name, data: 'x'}]));
});
