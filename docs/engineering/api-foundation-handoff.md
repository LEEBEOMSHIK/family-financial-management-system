# API foundation handoff

Date: 2026-10-23. Requirements: R03/R06/R12/R14/R15/R18/R19, development foundation scope.
Contract: [service foundation](../plans/service-foundation.md), version 0.1.

## Implemented

- `apps/api/src/family_ledger/main.py`: explicit development startup guard, opaque
  process-local sessions, HttpOnly/SameSite cookie, Origin and logout CSRF checks,
  no-store responses, typed routes and safe validation errors.
- `domain.py`: repository protocol, immutable synthetic adapter, current membership
  and `[valid_from, valid_to)` role evaluation, family isolation, integer aggregation.
- `models.py`: frozen input/output schemas and decimal-string money validation.
- `tests/`: authentication, CSRF, role boundaries, membership revocation, wrong family,
  management denial, production refusal, filters, integer precision, fixture totals.
- `packages/contracts/openapi.json`: generated API contract; response schemas are
  SessionResponse, DashboardResponse, TransactionsResponse and ManagementResponse.
- `apps/api/requirements.lock`, `dependency-metadata.json`, `export_openapi.py`, README.

POST dev/session returns SessionResponse. Cookie name: `family_session`.
Allowed Origins: `http://127.0.0.1:3000`, `http://localhost:3000`.
Month means October 2026, quarter means recent three fixture months August–October.
Balance 2450000; quarter income 1600000, expense 1150000; commitments 150000.

## Actual validation

In `apps/api`:

- `.venv/Scripts/python.exe -m pytest -q`: **19 passed**, one upstream warning:
  Starlette 1.9 deprecates its httpx TestClient integration in favor of httpx2.
  Current pinned httpx still executes all tests successfully; no warning suppression.
- `.venv/Scripts/python.exe -m ruff check src tests`: **passed**.
- `.venv/Scripts/python.exe -m pip check`: **no broken requirements**.
- `.venv/Scripts/python.exe export_openapi.py`: contract generated.
- Initial test-first collection failed because the requested package did not exist;
  implementation then passed 10 initial tests, expanded to 19 boundary/regression tests.
  A malformed non-ASCII CSRF header regression failed with TypeError before the
  comparison was changed to bytes; it now returns the intended 403 response.

Direct packages installed and checked against official PyPI JSON metadata:
FastAPI 0.161.1 (MIT), Uvicorn 0.54.0 (BSD-3-Clause), Pydantic 2.14.1 (MIT),
pytest 9.1.1 (MIT), httpx 0.28.1 (BSD-3-Clause), Ruff 0.17.2 (MIT).
The metadata file links each exact release and maintainer repository/changelog.
They have active official distribution and supported Python constraints; this is
installation/compatibility evidence, not an independent security audit.

## Execution and remaining work

Root startup command (PowerShell, after environment variables are set):

```powershell
$env:APP_ENV='development'
$env:AUTH_PROVIDER='development'
& apps/api/.venv/Scripts/python.exe -m uvicorn family_ledger.main:create_app --factory --app-dir apps/api/src --host 127.0.0.1 --port 8000
```

Stop using Ctrl+C. Single-worker sessions are lost on restart. No SQL, migration,
PostgreSQL persistence, external bank calls, payment execution or business write APIs.
Production identity provider, durable sessions, policy-backed access decisions,
auditable persistent data and real regulation rules remain UNVERIFIED/unimplemented.
No deployment or production-readiness claim. The parent integration owner verifies
the actual Next.js proxy and browser flow separately. All source data is synthetic.
