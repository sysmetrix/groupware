// GW 비서 · 수집 자료 모양 검사(순수 로직).
// 그룹웨어가 업데이트되어 응답 필드 이름이 바뀌면, 조회는 "성공"인데 제목·날짜가 빈 줄이 조용히 들어온다.
// 수집기가 정리한 자료(BWYFGW.collect()의 data)를 보고 그런 흔적을 찾아, 화면이 틀린 내용을 맞는 것처럼 보이지 않게 한다.
// briefing.mjs 뒤에 이어 붙는다: import 금지, DOM·localStorage 접근 금지, 최상위 비공개 이름은 ct 접두.

const CT_MIN_ROWS = 3;      // 줄이 이보다 적으면 비율로 판단하지 않는다(우연히 빈 값일 수 있다)
const CT_MISSING_RATE = 0.6; // 꼭 있어야 하는 값이 이 비율 이상 비어 있으면 모양이 바뀐 것으로 본다

const ctArr = v => Array.isArray(v) ? v : [];
const ctEmpty = v => v === null || v === undefined || v === '';

/** 목록 하나를 검사한다. rows 의 fields 가 대부분 비었거나, 서버는 total 건이라는데 한 줄도 못 읽었으면 문제로 적는다. */
function ctList(area, where, rows, fields, total) {
  const out = [];
  const list = ctArr(rows);
  if (Number(total) > 0 && list.length === 0) out.push({area, where, kind: 'empty-list', detail: `${total}건이 있다는데 한 줄도 읽지 못했습니다`});
  if (list.length < CT_MIN_ROWS) return out;
  for (const f of fields) {
    const missing = list.filter(r => !r || ctEmpty(r[f])).length;
    if (missing / list.length >= CT_MISSING_RATE) out.push({area, where, kind: 'missing-field', field: f, detail: `${list.length}줄 가운데 ${missing}줄에서 ${f} 값이 비어 있습니다`});
  }
  return out;
}

export const CONTRACT_AREA_LABEL = {mail: '메일', approval: '결재·문서유통', notice: '공지', schedule: '일정', attendance: '근태', leave: '연차', budget: '예산', alerts: '알림'};

/**
 * 수집 결과(raw = BWYFGW.collect()의 결과)의 모양을 검사한다.
 * 돌려주는 값: {ok, issues: [{area, where, kind, field?, detail}], areas: [문제가 있는 영역 이름]}
 * 조회 자체가 실패한 영역(status.ok === false)은 이미 따로 표시되므로 여기서는 보지 않는다.
 */
export function contractCheck(raw) {
  const issues = [];
  const data = raw && raw.data && typeof raw.data === 'object' ? raw.data : {};
  const okArea = name => !raw || !raw.status || !raw.status[name] || raw.status[name].ok !== false;

  if (data.mail && okArea('mail')) {
    const inbox = data.mail.inbox || {};
    issues.push(...ctList('mail', '받은 메일', inbox.records, ['uid', 'subject', 'date'], inbox.total));
    if (!Array.isArray(data.mail.boxes) || !data.mail.boxes.length) issues.push({area: 'mail', where: '메일함 목록', kind: 'empty-list', detail: '메일함을 하나도 읽지 못했습니다'});
  }
  if (data.approval && okArea('approval')) {
    const lists = data.approval.lists && typeof data.approval.lists === 'object' ? data.approval.lists : {};
    for (const [key, l] of Object.entries(lists)) {
      if (!l || l.error) continue;
      // 날짜는 목록 종류에 따라 원래 비어 있을 수 있어 보지 않는다.
      issues.push(...ctList('approval', l.label || key, l.docs, ['docId', 'title'], l.total));
    }
    if (!Object.keys(lists).length) issues.push({area: 'approval', where: '결재함', kind: 'empty-list', detail: '결재함 목록을 하나도 읽지 못했습니다'});
  }
  if (data.notice && okArea('notice')) issues.push(...ctList('notice', '공지', data.notice.articles, ['id', 'title', 'date'], data.notice.total));
  if (data.schedule && okArea('schedule')) {
    issues.push(...ctList('schedule', '일정', data.schedule.events, ['id', 'title', 'start']));
    const bad = ctArr(data.schedule.events).filter(e => e && e.start && !/^\d{8}/.test(String(e.start))).length;
    if (ctArr(data.schedule.events).length >= CT_MIN_ROWS && bad / data.schedule.events.length >= CT_MISSING_RATE) issues.push({area: 'schedule', where: '일정', kind: 'bad-format', field: 'start', detail: '일정 시작일의 형식이 예전과 다릅니다'});
  }
  if (data.attendance && okArea('attendance')) {
    const a = data.attendance;
    if (!a.today || !/^\d{8}$/.test(String(a.today.date || ''))) issues.push({area: 'attendance', where: '오늘 출퇴근', kind: 'bad-format', field: 'date', detail: '오늘 날짜를 읽지 못했습니다'});
    if (a.month && !a.month.error && a.month.recognizedMin === null && a.month.basicMin === null && a.month.overtimeMin === null) issues.push({area: 'attendance', where: '이번 달 근무시간', kind: 'missing-field', field: 'recognizedMin', detail: '이번 달 근무시간 값이 모두 비어 있습니다'});
  }
  if (data.leave && okArea('leave')) {
    const l = data.leave;
    if (![l.granted, l.used, l.remaining].every(Number.isFinite)) issues.push({area: 'leave', where: '연차 합계', kind: 'bad-format', field: 'granted', detail: '연차 합계가 숫자가 아닙니다'});
    else if (l.granted === 0 && l.used === 0 && ctArr(l.history).length >= CT_MIN_ROWS) issues.push({area: 'leave', where: '연차 합계', kind: 'missing-field', field: 'granted', detail: '사용 내역은 있는데 부여·사용 일수가 모두 0입니다'});
    issues.push(...ctList('leave', '연차 사용 내역', l.history, ['start', 'kind']));
  }
  if (data.budget && okArea('budget') && !data.budget.skipped) {
    for (const p of ctArr(data.budget.projects)) {
      if (!p || p.error) continue;
      issues.push(...ctList('budget', p.label || p.project || '예산', p.rows, ['code', 'name'], p.rowCount));
      const rows = ctArr(p.rows);
      if (rows.length >= CT_MIN_ROWS && rows.every(r => r && r.budget === 0 && r.executed === 0 && r.balance === 0)) issues.push({area: 'budget', where: p.label || p.project || '예산', kind: 'missing-field', field: 'budget', detail: '모든 과목의 예산·집행·잔액이 0입니다'});
    }
  }
  if (data.alerts && okArea('alerts')) issues.push(...ctList('alerts', '알림', data.alerts.alerts, ['title']));

  const areas = [...new Set(issues.map(i => i.area))];
  return {ok: issues.length === 0, issues, areas};
}

/** 사용자에게 보일 한 줄. 문제가 없으면 빈 문자열. */
export function contractMessage(result) {
  if (!result || result.ok || !result.areas || !result.areas.length) return '';
  const names = result.areas.map(a => CONTRACT_AREA_LABEL[a] || a).join(', ');
  return `그룹웨어 화면이 바뀐 것으로 보입니다. ${names} 자료가 정확하지 않을 수 있으니 그룹웨어 원래 화면에서 확인해 주세요.`;
}
