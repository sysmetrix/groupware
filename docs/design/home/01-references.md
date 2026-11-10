# 01. 레퍼런스 조사: AI 중심 "홈" 화면 (GW 비서 재설계)

- 작성: R1(레퍼런스 조사) / 조사일 2026-11-10 (KST) / 소스 코드 수정 없음
- 목표: 첫 화면 = ① AI에게 지시하는 채팅 입력창 + ② 한눈에 보는 핵심만. 직관적, 최신 레퍼런스 반영.
- 표기: 웹 출처가 있는 주장은 URL을 붙였고, 확인 못 한 것은 **미확인**, 출처 없이 제가 정한 값은 **제안**으로 표시.
- 기존 `src/live/wc-theme.css` 변수명(`--bg --fg --muted --line --line2 --card --accent --hi --md --ok --r --sh`)을 그대로 살려 토큰을 제안했다(바로 교체 가능하도록).

## 1. 레퍼런스 표

| 제품/자료 | 베낄 만한 패턴 | URL |
|---|---|---|
| Microsoft 365 Copilot 앱 (2025 재설계) | 채팅이 첫 화면. "Hi, how can I help you?" + 추천 작업, 접히는 왼쪽 내비(Chat/Agents/Pages) | https://microsoft.design/articles/designs-for-the-frontier-future |
| Microsoft 365 Copilot (2026-05 새 디자인) | 점진적 공개: 깨끗한 첫 화면에서 시작해 필요할 때 기능을 드러냄, 펼침/접힘 내비 | https://www.microsoft.com/en-us/copilot/blog/2026/05/28/introducing-a-new-design-for-microsoft-365-copilot |
| M365 Copilot 앱 소개 | 접히는 좌측 패널(최근 대화·고정 에이전트) + 추천 프롬프트로 즉시 시작 | https://techcommunity.microsoft.com/blog/microsoft365copilotblog/the-microsoft-365-copilot-app-built-for-the-new-way-of-working/4414700 |
| Microsoft Learn: 에이전트 인간중심 설계 | 사용자가 주체인 문구("Copilot으로 요약" O, "Copilot, 요약해" X), 감정 없는 중립 톤 | https://learn.microsoft.com/en-us/agents/design-guidelines/human-centered-design |
| Google Gemini in Gmail 사이드패널 | 추천 프롬프트 목록 + "More suggestions", 하단 프롬프트 박스, 요약 결과에 액션 버튼(Remind me 등) | https://support.google.com/mail/answer/14199860?co=GENIE.Platform%3DDesktop&hl=en |
| Slack AI (Today / Recap) | "Today" = 우선순위 기반 브리핑, Recap = 매일 아침 놓친 것 요약 | https://slack.com/features/ai , https://slack.com/help/articles/25076892548883-Guide-to-AI-features-in-Slack |
| Notion Home | Home 상단에 Notion AI 위젯, "Upcoming events" 타일에서 바로 AI 회의록 | https://www.notion.com/help/notion-ai-connectors-for-slack , https://www.notion.com/help/ai-meeting-notes |
| Dia (The Browser Company) | "novelty budget"을 채팅에만 쓰고 나머지는 익숙하고 절제된 UI | https://browsercompany.substack.com/p/the-strategy-behind-dias-design |
| Linear UI 재설계 | 98개 변수 대신 base·accent·contrast 3개 값에서 LCH로 테마 생성 | https://linear.app/now/how-we-redesigned-the-linear-ui |
| Linear Dashboards 모범사례 | 매일 보는 대시보드는 더 촘촘하고 빠르게 훑을 수 있게, 목적·소유자 명확히 | https://linear.app/now/dashboards-best-practices |
| Vercel Geist Colors | 10단계 스케일의 단계별 용도 고정(100 배경, 200 hover, 400 테두리, 900 보조 텍스트, 1000 본문) | https://vercel.com/geist/colors |
| shadcn/ui Theming | 의미 기반 `배경/-foreground` 쌍, `:root`/`.dark`에서 CSS 변수만 바꿔 테마 전환, `--radius:0.625rem` | https://ui.shadcn.com/docs/theming |
| OpenAI Apps SDK 디자인 가이드 | 인라인 카드: 한 카드엔 한 가지 결정, 주요 액션 최대 2개를 카드 하단에 | https://developers.openai.com/apps-sdk/concepts/design-guidelines |
| ChatGPT agent 시스템 카드 | 상태를 바꾸는 행동(구매, 메일 발송) 확정 전에 멈추고 사용자 확인 | https://deploymentsafety.openai.com/chatgpt-agent |
| ChatGPT cloud browser 도움말 | 되돌리기 어려운 행동은 채팅 안에서 확인 요청, 사이트 접근 허용과 중요 행동 승인은 별개 | https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt:AUsing |
| Claude in Chrome 권한 가이드 | 입력창의 드롭다운으로 권한 모드(수동 승인/자동 승인/승인 생략) 선택, "Approve plan" 후 계획 범위 안에서만 실행 | https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide |
| NN/g Prompt Suggestions | 추천 프롬프트는 맥락·개인화가 없으면 무시됨. 칩은 클릭하면 바로 실행되거나 입력창에 채워져야 함 | https://www.nngroup.com/articles/prompt-suggestions , https://www.nngroup.com/articles/designing-use-case-prompt-suggestions/ |
| AI UX Playground (에이전트/채팅/온보딩) | Plan-execute, 도구 사용 노출, 후속 질문 칩, `/` 명령, `@` 맥락 첨부, 빈 화면엔 "할 수 있는 일 + 예시 + 첫 행동 1개" | http://aiuxplayground.com/guides/designing-ai-agents , http://aiuxplayground.com/guides/ai-chat-playbook , https://aiuxplayground.com/guides/ai-onboarding |
| 에이전트 UI 원칙(jacar.es) | 대화와 작업 진행 패널을 분리(Claude Code·Cursor 등에서 수렴) | https://jacar.es/en/ui-design-for-agents-principles-were-starting-to-understand |
| Apple HIG Widgets | 정보 밀도 균형: 너무 성기면 불필요, 너무 빽빽하면 한눈에 안 보임. 탭하면 해당 콘텐츠로 딥링크 | https://developer.apple.com/design/human-interface-guidelines/widgets , https://developer.apple.com/videos/play/wwdc2020/10103 |
| Apple Liquid Glass (HIG/WWDC25) | 유리 재질은 내비·컨트롤 층에만, glass-on-glass 금지, 투명도 줄이기·대비 높이기·동작 줄이기 대응 | https://developer.apple.com/design/human-interface-guidelines/materials , https://developer.apple.com/videos/play/wwdc2025/219 |
| NN/g: Liquid Glass 비판 | 반투명 위의 요소는 보기 어려워짐(가독성 저하) | https://www.nngroup.com/articles/liquid-glass |
| Material 3 Expressive 모션 | 스프링 기반 모션(2025-05). 웹은 스프링을 곡선으로 변환: expressive fast spatial = `cubic-bezier(0.42,1.67,0.21,0.90)` 350ms | https://m3.material.io/styles/motion/overview/specs |
| WCAG 2.2 | 2.5.8 타깃 최소 24×24px(AA), 2.4.11 포커스가 가려지지 않음(AA) 신설 | https://www.w3.org/TR/WCAG22/ , https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html |
| 접근 가능한 AI 채팅 가이드 | 스트리밍 토큰 노드에 aria-live 금지, 별도 숨김 polite 상태영역에 완료 시 1회 공지 | https://accessibility.build/guides/accessible-ai-chat |
| MDN role=log / live regions | 대화 기록은 `role="log"`(기본 polite), 대부분 `aria-live="polite"`만 사용 | https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role , https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions |
| Pretendard 공식 README | 권장 font-family 스택, 가변 다이나믹 서브셋 CDN | https://github.com/orioncactus/pretendard |
| 한국어 조판(MDN·EOND UI·ryelle) | `word-break:keep-all`, 제목 `text-wrap:balance`, 좁은 화면에선 keep-all 해제 고려 | https://developer.mozilla.org/ko/docs/Web/CSS/Reference/Properties/word-break , https://ui.eond.com/typography , https://ryelle.codes/2025/04/typography-troubles-balancing-in-japanese-korean/ |
| 대시보드 설계 가이드 | 첫 화면 상단에 상호작용 없이 답이 되는 KPI 카드 3~5개, "so what?" 테스트 | https://www.reportviewers.com/dashboard-design-guide.html |
| 커맨드 팔레트 | Cmd/Ctrl+K 관례, 기본 화면에 부가 옵션 과적재 금지 | https://uxpatterns.dev/patterns/advanced/command-palette , https://solomon.io/designing-command-palettes |

