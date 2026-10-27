from datetime import datetime
from uuid import uuid4

import psycopg
from test_auth import accounts  # noqa: F401
from test_bank_statement import csv_file
from test_documents import ROOT, key, store  # noqa: F401
from test_expenses import setup
from test_postgres import database  # noqa: F401

from family_ledger.documents.statement import KST


def test_dues_policy_payment_reversal_reminder_and_acl(accounts):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    path = ROOT + "/dues"
    month = datetime.now(KST).strftime("%Y-%m")
    uid = member.get("/api/v1/session").json()["user"]["id"]

    def command(kind, **fields):
        return dict(kind=kind, month=month, operation_id=str(uuid4()), **fields)

    assert member.get(path).status_code == 403
    assert (
        member.post(path, headers=mh, json=command("deadline", due_day=25)).status_code
        == 403
    )
    assert admin.get(path + "?month=invalid").status_code == 422
    assert admin.get(path.replace(ROOT.split("/")[4], str(uuid4()))).status_code == 404
    initial = admin.get(path).json()
    assert initial["due_on"] is None
    assert all(m["status"] == "unconfigured" for m in initial["members"])
    assert (
        admin.post(path, headers=ah, json=command("reminder", member_id=uid)).json()[
            "error"
        ]["code"]
        == "POLICY_NOT_CONFIGURED"
    )
    assert admin.post(path, json=command("deadline", due_day=25)).status_code == 403
    assert (
        admin.post(path, headers=ah, json=command("deadline", due_day=31)).status_code
        == 200
    )
    fee = command("fee", member_id=uid, amount_krw="1500")
    assert admin.post(path, headers=ah, json=fee).status_code == 200
    assert admin.post(path, headers=ah, json=fee).status_code == 200
    assert (
        admin.post(path, headers=ah, json={**fee, "amount_krw": "1600"}).status_code
        == 409
    )
    assert (
        admin.post(
            path,
            headers=ah,
            json={**command("deadline", due_day=15), "month": "2000-01"},
        ).status_code
        == 409
    )
    assert (
        store(
            admin, ah, kind="bank", filename="dues.csv", content=csv_file()
        ).status_code
        == 200
    )
    data = admin.get(path).json()
    deposit = data["deposits"][0]["id"]
    payment = command("payment", member_id=uid, transaction_id=deposit)
    paid = admin.post(path, headers=ah, json=payment)
    assert paid.status_code == 200
    assert admin.post(path, headers=ah, json=payment).status_code == 200
    assert (
        admin.post(
            path,
            headers=ah,
            json=command("payment", member_id=uid, transaction_id=deposit),
        ).status_code
        == 409
    )
    data = admin.get(path).json()
    row = next(m for m in data["members"] if m["id"] == uid)
    assert (row["paid_krw"], row["remaining_krw"]) == ("1000", "500")
    reminder = command("reminder", member_id=uid)
    assert "발송되지" in admin.post(path, headers=ah, json=reminder).json()["message"]
    assert admin.post(path, headers=ah, json=reminder).status_code == 200
    assert (
        admin.post(
            path, headers=ah, json=command("reminder", member_id=uid)
        ).status_code
        == 409
    )
    assert (
        admin.post(
            path, headers=ah, json=command("reversal", payment_id=paid.json()["id"])
        ).status_code
        == 200
    )
    row = next(m for m in admin.get(path).json()["members"] if m["id"] == uid)
    assert row["paid_krw"] == "0"
    assert (
        admin.post(
            path,
            headers=ah,
            json=command("payment", member_id=uid, transaction_id=deposit),
        ).status_code
        == 200
    )
    actor = admin.get("/api/v1/session").json()["user"]["id"]
    with psycopg.connect(accounts) as conn:
        conn.execute(
            "INSERT INTO role_assignment_end(assignment_id,family_id,ended_at) SELECT id,family_id,now() FROM role_assignment WHERE user_id=%s",
            (actor,),
        )
    assert admin.get(path).status_code == 403


def test_treasurer_runtime_concurrent_link_and_immutable_history(accounts):  # noqa: F811
    import os
    from concurrent.futures import ThreadPoolExecutor

    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    from family_ledger.auth import AuthError
    from family_ledger.domain import FAMILY
    from family_ledger.dues.models import DuesCommand
    from family_ledger.dues.repository import DuesRepository

    admin, ah, member, mh = setup(accounts)
    path = ROOT + "/dues"
    month = datetime.now(KST).strftime("%Y-%m")
    uid = member.get("/api/v1/session").json()["user"]["id"]

    def body(kind, **fields):
        return dict(kind=kind, month=month, operation_id=str(uuid4()), **fields)

    version = admin.get(ROOT + "/roles").json()["version"]
    assert (
        admin.post(
            ROOT + "/roles",
            headers=ah,
            json={
                "user_id": uid,
                "role": "treasurer",
                "expected_version": version,
                "reason": "synthetic dues test",
            },
        ).status_code
        == 200
    )
    assert member.get(path).status_code == 200
    assert not member.get(path).json()["can_configure"]
    assert (
        member.post(path, headers=mh, json=body("deadline", due_day=20)).status_code
        == 403
    )
    assert (
        admin.post(path, headers=ah, json=body("deadline", due_day=20)).status_code
        == 200
    )
    assert (
        admin.post(
            path, headers=ah, json=body("fee", member_id=uid, amount_krw="500")
        ).status_code
        == 200
    )
    assert (
        store(
            admin, ah, kind="bank", filename="runtime-dues.csv", content=csv_file()
        ).status_code
        == 200
    )
    deposit = member.get(path).json()["deposits"][0]["id"]
    runtime = make_conninfo(
        os.environ["TEST_APP_DATABASE_URL"],
        options=conninfo_to_dict(accounts)["options"],
    )
    repo = DuesRepository(runtime)

    def attempt(_):
        try:
            repo.command(
                FAMILY,
                uid,
                DuesCommand(**body("payment", member_id=uid, transaction_id=deposit)),
                datetime.now(KST),
            )
            return 200
        except AuthError as error:
            return error.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, range(2))) == [200, 409]
    data = repo.overview(FAMILY, uid, month, datetime.now(KST))
    row = next(m for m in data.members if m.id == uid)
    assert row.status == "paid"
    assert row.excess_krw == "500"
    assert row.remaining_krw == "0"
    assert (
        member.post(path, headers=mh, json=body("reminder", member_id=uid)).status_code
        == 409
    )
    with psycopg.connect(runtime) as conn:
        assert (
            conn.execute(
                "SELECT count(*) FROM dues_event WHERE kind='payment'"
            ).fetchone()[0]
            == 1
        )
        try:
            conn.execute("DELETE FROM dues_event")
            raise AssertionError("history must be immutable")
        except psycopg.Error:
            conn.rollback()
