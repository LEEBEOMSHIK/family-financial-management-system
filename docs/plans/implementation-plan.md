# 가족 공동통장 시스템 Implementation Plan

> For agentic workers: 적용 가능한 환경에서는 superpowers:executing-plans 또는 승인된 subagent-driven-development 절차를 사용한다. 해당 스킬이 없는 도구는 AGENTS.md와 docs/engineering/workflow.md의 동일한 작업·검증·인수 절차를 따른다. 이 문서는 향후 구현 계획이며 지금 완료된 제품 기능 목록이 아니다.

**Goal:** 규정에 따라 가족 회계·승인·증빙·일정·알림·검색을 운영하고 감사할 수 있는 웹 시스템.

**Architecture:** Next.js + Python 모듈형 백엔드, 별도 durable worker, PostgreSQL 제안. 수동 송금과 은행 거래 대사를 분리하며 파일 기반 경로로 시작한다.

**Tech Stack:** Next.js + TypeScript / Python 확정. FastAPI·PostgreSQL·추가 도구 및 버전은 채택 전 검증.

**Spec:** [요구사항](../requirements/requirements.md), [시스템 설계](../architecture/system-design.md), [데이터 설계](../architecture/domain-and-data.md), [디자인 시스템](../design/design-system.md).

## Global Constraints

- 송금은 현직 총무가 은행 앱에서 직접 수행한다. 시스템은 송금 실행 API를 제공하지 않는다.
- 로컬은 Docker 없이, 운영 배포에만 Docker를 사용한다.
- 업무 규정의 미확정 값을 추측하지 않는다. 실제 데이터의 정책 의존 변경은 차단한다.
- 금액은 KRW 정수, API는 10진 문자열, 업무일은 Asia/Seoul 날짜, 사건은 UTC.
- 은행 API·공식 카카오 발송·LLM 외부 전송은 검증 전 비활성이다.
- 모든 경로에서 가족/객체 권한·감사 이력·근거를 유지한다.

## Review Focus

1. 기간이 겹치는 파일과 동일 시각·금액의 정상 두 거래를 구별한다 → P2/T04,T05.
2. 총무 교체가 세션 캐시/예약 큐/재시도 중 발생해도 현직자만 처리한다 → P1/T03, P4/T14.
3. 외부 발송 성공 후 timeout은 unknown이며 자동 중복 발송하지 않는다 → P4/T16.
4. 송금 보고와 은행 대사가 현금 원장을 두 번 차감하지 않는다 → P3/T09.
5. 권한 철회 뒤 색인/캐시가 남아도 RAG·export가 노출하지 않는다 → P5/T21, P2/T02.

## 적용 단계 개요

| 단계 | 결과 | 선행·결정 | 책임 |
| --- | --- | --- | --- |
| P0 근거/결정 | 규정 매핑·의존성 채택·외부 연동 조사 | 원문/책임자 | product/architecture/security |
| P1 기반 | 인증·권한·DB·디자인 적용 골격 | U05 및 기술 ADR | BE/FE/DB/design |
| P2 회계 | 파일 가져오기·원장·잔액·회비·내보내기 | P1, U01/U03 | DB/BE/FE |
| P3 지출 | 요청·승인·증빙·송금 기록·대사 | P2, U06 | BE/FE/security |
| P4 일정/알림 | 연간 일정·세 날짜·현직 총무·발송 이력 | P3, U08; 카카오 U04 | BE/operations |
| P5 감사/투표/검색 | 감사·정책 기반 투표·정형/RAG | P2/P3, U06/U07 | BE/AI/QA |
| P6 운영 | 실제 통합 검수·복구·Docker 배포 | 제품 DoD, 운영 승인 | operations/security/QA |

P0의 은행/카카오 조사와 P1의 합성 데이터 골격은 병행 가능하다. 예상 기간은 팀 규모·규정 확인·심사 일정 없이는 약속하지 않는다. 단계마다 합성 데모를 보여 주고 범위를 검수한다.

## P0 — 근거와 선택 고정

Files: `docs/requirements/regulation-mapping.md`, `config/business-policy.example.json`, `docs/adr/`, `docs/engineering/dependencies.md`.

Interfaces: 원문 메타데이터→`policy_version`; 실제 계약 검증→은행/카카오 capability; 채택 패키지→정확 버전 잠금 파일.

