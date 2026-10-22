# 로컬 첨부 추출과 근거 검색

텍스트 PDF, XLSX, HWPX를 로컬에서 읽어 기존 document 항목에 검색 근거를 연결합니다. 원본 파일은 수정하지 않습니다. 그룹웨어 첨부 다운로드나 첨부 금액의 자동 판정 기능은 아닙니다.

## 다른 PC 설치

기본 앱은 Node.js 24만 필요합니다. 첨부 CLI는 Python 3.12 이상이 필요하며 CI는 Python 3.14에서 검증합니다. Python 설치 후 저장소 폴더에서 실행하세요.

Windows PowerShell:

```powershell
python -m venv .venv-attachments
& ./.venv-attachments/Scripts/python.exe -m pip install -r requirements-attachments.txt
$env:ATTACHMENT_PYTHON = (Resolve-Path ./.venv-attachments/Scripts/python.exe).Path
```

macOS/Linux:

```bash
python3 -m venv .venv-attachments
.venv-attachments/bin/python -m pip install -r requirements-attachments.txt
export ATTACHMENT_PYTHON="$PWD/.venv-attachments/bin/python"
```

매번 지정하지 않으려면 `.env`의 `ATTACHMENT_PYTHON`에 해당 PC의 Python 실행 파일 절대 경로를 저장합니다. 다른 PC 경로를 그대로 복사하지 마세요. `.env`, 가상환경, 원본 자료는 Git으로 공유하지 않습니다. PDF는 pypdf 고정 버전, XLSX/HWPX는 표준 ZIP/XML 라이브러리를 사용합니다.

## 실행

현재 데이터 계약의 JSON과 그 문서의 첨부를 `data/` 안에 준비합니다. 문서에 version, updatedAt, 조직·사용자 ACL이 필요합니다. 첨부의 열람 범위가 부모 문서와 동일한지 내보내는 사람이 확인해야 합니다. 별도 제한이 있는 첨부는 해당 사용자 데이터에 연결하지 마세요.

```bash
npm run attach:extract -- data/source.json doc-001 data/approved.pdf evidence-01 data/with-attachments.json
```

인수: 입력 JSON, 문서 ID, 첨부 경로, 첨부 ID, 출력 JSON. 세 파일 경로는 달라야 하고 출력 폴더는 미리 존재해야 합니다. 출력은 성공 시 교체하므로 별도 결과 경로를 쓰세요. 같은 첨부 ID는 교체합니다. 다른 첨부도 추가하려면 이전 출력을 다음 입력으로 사용합니다.

출력 JSON을 앱의 **데이터 연결 → JSON 가져오기**에서 불러오거나 파일 자동화의 inbox로 지정합니다. CLI만 실행하면 앱 데이터가 자동 교체되지는 않습니다. `source.exportedAt`은 추출 시각으로 바꾸지 않으며 기존 신선도·시간 역행 검사를 받습니다.

첨부 텍스트에 있는 단어를 검색하면 결과와 AI 인용에 첨부명·위치·원문 버전·경고가 표시됩니다. 원문 링크는 부모 문서 링크이며 첨부 내 위치로 이동하는 기능은 없습니다. 키워드 검색은 최대 8개 근거를 표시합니다.

## 지원 범위

| 형식 | 추출 위치 | 한계 |
|---|---|---|
| PDF | 1부터 시작하는 물리적 페이지 | 텍스트 레이어만 추출. OCR·표 복원·읽기 순서 보장 없음. 텍스트 없는 페이지는 경고, 전체가 비면 실패 |
| XLSX | 시트명·셀 주소 | 공유/인라인 문자열·숫자 원시값·boolean. 수식은 식 자체만 표시하고 캐시 결과를 사용하거나 계산하지 않음. 숨긴 시트 제외, 숨긴 행/열 포함. 날짜 일련번호·서식·병합 셀 의미는 복원하지 않음 |
| HWPX | spine 본문 순서의 구역·XML 문단 순번 | 한컴 Contents/ 경로와 header 항목 처리. 표 안 문단은 별도 단위. 실제 쪽 번호·표 좌표·이미지·변경 이력 해석 없음 |

