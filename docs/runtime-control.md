# 로컬 서버 시작·상태·종료

터미널의 대화 창을 닫아도 별도 실행한 Ollama 서버나 업무 도우미는 남을 수 있다. 모델이 GPU 메모리에 로딩된 상태와 서버가 실행 중인 상태도 다르다. 앱의 **데이터 연결 → 이 PC의 실행 상태**에서 서버, 설치 모델, 메모리 로딩과 GPU 사용량을 확인한다. 상태 확인은 모델을 로딩하거나 문서를 전송하지 않는다. 결과는 10초 동안 재사용하며 화면은 약 30초마다 갱신한다.

Windows PowerShell에서 프로젝트 폴더로 이동한 뒤 실행한다.

```powershell
# 상태 확인 (기존 서버도 표시하며 종료하지 않음)
powershell -NoProfile -File scripts/windows-services.ps1 -Action Status

# 앱과 Ollama를 관리 가능한 백그라운드 프로세스로 시작
powershell -NoProfile -File scripts/windows-services.ps1 -Action Start

# 이 명령으로 시작한 앱·Ollama와 그 하위 프로세스 종료
powershell -NoProfile -File scripts/windows-services.ps1 -Action Stop

# 모델만 메모리에서 해제. 서버는 계속 실행
powershell -NoProfile -File scripts/windows-services.ps1 -Action UnloadModel -Service Ollama -Model qwen3:4b
```

`-Service App` 또는 `-Service Ollama`로 한쪽만 선택할 수 있다. 앱 포트 기본값은 3210, Ollama는 11434다. `-AppPort`/`-OllamaPort`로 바꾸면 해당 관리 실행의 환경 변수에 적용하며 `.env` 파일은 변경하지 않는다. 기본 Ollama 실행 파일은 기존 설치 절차의 `data/runtime/ollama-0.40.8/ollama.exe`다. 실행 파일·모델이 없는 PC는 [모델 설치 안내](local-model.md)를 먼저 따른다.

`running-owned`는 이 관리 명령이 시작했고 PID·실행 파일·시작 시각·감시 프로세스의 명령줄을 확인한 상태다. `unmanaged-listener`는 예전 터미널/별도 프로그램으로 실행한 서버라 종료 권한 기록이 없다는 뜻이다. 해당 서버가 있으면 Start는 덮어쓰지 않고, Stop은 종료하지 않는다. 이 경우 원래 실행한 터미널에서 Ctrl+C로 끝내거나 작업 관리자에서 확인한 해당 프로세스를 종료한 뒤 Start를 사용한다. 모든 node.exe/ollama.exe를 일괄 종료하지 않는다.

관리 실행은 Windows Job Object에 실제 자식 프로세스와 후손을 넣는다. 검증된 감시 프로세스에 고유 종료 이벤트를 보내면 해당 작업 트리만 끝난다. 강제 종료이므로 문서 업로드·저장 중에는 먼저 작업 완료를 기다린다. 상태 파일과 로그는 Git에서 제외하는 `data/runtime-control/`에 저장한다. 포트 충돌·오래된 PID·소유권 불일치는 거부한다. 스크립트 실행 정책을 자동 우회하거나 Windows 로그인 작업을 추가·변경하지 않는다.

`npm start`, 기존 `windows-model.ps1`, 작업 스케줄러로 직접 시작한 서버는 이 관리 명령의 소유 기록에 자동 등록되지 않는다. 이는 기존 방식을 제거하거나 기존 프로세스를 강제로 인수하는 기능이 아니다.
