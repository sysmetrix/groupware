# 다른 PC에서 설치하고 사용하기

현재 제공하는 자동화는 **내보낸 파일 처리**다. 그룹웨어 자동 로그인·자동 다운로드·상신 기능은 아직 없다. 각 PC에서 그룹웨어에 직접 로그인하여 권한 내 자료를 내보내야 한다. 브라우저 쿠키나 토큰을 GitHub로 옮기지 않는다.

## 처음 설치

Git, Node.js 24 이상과 Python 3.10 이상(검증 버전 3.14)을 설치하고 터미널을 다시 연다. 공개 저장소를 내려받아 실행하는 데 GitHub 로그인은 필요하지 않다. 코드 변경을 push할 때만 해당 PC에서 GitHub 인증을 설정한다.

```powershell
git clone --branch codex/groupware-assistant-mvp https://github.com/sysmetrix/groupware.git
cd groupware
npm ci
npm run setup
npm run setup:documents
npm run doctor
npm run setup:control
npm start
```

Windows에서는 clone 후 `powershell -NoProfile -File scripts/install.ps1`로 설치·설정·진단과 실행 관리자 설치를 묶어서 실행할 수도 있다. Windows의 .NET Framework C# 컴파일러로 `data/control-panel/GroupwareControl.exe`를 만들고 현재 사용자 바탕화면에 **Groupware AI Control** 바로가기를 만든다. 컴파일러와 바탕화면 쓰기 권한이 필요하며 관리자 권한은 요구하지 않는다. 기존 `.env`, 설정과 업무자료는 유지한다. 조직 정책에서 스크립트 실행을 막으면 허용된 npm 명령으로 웹 앱을 설치하고 담당자에게 실행 관리자 설치 정책을 확인한다. `npm run setup:control`도 PowerShell 스크립트를 사용한다. 실행 정책을 우회하거나 영구 변경할 필요가 없다.

설치 후 바로가기를 열고 **업무 도우미 → 시작**을 누르면 터미널 없이 앱을 실행할 수 있다. 이 경우 위의 `npm start`는 생략한다. 로컬 AI는 [모델 설치 안내](local-model.md)에 따라 별도로 준비한다. 실행 관리자 설치만으로 모델이나 서버를 자동 실행하지 않는다. 버튼과 종료 동작은 [실행 관리자 안내](control-panel.md)를 따른다. 재설치할 때는 먼저 관리자의 **창만 닫기**로 창을 닫는다.

별도 검증용 복제본은 설치·업데이트 스크립트에 `-NoShortcut`을 붙여 기존 바탕화면 바로가기를 유지할 수 있다. 실행 파일 빌드는 수행한다.

브라우저에서 `http://127.0.0.1:3210`을 연다. 그룹웨어 자료를 가져오기 전에는 **내 문서** 화면이 열린다. PDF·XLSX·HWPX를 선택해 바로 넣을 수 있다. [내 문서 사용 안내](document-library.md)를 따른다. `npm run setup`은 기존 `.env`와 설정 파일을 덮어쓰지 않는다. 포트는 `.env`의 `PORT`로 바꿀 수 있다.

백그라운드 서버를 명시적으로 관리하려면 [실행·종료 안내](runtime-control.md)의 Windows 관리 명령을 사용한다. 기존 터미널 서버를 종료한 후 `npm run services:start`로 시작하면 `npm run services:stop`으로 해당 앱·모델 서버와 후손을 종료할 수 있다. 모델이 없는 PC는 `powershell -NoProfile -File scripts/windows-services.ps1 -Action Start -Service App`으로 앱만 시작한다. 앱 화면의 실행 상태 조회는 모델을 새로 로딩하지 않는다.

## 내 자료와 정기 브리핑 연결

