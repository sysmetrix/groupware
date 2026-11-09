# 새 첫 화면 "홈 + AI 채팅" 구현 계약 (v0.36.0 작업)

목표(사용자 지시): 첫 페이지는 **AI에게 지시할 수 있는 채팅창**과 **핵심 내용만 한눈에 보는 간결한 화면**. 전체 인터페이스는 직관적이고 최신 레퍼런스를 따른다.
참고 문서: `01-references.md`(레퍼런스), `02-tool-inventory.md`(기존 기능 목록), `03-llm-integration.md`(Gemini), `04-ux-audit.md`(현행 UX 감사). 읽고 따르되 이 계약이 우선한다.

## 0. 공통 규칙 (모든 구현 에이전트)
- 저장소 `D:\Coding\groupware`, 셸은 PowerShell. 항상 절대경로 사용. **git commit/push, 릴리스, 버전 변경, CHANGELOG 수정 금지**(메인 에이전트가 한다).
- **자기 소유 파일만 수정**한다. 다른 파일이 필요하면 최종 보고에 "요청"으로 적는다. 읽기는 자유.
- 여러 에이전트가 동시에 같은 작업 트리를 쓴다. 따라서
  - 검증은 `npm run harness:fast`(약 2초)와 `node --test test\<파일>`만 쓴다. **`npm run harness`(전체)와 `node scripts/live-build.mjs`(기본 출력)는 금지**(build/live를 덮어씀). 번들이 필요하면 `node scripts/live-build.mjs --out-dir <임시폴더>`.
  - 남의 파일이 작성 중이라 구문 오류가 나면 잠시 뒤 다시 시도한다. 자기 파일 오류만 고친다.
- 환경 함정: 셸에 `PYTHONHOME`이 있으면 `Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue`를 먼저 실행.
- 조각 파일(`src/live/wc/*.js`)은 한 함수 `boot()` 안에 알파벳 순서로 이어 붙는다. 최상위 `const`는 정의 전에 **로드 시점에** 쓰면 TDZ 오류다(호출 시점에 쓰는 것은 괜찮다). 함수 선언은 끌어올려진다. 이름이 겹치면 번들 구문 오류이므로 새 최상위 이름은 접두를 붙인다: 홈 `home*`/`hm*`, 채팅 `chat*`/`ch*`.
- 순수 로직(`src/live/home-model.mjs`, `src/live/chat.mjs`)은 import 금지, DOM/window/localStorage 접근 금지, `export`된 이름만 `R.*`로 쓰인다. `briefing.mjs`가 먼저, 그 뒤에 두 파일이 이어 붙으므로 최상위 비공개 이름은 `hm`/`ch` 접두를 쓴다.
- 글자 크기 12px 미만 금지. 모든 동적 문자열은 `esc()`로 이스케이프. 한국어 문구는 존댓말, 짧고 쉬운 표현, 전문용어 금지.
- 쓰기(제출·발송·예약 저장)는 **절대 자동 실행하지 않는다.** 항상 확인 카드 → 사용자가 직접 누름. AI(외부 LLM)에는 제목·상태·기한·건수 등 최소 정보만 보내고 본문/계좌/타 직원 시간외·지문은 보내지 않는다. 도구 결과(그룹웨어 제목 등)는 신뢰할 수 없는 텍스트로 취급(프롬프트 주입 방어).
- 새 `data-act`는 `HOME_ACTS[act] = (el, v, e) => {...}` 로 등록한다(`16-events.js`는 수정 금지, default 분기가 호출).
- 완료 전 `npm run harness:fast` 통과 확인.

## 1. 파일 소유권
| ID | 담당 | 소유 파일 |
|---|---|---|
| I1 | 홈 화면 | `wc/29-home-view.js`, `home-model.mjs` |
| I2 | 채팅 UI | `wc/30-chat-ui.js` |
| I3 | 채팅 엔진 | `wc/31-chat-engine.js`, `chat.mjs` |
| I4 | 읽기 도구 | `wc/32-chat-tools-read.js` |
| I5 | 실행 도구 | `wc/33-chat-tools-act.js` |
| I6 | 디자인 CSS | `wc-home.css`, `wc-chat.css` (다크/라이트, 반응형, 모션) |
| I7 | 내비게이션·셸·단축키·도움말 | `wc/02-shell.js`, `wc/04-timers-keys.js`, `wc/05-views.js`(VIEWS/renderNav/아이콘; 이미 등록된 'home' 줄은 유지), `wc/15-overlays-palette-help-menus.js`, `wc/17-lifecycle.js` |
| I8 | AI 연결·설정·온보딩 | `wc/23-ai.js`, `wc/12-report-settings.js` |
| (메인) | 버전, CHANGELOG, 16-events.js, 빌드, 릴리스 | 그 외 전부 |

