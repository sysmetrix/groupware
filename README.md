# Groupware Assistant

업무 브리핑, 규정·서식 검색, 초안 사전 점검을 위한 **로컬 우선 업무 도우미**입니다.

현재 버전은 합성 예제, JSON 가져오기, CSV/TSV 변환, 내보낸 파일 자동 확인과 정기 브리핑을 지원합니다. **실제 그룹웨어에 로그인하거나 직접 자료를 수집하지 않습니다.** 상신·결재 승인·발송·예약·회계 반영 기능은 없습니다. 가져온 파일의 권한 필터는 제공된 메타데이터를 바탕으로 하며, 그룹웨어 서버가 재검증한 권한이 아닙니다.

## 실행

Node.js 24 이상과 Python 3.10 이상(검증 버전 3.14)이 필요합니다. 문서 추출용 pypdf는 아래 설치 명령이 프로젝트 전용 환경에 설치합니다.

```bash
git clone --branch codex/groupware-assistant-mvp https://github.com/sysmetrix/groupware.git
cd groupware
npm ci
npm run setup
npm run setup:documents
npm run doctor
npm start
```

[http://127.0.0.1:3210](http://127.0.0.1:3210)에서 열립니다. 그룹웨어 자료를 가져오기 전에는 **내 문서** 화면으로 시작합니다. 실제 파일을 넣고 추출 내용을 확인한 뒤 **내 문서 검색**을 누르세요. 예제 결재·일정은 별도의 브리핑 화면에 합성 자료로 표시됩니다. 호스트는 `127.0.0.1`로 고정됩니다.

현재 구현은 `codex/groupware-assistant-mvp` 브랜치와 [PR #1](https://github.com/sysmetrix/groupware/pull/1)에 있습니다. 기본 `main`만 내려받으면 구현이 포함되지 않을 수 있으므로 위 명령으로 브랜치를 지정하세요. 기본 포트는 `3210`, 데이터 폴더는 `./data`입니다.

**다른 컴퓨터에서는 [다른 PC 설치·자동화 안내](docs/other-computers.md)를 따라 설치하세요.** 각 PC가 자신의 설정과 내보낸 자료를 사용합니다. GitHub는 코드와 문서를 동기화하며 로그인 세션이나 업무자료를 동기화하지 않습니다.

Windows 백그라운드 실행은 `npm run services:status`, `npm run services:start`, `npm run services:stop`으로 관리합니다. 이 명령이 직접 시작한 프로세스만 종료하며, 기존 터미널·작업 스케줄러로 시작한 서버는 인수하지 않습니다. [실행·종료 안내](docs/runtime-control.md)를 참고하세요. 앱의 **데이터 연결 → 이 PC의 실행 상태**는 모델 설정·서버 실행·GPU 메모리 로딩을 구분합니다.

**버튼으로 실행·종료하려면** `npm run setup:control`을 실행하세요. 바탕화면에 **Groupware AI Control** 바로가기가 생성됩니다. [프로그램 사용법](docs/control-panel.md)

**설치 확인은** `npm run verify:pc`로 실행하세요. 기존 업무자료와 별도인 합성 환경을 검사하고 `data/verification/pc-*/report.html`에 결과와 조치 사항을 남깁니다. AI 미설정은 SKIP, 설정한 모델의 연결·설치 실패는 FAIL로 구분합니다. 실제 그룹웨어 연결이나 다른 PC의 검증을 대신하지 않습니다.

## 구현된 기능

| 기능 | 현재 동작 |
|---|---|
| 내 문서 | 화면에서 PDF·XLSX·HWPX 업로드, 추출 내용 열람, 검색, 원본 다운로드, 중복 방지, 삭제. 그룹웨어 스냅샷과 별도 보관 |
| 업무 브리핑 | 대기 결재, 기한 경과, 향후 7일 일정, 최근 공지와 원문 링크 |
| 규정·서식 검색 | 제목·본문·태그 키워드 검색, 사용자/조직 필터, 시행 기간 검사, 근거 없음 표시 |
| 첨부 근거 검색 | 로컬 PDF·XLSX·HWPX 추출 CLI, 페이지·셀·문단 위치, 부모 문서 권한·버전 검사 |
| 초안 점검 | 필수 입력·날짜·정수 금액, 직접 입력 또는 선택한 첨부 근거와 대조 |
| 데이터 관리 | 최대 5 MB / 3,000건 JSON 가져오기, 스키마 검증, 전체 교체, 합성 예제 다운로드 |
| 파일 자동화 | 설정된 JSON 확인, 사용자·조직·자료 시각 검증, 변경 감지, 정기 브리핑 JSON 생성 |
| 장애 복구 | 오류별 복구 안내, 일시적 파일 오류의 재확인 간격 조절, 재시작 후 보고서 재검증, 오래된 자료 덮어쓰기 차단 |
| CSV 변환 | UTF-8 CSV/TSV와 열 매핑을 검증된 데이터 계약으로 변환 |
| 페이지 묶음 처리 | 정규화된 로컬 전체·증분 페이지 검증, 삭제·권한 회수 반영. 실제 API 수집은 별도 |
| 다른 PC 사용 | 설정 생성·환경 진단, Windows 설치/업데이트/로그인 시 실행 스크립트 |
| 실행 기록 | 작업·시각·결과·건수, 자동화 실행 ID와 오류 코드. 검색어·본문·인증 값은 기록하지 않음 |
| 선택형 AI 요약 | 로컬 Ollama에 검증된 조회 결과를 전달하고 출처 ID를 확인. 오류 시 근거 조회 결과 유지 |

초안 점검은 입력값을 검사하고, 사용자가 선택·확인한 첨부의 단일 정수 금액과 대조할 수 있습니다. 합계·통화·기관 규정·예산 잔액·결재선의 적정성을 자동 판정하지 않습니다. 구형 HWP와 OCR은 미지원입니다. 검색은 키워드 방식이며 의미 검색은 미구현입니다. 사용자가 세 가지 도구를 선택하는 구조입니다.

직접 넣는 파일은 [내 문서 사용 안내](docs/document-library.md)를 참고하세요. JSON 작성 없이 사용할 수 있습니다. 기존 그룹웨어 스냅샷에 첨부를 연결하는 CLI는 [로컬 첨부 안내](docs/attachments.md)에 있습니다. 내 문서의 보관 원본과 검색 내용은 `data/library/`에 저장하며 GitHub에 올리지 않습니다.

## 로컬 AI 사용 (선택)

이미 설치된 Ollama와 사용 가능한 로컬 모델이 있다면 `.env`에 설정합니다. 앱이 모델을 설치하거나 내려받지 않습니다.

```dotenv
OLLAMA_MODEL=your-installed-local-model
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

재시작 후 브리핑/검색의 **로컬 AI 요약**을 선택합니다. 이름에 `cloud`가 포함된 모델과 외부 서버 주소는 거부합니다. Ollama 서비스 자체가 로컬에서 실행되는지와 선택한 모델의 처리 방식을 운영자가 확인해야 합니다. 실제 LLM 호출은 이 프로젝트의 기본 테스트에 포함되지 않고, 모의 응답으로 계약과 오류 처리를 검증합니다.

구현은 [Ollama Chat API](https://docs.ollama.com/api/chat)와 [Structured Outputs](https://docs.ollama.com/capabilities/structured-outputs)의 JSON 스키마 출력 형식을 사용합니다. 출처 ID의 유효성 검증은 내용의 사실성을 증명하지 않으므로 생성 요약은 원문과 대조해야 합니다.

2026-10-23에 Qwen3 4B의 실제 합성 브리핑·근거 평가를 수행했습니다. 독립 실행 설치와 재현은 [로컬 모델 안내](docs/local-model.md)를 참고하세요. 기관 표본의 정확도와 동일하지 않습니다.

## 자료 가져오기

화면의 **데이터 연결 → 합성 예제 JSON 받기**로 형식을 확인할 수 있습니다. [데이터 계약](docs/data-contract.md)을 참고해 권한 내 자료만 변환하세요. 가져오기는 현재 자료 전체를 교체합니다.

- 사용자·조직·문서 ACL을 내보낸 시점 기준으로 정확하게 지정합니다.
- 원문 URL은 설정한 출처와 같은 origin만 허용합니다.
- 인증 쿠키·토큰·서명 키·HAR 및 제품 배포 코드를 가져오거나 Git에 올리지 않습니다.
- `data/`, `config/`, `analysis/`, `.env`는 Git에서 제외됩니다. 자료와 보고서는 평문 파일입니다.
- 단일 로컬 사용자를 위한 MVP입니다. 다중 사용자 운영용 로그인/권한 서버가 아닙니다.

## 검증

```bash
npm run check
npm test
```

Node 내장 테스트 러너로 권한 범위, 날짜·금액 검증, 만료 문서 제외, 모델 출처 검증, HTTP 요청 경계, 데이터 저장과 감사 기록을 검사합니다. GitHub Actions는 Node 24에서 Ubuntu/Windows를 실행합니다.

브라우저에서 검색·초안 금액 대조·일부 키보드 동작과 화면 폭별 가로 넘침을 확인했습니다. 스크린샷·다운로드 이벤트 오류와 후속 제어 해제로 전체 시각·E2E 검증은 완료하지 못했습니다. [후속 검증 기록](docs/followup-verification.md)과 [남은 절차](docs/verification.md)를 참고하세요.

## 문서와 다음 단계

- [자동화 레퍼런스 비교·고도화 보고서 (HTML)](docs/reference-review.html) — 공식 문서 7종, 적용 결과와 다음 검증 기준. 내려받아 브라우저에서 열 수 있습니다.
- [오류 코드와 복구 절차](docs/automation-recovery.md)
- [페이지 수집 계약과 실행 방법](docs/sync-contract.md) (`npm run demo:sync`, `npm run sync:pages`)
- [남은 작업의 후속 검증](docs/followup-verification.md) — Windows 작업 실행, 브라우저, 공식 연동·내장 AI 비교
- [아키텍처와 분석 방법](docs/architecture.md)
- [데이터 계약](docs/data-contract.md)
- [다른 PC 설치·자동화 안내](docs/other-computers.md)
- [CSV 변환 안내](docs/csv-import.md)
- [브라우저 연결 진단](docs/browser-recovery.md) (`npm run doctor:browser`)
- [실제 그룹웨어 연결 체크리스트](docs/live-integration.md)
- [구현 로드맵](docs/roadmap.md)
- [병렬·순차 작업표](docs/work-sequence.md)
- [브라우저 오류 재현 기록](docs/browser-bug-reproduction.md)
- [검증 범위와 수동 절차](docs/verification.md)

실제 연동에는 권한이 있는 세션에서 메뉴·조회·오류 흐름과 데이터 계약을 확인하는 과정이 먼저 필요합니다. 공급사가 지원하는 공식 연동을 우선 검토하고, 검증하지 않은 내부 경로는 실행 코드에 하드코딩하지 않습니다.

전체 작업 완료 후 머지 조건과 자료 의존성은 [완료 조건](docs/completion-gates.md)에 기록합니다.
