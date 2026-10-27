# 실제 서비스 첫 실행 인수인계

기준일: 2026-10-23. 요구사항 R03/R06/R12/R14/R15/R18/R19의 첫 실행 범위이며 전체 요구사항 완료를 뜻하지 않는다.

## 구현
- apps/web/src/app: Next.js 로그인·대시보드·거래·관리·설정, 동일 출처 API 프록시.
- apps/web/src/features, components, lib: 기간·입출금 필터, BigInt 금액, 로딩·오류·재시도·401 로그인 복귀, 라이트/다크/시스템 테마.
- apps/api/src/family_ledger: FastAPI 개발 세션, 요청 시점 가족/역할 확인, CSRF/Origin, 읽기 전용 합성 저장소. [API 인수인계](api-foundation-handoff.md).
- packages/contracts/openapi.json, apps/web/src/generated/api.ts: 실행 계약과 생성 타입.
- scripts/dev.mjs, scripts/stop-dev.ps1: 루프백 실행, 포트 충돌 처리, 소유 프로세스 종료.

## 실제 검증
API pytest 19개, Ruff, pip check 통과. 웹 typecheck, lint, 최적화 build 통과. 브라우저 E2E 4개와 테마 Node 테스트 9개 통과. 1440/375/320px 라이트·다크 화면 확인. npm audit 취약점 0개(검사 시점 기준).

독립 리뷰에서 대사 대기 표기와 만료 세션 복귀 문제를 발견했다. “대사 필요” 표시와 401 로그인 복귀로 수정하고 회귀 E2E를 추가했다. 재검토 신규 차단 사항 없음. Starlette TestClient의 httpx 관련 deprecation warning 1건은 남아 있다.

## 미완료 범위
실제 웹/API 프로그램이지만 자료는 합성 데이터다. 개발 로그인은 비밀번호·사용자 등록이 없는 개발 전용 진입이며 운영 환경에서는 서버가 시작을 거부한다. PostgreSQL, 운영 인증, 영구 저장·감사, 회비/지출/승인 변경 흐름, 은행 연동, 알림은 미구현이다. 운영 출시 완료가 아니다.

다음 단계는 PostgreSQL·마이그레이션과 운영 인증 연결, 이후 확정 규정에 따른 업무 쓰기 흐름이다. 규정 미확정값은 허용이나 0으로 해석하지 않는다. Linux, 운영 배포, 스크린리더 수동 검사는 미검증이다. [실행 방법](local-development.md).


## 2026-10-27 누적 기능 커밋·화면 설정 제거
- 사용자 요청: 불필요한 화면 설정 제거 및 누적 작업 커밋·푸시. app-shell.tsx에서 메뉴 삭제, `/settings` 페이지 삭제, 신고 대상 소스 매핑 제거. 상단 화면 모드 선택 및 기존 테마 저장은 유지. 삭제 1개 소스 파일이며 DB/사용자 자료 삭제 없음.
- 커밋 범위: WB-01/04/06/07/18/19/20, R02·R04~R06·R10~R13·R18~R21 관련 대시보드 직접 조작, 문서 관리/파일 동기화, 실제 거래·자금 흐름, 가족 구성원/회비, 문의·핀·총괄 위젯, 조회 설정 저장과 관련 계약·마이그레이션·테스트·문서. 공통 파일/생성 계약 의존성이 얽혀 하나의 기능 묶음으로 보존.
- 제외: Git 제외 var/의 실제 DB·접속정보·백업·스크린샷·런타임·검증 산출물, private-data/ 및 개인 파일. 소스 후보는 py/ts/tsx/css/sql/json/md로 한정, 파일 경로별 목록 확인. 기존 staged 변경 없음. 비밀키/토큰/비밀번호 포함 DSN 패턴 검사에서 후보 없음(모든 형태의 비밀 유출을 보장하는 검사는 아님).
- 빌드 최초 실패: 제거한 /settings를 참조하던 `.next/dev/types/validator.ts`와 routes.d.ts가 남아 있었음. 자동 생성 파일 2개만 정리한 뒤 재빌드 통과. 소스 지침/DB 변경 없음.
- 검증 진행 및 최종 commit/push 결과는 WORKBOARD와 이 절에 기록한다. 사용자 인수 확인·운영 출시·카카오톡 발송은 별도이며 완료로 간주하지 않는다.

- 최종 정적 검증: 웹 build(타입 포함)·lint, 전체 API ruff, pip check, foundation PASS, 테마 단위 테스트9 통과, npm audit 취약점0. /settings 참조 없음 확인.
- API 전체 실행: 113 passed/7 setup errors(Windows 공용 pytest 임시 디렉터리 접근 거부). 새 `var/pytest-commit-<UUID>`를 --basetemp로 지정한 실패분 재실행은7 passed. 따라서120개 모두 실행 확인, 기존 Starlette 경고1 유지.
- 전체 브라우저 실행:22 passed/15 failed/3 skipped. 같은 계정을 한 환경에서 반복 로그인하면서 AUTH_THROTTLED에 걸린 것이 실패 원인. 보안 제한은 수정하지 않으며 실패한9개 파일을 각각 새 테스트 스키마에서 재실행. 개발 데모2개와 명시적 성능 측정1개는 환경 조건에 따른 skip.

- 실패9파일 격리 재실행:16개 모두 통과(기존 통과1개 중복 포함). 전체40개 중37개 실행 항목을 통과 확인, 조건부3개 미실행. 통장 업로드·회비·문의·위젯·설정 유지 회귀 확인. 단일 공유 환경의 전체 실행은 로그인 제한 때문에 통과하지 못했으며 파일별 실행 결과로 확인했다.
- 로컬 서비스 재시작 후 /login 200, 삭제된 /settings 404 확인. 실제 은행/카카오톡·운영 배포·실기 모바일은 이번 검증 범위 밖.

- Git 결과: 기능 커밋 `13fff0b` 완료(147개 경로). `git push origin main`은 자동 승인 검토가 대상 저장소·전송 범위의 명시적 승인 필요를 이유로 거부하여 실행되지 않았다. 대상은 https://github.com/LEEBEOMSHIK/family-financial-management-system.git 의 main이며, 사용자 확인 후 정상 push가 다음 행동이다.

- 후속 결과: 사용자가 저장소·main·147개 파일과 검증 기록 전송을 명시 승인하여 `git push origin main` 성공(`4c3eadd..494ef61`). 기능 `13fff0b`와 검증 기록 `494ef61` 반영 완료. 이번 후속은 문서 상태 갱신만 수행하며 제품 테스트는 재실행하지 않았다.
