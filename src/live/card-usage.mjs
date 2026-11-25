// GW 비서 · 카드 사용내역의 순수 계산 (v1.21).
// briefing.mjs 뒤에 이어 붙어 R.* 로 쓰인다. import, DOM, localStorage를 쓰지 않는다. 이름은 cu* 접두로 겹치지 않게 한다.
// 자료는 BWYFGW.cardUsage()가 돌려준 줄: {date:'YYYYMMDD', time:'HH:MM', card, place, amount, status:'open'|'done'|'other', resolution, ...}

const cduPad = n => String(n).padStart(2, '0');
const cduKst = now => { const k = new Date(now.getTime() + 9 * 3600000); return {y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate()}; };
const cduYmd = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return `${t.getUTCFullYear()}${cduPad(t.getUTCMonth() + 1)}${cduPad(t.getUTCDate())}`; };

export const CDU_PERIODS = [['month', '이번 달'], ['last', '지난달'], ['m3', '최근 3개월'], ['year', '올해']];
export const CDU_STATES = [['open', '결의 전'], ['done', '결의 완료'], ['all', '전체']];

// 기간 단추의 날짜(한국 시간 기준). custom은 받은 날짜를 그대로 쓰되 형식이 틀리면 이번 달로 돌린다.
export function cduPeriod(kind, now = new Date(), custom = {}) {
  const {y, m, d} = cduKst(now), todayYmd = cduYmd(y, m, d);
  if (kind === 'last') return {kind, from: cduYmd(y, m - 1, 1), to: cduYmd(y, m, 0)};
  if (kind === 'm3') return {kind, from: cduYmd(y, m - 2, 1), to: todayYmd};
  if (kind === 'year') return {kind, from: cduYmd(y, 1, 1), to: todayYmd};
  if (kind === 'custom') {
    const f = String(custom.from || '').replace(/-/g, ''), t = String(custom.to || '').replace(/-/g, '');
    if (/^\d{8}$/.test(f) && /^\d{8}$/.test(t) && f <= t) return {kind, from: f, to: t};
  }
  return {kind: 'month', from: cduYmd(y, m, 1), to: todayYmd};
}

export const cduDash = s => /^\d{8}$/.test(String(s || '')) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '';
const CDU_WD = ['일', '월', '화', '수', '목', '금', '토'];
export function cduDayLabel(s) {
  if (!/^\d{8}$/.test(String(s || ''))) return '';
  const t = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  return `${+s.slice(4, 6)}/${+s.slice(6, 8)}(${CDU_WD[t.getUTCDay()]})`;
}
export const cduStatusLabel = r => r.status === 'open' ? (r.returned ? '결의 전(회수됨)' : '결의 전') : r.status === 'done' ? `결의 ${r.resolution || r.slip || '반영'}` : '다른 처리(지출결의·계산서)';

// 화면 거르기와 합계. 상태·카드·찾기어는 화면에서 바꾸고, 합계는 거른 줄만 더한다. 카드별 건수는 상태만 거른 기준.
export function cduView(rows, {state = 'open', card = '', q = ''} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const count = st => list.filter(r => st === 'all' || r.status === st).length;
  const counts = {open: count('open'), done: count('done'), other: count('other'), all: list.length};
  const byState = list.filter(r => state === 'all' || r.status === state);
  const cards = new Map();
  for (const r of byState) { const c = cards.get(r.card) || {card: r.card, count: 0, amount: 0}; c.count++; c.amount += Number(r.amount) || 0; cards.set(r.card, c); }
  const s = String(q || '').replace(/\s+/g, '').toLowerCase();
  const shown = byState.filter(r => (!card || r.card === card) && (!s || `${r.place}${r.card}${r.approvalNo}${r.resolution}${r.amount}`.replace(/\s+/g, '').toLowerCase().includes(s)));
  const amount = shown.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const openAmount = list.filter(r => r.status === 'open').reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const oldestOpen = list.filter(r => r.status === 'open' && r.date).map(r => r.date).sort()[0] || '';
  return {rows: shown, amount, counts, openAmount, oldestOpen, cards: [...cards.values()].sort((a, b) => b.count - a.count || String(a.card).localeCompare(String(b.card)))};
}

