"""Production configuration and HTTPS sessions, against isolated PostgreSQL."""

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from test_auth import PASSWORD, accounts  # noqa: F401
from test_postgres import database  # noqa: F401

from family_ledger.auth import LocalAuth
from family_ledger.main import Config, configured_origins, create_app

ORIGIN = "https://family.example.com"


@pytest.fixture(autouse=True)
def production_settings(monkeypatch):
    monkeypatch.setenv("FINANCIAL_DATA_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "0")
    monkeypatch.delenv("DEV_ACCOUNTS_FILE", raising=False)


def config(dsn="postgresql://unused"):
    return Config("production", "local_password", allowed_origins=(ORIGIN,), database_url=dsn)


def test_production_origin_is_explicit_and_has_no_local_alias(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("WEB_ORIGIN", ORIGIN)
    assert configured_origins() == (ORIGIN,)
    for bad in [None, "http://family.example.com", "https://localhost", "https://127.0.0.1", ORIGIN + "/login", ORIGIN + "?x=y", "https://user:pass@family.example.com"]:
        if bad is None:
            monkeypatch.delenv("WEB_ORIGIN", raising=False)
        else:
            monkeypatch.setenv("WEB_ORIGIN", bad)
        with pytest.raises(RuntimeError):
            configured_origins()


@pytest.mark.parametrize("name,value", [("ENABLE_DEV_LOGIN", "1"), ("DEV_ACCOUNTS_FILE", "unused.json"), ("FINANCIAL_DATA_KEY", ""), ("FINANCIAL_DATA_KEY", "invalid")])
def test_production_rejects_unsafe_environment(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(RuntimeError):
        create_app(config())


def test_production_requires_database_and_secure_origin():
    for bad in [Config("production", "development"), Config("production", "local_password"), Config("production", "local_password", database_url="unused")]:
        with pytest.raises(RuntimeError):
            create_app(bad)


@pytest.mark.parametrize("origin", ["https://family.example.com:443", "https://FAMILY.example.com", "https://family.example.com.", "https://family\\.example.com"])
def test_noncanonical_production_origins_fail_at_startup(origin):
    with pytest.raises(RuntimeError):
        create_app(Config("production", "local_password", allowed_origins=(origin,), database_url="postgresql://unused"))


def test_https_session_csrf_and_revocation(accounts):  # noqa: F811
    app = create_app(config(accounts))
    with TestClient(app, base_url=ORIGIN) as browser:
        assert browser.post("/api/v1/dev/session", json={"profile": "super_admin"}).status_code == 404
        assert browser.get("/docs").status_code == 404
        payload = {"username": "owner", "password": PASSWORD}
        assert browser.post("/api/v1/auth/login", json=payload, headers={"Origin": "http://localhost:3000"}).status_code == 403
        result = browser.post("/api/v1/auth/login", json=payload, headers={"Origin": ORIGIN})
        assert result.status_code == 200
        for attribute in ["Secure", "HttpOnly", "SameSite=strict", "Path=/"]:
            assert attribute in result.headers["set-cookie"]
        assert "Domain=" not in result.headers["set-cookie"]
        assert browser.get("/api/v1/session").status_code == 200
        assert browser.get("/api/v1/families/other-family/dashboard").status_code == 404
        with LocalAuth(accounts).connect() as conn:
            conn.execute("UPDATE membership SET active=false WHERE user_id=%s", (result.json()["user"]["id"],))
        assert browser.get("/api/v1/session").status_code == 403
        assert browser.delete("/api/v1/session", headers={"Origin": ORIGIN}).status_code == 403
        token = browser.cookies.get("family_session")
        result = browser.delete("/api/v1/session", headers={"Origin": ORIGIN, "X-CSRF-Token": result.json()["csrf_token"]})
        assert result.status_code == 204
        assert "Secure" in result.headers["set-cookie"]
        assert browser.get("/api/v1/session", headers={"Cookie": f"family_session={token}"}).status_code == 401
