from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from family_ledger.main import Config, create_app

FAMILY = "00000000-0000-4000-8000-000000000001"
BASE = f"/api/v1/families/{FAMILY}"
ORIGIN = {"Origin": "http://127.0.0.1:3000"}


@pytest.fixture
def client():
    with TestClient(create_app(Config("development", "development"))) as value:
        yield value


def login(client, profile="member"):
    response = client.post(
        "/api/v1/dev/session", json={"profile": profile}, headers=ORIGIN
    )
    assert response.status_code == 200
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    return response.json()


def test_health_and_absent_invalid_session(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get(BASE + "/dashboard").status_code == 401
    client.cookies.set("family_session", "invalid-synthetic-session")
    assert client.get("/api/v1/session").status_code == 401


def test_member_scope_and_management_denial(client):
    session = login(client)
    assert session["capabilities"] == ["view_dashboard", "view_transactions"]
    assert client.get(BASE + "/management").status_code == 403
    assert (
        client.get(BASE.replace(FAMILY, "other-family") + "/dashboard").status_code
        == 404
    )
    assert (
        client.get(BASE + "/dashboard").headers["cache-control"] == "private, no-store"
    )


def test_treasurer_role_is_checked_at_request_time(client):
    login(client, "treasurer")
    assert client.get(BASE + "/management").status_code == 200
    client.app.state.clock = lambda: datetime(2100, 1, 1, tzinfo=UTC)
    # Keep the session alive to distinguish current role checks from session expiry.
    for session in client.app.state.sessions.values():
        session.expires_at = datetime(2101, 1, 1, tzinfo=UTC)
    assert client.get(BASE + "/management").status_code == 403
    assert "manage" not in client.get("/api/v1/session").json()["capabilities"]


def test_csrf_login_logout_and_expiration(client):
    assert (
        client.post("/api/v1/dev/session", json={"profile": "member"}).status_code
        == 403
    )
    session = login(client)
    assert client.delete("/api/v1/session", headers=ORIGIN).status_code == 403
    headers = {**ORIGIN, "X-CSRF-Token": session["csrf_token"]}
    assert (
        client.delete(
            "/api/v1/session", headers={**headers, "Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert client.delete("/api/v1/session", headers=headers).status_code == 204
    assert client.get("/api/v1/session").status_code == 401
    login(client)
    client.app.state.clock = lambda: datetime.now(UTC) + timedelta(hours=2)
    assert client.get("/api/v1/session").status_code == 401


@pytest.mark.parametrize(
    "env,provider", [("production", "development"), ("development", "oidc"), ("", "")]
)
def test_unsafe_runtime_startup_denied(env, provider):
    message = "Production requires PostgreSQL password authentication" if env == "production" else "development"
    with pytest.raises(RuntimeError, match=message):
        create_app(Config(env, provider))


@pytest.mark.parametrize("period", ["month", "quarter"])
def test_transaction_filters_and_integer_sums(client, period):
    login(client)
    rows = client.get(BASE + "/transactions", params={"period": period}).json()["items"]
    dashboard = client.get(BASE + "/dashboard", params={"period": period}).json()
    income = sum(int(row["amount_krw"]) for row in rows if int(row["amount_krw"]) > 0)
    expense = -sum(int(row["amount_krw"]) for row in rows if int(row["amount_krw"]) < 0)
    assert dashboard["income_krw"] == str(income)
    assert dashboard["expense_krw"] == str(expense)
    assert dashboard["net_krw"] == str(income - expense)
    assert all(isinstance(row["amount_krw"], str) for row in rows)
    for direction, sign in [("income", 1), ("expense", -1)]:
        filtered = client.get(
            BASE + "/transactions", params={"period": period, "direction": direction}
        ).json()["items"]
        assert filtered and all(int(row["amount_krw"]) * sign > 0 for row in filtered)
    assert sum(int(row["amount_krw"]) for row in dashboard["categories"]) == expense
    assert dashboard["balance_krw"] == dashboard["monthly"][-1]["balance_krw"]


def test_invalid_inputs_do_not_echo_sensitive_input(client):
    login(client)
    response = client.get(BASE + "/transactions?period=invalid")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_malformed_csrf_header_is_rejected_without_server_error(client):
    login(client)
    response = client.delete(
        "/api/v1/session",
        headers=[(b"Origin", b"http://127.0.0.1:3000"), (b"X-CSRF-Token", b"\xff")],
    )
    assert response.status_code == 403