// 매출전표 보기: 합계에서 부가세를 뺀 공급가액과 읽기 좋은 전화·사업자번호. 카드번호는 다루지 않는다.
export function cduSlip(r) {
  const amount = Number(r && r.amount) || 0, vat = Number(r && r.vat) || 0;
  const biz = String((r && r.bizNo) || ''), tel = String((r && r.tel) || '').replace(/\D/g, '');
  return {
    amount, vat, supply: amount - vat,
    bizNo: /^\d{10}$/.test(biz) ? `${biz.slice(0, 3)}-${biz.slice(3, 5)}-${biz.slice(5)}` : biz,
    tel: /^02\d{7,8}$/.test(tel) ? `${tel.slice(0, 2)}-${tel.slice(2, tel.length - 4)}-${tel.slice(-4)}` : /^\d{10,11}$/.test(tel) ? `${tel.slice(0, 3)}-${tel.slice(3, tel.length - 4)}-${tel.slice(-4)}` : tel,
    at: `${cduDash(r && r.date)}${r && r.time ? ` ${r.time}` : ''}`.trim(),
  };
}

// 결의 전인 채로 오래된 건: 기준일(오늘)에서 며칠 지났는지. 날짜가 없으면 null.
export function cduAgeDays(ymd, now = new Date()) {
  if (!/^\d{8}$/.test(String(ymd || ''))) return null;
  const {y, m, d} = cduKst(now);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8))) / 86400000);
}

// ---------- 전자세금계산서 (v1.22) ----------
// 자료는 BWYFGW.etaxInvoices()가 돌려준 줄: {date, supplier, bizNo, issueNo, sum, supply, vat, taxType:'2'|'4', item, balance, status:'open'|'partial'|'done', resolution}
export const ETX_STATES = [['open', '결의 전'], ['done', '결의 완료'], ['all', '전체']];
export const etxTaxLabel = r => r.taxType === '4' ? '면세' : r.taxType === '2' ? '과세' : '기타';
export const etxBizNo = s => /^\d{10}$/.test(String(s || '')) ? `${s.slice(0, 3)}-${s.slice(3, 5)}-${s.slice(5)}` : String(s || '');
export const etxStatusLabel = r => r.status === 'open' ? '결의 전' : r.status === 'partial' ? `일부 결의 · 남은 ${Number(r.balance || 0).toLocaleString('ko-KR')}원` : `결의 ${r.resolution || r.slip || '반영'}`;
// '결의 전'은 일부만 결의된 건(남은 금액이 있는 건)도 포함한다: 아직 더 결의할 수 있는 건이기 때문.
const etxIsOpen = r => r.status === 'open' || r.status === 'partial';
export function etxView(rows, {state = 'open', q = ''} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const counts = {open: list.filter(etxIsOpen).length, done: list.filter(r => r.status === 'done').length, all: list.length};
  const byState = list.filter(r => state === 'all' || (state === 'open' ? etxIsOpen(r) : r.status === 'done'));
  const s = String(q || '').replace(/\s+/g, '').toLowerCase();
  const shown = byState.filter(r => !s || `${r.supplier}${r.item}${r.issueNo}${r.bizNo}${r.resolution}${r.sum}`.replace(/\s+/g, '').toLowerCase().includes(s));
  const amount = shown.reduce((a, r) => a + (Number(r.sum) || 0), 0);
  const openList = list.filter(etxIsOpen);
  return {rows: shown, amount, counts, openAmount: openList.reduce((a, r) => a + (Number(r.balance) || 0), 0), oldestOpen: openList.filter(r => r.date).map(r => r.date).sort()[0] || ''};
}