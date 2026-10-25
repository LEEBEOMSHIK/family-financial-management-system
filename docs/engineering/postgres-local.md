# PostgreSQL·개별 계정 로컬 운영

2026-10-24 / R03·R14·R15·R18. 현재 구현은 로컬에서 사용하는 실제 DB와 개별 계정이다. 외부 공개 서비스 배포는 별도다.

## 구성
- PostgreSQL 18.6, 프로젝트 전용 `127.0.0.1:55432`. 기존 5432 서비스는 변경하지 않는다.
- `family_ledger_dev`와 `family_ledger_test`, 각각 마이그레이션 owner와 제한된 runtime 계정.
- Python 3.14.9 x64 (`var/python-x64`), 가상환경 `apps/api/.venv-pg`. 기존 ARM64 Python 환경은 보존했다.
- 가족, 구성원, 역할 부여/종료, 변경 이력, 거래, 계정, 초대, 세션을 PostgreSQL에 저장한다.
- 기존 역할 이력 7건과 합성 거래 7건을 이관했다. 합성 구성원은 비활성화했으며 실제 금융 데이터 연동은 아직 없다.
- 마이그레이션은 체크섬을 검사한다. 적용된 SQL을 수정하지 말고 후속 마이그레이션을 추가한다.

## 실행과 로그인
설치된 현재 환경에서는 저장소 루트에서 실행한다.

```powershell
node scripts/dev.mjs --production-build
```

웹은 http://127.0.0.1:3000/login, API는 8000이다. 최초 총괄관리자 아이디는 `family_admin`이다. 생성된 비밀번호는 로컬 `var/postgres/initial-admin.json`에 있다. 이 파일과 `connection.json`은 접근 권한이 제한되어 있으며 Git에서 제외한다. 내용을 채팅·로그·Git에 복사하지 않는다.

총괄관리자로 로그인 → 권한 관리 → 초대 코드 생성 → 가족에게 코드 전달 → 가족이 `/register`에서 자신의 아이디·비밀번호로 가입한다. 가입 시 일반사용자로 등록된다. 총괄관리자만 일반사용자/총무/총괄관리자 권한을 변경할 수 있다.

개발 확인용으로 로그인 화면에 일반사용자·총무·총괄관리자 테스트 버튼을 함께 제공한다. `scripts/prepare_test_accounts.py`로 만든 별도 `dev_*` 계정을 사용하며 비밀번호는 서버의 비공개 파일에만 둔다. 권한을 변경한 테스트 계정은 그 변경된 권한으로 로그인한다. 시작할 때 권한을 되돌리지 않는다. 테스트 계정의 변경도 로컬 DB에 저장되므로 실제 가족 계정과 이름을 구분한다.

`scripts/dev.mjs`는 테스트 계정 파일이 있으면 개발 버튼을 활성화한다. 비활성화하려면 PowerShell에서 `$env:ENABLE_DEV_LOGIN='0'`을 지정하고 재시작한다. 서버의 APP_ENV=development 및 ENABLE_DEV_LOGIN=1이 모두 충족되어야 버튼과 경로가 활성화된다. NODE_ENV가 production인 최적화 빌드로도 로컬 개발 테스트가 가능하다. 외부 배포에는 이 기능을 활성화하지 않는다.

초대 코드는 7일·1회 사용이며 초대한 관리자의 현재 권한도 가입 시 재검증한다. 세션은 DB에 저장하고 8시간 후 만료된다. 비밀번호는 scrypt, 세션/초대 토큰은 해시로 저장한다. 역할은 요청 시점에 서버에서 판정한다. 실제 구성원 역할은 변경 전까지 유효하다.

웹/API 종료는 Ctrl+C 또는 `powershell -File scripts/stop-dev.ps1`. DB는 유지된다. DB 종료는 `powershell -File scripts/stop_database.ps1`. 실행기가 프로젝트 DB를 다시 시작한다.

## 설치·초기화 재현
PostgreSQL 18 x64와 Python 3.14 x64 설치가 선행되어야 한다. 이 PC의 Python 경로 기준이다.

```powershell
& var/python-x64/python.exe -m venv apps/api/.venv-pg
& apps/api/.venv-pg/Scripts/python.exe -m pip install -r apps/api/requirements.lock
& apps/api/.venv-pg/Scripts/python.exe scripts/setup_postgres.py
& apps/api/.venv-pg/Scripts/python.exe scripts/initialize_database.py
npm --prefix apps/web ci
npm --prefix apps/web run build
```

초기화는 기존 JSON을 백업하고 이력을 보존한다. 기존 계정이 있으면 초기 관리자 비밀번호를 재설정하지 않는다. 초기화 중단 흔적을 지워 재실행하지 말고 DB와 자격 정보 파일 상태를 확인한다.

## 백업·복구
```powershell
& apps/api/.venv-pg/Scripts/python.exe scripts/backup_database.py --verify-restore
```

비공개 `var/postgres/backups`에 custom-format 백업을 만든다. 검증은 새 임시 DB에 복원하여 주요 7개 테이블의 건수를 비교한 뒤 그 임시 DB만 제거한다. 실제 복구도 새 DB에 복원하고 마이그레이션·건수·로그인·권한을 확인한 후 연결을 전환한다. 기존 DB를 덮어쓰지 않는다. `--no-owner --no-privileges` 복원 시 owner/runtime 권한을 별도로 재적용해야 한다.

## 검증
API 통합 테스트는 `connection.json`의 `test_owner_dsn`과 `test_app_dsn`을 각각 `TEST_DATABASE_URL`, `TEST_APP_DATABASE_URL` 환경변수로 읽어서 실행한다. 연결 문자열을 출력하지 않는다. `pytest apps/api/tests -q`는 전용 테스트 DB에 고유 스키마를 생성·정리한다. Windows에서는 작업 폴더 안의 새 `--basetemp` 경로를 사용한다.

브라우저 검증은 `apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py`. 테스트 전용 스키마·무작위 계정과 3001/8001 포트를 사용하고 종료 시 정리한다. 먼저 웹을 빌드해야 한다. 실제 개발 DB의 가족 계정을 테스트로 변경하지 않는다. 나머지 명령은 [로컬 개발](local-development.md)을 따른다.

## 남은 범위
현재 주소는 이 PC에서만 접속된다. 다른 가족의 기기에서 사용하려면 배포·HTTPS·외부 접근 구성이 필요하다. 운영 인증 설정, 비밀번호 변경/복구, 계정 비활성화 UI, 실제 은행 연동 및 금융 업무 쓰기 API는 미구현이다. Linux와 스크린리더 실기 검증은 미수행이다.

공식 근거: [PostgreSQL 초기화](https://www.postgresql.org/docs/18/app-initdb.html), [SCRAM 인증](https://www.postgresql.org/docs/18/auth-password.html), [Psycopg 설치](https://www.psycopg.org/psycopg3/docs/basic/install.html), [Python 3.14.9](https://www.python.org/downloads/release/python-3149/).
