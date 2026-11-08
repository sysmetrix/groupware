// 업무센터 코드 그래프 분석기: 모듈 의존, 화면 이벤트(data-act) -> 처리기 -> 함수 연결, 미정의 호출, 죽은 코드, 외부 API 참조 검증.
// 파서 없이 동작하도록 문자열/주석을 지운 뒤 식별자를 읽는 가벼운 방식이다(정밀 파서가 아니므로 결과는 "의심 목록"이다).
import fs from 'node:fs/promises';
import path from 'node:path';

const KEYWORDS = new Set('if for while switch catch function return typeof new await async yield delete void in of instanceof super import export class else do try finally throw case default with'.split(' '));
const BROWSER = new Set(('window document location history navigator localStorage sessionStorage console fetch setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame alert confirm prompt open close Blob URL File FileReader FormData Headers Request Response AbortController AbortSignal Event CustomEvent MouseEvent KeyboardEvent InputEvent MutationObserver ResizeObserver IntersectionObserver DOMParser XMLSerializer CSS getComputedStyle matchMedia atob btoa encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape structuredClone queueMicrotask Notification Intl TextEncoder TextDecoder crypto performance Image Option HTMLElement Element Node NodeList Range Selection DataTransfer ClipboardItem BroadcastChannel Worker WebSocket XMLHttpRequest Promise Symbol Proxy Reflect JSON Math Date Object Array String Number Boolean RegExp Error TypeError RangeError SyntaxError Map Set WeakMap WeakSet WeakRef BigInt parseInt parseFloat isNaN isFinite NaN Infinity undefined null eval globalThis Uint8Array Uint16Array Uint32Array Int8Array Int16Array Int32Array Float32Array Float64Array ArrayBuffer DataView require module exports process Buffer').split(' '));

// 문자열·정규식 리터럴·주석을 공백으로 바꾸되, 템플릿의 ${ } 안쪽 코드는 남긴다.
export function stripNonCode(src) {
  let out = '';
  const n = src.length;
  const stack = []; // template nesting: brace depth per template
  let i = 0;
  const blank = s => s.replace(/[^\n]/g, ' ');
  let prevSig = '';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const j = src.indexOf('\n', i); const e = j < 0 ? n : j; out += blank(src.slice(i, e)); i = e; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); const e = j < 0 ? n : j + 2; out += blank(src.slice(i, e)); i = e; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') break; j++; }
      out += blank(src.slice(i, j + 1)); i = j + 1; prevSig = 'x'; continue;
    }
    if (c === '`') {
      let j = i + 1, seg = '`';
      for (; j < n; j++) {
        if (src[j] === '\\') { seg += '  '; j++; continue; }
        if (src[j] === '`') { seg += '`'; j++; break; }
        if (src[j] === '$' && src[j + 1] === '{') { out += blank(seg) + '${'; stack.push(1); seg = ''; j += 1; i = j + 1; break; }
        seg += src[j] === '\n' ? '\n' : ' ';
      }
      if (stack.length && out.endsWith('${') && seg === '') { prevSig = '{'; continue; }
      out += blank(seg); i = j; prevSig = 'x'; continue;
    }
    if (stack.length) {
      if (c === '{') stack[stack.length - 1]++;
      else if (c === '}') {
        stack[stack.length - 1]--;
        if (stack[stack.length - 1] === 0) {
          stack.pop(); out += '}';
          // resume template text until next ${ or closing `
          let j = i + 1, seg = '';
          for (; j < n; j++) {
            if (src[j] === '\\') { seg += '  '; j++; continue; }
            if (src[j] === '`') { j++; break; }
            if (src[j] === '$' && src[j + 1] === '{') { out += blank(seg) + '${'; stack.push(1); seg = ''; j++; break; }
            seg += src[j] === '\n' ? '\n' : ' ';
          }
          out += blank(seg); i = j + (out.endsWith('${') ? 1 : 0); prevSig = out.endsWith('${') ? '{' : 'x';
          continue;
        }
      }
    }
    if (c === '/' && /[=(,:;!&|?{}\[]|^$|return$/.test(prevSig) && d !== ' ') { // regex literal
      let j = i + 1, inCls = false;
      while (j < n && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') inCls = true; else if (src[j] === ']') inCls = false; else if (src[j] === '/' && !inCls) break; j++; }
      if (src[j] === '/') { j++; while (/[a-z]/.test(src[j] || '')) j++; out += blank(src.slice(i, j)); i = j; prevSig = 'x'; continue; }
    }
    out += c;
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return out;
}

const idents = s => [...s.matchAll(/[A-Za-z_$][\w$]*/g)].map(m => m[0]);

export async function loadWc(root) {
  const dir = path.join(root, 'src', 'live', 'wc');
  const files = (await fs.readdir(dir)).filter(n => n.endsWith('.js')).sort();
  const parts = [];
  for (const f of files) { const raw = await fs.readFile(path.join(dir, f), 'utf8'); parts.push({file: f, raw, code: stripNonCode(raw)}); }
  const read = async p => fs.readFile(path.join(root, 'src', 'live', p), 'utf8');
  return {parts, workcenter: await read('workcenter.browser.js'), collector: await read('collector.browser.js'), briefing: await read('briefing.mjs')};
}

// 선언된 이름 모으기 (함수, 변수, 매개변수, 구조분해)
function declared(code) {
  const set = new Set();
  const addList = s => { for (const w of idents(s.replace(/=[^,]*/g, ''))) set.add(w); };
  for (const m of code.matchAll(/function\*?\s+([\w$]+)/g)) set.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([\w$]+)/g)) set.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s*[{\[]([^=;]*?)[}\]]\s*=/g)) addList(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s+[\w$]+\s*=[^;]*?,\s*([\w$]+)\s*=/g)) set.add(m[1]);
  for (const m of code.matchAll(/(?:function\s*[\w$]*|async)?\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(?:=>|\{)/g)) addList(m[1]);
  for (const m of code.matchAll(/([\w$]+)\s*=>/g)) set.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s+[\w$]+\s*=\s*[^;\n]*?,\s*[\w$]+/g)) idents(m[0]).forEach(w => set.add(w));
  for (const m of code.matchAll(/\bcatch\s*\(\s*([\w$]+)/g)) set.add(m[1]);
  for (const m of code.matchAll(/^\s*(?:async\s+)?([\w$]+)\s*\([^()]*\)\s*\{/gm)) if (!KEYWORDS.has(m[1])) set.add(m[1]); // 객체 메서드 선언
  for (const m of code.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s*(?:\[([^\]]*)\]|([\w$]+))/g)) { if (m[1]) addList(m[1]); else set.add(m[2]); }
  // 한 줄에 여러 변수 선언: const a = 1, b = 2;
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([^;]*?);/g)) for (const p of m[1].split(/,\s*(?=[\w$]+\s*=)/)) { const nm = p.match(/^\s*([\w$]+)/); if (nm) set.add(nm[1]); }
  return set;
}

