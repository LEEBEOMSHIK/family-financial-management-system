# 문서 관리 구현 계획

목표: 총무·총괄관리자 전용 문서 관리 아래 통장 내역 문서, 가족 문서, 영수증·증빙 관리를 제공한다.
설계: [파일 관리](../design/file-management.md). 요구사항 R05·R12·R18·R20.
기술: 기존 Next.js/TypeScript, FastAPI/Pydantic, PostgreSQL, Fernet 암호화. 새 외부 라이브러리 없이 구현한다.
사용자 실행 승인에 따라 현재 작업 공간에서 직접 진행하며 기존 변경은 보존한다.

## 구현 순서

- [x] API/DB: `documents/{models,files,repository,routes}.py`, `007_documents.sql`, `main.py`. 가족·유효 역할을 매 요청 서버 판정. 비공개 암호화 원본과 추가형 버전, 작업 ID 재시도 중복 방지. 목록·검색·종류별 페이지·다운로드·버전 이력 API.
- [x] 파일 검증: 최대 6MiB. 통장 XLSX/CSV, 가족 PDF/DOCX/TXT/PNG/JPG/WebP. 실제 형식과 압축 해제 한도 검사. 다운로드는 attachment/no-store/nosniff. 악성코드 전용 검사는 미연동으로 명시한다.
- [x] 증빙: 기존 요청에 연결된 증빙만 관리자 통합 목록·원본 다운로드, 원래 요청 링크 제공. 미제출 개인 임시 파일은 노출하지 않는다.
- [x] 웹: `features/documents/`와 `/documents/{bank,family,evidence}`. 상위 메뉴/하위 메뉴, 검색·목록·업로드·버전·다운로드. API 프록시 허용 경로와 응답 헤더 반영. 업로드 결과 불명 시 동일 작업 ID로 재확인한다.
- [x] 계약: OpenAPI와 생성 TypeScript 갱신.
- [x] 검증: 전용 DB API 테스트(권한 회수·타가족·CSRF·파일 변조·버전·재시도·암호화·영속성·증빙 원본), Playwright(세 메뉴·업로드/버전/다운로드·일반사용자 차단·모바일), 빌드/린트/정적 검증.
- [x] 독립 리뷰 및 수정, 로컬 마이그레이션·서버 재시작, 보드와 결과 갱신.

## 구현 판단과 제한

- 통장 파일 업로드는 문서 보관까지 제공한다. 실제 은행 서식 미확보로 거래 확정·원장 반영은 비활성화하고 ‘서식 확인 대기 · 거래 미반영’을 표시한다. 엑셀을 실제 회계 데이터로 반영했다고 주장하지 않는다.
- 문서 삭제·원본 덮어쓰기 대신 새 버전을 등록한다. 각 버전의 제목·분류·설명과 원본을 보존한다. 일반사용자의 기존 본인 증빙 권한은 그대로 유지한다.
- 암호화 키는 기존 FINANCIAL_DATA_KEY를 재사용하고 DB와 키 백업이 모두 필요하다. 암호화 파일을 메타데이터와 같은 트랜잭션에 저장한다.
- 복구: 007은 추가형 테이블만 만든다. 이전 앱으로 롤백해도 테이블/파일을 삭제하지 않는다. 스키마 다운그레이드가 필요하면 DB+키를 백업하고 별도 검토한다.

## 검증 기록

- 신규 API 테스트 구현 전 3개 실패(경로 404), 구현 후 3개 통과. 기존 권한·이력 처리와 실제 PostgreSQL 사용.
- 독립 리뷰: 손상 DEFLATE 스트림이 500이 되던 문제를 재현(단위 테스트 1 실패), zlib/EOF 오류를 422로 변경 후 단위 테스트 2개 통과. 버전 이력 열기/닫기의 포커스 이동 보완.
- 최초 브라우저 실행: 일반사용자 차단·연결 증빙·원본 다운로드 1개 통과. 문서 저장 테스트는 Next.js 자체 알림과 role=alert 선택자 중복으로 실패, 앱 오류 문구로 선택자를 한정했다. 최종 재실행에서 문서·공통 화면 브라우저 8개 모두 통과.
- 현재 빌드(타입 검사 포함), 웹 lint, API ruff, pip check, npm audit(high: 취약점 0), 테마 9개 테스트, foundation 검증 통과.
- 전체 API 회귀 70 passed (180.11s), 기존 Starlette/httpx 사용 중단 예정 경고 1건. 테스트는 전용 family_ledger_test의 임시 스키마를 사용한다.
- 미검증/제한: 실제 은행 파일 서식, 거래 미리보기·중복 판정·원장 반영, 전용 악성코드 검사, 실제 모바일 기기, 외부 운영 배포. 통장 CSV/XLSX는 보관만 하며 화면에 거래 미반영을 표시한다.
- 브라우저 테스트 포트 3001은 다른 프로젝트가 사용 중이라 러너를 메모리에서 3101/8101로 치환한다. 기존 프로젝트 프로세스는 종료하지 않는다.


