import {validateModelConfig} from './model.mjs';

async function boundedJson(url, fetchImpl) {
  const response = await fetchImpl(url, {redirect: 'error', signal: AbortSignal.timeout(3000)});
  if (!response.ok) throw new Error('status');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    length += value.length;
    if (length > 256000) { await reader.cancel(); throw new Error('size'); }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Observation only: never starts a service, loads a model, or sends document content.
export function createRuntimeStatus(rawConfig, {fetchImpl = fetch, now = () => Date.now(), cacheMs = 10000} = {}) {
  const config = validateModelConfig(rawConfig);
  let pending, cached, expires = 0;
  async function inspect() {
    const result = {checkedAt: new Date(now()).toISOString(), configured: config.enabled, model: config.enabled ? config.model : null,
      service: 'not-configured', installed: null, loaded: null, gpuBytes: null};
    if (!config.enabled) return result;
    let catalog;
    try {
      catalog = await boundedJson(config.baseUrl + '/api/tags', fetchImpl);
      if (!Array.isArray(catalog.models) || catalog.models.some(item => !item || typeof item.name !== 'string')) throw new Error('schema');
    } catch { return {...result, service: 'unavailable'}; }
    result.service = 'running';
    const matches = item => item.name === config.model || item.name === config.model + ':latest';
    result.installed = catalog.models.some(matches);
    try {
      const loaded = await boundedJson(config.baseUrl + '/api/ps', fetchImpl);
      if (!Array.isArray(loaded.models) || loaded.models.some(item => !item || typeof item.name !== 'string')) throw new Error('schema');
      const active = loaded.models.find(matches);
      result.loaded = Boolean(active);
      if (active && Number.isSafeInteger(active.size_vram) && active.size_vram >= 0) result.gpuBytes = active.size_vram;
    } catch { /* Keep loaded/memory unknown when the separate observation fails. */ }
    return result;
  }
  return () => {
    if (cached && now() < expires) return Promise.resolve(structuredClone(cached));
    if (!pending) pending = inspect().then(result => { cached = result; expires = now() + cacheMs; return result; }).finally(() => { pending = null; });
    return pending.then(result => structuredClone(result));
  };
}