// 최상위(부트 스코프, 들여쓰기 2칸) 정의: 파일 간 의존 그래프의 노드
function topLevelDefs(code) {
  const defs = new Map();
  for (const m of code.matchAll(/^ {2}(?:async\s+)?function\s+([\w$]+)/gm)) defs.set(m[1], 'function');
  for (const m of code.matchAll(/^ {2}(?:const|let|var)\s+([\w$]+)/gm)) defs.set(m[1], 'value');
  for (const m of code.matchAll(/^ {2}(?:const|let|var)\s*[{\[]([^=]*?)[}\]]\s*=/gm)) for (const w of idents(m[1])) defs.set(w, 'value');
  return defs;
}

export function analyze(model) {
  const {parts, workcenter, collector, briefing} = model;
  const wcCode = stripNonCode(workcenter.replace('  /*@WC_PARTS@*/', ''));
  const allCode = parts.map(p => p.code).join('\n') + '\n' + wcCode;
  const decl = declared(allCode);
  const defsByFile = new Map();
  const owner = new Map();
  for (const p of parts) { const d = topLevelDefs(p.code); defsByFile.set(p.file, d); for (const [k] of d) if (!owner.has(k)) owner.set(k, p.file); }
  for (const [k] of topLevelDefs(wcCode)) if (!owner.has(k)) owner.set(k, 'workcenter.browser.js');

  // 1) 모듈 의존 간선
  const edges = new Map();
  for (const p of parts) {
    const used = new Set(idents(p.code));
    for (const w of used) { const o = owner.get(w); if (o && o !== p.file) { const k = `${p.file}>${o}`; edges.set(k, (edges.get(k) || 0) + 1); } }
  }

  // 2) 미정의 호출
  const globals = new Set([...BROWSER, ...KEYWORDS, ...Object.getOwnPropertyNames(globalThis)]);
  const undef = [];
  for (const p of parts) {
    const lines = p.code.split('\n');
    lines.forEach((ln, i) => {
      for (const m of ln.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
        const w = m[2];
        if (KEYWORDS.has(w) || decl.has(w) || globals.has(w) || owner.has(w)) continue;
        undef.push({file: p.file, line: i + 1, name: w});
      }
    });
  }

  // 3) 이벤트 그래프: data-act -> case -> 호출 함수
  const acts = new Map();
  for (const p of parts) for (const m of p.raw.matchAll(/data-act="([\w-]+)"/g)) { if (!acts.has(m[1])) acts.set(m[1], new Set()); acts.get(m[1]).add(p.file); }
  const events = parts.find(p => p.file.includes('events'));
  const cases = new Map();
  if (events) {
    const src = events.raw;
    const re = /case '([\w-]+)':((?:\s*case '[\w-]+':)*)([^]*?)(?=\n\s*case '|\n\s*default:|\n\s*\}\s*\n\s*\}\s*$)/g;
    for (const m of src.matchAll(re)) {
      const names = [m[1], ...[...m[2].matchAll(/case '([\w-]+)'/g)].map(x => x[1])];
      const body = stripNonCode(m[3]);
      const calls = [...new Set([...body.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map(x => x[2]).filter(w => owner.has(w)))];
      for (const nme of names) cases.set(nme, calls);
    }
  }
  const actsNoHandler = [...acts.keys()].filter(a => !cases.has(a) && !/^(?:\$\{)/.test(a));
  const handlersNoTrigger = [...cases.keys()].filter(a => !acts.has(a) && !new RegExp(`['"\`]${a}['"\`]`).test(parts.filter(p => p !== events).map(p => p.raw).join('\n')));

  // 4) 죽은 코드: 최상위 함수인데 다른 곳에서 참조되지 않음
  const dead = [];
  const refCount = new Map();
  for (const w of idents(allCode)) refCount.set(w, (refCount.get(w) || 0) + 1);
  const rawAll = parts.map(p => p.raw).join('\n') + workcenter;
  for (const [file, defs] of defsByFile) for (const [name, kind] of defs) {
    if (kind !== 'function') continue;
    const dynamic = new RegExp(`['"\`]${name}['"\`]|data-act="${name}"|BWYFGW_[A-Z_]*\\.${name}`).test(rawAll);
    if ((refCount.get(name) || 0) <= 1 && !dynamic) dead.push({file, name});
  }

  // 5) 외부 계약: R.x (briefing 내보내기), GW.x (collector 내보내기)
  const exported = new Set([...briefing.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/gm)].map(m => m[1]));
  const gi = collector.indexOf('window.BWYFGW = Object.freeze({');
  const gwExp = gi < 0 ? '' : collector.slice(gi, collector.indexOf('});', gi));
  const gwSet = new Set(idents(gwExp));
  const badR = [], badGW = [];
  for (const p of parts) {
    p.code.split('\n').forEach((ln, i) => {
      for (const m of ln.matchAll(/\bR\.([A-Za-z_$][\w$]*)/g)) if (!exported.has(m[1])) badR.push({file: p.file, line: i + 1, name: m[1]});
      for (const m of ln.matchAll(/\bGW\.([A-Za-z_$][\w$]*)/g)) if (gwSet.size > 5 && !gwSet.has(m[1])) badGW.push({file: p.file, line: i + 1, name: m[1]});
    });
  }

  return {
    files: parts.map(p => ({file: p.file, lines: p.raw.split('\n').length, bytes: Buffer.byteLength(p.raw), defs: [...defsByFile.get(p.file).keys()].length})),
    edges: [...edges].map(([k, w]) => { const [a, b] = k.split('>'); return {from: a, to: b, weight: w}; }),
    undef, acts: [...acts.keys()], cases: [...cases.entries()].map(([a, c]) => ({act: a, calls: c})), actsNoHandler, handlersNoTrigger, dead, badR, badGW,
  };
}

export function toMermaid(res) {
  const id = f => 'm' + f.replace(/\W/g, '_');
  const short = f => f.replace(/\.js$/, '');
  const lines = ['flowchart LR'];
  for (const f of res.files) lines.push(`  ${id(f.file)}["${short(f.file)}<br/>${f.lines}줄"]`);
  for (const e of res.edges.filter(e => e.weight >= 2)) lines.push(`  ${id(e.from)} -->|${e.weight}| ${id(e.to)}`);
  return lines.join('\n');
}

export function actMermaid(res, limit = 40) {
  const lines = ['flowchart LR'];
  for (const c of res.cases.filter(c => c.calls.length).slice(0, limit)) {
    lines.push(`  a_${c.act.replace(/\W/g, '_')}(["${c.act}"])`);
    for (const f of c.calls.slice(0, 3)) lines.push(`  a_${c.act.replace(/\W/g, '_')} --> f_${f}["${f}()"]`);
  }
  return lines.join('\n');
}
