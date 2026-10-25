# ADR-0007: 첫 로컬 서비스 실행

상태: accepted-for-local-development
작성일: 2026-10-23
결정 근거: 사용자의 실제 서비스 개발 착수 지시와 기존 Next.js/Python 조건.

ADR-0002 중 Next.js/FastAPI와 동일 출처 세션 구조를 첫 구현에 채택한다. PostgreSQL·worker·운영 인증에 관한 제안은 이 결정으로 확정하지 않는다. DB가 없는 현재 환경에서 합성 저장소 어댑터로 읽기 흐름을 검증한다. SQLite로 운영 DB를 대체하지 않는다.

개발 세션은 명시적인 development 설정에서만 허용한다. 요청마다 가족과 유효 역할을 확인한다. 실제 금전 변경과 외부 발송은 제공하지 않는다. 정확 버전과 라이선스는 apps/web/dependency-metadata.json과 apps/api/dependency-metadata.json에 기록하고 잠금 파일을 사용한다.

최적화 빌드와 실제 API 브라우저 테스트를 통과했다. 운영 인증·영구 저장 없이는 가족용 운영 서비스로 출시하지 않는다. [검증 및 한계](../engineering/service-foundation-handoff.md).
