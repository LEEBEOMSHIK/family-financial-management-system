# 업무형 화면 개선 실행 계획

요구사항: R03/R06/R12/R14/R19. 근거: 사용자가 제공한 references/images/img.png와 현재 색상을 유지한 구현 지시.
실행 방식: executing-plans로 현재 작업 공간의 기존 파일을 보존하며 순차 수정. API/DB 계약 변경 없음.

## 승인된 방향
고정 좌측 메뉴, 간결한 상단 바, 기간 필터, 밀도 있는 지표·차트·거래 표. 브랜드 블루/핑크/옐로와 의미 토큰 유지. 모바일은 접히는 탐색과 세로 배치. 레퍼런스의 로고·업무 내용은 복제하지 않는다.

## 작업
- [x] Select 공통 컴포넌트: 옵션 패널, 선택 표시, 방향키/Home/End/Enter/Escape/Tab, 외부 클릭. 테마와 조회 필터에 적용. 사용자 행동 E2E 추가.
- [x] app-shell, service.css: 메뉴 아이콘, 상단 현재 위치, 모바일 메뉴, 간결한 구획.
- [x] dashboard-view, transaction-list: 지표 밀도, 차트 범례, PC 거래 표와 모바일 읽기 개선.
- [x] 타입·린트·빌드·기존/신규 브라우저 검사, 1440/375/320px 양 테마와 펼친 옵션 스크린샷 확인.
- [x] 실행 서버 재시작, 검증 결과와 미검증 범위 기록.

새 라이브러리는 추가하지 않는다. 스크린리더 실기와 다른 브라우저는 별도 미검증으로 기록한다. 지침 파일은 200줄 이하를 유지한다.

## 검증 기록 / 인수인계
2026-10-23: npm run lint, npm run typecheck, npm run build 통과. npm run test:e2e 6개 통과. 신규 2개는 변경 전 옵션 패널/메뉴 부재로 실패함을 확인했다. 펼친 옵션 경계 검증 추가 후 해당 브라우저 테스트도 통과했다. node --test tests/design/theme.test.cjs 9개 통과. python scripts/validate_foundation.py PASS.

실제 Chrome에서 1440/375/320px 라이트·다크 문서 가로 넘침 없음. 옵션 패널 경계도 확인했다. var/service-e2e/service-*.png와 options-*.png에 화면 기록. PC 라이트·모바일 다크와 옵션 패널을 직접 검토했다. 기존 로컬 서버를 소유 프로세스 확인 후 종료하고 최신 최적화 빌드로 재시작했다.

독립 정적 리뷰: 중요 결함 없음. Select는 현재 2~3개 옵션 용도이며 긴 목록의 활성 옵션 자동 스크롤은 미구현이다. 긴 목록·검색형 선택을 추가할 때 확장 검증한다. 스크린리더·Safari·Firefox 실기 검증 미수행. 기존 개발 인증·합성 데이터 범위는 유지한다.

## 후속: 텍스트 가독성
사용자의 작은 글자 개선 지시를 반영했다(R14/R19). 수정 파일: apps/web/src/styles/service.css, apps/web/src/features/dashboard/dashboard-view.tsx, docs/design/design-system.md. 콤보박스 선택값·옵션 16px, 라벨·표 본문 14px, 보조 문구 최소 13px, 제목 18px. 모바일 축소 규칙 제거, 입력 높이·표 행·측면 메뉴 폭 확대, 차트 월 표시는 HTML로 분리했다. API 계약 변경 없음.

npm run build(타입 검사 포함), npm run lint, npm run test:e2e 6개 통과. 1440/375/320px 양 테마와 옵션 패널 가로 경계 검증 통과. PC 라이트와 320px 펼친 옵션 화면을 직접 확인했다. 최신 빌드로 로컬 서버 재시작 완료. 스크린리더·다른 브라우저·실기 확대 검증은 미수행이다.
