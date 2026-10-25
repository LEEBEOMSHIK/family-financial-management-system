# 3역할과 권한 관리 인수인계

2026-10-24 사용자 지시 / R03, R18, R20.

확정: 일반사용자(member), 총무(treasurer), 총괄관리자(super_admin)만 제품 역할로 사용한다. 권한 관리 주체는 총괄관리자다. 기존 감사 독립 역할·policy_admin 위임 제안은 현행 역할 정의를 대체하지 못한다.

이번 반영: AGENTS.md, requirements.md, rbac.md, file-management.md의 기준 정리 후 개발용 기능 구현. 지침은 200줄 이하 유지.

구현 파일: API models.py/domain.py/main.py/roles.py, 웹 login/page.tsx·app-shell.tsx·features/roles/roles-view.tsx·roles/page.tsx·API 프록시, OpenAPI 및 생성 타입, scripts/dev.mjs, API/브라우저 테스트.

계약: GET/POST /api/v1/families/{family_id}/roles. POST는 user_id, role, expected_version, reason을 받는다. Origin·CSRF·가족·요청 시점 권한 확인과 잠금 내부 재인가. 버전 충돌·같은 역할·마지막 관리자 해제는 409. 대상 없음 404, 무권한 403. 타임아웃은 자동 재시도하지 않고 목록·이력 재조회로 결과를 확인한다.

저장: 실행기는 var/development-roles.json을 ROLE_STORE_PATH로 지정한다. 스키마 1의 전체 이력을 보존하며 임시 파일 fsync 후 atomic replace한다. 잠금 파일의 배타 생성과 버전으로 동시 변경을 막는다. 개발 초기 계정은 합성 자료의 고정 계정이며 공개 회원가입으로 생성하지 않는다. 역할 유효기간은 개발 자료의 2026년 말까지다.

복구: 프로세스를 모두 정지한 상태에서 JSON을 백업한다. 손상 파일을 삭제해 초기 권한으로 되돌리는 자동 복구는 금지한다. 검증된 백업으로 전체 이력을 복구한 뒤 시작한다. 비정상 종료로 .lock이 남았으면 소유 실행기가 모두 종료됐음을 확인한 후 해당 잠금 파일만 제거한다. 운영·다중 호스트용 DB, 승인된 관리자 초기 지정·계정 복구는 후속 작업이다. JSON은 로컬 개발용이며 변조 방지 감사 저장소가 아니다.

검증: API pytest 24개 통과(권한 차단·CSRF·가족 경계·회수 후 기존 세션·마지막 관리자·재시작 보존·동시 변경·만료 역할·손상 날짜 포함), Ruff·pip check 통과. 상위 Starlette httpx deprecation 경고 1건 잔존. 독립 리뷰에서 발견한 손상 날짜 오류를 재현하고 503 거부로 수정했다. 웹 빌드/타입 검사 통과. 브라우저 최종 결과는 아래에 기록한다.

최종 브라우저: npm run test:e2e 8개 통과. 개발 구성원을 총무로 변경한 뒤 일반사용자로 복원하고 이력을 보존했다. 총무의 화면 접근 거부, 모바일 메뉴 접힘과 문서 가로 넘침 없음 확인. 모바일 구성원 표는 변경 버튼까지 화면 안에 표시하도록 줄바꿈 적용. 이력 표는 좌우 스크롤로 조회한다. npm run lint, python scripts/validate_foundation.py PASS. 다른 브라우저·스크린리더·운영 DB/인증은 미검증이다.
