# EC2 운영 준비와 복구 인수

2026-10-28 / WB-09·R03·R14·R18·P6. 운영 설정 코드 준비와 실제 공개 배포를 구분한다.

## 이번에 준비한 구성

EC2 TLS 프록시 → 같은 호스트의 Next.js(loopback:3000) → FastAPI(loopback:8000) → PostgreSQL. DB 배치(동일 EC2/별도 관리형)는 아직 결정하지 않았다. 기존 웹 API 프록시의 loopback 제한을 유지한다. 컨테이너 네트워크 적용은 별도 배포 설계에서 검증한다.

- [API 환경 예시](../../config/production-api.env.example), [웹 환경 예시](../../config/production-web.env.example)는 템플릿이다. `.env` 파일을 자동으로 읽는 운영 실행기는 아직 없다. 서비스 관리자가 프로세스별로 주입해야 한다.
- API는 APP_ENV=production, AUTH_PROVIDER=local_password, 명시적 HTTPS WEB_ORIGIN, DATABASE_URL, 유효한 FINANCIAL_DATA_KEY를 요구한다. 개발 로그인/계정 파일 설정을 제거한다. 키는 기존 자료를 암호화한 원래 키여야 한다.
- 발급/삭제 세션 쿠키는 Secure·HttpOnly·SameSite=strict·Path=/이고 Domain은 지정하지 않는다. 변경 요청은 정확한 Origin과 기존 CSRF를 검사한다. 가족/유효 역할은 요청마다 DB에서 판정한다. 운영 API의 docs/openapi 경로는 비활성화한다.
- 웹은 기존 APP_ENV 검증으로 개발 로그인 버튼과 /api/v1/dev/session을 차단한다. 금융 암호키와 DB 자격 정보는 API에만 제공한다. API_INTERNAL_URL은 지금처럼 loopback HTTP이며 외부 HTTPS는 TLS 프록시가 담당한다.
- 사용자별 로그인 제한과 DB 세션 폐기 기능은 유지한다. 현재 프록시 뒤에서는 IP 제한이 웹 서버 주소로 합산될 수 있다. 임의 X-Forwarded-For를 신뢰하도록 바꾸지 않았다. 실제 접속량·프록시 신뢰 경계·edge 제한은 staging에서 확인해야 한다.

## 백업 검증 실행

기존 `scripts/backup_database.py --verify-restore`는 로컬 개발 DB만 허용한다. EC2에 이 도구를 그대로 복사해 운영 자동 백업으로 사용하지 않는다. 지금 검증하는 것은 복원 데이터의 무결성과 키 복구 가능성이다.

1. 복구용 원래 FINANCIAL_DATA_KEY를 검증 프로세스에 비공개로 주입한다. 로컬에서는 기존 `var/secrets/financial-data.key`를 읽는다. 키를 콘솔/명령 인수/보고서에 넣지 않는다.
2. `apps/api/.venv-pg/Scripts/python.exe scripts/backup_database.py --verify-restore` 실행.
3. 같은 repeatable-read snapshot으로 pg_dump와 원본 검증 기준을 만들고, 새 임시 DB에 복원한다. 전체 테이블의 정렬된 행 내용 지문과 건수, `_krw` 합계, 모든 암호문 복호화, 원본 SHA-256와 크기를 비교한다. 계정/구성원/역할/종료 이력도 전체 내용 비교에 포함한다.
4. 검증 DB만 제거한다. 원본 DB에는 쓰지 않는다. dump와 성공 결과 `.verification.json`은 Git 제외 `var/postgres/backups`에 남는다. 실패 시 성공 보고서를 만들지 않으며 실패 dump도 진단용으로 보존한다. 실패 상세에 DSN/행/원문을 노출하지 않는다.

DB 내 문서·증빙·문의 이미지 암호문은 dump에 포함된다. 암호키는 포함되지 않는다. 이후 파일 저장을 S3 등으로 옮기면 객체 버전·매니페스트를 별도 백업해야 한다. 현재 검증은 데이터 비교이며 DB 역할/GRANT·시퀀스·외부 발송 상태까지 운영 복원을 완성했다는 의미는 아니다. dump는 비공개 접근 제한이 있는 경로에 보관하며 운영에서는 저장 암호화·호스트 밖 복제·키 분리·보존 정책을 추가한다.

## 실제 복구 전환의 남은 인수 기준

