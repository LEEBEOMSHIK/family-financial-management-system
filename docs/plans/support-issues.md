# 문의·이슈 관리 설계 초안

WB-20 / R21·R18·R19 · 2026-10-26 · 사용자 설계 승인 · 개발 검증 완료 · 사용자 확인 대기

## 확정
- 여러 사용자가 문의·시스템 문제를 등록하고 진행 상황을 확인하는 화면.
- 등록 한 건에 문제 영역 핀 최대 5개. 작성 부담 최소화.
- 기존 로그인·가족별 서버 ACL·CSRF·비공개 파일 접근 원칙 적용.

## 추가 확정
- 현재 사용 중인 화면에 직접 최대 5개 핀 표시. 사용자가 캡처 파일을 준비하는 흐름이 아니다.
- 총괄관리자만 전체 문의 확인·처리 상태 변경. 총무는 일반사용자와 동일하게 자기 문의만 등록·조회하는 흐름 제안.

## 화면 직접 표시 방식
- 모든 인증 화면 헤더에 ‘문제 신고’ 진입 버튼 제공. 이동 없이 현재 화면 위 표시 모드 진입.
- 표시 모드에서는 원래 화면의 클릭·송금 관련 버튼 등 동작을 막고 문제 위치 선택만 수행. 취소하면 원래 화면으로 복귀.
- 1~5 번호 핀 및 짧은 설명. 이동·삭제 가능, 여섯 번째 위치 선택 시 제한을 안내. 모바일은 탭, 키보드는 포인터 대체 조작 지원.
- 화면 경로·화면 이름·뷰포트 크기와 핀 상대 좌표 저장. 위치 재현을 위해 대상 요소의 안전한 식별 정보와 상대 위치도 보관하며 전체 DOM/입력값을 자동 수집하지 않음.
- 제출 전 핀/설명을 한 화면에서 검토. 최소 한 줄의 문제 설명만 요구하고 제목은 화면 이름을 기본값으로 제공.
- 등록 당시 화면 이미지와 핀을 함께 보관해 담당자가 같은 위치를 확인하도록 제안. 제출 전 캡처 미리보기에서 불필요한 영역 가리기·제외를 제공하고, 사용자가 제출한 뒤 비공개 저장. 비밀번호 입력은 캡처에서 제외한다.
- 캡처 구현은 브라우저 호환성·스크롤/위젯 좌표·외부 이미지 재현 검증이 필요. 실패 시 설명을 보존하고 재시도 또는 이미지 없이 등록하는 선택 제공. 조용히 잘못된 화면을 저장하지 않는다.

## 승인된 흐름
- 공통 메뉴 ‘문의·이슈’: 내 문의 목록, 검색·상태 필터, 문의 등록.
- 등록: 현재 화면에서 문제 신고 → 최대 5곳 핀 → 핀별 짧은 설명 → 제출 전 확인.
- 화면 이름·경로(민감한 쿼리 제외)·등록 시각 등 재현 맥락 자동 기록. 사용자가 장문의 환경 정보를 작성하지 않게 한다.
- 단순 문의는 핀 없이도 등록. 일반사용자는 본인 문의, 담당자는 같은 가족의 문의 조회.
- 접수 → 확인 중 → 해결, 추가 확인 필요 상태 지원. 작성자는 후속 댓글로 보완·재확인 요청, 상태 변경은 총괄관리자만 수행. 답변·상태 변경 이력을 보관.
- 신규 항목 저장·상태 변경은 중복 요청 방지와 동시 변경 충돌 처리를 포함.

## 영향 및 검증 계획
- 웹: 공통 메뉴, 문의 목록/등록/상세, 핀 작성 UI, 공통 스타일.
- API: 문의·핀·답변·상태 계약/생성 타입 및 역할·가족 범위 검사.
- DB: 신규 마이그레이션, 이력 보관, 이미지 사용 시 비공개 첨부. 복구 절차 작성.
- 합성 자료로 5개 허용/6개 거부, 핀 이동·삭제·반응형, 타인/타 가족 접근 차단, 중복 제출·동시 상태 변경 검증.
- 현재 기존 메뉴·문서 저장·RBAC 코드를 조사했으며 제품 코드/실제 DB는 변경하지 않음.

