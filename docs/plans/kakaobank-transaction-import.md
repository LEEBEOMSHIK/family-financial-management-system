# 카카오뱅크 거래내역 업로드·동기화

2026-10-26 / WB-07 / R06·R11·R12·R13·R18. 로컬 개발 검증 완료, 사용자 확인 대기.

## 확정한 요구와 인수 기준

사용자가 이미지와 실제 엑셀 셀 구조가 같다고 확인했다. 추가 원본 요청 없이 이미지의 서식을 구현했다. 실제 이름·계좌·거래값을 코드/테스트/로그에 복사하지 않았다.

- 총무·총괄관리자 등록 시 원본 저장과 DB 거래 반영을 같은 트랜잭션으로 처리한다.
- 문서 및 버전마다 동기화 상태, 파일 조회기간, 실제 거래 존재 기간, 신규/기존 건수, 처리시각을 표시한다.
- 입출금 내역은 실제 업로드 자료를 조회하고 합성 거래와 섞지 않는다.
- 오류/모호성은 파일 전체 ‘확인 필요’로 남기고 신규 거래를 반영하지 않는다. 원본과 이전 거래를 보존한다.

## 파싱 계약

제목 ‘카카오뱅크 거래내역’, 표 앞의 성명·계좌번호·조회기간·요청일시와 다음 7열을 읽는다. 이미지의 B:H/11행 구성을 지원하며 빈 행 이동은 열 제목으로 식별한다.

| 열 | 저장/표시 |
| --- | --- |
| 거래일시 | Asia/Seoul 거래 시각 |
| 구분 | 입금/출금과 금액 부호 일치 검사 |
| 거래금액 | 정수/BIGINT, API 10진 문자열 |
| 거래 후 잔액 | 정수/BIGINT, API 10진 문자열 |
| 거래구분 | 은행 유형 |
| 내용 | 거래 적요 |
| 메모 | 원본 메모 |

문자열/숫자 금액, shared/inline strings, Excel 날짜(1900/1904)·문자열 날짜를 처리한다. 수식·외부 링크·매크로는 허용하지 않는다. 단일 시트, 6MiB, 압축 해제 24MiB, 거래 2,000건 한도이며 큰 자료는 조회기간을 나눠 등록한다. CSV도 동일 메타정보/열이 있어야 한다. 금액에 float를 사용하지 않는다.

## 정합성·권한·이력

- 서버의 현재 가족 구성원/유효 역할을 검증한다. 원본·문서 목록·동기화는 관리 역할만, 거래 조회는 기존 view_transactions 권한을 따른다. 일반사용자 응답에 비공개 원본 연결/파일명은 제공하지 않는다.
- 기존 가족 잠금으로 동시 업로드를 직렬화한다. 같은 업로드 operation ID, 문서 버전/파서 버전은 멱등 처리한다. 타임아웃은 결과 불명으로 표시하고 같은 작업으로 확인한다.
- 가족별 공동통장 하나를 대상으로 한다. 최초 성공 파일의 성명/계좌 표시 식별값을 암호화하여 보관하고 후속 파일과 비교한다. 마스킹된 표시만으로 계좌 진위를 증명하지 못한다. 다중 통장·교체·은행 실시간 인증은 후속 범위다.
- 같은 시각·금액·잔액을 핵심 식별자로 삼되, 파일 내 반복과 양방향 모두 가능한 거래 순서는 모호성으로 거절한다. 같은 시각 그룹의 정규화 순번을 보존하고, 후속 파일의 동일 시각 신규 거래·기존 순서 변경은 확인 필요로 남긴다. 기존 핵심값과 적요/메모가 다르거나 겹친 기간에 기존 거래가 누락되면 확인 필요로 남긴다.
- 원본 내 순서와 잔액 체인, 연속해서 자료가 확보된 기간의 경계 잔액을 검사한다. 날짜가 같은 초인 내림차순도 잔액으로 확인한다. 자료 공백이 있는 기간은 연속 동기화로 주장하지 않는다.
- 문서·동기화 결과·은행 거래·문서별 행 연결은 추가형 기록이다. 수정/삭제/덮어쓰기하지 않는다. 오류 원본은 새 버전으로 보완한다.
- 파일 조회기간과 실제 거래 존재 기간을 구분한다. 거래 0건과 신규 반영 0건도 표시한다. 파일 요청시각을 기준으로 하며 현재 실시간 은행 잔액으로 주장하지 않는다.
- 은행 거래는 수동 송금·승인 원장과 별개다. 자동 송금, 자동 지급완료, 자동 대사, 이중 차감은 하지 않는다. 대시보드 합성 자료 계산은 이번 범위 밖이다.

