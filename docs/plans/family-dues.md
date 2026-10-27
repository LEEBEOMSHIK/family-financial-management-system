# 가족 관리·회비 현황 Implementation Plan

**Goal:** WB-19 / R02·R10·R18·R19. 구성원별 월 회비, 총괄관리자 설정 공통 마감일, 입금 확인, 총무/총괄 대시보드 미납 현황.
**Architecture:** 기존 PostgreSQL에 추가 이력 테이블, 별도 dues 업무 모듈·HTTP 라우터. 은행 입금과 회비 확인을 연결하되 원장 수정/중복 생성 없음.
**Tech Stack:** 기존 FastAPI/Pydantic/PostgreSQL/Next.js/공통 토큰. 추가 의존성 없음.
**Spec:** 이 대화의 사용자 확정 사항과 AGENTS.md 불변식. 실행은 현재 작업에서 직접 진행한다.

## 범위/결정
- 총무/총괄만 전체 가족 회비 조회·납부 확인·요청 기록. 총괄만 회비/마감일 설정.
- 현재 활성 구성원 목록. 구성원별 금액, 월 공통 마감일, 적용 시작 월과 이력. 과거 월을 소급 변경하지 않도록 적용 월은 현재 월 이후만 허용.
- 29~31일 설정은 해당 월 말일에 적용한다고 입력 옆에 안내. 아직 설정되지 않은 값은 미설정, 금액/마감일을 추측하지 않음.
- 총무/총괄이 실제 업로드 입금 거래 하나를 구성원·회비 월에 수동 연결. 여러 거래로 일부 납부 가능. 한 거래 분할 납부는 이번 범위 밖이며 전체 금액 연결임을 안내. 정정은 취소 이력 후 다시 연결. 자동 이름 매칭 없음.
- 납부 대기/일부 납부/완료/기한 초과, 조회 자료 부족은 별도 상태. KST 오늘과 동기화 범위 사용. 초과 입금 별도 표시.
- 납부 요청은 내부 기록만 생성하며 실제 발송 아님을 버튼/결과에 명시. 실제 외부 발송은 WB-08 미확정. 요청 기록에는 누가/언제/대상월/미확인금액을 보관.
- 대시보드 기존 내 할 일 위젯 안에 당월 회비 미확인 인원·총액·목록·가족 관리 연결/요청 버튼. 기존 배치 유지.

## 단계
- [x] 1. 상태/금액/마감일 순수 테스트 → 모델/집계, append-only migration 009.
- [x] 2. 서버 권한/CSRF/가족 격리/설정/입금연결·취소/중복방지/요청 이력 API와 격리 DB 테스트.
- [x] 3. 가족 관리 화면/메뉴, 내 할 일 회비 섹션, 계약 생성/브라우저 테스트.
- [x] 4. 전체 API·관련 브라우저·빌드/린트/foundation, 로컬 migration/재시작, 인수인계.

## 인수 기준과 복구
미설정→구성원별 회비/마감일→미납→부분/완납→취소, 중복 거래 방지, 다음 요청의 역할 회수, 모바일 가로 넘침 없음. 실제 회비 값은 에이전트가 설정하지 않는다.
Migration은 테이블 추가만 하며 기존 자료 삭제 없음. 문제 시 새 라우터·메뉴를 비활성화하고 테이블/이력을 보존한다. down migration으로 기록을 삭제하지 않는다.


## 검증 기록

- 순수 규칙 테스트 최초 미구현 모듈로 실패 → 구현 후 2 passed. 윤년/월말/미설정/부분/초과/자료 부족/큰 정수 검증.
- `python -m pytest apps/api/tests/test_dues_rules.py apps/api/tests/test_dues_api.py -q --tb=short`: **4 passed**. 가족 격리·일반사용자 거부·총무 설정 변경 거부·CSRF·과거 소급 거부·중복 요청/서로 다른 payload·입금 연결/취소·동시 연결 1회·역할 회수·실제 runtime 권한과 이력 불변 검증.
- `scripts/test_service.py family-dues.spec.ts service.spec.ts`(3101/8101 실행): 최초 기존 서비스 4 passed/가족 화면 1 failed. 선택 상자의 label 텍스트에 option 내용이 포함되어 exact label 탐색 실패, 명시적 접근성 이름으로 수정.
- 실패 시나리오 보완 후 가족 관리 단독 **1 passed**. 서로 다른 30,000/50,000원 합성 회비, 공통 마감일 설정, 미발송 요청 기록, 합성 CSV→입금 확인→취소, 총무 대시보드 2명/합계 반영, 총무 설정 UI 차단, 일반사용자 전체 회비 접근 차단, 390/320px 가로 넘침 없음.
- 내 할 일 상단에 회비 요약을 배치. 위젯 자체 이동/크기 설정은 유지. 전체 내용은 기존 ‘내용에 맞추기’로 확장 가능.
- 새 코드의 import 정렬·dict 스타일 Ruff 지적은 수정했다. 타입 검사·OpenAPI/생성 타입·빌드·린트 통과.
- 실제 구성원의 회비·마감일은 미설정 상태로 두며 에이전트가 임의 설정/납부 처리하지 않는다. 한 입금 전체를 한 사람/한 달에 연결하며 분할 배분은 미구현. 외부 알림 발송·실기 터치는 미검증/미구현이다.

