import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {mailBodyDoc, mailInlineImageUrls, MAIL_BODY_MAX} from '../src/live/briefing.mjs';

const ORIGIN = 'https://gw.example.invalid';
const PIC = ORIGIN + '/mail/mail002A30?domain=example.invalid&path=abc&index=0&type=png';
const DATA = 'data:image/png;base64,iVBORw0KGgo=';
const bodyOf = doc => doc.slice(doc.indexOf('<body>') + 6, doc.lastIndexOf('</body>'));

test('mail body keeps the sender layout: line breaks, tables, links', () => {
  const r = mailBodyDoc({html: '<html><head><title>x</title></head><body><div>첫 줄</div><div>둘째 줄</div><table><tr><td>표</td></tr></table><a href="https://example.invalid/a?x=1&amp;y=2">링크</a></body></html>', origin: ORIGIN});
  assert.equal(r.kind, 'html');
  const b = bodyOf(r.doc);
  assert.match(b, /<div>첫 줄<\/div><div>둘째 줄<\/div>/);
  assert.match(b, /<table><tr><td>표<\/td><\/tr><\/table>/);
  assert.match(b, /<a href="https:\/\/example\.invalid\/a\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">링크<\/a>/);
  assert.doesNotMatch(b, /<title|<html|<body/i);
});

test('mail body document carries its own content policy before any mail text', () => {
  const r = mailBodyDoc({html: '<p>본문</p>', origin: ORIGIN});
  const csp = r.doc.indexOf('Content-Security-Policy'), body = r.doc.indexOf('<body>');
  assert.ok(csp > 0 && csp < body);
  assert.match(r.doc, /default-src 'none'/);
  assert.doesNotMatch(r.doc.slice(0, body), /script-src|unsafe-eval/);
});

