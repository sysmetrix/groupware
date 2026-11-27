# 개인 ToDo 직접 첨부: 확인한 계약 (2026-11-27)

운영 데이터를 생성·조회·수정하지 않고 배포된 정적 JS 두 개를 GET해 확인했다. 아래 원본은 저장소에 복사하지 않았다.

- https://gw.bwyf.or.kr/modules/kiss/static/js/common.8a5a3f10.chunk.js : ToDo 편집기에서 상세 fileList의 fileSn을 모으고 empSeq/prjSeq/todoSeq/issueSeq/menuAuthType/searchAuthType 권한 맵과 PROJECT를 업로더에 전달한다. 저장 시 fnAttFileUpload() 결과 전체를 쉼표로 결합한 uid와 각 ID를 {fileId}로 감싼 file 배열을 InsertTodo/UpdateTodo에 함께 보낸다.
- https://gw.bwyf.or.kr/static/js/5744.8111da93.chunk.js : 실제 A04 본문은 fileSnList가 아니라 fileSn 배열, condition '99', moduleGbn 'PROJECT', 문자열화한 authKeyMap이다. 업로더는 반환된 resultData.list의 순서를 요청 일련번호에 대응시킨다. A01은 multipart의 반복 file[] 필드와 moduleGbn. 응답은 resultData.list[].fileId이다. ECM A01(바이너리 업로드)과 KISS prj001A01(할 일 생성)은 다른 호출이다.

## 사용 및 검증

내가 만들고 담당하는 개인 할 일에서 파일을 선택한 뒤 저장한다. 파일 선택만으로는 요청하지 않는다. 기존 첨부를 지우는 기능은 제공하지 않는다. 개수·일련번호·ID·소유권이 불확실하면 전체 수정 요청을 보내지 않는다. 첨부 처리 뒤 상세를 다시 읽어 경합을 감지한다. 파일·업로드 ID는 로컬 저장소에 남기지 않는다.

가짜 서명 클라이언트와 합성 File로 검증: `node --test test/todo-collector.test.mjs`. 운영 계정에 대한 실제 업로드 검증과 배포는 하지 않았다.

## 남은 한계

- 파일 저장과 ToDo 저장은 서버의 단일 트랜잭션이 아니다. 첫 단계만 성공하면 연결되지 않은 업로드가 남을 수 있다. 다른 사용자가 쓰는 파일을 지울 위험이 있어 ECM 삭제는 호출하지 않는다.
- 파일 선택이 유지되는 편집 세션에서는 업로드 결과를 재사용하고, 응답이 불확실할 때 같은 선택을 자동 재전송하지 않는다. 새로고침/재선택 후의 서버 중복까지 보장하는 멱등 키는 확인되지 않았다.
- 최종 상세 조회 이후 A02가 처리되기 전까지의 동시 수정은 버전 조건을 지원하는 서버 계약 없이는 원자적으로 차단할 수 없다.
