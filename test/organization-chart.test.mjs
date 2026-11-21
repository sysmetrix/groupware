import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/live/wc/38-notifications-people.js', import.meta.url), 'utf8');
const official = ['이사장','대표이사','윤리감사','전략경영실','부천시여성회관','부천여성청소년센터','부천시청소년센터','산울림청소년센터','소사청소년센터','부천시청소년상담복지센터','부천시건강가정지원센터','고리울청소년센터','부천시일쉼지원센터'];

function fixture() {
  const PEOPLE = {query:'',items:null,total:null,loading:false,error:'',seq:0,tree:null,treeError:'',orgLoading:false,orgSeq:0,org:'',orgNote:'',localFilter:''};
  const rows = {
    d1:[{name:'정식',email:'same@example.com'},{name:'무효1',email:'invalid-email'}],
    d2:[{name:'분리중복',email:'SAME@example.com'},{name:'무효2',email:'invalid-email'},{name:'분리신규',email:'new@example.com'}]
  };
  const ctx = {PEOPLE,currentKey:'account',getUserKey:()=> 'account',S:{view:''},renderMain:()=>{},esc:String,
    GW:{organizationTree:async()=>[
      {key:'d1',name:'부천시여성회관',count:1},{key:'d2',name:'부천시여성회관(지점)',count:3},{key:'d3',name:'노동조합 감사관',count:1},
      {key:'b1',name:'부천시여성회관',count:9},{key:'c1',name:'재단',count:9},{key:'노사협의회',name:'노사협의회',count:1}
    ],organizationMembers:async key=> { if (key === 'd2' && ctx.failBranch) throw new Error('branch failed'); return rows[key] || []; }}};
  const begin = source.indexOf('  const PEOPLE_OFFICIAL_ORG');
  const end = source.indexOf('  async function peopleSearch()');
  vm.createContext(ctx);
  vm.runInContext(source.slice(begin,end) + ';globalThis.orgTest={peopleAutoStart,peopleLoadTree,peopleDept,peopleUniqueMembers,peopleDisplayDept,peopleOfficialTree,peopleOfficialOrganization};',ctx);
  return {ctx,PEOPLE};
}

test('공식 조직도는 지정 순서와 중첩 목록 계층을 가진다', () => {
  let previous = -1;
  for (const name of official) { const index = source.indexOf(`name:'${name}'`); assert.ok(index > previous, `${name}의 공식 순서가 필요합니다`); previous = index; }
  for (const removed of ['이사회','전략기획부','경영지원부']) assert.equal(source.includes(`{name:'${removed}'`), false, `${removed}는 조직도에서 빠져야 합니다`);
  assert.match(source, /PEOPLE_HIDDEN_ORG = new Set\(\['이사회', '전략기획부', '경영지원부'\]\)/);
  assert.match(source, /<ul class="org-chart" aria-label="공식 조직 계층">/);
  assert.match(source, /peopleOrgListItem\(chair, peopleOrgListItem\(ceo, peopleOrgListItem\(ethics\)/);
  assert.doesNotMatch(source, /style="margin-left:/);
});

test('조직도는 d 숫자 키만 선택 데이터로 읽고 비숫자 조직은 제외한다', async () => {
  const f = fixture(); await f.ctx.orgTest.peopleLoadTree();
  assert.deepEqual(Array.from(f.PEOPLE.tree, x => x.key), ['d1','d2','d3']);
  assert.match(source, /\^d\[0-9\]\+\$/);
  assert.match(source, /노사협의회 등은 현재 조직도 API 조회 대상이 아닙니다/);
});

test('분리 키는 숨기고 유효 이메일만 중복 제거하며 숨은 속성도 정리한다', async () => {
  const f = fixture(); await f.ctx.orgTest.peopleLoadTree(); await f.ctx.orgTest.peopleDept('d1');
  assert.equal(f.PEOPLE.items.length, 4, '무효 이메일 행은 보존하고 유효 이메일만 합쳐야 합니다');
  assert.equal(f.PEOPLE.items.filter(x => x.email === 'invalid-email').length, 2);
  assert.equal(f.PEOPLE.orgNote, '분리 조직 계정을 함께 조회했으며, 같은 이메일은 한 번만 표시합니다.');
  assert.equal(f.ctx.orgTest.peopleDisplayDept('부천시여성회관(지점)'), '부천시여성회관· 별도 조직키');
  assert.match(source, /peopleDisplayDept\(p\.dept\),p\.duty/);
  assert.match(source, /!peopleIsBranchNode\(x\) && !officialKeys\.has\(x\.key\)/);
});

test('분리 키 일부 실패는 결과를 유지하고 일반적인 일부 조직 경고를 보인다', async () => {
  const f = fixture(); await f.ctx.orgTest.peopleLoadTree(); f.ctx.failBranch = true; await f.ctx.orgTest.peopleDept('d1');
  assert.equal(f.PEOPLE.items.length, 2);
  assert.equal(f.PEOPLE.orgNote, '일부 조직을 읽지 못해 일부 구성원이 빠질 수 있습니다.');
  assert.equal(f.PEOPLE.error, '');
});
test('조직·사람을 처음 열면 대표이사가 선택되고, 뺀 조직은 기타 목록에도 나오지 않는다', async () => {
  const f = fixture(); f.ctx.S.view = 'people';
  f.ctx.GW.organizationTree = async () => [{key:'d1',name:'대표이사',count:1},{key:'d2',name:'이사회',count:1},{key:'d3',name:'전략기획부',count:1},{key:'d4',name:'경영지원부',count:1},{key:'d5',name:'노동조합 감사관',count:1}];
  await f.ctx.orgTest.peopleAutoStart();
  assert.equal(f.PEOPLE.org, '대표이사');
  assert.ok(Array.isArray(f.PEOPLE.items));
  const html = f.ctx.orgTest.peopleOfficialTree(f.ctx.orgTest.peopleOfficialOrganization(f.PEOPLE.tree));
  assert.match(html, /aria-pressed="false"/);
  assert.doesNotMatch(html, /이사회|전략기획부|경영지원부/);
  assert.match(source, /!PEOPLE_HIDDEN_ORG\.has\(x\.name\)/);
});