## 구현 계획 (executing-plans로 직접 실행)
- [x] API/DB: support/{models,repository,routes}.py와 014_support.sql. GET 목록/상세/이미지, POST 등록/이벤트. IssueCreate(최대 5핀, 정수 비율좌표, 선택 이미지), IssueEventCreate(expected_version, operation_id, comment, status). 작성자/현재 총괄 ACL, 암호화 이미지, append-only 이벤트, 멱등 키와 내용 해시, 가족 잠금 아래 버전 충돌.
- [x] API 테스트: test_support.py로 등록/6핀거부/CSRF/타인·타가족·총무 차단/총괄 철회/이미지/중복 및 버전 충돌 확인. 먼저 실패 확인 후 구현.
- [x] 웹: support/{reporter,capture,issue-view}.tsx 등 기능 폴더, 헤더 버튼·공통 메뉴·/support 페이지·프록시. 화면 위 핀 편집, 미리보기·가리기·이미지 제외, 제목 기본값, 실패 시 초안 유지. html-to-image 의존성 버전·라이선스 고정.
- [x] 브라우저: support.spec.ts에서 핀 5개/6개제한·이동/삭제·댓글·상태·역할별 목록·모바일 흐름. 타입/린트/build 및 foundation.
- [x] 실제 DB 백업 후 추가 마이그레이션 적용, 로컬 재시작, 검증/한계 인수인계. Git 커밋·푸시는 범위 밖.

## 검토 집중 조건
- 같은 요청 재시도는 중복 행 없이 반환, 내용 변경 재사용은 충돌.
- 다른 가족/일반사용자/총무는 남의 이미지도 조회 불가, 역할 철회 즉시 반영.
- 두 관리 화면 동시 변경은 expected_version으로 오래된 쓰기 거부.
- 모바일/스크롤/확대 시 좌표는 등록 당시 뷰포트 기준. 화면 크기 변경은 재표시 요구.
- 캡처 실패·네트워크 실패에서도 핀/설명 유지. 파일 비포함 제출 지원.

## 구현·검증 결과
- 변경 파일: `apps/api/migrations/014_support.sql`, `apps/api/src/family_ledger/support/{models,repository,routes}.py`, main.py; 웹 `features/support/{shared,capture,reporter,screen-preview,issue-list,issue-detail}`, `/support`·`/support/[id]`, app-shell·NavIcon·workspace.css·API 프록시; OpenAPI/생성 타입·package.json/lock; `test_support.py`, `support.spec.ts` 및 보드/요구사항/의존성 문서.
- `test_support.py` 최초 2 failed(API 미구현), 구현 후 2 passed. 최종 runtime 총무 제한·동시 변경 추가 및 기존 문서 회귀 `pytest test_support.py test_documents.py -q --tb=no`: 6 passed(40.07초), 기존 Starlette/httpx 경고 1건.
- 최초 브라우저 신고 버튼 미구현 실패. 구현 후 타입 선택값/불필요 ESLint 지시문 수정. 브라우저 테스트의 alert 선택 범위·로그인 완료 대기 보완. 독립 리뷰에서 캡처 스크롤·툴바 가림·응답 유실 재시도·목록 이미지 조회·마스크 1px 경계 발견, 모두 수정.
- `scripts/test_service.py support.spec.ts service.spec.ts`(격리 3101/8101): 6 passed(34.5초). 5핀/6핀 제한·키보드 이동·삭제·캡처·실제 가리기 픽셀·작성자/총무/총괄 접근·상태 변경·응답 유실 후 중복 없음·고정 요소 픽셀·모바일 미첨부 등록·기존 서비스 회귀.
- `npm --prefix apps/web run build`(타입 포함), lint, support Python ruff, foundation, diff 검증 통과. 설치 시 npm audit 0 vulnerabilities. 합성 PNG 미리보기/상세/모바일 직접 확인. 빈 캡처 문제는 CSS 논리 inset 잔존을 확인하고 보정한 뒤 fixed 헤더 픽셀 회귀로 검증.
- 실제 로컬 DB 비공개 백업 후 migration 014 추가 적용. 기존 원장·회비·역할 변경 없음. 원본 화면은 사용자 제출 시 암호화 저장, 조회마다 서버 ACL 검사. 목록은 이미지 바이트를 조회하지 않음.

