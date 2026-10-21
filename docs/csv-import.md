# CSV/TSV를 업무자료로 변환하기

`npm run setup`으로 만든 `config/csv-profile.json`에서 사용자·조직, 출처, 실제 내보낸 시각과 열 매핑을 수정한다. 각 행은 이 사용자가 이 조직에서 열람한 자료라는 전제하에 단일 사용자 ACL로 변환한다. 여러 사용자 자료를 한 파일에 섞지 않는다.

```json
{
  "schemaVersion": 1,
  "principal": {"userId": "my-user", "displayName": "내 이름", "organizationId": "my-org"},
  "source": {"label": "내보낸 공지", "baseUrl": "https://groupware.example", "exportedAt": "2026-10-22T09:00:00+09:00"},
  "delimiter": ",",
  "columns": {"id": "문서번호", "type": "유형", "title": "제목", "body": "본문", "status": "상태", "updatedAt": "수정시각"}
}
```

예시 CSV (실제 기관 자료 아님):

```csv
문서번호,유형,제목,본문,상태,수정시각
notice-1,notice,예제 공지,가상의 안내입니다.,published,2026-10-22T08:30:00+09:00
```

```bash
npm run convert:csv -- data/inbox/export.csv config/csv-profile.json data/inbox/dataset.json
```

UTF-8만 허용한다. Excel에서 **CSV UTF-8**로 저장한다. TSV는 설정의 `delimiter`를 `"\t"`로 바꾼다. 쉼표·큰따옴표·여러 줄 셀과 BOM을 처리하며, 열 수 불일치·중복 머리글·중복 ID는 거부한다. 최대 5 MB, 3,000행이다. 출력 JSON이 5 MB보다 크면 실패한다.

필수 매핑: `id`, `type`, `title`, `status`, `updatedAt`. 선택 매핑: `body`, `dueDate`, `url`, `startsAt`, `endsAt`, `effectiveFrom`, `effectiveTo`, `version`. 파일에 없는 선택 열은 매핑에서 삭제한다. 모르는 열은 가져오지 않는다.

- `type`: `approval`, `notice`, `document`, `schedule`
- `status`: `pending`, `completed`, `published`, `cancelled`
- 날짜: `YYYY-MM-DD`
- 시각: `2026-10-22T09:00:00+09:00`처럼 시간대 포함
- 일정: `startsAt`과 그보다 늦은 `endsAt` 필요
- 원문 주소: 설정한 `source.baseUrl`과 같은 출처의 http(s) 주소, 인증 정보 없는 URL

기관이 내보내는 머리글은 `columns`에 연결할 수 있다. 유형·상태의 실제 값이 한글이면 위 값으로 변환하여 저장해야 한다. 내보내기 형식을 자동으로 추측하지 않는다. `id`는 원문 식별자를 일관되게 사용한다.

출력 파일이 이미 있으면 덮어쓰지 않는다. 다음 자료는 `data/inbox/dataset-next.json`처럼 새 이름으로 변환하고 확인한 뒤 기존 `dataset.json`을 교체한다. 자동화는 전체 스냅샷을 교체하므로 결재·공지·일정·문서가 모두 필요하면 한 파일에 포함한다. 원본 파일에는 없던 본문이나 링크를 만들어 넣지 않는다.
