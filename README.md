# 가족 공동통장 회계·운영 시스템

기준일: 2026-10-24 · 상태: PostgreSQL + 가족별 계정 로컬 서비스

PostgreSQL과 개별 아이디·비밀번호 로그인을 연결했다. 총괄관리자 초대로 가입하고 서버에서 권한을 관리한다. 대시보드와 입출금 내역은 카카오뱅크 파일 동기화 후 실제 자료를 조회한다. 동기화 전에는 합성 예시임을 표시한다. 공개 배포·은행 실시간 연동·계정 복구는 미구현이다. [DB·계정 운영 안내](docs/engineering/postgres-local.md)를 따른다.

## 프로젝트 진행 관리

[공동 Workboard](WORKBOARD.md)에서 현재 작업·사용자 확인·다음 작업·결정 사항을 함께 관리한다. 상세 검증은 보드의 근거 문서에 연결한다.

## 가족 회비 관리

총무·총괄관리자는 가족 관리의 **구성원 등록**에서 계정 없이 이름과 생일(양력·음력·윤달)을 등록·수정할 수 있다. 생일은 선택 사항이며 양력/음력 생년월일을 저장하고 올해의 생일 회차를 출생연도 기준으로 표시한다. 총괄관리자는 등록 시 월 회비와 시작일(연·월·일)도 함께 설정할 수 있다. 첫 회비는 시작일 다음 달부터 적용한다. 직접 내역을 조회할 사람에게는 총괄관리자가 해당 구성원의 계정 초대를 발급하며, 가입해도 기존 회비·납부 기록이 이어진다. 가족 관리에서 월별 납부 현황과 기존 납부 확인/취소 이력을 확인한다. 입금 내용이 구성원 이름과 정확히 일치하면 입금 월 회비로 자동 연결하며 초과액을 이월하지 않는다. 동명이인·이름 불일치는 가족 관리의 입금 연결 확인에서 처리한다. 조회 자료·마감일·회비가 준비되고 미연결 입금이 없어야 실제 미납 집계를 확정한다. 총괄관리자가 구성원 등록·수정에서 개인 월 회비/시작일을, 가족 관리에서 달력으로 공통 마감일을 선택하며(선택한 월부터 매월 해당 일 적용), 미설정 값은 추측하지 않는다. 당월 납부 미확인 현황은 관리자 대시보드의 독립 미납 현황 위젯에 표시한다. 납부 요청은 내부 기록만 저장하고 외부 알림은 발송하지 않는다. [범위·검증·설정 안내](docs/plans/family-dues.md).

## 실제 앱 실행

최초 설치는 [로컬 실행 안내](docs/engineering/local-development.md)의 현재 서비스 절차를 따른다. 의존성이 설치된 뒤 저장소 루트에서:

```powershell
node scripts/dev.mjs
```

접속: **http://127.0.0.1:3000**. 초기 총괄관리자로 로그인하여 가족 초대 코드를 발급한다. 초기 계정 정보 위치는 DB·계정 운영 안내를 따른다. API는 127.0.0.1:8000에서 실행된다. Ctrl+C로 두 프로세스를 종료한다. Windows 백그라운드 실행을 종료할 때는 `powershell -File scripts/stop-dev.ps1`을 사용한다.

[현재 구현·검증·남은 작업](docs/engineering/service-foundation-handoff.md)을 확인한다.

## 로컬 작업 준비

사용자가 만든 원격 저장소를 `C:projects
amily-financial-management-system`에 복제하고 이 개발 기반 초안을 적용했다. 원격 이름은 `origin`, 초기 브랜치는 `main`이다. 복제 당시 원격은 비어 있었으며 현재 파일은 초기 커밋 전 로컬 변경이다.

자세한 위치·상태·다음 단계는 [로컬 저장소 준비 기록](docs/engineering/repository-setup.md)을 확인한다.

## 먼저 읽을 파일