- `python -m pytest apps/api/tests -q --tb=short --basetemp=var/pytest-dues-all`: **98 passed** (232.42초), 기존 Starlette/httpx 경고 1건.
- 최종 `npm --prefix apps/web run build`(타입 포함), `run lint`, `python -m ruff check apps/api/src apps/api/tests`, `python -m pip check`, `node --test tests/design/theme.test.cjs`(9 passed), `git diff --check` 통과.
- 로컬 적용: `python scripts/backup_database.py`로 비공개 var/postgres/backups에 백업 후 `family_ledger.postgres.migrate(owner_dsn)` 실행 성공. 009는 추가 이력 테이블/인덱스/불변 트리거/권한만 적용한다. 기존 은행 원본·거래·회비 설정은 수정하지 않았다.

- 모바일 표는 구성원별 카드로 전환하여 금액·상태·처리 버튼을 가로 스크롤 없이 표시한다. 최종 `scripts/test_service.py family-dues.spec.ts dashboard-layout.spec.ts`(3101/8101): **2 passed**. 앞선 기존 서비스 4건도 통과. 합성 1440/320px 라이트·다크 화면 직접 검토.
- 변경 파일: API `dues/{models,rules,repository,routes}.py`, `main.py`, migration `009_family_dues.sql`, 계약/생성 타입; 웹 `family/{family-view,dues-summary,dues-shared}.tsx`, `/family/page.tsx`, 프록시 allowlist, app-shell, payment-tasks, management 안내, workspace.css; API/브라우저 테스트 및 요구사항/보드/README.
- `node scripts/dev.mjs --production-build`로 로컬 재시작. 최초 사용은 총괄관리자 → 가족 관리 → 공통 마감일/구성원별 회비와 적용 시작 월 설정 → 총무/총괄이 은행 입금을 해당 구성원·회비 월에 연결. 사용자 수용 확인 대기.

- 실제 로컬 일반사용자/총무/총괄 개발 계정의 세션으로 읽기 검증: 일반사용자 403, 총무·총괄 200, 총괄만 can_configure=true. 공통 마감일과 모든 구성원 회비 미설정 확인. 금융 값/개인정보를 출력하거나 실제 납부 기록을 생성하지 않았다. 로그인 HTTP 200 확인. 최종 foundation PASS·diff 검사 통과.


## 계정 없는 구성원 (사용자 후속 확정)

총무가 계정 없이 구성원을 등록하고 회비를 관리한다. 내역을 직접 조회할 구성원에게만 계정을 제공한다.
- 참가자 명부와 인증 계정을 분리. 기존 계정/회비의 ID와 이력은 보존해 명부로 이관한다. 가짜 로그인 계정이나 임의 비밀번호를 생성하지 않는다.
- 총무/총괄 이름 등록, 총괄만 대상 구성원 전용 초대 발급. 가입 시 기존 참가자 ID에 실제 account/membership을 연결하며 회비 이력 중복 생성 없음. 일반 가입도 명부와 함께 생성.
- 동일 이름은 허용하며 명시적 초대 대상 ID로만 연결. 기존 구성원은 먼저 검색하도록 등록 화면에 안내.
- migration 010: 명부·회원가입 연결 트리거·대상 초대 매핑 추가, dues_event 대상 FK만 명부로 변경. 기존 사실 행은 수정/삭제하지 않는다. 복구는 기능 비활성화 후 테이블/이력 보존.
- 검증: 총무 등록, 일반사용자 거부, 재시도 중복 방지, 계정 없는 회비/납부, 총무 초대 거부, 다른 가족/만료/권한 회수 거부, 초대 가입 후 명부·회비 연속성. 화면 등록 버튼·폼·계정 상태·초대 코드 제공.

### 계정 분리 구현·검증 결과 (2026-10-26)

- WB-19 / R02·R18·R19: 가족 관리 상단 구성원 등록 → 이름만 등록 → 계정 없이 회비/납부 관리. 총괄의 구성원별 계정 초대 → 가입 후 기존 명부/회비/납부 이력 유지. 총무는 계정 권한을 부여할 수 없다.
- 변경 파일: `010_family_participants.sql`, `auth.py`, `dues/{models,repository,routes}.py`, OpenAPI/생성 타입, 프록시 allowlist; 웹 `family/participant-create.tsx`, `participant-invite.tsx`, `family-view.tsx`, `/family/register/page.tsx`, app-shell, workspace.css; `test_participants.py`, `participants.spec.ts`, README·요구사항·보드.
- 최초 신규 테스트는 등록 API 부재(404)로 실패 후 구현. 관련 API 15개 통과 후 납부 이력 보존·총무 권한·009→010 이관 테스트를 추가했다.
- `python -m pytest apps/api/tests -q --tb=no --basetemp=var/pytest-participants-all`: **101 passed**, 240.31초. 기존 Starlette/httpx deprecation 경고 1건. 계정 없는 구성원의 합성 회비·납부 후 가입 연속성, 총무 등록/초대 거부, 재시도·가족 격리, 이전 dues_event 행 불변 검증 포함.
- `scripts/test_service.py participants.spec.ts` 및 `family-dues.spec.ts`를 격리 포트 3101/8101에서 각각 실행: **각 1 passed**. 등록 버튼→이름 등록→총괄 초대→가입→명부 중복 없음, 기존 회비/대시보드 회귀. 320px 가로 넘침 없음 및 초대 코드 없는 모바일 화면 직접 검토.
- `npm --prefix apps/web run build`, `run typecheck`, `run lint` 통과. `python -m ruff check apps/api/src apps/api/tests`, `python -m pip check`, `node --test tests/design/theme.test.cjs`(9 passed), `python scripts/validate_foundation.py`, `git diff --check` 통과. 넓은 범위 `ruff check apps/api`는 기존 `export_openapi.py`의 unused noqa 1건을 보고했으며 관련 없는 파일은 변경하지 않았다.
- `python scripts/backup_database.py`로 비공개 백업 후 `family_ledger.postgres.migrate(owner_dsn)`로 010 적용, `node scripts/dev.mjs --production-build` 재시작. 실제 서버 로그인 200, 일반사용자 가족 관리 API 403, 총무/총괄 200 및 계정 상태 필드 확인. 실제 회비는 미설정 유지, 에이전트가 실제 구성원/납부를 생성하지 않았다.
- 계정 비활성화와 모임 참여 명부는 별개다. 구성원 탈퇴·이름 정정 화면은 이번 범위 밖이다. 기존 계정을 다른 구성원으로 합치는 기능은 없으며 등록된 사람의 전용 초대로 새 계정을 연결한다. 실기 터치 및 사용자 수용 확인은 미완료. 초대 코드 자동 발송은 하지 않는다.

