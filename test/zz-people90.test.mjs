import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../src/live/wc/38-notifications-people.js', import.meta.url), 'utf8');
function harness(overrides = {}) {
  const elements = {};
  const context = vm.createContext({
    URL, location: {href:'https://gw.example/#/home', origin:'https://gw.example'},
    currentKey:'A', getUserKey:() => 'A', S:{view:'people'}, GW:{},
    esc: value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    pgh: (title, subtitle = '', actions = '') => title + subtitle + actions,
    renderMain: () => {}, toast: () => {}, openUrl: () => {},
    root:{querySelectorAll:() => []}, $: id => elements[id], ...overrides,
  });
  vm.runInContext(source + '\n globalThis.api = {NTF, PEOPLE, vNotifications, notificationsSearch, notificationsPage, openNotification, loadNotifications, vPeople, peopleFilterRows, peopleSearch, peopleDept, peopleLoadTree};', context);
  return {...context.api, context, elements};
}
const alerts = count => Array.from({length:count}, (_, i) => ({title:'Title '+i, who:'Sender '+i, time:'202611151200', type:'MAIL', url:'/alert/'+i, read:false}));

test('notification pages cap DOM at 25 and preserve original open indices', () => {
  const h = harness(); h.NTF.items = alerts(61);
  let html = h.vNotifications();
  assert.equal((html.match(/<article /g) || []).length,25);
  assert.match(html,/1–25 \/ 조건에 맞는 61건/);
  h.notificationsPage(2); html = h.vNotifications();
  assert.match(html,/data-i="25"/); assert.doesNotMatch(html,/data-i="0"/);
  assert.match(html,/26–50/);
  h.notificationsPage(999); html = h.vNotifications();
  assert.equal((html.match(/<article /g) || []).length,11);
  assert.match(html,/51–61/);
});

test('notification search finds title, sender and department and resets page', () => {
  const h = harness(); h.NTF.items = alerts(60); h.NTF.page = 3;
  h.elements['#notificationsQuery'] = {value:'Sender 42'};
  h.notificationsSearch(); const html = h.vNotifications();
  assert.equal(h.NTF.page,1); assert.equal((html.match(/<article /g) || []).length,1);
  assert.match(html,/data-i="42"/);
  h.NTF.items[42].dept = 'Strategy'; h.elements['#notificationsQuery'].value = 'STRATEGY';
  h.notificationsSearch(); assert.match(h.vNotifications(),/data-i="42"/);
});

test('notification filter changes cannot leave an out-of-range page', () => {
  const h = harness(); h.NTF.items = alerts(60); h.NTF.items[0].type = ''; h.NTF.type = '기타'; h.NTF.page = 3;
  assert.match(h.vNotifications(),/data-i="0"/); assert.equal(h.NTF.page,1);
});

test('unsafe notification URLs offer a native list and escaped title copy, never open', () => {
  const opened = []; const h = harness({openUrl:url=>opened.push(url)});
  h.NTF.items = [{title:'<script>',url:'javascript:alert(1)'}, {url:'https://user:pw@gw.example/'}, {url:'/safe'}];
  const html = h.vNotifications();
  assert.match(html,/data-act="nativeNotifications"/); assert.match(html,/data-v="&lt;script&gt;"/);
  h.openNotification(0); h.openNotification(1); h.openNotification(2);
  assert.deepEqual(opened,['https://gw.example/safe']);
});

test('notification loading, empty and failure states are accessible and distinct', async () => {
  const h = harness({GW:{collect:async()=>({status:{alerts:{ok:false,message:'offline'}}})}});
  h.NTF.loading = true; assert.match(h.vNotifications(),/aria-busy="true"/);
  h.NTF.loading = false; h.NTF.items = []; assert.match(h.vNotifications(),/조건에 맞는 알림이 없습니다/);
  await h.loadNotifications(); const html = h.vNotifications();
  assert.match(html,/role="alert"/); assert.match(html,/offline/);
  assert.doesNotMatch(html,/조건에 맞는 알림이 없습니다/);
});

