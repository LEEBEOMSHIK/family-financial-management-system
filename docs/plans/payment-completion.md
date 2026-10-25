# 송금 완료와 승인 알림 구현 계획

R04·R05·R13·R18, 2026-10-25 사용자 요청. 기존 작업 폴더의 변경을 보존한다.

- [x] 공통 세로 Select 라벨 간격을 8px로 통일한다.
- [x] 005 마이그레이션: 승인된 요청에 대한 불변 송금 완료 기록과 승인 알림 대기 이벤트. 승인 상태와 송금 상태는 별개이며 원장을 생성하지 않는다.
- [x] 서버: 유효 총무만 승인된 요청에 전체 금액 송금 완료를 기록한다. 송금일(서울 날짜), 기록자, 기록 시각, 메모, 중복 방지 ID를 보존한다. 총괄관리자 권한만으로는 송금 기록 불가. 가족 행 잠금/고유 키로 동시 기록 차단, 동일 요청 재시도 및 다른 ID 중복 기록 검증.
- [x] 총무가 승인하면 알림 이벤트 없음. 다른 승인자가 승인하면 같은 DB 트랜잭션으로 1개 이벤트 저장. 공급자·채널·템플릿·수신처 미설정이므로 외부 발송은 차단하고 연동 대기 표시. 실제 전송·재시도·unknown 처리 구현은 공급자 계약 확인 후 진행, 발송 완료로 가장하지 않는다.
- [x] API/생성 타입/상세 화면: 송금 대기·송금 완료 필터/표시, 총무 전용 완료 폼, 이력 및 알림 상태. 계좌번호·연락처는 이벤트 payload에 넣지 않는다.
- [x] 테스트 DB에서 승인자별 이벤트 분기, ACL, 중복 방지, 완료 이력·금액/원장 보존, UI 승인→송금 완료 확인. 로컬 데이터 백업 후 마이그레이션 및 재시작.

파일: apps/api/migrations/005_payment_completion.sql, expenses/{models,repository,routes}.py, expenses/payments.py, 웹 expenses/payment-panel.tsx·expenses-view.tsx·workspace.css, 계약과 관련 테스트.

복구: DB 백업을 별도 DB에 복원해 검증한다. 적용된 마이그레이션이나 확정 이력은 삭제/수정하지 않는다. 필요 시 전진 마이그레이션으로 보정한다. 기존 승인 건의 알림은 소급 생성하지 않는다.

공식 근거: https://business.kakao.com/info/infotalk — 알림톡은 공식 딜러사를 통해 제공. 공급자 및 발송 설정은 UNVERIFIED이며 사용자에게 준비 여부를 질문했다.

## 구현 및 운영 인수인계

POST `/api/v1/families/{family_id}/expenses/{request_id}/payment`는 `paid_on`, `note`, `confirmed:true`, `operation_id`를 받는다. API 금액을 새로 입력하지 않고 기존 승인 요청의 전체 금액을 기준으로 완료 기록한다. 승인일 이전·미래 날짜는 거부한다. 수정/취소·부분 송금은 제공하지 않는다. 총무가 본인의 요청을 송금 완료로 기록하는 것은 다른 총괄관리자의 승인 이후에만 가능하다.

ExpenseItem에 `payment`, `can_record_payment`, `approval_notice` 추가. 미연동 승인 알림은 `expense_approval_notice`에 고유 요청 키로 저장한다. 실제 메시지, 연락처, 전체 계좌번호를 저장하지 않는다. 현재 발송 worker·공급자 어댑터·수신처 등록은 미구현이다. 향후 worker는 발송 직전 현직 총무/활성 가족 구성원·미송금 여부를 재확인하고 공급자 중복 방지 키, 결과 불명 조회 및 append-only 발송 이력을 구현해야 한다. 현재 기록을 임의로 일괄 재발송하지 않는다.