## 복구·한계
- 문제 발생 시 새 신고 진입을 비활성화하고 문의/이벤트 테이블과 이력을 보존. 기존 013까지의 기능과 독립된 추가 테이블이므로 이전 앱으로 복귀 가능; 마이그레이션 기록/테이블을 삭제하지 않는다. 백업은 private var/postgres/backups에 보관, 이번 백업 복원 리허설은 미실행.
- Chrome 데스크톱·390px 자동 검증. iOS/Safari/실기 터치·대규모 부하·전체 API 회귀는 미실행. 캡처는 브라우저 DOM 재현으로 외부 영상/iframe·비밀번호는 제외하며 제출 전 미리보기 제공. 화면 크기 변경 시 새 신고로 재시작 안내. 이미지 실패 시 설명/핀 등록 가능. 외부 알림·메일 발송 없음.
- Ruling: 구체 요소 텍스트/입력값을 메타데이터로 추가 수집하지 않고 핀의 대상은 screen으로 기록한다. 화면 이미지·경로·뷰포트·좌표·설명으로 재현 맥락 제공, 원본 DOM 보관 없음.

- 최종 자료 로딩 완료 후 캡처 재검증 `support.spec.ts`: 2 passed(19.2초). 미리보기에서 실제 위젯/핀/가림 영역 확인. 로컬 재시작 후 session·issues API·/support HTTP 200 및 총괄 can_manage=true 확인. 최종 lint·ruff·foundation·diff 통과.

## 핀 영역·대상 표시 및 실제 화면 유지 보완
- WB-20 / R21·R19, 사용자 피드백: 점만 찍히고 대상 영역이 불명확하며 핀 모드 진입 시 일부 스타일 변형.
- 원인: 핀 계약에 영역/이름이 없고, 선택 화면 배경을 DOM 재생성 이미지로 대체했다. body overflow 숨김도 스크롤바 폭/배치에 영향을 줄 수 있었다.
- 변경: 새 `regions.ts`에서 위젯·카드·버튼·입력·표 영역 후보를 현재 화면에서 판정. hover 테두리/대상 이름, 클릭 자동 영역, 드래그 직접 영역, 선택 영역/번호/이름 표시. 핀 이동 시 대상 갱신. 입력값은 대상 이름으로 수집하지 않음. `reporter.tsx`는 실제 DOM 위 투명 차단 레이어 사용, 배경 이미지 교체와 body overflow 변경 제거. wheel native non-passive 차단으로 배경 위치 유지.
- `PinRegion` 및 선택 label을 API/생성 타입에 추가하고 상세/미리보기에도 표시. 기존 점 핀은 nullable 영역/기본 이름으로 호환. DB는 기존 JSON 구조 사용하며 마이그레이션/기존 데이터 수정 없음.
- 변경 파일: support models.py, regions.ts·reporter.tsx·screen-preview.tsx·issue-detail.tsx, workspace.css, OpenAPI/생성 타입, test_support.py·support.spec.ts, 보드·이 문서.
- 새 계약 테스트 최초 1 failed → 최종 `pytest apps/api/tests/test_support.py -q --tb=no`: 4 passed(27.67초). 기존 권한·첨부·중복·동시 수정 및 영역 경계/옛 핀 호환 확인.
- `scripts/test_service.py support.spec.ts`(3101/8101): 최종 2 passed(24.6초). 진입 전후 잔액 영역 bounding box 일치·캡처 배경 없음·배경 스크롤 유지·hover 대상 이름·영역 선택·드래그 크기·모바일·기존 등록/가리기/권한/답변 회귀. 모바일 영역/이름 표시 이미지 직접 확인.
- build(타입 포함)·lint·ruff·foundation·diff 통과. 로컬 production-build 재시작. 실기 터치/Safari·모든 화면 요소별 자동 명칭 검수는 미실행. 캡처는 제출 전 미리보기에서 생성하므로 첨부 이미지의 브라우저 렌더링 차이는 별도 확인 가능. 사용자 재확인 대기.