### 제목/등록 버튼 간격 후속 수정

- WB-19 / R18·R19. 원인: 일반 `.page-title`는 하단 여백만 제공하는데, 등록 버튼 추가 시 제목/동작 flex 배치를 누락했다. 기존 `.expense-title` 배치를 `.page-title-with-actions` 공통 이름으로도 제공하고 gap을 `--space-5`(20px)로 연결했다. 가족 목록과 구성원 등록 화면 두 곳에 적용. 계약/API/DB 변경 없음.
- 변경: `workspace.css`, `family-view.tsx`, `participant-create.tsx`, 디자인 시스템 제목/주요 동작 규칙, 이 기록과 WORKBOARD.
- `npm --prefix apps/web run build`, `npm --prefix apps/web run lint` 통과. 로컬 서버 재시작 후 `node var/check-spacing.cjs`로 두 화면 × 1440/768/320px × light/dark 총 12조건의 실제 경계 간격 20px 이상·가로 넘침 없음 확인. PC/모바일 다크 제목 영역 캡처 직접 확인. 첫 실행은 기본 Playwright 브라우저 미설치로 실패했으며 프로젝트 설정의 설치된 Chrome 경로로 재실행해 통과했다.
- 실기 터치/전체 접근성 점검은 미실행. 금융 데이터 변경 없음. 사용자 시각 확인 대기.

### 등록 정보 확장 요청 — 검토 중

- 사용자 요청: 이름 외 생일, 매월 납부액 등 관리 정보를 등록 화면에서 함께 관리.
- 현재 확인: 등록 API는 이름만 받으며 생일 저장 필드가 없다. 월 회비는 별도 dues_event에 이력 저장되고 총괄관리자만 설정 가능하다.
- 제안: 기본 정보(이름·생일), 회비 설정(월 회비·적용 시작 월·공통 마감일 안내), 선택적 계정 연결을 구분. 생일은 미입력 허용, 미설정 회비를 0으로 해석하지 않는다. 등록 후 정보 확인·수정 흐름까지 연결한다.
- 후속 답변으로 확정: 생일 양력/음력 구분, 월 회비 설정·변경은 총괄관리자만. 공통 마감일·계정 권한 규칙은 기존 범위를 유지한다. 연락처·주소 등 추가 개인정보는 이번 요청에서 임의로 포함하지 않는다.
- 검토 당시 제품 코드/DB 변경 없음. 아래 확정·구현 결과로 이어진다.

### 등록 정보 확장 확정 및 실행 계획

사용자 답변: 양력·음력 구분, 회비 설정/변경은 총괄관리자만. 생일은 연도 없는 월/일과 달력·윤달 여부, 선택 입력으로 구현한다. 자동 변환·알림은 범위 밖. 총무/총괄 기본 정보 수정, 회비는 기존 변경 이력을 유지한다.
- [x] migration 011: 불변 프로필 변경 이력(이름·생일·작성자·버전·요청 payload). 기존 명부 ID/회비 유지. 초기 등록+회비는 동일 트랜잭션. 기존 명부를 삭제/수정하는 복구 금지.
- [x] API 입력 검증/권한/원자적 저장/재시도/충돌/기존 자료 보존 테스트 → `dues/participants.py`, 모델·라우트·조회 최신 프로필 적용. 일반사용자 프로필 조회 거부, 총무 회비 요청 거부.
- [x] 등록·정보 수정 폼: 기본 정보/생일/관리자 회비/계정 안내 분리. 등록 시 월 회비 미설정 허용, 값 입력 시 적용 월 필수. 공통 마감 안내. 가족 목록 생일·정보 수정 진입. 계약/생성 타입 동시 갱신.
- [x] 관련 API/브라우저·빌드·린트·foundation 검증, 실제 DB 백업 후 이관, 로컬 재시작. 실제 개인정보/회비 입력 없음. 변경 파일·실행 결과를 이 문서에 기록.

### 생일·등록 시 회비 구현 결과

