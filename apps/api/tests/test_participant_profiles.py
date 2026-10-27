from uuid import uuid4

from test_auth import accounts  # noqa: F401
from test_documents import ROOT
from test_expenses import setup
from test_postgres import database  # noqa: F401


def test_profile_and_initial_fee_are_atomic_and_history_preserved(accounts):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    month = admin.get(ROOT + "/dues").json()["month"]
    body = {
        "name": "합성 생일 구성원",
        "birthday": {
            "calendar": "lunar",
            "year": 2000,
            "month": 4,
            "day": 30,
            "leap_month": True,
        },
        "amount_krw": "9007199254740993",
        "fee_month": month,
        "operation_id": str(uuid4()),
    }
    path = ROOT + "/participants"
    result = admin.post(path, headers=ah, json=body)
    assert result.status_code == 200
    pid = result.json()["id"]
    assert admin.post(path, headers=ah, json=body).json()["id"] == pid
    row = next(m for m in admin.get(ROOT + "/dues").json()["members"] if m["id"] == pid)
    assert row["birthday"] == body["birthday"] and row["profile_version"] == 1
    assert row["amount_krw"] == body["amount_krw"]
    edit = {
        "name": "수정된 합성 이름",
        "birthday": {"calendar": "solar", "year": 2000, "month": 2, "day": 29},
        "expected_version": 1,
        "operation_id": str(uuid4()),
    }
    assert (
        member.post(path + f"/{pid}/profile", headers=mh, json=edit).status_code == 403
    )
    assert (
        admin.post(
            path + f"/{pid}/profile",
            headers=ah,
            json={**edit, "operation_id": body["operation_id"]},
        ).status_code
        == 409
    )
    assert (
        admin.post(path + f"/{pid}/profile", headers=ah, json=edit).status_code == 200
    )
    assert (
        admin.post(path + f"/{pid}/profile", headers=ah, json=edit).status_code == 200
    )
    assert (
        admin.post(
            path + f"/{pid}/profile",
            headers=ah,
            json={**edit, "operation_id": str(uuid4())},
        ).status_code
        == 409
    )
    row = next(m for m in admin.get(ROOT + "/dues").json()["members"] if m["id"] == pid)
    assert row["name"] == edit["name"] and row["profile_version"] == 2
    assert row["amount_krw"] == body["amount_krw"]
    assert (
        next(
            e
            for e in admin.get(ROOT + "/dues").json()["events"]
            if e["member_id"] == pid
        )["member_name"]
        == edit["name"]
    )
    before = len(admin.get(ROOT + "/dues").json()["members"])
    assert (
        admin.post(
            path,
            headers=ah,
            json={**body, "fee_month": "2000-01", "operation_id": str(uuid4())},
        ).status_code
        == 409
    )
    assert len(admin.get(ROOT + "/dues").json()["members"]) == before
    for birth in [
        {"calendar": "solar", "year": 2000, "month": 2, "day": 30},
        {"calendar": "lunar", "year": 2000, "month": 1, "day": 31},
        {"calendar": "solar", "year": 2000, "month": 1, "day": 1, "leap_month": True},
    ]:
        assert (
            admin.post(
                path,
                headers=ah,
                json={**body, "birthday": birth, "operation_id": str(uuid4())},
            ).status_code
            == 422
        )


