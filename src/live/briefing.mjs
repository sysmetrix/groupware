// Turns a raw BWYFGW.collect() result into an action-oriented briefing
// (analysis object, HTML, Markdown), a diff state and an assistant dataset.
// Pure functions: no network, no file access.

const ACTION_WORDS = /요청|확인|회신|제출|협조|검토|마감|기한|긴급|필독|참석|회의|신청|문의|보고|의견|취합/;
const NOISE_WORDS = /광고|뉴스레터|newsletter|weekly|위클리|웨비나|webinar|no-?reply|수신거부|구독|이벤트 안내/i;
const PRIORITY_ORDER = {high: 0, medium: 1, low: 2};

const pad = n => String(n).padStart(2, '0');
export function kstNow(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600_000);
  return {y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), hh: k.getUTCHours(), mm: k.getUTCMinutes(), date: `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`};
}
const dayNumber = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);
export const dday = (isoDate, now = new Date()) => dayNumber(isoDate) - dayNumber(kstNow(now).date);
const fmtYmd = s => (s && /^\d{8}/.test(s)) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || '');
const fmtYmdHm = s => (s && /^\d{12}/.test(s)) ? `${fmtYmd(s)} ${s.slice(8, 10)}:${s.slice(10, 12)}` : fmtYmd(s);
const won = n => Number(n || 0).toLocaleString('ko-KR');
const hm = min => min === null || min === undefined ? '-' : `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const ageDays = (dateText, now) => { const t = Date.parse(String(dateText).replace(' ', 'T') + '+09:00'); return Number.isFinite(t) ? (now.getTime() - t) / 86400000 : Infinity; };

// "~11.20.", "11.20.까지", "11월 20일까지", "기한: 11/20" -> YYYY-MM-DD
export function extractDeadline(text, now = new Date()) {
  const s = String(text || '');
  const patterns = [
    /~\s*(\d{1,2})\s*[./]\s*(\d{1,2})/,
    /(\d{1,2})\s*[./]\s*(\d{1,2})\.?\s*(?:\([월화수목금토일]\))?\s*까지/,
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\([월화수목금토일]\))?\s*까지/,
    /(?:기한|마감|제출기한)\s*[:：]?\s*(\d{1,2})\s*[./월]\s*(\d{1,2})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m) continue;
    const month = Number(m[1]), day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const {y} = kstNow(now);
    let iso = `${y}-${pad(month)}-${pad(day)}`;
    if (dday(iso, now) < -60) iso = `${y + 1}-${pad(month)}-${pad(day)}`;
    if (Number.isNaN(Date.parse(iso))) continue;
    return iso;
  }
  return '';
}

function docLink(raw, list) { return list?.url || raw?.data?.approval?.url || raw?.origin; }

export function analyze(raw, prev = null, now = new Date()) {
  const d = raw?.data || {};
  const prevMail = new Set(prev?.mailUids || []);
  const prevDocs = new Set(Object.values(prev?.docIds || {}).flat());
  const prevNotices = new Set(prev?.noticeIds || []);
  const hasPrev = !!prev;
  const actions = [];
  const deadlines = [];
  const addDeadline = (title, source, url) => {
    const date = extractDeadline(title, now);
    if (!date) return;
    const left = dday(date, now);
    if (left < -1 || left > 60) return;
    if (!deadlines.some(x => x.title === title && x.date === date)) deadlines.push({date, dday: left, title, source, url});
  };

  // Approval / document flow
  const lists = d.approval?.lists || {};
  const counts = Object.fromEntries((d.approval?.counts || []).map(c => [c.name, c]));
  const docAction = (key, priority, verb) => {
    const l = lists[key];
    if (!l || l.error) return;
    for (const doc of l.docs) {
      actions.push({priority, area: '결재', kind: l.label, title: doc.title, detail: [verb, doc.sender || doc.drafter, doc.docNo, doc.attachments ? `첨부 ${doc.attachments}` : ''].filter(Boolean).join(' · '), when: doc.date, url: docLink(raw, l), isNew: hasPrev && !prevDocs.has(`${key}:${doc.docId}`)});
      addDeadline(doc.title, l.label, docLink(raw, l));
    }
  };
  docAction('pending', 'high', '내 결재 차례');
  docAction('deptWaiting', 'high', '부서 접수 처리 필요');
  docAction('distWaiting', 'high', '배부 처리 필요');
  docAction('sendWaiting', 'medium', '발송 처리 대기');
  const submitted = (lists.submitted?.docs || []);
  const rejected = submitted.filter(x => /반려|회수/.test(x.status));
  for (const doc of rejected) actions.push({priority: 'high', area: '결재', kind: '내 상신문서', title: doc.title, detail: `${doc.status} · 수정·재상신 검토`, when: doc.date, url: lists.submitted.url, isNew: hasPrev && !prevDocs.has(`submitted:${doc.docId}`)});
  const inProgress = submitted.filter(x => x.statusCode !== '008' && !/완료|반려|회수/.test(x.status));
  const viewingUnread = (lists.viewing?.docs || []).filter(x => x.unread);
  for (const doc of viewingUnread) actions.push({priority: 'low', area: '결재', kind: '열람문서', title: doc.title, detail: `미열람 · ${doc.status}`, when: doc.date, url: lists.viewing.url, isNew: hasPrev && !prevDocs.has(`viewing:${doc.docId}`)});
  for (const doc of lists.viewing?.docs || []) addDeadline(doc.title, '열람문서', lists.viewing.url);

  // Mail
  const mails = [...(d.mail?.inbox?.records || []), ...(d.mail?.otherUnseen || [])];
  const seenUid = new Set();
  const uniqueMails = mails.filter(m => { const k = `${m.box}:${m.uid}`; if (seenUid.has(k)) return false; seenUid.add(k); return true; });
  const unreadMails = uniqueMails.filter(m => !m.seen && !NOISE_WORDS.test(m.subject));
  const recentAction = uniqueMails.filter(m => m.seen && !m.answered && !m.forwarded && ageDays(m.date, now) <= 3 && ACTION_WORDS.test(m.subject) && !NOISE_WORDS.test(m.subject) && !/^re:|^회신:|^답장:/i.test(m.subject.trim()));
  for (const m of unreadMails) actions.push({priority: ACTION_WORDS.test(m.subject) ? 'high' : m.box === 'INBOX' ? 'medium' : 'low', area: '메일', kind: m.box === 'INBOX' ? '안 읽은 메일' : `안 읽은 메일(${m.box})`, title: m.subject, detail: `${m.from}${m.attach ? ' · 첨부' : ''}`, when: m.date, url: d.mail.url, isNew: hasPrev && !prevMail.has(`${m.box}:${m.uid}`)});
  for (const m of recentAction) actions.push({priority: 'low', area: '메일', kind: '회신 여부 확인', title: m.subject, detail: `${m.from} · 읽음, 회신·전달 기록 없음`, when: m.date, url: d.mail.url, isNew: hasPrev && !prevMail.has(`${m.box}:${m.uid}`)});
  for (const m of uniqueMails.filter(x => ageDays(x.date, now) <= 21)) addDeadline(m.subject, '메일', d.mail?.url);
  const newMails = hasPrev ? uniqueMails.filter(m => !prevMail.has(`${m.box}:${m.uid}`)) : [];

  // Notices
  const articles = d.notice?.articles || [];
  const unreadNotices = articles.filter(a => !a.read && !a.reserved);
  for (const a of unreadNotices) actions.push({priority: 'low', area: '공지', kind: '안 읽은 공지', title: a.title, detail: `${a.dept} ${a.writer}${a.files ? ` · 첨부 ${a.files}` : ''}`, when: a.date, url: d.notice.url, isNew: hasPrev && !prevNotices.has(a.id)});
  for (const a of articles) if (!a.reserved) addDeadline(a.title, '공지', d.notice?.url);
  const newNotices = hasPrev ? articles.filter(a => !prevNotices.has(a.id)) : [];

  // Leave / schedule reminders
  for (const u of (d.leave?.upcoming || []).filter(u => dday(fmtYmd(u.start), now) <= 7)) actions.push({priority: 'low', area: '근태', kind: '예정된 휴가·외출', title: `${fmtYmd(u.start)} ${u.kind}`, detail: `${u.days}일 · ${u.approved ? '결재완료' : '결재 진행 중'}`, when: fmtYmd(u.start), url: d.leave.url, isNew: false});

  actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || String(b.when).localeCompare(String(a.when)));
  deadlines.sort((a, b) => a.date.localeCompare(b.date));

  // Budget with change since previous run
  const elapsedPct = (() => { const k = kstNow(now); const start = Date.UTC(k.y, 0, 1), end = Date.UTC(k.y + 1, 0, 1); return Math.round((Date.UTC(k.y, k.m - 1, k.d) - start) / (end - start) * 1000) / 10; })();
  const budget = (d.budget?.projects || []).map(p => ({...p, rows: (p.rows || []).map(r => {
    const before = prev?.budget?.[p.project]?.[r.code];
    return {...r, executedDelta: before === undefined ? null : r.executed - before};
  })}));

  const status = Object.entries(raw?.status || {}).map(([name, s]) => ({name, ...s}));
  return {
    generatedAt: now.toISOString(), collectedAt: raw?.collectedAt, durationMs: raw?.durationMs, collector: raw?.collector,
    principal: raw?.principal || {}, sessionExpired: !!raw?.sessionExpired, status, failed: status.filter(s => !s.ok),
    summary: {
      approvalAction: (lists.pending?.docs.length || 0) + (lists.deptWaiting?.docs.length || 0) + (lists.distWaiting?.docs.length || 0),
      pending: counts['대기문서']?.count ?? null, deptWaiting: counts['부서대기문서']?.count ?? null, distWaiting: counts['배부대기문서']?.count ?? null,
      sendWaiting: counts['발송대기문서']?.count ?? null, viewingUnread: counts['열람문서']?.count ?? null, drafts: counts['임시보관문서']?.count ?? null,
      inProgressSubmitted: inProgress.length, rejectedSubmitted: rejected.length,
      mailUnread: unreadMails.length, inboxTotal: d.mail?.inbox?.total ?? null, noticeUnread: d.notice?.unread ?? unreadNotices.length,
      leaveRemaining: d.leave?.remaining ?? null, upcomingEvents: d.schedule?.events?.length ?? null,
    },
    actions, deadlines,
    newSince: hasPrev ? {since: prev.at, mails: newMails.length, notices: newNotices.length, docs: actions.filter(a => a.area === '결재' && a.isNew).length} : null,
    approval: {counts: d.approval?.counts || [], lists, inProgress},
    mail: {boxes: d.mail?.boxes || [], unread: unreadMails, recentAction, recent: (d.mail?.inbox?.records || []).slice(0, 15), url: d.mail?.url},
    notice: {total: d.notice?.total, unread: unreadNotices, recent: articles.slice(0, 10), url: d.notice?.url},
    schedule: d.schedule || null, attendance: d.attendance || null, leave: d.leave || null,
    budget: {projects: budget, elapsedPct, url: d.budget?.url}, alerts: d.alerts?.alerts || [],
  };
}

export function nextState(raw, prev = null) {
  const d = raw?.data || {};
  const keep = (key, fresh) => (raw?.status?.[key]?.ok ? fresh : undefined);
  const mailUids = keep('mail', [...(d.mail?.inbox?.records || []), ...(d.mail?.otherUnseen || [])].map(m => `${m.box}:${m.uid}`)) ?? prev?.mailUids ?? [];
  const docIds = keep('approval', Object.fromEntries(Object.entries(d.approval?.lists || {}).map(([k, l]) => [k, (l.docs || []).map(x => `${k}:${x.docId}`)]))) ?? prev?.docIds ?? {};
  const noticeIds = keep('notice', (d.notice?.articles || []).map(a => a.id)) ?? prev?.noticeIds ?? [];
  const budget = keep('budget', Object.fromEntries((d.budget?.projects || []).filter(p => !p.error).map(p => [p.project, Object.fromEntries(p.rows.map(r => [r.code, r.executed]))]))) ?? prev?.budget ?? {};
  return {at: raw?.collectedAt, mailUids, docIds, noticeIds, budget};
}

// ---------- rendering ----------
const kstText = iso => { if (!iso) return '-'; const k = kstNow(new Date(iso)); return `${k.date} ${pad(k.hh)}:${pad(k.mm)}`; };
const ddayText = n => n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`;
const PRI_LABEL = {high: '긴급', medium: '보통', low: '참고'};