## 최종 실행 명령과 결과

- `$env:PYTHONPATH='apps/api/src'`와 전용 DB 환경변수 설정 후 `apps/api/.venv-pg/Scripts/python.exe -m pytest apps/api/tests -q --tb=short --basetemp=var/pytest-documents-final`: 70 passed.
- `apps/api/.venv-pg/Scripts/python.exe scripts/test_service.py documents.spec.ts controls.spec.ts service.spec.ts` (위 설명의 3101/8101 치환 실행): 8 passed (56.0s). 문서 결과 불명→재시도 중복 방지, 새 버전/옛 원본 다운로드, 새로고침 후 유지, 검색, 송금 자료 미반영 표시, 멤버 403, 증빙 출금 상세 연결 포함.
- `npm --prefix apps/web run contracts`, `npm --prefix apps/web run build`(타입 검사 포함), `npm --prefix apps/web run lint`: 통과. 초기 타입 검사에서 공통 Select의 disabled 미지원 확인 후 disabled fieldset으로 해결.
- `apps/api/.venv-pg/Scripts/python.exe -m ruff check apps/api/src apps/api/tests`, `apps/api/.venv-pg/Scripts/python.exe -m pip check`: 통과.
- `node --test tests/design/theme.test.cjs`: 9 passed. `npm --prefix apps/web audit --audit-level=high`: 취약점 0.
- `python scripts/validate_foundation.py`, `git diff --check`: 통과.
- 합성 화면 캡처: Git 제외 `var/documents-family.png`, `var/documents-family-dark.png`. 두 테마 시각 확인, 1440/390/320px 가로 넘침 없음 검증.
- 로컬 `migrate(owner_dsn)`로 007 적용, 기존 expense_request/expense_decision/expense_payment 건수 동일 확인. 기존 원본과 데이터 삭제 없음.

## 변경 파일과 운영 인수인계

- DB/API: `apps/api/migrations/007_documents.sql`, `apps/api/src/family_ledger/documents/`의 models/files/repository/routes, `main.py` 라우터 등록.
- 계약: `packages/contracts/openapi.json`, `apps/web/src/generated/api.ts`.
- 웹: `apps/web/src/app/(workspace)/documents/` 4개 페이지, `features/documents/` 3개 컴포넌트, `components/app-shell.tsx`, API 프록시, `styles/workspace.css`.
- 테스트: `apps/api/tests/test_documents.py`, `test_document_files.py`, `apps/web/tests/documents.spec.ts`.
- 문서: 본 기록, `docs/design/file-management.md`, `WORKBOARD.md`.
- 원본은 DB에 암호화 저장하며 개인 파일 경로나 공개 파일 URL을 생성하지 않는다. DB 백업과 기존 `var/secrets/financial-data.key` 보관이 모두 필요하다. 키가 없으면 새로 만들지 말고 원래 키를 복구한다.
- 다운로드는 서버 재인가 후 감사 이력을 남긴다. 업로드 결과 불명에는 같은 작업 ID를 재사용하며, 승인/원장/송금 상태를 변경하지 않는다.
- 운영 배포 전에 악성코드 검사 연동 및 지원 은행의 비식별 서식 검증이 남는다. 사용자 확인 대기.

- 최종 로컬 반영: `node scripts/dev.mjs --production-build` 재시작 후 `http://localhost:3000/login` HTTP 200. 문서 갱신 후 foundation PASS, diff check 통과. 커밋·원격 푸시는 하지 않았다.


## WB-06 후속: 상위 메뉴 펼치기·접기 (R18·R19)

- `components/document-navigation.tsx`에 상위 토글 버튼, aria-expanded/aria-controls와 방향 화살표를 추가했다. 문서 화면 진입 시 열리고 그 밖의 화면에서는 기본 접힘이다. 같은 화면에서는 사용자가 펼치고 접을 수 있다.
- 접힌 하위 항목은 숨기고 탭 탐색에서도 제외한다. 기존 문서 홈은 하위 ‘문서 관리 홈’으로 접근한다. 모바일은 하위 목적지 선택 시 전체 메뉴도 닫는다.
- 변경: 위 신규 컴포넌트, `app-shell.tsx`, `workspace.css`, `controls.spec.ts`, `documents.spec.ts`, 본 기록과 WORKBOARD.
- `npm --prefix apps/web run build`(타입 검사 포함), `npm --prefix apps/web run lint`, `python scripts/validate_foundation.py`, `git diff --check` 통과. `scripts/test_service.py controls.spec.ts documents.spec.ts`(기존처럼 포트 3101/8101 사용): 5 passed (44.3s). PC/모바일·Space/Enter·직접 진입·새로고침 시 펼침·문서 기능 회귀 검증.
- API·DB 계약은 변경하지 않았다. 실제 모바일 기기 터치 검증은 미실행.

