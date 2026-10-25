# 문서 목차와 폴더 구조

## 읽기 경로

| 목적 | 문서 |
| --- | --- |
| 프로젝트 시작 | [README](../README.md), [운영 지침](../PROJECT_GUIDELINES.md), [AGENTS](../AGENTS.md), [개발 규칙](../CONTRIBUTING.md) |
| 기획/정책 | [요구사항](requirements/requirements.md), [규정 매핑](requirements/regulation-mapping.md) |
| 설계 | [시스템](architecture/system-design.md), [데이터/상태](architecture/domain-and-data.md), [권한](architecture/rbac.md), [연동/알림](architecture/integrations.md), [API](architecture/api-contracts.md) |
| 에이전트 협업 | [역할과 인수인계](engineering/agent-team.md), [절차/DoD](engineering/workflow.md), [역할 프롬프트](../.agents/roles/product.md) |
| 개발 환경 | [로컬 실행](engineering/local-development.md), [의존성 채택](engineering/dependencies.md) |
| 디자인 | [시스템](design/design-system.md), [토큰](design/tokens.json), [화면 견본](design/preview.html), [Next.js 적용](../apps/web/README.md) |
| AI/QA/보안 | [검색](ai/search-and-rag.md), [테스트](qa/test-strategy.md), [위협 모델](security/threat-model.md), [보안 지침](../SECURITY.md) |
| 결정/작업 | [ADR 목록](adr/README.md), [작업](templates/task.md), [ADR 틀](templates/adr.md), [인수인계](templates/handoff.md), [리뷰](templates/review.md) |
| 적용/운영 | [단계별 계획](plans/implementation-plan.md), [운영/복구](operations/deployment.md) |
| 출처/검증 | [공식 근거](sources.md), [검증 기록](verification.md) |

## 실제 제공 구조

```text
family-ledger-foundation/
  README.md / PROJECT_GUIDELINES.md / AGENTS.md / CONTRIBUTING.md / SECURITY.md
  .editorconfig / .gitattributes / .gitignore / .env.example
  .agents/roles/                       # 11개 역할 프롬프트
  .github/ISSUE_TEMPLATE/              # 요구사항·결함·작업
  .github/pull_request_template.md
  config/                             # 정책·알림·의존성·TS/Python·CI 설정 초안
  apps/
    web/src/styles/                   # 공유 CSS 토큰/스타일
    web/src/components/ui/            # Button/Money/StatusBadge 예제
    api/                              # Python 백엔드 안내
    worker/                           # durable 작업자 안내
  packages/contracts/                 # OpenAPI 생성 위치 안내
  deploy/production/                  # 운영 전용 Docker 계획
  tests/                              # 제품 검증 위치 안내
  scripts/validate_foundation.py       # 현재 실행 가능한 문서 점검
  docs/
    requirements/ architecture/ engineering/ design/ ai/
    security/ qa/ operations/ plans/ adr/ templates/
    sources.md / verification.md
```

`apps/api/src`, web routes, worker 실행기, migrations, 실제 테스트, Dockerfiles는 구현 계획상의 향후 파일이다. 존재하는 예제 파일과 혼동하지 않는다. 기존 저장소에 적용할 때 현재 AGENTS/설정을 먼저 읽고 선택적으로 병합한다.
