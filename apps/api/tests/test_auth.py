"""Account behavior against an isolated real PostgreSQL schema."""

import os
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from test_postgres import database  # noqa: F401

from family_ledger.auth import (
    LocalAuth,
    bootstrap_admin,
    hash_password,
    verify_password,
)
from family_ledger.auth_models import PasswordLogin
from family_ledger.domain import FAMILY
from family_ledger.main import Config, create_app
from family_ledger.postgres import migrate, seed

ORIGIN = {"Origin": "http://127.0.0.1:3000"}
PASSWORD = "synthetic-test-password-1234"
BASE = f"/api/v1/families/{FAMILY}"


@pytest.fixture
def accounts(database):  # noqa: F811 - imported pytest fixture
    migrate(database, app_role="family_ledger_test_app")
    seed(database)
    bootstrap_admin(database, "Owner", PASSWORD, "합성 관리자")
    return database


def client(dsn):
    return TestClient(
        create_app(Config("development", "local_password", database_url=dsn))
    )


def login(browser, username="owner", password=PASSWORD):
    return browser.post(
        "/api/v1/auth/login",
        headers=ORIGIN,
        json={"username": username, "password": password},
    )


def test_password_hash_and_normalization():
    encoded = hash_password(PASSWORD)
    assert encoded != hash_password(PASSWORD)
    assert PASSWORD not in encoded
    assert verify_password(PASSWORD, encoded)
    assert not verify_password("wrong-password", encoded)
    assert PasswordLogin(username="Owner", password=PASSWORD).username == "owner"


def test_bootstrap_login_persistent_session_revocation(accounts):
    with pytest.raises(ValueError, match="already completed"):
        bootstrap_admin(accounts, "second", PASSWORD)
    browser = client(accounts)
    assert (
        browser.post(
            "/api/v1/dev/session", json={"profile": "super_admin"}, headers=ORIGIN
        ).status_code
        == 404
    )
    assert (
        browser.post(
            "/api/v1/auth/login", json={"username": "owner", "password": PASSWORD}
        ).status_code
        == 403
    )
    response = login(browser)
    assert response.status_code == 200
    assert response.json()["user"]["display_name"] == "합성 관리자"
    assert "HttpOnly" in response.headers["set-cookie"]
    token = browser.cookies.get("family_session")
    restarted = client(accounts)
    restarted.cookies.set("family_session", token)
    assert restarted.get("/api/v1/session").status_code == 200
    assert restarted.delete("/api/v1/session", headers=ORIGIN).status_code == 403
    headers = {**ORIGIN, "X-CSRF-Token": response.json()["csrf_token"]}
    assert restarted.delete("/api/v1/session", headers=headers).status_code == 204
    assert browser.get("/api/v1/session").status_code == 401
    login(browser)
    browser.app.state.clock = lambda: datetime.now(UTC) + timedelta(hours=9)
    assert browser.get("/api/v1/session").status_code == 401


def test_invite_only_registration_and_role_authorization(accounts):
    admin = client(accounts)
    session = login(admin).json()
    headers = {**ORIGIN, "X-CSRF-Token": session["csrf_token"]}
    assert admin.post(BASE + "/invitations", headers=ORIGIN).status_code == 403
    invite = admin.post(BASE + "/invitations", headers=headers).json()["invite_token"]
    member = client(accounts)
    body = {
        "invite_token": invite,
        "username": "member",
        "password": PASSWORD,
        "display_name": "합성 구성원",
    }
    registered = member.post("/api/v1/auth/register", headers=ORIGIN, json=body)
    assert registered.status_code == 200
    assert registered.json()["capabilities"] == ["view_dashboard", "view_transactions"]
    assert member.get(BASE + "/roles").status_code == 403
    member_headers = {**ORIGIN, "X-CSRF-Token": registered.json()["csrf_token"]}
    assert member.post(BASE + "/invitations", headers=member_headers).status_code == 403
    assert (
        member.post(
            "/api/v1/auth/register", headers=ORIGIN, json={**body, "username": "reused"}
        ).status_code
        == 400
    )
    state = admin.get(BASE + "/roles").json()
    change = {
        "user_id": registered.json()["user"]["id"],
        "role": "treasurer",
        "expected_version": state["version"],
        "reason": "합성 검증",
    }
    assert admin.post(BASE + "/roles", headers=headers, json=change).status_code == 200
    assert "manage" in member.get("/api/v1/session").json()["capabilities"]
    assert member.get(BASE.replace(FAMILY, "other") + "/dashboard").status_code == 404
    with LocalAuth(accounts).connect() as conn:
        row = conn.execute("SELECT token_hash,used_by FROM invitation").fetchone()
        assert row["token_hash"] != invite
        assert row["used_by"] == change["user_id"]
        conn.execute(
            "UPDATE membership SET active=false WHERE user_id=%s", (change["user_id"],)
        )
    assert member.get("/api/v1/session").status_code == 403
    assert login(client(accounts), username="member").status_code == 403


def test_generic_invalid_credentials_and_durable_throttle(accounts):
    browser = client(accounts)
    assert (
        login(browser, "missing").json()
        == login(browser, password="wrong-test-password").json()
    )
    for _ in range(9):
        assert login(browser, password="wrong-test-password").status_code == 401
    assert login(client(accounts)).status_code == 429


