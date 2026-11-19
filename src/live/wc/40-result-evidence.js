  // 결과보고 근거: 메일 본문을 열거나 외부 모델에 보내지 않는다. 반환값은 작성 중인 화면에서만 쓴다.
  async function resultEvidence(plan) {
    const owner = getUserKey(), no = String(plan.docNo || '').trim();
    const empty = {sources: [], suggestions: [], scope: '계정이 변경되어 조회한 근거를 표시하지 않습니다.'};
    if (!owner || owner !== currentKey) return empty;
    const title = String(plan.title || ''), project = (title.match(/[『「“]([^』」”]{3,80})[』」”]/)?.[1] || title.replace(/^\s*\d{4}(?:년|\.)?\s*/, '').replace(/\s*(?:운영|참가|추진|개최)?\s*계획(?:\s*\(.*?\))?\s*$/, '')).trim();
    const compact = v => String(v || '').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    const core = compact(project), distinctive = core.length >= 4 && !/^(?:운영|추진|사업|행사|참가|교육|회의|워크숍|운영계획|교육운영|운영사업)$/.test(core);
    const key = no.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // ‘실-12’와 ‘실-120’, ‘다른실-12’, ‘실-12-1’은 다른 문서다.
    const exact = no && new RegExp('(?:^|[^\\p{L}\\p{N}_-])' + key + '(?=$|[^\\p{L}\\p{N}_-])', 'u');
    const hasNo = s => !!exact && exact.test(String(s || ''));
    const clean = (s, limit) => R.maskSensitive(String(s || '').replace(/<[^>]*>/g, ' ').replace(/\b\d{6}-[1-4]\d{6}\b/g, '[개인정보]').replace(/(?:비밀번호|계좌번호|인증번호|password|api[_ -]?key|bearer|token)\s*[:=]?\s*\S+/gi, '[민감정보]')).replace(/\s+/g, ' ').trim().slice(0, limit);
    const sources = [{title: clean(title, 180), docNo: no, kind: '선택한 계획서', match: '계획 정보 · 실적 아님', excerpt: clean(plan.body, 260) || '학습된 계획 본문 없음'}];
    const scope = [], queries = [...new Set([no, distinctive ? project.slice(0,80) : ''].filter(q => q.length >= 2))];
    const responses = await Promise.all(queries.map(async q => { try { return await GW.search(q, {types: ['doc', 'mail'], page: 1, pageSize: 12}); } catch { return null; } }));
    if (currentKey !== owner || getUserKey() !== owner) return empty;
    const approvals = S.raw?.data?.approval?.lists?.submitted;
    const complete = new Set((!S.error && !S.raw?.sessionExpired && !approvals?.error && S.raw?.status?.approval?.ok !== false ? approvals?.docs || [] : []).filter(d => /^(?:결재완료|종결|시행완료)$/.test(String(d.status || '').trim()) && d.docId && d.docNo).map(d => JSON.stringify([String(d.docId),d.docNo])));
    const values = Array.from({length:5}, () => new Map()), seen = new Set();
    const actualLabels = [/^실제\s*(?:추진\s*)?일시$/, /^실제\s*(?:운영\s*)?장소$/, /^실제\s*(?:총\s*)?참[여가]\s*인원$/, /^실제\s*(?:총\s*)?집행\s*(?:금액|액)$/, /^실제\s*(?:주요\s*)?성과$/];
    const add = (d, kind, local) => {
      const mail = kind === '메일', t = String(d.title || d.subject || ''), n = mail ? '' : String(d.docNo || ''), id = String(d.id || d.docId || '');
      if (!t || (no && n === no) || (id && id === String(plan.id))) return;
      const text = String(d.body || d.text || d.snippet || ''), formal = local && Array.isArray(d.refs) && d.refs.some(hasNo), cited = formal || hasNo(text) || hasNo(t), similar = distinctive && compact(t).includes(core);
      if (!cited && !similar) return;
      const identity = mail ? JSON.stringify([kind,d.box,d.uid || t,d.date]) : '문서:' + (n || id || t);
      if (seen.has(identity)) return;
      seen.add(identity);
      // 여러 계획이 함께 인용된 합동 보고서의 총계를 한 계획의 실적으로 귀속하지 않는다.
      const finalized = local && formal && d.refs.length === 1 && complete.has(JSON.stringify([id,n])) && /(?:운영결과|추진결과|실적보고|결과보고|정산보고|정산결과)/.test(compact(t)) && !/(?:계획|예정|예산안|품의|건의|신청|취소|정정예정|초안|\(안\))/.test(t);
      const index = sources.length;
      const lines = text.split(/[\r\n]+/), labelled = [];
      if (finalized) for (const line of lines) {
        const m = line.match(/^\s*(?:[-•○·]\s*)?([^:：]{2,22})[:：]\s*(.{1,95})\s*$/); if (!m) continue;
        const i = actualLabels.findIndex(re => re.test(m[1].trim())), v = m[2].trim();
        if (i < 0 || /예정|예상|계획|추정|미확인|미정|확인\s*필요|잠정|가정|예시|취소|[<>\[\]]/.test(v) || clean(v,100) !== v.replace(/\s+/g,' ')) continue;
        if (i === 0 && !/^\d{4}[년./-]\s*\d{1,2}[월./-]\s*\d{1,2}(?:일|\.|\s|$)/.test(v)) continue;
        if (i === 2 && !/^(?:총\s*)?\d{1,6}\s*명$/.test(v)) continue;
        if (i === 3 && !/^(?:총\s*)?(?:0|[1-9]\d{0,11}|[1-9]\d{0,2}(?:,\d{3}){1,3})\s*원$/.test(v)) continue;
        labelled.push(m[1].trim() + ': ' + v); values[i].set(v, index);
      }
      const citedLine = lines.find(hasNo);
      sources.push({title: clean(t, 180), docNo: n, kind, match: finalized ? '참조번호 일치 · 결재완료' : formal ? '참조번호 일치 · 실적 미확정' : cited ? '문서번호 언급 · 확인 필요' : '사업명 유사 · 확인 필요', excerpt: mail ? `메일 제목·검색 색인 기준 · ${clean(d.date, 24)} · 원문 미열람` : clean(labelled.join(' / ') || citedLine || d.snippet || text, 320) || '본문 발췌 없음'});
    };
    const cached = Object.values(patLoad().docs || {});
    cached.filter(d=>d && d.binder && !/^접수문서/.test(d.binder)).forEach(d => add(d, '내 결재문서', true));
    let unavailable = 0, clipped = 0;
    for (const response of responses) for (const type of ['doc','mail']) {
      const g = response?.groups?.[type]; if (!g || g.error || !Array.isArray(g.items)) {unavailable++; continue;}
      if (g.reliableTotal == null || g.reliableTotal > g.items.length) clipped++;
      g.items.forEach(d => add(d, type === 'doc' ? '검색 결재문서' : '메일', false));
    }
    const suggestions = [], conflicts = [];
    values.forEach((vals,index) => { if (vals.size === 1) {const [value,sourceIndex] = [...vals][0]; suggestions.push({index,value,sourceIndex});} else if (vals.size > 1) conflicts.push(['일시','장소','인원','금액','성과'][index]); });
    scope.push(`내 학습문서 ${cached.length}건 및 문서번호·사업명 검색 ${queries.length}개(결재·메일 각각 첫 12건). 첨부·메일 원문·예산 원장은 조회하지 않았습니다.`);
    if (unavailable) scope.push(`검색 ${unavailable}개 범위 조회 실패.`);
    if (clipped) scope.push('전체 검색 결과를 열람한 것은 아닙니다.');
    if (conflicts.length) scope.push(`출처 간 값이 다른 항목: ${conflicts.join(', ')}. 직접 확인하세요.`);
    return {sources, suggestions, scope: scope.join(' ')};
  }
