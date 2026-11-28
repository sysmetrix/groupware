// GW 비서 · 거버넌스 순수 모델 (변조 감지 감사로그 해시체인, 관리자 정책, 보존기간, 버전 비교, 개인정보 마스킹)
// 브라우저 번들(scripts/live-build.mjs)과 Node ESM 테스트 양쪽에서 외부 import 없이 동작한다.

export function sha256Hex(str) {
  const bytes = new TextEncoder().encode(String(str));
  const K = []; const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  for (let c = 2, n = 0; n < 64; c++) { let p = true; for (let d = 2; d * d <= c; d++) if (c % d === 0) { p = false; break; } if (p) K[n++] = (Math.cbrt(c) % 1 * 4294967296) | 0; }
  const l = bytes.length, total = (((l + 9 + 63) >> 6) << 6), buf = new Uint8Array(total);
  buf.set(bytes); buf[l] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(total - 4, (l * 8) >>> 0); dv.setUint32(total - 8, Math.floor(l * 8 / 4294967296));
  const w = new Array(64);
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + w[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10))) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
const auditCore = e => JSON.stringify([e.id, e.at, e.command, e.type, e.target, e.summary, e.steps, e.verified, e.prev]);
// 새 기록에 이전 기록의 해시를 엮어 넣는다(중간 삭제·수정 시 검증 실패).
export function chainAudit(list = [], entry) {
  const prev = list.length && list[0].hash ? list[0].hash : '0'.repeat(64);
  const e = {...entry, prev};
  e.hash = sha256Hex(auditCore(e));
  return e;
}
// list는 최신순. 맨 앞부터 prev 연결과 해시를 확인한다. 보관 한도로 잘린 꼬리는 허용.
export function verifyAudit(list = []) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.hash) return {ok: i === list.length - 1 || !list[i + 1].hash ? true : false, checked: i, legacy: list.length - i};
    if (sha256Hex(auditCore(e)) !== e.hash) return {ok: false, badAt: i, checked: i, reason: '내용이 바뀌었습니다'};
    const next = list[i + 1];
    if (next && next.hash && next.hash !== e.prev) return {ok: false, badAt: i, checked: i, reason: '중간 기록이 빠졌습니다'};
  }
  return {ok: true, checked: list.length, legacy: 0};
}
export const POLICY_FEATURES = ['briefing', 'teamAttendance', 'aiAssistant', 'resource', 'googleCalendar', 'draftResult', 'draftPlan', 'draftPay', 'draftGoods', 'recorder', 'aiConsole', 'updateCheck'];
export const DEFAULT_POLICY = {orgName: '', enabled: true, message: '', features: Object.fromEntries(POLICY_FEATURES.map(f => [f, true])), retentionDays: 90, requireAckVersion: '', recorderPlayConfirm: true, license: '', aiEndpoint: ''};
// 관리자가 배포 폴더의 policy.js로 지정한 값을 검증·보정한다(알 수 없는 값은 무시, 안전한 쪽으로 기본값).
export function normalizePolicy(p) {
  const o = {...DEFAULT_POLICY, features: {...DEFAULT_POLICY.features}};
  if (!p || typeof p !== 'object') return o;
  if (typeof p.orgName === 'string') o.orgName = p.orgName.slice(0, 60);
  if (p.enabled === false) o.enabled = false;
  if (typeof p.message === 'string') o.message = p.message.slice(0, 200);
  if (p.features && typeof p.features === 'object') for (const f of POLICY_FEATURES) if (p.features[f] === false) o.features[f] = false;
  const r = Number(p.retentionDays); if (Number.isFinite(r)) o.retentionDays = Math.min(365, Math.max(7, Math.round(r)));
  if (typeof p.requireAckVersion === 'string') o.requireAckVersion = p.requireAckVersion.slice(0, 20);
  if (p.recorderPlayConfirm === false) o.recorderPlayConfirm = true; // 재생 확인은 끌 수 없음
  if (typeof p.license === 'string') o.license = p.license.slice(0, 120);
  if (typeof p.aiEndpoint === 'string' && /^(?:https:\/\/[^\s]+|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[^\s]*)?)$/i.test(p.aiEndpoint.trim())) o.aiEndpoint = p.aiEndpoint.trim().replace(/\/+$/, '').slice(0, 200);
  if (p.updatePublicKey && typeof p.updatePublicKey === 'object' && typeof p.updatePublicKey.x === 'string' && typeof p.updatePublicKey.y === 'string' && /^[A-Za-z0-9_-]{40,50}$/.test(p.updatePublicKey.x) && /^[A-Za-z0-9_-]{40,50}$/.test(p.updatePublicKey.y)) o.updatePublicKey = {kty: 'EC', crv: 'P-256', x: p.updatePublicKey.x, y: p.updatePublicKey.y};
  return o;
}
export function featureAllowed(policy, f) { const p = normalizePolicy(policy); return p.enabled && p.features[f] !== false; }
// 학습한 문서 중 보존기간이 지난 것(수집 시각 at 기준)을 지운다.
export function purgeExpired(patterns, nowMs, days) {
  const p = patterns && patterns.docs ? patterns : {v: 1, docs: {}};
  const limit = nowMs - days * 86400000;
  const docs = {}; let removed = 0;
  for (const [id, d] of Object.entries(p.docs)) { if ((d.learnedAt || p.at || nowMs) < limit) removed++; else docs[id] = d; }
  return {patterns: {...p, docs}, removed};
}
export function compareVersions(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
// 진단 보고서에서 개인정보 성격의 문자열을 가린다(사번·문서번호 숫자·이메일·전화).
export function maskSensitive(s) {
  return String(s ?? '').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '***@***').replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '***-****-****').replace(/(empSeq|loginId|사번)["':=\s]+[\w-]+/gi, '$1=***');
}
