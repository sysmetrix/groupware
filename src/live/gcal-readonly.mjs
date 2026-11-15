// Standalone, opt-in Calendar API experiment. Not wired into the workcenter.
export const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

// Call synchronously from an explicit user gesture. The GIS script must be supplied
// by the host; this module never loads remote scripts or persists credentials.
export function requestCalendarAccess({ google, clientId, timeoutMs = 120000 }) {
  if (!google?.accounts?.oauth2?.initTokenClient || typeof clientId !== 'string' || !clientId.trim()) {
    throw new TypeError('Google Identity Services and an OAuth client ID are required');
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
    const timer = setTimeout(() => finish(reject, new Error('Authorization timed out or was closed')), timeoutMs);
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(), scope: CALENDAR_EVENTS_SCOPE,
        callback: result => {
          if (result?.error || !result?.access_token || !google.accounts.oauth2.hasGrantedAllScopes(result, CALENDAR_EVENTS_SCOPE)) {
            finish(reject, new Error('Calendar authorization was denied or scope was not granted'));
          } else finish(resolve, { accessToken: result.access_token, expiresIn: result.expires_in });
        },
        error_callback: () => finish(reject, new Error('Calendar authorization failed or was closed')),
      });
      client.requestAccessToken();
    } catch { finish(reject, new Error('Calendar authorization could not start')); }
  });
}

// Results are complete or this function throws. Never infer absence from an error.
export async function listCalendarEvents({ accessToken, calendarId, timeMin, timeMax, fetchImpl = globalThis.fetch, maxPages = 20, signal }) {
  if (typeof accessToken !== 'string' || !accessToken || /[\r\n]/.test(accessToken)) throw new TypeError('Access token required');
  if (typeof calendarId !== 'string' || !calendarId.trim() || calendarId.length > 1024) throw new TypeError('Calendar ID required');
  const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!rfc3339.test(timeMin) || !rfc3339.test(timeMax) || !Number.isFinite(Date.parse(timeMin)) || !Number.isFinite(Date.parse(timeMax)) || Date.parse(timeMin) >= Date.parse(timeMax)) throw new TypeError('A valid bounded RFC3339 time range is required');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('Invalid page limit');
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const events = [], seen = new Set();
  let pageToken;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(base);
    for (const [key, value] of Object.entries({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', maxResults: '250' })) url.searchParams.set(key, value);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    let response;
    try { response = await fetchImpl(url.href, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'omit', redirect: 'error', cache: 'no-store', signal }); }
    catch { throw new Error('Calendar request failed'); }
    if (!response.ok) throw new Error(`Calendar request failed (HTTP ${Number(response.status) || 0})`);
    let data;
    try { data = await response.json(); } catch { throw new Error('Invalid Calendar response'); }
    if (!data || !Array.isArray(data.items)) throw new Error('Invalid Calendar response');
    events.push(...data.items);
    if (!data.nextPageToken) return { events, calendarId, timeMin, timeMax, complete: true, fetchedAt: new Date().toISOString() };
    if (typeof data.nextPageToken !== 'string' || seen.has(data.nextPageToken)) throw new Error('Invalid Calendar pagination');
    seen.add(data.nextPageToken);
    pageToken = data.nextPageToken;
  }
  throw new Error('Calendar page limit reached; result is incomplete');
}
