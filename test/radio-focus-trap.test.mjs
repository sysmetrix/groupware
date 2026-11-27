import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('선택된 두 번째 라디오에서 Shift+Tab은 창의 마지막 버튼으로 순환한다', () => {
  const source = readFileSync(new URL('../src/live/wc/04-timers-keys.js', import.meta.url), 'utf8');
  const a = source.indexOf('  function handleKey('), b = source.indexOf("    if (S.menuOpen === 'bell'", a);
  assert.ok(a >= 0 && b > a);
  const first = {type:'radio', name:'kind', form:null, checked:false, getClientRects:()=>[1]};
  const selected = {type:'radio', name:'kind', form:null, checked:true, getClientRects:()=>[1]};
  let focused = false, prevented = false;
  const last = {type:'button', getClientRects:()=>[1], focus(){focused = true;}};
  const dialog = {querySelectorAll:()=>[first, selected, last]};
  const context = {S:{open:true,menuOpen:'',paletteOpen:false,helpOpen:false}, root:{activeElement:selected}, $:()=>dialog, document:{}, AUTO:{running:false}};
  vm.createContext(context); vm.runInContext(source.slice(a,b) + '\n  }\nthis.run = handleKey;', context);
  context.run({key:'Tab',shiftKey:true,composedPath:()=>[selected],stopPropagation(){},preventDefault(){prevented = true;}});
  assert.equal(prevented,true); assert.equal(focused,true);
});
