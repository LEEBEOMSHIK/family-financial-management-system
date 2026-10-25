# 근거와 검증 수준

확인일: 2026-10-23 (Asia/Seoul). 공개 문서의 기능 설명을 읽었으며 실제 계약·설치·계정 승인·실운영 적합성은 검증하지 않았다.

## 사용자 근거

- 이번 요청: 시스템 범위, 스택, 수동 송금, 알림 날짜/대상, AI 분리, 문서/역할/절차/디자인 산출물.
- 참조 대화: 「가족 회계 시스템 설계」, ID `6adb0833-4250-83ee-98e7-476eec260a09`. 조회 가능한 5개 사용자 turn에서 수동 송금·조회·증빙·일정·알림 정책·개발 기반 필요를 확인했다. 답변 일부는 content-reference 표식만 제공되었다.
- 운영규정 v1.0: 이름과 존재는 사용자 설명, 원문/조항은 미확보. 관련 Drive 검색 결과 없음은 문서가 없다는 증명이 아니라 접근한 검색 범위에서 찾지 못했다는 뜻이다.

## 공식 문서

| 출처 | 이 초안에서 사용한 근거 | 검증하지 않은 것 |
| --- | --- | --- |
| [금융결제원 오픈뱅킹](https://openapi.kftc.or.kr/service/openBanking) | 조회 API와 이용기관 계약/승인 구조 | 이 가족 시스템의 자격·특정 계좌 연결 |
| [카카오톡 메시지](https://developers.kakao.com/docs/ko/kakaotalk-message/common) | 서비스 사용자 간 메시지, 권한·동의 조건 | 무인 예약 용도 심사·앱 승인 |
| [카카오 알림톡](https://kakaobusiness.gitbook.io/main/ad/infotalk) | 정보성 템플릿 심사, 채널·공식 딜러 절차 | 가족 모임 계약 가능성·요금·실수신 |
| [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation) | App Router 설치/지원 환경 안내 | 프로젝트 package compatibility·빌드 |
| [TypeScript strict](https://www.typescriptlang.org/tsconfig/strict) | strict 옵션의 의미 | 선택할 compiler 버전 전체 호환 |
| [FastAPI 실행](https://fastapi.tiangolo.com/deployment/manually/) | ASGI/Uvicorn의 로컬 실행 방식 | 현재 프로젝트 구현·배포 |
| [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) | row security의 기본 거부/owner 등 예외 | 실제 DB policy 구현 |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | 대비·키보드·대상 크기 등 접근성 목표 | 전체 앱의 AA 준수 인증 |
| [OWASP 인가](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | 최소 권한·매 요청 검사 | 앱 침투 테스트 |
| [OWASP 파일 업로드](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) | 형식/내용/저장/크기 방어 | 실제 파일 검사기 효과 |
| [OWASP LLM 지시문 주입](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) | 비신뢰 자료/도구 경계·다층 통제 | 특정 모델의 무결점 방어 |
| [openpyxl](https://openpyxl.readthedocs.io/en/stable/) | XLSX 도구 후보 및 XML 방어 주의 | 은행 파일 호환·설치/버전 |
| [SQLAlchemy](https://docs.sqlalchemy.org/en/20/), [Alembic](https://alembic.sqlalchemy.org/en/latest/) | 데이터 접근/마이그레이션 후보 | 버전 조합·Windows/CPU 지원 |
| [pytest](https://docs.pytest.org/en/stable/), [Ruff](https://docs.astral.sh/ruff/), [Playwright](https://playwright.dev/docs/intro) | 테스트·정적 검사 후보 | 현재 묶음에서 해당 도구를 실행한 결과 |

라이브러리의 공개 문서가 존재한다는 사실과 이 프로젝트에 채택할 수 있다는 판단을 분리한다. 실제 선택 시 공식 릴리스·보안 공지·라이선스·실행 증거를 추가한다.
