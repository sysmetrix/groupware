import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createDemoDataset} from './demo.mjs';
import {validateDataset} from './schema.mjs';

export async function createStore(directory) {
  await fs.mkdir(directory, {recursive: true, mode: 0o700});
  const file = path.join(directory, 'dataset.json');
  const auditFile = path.join(directory, 'audit.jsonl');
  let dataset, revision = 0;
  try { dataset = validateDataset(JSON.parse(await fs.readFile(file, 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('저장된 데이터가 손상되었거나 형식이 맞지 않습니다. data/dataset.json을 확인하세요.'); dataset = createDemoDataset(); }
  let queue = Promise.resolve();
  const serialize = action => { const operation = queue.then(action); queue = operation.catch(() => {}); return operation; };
  async function atomicWrite(destination, content) {
    const temporary = destination + '.' + randomUUID() + '.tmp';
    try { await fs.writeFile(temporary, content, {mode: 0o600, flag: 'wx'}); await fs.rename(temporary, destination); }
    finally { await fs.rm(temporary, {force: true}); }
  }
  async function log(event) {
    const record = {id: randomUUID(), at: new Date().toISOString(), action: event.action, outcome: event.outcome, count: event.count ?? null};
    // Deliberately omit queries, document bodies, principal identifiers, and credentials.
    await fs.appendFile(auditFile, JSON.stringify(record) + '\n', {mode: 0o600});
  }
  return {
    snapshot: () => ({dataset: structuredClone(dataset), revision}),
    replace: value => serialize(async () => {
      const next = validateDataset(value);
      // Persist an attempt before writing, then a completion. A failed completion never yields a success response.
      await log({action: 'dataset.replace', outcome: 'started', count: next.items.length});
      await atomicWrite(file, JSON.stringify(next, null, 2));
      dataset = next; revision += 1;
      await log({action: 'dataset.replace', outcome: 'completed', count: next.items.length});
      return {revision, digest: createHash('sha256').update(JSON.stringify(next)).digest('hex')};
    }),
    audit: event => serialize(() => log(event)),
    history: () => serialize(async () => {
      try { const handle = await fs.open(auditFile, 'r'); try {
        const {size} = await handle.stat(); const start = Math.max(0, size - 128_000); const buffer = Buffer.alloc(size - start);
        await handle.read(buffer, 0, buffer.length, start);
        const lines = buffer.toString('utf8').split('\n'); if (start) lines.shift();
        return lines.filter(Boolean).slice(-50).map(line => JSON.parse(line)).reverse();
      } finally { await handle.close(); } }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    }),
  };
}
