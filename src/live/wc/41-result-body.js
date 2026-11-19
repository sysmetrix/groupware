// 결과보고: 과거 결과보고에서는 허용된 항목명·순서만, 값은 이번에 확인한 실적만 사용한다.
  function resultReviewedBody(plan, facts, referenceTemplate) {
    const names = [
      ['실제 일시', '일시', '추진 일시', '운영 일시', '행사 일시', '운영 기간', '기간'],
      ['실제 장소', '장소', '추진 장소', '운영 장소', '행사 장소'],
      ['실제 참여 인원', '참여 인원', '참가 인원', '참석 인원', '참석자 수', '참여자 수', '인원'],
      ['실제 집행 금액', '집행 금액', '집행액', '지출 금액', '집행 내역', '집행 예산'],
      ['주요 성과·특이사항', '주요 성과', '추진 성과', '운영 성과', '추진 결과', '운영 결과', '주요 결과'],
    ];
    const clean = v => typeof v === 'string' || Number.isFinite(v) ? String(v).replace(/\s+/g, ' ').trim() : '';
    const source = typeof referenceTemplate === 'string' ? referenceTemplate : /결과\s*보고/.test(referenceTemplate?.title || '') ? referenceTemplate.body : '';
    const labels = new Map();
    for (const line of String(source || '').split(/\r\n?|\n/)) {
      const label = line.match(/^\s*(?:(?:[가-하]|\d{1,2})[.)]|[-•○])?\s*([가-힣 ·]{1,20})\s*[:：]/)?.[1].replace(/\s+/g, '');
      const i = names.findIndex(group => group.some(s => s.replace(/\s+/g, '') === label));
      if (i !== -1 && !labels.has(i)) labels.set(i, names[i].find(s => s.replace(/\s+/g, '') === label));
    }
    const borrowed = labels.size;
    names.forEach(([name], i) => { if (!labels.has(i)) labels.set(i, name); });
    const docNo = clean(plan?.docNo), title = clean(plan?.title);
    const lines = ['1. 관련: ' + (docNo || '[근거 문서번호 확인 필요]') + (title ? ` 「${title}」` : ''), '2. 위 계획과 관련한 실제 추진 결과를 다음과 같이 보고합니다.'];
    const missing = [];
    for (const [i, label] of labels) {
      const value = clean(facts?.[i]);
      if (!value) missing.push(label);
      lines.push(`  ${'가나다라마'[lines.length - 2]}. ${label}: ${value || '[실적 확인 필요]'}`);
    }
    lines.push('끝.');
    const notes = [borrowed ? `과거 결과보고의 항목명과 순서 ${borrowed}개를 사용했습니다. 이전 실적·붙임은 가져오지 않았습니다.` : '표준 결과보고 순서를 사용했습니다. 계획 수치·붙임은 가져오지 않았습니다.'];
    if (missing.length) notes.push('제출 전 확인: ' + missing.join(', '));
    return {lines, text: lines.join('\n'), hang: lines.map(() => false), notes};
  }