## 자동 요소 인식 전용·AI 전달용 대상 식별 보완 (2026-10-26)
- WB-20 / R21·R19. 위의 직접 사각형 지정과 screen만 저장하는 결정은 이번 사용자 요청으로 대체한다. 빈 공간은 선택하지 않고, 실제 위젯·버튼·입력·표에 hover하면 영역과 이름을 표시한다.
- 페이지/위젯/반복 행의 안정적 앵커를 사용하고 핀에 component_id, element_id, locator, source_file, hierarchy를 저장한다. 위젯 순서가 바뀌어도 같은 앵커를 찾는다. 입력값/선택 옵션은 라벨에서 제외한다.
- 상세 화면의 ‘수정 요청 정보 복사’는 문의 ID·핀 번호·화면·대상 식별·사용자 설명을 JSON으로 복사한다. 자동 AI 호출이나 자동 수정은 없으며, 전달된 내용은 진단 자료로 취급하고 현재 코드/권한을 다시 확인한다.
- 변경: support/models.py·test_support.py, 웹 support/{regions,reporter,target-catalog,pin-reference,issue-detail}, app-shell, dashboard-workspace, family-view, expenses-view, transaction-list, workspace.css, OpenAPI·생성 타입, support.spec.ts.
- 기존 핀의 context는 nullable로 호환한다. 예전 핀에 없는 요소 정보를 추측해서 보충하지 않는다. JSON 필드 확장이므로 DB DDL/기존 자료 변경 없음.
- 실제 검증: `pytest apps/api/tests/test_support.py -q --tb=no` 5 passed(30.64초), `scripts/test_service.py support.spec.ts` 격리 3101/8101 최종 3 passed(41.8초). 빈 공간 제외·hover/선택·저장/복사·위젯 순서 변경·입력 라벨 개인정보 제외 및 기존 신고 흐름 확인. `npm --prefix apps/web run lint`, foundation(PASS), `git diff --check` 통과.
- 독립 리뷰에서 select 옵션이 라벨에 포함될 가능성을 발견해 제어 요소를 제거한 정적 라벨만 추출하고 회귀 테스트를 추가했다. 페이지 매핑 17개 소스 경로 확인.
- 한계: 모든 화면의 모든 요소 명칭 수동 검수·실기 터치/Safari는 미실행. DOM 내부 구조가 향후 바뀌면 locator는 달라질 수 있으므로 component/source/hierarchy와 함께 해석한다. 사용자 확인 대기.

- 최종 `npm --prefix apps/web run typecheck` 통과. 로컬 production-build 서비스 재시작 후 HTTP 응답 확인. 최초 샌드박스 HTTP 검증은 소켓 권한으로 차단되어 허용된 로컬 접속으로 재확인.


