# 대시보드 동기화 자료 연결

2026-10-26 / WB-07 / R06·R11·R18·R19. 사용자 요청에 따라 기존 동기화 거래를 모든 금융 위젯에 연결한다.

- 최신 성공 파일의 조회 종료일을 기준으로 해당 월(quarter API는 최근 3개월)을 집계한다. 업로드 시각이 늦은 과거 파일 때문에 기준 월이 뒤로 가지 않는다.
- 잔액은 거래일시·동일 시각 정규화 순번상 마지막 거래 후 잔액이며 기준 거래시각을 별도로 표시한다. 빈 성공 파일만 있으면 잔액 null(확인할 거래 없음), 합성값으로 대체하지 않는다.
- 수입/지출/순증감/분류/월별 흐름은 해당 기간 실제 거래를 정수로 집계한다. 월별 흐름은 거래가 있는 월만 표시한다. 파일 공백/부분 기간은 집계 자료 범위로 안내하며 완전한 월 전체 자료로 주장하지 않는다.
- 최근 거래 5건은 월 필터와 무관하게 전체 실자료에서 조회한다. 승인된 지급 예정은 실제 승인 후 송금 기록이 없는 요청 합계이고 은행 잔액에서 차감하지 않는다.
- 성공 동기화가 아직 없으면 기존 합성 예시 표시를 유지한다. 실자료 모드의 출처/기준 시각/집계기간을 표시하고 개발용 합성 문구를 제거한다.
- 화면 재진입·포커스 복귀와 새로고침으로 최신 자료를 조회한다. 위젯 배치 상태를 건드리지 않는다.
- 변경: API documents/dashboard.py, models.py/main.py, 웹 dashboard-view.tsx/use-resource.ts/도움말, 계약·생성 타입. DB 스키마 변경 없음.
- 검증: 격리 DB 집계/큰정수/과거파일/빈기간/권한, XLSX업로드 후 대시보드 표시·포커스갱신·합성 회귀, 빌드/타입/린트/foundation.

## 검증 기록

- 신규 격리 DB 테스트 2건이 기존 synthetic 응답으로 실패하는 것을 먼저 확인했다.
- 실자료 연결 후 test_bank_dashboard.py + test_api.py 13 passed.
- 지급 예정/송금 완료·분기 조회를 추가한 최종 `apps/api/.venv-pg/Scripts/python.exe -m pytest apps/api/tests/test_bank_dashboard.py apps/api/tests/test_bank_sync.py apps/api/tests/test_api.py -q --tb=short --basetemp=var/pytest-dashboard-bank-final`: **18 passed**. TEST_DATABASE_URL/TEST_APP_DATABASE_URL은 로컬 전용 테스트 설정으로 주입. 기존 Starlette/httpx 경고 1개.
- API 계약 재생성: `npm --prefix apps/web run contracts` 통과.
- 첫 빌드는 선택 응답 필드 coverage의 undefined 타입 오류로 실패. 빈 배열 처리 후 `npm --prefix apps/web run build` 통과(TypeScript 포함).
- Ruff에서 테스트 함수 줄바꿈으로 noqa 위치 오류 발생, 이름을 간결하게 바꾸고 `... -m ruff check apps/api/src apps/api/tests` 재검증 통과.
- `node --test tests/design/theme.test.cjs`: 9 passed. `... -m pip check`: 문제 없음.
- 브라우저 검증은 3001의 타 프로젝트를 건드리지 않도록 scripts/test_service.py 실행 시 메모리상 포트를 3101/8101로 대체한다.

## 한계

실제 은행 원본은 아직 제공되지 않아 개인정보 없는 합성 XLSX로 검증한다. 은행 실시간 연결·자동 송금·송금 대사는 이번 변경에 포함하지 않는다. 성공 동기화 전에는 기존 합성 예시가 명시적으로 표시된다. 빈 동기화 자료만 있을 때는 실제 잔액을 알 수 없다고 표시한다. 전체 API/전체 브라우저 회귀 대신 변경 관련 회귀를 실행한다.

