# 도메인·데이터·상태 전이

상태: PROPOSED. 규정 해석을 포함하는 세부 규칙은 원문 대조 후 채택한다.

## 공통 저장 규칙

업무 엔터티는 UUID `id`, `family_id`, `created_at`, `created_by`를 가진다. 변경 가능한 엔터티에는 `version`을 둔다. 가족 소속 참조는 `(family_id, id)` 고유 키와 복합 FK로 다른 가족의 레코드 연결을 차단한다. API에서 받은 family_id를 신뢰하지 않는다.

금액은 원 단위 BIGINT. API는 `"150000"` 같은 10진 문자열. 수입/출금은 `direction`과 양수 `amount_krw`로 표현하고 계산할 때만 부호를 적용한다. 날짜/시간대가 불분명한 은행 행은 자동 추정하지 않고 검토 대상으로 보낸다.

## 핵심 엔터티

| 묶음 | 테이블과 필수 필드 | 제약/설명 |
| --- | --- | --- |
| 가족 | family; person; membership(person_id, status, joined_at, left_at) | 로그인 사용자와 가족 구성원을 구분; 비로그인/미성년 구성원은 정책 검토 |
| 가구 | household; household_membership(valid_from, valid_to) | 가구별 회비/투표가 확정될 때 사용; 현재 가구로 과거 부과를 재계산하지 않음 |
| 역할 | role_assignment(member_id, role, valid_from, valid_to, appointment_ref) | `[from,to)`; 종료는 exclusive; 임명·철회 이력 보존 |
| 규정 | policy_version(document_hash, source_ref, effective_from, status, config) | confirmed 버전만 실제 업무에 적용; 기존 버전 불변 |
| 회비 | dues_assessment(subject_type, subject_id, period, obligation_key, amount_krw, due_date, policy_version, adjusts_assessment_id?) | 기본 의무는 `(family,subject,period,obligation_key)` unique; policy_version은 식별키에서 제외; 감액/추가 부과는 기존 부과에 연결된 조정 기록 |
| 납부 | dues_allocation(bank_transaction_id, assessment_id, amount_krw) | 한 입금의 배분 합 ≤ 입금액, 한 의무에 부분 납부 가능; 초과분은 미배분금 |
| 지출 | expense_request(requester_id, amount_krw, payee_ref, purpose, status, policy_version, version) | 승인된 금액·수취인·목적 해시 고정 |
| 승인 | approval_step(request_id, revision, step, eligible_rule); approval_decision(actor_id, decision, comment, decided_at) | `(step,actor)` 중복 방지; 개정마다 새 승인 집합 |
| 지급 | payment_intent(expense_id, approval_revision, obligation_id, supersedes_intent_id?, occurrence_id?, due_date, amount_krw, status, schedule_revision) | 승인본 revision에 결합; obligation_id는 개정 간 동일 지급 의무를 식별; 승인 후 생성, 활성 지급합 ≤ 해당 승인액; 분할 허용은 정책 결정 |
| 송금 기록 | payment_record(intent_id, recorder_id, paid_at, amount_krw, evidence_id, status) | 총무 수동 기록; 원장 출금과 동일 개념이 아님 |
| 대사 | payment_match(payment_record_id, bank_transaction_id, amount_krw, confirmed_by) | 레코드/은행 거래의 대사합 각각 한도 이내; 취소도 이력으로 기록 |
| 계좌 | bank_account(provider, masked_number, encrypted_identifier, owner_ref) | 완전한 계좌정보 접근 최소화; 암호키와 DB 분리 |
| 수집 | import_batch(file_hash, mapping_version, coverage, status); import_row(row_no, raw_hash, normalized, errors, decision) | 같은 파일은 같은 배치 반환; 원본은 비공개 저장 |
| 은행 거래 | bank_transaction(account_id, provider_tx_id?, occurred_at, direction, amount_krw, reported_balance?, source, raw_ref) | 외부 거래와 회계 분류 분리; provider ID가 있으면 계좌 범위 unique |
| 현금 원장 | ledger_entry(bank_transaction_id?, kind, signed_amount_krw, category_id, posted_at, reversal_of?, correction_group_id?) | 현금 수입/지출 원장 제안; 복식부기 인증을 주장하지 않음 |
| 잔액 | balance_observation(account_id, amount_krw, as_of, source, coverage) | API 잔액/파일 말잔/수동 확인을 구분; 덮어쓰기 대신 관측 추가 |
| 증빙 | evidence(original_key, sha256, mime, size, uploader, scan_status); evidence_version(parent_id, supersedes_id?, purpose) | 원본 불변; 연결 유형은 명시 FK 또는 검증된 링크 서비스 |
| 일정 | annual_event(year, title); event_occurrence(event_id, event_date, payment_due_date, revision, status) | 행사일 ≠ 송금일; 반복을 실제 occurrence로 전개하고 개별 예외 지원 |
| 알림 | notification_event(intent_id, schedule_revision, offset_day, scheduled_for, state); delivery_slot(obligation_id, local_date, offset_day, channel); delivery_attempt(event_id, slot_id, recipient_assignment_id, provider_id?, state) | revision별 이벤트와 개정 간 공유 slot을 분리; accepted/delivered/unknown 슬롯은 새 이벤트·수신자에서도 재발송 차단 |
| 투표 | ballot(policy_version, opens_at, closes_at, visibility_mode); electorate_snapshot(subject_id, eligibility); vote(ballot_id, voter_subject_id, option) | unique `(ballot,voter_subject)`; 비밀/공개·재투표 규칙 U06 |
| 감사 | audit_event(actor, effective_role, action, object_ref, timestamp, request_id, policy_version, redacted_diff); audit_finding(target, severity, response, resolved_at) | 감사 의견과 변경 이벤트 분리; 원장 편집 권한을 부여하지 않음 |
| 검색 | document_version(source_ref, version, sha256, classification); chunk(version_id, locator, text_ref, acl_version, index_state) | 정책 문서/회의록/증빙은 서로 다른 공개 범위 |
| 기반 | outbox_event; idempotency_record; session; invite; access_revocation | 만료/고유키/삭제와 보존의 경계를 보안 문서에 정의 |