- WB-19 / R02·R18·R19. 생일은 선택 입력(양력/음력, 월·일, 음력 윤달), 총무/총괄 기본 정보 수정 가능. 총괄만 최초 회비/시작 월을 등록과 함께 원자적으로 저장. 기존 회비 변경은 가족 관리의 설정/이력으로 연결한다.
- `011_participant_profiles.sql` 추가 이력 테이블. 기존 명부/계정/회비 행은 변경하지 않으며 최신 프로필을 조회에 투영한다. 수정 버전 충돌 거부, 요청 ID 재시도 처리, 잘못된 날짜/금액/권한/과거 적용 월 거부. 회원가입 여부와 독립적이다.
- 변경 파일: 위 migration, `dues/{models,participants,repository,routes}.py`, API 계약/생성 타입, 프록시, `participant-create.tsx`, `family-view.tsx`, `/family/[id]/edit/page.tsx`, workspace.css; `test_participant_profiles.py`, `participant-profiles.spec.ts`; README·요구사항·디자인 시스템·보드.
- 신규 API 2개 최초 실패 → 구현. 중간 1 failure는 다른 대상에 재사용한 테스트 요청 ID(409가 정상), 1 error는 Windows 기본 pytest 임시 디렉터리 권한이었다. 새 요청 ID와 저장소 내부 basetemp로 수정했다.
- `python -m pytest apps/api/tests -q --tb=no --basetemp=var/pytest-profile-all`: **103 passed**, 278.24초. 기존 Starlette/httpx 경고 1건. 검토에서 이름 변경 후 이력 이름 불일치를 발견해 최신 프로필로 통일했고, 최종 해당 API 테스트 **2 passed**로 확인했다.
- `scripts/test_service.py participant-profiles.spec.ts`(3101/8101): 최초 생일 선택 상자 label 탐색 실패 → 명확한 aria-label 추가 → **1 passed**. 총괄의 음력/윤달+회비 등록, 총무의 양력 생일 수정, 회비 유지·회비 입력 없음, 1440/320px 넘침 없음 검증. 합성 다크 화면 직접 검토.
- 최종 `npm --prefix apps/web run build`(타입 포함), `run lint`, `python -m ruff check apps/api/src apps/api/tests` 통과. 새 의존성 없음.
- 로컬 DB 비공개 백업 후 migration 011 적용, production-build 서비스 재시작. 실제 생일·회비는 임의 입력하지 않았다. 복구 시 기능 비활성화 후 새 테이블/이력을 보존하며 010/011을 역삭제하지 않는다.
- 제한: 생년은 수집하지 않으며 생일 알림·음양력 날짜 자동 변환은 미구현. 미입력 생일/회비를 추정하지 않는다. 실기 터치·전체 접근성 및 사용자 수용은 미검증.

- 최종 회귀 `scripts/test_service.py participants.spec.ts family-dues.spec.ts`(3101/8101): **2 passed**. 로컬 실제 서버 로그인 200, 일반사용자 가족 관리 API 403, 총무/총괄 200 및 프로필 기본값·회비 미설정 유지 확인. 최종 foundation/diff 검사 통과.

### 등록 폼 통합·날짜 선택 후속 확정

사용자 확정: 불필요한 영역 구분 축소, 생일 달력 선택, 회비 시작 연월일 저장. 첫 회비는 시작일 다음 달부터 전액 적용(1일 시작도 다음 달), 일할 계산 없음. 총괄만 설정 권한 유지.
- [x] 단일 카드 폼으로 통합하고 설명 축소. 생일은 기존 연도 없는 양력/음력 월·일 선택 달력, 음력 윤달 유지. 키보드/모바일 동작 검증.
- [x] 최초 등록과 기존 회비 설정 모두 시작일 입력 및 첫 적용 월 안내. 기존 월 설정 이력은 변경하지 않고 신규 시작일을 별도 필드로 보존. API/DB에 다음 달 규칙 검증, 금액/권한/원자성 유지.
- [x] 관련 API·브라우저·빌드·린트·foundation, 백업/이관/로컬 재시작. 실제 구성원 데이터 변경 없음.

### 단일 폼·생일 달력·회비 시작일 구현 결과

- WB-19 / R02·R18·R19. 등록/수정 화면을 단일 카드로 통합하고 긴 설명을 축소했다. 생일 월·일 선택 달력(양력/음력·윤달)은 선택/지우기/Esc·포커스 복귀/화살표·Home·End 이동을 지원한다. 출생연도/요일을 임의로 추정하지 않는다.
- 등록과 기존 회비 변경 화면 모두 연월일 시작일 입력. 시작일 다음 달을 첫 부과 월로 계산하며, 기존 회비는 이전까지 유지한다. 정확한 시작일은 `dues_event.starts_on`에 보관하고 이력에 시작일→적용 월을 표시. 미래 설정만 있는 구성원은 적용 예정과 예정 월/금액 표시, 당월 미납에서 제외.
- migration 012는 nullable 시작일 컬럼과 다음 달 검증 제약만 추가. 기존 월 단위 기록과 월 형식 API 호환성을 유지하며 기존 시작일을 임의 역산하지 않는다. 새 UI는 날짜 계약을 사용한다. 초기 회비는 구성원 등록과 같은 트랜잭션, 총괄 권한·금액 문자열 불변.
- 변경: `birthday-picker.tsx`, `participant-create.tsx`, `family-view.tsx`, `dues-shared.tsx`, workspace.css; `012_dues_start_date.sql`, `dues/{models,participants,repository}.py`, 계약/생성 타입; 프로필 API/브라우저·가족 회비·이관 테스트와 README/요구사항/디자인/보드.
- 신규 시작일 API 최초 미구현 실패→관련 API 5 passed. 12월→다음 해 1월, 월초 시작, 윤년 날짜 검증 추가. 리뷰에서 서로 다른 작업에 같은 요청 ID 재사용 시 예외를 발견해 409로 수정, 최종 프로필 API **4 passed**.
- `npm --prefix apps/web run build`: 최초 strict 타입 검사에서 optional 값 오류→명시적 기본값/타입 보완 후 통과. 최종 lint/ruff 통과. 새 라이브러리 없음.
- `scripts/test_service.py participant-profiles.spec.ts family-dues.spec.ts`(3101/8101): **2 passed**. 한 카드, 달력 클릭/키보드/Esc·포커스 복귀, 1440/320px 다크 배치와 달력 화면 직접 검토. 기존 당월 20,000/40,000 회비는 유지하면서 다음 달 30,000/50,000으로 예약, 당월 입금/취소/대시보드 합계 유지 검증.
- 이전 이관 테스트가 SELECT * 행 형태까지 비교하여 새 nullable 컬럼 추가를 데이터 변경으로 오인했다. 원래 14개 사실 필드를 명시적으로 비교하도록 수정, 이관 단독 **1 passed**. 새로운 컬럼의 추가를 원래 이력 수정으로 취급하지 않는다.
- 생일 연도/자동 변환/자동 알림 미구현 유지. 실제 개인정보·회비는 입력하지 않는다. 실기 터치·전체 접근성·사용자 수용 확인은 미검증.