- 메뉴 후속 수정 로컬 반영: 서비스 재시작 후 `/login` HTTP 200 확인.


## WB-06 후속: 홈 제거·검색 결과 간격 (R18·R19)

- 사용자 피드백: 문서 관리 홈 메뉴는 불필요하며 검색 입력과 결과 건수 안내가 붙어 보임.
- 원인: 기존 디자인 시스템은 간격 토큰과 상세·폼 관계만 명시했고 검색/건수/목록 관계는 누락. 화면 역시 p 기본 여백에 의존했다.
- 문서 관리 홈 하위 링크와 화면 복귀 링크·홈 카드 컴포넌트를 제거. `/documents` 직접 접근은 `/documents/bank`로 연결하고 하위 메뉴는 세 개만 유지한다.
- `.list-result-summary` 공통 클래스로 검색 영역→건수 안내, 건수 안내→목록/빈 상태에 각각 `--space-4`(16px)를 적용. 검색 영역 상단 24px, 내부 컨트롤 gap 12px도 토큰으로 통일.
- 변경 파일: `document-navigation.tsx`, `documents-view.tsx`, documents/page.tsx, workspace.css, documents.spec.ts, `docs/design/design-system.md`, 본 기록·WORKBOARD.
- 디자인 시스템에 검색/결과/목록 간격 계약 추가. PC·모바일 및 결과 0건에서도 같은 간격을 사용한다.
- build(타입 검사 포함), lint, foundation, diff check 통과. `scripts/test_service.py controls.spec.ts documents.spec.ts`(3101/8101 치환): 6 passed (50.4s). 세 화면 × 1440/390px에서 검색 영역·건수·목록 경계 사이 16px 이상, 가로 넘침 없음 확인.
- 서버 종료 중 이미 끝난 자식 프로세스에 대한 오류가 한 번 발생. 3000/8000 리슨 프로세스가 없음을 확인한 뒤 빌드했다. 실제 모바일 기기 검증은 미실행.

- 간격 후속 수정 로컬 반영: 서버 재시작 후 `/login` HTTP 200. 갱신된 가족 문서 화면 캡처에서 홈 메뉴 제거 및 검색 하단 여백을 시각 확인했다.


## WB-06 업로드 화면 분리·드래그 앤 드롭 계획 (R18·R19·R20)

사용자 승인: 목록과 업로드 화면을 나누고 기본 파일 입력 대신 드래그 업로드를 제공한다.
1. 가족/통장 `/upload` 전용 경로와 목록 복귀. 새 버전은 기존 문서 식별자로 서버 이력을 조회하여 같은 업로드 화면에 연결한다.
2. 재사용 파일 선택 영역: 드래그 강조, 클릭/키보드 선택, 파일명·크기, 교체·제거, 단일 파일·확장자·6MiB 검증. 서버 검증은 그대로 유지한다.
3. 저장 성공 시 목록 복귀 및 저장한 문서 확인. 결과 불명 시 동일 작업 ID 재시도와 파일 고정 유지.
4. 브라우저 드래그/실패/키보드/모바일/버전/권한 회귀와 빌드·린트·정적 검증, 디자인 시스템에 업로드 영역 기준 추가.
API/DB 변경 없음. 실제 운영규정 문서 원본은 아직 받지 않아 이번 작업에서 등록하지 않는다.


### 업로드 화면 구현·검증 진행 기록