## 2. 채택할 패턴 12개

> 공통 전제: 모두 Shadow DOM 안의 순수 HTML/CSS/vanilla JS, 라이브러리 없음. 이벤트는 shadowRoot에 위임(delegation), 상태는 기존 `01-storage.js` 저장소 사용.

**P1. 홈 = 인사 한 줄 + 큰 입력창 + 칩 3~5개 (채팅 퍼스트)**
- 무엇: 첫 화면 중앙 상단에 "서원하님, 무엇을 도와드릴까요?" + 여러 줄 입력창, 바로 아래 추천 칩.
- 왜: M365 Copilot 앱이 채팅을 첫 화면으로 재설계(https://microsoft.design/articles/designs-for-the-frontier-future), ChatGPT도 입력창 바로 밑에 칩 배치(https://www.nngroup.com/articles/designing-use-case-prompt-suggestions/).
- 구현: `<form class="composer" aria-label="AI에게 지시">` 안에 `<textarea rows="1">`(입력 시 `style.height=scrollHeight` 자동 확장, 최대 6줄) + 전송 버튼(최소 36px). 칩은 `<button class="chip">`. 홈 폭은 `max-width:760px; margin-inline:auto`(제안).

**P2. 맥락형 추천 칩 (고정 문구 금지)**
- 무엇: "결재 대기 4건 요약", "오늘 일정 정리", "연차 잔여 확인"처럼 실제 데이터 숫자가 들어간 칩.
- 왜: 맥락·개인화 없는 추천은 무시된다(https://www.nngroup.com/articles/prompt-suggestions). 칩은 바로 실행 또는 입력창에 채워 편집 가능해야 함(https://www.nngroup.com/articles/designing-use-case-prompt-suggestions/).
- 구현: `03-data.js` 결과로 칩 배열 생성 → 건수 0인 칩은 숨김. 클릭 = 즉시 실행, `Alt+클릭` 또는 연필 아이콘 = 입력창에 채우기만(제안).

**P3. 글랜스 KPI 타일 최대 4개 + "다음 할 일" 카드 1개**
- 무엇: 결재 대기 / 미확인 메일 / 오늘 일정 / 근태·예산 경고 중 4개 타일 + 가장 급한 1건을 크게.
- 왜: 상단 3~5개 KPI 카드로 상호작용 없이 답해야 함(https://www.reportviewers.com/dashboard-design-guide.html), 위젯은 밀도 균형과 딥링크(https://developer.apple.com/design/human-interface-guidelines/widgets), Slack "Today"의 우선순위 브리핑(https://slack.com/features/ai).
- 구현: `display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr))`. 타일 전체가 `<a>`/`<button>`이며 해당 뷰로 이동. 숫자 28px/700, 라벨 13px. 변화 없으면 회색, 기한 임박만 `--hi`. "다음 할 일"은 액션 버튼 최대 2개.

**P4. 점진적 공개: 나머지 기능은 접히는 좌측 내비/팔레트로**
- 무엇: 홈에는 위 3가지만. 결재·메일·예산·근태 상세는 내비 또는 Ctrl+K로.
- 왜: M365 Copilot 2026 디자인의 점진적 공개(https://www.microsoft.com/en-us/copilot/blog/2026/05/28/introducing-a-new-design-for-microsoft-365-copilot), Dia의 "새로움은 채팅에만"(https://browsercompany.substack.com/p/the-strategy-behind-dias-design).
- 구현: `nav[data-collapsed]` 토글(아이콘만 56px ↔ 220px), 상태는 localStorage. 홈 섹션은 최대 3블록 규칙(제안).

**P5. 빈 상태(첫 사용·데이터 없음)도 방향 제시**
- 무엇: "할 수 있는 일 3줄 + 예시 프롬프트 + 첫 행동 버튼 1개".
- 왜: https://aiuxplayground.com/guides/ai-onboarding , 첫 실행에서 무엇을 할 수 있고 없는지 보여줘야 함(https://learn.microsoft.com/en-us/microsoft-cloud/dev/copilot/isv/ux-guidance).
- 구현: 데이터 로드 실패/0건이면 KPI 영역 대신 `.empty` 카드. "모두 처리했어요" 같은 긍정 상태도 별도 문구.

**P6. 도구 사용·진행 단계 노출 (접을 수 있는 스텝 리스트)**
- 무엇: AI 응답 위에 "결재함 조회 → 3건 찾음 → 요약 중" 같은 단계 칩, 클릭하면 입력/결과 펼침.
- 왜: 어떤 도구가 무엇을 넣고 받았는지 보여주기(http://aiuxplayground.com/guides/designing-ai-agents), 대화와 진행 상태 분리 패턴(https://jacar.es/en/ui-design-for-agents-principles-were-starting-to-understand).
- 구현: `<details class="steps"><summary>3단계 완료 · 0.4초</summary><ol>…</ol></details>`. 진행 중 단계는 `aria-busy="true"` + 점 3개 애니메이션(reduced-motion 시 정지). 취소 버튼 항상 노출.

**P7. 확인 카드(되돌릴 수 없는 행동 전 필수)**
- 무엇: 결재 승인/반려, 메일 발송, 배부·접수, 근태 신청 전 "무엇을, 누구에게, 어떤 내용으로"를 요약한 카드 + [실행] [수정] 2버튼.
- 왜: 상태를 바꾸는 행동 확정 전 확인(https://deploymentsafety.openai.com/chatgpt-agent), 되돌리기 어려운 행동은 채팅 안에서 확인(https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt:AUsing), 카드 액션은 최대 2개 하단 배치(https://developers.openai.com/apps-sdk/concepts/design-guidelines), 실행 전 영향 미리보기(https://insights.theinteractive.studio/beyond-the-chat-agentic-interfaces-inside-your-product).
- 구현: `<section role="group" aria-labelledby>` 카드, 위험 행동은 좌측 4px `--hi` 바. 기본 포커스는 [수정](안전한 쪽), Enter 단독으로 실행되지 않게. 실행 후 카드가 "완료 · 실행 취소(가능한 경우)" 상태로 바뀜. 일괄 처리는 건수와 목록을 반드시 표시.

**P8. 권한 모드 스위치 (입력창 옆)**
- 무엇: "매번 확인 / 읽기만 자동" 2단계(제안). 쓰기 행동은 어떤 모드든 P7 카드.
- 왜: Claude in Chrome은 입력창 드롭다운으로 권한 모드를 고르고, 자동 모드에서도 민감 행동은 확인(https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide).
- 구현: 입력창 하단 툴바 `<select>` 또는 토글 버튼, `aria-pressed`. 현재 모드를 항상 텍스트로 표시.

**P9. 후속 질문 칩 + `/` 명령 + `@` 맥락**
- 무엇: 응답 끝에 "이 중 급한 것만", "반려 사유 초안" 칩. 입력창에서 `/`로 작업 목록, `@`로 문서·사람 지정.
- 왜: http://aiuxplayground.com/guides/ai-chat-playbook
- 구현: 입력값 첫 글자 `/` 감지 → `role="listbox"` 팝업, `aria-activedescendant`로 ↑↓ 이동, Enter 선택, Esc 닫기. 기존 `15-overlays-palette-help-menus.js` 팔레트 재사용.

**P10. 접근 가능한 스트리밍 (role=log + 별도 상태영역)**
- 무엇: 대화 영역은 `role="log"`, 토큰 단위 갱신은 공지하지 않고 완료 시 1회 공지.
- 왜: 스트리밍 노드에 aria-live를 걸면 조각이 끊임없이 읽힘 → 별도 숨김 polite 영역에 완료 시 1회(https://accessibility.build/guides/accessible-ai-chat), role=log 기본 polite(https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role), WCAG 4.1.3 상태 메시지.
- 구현: `<div class="sr-only" role="status" aria-live="polite">` 하나만 상시 유지, `textContent="답변 완료"`. 포커스는 이동시키지 않음. Shadow DOM 안에서도 aria는 동작하나 스크린리더별 실측 필요(**미확인**).

**P11. 키보드 우선**
- 무엇: `Ctrl+K` 팔레트, `/` 입력창 포커스, `Enter` 전송 · `Shift+Enter` 줄바꿈, `Esc` 중단/닫기, `?` 단축키 도움말.
- 왜: Cmd/Ctrl+K는 커맨드 팔레트 관례(https://uxpatterns.dev/patterns/advanced/command-palette , https://ux.stackexchange.com/questions/153299/how-did-cmd-k-come-to-be-the-standard-shortcut-for-both-adding-a-hyperlink-and-o). Enter/Shift+Enter, `/` 포커스는 ChatGPT·Slack 등 관례로 보이나 공식 출처 **미확인**.
- 구현: 한글 IME 조합 중 Enter 중복 전송 방지 필수 → `if (e.isComposing || e.keyCode===229) return;`(https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing). 입력 요소에 포커스가 있으면 `/`·`?` 단축키 무시. 그룹웨어 원래 단축키와 충돌 여부 **미확인**(실측 필요).

**P12. 절제된 표면 + 단일 강조색, 유리 효과는 헤더에만**
- 무엇: 중립 회색 표면, 강조색 1개(인디고), 그라데이션은 로고·주 버튼 정도만. 반투명은 상단 바에만, 겹침 금지.
- 왜: Liquid Glass도 컨트롤 층에만·glass-on-glass 금지(https://developer.apple.com/videos/play/wwdc2025/219), 반투명은 가독성 저하(https://www.nngroup.com/articles/liquid-glass), Linear은 base·accent·contrast 3값 체계(https://linear.app/now/how-we-redesigned-the-linear-ui).
- 구현: `@media (prefers-reduced-transparency: reduce){header{backdrop-filter:none;background:var(--card)}}`(이 미디어쿼리의 크롬 지원 범위 **미확인**), `@media (prefers-contrast: more)`에서 `--line`을 진하게.

## 3. CSS 디자인 토큰 제안 (붙여넣기용)

- 대비비는 WCAG 공식으로 직접 계산한 값(2026-11-10). 기준: 본문 4.5:1, 입력창 등 UI 경계 3:1(WCAG 1.4.3/1.4.11, https://www.w3.org/TR/WCAG22/).
- 라이트: fg/card 18.6, muted/card 5.9, muted/bg 5.5, accent/card 6.3, 흰 글자/accent 6.3, hi 4.8, md 5.4, ok 5.7, 입력 테두리(#8C93A3)/card 3.1.
- 다크: fg/card 15.2, muted/card 7.2, accent/card 6.7, 검정 글자/accent 7.1, hi 6.6, md 10.0, ok 10.7, 입력 테두리(#5C6478)/card 3.1.
- 색상값 자체는 **제안**(Geist의 단계별 용도 원칙 https://vercel.com/geist/colors 과 shadcn의 bg/foreground 쌍 원칙 https://ui.shadcn.com/docs/theming 을 따름).

```css
.wc{
  /* surface & text (light) */
  --bg:#F6F7F9; --card:#FFFFFF; --card-2:#F1F3F6; --fg:#0F1222; --muted:#5B6478;
  --line:#E3E6EC;            /* 장식용 구분선(대비 요건 없음) */
  --line2:#8C93A3;           /* 입력창·체크박스 등 식별 필요한 경계 3:1 */
  --soft:rgba(79,70,229,.06); --sel:rgba(79,70,229,.10);
  /* accent & status */
  --accent:#4F46E5; --accent-fg:#FFFFFF; --accent-hover:#4338CA; --accent-soft:rgba(79,70,229,.12);
  --hi:#D92D20; --hi-soft:#FEF3F2; --md:#B54708; --md-soft:#FFFAEB; --ok:#067647; --ok-soft:#ECFDF3;
  --focus:0 0 0 3px rgba(79,70,229,.45);
  /* radius */
  --r-xs:6px; --r-sm:8px; --r:12px; --r-lg:16px; --r-pill:999px;
  /* spacing (4px 기반) */
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px; --s-6:24px; --s-8:32px; --s-10:40px; --s-12:48px;
  /* type */
  --font:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,system-ui,Roboto,"Helvetica Neue","Segoe UI","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic","Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol",sans-serif;
  --font-mono:ui-monospace,"Cascadia Code",Consolas,"D2Coding",monospace;
  --fs-cap:12px; --fs-sm:13px; --fs-body:15px; --fs-md:16px; --fs-lg:18px; --fs-h2:20px; --fs-h1:24px; --fs-kpi:28px;
  --lh-tight:1.3; --lh-body:1.6; --fw-reg:400; --fw-med:500; --fw-semi:600; --fw-bold:700;
  /* elevation */
  --sh-1:0 1px 2px rgba(16,24,40,.06);
  --sh-2:0 1px 2px rgba(16,24,40,.04),0 4px 12px -2px rgba(16,24,40,.08);
  --sh-3:0 12px 32px -8px rgba(16,24,40,.18);
  /* motion */
  --ease:cubic-bezier(.2,0,0,1); --ease-spring:cubic-bezier(.42,1.67,.21,.90);
  --dur-1:120ms; --dur-2:200ms; --dur-3:350ms;
  --target:32px;             /* 버튼 최소 높이(제안). WCAG 2.5.8 최소 24px */
  font-family:var(--font); font-size:var(--fs-body); line-height:var(--lh-body); color:var(--fg); background:var(--bg);
  word-break:keep-all; overflow-wrap:anywhere;
}
.wc.dark{
  --bg:#0B0D12; --card:#12151C; --card-2:#1A1E27; --fg:#E8EAF0; --muted:#9AA3B5;
  --line:#262B36; --line2:#5C6478;
  --soft:rgba(139,147,255,.07); --sel:rgba(139,147,255,.14);
  --accent:#8B93FF; --accent-fg:#0B0D12; --accent-hover:#A5ABFF; --accent-soft:rgba(139,147,255,.16);
  --hi:#FF6B6B; --hi-soft:rgba(255,107,107,.12); --md:#F5B454; --md-soft:rgba(245,180,84,.12); --ok:#4ADE9F; --ok-soft:rgba(74,222,159,.12);
  --focus:0 0 0 3px rgba(139,147,255,.55);
  --sh-1:0 1px 0 rgba(255,255,255,.04) inset; --sh-2:0 1px 0 rgba(255,255,255,.04) inset,0 8px 24px -12px rgba(0,0,0,.7); --sh-3:0 18px 48px -16px rgba(0,0,0,.8);
}
:host{color-scheme:light dark}
.wc h1,.wc h2,.wc h3{line-height:var(--lh-tight); text-wrap:balance}
.wc p{text-wrap:pretty}
.wc :focus-visible{outline:2px solid var(--accent); outline-offset:2px}
.wc .num{font-variant-numeric:tabular-nums}
@media (prefers-reduced-motion: reduce){
  .wc *,.wc *::before,.wc *::after{animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; scroll-behavior:auto!important}
}
```

토큰 근거 메모
- 폰트 스택: Pretendard 공식 README의 "어디서든 동일" 권장 스택을 그대로 사용(https://github.com/orioncactus/pretendard). 웹폰트는 가변 다이나믹 서브셋(`pretendardvariable-dynamic-subset.min.css`) 권장. 단, gw.bwyf.or.kr의 CSP가 jsdelivr 로딩을 허용하는지, Shadow DOM 안 `@font-face`가 적용되는지(문서 쪽에 선언해야 할 가능성)는 **미확인** → 실패 시 Windows에선 Malgun Gothic으로 떨어짐.
- 크기: 한국어 웹 본문 14~16px, 행간 1.6+ 권고(커뮤니티 자료 https://github.com/sungjin9288/design-ai/blob/main/knowledge/i18n/korean-typography.md), KRDS 계열 문서는 본문 16px 이상·Pretendard GOV 17px(https://github.com/SimpleScaffold/ss-design-krds/blob/main/docs/style/%ED%83%80%EC%9D%B4%ED%8F%AC%EA%B7%B8%EB%9E%98%ED%94%BC.md, KRDS 원문 대조 **미확인**). 업무 밀도를 고려해 본문 15px, 메타 13px, 12px는 캡션·배지만(제안). 한글은 500보다 600이 강조로 읽힌다는 의견(위 design-ai, **커뮤니티 의견**).
- 줄바꿈: `keep-all`은 한글 어절 중간 끊김 방지(https://developer.mozilla.org/ko/docs/Web/CSS/Reference/Properties/word-break). 긴 결재 제목·URL 넘침 대비 `overflow-wrap:anywhere` 병행(제안), 좁은 폭에서는 keep-all 해제 고려(https://ryelle.codes/2025/04/typography-troubles-balancing-in-japanese-korean/).
- 모션: `--ease-spring`은 M3 Expressive "expressive fast spatial" 웹 변환값 350ms(https://m3.material.io/styles/motion/overview/specs). 오버슈트가 있으므로 칩·카드 등장 같은 작은 요소에만. `--ease:cubic-bezier(.2,0,0,1)`은 M3 표준 easing으로 알려져 있으나 이번에 원문 확인 못 함(**미확인**).
- radius 12px: shadcn 기본 `0.625rem`(=10px, https://ui.shadcn.com/docs/theming)과 현재 테마 14px 사이(제안).

## 4. 홈 화면 레이아웃 스케치 (제안)

```
┌ header(글래스, 56px): 로고 · 동기화 상태 · Ctrl+K · 테마 ────────────┐
│ nav(접힘 56px)│  [인사] 서원하님, 화요일 오후예요. 결재 3건이 기다려요.   │
│               │  ┌ composer ─────────────────────────────┐            │
│               │  │ AI에게 지시하기… (/ 명령, @ 문서)       [전송] │   │
│               │  │ 모드: 매번 확인 ▾                          │            │
│               │  └───────────────────────────────────────┘            │
│               │  (칩) 결재 3건 요약 · 오늘 일정 · 미확인 메일 7 · 연차   │
│               │  ┌다음 할 일(1건, 큰 카드)── [열기] [AI로 처리] ┐      │
│               │  [결재 3] [메일 7] [일정 2] [경고 1]  ← KPI 타일 4개     │
│               │  (대화가 시작되면 이 영역이 role=log 대화로 전환)         │
└───────────────┴──────────────────────────────────────────────────┘
```

## 5. 피해야 할 안티패턴

1. 홈에 모든 위젯을 쌓는 것: 매일 보는 화면은 목적이 분명해야 함(https://linear.app/now/dashboards-best-practices). 홈 블록 3개 초과 금지(제안).
2. 맥락 없는 고정 칩("무엇이든 물어보세요" 류): 무시됨(https://www.nngroup.com/articles/prompt-suggestions).
3. 스트리밍 텍스트 노드에 `aria-live` 또는 `assertive`: 조각이 끝없이 읽힘(https://accessibility.build/guides/accessible-ai-chat).
4. 확인 없이 결재·발송·접수 실행, 또는 "확인"이 기본 포커스인 카드: 상태 변경 전 확인 원칙 위반(https://deploymentsafety.openai.com/chatgpt-agent).
5. 프롬프트 인젝션 무방비: 메일/게시글 본문 속 "추가 확인 불필요" 같은 지시를 AI가 따르면 안 됨. Anthropic 사례에서 악성 메일이 삭제를 유도(https://claude.com/resources/articles/claude-for-chrome?__from__=talkingdev). 본문 데이터는 지시로 취급하지 않고, 쓰기 행동은 항상 P7.
6. 유리 위에 유리, 배경 그라데이션 위 반투명 카드 남발: 가독성·대비 변동(https://developer.apple.com/videos/play/wwdc2025/219 , https://www.nngroup.com/articles/liquid-glass , https://css-tricks.com/getting-clarity-on-apples-liquid-glass/). 현재 테마의 radial-gradient 배경 + 다크 `--card:rgba(255,255,255,.04)` 조합은 대비가 배경에 따라 변하므로 불투명 카드로 교체 권장(제안).
7. 플레이스홀더·비활성 버튼 글자 대비 부족: 4.5:1 대상(https://accessibility.build/guides/accessible-ai-chat). `--muted`를 플레이스홀더에 쓰고 더 연한 회색 금지.
8. 24px 미만 아이콘 버튼 밀집: WCAG 2.5.8(https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
9. 모든 토큰·상태칩을 애니메이션: 가독성 해침(https://uxpatterns.dev/patterns/ai-intelligence/ai-chat). 바운스 모션 남용 금지, reduced-motion 무시 금지.
10. AI를 사람처럼 표현("제가 생각하기에…", 감정 표현): 중립·작업 중심 톤 권장(https://learn.microsoft.com/en-us/agents/design-guidelines/human-centered-design).
11. 한글 `word-break:break-all`: 음절 중간 끊김(https://github.com/sungjin9288/design-ai/blob/main/knowledge/i18n/korean-typography.md).
12. 한글 IME 조합 중 Enter로 이중 전송: `isComposing` 미처리(https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing).
13. 숫자 열 비례폭: KPI·금액은 `tabular-nums`로 자리 고정(제안).
14. 고정 헤더/오버레이가 포커스된 요소를 가림: WCAG 2.4.11(https://www.w3.org/TR/WCAG22/). 스크롤 컨테이너에 `scroll-padding-top:var(--header-h)`(제안).

## 6. 미확인 / 후속 확인 필요

- gw.bwyf.or.kr CSP의 외부 폰트(CDN) 허용 여부, Shadow DOM 내 `@font-face` 적용 여부(크롬 실측 필요).
- `prefers-reduced-transparency` 크롬 지원 범위.
- 그룹웨어 원래 단축키(`/`, `?`, Ctrl+K)와의 충돌.
- M3 표준 easing 값 원문, KRDS 원문 본문 크기 기준.
- Shadow DOM 안 `role=log`/`role=status` 공지가 NVDA·내레이터에서 정상 동작하는지.
