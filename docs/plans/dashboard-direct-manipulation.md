# 대시보드 직접 조작 설계·실행 계획

2026-10-26 · WB-01·WB-03 · R04·R13·R18·R19

사용자가 내 할 일 통합, 편집 진입 없는 드래그와 크기 변경, 격자 재배치와 자동 저장을 승인했다.
기존 React/Pointer Events/CSS Grid를 사용한다. 새 의존성 없이 현재 작업 폴더에서 구현한다.
자유 좌표는 화면 축소 시 겹침이 생기므로 사용하지 않고 순서와 크기에 따른 격자 배치를 적용한다.

## 인수 기준
- 승인·송금은 내 할 일 위젯 안에서 구분하고 서버 권한과 기존 처리 링크를 유지한다.
- 이동 손잡이와 크기 손잡이는 항상 제공한다. 마우스·터치·키보드를 지원한다.
- 작은 격자 행 단위로 높이를 배치하여 서로 다른 높이에도 빈 공간을 줄인다.
- 모바일에서도 크기 조절이 가능하며 내부 내용은 카드 너비에 맞춰 표시한다.
- 조작 종료 후 자동 저장한다. 저장 중 조작은 잠그고 실패한 초안을 보존한다.
- 결과 불명이나 충돌은 자동 재전송하지 않고 최신 배치를 다시 확인하도록 한다.
- PC/모바일 배치와 계정/가족 격리, revision 충돌 검사를 유지한다.
- 구 approval/payment 배치는 읽을 때 tasks 하나로 합친다. 업무 이력은 변경하지 않는다.

## 실행 순서
- [x] API dashboard_layout.py의 tasks 정규화 테스트를 먼저 실패 확인 후 구현. 계약·생성 타입 갱신.
- [x] dashboard-workspace.tsx의 직접 조작, 자동 저장, 접근성 및 CSS 격자 구현.
- [x] payment-tasks.tsx·dashboard-view.tsx 통합. 브라우저 테스트를 직접 조작 방식으로 변경.
- [x] typecheck/lint/build/API/브라우저/문서 검증, 실패 원인과 미검증 범위 기록.

## 검토 초점
구 배치 두 위젯의 숨김 상태 병합, 저장 실패와 충돌, 저장 중 화면 폭 변경,
터치 스크롤과 드래그 충돌, 작은 카드의 내용 넘침을 검증한다.

## 복구
DB 스키마 변경 없음. 배치 JSON은 기존 구조와 legacy ID 읽기를 유지한다.
새 tasks ID 저장 후 이전 앱으로 되돌리려면 배치 변환이 필요하므로 앱만 단독 롤백하지 않는다.

## 구현과 중간 검증
- API에 tasks ID 추가. legacy approval/payment는 첫 위치와 하나라도 표시하던 상태를 보존해 병합한다.
- 업무 데이터와 DB 스키마는 변경하지 않는다. 기존 revision/ACL/CSRF 검사를 유지한다.
- 안정된 grid 요소에 Pointer Capture를 두고 pointerId 소유권을 확인한다. 마우스·터치 공통 경로이며 Escape 취소와 키보드 방향키 조작을 제공한다.
- 저장 중 조작을 막아 직렬화한다. 네트워크 결과 불명/충돌은 초안 유지 후 명시적 최신 조회로 복구한다.
- 최초 정규화 테스트 2 failed → 구현 후 2 passed.
- 최초 계약 생성은 development 설정으로 금융 스키마가 누락되어 typecheck 실패. local_password 설정으로 재생성 후 타입/빌드 통과.
- 최초 드래그 브라우저 검사는 캡처 해제로 저장 대기 실패. 안정된 grid 캡처 수정 후 해당 경로 통과.
- 독립 정적 검토: 다중 포인터 오작동과 Escape 포커스 지적을 수정하고 회귀 검사 추가.
- 이후 브라우저 검사에서 Next 알림과의 선택자 중복 및 제거된 편집 버튼 대기를 수정했다.
- 전체 API 초기 실행은 DB 환경 누락으로 32 skipped, 임시 폴더 접근 권한으로 5 errors (27 passed). 문서에 맞춰 테스트 DB 변수와 신규 작업 폴더 basetemp로 재실행.
- API/브라우저 병행 실행에서 로그인/로딩 시간 초과 발생. WB-04 원인은 미확정.

