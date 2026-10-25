from datetime import datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg
from test_auth import accounts  # noqa: F401
from test_expenses import BASE, body, financial_key, policy, setup  # noqa: F401
from test_postgres import database  # noqa: F401

from family_ledger.domain import FAMILY


def test_admin_approval_notice_and_treasurer_payment(accounts):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    policy(accounts)
    item = member.post(BASE, headers=mh, json=body(member, mh)).json()
    payload = {
        "paid_on": datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat(),
        "note": "Synthetic completion",
        "confirmed": True,
        "operation_id": str(uuid4()),
    }
    target = f"{BASE}/{item['id']}/payment"
    assert member.post(target, headers=mh, json=payload).status_code == 403
    assert admin.post(target, headers=ah, json=payload).status_code == 403
    approved = admin.post(
        f"{BASE}/{item['id']}/decisions",
        headers=ah,
        json={"decision": "approved", "comment": "Synthetic approval"},
    )
    assert approved.status_code == 200
    assert approved.json()["approval_notice"] == "configuration_required"
    uid = member.get("/api/v1/session").json()["user"]["id"]
    with psycopg.connect(accounts) as conn:
        conn.execute(
            "INSERT INTO role_assignment(family_id,user_id,role,valid_from) VALUES (%s,%s,'treasurer',now())",
            (FAMILY, uid),
        )
        before = conn.execute("SELECT count(*) FROM ledger_transaction").fetchone()[0]
    completed = member.post(target, headers=mh, json=payload)
    assert completed.status_code == 200
    assert completed.json()["payment"]["note"] == "Synthetic completion"
    assert completed.json()["status"] == "approved"
    assert member.post(target, headers=mh, json=payload).status_code == 200
    assert (
        member.post(
            target, headers=mh, json={**payload, "operation_id": str(uuid4())}
        ).status_code
        == 409
    )
    with psycopg.connect(accounts) as conn:
        assert conn.execute("SELECT count(*) FROM expense_payment").fetchone()[0] == 1
        assert (
            conn.execute("SELECT count(*) FROM expense_approval_notice").fetchone()[0]
            == 1
        )
        assert (
            conn.execute("SELECT count(*) FROM ledger_transaction").fetchone()[0]
            == before
        )


def test_treasurer_approval_has_no_notice_and_unapproved_cannot_be_paid(accounts):  # noqa: F811
    from family_ledger.domain import FAMILY

    admin, ah, member, mh = setup(accounts)
    policy(accounts)
    uid = admin.get("/api/v1/session").json()["user"]["id"]
    with psycopg.connect(accounts) as conn:
        conn.execute(
            "INSERT INTO role_assignment(family_id,user_id,role,valid_from) VALUES (%s,%s,'treasurer',now())",
            (FAMILY, uid),
        )
    item = member.post(BASE, headers=mh, json=body(member, mh)).json()
    payload = {
        "paid_on": datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat(),
        "note": "",
        "confirmed": True,
        "operation_id": str(uuid4()),
    }
    assert (
        admin.post(f"{BASE}/{item['id']}/payment", headers=ah, json=payload).status_code
        == 409
    )
    response = admin.post(
        f"{BASE}/{item['id']}/decisions",
        headers=ah,
        json={"decision": "approved", "comment": "Treasurer reviewed"},
    )
    assert response.status_code == 200
    assert response.json()["approval_notice"] == "not_required"
    assert (
        admin.post(
            f"{BASE}/{item['id']}/payment",
            headers=ah,
            json={**payload, "confirmed": False},
        ).status_code
        == 422
    )
    with psycopg.connect(accounts) as conn:
        assert (
            conn.execute("SELECT count(*) FROM expense_approval_notice").fetchone()[0]
            == 0
        )