- 브라우저 최초 7건은 4 passed/3 failed. 실패는 로그인 단계의 서버 연결 오류였으며 대시보드까지 진입하지 못했다. 같은 실행의 후반 4건(실제 XLSX→대시보드 갱신 포함)은 통과했다. 실패한 3건만 다른 검사 없이 단독 재실행하여 **3 passed**. 연결 지연의 근본 원인은 미확정이며 WB-04를 해결로 표시하지 않는다.
- 1440px 라이트·390px 다크 스크린샷을 직접 검토했다. 작은 수입/지출 위젯에서 기간 설명이 중복되어 공간을 차지하므로 기간은 상단 안내에 두고 위젯 제목에 기준 월만 표시하도록 줄였다.
- 실자료 갱신 E2E는 API로 후속 합성 XLSX를 등록한 뒤 창 포커스 이벤트를 발생시켜 잔액 1,700→1,800, 수입 1,000→1,100, 최근 거래 2→3으로 바뀌는 것을 확인한다. 기존 합성 API와 위젯 조작은 그대로 회귀 검증한다.

- 최종 문구 보완 후 `npm --prefix apps/web run build` 통과, `scripts/test_service.py zz-bank-sync.spec.ts` (3101/8101 대체): **1 passed**. 앞선 7건은 최초4+실패분 재실행3으로 전 항목 통과를 확인했다.
- `npm --prefix apps/web run typecheck`, `run lint`, `python scripts/validate_foundation.py`(PASS), `git diff --check` 통과. DB 스키마/기존 거래 변경 없음.
- 수정 파일: `apps/api/src/family_ledger/documents/dashboard.py`, `models.py`, `main.py`; `apps/web/src/features/dashboard/dashboard-view.tsx`, `dashboard-help.tsx`, `apps/web/src/lib/use-resource.ts`; OpenAPI/생성 타입; `test_bank_dashboard.py`, `zz-bank-sync.spec.ts` 및 현재 상태 안내 문서.
- 사용자 확인 대기: 등록한 원본의 최종 잔액·월 입출금 합계가 대시보드와 맞는지 확인. 실제 원본으로 직접 대조하지는 않았다.

- `node scripts/dev.mjs --production-build`로 로컬 재시작 후 `Invoke-WebRequest http://localhost:3000/login`: HTTP 200 확인.

## 실제 자료 등록 확인 (2026-10-26)

사용자가 지정한 암호 해제 원본을 로컬 총무 문서 업로드 API로 등록했다. 원본 조회기간 2025-10-26~2026-10-26, 신규 12건·중복 0건·동기화 성공. 이후 대시보드/입출금 API의 bank_import 모드와 거래 총 12건, 대시보드 최종 잔액이 원본과 같음을 확인했다(거래값은 출력하지 않음). 대시보드 집계기간 2026-10-01~2026-10-26. 앞의 실제 원본 미검증 표기는 개발 검증 당시 상태이며 이번 원본 등록으로 해당 파일에 대한 검증을 완료했다. 원본 파일은 수정하지 않았다.

## 입출금 목록 간소화 (2026-10-26)

WB-07 / R11·R18·R19. 사용자 요청: 거래 내용/분류 칸의 정보 과밀과 원본 다운로드 제거, 대사 상태 용어 설명.

- 입출금 목록과 대시보드 최근 거래의 공통 표시를 거래일·내용·구분·금액 4열로 정리했다.
- 목록에서 은행 분류·메모·거래 후 잔액·원본 문서명/다운로드·대사 상태를 제거했다. 자세한 내용/증빙은 총무·관리자에게 문의하도록 안내한다.
- 원본 보관·문서 관리자의 다운로드 권한·은행 거래/대사 데이터는 변경하지 않는다. DB/API 계약 변경 없음.
- 수정: transaction-list.tsx, transactions-view.tsx, workspace.css의 미사용 상세 표시 규칙, service.spec.ts/zz-bank-sync.spec.ts의 기존 회귀 기대값.
- 대사는 은행 실제 거래와 시스템 송금 기록의 일치 여부 확인이다. 자동 대사는 아직 미구현이며 기존 가져온 거래는 pending으로 표시되고 있었다. 이번 변경은 사용자 목록 표시를 제거하는 작업이다.

