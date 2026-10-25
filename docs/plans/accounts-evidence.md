# 기본 계좌·정산 및 선지급 증빙 구현

2026-10-24 / R04·R05·R18. 사용자 확정: 각자 기본 계좌 지정, 사용 후 정산은 영수증 필수, 사용 전 선지급은 사유와 사후 영수증 제출. 승인 인원 정책은 이전 확인 대기 상태를 유지한다.

## 구현 결정
사용자별 계좌 등록·목록·기본 계좌 변경. 은행명/예금주/번호/별칭을 입력한다. 계좌번호는 암호화 저장, 기본 응답 마스킹. 기존 계좌를 덮어쓰지 않고 새 계좌 등록 후 기본값을 변경한다. 요청 제출 시 immutable 계좌 ID로 지급 정보를 고정한다. 본인만 내 계좌에 접근하고 송금 담당 총무/총괄관리자는 해당 요청의 계좌를 명시적으로 확인한다. 은행 실명/유효 계좌 검증은 제공하지 않는다.

이미지는 JPG/PNG/WebP, 1개 최대 6MiB, 최대 5개. 서버가 실제 형식·픽셀 수·디코딩을 확인하고 메타데이터 제거 PNG 미리보기를 생성한다. 원본은 암호화 보존하고 다운로드/공개하지 않는다. 검증 전 파일은 제공하지 않는다. 이는 형식 검증과 재인코딩이며 외부 백신 검사 완료를 뜻하지 않는다. 영수증 원문·전체 계좌번호를 로그·Git·LLM으로 보내지 않는다.

정산(reimbursement)은 생성 시 본인이 업로드한 영수증 1개 이상과 계좌가 필수. 선지급(advance)은 계좌·사용 목적 필수이며 사후 추가 증빙을 append-only로 연결한다. 반려된 요청은 사후 제출 불가. 결정 시 존재한 증빙 ID 집합을 기록한다. 기존 요청은 legacy로 보존하되 새 기준을 충족하지 않으므로 승인 차단한다. 승인 결과와 실제 송금 상태를 혼용하지 않는다.