## 최종 검증·인수인계
- 변경 파일: API dashboard_layout.py 및 test_dashboard_layout.py, 웹 dashboard-workspace.tsx/dashboard-view.tsx/payment-tasks.tsx/workspace.css, dashboard-layout.spec.ts/expenses.spec.ts, OpenAPI와 생성 타입, WORKBOARD 및 이 문서.
- `npm --prefix apps/web run contracts`: 실제 local_password 앱 OpenAPI에서 생성 성공.
- `npm --prefix apps/web run typecheck`, `npm --prefix apps/web run lint`, `npm --prefix apps/web run build`: 통과. 최종 Escape 보완 포함 빌드/린트 통과.
- `apps/api/.venv-pg/Scripts/python.exe -m pytest apps/api/tests -q --tb=short --basetemp=<var 아래 새 UUID 경로>`: 전용 TEST_DATABASE_URL/TEST_APP_DATABASE_URL 설정 후 64 passed, 기존 Starlette 경고 1건 (319.42초).
- `apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py dashboard-layout.spec.ts expenses.spec.ts`: API 검사 종료 후 단독 실행 3 passed (1.2분).
- 브라우저 검증: 편집 버튼 없음, 실제 포인터 이동/크기 조절, 자동 저장·새로고침 유지, PC/모바일 별도 저장, 무권한 위젯/CSRF/타가족/중복/구 revision 거부, 보조 포인터 무시, Escape 취소, 저장 실패 초안 보존/최신 조회 복구, 총무 내 할 일 통합, 승인→송금→완료 회귀.
- `apps/api/.venv-pg/Scripts/python.exe -m ruff check apps/api/src apps/api/tests`: 통과.
- `apps/api/.venv-pg/Scripts/python.exe -m pip check`: No broken requirements.
- `node --test tests/design/theme.test.cjs`: 9 passed.
- `npm --prefix apps/web audit --audit-level=high`: 0 vulnerabilities.
- `python scripts/validate_foundation.py`: PASS. `git diff --check`: 통과.
- 합성 계정 PC/390px 캡처 직접 검토: var/expense-demo/direct-widgets-desktop.png, direct-widgets-mobile.png. 가로 넘침 없음.
- `node scripts/dev.mjs --production-build`로 로컬 웹/API 재시작. 실사용 금융 데이터 변경 없음.

미검증: 실물 휴대폰 터치/다중 터치, 이번 위젯의 다크모드 전체 시각 검증, 전체 브라우저 스위트. 반폭/전체폭·3단계 높이 격자이며 픽셀 단위 자유 좌표는 아니다. 큰 내용은 내부 스크롤한다. API 병행 실행 중 로딩 시간 초과는 원인 확정/해결하지 않았고 WB-04에 남긴다. 사용자 수용은 다시 확인해야 한다.

## 부드러운 조작 보완 (2026-10-26)
사용자 피드백: 즉시 격자 변경은 뚝뚝 끊긴다. 반투명 위젯이 포인터를 따라가고 주변 카드도 자연스럽게 움직여야 한다.
- DOM 시각 복제본을 고정 레이어에 표시하고 접근성/포인터 대상에서 제외한다. 원래 위젯은 위치 미리보기로 남긴다.
- requestAnimationFrame으로 포인터 위치와 연속 픽셀 크기를 갱신한다. 실제 배치/저장은 기존 격자를 유지한다.
- 주변 위젯은 이전/다음 위치 차이를 transform 애니메이션으로 보간하고, 놓으면 복제본이 최종 위치로 정착한다.
- reduced-motion은 이동 보간만 생략하고 포인터 추적은 유지한다. 취소/언마운트 시 복제본과 애니메이션을 정리한다.
- 수정 범위: dashboard-workspace.tsx, 별도 widget-motion.ts, workspace.css, 브라우저 회귀 및 이 기록/보드. API/DB 계약 변경 없음.
- 검증 순서: 미리보기 위치·투명도·연속 크기·주변 애니메이션 브라우저 검사 실패 확인 → 구현 → 빌드/린트/위젯 회귀 및 화면 확인.

