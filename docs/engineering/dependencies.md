# 의존성 채택과 버전 고정

2026-10-23: Next.js + TypeScript + FastAPI를 로컬 서비스에 채택하고 설치·빌드·실제 API E2E를 검증했다. Node 24.18.0, Python 3.11.9 환경이다. 아래 표의 DB·인증·연동 등은 여전히 후보이다. [채택 결정](../adr/0007-local-service-foundation.md).

| 영역 | 후보 | 채택 전 검증 |
| --- | --- | --- |
| web | Next.js App Router + React + TypeScript | 지원 Node LTS·React peer·보안 공지·Windows build·캐시 동작 |
| API | FastAPI + Pydantic + Uvicorn | 지원 Python, validation/직렬화, 세션/CSRF 통합, ASGI 운영 |
| DB | PostgreSQL + SQLAlchemy + Alembic + 드라이버 | 네이티브 설치, transaction/RLS, timezone, migration, 드라이버 OS/CPU 지원 |
| XLSX | openpyxl + 안전 XML 처리 의존성 검토 | 공식 문서의 XML 공격 경고, 압축/행/시간 한도, 수식·외부 링크, 실제 은행 파일 |
| Python QA | pytest + Ruff | 선택 버전의 설정 키, async fixture/DB 격리, CI 지원 |
| UI QA | Playwright 및 접근성 도구 후보 | 실제 브라우저 설치, 한국어 UI, keyboard/스크린리더 수동 검사 보완 |
| 인증 | 검증된 OIDC/세션 제공자/라이브러리 | 초대·복구·CSRF·탈퇴·임기 철회·리전/요금 |
| 검색 | DB 검색→필요 시 vector 확장/엔진 | 한국어 검색 품질, ACL 선필터, 철회·삭제, 운영 복잡도 |
| 디자인 | CSS 변수 + 기본 React 예제 | 추가 UI/폰트 패키지 없음; 복잡한 widget은 별도 평가 |

Next.js 설치 문서가 현재 제시하는 최소 Node는 20.9이지만 최소 버전이 운영 권장 버전이라는 뜻은 아니다. 채택 시 지원 중인 LTS를 확인해 정확 버전을 고정한다. FastAPI는 로컬 ASGI 서버로 구동할 수 있다. openpyxl 공식 문서는 기본 XML 공격 방어의 한계를 안내하므로 파일 격리/자원 제한을 별도로 구현한다. ([Next.js](https://nextjs.org/docs/app/getting-started/installation), [FastAPI](https://fastapi.tiangolo.com/deployment/manually/), [openpyxl](https://openpyxl.readthedocs.io/en/stable/))

## 채택 체크리스트

1. `config/dependency-candidates.json`에서 후보의 목적/상태를 확인한다.
2. 공식 릴리스/보안 공지/라이선스/지원 OS·CPU와 transitive dependencies를 검토한다.
3. 깨끗한 네이티브 환경에서 설치·타입·빌드·대표 계약 테스트를 실행한다.
4. 정확한 버전, 확인일, 확인자, 라이선스, 검증 명령/결과를 ADR 또는 의존성 기록에 남긴다.
5. npm이면 package-lock.json, Python이면 선택한 도구의 잠금 파일을 커밋한다. 재현 설치 명령을 CI와 개발 문서에 같은 방식으로 사용한다.
6. 새 버전은 별도 변경으로 검증한다. 검증 안 된 `latest`/범위 의존성을 운영 배포에 사용하지 않는다.

추가 도구 후보: [SQLAlchemy](https://docs.sqlalchemy.org/en/20/), [Alembic](https://alembic.sqlalchemy.org/en/latest/), [pytest](https://docs.pytest.org/en/stable/), [Ruff](https://docs.astral.sh/ruff/), [Playwright](https://playwright.dev/docs/intro).

정확 버전·라이선스·공식 패키지 근거는 `apps/web/dependency-metadata.json`, `apps/api/dependency-metadata.json`에 기록했다. 재현 설치는 웹 package-lock.json과 API requirements.lock을 사용한다. `npm audit --audit-level=high`는 취약점 0개였다. 패치 없는 전이 의존성과 peer 충돌을 가져오던 eslint-config-next 대신 ESLint·typescript-eslint·React Hooks 설정을 사용한다. 이 결과는 검사 시점에 한정된다. [실행 및 검증](local-development.md).

## 문의 화면 캡처 (2026-10-26)
- html-to-image 1.11.13, MIT. npm exact·package-lock 고정. [공식 저장소/라이선스](https://github.com/bubkoo/html-to-image), [공식 릴리스](https://github.com/bubkoo/html-to-image/releases/tag/v1.11.13). 최신 릴리스 2025-02-14, npm 메타데이터 수정 2025-04-19 확인. 장기간 릴리스 공백이 있어 Chrome 실증 및 캡처 실패 fallback을 적용.
- DOM 스타일·SVG를 이용하는 브라우저 내부 렌더러. 전체 데스크톱 녹화/외부 전송 없음. 이미지 업로드는 사용자 제출 시에만. CSS 전체 재현은 브라우저별 확인 필요.
- html2canvas 대신 CSS 렌더링을 브라우저에 맡기는 html-to-image 선택. 설치 시 npm audit 0 vulnerabilities.