- 전체 `python -m pytest apps/api/tests -q --tb=no --basetemp=var/pytest-fee-date-all`: **104 passed / 이관 테스트 1 failed**, 268.15초. 위 이관 비교 수정 후 해당 테스트 **1 passed**. 전체를 다시 실행했다고 보고하지 않는다. 최종 기능 API 4·브라우저 2 통과.
- 비공개 DB 백업 후 migration 012 적용, `node scripts/dev.mjs --production-build`로 로컬 재시작. 복구 시 새 쓰기 기능을 비활성화하고 시작일 컬럼/기록 보존, 기존 회비를 역수정하지 않는다.

- 최종 로컬 읽기 검증: 로그인/등록 페이지 200, 일반사용자 가족 관리 403, 총무/총괄 200 및 예정 회비 필드 확인. 실제 회비 미설정 상태 유지. foundation PASS·diff 검사 통과.

### 생년월일 후속 요청
사용자 확정: 양력/음력을 유지하고 출생연도까지 달력 선택·저장. 올해 생일 회차는 서버 KST 올해-출생연도로 표시하며 현재 만 나이로 오인하지 않도록 연도를 명시한다. 기존 월/일만 있는 프로필은 출생연도 미등록으로 표시, 임의 보정하지 않는다. JSON 프로필에 optional year를 추가하므로 DDL 변경 없음. 신규 입력/수정 시 생일을 등록하면 연도를 요구하고 양력 윤년·미래 출생연도를 검증한다. 음력 자동 변환은 추가하지 않는다. 관련 API/브라우저·빌드·린트 후 로컬 적용.

### 출생연도 구현·검증 기록

- WB-19 / R02·R18·R19. 생일 JSON에 year를 추가(기존 값은 null로 조회), 신규/수정 생일은 출생연도 필수. 실제 데이터 보정·DDL 변경 없음. 양력은 해당 출생연도의 윤년 및 미래 날짜를 검증하고 음력은 기존 달력 구분·윤달 입력을 보존한다.
- 달력 안 출생연도 입력, 연도별 양력 일수, 월 이동 시 연도 전환. 올해(KST) 출생연도 차이로 ‘YYYY년 N번째 생일’ 표시, 올해 출생은 ‘YYYY년 출생’. 현재 만 나이나 음력 변환일 기반 나이로 표시하지 않는다.
- 리뷰에서 달력 임시 연도의 HTML constraint가 닫힌 뒤 전체 폼 저장을 막는 문제를 발견. 연도 숫자 입력과 선택 가능 여부를 분리해 취소 시 기존 저장값을 유지하며 숨겨진 입력 검증이 제출을 막지 않도록 수정. 취소 회귀 테스트 추가.
- 변경: `dues/models.py`, `dues/participants.py`, OpenAPI/생성 타입; `birthday-picker.tsx`, `participant-create.tsx`, `family-view.tsx`, workspace.css; 프로필 API/브라우저 테스트 및 README/요구사항/디자인/보드.
- 신규 테스트 최초 미구현 실패 후 `python -m pytest apps/api/tests/test_participant_profiles.py apps/api/tests/test_participants.py apps/api/tests/test_dues_api.py -q --tb=no --basetemp=var/pytest-birthyear`: **10 passed**, 61.75초. 기존 Starlette/httpx 경고 1건. 전체 API 재실행은 하지 않았다.
- 최초 빌드/타입·린트 통과 후 달력 취소 보완. 마지막 빌드 재실행에서 생성 폴더 EPERM 발생, 해당 불완전 빌드로 시작한 격리 서비스는 preview-props.json 부재로 시작 실패. 테스트 서비스 정리 후 빌드를 재검증한다.

- 테스트 서비스 정리 후 최종 빌드 **통과**. `npm --prefix apps/web run lint`, `python -m ruff check apps/api/src apps/api/tests` 통과.
- `scripts/test_service.py participant-profiles.spec.ts participants.spec.ts`(3101/8101): **2 passed** (35.7초). 출생연도 2000 저장·수정·회차 표시, 1999/2000년 2월 일수 차이, 잘못된 임시 연도 취소 후 저장 가능, 320px 달력 경계/키보드·포커스 및 계정 연결 회귀. 합성 모바일 다크 달력 직접 확인. 명부 개수 검증은 고정 4명 대신 등록 전+1로 보완해 독립성을 유지했다.
- `node scripts/dev.mjs --production-build`로 재시작. DDL/실제 프로필 수정 없음. foundation/diff 통과. 실제 로그인/가족 조회/등록 화면 읽기 확인. 실기 터치·전체 접근성·음력 양력 변환은 검증/구현 범위 밖이며 월·일·윤달은 입력 그대로 보존한다. 사용자 확인 대기.

### 개인 회비 설정 위치 통합
사용자 확정: 개인 회비/시작일은 구성원 등록·수정에서만 관리, 가족 관리에는 공통 마감일만 유지. 기존 총괄 권한·다음 달 적용·이력 유지. 수정 API에 회비/시작일 선택 입력을 추가하고 프로필과 같은 트랜잭션으로 저장. 값이 변경되지 않으면 회비 이력을 생성하지 않는다. 예정 시작일을 조회에 제공해 수정 폼에 재표시한다. 관련 API 원자성/권한/중복 테스트와 브라우저 실제 동선 검증 후 적용. DB 변경 없음.