1. [프로젝트 운영 지침](PROJECT_GUIDELINES.md) — 목적, 범위, 결정 권한
2. [AGENTS.md](AGENTS.md) — 모든 코딩 에이전트가 지킬 실행 규칙
3. [요구사항과 검증 기준](docs/requirements/requirements.md) — 확정/제안/미확정 구분
4. [시스템 설계](docs/architecture/system-design.md), [권한](docs/architecture/rbac.md), [데이터](docs/architecture/domain-and-data.md)
5. [디자인 시스템](docs/design/design-system.md), [화면 미리보기](docs/design/preview.html)
6. [단계별 적용 계획](docs/plans/implementation-plan.md) — 담당, 의존성, 파일, 완료 조건
7. [문서 전체 목차](docs/README.md)

## 확인한 맥락과 한계

- 현재 작업 폴더에는 기존 소스가 없어 새 프로젝트용으로 작성했다.
- 참조 대화 「가족 회계 시스템 설계」의 조회 가능한 메시지와 이번 요청을 근거로 삼았다. 대화의 일부 답변은 참조 표식만 반환되었으며 첨부파일은 없었다.
- **「가족모임 운영규정 v1.0(시범운영)」 원문은 확보하지 못했다.** 연결된 Drive에서도 ‘가족모임 운영규정’, ‘가족모임’ 검색 결과가 없었다. 회비액, 승인권자, 정족수, 임기, 보관기간을 추측하지 않았다.
- 카카오뱅크 API 사용 자격·실계좌 연결, 실제 은행 엑셀 서식, 카카오 알림톡 계약/템플릿 승인은 미검증이다.
- FastAPI와 웹 런타임·검증 도구는 이번 로컬 골격에서 버전을 고정하고 검증했다. PostgreSQL과 로컬 개별 계정은 ADR-0008에 따라 통합했다. 공개 운영 인증 구성은 남아 있다.

## 적용 순서

1. 새 저장소의 루트에 이 폴더 내용을 복사한다. 기존 저장소에 합칠 때는 차이를 확인하며 선택적으로 반영한다.
2. 규정 원문을 비공개 보관하고 `docs/requirements/regulation-mapping.md`에 조항·버전·해시를 매핑한다. 개인정보가 있는 원문을 공개 Git에 넣지 않는다.
3. 제안 ADR을 검토하고, 사용할 런타임/의존성의 정확한 버전·라이선스를 확인한 후 잠금 파일을 만든다.
4. [로컬 실행 안내](docs/engineering/local-development.md)를 따라 앱 골격을 구현한다. 로컬 Docker는 사용하지 않는다.
5. P1~P6 적용 계획의 인수 기준을 통과한다. 규정 미확정 상태에서는 실제 가족 데이터의 회비 부과·승인·투표를 활성화하지 않는다.

## 지금 바로 볼 수 있는 것

- `docs/design/preview.html`: 설치 없이 여는 정적 디자인 견본. 모든 금액·이름·일정은 가상 자료이다.
- `apps/web/src/styles/`: Next.js 전역 스타일로 가져올 CSS 토큰과 컴포넌트 스타일.
- `apps/web/src/components/ui/`: 버튼·금액·상태 표시 React 예제. 제품 권한 검사는 별도 구현해야 한다.
- `config/`: 결정/규정/알림의 기계 판독 가능한 JSON 초안. 예제 설정을 읽는 제품 코드는 아직 없다.
- `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`: 그대로 사용할 협업 템플릿.
- `scripts/validate_foundation.py`: Python 3.11 이상 표준 라이브러리만 사용하는 문서·설정·색 대비 점검.

```powershell
python scripts/validate_foundation.py
```

`apps/web/package.json`과 npm 잠금 파일, `apps/api/requirements.lock`을 추가했다. 운영 Docker 파일과 실제 DB는 아직 없다. [의존성 채택 기록](docs/engineering/dependencies.md)을 확인한다.

검증 범위와 미실행 항목은 [검증 기록](docs/verification.md)을 확인한다.

## 문의·이슈

모든 로그인 사용자는 화면 상단 **문제 신고**에서 현재 화면에 최대 5곳의 핀과 짧은 설명을 붙여 등록할 수 있다. 제출 전 화면 가리기/첨부 제외 지원. **문의·이슈** 메뉴는 본인 문의와 답변을 제공하며, 총괄관리자만 같은 가족의 전체 문의를 조회하고 처리 상태를 변경한다. [검증·운영 한계](docs/plans/support-issues.md).