def test_expired_invite_rejected_without_account(accounts):
    auth = LocalAuth(accounts)
    user = auth.login(
        PasswordLogin(username="owner", password=PASSWORD), "test", datetime.now(UTC)
    )
    token, _ = auth.invite(user, FAMILY, datetime.now(UTC))
    browser = client(accounts)
    browser.app.state.clock = lambda: datetime.now(UTC) + timedelta(days=8)
    assert (
        browser.post(
            "/api/v1/auth/register",
            headers=ORIGIN,
            json={
                "invite_token": token,
                "username": "expired",
                "password": PASSWORD,
                "display_name": "합성",
            },
        ).status_code
        == 400
    )
    with auth.connect() as conn:
        assert (
            conn.execute("SELECT count(*) AS total FROM account").fetchone()["total"]
            == 1
        )


def test_runtime_database_role_can_authenticate_and_register(accounts):
    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    runtime = os.environ.get("TEST_APP_DATABASE_URL")
    if not runtime:
        pytest.skip("TEST_APP_DATABASE_URL required to verify runtime grants")
    assert conninfo_to_dict(runtime).get("dbname") == "family_ledger_test"
    dsn = make_conninfo(runtime, options=conninfo_to_dict(accounts)["options"])
    browser = client(dsn)
    session = login(browser)
    assert session.status_code == 200
    headers = {**ORIGIN, "X-CSRF-Token": session.json()["csrf_token"]}
    response = browser.post(BASE + "/invitations", headers=headers)
    assert response.status_code == 200
    registered = client(dsn).post(
        "/api/v1/auth/register",
        headers=ORIGIN,
        json={
            "invite_token": response.json()["invite_token"],
            "username": "runtime-member",
            "password": PASSWORD,
            "display_name": "합성 구성원",
        },
    )
    assert registered.status_code == 200


@pytest.mark.parametrize(
    "condition", ["demoted", "expired", "inactive_membership", "inactive_account"]
)
def test_inviter_must_still_be_authorized_at_redemption(database, condition):  # noqa: F811
    from family_ledger.auth import AuthError

    migrate(database, app_role="family_ledger_test_app")
    seed(database)
    now = datetime.now(UTC)
    actor = bootstrap_admin(
        database, "owner", PASSWORD, valid_to=now + timedelta(days=1)
    )
    auth = LocalAuth(database)
    token, _ = auth.invite(actor, FAMILY, datetime.now(UTC))
    effective = datetime.now(UTC)
    with auth.connect() as conn:
        if condition == "demoted":
            conn.execute(
                "INSERT INTO role_assignment_end(assignment_id,family_id,ended_at) SELECT id,family_id,%s FROM role_assignment WHERE user_id=%s",
                (effective, actor),
            )
            conn.execute(
                "INSERT INTO role_assignment(family_id,user_id,role,valid_from,valid_to) VALUES (%s,%s,'member',%s,NULL)",
                (FAMILY, actor, effective),
            )
        elif condition == "inactive_membership":
            conn.execute(
                "UPDATE membership SET active=false WHERE user_id=%s", (actor,)
            )
        elif condition == "inactive_account":
            conn.execute("UPDATE account SET active=false WHERE id=%s", (actor,))
        else:
            effective = now + timedelta(days=2)
    with pytest.raises(AuthError) as denied:
        auth.invite(actor, FAMILY, effective)
    assert denied.value.status == 403
    browser = client(database)
    browser.app.state.clock = lambda: effective
    result = browser.post(
        "/api/v1/auth/register",
        headers=ORIGIN,
        json={
            "invite_token": token,
            "username": "new-member",
            "password": PASSWORD,
            "display_name": "합성 구성원",
        },
    )
    assert result.status_code == 400
    with auth.connect() as conn:
        assert (
            conn.execute("SELECT count(*) AS total FROM account").fetchone()["total"]
            == 1
        )
        assert (
            conn.execute("SELECT used_at FROM invitation").fetchone()["used_at"] is None
        )


@pytest.mark.parametrize("inactive", ["membership", "account"])
def test_logout_revokes_even_after_access_removed(accounts, inactive):
    browser = client(accounts)
    session = login(browser).json()
    token = browser.cookies.get("family_session")
    auth = LocalAuth(accounts)
    with auth.connect() as conn:
        if inactive == "membership":
            conn.execute(
                "UPDATE membership SET active=false WHERE user_id=%s",
                (session["user"]["id"],),
            )
        else:
            conn.execute(
                "UPDATE account SET active=false WHERE id=%s", (session["user"]["id"],)
            )
    assert browser.delete("/api/v1/session", headers=ORIGIN).status_code == 403
    headers = {**ORIGIN, "X-CSRF-Token": session["csrf_token"]}
    assert browser.delete("/api/v1/session", headers=headers).status_code == 204
    assert browser.cookies.get("family_session") is None
    assert auth.session(token, datetime.now(UTC), require_active=False) is None
    assert browser.delete("/api/v1/session", headers=ORIGIN).status_code == 204