1. 본인이 열람할 수 있는 자료만 내보낸다. JSON은 [데이터 계약](data-contract.md), CSV는 [변환 안내](csv-import.md)를 따른다. Excel은 CSV UTF-8로 저장할 수 있다. PDF/XLSX/HWPX의 텍스트 검색은 선택형 [첨부 추출 CLI](attachments.md)를 설치한다. 구형 HWP와 OCR은 미지원이다.
2. 검증한 전체 스냅샷을 `data/inbox/dataset.json`에 둔다. 네 종류의 자료를 함께 사용하려면 한 스냅샷의 `items`에 모두 포함해야 한다. 새 파일은 **전체 교체**이며 증분 합치기가 아니다. 자동화가 켜진 상태에서는 UI로 가져온 다른 자료가 다음 확인에서 입력 파일로 교체된다.
3. `config/automation.json`을 다음 형태로 수정한다. 사용자·조직 식별자는 JSON의 `principal`과 정확히 같아야 한다. 아래 값은 예시다.

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "inputFile": "./data/inbox/dataset.json",
  "expectedPrincipal": {"userId": "my-user", "organizationId": "my-org"},
  "intervalSeconds": 60,
  "briefingTime": "09:00",
  "maxAgeHours": 72
}
```

4. `npm run doctor` 후 서버를 재시작한다. `inputFile`의 상대 경로는 프로젝트 폴더 기준이며 Windows 절대 경로에는 `/` 또는 이중 역슬래시를 쓴다.
5. 화면 **데이터 연결 → 자료 확인 · 브리핑 생성** 또는 별도 터미널의 `npm run automate`를 실행한다. 현재 스냅샷의 브리핑을 바로 만든다.

서버는 확인이 끝난 뒤 기본 60초를 기다려 파일을 다시 검증한다. 일시적 파일 오류가 반복되면 확인 간격을 늘리며 다음 확인 시각과 복구 방법을 화면에 표시한다. 한국 시간 09:00 이후 그날의 보고서를 만들고, 이후 자료가 바뀌면 다시 만든다. 09:00에 PC가 꺼져 있었다면 다음에 서버를 켰을 때 당일 보고서를 만든다. 지난 날짜를 소급 생성하지 않는다. 날짜가 바뀌거나 자료가 만료되면 예전 보고서를 현재 보고서로 제공하지 않는다. 재시작 직후에는 입력 파일을 다시 검증할 때까지 보고서가 제공되지 않는다. 모델을 부르거나 메일·알림을 보내지 않는다.

자료가 72시간보다 오래되었거나 5분 이상 미래 시각이면 거부한다. 파일 손상, 다른 사용자·조직, 잘못된 형식도 거부한다. 동일 사용자·조직·출처의 현재 자료보다 과거인 파일은 유효 시간 이내여도 자동 교체하지 않는다. 이때 기존 자료는 유지하되 자동화 상태에 실패를 표시하고 현재 보고서 다운로드를 막는다. 새 내보내기 파일로 교체하면 다음 확인에서 복구된다. `exportedAt`에는 실제 내보낸 시각을 기록한다. 오류별 조치는 [복구 절차](automation-recovery.md)를 따른다.

보고서는 `data/reports/latest.json`에 저장된다. 화면에서도 다운로드할 수 있다. 로그는 `data/audit.jsonl`이고 본문·검색어·인증 값은 기록하지 않는다. 내보낸 자료의 ACL은 파일 작성자가 확인하는 정보로, 서버의 실시간 권한 확인을 대체하지 않는다.

## Windows 로그인 시 자동 실행 (선택)

수동 실행이 정상인지 확인한 뒤 아래를 실행한다. 비밀번호를 저장하지 않는 현재 사용자 로그인 트리거를 등록한다. 관리자 권한을 요구하도록 구성하지 않았다. 기관 정책에 따라 작업 스케줄러 등록이 제한될 수 있다.

```powershell
powershell -NoProfile -File scripts/windows-autostart.ps1
```

다음 Windows 로그인부터 서버가 실행된다. 브라우저는 직접 연다. PC 절전·종료 중에는 실행되지 않는다. 작업 스케줄러에서 `GroupwareAssistant-`로 시작하는 작업을 찾아 상태와 결과를 확인할 수 있다. 코드를 옮기거나 Node 설치 경로가 바뀌면 기존 작업을 제거하고 새 경로에서 다시 등록한다.

제거:

```powershell
powershell -NoProfile -File scripts/windows-autostart.ps1 -Remove
```

서버를 수동 실행할 때는 기존 서버를 먼저 종료한다. 같은 데이터 폴더에 여러 서버를 실행하지 않는다. 임시 작업 등록·주체·로그온 트리거와 작업 스케줄러를 통한 실제 서버 시작은 확인했다. 실제 Windows 로그인 시점 동작은 대상 PC에서 확인해야 한다. `powershell -NoProfile -File scripts/windows-verify-autostart.ps1`는 분리된 합성 자료로 임시 작업을 등록·실행·제거하며 실제 로그아웃은 하지 않는다.

## 설치 결과를 HTML로 확인

설치 후 `npm run verify:pc`를 실행한다. 현재 PC의 Node·설정·프로젝트 Python·Windows 실행 파일·아이콘·로컬 모델 설치 상태를 확인하고, 별도 합성 자료 폴더와 임의 포트에서 화면 파일·브리핑·검색·감사 흐름을 검사한다. 기존 업무자료나 실행 중인 앱을 교체하지 않는다. `data/verification/pc-*/report.html`과 JSON에 결과가 저장되며 실패한 항목이 있으면 종료 코드 1을 반환한다. AI 미설정은 SKIP, 설정된 모델에 연결할 수 없거나 설치되지 않았으면 FAIL이다.

이 검사는 실제 그룹웨어 로그인·기관 표본 정확도·GUI 조작·LLM 추론을 증명하지 않는다. AI 합성 추론은 `npm run doctor:model -- --probe`로 별도 확인한다. 2026-10-23에는 같은 PC의 한글·공백 경로에 GitHub 저장소를 새로 복제해 89개 Node·9개 Python 테스트와 실행 파일 빌드를 통과했다. 실제 다른 물리 PC의 확인 결과는 아직 없다. 대상 PC에서 위 명령과 실행 관리자 시작·종료·로그인 시 실행 검증을 수행해야 한다.

## GitHub에서 업데이트 실행

진행 중인 업로드·저장을 마친 뒤 서버를 종료하고 실행 관리자의 **창만 닫기**로 관리 창도 닫는다. 별도 터미널에서 실행한 서버는 원래 터미널에서 종료한다. 프로젝트 폴더에서 실행한다.

```powershell
powershell -NoProfile -File scripts/update.ps1
```

이 스크립트는 실행 관리자 파일이 사용 중이면 Git·npm 작업 전에 멈추고 창을 닫으라는 오류를 표시한다. 로컬 코드 변경이나 추적되지 않은 파일이 있어도 멈추며 현재 추적 브랜치를 fast-forward로만 업데이트한다. 설정과 자료는 Git에서 제외되어 보존된다. npm 설치·문서 도구 설정·검사·테스트가 성공하면 실행 관리자를 다시 컴파일하고 바탕화면 바로가기도 갱신한다. 서버나 실행 관리자를 강제로 종료하거나 자동 재시작하지 않는다. 완료 후 바로가기를 다시 열고 서버를 수동으로 시작한다.

업데이트 중 관리 창을 다시 열지 않는다. 파일 잠금 오류가 나면 **창만 닫기**로 닫고 `scripts/update.ps1`을 다시 실행한다. 창이 이미 닫혔으면 실행 파일 권한이나 다른 프로그램의 파일 잠금을 확인한다. 코드 업데이트 후 실행 관리자 빌드 또는 바로가기 생성만 실패한 경우 오류를 해결한 뒤 `powershell -NoProfile -File scripts/install-control-panel.ps1`로 마무리할 수 있다. 컴파일러가 없거나 바탕화면에 쓸 수 없는 경우도 오류에 표시된다.

다른 OS에서도 다음 명령을 사용할 수 있다. 작업 내용이 있는 경우 먼저 commit하거나 별도로 보관한다.

```bash
git pull --ff-only
npm ci
npm run check
npm test
npm start
```

## PC 간 보관 범위

| GitHub로 공유 | 해당 PC에만 보관 |
|---|---|
| 코드·테스트·공개 사용 안내 | `.env`, `config/`, `data/`, `analysis/` |
| 합성 예제와 변환 형식 | 실제 자료·보고서·사용자 식별자·브라우저 로그인 |

실제 업무자료를 다른 PC로 이동할 때는 기관이 허용한 보관·전송 수단을 사용한다. 같은 계정이더라도 각 PC의 로그인은 별도다. 기본 GitHub clone만으로 업무자료나 로그인 상태가 복원되지는 않는다.

## 문제 해결

- 페이지 단위 자료: [수집 계약](sync-contract.md)에 따라 `npm run sync:pages`로 전체 검증 후 JSON을 만든다. 실제 API에서 페이지를 받는 어댑터는 별도다.
- 로컬 AI 확인: `npm run doctor:model`. 모델이 준비된 경우에만 `npm run doctor:model -- --probe`로 합성 근거 추론을 검사한다. 자동 설치·다운로드는 하지 않는다.
- 포트 사용 중: 이미 켜진 서버를 종료하거나 `.env`의 `PORT`를 변경하고 해당 주소로 접속한다.
- 자동화 미설정: `enabled`, 사용자·조직 값을 확인한 뒤 서버를 다시 시작한다.
- 파일 대기: `inputFile`의 경로와 파일 존재 여부를 확인한다.
- 자료 시각 오류: 새로 내보내고 `exportedAt`을 실제 내보낸 시각으로 기록한다.
- `main`에 실행 파일 없음: 위 clone 명령처럼 구현 브랜치를 지정하거나 `git fetch origin` 후 `git switch --track origin/codex/groupware-assistant-mvp`를 사용한다.
- 실제 그룹웨어 조회가 안 됨: 현 버전은 직접 조회 커넥터가 없다. [실제 연동 검증 계획](live-integration.md)의 확인이 남아 있다.