export function renderMarkdown(a) {
  const s = a.summary;
  const lines = [];
  lines.push(`# 그룹웨어 업무 브리핑 (${kstText(a.collectedAt)} KST 기준)`);
  lines.push('');
  lines.push(`${a.principal.name || ''} · ${a.principal.deptName || ''} · 수집 ${a.durationMs}ms · 읽기 전용`);
  if (a.sessionExpired) lines.push('', '> 로그인 세션이 만료되어 일부 자료를 읽지 못했습니다. 다시 로그인 후 실행하세요.');
  if (a.failed.length) lines.push('', `> 실패한 모듈: ${a.failed.map(f => `${f.name}(${f.error})`).join(', ')}`);
  lines.push('', '## 한눈에 보기', '');
  lines.push(`- 결재·문서유통 처리 필요: **${s.approvalAction}건** (결재대기 ${s.pending ?? '-'}, 부서접수대기 ${s.deptWaiting ?? '-'}, 배부대기 ${s.distWaiting ?? '-'}) · 발송대기 ${s.sendWaiting ?? '-'}`);
  lines.push(`- 내 상신문서 진행 중 ${s.inProgressSubmitted}건, 반려/회수 ${s.rejectedSubmitted}건 · 임시보관 ${s.drafts ?? '-'}건 · 미열람 열람문서 ${s.viewingUnread ?? '-'}건`);
  lines.push(`- 안 읽은 메일 ${s.mailUnread}건 · 안 읽은 공지 ${s.noticeUnread ?? '-'}건 · 남은 연차 ${s.leaveRemaining ?? '-'}일`);
  if (a.newSince) lines.push(`- 지난 실행(${kstText(a.newSince.since)}) 이후 새 메일 ${a.newSince.mails}건, 새 공지 ${a.newSince.notices}건, 새 결재·문서 ${a.newSince.docs}건`);
  lines.push('', '## 오늘 할 일', '');
  if (!a.actions.length) lines.push('- 처리할 항목이 없습니다.');
  for (const x of a.actions.slice(0, 40)) lines.push(`- [${PRI_LABEL[x.priority]}] ${x.isNew ? '(새) ' : ''}${x.area}/${x.kind}: ${x.title} (${x.detail}, ${x.when})`);
  if (a.deadlines.length) {
    lines.push('', '## 제목에서 찾은 기한', '');
    for (const x of a.deadlines) lines.push(`- ${x.date} (${ddayText(x.dday)}) ${x.title} [${x.source}]`);
  }
  for (const p of a.budget.projects) {
    lines.push('', `## 예산 ${p.project} ${p.label}${p.filter ? ` · ${p.filter}` : ''} (${p.period || ''}, 연간 경과율 ${a.budget.elapsedPct}%)`, '');
    if (p.error) { lines.push(`- 조회 실패: ${p.message}`); continue; }
    lines.push('| 과목 | 예산 | 집행 | 잔액 | 집행률 |', '|---|---:|---:|---:|---:|');
    for (const r of p.rows) lines.push(`| ${r.level} ${r.name} | ${won(r.budget)} | ${won(r.executed)}${r.executedDelta ? ` (+${won(r.executedDelta)})` : ''} | ${won(r.balance)} | ${r.rate}% |`);
    if (p.total) lines.push(`| **${p.project} 프로젝트 전체** | ${won(p.total.budget)} | ${won(p.total.executed)} | ${won(p.total.balance)} | ${p.total.rate}% |`);
  }
  if (a.leave) lines.push('', '## 연차', '', `- ${a.leave.year}년 부여 ${a.leave.granted} · 사용 ${a.leave.used} · 잔여 **${a.leave.remaining}**`, ...(a.leave.upcoming || []).map(u => `- 예정: ${fmtYmd(u.start)} ${u.kind} ${u.days}일 (${u.approved ? '결재완료' : '진행 중'})`));
  if (a.attendance) lines.push('', '## 근무시간', '', `- 이번 달 인정 ${hm(a.attendance.month.recognizedMin)} · 초과 ${hm(a.attendance.month.overtimeMin)} · 오늘 출근 ${a.attendance.today.come || '기록 없음'}`);
  lines.push('', `---`, `수집기 v${a.collector} · 생성 ${kstText(a.generatedAt)} KST · 메일·문서를 열지 않는 목록 조회만 사용해 읽음 상태는 바뀌지 않습니다.`);
  return lines.join('\n') + '\n';
}