### 개인 회비 위치 통합 구현·검증 결과

- WB-19 / R02·R18·R19. 가족 관리의 개인 회비 폼 삭제, 공통 납부마감일만 유지. 구성원 수정은 현재/예정 회비를 보여주고 총괄에게 월 회비·시작일 입력을 제공. 총무는 조회만 가능. 이름·생일만 저장하면 회비 이력을 추가하지 않는다.
- ParticipantUpdate에 선택적 금액/시작일·대체 예정 이벤트 ID 추가. 프로필·회비 변경을 단일 트랜잭션으로 저장. 예정 설정 변경은 현재 예정 ID 검증 후 대체 링크를 기록한다. 기존 적용 중인 회비/납부는 보존하며 지난 적용 월은 정정하지 않는다.
- 초기 계획은 DDL 없이 화면 이동이었으나, 예정 시작일을 뒤로 옮길 때 기존 부과가 남는 결함을 리뷰에서 발견했다. `013_dues_fee_replacement.sql`의 불변 연결 테이블로 대체 사실을 보관한다. 같은 월의 이전 설정이 다시 활성화되는 경우까지 보완해 대체 대상과 그 이전 같은 월 결정을 집계에서 제외하고 이력에는 ‘변경 전’으로 표시한다.
- 변경 파일: 위 migration, `dues/{models,participants,repository}.py`, OpenAPI/생성 타입; `participant-create.tsx`, `family-view.tsx`; 프로필 API·가족 회비/프로필 브라우저 테스트, 보드와 문서.
- 신규 API 최초 미구현 실패 후 관련 테스트 **11 passed**, 대체 기능 추가 후 `python -m pytest apps/api/tests/test_participant_profiles.py apps/api/tests/test_participants.py apps/api/tests/test_dues_api.py -q --tb=no --basetemp=var/pytest-fee-unify-final`: **12 passed**(72.70초). 같은 달 과거 결정 재활성화 방지 보완 후 대체·원자성/권한 **2 passed**(13.37초). 기존 Starlette/httpx 경고 1건. 전체 API 재실행 아님.
- `scripts/test_service.py family-dues.spec.ts participant-profiles.spec.ts`(3101/8101): **2 passed**(42.7초). 가족 관리 개인 입력 없음/공통 마감일 유지, 수정 화면 기존 값·예정 시작일 재표시, 변경 없는 저장 시 회비 이력 증가 없음, 회비 변경·총무 입력 차단, 당월 납부/취소/대시보드 회귀.
- 최종 build(타입 포함)/lint/ruff 통과. 기존 DB 비공개 백업 후 migration 013 적용, production-build 재시작. 실제 회비/구성원 변경 없음. 복구는 새 쓰기 기능 비활성화 및 연결 이력 보존, 테이블/금융 이력 삭제 금지. 실기 터치·전체 접근성·사용자 수용은 미검증.

- 로컬 최종 읽기 확인: 로그인 200, 총무/총괄 가족 조회·구성원 수정 페이지 200, 총괄만 can_configure=true 및 예정 회비 ID/시작일 필드 확인. 실제 금융 값은 출력/수정하지 않았다. foundation PASS·diff 검사 통과.

### 납부 현황 날짜 분리·확인 명칭 후속
사용자 요청: 구성원별 현황에서 월 회비와 납부일을 나눠 표시. 납부일이 공통 마감일인지 실제 입금일인지 확인 질문 중. 독립 변경으로 은행 입금 연결 제목을 회비 납부 확인으로 변경하고, 업로드한 모임통장 거래를 특정 구성원의 조회 월 회비 납부로 확인하는 기능임을 안내한다. 계좌 연동 기능을 추가하는 작업이 아니다.

- 사용자 답변: 납부일은 공통 마감일. 기존 서버 due_on(한국 날짜·조회 월·월말 보정)을 재사용해 월 회비와 별도 열로 표시, 미설정은 미설정 표기. 모바일 카드에서도 각각 라벨 유지. API/DB 변경 없음.

- 변경 파일: `family-view.tsx`, `workspace.css`, `family-dues.spec.ts`, 디자인 시스템·보드·이 기록. 기존 due_on 계약만 사용하므로 API/DB 테스트 재실행이나 데이터 이관 없음. 최초 빌드는 _not-found 생성 폴더 EPERM으로 실패, 재실행 build(타입 포함) 통과. lint/foundation/diff 통과.

- `scripts/test_service.py family-dues.spec.ts`(3101/8101): **1 passed**(33.4초). 공통 마감일 미설정/설정 후 날짜, 월 회비와 별도 표시, 390/320px 라벨·가로 넘침 없음, 납부 확인/취소와 대시보드 회귀. 합성 모바일 캡처 확인. 로컬 재시작 후 로그인/가족 화면 200 및 due_on 응답 확인, 실제 데이터 변경 없음. 실기 터치·사용자 수용 미확인.

### 공통 마감일 달력·수동 확인 UI 제거
사용자 요청: 공통 납부마감일 달력 선택, 회비 납부 확인 영역 제거. 날짜 하나를 선택하면 그 월부터 해당 일을 공통 월 마감일로 설정하고 월말 보정은 유지. 개인별 입금 확인 버튼도 제거하여 죽은 이동을 없앤다. 기존 납부/정정 이력·API는 보존하고 자동 매칭은 추가하지 않는다. 업로드만으로 납부 완료되지 않는다는 현재 한계를 안내했다. API/DB 변경 없이 UI/브라우저 회귀 및 빌드 후 로컬 적용.