실제 실행: API `pytest apps/api/tests/test_payments.py apps/api/tests/test_expenses.py apps/api/tests/test_accounts_evidence.py -q --tb=no` 16 passed, 기존 Starlette/httpx 경고 1건. 신규 payment 테스트는 구현 전 2 failed 재현. 웹 build/lint, API Ruff 통과. `backup_database.py --verify-restore` 통과 후 `initialize_database.py` 적용(Migrations=5, 구성원 4·역할이력 9·거래 7 보존). 새 빌드로 서비스 재시작.

`scripts/test_service.py expenses.spec.ts expense-rejection.spec.ts` 3 passed (40초): 총무 승인 시 알림 생략 안내, 실제 송금일·확인 체크 후 송금 완료 기록, 요청자의 완료 메모 조회, 반려 이력 및 사후 증빙 회귀 확인. 로컬 읽기 전용 브라우저 점검으로 처리 결과 라벨 하단과 콤보박스 상단의 실제 간격 8px 확인. 최초 일회성 점검 명령은 PowerShell 파이프 인코딩으로 실행 전 구문 실패했고 UTF-8 출력 설정 후 통과. `validate_foundation.py` 통과.

미검증: 실카카오 발송, 발송 공급자 응답·재시도·unknown 처리, 실기 모바일, 전체 API 회귀. 발송 업체·채널·템플릿·수신처가 준비되면 이 문서의 별도 연동 작업을 진행한다. 사용자의 실제 요청에는 테스트 승인·송금 완료를 기록하지 않았다.

## 상세 정보 시각적 구분 개선 (2026-10-25)

R04·R05 표시 개선. `expenses-view.tsx`와 `workspace.css`에서 요청 금액/상태 요약, 요청사항 배경 영역, 요청자·유형·희망 지급일·요청일의 라벨/값 표, 은행·예금주·계좌번호 표, 증빙 섹션을 구분했다. 섹션 사이 구분선과 여백을 적용하고 모바일 표는 1열로 전환한다. 처리 이력/요청 처리 제목에도 구분선을 추가했다. 공통 색상 토큰을 사용한다. API·권한·DB 변경 없음.

`npm --prefix apps/web run build`, `npm --prefix apps/web run lint` 통과. 로컬 서비스 재시작 후 읽기 전용 Playwright 점검으로 합성 선지급 요청 상세를 열어 light/dark × 1440/390/320px에서 가로 넘침 없음 확인. `var/expense-demo/info-*.png` 캡처, PC 라이트와 모바일 다크 이미지 직접 검토. 시각 변경만 있어 API·전체 업무 회귀 테스트는 재실행하지 않았다. 실기 모바일 검증은 미수행.

## 상세 복귀 버튼 간격 (2026-10-25 후속)

R04 화면 가독성. 공통 `components/ui/BackButton.tsx`를 추가하고 `expenses-view.tsx`에 적용했다. `workspace.css`에서 기존 토큰으로 복귀 탐색→제목 시작 24px, 화살표→문구 8px를 적용한다. 왼쪽 화살표는 18px SVG이며 장식용 aria-hidden을 사용해 접근 가능한 이름 ‘목록으로’를 유지했다. `docs/design/design-system.md`에 PC·모바일 공통 규칙과 세로 콤보박스 라벨 8px, 상세 구획 간격을 명시했다.

실행: `npm --prefix apps/web run build`, `npm --prefix apps/web run lint`, `python scripts/validate_foundation.py` 모두 통과. 새 빌드로 로컬 재실행 후 일회성 읽기 전용 Playwright 점검에서 1440/390/320px 실제 간격 24px·화살표 표시·목록 복귀·가로 넘침 없음을 확인했다. 권한/API/DB 변경 없음, 서버 테스트는 재실행하지 않았다. 송금 완료는 앞서 구현한 현직 총무 전용 규칙을 유지한다.

## 총무 대시보드 송금 할 일 연결 (2026-10-25)

R04·R13·R18. 대시보드에 송금 업무 조회가 연결되지 않아 승인 후 미송금 요청이 표시되지 않던 문제를 수정했다. `dashboard/payment-tasks.tsx`에서 기존 가족별 출금 API를 사용해 승인됨·미송금·서버 `can_record_payment=true`인 요청만 희망 지급일 순으로 표시한다. 건수와 합계는 현재 조회 결과의 BigInt 계산이며 조회 실패를 0건으로 표시하지 않는다. 재진입·창 복귀·수동 새로고침으로 최신 상태를 읽는다.

