# 계좌·증빙 백엔드 인수인계

2026-10-24 / R04, R05, R18. 계약: [구현 계획](../plans/accounts-evidence.md).

## 구현
- `apps/api/src/family_ledger/banking/`: 본인 계좌 등록·목록·기본값 이력·명시적 전체번호 열람. 계좌는 불변이며 기본값만 append-only 이력으로 선택한다.
- `apps/api/src/family_ledger/evidence/`: 6MiB 이하 PNG/JPEG/WebP 실제 디코딩, 20MP 제한, 애니메이션 거부, EXIF 방향 반영 및 메타데이터 없는 RGB PNG 미리보기. 미리보기 긴 변은 2400px 이하. 원본을 제공하는 경로는 없다.
- `expenses/`: 본인 불변 계좌 ID로 지급정보 고정, 정산 영수증 필수, 선지급 사후 증빙 최대 총 5개. 원래 제출 증빙 ID와 결정 시점 증빙 ID를 각각 보존한다. 재전송은 사후 증빙 추가 후에도 원래 operation_id로 같은 요청을 반환한다.
- `main.py`: 인증된 PostgreSQL 모드에서 라우터 연결. 쓰기와 전체번호 열람에 Origin+CSRF 확인. 모든 응답은 no-store, nosniff.
- `apps/api/migrations/004_accounts_evidence.sql`: 계좌·기본값·증빙·연결·열람 이력과 불변 트리거 및 runtime 최소 권한. 가족/구성원 복합 FK로 계좌·증빙 소유권 연결 보호.
- `apps/api/tests/test_accounts_evidence.py`, `test_expenses.py`: 합성 자료 기반 API/DB 검증. 테스트 계좌번호는 실행 시 생성한다.

## 보안과 동시성
전체 계좌번호, 원본 이미지, 미리보기는 FINANCIAL_DATA_KEY의 Fernet 인증 암호문으로 bytea 저장한다. 키가 없거나 잘못되면 민감정보 쓰기/복호화를 503으로 차단하고 임의 키를 만들지 않는다. 키 보관·백업·복원은 실행 환경 책임이며 원문을 로그에 남기지 않는다.

계좌 목록은 본인만, 미연결 증빙은 업로더만 접근한다. 현직 총무/총괄관리자는 같은 가족의 요청에 연결된 계좌·증빙만 요청 경로로 열람한다. 전체번호 성공 열람은 요청 ID/행위자/계좌 ID/시각만 기록한다. 권한 변경과 같은 family 행 잠금을 써서 쓰기·증빙 열람·전체번호 열람을 직렬화한다. 결정과 증빙 첨부도 같은 잠금을 사용하므로 결정 당시 증빙 집합이 고정된다.

미리보기 처리의 목적은 이미지 형식 검증·재인코딩이며 백신 검사를 주장하지 않는다. 입력 바이트 수를 스트리밍 중 제한하고 디코딩은 스레드풀에서 수행한다. 원본은 암호화 보존하고 미리보기만 인증된 경로로 제공한다.

## 검증
- RED: 신규 3개 DB 테스트가 구현 전 모두 실패한 것을 확인했다.
- 최초 통합 GREEN: 신규 3개와 갱신한 기존 출금 3개, 총 6 passed.
- 확장 검증: `python -m pytest apps/api/tests/test_accounts_evidence.py apps/api/tests/test_expenses.py -q --tb=no` 10 passed.
- 최종 전체 `python -m pytest apps/api/tests -q --tb=no`: 잘못된 키/영수증 제한/픽셀 검증 포함 50 passed, 임시 디렉터리 fixture를 사용하는 기존 테스트 6개 setup error. 해당 6개를 `python -m pytest apps/api/tests/test_roles.py apps/api/tests/test_postgres.py::test_import_exact_events_and_reject_bad_chain -q --tb=no --basetemp=var/pytest-accounts-evidence`로 재실행해 6 passed. 기존 Windows 임시 디렉터리 권한 문제를 workspace 임시 경로로 우회했다. 두 실행을 합해 56개 통과를 확인했다. 기존 Starlette/httpx 경고 1개.
- `python -m ruff check apps/api/src apps/api/tests`: All checks passed.
- `python -m compileall -q apps/api/src/family_ledger`: 성공.
- 테스트 연결은 비공개 설정에서 환경변수로만 주입했다. 테스트 DB 이름 확인 및 무작위 격리 스키마를 사용하고 종료 시 해당 스키마만 정리한다. traceback은 DSN 노출 방지를 위해 끈다.

## 운영·미검증
실제 개발 DB 마이그레이션, OpenAPI/생성 타입, 실행기 키 주입, 전체 백업·복원 및 브라우저 통합은 root 담당이다. 이 에이전트는 실제 개발 DB에 004를 적용하지 않았다.

승인 정책은 사용자 미확정이므로 실제 개발 DB에서 비활성 상태를 유지한다. 테스트에만 합성 정책을 넣는다. 과거 요청은 legacy로 보존하고 새 계좌/유형 요건을 갖추지 못한 결정은 차단한다. 은행 유효 계좌·예금주 검증 및 송금 실행은 구현 범위가 아니다.

복구 시 기존 DB를 삭제하거나 004를 되돌리지 않는다. 마이그레이션 전 백업을 별도 DB로 복원하여 검증한 뒤 연결 전환한다. 암호화 자료 복호화에는 해당 FINANCIAL_DATA_KEY 백업도 필요하다.