- WB-19 / R18·R19. 변경 파일: `apps/web/src/features/family/family-view.tsx`, `apps/web/tests/family-dues.spec.ts`, README·WORKBOARD·이 문서. 공통 마감일은 날짜 입력 한 개로 적용 월/매월 일자를 전달하며 월말 보정과 총괄관리자 권한을 유지. 수동 납부 확인 영역 및 입금 확인 버튼 삭제, 기존 확인/취소 이력 보존. API/DB 변경 없음.
- `npm --prefix apps/web run build`(타입 포함), `npm --prefix apps/web run lint`, `apps/api/.venv-pg/Scripts/python.exe scripts/validate_foundation.py`, `git diff --check`: 통과.
- `scripts/test_service.py family-dues.spec.ts`(실행 시 3101/8101로 치환): **1 passed**(28.8초). 달력 입력 저장·조회 월 마감일 표시·수동 입력 제거·기존 납부 기록/취소·대시보드·권한·390/320px 넘침 없음 검증. 합성 모바일 다크 캡처 확인.
- 로컬 production-build 재시작 후 로그인/총무 세션/가족 회비 조회/가족 화면 HTTP 200 확인. 실제 구성원·금융 데이터 변경 없음. 자동 입금자 매칭 미구현, 전체 API 회귀 및 실기 터치 미검증. 사용자 확인 대기.

### 미납 현황 독립 위젯
WB-19 / R18·R19. 사용자 요청에 따라 내 할 일에서 미납 현황을 분리한다. 서버 허용 위젯에 총무·총괄용 dues 추가, 기존 배치 보존/새 위젯 자동 추가, 동일한 드래그·크기·자동 저장 사용. 미납 집계/요청 API는 유지. 변경 범위는 배치 계약·생성 타입·대시보드 연결/스타일·권한/저장 회귀 검증이며 DB 이관 없음.

- 변경 파일: `dashboard_layout.py`, `dashboard-view.tsx`, `dashboard-workspace.tsx`, `payment-tasks.tsx`, `dues-summary.tsx`, `workspace.css`, OpenAPI/생성 타입, `test_dashboard_layout.py`, `dashboard-layout.spec.ts`, `family-dues.spec.ts`, README·보드·이 기록.
- 새 위젯 ID `dues`는 총무/총괄에게만 허용. 기존 저장 배치의 순서·크기를 유지하면서 없는 위젯을 추가. 미납 집계/요청은 기존 서버 권한과 서비스를 사용. DB/실제 금융 자료 변경 없음.
- 신규 정규화 테스트 최초 1 failed/3 passed, 구현 후 `python -m pytest apps/api/tests/test_dashboard_layout.py -q --tb=no`: **4 passed**. `npm --prefix apps/web run lint`, 해당 Python 파일 ruff, foundation, diff 검사 통과.
- 계약 생성 시 개발 전용 스키마로 잘못 생성해 최초 build 타입 검사 실패. 정식 `apps/api/export_openapi.py` 및 `npm --prefix apps/web run contracts`로 전체 계약 재생성 후 `npm --prefix apps/web run build` 통과.
- `scripts/test_service.py family-dues.spec.ts dashboard-layout.spec.ts`(3101/8101): **2 passed**(50.9초). 독립 표시, 크기 변경/재로드 유지, 일반사용자 위젯 읽기 제외/쓰기 403, 기존 배치 조작·납부 현황·이력 회귀. 합성 대시보드 캡처에서 분리 확인.
- production-build 재시작, 실제 로컬 읽기 점검: 총무/총괄 dues 허용, 일반사용자 미허용, 대시보드 HTTP 200. 전체 API 회귀·실기 터치 미검증, 사용자 확인 대기. 이전 대화의 공통 마감일 일자 전용 입력 수정은 이번 위젯 작업에 포함하지 않았다.

### 미납 위젯 가시성 개선
WB-19 / R18·R19. 미확인 인원/금액을 요약 카드로 강조하고 설정된 회비의 납부 확인 인원 막대를 제공. 구성원은 금액·상태 배지·요청 버튼이 있는 목록으로 표시. 미설정과 자료 부족은 별도 안내, 미설정을 납부 완료로 취급하지 않음. 토큰 기반 반응형/다크 대응, 기존 API·권한·요청 동작 유지. 브라우저 회귀/화면 확인 후 적용.

- 변경 파일: `dues-summary.tsx`, `workspace.css`, `family-dues.spec.ts`, WORKBOARD·이 문서. 요약 인원/금액, 설정 인원 기준 납부 완료 막대, 구성원 아바타/상태 배지, 미설정/자료 부족 분리 안내, 작은 위젯의 버튼 줄바꿈. 금액은 기존 문자열/BigInt 유지. API·DB 변경 없음.
- `npm --prefix apps/web run build`, `npm --prefix apps/web run lint`, `python scripts/validate_foundation.py`, `git diff --check` 통과. `scripts/test_service.py family-dues.spec.ts`(3101/8101): **1 passed**(42.0초). 미확인 2명/금액, 설정 인원 2명·완료 0명 막대, 구성원 목록, 기존 권한/이력 회귀 및 320px 위젯 가로 넘침 없음 확인.
- 합성 자료의 데스크톱 라이트/다크·모바일 다크 캡처 직접 확인: `var/dues-widget-{light,dark,mobile}.png`. production-build 재시작 및 로그인/대시보드 HTTP 200 확인. 실제 금융 데이터 변경 없음. 전체 API 테스트·실기 터치 미검증, 사용자 확인 대기.