- 구현 파일: `document-file-picker.tsx`(드래그/클릭 선택·검증), `document-upload-view.tsx`(권한·버전 로딩·전용 화면), 기존 `document-upload.tsx`/`documents-view.tsx`, family/bank upload 신규 경로와 목록 page, navigation/app-shell, workspace.css, 문서 테스트 2개 파일, 디자인 시스템.
- 별도 `/documents/family/upload`, `/documents/bank/upload` 화면. 새 버전은 서버에서 이력을 읽고 해당 종류 문서에만 연결. 저장 성공 시 목록 조회 결과에 저장된 ID가 있는 경우에만 성공 안내.
- 1차 개선 전 브라우저 테스트는 로그인 지연으로 업로드 화면 도달 전 실패(업로드 동작의 실패 증거로 해석하지 않음). 첫 빌드에서는 strict 배열 인덱스 검사로 빈 파일 가드 누락이 발견되어 수정했다.
- 개선 후 `scripts/test_service.py document-upload.spec.ts documents.spec.ts controls.spec.ts` (3101/8101 치환): 7 passed (1.0m). 화면 분리, 실제 DataTransfer 드래그, 유효하지 않은 형식·다중파일·6MiB 초과 거부, 파일 유지·제거·키보드 선택, 1440/390/320px 가로 넘침 없음, 저장·새 버전·원본·결과 불명 재시도와 접근 차단 확인.
- 독립 리뷰: 빈/중복 version 파라미터를 신규 등록으로 해석하지 않도록 수정, 두 업로드 경로의 경계 테스트 추가. 최종 빌드/테스트 결과는 아래 기록.
- `var/document-upload-desktop.png`, `var/document-upload-mobile.png`에서 파일 영역·선택 정보·메타데이터·하단 버튼을 직접 시각 확인했다. 실제 기기 파일 앱·Finder/Explorer 드래그는 미검증이며 브라우저 DataTransfer 기반 검증이다.


### 업로드 화면 최종 검증

- 독립 리뷰 반영 후 `npm --prefix apps/web run build`(타입 검사 포함) 통과.
- `scripts/test_service.py document-upload.spec.ts`(3101/8101 치환): 2 passed (14.0s). 두 종류 화면의 빈/중복 version 거부와 파일 선택 전체 흐름 최종 확인.
- `npm --prefix apps/web run lint`, `python scripts/validate_foundation.py`, `git diff --check` 통과.
- API/DB 계약 변경 없음. 기존 7개 브라우저 회귀와 최종 경계 2개 검증 완료. 실제 운영규정 파일은 미등록, 원본 제공 대기.

### 가족 운영규칙 대화 기반 복원·등록 (2026-10-26)
- WB-06 / R01·R20. 사용자가 원본 분실을 알리고 남은 대화 내용으로 재작성을 요청. 현재 대화, 요구사항 후속 확정, 권한/회비 합의 기록, 이전 가족 회계 설계 대화의 조회 가능한 사용자 메시지를 근거로 복원. 이전 답변 일부는 참조만 조회되어 전문 확인 불가.
- 결과: 「가족모임 운영규칙 — 대화 기반 복원본 r1 (검토용)」 DOCX 4쪽. 원본 동일성·시행일·현행 승인본 아님을 명시. 확인되지 않은 실제 회비액·경조사 지급·임기·투표/개정·증빙 기한·탈퇴/해산 등은 확인 목록으로 분리. 실자료/문서 본문은 Git에 저장하지 않고 비공개 var/family-rules-recovery에 보관.
- 기본 render_docx.py는 Windows LibreOffice 미설치로 실패. 별도 비표시 Word 인스턴스 읽기 전용 PDF 변환과 Poppler PNG 렌더링으로 대체. 처음 6쪽에서 문단 그리드/간격 보완 후 4쪽 전부 직접 시각 확인. 한글·페이지 나눔·헤더/푸터·잘림 없음 확인.
- 정상 권한·CSRF API로 family/운영정책·규정 분류에 버전 1 등록(HTTP 200). 원본 다운로드 후 SHA-256 일치 확인, 가족 문서 화면 HTTP 200. 재시도 operation ID와 등록 ID는 비공개 upload-receipt.json에 기록. 내용 등록만 수행, 업무 정책·권한·회비/승인 값은 변경하지 않음.
- 변경 파일: WORKBOARD.md, 이 기록. 제품 코드 변경 없으므로 제품 테스트 재실행하지 않음. 원본과의 일치 및 사용자 최종 문구 승인은 미검증. 다음: 복원본 검토 및 누락된 운영 조건 결정 후 새 버전으로 등록.

- 복원본 디자인 r2: 긴 문단을 역할/정책/상태 비교표와 처리 흐름도로 재구성. 남색 표 머리글·옅은 행 구분·단계 번호·한글 타이포·여백 통일. 확인된 업무 원칙과 검토용 상태 유지. 초기 렌더에서 고정 줄 높이로 흐름도가 표시되지 않는 문제를 발견해 이미지 문단 높이를 수정. Word→Poppler 4쪽 시각 검토 후 같은 root에 버전 2 등록(200), 다운로드 SHA-256 일치 및 버전 1 존재 확인. 파일/제작 스크립트/검증 이미지는 비공개 var/family-rules-recovery에 저장. 코드 변경 없음, 제품 테스트 재실행 없음. 사용자 디자인 수용 미확인.