`dashboard-view.tsx` 상단에 내 할 일 추가. `/expenses?request={id}` 링크로 권한 검증된 목록의 해당 상세를 연다. 타 가족/권한 없는 ID는 상세를 표시하지 않고 오류 안내한다. `expenses-view.tsx`의 Suspense와 URL 선택 처리를 추가하고 공통 목록 복귀는 query를 제거한다. `workspace.css`에 반응형 할 일 목록 스타일, `tests/expenses.spec.ts`에 승인→대시보드 할 일→상세→송금 완료→할 일 제거 시나리오 추가. 서버/API 계약/DB 변경 없음.

검증: 수정 전 새 브라우저 assertion 실패로 누락 재현. `npm --prefix apps/web run build`, `npm --prefix apps/web run lint` 통과. `scripts/test_service.py expenses.spec.ts -g 'member submits'` 별도 테스트 스키마에서 1 passed(19.9초). 실제 로컬 총무 로그인 읽기 전용 점검에서 승인 후 미송금 1건과 화면 링크 수 일치, 상세 송금 완료 폼 표시, 1440/390/320px 가로 넘침 없음 확인. 실제 요청에 송금 완료를 기록하지 않았다. 전체 서버/브라우저 회귀 및 실기 모바일은 재실행하지 않았다.

## 내 할 일 카드 시각 개선 (2026-10-25 후속)

R04·R13 표시 개선. `dashboard/payment-tasks.tsx`, `workspace.css` 변경: 제목 옆 건수 배지, 작게 표시한 새로고침, 중립색 요약 행, 요청별 송금 아이콘·제목·보조 정보·금액·명확한 처리 동작을 정렬했다. 카드 내부 큰 배경 박스를 없애고 구분선으로 정보 위계를 나눴다. 기존 브랜드/다크모드 토큰 사용. 모바일은 금액과 처리 동작을 별도 줄에 배치하고 새로고침은 접근 가능한 이름을 유지한 아이콘으로 표시한다.

검증: `npm --prefix apps/web run build`, `npm --prefix apps/web run lint` 통과. 새 빌드로 재시작 후 실제 로컬 총무의 읽기 전용 브라우저 점검으로 light/dark × 1440/390/320px 가로 넘침 없음, 새로고침·상세 바로가기 동작 확인. `var/expense-demo/tasks-*.png` 캡처 중 PC 라이트·모바일 다크 직접 검토. 업무/API/DB 변경 없어 서버 테스트는 재실행하지 않았다. 실기 모바일은 미검증이며 실제 송금 상태를 변경하지 않았다.

2026-10-25 활성 테두리 후속: 사용자 요청으로 처리 가능한 송금 대기 건이 있을 때 `payment-tasks.tsx`의 data-active 조건과 `workspace.css`에 녹색 테두리 적용. `tokens.json`, `tokens.css`, `theme.css`에 라이트 #86D9A0/다크 #5CBF85 토큰 동기화, 디자인 시스템에 적용 조건과 완료 상태가 아닌 강조임을 기록했다. build/lint/foundation 검증 통과, 실제 로컬 읽기 전용 브라우저에서 라이트·다크 border 색과 활성 속성 확인. 업무/API/DB 변경 및 송금 처리는 하지 않았다.

2026-10-25 사용자 정정: 위 전체 영역 활성 테두리는 의도와 달라 제거했다. `payment-tasks.tsx`의 data-active 제거, `workspace.css`에서 개별 송금 대기 링크의 hover 지원 기기 hover 상태에만 녹색 1px inset 테두리 적용. 디자인 시스템의 적용 대상도 개별 항목 hover로 정정. build/lint 통과 후 로컬 재시작. 읽기 전용 브라우저에서 라이트·다크 hover 전/중/후, 전체 영역 중립 테두리 유지와 항목 크기 불변 확인. 서버 동작 변경 없음.