- [ ] 규정 원문 hash/버전/효력일을 기록하고 모든 null 정책의 조항/결정 책임을 매핑한다.
- [ ] 일반 구성원/총무/감사/승인자의 권한과 경계 예시를 확정한다. 미결정 기능은 비활성 범위를 유지한다.
- [ ] 실제 카카오뱅크 거래 파일의 합성/비식별 샘플로 열·시간대·잔액 의미를 조사한다. 아직 없는 은행 API를 구현한 것처럼 만들지 않는다.
- [ ] 은행/카카오 계약·자격·동의·템플릿·쿼터의 확인 근거를 기록한다.
- [ ] 의존성 후보의 버전·라이선스·지원 OS·보안 상태를 검증하고 accepted ADR로 전환한다.
- [ ] `python scripts/validate_foundation.py`를 실행하고 원문/결정 체크리스트를 인수한다.

Exit: 미확정 조건과 차단 기능이 분명하고 P1을 합성 자료로 구현할 수 있다. 실제 정책 활성화는 별도 조건이다.

## P1 — 인증·권한·디자인 기반

Create: `apps/api/src/family_ledger/main.py`, `auth/service.py`, `authorization/service.py`, `apps/api/migrations/`, `apps/worker/src/family_ledger_worker/main.py`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/(authenticated)/layout.tsx`, `packages/contracts/openapi.json`.
Test: `apps/api/tests/integration/test_authorization.py`, `apps/web/tests/accessibility.spec.ts`.

Interfaces: `authorize(actor: ActorContext, action: str, resource: ResourceRef, now: datetime) -> Decision`; `ActorContext`는 user_id, family_id, membership_id, authoritative role revision을 갖는다. 이 context는 브라우저 body가 아닌 서버 세션에서 만든다. OpenAPI v1 계약은 frontend 타입의 원본이다.

- [ ] T01/T02/T03의 미설정 정책·다른 가족·임기 경계 거부 테스트를 작성하고 실패를 확인한다.
- [ ] 네이티브 PostgreSQL과 선택한 인증 제공자를 연결하고 세션/CSRF/초대/로그아웃·revocation을 구현한다.
- [ ] 가족 FK·역할 기간·요청별 인가·감사 기록을 구현한다. 개발 인증 우회는 운영에서 시작 실패하도록 한다.
- [ ] Next.js layout에 토큰을 적용하고 320px/키보드/확대·Button/Money/StatusBadge 상태를 검증한다.
- [ ] 타입·lint·권한 통합 테스트와 접근성 E2E를 실행하고 OpenAPI/type 차이가 없는지 확인한다.
- [ ] 독립 리뷰 후 골격의 실행 방법과 인수 결과를 기록한다.

Run(after scripts exist): API 루트 `python -m pytest tests/integration/test_authorization.py -q`; 웹 루트 `npm run typecheck`, `npm run lint`, `npm run test:e2e -- accessibility.spec.ts`. Expected: 모든 지정 사례 통과, 다른 가족/만료 역할 반환 0.

## P2 — 파일 기반 원장·잔액·회비

Create: `apps/api/src/family_ledger/imports/service.py`, `banking/ports.py`, `banking/adapters/statement.py`, `ledger/service.py`, `dues/service.py`, `exports/service.py`, `apps/web/src/app/(authenticated)/ledger/page.tsx`, `imports/page.tsx`, `dues/page.tsx`.
Test: `apps/api/tests/integration/test_import_ledger.py`, `test_dues_allocation.py`, `test_export_authorization.py`.

Interfaces: `stage_statement(actor, file_ref, mapping_version) -> ImportPreview`; `commit_import(actor, batch_id, expected_version, idempotency_key) -> ImportResult`; `allocate_dues(actor, transaction_id, assessment_id, amount_krw: int) -> Allocation`.

- [ ] T04/T05/T06/T23/T26/T27과 export 권한 철회 테스트를 실패 상태로 작성한다. 정책 v1→v2 재부과가 새 기본 의무를 만들지 않고 조정에만 연결되는지 검증한다.
- [ ] 파일 검사→매핑→미리보기→확정과 중복 후보 수동 판단을 구현한다. 파서 지원 서식을 문서에 한정한다.
- [ ] 현금 원장·opening balance·coverage·분류·정정·회비 배분을 트랜잭션/잠금으로 구현한다.
- [ ] 회비 정책 미설정 시 부과를 거부하고 합성 정책으로 부분/초과 납부를 검증한다.
- [ ] XLSX/CSV 내보내기의 수식 안전 처리, 마스킹, 생성/다운로드 재인가를 구현한다.
- [ ] 해당 integration tests와 대시보드/원장 E2E를 실행한다. 합계·중복·큰 정수 결과를 인수한다.

Run: `python -m pytest tests/integration/test_import_ledger.py tests/integration/test_dues_allocation.py tests/integration/test_export_authorization.py -q`. Expected: 같은 파일 재확정 후 집계 불변, 같은 값 정상 거래 2건 유지, 대량 다운로드 권한 철회 차단.

## P3 — 지출·증빙·송금 기록·대사

Create: `apps/api/src/family_ledger/expenses/service.py`, `evidence/service.py`, `payments/service.py`, `apps/web/src/app/(authenticated)/expenses/[id]/page.tsx`.
Test: `apps/api/tests/integration/test_expense_payment.py`, `test_evidence_security.py`.

Interfaces: `decide_expense(actor, expense_id, revision, decision, idempotency_key) -> ExpenseState`; `record_payment(actor, intent_id, paid_at, amount_krw, evidence_id, expected_version, idempotency_key) -> PaymentRecord`; `match_payment(actor, record_id, transaction_id, amount_krw) -> Match`.

- [ ] T07/T08/T09/T10/T11/T28 및 승인자 부재·자기 승인 정책 테스트를 작성하고 실패 확인한다. 승인 개정 시 기존 지급/알림의 원자적 무효화를 검증한다.
- [ ] 승인본 hash와 revision, 증빙 격리/스캔/원본/개정, 권한 있는 다운로드를 구현한다.
- [ ] 수동 송금 기록과 대사 상태를 분리하고 원장 이중 생성 차단을 구현한다.
- [ ] 요청→승인→은행 앱 외부 처리→송금 기록→파일 대사 흐름을 합성 E2E로 확인한다.
- [ ] 통합 테스트, 감사/보안 독립 리뷰, 사용자 문구를 인수한다.

Run: `python -m pytest tests/integration/test_expense_payment.py tests/integration/test_evidence_security.py -q`. Expected: 대사 시 추가 출금 0, 금액 변경본에 이전 승인 적용 0, 악성 파일 공개 0.

## P4 — 일정과 알림

Create: `apps/api/src/family_ledger/scheduling/service.py`, `notifications/ports.py`, `notifications/planner.py`, `apps/worker/src/family_ledger_worker/notifications.py`, `apps/web/src/app/(authenticated)/schedule/page.tsx`.
Test: `apps/api/tests/integration/test_notifications.py`.

Interfaces: `plan_due_notifications(now_utc: datetime) -> list[NotificationEvent]`; `dispatch_event(event_id, now_utc) -> DeliveryOutcome`; `DeliveryOutcome`은 accepted/delivered/failed/unknown/blocked_recipient를 구분한다. NotificationPort에 send 및 지원 시 lookup 기능을 둔다.

- [ ] 고정 시계로 T12~T18 및 T29를 작성하고 실패를 확인한다. accepted/unknown 상태에서 revision·수신자가 바뀌어도 같은 delivery_slot의 새 발송을 차단하는지 검증한다.
- [ ] occurrence/revision, outbox+lease, 발송 직전 현직자·지급 상태 확인, retry/unknown을 구현한다.
- [ ] sink로 검증한다. 두 worker가 같은 event를 처리하는 경우와 재시작 후 claim 만료 복구를 검증한다.
- [ ] U04 완료 시에만 공식 제공자 adapter를 연결하고 승인된 테스트 수신자/템플릿으로 실제 접수/수신을 검증한다.
- [ ] 카카오가 미승인이라면 웹 내부 알림만 검수하고 ‘카카오 미완료’를 명시한다.

Run: `python -m pytest tests/integration/test_notifications.py -q`. Expected: 정확한 세 날짜, D+2 반복 0, 전임자 신규 발송 0, unknown 무조건 재전송 0.

## P5 — 감사·투표·AI 검색

Create: `apps/api/src/family_ledger/audit/service.py`, `voting/service.py`, `search/catalog.py`, `search/structured.py`, `search/documents.py`, `apps/web/src/app/(authenticated)/audit/page.tsx`, `votes/page.tsx`, `search/page.tsx`.
Test: `apps/api/tests/integration/test_voting.py`, `test_search_acl.py`, `tests/evaluation/search_cases.json`.

Interfaces: `cast_vote(actor, ballot_id, option_id, expected_version) -> VoteReceipt`; `run_query(actor, query_id, parameters) -> StructuredResult`; `answer_documents(actor, question, as_of) -> GroundedAnswer` with citations(source_id, version, locator).

- [ ] 규정별 투표 경계 T19와 AI T20~T22·근거 없음·상충 버전 평가집을 먼저 정의한다.
- [ ] 감사 의견/답변과 원장 편집을 분리하고 투표 snapshot·중복·마감·집계를 구현한다. 비밀 투표는 확정된 프라이버시 설계가 있어야 활성화한다.
- [ ] 허용 query catalog를 읽기 전용 DB로 구현하고 UI 필터에서도 동일 함수를 사용한다.
- [ ] ACL 선필터·인용 위치·tombstone/캐시 철회가 있는 문서 검색을 구현한다. 외부 모델 채택 전 실제 자료 전송은 차단한다.
- [ ] 정형 금액 fixture 100%, 권한 누출 0, 인용 검증과 철회 즉시 차단을 통과시킨다.

Run: `python -m pytest tests/integration/test_voting.py tests/integration/test_search_acl.py -q`; 평가 실행기는 QA/AI가 명세와 함께 구현 후 실행 결과를 남긴다. 아직 없는 평가 명령을 실행 완료라고 쓰지 않는다.

## P6 — 운영 준비와 인수

Create: `deploy/production/Dockerfile.web`, `Dockerfile.api`, `compose.yml`(배포 환경에 따라 채택), 운영 환경 비밀 주입 구성, CI workflow.
Test: `tests/e2e/family-flow.spec.ts`, `tests/operations/restore-checklist.md`.

Interfaces: 고정 이미지/잠금 파일, readiness, DB migration version, backup manifest, 알림/은행 feature flags.

- [ ] 로컬 네이티브 clean setup과 전체 DoD 검증을 수행한다.
- [ ] 운영 Docker 이미지 build/보안 검사와 실제 배포 환경 staging smoke를 수행한다.
- [ ] T25 복원과 역할/키 교체, unknown 발송 정리, 데이터 정정 절차를 연습한다.
- [ ] 총무·감사의 합성 업무 검수 후 운영 데이터 도입·발송의 구체적 준비 결과를 책임자가 검토한다.
- [ ] 권한 있는 운영 적용 후 지표를 관찰하고 인수인계 문서를 확정한다.

Expected: 전체 필수 시나리오 통과, 미검증 기능 명시적 비활성, 복구 합계/증빙 hash 일치. 단순 Docker build 성공만으로 운영 완료라고 판정하지 않는다.

## P1 디자인 선행 작업 보완 — R19

공통 디자인 시안 검토 후 다음 작업을 P1에 포함한다. 이 목록은 구현 완료 표시가 아니다.

- [ ] design: 브랜드 핑크/블루/노랑의 제한된 사용 범위와 라이트/다크 의미 토큰 정의. 노랑 #F2C75C는 제안값.
- [ ] frontend: 공통 레이아웃·컴포넌트에 시스템/라이트/다크 선택과 설정 기억 적용. 저장 실패·초기 테마 불일치 처리.
- [ ] qa: PC/모바일 양 테마, 기간별 차트·표·입력·상태·포커스·접근성 검증.
- [ ] review: 구현 담당과 별도로 요구사항과 실제 실행 증거 검토.

파일 소유권: design은 docs/design 및 토큰 정의, frontend는 앱 레이아웃·컴포넌트와 테마 동작을 담당한다. 토큰 CSS는 design 인수 전후에 순차 편집하며 동시 수정하지 않는다. QA와 review는 구현 파일을 병렬 수정하지 않고 검증 결과와 수정 요청을 인수인계한다. 전체 역할을 동시에 실행하는 자동 설정은 아니다.
