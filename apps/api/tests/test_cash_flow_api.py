from datetime import UTC, datetime

from test_auth import accounts  # noqa: F401
from test_bank_statement import csv_file
from test_documents import ROOT, key, store  # noqa: F401
from test_expenses import setup
from test_postgres import database  # noqa: F401


def test_flow_is_authorized_and_uses_today_not_latest_file(accounts):  # noqa: F811
    admin, ah, member, _ = setup(accounts)
    assert (
        store(
            admin, ah, kind="bank", filename="flow.csv", content=csv_file()
        ).status_code
        == 200
    )
    member.app.state.clock = lambda: datetime(2026, 1, 31, 15, 30, tzinfo=UTC)
    monthly = member.get(ROOT + "/dashboard/flow?unit=month")
    assert monthly.status_code == 200
    data = monthly.json()
    assert data["today"] == "2026-02-01"
    assert data["data_mode"] == "bank_import"
    assert len(data["items"]) == 6
    assert data["items"][-2]["income_krw"] == "1000"
    assert data["items"][-2]["expense_krw"] == "300"
    assert data["items"][-2]["balance_krw"] == "1700"
    assert data["items"][-1]["coverage"] == "none"
    assert data["items"][-1]["income_krw"] is None
    weekly = member.get(ROOT + "/dashboard/flow?unit=week").json()
    assert len(weekly["items"]) == 8
    assert weekly["items"][-1]["start_on"] == "2026-01-26"
    assert weekly["items"][-1]["coverage"] == "partial"
    assert weekly["items"][-1]["balance_krw"] is None
    assert member.get(ROOT + "/dashboard/flow?unit=day").status_code == 422
    assert (
        member.get(
            ROOT.replace(ROOT.split("/")[4], "00000000-0000-4000-8000-999999999999")
            + "/dashboard/flow"
        ).status_code
        == 404
    )
    member.cookies.clear()
    assert member.get(ROOT + "/dashboard/flow").status_code == 401
