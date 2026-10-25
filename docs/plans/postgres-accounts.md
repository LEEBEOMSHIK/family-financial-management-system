# PostgreSQL과 개별 계정 구현

요구사항 R03/R14/R15/R18. 사용자 요청: 실제 DB 구성, 가족별 계정 로그인과 총괄관리자 권한 관리.

## 범위와 결정
설치된 PostgreSQL 18.6 실행 파일로 프로젝트 전용 루프백 55432 클러스터를 만든다. 기존 5432 서비스는 변경하지 않는다. family_ledger_dev / family_ledger_test와 각각 owner/runtime 계정을 분리한다. Docker 사용 없음.

가족·구성원·역할 부여/종료·권한 변경 이력·현재 합성 거래·개별 계정·초대·로그인 세션을 DB로 옮긴다. 거래가 합성 자료라는 표시를 유지한다. 최초 총괄관리자는 로컬 초기화로만 만든다. 가족 계정은 총괄관리자 초대를 받아 일반사용자로 생성되며, 가입 화면에서 역할을 선택할 수 없다. 실제 역할은 예정 만료 없이 부여하고 변경/회수 시 종료 이력을 남긴다. 과거 합성 역할의 기간은 보존한다.

## 파일 소유권
- postgres_adapter: postgres.py, domain.py의 nullable 역할, 001 마이그레이션, 실제 DB 통합 테스트.
- local_auth: auth.py/auth_models.py/main.py, 002 마이그레이션, 계정/세션 테스트, RoleMember 표시 이름.
- 주 에이전트: DB 초기화/실행/백업 스크립트, 의존성·잠금, 웹 로그인/가입/초대·권한 화면, 문서 및 통합 검증.

## 검증과 이관
스키마 버전·체크섬 확인, JSON 권한 이력 원본 보존과 단일 트랜잭션 이관, 기존/실제 사용자 권한 분리, 원본 이력 개수 비교, 실제 DB 동시 변경·마지막 관리자·가족 경계 검증. 초대 일회 사용·비밀번호 해시·로그인 실패 제한·CSRF·세션 만료/로그아웃·서버 재시작 후 세션/이력 유지 검증. 브라우저로 개별 로그인→초대 가입→역할 변경을 확인한다.

운영 공개 배포·HTTPS·메일 발송·계정 복구 서비스는 이번 로컬 범위 밖이다. 자격 정보는 Git 제외 경로에 저장하고 로그나 도구 결과에 출력하지 않는다.

## 완료 및 검증 기록 (2026-10-24)
사용자 후속 요청으로 개발 역할별 테스트 버튼을 추가했다(R03/R14). 변경 파일: 웹 account-form/login, 개발 전용 `/api/v1/dev/session` route, `scripts/prepare_test_accounts.py`, `scripts/dev.mjs`, 브라우저 테스트와 격리 실행기. 일반 계정 로그인과 병행하며 서버에 보관한 별도 테스트 계정으로 기존 비밀번호 로그인 API를 호출한다. APP_ENV와 ENABLE_DEV_LOGIN으로 서버에서 차단하며 Origin 검증을 적용한다. 요청 계약은 `{profile: member|treasurer|super_admin}`, 응답은 기존 SessionResponse다. 비활성 404, 잘못된 Origin 403, 잘못된 profile 422, 설정/연결 실패 DEV_LOGIN_UNAVAILABLE 503. 실제 계정 비밀번호는 클라이언트에 전달하지 않는다.

후속 검증: 웹 build/lint 및 준비 스크립트 Ruff 통과. `scripts/test_service.py` 10 passed(비활성 경로 포함), ENABLE_DEV_LOGIN=1로 `scripts/test_service.py development-login.spec.ts` 1 passed(세 역할 버튼·서버 권한·Origin 차단). 실제 3000 서비스도 세 역할 로그인 200, 총괄관리자만 manage_roles 확인. `validate_foundation.py` PASS. 개발 테스트 계정은 권한 변경 테스트 결과를 유지하며 재실행 시 초기화하지 않는다.

- 실제 PostgreSQL 55432, 개발/테스트 DB, owner/runtime 분리, 마이그레이션 001/002 적용. 초기 실제 관리자 생성, 합성 회원 비활성화, 기존 역할 이력 7건과 합성 거래 7건 보존.
- 개별 로그인·초대 가입·총괄관리자 역할 변경 연결. 초대한 관리자의 권한 상실/만료/비활성화 후 가입 차단과 비활성 계정 로그아웃까지 검증.
- 전용 DB 환경변수를 지정한 `pytest apps/api/tests -q --basetemp var/pytest-final-<uuid>`: 44 passed. Starlette/httpx 사용 중단 예정 경고 1건은 남아 있다.
- `python scripts/test_service.py`: 브라우저 9 passed. `node --test tests/design/theme.test.cjs`: 9 passed.
- `python scripts/validate_foundation.py`, `ruff check apps/api/src apps/api/tests`, `pip check`, 웹 `npm run lint`, `npm run typecheck`, `npm run build`: 통과. `npm audit --audit-level=high`: 취약점 0건.
- `python scripts/backup_database.py --verify-restore`: 별도 임시 DB 복원 및 주요 7개 테이블 건수 일치.
- `node scripts/dev.mjs --production-build`로 실제 로컬 서비스 재실행. 자세한 파일 구성은 위 소유권 목록, 실행·계정·복구 인수인계는 [운영 안내](../engineering/postgres-local.md), DB 구현 상세는 [어댑터 인수인계](../engineering/postgres-adapter-handoff.md).
- 남은 범위: 공개 배포/HTTPS, 비밀번호 변경·복구, 계정 비활성화 UI, 실제 금융 데이터/업무 쓰기 API. Linux·스크린리더 실기 미검증.
