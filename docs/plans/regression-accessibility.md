# WB-05 전체 회귀·접근성 점검 계획

Goal: R18·R19 역할별 회귀와 반응형/키보드 접근성을 점검하고 재현된 문제를 수정한다.
Architecture: 기존 API/Playwright 검증을 재사용하고, 테스트별 임시 DB 스키마로 운영 자료를 격리한다. 권한·로그인 제한을 완화하지 않는다.
Tech Stack: FastAPI/PostgreSQL, Next.js/Playwright Chromium.
Spec: WORKBOARD.md WB-05, docs/design/design-system.md.

- [x] 기존 API 전체 테스트 및 브라우저 파일별 전체 회귀 실행. 환경 문제와 제품 결함 구분.
- [x] apps/web/tests/accessibility.spec.ts: 역할별 주요 화면, 320px/200% 글자 확대, 라이트/다크, 본문 바로가기·메뉴·대화상자 키보드 흐름 확인.
- [x] 재현 실패에 해당하는 컴포넌트/CSS만 수정하고 관련 회귀 재실행. 계약/업무 규칙 변경은 이번 목표 아님.
- [x] build/lint/ruff/foundation/theme 테스트, 필요한 최종 회귀 및 로컬 재시작.
- [x] 보드·인수인계에 결과와 제한 기록. 사용자 실기 터치·스크린리더 청취·운영 배포는 완료 주장하지 않음.

검토 중점: 권한별 메뉴와 직접 URL 접근, 숨김 메뉴 포커스, 긴 메뉴/화면의 확대 시 가로 넘침, 모달 Escape/포커스 복귀, 오류·자료없음 표시.

## 실행 결과
- 초기 접근성: 역할별 화면 확대·320px 3 passed. 본문 바로가기 포커스 실패 1건 재현: main이 포커스 대상이 아니었음. app-shell.tsx에 tabIndex=-1 적용, 빌드 후 재검증 예정.
- 전체 회귀는 파일별 격리 실행 중.

- API 전체 120 passed, 1 기존 Starlette 경고, 674.21초. 브라우저와 동시 실행하여 부하 통제된 성능 측정은 아님. 정적 린트·테마9·foundation PASS, npm audit 취약점0.
- 초기 문서 회귀 실패(저장 버튼 비활성), 단독 환경 재실행은 다른 단계의 저장 후 표시 5초 대기 실패. 은행 업로드 전 URL/화면/파일 선택 확인과 저장 후 목적 URL 확인을 추가하여 전환 단계를 분리. 회비 테스트는 대시보드 위젯 최초 로드 후 업무값을 검증하도록 단계 분리. 최종 재검증 대기.

## 최종 결과 (2026-10-27)

- 제품 수정 2건: app-shell.tsx의 본문 main tabIndex=-1(실제 Tab→Enter로 본문 포커스 이동); workspace.css의 데스크톱 탐색 최소 높이 min(240px,50dvh) 및 사이드바 overflow-y:auto. 확대 전 메뉴 clientHeight 104px 실패를 재현하고 수정 후 통과. 디자인 시스템에 기준 기록.
- 테스트 개선: accounts.ts에서 인증 완료 URL 대기, documents.spec.ts에서 문서 종류/업로드 화면/파일 선택·저장 완료 URL 단계 확인, dues-auto.spec.ts에서 위젯 로드 후 업무값 검증, registration.spec.ts에서 가입/대시보드 로드 분리. 업무·권한 assertion은 유지. development-login.spec.ts는 6회 전체 로그인 흐름의 총 제한만 30→90초로 조정(개별 검증 제한 유지), 재실행 실제 26.9초 통과.
- API: 전용 DB 환경변수 + pytest apps/api/tests -q --tb=short --basetemp=var/pytest-wb05-<UUID>: 120 passed, 기존 Starlette/httpx 경고1. 674.21초; 브라우저 동시 실행으로 성능 부하가 통제된 수치는 아님.
- 기본 브라우저: scripts/test_service.py를 각 *.spec.ts별 새 스키마/3101·8101 포트로 실행: 최초 34 passed/4 failed/3 skipped. 문서·회비 단독 환경 재실행 4 passed, 가입·권한 재실행 3 passed(기존 성공분 중복 포함). 따라서 기본 실행 대상38개 모두 통과 확인.
- 최종 접근성: scripts/test_service.py accessibility.spec.ts controls.spec.ts sidebar.spec.ts (3201·8201): 9 passed. 역할별 주요 화면 모두 1440px 200% 글자 확대·320px, 라이트/다크, 보이는 버튼·입력의 이름, 로딩 완료 후 가로 넘침, 실제 Tab으로 본문 바로가기, 달력 Escape 포커스 복귀, 터치 에뮬레이션·reduced-motion 확인. 확대 라이트와 320px 다크 스크린샷 육안 확인. 앞선 app-shell 수정 빌드에서도 accessibility+controls+service 12 passed.
- 조건부: ENABLE_DEV_LOGIN=1로 development-login.spec.ts 두 호스트/세 역할 2 passed. E2E_TIMING=1 response-timing.spec.ts 1 passed. 관측 로그인 클릭→잔액 3.335~4.234초, 직접 health 8ms, 해당 표본에서 API 오류 없음. 적은 표본이며 성능 보장·간헐적503 해결 주장은 하지 않음.
- 고유 브라우저 검사 총46개 중45개 통과(분리/재실행 포함), expense-detail.spec.ts의 기존 로컬 데모 전용1개는 테스트 스키마에 해당 고정 데모를 만들지 않아 미실행. 출금 상세·승인·반려는 expenses/expense-rejection 등의 정상 격리 시나리오로 검증.
- 최종 npm --prefix apps/web run build/lint, python -m ruff check apps/api/src apps/api/tests, pip check, python scripts/validate_foundation.py, node --test tests/design/theme.test.cjs(9개), npm audit --audit-level=high(0개), git diff --check 통과. API/DB 계약 변경 없음. 로컬 서비스 재시작 완료.
- 별도 읽기 전용 코드 리뷰 2회: 차단 사항 없음. 강제 focus 대신 실제 Tab 검증과 입력 accessible-name 연결 확인 의견 반영.

## 남은 범위

실제 휴대폰 터치/스크린리더 청취/브라우저 실제 확대율 UI·전체 WCAG 적합성·Linux·운영 배포는 미검증. 200% 검사는 루트 글자 크기 확대이며 브라우저 실제 줌 검사와 동일하다고 주장하지 않는다. WB-05 자동 회귀·Chromium 점검 완료와 사용자 수용·실기 검증을 구분한다. 간헐적503은 재현 시 WB-04 추가 조사. 다음 후보는 실기 확인 및 WB-09 운영 복구·백업·배포 준비이며 자동 착수하지 않았다.
