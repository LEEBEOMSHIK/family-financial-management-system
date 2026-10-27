# Docker 없는 로컬 개발

설치·초기 계정·가족 초대·백업·복구는 [DB·계정 운영 안내](postgres-local.md)를 따른다. Windows Node 24.18.0, Python 3.14.9 x64, PostgreSQL 18.6을 사용한다.

`node scripts/dev.mjs --production-build`로 실행한다. 웹은 http://127.0.0.1:3000, API는 8000이다. AUTH_PROVIDER=local_password와 PostgreSQL을 사용하며 개발 설정에 따라 별도 테스트 계정 버튼도 제공한다. 카카오뱅크 원본 등록 시 입출금 내역과 대시보드 잔액·입출금 위젯에 동기화 자료를 표시하며 문서별 기간·결과를 보관한다. 동기화 전에는 합성 예시임을 표시한다. 상세 범위는 WORKBOARD의 WB-07을 따른다. 기본 계좌와 증빙을 위한 비공개 키 초기화·복구는 [계좌·증빙 운영 안내](accounts-evidence.md)를 따른다.

## 검증 명령

| 위치 | 명령 |
| --- | --- |
| root | python scripts/validate_foundation.py |
| root | node --test tests/design/theme.test.cjs |
| root | apps/api/.venv-pg/Scripts/python.exe -m pytest apps/api/tests -q --tb=no |
| root | apps/api/.venv-pg/Scripts/python.exe -m ruff check apps/api/src apps/api/tests |
| root | apps/api/.venv-pg/Scripts/python.exe -m pip check |
| apps/web | npm run contracts |
| apps/web | npm run typecheck |
| apps/web | npm run lint |
| apps/web | npm run build |
| root | apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py |
| apps/web | npm audit --audit-level=high |

API 테스트의 전용 DB 환경변수 설정은 운영 안내를 따른다. 빌드 전에 웹을 종료한다. 브라우저 검증은 빌드 결과와 Chrome을 사용하며 전용 스키마와 3001/8001 서버를 자동 생성한다. CHROME_PATH로 Chrome 경로를 지정한다. 결과는 Git 제외 var/service-e2e/에 기록한다.

Ctrl+C 또는 `powershell -File scripts/stop-dev.ps1`로 웹/API를 종료한다. DB는 `scripts/stop_database.ps1`로 별도 종료한다. Linux 경로 지원은 있으나 실기 검증은 미수행이다.

## 로컬 테스트 로그인 주소 수정 (2026-10-24)

R03·R18: `WEB_ORIGIN`이 127.0.0.1로 지정되면 localhost의 테스트 로그인이 403으로 거부되었다. 웹 테스트 로그인 경로와 API의 허용 출처를 동일 포트의 `localhost`/`127.0.0.1` 두 주소로 맞췄다. 외부 호스트·다른 포트·HTTPS 출처는 계속 거부한다. 쿠키는 각 호스트별로 유지하므로 주소를 바꾸면 해당 주소에서 다시 로그인한다.

변경 파일: `apps/api/src/family_ledger/main.py`, `apps/web/src/app/api/v1/dev/session/route.ts`, `apps/api/tests/test_local_origins.py`, `apps/web/tests/development-login.spec.ts`.

실행 검증:
- `apps/api/.venv-pg/Scripts/python.exe -m pytest apps/api/tests/test_local_origins.py apps/api/tests/test_api.py -q --tb=no`: 수정 전 신규 2건 실패 재현, 수정 후 13 passed. 기존 Starlette/httpx 경고 1건.
- `npm --prefix apps/web run build`, `npm --prefix apps/web run lint`: 통과.
- `apps/api/.venv-pg/Scripts/python.exe -m ruff check apps/api/tests/test_local_origins.py apps/api/src/family_ledger/main.py`: 통과.
- 웹 디렉터리에서 `$env:ENABLE_DEV_LOGIN='1'; node node_modules/@playwright/test/cli.js test development-login.spec.ts`: 재시작한 실제 로컬 서비스에서 2 passed. 두 주소 × 세 역할 로그인, 대시보드 로드, 계좌 조회, 비허용 출처 차단 확인. 테스트 데이터 변경 없이 개발 계정 세션만 생성.

전체 API/브라우저 회귀 테스트는 이번 수정에서 재실행하지 않았다. 외부 배포·다른 기기에서의 LAN 접속은 검증 범위 밖이다.

## 출금 요청 화면 확인용 데이터 (2026-10-24)

R04·R05·R18. 사용자의 요청에 따라 로컬 일반사용자 테스트 계정에 가상 지급 계좌와 승인 대기 요청 2건을 생성했다. `[테스트] 가족 모임 식비 정산 · 영수증 첨부` 125,000원, `[테스트] 다음 가족 모임 준비비 선지급 · 영수증 추후 제출` 80,000원. 실제 계좌·결제 자료가 아니며 승인 정책은 변경하지 않았다. localhost:3000/login에서 일반사용자/총무/총괄관리자 테스트 로그인 후 출금 요청 메뉴로 확인한다.

변경 파일: `scripts/prepare_expense_demo.cjs` (정상 API/UI를 통한 생성, 동일 이름이 있으면 재생성하지 않음), `apps/web/tests/expense-rejection.spec.ts` (반려 및 처리 이력 보존 검증). 기존 개발 데이터는 삭제하지 않았다.

실행 결과:
- `node scripts/prepare_expense_demo.cjs` 두 차례 통과: 2건 중복 생성 없이 세 역할에서 승인 대기 및 영수증 이미지 디코딩 확인. 스크린샷은 Git 제외 `var/expense-demo/`.
- `apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py expenses.spec.ts`: 2 passed. 정산 제출·총무 승인·요청자 결과 확인, 기본 계좌 변경 시 기존 요청 보존, 선지급 사후 증빙 검증.
- `apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py expense-rejection.spec.ts`: 최초 2회 로그인 후 로딩 5초 대기 초과. 화면 이동/데이터 로딩 대기를 분리한 후 1 passed. 총괄관리자 반려, 요청자 사유 표시, 처리자·시각·정책 버전 기록, 재처리 409 및 반려 결과 보존 확인.
- `npm --prefix apps/web run lint`: 통과 (마지막 테스트 대기 시간 보완 전 실행).

승인·반려 검증은 폐기 가능한 별도 테스트 스키마에서만 실행했다. 로컬 확인용 2건은 승인 대기로 유지하며, 정책 미확정으로 검토/확정 버튼은 비활성이다. 실제 송금·대사 및 외부 배포는 검증하지 않았다.

디자인 미리보기는 docs/design/preview.html, 독립 테마 검증은 `node scripts/verify_theme_browser.cjs`다.

공개 배포·HTTPS·계정 복구, 규정 기반 금융 변경 API, 은행 연동, worker/outbox는 미구현이다. 이전 인수인계의 JSON 개발 세션 안내는 당시 기록이며 현재 실행 절차에는 적용하지 않는다.
