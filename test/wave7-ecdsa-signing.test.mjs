import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {generateSigningKeyPair, signBundle, verifyBundle} from '../scripts/sign-bundle.mjs';
import {MOUNT_JS} from '../scripts/live-build.mjs';
import {normalizePolicy} from '../src/live/briefing.mjs';

const read = p => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('P2-1: ECDSA P-256 서명 생성 및 WebCrypto 검증(정상 통과 · 변조/위조 차단)', async () => {
  const {privateKeyPem, publicKeyJwk} = generateSigningKeyPair();
  const sample = '/*! BWYF groupware live bundle v1.35.0 */ console.log("ok");';
  const sig = signBundle(sample, privateKeyPem);
  assert.equal(Buffer.from(sig, 'base64').length, 64);
  assert.equal(await verifyBundle(sample, sig, publicKeyJwk), true);
  assert.equal(await verifyBundle(sample + ' ', sig, publicKeyJwk), false, '번들 변조 차단');
  const other = generateSigningKeyPair();
  assert.equal(await verifyBundle(sample, sig, other.publicKeyJwk), false, '다른 공개키 차단');
  assert.equal(await verifyBundle(sample, '', publicKeyJwk), false, '빈 서명 차단');
});

test('P2-1: MOUNT_JS와 21-governance.js에 ECDSA 서명 검증이 연동되어 있다', async () => {
  const gov = await read('src/live/wc/21-governance.js');
  const pages = await read('.github/workflows/pages.yml');
  const quick = await read('scripts/quick-install-page.mjs');
  assert.match(MOUNT_JS, /function verifySig\(s, sig\)/);
  assert.match(MOUNT_JS, /namedCurve: 'P-256'/);
  assert.match(MOUNT_JS, /if \(!ok\) \{ forget\(\); return; \}/);
  assert.match(gov, /namedCurve: 'P-256'/);
  assert.match(gov, /실행 파일 디지털 서명 검증 실패/);
  assert.match(pages, /GW_SIGN_PRIVATE_KEY/);
  assert.match(quick, /signBundle\(bundle, privKey\)/);
  const {publicKeyJwk} = generateSigningKeyPair();
  assert.deepEqual(normalizePolicy({updatePublicKey: publicKeyJwk}).updatePublicKey, publicKeyJwk);
  assert.equal(normalizePolicy({updatePublicKey: {x: 'bad', y: 'bad'}}).updatePublicKey, undefined);
});
