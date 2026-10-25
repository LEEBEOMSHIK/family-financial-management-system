# 결정 기록

ADR은 결정 당시의 배경과 대안을 보존한다. 이미 accepted인 ADR을 몰래 고치지 말고 새 ADR로 supersede한다.

| 번호 | 내용 | 상태 |
| --- | --- | --- |
| [0001](0001-confirmed-constraints.md) | 사용자 확정 제약 | accepted-from-request |
| [0002](0002-modular-architecture.md) | 모듈형 FastAPI·PostgreSQL·worker | proposed |
| [0003](0003-ledger-and-reconciliation.md) | 파일 우선·현금 원장·수동 기록과 대사 분리 | proposed |
| [0004](0004-notification-delivery.md) | 공식 채널·outbox·당일 유효성·unknown 처리 | proposed |
| [0005](0005-ai-boundaries.md) | 허용 조회와 ACL RAG 분리 | proposed (분리 요구 자체는 확정) |
| [0006](0006-design-system.md) | 의미 토큰·기본 CSS·시스템 폰트 | proposed |
| [0007](0007-local-service-foundation.md) | Next.js/FastAPI 첫 실행과 개발 세션 | accepted-for-local-development |

작성 틀은 [ADR 템플릿](../templates/adr.md)을 사용한다.

- [0008: PostgreSQL과 개별 로컬 계정](0008-postgresql-local-accounts.md) — accepted-for-local-development
- [0009: 개인 기본 계좌와 비공개 이미지 증빙](0009-private-accounts-evidence.md) — accepted-for-local-development