## API 계약 (소유자 합의)
기본 prefix `/api/v1/families/{family_id}`. 모든 쓰기 Origin+CSRF, no-store.
- GET `/bank-accounts`: `{items: BankAccount[], default_account_id: string|null}`.
- POST `/bank-accounts`: `{bank_name, account_number, account_holder, label, make_default}` → BankAccount.
- BankAccount: `{id, bank_name, account_holder, label, masked_number, created_at}`.
- POST `/bank-accounts/{id}/default`: `{}` → 계좌 목록과 기본 ID.
- POST `/bank-accounts/{id}/reveal`: `{}` → `{account_number}`; 본인만.
- POST `/evidence`: raw 이미지 bytes(Content-Type image/*) → EvidenceItem.
- EvidenceItem: `{id, media_type, byte_size, created_at, sha256}`.
- GET `/evidence/{id}/preview`: 검증/재인코딩 PNG, 소유자 또는 연결된 요청 검토자만.
- ExpenseCreate 확장: `request_type: reimbursement|advance`, `bank_account_id: string`, `evidence_ids: string[]`; 기존 payee_name은 보내지 않아도 됨(등록 예금주에서 결정).
- ExpenseItem 확장: `request_type: reimbursement|advance|legacy`, `bank_account: BankAccount|null`, `evidence: EvidenceItem[]`, `decision_evidence_ids: string[]`.
- POST `/expenses/{id}/evidence`: `{evidence_ids: string[]}` → ExpenseItem; 선지급 요청자만.
- POST `/expenses/{id}/payee-account`: `{}` → `{account_number}`; 요청 소유자 또는 현재 총무/총괄관리자, 열람 이력 기록.

## 파일 소유권과 검증
- backend agent: apps/api/src/family_ledger의 banking/evidence 모듈 및 expenses 수정, main.py 연결, migrations/004_accounts_evidence.sql, 신규/기존 API 테스트. 비밀키 설정은 환경변수 FINANCIAL_DATA_KEY 사용.
- frontend agent: apps/web/src의 계좌·출금 화면, 메뉴·proxy·스타일, 새 브라우저 테스트. generated/api.ts는 root 소유.
- root: 의존성·비공개 키 생성과 실행기/테스트 환경, OpenAPI/생성 타입, 백업·운영 문서, 실제 마이그레이션·통합 검증, 최종 리뷰.
- 보안 테스트: 기본값 사용자 격리, 계좌 암호화/요청 스냅샷 보존, 자기/타가족 파일 ACL, 위장 파일·초과 크기 거부, 정산 무증빙 거부, 선지급 사후 추가, 이력 보존. 합성 정보만 사용, pytest --tb=no.

## 완료 기록
- 004 마이그레이션 적용, 기존 데이터 보존. `/accounts`에서 계좌 등록·목록·기본값·명시적 번호 열람, `/expenses`에서 두 유형·계좌 선택·이미지 첨부·사후 증빙 구현. 개인정보는 비공개 암호화 저장, 기본 응답 마스킹, 열람 이력 append-only.
- OpenAPI와 웹 생성 타입 갱신. 기존 요청은 legacy로 보존하며 새 필수 데이터가 없는 기존 요청은 승인 차단한다. 금액·수취인·계좌를 변경하는 편집 기능은 제공하지 않는다.
- 보안 리뷰에서 첨부창 접기/재열기 상태, 422 수정 후 재시도, 결과 불명 상태의 영수증 ID 보존 문제를 수정했다. 최종 소스 리뷰에 남은 차단 이슈 없음. 결과 불명 재시도는 같은 operation_id/원문으로 처리하고 중복 요청을 만들지 않는 브라우저 테스트를 추가했다.
- 계좌 암호화 키를 `var/secrets/financial-data.key`에 최초 생성하고 재실행 시 동일 키 보존을 확인했다. API 프로세스에만 전달하고 DB 백업에 포함하지 않는다. 키 복구/제약은 [운영 안내](../engineering/accounts-evidence.md).

## 실제 검증
- API `pytest apps/api/tests -q --tb=no`: 50 passed + 임시 폴더 ACL 문제로 setup error 6건. 새 workspace `--basetemp`로 해당 6건 재실행하여 6 passed. 합계 56개 모두 통과 확인. 기존 Starlette/httpx 경고 1건은 남아 있다.
- 웹 `npm run typecheck`, `npm run lint`, `npm run build` 통과. API Ruff·compileall·pip check 통과. `validate_foundation.py` PASS.
- `scripts/test_service.py`: 기존 브라우저 10개 통과. 신규 2개는 선택자 충돌/응답 지연으로 최초 실패; 선택자와 결과 불명 재시도 보완 후 `scripts/test_service.py expenses.spec.ts` 2 passed(35.5초). 정산 증빙 필수·총무 검토·기본값 변경과 과거 요청 유지·선지급 사후 첨부·모바일 넘침 검증.
- `scripts/backup_database.py --verify-restore`: 마이그레이션 전후 백업/별도 DB 복원, 모든 앱 테이블 건수 일치. 원래 DB 및 기존 키는 유지했다.
- `node scripts/dev.mjs --production-build`로 로컬 서비스 재실행. 개발 DB에는 실제 계좌나 영수증을 테스트로 넣지 않았다.

## 인수인계 및 남은 범위
[백엔드 상세](../engineering/accounts-evidence-backend.md), [프런트엔드 상세](../engineering/accounts-evidence-frontend.md), [사용·복구 안내](../engineering/accounts-evidence.md).

승인 인원·금액별 단계는 이전 확인 대기 상태로 실제 승인/반려는 정책 미설정 시 비활성이다. 이번 확정은 기본 계좌와 두 요청 유형이다. 외부 배포·은행 실명 검증·송금 실행·계좌 수정/삭제·파일 보관/폐기·키 회전·외부 백신 검사는 미구현/미검증이다. Linux·실기 모바일·스크린리더 전체 검증은 하지 않았다.

## 출금 목록·상세 분리 (2026-10-24)

R04·R05·R18. 사용자 요청에 따라 목록을 상태·금액·요청자·요청 유형·증빙 개수·희망 지급일 중심의 컴팩트 카드로 변경했다. `상세 보기`에서 계좌·영수증·처리 이력·승인/반려 폼을 표시하고 목록 복귀 시 필터를 유지한다. 상세는 같은 경로 내 화면 전환이며 별도 상세 URL은 제공하지 않는다.

정책 미설정 때문에 관리자 검토 버튼까지 막던 UI 조건을 제거했다. 모든 조회 권한자는 상세를 열 수 있다. 서버 권한 판정 및 `POLICY_NOT_CONFIGURED`는 유지하며, 미설정 정책·본인 요청·필수 정보 없는 기존 요청은 상세에서 각각 원인을 안내한다. 승인 규칙(총무/총괄관리자 중 1인, 자기 처리 금지, 금액별 단계 없음)은 사용자 질문으로 확인 요청했으며 답변 전까지 변경하지 않았다.

변경 파일: `apps/web/src/features/expenses/expenses-view.tsx`, `apps/web/src/styles/workspace.css`, `apps/web/tests/expense-detail.spec.ts`, `expenses.spec.ts`, `expense-rejection.spec.ts`, `scripts/prepare_expense_demo.cjs`. API 계약·DB 마이그레이션 변경 없음.

실제 검증:
- 신규 detail 브라우저 테스트 수정 전 실패(목록에 이미지 노출), 수정 후 로컬 서비스에서 `ENABLE_DEV_LOGIN=1`로 `playwright test expense-detail.spec.ts`: 1 passed. 정책 미설정 총괄관리자의 상세 진입·영수증 확인·목록 복귀·390px 가로 넘침 없음 확인.
- `npm --prefix apps/web run build`, `npm --prefix apps/web run lint`: 통과.
- `apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py expenses.spec.ts expense-rejection.spec.ts`: 분리된 테스트 스키마에서 3 passed. 상세에서 총무 승인·총괄관리자 반려·처리 이력 보존·재처리 차단·선지급 사후 증빙 확인.
- `node scripts/prepare_expense_demo.cjs`: 통과, 기존 승인 대기 2건 보존, 3역할의 상세 이미지 확인. 화면 캡처 `var/expense-demo/` 직접 검토. 새 빌드로 localhost:3000 재실행.

전체 API 테스트는 서버 변경이 없어 재실행하지 않았다. 실제 승인 정책 활성화 및 실기 모바일 검증은 남아 있다.

## 결재 규칙 확정·활성화 (2026-10-24 후속)

사용자가 총무 또는 총괄관리자 1인 처리, 총무 요청은 총괄관리자 처리, 실제 은행 송금은 총무가 수행한다고 확정했다. 앞선 승인 규칙 확인 대기 기록을 대체한다. 자기 처리 금지는 유지하며 승인으로 송금 실행·원장 차감하지 않는다.

R04·R13·R18 변경: 서버에서 요청 당시 또는 현재 총무인 요청자는 `requires_super_admin=true`로 반환하고, 유효 총괄관리자가 아닌 처리자의 승인/반려를 `SUPER_ADMIN_REQUIRED`로 거부한다. 가족 행 잠금과 유효 역할 재판정, 자기 처리 차단, 처리 이력 불변은 유지한다. 프런트엔드는 이 값을 사용해 상세에 처리 담당을 안내한다. 기존 계좌/요청/결정 데이터는 변경하지 않았다.

변경 파일: API `expenses/repository.py`, `expenses/models.py`, `tests/test_expenses.py`; 웹 `expenses-view.tsx`, `tests/expense-detail.spec.ts`; OpenAPI/생성 타입; `scripts/activate_expense_policy.py`; 요구사항 R04·RBAC·계좌 증빙 운영 안내. 스키마 변경 없음.

로컬 DB에 `user-confirmed-20261024-single-approval-v1` 정책을 append-only로 기록하고 서비스 재시작. 활성화 스크립트는 프로젝트 개발 DB에만 적용하고 같은 버전을 덮어쓰지 않는다. 복구가 필요하면 기존 정책 행 삭제/수정 없이 별도 버전 정책을 추가해야 한다.

검증: 전용 테스트 DB 환경변수를 비공개 설정에서 읽어 `pytest apps/api/tests/test_expenses.py apps/api/tests/test_accounts_evidence.py -q --tb=no` 실행, 14 passed (신규 총무 처리 규칙 2건은 구현 전 실패 재현). 웹 build/lint, API Ruff, foundation 검증 통과. 로컬 `ENABLE_DEV_LOGIN=1 playwright test expense-detail.spec.ts` 1 passed: 실제 승인 대기 요청의 처리 폼 활성화 확인, 확정 버튼은 누르지 않음. `scripts/test_service.py expenses.spec.ts expense-rejection.spec.ts`에서 승인·반려 및 이력 보존 2건 통과, 사후 증빙 1건은 로그인 5초 대기 초과. `scripts/test_service.py expenses.spec.ts -g 'default account'` 단독 재실행 1 passed (19.9초). 합계 브라우저 4개 시나리오 통과 확인.

실제 은행 송금·송금 완료 기록·대사 화면은 이번 범위에 추가하지 않았고, 실기 모바일·전체 API 회귀는 재검증하지 않았다.

## 계좌 카드 높이·정보 위계 개선 (2026-10-25)

R04·R18. 기본 계좌에서 지정 버튼이 빠지고 expense-list의 align-items:start가 적용되어 카드 높이가 달라지던 문제를 수정했다. accounts-view.tsx에서 전용 bank-account-grid/card로 분리하고 은행 아이콘·계좌 별칭·라벨/값·하단 동작으로 정돈했다. workspace.css에 동일 높이 그리드와 하단 고정 정렬, 기본 상태/지정 버튼의 동일 44px 공간, 반응형 여백과 줄바꿈을 추가했다. 디자인 시스템에도 규칙 기록. API·DB·권한·번호 열람 동작 변경 없음.

검증: npm --prefix apps/web run build 및 npm --prefix apps/web run lint 통과. apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py expenses.spec.ts -g 'default account switches': 1 passed(27.0초). 기존 테스트에 1440/390/320px 계좌 카드 높이 일치(차이 1px 미만)·가로 넘침 없음 검증을 추가했다. 기본 계좌 변경·기존 출금 요청 계좌 보존·사후 증빙 흐름도 통과. 별도 합성 DB에서만 변경했으며 로컬 사용자 계좌는 변경하지 않았다. var/expense-demo/account-cards-light.png 시각 검토 완료, 서비스 재시작 완료. 다크모드·실기 모바일·전체 회귀는 이번에 별도 검증하지 않았다.