### 모션 보완 검증 결과
- 변경 파일: dashboard-workspace.tsx, 신규 widget-motion.ts, workspace.css, 신규 widget-motion.spec.ts, WORKBOARD.md와 이 문서. R18·R19 / WB-01.
- `scripts/test_service.py widget-motion.spec.ts`: 수정 전 반투명 미리보기 부재로 1 failed. 구현 후 기본 배치를 복원하는 최종 검사 1 passed (9.5초).
- `apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py widget-motion.spec.ts dashboard-layout.spec.ts`: 2 passed (32.3초). 포인터 37/27px 이동 추적, 23/31px 연속 크기 변화, 이웃 카드 Web Animations 실행, Escape 취소·reduced-motion·기존 자동 저장/권한/충돌/모바일 배치 회귀 확인.
- `npm --prefix apps/web run typecheck`, `npm --prefix apps/web run lint`, `npm --prefix apps/web run build`: 통과.
- `python scripts/validate_foundation.py`, `git diff --check`: 통과.
- `var/expense-demo/widget-motion-drag.png` 직접 검토. 반투명 복제본과 격자 내 위치 표시 확인. 독립 정적 재검토에서 추가 중요 결함 없음.
- 로컬 서비스를 최종 빌드로 재시작했다. API/DB 변경이 없어 API 전체 검사는 이번 모션 보완에서 반복하지 않았다.
- 한계: 실제 휴대폰 터치와 다양한 기기의 프레임 속도 계측은 미실행. 사용감에 대한 사용자 재확인이 필요하다. 최종 크기는 기존 격자 단위로 정착한다.

## 내용 기준 높이 확장 (2026-10-26)
사용자가 3단계 높이 제한 제거와 위젯 내용의 내부 세로 스크롤을 없앨 수 있는 범위까지 확장을 요청했다.
- 기존 height 열거값을 읽는 호환성을 유지하고 선택적 height_px 정수 필드로 세밀한 높이를 저장한다. API 계약/생성 타입/검증도 함께 갱신한다.
- 웹 격자 행을 줄여 PC 약 20px, 모바일 약 16px 단위로 정착한다. 조작 중 시각 효과는 연속 픽셀이다.
- 비표시 DOM 복제로 해당 너비의 자연 높이를 측정한다. 실제 데이터 요청/컴포넌트를 중복 실행하지 않는다.
- 드래그 상한은 내용 전체가 보이는 높이(기존 큰 높이는 유지)로 계산한다. 내용에 맞추기 버튼으로 한 번에 세로 스크롤을 해소한다. 비동기 데이터/펼친 내용은 조작 시 다시 측정한다.
- 작은 크기로 줄이면 내부 스크롤은 허용한다. 가로로 긴 표의 가로 스크롤은 별개다.
- 파일: dashboard_layout.py/API 테스트/계약, dashboard-workspace.tsx·widget-sizing.ts·widget-motion.ts·CSS, 브라우저 테스트와 보드/이 문서.
- 테스트: 새 정수 높이 허용·잘못된 범위 거부, 내용 맞춤 후 세로 스크롤 없음·이전 상한 초과·재로딩 유지·폭 변경 재측정, 모션과 저장 회귀.
- DB 스키마 변경 없음. 신규 필드 없는 이전 JSON도 읽는다. 롤백은 새 필드를 이해하는 버전으로만 한다.

검증 기록 정정: 이전 모션 보완의 foundation PASS 표시는 잘못됐다. 여러 명령을 연속 실행하면서 마지막 git diff의 종료 코드만 확인해, 미정의 CSS 토큰 --color-primary-soft 검출을 놓쳤다. 이번에 로그 본문을 확인해 기존 --color-surface로 수정하고 foundation을 독립 실행해 재검증한다.

