# Google Calendar 직접 읽기 독립 실험

## 범위와 현황

이 코드는 독립 읽기 모듈과 테스트일 뿐, 빌드나 GW 비서 UI/채팅 엔진에 연결되지 않는다. 브라우저의 기존 Google 로그인 화면을 읽는 것과 앱이 Google API로 일정을 읽는 것은 별개다. 연결 전에는 GW 비서가 Google 일정을 직접 조회한다고 표시하면 안 된다.

`src/live/gcal-readonly.mjs`는 Google Identity Services(GIS)의 사용자 제스처 기반 OAuth 토큰 흐름과 Calendar API 이벤트 목록 GET만 제공한다. 범위는 `calendar.events.readonly`이며 선택한 캘린더 ID별로 명시적 유한 기간을 조회한다. 반복 일정을 전개하고 페이지를 끝까지 읽으며, 실패/페이지 한도 초과/비정상 응답은 빈 일정이 아닌 오류다. 서버/저장소에 토큰을 쓰지 않고, 요청은 쿠키 없이 고정 Google API HTTPS 주소에만 보낸다. 결과에는 일정의 민감한 원본 정보가 포함될 수 있으므로 저장, 로그 출력, AI 전송은 별도 동의와 최소화 설계 없이 하지 않는다.

## 필수 설정 및 제약

1. Google Cloud 프로젝트에서 Calendar API를 켜고 OAuth 동의 화면을 설정한다. 외부 테스트 앱이라면 테스트 사용자를 등록하고, 배포 시 검증/민감 범위 및 기관 정책을 확인한다.
2. 웹 애플리케이션 OAuth 클라이언트 ID를 만들고 **실제 호스트의 정확한 승인된 JavaScript 출처**를 등록한다. 해당 도메인을 소유/관리하지 않거나 Google 규칙상 승인할 수 없으면 그 출처에서 운영할 수 없다. 본 실험은 승인된 출처나 클라이언트 ID를 제공하지 않는다.
3. 승인된 독립 호스트에서 Google의 공식 GIS 스크립트를 로드하고, 사용자가 직접 누른 연결 버튼 핸들러에서 `requestCalendarAccess({google, clientId})`를 호출한다. 선택한 Google 계정과 범위를 사용자가 검토해 승인한다. 토큰 만료 시 다시 사용자 동작과 승인이 필요할 수 있다. 팝업 차단, CSP, 서드파티 쿠키 및 Google 계정 정책에 따라 실패할 수 있다.
4. 사용자가 선택/입력한 캘린더 ID와 타임존이 명시된 기간, 반환된 accessToken으로 `listCalendarEvents(...)`를 호출한다. 캘린더 목록 열거와 계정 식별 기능은 이 모듈에 없다. 일정 제목/시간은 계정의 캘린더별 접근 권한과 Google API 응답에 따르며, 종일 일정의 종료일은 배타적이다.

## 보안/통합 경계

GW 페이지 메인 월드는 그룹웨어와 다른 스크립트가 공유하므로 그 안에 OAuth 토큰을 넣는 것은 권장하지 않는다. 승인된 별도 출처/격리 확장 컨텍스트에서 OAuth와 조회를 수행하고, 필요한 필드만 사용자 선택 아래 전달하는 설계가 필요하다. 확장 프로그램 방식은 별도 OAuth 클라이언트 유형, CSP, 실행 컨텍스트 및 메시지 발신자 검증을 추가 검토해야 한다. 별도 출처 iframe이라도 토큰을 GW로 전달해서는 안 되며, 실제 격리·출처 검증 없이 안전하다고 가정하지 않는다. 확정된 계정 식별과 계정 전환 시 캐시 폐기, 접근 취소, 데이터 수명, 화면의 부분 조회 표시도 통합 전에 구현해야 한다. API와 사용자 동의는 Google의 정책 및 조직 보안 승인을 따른다.

## 검증

`node --test test/gcal-readonly-independent.test.mjs`는 GIS와 API를 모의해 범위, 동의 거부/창 닫기, 페이지 처리, GET 전용 및 실패를 검증한다. 이는 실제 사용자 OAuth나 개인 일정 조회를 증명하지 않는다. 이 환경에서는 실제 Google Calendar API 인증 없는 요청이 HTTP 403으로 거부됨을 확인했다. 실제 승인된 OAuth 클라이언트와 사용자 동의가 없어서 인증 후 실계정 조회, 다중 캘린더 권한, CSP와 실제 앱 연결은 검증하지 않았다.

공식 문서: https://developers.google.com/identity/oauth2/web/guides/use-token-model , https://developers.google.com/workspace/calendar/api/v3/reference/events/list , https://developers.google.com/workspace/calendar/api/quickstart/js
