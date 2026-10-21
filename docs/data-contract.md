# 수동 데이터 가져오기 계약 v1

JSON 크기는 UTF-8 기준 최대 5 MB, 레코드는 최대 3,000건이다. 정의하지 않은 필드는 거부한다. 인증 정보나 원본 HAR를 이 형식으로 넣지 않는다. 가져오기는 현재 스냅샷 전체를 교체하며 자동 백업·병합·증분 수집을 지원하지 않는다.

```json
{
  "schemaVersion": 1,
  "source": {
    "kind": "manual-export",
    "label": "승인된 업무 내보내기",
    "exportedAt": "2026-10-22T09:00:00+09:00",
    "baseUrl": "https://example.com"
  },
  "principal": {
    "userId": "user-1",
    "displayName": "사용자",
    "organizationId": "org-1"
  },
  "items": [
    {
      "id": "document-1",
      "type": "document",
      "status": "published",
      "title": "운영계획 작성 안내",
      "body": "승인된 원문 내용을 넣습니다.",
      "organizationId": "org-1",
      "allowedUserIds": ["user-1"],
      "updatedAt": "2026-10-21T10:00:00+09:00",
      "url": "https://example.com/#/documents/1",
      "version": "v1",
      "effectiveFrom": "2026-10-01",
      "effectiveTo": "",
      "tags": ["운영계획", "서식"]
    }
  ]
}
```

예제 URL은 placeholder이며 실제 그룹웨어 주소가 아니다. URL은 데이터로 보관하고 사용자가 클릭할 때만 연다. 서버는 입력한 URL을 자동으로 가져오지 않는다.

| 필드 | 규칙 |
|---|---|
| source.kind | `demo` 또는 `manual-export` |
| source.exportedAt | `Z` 또는 offset을 포함한 ISO 시각 |
| source.baseUrl | 선택. 원문 링크를 넣을 때 필요. http(s) origin, 인증·쿼리·fragment 불가 |
| principal | userId, displayName, organizationId 필수. 각 120자 이하 |
| id | 전체 스냅샷에서 유일, 영문·숫자·`_.:-`, 100자 이하 |
| type | `approval`, `notice`, `document`, `schedule` |
| status | `pending`, `in-progress`, `completed`, `published`, `cancelled` |
| title / body | 제목 최대 300자, 본문 최대 30,000자. 본문 생략 가능 |
| organizationId | principal의 조직과 정확히 일치해야 결과에 포함 |
| allowedUserIds | 최대 100개. principal.userId가 명시되어야 결과에 포함. 빈 배열은 접근 없음 |
| updatedAt | 시간대 포함 ISO 시각. 출력은 한국시간 |
| dueDate | 선택, 유효한 `YYYY-MM-DD` |
| startsAt / endsAt | schedule에서 필수. offset 포함, 시작 < 종료 |
| effectiveFrom / effectiveTo | 선택. 문서 검색 시 한국 날짜로 경계 포함 판정 |
| version / tags | 선택. 버전 60자 이하, 태그 최대 20개 |
| url | 선택. source.baseUrl과 같은 origin. 인증값이 포함된 URL은 제외 |

문서 검색은 `document + published + 유효 기간 + 사용자/조직 일치`가 모두 충족되는 레코드만 사용한다. 공유 문서라도 모든 사용자를 뜻하는 `*`는 지원하지 않으며, 조회 사용자 ID를 명시한다. 역할/부서 권한 확장은 실제 서버 계약 검증 후 추가한다.

본문과 메타데이터는 원문을 정확하게 반영해야 한다. 같은 문서의 여러 버전을 가져오면 유효 기간을 명시한다. 앱은 버전 문자열만 보고 최신 버전을 추정하지 않는다.

## 내부 HTTP 계약

| 경로 | 역할 |
|---|---|
| `GET /api/status` | 현재 스냅샷 정보, 기능 상태, 세션별 CSRF 토큰 |
| `GET /api/example` | 현재 날짜의 합성 예제 |
| `POST /api/import` | 검증 후 전체 데이터 교체 |
| `POST /api/reset-demo` | 합성 예제로 교체 |
| `POST /api/run` | `{task: "briefing"}` / `{task: "search", query: "..."}` / `{task: "validate", draft: {...}}` |
| `GET /api/audit` | 최근 실행 기록 최대 50개 |

POST에는 `Content-Type: application/json`과 `/api/status`에서 얻은 `x-csrf-token`이 필요하다. 브리핑/검색은 `useModel: true`를 선택할 수 있다. 오류 응답은 `{error: "설명"}`과 HTTP 오류 코드다.

결재의 `pending`은 현재 사용자가 처리할 대기 문서로 한정한다. 본인이 상신하여 다른 결재자가 처리 중인 문서는 `in-progress`로 구분하며 내 결재 대기 건수에서 제외한다. 원문 메뉴·필터·사용자 역할을 확인하지 못한 단순 "진행" 표시는 `pending`으로 추정하지 않는다. `completed` 역시 자료의 관점에서 처리 완료이며 기관 전체의 최종 승인으로 추정하지 않는다.