## 지출·송금 상태

`draft → submitted → approved | rejected | changes_requested`; changes_requested는 새 revision의 draft로 돌아간다. 제출자가 제출 전/승인 전 취소할 수 있는지는 규정에 매핑한다. approved 상태에서 금액·수취인·목적을 고치면 기존 승인을 무효 표시하고 새 revision을 승인받는다. 송금 기록 이후에는 취소 대신 반환/정정 절차를 사용한다.

승인된 지급의 상태는 `scheduled → reported_paid → reconciled`이다. scheduled만 송금 알림 대상이다. reported_paid는 총무가 은행 앱에서 송금했다고 기록했으나 은행 거래와 대사되지 않은 상태다. ‘송금 기록됨 · 대사 필요’로 표시하며 ‘은행 확인 완료’라고 하지 않는다. 보고가 잘못됐으면 감사 이력을 남겨 void하고 scheduled로 되돌린다. 동시에 처리된 보고/알림은 버전과 잠금으로 검증한다.

**미처리 제안 정의:** 예정일 기준 승인되어 있고 취소되지 않았으며 유효한 payment_record가 없는 지급. reported_paid 뒤에는 송금 독촉을 멈추고 별도 ‘대사 필요’ 목록에 남긴다. 이것은 알림 세부 정책 제안이며 U08 확인 대상이다.

승인 개정과 지급의 결합: 금액·수취인·목적을 바꾸기 전 같은 expense를 잠그고 유효 payment_record가 없는지 확인한다. 보고된 송금이 있으면 원본을 재작성하지 않고 별도 정정/추가 지출 절차를 사용한다. 미지급 상태의 개정은 같은 트랜잭션에서 구 approval_revision을 무효화하고 해당 scheduled intent를 superseded로 전환하며 미발송 notification_event를 취소한다. 재승인 후에는 새 approval_revision의 intent를 만들되 같은 obligation_id와 supersedes_intent_id를 유지한다. obligation마다 활성 intent는 하나만 허용한다. worker와 수동 송금 기록 서비스는 intent의 approval_revision이 현재 유효한 승인본인지 다시 검사한다.

