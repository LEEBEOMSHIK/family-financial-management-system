# 실제 서비스 첫 실행 인수인계

기준일: 2026-10-23. 요구사항 R03/R06/R12/R14/R15/R18/R19의 첫 실행 범위이며 전체 요구사항 완료를 뜻하지 않는다.

## 구현
- apps/web/src/app: Next.js 로그인·대시보드·거래·관리·설정, 동일 출처 API 프록시.
- apps/web/src/features, components, lib: 기간·입출금 필터, BigInt 금액, 로딩·오류·재시도·401 로그인 복귀, 라이트/다크/시스템 테마.
- apps/api/src/family_ledger: FastAPI 개발 세션, 요청 시점 가족/역할 확인, CSRF/Origin, 읽기 전용 합성 저장소. [API 인수인계](api-foundation-handoff.md).
- packages/contracts/openapi.json, apps/web/src/generated/api.ts: 실행 계약과 생성 타입.
- scripts/dev.mjs, scripts/stop-dev.ps1: 루프백 실행, 포트 충돌 처리, 소유 프로세스 종료.

## 실제 검증
API pytest 19개, Ruff, pip check 통과. 웹 typecheck, lint, 최적화 build 통과. 브라우저 E2E 4개와 테마 Node 테스트 9개 통과. 1440/375/320px 라이트·다크 화면 확인. npm audit 취약점 0개(검사 시점 기준).

독립 리뷰에서 대사 대기 표기와 만료 세션 복귀 문제를 발견했다. “대사 필요” 표시와 401 로그인 복귀로 수정하고 회귀 E2E를 추가했다. 재검토 신규 차단 사항 없음. Starlette TestClient의 httpx 관련 deprecation warning 1건은 남아 있다.

## 미완료 범위
실제 웹/API 프로그램이지만 자료는 합성 데이터다. 개발 로그인은 비밀번호·사용자 등록이 없는 개발 전용 진입이며 운영 환경에서는 서버가 시작을 거부한다. PostgreSQL, 운영 인증, 영구 저장·감사, 회비/지출/승인 변경 흐름, 은행 연동, 알림은 미구현이다. 운영 출시 완료가 아니다.

다음 단계는 PostgreSQL·마이그레이션과 운영 인증 연결, 이후 확정 규정에 따른 업무 쓰기 흐름이다. 규정 미확정값은 허용이나 0으로 해석하지 않는다. Linux, 운영 배포, 스크린리더 수동 검사는 미검증이다. [실행 방법](local-development.md).