## 변경 파일·복구

- API: documents/statement.py, sync.py, transactions.py, models.py, repository.py, routes.py 및 main.py/models.py.
- DB: migrations/008_bank_statement_sync.sql — 동기화·은행 거래·행 연결 3개 테이블과 불변 트리거. 신규 테이블만 추가한다.
- 웹: bank-sync-summary.tsx, documents-view.tsx/document-upload.tsx, transactions-view.tsx/transaction-list.tsx, API 프록시·계약/생성 타입·공통 스타일·사이드바 자료 출처 안내.
- 테스트: test_bank_statement.py, test_bank_sync.py, zz-bank-sync.spec.ts. zz 테스트는 같은 테스트 가족에 실제 자료를 등록하므로 합성 자료 조회 회귀 뒤에 실행한다.
- 복구는 DB와 FINANCIAL_DATA_KEY를 함께 백업/복원한다. 앱 버전 롤백 시 신규 테이블을 삭제하지 않는다. 이전 앱에서는 새 동기화 기능만 제공되지 않는다.

## 검증 기록

- 파서 신규 테스트: 구현 전 모듈 없음으로 실패, 구현 후 8 passed. 같은 초 역순 회귀 1 failed 재현 후 보완하여 10 passed (숫자 날짜/shared strings/수식 포함).
- 격리 DB 초기 검증: test_bank_sync.py + test_documents.py 5 passed. 반복/중첩/누락/빈 파일/타 계좌/권한/원본 연결/불변 기록 검증.
- 브라우저 최초 6건: 5 passed, 1 failed. 새 동기화 테스트가 먼저 만든 원본 때문에 기존 문서 테스트의 전체 카드 수 1건 가정이 실패했다. 기능 오류가 아니라 테스트 간 같은 가족 데이터 공유였으며 새 테스트를 합성 조회 회귀 뒤로 이동했다.
- 빌드(TypeScript 포함), ESLint, Ruff, pip check, 테마 단위 9건 통과.
- 1440px 문서·버전 이력과 320px 실제 입출금 화면을 스크린샷으로 직접 확인했다. 테스트에서 1440/390/320px 페이지 가로 넘침 없음 확인.
- 최종 전체 API·브라우저 및 로컬 적용 결과는 아래 기록을 따른다.

## 미검증·후속

실제 은행 원본 XLSX(이미지만 제공), Linux/실물 모바일/운영 배포, 악성코드 검사, 다른 은행/다중 계좌는 미검증 또는 미구현. 이번 실행은 개인정보 없는 합성 XLSX로 검증한다. 대시보드 실자료 연결·송금 대사는 WB-07 후속이다. 사용자 실제 자료 등록은 아직 하지 않았다.

## 최종 검증 명령·인수인계

- `apps/api/.venv-pg/Scripts/python.exe -m pytest apps/api/tests -q --tb=short --basetemp=var/pytest-bank-final`: **83 passed**, 기존 Starlette/httpx 경고 1개. TEST_DATABASE_URL/TEST_APP_DATABASE_URL은 로컬 전용 테스트 연결 설정에서 주입(값은 기록하지 않음).
- 동일 시각 그룹 순서 추가 보완 후 `... -m pytest apps/api/tests/test_bank_statement.py apps/api/tests/test_bank_sync.py -q --tb=short --basetemp=var/pytest-bank-final-focused`: **15 passed**, 경고 동일.
- `npm --prefix apps/web run contracts`, `run build`, `run typecheck`, `run lint`: 통과. `npm --prefix apps/web audit --audit-level=high`: 취약점 0개.
- `... -m ruff check apps/api/src apps/api/tests`, `... -m pip check`: 통과. `node --test tests/design/theme.test.cjs`: 9 passed.
- `python scripts/validate_foundation.py`: PASS. `git diff --check`: 오류 없음(CRLF 알림만 있음).
- reviewer의 경계 잔액·동일 초 역순·양방향 모호성·파일간 순번·날짜 필터 복구 지적을 반영했고 최종 읽기 전용 재검토에서 추가 차단 사항 없음.
- 로컬 소유자 연결로 `family_ledger.postgres.migrate()` 실행: 008 성공. 기존 거래나 문서 원본을 수정/삭제하지 않음.
- 브라우저 러너는 `scripts/test_service.py`의 기본 포트 3001/8001을 메모리상 3101/8101로 대체하여 실행. 기존 3001 타 프로젝트는 종료/변경하지 않음.

