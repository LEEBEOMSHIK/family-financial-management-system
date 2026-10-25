# 실제 서비스 첫 실행 구현 계획

요구사항: R03/R06/R12/R14/R15/R18/R19. 사용자의 서비스 개발 착수 요청에 따른 실행 계획.

## 이번 결과

로컬에서 실행되는 Next.js + FastAPI 앱, 개발용 세션, 서버 권한 검사, API 기반 대시보드·거래 목록·관리 화면, 공통 테마. 정적 HTML 시안을 서비스로 간주하지 않는다.

FastAPI는 이번 골격의 기술 선택으로 채택한다. PostgreSQL 네이티브 설치와 운영 인증 공급자가 미설정이므로 첫 읽기 흐름은 명시적인 합성 자료 어댑터를 사용한다. 실데이터 저장이나 운영 인증 완료라고 표시하지 않는다. 실제 데이터 변경·외부 발송·송금은 제공하지 않는다. PostgreSQL을 SQLite로 대체하지 않는다.

## 파일 소유권

- backend 에이전트: `apps/api/`, `packages/contracts/openapi.json`, `docs/engineering/api-foundation-handoff.md`.
- 현재 에이전트: `apps/web/`, 생성 TypeScript 계약, 실행/브라우저 검증 스크립트, 루트 및 통합 문서.
- 독립 reviewer: 읽기 전용 검토. 구현 파일 병렬 수정 금지.

## API 계약 v0.1

금액은 부호 있는 정수 문자열. 날짜 YYYY-MM-DD. 응답은 private, no-store. 인증/정책 오류는 `{error:{code,message}}`.

- `POST /api/v1/dev/session`: `{profile:"member"|"treasurer"}`. 허용된 웹 Origin 필수. 명시적 개발 환경에서만 제공. 서버가 합성 계정의 권한을 지정하고 HttpOnly/SameSite 쿠키 발급.
- `GET /api/v1/session`: `{user:{id,display_name},family_id,capabilities:string[],csrf_token,data_mode:"synthetic"}`. 인증 없으면 401.
- `DELETE /api/v1/session`: Origin + X-CSRF-Token 검증, 세션 폐기, 204.
- 가족 ID: `00000000-0000-4000-8000-000000000001`. 모든 가족 경로는 세션의 활성 소속과 서버의 현재 역할 판정 필수.
- `GET /api/v1/families/{family_id}/dashboard?period=month|quarter`: `{family_id,data_mode:"synthetic",as_of,source,period,balance_krw,income_krw,expense_krw,net_krw,approved_commitments_krw,monthly,categories,recent_transactions}`.
- monthly 항목: `{month,income_krw,expense_krw,balance_krw}`. month는 YYYY-MM.
- categories 항목: `{label,amount_krw}`.
- 거래 항목: `{id,occurred_on,description,amount_krw,category,reconciliation_status:"reconciled"|"pending"}`. amount_krw는 입금 양수/출금 음수.
- `GET /api/v1/families/{family_id}/transactions?period=month|quarter&direction=all|income|expense`: `{items,next_cursor:null,as_of,data_mode:"synthetic"}`.
- `GET /api/v1/families/{family_id}/management`: 현재 manage 권한 필요. `{pending_approvals,missing_evidence,unreconciled_payments}`.
- capability는 `view_dashboard`, `view_transactions`, `manage` 사용. 명시적 승인·투표·원장 변경 API는 이번에 만들지 않는다.
- `GET /health`: 상태만 반환. 비밀·접속 문자열 반환 금지.

## 인수 기준

- [x] 정확 버전·라이선스·공식 근거와 잠금 파일 생성, 설치 재현.
- [x] 인증 없음·다른 가족·일반 구성원 관리 접근·만료 역할·CSRF·운영 환경 개발 인증 차단 테스트.
- [x] Next.js 실제 페이지·동일 출처 API 연결, 로딩/빈 목록/실패/권한 거부 처리.
- [x] 금액 BigInt 표시, 기간·입출금 필터, 관리 메뉴 서버 capability 사용.
- [x] 타입·lint·빌드·API 테스트·계약 생성 및 실제 브라우저 E2E.
- [x] 시작/종료 방법, 남은 P1 범위, 독립 리뷰와 인수인계 기록.

기존 파일은 초기 미커밋 상태이므로 현재 작업 공간에서 보존하며 진행한다. 이번 요청에 운영 배포·외부 발송·Git push는 포함하지 않는다.

검증과 미완료 제품 범위: [인수인계](../engineering/service-foundation-handoff.md). 체크는 이번 첫 실행 범위에 한정한다. 깨끗한 별도 OS의 재현 설치는 미검증이다.
