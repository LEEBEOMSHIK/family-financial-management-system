# 공유 API 계약 영역

현재 계약은 docs/architecture/api-contracts.md다. P1에서 FastAPI OpenAPI를 생성해 openapi.json으로 고정하고 선택한 타입 생성 도구로 웹 타입을 만든다. 계약 변경 시 코드·타입·검증을 함께 수정한다. 손으로 별도의 업무 규칙을 두 번 구현하지 않는다.
