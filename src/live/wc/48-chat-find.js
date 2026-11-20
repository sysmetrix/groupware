  // ---------- v1.2.0: 찾고 확인하기 ----------
  // 조직도 구성원(내선·담당업무 포함)은 부서별로 30분 동안 메모리에만 둔다.
  const orgCache = {at: 0, tree: null, members: {}};
  async function orgTree() { if (!orgCache.tree || Date.now() - orgCache.at > 18e5) { orgCache.tree = (await GW.organizationTree()).filter(x => x.key[0] === 'd'); orgCache.at = Date.now(); orgCache.members = {}; } return orgCache.tree; }
  async function orgMembers(d) { if (!orgCache.members[d.key]) orgCache.members[d.key] = await GW.organizationMembers(d.key); return orgCache.members[d.key]; }
  const orgFind = (tree, name) => { const n = String(name || '').replace(/\s+/g, ''); return n ? tree.find(d => d.name.replace(/\s+/g, '') === n) || tree.find(d => d.name.replace(/\s+/g, '').includes(n)) : null; };
  const telOf = m => [m.tel, m.extension && '내선 ' + m.extension].filter(Boolean).join(' · ');

  chatRegisterTool({
    name: 'list_members', label: '부서 명단 확인', kind: 'read',
    description: '부서 구성원 명단(직급·내선·담당업무). dept를 비우면 내 부서.',
    params: {type: 'object', properties: {dept: {type: 'string'}}},
    run: async a => {
      let tree; try { tree = await orgTree(); } catch (e) { return {ok: false, text: '조직도를 읽지 못했습니다: ' + chatCut(e.message, 60)}; }
      const want = a.dept || (typeof myDept === 'function' && myDept()) || '', d = orgFind(tree, want);
      if (!d) return {ok: true, text: `“${want || '부서'}” 부서를 조직도에서 찾지 못했습니다. 부서 이름을 확인해 주세요.`, data: {count: 0}};
      let ms; try { ms = await orgMembers(d); } catch (e) { return {ok: false, text: '구성원 목록을 읽지 못했습니다.'}; }
      return {ok: true, text: `${d.name} 구성원은 ${ms.length}명입니다.\n${ms.slice(0, 15).map(m => `• ${m.name} ${m.duty || m.position}${m.extension ? ' · 내선 ' + m.extension : ''}`).join('\n')}${ms.length > 15 ? `\n외 ${ms.length - 15}명` : ''}`, llm: `${d.name} ${ms.length}명: ${ms.slice(0, 15).map(m => m.name + ' ' + (m.duty || m.position)).join(', ')}`, data: {count: ms.length},
        cards: [{type: 'list', title: `${d.name} 구성원`, items: ms.slice(0, 30).map(m => ({title: `${m.name} ${m.duty || m.position}`.trim(), sub: [telOf(m), chatCut(m.work, 60)].filter(Boolean).join(' · '), tone: 'info'}))}]};
    },
  });

  chatRegisterTool({
    name: 'find_owner', label: '담당자 찾기', kind: 'read',
    description: '조직도의 담당업무에서 주제 낱말로 담당자를 찾는다. 예) 홍보 담당, 청년정책 담당자.',
    params: {type: 'object', properties: {topic: {type: 'string'}}, required: ['topic']},
    run: async a => {
      const ks = String(a.topic || '').split(/\s+/).map(x => x.replace(/(담당자?|업무|관련|쪽|은|는|이|가|의)$/g, '')).filter(x => x.length >= 2);
      if (!ks.length) return {ok: false, text: '어떤 업무의 담당자인지 낱말로 말씀해 주세요. 예) 홍보 담당 누구야?'};
      let tree; try { tree = await orgTree(); } catch (e) { return {ok: false, text: '조직도를 읽지 못했습니다.'}; }
      const lists = await Promise.allSettled(tree.filter(d => d.count > 0).slice(0, 40).map(orgMembers)), all = lists.flatMap(x => x.status === 'fulfilled' ? x.value : []), miss = lists.filter(x => x.status !== 'fulfilled').length;
      const hit = all.filter(m => ks.every(k => String(m.work || '').includes(k))), part = hit.length ? [] : all.filter(m => ks.some(k => String(m.work || '').includes(k)));
      const mine = (typeof myDept === 'function' && myDept()) || '', show = (hit.length ? hit : part).sort((x, y) => (y.dept === mine) - (x.dept === mine)).slice(0, 8); // 내 부서 먼저
      if (!show.length) return {ok: true, text: `조직도 담당업무에 “${ks.join(' ')}”이 적힌 직원을 찾지 못했습니다.${miss ? ` (${miss}개 부서는 읽지 못함)` : ''} 담당업무가 비어 있는 직원도 있어 빠질 수 있습니다.`, data: {count: 0}};
      return {ok: true, text: `“${ks.join(' ')}” 담당${hit.length ? '' : '(일부 낱말만 일치)'}은 ${show.length}명입니다.\n${show.map(m => `• ${m.name} ${m.duty || m.position} · ${m.dept}${m.extension ? ' · 내선 ' + m.extension : ''}`).join('\n')}\n조직도에 적힌 담당업무 기준입니다.`, llm: show.map(m => `${m.name} ${m.dept}`).join(', '), data: {count: show.length},
        cards: [{type: 'list', title: '담당업무 일치', items: show.map(m => ({title: `${m.name} ${m.duty || m.position} · ${m.dept}`, sub: [telOf(m), chatCut(m.work, 70)].filter(Boolean).join(' · '), tone: 'info'}))}]};
    },
  });

  // 조직도 검색에 전화가 비면 그 부서 구성원 목록에서 내선·전화를 채운다
  { const def = CHAT_TOOLS.get('lookup_person'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const r = await run0(a, ctx);
    if (!r || !r.ok || !r.data || r.data.count !== 1 || /전화/.test(r.text || '')) return r;
    try { const tree = await orgTree(), nm = String(a.name || '').replace(/\s+/g, '').replace(/(팀장|과장|차장|부장|실장|주임|주무관|대리|사원|님)+$/, ''); for (const d of tree) { if (!(r.text || '').includes(d.name)) continue; const m = (await orgMembers(d)).find(x => x.name === nm); if (m) return {...r, text: r.text + (telOf(m) ? ` · 전화 ${telOf(m)}` : ' · 조직도에 전화·내선이 등록되어 있지 않습니다') + (m.work ? `\n담당업무: ${chatCut(m.work, 80)}` : '')}; } } catch {}
    return {...r, text: r.text + ' · 조직도에 전화가 등록되어 있지 않습니다'};
  }; } }

  chatRegisterTool({
    name: 'list_sent_mail', label: '보낸 메일 확인', kind: 'read',
    description: '내가 보낸 메일(보낸메일함 최근 50통)의 제목·받는 사람·날짜. date~end 기간, query 제목 낱말로 좁힌다.',
    params: {type: 'object', properties: {date: {type: 'string'}, end: {type: 'string'}, query: {type: 'string'}}},
    run: async a => {
      let rows; try { rows = await GW.sentMail(); } catch (e) { return {ok: false, text: '보낸메일함을 읽지 못했습니다: ' + chatCut(e.message, 60)}; }
      const from = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : '', to = /^\d{4}-\d{2}-\d{2}$/.test(a.end || '') ? a.end : from;
      const ks = String(a.query || '').split(/\s+/).filter(x => x.length >= 2);
      const list = rows.filter(m => { const d = String(m.date || '').slice(0, 10).replace(/\./g, '-'); return (!from || (d >= from && d <= to)) && ks.every(k => String(m.subject || '').includes(k)); });
      const span = from ? (from === to ? chatMd(from) : `${chatMd(from)}~${chatMd(to)}`) + '에 ' : '';
      if (!list.length) return {ok: true, text: `${span}보낸 메일${ks.length ? `(제목에 “${ks.join(' ')}”)` : ''}이 없습니다. 보낸메일함 최근 ${rows.length}통 안에서 확인했습니다.`, data: {count: 0}};
      return {ok: true, text: `${span}보낸 메일은 ${list.length}통입니다.${list.length > 10 ? ' 최근 10통만 보여 드립니다.' : ''} (보낸메일함 최근 ${rows.length}통 기준)`, llm: `보낸 메일 ${list.length}통`, data: {count: list.length},
        cards: [{type: 'list', title: '보낸 메일', items: list.slice(0, 10).map(m => ({title: m.subject || '(제목 없음)', sub: [m.to && '→ ' + m.to, String(m.date || '').slice(5, 16)].filter(Boolean).join(' · '), tone: 'info'}))}, {type: 'nav', label: '메일 화면 열기', view: 'mail'}]};
    },
  });

  // "시간외 신청 승인됐어?" → 그 종류의 가장 최근 신청과 승인 상태
  { const def = CHAT_TOOLS.get('list_my_requests'); if (def) { const run0 = def.run; def.params.properties.latest = {type: 'boolean'}; def.run = async (a, ctx) => {
    if (!a.latest || !a.kind) return run0(a, ctx);
    let dt; try { dt = await loadApps(); } catch (e) { return {ok: false, text: '근태 신청 내역을 읽지 못했습니다.'}; }
    const KW = {출장: /출장/, 시간외: /시간외|연장|휴일근무|조기/, 휴가: /연차|반차|휴가|병가|공가/, 외출: /외출/, 교육: /교육|연수/}[a.kind] || new RegExp(a.kind);
    const mine = (dt.apps || []).filter(x => String(x.empCd) === String(dt.me) && x.deleteReqYn !== 'Y' && KW.test(x.atNm || '')).sort((x, y) => String(y.reqDt || y.startDt).localeCompare(String(x.reqDt || x.startDt)));
    if (!mine.length) return {ok: true, text: `최근 150일 동안 올린 ${a.kind} 신청이 없습니다.`, data: {count: 0}};
    const row = x => { const i = R.appInfo(x); return `${chatSpan8(x.startDt, x.endDt)} ${x.atNm}${i.time ? ' ' + i.time : ''} — ${i.pending ? '승인 전(결재 중)' : '승인'}`; }, pend = mine.filter(x => R.appInfo(x).pending);
    return {ok: true, text: `가장 최근 ${a.kind} 신청은 ${row(mine[0])}입니다.${pend.length ? `\n결재 중인 ${a.kind} 신청은 ${pend.length}건입니다: ${pend.slice(0, 3).map(row).join(', ')}` : ` 결재 중인 ${a.kind} 신청은 없습니다.`}`, data: {count: mine.length, pending: pend.length}, cards: [{type: 'list', title: `최근 ${a.kind} 신청`, items: mine.slice(0, 5).map(x => ({title: row(x), tone: R.appInfo(x).pending ? 'todo' : 'ok'}))}, {type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'}]};
  }; } }

  // "오늘 몇 시에 퇴근해야 돼?" → 출근 기록 + 9시간(점심 1시간 포함)
  { const def = CHAT_TOOLS.get('get_work_hours'); if (def) { const run0 = def.run; def.params = {type: 'object', properties: {leave_time: {type: 'boolean'}}}; def.run = async (a, ctx) => {
    if (!a.leave_time || !S.raw) return run0(a, ctx);
    const t = today(), day = R.homeDayInfo({date: t, holidays: (S.raw.data.schedule && S.raw.data.schedule.holidays) || []});
    if (day.weekend || day.holiday) return {ok: true, text: `오늘 ${chatMd(t)}은 ${day.holiday || '주말'}이라 근무일이 아닙니다.`};
    const td = (S.raw.data.attendance || {}).today || {}, c = chatHm4(td.come);
    if (!c) return {ok: true, text: '오늘 출근 기록이 아직 조회되지 않아 퇴근 시각을 계산하지 못했습니다. 보통 근무는 9시 출근 기준 18시 퇴근입니다(점심 1시간 포함 9시간).'};
    const [h, m] = c.split(':').map(Number), o = String(h + 9).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    return {ok: true, text: `오늘 출근 ${c} 기준으로 ${o} 이후 퇴근하면 8시간을 채웁니다(점심 1시간 포함 9시간).${td.leave ? ` 퇴근 기록 ${chatHm4(td.leave)}이 이미 있습니다.` : ''} 반차·외출·유연근무가 있으면 달라집니다.`};
  }; } }
