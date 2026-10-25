# PostgreSQL 어댑터 인수인계

요구사항: R03(권한 관리), R06(이력), R12(금액 조회), R15(네이티브 실행), R18(가족 격리).

## 파일과 계약

- `apps/api/src/family_ledger/postgres.py`: `PostgresRepository(dsn, family_id=FAMILY)`, `migrate(dsn, app_role=...)`, `seed(dsn, legacy_path=None)`.
- `apps/api/migrations/001_postgres.sql`: 가족·구성원·역할 배정·종료 사실·변경 이력·합성 거래·가져오기 표식.
- `apps/api/src/family_ledger/domain.py`: 종료일 없는 역할을 지원하는 유효기간 판정.
- `apps/api/tests/test_postgres.py`: 별도 테스트 DB의 고유 스키마에서 실행하는 통합 테스트.

역할 변경은 가족 행 잠금 뒤 활성 구성원, 현재 총괄관리자, 예상 버전, 마지막 관리자 보호를 다시 확인한다. 새 배정과 종료 사실, 감사 이벤트, 버전이 한 트랜잭션으로 확정된다. 기존 역할 행을 덮어쓰지 않으며 요청마다 유효기간을 다시 읽는다. 종료 시각은 배타적이다. 실계정의 null 종료일은 명시적 변경·회수 전까지 예약된 만료가 없다는 기술적 설정이며 미확정 업무 승인 권한을 부여하지 않는다.

금액은 PostgreSQL BIGINT, API 모델은 10진 문자열이다. 거래에는 합성 여부가 명시된다. 이 단계는 은행 연결·송금·실제 회비 부과를 구현하지 않는다.

## 마이그레이션과 기존 자료

스키마 변경은 owner 연결로 실행한다. 파일별 SHA-256과 버전을 기록하고 파일 변경이 감지되면 거부한다. 전체 마이그레이션은 advisory lock과 단일 트랜잭션으로 보호한다. 자동 DROP/재생성 경로가 없다. 런타임에는 조회, 역할 사실 추가, 가족 버전 갱신만 부여한다. 계정·세션의 별도 권한은 002 마이그레이션 소관이다.

`seed`는 합성 자료 전용 일회성 가져오기다. JSON의 스키마·시각·역할 전후 연결·행위자 권한을 검증하고 원래 이벤트 문자열과 사유를 보존한다. 실패 시 전체 롤백하며 성공 표식 이후 반복 실행은 변경하지 않는다. 운영 중 JSON을 다시 읽거나 DB 이력을 덮어쓰지 않는다. 실계정 초기화는 별도 인증 초기화 절차가 합성 구성원을 비활성화한다.

적용 실패 시 트랜잭션이 롤백된다. 적용 후 복구는 검증된 백업 복원이나 새 순방향 마이그레이션으로 수행하며 감사 행 삭제로 되돌리지 않는다. 실제 백업 복구 훈련은 미검증이다.

## 검증

테스트는 `TEST_DATABASE_URL`의 dbname이 `family_ledger_test`인 경우만 고유 `test_<uuid>` 스키마를 생성한다. 종료 시 그 테스트 스키마만 제거한다. 런타임 권한 검증에는 `TEST_APP_DATABASE_URL`도 필요하다. DSN이나 비밀번호를 출력하지 않는다.

초기 RED: 기존 `.venv`에서 `python -m pytest tests/test_postgres.py -q` 실행, 어댑터 미구현 1건 실패 및 DB 설정 미완료 4건 skip 확인.

정적 검증: `python -m ruff check src/family_ledger/postgres.py tests/test_postgres.py src/family_ledger/domain.py` 통과.

2026-10-24 실제 PostgreSQL 18.6 검증: `apps/api`에서 `.venv-pg/Scripts/python.exe -m pytest tests/test_postgres.py -q --basetemp=<저장소 var 아래 새 테스트 경로>` 실행, **8 passed**. 첫 실행은 7 passed와 OS 임시 폴더 ACL로 인한 setup error 1건이었고, 격리된 저장소 임시 경로로 재실행해 모두 통과했다.

같은 환경으로 `.venv-pg/Scripts/python.exe -m pytest -q --basetemp=<새 테스트 경로>` 실행, **38 passed, 1 warning** (Starlette의 httpx TestClient 폐기 예정 경고). DB 관련 skip은 없다. 연결 정보는 비공개 설정에서 환경변수에만 주입했다. 검증에는 동시 변경, 재접속 후 이력 유지, 종료 경계, 비활성 관리자 제외, 만료 없는 실계정, BIGINT 최대값, 가족 FK, 잘못된 가져오기 롤백, 마이그레이션 변경 탐지, 런타임 감사 DELETE/TRUNCATE 거부가 포함된다.
