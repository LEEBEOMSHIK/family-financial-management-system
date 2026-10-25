# 개발 규칙

## 변경 단위

이슈에 요구사항 ID·인수 기준·데이터/권한 영향을 연결하고 작은 기능 단위로 변경한다. 브랜치명은 `feat/<issue>-<topic>`, `fix/<issue>-<topic>`, `docs/<topic>` 제안. 커밋은 `feat:`, `fix:`, `docs:`, `test:`, `refactor:` 접두어와 구체적인 결과를 쓴다. 도구·조직의 기존 규칙이 있으면 합의하여 맞춘다.

## TypeScript / Next.js

- strict, noUncheckedIndexedAccess, unknown 입력 검증. `any`, `@ts-ignore`, 전역 lint 예외는 사유/범위를 남긴다.
- Server Component를 기본으로, 상태/이벤트가 필요한 작은 부분만 Client Component. 클라이언트로 전달하는 props에도 민감정보를 넣지 않는다.
- 금융 데이터는 공유 캐시 금지. 사용자 캐시가 필요한 경우 scope와 철회 전략을 먼저 설계한다.
- 화면에서 금액 합산을 권위 값으로 만들지 않는다. 표시용 formatting만 수행하고 API 문자열은 BigInt로 읽는다.
- CSS의 의미 토큰을 사용한다. 새 색상/간격/상태를 임의 하드코딩하지 않고 디자인 문서와 함께 추가한다.
- 라우트·복잡한 dialog·표는 키보드/스크린리더를 실제 확인한다. 스타일 변경의 스냅샷만으로 접근성을 판단하지 않는다.

## Python / API

- 경계는 검증된 schema, 내부는 명시 타입. router는 권한/입력/서비스 호출/응답 변환 중심으로 작게 유지한다.
- 도메인 함수에 HTTP Request/SDK/ORM 세션을 불필요하게 넘기지 않는다. 시간·외부 서비스는 주입 가능한 port로 둔다.
- 금액은 int, 날짜는 date, 사건은 timezone-aware datetime. naive datetime과 float 금액은 경계에서 거부한다.
- 사용자별 object authorization은 모든 read/write/export/download/search 경로에 적용한다.
- 성공 상태 전이와 감사/outbox는 같은 트랜잭션. 외부 네트워크 호출은 커밋 후 worker에서 수행한다.
- 오류 코드는 계약에 등록하고 한국어 문구는 사용자 행동을 설명한다. stack trace는 사용자에게 보내지 않는다.

## DB / 데이터 이관

마이그레이션 도구는 Alembic 후보. 스키마 변경에는 빈 DB/직전 버전 업그레이드, 제약·인덱스, rollback 가능 여부를 기록한다. 운영은 expand→backfill→switch→contract 순서 제안. 데이터 손실 가능 downgrade를 자동 실행하지 않는다. 보정 작업은 드라이런 합계/대상 수/표본과 승인·복구 기준을 남긴다.

## API / 계약

OpenAPI와 생성 타입 변경을 같은 PR에 포함한다. breaking change는 소비자·이관·호환 기간을 명시한다. HTTP status, idempotency, optimistic version, 페이지 필터 의미를 문서화한다. 내부 UI 전용 API도 권한을 생략하지 않는다.

## 테스트

금액·상태·날짜·권한 같은 불변식은 실패 사례부터 정의한다. 순수 도메인 단위 테스트, 실제 PostgreSQL 통합 테스트, 주요 화면 E2E를 구분한다. 합성 자료와 고정 시계로 재현하고 임의 sleep 의존을 줄인다. API/은행/알림 adapter는 공통 계약 테스트를 적용한다. 낮은 위험의 단순 문서·토큰 변경에는 문법·링크·대비·시각 점검을 사용한다.

## 리뷰와 문서

PR은 ‘무엇이 불편했고 이제 어떻게 바뀌는지’, 검증 증거, 미확정/위험을 간결히 설명한다. 권한/금액/증빙/송금 상태 변경은 독립 검토를 받는다. 구현자 자신의 검토는 독립 리뷰로 표시하지 않는다. 동작과 문서를 함께 수정하고 설계 선택은 ADR에 남긴다.
