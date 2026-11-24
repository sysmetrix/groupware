import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {setxBuild, setxFileName, setxParse} from '../src/live/settings-transfer.mjs';

const source = name => readFileSync(new URL(`../src/live/wc/${name}.js`, import.meta.url), 'utf8');
const use = (name, names, globals) => vm.runInNewContext(`${source(name)}\n;({${names}})`, {
  pgh: (title, subtitle, tools) => `<h1>${title}</h1>${subtitle || ''}${tools || ''}`,
  esc: v => String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`),
  ic: () => '', currentKey: 'me', getUserKey: () => 'me', ...globals,
});

test('attendance separates checks, original record and monthly export', () => {
  const S = {raw:{data:{attendance:{requestUrl:'/apply'}}}, a:{actions:[{type:'attendance', ref:{date:'20261102'}}]},
    att:{month:'202611', rows:[{date:'20261102', result:'정상'}], day:'20261102'}};
  const {vAttendance} = use('11-attendance', 'vAttendance', {S, today:()=> '2026-11-24',
    R:{kstNow:()=> ({y:2026,m:11,d:24}), appInfoLine:()=> ''}, hm4:String, fmtDays:String, mins:String,
    ymd8:String, myAppInfos:()=> [], WD:[], actionRow:()=> '<button data-act="markDone">완료 처리</button>'});
  const html = vAttendance();
  for (const label of ['오늘 근태', '연차 잔여', '시간외 신청일 퇴근 지문 확인', '월별 근태 달력', '올해 연차·휴가 사용 내역']) assert.ok(html.includes(`aria-label="${label}"`), label);
  assert.match(html, /완료 처리.*GW 비서에만.*그룹웨어 근태 기록은 바뀌지 않습니다/);
  assert.match(html, /그룹웨어 근태 상태 정상/);
  assert.match(html, /data-url="\/apply"[^>]*>그룹웨어에서 근태신청/);
  assert.match(html, /data-act="csvAtt"[^>]*>이 달 근태 CSV 저장/);
  S.att.busy = true;
  assert.doesNotMatch(vAttendance(), /data-act="csvAtt"|그룹웨어 근태 상태 정상/);
});

test('recent alert copy is contextual and a cancelled open leaves read state alone', () => {
  let accept = false;
  const writes = [];
  const {NTF, vNotifications, notificationsSearch, openNotification} = use('38-notifications-people', 'NTF,vNotifications,notificationsSearch,openNotification', {
    S:{view:'notifications'}, URL, location:{href:'https://gw.example/'}, openUrl:()=> accept,
    GW:{readAlert:async id => writes.push(id)}, $:()=> ({value:'계약'}), renderMain:()=> {},
  });
  NTF.items = [{id:'a', title:'계약 <검토>', url:'/alert'}];
  notificationsSearch();
  const html = vNotifications();
  assert.match(html, /최근 알림 최대 100건/);
  assert.match(html, /최근 조회 범위에서 검색/);
  assert.match(html, /전체 알림 수가 아닌 조회 범위/);
  assert.match(html, /data-act="copy" data-v="계약 &#60;검토&#62;" aria-label="계약 &#60;검토&#62; 알림 제목 복사">제목 복사/);
  openNotification(0);
  assert.ok(!NTF.items[0].read);
  assert.deepEqual(writes, []);
  accept = true;
  openNotification(0);
  openNotification(0);
  assert.equal(NTF.items[0].read, true);
  assert.deepEqual(writes, ['a']);
});

test('people distinguish global name search from filtering fetched rows', () => {
  const {PEOPLE, vPeople} = use('38-notifications-people', 'PEOPLE,vPeople', {});
  PEOPLE.items = [{name:'김하나', tel:'0123'}];
  let html = vPeople();
  assert.match(html, /for="peopleQuery">그룹웨어 전체에서 직원 이름 검색/);
  assert.match(html, /for="peopleFilter"[^>]*>조회된 이름 검색 결과 표에서만 찾기/);
  assert.match(html, /data-v="0123" aria-label="김하나 전화번호 복사">전화번호 복사/);
  PEOPLE.org = '전략경영실';
  html = vPeople();
  assert.match(html, /전략경영실 구성원/);
  assert.match(html, /for="peopleFilter"[^>]*>선택한 부서 구성원 표에서만 찾기/);
  assert.doesNotMatch(html, /조회된 이름 검색 결과 표에서만 찾기/);
});

test('settings label the allowlisted file and keep destructive actions behind confirmation', async () => {
  const S = {settings:{theme:'dark', budget:[], ai:{key:'not-exported'}, todos:['not-exported']}};
  const downloads = [], prompts = [];
  const {vSettings, settingsExport, settingsImport} = use('12-report-settings', 'vSettings,settingsExport,settingsImport', {
    S, window:{}, document:{documentElement:{dataset:{}}}, localStorage:{getItem:()=> null,length:0},
    getPrefix:()=> 'me:', rel:()=> ({mute:[],mine:[]}), VERSION:'1.0', GW:{readOnlyEndpoints:()=> []},
    R:{setxBuild,setxFileName,setxParse}, download:(...v)=> downloads.push(v), toast:()=> {},
    confirm: msg => { prompts.push(msg); return false; },
  });
  const html = vSettings();
  for (const label of ['업무·조회', '화면·알림·업데이트', '예산', '이 PC에 저장된 자료']) assert.ok(html.includes(`<h2>${label}</h2>`), label);
  assert.match(html, /자료 백업이 아닙니다/);
  assert.match(html, /data-act="setExport">설정만 내보내기 \(JSON\)/);
  assert.match(html, /<section aria-label="위험 구역">(?:(?!<\/section>).)*data-act="resetAll"/s);
  assert.match(source('16-events'), /case 'resetAll': if \(confirm\(/);
  settingsExport();
  assert.deepEqual(JSON.parse(downloads[0][1]).settings, {theme:'dark', budget:[]});
  await settingsImport({files:[{size:500, text:async ()=> setxBuild({theme:'light'})}]});
  assert.match(prompts[0], /화면 테마.*덮어쓰입니다/s);
  assert.equal(S.settings.theme, 'dark');
});