export function renderHtml(a) {
  const s = a.summary;
  const card = (label, value, sub = '', tone = '') => `<div class="card ${tone}"><div class="label">${esc(label)}</div><div class="value">${esc(value ?? '-')}</div><div class="sub">${esc(sub)}</div></div>`;
  const link = (url, text) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text);
  const actionRows = a.actions.slice(0, 60).map(x => `<tr class="p-${x.priority}"><td><span class="pill ${x.priority}">${PRI_LABEL[x.priority]}</span>${x.isNew ? '<span class="pill new">새</span>' : ''}</td><td>${esc(x.area)}<div class="muted">${esc(x.kind)}</div></td><td>${link(x.url, x.title)}<div class="muted">${esc(x.detail)}</div></td><td class="nowrap">${esc(x.when)}</td></tr>`).join('');
  const deadlineRows = a.deadlines.map(x => `<tr><td class="nowrap"><b>${esc(x.date)}</b></td><td><span class="pill ${x.dday <= 3 ? 'high' : x.dday <= 7 ? 'medium' : 'low'}">${ddayText(x.dday)}</span></td><td>${link(x.url, x.title)}</td><td>${esc(x.source)}</td></tr>`).join('');
  const countRows = (a.approval.counts || []).map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.count}</td><td class="num muted">${c.total ?? ''}</td></tr>`).join('');
  const listBlock = (key) => {
    const l = a.approval.lists[key];
    if (!l) return '';
    if (l.error) return `<h3>${esc(l.label)}</h3><p class="warn">조회 실패: ${esc(l.message)}</p>`;
    const docs = key === 'submitted' ? l.docs.slice(0, 10) : l.docs;
    return `<h3>${link(l.url, l.label)} <span class="muted">${l.total ?? l.fetched}건${key === 'submitted' ? ' · 최근 10건' : ''}</span></h3>` + (docs.length ? `<table><tr><th>제목</th><th>상태</th><th>보낸 곳/기안</th><th>일시</th></tr>${docs.map(x => `<tr><td>${esc(x.title)}${x.attachments ? ` <span class="muted">첨부${x.attachments}</span>` : ''}</td><td class="nowrap">${esc(x.status)}</td><td>${esc(x.sender || x.drafter || x.drafterDept)}</td><td class="nowrap">${esc(x.date)}</td></tr>`).join('')}</table>` : '<p class="muted">없음</p>');
  };
  const mailRows = a.mail.recent.map(m => `<tr class="${m.seen ? '' : 'unread'}"><td>${m.seen ? '' : '<span class="pill high">안읽음</span>'}${esc(m.subject)}${m.attach ? ' <span class="muted">첨부</span>' : ''}<div class="muted">${esc(m.preview.slice(0, 90))}</div></td><td>${esc(m.from)}</td><td class="nowrap">${esc(m.date)}</td></tr>`).join('');
  const noticeRows = a.notice.recent.map(n => `<tr class="${n.read ? '' : 'unread'}"><td>${n.read ? '' : '<span class="pill medium">안읽음</span>'}${n.reserved ? '<span class="pill low">예약</span>' : ''}${esc(n.title)}</td><td>${esc(n.dept)} ${esc(n.writer)}</td><td class="nowrap">${esc(n.date.slice(0, 16))}</td></tr>`).join('');
  const budgetBlocks = a.budget.projects.map(p => p.error ? `<p class="warn">${esc(p.project)} 조회 실패: ${esc(p.message)}</p>` : `<h3>${esc(p.project)} ${esc(p.label)}${p.filter ? ` · ${esc(p.filter)}` : ''} <span class="muted">${esc(p.period)} · 연간 경과율 ${a.budget.elapsedPct}%</span></h3><table><tr><th>과목</th><th class="num">예산</th><th class="num">집행</th><th class="num">잔액</th><th class="num">집행률</th></tr>${p.rows.map(r => `<tr class="lv-${esc(r.level)}"><td>${esc(r.level)} ${esc(r.name)}</td><td class="num">${won(r.budget)}</td><td class="num">${won(r.executed)}${r.executedDelta ? `<div class="delta">+${won(r.executedDelta)}</div>` : ''}</td><td class="num">${won(r.balance)}</td><td class="num"><div class="bar"><i style="width:${Math.min(100, r.rate)}%"></i></div>${r.rate}%</td></tr>`).join('')}${p.total ? `<tr class="total"><td>${esc(p.project)} 프로젝트 전체</td><td class="num">${won(p.total.budget)}</td><td class="num">${won(p.total.executed)}</td><td class="num">${won(p.total.balance)}</td><td class="num">${p.total.rate}%</td></tr>` : ''}</table>`).join('');
  const lv = a.leave, at = a.attendance, sc = a.schedule;
  const events = sc?.events?.length ? `<ul>${sc.events.map(e => `<li>${esc(fmtYmdHm(e.start))} ${esc(e.title)} <span class="muted">${esc(e.calendar)}${e.place ? ' · ' + esc(e.place) : ''}</span></li>`).join('')}</ul>` : `<p class="muted">${esc(fmtYmd(sc?.start))} ~ ${esc(fmtYmd(sc?.end))} 그룹웨어 캘린더 일정 없음</p>`;
  const status = a.status.map(x => `<span class="pill ${x.ok ? 'ok' : 'high'}">${esc(x.name)} ${x.ok ? x.ms + 'ms' : esc(x.error)}</span>`).join(' ');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>그룹웨어 업무 브리핑 ${esc(kstText(a.collectedAt))}</title><style>
:root{--bg:#f6f7f9;--fg:#1d2330;--muted:#6b7280;--line:#e3e6eb;--card:#fff;--hi:#d93025;--md:#e37400;--lo:#5f6368;--ok:#188038;--accent:#1a73e8}
@media (prefers-color-scheme:dark){:root{--bg:#15181d;--fg:#e8eaed;--muted:#9aa0a6;--line:#2c313a;--card:#1d2128}}
*{box-sizing:border-box}body{margin:0;font:14px/1.55 "Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:1100px;margin:0 auto;padding:24px 18px 48px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}h3{font-size:15px;margin:18px 0 8px}
.muted{color:var(--muted);font-size:12.5px}.warn{color:var(--hi)}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:14px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.card .label{color:var(--muted);font-size:12.5px}.card .value{font-size:24px;font-weight:700}.card .sub{color:var(--muted);font-size:12px}.card.alert .value{color:var(--hi)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:12.5px;color:var(--muted);font-weight:600}tr:last-child td{border-bottom:0}
.num{text-align:right;white-space:nowrap}.nowrap{white-space:nowrap}.pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11.5px;margin-right:4px;border:1px solid currentColor}.pill.high{color:var(--hi)}.pill.medium{color:var(--md)}.pill.low{color:var(--lo)}.pill.ok{color:var(--ok)}.pill.new{color:var(--accent)}
tr.unread td:first-child{font-weight:600}tr.total td{font-weight:700}tr.lv-항 td,tr.lv-관 td{font-weight:600}.bar{height:5px;background:var(--line);border-radius:3px;margin-bottom:2px}.bar i{display:block;height:100%;background:var(--accent);border-radius:3px}.delta{color:var(--md);font-size:11.5px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:760px){.grid2{grid-template-columns:1fr}}footer{margin-top:30px;color:var(--muted);font-size:12px}
</style></head><body><main>
<h1>그룹웨어 업무 브리핑</h1><div class="muted">${esc(kstText(a.collectedAt))} KST 기준 · ${esc(a.principal.name)} ${esc(a.principal.duty || '')} · ${esc(a.principal.deptName)} · 수집 ${a.durationMs}ms · 읽기 전용</div>
${a.sessionExpired ? '<p class="warn"><b>로그인 세션이 만료되어 일부 자료를 읽지 못했습니다.</b> 그룹웨어에 다시 로그인한 뒤 실행하세요.</p>' : ''}${a.failed.length ? `<p class="warn">실패한 모듈: ${a.failed.map(f => esc(`${f.name}(${f.message || f.error})`)).join(', ')}</p>` : ''}
<div class="cards">${card('결재·접수·배부 처리', s.approvalAction + '건', `결재대기 ${s.pending ?? '-'} · 부서접수 ${s.deptWaiting ?? '-'} · 배부 ${s.distWaiting ?? '-'}`, s.approvalAction ? 'alert' : '')}${card('발송 대기', (s.sendWaiting ?? '-') + '건', '문서유통 > 발송함')}${card('내 상신 진행', s.inProgressSubmitted + '건', `반려/회수 ${s.rejectedSubmitted} · 임시보관 ${s.drafts ?? '-'}`, s.rejectedSubmitted ? 'alert' : '')}${card('안 읽은 메일', s.mailUnread + '건', `받은메일함 전체 ${s.inboxTotal ?? '-'}`, s.mailUnread ? 'alert' : '')}${card('안 읽은 공지', (s.noticeUnread ?? '-') + '건', `미열람 열람문서 ${s.viewingUnread ?? '-'}`)}${card('남은 연차', (s.leaveRemaining ?? '-') + '일', lv ? `부여 ${lv.granted} · 사용 ${lv.used}` : '')}</div>
${a.newSince ? `<p class="muted">지난 실행(${esc(kstText(a.newSince.since))}) 이후: 새 메일 ${a.newSince.mails}건 · 새 공지 ${a.newSince.notices}건 · 새 결재·문서 ${a.newSince.docs}건</p>` : ''}
<h2>오늘 할 일 <span class="muted">${a.actions.length}건 · 긴급 → 보통 → 참고 순</span></h2>${a.actions.length ? `<table><tr><th>구분</th><th>영역</th><th>내용</th><th>일시</th></tr>${actionRows}</table>` : '<p class="muted">처리할 항목이 없습니다.</p>'}
${a.deadlines.length ? `<h2>제목에서 찾은 기한</h2><table><tr><th>날짜</th><th></th><th>제목</th><th>출처</th></tr>${deadlineRows}</table><p class="muted">제목의 "~11.20.", "11월 20일까지" 같은 표현을 자동으로 읽은 값입니다. 본문 기한은 원문에서 확인하세요.</p>` : ''}
<h2>전자결재·문서유통</h2><div class="grid2"><div>${listBlock('pending')}${listBlock('deptWaiting')}${listBlock('distWaiting')}${listBlock('sendWaiting')}</div><div><h3>메뉴별 건수</h3><table><tr><th>메뉴</th><th class="num">건수</th><th class="num">전체</th></tr>${countRows}</table>${listBlock('submitted')}</div></div>
<h2>메일 ${link(a.mail.url, '받은메일함 열기')}</h2><p class="muted">${a.mail.boxes.filter(b => b.unseen).map(b => `${esc(b.name)} 안읽음 ${b.unseen}`).join(' · ') || '안 읽은 메일함 없음'} (스팸함 포함)</p><table><tr><th>제목 (최근 15통)</th><th>보낸 사람</th><th>받은 시각</th></tr>${mailRows}</table>
<h2>공지사항 ${link(a.notice.url, '게시판 열기')}</h2><table><tr><th>제목 (최근 10건)</th><th>작성</th><th>등록</th></tr>${noticeRows}</table>
<h2>예산 집행 ${link(a.budget.url, '예실대비현황 열기')}</h2>${budgetBlocks || '<p class="muted">설정된 예산 조회 대상이 없습니다.</p>'}
<h2>일정·근태</h2><div class="grid2"><div><h3>${link(sc?.url, '그룹웨어 일정')} <span class="muted">향후 ${sc ? dday(fmtYmd(sc.end)) : '-'}일</span></h3>${events}${sc?.holidays?.length ? `<p class="muted">휴일: ${sc.holidays.map(h => esc(fmtYmd(h.date) + ' ' + h.title)).join(', ')}</p>` : ''}</div><div><h3>${link(lv?.url, '연차')}</h3>${lv ? `<p>${esc(lv.year)}년 부여 <b>${lv.granted}</b> · 사용 <b>${lv.used}</b> · 잔여 <b>${lv.remaining}</b>일</p>${lv.upcoming.length ? `<ul>${lv.upcoming.map(u => `<li>${esc(fmtYmd(u.start))}${u.end !== u.start ? '~' + esc(fmtYmd(u.end)) : ''} ${esc(u.kind)} ${u.days}일 <span class="muted">${u.approved ? '결재완료' : '진행 중'}</span></li>`).join('')}</ul>` : '<p class="muted">예정된 휴가 없음</p>'}` : '<p class="muted">미조회</p>'}<h3>${link(at?.url, '근무시간')}</h3>${at ? `<p>이번 달 인정 ${hm(at.month.recognizedMin)} · 기본 ${hm(at.month.basicMin)} · 초과 ${hm(at.month.overtimeMin)}<br>오늘(${esc(fmtYmd(at.today.date))}) 출근 ${esc(at.today.come || '기록 없음')} · 퇴근 ${esc(at.today.leave || '기록 없음')}</p>` : '<p class="muted">미조회</p>'}</div></div>
<footer>수집 상태: ${status}<br>수집기 v${esc(a.collector)} · 생성 ${esc(kstText(a.generatedAt))} KST. 메일·문서·게시글을 열지 않는 목록 조회 API만 사용하므로 읽음 상태와 조회수는 바뀌지 않습니다. 금액·건수는 수집 시점 관찰값입니다.</footer>
</main></body></html>`;
}

