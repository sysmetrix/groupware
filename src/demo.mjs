import {kstDate, validateDataset} from './schema.mjs';

export function createDemoDataset(now = new Date()) {
  const today = kstDate(now);
  const offset = days => new Date(Date.parse(today + 'T00:00:00Z') + days * 86400_000).toISOString().slice(0, 10);
  const common = {organizationId: 'demo-org', allowedUserIds: ['demo-user'], updatedAt: now.toISOString(), url: ''};
  return validateDataset({
    schemaVersion: 1,
    source: {kind: 'demo', label: '가상 기관 · 합성 예제', exportedAt: now.toISOString()},
    principal: {userId: 'demo-user', displayName: '체험 사용자', organizationId: 'demo-org'},
    items: [
      {...common, id: 'approval-001', type: 'approval', status: 'pending', title: '프로그램 운영계획 검토', body: '가상의 운영계획입니다. 목적, 일정, 예산 및 첨부의 일치 여부를 확인하세요.', dueDate: today, tags: ['사업운영']},
      {...common, id: 'approval-002', type: 'approval', status: 'pending', title: '워크숍 결과보고 확인', body: '결과보고 초안의 참석 인원과 집행 금액 검토가 필요합니다.', dueDate: offset(-1), tags: ['결과보고']},
      {...common, id: 'approval-003', type: 'approval', status: 'completed', title: '지난달 물품 구매', body: '이미 완료된 가상 문서입니다.', dueDate: offset(-4)},
      {...common, id: 'notice-001', type: 'notice', status: 'published', title: '이번 주 실적 취합 안내', body: '사업별 실적 요약과 근거 자료를 정리해 주세요. 담당자 확인 후 제출하는 예제 업무입니다.', dueDate: offset(2), tags: ['실적', '보고']},
      {...common, id: 'notice-002', type: 'notice', status: 'published', title: '공용 회의실 사용 안내', body: '회의실 사용 후 장비 전원을 확인해 주세요. 이 안내는 가상 데이터입니다.', tags: ['회의실']},
      {...common, id: 'schedule-001', type: 'schedule', status: 'published', title: '사업 운영회의', body: '예제 일정 · 주간 진행 현황을 공유합니다.', startsAt: today + 'T14:00:00+09:00', endsAt: today + 'T15:00:00+09:00'},
      {...common, id: 'schedule-002', type: 'schedule', status: 'published', title: '실적 보고 준비', body: '예제 일정 · 보고 자료의 누락을 확인합니다.', startsAt: offset(1) + 'T10:00:00+09:00', endsAt: offset(1) + 'T11:00:00+09:00'},
      {...common, id: 'doc-001', type: 'document', status: 'published', title: '운영계획 작성 안내 · 예제', body: '운영계획에는 사업 목적, 대상, 기간, 담당자, 예상 지출을 기재합니다. 본문 금액과 첨부 산출내역의 합계를 대조합니다. 이 내용은 제품 체험용이며 실제 기관의 규정이 아닙니다.', version: '예제 v1', effectiveFrom: offset(-30), tags: ['운영계획', '사업', '서식', '지출']},
      {...common, id: 'doc-002', type: 'document', status: 'published', title: '실적보고 자료 취합 안내 · 예제', body: '실적보고는 대상 기간, 사업명, 주요 결과, 증빙 자료 위치를 함께 기록합니다. 미확인 수치는 추정해서 채우지 않고 담당자에게 확인합니다. 실제 기관의 규정이 아닌 합성 문서입니다.', version: '예제 v2', effectiveFrom: offset(-10), tags: ['실적', '보고', '증빙']},
      {...common, id: 'doc-old', type: 'document', status: 'published', title: '만료된 운영계획 안내 · 예제', body: '만료 문서는 검색 근거에서 제외되는지 검증하기 위한 데이터입니다.', effectiveTo: offset(-1), tags: ['운영계획']},
      {...common, id: 'hidden-doc', type: 'document', status: 'published', title: '접근 제한 예제', body: '현재 체험 사용자에게 보여서는 안 되는 테스트용 레코드입니다.', allowedUserIds: ['different-user']},
      {...common, id: 'other-org-doc', type: 'document', status: 'published', title: '다른 조직 예제', body: '조직 범위가 달라 제외되는 테스트용 레코드입니다.', organizationId: 'different-org'},
    ],
  });
}
