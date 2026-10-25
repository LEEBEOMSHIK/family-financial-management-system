# Development API

Runnable FastAPI service with a fixed synthetic repository. No persistent database,
bank connection, business writes, or production authentication is implemented.
Requirement scope: R03/R06/R12/R14/R15/R18/R19 (development foundation only).

From this directory (Python 3.11+):

```powershell
python -m venv .venv
& .venv/Scripts/python.exe -m pip install -r requirements.lock
$env:APP_ENV = 'development'
$env:AUTH_PROVIDER = 'development'
& .venv/Scripts/python.exe -m uvicorn family_ledger.main:create_app --factory --app-dir src --host 127.0.0.1 --port 8000
```

Linux uses `.venv/bin/python` and `APP_ENV=development AUTH_PROVIDER=development`
before the command. Stop with Ctrl+C. Use one worker: sessions are process-local,
expire after one hour, and disappear on restart. Startup refuses any other environment.
Bind only to loopback; development login deliberately allows choosing a synthetic role.

The Next.js origin is `http://127.0.0.1:3000` or `http://localhost:3000`.
POST `/api/v1/dev/session` with `{ "profile": "member" }` (or `treasurer`) and
an allowed `Origin` returns the session and an HttpOnly, SameSite=Strict cookie.
DELETE `/api/v1/session` additionally requires `X-CSRF-Token` from the session response.
The local HTTP cookie is intentionally not Secure; this is not production auth.
Every read is `private, no-store`, and current membership/role intervals are checked
at request time. The synthetic treasurer assignment is valid during calendar 2026.

`period=month` selects October 2026, `quarter` selects the recent three fixture
months August–October 2026. This fixed reference period does not follow today's date.
Opening balance on August 1 is 2,000,000 KRW; October closing balance is 2,450,000.
All API money values are signed decimal strings and calculations use Python integers.

```powershell
& .venv/Scripts/python.exe -m pytest -q
& .venv/Scripts/python.exe -m ruff check src tests
& .venv/Scripts/python.exe -m pip check
& .venv/Scripts/python.exe export_openapi.py
```

`requirements.lock` pins the full installed dependency graph; `dependency-metadata.json`
records official PyPI version/license/source evidence for direct dependencies.
See [handoff](../../docs/engineering/api-foundation-handoff.md) for verification and gaps.