def test_treasurer_can_edit_profile_but_cannot_set_initial_fee(accounts):  # noqa: F811
    admin, ah, treasury, th = setup(accounts)
    uid = treasury.get("/api/v1/session").json()["user"]["id"]
    version = admin.get(ROOT + "/roles").json()["version"]
    assert (
        admin.post(
            ROOT + "/roles",
            headers=ah,
            json={
                "user_id": uid,
                "role": "treasurer",
                "expected_version": version,
                "reason": "synthetic",
            },
        ).status_code
        == 200
    )
    body = {
        "name": "합성 구성원",
        "birthday": {"calendar": "solar", "year": 2000, "month": 12, "day": 1},
        "operation_id": str(uuid4()),
    }
    month = admin.get(ROOT + "/dues").json()["month"]
    path = ROOT + "/participants"
    before = len(admin.get(ROOT + "/dues").json()["members"])
    assert (
        treasury.post(
            path, headers=th, json={**body, "amount_krw": "10000", "fee_month": month}
        ).status_code
        == 403
    )
    assert len(admin.get(ROOT + "/dues").json()["members"]) == before
    created = treasury.post(path, headers=th, json=body)
    assert created.status_code == 200
    pid = created.json()["id"]
    edit = {
        "name": "합성 변경",
        "birthday": None,
        "expected_version": 1,
        "operation_id": str(uuid4()),
    }
    assert (
        treasury.post(path + f"/{pid}/profile", headers=th, json=edit).status_code
        == 200
    )
    row = next(m for m in admin.get(ROOT + "/dues").json()["members"] if m["id"] == pid)
    assert row["birthday"] is None and row["amount_krw"] is None
    assert (
        treasury.post(
            path + f"/{uuid4()}/profile",
            headers=th,
            json={**edit, "operation_id": str(uuid4())},
        ).status_code
        == 404
    )


def test_start_date_charges_from_next_month_and_keeps_exact_date(accounts):  # noqa: F811
    from datetime import date

    admin, ah, _, _ = setup(accounts)
    today = date.fromisoformat(admin.get(ROOT + "/dues").json()["today"])
    next_month = date(
        today.year + (today.month == 12), today.month % 12 + 1, 1
    ).strftime("%Y-%m")
    body = {
        "name": "합성 시작일 구성원",
        "fee_start_on": today.isoformat(),
        "amount_krw": "23000",
        "operation_id": str(uuid4()),
    }
    response = admin.post(ROOT + "/participants", headers=ah, json=body)
    assert response.status_code == 200
    pid = response.json()["id"]
    current = next(
        m for m in admin.get(ROOT + "/dues").json()["members"] if m["id"] == pid
    )
    assert current["amount_krw"] is None
    future = admin.get(ROOT + "/dues?month=" + next_month).json()
    row = next(m for m in future["members"] if m["id"] == pid)
    assert row["amount_krw"] == "23000"
    event = next(e for e in future["events"] if e["member_id"] == pid)
    assert event["starts_on"] == today.isoformat() and event["month"] == next_month
    invalid = {
        "kind": "fee",
        "month": today.strftime("%Y-%m"),
        "starts_on": today.isoformat(),
        "member_id": pid,
        "amount_krw": "10000",
        "operation_id": str(uuid4()),
    }
    assert admin.post(ROOT + "/dues", headers=ah, json=invalid).status_code == 422


def test_fee_date_rollover_and_first_day():
    from datetime import date

    from family_ledger.dues.models import first_fee_month

    assert first_fee_month(date(2026, 12, 31)) == "2027-01"
    assert first_fee_month(date(2026, 10, 1)) == "2026-11"
    assert first_fee_month(date(2028, 2, 29)) == "2028-03"


def test_birth_year_and_legacy_birthday(accounts):  # noqa: F811
    import pytest
    from pydantic import ValidationError

    from family_ledger.dues.models import Birthday

    assert Birthday(calendar="solar", month=2, day=29).year is None
    with pytest.raises(ValidationError):
        Birthday(calendar="solar", year=1999, month=2, day=29)
    admin, ah, _, _ = setup(accounts)
    today = admin.get(ROOT + "/dues").json()["today"]
    year = int(today[:4])
    path = ROOT + "/participants"
    for birth_year, code in [(2000, 200), (year + 1, 422)]:
        body = {
            "name": "합성 출생연도",
            "birthday": {"calendar": "solar", "year": birth_year, "month": 1, "day": 1},
            "operation_id": str(uuid4()),
        }
        response = admin.post(path, headers=ah, json=body)
        assert response.status_code == code
        if code == 200:
            row = next(
                m
                for m in admin.get(ROOT + "/dues").json()["members"]
                if m["id"] == response.json()["id"]
            )
            assert row["birthday"]["year"] == 2000
    assert (
        admin.post(
            path,
            headers=ah,
            json={
                "name": "합성 미등록 연도",
                "birthday": {"calendar": "solar", "month": 1, "day": 1},
                "operation_id": str(uuid4()),
            },
        ).status_code
        == 422
    )