test('people search exposes 50-result cap and unknown total without claiming completeness', () => {
  const h = harness(); h.PEOPLE.items = Array.from({length:50},(_,i)=>({name:'Person '+i}));
  let html = h.vPeople(); assert.match(html,/최대 50건/); assert.match(html,/전체 결과가 아닐 수/);
  h.PEOPLE.items = [{name:'One'}]; h.PEOPLE.total = 80;
  html = h.vPeople(); assert.match(html,/80건 중 1건 조회됨/); assert.match(html,/최대 50건/);
  h.PEOPLE.org = 'Department'; html = h.vPeople(); assert.doesNotMatch(html,/최대 50건/);
});

test('people local filter shows empty row and a live result count', () => {
  const h = harness(); h.PEOPLE.items = [{name:'One',email:'one@example.org'}]; h.PEOPLE.localFilter = 'missing';
  const html = h.vPeople(); assert.match(html,/id="peopleFilterEmpty" >/); assert.match(html,/aria-live="polite">0명 표시/);
  const rows = [{dataset:{search:'one'},hidden:false}]; const empty = {hidden:true}, count = {};
  h.context.root.querySelectorAll = () => rows;
  h.elements['#peopleFilterEmpty'] = empty; h.elements['#peopleFilterCount'] = count;
  h.peopleFilterRows(); assert.equal(rows[0].hidden,true); assert.equal(empty.hidden,false); assert.equal(count.textContent,'0명 표시');
  h.PEOPLE.localFilter = 'one'; h.peopleFilterRows(); assert.equal(empty.hidden,true); assert.equal(count.textContent,'1명 표시');
});

test('people original recipient indices survive filtering and empty API results are explicit', () => {
  const h = harness(); h.PEOPLE.items = [{name:'Hidden'}, {name:'Visible',email:'visible@example.org'}]; h.PEOPLE.localFilter='Visible';
  assert.match(h.vPeople(),/data-act="personMail" data-i="1"/);
  h.PEOPLE.items = []; assert.match(h.vPeople(),/조회된 직원이 없습니다/);
  h.PEOPLE.tree = []; assert.match(h.vPeople(),/조회된 부서가 없습니다/);
});

test('people API errors cannot masquerade as empty results', async () => {
  const h = harness({GW:{organizationMembers:async()=>null,organizationTree:async()=>null}});
  h.PEOPLE.tree = [{key:'d1',name:'Department'}]; await h.peopleDept('d1');
  assert.match(h.vPeople(),/직원 조회 실패/); assert.equal(h.PEOPLE.items,null);
  await h.peopleLoadTree(); assert.match(h.PEOPLE.treeError,/응답/);
});

test('people total counts are validated and latest request wins', async () => {
  const pending = []; const h = harness({GW:{search:()=>new Promise(resolve=>pending.push(resolve))}});
  h.PEOPLE.query = 'Alpha'; const first = h.peopleSearch();
  h.PEOPLE.query = 'Bravo'; const second = h.peopleSearch();
  pending[1]({groups:{person:{items:[{name:'Bravo'}],reliableTotal:-1}}}); await second;
  pending[0]({groups:{person:{items:[{name:'Alpha'}],reliableTotal:1}}}); await first;
  assert.equal(h.PEOPLE.items[0].name,'Bravo'); assert.equal(h.PEOPLE.total,null); assert.equal(h.PEOPLE.loading,false);
});

test('late people result is discarded after account change', async () => {
  let resolve; const h = harness({GW:{search:()=>new Promise(r=>{resolve=r;})}});
  h.PEOPLE.query='Alpha'; const request=h.peopleSearch(); h.context.getUserKey=()=> 'B';
  resolve({groups:{person:{items:[{name:'Private'}],reliableTotal:1}}}); await request;
  assert.equal(h.PEOPLE.items,null); assert.doesNotMatch(h.vPeople(),/Private/);
});