2026-10-25 hover 누락 수정: 실행 화면에서 대시보드 항목은 녹색이지만 `/expenses`의 송금 대기 카드는 중립 테두리임을 재현했다. `expenses-view.tsx`에 승인됨·미송금 조건의 data-payment-pending 추가, `workspace.css`에서 해당 카드 hover의 border와 inset 강조 적용. 대시보드 항목 hover는 2px inset으로 선명하게 조정했다. 전체 영역은 중립 테두리를 유지한다. 디자인 시스템을 두 화면에 공통 적용하도록 수정했다. build/lint 통과, 새 서비스에서 라이트·다크 두 화면의 hover/해제와 카드 크기 불변 검증. API/DB 및 실제 송금 상태 변경 없음.

2026-10-25 실제 사용자 브라우저 원인 확인 (R04·R13): 총무가 사용 중인 localhost 대시보드에서 matchMedia('(hover:hover)')와 '(any-hover:hover)'가 모두 false였다. 기존 별도 브라우저 검증으로 이 환경 차이를 놓쳤다. workspace.css의 녹색 테두리 규칙을 감싼 media 조건을 제거하고 실제 :hover에 직접 적용한다. 역할에 따른 스타일 분기는 없다. 디자인 시스템도 기기 감지로 hover를 차단하지 않도록 수정했다.
검증: npm --prefix apps/web run build 및 npm --prefix apps/web run lint 통과. 서비스 재시작 후 사용자의 기존 총무 탭을 새로고침하여 hover:false 환경에서도 최상위 CSS 규칙이 로드됨을 확인했다. 연결된 브라우저 도구에 hover 동작 API가 없어 실제 포인터 진입/이탈의 시각 검증은 미완료다. API·DB·송금 상태 변경 없음.

## 역할별 대시보드 할 일 영역 (2026-10-25)

R04·R13·R18. 사용자 확정: 총괄관리자는 승인 대기, 총무는 승인 대기와 송금 대기를 별도 영역에서 확인한다. 각 영역은 건수·BigInt 합계·희망 지급일 순 요청 카드·빈 상태를 제공한다. 승인 대기는 서버가 반환한 가족별 요청과 requires_super_admin을 기준으로 본인 요청을 제외하고, 총무 요청은 총괄관리자에게만 표시한다. 상세의 기존 서버 승인 검증을 유지하며 정책 미설정 시 설정 대기 안내를 표시한다. 송금 목록은 기존 서버 can_record_payment를 따른다. 단일 역할 기준 총괄관리자의 송금 영역은 숨기며, 서버가 실제 송금 가능한 요청을 반환하는 복수 역할 계정은 해당 요청도 표시한다.

변경: apps/web/src/features/dashboard/payment-tasks.tsx, apps/web/src/styles/workspace.css, apps/web/tests/expenses.spec.ts. API 계약·DB 변경 없음. 요청 검토 링크는 기존 상세로 연결한다. 승인 카드는 기본 파란색, 송금 카드는 기존 녹색 hover를 사용한다. 인수 기준: 총괄관리자 승인 영역/송금 영역 숨김, 총무 두 영역, 승인 직후 승인 목록에서 제거되어 송금 영역으로 이동, 송금 완료 후 제거.

검증 결과: npm --prefix apps/web run build, npm --prefix apps/web run lint 통과. apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py expenses.spec.ts -g 'member submits' 최종 1 passed(22.7초). 최초 실행에서 상세 바로가기 포커스 실패, 두 번째에서 selected 상태만 참조하여 승인 요청 미전송을 발견했다. expenses-view.tsx를 실제 detail 기준으로 포커스/결재 처리하고 성공 시 목록으로 복귀하도록 수정 후 재검증했다. 사용 중인 총무 탭에서도 승인 대기 1건(125,000원)과 송금 대기 1건(80,000원)이 별도 영역으로 표시됨을 확인했다. 실제 로컬 요청 데이터는 변경하지 않았다. 전체 회귀·실기 모바일·다크모드의 이번 영역 변경은 미검증이다.