- `npm --prefix apps/web run build`(타입 포함), `run lint`, `python scripts/validate_foundation.py`(PASS), `git diff --check` 통과.
- `scripts/test_service.py service.spec.ts zz-bank-sync.spec.ts`(3101/8101 대체) 최초 3 passed/2 failed. 변경된 목록 4열·상세/다운로드/대사 제거·동기화·모바일 검증은 통과했다. 실패 2건은 장애/만료 시나리오 주입 전 초기 잔액 표시의 5초 대기 초과였다. 로그인 전환과 초기 로딩 대기를 분리하고 15초로 맞췄다. 실제 장애/만료 검증 조건이나 서버 제한 시간은 변경하지 않았다. WB-04 응답 지연 해결로 주장하지 않는다.
- 320px 합성 거래 화면을 직접 검토: 날짜·내용·구분·금액만 표시되며 원본 다운로드와 대사 상태 없음. 원본/실제 금융 데이터 수정 없음. API/DB 변경이 없어 API 회귀는 재실행하지 않았다.

- 실패분만 `scripts/test_service.py service.spec.ts -g "expired session|API outage"`(3101/8101 대체) 재실행: **2 passed**. 최초 통과 3건과 합쳐 선택한 5개 시나리오 확인 완료. 로컬 서버를 새 빌드로 재시작했다.

## 자금 흐름 주·월 전환 (2026-10-26)

WB-07 / R11·R18·R19. 사용자 요청: 현재일 기준 주/월 단위로 자금 흐름 확인, 완료 후 다음 작업 확인.

- 서버의 Asia/Seoul 오늘 기준, 주는 월요일 시작 최근 8주, 월은 최근 6개월. 이번 기간은 오늘까지만 집계한다. 기간 길이는 구현 기본값이며 사용자 지정 날짜를 추가하지 않는다.
- 자금 흐름 위젯만 주/월 전환한다. 잔액/수입·지출 요약 등 다른 위젯의 기준은 변경하지 않는다.
- 별도 읽기 API dashboard/flow?unit=week|month와 계약/타입. 오늘·조회범위·자료 범위·구간별 수입/지출/마지막 확인 잔액·자료 없음/부분/조회기간 포함 상태를 반환한다.
- 자료가 없는 구간의 금액은 null이다. 자료가 확보된 무거래 구간만 0으로 표시한다. 잔액 이월은 마지막 거래부터 해당 기간 끝까지 연속 조회 자료가 있을 때만 허용한다. 자료 공백에는 잔액 선을 잇지 않는다.
- 기간 표시·정확한 금액 표·키보드 가능한 주/월 버튼·모바일 줄바꿈. 실제 금융 자료는 로그/테스트에 복사하지 않는다.
- DB 변경 없음. 검증은 한국시간/월·연도·윤년 경계와 빈/부분/연속 구간 단위, 격리 DB 권한/집계 API, 브라우저 전환과 다른 위젯 유지, 빌드·린트·계약·foundation.
- 다음 작업은 보드 확인/추천까지만 수행하며 별도 작업에 자동 착수하지 않는다.


### 구현 및 검증 기록

- 변경 파일: API `cash_flow.py`, `main.py`; 웹 `cash-flow-widget.tsx`, `dashboard-view.tsx`, `use-resource.ts`, 프록시 `route.ts`, `workspace.css`; OpenAPI/생성 타입; `test_cash_flow.py`, `test_cash_flow_api.py`, `cash-flow.spec.ts`, `zz-bank-sync.spec.ts`.
- 신규 순수 집계 테스트 4건은 모듈 미구현으로 실패 후 구현하여 통과. KST 자정·연도/윤년 경계·큰 정수·누락/부분 구간·미래 거래 제외 확인.
- 전용 DB 환경에서 `apps/api/.venv-pg/Scripts/python.exe -m pytest apps/api/tests/test_cash_flow.py apps/api/tests/test_cash_flow_api.py apps/api/tests/test_bank_dashboard.py apps/api/tests/test_api.py -q --tb=short --basetemp=var/pytest-cash-flow`: **19 passed**. 일반사용자 조회, 타 가족/비로그인 차단, 잘못된 단위 거부 포함. 기존 Starlette/httpx 경고 1건.
- `npm --prefix apps/web run contracts`, `run build`(타입 검사 포함), `run lint`, `... -m ruff check apps/api/src apps/api/tests`, `... -m pip check`, `node --test tests/design/theme.test.cjs`(9 passed) 통과.
- `python scripts/validate_foundation.py`: PASS. `git diff --check` 최초 파일 끝 빈 줄 지적은 제거 후 통과.
- 브라우저 최초 7개 시나리오 중 주/월 전환 시나리오가 초기 로그인 URL 전환 5초 대기 초과로 실패했다. 실패분 단독 재실행은 1 passed. 제품 타임아웃/테스트 대기 시간은 늘리지 않았으며 근본 원인은 WB-04 미해결이다.
- 합성 자료 1440px 라이트/320px 다크 화면을 검토하고 큰 화면의 차트와 날짜 눈금 너비를 맞췄다. 390/320px 가로 넘침 없음 검증. 실제 금융 원본은 화면 캡처나 테스트 자료에 사용하지 않았다.
- 미검증: 실제 휴대전화 터치, 전체 API/브라우저 회귀, 은행 실시간 연동. 기존 거래/원본/DB 스키마 변경 없음. 사용자 화면 수용 확인 대기.
- 다음 추천: WB-04 서버 응답 시간 초과 재현·측정·원인 조사 → WB-05 역할별 출시 전 회귀·접근성. 이번 요청은 확인/추천까지이며 후속 작업에 착수하지 않는다.

