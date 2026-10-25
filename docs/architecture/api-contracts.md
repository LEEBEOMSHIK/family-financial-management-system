# API 계약 초안

상태: 설계 계약. 아직 실행 중인 API/OpenAPI가 아니다. P1에서 FastAPI 스키마를 단일 원본으로 생성하고 `packages/contracts/openapi.json`과 TypeScript 타입을 함께 검증한다.

## 공통 규약

- 경로 `/api/v1/families/{family_id}/...`; 인증 세션 및 서버 membership 검증. UUID가 비밀은 아니다.
- 날짜 `YYYY-MM-DD`, 사건 시각 ISO-8601 offset(응답 UTC `Z`), 금액 10진 문자열, 통화 `KRW`.
- 목록 `items`, `next_cursor`, `as_of`. limit 기본 50, 최대 200 제안. cursor는 필터/가족/정렬에 결합하여 검증한다.
- 변경 POST에는 `Idempotency-Key`. 저장 범위는 actor+family+operation+key, 같은 키 다른 본문은 409. 임계 업무의 최종 고유 제약은 키 만료 후에도 유지한다.
- 수정/상태 전이에는 `If-Match`(entity version 기반 ETag); 없음 428, 불일치 412. 상태 충돌 409, 필드 검증 422.
- `X-Request-ID`는 서버 생성 또는 형식 검증. 비공개 응답 `private, no-store`. 오류도 민감정보를 포함하지 않는다.

## 엔드포인트

| method / path(가족 경로 이하) | 주체·조건 | 핵심 결과 |
| --- | --- | --- |
| GET `/me/capabilities` | 활성 구성원 | 현재 액션별 허용과 정책 버전; UI 참고용 |
| GET `/accounts/{id}/balances` | 계좌 조회 권한 | source/as_of/coverage가 있는 잔액 |
| GET `/transactions` | 조회 범위 | 정규 거래, 분류·대사 상태 |
| POST `/imports` | 총무 | 202 staging job; multipart file |
| GET `/imports/{id}` | 해당 가족 총무/감사 범위 | 오류행/중복 후보/합계/검토 상태 |
| POST `/imports/{id}/commit` | 현직 총무, 검토 완료 | 확정 건수, 이미 확정이면 같은 결과 |
| POST `/exports` | 범위별 내보내기 권한 | 202 job; 다운로드 시 재인가 |
| GET `/exports/{id}/download` | 현재 권한 재확인 | 제한된 파일 스트림/짧은 수명 URL |
| GET `/dues` | 자기/총무/감사 범위 | 부과·납부·미배분·정책 버전 |
| POST `/dues/assessments` | 규정에서 위임, 정책 configured | 부과 집합; 동일 대상·기본 의무·기간의 중복 거부 |
| POST `/expenses` | 활성 구성원 | draft |
| POST `/expenses/{id}/submit` | 요청자, 내용/증빙 조건 | submitted/revision |
| POST `/expenses/{id}/decisions` | eligible approver, 정책 configured | 승인/반려 결정, 정책/승인 스냅샷 |
| POST `/payment-intents/{id}/records` | 현직 총무, approved+scheduled | 수동 송금 기록, reported_paid; 은행 호출 없음 |
| POST `/payment-records/{id}/matches` | 대사 capability | 은행 거래 연결, 상태/배분 검사 |
| POST `/ledger/{id}/corrections` | 정정 capability | 반대/새 원장 ID와 사유 |
| POST `/evidence` | 대상 객체 접근/업로드 권한 | quarantined 파일 ID; scan 완료 전 열람 불가 |
| GET `/evidence/{id}/download` | 객체+파일 권한 | 원본 또는 안전 미리보기; 감사 기록 |
| GET, POST `/events` | 조회/일정 편집 권한 분리 | 행사와 occurrence |
| PATCH `/occurrences/{id}` | 일정 편집 위임 | revision 증가, 이전 알림 무효화 |
| GET `/notifications` | 현직 총무/자기 수신 범위 | 접수/배달/실패/미연결 상태 |
| POST `/ballots`, `/ballots/{id}/votes` | 개설 권한 / 유권자 | 규정 검증된 개설 / 중복 투표 통제 |
| GET, POST `/audit-findings` | 감사 조회/작성 범위 | 원장과 분리된 감사 의견 |
| POST `/search/structured` | 조회 capability | 허용 query_id와 typed parameters의 결과/근거 |
| POST `/search/documents` | ACL 적용 | 답변·문서버전/위치 인용·근거 부족 상태 |

## 수동 송금 기록 요청 예시

```json
{
  "amount_krw": "150000",
  "paid_at": "2026-10-24T11:30:00+09:00",
  "evidence_id": "00000000-0000-4000-8000-000000000001",
  "note": "합성 예시: 은행 앱에서 처리한 내역을 기록"
}
```

서버가 지급 금액/승인본/수취인·증빙 연결을 검증한다. 수취인 계좌를 변경하는 요청 필드는 받지 않는다. 부분 송금 허용이 미설정이면 부분 기록을 차단한다. 성공 응답은 `status=reported_paid`, `reconciliation_status=pending`이다.

## 오류 형식과 화면 매핑

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "다른 사용자가 이 내용을 변경했습니다. 최신 내용을 확인해 주세요.",
    "field_errors": [],
    "request_id": "example-request-id",
    "retryable": false
  }
}
```

| code | HTTP | 한국어 행동 안내 |
| --- | --- | --- |
| AUTH_REQUIRED | 401 | 다시 로그인해 주세요. 입력 내용은 재로그인 후 확인해 주세요. |
| FORBIDDEN | 403 | 이 작업을 처리할 권한이 없습니다. |
| NOT_FOUND | 404 | 요청한 항목을 찾을 수 없습니다. |
| POLICY_NOT_CONFIGURED | 409 | 운영규정 설정을 확인한 뒤 진행할 수 있습니다. |
| STATE_CONFLICT | 409 | 현재 상태에서 이 작업을 처리할 수 없습니다. 최신 상태를 확인해 주세요. |
| IDEMPOTENCY_CONFLICT | 409 | 같은 요청 번호로 다른 내용이 제출되었습니다. |
| VERSION_CONFLICT | 412 | 최신 내용을 확인한 뒤 다시 진행해 주세요. |
| PRECONDITION_REQUIRED | 428 | 최신 내용을 불러온 뒤 다시 진행해 주세요. |
| VALIDATION_ERROR | 422 | 해당 입력란 가까이에 수정 방법 표시 |
| CAPABILITY_UNAVAILABLE | 503 | 현재 조회 연결을 사용할 수 없습니다. 마지막 확인 시점을 표시합니다. |
| RATE_LIMITED | 429 | 잠시 후 다시 시도해 주세요. Retry-After에 따른 재시도 |

네트워크 단절 후 변경 요청은 상태를 조회하거나 같은 idempotency key로 확인한다. 새 key로 자동 재송신하지 않는다. 사용자의 원문 입력·DB 오류·토큰·파일 저장 경로를 에러 응답에 노출하지 않는다.