test('mail body drops active content and event handlers', () => {
  const dirty = '<p onclick="steal()" style="color:red">글</p><script>alert(1)</script><scr<script>x</script>ipt>alert(2)</scr<script>x</script>ipt>'
    + '<iframe src="https://evil.invalid"></iframe><object data="x"></object><form action="https://evil.invalid"><input name="pw"><button>보내기</button></form>'
    + '<meta http-equiv="refresh" content="0;url=https://evil.invalid"><base href="https://evil.invalid/"><link rel="stylesheet" href="https://evil.invalid/a.css">'
    + '<a href="javascript:alert(3)">가</a><a href=" java&#x73;cript:alert(4)">나</a><a href="data:text/html,<b>x</b>">다</a><img src="x" onerror="alert(5)"><svg><script>alert(6)</script></svg>';
  const r = mailBodyDoc({html: dirty, plain: '글', origin: ORIGIN});
  const b = bodyOf(r.doc);
  assert.doesNotMatch(b, /<\s*(script|iframe|object|form|input|button|meta|base|link|svg)\b/i);
  assert.doesNotMatch(b, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(b, /javascript:|data:text|cript:/i);
  assert.equal((b.match(/href="#"/g) || []).length, 3);
  assert.match(b, /style="color:red"/);
  const tricky = mailBodyDoc({html: '<p>글</p><img src="https://example.invalid/a.png" title="a>b" onerror="alert(1)"><a href="/relative">상대 주소</a><a href="//example.invalid/x">출처 생략</a>', origin: ORIGIN});
  const tb = bodyOf(tricky.doc);
  assert.equal(tricky.kind, 'html');
  assert.doesNotMatch(tb, /onerror/i);
  assert.match(tb, /<a href="#" target="_blank"/);
  assert.match(tb, /<a href="\/\/example\.invalid\/x" target="_blank"/);
  const broken = mailBodyDoc({html: '<p>글</p><img src="x onerror=alert(1) alt=\'>', plain: '글\n둘째 줄', origin: ORIGIN});
  assert.equal(broken.kind, 'plain');
  assert.doesNotMatch(bodyOf(broken.doc), /onerror/i);
});

test('mail body falls back to plain text when active content cannot be removed cleanly', () => {
  const nested = '<scr'.repeat(9) + '<script>' + 'ipt>'.repeat(9) + 'alert(1)';
  const r = mailBodyDoc({html: nested, plain: '안전한 글', origin: ORIGIN});
  assert.doesNotMatch(bodyOf(r.doc), /<\s*script/i);
});

test('groupware pictures are swapped for fetched data and counted when missing', () => {
  const html = `<p>서명</p><img src="${PIC.replace(/&/g, '&amp;')}" width="217"><img src="https://cdn.example.invalid/a.png">`;
  assert.deepEqual(mailInlineImageUrls(html, ORIGIN), [PIC]);
  assert.deepEqual(mailInlineImageUrls(html, ''), []);
  assert.deepEqual(mailInlineImageUrls('<img src="https://other.invalid/mail/mail002A30?x=1">', ORIGIN), []);
  const ok = mailBodyDoc({html, inline: {[PIC]: DATA}, origin: ORIGIN});
  assert.ok(bodyOf(ok.doc).includes(`src="${DATA}"`));
  assert.equal(ok.missing, 0); assert.equal(ok.remote, 1);
  const miss = mailBodyDoc({html, inline: {}, origin: ORIGIN});
  assert.equal(miss.missing, 1);
  assert.doesNotMatch(bodyOf(miss.doc), /mail002A30/);
  const forged = mailBodyDoc({html, inline: {[PIC]: 'data:text/html;base64,PHNjcmlwdD4='}, origin: ORIGIN});
  assert.equal(forged.missing, 1);
});

test('fixed-width newsletters shrink to the pane instead of scrolling sideways', () => {
  const r = mailBodyDoc({html: '<table width="600"><tr><td style="width:600px;color:red">가</td><td width="120">나</td></tr></table><div style="min-width:640px">다</div>', origin: ORIGIN});
  const b = bodyOf(r.doc);
  assert.match(b, /<table width="100%" style="max-width:600px">/);
  assert.match(b, /<td style="width:100%;max-width:600px;color:red">/);
  assert.match(b, /<td width="120">/);
  assert.match(b, /<div style="min-width:0">/);
});

test('plain text mail keeps its line breaks and escapes markup', () => {
  const r = mailBodyDoc({html: '', plain: '첫 줄\r\n둘째 줄 <b>굵게</b>\nhttps://example.invalid/a?x=1&y=2 참고', origin: ORIGIN});
  assert.equal(r.kind, 'plain');
  const b = bodyOf(r.doc);
  assert.match(b, /^<pre>첫 줄\n둘째 줄 &lt;b&gt;굵게&lt;\/b&gt;\n<a href="https:\/\/example\.invalid\/a\?x=1&amp;y=2"/);
  assert.equal(mailBodyDoc({}).kind, 'empty');
  assert.equal(mailBodyDoc({html: '<p>&nbsp;</p>', plain: ''}).kind, 'empty');
});

test('word-style mail keeps style rules wrapped in comments', () => {
  const r = mailBodyDoc({html: '<html><head><style><!-- p.MsoNormal{margin:0cm;font-size:10pt} --></style></head><body><p class="MsoNormal">글</p><!--[if mso]><p>아웃룩 전용</p><![endif]--></body></html>', origin: ORIGIN});
  assert.equal(r.kind, 'html');
  assert.match(bodyOf(r.doc), /<style><!-- p\.MsoNormal\{margin:0cm;font-size:10pt\} --><\/style>/);
});

test('unbalanced markers cannot stall the page', () => {
  const big = n => n.repeat(Math.floor(700000 / n.length));
  for (const junk of ['<!--', '<title ', '<script ', '<a ', '<img ', '<a "', '<p onx', '   ', '<![CDATA[']) {
    const started = Date.now();
    const r = mailBodyDoc({html: '<p>글</p>' + big(junk), plain: '글', origin: ORIGIN});
    mailInlineImageUrls('<p>글</p>' + big(junk), ORIGIN);
    assert.ok(Date.now() - started < 3000, `${JSON.stringify(junk)} took ${Date.now() - started}ms`);
    assert.doesNotMatch(bodyOf(r.doc), /<\s*script\b[^<>]*>/i);
  }
});

test('oversized mail HTML is not rendered', () => {
  const r = mailBodyDoc({html: '<p>' + '가'.repeat(MAIL_BODY_MAX) + '</p>', plain: '요약', origin: ORIGIN});
  assert.equal(r.tooLong, true); assert.equal(r.kind, 'plain');
});

test('mail body frame has no script or same-origin permission and survives re-render', async () => {
  const pane = await fs.readFile(new URL('../src/live/wc/13-detail-pane.js', import.meta.url), 'utf8');
  const sandbox = pane.match(/bf\.setAttribute\('sandbox', '([^']*)'\)/)?.[1];
  assert.equal(sandbox, 'allow-popups allow-popups-to-escape-sandbox');
  assert.match(pane, /mbody\.dataset\.key !== info\.mailBody\.key/);
  assert.doesNotMatch(pane, /mailHighlights/);
});

test('password masking does not hit ordinary words containing pw', async () => {
  const col = await fs.readFile(new URL('../src/live/collector.browser.js', import.meta.url), 'utf8');
  const src = col.match(/const SECRET = (\/.*\/gi);/)?.[1];
  assert.ok(src, 'SECRET pattern must exist');
  const SECRET = new Function(`return ${src}`)();
  const mask = s => s.replace(SECRET, '$1[MASKED]');
  assert.equal(mask('sysmetrix/groupware 저장소 · v0.73.0'), 'sysmetrix/groupware 저장소 · v0.73.0');
  assert.equal(mask('PW: abc123 입니다'), 'PW: [MASKED] 입니다');
  assert.equal(mask('비밀번호 abc123'), '비밀번호 [MASKED]');
  assert.equal(mask('password=hunter2'), 'password=[MASKED]');
  assert.equal(mask('임시 번호: 778899'), '임시 번호: [MASKED]');
});