### 내용 높이 확장 최종 검증
- API 신규 height_px 검사는 구현 전 1 failed/2 passed → 구현 후 3 passed. 기존 compact/regular/tall을 계속 허용하며 새 필드는 strict 정수 120~32768px만 허용한다. 상한은 비정상 배치 입력 방어용이며 UI는 현재 내용 높이로 제한한다.
- `apps/api/.venv-pg/Scripts/python.exe -m pytest apps/api/tests/test_dashboard_layout.py apps/api/tests/test_api.py -q --tb=short`: 14 passed, 기존 Starlette 경고 1건.
- `apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py dashboard-layout.spec.ts widget-content-height.spec.ts widget-motion.spec.ts`: 3 passed (49.2초).
- 실제 포인터로 높은 위젯을 다시 늘리는 검사를 추가한 뒤 `scripts/test_service.py widget-content-height.spec.ts`: 1 passed (24.3초).
- 검증: 모바일 이전 516px 상한 초과, 모든 보이는 위젯의 scrollHeight/clientHeight 일치, 펼친 표/너비 변경 후 재측정, 높이 저장·재로딩 유지, 드래그 최대 높이 제한, 기존 자동 저장/권한/모션 회귀.
- `npm --prefix apps/web run contracts`, `typecheck`, `lint`, `build`: 통과. 최종 토큰 보완 포함 빌드 통과.
- `apps/api/.venv-pg/Scripts/python.exe -m ruff check apps/api/src/family_ledger/dashboard_layout.py apps/api/tests/test_dashboard_layout.py`: 통과.
- `python scripts/validate_foundation.py`: 별도 종료 코드 확인 PASS. `git diff --check`: 통과.
- 모바일 전체 화면 `var/expense-demo/widget-content-fit.png` 직접 검토. 세로 내용 잘림 없음, 긴 표의 가로 스크롤은 유지.
- 정적 독립 검토에서 추가 중요 결함 없음. 실물 휴대폰/새 모드 다크 시각 검증/API 전체 스위트는 이번 보완에서 재실행하지 않음.
- 새 데이터나 펼친 내용으로 길이가 달라지면 다시 늘리거나 ↕ 내용에 맞추기를 누른다. 작게 줄인 위젯은 내부 스크롤이 남을 수 있다. 사용자가 저장한 큰 높이는 임의로 축소하지 않는다.
- 최종 빌드로 로컬 웹/API 재시작. WB-01·R18·R19 사용자 재확인 대기.

## 대시보드 조회 기간·손잡이 간소화 (2026-10-26)
사용자 요청: 대시보드에서는 최신 자료만 보고 상세 조회는 다른 화면으로 이동한다. 우하단 크기 손잡이는 작게 만들고 호버 시 표시한다.
- 기간 선택 UI·클라이언트 기간 상태를 제거하고 API의 기본 최신 월 요약을 사용한다. 현재 금융 데이터는 합성 자료이며 실제 은행 실시간 조회로 표현하지 않는다. 자료 기준 시점은 유지한다.
- 상세 입출금 화면 진입 링크를 상단에 제공한다. 기간 필터는 입출금 화면에 유지한다.
- PC 손잡이는 24px 투명 버튼/작은 아이콘으로 표시하고 위젯 hover, 키보드 focus, 조작 중에 노출한다. hover 없는 터치는 작은 아이콘을 유지하되 36px 터치 영역을 제공한다.
- 변경: dashboard-view/workspace·CSS, 기간 선택을 쓰던 service/controls 테스트 및 신규 표시 검증. API/DB 계약 변경 없음.
- 검증: 기간 선택 부재·상세 화면 필터 유지, 비호버/호버/키보드/터치 손잡이, 기존 드래그·높이 회귀, 빌드/린트/foundation.