// ---------- assistant dataset (browser-snapshot contract) ----------
const kstToIso = text => {
  const m = String(text || '').match(/^(\d{4})-?(\d{2})-?(\d{2})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (!m) return '';
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}+09:00`).toISOString();
};

export function toDataset(raw, scope) {
  const origin = raw.origin;
  const exportedAt = new Date(raw.collectedAt).toISOString();
  const base = {organizationId: scope.organizationId, allowedUserIds: [scope.userId]};
  const items = [];
  const d = raw.data || {};
  const lists = d.approval?.lists || {};
  const approvalKeys = [['pending', 'pending'], ['deptWaiting', 'pending'], ['distWaiting', 'pending'], ['sendWaiting', 'pending']];
  const seen = new Set();
  let approvalTotal = 0, approvalComplete = raw.status?.approval?.ok === true;
  for (const [key, status] of approvalKeys) {
    const l = lists[key];
    if (!l || l.error) { approvalComplete = false; continue; }
    if (l.total === null || l.total !== l.docs.length) approvalComplete = false;
    approvalTotal += Math.max(l.total ?? 0, l.docs.length);
    for (const doc of l.docs) {
      const id = `gw:approval:${key}:${doc.docId}`.replace(/[^a-zA-Z0-9_.:-]/g, '_');
      if (seen.has(id)) continue; seen.add(id);
      items.push({...base, id, type: 'approval', status, title: doc.title || '(제목 없음)', body: `${l.label} · ${[doc.status, doc.sender || doc.drafter, doc.docNo].filter(Boolean).join(' · ')}. 그룹웨어 목록 API 조회값이며 본문은 수집하지 않았습니다.`, updatedAt: kstToIso(doc.date) || exportedAt, url: l.url, tags: ['그룹웨어', l.label]});
    }
  }
  const notices = d.notice?.articles || [];
  for (const n of notices.filter(x => !x.reserved)) {
    items.push({...base, id: `gw:notice:${n.id}`.replace(/[^a-zA-Z0-9_.:-]/g, '_'), type: 'notice', status: 'published', title: n.title || '(제목 없음)', body: `${n.dept} ${n.writer} 작성 · 등록 ${n.date}${n.files ? ` · 첨부 ${n.files}개` : ''}. 목록 조회값이며 본문은 수집하지 않았습니다.`, updatedAt: kstToIso(n.date) || exportedAt, url: d.notice.url, tags: ['그룹웨어', '공지사항']});
  }
  const events = (d.schedule?.events || []).map(e => ({e, s: kstToIso(e.start), t: kstToIso(e.end)})).filter(x => x.s && x.t && x.s < x.t);
  for (const {e, s, t} of events) items.push({...base, id: `gw:schedule:${e.id}`.replace(/[^a-zA-Z0-9_.:-]/g, '_'), type: 'schedule', status: 'published', title: e.title || '(제목 없음)', body: `${e.calendar}${e.place ? ' · ' + e.place : ''}${e.people ? ' · ' + e.people : ''}`, updatedAt: exportedAt, url: d.schedule.url, startsAt: s, endsAt: t, tags: ['그룹웨어', e.calendar]});
  const approvalCount = items.filter(i => i.type === 'approval').length;
  const noticeCount = items.filter(i => i.type === 'notice').length;
  const scheduleCount = items.filter(i => i.type === 'schedule').length;
  const coverage = [
    raw.status?.approval?.ok ? {type: 'approval', state: approvalComplete ? 'complete' : 'partial', query: `결재대기·부서접수대기·배부대기·발송대기 목록 API, 최근 ${raw.options?.approvalDays ?? 92}일`, collected: approvalCount, total: Math.max(approvalTotal, approvalCount), url: d.approval.url} : {type: 'approval', state: 'unobserved', query: '결재 조회 실패', collected: 0, total: null, url: ''},
    raw.status?.schedule?.ok ? {type: 'schedule', state: 'complete', query: `${d.schedule.start}~${d.schedule.end} 표시 캘린더 ${d.schedule.calendars.length}개, 삭제 일정 제외`, collected: scheduleCount, total: scheduleCount, url: d.schedule.url} : {type: 'schedule', state: 'unobserved', query: '일정 조회 실패', collected: 0, total: null, url: ''},
    raw.status?.notice?.ok ? {type: 'notice', state: 'partial', query: `공지사항 최근 ${notices.length}건 목록(예약 게시 제외)`, collected: noticeCount, total: Math.max(d.notice.total || 0, noticeCount), url: d.notice.url} : {type: 'notice', state: 'unobserved', query: '공지 조회 실패', collected: 0, total: null, url: ''},
    {type: 'document', state: 'unobserved', query: '규정·서식·첨부는 수집하지 않습니다.', collected: 0, total: null, url: ''},
  ];
  return {schemaVersion: 1, source: {kind: 'browser-snapshot', label: `그룹웨어 실시간 목록 조회 · ${raw.principal?.compName || ''} ${raw.principal?.deptName || ''}`.trim(), exportedAt, baseUrl: origin, coverage}, principal: {userId: scope.userId, displayName: scope.displayName, organizationId: scope.organizationId}, items};
}
