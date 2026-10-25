# 출금 요청·승인 구현 계획

요구사항 R04 및 사용자 요청: 일반사용자가 출금을 요청하고 총무/총괄관리자가 승인 처리한다. 실제 송금은 은행 앱에서 수행하며 승인 자체로 원장 잔액을 차감하지 않는다.

## 설계
요청자가 금액(원 정수 문자열), 목적, 수취인 이름, 희망 지급일을 입력한다. 전체 계좌번호는 이번 입력 범위에 포함하지 않는다. 제출 후 원문은 고정하며 재요청은 별도 요청으로 기록한다. 본인 요청 목록 및 상태/결정 이력을 제공하고 총무/총괄관리자는 가족 내 승인 대기 요청을 확인한다. 일반사용자는 타인 요청을 조회하지 못한다.

승인 규칙은 사용자 확인 대기: 두 관리자 역할 중 한 명의 승인으로 확정, 자기 승인 불가, 금액별 추가 단계 없음. 미확정 시 승인 API는 POLICY_NOT_CONFIGURED로 차단한다. 증빙 필수 여부는 UNVERIFIED이며 파일 업로드/지급 실행은 이번 범위에 없다.

## 파일 및 순서
1. migrations/003_expenses.sql, expenses/models.py·repository.py·routes.py: DB 저장, 요청 시점 권한, 일회 처리 및 append-only 결정. 기존 main.py에는 라우터 연결만 추가.
2. tests/test_expenses.py: 본인 조회, 타인/타가족 차단, 승인 권한 상실, 자기 승인, 동시·중복 요청, 정책 차단, 금액 정밀도, 잔액 미변경.
3. 웹 expenses 화면, 메뉴·관리 화면 연결, API proxy 및 OpenAPI/생성 타입. 요청/처리 중 버튼 중복 방지와 오류·빈 상태.
4. PostgreSQL 마이그레이션·백업, API/브라우저 검증, 서비스 재실행과 인수인계. 적용된 마이그레이션은 수정하지 않고 복구는 기존 DB를 보존한 별도 복원 DB로 진행.

## 현재 구현과 인수인계
- 003 마이그레이션 적용 완료. 요청·결정·정책은 append-only이며 runtime 계정에 정책 쓰기 권한을 주지 않는다. 요청 생성은 operation_id와 원문 비교로 중복 방지, 결정은 가족 잠금 및 요청별 유일 제약으로 한 번만 반영한다. 금액은 BIGINT/API 문자열이다.
- `/expenses` 화면 및 공통 메뉴, 관리 화면 연결 완료. 작성·상태 필터·요청자 결과 확인·총무/총괄관리자 검토·승인/반려 사유 이력. 총무의 승인도 서버의 현재 권한으로 확인한다. 사용자 본인 요청만 조회하고 관리자만 가족 내 요청을 본다.
- API: GET/POST `/api/v1/families/{family_id}/expenses`, GET `/{request_id}`, POST `/{request_id}/decisions`. 생성은 amount_krw/purpose/payee_name/requested_on/operation_id, 결정은 decision/comment. OpenAPI 및 웹 생성 타입 갱신.
- 출금 승인은 실제 송금·현금 원장 변경이 아니다. 지급 실행, 첨부 증빙, 수정/철회 및 승인 취소는 이번 구현에 포함하지 않았다. 제출 내용 수정은 허용하지 않는다.
- **실제 개발 DB의 승인 정책은 사용자 확인 대기라 미설정이다. 요청 작성·저장은 가능하며 승인/반려 버튼은 비활성, API는 POLICY_NOT_CONFIGURED로 거부한다.** 테스트 DB에는 명시적인 합성 정책을 주입하여 전체 흐름을 검증했다. 실제 정책을 테스트값으로 대신 활성화하지 않는다.

## 실제 실행한 검증
- `pytest apps/api/tests -q --tb=no`: 46 passed. 추가 동시성·런타임 권한 테스트를 포함한 `pytest apps/api/tests/test_expenses.py -q --tb=no`: 3 passed. 기존 Starlette/httpx 경고 1건.
- 웹 `npm run build`, `npm run lint`, API `ruff check apps/api/src apps/api/tests` 통과. `validate_foundation.py` PASS.
- `scripts/test_service.py`: 기존 브라우저 10개 통과, 새 시나리오의 선택자/별도 컨텍스트 설정 오류 수정 후 `scripts/test_service.py expenses.spec.ts` 1개 통과(13.9초). 요청 제출→총무 승인→요청자 결과 확인 및 390px 가로 넘침 없음. `var/expense-mobile.png` 직접 확인.
- `scripts/backup_database.py --verify-restore`: 새 DB 복원 후 출금 관련 테이블을 포함한 10개 테이블 건수 일치. 원본 DB는 유지한다. 복구는 postgres-local.md 절차에 따라 새 복원 DB 검증 후 연결 전환한다.
- 서비스 재실행 완료. 실제 개발 DB 조회 API 200, approval_configured=false, 테스트 요청을 개발 DB에 남기지 않음.
- 테스트 실패 로그의 fixture 표현에 테스트 소유자 연결 정보가 노출되어 해당 비밀번호를 교체했다. 이후 pytest는 --tb=no로 실행하여 자격 정보가 실패 출력에 포함되지 않도록 했다. Git에는 자격 정보를 추가하지 않는다.