def test_profile_fee_update_atomic_and_admin_only(accounts):  # noqa: F811
    admin, ah, treasury, th = setup(accounts)
    uid = treasury.get("/api/v1/session").json()["user"]["id"]
    version = admin.get(ROOT + "/roles").json()["version"]
    assert (
        admin.post(
            ROOT + "/roles",
            headers=ah,
            json={
                "user_id": uid,
                "role": "treasurer",
                "expected_version": version,
                "reason": "synthetic",
            },
        ).status_code
        == 200
    )
    view = admin.get(ROOT + "/dues").json()
    pid = admin.post(
        ROOT + "/participants",
        headers=ah,
        json={"name": "합성 통합 관리", "operation_id": str(uuid4())},
    ).json()["id"]
    path = ROOT + f"/participants/{pid}/profile"
    body = {
        "name": "합성 통합 변경",
        "birthday": None,
        "expected_version": 1,
        "amount_krw": "25000",
        "fee_start_on": view["today"],
        "operation_id": str(uuid4()),
    }
    assert treasury.post(path, headers=th, json=body).status_code == 403
    assert (
        admin.post(
            path, headers=ah, json={**body, "fee_start_on": "2000-01-01"}
        ).status_code
        == 409
    )
    row = next(m for m in admin.get(ROOT + "/dues").json()["members"] if m["id"] == pid)
    assert row["name"] == "합성 통합 관리" and row["profile_version"] == 1
    assert admin.post(path, headers=ah, json=body).status_code == 200
    assert admin.post(path, headers=ah, json=body).status_code == 200
    view = admin.get(ROOT + "/dues").json()
    row = next(m for m in view["members"] if m["id"] == pid)
    assert (
        row["next_fee_amount_krw"] == "25000"
        and row["next_fee_start_on"] == body["fee_start_on"]
    )
    assert row["profile_version"] == 2
    assert (
        len([e for e in view["events"] if e["kind"] == "fee" and e["member_id"] == pid])
        == 1
    )


def test_rescheduling_pending_fee_preserves_history_without_early_charge(accounts):  # noqa: F811
    from datetime import date

    from family_ledger.dues.models import first_fee_month

    admin, ah, _, _ = setup(accounts)
    today = admin.get(ROOT + "/dues").json()["today"]
    initial = {
        "name": "합성 일정 변경",
        "amount_krw": "20000",
        "fee_start_on": today,
        "operation_id": str(uuid4()),
    }
    pid = admin.post(ROOT + "/participants", headers=ah, json=initial).json()["id"]
    first = first_fee_month(date.fromisoformat(today))
    assert (
        admin.post(
            ROOT + "/dues",
            headers=ah,
            json={
                "kind": "fee",
                "month": first,
                "member_id": pid,
                "amount_krw": "25000",
                "operation_id": str(uuid4()),
            },
        ).status_code
        == 200
    )
    row = next(m for m in admin.get(ROOT + "/dues").json()["members"] if m["id"] == pid)
    first = first_fee_month(date.fromisoformat(today))
    later = first + "-15"
    body = {
        "name": initial["name"],
        "birthday": None,
        "expected_version": 1,
        "amount_krw": "30000",
        "fee_start_on": later,
        "replaces_fee_id": row["next_fee_id"],
        "operation_id": str(uuid4()),
    }
    path = ROOT + f"/participants/{pid}/profile"
    assert admin.post(path, headers=ah, json=body).status_code == 200
    assert admin.post(path, headers=ah, json=body).status_code == 200
    early = admin.get(ROOT + "/dues?month=" + first).json()
    member = next(m for m in early["members"] if m["id"] == pid)
    assert member["amount_krw"] is None and member["next_fee_start_on"] == later
    future = admin.get(
        ROOT + "/dues?month=" + first_fee_month(date.fromisoformat(later))
    ).json()
    assert next(m for m in future["members"] if m["id"] == pid)["amount_krw"] == "30000"
    assert next(e for e in future["events"] if e["id"] == body["replaces_fee_id"])[
        "superseded"
    ]
