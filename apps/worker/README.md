# 백그라운드 작업자 영역

`src/family_ledger_worker/main.py`를 향후 생성한다. 알림/파일 검사/문서 색인은 DB durable outbox와 lease를 사용한다. API 메모리 타이머에 의존하지 않는다. 개발은 sink와 합성 자료, 운영은 검증된 adapter와 feature flag를 사용한다. 실행 코드는 아직 없다.
