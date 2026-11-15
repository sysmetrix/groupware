import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR_EVENTS_SCOPE, requestCalendarAccess, listCalendarEvents } from '../src/live/gcal-readonly.mjs';
const base = { accessToken:'secret', calendarId:'team@example.com', timeMin:'2026-11-01T00:00:00+09:00', timeMax:'2026-12-01T00:00:00+09:00' };
const ok = data => ({ ok:true, json:async()=>data });
test('explicit GIS request uses only events readonly scope and rejects missing consent', async () => {
  let config, requested = 0;
  const google = {accounts:{oauth2:{initTokenClient:c => { config=c; return {requestAccessToken(){ requested++; c.callback({access_token:'x', expires_in:3600}); }}; }, hasGrantedAllScopes:(_r,s)=>s===CALENDAR_EVENTS_SCOPE}}};
  assert.deepEqual(await requestCalendarAccess({google,clientId:'client'}),{accessToken:'x',expiresIn:3600});
  assert.equal(requested,1); assert.equal(config.scope,CALENDAR_EVENTS_SCOPE);
  google.accounts.oauth2.hasGrantedAllScopes=()=>false;
  await assert.rejects(requestCalendarAccess({google,clientId:'client'}),/scope/);
});
test('closed authorization times out, or error callback rejects', async () => {
  const google={accounts:{oauth2:{initTokenClient:()=>({requestAccessToken(){}})}}};
  await assert.rejects(requestCalendarAccess({google,clientId:'client',timeoutMs:5}),/timed out/);
  google.accounts.oauth2.initTokenClient=c=>({requestAccessToken(){c.error_callback({type:'popup_closed'});}});
  await assert.rejects(requestCalendarAccess({google,clientId:'client'}),/closed/);
});
test('reads every page via restricted GET with no cookie or redirect', async () => {
  const calls=[]; const fetchImpl=async (url,opts)=>{calls.push({url,opts}); return ok(calls.length===1?{items:[{id:'a'}],nextPageToken:'next'}:{items:[{id:'b'}]});};
  const result=await listCalendarEvents({...base,fetchImpl});
  assert.deepEqual(result.events.map(e=>e.id),['a','b']); assert.equal(result.complete,true);
  const url=new URL(calls[0].url); assert.equal(url.origin,'https://www.googleapis.com'); assert.equal(url.pathname,'/calendar/v3/calendars/team%40example.com/events');
  assert.equal(url.searchParams.get('singleEvents'),'true'); assert.equal(url.searchParams.get('showDeleted'),'false');
  assert.equal(calls[0].opts.method,'GET'); assert.equal(calls[0].opts.credentials,'omit'); assert.equal(calls[0].opts.redirect,'error'); assert.equal(calls[0].opts.headers.Authorization,'Bearer secret');
  assert.equal(new URL(calls[1].url).searchParams.get('pageToken'),'next');
});
test('failures and incomplete pages never appear as empty calendars', async () => {
  await assert.rejects(listCalendarEvents({...base,fetchImpl:async()=>({ok:false,status:403})}),/HTTP 403/);
  await assert.rejects(listCalendarEvents({...base,fetchImpl:async()=>ok({})}),/Invalid/);
  await assert.rejects(listCalendarEvents({...base,maxPages:1,fetchImpl:async()=>ok({items:[],nextPageToken:'x'})}),/incomplete/);
  await assert.rejects(listCalendarEvents({...base,fetchImpl:async()=>ok({items:[],nextPageToken:'x'})}),/pagination/);
  await assert.rejects(listCalendarEvents({...base,fetchImpl:async()=>{throw new Error('secret');}}), e=>!e.message.includes('secret'));
});
test('rejects invalid input before network', async () => {
  let count=0; const fetchImpl=async()=>{count++;};
  for (const bad of [{timeMax:base.timeMin},{timeMin:'2026-11-01'}, {accessToken:'x\ny'}, {calendarId:''}, {maxPages:101}]) await assert.rejects(listCalendarEvents({...base,...bad,fetchImpl}),TypeError);
  assert.equal(count,0);
});
