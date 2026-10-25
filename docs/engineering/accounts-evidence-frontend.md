# 계좌·영수증 화면 인수인계

2026-10-24 · R04, R05, R18 · 계약: [계좌·증빙 계획](../plans/accounts-evidence.md).

## 변경 범위
- `apps/web/src/features/accounts/`: 본인 계좌 등록·마스킹 목록·기본 지정, 명시적 전체 번호 확인. 닫기·페이지 이탈·탭 비활성화 시 표시 해제 및 진행 중 열람 취소.
- `apps/web/src/app/(workspace)/accounts/page.tsx`, `components/app-shell.tsx`, `components/ui/NavIcon.tsx`: 내 계좌 경로와 공통 메뉴.
- `features/expenses/expenses-view.tsx`: 기본 계좌 미리 선택 및 계좌 변경, 정산/선지급 구분, 무증빙 정산 차단, 선지급 요청자 사후 영수증 추가, 검토 영역 포커스·스크롤.
- `features/expenses/evidence.tsx`: 5개/개당 6MiB 이미지 업로드, 실패 파일 제거, 선택 미리보기 URL 정리, 서버 검증 PNG 미리보기, 승인 후 추가 증빙 표시.
- `app/api/v1/[...path]/route.ts`: 요청 스트림을 바이트 한도로 읽고 이미지 그대로 전달. PNG 응답 스트림 보존, private/no-store/nosniff.
- `styles/workspace.css`: 기존 토큰을 사용한 영수증·계좌·모바일 배치.
- `tests/expenses.spec.ts`: 합성 계좌 등록, 기본값 변경, 기존 요청 계좌 유지, 정산 영수증 필수, 선지급 사후 제출, 검토 포커스, 모바일 넘침.

## 검증
- `npm run typecheck` (apps/web): 생성 계약 반영 후 통과.
- `npm run lint` (apps/web): 통과.
- 합성 PNG를 Pillow로 실제 디코딩해 확인: 통과.
- 빌드 및 Playwright 통합 검증은 root agent가 전용 테스트 DB로 수행한다. 이 문서는 통합 성공을 주장하지 않는다.

## 남은 확인
- 승인 인원 등 정책은 미확정 유지. 화면은 서버의 `approval_configured`를 따른다.
- 은행 실명·계좌 유효성 검증은 미제공. 등록 화면에 명시한다.
- 합성 파일·런타임 생성 숫자만 테스트에 사용한다. 전체 번호 열람 화면은 캡처하지 않는다.
- 새 지침 파일은 추가하지 않았다. 본 인수인계는 200줄 이하이며 위 상대 문서 링크가 존재한다.
