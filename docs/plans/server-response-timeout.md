# WB-04 서버 응답 시간 조사 (2026-10-26)

요구사항 R19. 사용자 승인 범위: 응답 시간 초과 원인 조사 및 확인된 병목 수정.

## 사실과 한계

과거 기록에는 프록시 API_UNAVAILABLE 503과 Playwright의 로그인 URL/잔액 표시 5초 대기 초과가 함께 있다. 이번 정상 부하 측정에서는 실제 503/5초 타임아웃을 재현하지 못했다. 과거 실패 당시 계층별 시간이 없어 당시 503의 직접 원인은 확정할 수 없다. 모든 시간 초과가 해결됐다고 표시하지 않는다.

확인된 지연 요인은 요청 안의 중복 권한 조회와 매 조회마다 생성되는 PostgreSQL 연결이다. ReadService.capabilities가 membership 1회 + 같은 roles 2회를 읽고, 로그인/세션 응답과 family_access가 같은 요청에서 이를 재호출했다. 사용자·서버의 5초 제한은 변경하지 않았다.

## 측정

실제 금융 자료 없이 격리 테스트 DB와 합성 계정 사용. 연결 문자열·SQL 매개변수·토큰·비밀번호·응답 본문은 출력하지 않는다.

- DB 연결 12회: 중앙값 64.6ms, 최대 172.9ms. SELECT 1 중앙값 1.2ms. scrypt 4회 중앙값 173.9ms.
- API 내부 측정(TestClient): 로그인 연결 11회/전체 1436ms/연결 1067ms → 7회/706ms/488ms. 세션 8회/865ms/776ms → 4회/294ms/262ms. 대시보드 10회/898ms/810ms → 6회/512ms/453ms. 대시보드는 동기화 전 합성 경로다.
- 브라우저 세 역할 각 1회: 프록시 로그인 934~1197ms → 717~1023ms. 세션 574~893ms → 284~306ms. 클릭부터 잔액 표시 3292~3670ms → 2176~2603ms. 직접 API 로그인 938~1145ms → 662~757ms. 모두 HTTP 200.
- 표본이 적고 시스템 부하가 통제되지 않아 수치는 관측값이며 성능 보장/백분위 추정이 아니다. 안정적인 회귀 기준은 벽시계 시간이 아닌 중복 연결 횟수로 둔다.

## 변경

- domain.py: 한 권한 판정에서 역할 목록을 한 번 읽어 관리/역할관리 capability를 함께 판정.
- main.py: 인증 직후 권한 결과를 해당 Request.state에만 두어 family_access와 세션 응답에서 재사용. 로그인 응답도 방금 판정한 결과 재사용. 다음 요청은 세션·구성원·역할 유효기간을 다시 검증한다. 변경 업무 서비스의 별도 권한/잠금 판정은 유지.
- test_response_timing.py: 로그인 7/세션 4/대시보드 6 이하 연결 회귀. 변경 전 11 <= 7 실패 재현 후 통과.
- response-timing.spec.ts: E2E_TIMING=1일 때만 실행하는 계층별 진단. 실패하더라도 시간 로그 출력, 기본 회귀에서는 생략. scripts/test_service.py가 E2E_API_URL을 주입하므로 포트 대체 시 직접 API도 함께 바뀐다.
- API/DB 계약·비밀번호 해시 강도·프록시 타임아웃·실제 금융 자료 변경 없음.

## 검증 명령과 후속

TEST_DATABASE_URL/TEST_APP_DATABASE_URL은 var/postgres/connection.json의 전용 테스트 설정으로 주입한다.

- `python -m pytest apps/api/tests/test_response_timing.py apps/api/tests/test_auth.py apps/api/tests/test_api.py apps/api/tests/test_roles.py -q -s --tb=short`: 29 passed.
- `scripts/test_service.py response-timing.spec.ts service.spec.ts`(3101/8101 대체): 5 passed. 세 역할 로그인, 권한 제한, 세션 만료, API 장애 메시지, 모바일 테마 포함.
- 재측정: E2E_TIMING=1을 설정한 뒤 위 브라우저 명령 실행. 세 역할별 로그인 회수 제한에 영향을 주지 않도록 새 격리 스키마를 사용하는 runner로만 실행.
- 미확정 후보: CPU/디스크 경합, 초기 API 기동 지연. 기존 테스트 runner는 웹 /login 준비만 기다리므로 API 준비 여부도 실패 재현 시 함께 측정해야 한다. 현재 증거로 어느 후보도 당시 503의 원인으로 단정하지 않는다.
- 다음 실제 오류가 발생하면 동일 진단으로 status/요청 시간/직접 API 시간을 수집해 원인 확정. 운영 부하·장애 복구 검증은 별도다.

- `python -m pytest apps/api/tests -q --tb=short --basetemp=var/pytest-response-full`: **94 passed**, 198.41초. 기존 Starlette/httpx 경고 1건. 인증/역할 변경·만료·비활성·문서 ACL·출금·동기화 회귀 포함.
- `python -m ruff check apps/api/src apps/api/tests`, `npm --prefix apps/web run lint`, `python scripts/validate_foundation.py` PASS, `python -m pip check`, `node --test tests/design/theme.test.cjs`(9 passed), `git diff --check` 통과. 신규 테스트의 import 정렬/fixture 재정의 린트 지적은 수정 후 재검증했다.
- 웹 제품 코드/API 계약 변경이 없어 웹 빌드와 계약 재생성은 재실행하지 않았다. 기존 검증 빌드에서 브라우저 회귀를 실행했다.

- 최종 E2E_TIMING=1 진단 단독 재검증: 1 passed. 클릭→잔액 2278~2365ms, 프록시 로그인 704~801ms, 직접 health HTTP 200/5ms. 오류 시 로그 수집 코드는 준비했지만 이번 실행에 실제 오류는 없었다.
