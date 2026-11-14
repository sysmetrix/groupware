import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {purgeExpired} from '../src/live/briefing.mjs';
const gov = readFileSync(new URL('../src/live/wc/21-governance.js', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/live/wc/16-events.js', import.meta.url), 'utf8');

test('IndexedDB patterns에 보존기간을 적용하고 만료 자료만 정리한다', () => {
  const fn = gov.slice(gov.indexOf('  function govPurge()'), gov.indexOf('  // ---------- 감사 기록'));
  const now = Date.now(), data = {v:1, docs:{old:{learnedAt:now-100*86400000}, fresh:{learnedAt:now-3*86400000}}};
  let written;
  const ctx = {store:{get:()=>data,set:(key,value)=>{written=value;return true;}},R:{purgeExpired}, POLICY:{retentionDays:90}, Date, logError:()=>{}};
  vm.runInNewContext(fn + '\nthis.purge=govPurge;',ctx);
  assert.equal(ctx.purge(),1); assert.deepEqual(Object.keys(written.docs),['fresh']);
});

test('전체 삭제는 IndexedDB와 세션 AI 키도 지우도록 연결되어 있다', () => {
  const line = events.split('\n').find(x=>x.includes("case 'resetAll':"));
  assert.match(line,/for \(const k of IDB_KEYS\) store\.del\(k\)/);
  assert.match(line,/sessionStorage\.removeItem\(aiSessKey\(\)\)/);
  assert.match(gov,/IndexedDB/); assert.match(gov,/Gemini API 키/);
});
