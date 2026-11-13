import test from 'node:test';
import assert from 'node:assert/strict';
import {setxBuild, setxParse, setxFileName, SETX_KIND, SETX_VERSION, SETX_KEYS} from '../src/live/settings-transfer.mjs';

const CAL = 'e142f88deed8876c3e0f96578c6ce1e03c725948bfd953c60cb56c28ab16c4fd@group.calendar.google.com';
const SETTINGS = {
  refreshMin: 10, notify: true, mailCount: 200, days: 14, fontSize: 'l', theme: 'dark', urgentWords: ['행정사무감사', ' 시의회 '],
  roles: {deptReceiver: true, distributor: false, sender: true, extra: 'x'},
  budget: [{project: 'A1', filter: 'B', label: '운영'}],
  rel: {mute: [{t: 'key', v: 'doc:1', label: '문서', at: 123, secret: 'REL_SECRET'}], mine: [{t: 'sender', v: '홍길동'}]},
  gcal: {email: 'me@gmail.com', mode: 'MONTH', cals: [{id: 'me@gmail.com', color: '#E7BA51', name: '1 Daily'}, {id: CAL, color: 'red', name: '4 BWYF 개인'}], synced: {k1: {at: 1}}},
  // 옮기면 안 되는 값
  seenVersion: '0.46.0', tourDone: true, noticeAck: 'v1', fabTipShown: true, palRecent: ['a'], paneWidth: 700, ai: {key: 'AIzaSECRET'}, key: 'AIzaSECRET',
};

test('setxBuild exports only allow-listed, sanitized settings', () => {
  const doc = JSON.parse(setxBuild(SETTINGS, {version: '0.47.0', now: new Date('2026-11-11T00:00:00Z')}));
  assert.equal(doc.kind, SETX_KIND); assert.equal(doc.format, SETX_VERSION); assert.equal(doc.app, '0.47.0');
  assert.equal(doc.exportedAt, '2026-11-11T00:00:00.000Z');
  for (const k of Object.keys(doc.settings)) assert.ok(SETX_KEYS.includes(k), k);
  const text = JSON.stringify(doc);
  for (const bad of ['AIzaSECRET', 'seenVersion', 'tourDone', 'noticeAck', 'fabTip', 'palRecent', 'paneWidth']) assert.ok(!text.includes(bad), bad);
  assert.deepEqual(doc.settings.roles, {deptReceiver: true, distributor: false, sender: true});
  assert.deepEqual(doc.settings.urgentWords, ['행정사무감사', '시의회']);
  assert.deepEqual(doc.settings.budget, [{project: 'A1', filter: 'B', label: '운영'}]);
  assert.equal(doc.settings.gcal.cals[0].color, '#e7ba51');
  assert.equal(doc.settings.gcal.cals[1].color, '');
  assert.equal(doc.settings.gcal.mode, 'MONTH');
  assert.equal('synced' in doc.settings.gcal, false);
  assert.deepEqual(doc.settings.rel, {mute: [{t: 'key', v: 'doc:1', label: '문서', at: 123}], mine: [{t: 'sender', v: '홍길동'}]});
  assert.ok(!text.includes('REL_SECRET'));
});

test('round trip: parse restores values and reports changed items', () => {
  const file = setxBuild(SETTINGS);
  const r = setxParse(file, {refreshMin: 5, theme: 'dark', fontSize: 'm'});
  assert.equal(r.ok, true);
  assert.equal(r.patch.refreshMin, 10); assert.equal(r.patch.fontSize, 'l');
  const labels = r.changed.map(c => c.label);
  assert.ok(labels.includes('자동 새로고침') && labels.includes('글자 크기') && labels.includes('구글 일정(계정·캘린더·색)'));
  assert.ok(r.same.includes('화면 테마'));
  assert.ok(!labels.includes('화면 테마'));
});

test('parse is idempotent: importing what is already set changes nothing', () => {
  const cur = JSON.parse(JSON.stringify(SETTINGS));
  const r = setxParse(setxBuild(cur), cur);
  assert.equal(r.ok, true); assert.equal(r.changed.length, 0);
});

test('parse rejects non-settings, broken, empty and newer-format files', () => {
  assert.equal(setxParse('not json').ok, false);
  assert.equal(setxParse('[]').ok, false);
  assert.equal(setxParse(JSON.stringify({kind: 'other', format: 1, settings: {}})).ok, false);
  assert.equal(setxParse(JSON.stringify({kind: SETX_KIND, format: 1, settings: {}})).ok, false);
  assert.equal(setxParse(JSON.stringify({kind: SETX_KIND, format: 1})).ok, false);
  const newer = setxParse(JSON.stringify({kind: SETX_KIND, format: SETX_VERSION + 1, settings: {theme: 'dark'}}));
  assert.equal(newer.ok, false); assert.match(newer.error, /업데이트/);
});

