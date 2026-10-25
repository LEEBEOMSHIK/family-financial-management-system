# 공통 테마 Implementation Plan

**Goal:** R19에 따라 대시보드 시안에서 시스템·라이트·다크 테마를 선택하고 기억한다.
**Architecture:** 공통 CSS 의미 토큰을 테마별로 분리한다. 외부 의존성 없는 초기화 스크립트는 첫 렌더 전에 설정을 읽으며 화면 제어와 분리한다.
**Tech Stack:** 기존 HTML/CSS/JavaScript, Node 내장 테스트, Python 정적 검사.
**Spec:** [디자인 기준](../design/design-system.md).

## 범위와 담당

- 구현 담당: 현재 에이전트. 검토 담당: 구현 후 별도 읽기 전용 리뷰.
- 공통 토큰: `docs/design/tokens.json`, `apps/web/src/styles/tokens.css`, `theme.css`.
- 테마 동작: `apps/web/public/theme.js`. 향후 Next.js에서도 같은 파일을 초기 로딩에 사용할 수 있으나 이번 작업은 제품 앱 구축이 아니다.
- 시안 연결: `docs/design/preview.html`, `dashboard.css`, `mobile-review.html`.
- 검증: `tests/design/theme.test.cjs`, `scripts/validate_foundation.py`.
- API·DB·인증·업무 권한 변경 없음. 합성 데이터만 사용한다.
- 에이전트 지침은 파일당 200줄 이하. 기존 미커밋 자료를 보존하고 요청 범위만 수정한다.

## 인수 기준

1. 첫 로딩 시 저장된 유효한 선택을 적용하며 기본값은 시스템이다.
2. 라이트/다크 명시 선택은 OS 변경에 영향받지 않는다. 시스템 선택은 OS 변경을 따른다.
3. 새로고침 후 선택이 복원되고 저장 접근 실패 시에도 전환할 수 있다.
4. 다른 탭의 설정 변경·삭제와 잘못된 저장값을 안전하게 처리한다.
5. 카드·표·차트·입력·드롭다운·상태·포커스가 테마 토큰을 사용한다.
6. 노랑은 제안 토큰 #F2C75C를 유지하고 의미 없는 장식에 추가하지 않는다.
7. PC·모바일과 두 테마를 검토한다. 실행 불가 검증은 미검증으로 남긴다.

## 작업

- [x] 테마 행동 테스트를 먼저 작성하고 미구현 실패 확인.
- [x] 공통 초기화·선택·저장·시스템 변경 처리 구현 후 테스트 통과.
- [x] 다크 토큰과 시안 선택 UI 연결, 하드코딩 배경 제거.
- [x] 라이트/다크 대비·토큰 동기화를 검증 스크립트에 반영.
- [x] 브라우저 검증, 독립 리뷰, 수정·인수인계 기록.

## 검증 명령

- `node --test tests/design/theme.test.cjs`
- `node --check apps/web/public/theme.js`
- `python scripts/validate_foundation.py`

## 실행 기록

- 사용자 진행 지시에 따라 이 계획을 같은 세션에서 실행한다. 저장소 전체가 초기 미추적 상태라 기존 파일을 보존하는 현재 작업 공간에서 진행하고 초기 커밋·브랜치 변경은 포함하지 않는다.
- 계획 전후 새 요구사항이나 업무 규정은 추측하지 않는다. 인증·은행 실연동은 이 작업의 인수 범위 밖이다.


- 완료: 초기 8개 RED → 구현 GREEN, 리뷰 보완 후 9개 통과. 실제 Chrome 6개 폭/테마 조합과 동작 검사 통과. 독립 리뷰 accepted. 상세 증거는 [인수인계](../engineering/theme-handoff.md)에 기록했다.