- 최종 브라우저: `scripts/test_service.py documents.spec.ts document-upload.spec.ts service.spec.ts zz-bank-sync.spec.ts` (위 포트 대체 적용): **10 passed**. 기존 합성 조회·권한·업로드·버전·실제 동기화·중복·날짜 오류 복구·모바일 검증.
- `node scripts/dev.mjs --production-build` 숨김 창으로 로컬 재시작. `Invoke-WebRequest http://localhost:3000/login`: HTTP **200**.
- 확인 동선: 문서 관리 → 통장 내역 문서 → 문서 업로드 → 원본 등록. 결과 카드·버전 이력에서 기간과 건수 확인 후 입출금 내역에서 실제 거래 조회.
- 최종 사용자 확인은 대기이며 실제 개인정보 파일을 대신 등록하지 않았다.

## 후속 연결 (2026-10-26)

사용자의 추가 요청으로 대시보드 실자료 연결을 구현했다. 위의 대시보드 후속 표기는 당시 범위이며 최신 집계 기준·검증·한계는 [대시보드 실자료 기록](dashboard-bank-data.md)을 따른다. 송금 대사와 은행 실시간 연동은 계속 후속이다.


## 입출금 합계 표시·페이지당 건수 (2026-10-27)
- WB-07 / R06·R11·R19. 합계 표시 토글 기본 꺼짐. 켜면 조회 조건 전체의 입금 합계·출금 합계(양수)·입출금 차액을 표시. 페이지 합계/통장 잔액과 구분. 20/50/100건 선택(기본50), 건수/기간/방향 변경 시 첫 페이지 복귀. 합성/실제 자료 모두 페이지네이션 적용.
- API: transactions GET에 limit(1~100, 기본50) 추가. TransactionsResponse에 income_krw/expense_krw/net_krw 10진 문자열 및 limit 추가. 실제 자료는 같은 family/방향/기간 조건으로 SQL 정수 합계 산출 후 목록만 LIMIT/OFFSET. 빈 결과 0, 큰 정수 정확성 유지. 서버 권한 기존 검증 유지, DB 변경 없음.
- 변경 파일: API main.py·models.py·documents/transactions.py, OpenAPI/생성 타입, 웹 transactions-view.tsx·workspace.css, test_bank_dashboard.py·transaction-totals.spec.ts, 보드/이 문서.
- `pytest test_bank_dashboard.py test_bank_sync.py test_api.py -q --tb=short`: 19 passed(52.10초, 기존 Starlette 경고1). 큰 금액·페이지 간 합계 유지·방향/빈 기간·limit 범위 및 권한/동기화 회귀.
- `scripts/test_service.py transaction-totals.spec.ts zz-bank-sync.spec.ts` 격리3101/8101: 2 passed(24.4초). 65건 합성 응답 UI 토글/페이지 크기/다음/첫 페이지 복귀/빈 결과와 실제 합성 통장 파일 업로드·조회 회귀. 390px 넘침 없음.
- build(타입 포함)·lint·수정 모델/조회/테스트 ruff·foundation PASS·git diff --check 통과. 로컬 production-build 재시작. 실제 원장 자료 변경 없음.
- 미검증: 대규모 조회 성능·실기 모바일·전체 서비스 회귀. 합계 토글/페이지 크기는 현재 화면 상태이며 새로고침 시 기본값으로 돌아감. 사용자 확인 대기.


## 입출금 표시 설정 유지 (2026-10-27)
- WB-07 / R19. 이전 ‘새로고침 시 기본값’ 동작을 사용자 요청으로 변경. 합계 표시 여부와 페이지당 건수를 같은 브라우저의 localStorage에 가족 ID/계정 ID별로 저장. 다른 화면/새로고침/재로그인 시 복원, 다른 계정과 분리. 다른 기기/브라우저 간 동기화는 이번 범위 밖.
- 새 view-preferences.ts와 transactions-view.tsx: 설정 복원 전 목록 요청 보류, 20/50/100 및 boolean만 수용, 잘못된 저장값은 기본값 사용. 저장 불가 시 현재 화면 상태는 유지하고 안내. 거래/금액/검색 조건·권한은 저장하지 않음. API/DB 변경 없음.
- transaction-totals.spec.ts에 새로고침·다른 화면 복귀·켜짐/꺼짐 유지·다른 계정 기본값·원래 계정 복원 확인 추가.

- 검증: `scripts/test_service.py transaction-totals.spec.ts`(3101/8101) 1 passed(21.4초), build(타입 포함)·lint·foundation PASS·git diff --check 통과. API 회귀/실기 모바일/저장 차단 상황 자동 검증은 미실행. 로컬 production-build 서비스 재시작, 사용자 확인 대기.