## 일반 텍스트 선택과 원문 가림 보완 (2026-10-26)
- WB-20 / R21·R19. 원인: 선택 후보가 컨트롤/카드 위주라 일반 제목·문장 누락, 영역 내부 이름표와 배경색이 원문을 가림.
- regions.ts: 제목·문장·강조·일반 div 등 직접 텍스트가 있는 요소 추가. 컨트롤 내부 텍스트와 입력값/옵션은 별도 텍스트 후보에서 제외한다. 텍스트를 컨테이너보다 우선하고 겹친 요소의 위치 지정 z-index 경로를 비교한다.
- reporter.tsx·workspace.css: 선택 영역은 투명 테두리만 표시, hover 이름은 도구 영역의 ‘가리키는 대상’에 표시하고 선택 후 이름은 핀 설명 영역에서 유지. screen-preview.tsx도 영역 내부 이름표 제거, 번호와 별도 설명 목록 유지.
- 계약/DB 변경 없음. support.spec.ts에 제목·강조문구·일반 텍스트 선택 및 내부 라벨 없음 검증 추가.
- 초기 브라우저 3 통과/1 실패: 겹친 뒤쪽 링크가 앞쪽 텍스트보다 우선됨. native elementFromPoint 시도는 모달 배경 inert와 충돌해 4 실패, 제거 후 표시 순서 비교로 보완. 최종 `scripts/test_service.py support.spec.ts` (3101/8101) 4 passed(31.6초).
- 최종 `npm --prefix apps/web run build` (타입 포함), `npm --prefix apps/web run lint` 통과. foundation PASS·git diff --check 통과. API 변경 없어 API 회귀 재실행 없음.
- 미검증: 모든 페이지의 모든 텍스트, 복잡한 transform/opacity 겹침, Safari·실기 터치. 사용자 재확인 대기.


## 핀 설명 자동 포커스·신고 아이콘 (2026-10-27)
- WB-20 / R21·R19. reporter.tsx에 설명 input ref와 신규 핀 렌더 후 focus(preventScroll) 추가. 입력 중에는 포커스를 재지정하지 않고, 잘못된 영역/5개 초과 시에는 이동하지 않는다. 문제 신고 버튼에 공통 NavIcon의 support 말풍선 추가, 텍스트와 접근 가능한 이름 유지.
- support.spec.ts: 5개 핀을 연속 추가할 때 설명 입력란 포커스를 확인하고 별도 클릭 없이 키보드로 설명 입력·값 검증.
- `scripts/test_service.py support.spec.ts` (3101/8101): 4 passed(38.9초). `npm --prefix apps/web run build`(타입 포함), `npm --prefix apps/web run lint`, foundation PASS, `git diff --check` 통과. API/DB 변경 없음. 실기 모바일 가상 키보드 동작 미검증.
- 로컬 production-build 서비스 재시작. 사용자 확인 대기.


## 등록자 표시 명확화·카카오톡 후속 보류 (2026-10-27)
- WB-20 / R21·R19. 사용자 요청으로 현재 범위는 누가 문의를 등록했는지 확인하는 UI에 한정. 카카오톡 발송·앱 내 알림 신설은 이번 작업에 포함하지 않는다.
- issue-list.tsx·issue-detail.tsx: 기존 author_name을 ‘등록자’ 이름으로 강조하고 ‘등록일’과 구분. workspace.css의 support-author는 공통 간격/색상 토큰 사용. 기존 서버 actor_id 연결·가족/작성자/총괄 권한 유지, API/DB 변경 없음.
- `npm --prefix apps/web run build`(타입 포함), `npm --prefix apps/web run lint`, `python scripts/validate_foundation.py` PASS, `git diff --check` 통과. 단순 표시 변경으로 브라우저/API 회귀는 재실행하지 않음. 로컬 서비스 재시작, 사용자 확인 대기.
- 카카오톡은 채널/사업자 자격·발송업체·템플릿·연락처/수신자 연결을 확정한 뒤 별도 구현. 현재 외부 발송 없음.


