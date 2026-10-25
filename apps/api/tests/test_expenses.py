import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from uuid import uuid4

import psycopg
import pytest
from cryptography.fernet import Fernet
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from test_auth import ORIGIN, PASSWORD, accounts, client, login  # noqa: F401
from test_postgres import database  # noqa: F401

from family_ledger.domain import FAMILY


@pytest.fixture(autouse=True)
def financial_key(monkeypatch):
    monkeypatch.setenv("FINANCIAL_DATA_KEY", Fernet.generate_key().decode())


BASE = f"/api/v1/families/{FAMILY}/expenses"


def test_runtime_concurrent_decisions_and_role_revocation(accounts):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    policy(accounts)
    item = member.post(BASE, headers=mh, json=body(member, mh)).json()
    actor = admin.get("/api/v1/session").json()["user"]["id"]
    runtime = make_conninfo(
        os.environ["TEST_APP_DATABASE_URL"],
        options=conninfo_to_dict(accounts)["options"],
    )
    from family_ledger.auth import AuthError
    from family_ledger.expenses.models import ExpenseDecisionInput
    from family_ledger.expenses.repository import ExpenseRepository

    repo = ExpenseRepository(runtime)

    def attempt():
        try:
            repo.decide(
                FAMILY,
                actor,
                item["id"],
                ExpenseDecisionInput(decision="approved", comment="동시 승인"),
                datetime.now(UTC),
            )
            return 200
        except AuthError as error:
            return error.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: attempt(), range(2))) == [200, 409]
    second = member.post(BASE, headers=mh, json=body(member, mh)).json()
    with psycopg.connect(accounts) as conn:
        conn.execute(
            "INSERT INTO role_assignment_end(assignment_id,family_id,ended_at) SELECT id,family_id,now() FROM role_assignment WHERE user_id=%s",
            (actor,),
        )
    assert (
        admin.post(
            BASE + "/" + second["id"] + "/decisions",
            headers=ah,
            json={"decision": "rejected", "comment": "권한 상실"},
        ).status_code
        == 403
    )
    with psycopg.connect(accounts) as conn:
        assert conn.execute("SELECT count(*) FROM expense_decision").fetchone()[0] == 1


def setup(accounts):  # noqa: F811
    admin = client(accounts)
    session = login(admin).json()
    ah = {**ORIGIN, "X-CSRF-Token": session["csrf_token"]}
    token = admin.post(f"/api/v1/families/{FAMILY}/invitations", headers=ah).json()[
        "invite_token"
    ]
    member = client(accounts)
    data = member.post(
        "/api/v1/auth/register",
        headers=ORIGIN,
        json={
            "invite_token": token,
            "username": "requester",
            "password": PASSWORD,
            "display_name": "요청자",
        },
    ).json()
    return admin, ah, member, {**ORIGIN, "X-CSRF-Token": data["csrf_token"]}


def body(browser=None, headers=None):
    account_id = "test-placeholder"
    if browser is not None:
        response = browser.post(
            BASE.removesuffix("/expenses") + "/bank-accounts",
            headers=headers,
            json={
                "bank_name": "Synthetic bank",
                "account_holder": "Synthetic holder",
                "account_number": "".join(
                    str(secrets.randbelow(10)) for _ in range(14)
                ),
                "label": "",
                "make_default": True,
            },
        )
        assert response.status_code == 200
        account_id = response.json()["id"]
    return {
        "request_type": "advance",
        "bank_account_id": account_id,
        "evidence_ids": [],
        "amount_krw": "9007199254740993",
        "purpose": "합성 행사 물품",
        "requested_on": "2026-10-30",
        "operation_id": str(uuid4()),
    }


def policy(dsn):
    with psycopg.connect(dsn) as conn:
        conn.execute(
            "INSERT INTO expense_policy VALUES ('test-v1',%s,true,false,%s,'Synthetic test policy')",
            (FAMILY, datetime.now(UTC)),
        )


