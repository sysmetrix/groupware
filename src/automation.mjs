import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {AppError, object, validateDataset, kstDate} from './schema.mjs';
import {buildBriefing} from './tasks.mjs';
import {AutomationError, classifyFailure, nextDelaySeconds} from './recovery.mjs';

export const defaultAutomation = {
  schemaVersion: 1, enabled: false, inputFile: './data/inbox/dataset.json',
  expectedPrincipal: {userId: '', organizationId: ''}, intervalSeconds: 60,
  briefingTime: '09:00', maxAgeHours: 72,
};
export function validateAutomation(value, root) {
  object(value, 'automation', Object.keys(defaultAutomation));
  if (value.schemaVersion !== 1 || typeof value.enabled !== 'boolean') throw new AppError('자동화 설정 버전과 enabled를 확인하세요.');
  object(value.expectedPrincipal, 'expectedPrincipal', ['userId', 'organizationId']);
  for (const key of ['userId', 'organizationId']) {
    if (typeof value.expectedPrincipal[key] !== 'string' || value.expectedPrincipal[key].length > 120 || (value.enabled && !value.expectedPrincipal[key].trim())) throw new AppError('자동화 대상 사용자와 조직을 지정하세요.');
  }
  if (typeof value.inputFile !== 'string' || !value.inputFile.trim() || value.inputFile.length > 4096) throw new AppError('자동으로 읽을 JSON 파일 경로가 필요합니다.');
  if (!Number.isInteger(value.intervalSeconds) || value.intervalSeconds < 30 || value.intervalSeconds > 86400) throw new AppError('자동 확인 간격은 30~86400초입니다.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.briefingTime)) throw new AppError('브리핑 시간은 한국 시간 HH:mm입니다.');
  if (!Number.isInteger(value.maxAgeHours) || value.maxAgeHours < 1 || value.maxAgeHours > 720) throw new AppError('자료 유효 시간은 1~720시간입니다.');
  return {...value, expectedPrincipal: {...value.expectedPrincipal}, inputFile: path.resolve(root, value.inputFile)};
}
export async function readJsonFile(file, limit = 5 * 1024 * 1024) {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new AppError('일반 JSON 파일(최대 5 MB)이 필요합니다.');
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < buffer.length) { const read = await handle.read(buffer, size, buffer.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
    if (size > limit) throw new AppError('JSON 파일 크기 제한을 초과했습니다.');
    try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(buffer.subarray(0, size)).replace(/^\uFEFF/, '')); }
    catch { throw new AppError('UTF-8 JSON 형식이 필요합니다.'); }
  } finally { await handle.close(); }
}
export async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), {recursive: true, mode: 0o700});
  const temp = file + '.' + randomUUID() + '.tmp';
  try { await fs.writeFile(temp, JSON.stringify(value, null, 2), {flag: 'wx', mode: 0o600}); await fs.rename(temp, file); }
  finally { await fs.rm(temp, {force: true}); }
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function createAutomation({store, dataDir, configFile, root = process.cwd(), now = () => new Date(), timers = {setTimeout, clearTimeout}}) {
  let config = validateAutomation(defaultAutomation, root);
  try { config = validateAutomation(await readJsonFile(configFile, 32_768), root); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const reportFile = path.join(dataDir, 'reports', 'latest.json');
  let report = null, inFlight = null, forceRequested = false, verifiedDigest = null;
  const state = {enabled: config.enabled, intervalSeconds: config.intervalSeconds, briefingTime: config.briefingTime, timeZone: 'Asia/Seoul', lastAttemptAt: null, lastSuccessAt: null, outcome: 'idle', message: config.enabled ? '자료 확인 대기' : '자동화 미설정', nextCheckAt: null, runId: null, errorCode: null, recoveryAction: null, retryable: false, consecutiveFailures: 0, retryDelaySeconds: config.intervalSeconds};
  try { const saved = await readJsonFile(reportFile); if (saved.schemaVersion === 1 && typeof saved.generatedAt === 'string' && typeof saved.datasetDigest === 'string') report = saved; }
  catch (error) { if (error.code !== 'ENOENT') state.message = '이전 보고서를 읽지 못했습니다. 새 실행이 필요합니다.'; }
  function requireFresh(dataset, time) {
    if (dataset.source.kind !== 'manual-export') throw new AutomationError('SOURCE_KIND', '자동화는 실제 내보내기 자료(manual-export)만 처리합니다.');
    if (dataset.principal.userId !== config.expectedPrincipal.userId || dataset.principal.organizationId !== config.expectedPrincipal.organizationId) throw new AutomationError('SCOPE_MISMATCH', '자료의 사용자·조직이 자동화 설정과 다릅니다.');
    const age = time - new Date(dataset.source.exportedAt);
    if (age < -300_000 || age > config.maxAgeHours * 3600_000) throw new AutomationError('STALE_SOURCE', '자료 기준 시각이 너무 오래되었거나 미래입니다. 새로 내보내세요.');
  }
  async function perform() {
    if (!config.enabled) throw new AppError('config/automation.json에서 자동화를 설정한 뒤 서버를 다시 시작하세요.');
    const time = now(), previousOutcome = state.outcome, previousError = state.errorCode;
    state.lastAttemptAt = time.toISOString(); state.runId = randomUUID(); state.outcome = 'running'; state.message = '자료를 확인하고 있습니다.';
    try {
      const dataset = validateDataset(await readJsonFile(config.inputFile)); requireFresh(dataset, time);
      const hash = digest(dataset);
      const current = store.snapshot().dataset;
      if (current.source.kind === 'manual-export' && current.principal.userId === dataset.principal.userId && current.principal.organizationId === dataset.principal.organizationId && current.source.baseUrl === dataset.source.baseUrl && Date.parse(dataset.source.exportedAt) < Date.parse(current.source.exportedAt)) throw new AutomationError('SOURCE_ROLLBACK', '현재 자료보다 오래된 내보내기 파일로 자동 교체할 수 없습니다.');
      if (hash !== digest(store.snapshot().dataset)) await store.replace(dataset);
      const snapshot = store.snapshot();
      // A manual import can supersede this run; never publish results for a different snapshot.
      if (digest(snapshot.dataset) !== hash) throw new AutomationError('SNAPSHOT_CHANGED', '자료가 변경되어 다음 확인에서 다시 실행합니다.', 409);
      const kstTime = new Date(time.getTime() + 9 * 3600_000).toISOString().slice(11, 16);
      const due = kstTime >= config.briefingTime && (!report || kstDate(new Date(report.generatedAt)) !== kstDate(time) || report.datasetDigest !== hash);
      if (forceRequested || due) {
        const next = {schemaVersion: 1, generatedAt: time.toISOString(), datasetDigest: hash, source: dataset.source, briefing: buildBriefing(dataset, time)};
        await atomicJson(reportFile, next);
        await store.audit({action: 'automation.briefing', outcome: 'completed', count: next.briefing.references.length, runId: state.runId});
        report = next;
      }
      if (store.snapshot().revision !== snapshot.revision) throw new AutomationError('SNAPSHOT_CHANGED', '보고서 생성 중 자료가 변경되었습니다.', 409);
      verifiedDigest = hash;
      state.lastSuccessAt = time.toISOString(); state.outcome = 'completed'; state.message = '자료 확인 완료';
      state.errorCode = null; state.recoveryAction = null; state.retryable = false; state.consecutiveFailures = 0; state.retryDelaySeconds = config.intervalSeconds;
    } catch (error) {
      Object.assign(state, classifyFailure(error)); state.outcome = 'failed'; verifiedDigest = null;
      state.consecutiveFailures += 1;
      state.retryDelaySeconds = nextDelaySeconds(config.intervalSeconds, state.consecutiveFailures, state.retryable);
      if (previousOutcome !== 'failed' || previousError !== state.errorCode) await store.audit({action: 'automation.sync', outcome: 'failed', runId: state.runId, errorCode: state.errorCode});
    }
    return status();
  }
  function status() {
    const current = store.snapshot().dataset;
    let currentReport = false;
    try { requireFresh(current, now()); const hash = digest(current); currentReport = Boolean(config.enabled && state.outcome === 'completed' && verifiedDigest === hash && report && report.datasetDigest === hash && kstDate(new Date(report.generatedAt)) === kstDate(now())); } catch { /* No valid report for this snapshot. */ }
    return {...state, reportAvailable: currentReport, reportGeneratedAt: report?.generatedAt || null};
  }
  function run({forceReport = false} = {}) {
    if (inFlight) { forceRequested ||= forceReport; return inFlight; }
    forceRequested = forceReport;
    inFlight = perform().finally(() => { inFlight = null; });
    return inFlight;
  }
  let timer, started = false, generation = 0;
  function start() {
    if (!config.enabled || started) return;
    started = true;
    const activeGeneration = ++generation;
    const tick = async () => {
      state.nextCheckAt = null;
      try { await run(); }
      catch { state.outcome = 'failed'; state.errorCode = 'AUDIT_UNAVAILABLE'; state.message = '실행 기록 저장에 실패했습니다.'; state.recoveryAction = '자료 폴더의 쓰기 권한과 여유 공간을 확인하세요.'; }
      if (!started || activeGeneration !== generation) return;
      state.nextCheckAt = new Date(now().getTime() + state.retryDelaySeconds * 1000).toISOString();
      timer = timers.setTimeout(tick, state.retryDelaySeconds * 1000); timer.unref?.();
    };
    void tick();
  }
  return {status, run, start, stop: () => { started = false; generation += 1; timers.clearTimeout(timer); timer = null; state.nextCheckAt = null; }, latest: () => {
    if (!status().reportAvailable) throw new AppError('현재 자료에 맞는 오늘의 보고서가 없습니다. 자동화를 실행하세요.', 404);
    return structuredClone(report);
  }};
}
