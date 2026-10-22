import {AppError, date, effectiveDocument, kstDate, object, string, visibleItems} from './schema.mjs';
import {attachmentMoney} from './money.mjs';

const reference = item => ({id: item.id, title: item.title, type: item.type, status: item.status, url: item.url, updatedAt: item.updatedAt, version: item.version, ...(item.attachment ? {documentId: item.documentId, attachment: item.attachment, locationLabel: item.locationLabel} : {})});
const locationLabel = (format, location) => format === 'pdf' ? `PDF ${location.page}쪽` : format === 'xlsx' ? `${location.sheet} · ${location.cell}` : `구역 ${location.section} · 문단 ${location.paragraph}`;
export function buildBriefing(dataset, now = new Date()) {
  const today = kstDate(now), visible = visibleItems(dataset);
  const endDate = new Date(Date.parse(today + 'T00:00:00Z') + 7 * 86400_000).toISOString().slice(0, 10);
  const approvals = visible.filter(x => x.type === 'approval' && x.status === 'pending')
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .map(x => ({...reference(x), dueDate: x.dueDate, overdue: Boolean(x.dueDate && x.dueDate < today), excerpt: x.body.slice(0, 300)}));
  const notices = visible.filter(x => x.type === 'notice' && x.status === 'published')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10)
    .map(x => ({...reference(x), dueDate: x.dueDate, excerpt: x.body.slice(0, 300)}));
  const schedules = visible.filter(x => x.type === 'schedule' && ['pending', 'published'].includes(x.status) && x.endsAt > now.toISOString() && kstDate(new Date(x.startsAt)) < endDate)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map(x => ({...reference(x), startsAt: x.startsAt, endsAt: x.endsAt, excerpt: x.body.slice(0, 300)}));
  return {task: 'briefing', observedAt: now.toISOString(), today, counts: {pending: approvals.length, overdue: approvals.filter(x => x.overdue).length, schedules: schedules.length, notices: notices.length}, approvals, schedules, notices, references: [...approvals, ...schedules, ...notices].map(reference)};
}

export function searchDocuments(dataset, query, now = new Date()) {
  query = string(query, '검색어', 300);
  const terms = [...new Set(query.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])];
  if (!terms.length) throw new AppError('검색할 단어를 입력하세요.');
  const hits = visibleItems(dataset).filter(item => item.type === 'document' && effectiveDocument(item, kstDate(now)))
    .flatMap(item => {
      const title = item.title.normalize('NFKC').toLowerCase();
      const body = item.body.normalize('NFKC').toLowerCase();
      const tags = item.tags.join(' ').normalize('NFKC').toLowerCase();
      const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 5 : 0) + (tags.includes(term) ? 3 : 0) + (body.includes(term) ? 1 : 0), 0);
      const first = terms.map(term => body.indexOf(term)).filter(pos => pos >= 0).sort((a, b) => a - b)[0] ?? 0;
      // Use original text as evidence, never manufacture an answer when matching fails.
      const documentHit = {...reference(item), score, excerpt: item.body.slice(Math.max(0, first - 60), Math.max(0, first - 60) + 650), effectiveFrom: item.effectiveFrom, effectiveTo: item.effectiveTo};
      const attachments = (item.attachments || []).flatMap(attachment => attachment.units.map(unit => {
        const text = unit.text.normalize('NFKC').toLowerCase();
        const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
        const first = terms.map(term => text.indexOf(term)).filter(pos => pos >= 0).sort((a, b) => a - b)[0] ?? 0;
        const amount = attachmentMoney(unit.text);
        return {...reference(item), id: `attachment#${encodeURIComponent(item.id)}#${encodeURIComponent(attachment.id)}#${encodeURIComponent(unit.id)}`, documentId: item.id,
          title: `${item.title} · ${attachment.filename}`, score, excerpt: unit.text.slice(Math.max(0, first - 60), Math.max(0, first - 60) + 650),
          locationLabel: locationLabel(attachment.format, unit.location),
          attachment: {id: attachment.id, filename: attachment.filename, format: attachment.format, sha256: attachment.sha256, location: unit.location, warnings: attachment.warnings},
          ...(amount !== null ? {amountCandidate: amount, selection: {documentId: item.id, attachmentId: attachment.id, unitId: unit.id, version: item.version, updatedAt: item.updatedAt, sha256: attachment.sha256}} : {})};
      }));
      return [documentHit, ...attachments];
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  return {task: 'search', query, observedAt: now.toISOString(), hits, references: hits.map(reference), message: hits.length ? `유효한 문서·첨부에서 검색어와 일치하는 근거 ${hits.length}건을 찾았습니다.` : '접근 가능한 유효 문서에서 일치하는 근거를 찾지 못했습니다.'};
}

