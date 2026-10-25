import pytest
from fastapi.testclient import TestClient

from family_ledger.main import Config, configured_origins, create_app


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1"])
def test_configured_local_aliases_allow_login_but_reject_other_origins(monkeypatch, host):
    monkeypatch.setenv("WEB_ORIGIN", f"http://{host}:3001")
    config = Config("development", "development", allowed_origins=configured_origins())
    with TestClient(create_app(config)) as client:
        for origin in ["http://localhost:3001", "http://127.0.0.1:3001"]:
            response = client.post("/api/v1/dev/session", json={"profile": "member"}, headers={"Origin": origin})
            assert response.status_code == 200
        for origin in ["http://localhost:3000", "http://localhost.evil:3001", "https://localhost:3001", "null"]:
            response = client.post("/api/v1/dev/session", json={"profile": "member"}, headers={"Origin": origin})
            assert response.status_code == 403
