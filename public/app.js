const $ = id => document.getElementById(id);
let status, busy = false, currentView = 'briefing';
const labels = {briefing: ['내 업무 브리핑', '오늘의 업무를 한눈에.', '확인이 필요한 일과 근거를 함께 정리합니다.'], search: ['규정 · 서식 검색', '답변보다 먼저, 근거.', '유효한 문서에서 필요한 내용을 찾아 원문과 함께 확인하세요.'], validate: ['초안 사전 점검', '제출 전에 한 번 더.', '필수 입력과 날짜, 본문·첨부 입력 금액의 일치를 확인합니다.'], data: ['데이터 연결', '업무 자료를 연결하세요.', '합성 예제로 시작하고, 권한 내 자료를 가져와 검증하세요.'], audit: ['실행 기록', '무엇을 확인했는지 남깁니다.', '작업의 시각과 결과를 되짚어볼 수 있습니다.']};
const formatTime = value => new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(value));
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; $('message').hidden = !text; }
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {method: 'POST', headers: {'content-type': 'application/json', 'x-csrf-token': status?.csrf || ''}, body: JSON.stringify(body)});
  const data = await response.json(); if (!response.ok) throw new Error(data.error || data.message || '요청에 실패했습니다.'); return data;
}
async function operation(button, action) {
  if (busy) return; busy = true; const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = '처리 중…'; }
  message('');
  try { await action(); } catch (error) { message(error.message, true); }
  finally { if (button) { button.disabled = false; button.textContent = original; } busy = false; }
}
async function refreshStatus() {
  status = await api('/api/status');
  $('mode').textContent = status.source.kind === 'demo' ? '합성 예제' : '가져온 데이터';
  $('user-name').textContent = status.principal.displayName;
  $('source-label').textContent = status.source.label;
  $('source-detail').textContent = `실시간 미연결 · 열람 범위 ${status.visibleCount}건 · ${formatTime(status.source.exportedAt)} 기준`;
  for (const id of ['briefing-model', 'search-model']) { $(id).disabled = !status.capabilities.model; if (!status.capabilities.model) $(id).checked = false; }
  const details = [['자료 종류', status.source.kind === 'demo' ? '합성 예제 (실제 업무 자료 아님)' : '수동 가져오기'], ['기준 시각', formatTime(status.source.exportedAt)], ['현재 범위', `${status.principal.organizationId} / ${status.principal.userId}`], ['그룹웨어', '실시간 미연결'], ['AI 요약', status.model || '미설정 · 근거 조회와 규칙 검사 사용 가능'], ['변경 작업', '상신 · 승인 · 발송 기능 없음']];
  $('connection-details').replaceChildren(...details.flatMap(([key, value]) => [element('dt', key), element('dd', value)]));
  await refreshAutomation();
}
async function refreshAutomation() {
  const state = await api('/api/automation');
  const fields = [['파일 자동화', state.enabled ? '사용 중' : '미설정'], ['정기 브리핑', `${state.briefingTime} (한국 시간)`], ['확인 간격', `${state.intervalSeconds}초`], ['최근 결과', state.message], ['마지막 성공', state.lastSuccessAt ? formatTime(state.lastSuccessAt) : '없음'], ['오늘의 보고서', state.reportAvailable ? formatTime(state.reportGeneratedAt) : '현재 자료에 맞는 보고서 없음']];
  if (state.recoveryAction) fields.push(['필요한 조치', state.recoveryAction]);
  if (state.consecutiveFailures) fields.push(['연속 실패', `${state.consecutiveFailures}회`]);
  if (state.nextCheckAt) fields.push(['다음 확인', formatTime(state.nextCheckAt)]);
  $('automation-details').replaceChildren(...fields.flatMap(([key, value]) => [element('dt', key), element('dd', value)]));
  $('run-automation').disabled = !state.enabled; $('download-report').disabled = !state.reportAvailable;
}
function sourceLink(item) {
  if (!item.url) return element('span', '원문 링크 없음', 'subtle');
  const link = element('a', '원문 확인 ↗', 'source-link'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
function record(item, kind) {
  const box = element('article', undefined, 'record'); box.append(element('h3', item.title, 'record-title'), element('p', item.excerpt, 'record-body'));
  const meta = element('div', undefined, 'record-meta');
  if (kind === 'approval') meta.append(element('span', item.overdue ? '기한 경과' : item.dueDate ? '확인 대기' : '기한 미정', `tag${item.overdue ? ' urgent' : ''}`));
  if (item.dueDate) meta.append(element('span', `기한 ${item.dueDate}`));
  if (item.startsAt) meta.append(element('span', `${formatTime(item.startsAt)} – ${formatTime(item.endsAt)}`));
  if (item.version) meta.append(element('span', item.version));
  meta.append(sourceLink(item)); box.append(meta); return box;
}
function fillList(id, items, kind, empty) { $(id).replaceChildren(...(items.length ? items.map(item => record(item, kind)) : [element('div', empty, 'empty')])); }
function renderAi(id, ai, references) {
  $(id).replaceChildren(); if (!ai) return;
  const box = element('section', undefined, 'ai-panel'); box.append(element('h2', 'AI 요약'), element('small', ai.message));
  for (const claim of ai.claims) {
    box.append(element('p', claim.text));
    const cite = element('div', undefined, 'record-meta');
    for (const sourceId of claim.sourceIds) { const ref = references.find(x => x.id === sourceId); if (ref) { cite.append(element('span', ref.title), sourceLink(ref)); } }
    box.append(cite);
  }
  $(id).append(box);
}
async function briefing() {
  await refreshStatus();
  const result = await api('/api/run', {task: 'briefing', useModel: $('briefing-model').checked});
  const cards = [['결재 대기', result.counts.pending, '검토가 필요한 문서', '◫'], ['기한 경과', result.counts.overdue, '원문 상태를 확인하세요', '◷'], ['다가오는 일정', result.counts.schedules, '오늘부터 7일 이내', '▦'], ['최근 공지', result.counts.notices, '가져온 자료 기준', '≋']];
  $('stats').replaceChildren(...cards.map(([label, count, note, icon]) => { const card = element('article', undefined, 'stat'); card.append(element('span', label, 'stat-label'), element('span', icon, 'stat-icon'), element('strong', String(count)), element('small', note)); return card; }));
  fillList('approval-list', result.approvals, 'approval', '가져온 자료에 대기 중인 결재가 없습니다.');
  fillList('schedule-list', result.schedules, 'schedule', '7일 이내 남은 일정이 없습니다.');
  fillList('notice-list', result.notices, 'notice', '가져온 자료에 공지가 없습니다.');
  renderAi('briefing-ai', result.ai, result.references);
  $('briefing-footnote').textContent = `${formatTime(result.observedAt)} 정리 · 자료 기준 ${formatTime(result.source.exportedAt)} · 가져오지 않은 업무는 포함되지 않습니다. 원문에서 최신 상태를 확인하세요.`;
}
async function audit() {
  const {events} = await api('/api/audit');
  const names = {'task.briefing': '업무 브리핑', 'task.search': '문서 검색', 'task.validate': '초안 점검', 'dataset.replace': '데이터 교체', 'automation.briefing': '정기 브리핑 생성', 'automation.sync': '자동 자료 확인'};
  const outcomes = {started: '시작', completed: '완료', partial: '일부 완료', failed: '실패'};
  $('audit-list').replaceChildren(...(events.length ? events.map(event => { const row = element('div', undefined, 'audit-row'); row.append(element('span', names[event.action] || event.action), element('span', formatTime(event.at)), element('span', outcomes[event.outcome] || event.outcome, 'tag')); return row; }) : [element('div', '아직 실행 기록이 없습니다.', 'empty')]));
}
function switchView(view) {
  if (busy) return; currentView = view;
  for (const node of document.querySelectorAll('.view')) node.hidden = node.id !== view + '-view';
  for (const node of document.querySelectorAll('.nav')) { node.classList.toggle('active', node.dataset.view === view); if (node.dataset.view === view) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current'); }
  const [crumb, title, description] = labels[view]; $('breadcrumb').textContent = crumb; $('page-title').textContent = title; $('page-description').textContent = description;
  message(''); if (view === 'audit') operation(null, audit);
}
for (const node of document.querySelectorAll('[data-view]')) node.addEventListener('click', () => switchView(node.dataset.view));
$('source-link').addEventListener('click', () => switchView('data'));
$('refresh-briefing').addEventListener('click', event => operation(event.currentTarget, briefing));
$('refresh-audit').addEventListener('click', event => operation(event.currentTarget, audit));
$('refresh-automation').addEventListener('click', event => operation(event.currentTarget, refreshAutomation));
$('run-automation').addEventListener('click', event => operation(event.currentTarget, async () => {
  try { await api('/api/automation/run', {}); await changedData(); message('내보낸 자료로 브리핑을 생성했습니다.'); }
  finally { await refreshAutomation(); }
}));
$('download-report').addEventListener('click', event => operation(event.currentTarget, async () => {
  const report = await api('/api/report'), blob = new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}), url = URL.createObjectURL(blob), link = element('a');
  link.href = url; link.download = 'groupware-briefing.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
$('search-form').addEventListener('submit', event => {
  event.preventDefault(); operation(event.submitter, async () => {
    const result = await api('/api/run', {task: 'search', query: $('search-query').value, useModel: $('search-model').checked});
    $('search-results').replaceChildren(element('p', result.message, 'subtle'), ...result.hits.map(item => { const box = element('section', undefined, 'panel result-card'); box.append(record(item, 'document')); return box; }));
    renderAi('search-ai', result.ai, result.references);
  });
});
$('draft-form').addEventListener('submit', event => {
  event.preventDefault(); operation(event.submitter, async () => {
    const result = await api('/api/run', {task: 'validate', draft: Object.fromEntries(new FormData(event.target))});
    const box = $('draft-results'); box.replaceChildren(element('h2', '점검 결과'), element('p', result.passed ? '기본 오류 없음 · 추가 확인 필요' : '입력 항목을 확인하세요', 'result-status' + (result.passed ? '' : ' failed')));
    for (const finding of result.findings) box.append(element('div', `${finding.level === 'error' ? '확인 필요' : '미확인'} · ${finding.message}`, 'check-item ' + finding.level));
    if (!result.findings.length) box.append(element('p', '입력된 기본 항목과 금액 대조를 통과했습니다.', 'subtle'));
    for (const note of result.limitations) box.append(element('p', note, 'subtle'));
  });
});
async function changedData() {
  await refreshStatus(); $('search-ai').replaceChildren(); $('search-results').replaceChildren(element('div', '데이터가 변경되었습니다. 다시 검색하세요.', 'empty')); $('draft-results').replaceChildren(element('div', '초안을 입력해 다시 점검하세요.', 'empty'));
  await briefing();
}
$('import-button').addEventListener('click', event => operation(event.currentTarget, async () => {
  if (!$('confirm-import').checked) throw new Error('현재 데이터 교체 확인란을 선택하세요.');
  const file = $('import-file').files[0]; if (!file) throw new Error('JSON 파일을 선택하세요.'); if (file.size > 5 * 1024 * 1024) throw new Error('파일은 5 MB 이하여야 합니다.');
  let dataset; try { dataset = JSON.parse(await file.text()); } catch { throw new Error('올바른 JSON 파일이 아닙니다.'); }
  await api('/api/import', dataset); await changedData(); $('confirm-import').checked = false; $('import-file').value = ''; message('자료를 가져왔습니다. 표시된 조직·사용자와 자료 기준 시각을 확인하세요.');
}));
$('reset-demo').addEventListener('click', event => operation(event.currentTarget, async () => {
  if (!$('confirm-reset').checked) throw new Error('예제 데이터 교체 확인란을 선택하세요.');
  await api('/api/reset-demo', {}); await changedData(); $('confirm-reset').checked = false; message('합성 예제로 전환했습니다.');
}));
$('download-example').addEventListener('click', event => operation(event.currentTarget, async () => {
  const data = await api('/api/example'), blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}), url = URL.createObjectURL(blob), link = element('a');
  link.href = url; link.download = 'groupware-example.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
$('date-label').textContent = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'}).format(new Date());
await operation(null, async () => { await refreshStatus(); await briefing(); });
setInterval(() => {
  if (busy || document.hidden) return;
  void operation(null, async () => {
    const revision = status?.revision; await refreshStatus();
    if (revision !== status.revision) { await changedData(); message('새로 가져온 자료가 반영되었습니다.'); }
  });
}, 30000);
