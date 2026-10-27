# WB-09 EC2 운영 준비 — 1차

2026-10-28 / R03·R14·R18·P6, 사용자 요청으로 진행.

## 범위와 선택

기존 Next.js → FastAPI → PostgreSQL 구조와 초대 기반 계정을 유지한다. 이번에는 클라우드 자원 생성 없이 운영 로그인 설정 및 백업·복원 검증을 구현한다. 기존 체크아웃은 깨끗하며 여기서 작업한다.

- 운영 모드는 local_password, 명시적인 HTTPS 단일 WEB_ORIGIN, DB, 유효한 금융 암호키를 요구한다. 개발 인증/테스트 계정 설정이 남으면 시작을 거부한다. 세션 발급·삭제 모두 Secure/HttpOnly/SameSite=strict. 출처와 CSRF 검증 및 요청별 권한 검증 유지.
- EC2의 TLS 프록시 → loopback 웹/API 구성을 기본 준비 대상으로 삼는다. 컨테이너/별도 호스트 연결은 배포 단계에서 확정한다. 기존 웹 프록시의 loopback 제한을 완화하지 않는다.
- 기존 로컬 백업의 새 임시 DB 복원을 강화한다. 같은 PostgreSQL snapshot에서 dump와 검증 기준을 만들어 동시 쓰기로 인한 오판을 방지한다. 전체 테이블 내용 지문, 금액 합계, 암호문 복호화와 원본 해시를 비교한다. 원본 DB에는 쓰지 않는다. 검증용 DB만 제거한다.
- 키는 백업과 별도로 주입한다. 원본/키/사용자 정보/테이블 지문을 콘솔에 출력하지 않는다. 현재 문서·증빙은 DB 암호문에 있으므로 DB dump가 포함한다.
- 비밀번호 분실 본인확인·외부 전달 채널, EC2/도메인, 백업 보관기간·RPO/RTO는 UNVERIFIED. 복구 UI/발송이나 실제 배포는 이번 범위에서 임의로 추가하지 않는다.

## 실행 계획과 인수 기준

1. 운영 인증 실패/성공 테스트를 먼저 작성: 잘못된 모드·HTTP·개발 설정·누락 키 거부, HTTPS 로그인/CSRF/로그아웃/역할 회수/타가족 접근 확인. main.py 및 설정 모듈만 변경, API 응답 계약·DB migration 변경 없음.
2. 복구 검증 모듈과 기존 backup_database.py 연결: 동일 건수의 변조도 탐지, 잘못된 키·원본 해시 불일치 실패. 합성 DB 검증 후 로컬 실자료 backup/격리 restore 실행. 원본을 덮어쓰거나 복구된 서비스로 전환하지 않음.
3. 운영 환경 예시와 EC2 인수 절차 작성. 현행 PG 도구는 로컬 전용 보호를 유지하며 운영 자동 백업은 별도 배포 단계로 명시.
4. API 회귀·ruff·foundation·계약 검사, 읽기 전용 검토와 WORKBOARD 결과 갱신. 실제 EC2/Linux/TLS는 미검증으로 남김.

## 근거

- [PostgreSQL snapshot](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION)
- [EC2 security group 규칙](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules-reference.html): 웹 HTTPS 접근과 DB 접근 규칙을 분리한다.

## 검증 기록

1차 구현·로컬 검증 완료. 실제 EC2 공개 운영 인수는 미완료.

- 변경: main.py/runtime_config.py에서 운영 시작 조건·HTTPS 출처·Secure 쿠키·운영 문서 경로 비활성화. auth.py 설명 갱신. 응답 스키마/DB migration/권한 규칙 변경 없음.
- 변경: recovery.py와 backup_database.py에서 동일 snapshot 백업·전체 테이블 내용/금액/암호문/원본 해시 복구 비교. 비공개 요약 보고서 작성. 신규 운영 인증/복구 테스트, 기존 unsafe startup 테스트 갱신.
- 최초 운영 테스트 2 failed/5 passed: HTTPS 출처와 production 시작 미지원 재현. 구현 후 production/local_origins/auth 21 passed. 첫 실행은 소켓 접근 제한으로 DB 연결 실패가 있어 허용된 로컬 테스트 실행 환경에서 재검증했다.
- 복구 신규 테스트 최초 2 failed(모듈 미구현), 구현 후 2 passed: 동일 건수 권한 변경, 잘못된 암호키, 원본 hash 오류 탐지.
- 실제 로컬 자료: 원래 키를 출력 없이 주입하여 `apps/api/.venv-pg/Scripts/python.exe scripts/backup_database.py --verify-restore` 성공. 원본 DB 읽기 전용 snapshot → 새 임시 DB 복원 → 모든 테이블 내용/금액/암호문/원본 hash 일치 → 검증 DB만 제거. dump와 verification.json은 Git 제외 var/postgres/backups 보관.
- 읽기 전용 독립 검토: 비표준 Origin(:443/대문자 등)의 브라우저 문자열 불일치 지적. 신규 4건 모두 실패 재현 후 비표준 설정 시작 거부로 수정, 4 passed. 공유 IP throttle 및 복원 후 runtime ACL 한계는 운영 문서에 명시.
- 전체 `pytest apps/api/tests -q --tb=short --basetemp=var/pytest-wb09-<UUID>`: 128 passed/1 failed, 471.07초, 기존 Starlette 경고1. 실패는 production+development 인증 거부의 오류 문구 기대값이었다(거부 자체는 정상). 안전하지 않은 조합 거부를 유지하면서 기대 메시지를 변경했다.
- 최종 `pytest test_production_auth.py test_api.py test_local_origins.py -q --tb=short --basetemp=var/pytest-wb09-final-<UUID>`: 24 passed(추가 비표준 Origin4 포함), 6.30초. 따라서 기존120+신규13 = 고유133개 통과 확인(전체/보완 재실행 합산, 최종 단일 전체 실행은 아님).
- `ruff check apps/api/src apps/api/tests scripts/backup_database.py`, `pip check`, `npm --prefix apps/web run typecheck`, `npm --prefix apps/web run lint`, `node --test tests/design/theme.test.cjs`(9개), foundation 및 diff 검사 통과. 스크립트 import 정렬 lint 오류는 수정 후 통과.
- 기존 웹 빌드를 APP_ENV=production/ENABLE_DEV_LOGIN=0으로 별도 loopback:3304에서 실행: GET /login 200·개발 로그인 UI 없음, POST /api/v1/dev/session 404. 검증 서버 종료. 최초 sandbox 소켓 제한으로 연결 실패하여 격리 서버를 허용된 실행 환경에서 재실행했다. 기존 3000/8000 서비스 유지.
- 화면 소스 변경 없어 웹 build/전체 브라우저 회귀는 이번에 재실행하지 않았다. 실제 EC2/Linux/TLS 브라우저·운영 DB GRANT·복원 후 API smoke·자동 백업/호스트 밖 복제·비밀번호 변경/분실 복구는 미검증/미구현. API 테스트의 HTTPS base_url은 실제 TLS 인증서 검증이 아니다.

인수인계: [EC2 운영 준비](../operations/ec2-readiness.md), API/웹별 환경변수 예시. 다음은 운영 DB/도메인·계정 복구 방식 확정과 staging에서 최소 권한·HTTPS·복원 후 API 인수 검증. 이번에는 커밋·푸시·EC2 생성·배포를 실행하지 않았다.
