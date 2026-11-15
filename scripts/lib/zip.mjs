// 아주 작은 ZIP 작성기(외부 패키지 없이). 확장 프로그램 폴더를 시작 페이지에서 내려받을 수 있게 묶는 데 쓴다.
// 결과는 입력만으로 정해진다: 파일은 이름순, 시각은 고정값이라 같은 내용이면 같은 바이트가 나온다.
import zlib from 'node:zlib';

const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1; // 2026-01-01 00:00

/** files: [{name: 'folder/file.js', data: Buffer|string}] → ZIP Buffer */
export function zipSync(files) {
  const list = [...files].map(f => ({name: String(f.name).split(String.fromCharCode(92)).join('/'), data: Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8')})).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const parts = [], central = [];
  let offset = 0;
  for (const f of list) {
    if (!f.name || f.name.startsWith('/') || f.name.split('/').includes('..')) throw new Error(`ZIP에 넣을 수 없는 경로: ${f.name}`);
    const name = Buffer.from(f.name, 'utf8'), body = zlib.deflateRawSync(f.data, {level: 9}), crc = zlib.crc32(f.data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(DOS_TIME, 10); head.writeUInt16LE(DOS_DATE, 12); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18); head.writeUInt32LE(f.data.length, 22); head.writeUInt16LE(name.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(DOS_TIME, 12); cen.writeUInt16LE(DOS_DATE, 14); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(f.data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    parts.push(head, name, body); central.push(cen, name);
    offset += head.length + name.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(list.length, 8); end.writeUInt16LE(list.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
