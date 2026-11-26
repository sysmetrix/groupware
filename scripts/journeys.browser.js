// 핵심 여정 검사 (둘러보기 화면에서 실행). scripts/e2e.mjs 가 브라우저에 넣어 돌린다: npm run e2e
// 여정(docs/engineering/direction.md, 핵심 4는 docs/design/principles.md): 1 홈 확인 뒤 결재 처리, 2 근태 신청 준비, 3 결과보고 기안, 4 예산 집행 조회,
// 5 비서에게 묻기·내 할 일, 6 일정·예약(달력 → 자원 예약, 관용차량 먼저, 예약 버튼 직전까지), 핵심 4 다음 단계(홈 오늘 현황 네 줄의 요약·주 동작·이동).
// 사람이 하듯 누르고 입력한 뒤 화면에 보이는 것만 확인한다. 확인 카드와 예약 버튼은 누르지 않는다(신청·예약은 사람이 누르는 일이다).
// 돌려주는 값: {ok, steps: [{journey, name, ok, detail}]}
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 8000, step = 100) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await wait(step); } };
  const steps = [];
  let journey = '';
  const check = (name, cond, detail = '') => { steps.push({journey, name, ok: !!cond, detail: cond ? '' : String(detail).slice(0, 240)}); return !!cond; };
  const BAD = /undefined|NaN|\[object Object\]|Invalid Date/;

  const host = await until(() => document.querySelector('#bwyfgw-workcenter'));
  const root = host && host.shadowRoot;
  if (!root) return {ok: false, steps: [{journey: '시작', name: 'GW 비서가 열림', ok: false, detail: '업무센터가 로드되지 않았습니다'}]};
  const $ = sel => root.querySelector(sel), $$ = sel => [...root.querySelectorAll(sel)];
  const main = () => $('#main');
  const text = el => (el ? el.innerText : '').replace(/\s+/g, ' ').trim();
  const click = el => { if (!el) return false; el.click(); return true; };
  const nav = async v => { click($(`nav a[data-act="view"][data-v="${v}"]`)); await wait(400); return until(() => { const a = $(`nav a[data-v="${v}"]`); return a && (a.getAttribute('aria-current') || a.classList.contains('on') || a.classList.contains('active')) ? a : null; }, 3000); };
  const closeAll = async () => { for (const sel of ['[data-act="closeHelp"]', '[data-act="closePane"]']) { const b = $(sel); if (b) { b.click(); await wait(200); } } };
  const noDanger = () => $$('button').filter(b => /^(상신|결재|임시저장|삭제|발송|보내기 실행)$/.test(text(b)));

  // 비서에게 한마디 하고 답을 기다린다. 돌려주는 값: 새로 생긴 비서 말풍선들의 글과 카드.
  const ask = async q => {
    const before = $$('.ch-msg').length;
    const input = await until(() => $('#chInput'), 4000);
    if (!input) return {error: '입력칸 없음'};
    input.focus(); input.value = q; input.dispatchEvent(new Event('input', {bubbles: true}));
    if (!click($('[data-act="chatSend"]'))) return {error: '보내기 버튼 없음'};
    await until(() => $$('.ch-msg').length > before + 1, 6000);
    await until(() => !$('.ch-dots') && !$$('.ch-tool').some(t => /run/.test(t.className)), 12000);
    await wait(250);
    const fresh = $$('.ch-msg').slice(before).filter(m => !m.classList.contains('ch-user'));
    return {text: fresh.map(text).join(' '), confirm: fresh.flatMap(m => [...m.querySelectorAll('.ch-card-confirm')]), cards: fresh.flatMap(m => [...m.querySelectorAll('.ch-card')]), count: fresh.length};
  };

  // ---------- 시작: 홈이 제대로 그려졌는가 ----------
  journey = '시작';
  await until(() => text(main()).length > 80, 10000);
  check('홈이 그려짐', text(main()).length > 80, `글자 ${text(main()).length}`);
  check('지어낸 자료 표시가 보임', /둘러보기|지어낸/.test(text($('.wc'))), '둘러보기 표시가 없습니다');
  check('홈에 깨진 값 없음', !BAD.test(text(main())), (text(main()).match(BAD) || [])[0]);
  check('자료 모양 경고가 없음', !/화면이 바뀐 것으로/.test(text($('#band'))), text($('#band')));

  // ---------- 1. 홈 확인 뒤 결재 처리 ----------
  journey = '1. 홈 확인 뒤 결재 처리';
  const first = $('.hm-next .hm-next-t');
  check('홈 맨 위에 먼저 할 일 한 가지가 있음', first && text(first).length > 3, text($('.hm-next')));
  const firstTitle = text(first);
  click($('.hm-next [data-act="homeNext"]'));
  const pane1 = await until(() => { const p = $('#pane'); return p && text(p).length > 20 ? p : null; }, 6000);
  check('열어서 처리를 누르면 처리 창이 열림', pane1, '처리 창이 열리지 않았습니다');
  check('처리 창이 같은 문서를 보여 줌', pane1 && text(pane1).includes(firstTitle.slice(0, 12)), `기대 "${firstTitle.slice(0, 20)}" / 실제 "${text(pane1).slice(0, 80)}"`);
  check('추천 상세를 열어도 홈을 떠나지 않음', !!$('#hm') && !!pane1, '홈이 사라졌습니다');
  await closeAll();
  check('상세를 닫으면 추천 버튼으로 포커스가 돌아옴', root.activeElement?.dataset.act === 'homeNext', root.activeElement?.outerHTML?.slice(0,80));
  const leaveStart = $('.hm3-core [data-act="quickAtt"][data-t="leave"]');
  click(leaveStart); const prep = await until(() => $('[role="dialog"][aria-label="근태 신청 준비"]'));
  check('홈에서 휴가 준비를 한 번에 시작', prep, '준비 창이 없습니다');
  click(prep && [...prep.querySelectorAll('button')].find(b=>text(b)==='취소')); await wait(200);
  check('취소 후 홈 유지', !!$('#hm') && !$('.modal'), '취소 후 홈으로 돌아오지 않았습니다');
  check('결재·문서유통 화면으로 이동', await nav('approval'), '메뉴가 선택되지 않았습니다');
  const rows = await until(() => { const r = $$('#main [data-act="selDoc"], #main [data-act="apOpen"], #main .row'); return r.length ? r : null; }, 5000);
  check('결재할 문서 목록이 보임', rows && rows.length > 0, text(main()).slice(0, 120));
  check('결재 화면에 깨진 값 없음', !BAD.test(text(main())), (text(main()).match(BAD) || [])[0]);
  if (rows && rows.length) {
    click(rows[0]);
    const pane2 = await until(() => { const p = $('#pane'); return p && (p.querySelector('iframe') || text(p).length > 20) ? p : null; }, 6000);
    check('문서를 누르면 처리 창이 열림', pane2, '처리 창이 열리지 않았습니다');
  }
  check('GW 비서 안에 상신·결재·삭제 버튼이 없음', noDanger().length === 0, noDanger().map(text).join(','));
  await closeAll();

  // 홈의 숫자는 실제로 열리는 목록과 일치해야 한다. 메일 본문은 열지 않는다.
  journey = '메일 조회분 확인';
  await nav('home');
  const unreadSignal = await until(() => $('.hm-sigs [data-v="mail"]'));
  const unreadCount = Number((text(unreadSignal).match(/(\d+)\s*건/) || [,'NaN'])[1]);
  click(unreadSignal);
  const unreadTab = await until(() => $('#main [data-act="mailFilter"][data-v="unread"][aria-selected="true"]'));
  check('홈 메일 숫자를 누르면 안 읽음 필터가 열림', unreadTab, '안 읽음 필터가 선택되지 않았습니다');
  check('홈 수치와 안 읽음 목록의 행 수가 일치', Number.isInteger(unreadCount) && unreadCount === $$('#main [data-act="selMail"]').length, `홈 ${unreadCount}건 / 목록 ${$$('#main [data-act="selMail"]').length}건`);

  // ---------- 5. 비서에게 묻기 (다른 여정이 비서를 쓰므로 먼저 확인) ----------
  journey = '5. 비서에게 묻기';
  await nav('home');
  await until(() => $('#chInput'), 5000);
  const a1 = await ask('오늘 일정 알려줘');
  check('오늘 일정을 물으면 일정으로 답함', a1.text && /일정|회의|협의|마감/.test(a1.text) && !BAD.test(a1.text), a1.error || a1.text);
  const a2 = await ask('급한 일 알려줘');
  check('급한 일을 물으면 목록 카드로 답함', a2.cards && a2.cards.length > 0 && !BAD.test(a2.text), a2.error || a2.text);
  const a3 = await ask('결재 승인해줘');
  check('결재 승인을 시키면 확인 카드를 만들지 않음', a3.confirm && a3.confirm.length === 0, '확인 카드가 생겼습니다');
  check('결재 승인은 대신 하지 않는다고 분명히 알림', a3.text && /대신 하지 않습니다/.test(a3.text) && !/승인(했|하였|완료|되었|됐)/.test(a3.text), a3.text);
  const a4 = await ask('가을 축제 일정 알려줘');
  check('모르는 행사를 직원 일정처럼 지어내 답하지 않음', a4.text !== undefined && !/가을 축제.{0,12}(휴가|출장|연차)/.test(a4.text) && !BAD.test(a4.text), a4.text);

  // ---------- 2. 근태 신청 준비 ----------
  journey = '2. 근태 신청 준비';
  const b1 = await ask('내일 연차 신청해줘');
  check('연차 신청을 시키면 확인 카드가 나옴', b1.confirm && b1.confirm.length === 1, b1.error || b1.text);
  const card = b1.confirm && b1.confirm[0];
  const tomorrow = new Date(Date.now() + 9 * 36e5 + 864e5), md = `${tomorrow.getUTCMonth() + 1}`, dd = `${tomorrow.getUTCDate()}`;
  check('확인 카드에 내일 날짜가 적혀 있음', card && new RegExp(`(${md}월\\s*${dd}일|${String(md).padStart(2, '0')}[-.]${String(dd).padStart(2, '0')})`).test(text(card)), text(card));
  check('확인 카드에 직접 누르는 버튼과 취소가 있음', card && card.querySelector('[data-act="chatConfirm"]') && card.querySelector('[data-act="chatCancel"]'), text(card));
  check('누르기 전에는 신청했다고 말하지 않음', !/신청(했|하였|완료|되었|됐)습니다/.test(b1.text || ''), b1.text);
  click(card && card.querySelector('[data-act="chatCancel"]'));
  await wait(300);
  check('근태·연차 화면으로 이동', await nav('attendance'), '메뉴가 선택되지 않았습니다');
  await until(() => text(main()).length > 60, 6000);
  check('근태 화면에 남은 연차가 보임', /연차/.test(text(main())) && !BAD.test(text(main())), text(main()).slice(0, 160));

  // ---------- 3. 결과보고 기안 ----------
  journey = '3. 결과보고 기안';
  await nav('home');
  await until(() => $('#chInput'), 5000);
  const c1 = await ask('결과보고 기안 작성해줘');
  check('결과보고 기안을 시키면 확인 카드나 안내가 나옴', c1.text && (c1.confirm.length === 1 || /결과보고|계획서|기안/.test(c1.text)) && !BAD.test(c1.text), c1.error || c1.text);
  check('기안을 올렸다고 말하지 않음', !/(상신|기안)(했|하였|완료|되었|됐)습니다/.test(c1.text || ''), c1.text);
  for (const b of (c1.confirm || [])) click(b.querySelector('[data-act="chatCancel"]'));
  click($('[data-act="menuNew"]'));
  const menu = await until(() => $('.menu'), 3000);
  check('새로 만들기 메뉴에 결과보고가 있음', menu && /결과보고/.test(text(menu)), text(menu));
  await closeAll(); click($('.wc')); await wait(200);

  // ---------- 4. 예산 집행 조회 ----------
  journey = '4. 예산 집행 조회';
  check('예산 집행 화면으로 이동', await nav('budget'), '메뉴가 선택되지 않았습니다');
  await until(() => /\d{1,3}(,\d{3})+/.test(text(main())), 10000);
  check('예산 화면에 금액이 보임', /\d{1,3}(,\d{3})+/.test(text(main())), text(main()).slice(0, 160));
  check('예산 화면에 깨진 값 없음', !BAD.test(text(main())), (text(main()).match(BAD) || [])[0]);
  await nav('home');
  await until(() => $('#chInput'), 5000);
  const d1 = await ask('예산 잔액 얼마 남았어?');
  check('예산을 물으면 금액으로 답함', d1.text && /\d{1,3}(,\d{3})+|원|집행/.test(d1.text) && !BAD.test(d1.text), d1.error || d1.text);

  // ---------- 5. 내 할 일(그룹웨어 ToDo): 목록·편집기·칸반·일정표·여러 개 추가(저장은 하지 않는다) ----------
  journey = '5. 내 할 일';
  await nav('today');
  click(await until(() => $('[data-act="todoSrc"][data-v="mine"]'), 5000));
  await until(() => $$('[data-act="tdSel"]').length >= 3, 8000);
  click($('[data-act="tdView"][data-v="list"]')); await wait(300);
  check('내 할 일 목록이 보임', $$('.td-row').length >= 3, text(main()).slice(0, 160));
  check('중요도 표시와 진행률이 보임', /긴급/.test(text(main())) && /40%/.test(text(main())), text(main()).slice(0, 200));
  for (const [id, want] of [['td906', /첨부/], ['td907', /받은 할 일/], ['td901', /시작일/]]) {
    click($(`[data-act="tdSel"][data-id="${id}"]`));
    const ed = await until(() => { const e = $('#tdEd'); return e && text(e).length > 20 ? e : null; }, 3000);
    check(`할 일 자세히(${id})가 열림`, ed && want.test(text(ed)) && !BAD.test(text(ed)), ed ? text(ed).slice(0, 160) : '편집기가 열리지 않았습니다');
    click($('[data-act="tdClose"]')); await wait(200);
  }
  click($('[data-act="tdView"][data-v="kanban"]'));
  check('칸반에 예정·진행·완료 칸이 보임', await until(() => $$('.td-kcol').length === 3), $$('.td-kcol').length);
  click($('[data-act="tdView"][data-v="timeline"]'));
  check('일정표에 기간 막대가 보임', await until(() => $$('.tl-bar').length >= 2), $$('.tl-bar').length);
  click($('[data-act="tdView"][data-v="list"]')); await wait(200);
  click($('[data-act="tdBulk"]'));
  const bulk = await until(() => $('#tdeBulk'));
  if (bulk) { bulk.value = '- 자료 준비 금요일\n- 결과보고 11/24~11/28 !긴급'; bulk.dispatchEvent(new Event('input', {bubbles: true, composed: true})); }
  check('여러 개 추가가 두 줄을 미리 보여 줌', await until(() => /2건 추가/.test(text($('#tdBulkGo')))), text($('#tdBulkPrev')));
  click($('[data-act="closeHelp"]')); await wait(200);

  // ---------- 6. 일정·예약: 달력 → 자원 예약 탭 → 관용차량 먼저 → 자원·날짜·시간 고르기 → 예약 버튼 직전에서 멈춤 ----------
  // 예약 버튼(예약하기·예약 신청)은 누르지 않는다. 누르면 그룹웨어에 바로 올라가는 단추다.
  journey = '6. 일정·예약';
  const pick = (sel, v) => { const el = $(sel); if (!el) return false; el.value = v; for (const t of ['input', 'change']) el.dispatchEvent(new Event(t, {bubbles: true, composed: true})); return el.value === v; };
  const resHead = () => text($('#resForm .res-book-h'));
  const resStatus = () => text($('#resStatus'));
  const bookBtn = () => $('#resBookBtn');
  const slots = () => $$('#main .card2 .trow').map(text);
  const mineCount = () => { const h = $$('#main h2').find(x => /내 예약 현황/.test(text(x))); const m = h && text(h).match(/(\d+)건/); return m ? Number(m[1]) : null; };
  check('일정·예약 화면으로 이동', await nav('calendar'), '메뉴가 선택되지 않았습니다');
  const calGrid = await until(() => $$('#main .cal .c:not(.out)').length >= 28 ? $('#main .cal') : null, 6000);
  check('이번 달 달력이 보임', calGrid && /\d{4}년 \d{1,2}월/.test(text($('#main .cal-month'))), text(main()).slice(0, 160));
  check('달력에 오늘 날짜가 표시됨', !!$('#main .cal [aria-current="date"]'), '오늘 표시가 없습니다');
  check('달력에 깨진 값 없음', !BAD.test(text(main())), (text(main()).match(BAD) || [])[0]);
  click($('.vtabs [role="tab"][data-v="resource"]'));
  const resBtns = await until(() => { const b = $$('#main [data-act="resSel"]'); return b.length && $('#resForm') ? b : null; }, 6000);
  check('자원 예약 탭을 누르면 예약 화면이 열림', resBtns && $('.vtabs [role="tab"][data-v="resource"][aria-selected="true"]'), text(main()).slice(0, 160));
  const CAR = /차량|승합차|승용차|버스|트럭/;
  const names = (resBtns || []).map(text);
  const carN = names.filter(n => CAR.test(n)).length;
  check('관용차량이 맨 앞에 보이고 처음부터 골라져 있음', carN > 0 && names.slice(0, carN).every(n => CAR.test(n)) && resBtns[0].getAttribute('aria-pressed') === 'true', names.join(' / '));
  check('예약 칸에 고른 차량 이름이 보임', names[0] && resHead().includes(names[0]), resHead());
  check('관리자 승인이 필요한 차량이라고 미리 알려 줌', /관리자 승인 필요/.test(resHead()) && /승인 요청/.test(text(bookBtn())), `${resHead()} / ${text(bookBtn())}`);
  // 자원 고르기: 둘째 차량을 골랐다가 첫째 차량으로 돌아온다.
  if (carN > 1) {
    click($$('#main [data-act="resSel"]')[1]);
    check('다른 차량을 고르면 예약 칸이 그 차량으로 바뀜', await until(() => resHead().includes(names[1]) && $$('#main [data-act="resSel"]')[1].getAttribute('aria-pressed') === 'true'), resHead());
    click($$('#main [data-act="resSel"]')[0]);
    await until(() => resHead().includes(names[0]));
  }
  // 날짜 고르기: '다음 날'을 눌러 이 차량이 이미 예약된 날을 찾는다(지어낸 자료에는 가까운 근무일에 예약이 있다).
  const headDate = () => (resHead().match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
  const day0 = await until(() => slots().length && headDate(), 6000);
  let busy = null;
  for (let i = 0; i < 7 && !busy; i++) {
    const before = headDate();
    click($('#main [data-act="resDay"][data-v="1"]'));
    await until(() => headDate() !== before && slots().length, 6000);
    busy = slots().map(s => s.match(/(\d{2}:\d{2})~(\d{2}:\d{2}) · 예약됨/)).find(Boolean);
  }
  check('다음 날을 누르면 예약 칸의 날짜가 바뀜', day0 && headDate() && headDate() > day0, `${day0} → ${headDate()}`);
  check('이 날의 예약 시간표에 예약된 시간과 빈 시간이 함께 보임', busy && slots().some(s => /비어 있음/.test(s)), slots().join(' | ').slice(0, 200));
  // 시간 고르기 1: 이미 예약된 시간과 겹치게 고르면 바로 알려 주고 예약 버튼이 꺼진다.
  if (busy) {
    const opts = [...($('#resStart') || {options: []}).options].map(o => o.value);
    const a = opts.find(o => o >= busy[1] && o < busy[2]), z = opts.find(o => o > a);
    pick('#resTitle', '둘러보기 점검 출장');
    const set = a && z && pick('#resStart', a) && pick('#resEnd', z);
    check('예약된 시간과 겹치게 고르면 바로 겹친다고 알려 주고 버튼이 꺼짐', set && await until(() => /겹칩니다/.test(resStatus()), 3000) && bookBtn() && bookBtn().disabled, `${a}~${z} / ${resStatus()}`);
  }
  // 시간 고르기 2: 시간표의 빈 시간 '이 시간으로 예약'을 누르면 시작 시각이 채워진다.
  const free = $('#main [data-act="resFree"]');
  const freeStart = free && free.dataset.s;
  click(free);
  check('빈 시간을 누르면 예약 시작 시각이 그 시간으로 채워짐', freeStart && await until(() => $('#resStart') && $('#resStart').value === freeStart, 3000), `${freeStart} / ${$('#resStart') && $('#resStart').value}`);
  pick('#resTitle', '둘러보기 점검 출장');
  pick('#resDesc', '지어낸 행선지');
  const ready = await until(() => /^✓ .*비어 있습니다/.test(resStatus()) && bookBtn() && !bookBtn().disabled, 3000);
  check('예약명까지 쓰면 비어 있다고 알려 주고 예약 신청 버튼이 켜짐(누르지 않음)', ready && /예약 신청 \(승인 요청\)/.test(text(bookBtn())), `${resStatus()} / ${text(bookBtn())} / 꺼짐 ${bookBtn() && bookBtn().disabled}`);
  check('예약 칸에 고른 차량과 날짜가 그대로 보임', names[0] && resHead().includes(names[0]) && headDate() > day0, resHead());
  check('누르기 전에는 예약했다고 말하지 않음', !/예약했습니다|예약을 신청했습니다/.test(text(main())), (text(main()).match(/예약(을 신청)?했습니다[^.]*/) || [])[0]);
  // 승인 여부: 내 예약 현황에 승인 대기·승인 완료·반려가 그룹웨어와 같은 말로 보인다.
  const mineN = await until(() => mineCount(), 6000);
  const mineH = $$('#main h2').find(x => /내 예약 현황/.test(text(x)));
  const mineRows = $$('#main .res-mine').map(text);
  check('내 예약 현황에 승인 대기 건수가 보임', mineH && /승인 대기 \d+건/.test(text(mineH)), text(mineH));
  check('내 예약마다 승인 여부(승인 대기·승인 완료·반려 등)가 표시됨', mineRows.length > 0 && mineRows.every(r => /승인 대기|승인 완료|예약 완료|반려|취소/.test(r)) && mineRows.some(r => /승인 대기/.test(r)), mineRows.join(' | ').slice(0, 200));
  check('예약 화면에 깨진 값 없음', !BAD.test(text(main())), (text(main()).match(BAD) || [])[0]);

  // ---------- 핵심 4 다음 단계: 홈 '오늘 현황' 네 줄은 요약 한 줄과 주 동작 하나를 갖고, 줄을 누르면 그 메뉴로 간다 ----------
  journey = '핵심 4 다음 단계';
  check('홈으로 돌아옴', await nav('home'), '메뉴가 선택되지 않았습니다');
  const CORE = [['할 일', '할 일 열기', 'today'], ['일정·예약', '예약하기', 'calendar'], ['근태·연차', '휴가 신청 준비', 'attendance'], ['예산 집행', '지출결의 준비', 'budget']];
  const coreRows = () => $$('.hm3-core .hm3-row');
  const coreKeys = () => coreRows().map(r => text(r.querySelector('.hm3-k'))).join('|');
  await until(() => coreRows().length === 4 && coreRows().every(r => text(r.querySelector('.hm3-v')).length > 3), 8000);
  check('오늘 현황이 할 일 · 일정·예약 · 근태·연차 · 예산 집행 네 줄로 보임', coreKeys() === CORE.map(c => c[0]).join('|'), coreKeys());
  for (const [k, act] of CORE) {
    const r = coreRows().find(x => text(x.querySelector('.hm3-k')) === k);
    const v = r && text(r.querySelector('.hm3-v')), b = r ? [...r.querySelectorAll('button')].filter(x => !x.classList.contains('hm3-go')) : [];
    check(`'${k}' 줄에 요약 한 줄과 '${act}' 버튼 하나가 있음`, v && v.length > 3 && !BAD.test(v) && b.length === 1 && text(b[0]) === act, `${v} / ${b.map(text).join(',')}`);
  }
  for (const [k, , v] of CORE) {
    await nav('home');
    const r = await until(() => coreRows().find(x => text(x.querySelector('.hm3-k')) === k));
    click(r && r.querySelector('.hm3-go'));
    const on = await until(() => $(`nav a[data-v="${v}"][aria-current="page"]`) && !$('#hm'), 3000);
    check(`'${k}' 줄을 누르면 ${k} 메뉴가 열림`, on, `지금 메뉴: ${text($('nav a[aria-current="page"]'))}`);
  }
  // 주 동작: '휴가 신청 준비'는 여정 1에서 확인했다. 나머지 셋을 누른다(예약·지출결의는 준비 화면까지만 연다).
  await nav('home');
  click(await until(() => $('.hm3-core [data-act="homeOpenToday"]')));
  check("'할 일 열기'를 누르면 할 일 목록이 열림", await until(() => $('nav a[data-v="today"][aria-current="page"]'), 3000), text($('nav a[aria-current="page"]')));
  await nav('home');
  click(await until(() => $('.hm3-core [data-act="homeTile"][data-v="reserve"]')));
  check("'예약하기'를 누르면 일정·예약의 자원 예약 탭이 바로 열림", await until(() => $('nav a[data-v="calendar"][aria-current="page"]') && $('.vtabs [role="tab"][data-v="resource"][aria-selected="true"]') && $('#resForm'), 6000), text(main()).slice(0, 120));
  const mineAfter = await until(() => mineCount(), 6000);
  check('예약 버튼을 누르지 않았으므로 내 예약 건수가 그대로임', Number.isInteger(mineN) && mineAfter === mineN, `전 ${mineN}건 / 후 ${mineAfter}건`);
  await nav('home');
  click(await until(() => $('.hm3-core [data-act="openPay"]')));
  // 둘러보기에서는 지난 지급 문서 분석이 1분 가까이 걸린다(숨은 창으로 문서를 읽음). 창이 열리고 진행 중이거나 내용이 보이는지만 본다.
  const payDlg = await until(() => { const d = $('[role="dialog"][aria-label="지급 문서"]'); return d && /분석하고 있습니다|지출결의/.test(text(d)) ? d : null; }, 6000);
  check("'지출결의 준비'를 누르면 지급 문서 창이 열림", payDlg, text($('[role="dialog"]')).slice(0, 160) || '창이 열리지 않았습니다');
  check('지급 문서 준비 창에 상신·결재 버튼이 없음', noDanger().length === 0, noDanger().map(text).join(','));
  await closeAll();
  check('준비 창을 닫으면 홈이 그대로 있음', !!$('#hm') && !$('[role="dialog"][aria-label="지급 문서"]'), '창이 닫히지 않았습니다');

  // ---------- 마무리: 사용 기록이 이름과 횟수만 남겼는가, 오류가 쌓이지 않았는가 ----------
  journey = '마무리';
  await wait(4500);
  const read = suffix => Object.keys(localStorage).filter(k => k.startsWith('bwyfgw:wc:') && k.endsWith(suffix)).map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }).filter(Boolean);
  const usage = read(':usage')[0];
  const day = usage && Object.values(usage.days || {})[0];
  check('사용 기록에 화면·버튼·도구 횟수가 남음', day && day.view && day.view.approval && day.act && day.act.chatSend && day.tool && day.tool.get_schedule, JSON.stringify(day || {}).slice(0, 200));
  const usageText = JSON.stringify(usage || {});
  check('사용 기록에 질문이나 제목 글자가 없음', usage && !/[가-힣]/.test(usageText), (usageText.match(/[가-힣]+/) || [])[0]);
  const errs = read(':errors').flat().filter(e => e && Date.now() - e.at < 300000);
  check('검사하는 동안 앱 오류가 기록되지 않음', errs.length === 0, errs.map(e => `${e.where}: ${e.msg}`).slice(0, 3).join(' | '));
  check('끝난 뒤에도 상신·결재·삭제 버튼이 없음', noDanger().length === 0, noDanger().map(text).join(','));
  return {ok: steps.every(s => s.ok), steps};
})()
