# 로컬 모델 설치와 실증

2026-10-23에 Windows / RTX 3060 Ti 8GB / RAM 32GB에서 Ollama 0.40.8과 Qwen3 4B(Q4_K_M, 모델 ID `359d7dd4bcda`)를 실제 실행했다. 합성 브리핑 출력과 근거 ID 검사, 금액 근거 유지, 문서 속 잘못된 지시 무시, 근거 없음 처리의 소규모 검사를 통과했다. 실제 기관 표본·대규모 품질·공격 방어 전반의 보장은 아니다.

## 다른 Windows PC에서 준비

기존 Ollama 서비스가 있으면 해당 서비스와 설치된 모델을 사용한다. 이 작업에서 사용한 독립 실행 버전은 다음과 같이 준비할 수 있다. 파일은 Git 제외 폴더에 보관한다.

```powershell
New-Item -ItemType Directory -Force data/runtime | Out-Null
curl.exe -fL 'https://github.com/ollama/ollama/releases/download/v0.40.8/ollama-windows-amd64.zip' -o data/runtime/ollama-0.40.8.zip
if ($LASTEXITCODE -ne 0) { throw 'Download failed' }
$runtimeDigest = (Get-FileHash data/runtime/ollama-0.40.8.zip -Algorithm SHA256).Hash
if ($runtimeDigest -ne '04d1d43ac62c2deb0393307bb49fed7caf6b192de41bdd497aaa9488089d5552') { throw 'Digest mismatch' }
Expand-Archive data/runtime/ollama-0.40.8.zip data/runtime/ollama-0.40.8
powershell -ExecutionPolicy Bypass -File scripts/windows-model.ps1
```

마지막 명령은 포그라운드로 서버를 실행한다. 이미 포트 11434가 사용 중이면 중복 실행을 거부한다. 서버를 유지한 채 별도 터미널에서 실행한다.

```powershell
& ./data/runtime/ollama-0.40.8/ollama.exe pull qwen3:4b
```

공식 실행 파일 압축본은 약 1.6 GB, 모델은 약 2.5 GB이며 압축 해제 공간이 추가로 필요하다. `.env`에 아래 값을 설정하고 업무 도우미 서버를 재시작한다.

```dotenv
OLLAMA_MODEL=qwen3:4b
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

`windows-model.ps1`은 127.0.0.1 바인딩, `OLLAMA_NO_CLOUD=1`, 프로젝트의 `data/models`, 문맥 8192, 병렬 요청 1을 설정한다. 사용자·시스템 환경변수나 로그인 시작 프로그램을 변경하지 않는다. PC 재시작 후에는 모델 서버를 다시 실행해야 한다. 모델 파일과 로그인은 Git으로 공유하지 않는다. 다른 GPU·메모리 환경은 별도 검증이 필요하다.

## 실행 확인

```bash
npm run doctor:model -- --warmup --probe
npm run evaluate:model -- data/model-evaluation.json
```

`--warmup`은 빈 입력으로 모델을 로딩하며 최대 180초 대기한다. 앱의 실제 요약 호출 제한은 45초다. 첫 시도에서 GPU 메모리 할당·초기 로딩 실패가 발생했고, 앱의 처리 묶음을 64로 줄이고 초기 로딩을 분리한 뒤 실제 검사를 통과했다. 응답 생성은 thinking 출력을 끄고 JSON 스키마를 사용한다.

평가 명령은 합성 자료만 사용한다. 결과의 문장과 숫자를 직접 검토해야 한다. 기관 자료는 자동 평가에 포함하지 않으며, 모델이 임의 도구·그룹웨어 API를 실행할 수 없다. 앱에서 AI 요약을 선택하면 조회한 근거가 설정된 로컬 서비스로 전달된다.

2026-10-23 검증 당시 서버 프로세스는 loopback에서만 수신하고 로그에 클라우드 비활성 상태를 확인했다. GPU 로딩은 `ollama ps`에서 100% GPU, 문맥 8192로 확인했다. 이것은 이 PC의 한 번의 실증이며 다른 컴퓨터의 성능을 보장하지 않는다.

공식 출처: [Ollama Windows 독립 CLI](https://docs.ollama.com/windows), [Qwen3 4B 모델](https://ollama.com/library/qwen3:4b), [로컬 전용 모드·환경 설정](https://docs.ollama.com/faq), [Chat API의 think·출력 형식](https://docs.ollama.com/api/chat).