export function validateDraft(input) {
  object(input, 'draft', ['title', 'purpose', 'businessDate', 'amount', 'attachmentAmount', 'attachmentNames']);
  const fields = {};
  for (const name of ['title', 'purpose', 'businessDate', 'amount', 'attachmentAmount', 'attachmentNames']) {
    const value = input[name] ?? '';
    if (typeof value !== 'string' || value.length > 10000) throw new AppError(`${name}: 문자열 입력이 필요합니다.`);
    fields[name] = value.trim();
  }
  const findings = [];
  for (const [field, label] of [['title', '제목'], ['purpose', '목적'], ['businessDate', '사업일'], ['amount', '본문 금액']]) {
    if (!fields[field]) findings.push({code: 'REQUIRED', level: 'error', field, message: `${label}이 비어 있습니다.`});
  }
  if (fields.businessDate) {
    try { date(fields.businessDate, '사업일', false); } catch { findings.push({code: 'INVALID_DATE', level: 'error', field: 'businessDate', message: '사업일을 유효한 YYYY-MM-DD 날짜로 입력하세요.'}); }
  }
  const parseMoney = (value, field) => {
    if (!value) return null;
    if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(value)) {
      findings.push({code: 'INVALID_AMOUNT', level: 'error', field, message: '금액은 0 이상의 정수(원 단위)로 입력하세요.'}); return null;
    }
    const amount = Number(value.replaceAll(',', ''));
    if (!Number.isSafeInteger(amount)) { findings.push({code: 'INVALID_AMOUNT', level: 'error', field, message: '처리할 수 있는 금액 범위를 초과했습니다.'}); return null; }
    return amount;
  };
  const amount = parseMoney(fields.amount, 'amount'), attachmentAmount = parseMoney(fields.attachmentAmount, 'attachmentAmount');
  if (amount !== null && attachmentAmount !== null && amount !== attachmentAmount) findings.push({code: 'AMOUNT_MISMATCH', level: 'error', field: 'attachmentAmount', message: `본문과 첨부 입력 금액이 ${Math.abs(amount - attachmentAmount).toLocaleString('ko-KR')}원 다릅니다.`});
  if (!fields.attachmentNames) findings.push({code: 'ATTACHMENT_UNCONFIRMED', level: 'warning', field: 'attachmentNames', message: '첨부 목록이 없습니다. 필요한 증빙과 실제 첨부 여부를 확인하세요.'});
  if (attachmentAmount === null) findings.push({code: 'ATTACHMENT_AMOUNT_UNCONFIRMED', level: 'warning', field: 'attachmentAmount', message: '첨부 금액을 대조하지 못했습니다.'});
  return {task: 'validate', passed: findings.every(x => x.level !== 'error'), findings, checked: ['기본 필드', '날짜 형식', '입력 금액 대조', '첨부 목록 기재'], limitations: ['입력한 값만 검사하며 실제 첨부 파일은 열지 않습니다.', '기관 규정·예산 잔액·결재선·법적 적합성은 판정하지 않습니다.', '기본 검사를 통과해도 상신 또는 결재 승인을 의미하지 않습니다.'], references: []};
}

export function runTask(dataset, request, now = new Date()) {
  object(request, 'request', ['task', 'query', 'draft', 'useModel', 'attachmentEvidence', 'expectedRevision']);
  if (request.attachmentEvidence !== undefined && request.task !== 'validate') throw new AppError('첨부 금액 근거는 초안 점검에서만 사용합니다.');
  if (request.useModel !== undefined && typeof request.useModel !== 'boolean') throw new AppError('useModel은 boolean이어야 합니다.');
  let result;
  if (request.task === 'briefing') result = buildBriefing(dataset, now);
  else if (request.task === 'search') result = searchDocuments(dataset, request.query, now);
  else if (request.task === 'validate') {
    if (request.attachmentEvidence === undefined) result = validateDraft(request.draft);
    else {
      const selected = object(request.attachmentEvidence, 'attachmentEvidence', ['documentId', 'attachmentId', 'unitId', 'version', 'updatedAt', 'sha256', 'confirmed']);
      if (selected.confirmed !== true) throw new AppError('선택한 숫자가 대조할 원 단위 금액인지 확인하세요.');
      for (const key of ['documentId', 'attachmentId', 'unitId', 'version', 'updatedAt', 'sha256']) string(selected[key], key, 100);
      const doc = visibleItems(dataset).find(x => x.id === selected.documentId && x.type === 'document' && effectiveDocument(x, kstDate(now)));
      const att = doc?.attachments?.find(x => x.id === selected.attachmentId);
      const unit = att?.units.find(x => x.id === selected.unitId);
      if (!unit || doc.version !== selected.version || doc.updatedAt !== selected.updatedAt || att.sha256 !== selected.sha256 || att.documentVersion !== doc.version || att.documentUpdatedAt !== doc.updatedAt) throw new AppError('첨부 근거가 변경되었거나 접근할 수 없습니다. 다시 검색해 선택하세요.', 409);
      const amount = attachmentMoney(unit.text);
      if (amount === null) throw new AppError('선택한 근거는 단일 정수 금액으로 해석할 수 없습니다.');
      // Reject unknown draft fields before replacing the user-entered comparison value.
      validateDraft(request.draft);
      result = validateDraft({...request.draft, attachmentAmount: String(amount)});
      result.checked = result.checked.map(x => x === '입력 금액 대조' ? '선택한 첨부 추출값과 본문 금액 대조' : x);
      result.limitations[0] = '가져온 첨부의 선택 단위와 비교합니다. 원본 파일의 최신성·합계·통화·숫자의 업무 의미는 별도 확인하세요.';
      result.evidenceAmount = amount;
      result.references = [{...reference(doc), id: `attachment#${encodeURIComponent(doc.id)}#${encodeURIComponent(att.id)}#${encodeURIComponent(unit.id)}`, documentId: doc.id, title: `${doc.title} · ${att.filename}`, excerpt: unit.text, locationLabel: locationLabel(att.format, unit.location), attachment: {id: att.id, filename: att.filename, format: att.format, sha256: att.sha256, location: unit.location, warnings: att.warnings}}];
    }
  }
  else throw new AppError('지원하는 작업은 briefing, search, validate입니다.');
  return {...result, trace: [{tool: 'scope.filter', status: 'completed'}, {tool: request.task === 'briefing' ? 'work.briefing' : request.task === 'search' ? 'documents.search' : 'draft.validate', status: 'completed'}]};
}
