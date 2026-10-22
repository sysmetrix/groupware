# ego lite 작업 공간 소실 — 2026-10-23 재현 기록

그룹웨어 로그인이나 API 응답에 도달하기 전 브라우저 제어 도구가 실패했다. 사용자에게 재로그인을 반복 요청하거나 API 경로를 추측할 근거가 아니다.

- Windows, ego-browser 0.6.0.16 / Chromium 154.0.8037.44 / 내장 Node 24.21.0
- CLI의 active_version_dir 연결 대상과 설치된 버전 디렉터리가 일치함.
- 공식 `ego-browser upgrade` 결과: `Update failed (error 9).` 프로세스 종료 코드는 0이었지만 업데이트 성공이 아님.
- 사용자가 완전 종료·재시작과 로그인 완료, 새 작업 공간 재개를 명시적으로 확인함.
- 새 공간 핸들 `spaceId: 2`는 반환됐으나 같은 `.mjs` 호출 안의 첫 `page.goto()`에서 `Task space does not exist` 발생.
- 이전에는 다음 호출의 동일 공간 재개 시 같은 오류가 발생했음. 이번 재현은 프로세스 사이 수명 문제만으로 설명할 수 없음을 보여줌.

재현에 사용한 API 순서:

```javascript
const task = await taskSpace('authorized-task-name');
console.log({spaceId: task.spaceId});
const page = task.page('p1');
await page.goto(targetUrl);
console.log(await page.snapshot());
```

실제 결과는 공간 ID 반환 뒤 이동 실패. 기대 결과는 같은 핸들의 첫 페이지로 이동하여 스냅샷을 읽는 것. 개인 프로필·쿠키·비밀번호·토큰은 이 진단에서 읽거나 수정하지 않았다. 내부 사이트 URL과 계정 정보는 이 공개 기록에서 제외했다.

브라우저 가이드의 공간 복구 및 제어 중단 규칙에 따라 더 이상 공간 생성이나 다른 도구를 통한 제어 우회를 하지 않았다. 원인이 수정된 브라우저 버전에서 사용자 재개 확인 후 위 시나리오가 유지되는지 검증해야 한다. 이 문서는 전달용 재현 기록이며 공급사에 자동 전송하거나 이슈를 게시하지 않았다.