### 기간·손잡이 간소화 검증 결과
- 신규 dashboard-overview.spec.ts: 수정 전 기간 선택 1개 존재로 실패 → 구현 후 통과.
- `apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py dashboard-overview.spec.ts controls.spec.ts service.spec.ts widget-motion.spec.ts widget-content-height.spec.ts`: 9 passed (1.1분).
- 범위: 대시보드 기간 없음/상세 화면 필터 유지, 24px 손잡이 비호버 숨김/호버/포커스 노출, 터치 에뮬레이션 36px 조작 영역, 드래그·높이 맞춤, 세션 만료/서버 오류, 1440·375·320px 라이트/다크 및 키보드 선택 UI.
- `npm --prefix apps/web run typecheck`, `lint`, `build`: 통과. `python scripts/validate_foundation.py`: PASS (독립 종료 코드 확인). `git diff --check`: 통과.
- PC 라이트/320px 다크 캡처 직접 검토. API/DB 변경 없음, API 스위트는 재실행하지 않음. 실물 터치 기기는 미검증.
- 로컬 서비스를 새 빌드로 재시작. 자료는 여전히 합성 자료이며 기준 시점을 표시한다. 주기적 실시간 은행 조회를 새로 구현한 것은 아니다.
- 변경 파일/인수인계: dashboard-view.tsx, dashboard-workspace.tsx, workspace.css, dashboard-overview.spec.ts, controls.spec.ts, service.spec.ts, WORKBOARD.md, 이 문서. WB-01·R18·R19.

## 제목 옆 사용 안내 (2026-10-26)
- 위젯 관리·표시 선택·기본 복원 UI 제거. 복구 경로 없는 숨김을 방지하기 위해 숨기기 버튼도 제거하고 API가 허용한 위젯을 모두 표시한다. 기존 숨김 설정도 표시되며 순서/크기는 유지한다.
- 나의 대시보드 옆 작은 ? 버튼으로 보는 법과 이동/크기/내용 맞춤/자동 저장/PC·모바일 별도 배치 안내를 펼친다. 상시 설명 문구는 제거하고 실제 저장 상태만 표시한다.
- 안내는 키보드·터치로 열고 Escape·바깥 클릭으로 닫으며 작은 화면에서 넘치지 않게 한다.
- 변경: dashboard-help.tsx, dashboard-workspace.tsx, workspace.css, 도움말/기존 위젯 테스트와 기록. API/DB 계약 변경 없음.

### 사용 안내 검증·인수인계
- 신규 도움말 테스트는 수정 전 버튼 부재로 실패, 구현 후 통과.
- `apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py dashboard-help.spec.ts dashboard-layout.spec.ts dashboard-overview.spec.ts widget-motion.spec.ts`: 4 passed (56.5초).
- 저장 알림을 고정 표시하여 레이아웃 이동을 막은 최종 빌드에서 `scripts/test_service.py dashboard-help.spec.ts`: 1 passed (13초). 저장 전/후 격자 위치 동일 확인.
- 안내 버튼 Enter/Escape·포커스 복귀·바깥 클릭, 390/320px 너비, 기존 숨김 배치 위젯 재표시, 별도 모바일 배치와 자동 저장/모션/호버 손잡이 회귀 확인.
- `npm --prefix apps/web run typecheck`, `lint`, `build`: 통과. `python scripts/validate_foundation.py`: PASS. `git diff --check`: 통과.
- `var/expense-demo/dashboard-help-mobile.png` 320px 안내 화면 직접 검토. 긴 안내는 패널 안에서 스크롤한다.
- 변경 파일: 신규 dashboard-help.tsx, dashboard-workspace.tsx, workspace.css, 신규 dashboard-help.spec.ts, dashboard-layout.spec.ts, widget-motion.spec.ts, WORKBOARD.md와 이 기록.
- API/DB 변경 없음. 기존 visible 저장값은 읽기 호환을 유지하나 화면 표시에는 사용하지 않는다. 서버가 허용하지 않은 위젯을 추가하지 않는다. 전체 API/실물 터치/이번 안내 다크 시각 검증은 재실행하지 않았다.
- 로컬 서비스 최종 빌드로 재시작. WB-01·R18·R19 사용자 재확인 대기.
