// GW 비서 · 구글 캘린더 읽기 도우미 (확장 프로그램 서비스 워커)
// 하는 일: 그룹웨어 화면의 GW 비서가 "이 날짜들의 구글 일정을 읽어 달라"고 하면, 보이지 않는 탭에서 구글 캘린더 일 보기를 열어
//         일정 문장만 읽어 돌려준다. 구글 캘린더를 고치거나 저장하지 않는다(읽기 전용). 구글 로그인 정보·쿠키는 읽지 않는다.
// 안전: 그룹웨어(gw.bwyf.or.kr) 화면에서 온 요청만 받고, 날짜는 형식·범위·개수를 확인한다. 한 번에 한 작업만 한다.
'use strict';

const GW_ORIGIN = 'https://gw.bwyf.or.kr';
const CAL_HOST = 'calendar.google.com';
const MAX_DATES = 60;
const WORKERS = 4;
const SESSION_TABS_KEY = 'gcalWorkerTabs';

let busy = false;
let tabTrackQ = Promise.resolve();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sessStore = () => (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) || null;
function trackTab(id, add) {
  const st = sessStore();
  if (!st || typeof id !== 'number') return Promise.resolve();
  tabTrackQ = tabTrackQ.then(async () => {
    try {
      const cur = (await st.get(SESSION_TABS_KEY))[SESSION_TABS_KEY];
      const set = new Set(Array.isArray(cur) ? cur : []);
      if (add) set.add(id); else set.delete(id);
      await st.set({[SESSION_TABS_KEY]: [...set]});
    } catch (e) { /* ignore */ }
  });
  return tabTrackQ;
}
async function cleanupOrphanTabs(force = false) {
  const st = sessStore();
  if (!st || (!force && busy)) return;
  await tabTrackQ;
  try {
    const cur = (await st.get(SESSION_TABS_KEY))[SESSION_TABS_KEY];
    if (!Array.isArray(cur) || !cur.length) return;
    await st.set({[SESSION_TABS_KEY]: []});
    for (const id of cur) { try { await chrome.tabs.remove(id); } catch (e) { /* 이미 닫힘 */ } }
  } catch (e) { /* ignore */ }
}
if (typeof chrome !== 'undefined' && chrome.runtime) {
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => { cleanupOrphanTabs(); });
  if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener(() => { cleanupOrphanTabs(); });
}

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{8}$/.test(s)) return false;
  const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
  if (y < 2020 || y > 2035) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const dayUrl = s => `https://${CAL_HOST}/calendar/u/0/r/day/${s.slice(0, 4)}/${+s.slice(4, 6)}/${+s.slice(6, 8)}?pli=1`;

// 구글 탭 안에서 실행된다(자기 완결 함수여야 한다).
function readDay() {
  const els = [...document.querySelectorAll('[data-eventid]')];
  const texts = [...new Set(els.map(e => e.innerText.replace(/\s+/g, ' ').trim()))].filter(Boolean);
  return {texts, host: location.host, href: location.href, main: !!document.querySelector('[role="main"]')};
}

// 구글 탭은 보이지 않을 때 "로드 완료" 신호가 늦거나 오지 않는다. 신호를 기다리지 않고 주소만 바꾼 뒤, 화면이 정말 그 날짜의 일 보기인지 직접 확인하며 읽는다.
async function readOne(tabId, ymd, careful) {
  const want = new RegExp('/day/' + ymd.slice(0, 4) + '/' + +ymd.slice(4, 6) + '/' + +ymd.slice(6, 8) + '(?:[/?#]|$)');
  try { await chrome.tabs.update(tabId, {url: dayUrl(ymd)}); } catch (e) { return {error: 'timeout', why: 'nav:' + String(e && e.message || e).slice(0, 80)}; }
  const t0 = Date.now();
  let last = '', stable = 0, why = 'no-render';
  while (Date.now() - t0 < (careful ? 40000 : 30000)) {
    await sleep(400);
    let r;
    try { const out = await Promise.race([chrome.scripting.executeScript({target: {tabId}, func: readDay}), sleep(8000).then(() => { throw new Error('script-hang'); })]); r = out && out[0] && out[0].result; } catch (e) { why = 'script:' + String(e && e.message || e).slice(0, 80); continue; }
    if (!r) continue;
    if (r.host !== CAL_HOST) return {error: 'login'};
    let path = '';
    try { path = new URL(r.href).pathname; } catch (e) { /* ignore */ }
    if (!want.test(path)) { why = 'old-page'; last = ''; stable = 0; continue; }
    why = r.texts.length ? 'unstable' : (r.main ? 'empty-day-wait' : 'no-main');
    const key = JSON.stringify(r.texts);
    stable = key === last ? stable + 1 : 0;
    last = key;
    const el = Date.now() - t0;
    if (r.texts.length && stable >= (careful ? 10 : 6) && el >= (careful ? 6000 : 3500)) return {texts: r.texts};
    if (!r.texts.length && r.main && el >= (careful ? 14000 : 9000)) return {texts: []};
  }
  return {error: 'timeout', why};
}

async function readDays(dates, careful, onProgress, aborted) {
  const days = {}, why = {}, queue = dates.slice();
  let done = 0, loginError = false;
  const tabs = [];
  const worker = async () => {
    let tab;
    try { tab = await chrome.tabs.create({url: 'about:blank', active: false}); tabs.push(tab.id); await trackTab(tab.id, true); } catch (e) { return; }
    while (queue.length && !aborted() && !loginError) {
      const ymd = queue.shift();
      const r = await readOne(tab.id, ymd, careful);
      if (r.error === 'login') loginError = true;
      days[ymd] = r.texts || null; // null = 읽지 못함(대조 화면에서 "미확인"으로 남는다)
      if (r.why) why[ymd] = r.why;
      done++;
      onProgress(done, dates.length);
    }
  };
  try { await Promise.all(Array.from({length: Math.min(careful ? 2 : WORKERS, dates.length)}, worker)); }
  finally { for (const id of tabs) { try { await chrome.tabs.remove(id); } catch (e) { /* 이미 닫힘 */ } await trackTab(id, false); } }
  return {days, why, loginError};
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'gcal-read' || !port.sender || port.sender.origin !== GW_ORIGIN) { try { port.disconnect(); } catch (e) { /* ignore */ } return; }
  let gone = false;
  port.onDisconnect.addListener(() => { gone = true; });
  const send = m => { if (!gone) { try { port.postMessage(m); } catch (e) { /* ignore */ } } };
  port.onMessage.addListener(async msg => {
    const dates = msg && Array.isArray(msg.dates) ? [...new Set(msg.dates)] : [];
    if (!dates.length || dates.length > MAX_DATES || !dates.every(validDate)) { send({type: 'result', ok: false, error: 'bad-dates'}); return; }
    if (busy) { send({type: 'result', ok: false, error: 'busy'}); return; }
    busy = true;
    try {
      await cleanupOrphanTabs(true);
      const {days, why, loginError} = await readDays(dates.sort(), !!msg.careful, (done, total) => send({type: 'progress', done, total}), () => gone);
      if (loginError) send({type: 'result', ok: false, error: 'login'});
      else send({type: 'result', ok: true, days, why});
    } catch (e) {
      send({type: 'result', ok: false, error: 'failed'});
    } finally { busy = false; }
  });
});