@pytest.mark.parametrize("decision", ["approved", "rejected"])
def test_treasurer_request_requires_super_admin(accounts, decision):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    policy(accounts)
    requester = member.get("/api/v1/session").json()["user"]["id"]
    token = admin.post(f"/api/v1/families/{FAMILY}/invitations", headers=ah).json()[
        "invite_token"
    ]
    other = client(accounts)
    session = other.post(
        "/api/v1/auth/register",
        headers=ORIGIN,
        json={
            "invite_token": token,
            "username": "other_treasurer",
            "password": PASSWORD,
            "display_name": "Other synthetic treasurer",
        },
    ).json()
    oh = {**ORIGIN, "X-CSRF-Token": session["csrf_token"]}
    with psycopg.connect(accounts) as conn:
        for uid in (requester, session["user"]["id"]):
            conn.execute(
                "INSERT INTO role_assignment(family_id,user_id,role,valid_from) VALUES (%s,%s,'treasurer',now())",
                (FAMILY, uid),
            )
    item = member.post(BASE, headers=mh, json=body(member, mh)).json()
    response = other.post(
        f"{BASE}/{item['id']}/decisions",
        headers=oh,
        json={"decision": decision, "comment": "Not authorized for treasurer request"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "SUPER_ADMIN_REQUIRED"
    assert admin.get(f"{BASE}/{item['id']}").json()["requires_super_admin"] is True
    with psycopg.connect(accounts) as conn:
        conn.execute(
            "INSERT INTO role_assignment_end(assignment_id,family_id,ended_at) SELECT id,family_id,now() FROM role_assignment WHERE user_id=%s AND role='treasurer'",
            (requester,),
        )
    assert (
        other.post(
            f"{BASE}/{item['id']}/decisions",
            headers=oh,
            json={"decision": decision, "comment": "Still requires administrator"},
        ).status_code
        == 403
    )
    assert (
        admin.post(
            f"{BASE}/{item['id']}/decisions",
            headers=ah,
            json={
                "decision": decision,
                "comment": "Administrator reviewed treasurer request",
            },
        ).status_code
        == 200
    )


def test_request_precision_idempotency_and_policy(accounts):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    payload = body(member, mh)
    first = member.post(BASE, headers=mh, json=payload)
    assert first.status_code == 200
    assert first.json()["amount_krw"] == payload["amount_krw"]
    assert (
        member.post(BASE, headers=mh, json=payload).json()["id"] == first.json()["id"]
    )
    changed = {**payload, "purpose": "변경"}
    assert member.post(BASE, headers=mh, json=changed).status_code == 409
    path = BASE + "/" + first.json()["id"] + "/decisions"
    decision = {"decision": "approved", "comment": "확인"}
    assert member.post(path, headers=mh, json=decision).status_code == 403
    blocked = admin.post(path, headers=ah, json=decision)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "POLICY_NOT_CONFIGURED"
    policy(accounts)
    assert admin.post(path, headers=ah, json=decision).json()["status"] == "approved"
    assert admin.post(path, headers=ah, json=decision).status_code == 409
    assert member.get(BASE).json()["items"][0]["actor_name"] == "합성 관리자"
    with psycopg.connect(accounts) as conn:
        assert (
            conn.execute("SELECT count(*) FROM ledger_transaction").fetchone()[0] == 7
        )


def test_privacy_self_approval_csrf_and_validation(accounts):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    policy(accounts)
    item = admin.post(BASE, headers=ah, json=body(admin, ah)).json()
    assert member.get(BASE).json()["items"] == []
    assert member.get(BASE + "/" + item["id"]).status_code == 404
    assert (
        admin.post(
            BASE + "/" + item["id"] + "/decisions",
            headers=ah,
            json={"decision": "approved", "comment": "확인"},
        ).status_code
        == 403
    )
    assert member.post(BASE, headers=ORIGIN, json=body(member, mh)).status_code == 403
    for amount in ("0", "-1", "1.5", "9223372036854775808", 100):
        assert (
            member.post(
                BASE, headers=mh, json={**body(member, mh), "amount_krw": amount}
            ).status_code
            == 422
        )
    assert (
        member.get(
            "/api/v1/families/00000000-0000-4000-8000-000000000002/expenses"
        ).status_code
        == 404
    )
