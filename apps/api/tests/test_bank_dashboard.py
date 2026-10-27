from test_auth import accounts  # noqa: F401
from test_bank_statement import csv_file, rows
from test_documents import ROOT, key, store  # noqa: F401
from test_expenses import setup
from test_postgres import database  # noqa: F401


def test_dashboard_uses_imports_and_latest_coverage_not_upload_order(accounts):  # noqa: F811
    admin, ah, member, _ = setup(accounts)
    assert (
        store(admin, ah, kind="bank", filename="jan.csv", content=csv_file()).json()[
            "sync"
        ]["status"]
        == "synced"
    )
    dashboard = member.get(ROOT + "/dashboard").json()
    assert dashboard["data_mode"] == "bank_import"
    assert dashboard["balance_krw"] == "1700"
    assert dashboard["income_krw"] == "1000"
    assert dashboard["expense_krw"] == "300"
    assert dashboard["net_krw"] == "700"
    assert dashboard["summary_start"] == "2026-01-01"
    assert dashboard["summary_end"] == "2026-01-31"
    assert dashboard["approved_commitments_krw"] == "0"
    assert dashboard["recent_transactions"][0]["description"] == "합성 출금"
    assert all(
        t["source_document_id"] is None for t in dashboard["recent_transactions"]
    )
    empty = rows()[:-2]
    empty[3][-1] = "2026.02.01 - 2026.02.28"
    empty[4][-1] = "2026.03.01 09:00:00"
    assert (
        store(
            admin, ah, kind="bank", filename="feb.csv", content=csv_file(empty)
        ).json()["sync"]["status"]
        == "synced"
    )
    store(admin, ah, kind="bank", filename="old.csv", content=csv_file())
    latest = member.get(ROOT + "/dashboard").json()
    assert latest["summary_end"] == "2026-02-28"
    assert latest["income_krw"] == "0"
    assert latest["balance_krw"] == "1700"
    assert latest["balance_as_of"].startswith("2026-01-05")
    assert len(latest["recent_transactions"]) == 2
    assert latest["monthly"] == []
    quarter = member.get(ROOT + "/dashboard?period=quarter").json()
    assert quarter["summary_start"] == "2025-12-01"
    assert quarter["coverage"] == ["2026-01-01 ~ 2026-02-28"]
    assert [row["month"] for row in quarter["monthly"]] == ["2026-01"]
    assert (
        member.get(
            ROOT.replace(ROOT.split("/")[4], "00000000-0000-4000-8000-999999999999")
            + "/dashboard"
        ).status_code
        == 404
    )


def test_empty_import_is_unknown_balance_and_exact_large_amounts(accounts):  # noqa: F811
    admin, ah, _, _ = setup(accounts)
    store(admin, ah, kind="bank", filename="empty.csv", content=csv_file(rows()[:-2]))
    empty = admin.get(ROOT + "/dashboard").json()
    assert empty["data_mode"] == "bank_import"
    assert empty["balance_krw"] is None
    assert empty["balance_as_of"] is None
    values = rows()
    values[-2][3:5] = ["9007199254740993", "9007199254740993"]
    values[-1][4] = "9007199254740693"
    store(admin, ah, kind="bank", filename="large.csv", content=csv_file(values))
    result = admin.get(ROOT + "/dashboard").json()
    assert result["income_krw"] == "9007199254740993"
    assert result["balance_krw"] == "9007199254740693"


def test_commitments_keep_bank_balance(accounts):  # noqa: F811
    from datetime import datetime
    from uuid import uuid4
    from zoneinfo import ZoneInfo

    import psycopg
    from test_expenses import BASE, body, policy

    from family_ledger.domain import FAMILY

    admin, ah, member, mh = setup(accounts)
    policy(accounts)
    store(admin, ah, kind="bank", filename="jan.csv", content=csv_file())
    item = member.post(BASE, headers=mh, json=body(member, mh)).json()
    assert (
        admin.post(
            f"{BASE}/{item['id']}/decisions",
            headers=ah,
            json={"decision": "approved", "comment": "Synthetic"},
        ).status_code
        == 200
    )
    pending = admin.get(ROOT + "/dashboard").json()
    assert pending["approved_commitments_krw"] == item["amount_krw"]
    assert pending["balance_krw"] == "1700"
    uid = member.get("/api/v1/session").json()["user"]["id"]
    with psycopg.connect(accounts) as conn:
        conn.execute(
            "INSERT INTO role_assignment(family_id,user_id,role,valid_from) VALUES (%s,%s,'treasurer',now())",
            (FAMILY, uid),
        )
    paid = member.post(
        f"{BASE}/{item['id']}/payment",
        headers=mh,
        json={
            "paid_on": datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat(),
            "note": "Synthetic",
            "confirmed": True,
            "operation_id": str(uuid4()),
        },
    )
    assert paid.status_code == 200
    settled = admin.get(ROOT + "/dashboard").json()
    assert settled["approved_commitments_krw"] == "0"
    assert settled["balance_krw"] == "1700"


def test_transaction_totals_span_pages_and_follow_filters(accounts):  # noqa: F811
    admin, ah, member, _ = setup(accounts)
    values = rows()
    values[-2][3:5] = ['9007199254740993', '9007199254740993']
    values[-1][4] = '9007199254740693'
    store(admin, ah, kind='bank', filename='totals.csv', content=csv_file(values))
    pages = [member.get(ROOT + '/transactions', params={'limit':1,'offset':offset}).json() for offset in (0,1)]
    for page in pages:
        assert page['total'] == 2 and len(page['items']) == 1
        assert page['income_krw'] == '9007199254740993'
        assert page['expense_krw'] == '300'
        assert page['net_krw'] == '9007199254740693'
        assert page['limit'] == 1
    assert pages[0]['items'][0]['id'] != pages[1]['items'][0]['id']
    out = member.get(ROOT + '/transactions', params={'direction':'expense','limit':100}).json()
    assert out['total'] == 1
    assert (out['income_krw'],out['expense_krw'],out['net_krw']) == ('0','300','-300')
    empty = member.get(ROOT + '/transactions', params={'start_on':'2027-01-01'}).json()
    assert empty['total'] == 0
    assert (empty['income_krw'],empty['expense_krw'],empty['net_krw']) == ('0','0','0')
    for size in (0,101):
        assert member.get(ROOT + '/transactions', params={'limit':size}).status_code == 422