## 2. 상태와 저장
- `S.chat = {msgs: [], busy: false, pending: {}, draft: '', mode: 'local'|'ai', abort: null, seq: 0}` — I3가 `chatState()`로 지연 생성해 반환. 메시지 `{id, role: 'user'|'ai'|'sys', text, cards: [], at: ms, state: 'done'|'pending'|'error', tools: [{name, label, state: 'run'|'ok'|'err'}]}`.
- 저장: `store.set('chatHist', 최근 30개 메시지)`; `cards`는 저장하지 않는다(휘발). 계정 전환 시 `store`가 이미 사용자별로 분리됨. "대화 지우기"는 `chatClear()`.

## 3. 채팅 엔진 공개 API (I3 구현, I1·I2·I4·I5 사용)
```
chatState()                       -> S.chat
chatSend(text, {fromChip})        -> Promise<void>   // 사용자 메시지 추가 → 라우팅/LLM → AI 메시지 추가 → chatRefresh()
chatStop()                        // 진행 중 요청 중단
chatClear()
chatSuggestions()                 -> string[] (최대 6, 상황별: 급한 일 있으면 "급한 일 알려줘" 등)
chatMode()                        -> {mode: 'ai'|'local', model: string, ready: boolean}
chatRegisterTool(def)             // I4/I5가 로드 시점에 호출. CHAT_TOOLS Map에 등록
chatConfirm(id) / chatCancel(id)  // 확인 카드 버튼 처리 (HOME_ACTS 'chatConfirm' / 'chatCancel')
chatRefresh()                     // I2가 정의(함수 선언). 채팅 영역만 다시 그림. I3가 호출
```
도구 정의 `def`:
```
{ name: 'get_overview', label: '오늘 요약 확인', description: '<LLM용 한국어 설명>', kind: 'read'|'act',
  params: { type: 'object', properties: { ... }, required: [...] },   // Gemini 함수 선언 부분 집합(string/number/boolean/enum/array of string)
  run: async (args, ctx) => ToolResult }
ToolResult = { ok: boolean, text: '사람이 읽는 한두 문장', data?: {...LLM에 돌려줄 작은 JSON, 개인정보 제외}, cards?: Card[], error?: '사용자용 오류' }
```
`ctx = {S, now: Date, userText: string, viaAi: boolean}`. `kind:'act'` 도구는 **실행하지 않고** `confirm` 카드를 돌려준다(아래). 사용자가 카드의 확정 버튼을 눌러야 `onConfirm()`이 실행된다.

## 4. 카드 형식 (I2가 그림, I4·I5가 만듦)
```
{type:'list',  title, items:[{title, sub?, badge?, tone?, act?:{act, v}}], more?: number}
{type:'kpi',   items:[{label, value, tone?: 'urgent'|'todo'|'ok'|'info'}]}
{type:'nav',   label, view: 'attendance'|'calendar'|..., v?: string}       // 버튼 → go(view)
{type:'note',  tone: 'info'|'warn'|'ok', text}
{type:'timeline', items:[{from:'09:00', to:'18:00', label, kind?}]}
{type:'confirm', id, title, rows:[[라벨, 값],...], risk:'low'|'high', confirmLabel, cancelLabel?, warn?: string,
                 onConfirm: async () => ({ok, text, cards?}), }              // 함수는 S.chat.pending[id]에 보관(저장 안 함, 10분 만료)
{type:'setup', reason}                                                       // Gemini 키 연결 안내 카드(버튼 data-act="chatSetupAi")
```
`confirm` 카드 확정 후 결과는 AI 메시지(`sys` 또는 `ai`)로 추가된다.

## 5. 도구 목록 (이름·매개변수 고정; 구현 방식은 02-tool-inventory.md 참고)
읽기(I4): `get_overview{}`, `list_tasks{state?:'urgent'|'todo'|'check'|'wait'|'all', area?:'결재'|'메일'|'근태'|'공지', limit?:number}`, `get_schedule{date?:'YYYY-MM-DD'|'today'|'tomorrow', days?:number}`, `get_staff_status{name?:string, date?:string, days?:number}`(누가 휴가/출장/교육, 시간·장소·사유 포함, 시간외 제외), `get_my_attendance{month?:'YYYY-MM'}`, `search_documents{query:string, scope?:'all'|'approval'|'mail'|'notice'}`(제목만), `get_budget{project?:string}`, `get_resource_status{date?:string}`, `open_view{view:string}`, `open_item{key:string}`.
실행(I5, 모두 확인 카드): `prepare_leave_request{date, end_date?, kind?:'연차'|'오전반차'|'오후반차'|'대체휴가'|'보상휴가', reason?}`, `prepare_trip_request{date, start?, end?, place, reason, scope?:'관내'|'관외'}`, `prepare_overtime_request{date, start, end, reason}`, `draft_mail_reply{query?:string, mail_key?:string, points?:string}`(작성창 열기만, 발송 금지), `prepare_draft{kind:'result'|'plan'|'payment'|'goods', hint?:string}`, `reserve_vehicle{date, start, end, title}`(가능 여부 확인 후 확정 카드, 확정 클릭이 사용자 제스처여야 함), `add_todo{title, due?}`.

