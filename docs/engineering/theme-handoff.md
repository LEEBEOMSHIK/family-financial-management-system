# HANDOFF: R19 / 공통 테마 첫 구현

보내는 역할: frontend / 받는 역할: review·QA / 날짜: 2026-10-23
상태: accepted (R19 공통 테마 시안 범위)

## 입력과 근거

- 사용자 요청: 핑크·블루·노랑을 절제해 사용, PC·모바일웹, 다크모드 지원.
- [계획](../plans/theme-implementation.md), [디자인 기준](../design/design-system.md).
- 범위: 기존 대시보드 시안과 공통 토큰·테마 동작. 제품 앱·API·DB·권한 계약 변경 없음.

## 실제 변경

- `apps/web/public/theme.js`: 최초 표시 전에 테마 적용, 선택 저장, 시스템/다른 탭 변경 반영, 저장 차단 처리.
- `apps/web/src/styles/theme.css`, `tokens.css`, `globals.css`, `components.css`: 다크 의미 토큰 및 브랜드/위험 버튼 글자색 분리.
- `docs/design/tokens.json`, `preview.html`, `dashboard.css`, `mobile-review.html`: 토큰 원본, 테마 선택과 중립 배경 연결.
- `tests/design/theme.test.cjs`: 브라우저 경계 대역으로 실제 초기화 스크립트의 9개 행동 검사.
- `scripts/verify_theme_browser.cjs`: 로컬 Chrome으로 전환·복원·모바일 배치와 스크린샷 검사.
- `scripts/validate_foundation.py`: 두 테마의 대비와 토큰 동기화 검사.
- 디자인/로컬 실행/검증 문서 갱신. 신규 외부 라이브러리 설치 없음.

## 검증 증거

- `node --test tests/design/theme.test.cjs`: 미구현 상태에서 8개 실패 확인 후 구현하여 통과. 리뷰 후 저장 쓰기 실패 테스트를 추가하여 최종 9개 통과.
- `python scripts/validate_foundation.py`: PASS, 두 테마 대비 40개 조합 통과.
- `node scripts/verify_theme_browser.cjs`: PASS. 시스템 변경·새로고침 복원·관리/기간 컨트롤·Tab 이동 확인.
- Chrome의 1440/375/320 CSS px × 라이트/다크: 6개 조합에서 가로 넘침 없음, 배경/카드/선택 상자 테마 확인.
- 화면 증거: `var/design-verification/`의 PNG 6개와 `results.json` (Git 제외).
- PC 라이트와 모바일 다크 전체 스크린샷을 직접 검토했다.

## 남은 사항

- 실제 모바일 기기·Safari/Firefox·스크린리더·200% 글자 확대·400% 줌은 미검증.
- Next.js 초기 렌더링과 인증·실제 데이터 연동은 후속 P1 작업이다.
- 프로덕션 CSP 정책에 맞춰 초기 테마 스크립트 로딩을 검토해야 한다.
- 시안의 가족/관리 전환은 서버 권한 제어가 아니며 실제 자료를 포함하지 않는다.
- 되돌릴 때 이번 테마 스크립트/스타일 연결과 해당 토큰·컨트롤만 제거한다. 기존 자료 전체를 복원하거나 삭제하지 않는다.

## 인수 응답

독립 review 에이전트 판정: accepted, Critical/Important 없음. 읽기 가능·쓰기 실패 경로의 테스트 누락(Minor)을 지적했으며 별도 writeBlocked 사례를 추가했다. 최종 전체 Node 테스트 9개 통과. 리뷰는 현재 파일 대상이며 커밋 diff 리뷰나 전체 제품 인수가 아니다.
