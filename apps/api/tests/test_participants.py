from uuid import uuid4

from test_auth import accounts  # noqa: F401
from test_bank_statement import csv_file
from test_documents import ROOT, key, store  # noqa: F401
from test_expenses import setup
from test_postgres import database  # noqa: F401


def test_offline_member_can_join_later_without_duplicate_dues(accounts):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    path = ROOT + "/participants"
    body = {"name": "계정 없는 합성 구성원", "operation_id": str(uuid4())}
    assert member.post(path, headers=mh, json=body).status_code == 403
    result = admin.post(path, headers=ah, json=body)
    assert result.status_code == 200
    pid = result.json()["id"]
    assert admin.post(path, headers=ah, json=body).json()["id"] == pid
    overview = admin.get(ROOT + "/dues").json()
    row = next(m for m in overview["members"] if m["id"] == pid)
    assert not row["has_account"]
    month = overview["month"]
    fee = {
        "kind": "fee",
        "operation_id": str(uuid4()),
        "month": month,
        "member_id": pid,
        "amount_krw": "20000",
    }
    assert admin.post(ROOT + "/dues", headers=ah, json=fee).status_code == 200
    assert (
        admin.post(
            ROOT + "/dues",
            headers=ah,
            json={
                "kind": "deadline",
                "operation_id": str(uuid4()),
                "month": month,
                "due_day": 25,
            },
        ).status_code
        == 200
    )
    assert (
        store(
            admin, ah, kind="bank", filename="participant.csv", content=csv_file()
        ).status_code
        == 200
    )
    deposit = admin.get(ROOT + "/dues").json()["deposits"][0]["id"]
    assert (
        admin.post(
            ROOT + "/dues",
            headers=ah,
            json={
                "kind": "payment",
                "operation_id": str(uuid4()),
                "month": month,
                "member_id": pid,
                "transaction_id": deposit,
            },
        ).status_code
        == 200
    )
    invitation = admin.post(path + f"/{pid}/invite", headers=ah)
    assert invitation.status_code == 200
    before = len(overview["members"])
    from test_auth import ORIGIN, PASSWORD, client

    newcomer = client(accounts)
    result = newcomer.post(
        "/api/v1/auth/register",
        headers=ORIGIN,
        json={
            "invite_token": invitation.json()["invite_token"],
            "username": "offline_joined",
            "password": PASSWORD,
            "display_name": "가입 이름",
        },
    )
    assert result.status_code == 200
    assert result.json()["user"]["id"] == pid
    overview = admin.get(ROOT + "/dues").json()
    assert len(overview["members"]) == before
    row = next(m for m in overview["members"] if m["id"] == pid)
    assert row["has_account"] and row["amount_krw"] == "20000"
    assert row["name"] == body["name"]
    assert row["paid_krw"] == "1000" and row["remaining_krw"] == "19000"
    assert admin.post(path + f"/{pid}/invite", headers=ah).status_code == 409


def test_treasurer_registers_but_cannot_grant_account(accounts):  # noqa: F811
    admin, ah, treasury, th = setup(accounts)
    uid = treasury.get("/api/v1/session").json()["user"]["id"]
    version = admin.get(ROOT + "/roles").json()["version"]
    response = admin.post(
        ROOT + "/roles",
        headers=ah,
        json={
            "user_id": uid,
            "role": "treasurer",
            "expected_version": version,
            "reason": "synthetic participant test",
        },
    )
    assert response.status_code == 200
    body = {"name": "오프라인 참여자", "operation_id": str(uuid4())}
    result = treasury.post(ROOT + "/participants", headers=th, json=body)
    assert result.status_code == 200
    pid = result.json()["id"]
    assert (
        treasury.post(ROOT + f"/participants/{pid}/invite", headers=th).status_code
        == 403
    )
    assert (
        treasury.post(
            ROOT + "/participants", headers=th, json={**body, "name": "다른 이름"}
        ).status_code
        == 409
    )
    wrong = ROOT.replace(ROOT.split("/")[4], str(uuid4()))
    assert (
        treasury.post(wrong + "/participants", headers=th, json=body).status_code == 404
    )
    assert (
        admin.post(ROOT + f"/participants/{uuid4()}/invite", headers=ah).status_code
        == 404
    )


def test_migration_preserves_existing_dues(database, tmp_path, monkeypatch):  # noqa: F811
    import shutil

    import psycopg

    from family_ledger import postgres
    from family_ledger.auth import bootstrap_admin
    from family_ledger.domain import FAMILY

    original = postgres.MIGRATIONS
    old = tmp_path / "migrations"
    old.mkdir()
    for file in original.glob("*.sql"):
        if file.name < "010":
            shutil.copyfile(file, old / file.name)
    monkeypatch.setattr(postgres, "MIGRATIONS", old)
    postgres.migrate(database, app_role="family_ledger_test_app")
    postgres.seed(database)
    uid = bootstrap_admin(
        database, "migration_owner", "synthetic-password-1234", "기존 합성 구성원"
    )
    with psycopg.connect(database) as conn:
        conn.execute(
            "INSERT INTO dues_event(id,family_id,actor_id,kind,month,member_id,amount_krw,operation_id,payload,created_at) VALUES (%s,%s,%s,'fee','2026-10-01',%s,12345,%s,'{}',now())",
            (str(uuid4()), FAMILY, uid, uid, str(uuid4())),
        )
        before = conn.execute("SELECT sequence,id,family_id,actor_id,kind,month,member_id,amount_krw,due_day,transaction_id,payment_id,operation_id,payload,created_at FROM dues_event ORDER BY sequence").fetchall()
    monkeypatch.setattr(postgres, "MIGRATIONS", original)
    postgres.migrate(database, app_role="family_ledger_test_app")
    with psycopg.connect(database) as conn:
        assert (
            conn.execute("SELECT sequence,id,family_id,actor_id,kind,month,member_id,amount_krw,due_day,transaction_id,payment_id,operation_id,payload,created_at FROM dues_event ORDER BY sequence").fetchall()
            == before
        )
        assert conn.execute(
            "SELECT id FROM family_participant WHERE family_id=%s", (FAMILY,)
        ).fetchall() == [(uid,)]
