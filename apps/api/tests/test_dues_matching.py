from datetime import datetime
from uuid import uuid4

from test_auth import accounts  # noqa: F401
from test_bank_statement import csv_file, rows
from test_documents import ROOT, key, store  # noqa: F401
from test_expenses import setup
from test_postgres import database  # noqa: F401

from family_ledger.documents.statement import KST


def statement(month, today, entries):
    data = rows()[:11]
    data[3][5] = f"{month}.01 - {today}"
    data[4][5] = f"{today} 23:59:00"
    balance = 0
    for index, (name, amount, kind) in enumerate(entries):
        balance += amount
        data.append(
            [
                "",
                f"{month}.01 09:00:{index:02}",
                "입금",
                str(amount),
                str(balance),
                kind,
                name,
                "",
            ]
        )
    return csv_file(data)


def test_upload_matches_monthly_dues_once_and_keeps_reversed_links_blocked(accounts):  # noqa: F811
    admin, headers, member, member_headers = setup(accounts)
    today = datetime.now(KST).date()
    month = today.strftime("%Y-%m")
    path = ROOT + "/dues"

    def command(kind, **values):
        return admin.post(
            path,
            headers=headers,
            json=dict(kind=kind, month=month, operation_id=str(uuid4()), **values),
        )

    assert command("deadline", due_day=1).status_code == 200
    ids = []
    for name, amount in [("합성가", "1200"), ("합성나", "1000"), ("합성다", "700")]:
        response = admin.post(
            ROOT + "/participants",
            headers=headers,
            json={
                "name": name,
                "amount_krw": amount,
                "fee_month": month,
                "operation_id": str(uuid4()),
            },
        )
        assert response.status_code == 200
        ids.append(response.json()["id"])
    content = statement(
        month.replace("-", "."),
        today.strftime("%Y.%m.%d"),
        [
            ("합성가", 1000, "이체"),
            ("합성나", 500, "이체"),
            ("합성가", 500, "이체"),
            ("입출금통장 이자", 3, "예금이자"),
        ],
    )
    assert (
        store(
            admin, headers, kind="bank", filename="matching.csv", content=content
        ).status_code
        == 200
    )
    overview = admin.get(path).json()
    a, b, c = [
        next(m for m in overview["members"] if m["id"] == identifier)
        for identifier in ids
    ]
    assert (a["paid_krw"], a["excess_krw"], a["status"]) == ("1500", "300", "paid")
    assert b["paid_krw"] == "500"
    assert c["paid_krw"] == "0"
    assert overview["matching_review_count"] == 0
    assert overview["overdue_count"] == (2 if today.day > 1 else 0)
    assert overview["overdue_krw"] == ("1200" if today.day > 1 else "0")
    auto = [e for e in overview["events"] if e["auto_matched"]]
    assert len(auto) == 3
    assert (
        store(
            admin, headers, kind="bank", filename="matching-copy.csv", content=content
        ).status_code
        == 200
    )
    assert admin.post(path + "/reconcile", headers=headers).status_code == 200
    assert len([e for e in admin.get(path).json()["events"] if e["auto_matched"]]) == 3
    assert member.post(path + "/reconcile", headers=member_headers).status_code == 403
    assert admin.post(path + "/reconcile").status_code == 403
    assert command("reversal", payment_id=auto[0]["id"]).status_code == 200
    assert admin.post(path + "/reconcile", headers=headers).status_code == 200
    overview = admin.get(path).json()
    assert overview["matching_review_count"] == 1
    assert overview["overdue_count"] is None
    assert any(e["reversed"] for e in overview["events"] if e["auto_matched"])