기본 회비 의무의 obligation_key는 부과 규칙의 안정적인 식별자다. 기본 행은 adjusts_assessment_id가 null인 행에 한해 `(family_id, subject_type, subject_id, period, obligation_key)` partial unique를 적용한다. 조정 행은 원부과를 참조하고 별도의 idempotency/operation key로 재실행 중복을 막는다. 같은 대상·기간·기본 의무를 정책 v1→v2 변경만으로 다시 생성하지 않는다. 규정 변경에 따른 차액은 원부과를 참조하는 조정으로 기록하고, 소급 적용 여부는 승인된 규정 변경 결정에 따른다.

## 원장과 대사 불변식

1. 은행에서 가져와 확정한 실제 거래를 한 번만 현금 원장에 반영한다. 지출 승인이나 payment_record 생성은 현금 원장을 만들지 않는다.
2. 은행 거래와 지급 기록을 연결할 때 추가 출금 원장을 만들지 않는다. 여러 지급이 한 거래에 대응하면 배분합을 검사한다.
3. 최초 잔액은 증빙·기준일을 갖는 별도 opening entry이다. 해당 기준일 이후의 거래만 누적하여 계산한다. 기간 누락이 있으면 ‘잔액 검증 불가’로 표시한다.
4. 분류 전 거래도 미분류 수입/지출로 원장에 포함한다. 회비/행사비 분류는 현금 흐름을 추가하지 않는다.
5. 확정 원장 UPDATE/DELETE를 일반 앱 계정에 허용하지 않는다. 반대 entry와 새 entry의 연결을 하나의 트랜잭션으로 추가한다. 원본 은행 거래를 삭제해 정정하지 않는다.
6. 마감 기간에는 신규 보정도 통제한다. 마감 해제의 권한·사유·정책을 검증하거나 다음 기간에 정정하고 원기간을 참조한다.
7. 회비 배분/지급 대사의 합계 검사는 FK/CHECK만으로 부족하다. 대상 거래/부과 row를 일관된 순서로 lock하여 동시 요청을 직렬화한다.

## 파일 중복 처리

동일 파일 hash+account+mapping_version는 같은 batch를 반환한다. provider_tx_id가 있으면 가장 강한 중복 키로 사용한다. ID가 없으면 시각/금액/방향/내용/잔액 해시는 **중복 후보**일 뿐이다. 같은 시각·금액의 정상 거래 두 건을 자동 제거하지 않는다. 파일 내 행 번호는 원본 근거이지 파일 간 전역 거래 식별자가 아니다. 겹치는 기간의 파일은 후보를 나란히 비교한 후 사람이 유지/제외를 확정하고 이유를 기록한다.

## 투표 불변식

개설 시 규정 버전과 유권자 집합을 고정한다. 가구/개인 투표 단위, 개설 후 가입·탈퇴, 정족수 분모, 기권·무효·동률, 재투표 및 비밀 투표 여부는 U06 완료 전 활성화하지 않는다. 마감 판정은 서버 UTC 시각을 기준으로 `[opens_at, closes_at)`이다. 결과 확정은 트랜잭션 잠금과 정책 스냅샷으로 재현 가능해야 한다. 비밀 투표를 채택하면 일반 audit_event에 선택지를 남기지 않는 별도 프라이버시 설계가 필요하다.

## 인덱스와 격리

주요 목록은 `(family_id, occurred_at, id)`, `(family_id, status, due_date)`, 역할은 `(family_id, member_id, valid_from, valid_to)`, 미처리 작업은 `(state, scheduled_for)` 인덱스를 제안한다. 커서 목록은 날짜+id 안정 순서를 사용한다. RLS는 추가 방어로 제안하되 API 객체 권한을 대체하지 않는다. 앱 DB 사용자는 owner/superuser/BYPASSRLS가 아니어야 하고, 요청별 family context를 트랜잭션 로컬로 설정·초기화하여 풀 누출을 막는다. ([PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html))
