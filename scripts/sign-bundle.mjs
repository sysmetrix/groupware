// GW 비서 · 번들 ECDSA P-256 (SHA-256, IEEE P1363) 디지털 서명 생성·검증 유틸리티.
// 브라우저 WebCrypto(crypto.subtle.verify)와 100% 호환되는 raw 64바이트 서명(Base64)을 생성한다.
// Usage: node scripts/sign-bundle.mjs --keygen
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** 새 ECDSA P-256 서명 키 쌍 생성. 개인키는 GitHub Secret(GW_SIGN_PRIVATE_KEY)에, 공개키 JWK는 policy.js(updatePublicKey)에 넣는다. */
export function generateSigningKeyPair() {
  const {privateKey, publicKey} = crypto.generateKeyPairSync('ec', {namedCurve: 'P-256'});
  const privateKeyPem = privateKey.export({type: 'pkcs8', format: 'pem'});
  const jwk = publicKey.export({format: 'jwk'});
  const publicKeyJwk = {kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y};
  return {privateKeyPem, publicKeyJwk};
}

/** 번들 문자열에 ECDSA P-256 SHA-256(IEEE P1363) 서명 생성(Base64). */
export function signBundle(bundleText, privateKeyPem) {
  if (typeof bundleText !== 'string' || !bundleText) throw new Error('서명할 번들이 비어 있습니다');
  if (typeof privateKeyPem !== 'string' || !privateKeyPem.includes('PRIVATE KEY')) throw new Error('올바른 PEM 개인키가 아닙니다');
  const sig = crypto.sign('sha256', Buffer.from(bundleText, 'utf8'), {key: privateKeyPem, dsaEncoding: 'ieee-p1363'});
  if (sig.length !== 64) throw new Error('ECDSA P-256 개인키가 아닙니다');
  return sig.toString('base64');
}

/** 브라우저와 동일한 WebCrypto 경로로 번들 서명 검증. */
export async function verifyBundle(bundleText, sigB64, publicKeyJwk) {
  if (typeof bundleText !== 'string' || typeof sigB64 !== 'string' || !publicKeyJwk || typeof publicKeyJwk !== 'object') return false;
  try {
    const subtle = crypto.webcrypto.subtle;
    const key = await subtle.importKey('jwk', {kty: 'EC', crv: 'P-256', x: publicKeyJwk.x, y: publicKeyJwk.y}, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['verify']);
    const sig = Buffer.from(sigB64, 'base64');
    if (sig.length !== 64) return false;
    return await subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, key, sig, new TextEncoder().encode(bundleText));
  } catch { return false; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--keygen')) {
    const {privateKeyPem, publicKeyJwk} = generateSigningKeyPair();
    console.log('=== 1. GitHub Repository Secret (GW_SIGN_PRIVATE_KEY) ===\n' + privateKeyPem.trim());
    console.log('\n=== 2. policy.js (window.BWYFGW_POLICY.updatePublicKey) ===\n' + JSON.stringify(publicKeyJwk));
  } else {
    console.log('Usage: node scripts/sign-bundle.mjs --keygen');
  }
}
