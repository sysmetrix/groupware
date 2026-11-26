// v1.21 날짜 고르기 통일: 모든 날짜 칸이 할 일과 같은 날짜 버튼·요일 달력(57번 조각)을 쓴다
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../src/live/wc/', import.meta.url);
const src = readFileSync(new URL('57-date-picker.js', dir), 'utf8');

function load() {
  const els = {};
  const events = [];
  const mk = (id, value = '') => (els[id] = {id, value, dispatchEvent: e => events.push([id, e.type, els[id].value])});
  const layer = {dataset: {}, innerHTML: '', querySelector: () => null, querySelectorAll: () => []};
  const ctx = {
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]),
    ic: () => '<svg></svg>', today: () => '2026-11-25', setTimeout: () => 0, HOME_ACTS: {},
    $: s => s === '#dpLayer' ? layer : els[s.slice(1)] || null,
    root: {querySelector: () => null, activeElement: null},
    Event: class { constructor(type) { this.type = type; } },
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\n;globalThis.api = {dateText, dateField, dpOpen, dpPick, dpIsOpen, dpClose};', ctx);
  return {api: ctx.api, mk, els, events, layer, ctx};
}

test('날짜 글자: 날짜와 요일을 함께, 잘못된 값은 빈 문구', () => {
  const {api} = load();
  assert.equal(api.dateText('2026-11-25'), '2026. 11. 25. (수)');
  assert.equal(api.dateText(''), '날짜 선택');
  assert.equal(api.dateText('2026-13-40', '날짜 없음'), '날짜 없음');
});

test('날짜 칸: 숨은 값 칸과 날짜 버튼, 글자는 이스케이프', () => {
  const {api} = load();
  const h = api.dateField('wkFrom', '2026-11-21', '시작<일>');
  assert.match(h, /<input type="hidden" id="wkFrom" value="2026-11-21">/);
  assert.match(h, /data-act="dpOpen" data-id="wkFrom"/);
  assert.match(h, /2026\. 11\. 21\. \(토\)/);
  assert.match(h, /시작&lt;일&gt;/);
  assert.match(api.dateField('x', '', '기한', {disabled: true}), / disabled>/);
});

test('달력: 요일 행, 오늘·선택 표시, 범위 밖 날짜는 고를 수 없음', () => {
  const {api, mk, layer} = load();
  mk('cduTo', '2026-11-20');
  api.dateField('cduTo', '2026-11-20', '종료일', {min: '2026-11-10'});
  api.dpOpen('cduTo');
  assert.ok(api.dpIsOpen());
  const h = layer.innerHTML;
  for (const w of ['일', '월', '화', '수', '목', '금', '토']) assert.match(h, new RegExp(`td-cal-week[^>]*>${w}<`));
  assert.match(h, /2026년 11월/);
  assert.match(h, /data-v="2026-11-20" tabindex="0"[^>]*aria-pressed="true"/);
  assert.match(h, /class="td-cal-day today[^"]*"[^>]*data-v="2026-11-25"/);
  assert.match(h, /data-v="2026-11-09"[^>]*고를 수 없음[^>]* disabled/);
  assert.match(h, /이후만 고를 수 있습니다/);
  assert.doesNotMatch(h, /날짜 지우기/); // 지우기는 허용한 칸만
  assert.match(h, /data-act="dpClose" data-stop="1"/); // 뒤 창(명령 창 등)을 닫지 않는다
});

test('짝 칸은 막지 않고 옮긴다: 시작·기한이 모두 오늘이어도 시작일에 미래를 고를 수 있다', () => {
  const {api, mk, els, events, layer} = load();
  mk('tdeStart', '2026-11-25'); mk('tdeDue', '2026-11-25');
  api.dateField('tdeStart', '2026-11-25', '시작일', {clear: true, maxOf: 'tdeDue'});
  api.dateField('tdeDue', '2026-11-25', '기한(종료일)', {clear: true, minOf: 'tdeStart'});
  api.dpOpen('tdeStart');
  assert.doesNotMatch(layer.innerHTML, /disabled/); // 다음 달·미래 날짜·오늘 모두 고를 수 있다
  assert.match(layer.innerHTML, /기한\(종료일\)보다 뒤를 고르면 기한\(종료일\)도 같은 날로 옮깁니다/);
  api.dpPick('tdeStart', '2026-12-03');
  assert.equal(els.tdeStart.value, '2026-12-03');
  assert.equal(els.tdeDue.value, '2026-12-03');
  assert.deepEqual(events.slice(-2), [['tdeDue', 'input', '2026-12-03'], ['tdeDue', 'change', '2026-12-03']]);
  api.dpOpen('tdeDue');
  api.dpPick('tdeDue', '2026-11-30'); // 기한을 시작일보다 앞으로 고르면 시작일도 따라온다
  assert.equal(els.tdeStart.value, '2026-11-30');
  const n = events.length;
  api.dpPick('tdeDue', '2026-12-10'); // 범위 안이면 짝 칸은 그대로
  assert.equal(els.tdeStart.value, '2026-11-30');
  assert.equal(events.length, n + 2);
});

test('고르면 값이 바뀌고 input·change를 보내 기존 처리기가 받는다', () => {
  const {api, mk, events, layer} = load();
  mk('resDate', '2026-11-25');
  api.dateField('resDate', '2026-11-25', '예약 날짜');
  api.dpOpen('resDate');
  api.dpPick('resDate', '2026-11-27');
  assert.equal(layer.innerHTML, '');
  assert.equal(api.dpIsOpen(), false);
  assert.deepEqual(events, [['resDate', 'input', '2026-11-27'], ['resDate', 'change', '2026-11-27']]);
  api.dpPick('resDate', ''); // 지우기를 허용하지 않은 칸은 빈 값으로 바뀌지 않는다
  assert.equal(events.length, 2);
});

test('브라우저 기본 날짜 칸이 남지 않는다(공용 날짜 고르기가 없을 때의 예비만 허용)', () => {
  for (const name of readdirSync(dir).filter(n => n.endsWith('.js'))) {
    const s = readFileSync(new URL(name, dir), 'utf8');
    for (const m of s.matchAll(/type=\\?["'](date|datetime-local|month)["\\]/g)) {
      const before = s.slice(Math.max(0, m.index - 400), m.index);
      assert.match(before, /typeof dateField === 'function' \?/, `${name}: 기본 날짜 칸 사용`);
    }
  }
  const events = readFileSync(new URL('16-events.js', dir), 'utf8');
  assert.match(events, /case 'dpOpen': case 'dpMonth': case 'dpPick': case 'dpClose':/);
  assert.doesNotMatch(events, /tdDateOpen/);
  const keys = readFileSync(new URL('04-timers-keys.js', dir), 'utf8');
  assert.match(keys, /dpIsOpen\(\)\) \{ dpKey\(e\); return; \}/);
});
