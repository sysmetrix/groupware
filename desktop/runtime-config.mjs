import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';

// Only validated port numbers cross the desktop process boundary. Never print
// dotenv contents, environment values, or parser exceptions (they may be secret).
export function resolveRuntimeConfiguration(dotenv = '', environment = {}) {
  const file = parseEnv(dotenv);
  const value = key => Object.hasOwn(environment, key) ? environment[key] : file[key];
  const port = (text, fallback) => {
    if (text === undefined || text === '') return fallback;
    if (!/^[1-9][0-9]{0,4}$/.test(text) || Number(text) > 65535) throw new Error('Invalid port');
    return Number(text);
  };
  const endpoint = (text, hostOnly = false) => {
    // The supervisor binds IPv4 loopback. Do not silently rewrite IPv6, remote
    // hosts, credentials, paths, or URL-normalized alternative IP spellings.
    const pattern = hostOnly
      ? /^(?:http:\/\/)?(?:127\.0\.0\.1|localhost)(?::([1-9][0-9]{0,4}))?\/?$/i
      : /^http:\/\/(?:127\.0\.0\.1|localhost)(?::([1-9][0-9]{0,4}))?\/?$/i;
    const match = pattern.exec(text);
    if (!match) throw new Error('Invalid local endpoint');
    return port(match[1], hostOnly ? 11434 : 80);
  };
  const base = value('OLLAMA_BASE_URL'), host = value('OLLAMA_HOST');
  const hostPort = host ? endpoint(host, true) : undefined;
  const ollamaPort = base ? endpoint(base) : hostPort ?? 11434;
  if (hostPort !== undefined && hostPort !== ollamaPort) throw new Error('Conflicting Ollama ports');
  const appPort = port(value('PORT'), 3210);
  if (appPort === ollamaPort) throw new Error('Conflicting service ports');
  return {appPort, ollamaPort};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let dotenv = '';
    try { dotenv = fs.readFileSync('.env', 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    process.stdout.write(JSON.stringify(resolveRuntimeConfiguration(dotenv, process.env)));
  } catch {
    process.stderr.write('Invalid desktop runtime configuration. Check PORT, OLLAMA_BASE_URL and OLLAMA_HOST.');
    process.exitCode = 1;
  }
}