- 차트 정렬 보완 후 `npm --prefix apps/web run build`, `run lint` 재검증 통과. `scripts/test_service.py cash-flow.spec.ts service.spec.ts zz-bank-sync.spec.ts`(실행 시 3101/8101 대체) 최종 **7 passed**. 주/월 키보드 전환·다른 위젯 유지·오류/재시도·로그인 만료·테마/모바일·문서 동기화 후 갱신 포함.
- `node scripts/dev.mjs --production-build`로 로컬 재시작. localhost:3000/login HTTP 200. 일반사용자 세션으로 실제 주/월 API를 읽어 bank_import, 주 8/월 6 구간, 오늘 2026-10-26과 이번 주 10-26~10-26/이번 달 10-01~10-26 확인. 금액/개인정보 출력·원본 재등록 없음.


## 그래프 금액 직접 확인 보완 (2026-10-26)

WB-07 / R11·R18·R19. 사용자 피드백: Y축 금액과 호버 금액이 없어 그래프에서 얼마인지 알 수 없음.

- Y축에 금액 눈금과 원 단위 안내를 추가한다. 큰 축 값은 만/억/조로 축약하고 가까운 0 눈금 중복은 방지한다.
- 기간별 영역 호버/키보드 포커스/터치 시 기간·수입·지출·확인 잔액·자료 범위를 표시한다. Escape로 닫을 수 있고, 기존 정확한 금액 표도 유지한다.
- 금액은 BigInt/기존 Money 컴포넌트로 표시한다. 자료 없음은 —, 확인된 0원은 0원이다. API·DB·집계 계약 변경 없음.
- 변경 파일: `cash-flow-widget.tsx`, `workspace.css`, `cash-flow.spec.ts`, WORKBOARD 및 이 인수인계.
- 합성 고정 응답으로 큰 정수·음수·0·자료 없음, 호버·키보드·320px 터치와 기존 주/월 전환·오류 재시도를 검증한다. 실제 금융 자료는 테스트/스크린샷에 넣지 않는다.

- 실제 실행: `npm --prefix apps/web run build`(타입 포함), `run lint`, `python scripts/validate_foundation.py` PASS, `git diff --check` 통과. 빌드 중 한 차례 .next 디렉터리 mkdir EPERM 발생, 권한 허용 환경에서 동일 빌드 재실행 통과.
- `scripts/test_service.py cash-flow.spec.ts`(3101/8101로 실행): 최초 2 passed/모바일 탭 1 failed. 마우스 합성 이벤트로 터치 툴팁이 닫히는 경로를 pointerType 구분으로 수정한 뒤 **3 passed**. 1440px 차트 축과 320px 모바일 툴팁 스크린샷 직접 확인.
- 미검증: 실제 휴대전화 실기. 터치는 Playwright 터치 에뮬레이션으로 확인했다. API/DB 변경이 없어 서버 테스트는 재실행하지 않았다. 사용자 수용 확인 대기.