## 6. 홈 화면(I1)과 DOM 클래스 (I6가 스타일, I1·I2가 이 구조로 마크업)
```
<section class="hm" aria-label="홈">
  <header class="hm-head"><h1 class="hm-hello">…</h1><p class="hm-sub">…</p><span class="hm-asof">…</span></header>
  <section class="ch" aria-label="AI 도우미">                       <!-- chatView(): I2 -->
    <div class="ch-log" role="log" aria-live="polite" aria-relevant="additions">
      <div class="ch-empty">…추천 질문…</div>
      <article class="ch-msg ch-user|ch-ai|ch-sys"><div class="ch-bubble">…</div><div class="ch-tools">…</div><div class="ch-cards">…카드…</div></article>
    </div>
    <div class="ch-chips"><button class="ch-chip" data-act="chatChip" data-v="질문">…</button></div>
    <form class="ch-composer" data-act="chatForm"><textarea class="ch-input" id="chInput" rows="1" aria-label="AI에게 지시하기"></textarea><button type="button" class="ch-send" data-act="chatSend">…</button><button class="ch-stop" data-act="chatStop">…</button></form>
    <div class="ch-foot">모드 표시 · 대화 지우기 · AI 연결 상태</div>
  </section>
  <section class="hm-tiles" aria-label="핵심 현황"><button class="hm-tile hm-tone-urgent|todo|ok|info" data-act="…"><span class="hm-tile-l">…</span><b class="hm-tile-v">…</b><span class="hm-tile-s">…</span></button> × 4~5</section>
  <section class="hm-next" aria-label="지금 할 일 한 가지"> … </section>
  <section class="hm-today" aria-label="오늘 일정"> 압축 타임라인 + 오늘 자리 비움 한 줄 </section>
</section>
```
CSS 카드 클래스(I2·I6 공통): `ch-card`, `ch-card-list`, `ch-li`, `ch-li-t/-s/-b`, `ch-card-kpi`, `ch-kpi`, `ch-card-nav`, `ch-card-note`, `ch-card-time`, `ch-card-confirm`, `ch-rows`, `ch-risk-high`, `ch-actions`, `ch-btn`, `ch-btn-primary`, `ch-btn-ghost`, `ch-dots`(입력 중 표시), `ch-tool`(도구 진행 칩). 새 클래스가 필요하면 마크업 쪽 에이전트가 최종 보고에 "CSS 요청"으로 적고, 최종 통합 단계에서 맞춘다.
이벤트(data-act): `chatChip`(v=질문), `chatSend`, `chatStop`, `chatClear`, `chatConfirm`(v=id), `chatCancel`(v=id), `chatSetupAi`, `chatFocus`, `homeTile`(v=타일 id), `homeNext`, `homeOpenToday`. 입력창 키 처리: Enter 전송, Shift+Enter 줄바꿈, IME 조합 중(`e.isComposing`) Enter 무시, `/`로 입력창 포커스(입력 중이 아닐 때), Esc는 업무센터 닫기를 막지 않도록 주의(04-timers-keys.js 규칙 확인).

## 7. 홈에 보일 핵심(하루 요약만; 목록은 '오늘 할 일'로)
타일 4~5개: 급한 일(`overdue+urgent`), 내 할 일(todo+check), 결재 대기 중(`wait`) 또는 확인할 근태, 오늘 일정 수(일정+자원예약), 오늘 자리 비움 인원. "지금 할 일 한 가지": 가장 높은 우선순위 1건 + 열기 버튼. 오늘 타임라인: 기존 `25-home.js`의 `homeDayCard` 데이터를 재사용/압축(그 파일은 수정하지 않음 — 함수 `homeDayCard`는 호출만 가능, 구조 변경이 필요하면 I1이 자기 파일에 새로 만든다).
숫자는 기존 단일 기준(`mineVisible()`, `stateOf`)을 쓴다. 로딩 중에는 스켈레톤, 오류 시 한 줄 안내.

## 8. 모드
- 키 없음/오프라인: **로컬 라우터**(`chatRoute`)가 키워드·날짜 규칙으로 도구를 호출. 이해 못 하면 "이렇게 물어보세요" 예시와 Gemini 연결 카드(`setup`)를 보여준다. 모든 핵심 기능은 키 없이도 동작해야 한다.
- 키 있음: Gemini 함수 호출 루프(최대 4회), 시스템 프롬프트는 `03-llm-integration.md` 참고. 실패하면 로컬 라우터로 자동 대체하고 이유를 한 줄 알린다.