test('parse ignores unknown/secret keys and skips malformed values', () => {
  const file = JSON.stringify({kind: SETX_KIND, format: 1, settings: {
    theme: 'neon', refreshMin: 7, fontSize: 'xl', ai: {key: 'AIzaSECRET'}, seenVersion: '9', noticeAck: 'x', __proto__: {polluted: 1},
    gcal: {email: 'not an email', cals: []}, mailCount: 100,
  }});
  const r = setxParse(file, {fontSize: 'm', mailCount: 50});
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.patch).sort(), ['fontSize', 'mailCount']);
  assert.deepEqual(r.skipped.sort(), ['구글 일정(계정·캘린더·색)', '자동 새로고침', '화면 테마'].sort());
  assert.equal(({}).polluted, undefined);
});

test('gcal import converts old "extra" ids and drops duplicates', () => {
  const file = JSON.stringify({kind: SETX_KIND, format: 1, settings: {gcal: {email: 'me@gmail.com', extra: [CAL, CAL]}}});
  const r = setxParse(file, {});
  assert.deepEqual(r.patch.gcal.cals, [{id: CAL, color: '', name: ''}]);
});

test('setxFileName uses the Korean date', () => {
  assert.equal(setxFileName(new Date('2026-11-11T16:00:00Z')), 'GW비서_설정_2026-11-12.json');
  assert.equal(setxFileName(new Date('2026-11-11T00:00:00Z')), 'GW비서_설정_2026-11-11.json');
});

const fileWith = settings => JSON.stringify({kind: SETX_KIND, format: SETX_VERSION, settings});

test('invalid budget rows skip the whole setting rather than erase or partially replace it', () => {
  const current = {budget: [{project: 'A1', filter: '', label: '기존'}]};
  for (const budget of [[{project: '잘못된 코드!'}], [{project: 'A2'}, {project: '잘못된 코드!'}], [null], [{project: 123}], [...Array.from({length: 30}, () => ({project: 'A2'})), {project: '!'}]]) {
    const result = setxParse(fileWith({budget, theme: 'dark'}), current);
    assert.equal(result.ok, true);
    assert.equal('budget' in result.patch, false);
    assert.ok(result.skipped.includes('예산 관심 사업'));
    assert.equal('budget' in JSON.parse(setxBuild({budget})).settings, false);
  }
  assert.deepEqual(setxParse(fileWith({budget: []}), current).patch.budget, []);
  assert.equal(setxParse(fileWith({budget: [{project: '!'}]}), current).ok, false);
});

test('old calendar synced data is ignored on import and comparison', () => {
  const gcal = {email: 'me@gmail.com', cals: [], synced: {secret: 'GCAL_SECRET'}};
  const r = setxParse(fileWith({gcal}), {gcal: {...gcal, synced: {local: 1}}});
  assert.equal(r.ok, true);
  assert.equal('synced' in r.patch.gcal, false);
  assert.ok(r.same.includes('구글 일정(계정·캘린더·색)'));
  assert.ok(!setxBuild({gcal}).includes('GCAL_SECRET'));
});

test('relevance rules retain only supported fields and malformed lists are skipped', () => {
  const rel = {mute: [{t: 'kind', v: 'mail', label: '메일', at: 12, private: {secret: 'REL_SECRET'}}], mine: []};
  const result = setxParse(fileWith({rel}), {});
  assert.deepEqual(result.patch.rel, {mute: [{t: 'kind', v: 'mail', label: '메일', at: 12}], mine: []});
  assert.ok(!setxBuild({rel}).includes('REL_SECRET'));
  for (const bad of [{mute: [{t: 'key', v: 'ok'}, {t: 'unknown', v: 'x'}]}, {mute: 'bad'}, {mine: [{t: 'sender', v: 4}]}, {mine: [{t: 'key', v: 'x', at: 'bad'}]}]) {
    const r = setxParse(fileWith({rel: bad, theme: 'dark'}), {rel});
    assert.equal('rel' in r.patch, false);
    assert.ok(r.skipped.includes('내 일로/목록에서 뺀 지정'));
  }
  assert.deepEqual(setxParse(fileWith({rel: {}})).patch.rel, {mute: [], mine: []});
});