### 은행 입금 자동 회비 연결
WB-19 / R06·R18·R19. 사용자 승인: 구성원 이름과 입금 내용이 정확히 일치하는 입금은 한국 날짜 기준 입금 월 회비로 합산, 초과액 이월 없음. 동명이인/불일치 자동 확정 금지. 예금이자는 제외. 업로드·구성원/회비 설정 변경 후 같은 가족 트랜잭션에서 기존 payment 이력으로 연결하며 원장/은행 원본은 불변. 이미 한 번 처리된 거래(취소 포함)는 자동 재연결 금지. 기존 자료 재확인용 관리자 POST 제공, GET은 읽기 전용. 마감일 경과·조회기간 완전·미연결 입금 확인 완료 시에만 실제 미납 집계 확정, 나머지는 납부 대기/자료 확인 필요. API/생성 타입·권한·중복·월 경계·부분/초과·취소·브라우저 검증, DB DDL 없음.

#### 자동 연결 구현·검증 결과
- 변경: API `dues/{matching,models,repository,participants,routes}.py`, `documents/repository.py`; 웹 프록시 허용 경로, `dues-{shared,summary}.tsx`, `family-view.tsx`, `deposit-review.tsx`, workspace.css; OpenAPI/생성 타입; `test_dues_matching.py`, `dues-auto.spec.ts`, 기존 가족 회비 회귀 및 README/보드/이 문서.
- 업로드·구성원 저장·회비/마감일 설정 시 가족 잠금 안에서 정확한 이름/입금 월 기준 자동 payment 이력 기록. 원본/원장 변경 없음, 기존 수동 연결·취소 거래 자동 재처리 없음. GET은 읽기 전용, 기존 자료 재확인은 CSRF·가족·현재 관리자 권한을 검사하는 POST `/dues/reconcile`. 미연결 입금은 100건씩 확인 목록 제공, 구성원 지정 시 기존 권한 있는 payment API로 기록. 예금이자 제외, 부분 납부 합산·초과 이월 없음.
- 미납 인원/금액은 해당 월 마감일 경과·자료 기간 연속·미연결 입금 없음·적용 회비 있음 조건에 따라 집계. 미설정 구성원은 별도 안내하며 합계에 임의 0원을 부과하지 않음. 회비가 한 명도 설정되지 않았으면 미납 집계 null. 취소·불일치 입금이 남으면 미납 확정 보류.
- `pytest test_dues_matching.py test_dues_api.py test_participant_profiles.py -q --tb=no`: 11 passed (67.28초). 추가 월 경계/기존 자료/동시 재확인과 통장·구성원 회귀 `test_dues_matching.py test_bank_sync.py test_participants.py`: 10 passed (62.67초). 최종 미설정 보호 포함 `test_dues_matching.py`: 4 passed (30.99초). 전용 PostgreSQL 스키마·runtime 권한 회귀 사용, 기존 Starlette/httpx 경고 1건.
- 최초 브라우저 검증에서 새 재확인 경로의 웹 프록시 허용 누락(404) 발견 후 보완. `scripts/test_service.py dues-auto.spec.ts`(3101/8101): 1 passed (21.0초). 업로드 자동 2건 연결→불일치 수동 지정→재확인 0건→실제 미납 1명/100원 검증. `family-dues.spec.ts` 별도 격리 실행: 1 passed (35.2초). 최종 변경은 미설정 null 보호와 안내 문구이며 API 4·build 재검증 완료. 전체 브라우저/전체 API 일괄 회귀는 미실행.
- 최종 `npm --prefix apps/web run build`(타입 포함), lint, Python 전체 ruff, foundation, diff 통과. 실제 DB 비공개 백업 생성 후 정상 서비스 POST로 기존 자료 재확인: 신규 연결 0건, 적용 회비 0명/미설정 4명, 조회 기간 충족·미연결 당월 입금 0건. 임의 회비/원장/은행 자료 변경 없음. 최종 production-build 재시작.
- 복구: 자동 연결 진입을 비활성화하고 잘못된 개별 연결은 기존 reversal로 정정. payment/은행 원본/감사 이력을 삭제하지 않는다. DDL/데이터 마이그레이션 없음. 실기 터치·운영 배포 미검증. 동명이인·타인 명의·회비 외 입금은 자동 판정하지 않으며 확인 목록에 남는 동안 실제 미납 확정을 보류한다. 사용자 회비 설정·수용 확인 대기.

### 납부 요청 비활성 사유 안내 (2026-10-26)
- WB-19 / R18·R19. `reminder-button.tsx`에 조회 월 회비 미설정/적용 예정 월, 마감일 미설정, 미래 월, 남은 금액 없음, 처리 중 사유를 구분. `family-view.tsx`, `dues-summary.tsx` 공통 적용, workspace.css 토큰 스타일. API·DB·권한·부과 기준 변경 없음.
- aria-disabled 버튼으로 키보드 포커스를 유지하되 클릭·Enter의 요청 실행을 차단. hover·포커스·탭 시 안내, Escape/blur/마우스 이탈 시 닫기. 화면 읽기용 설명 연결, portal로 표/위젯의 overflow 잘림 방지.
- `npm --prefix apps/web run build`(타입 포함), `npm --prefix apps/web run lint`, `python scripts/validate_foundation.py`, `git diff --check`: 통과.
- `scripts/test_service.py family-dues.spec.ts`(격리 3101/8101): 1 passed(34.6초). 회비 미설정 hover/포커스 안내, Escape 닫기, Enter 요청 차단 및 기존 납부 요청 흐름 검증. 실제 서비스 production-build 재시작. 실제 DB 변경 없음. 실기 터치·모든 사유별 브라우저 검증·전체 회귀 미실행, 사용자 확인 대기.
