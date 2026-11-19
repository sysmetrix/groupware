// 핵심 여정 검사 (둘러보기 화면에서 실행). scripts/e2e.mjs 가 브라우저에 넣어 돌린다: npm run e2e
// 다섯 여정(docs/engineering/direction.md): 홈 확인 뒤 결재 처리, 근태 신청 준비, 결과보고 기안, 예산 집행 조회, 비서에게 묻기.
// 사람이 하듯 누르고 입력한 뒤 화면에 보이는 것만 확인한다. 확인 카드는 누르지 않는다(신청·예약은 사람이 누르는 일이다).
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
  await closeAll();
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
