import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const src = await fs.readFile(new URL('../src/live/wc/51-todo.js',import.meta.url),'utf8');
const cut = (a,b) => src.slice(src.indexOf('  function '+a),src.indexOf('  function '+b));
test('파일 선택 시 로컬 표시만, 연속 저장은 한 번만, 실패 시 선택 유지', async()=>{
  const TD={sel:'new'}, picker={}, hint={}, button={}, calls=[]; let finish;
  const ctx=vm.createContext({TD,root:{querySelector:()=>button}, S:{view:'mytodo'}, $:q=>q==='#tdeFiles'?picker:q==='#tdeFilesHint'?hint:null,
    esc:t=>t.replaceAll('<','&lt;'),todoFind:()=>null, todoReadEditor:()=>({title:'합성',files:TD.edFiles}),
    toast(){},renderMain(){},todoCreate:o=>{calls.push(o);return new Promise(r=>{finish=r;});}});
  vm.runInContext(cut('todoFilesHint','todoEditorHtml')+cut('todoChange','todoInput')+src.slice(src.indexOf('  async function todoSaveEditor()'),src.indexOf('  function todoRerenderEditor')),ctx);
  ctx.todoChange({id:'tdeFiles',files:[new File(['demo'],'<sample>.txt')]});
  assert.equal(calls.length,0); assert.match(hint.innerHTML,/&lt;sample>/); const chosen=TD.edFiles;
  const first=ctx.todoSaveEditor(); await ctx.todoSaveEditor(); assert.equal(calls.length,1); assert.equal(picker.disabled,true); assert.equal(calls[0].files,chosen);
  finish({ok:false,text:'실패'}); await first; assert.equal(TD.edFiles,chosen); assert.equal(picker.disabled,false);
  const second=ctx.todoSaveEditor(); finish({ok:true,id:'td1'}); await second; assert.equal(TD.edFiles,null); assert.equal(TD.sel,'td1');
});
