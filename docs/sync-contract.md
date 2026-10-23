# 정규화된 페이지 수집 계약

`src/sync.mjs`는 여러 페이지를 검증해 기존 앱의 전체 JSON 스냅샷으로 만드는 모듈이다. `npm run sync:pages`로 로컬 파일을 처리한다. **Amaranth API 클라이언트·인증·자동 다운로드는 아니다.** 제품 어댑터가 실제 조회를 수행하고 이 계약으로 변환하는 단계는 남아 있다.

## 합성 자료로 실행

```bash
npm run demo:sync
npm run sync:pages -- data/sync-demo/pages.json data/sync-demo/scope.json data/sync-demo/state.json data/sync-demo/dataset.json
```

예제는 빈 중간 페이지를 포함한 3페이지이며 실제 업무자료가 아니다. 결과는 `received: 12`, `visibleCount: 10`으로 사용자·조직 범위 밖 자료가 제거된다. 예제 생성은 기존 파일을 덮어쓰지 않는다. 출력 파일을 UI에서 가져오거나 자동화의 `inputFile`로 지정하면 기존 브리핑 흐름을 사용할 수 있다. 합성 예제의 `manual-export` 표시는 기존 계약을 시험하기 위한 값이며 실제 내보내기를 증명하지 않는다. 라벨에 합성 자료임을 명시했다.

## 범위와 파일

`scope.json`은 입력과 별도로 준비하는 기대 범위다. 다음 여섯 필드를 모두 정확하게 일치시킨다.

```json
{
  "connectorId": "approved-export-adapter",
  "contractVersion": "1",
  "userId": "my-user",
  "organizationId": "my-org",
  "baseUrl": "https://example.invalid",
  "queryKey": "all-authorized-items"
}
```

`baseUrl`은 경로·쿼리·인증값 없는 origin이다. `queryKey`에는 조회 범위 식별자를 쓴다. 이는 파일 작성자가 제공한 범위이며 서버 권한을 검증하는 수단은 아니다. 범위가 달라지면 별도 상태·출력 파일로 전체 수집한다.

페이지 묶음은 다음 구조다. `source`, `principal`, `items`는 [기존 데이터 계약](data-contract.md)을 따른다.

```text
{
  schemaVersion: 1,
  scope: { ...위의 여섯 필드 },
  mode: "full" 또는 "delta",
  fromCheckpoint: null 또는 기존 체크포인트,
  source: { kind: "manual-export", label, exportedAt, baseUrl },
  principal: { userId, displayName, organizationId },
  pages: [
    { cursor: null, nextCursor: "page-2", checkpoint: null,
      total: 3, items: [정규화한 레코드], deletedIds: [] },
    { cursor: "page-2", nextCursor: null, checkpoint: "next-version",
      total: 3, items: [나머지 레코드], deletedIds: [] }
  ]
}
```

위는 구조 설명이며 실행 가능한 JSON은 `npm run demo:sync`로 생성한다. `total`은 필터 적용 전 **전체 변경 수(items + deletedIds)**이고 모든 페이지에서 같아야 한다. 제품 API의 total 의미가 다르면 어댑터가 변환한다. 처음 cursor는 null, 마지막 nextCursor는 null이다. 빈 중간 페이지도 다음 cursor를 따른다. 마지막 페이지에서만 checkpoint를 기록한다.

## 전체·증분 처리

- `full`: fromCheckpoint는 null, 삭제 목록은 빈 배열. 완성된 목록에 없는 기존 항목은 제거된다. 마지막 페이지·total 0을 명시한 빈 전체 목록도 허용한다.
- `delta`: 저장된 범위와 fromCheckpoint가 맞아야 한다. 삭제 ID를 제거하고 업데이트 ACL에서 현재 사용자·조직이 제외됐으면 이전 본문도 제거한다. 건드리지 않은 항목은 유지한다.
- 동일 묶음의 ID 중복, 한 ID의 업데이트·삭제 충돌은 거부한다. 여러 이벤트가 있는 제품은 순서·버전 계약을 확인한 어댑터가 최종 변경 하나로 정리해야 한다.
- 체크포인트 불일치·상태 손상·범위 변경을 무시하지 않는다. 토큰 만료 뒤 전체 재수집 여부는 실제 API 계약을 가진 어댑터가 판단한다.

누락 페이지, 커서 순환, 건수 불일치, 중간 체크포인트, 마지막 페이지 뒤 추가 자료는 게시를 막는다. 제한은 1,000페이지·3,000변경·최종 3,000건·출력 5 MB·자료 72시간이다. CLI 입력 묶음은 5 MB 이하다. 실제 서버의 완전성·권한 회수 이벤트를 이 모듈만으로 증명할 수는 없다.

## 게시·재시작·잠금

전체 검사가 성공해야 출력 파일을 원자적으로 교체한다. **출력 교체 뒤** 체크포인트와 결과 자료를 함께 담은 상태 파일을 교체한다. 중간 수집 실패는 기존 출력·상태를 보존한다. 출력 쓰기 실패 시 체크포인트는 앞서가지 않는다.

출력과 상태는 별도 파일이며 단일 트랜잭션이 아니다. 두 쓰기 사이에 프로세스가 중단되면 이전 체크포인트에서 재실행해야 한다. 입력이 같을 때 전체 결과를 재작성하는 것은 멱등적이지만 서버 쓰기의 exactly-once를 보장하지 않는다. 상태 쓰기 실패 뒤 출력은 이미 갱신됐을 수 있다.

같은 state 경로는 `.lock`으로 직렬화한다. 정상 종료·예외 시 제거하고 강제 종료 시 남을 수 있다. 남은 잠금은 실행 프로세스가 없음을 확인한 뒤 제거한다. 자동으로 잠금을 훔치지 않는다. 같은 output에 다른 state 파일을 지정한 동시 실행, 심볼릭 링크·하드링크로 같은 파일을 여러 경로로 지정하는 사용은 지원하지 않는다. 로컬 자료·상태·체크포인트는 Git에 올리지 않는다.

## 검증 범위

합성 자료의 단위·파일 통합 테스트 9개와 실제 CLI 실행을 확인했다. 결재·문서·일정 API 응답과 대조한 운영 테스트는 아니다. `liveConnected`는 계속 false다. HTTP 429/Retry-After, 세션 갱신, 원문 버전 대조는 실제 어댑터 구현 단계로 남아 있다.
