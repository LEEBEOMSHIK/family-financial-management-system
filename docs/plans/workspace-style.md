# 공통 화면 가독성·스타일 개선

2026-10-24. 사용자 요청: 폰트·메뉴·기능을 한눈에 이해할 수 있는 실제 서비스 수준의 스타일. 기존 디자인 요구사항과 R03/R14의 역할별 메뉴 접근을 유지한다.

## 변경
- `apps/web/src/styles/workspace.css`: 공통 글자 위계, 메뉴 16px, 표 본문 15px·거래 제목 16px, 주요 잔액 32~44px, 중립 표면과 12~14px 카드, 입력·드롭다운·버튼 통일. 기존 검증된 색상 토큰 및 시스템 폰트를 사용한다. 새 외부 폰트 다운로드는 없다.
- `app/layout.tsx`: 공통 스타일 로드. `components/app-shell.tsx`: 현재 메뉴 강조와 하단 계정·역할 정보.
- `features/dashboard/dashboard-view.tsx`: 최근 입출금의 전체 내역 이동 링크 및 설명.
- `features/auth/account-form.tsx`: 로그인 브랜드와 개발 테스트 영역 분리. 테스트 버튼은 보조 버튼으로 표현한다.
- `scripts/capture_workspace.cjs`: PC/320px/390px·라이트/다크·로그인·셀렉트·권한 화면 캡처와 페이지 넘침 확인. 비밀번호·초대 코드는 촬영하지 않는다.

## 검증 및 인수인계
`npm --prefix apps/web run build`, `npm --prefix apps/web run lint` 통과. `node scripts/capture_workspace.cjs` 통과. 캡처는 Git 제외 `var/ui-refinement/`에 저장했다. PC 대시보드·모바일 다크 대시보드·로그인·모바일 권한 관리 화면을 직접 확인한다. 실행 주소는 http://127.0.0.1:3000.

이번 작업은 시각 스타일과 탐색 링크 개선이다. API·DB 계약은 변경하지 않는다. 실제 금융 데이터·외부 배포·미구현 업무까지 완료된 것으로 간주하지 않는다. 전체 WCAG 인증 및 실제 모바일 기기·스크린리더 검증은 미수행이다.

최종 검증: `apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py` 브라우저 10개 통과(53.4초). `validate_foundation.py` PASS. 최적화 빌드의 로컬 서비스를 재실행했다. 테스트 버튼을 통한 실제 로컬 접속도 화면 촬영 과정에서 확인했다.
