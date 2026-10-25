# 개인 대시보드 위젯 구현 계획

R13·R18 / 사용자 승인: 편집 모드에서 이동·크기·표시 변경, 계정 저장, 기본 복원, PC/모바일 별도 배치. 지침에 정직한 소통 추가.

- [x] 계정·가족별 JSON 배치와 revision을 저장하는 006 마이그레이션. GET/POST dashboard-layout, 서버 membership와 위젯 권한 확인, 충돌 409. API 계약·생성 타입 갱신.
- [x] 기존 재무 화면을 위젯으로 분리. 승인/송금 각각 독립. 편집 모드에 드래그 정렬, 키보드 이동, PC 너비·높이 선택과 포인터 크기 조절, 모바일 순서/표시, 저장/취소/복원. 저장 전에는 초안만 수정.
- [x] 별도 테스트 DB에서 저장·재로그인·사용자 격리·권한 거부·충돌·잘못된 배치 거부·모바일 배치 검증. build/lint/API 검사 후 서비스 재시작.

크기는 격자에 맞춘 반폭/전체폭과 3단계 높이로 제한하며 위젯 내부 긴 내용은 스크롤한다. 모바일은 높이 자동·한 열. UI는 현재 허용 위젯만 제공하고 서버 저장에서도 검증한다. 저장 실패 시 초안을 유지한다. 기본 복원은 초안에 반영 후 저장해야 확정된다. 새 의존성 없음.

복구: 006은 새 테이블만 추가한다. 이전 앱으로 되돌려도 기존 업무 데이터에 영향 없음. 배치 초기화는 제품의 기본 배치 복원/저장 사용. 테이블 삭제나 기존 마이그레이션 수정은 하지 않는다.

## 구현 메모

추가 파일: API dashboard_layout.py(스키마·정규화·계정별 저장), migrations/006_dashboard_layout.sql, 웹 dashboard-workspace.tsx, tests/dashboard-layout.spec.ts. 변경: main.py GET/POST dashboard-layout, 웹 proxy 허용 경로, dashboard-view.tsx와 payment-tasks.tsx 위젯 분리, workspace.css, OpenAPI/생성 타입, 기존 expenses.spec.ts 대시보드 선택자. PROJECT_GUIDELINES.md와 AGENTS.md에는 정직한 소통 지침 추가(AGENTS 61줄).

서버는 현재 구성원/역할을 검증한 뒤 허용 위젯만 반환한다. 저장시 계정·가족은 세션에서 결정한다. revision 조건부 갱신으로 충돌을 거부한다. 역할 변경 후 조회시 더 이상 허용되지 않는 위젯은 제외하고 새로 허용된 위젯은 기본값을 추가한다. 업무 데이터나 금융 실행 기능은 추가하지 않는다.

검토 지적 및 조치: 편집 중 조회 기간 변경에 따른 Workspace 언마운트/초안 유실을 발견해 기간 선택을 비활성화했다. 편집 중 위젯 내부 링크도 inert 처리했다. 독립 에이전트의 정적 재검토에서 추가 중요 결함은 발견되지 않았다.


## 최종 검증·인수인계

- npm --prefix apps/web run typecheck / build / lint: 통과. 최종 제품 빌드 후 테스트만 추가 조정했으며 lint 재통과.
- apps/api/.venv-pg/Scripts/python.exe -m pytest apps/api/tests/test_api.py -q --tb=no: 11 passed, 기존 Starlette/httpx 경고 1건.
- apps/api/.venv-pg/Scripts/python.exe -m ruff check apps/api/src/family_ledger/dashboard_layout.py apps/api/src/family_ledger/main.py: 통과.
- python scripts/validate_foundation.py: PASS (var/foundation-widgets.log).
- scripts/test_service.py dashboard-layout.spec.ts: 최초 1 passed(26.3초). 확장 검증은 expenses.spec.ts와 함께 실행하여 위젯 1 passed(44.4초), 총무 회귀 1 failed(API 연결 시간 초과). 단순 대기 5초 실패도 먼저 발견했으며 로딩 완료 대기를 15초로 분리했다.
- scripts/test_service.py expenses.spec.ts -g 'member submits' 단독 재실행: 1 passed(56.6초). 승인 대기→상세 검토→승인→송금 대기→완료 제거까지 검증.
- 위젯 검증 범위: 권한 없는 위젯 403, 중복 422, CSRF 403, 타 가족 404, 오래된 revision 409, 계정별 설정 격리, 재로그인 유지, PC 너비·포인터 높이 조절·드래그 실행·순서 버튼, 숨기기/저장/취소/복원, 모바일 별도 저장, 모바일 가로 넘침 없음. 라이트 PC·다크 모바일 캡처 직접 검토(var/expense-demo/dashboard-widgets*.png).
- 006 마이그레이션 적용: migrations=6, active_members=4, role_events=9, synthetic_transactions=7 보존. 최종 빌드로 로컬 서비스 재시작 완료. 실제 사용자 승인/송금/계좌 데이터 변경 없음.

한계: 픽셀 단위 자유 좌표 배치가 아니라 순서 기반 2열 격자와 정해진 크기다. 모바일은 한 열·자동 높이. 실기 터치와 전체 API/브라우저 회귀는 미검증. 테스트 중 일시적인 서버 응답 시간 초과가 있었고 원인 확정 또는 성능 문제 해결을 주장하지 않는다. 위젯 변경의 정적 검토를 독립 에이전트가 수행했으나 이를 실행 검증으로 표현하지 않는다.