구형 HWP/XLS, 암호화 파일, OCR은 미지원입니다. HWP는 권한이 있는 편집기로 HWPX 또는 텍스트 PDF로 내보낸 뒤 사용하세요. 추출 결과는 원문과 대조해야 합니다. 초안 점검은 여전히 사용자가 입력한 금액을 비교합니다.

## 데이터 계약과 근거 수명

document의 선택 필드 `attachments`에 아래 객체를 배열로 저장합니다. 기존 JSON도 그대로 허용합니다.

```json
{
  "id": "evidence-01",
  "filename": "approved.pdf",
  "format": "pdf",
  "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "documentVersion": "v1",
  "documentUpdatedAt": "2026-10-22T00:00:00.000Z",
  "extractedAt": "2026-10-22T01:00:00.000Z",
  "warnings": ["PDF_LAYOUT_NOT_PRESERVED"],
  "units": [{"id": "p2", "location": {"page": 2}, "text": "합성 예시 문장"}]
}
```

다른 location 형식은 XLSX `{ "sheet": "예산", "cell": "B12" }`, HWPX `{ "section": 1, "paragraph": 2 }`입니다. SHA-256은 CLI가 읽은 바이트의 식별자이며 수동 JSON의 진위나 첨부의 실제 소속을 인증하지는 않습니다. 원문 버전/갱신 시각이 달라지면 가져오기를 거부하므로 다시 추출해야 합니다.

문서 ACL·조직·게시 상태·시행 기간을 먼저 필터링합니다. 전체/증분 입력에 부모 삭제·권한 회수·첨부 없는 새 버전이 반영되면 이전 첨부는 결과에서 사라집니다. 서버 권한 변경을 자동 감지하지 않습니다. 데이터 교체는 이전 JSON·원본·백업의 삭제를 의미하지 않습니다.

추출 텍스트는 JSON에 평문 저장됩니다. AI를 선택하면 검색 근거 일부와 위치를 설정한 로컬 Ollama에 전달합니다. 인용 ID 검사는 내용의 사실성을 증명하지 않습니다.

## 한도와 실패

- 파일 20 MiB, PDF 100쪽, XLSX 100시트, HWPX 본문 100구역.
- ZIP 2,048항목·총 해제 크기 50 MiB, 읽는 XML/파트 8 MiB. 중복 파트·외부 관계·DTD/entity 거부.
- 첨부당 1,000단위, 단위당 30,000자, 문서별 최대 10첨부·총 300,000자. 전체 JSON 5 MiB.
- CLI 하위 프로세스 30초·출력 5 MiB. 실패 시 부분 결과를 저장하지 않고 기존 출력 보존.
- 완전한 메모리 격리가 아닙니다. PDF 스트림 해제 중 메모리가 증가할 수 있어 복잡한 파일은 별도 격리·자원 제한 환경이 필요합니다.

## 검증과 출처

```powershell
npm run check
npm test
& ./.venv-attachments/Scripts/python.exe -m unittest discover -s test -p '*_test.py'
```

Python 환경을 활성화했다면 `npm run test:attachments`도 가능합니다. 합성 파일의 추출·위치, 암호화·외부 참조·중복 ZIP·한도 거부, CLI 추출→JSON→검색·원본 보존을 검사합니다. Node 테스트는 권한·버전·동기화 삭제와 AI 인용 계약을 검사합니다. 실제 기관 문서·LLM 추론·새 UI 시각 검증은 포함하지 않습니다.

설계 근거: [한컴 HWPX 구조](https://tech.hancom.com/hwpxformat/)의 패키지·목차 순서, [Microsoft Open XML 셀 읽기](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/how-to-retrieve-the-values-of-cells-in-a-spreadsheet)의 셀 형식 구분, [pypdf 텍스트 추출](https://pypdf.readthedocs.io/en/stable/user/extract-text.html)의 텍스트 레이어·OCR·메모리 한계를 참고했습니다. 기관 업무 규칙이나 그룹웨어 API 계약의 근거는 아닙니다.