- 현재 도구는 --no-owner --no-privileges로 복원한다. EC2 복원에서는 owner/runtime 역할·최소 GRANT를 재적용하고 runtime 역할로 쓰기 허용/원장 변경 차단을 검증한다. 기존 DB에 덮어쓰지 않고 새 DB로 복원한다.
- migration 버전·전체 원장 합계·증빙 hash·회수된 역할 및 계정 상태를 확인한다. 시퀀스 값과 다음 쓰기 충돌 여부를 확인한다.
- 로그인·가족별 접근·초대·문서 미리보기·회비·입출금 조회를 합성 staging에서 확인한다. 오래된 백업에 남은 세션/초대 및 백업 이후 계정·권한 회수 내역을 재적용한 뒤 접근을 재개한다. DB 복원만으로 외부 발송을 다시 실행하지 않는다.
- 백업 저장소·자동 실행·실패 감시·보존기간·RPO/RTO·복구 담당자 지정. 키는 별도 복구 가능하도록 보관하고 키를 바꾸어 기존 암호문을 잃지 않게 한다.

## 배포 전 남은 작업

- EC2/리전/도메인·TLS 발급·갱신·보안그룹, 제한된 운영 계정·프로세스 재시작·Linux 실행 검증. 외부에는 HTTPS만 서비스하고 3000/8000/5432를 공개하지 않는다. 관리 접속은 제한한다.
- 운영 DB owner/runtime 분리, 비밀 주입, 데이터 영속 저장, 실제 HTTPS 브라우저 쿠키/CSRF·프록시 헤더·가입/로그아웃 테스트.
- 비밀번호 변경/분실 복구 및 계정 비활성화 UI는 미구현이다. 분실 본인확인·복구 담당자·전달 채널 결정 후 구현한다. 외부 카카오 발송은 계속 보류한다.
- 이미지 업로드 제한·격리 검사·운영 로그·오류/지연·백업 실패 감시, 배포/롤백 연습과 사용자 실기 검수.

이번에는 AWS 자원 생성·실제 서버 배포·외부 공개·자동 백업 예약을 하지 않았다. 가격/인스턴스 사양/출시일은 확정하지 않았다.

근거: [EC2 보안그룹](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules-reference.html), [PostgreSQL snapshot](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION), [검증 기록](../plans/ec2-operational-readiness.md).

## 서버 준비 후 작업 요청 템플릿

다음 요청을 대화에 붙여 넣고 아는 항목만 채운다. 미정인 값은 미정으로 남긴다. 서버 주소/접속 정보는 공개 저장소의 이 템플릿에 직접 기록하지 않는다.

```text
WORKBOARD.md의 WB-09와 docs/operations/ec2-readiness.md를 읽고
EC2 배포 준비를 이어서 진행해줘. 먼저 서버 상태를 확인하고,
현재 코드와 맞는 실행 구성·HTTPS·운영 DB·백업을 준비한 뒤 검증해줘.

- AWS 리전 / 인스턴스 ID:
- OS 및 버전 / CPU 아키텍처(x86_64 또는 arm64):
- 인스턴스 사양 / 디스크 용량:
- 접속 방법: SSM 또는 SSH(로컬 SSH 별칭/사용자/키 파일 경로)
- 도메인 / DNS 관리 위치 / 서버 주소:
- DB 위치: 같은 EC2 / RDS 등 별도 DB / 미정
- 이번 적용 범위: 합성 자료로 시험 배포 / 실제 자료 이전까지
- 현재 로컬 DB를 이전할지:
- 백업 보관기간 / 허용 데이터 손실시간 / 목표 복구시간: 미정이면 미정
- 비용 한도와 추가 AWS 자원 생성 허용 범위:
```

SSH 개인키·AWS 액세스키·DB 비밀번호·금융 암호키의 내용은 채팅이나 Git에 넣지 않는다. 이미 설정된 접속 프로필/SSM 또는 비공개 로컬 파일 경로로 연결한다. 실자료 이전은 원본 키와 dump를 비공개 경로로 전달하고 별도 복구 검증을 거친다.

이 문서는 후속 작업의 진입점이다. 구체적 구현·검증 이력은 `docs/plans/ec2-operational-readiness.md`, 현재 상태는 `WORKBOARD.md`를 함께 읽는다. 서버 생성/접속·DNS 변경·배포가 실행되었다는 기록은 실제 결과가 있을 때만 추가한다.
