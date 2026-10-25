# ADR-0002: 모듈형 아키텍처

상태: proposed
작성일: 2026-10-23
결정자: 미지정 — 프로젝트 책임자/기술 리드 채택 필요

## 맥락
가족 규모에서 개발/감사/배포를 단순하게 하고 Python 백엔드 조건을 만족해야 한다.

## 결정 또는 제안
Next.js 표현 계층, FastAPI 업무/인가, PostgreSQL 거래 저장소, 별도 durable worker, 비공개 파일 저장소를 제안한다. 동일 출처 세션 연결을 사용한다.

## 대안
Next.js 단독은 Python 조건과 불일치. 마이크로서비스는 운영 복잡도가 크다. SQLite는 권한/잠금 통합 검증을 대체하지 못한다.

## 결과·제약
DB/인증/라이브러리 정확 버전, 지원 OS, 운영 비용 검증 후 채택한다. 원자적 상태·감사·outbox 트랜잭션을 유지한다.

## 검증과 관련 문서
[요구사항](../requirements/requirements.md), [시스템 설계](../architecture/system-design.md), [인수 테스트](../qa/test-strategy.md), [공식 근거](../sources.md).
채택 시 승인자/날짜/근거를 기록하고 관련 설정과 테스트를 함께 갱신한다.
