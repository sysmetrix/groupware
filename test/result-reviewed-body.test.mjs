import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/live/wc/41-result-body.js', import.meta.url), 'utf8');
const build = vm.runInNewContext(`${src}\nresultReviewedBody`);
const plan = {title:'모의 행사 운영계획', docNo:'모의-1', body:'계획인원 200명, 예산 9,999,999원'};

test('결과보고는 허용한 서식의 순서만 재사용하고 과거 값과 계획값을 복사하지 않는다', () => {
  const past = {title:'다른 행사 결과보고', body:'2. 아래와 같이 보고합니다.\r\n  가. 장 소： 과거의 회의실\r\n  나. 참석 인원: 777명\r\n  다. 임의 담당자: 이전직원\r\n  라. 참석 인원: 888명\r\n  마. 예산: 777,000원\r\n붙임 옛 파일 1부. 끝.'};
  const out = build(plan, ['','신청자가 확인한 장소',0,'0원',''], past);
  assert.match(out.text,/모의-1 「모의 행사 운영계획」/);
  assert.match(out.text,/가\. 장소: 신청자가 확인한 장소\n  나\. 참석 인원: 0/);
  assert.match(out.text,/실제 집행 금액: 0원/);
  assert.doesNotMatch(out.text,/777|888|이전직원|옛 파일|200명|9,999,999원|과거의 회의실/);
  assert.equal(out.text.match(/확인 필요\]/g)?.length,2);
  assert.equal(out.lines.length,out.hang.length); assert.equal(out.lines.join('\n'),out.text);
  assert.match(out.notes[0],/항목명과 순서 2개/);
});

test('결과보고가 아닌 이전 문서는 형식 근거가 아니며, 미확인 실적·참조번호를 명시한다', () => {
  const out = build({}, [undefined, null, NaN, {}, false], {title:'행사 계획',body:'가. 장소: 앞으로 갈 장소'});
  assert.match(out.lines[0],/근거 문서번호 확인 필요/);
  assert.match(out.lines[2],/가\. 실제 일시:/);
  assert.equal(out.text.match(/\[실적 확인 필요\]/g).length,5);
  assert.match(out.notes[0],/표준/);
  assert.doesNotMatch(out.text,/앞으로 갈 장소|\[object Object\]|undefined|NaN|false/);
});
