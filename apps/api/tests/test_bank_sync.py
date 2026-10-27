import os
from uuid import uuid4

import psycopg
import pytest
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from test_auth import accounts  # noqa: F401
from test_bank_statement import csv_file, rows, xlsx_file
from test_documents import BASE, ROOT, key, store  # noqa: F401
from test_expenses import setup
from test_postgres import database  # noqa: F401


def test_upload_sync_overlap_review_permissions_and_actual_listing(accounts):  # noqa: F811
    runtime = make_conninfo(
        os.environ["TEST_APP_DATABASE_URL"],
        options=conninfo_to_dict(accounts)["options"],
    )
    admin, ah, member, mh = setup(runtime)
    operation = str(uuid4())
    options = {
        "kind": "bank",
        "filename": "synthetic.xlsx",
        "content": xlsx_file(),
        "operation_id": operation,
    }
    assert store(member, mh, **options).status_code == 403
    result = store(admin, ah, **options)
    assert result.status_code == 200, result.text
    document = result.json()
    assert document["sync"]["status"] == "synced"
    assert document["sync"]["added"] == 2
    assert document["sync"]["period_start"] == "2026-01-01"
    assert store(admin, ah, **options).json() == document
    duplicate = store(admin, ah, **{**options, "operation_id": str(uuid4())}).json()
    assert duplicate["sync"]["added"] == 0
    assert duplicate["sync"]["duplicates"] == 2
    values = rows() + [
        ["", "2026.01.08 11:00:00", "입금", "100", "1800", "이체", "추가 합성 입금", ""]
    ]
    added = store(
        admin, ah, kind="bank", filename="synthetic.csv", content=csv_file(values)
    ).json()
    assert added["sync"]["added"] == 1
    assert added["sync"]["duplicates"] == 2
    conflict = store(admin, ah, **{**options, "operation_id": str(uuid4())}).json()
    assert conflict["sync"]["status"] == "needs_review"
    assert conflict["sync"]["added"] == 0
    actual = admin.get(ROOT + "/transactions").json()
    assert actual["data_mode"] == "bank_import"
    assert actual["total"] == 3
    assert actual["items"][0]["balance_after_krw"] == "1800"
    assert actual["items"][0]["source_document_id"] == added["id"]
    assert actual["items"][0]["reconciliation_status"] == "pending"
    assert (
        member.get(ROOT + "/transactions").json()["items"][0]["source_document_id"]
        is None
    )
    filtered = admin.get(
        ROOT + "/transactions",
        params={
            "direction": "expense",
            "start_on": "2026-01-05",
            "end_on": "2026-01-05",
        },
    ).json()
    assert len(filtered["items"]) == 1
    assert filtered["items"][0]["amount_krw"] == "-300"
    assert (
        admin.get(
            ROOT + "/transactions",
            params={"start_on": "2026-02-01", "end_on": "2026-01-01"},
        ).status_code
        == 422
    )
    sync_url = f"{BASE}/{document['id']}/sync"
    assert member.post(sync_url, headers=mh).status_code == 403
    assert admin.post(sync_url).status_code == 403
    assert admin.post(sync_url, headers=ah).json()["sync"] == document["sync"]
    assert admin.get(BASE).json()["items"][0]["sync"] is not None
    with psycopg.connect(runtime) as conn:
        assert (
            conn.execute("SELECT count(*) FROM imported_bank_transaction").fetchone()[0]
            == 3
        )
        assert (
            conn.execute("SELECT count(*) FROM bank_statement_row").fetchone()[0] == 7
        )
    with pytest.raises(psycopg.Error), psycopg.connect(runtime) as conn:
        conn.execute("DELETE FROM imported_bank_transaction")


def test_empty_statement_is_real_empty_and_bad_account_not_imported(accounts):  # noqa: F811
    admin, ah, _, _ = setup(accounts)
    result = store(
        admin, ah, kind="bank", filename="empty.csv", content=csv_file(rows()[:-2])
    ).json()
    assert result["sync"]["status"] == "synced"
    assert result["sync"]["transaction_start"] is None
    assert admin.get(ROOT + "/transactions").json()["items"] == []

    assert admin.get(ROOT + "/transactions").json()["data_mode"] == "bank_import"
    values = rows()
    values[4][2] = "****-**-***9999"
    result = store(
        admin, ah, kind="bank", filename="other.csv", content=csv_file(values)
    ).json()
    assert result["sync"]["status"] == "needs_review"
    assert admin.get(ROOT + "/transactions").json()["items"] == []


def test_contiguous_period_balance_boundary(accounts):  # noqa: F811
    admin, ah, _, _ = setup(accounts)
    assert (
        store(admin, ah, kind="bank", filename="jan.csv", content=csv_file()).json()[
            "sync"
        ]["status"]
        == "synced"
    )
    values = rows()[:-2]
    values[3][-1] = "2026.02.01 - 2026.02.28"
    values[4][-1] = "2026.03.01 09:00:00"
    values.append(
        ["", "2026.02.05 09:00:00", "입금", "100", "9000", "이체", "합성 경계 검증", ""]
    )
    result = store(
        admin, ah, kind="bank", filename="feb.csv", content=csv_file(values)
    ).json()
    assert result["sync"]["status"] == "needs_review"
    values[-1][4] = "1800"
    result = store(
        admin, ah, kind="bank", filename="feb-fixed.csv", content=csv_file(values)
    ).json()
    assert result["sync"]["status"] == "synced"


def test_new_transaction_at_existing_second_needs_review(accounts):  # noqa: F811
    admin, ah, _, _ = setup(accounts)
    assert (
        store(admin, ah, kind="bank", filename="first.csv", content=csv_file()).json()[
            "sync"
        ]["status"]
        == "synced"
    )
    values = rows() + [
        [
            "",
            "2026.01.05 10:00:00",
            "입금",
            "100",
            "1800",
            "이체",
            "같은 초 추가 거래",
            "",
        ]
    ]
    result = store(
        admin, ah, kind="bank", filename="second.csv", content=csv_file(values)
    ).json()
    assert result["sync"]["status"] == "needs_review"
    assert admin.get(ROOT + "/transactions").json()["total"] == 2
