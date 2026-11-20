  // ---------- v0.98.0: 묻는 것에 정확히 답하기 ----------
  // 반차·연차 써도 되는지: 남은 연차, 그날 이미 잡힌 내 휴가·일정, 같은 날 부서 부재, 휴일 여부를 한 번에 본다. 신청은 하지 않는다.
  chatRegisterTool({
    name: 'check_leave_day', label: '휴가 가능 여부 확인', kind: 'read',
    description: '특정 날짜에 연차·반차를 써도 되는지 판단 자료(남은 연차, 그날 내 일정·이미 신청한 휴가, 같은 날 부서 부재, 휴일)를 모아 답한다. 신청은 하지 않는다. amount: full | half | quarter',
    params: {type: 'object', properties: {date: {type: 'string'}, amount: {type: 'string', enum: ['full', 'half', 'quarter']}}},
    run: async a => {
      if (!S.raw) return chatNotReady();
      const t = today(), d0 = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : '';
      // 주말에 "이번 주 금요일"처럼 이미 지난 요일을 말하면 다음 주 같은 요일로 본다
      const past = d0 && d0 < t && Date.parse(t) - Date.parse(d0) < 7 * 864e5, d = past ? new Date(Date.parse(d0) + 7 * 864e5).toISOString().slice(0, 10) : d0;
      if (!d) return {ok: true, text: '언제 쓰실지 날짜를 함께 말씀해 주세요. 예) “다음 주 금요일 반차 써도 돼?”', data: {count: 0}};
      const amt = {half: ['반차', 0.5], quarter: ['반반차', 0.25]}[a.amount] || ['연차', 1], lv = S.raw.data && S.raw.data.leave;
      const day = R.homeDayInfo({date: d, holidays: (S.raw.data.schedule && S.raw.data.schedule.holidays) || []}), dl = chatMd(d);
      if (d < t) return {ok: true, text: `${dl}은 이미 지난 날입니다. 앞으로의 날짜로 다시 말씀해 주세요.`, data: {count: 0}};
      if (day.weekend || day.holiday) return {ok: true, text: `${dl}은 ${day.holiday || '주말'}이라 ${amt[0]}를 쓸 필요가 없습니다.`, data: {count: 0}};
      const out = [], d8 = d.replace(/-/g, '');
      const rem = lv && Number.isFinite(lv.remaining) ? lv.remaining : null;
      out.push(rem == null ? '• 남은 연차: 확인하지 못했습니다' : `• 남은 연차: ${fmtDays(rem)}${rem >= amt[1] ? ` → ${amt[0]}(${fmtDays(amt[1])}) 쓸 수 있습니다` : ` → ${amt[0]}(${fmtDays(amt[1])})에 모자랍니다`}`);
      const dup = (lv && Array.isArray(lv.upcoming) ? lv.upcoming : []).filter(u => String(u.start || '') <= d8 && String(u.end || u.start || '') >= d8);
      if (dup.length) out.push(`• 이미 신청한 휴가: ${dup.map(u => `${u.kind || '휴가'}(${u.approved ? '승인' : '결재 중'})`).join(', ')}`);
      const sc = await chatRunTool('get_schedule', {date: d, days: 1}), its = sc && sc.data && sc.data.days && sc.data.days[0] ? sc.data.days[0].items : [];
      out.push(sc && sc.ok ? (its.length ? `• 그날 내 일정 ${its.length}건: ${its.slice(0, 3).map(i => (i.time ? i.time + ' ' : '') + i.label).join(', ')}` : '• 그날 내 일정: 없음') : '• 그날 내 일정: 확인하지 못했습니다');
      const st = await chatRunTool('get_staff_status', {date: d, days: 1});
      out.push(st && st.ok ? `• 부서 부재: ${st.data && st.data.count === 0 ? '없음' : String(st.text || '').split('\n').slice(1, 4).map(x => x.replace(/^•\s*/, '')).join(', ') || String(st.text || '').split('\n')[0]}` : '• 부서 부재: 확인하지 못했습니다');
      const ok = rem != null && rem >= amt[1] && !dup.length;
      return {ok: true, text: `${past ? `${chatMd(d0)}은 지났으므로 다음 주 같은 요일 기준입니다.\n` : ''}${dl} ${amt[0]} 판단 자료입니다.${ok ? ' 연차는 충분합니다. 일정과 부서 상황을 보고 정하세요.' : ''}\n${out.join('\n')}\n신청은 근태신청 화면에서 직접 하세요(비서는 신청하지 않습니다).`, llm: out.join(' / '), data: {count: out.length, ok}, cards: [{type: 'nav', label: '근태·연차 화면 열기', view: 'attendance'}]};
    },
  });

  // 조직도에 없는 사람(외부 기관)은 받은 메일의 보낸 사람에서 찾는다.
  { const def = CHAT_TOOLS.get('lookup_person'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const r = await run0(a, ctx), nm = String(a.name || '').replace(/\s+/g, '');
    if (!r || !nm || !/찾지 못했/.test(r.text || '')) return r;
    const rows = mailSnapshot().rows.filter(m => String(m.from || '').replace(/[\s"']/g, '').includes(nm)).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
    if (!rows.length) return r;
    const m = rows[0], who = String(m.from || '').replace(/["']/g, '').trim();
    return {ok: true, text: `“${nm}” 님은 재단 조직도에는 없고, 받은 메일의 보낸 사람으로 확인됩니다.\n• ${who}${m.fromEmail ? ` <${m.fromEmail}>` : ''}\n• 최근 메일: ${chatCut(m.subject || '(제목 없음)', 50)} (${String(m.date || '').slice(5, 10).replace('-', '/')})${rows.length > 1 ? ` 외 ${rows.length - 1}통` : ''}\n전화번호는 메일 본문 서명에서 확인하세요.`, llm: `${who}: 재단 조직도에 없음, 받은 메일 ${rows.length}통의 보낸 사람(주소는 화면에만 표시)`, data: {found: true, external: true}};
  }; } }

  // "○○ 메일 첨부파일 이름이 뭐야?" → 그 메일을 찾아 첨부 이름부터 답한다.
  { const def = CHAT_TOOLS.get('read_mail'); if (def) { const run0 = def.run; def.run = async (a, ctx) => {
    const r = await run0(a, ctx);
    if (!a.files || !r || !r.ok) return r;
    const f = cuFocus(), det = f && S.mailDet && S.mailDet[f.uid];
    if (!det || det.error) return r;
    const n = cuFiles(det);
    return {...r, text: n.length ? `첨부는 ${n.length}개입니다.\n${n.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n“그 메일 첨부 내용 정리해줘”라고 하면 내용까지 읽습니다.` : `“${cuCut(f.title, 40)}” 메일에는 첨부가 없습니다.`, cards: []};
  }; } }