def test_ambiguous_unknown_and_unconfigured_deposits_are_not_guessed(accounts):  # noqa: F811
    admin, headers, _, _ = setup(accounts)
    today = datetime.now(KST).date()
    month = today.strftime("%Y-%m")
    path = ROOT + "/dues"
    for name in ["합성중복", "합성중복", "합성미설정"]:
        assert (
            admin.post(
                ROOT + "/participants",
                headers=headers,
                json={"name": name, "operation_id": str(uuid4())},
            ).status_code
            == 200
        )
    content = statement(
        month.replace("-", "."),
        today.strftime("%Y.%m.%d"),
        [
            ("합성중복", 1000, "이체"),
            ("다른이름", 1000, "이체"),
            ("합성미설정", 1000, "이체"),
        ],
    )
    assert (
        store(
            admin, headers, kind="bank", filename="review.csv", content=content
        ).status_code
        == 200
    )
    data = admin.get(path).json()
    assert data["matching_review_count"] == 3
    assert data["overdue_krw"] is None
    assert {d["reason"] for d in data["review_deposits"]} == {
        "ambiguous_name",
        "name_mismatch",
        "policy_not_configured",
    }
    assert not any(e["kind"] == "payment" for e in data["events"])


def test_existing_import_backfills_when_policy_is_set_and_keeps_month_boundary(
    accounts,  # noqa: F811
):
    from concurrent.futures import ThreadPoolExecutor
    from datetime import timedelta

    from family_ledger.dues.matching import reconcile
    from family_ledger.dues.repository import DuesRepository

    admin, headers, _, _ = setup(accounts)
    today = datetime.now(KST).date()
    first = today.replace(day=1)
    previous = first - timedelta(days=1)
    month = first.strftime("%Y-%m")
    data = rows()[:11]
    data[3][5] = f"{previous:%Y.%m.%d} - {today:%Y.%m.%d}"
    data[4][5] = f"{today:%Y.%m.%d} 23:59:00"
    data += [
        [
            "",
            f"{previous:%Y.%m.%d} 23:59:59",
            "입금",
            "700",
            "700",
            "이체",
            "합성경계",
            "",
        ],
        [
            "",
            f"{first:%Y.%m.%d} 00:00:00",
            "입금",
            "1100",
            "1800",
            "이체",
            "합성경계",
            "",
        ],
    ]
    assert (
        store(
            admin, headers, kind="bank", filename="boundary.csv", content=csv_file(data)
        ).status_code
        == 200
    )
    participant = admin.post(
        ROOT + "/participants",
        headers=headers,
        json={
            "name": "합성경계",
            "amount_krw": "1000",
            "fee_month": month,
            "operation_id": str(uuid4()),
        },
    )
    assert participant.status_code == 200
    path = ROOT + "/dues"
    assert not any(e["kind"] == "payment" for e in admin.get(path).json()["events"])
    assert (
        admin.post(
            path,
            headers=headers,
            json={
                "kind": "deadline",
                "month": month,
                "due_day": 1,
                "operation_id": str(uuid4()),
            },
        ).status_code
        == 200
    )
    uid = participant.json()["id"]
    view = admin.get(path).json()
    matched = next(m for m in view["members"] if m["id"] == uid)
    assert (matched["paid_krw"], matched["excess_krw"]) == ("1100", "100")
    before = admin.get(path + "?month=" + previous.strftime("%Y-%m")).json()
    assert next(m for m in before["members"] if m["id"] == uid)["paid_krw"] == "0"
    actor = admin.get("/api/v1/session").json()["user"]["id"]
    family = admin.get("/api/v1/session").json()["family_id"]
    repository = DuesRepository(accounts)

    def again(_):
        with repository.connect() as conn:
            repository.lock(conn, family)
            return reconcile(conn, family, actor, datetime.now(KST))

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(again, range(2))) == [0, 0]
    assert len([e for e in admin.get(path).json()["events"] if e["auto_matched"]]) == 1


def test_unconfigured_family_never_reports_zero_actual_arrears(accounts):  # noqa: F811
    admin, headers, _, _ = setup(accounts)
    today = datetime.now(KST).date()
    month = today.strftime("%Y-%m")
    path = ROOT + "/dues"
    assert admin.post(path, headers=headers, json={"kind":"deadline","month":month,"due_day":1,"operation_id":str(uuid4())}).status_code == 200
    content = statement(month.replace("-","."),today.strftime("%Y.%m.%d"),[("입출금통장 이자",3,"예금이자")])
    assert store(admin,headers,kind="bank",filename="interest-only.csv",content=content).status_code == 200
    data=admin.get(path).json()
    assert data["coverage_complete"]
    assert data["matching_review_count"] == 0
    assert data["overdue_count"] is None
    assert data["overdue_krw"] is None