## 총괄관리자 문의·이슈 대시보드 위젯 (2026-10-27)
- WB-20 / R21·R19. 독립 support 위젯으로 미해결 총건수·접수/확인 중/추가 정보 요청 건수와 최근 등록 미해결 5건의 제목·등록자·등록일·상태 표시. 상세 및 전체 목록 이동, 새로고침·화면 복귀 갱신. 기존 이동/크기 조절 사용.
- dashboard_layout.py: WidgetId support 추가, 최대 8개로 확장, 서버 현재 super_admin만 허용. 기존 저장 배치는 normalize로 보존하고 신규 위젯은 끝에 추가. 역할 회수 시 제거. JSON 배치이므로 DDL 없음. OpenAPI/생성 타입 갱신.
- 새 dashboard/support-widget.tsx, dashboard-view/workspace, support/target-catalog, workspace.css. 기존 권한 검사된 상태별 목록 API의 전체 total로 집계하고 목록은 합쳐 최신 5건만 표시. 모든 응답 can_manage 확인, 로딩/오류를 0건으로 해석하지 않음. 외부 알림 없음.
- test_dashboard_layout.py: 총괄/총무/일반 허용 차이, 기존 배치 보존, 8개 계약 검증. support.spec.ts: 일반 위젯 미노출, 총괄 조회·작성자·상세 이동, 해결 후 위젯 제거 회귀.
- 실제 명령: `pytest apps/api/tests/test_dashboard_layout.py -q --tb=short` 최종 5 passed(0.59초), `pytest apps/api/tests/test_support.py -q --tb=no` 5 passed(30.46초, 기존 Starlette 경고 1), `scripts/test_service.py support.spec.ts` 격리 3101/8101 4 passed(40.4초).
- build 최초 session nullable 타입 오류 수정 후 `npm --prefix apps/web run build` 통과. lint 통과. ruff의 새 테스트 import/UTC/루프 캡처 지적 수정 후 통과·배치 테스트 재통과. foundation PASS·diff 검사. 로컬 production-build 재시작.
- 미검증: 전체 서비스 회귀·실기 모바일·대규모 문의 성능. 상태별 조회 3회는 단일 시점 스냅샷이 아니므로 동시에 처리 중일 때 갱신 전까지 일시적으로 차이가 날 수 있음. 사용자 확인 대기.


## 대시보드 상태 카드의 필터 목록 이동 (2026-10-27)
- WB-20 / R21·R19. support-widget.tsx의 접수·확인 중·추가 확인 필요 카드 전체를 `/support?status=...` 링크로 변경. 0건도 해당 빈 목록으로 이동. 키보드 포커스와 hover 표시 추가.
- issue-list.tsx는 URL의 허용된 status만 API 필터로 사용. 상태 선택/전체 해제 시 URL 갱신, 상태가 달라지면 첫 페이지부터 조회. 새로고침·URL 직접 진입에서도 선택 상태 유지. API/DB 변경 없음.
- workspace.css 카드 링크 스타일, support.spec.ts 세 상태 카드 이동·필터/실제 목록·새로고침 유지·전체 해제 회귀 추가.

- 검증: `scripts/test_service.py support.spec.ts` (3101/8101) 4 passed(44.9초), `npm --prefix apps/web run build`(타입 포함), `npm --prefix apps/web run lint`, foundation PASS, `git diff --check` 통과. API/전체 서비스 회귀와 실기 모바일은 재실행하지 않음. 로컬 production-build 재시작, 사용자 확인 대기.


## 문의 상태별 색상 통일 (2026-10-27)
- WB-20 / R21·R19. 접수 info 파랑, 확인 중 progress 보라, 추가 확인 필요 warning 황색/주황, 해결 success 초록. support-widget.tsx 카드에 data-status 추가. workspace.css 공통 팔레트로 카드 배경·테두리·건수와 모든 문의 배지(목록/상세/최근 항목) 통일. 텍스트·링크·포커스 유지.
- tokens.json·tokens.css·theme.css에 progress/progress-bg 라이트/다크 토큰 및 대비 검사 추가, design-system.md에 상태 색상 규칙 등록.
- `npm --prefix apps/web run build`(타입 포함), `npm --prefix apps/web run lint`, `python scripts/validate_foundation.py` PASS(신규 progress 글자/배경 대비 4.5:1 포함), `git diff --check` 통과.
- `node var/verify-support-colors.cjs` 합성 카드/배지 Chrome 렌더: 라이트/다크 동일 상태의 카드와 배지 글자·배경색 일치 확인, 다크 이미지 육안 확인. 자료는 Git 제외 var/support-status-{light,dark}.png. 단순 색상 변경으로 API/업무 흐름 회귀는 재실행하지 않음. 로컬 서비스 재시작, 실기 모바일 미검증.
