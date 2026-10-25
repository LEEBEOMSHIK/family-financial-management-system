import io
import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import psycopg
import pytest
from cryptography.fernet import Fernet
from PIL import Image
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from test_auth import accounts  # noqa: F401
from test_expenses import BASE, body, policy, setup
from test_postgres import database  # noqa: F401

ROOT = BASE.removesuffix("/expenses")


@pytest.fixture(autouse=True)
def encryption(monkeypatch):
    monkeypatch.setenv("FINANCIAL_DATA_KEY", Fernet.generate_key().decode())


def bank(browser, headers):
    number = "".join(str(secrets.randbelow(10)) for _ in range(14))
    result = browser.post(
        ROOT + "/bank-accounts",
        headers=headers,
        json={
            "bank_name": "합성 은행",
            "account_number": number,
            "account_holder": "합성 수취인",
            "label": "테스트",
            "make_default": True,
        },
    )
    assert result.status_code == 200
    assert number not in result.text
    return result.json(), number


def upload(browser, headers):
    stream = io.BytesIO()
    Image.new("RGB", (10, 10), "white").save(stream, "PNG")
    result = browser.post(
        ROOT + "/evidence",
        headers={**headers, "Content-Type": "image/png"},
        content=stream.getvalue(),
    )
    assert result.status_code == 200
    return result.json()


def test_account_privacy_default_and_audit(accounts):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    item, number = bank(member, mh)
    assert admin.get(ROOT + "/bank-accounts").json()["items"] == []
    assert (
        admin.post(
            ROOT + "/bank-accounts/" + item["id"] + "/reveal", headers=ah, json={}
        ).status_code
        == 404
    )
    revealed = member.post(
        ROOT + "/bank-accounts/" + item["id"] + "/reveal", headers=mh, json={}
    )
    assert revealed.json()["account_number"] == number
    assert "no-store" in revealed.headers["cache-control"]


def test_receipt_acl_and_advance_snapshot(accounts):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    account, _ = bank(member, mh)
    receipt = upload(member, mh)
    preview = ROOT + "/evidence/" + receipt["id"] + "/preview"
    assert admin.get(preview).status_code == 404
    payload = {
        **body(),
        "request_type": "reimbursement",
        "bank_account_id": account["id"],
        "evidence_ids": [],
    }
    payload.pop("payee_name", None)
    assert member.post(BASE, headers=mh, json=payload).status_code == 422
    payload["request_type"] = "advance"
    item = member.post(BASE, headers=mh, json=payload).json()
    assert item["bank_account"]["id"] == account["id"]
    second, _ = bank(member, mh)
    assert second["id"] != account["id"]
    assert (
        member.get(BASE + "/" + item["id"]).json()["bank_account"]["id"]
        == account["id"]
    )
    policy(accounts)
    decision = admin.post(
        BASE + "/" + item["id"] + "/decisions",
        headers=ah,
        json={"decision": "approved", "comment": "합성 검증"},
    )
    assert decision.status_code == 200
    attached = member.post(
        BASE + "/" + item["id"] + "/evidence",
        headers=mh,
        json={"evidence_ids": [receipt["id"]]},
    )
    assert attached.status_code == 200
    assert attached.json()["decision_evidence_ids"] == []
    assert admin.get(preview).status_code == 200
    assert (
        member.post(
            BASE + "/" + item["id"] + "/evidence",
            headers=mh,
            json={"evidence_ids": [receipt["id"]]},
        ).status_code
        == 409
    )


def test_upload_rejection_and_key_missing(accounts, monkeypatch):  # noqa: F811
    _, _, member, mh = setup(accounts)
    for content in (b"not an image", b"x" * (6 * 1024 * 1024 + 1)):
        result = member.post(
            ROOT + "/evidence",
            headers={**mh, "Content-Type": "image/png"},
            content=content,
        )
        assert result.status_code in (413, 422)
    monkeypatch.delenv("FINANCIAL_DATA_KEY")
    stream = io.BytesIO()
    Image.new("RGB", (2, 2)).save(stream, "PNG")
    assert (
        member.post(
            ROOT + "/evidence",
            headers={**mh, "Content-Type": "image/png"},
            content=stream.getvalue(),
        ).status_code
        == 503
    )


def test_runtime_ciphertext_immutable_and_reveal_revocation(accounts):  # noqa: F811
    runtime = make_conninfo(
        os.environ["TEST_APP_DATABASE_URL"],
        options=conninfo_to_dict(accounts)["options"],
    )
    admin, ah, member, mh = setup(runtime)
    item, number = bank(member, mh)
    receipt = upload(member, mh)
    payload = {
        **body(),
        "bank_account_id": item["id"],
        "request_type": "reimbursement",
        "evidence_ids": [receipt["id"]],
    }
    expense = member.post(BASE, headers=mh, json=payload).json()
    reveal = BASE + "/" + expense["id"] + "/payee-account"
    assert admin.post(reveal, headers=ah, json={}).json()["account_number"] == number
    assert admin.post(reveal, headers={}, json={}).status_code == 403
    with psycopg.connect(accounts) as conn:
        encrypted = conn.execute("SELECT number_cipher FROM bank_account").fetchone()[0]
        assert number.encode() not in bytes(encrypted)
        assert conn.execute("SELECT count(*) FROM financial_access").fetchone()[0] == 1
        assert (
            conn.execute(
                "SELECT original_cipher=preview_cipher FROM evidence"
            ).fetchone()[0]
            is False
        )
        actor = admin.get("/api/v1/session").json()["user"]["id"]
        conn.execute(
            "INSERT INTO role_assignment_end(assignment_id,family_id,ended_at) SELECT id,family_id,now() FROM role_assignment WHERE user_id=%s",
            (actor,),
        )
    assert admin.post(reveal, headers=ah, json={}).status_code == 404
    assert (
        admin.get(ROOT + "/evidence/" + receipt["id"] + "/preview").status_code == 404
    )
    for table in (
        "bank_account",
        "bank_account_default",
        "evidence",
        "expense_evidence",
        "financial_access",
    ):
        with pytest.raises(psycopg.Error), psycopg.connect(runtime) as conn:
            conn.execute("DELETE FROM " + table)
        with pytest.raises(psycopg.Error), psycopg.connect(accounts) as conn:
            conn.execute("TRUNCATE " + table + " CASCADE")


def test_foreign_owner_family_attachment_and_rejected_advance(accounts):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    account, _ = bank(member, mh)
    other, _ = bank(admin, ah)
    receipt = upload(admin, ah)
    payload = {**body(), "bank_account_id": other["id"]}
    assert member.post(BASE, headers=mh, json=payload).status_code == 404
    payload.update(bank_account_id=account["id"], evidence_ids=[receipt["id"]])
    assert member.post(BASE, headers=mh, json=payload).status_code == 404
    assert (
        member.get(
            ROOT.replace("families/", "families/other-") + "/bank-accounts"
        ).status_code
        == 404
    )
    payload["evidence_ids"] = []
    item = member.post(BASE, headers=mh, json=payload).json()
    receipt = upload(member, mh)
    endpoint = BASE + "/" + item["id"] + "/evidence"
    assert (
        admin.post(
            endpoint, headers=ah, json={"evidence_ids": [receipt["id"]]}
        ).status_code
        == 404
    )
    policy(accounts)
    assert (
        admin.post(
            BASE + "/" + item["id"] + "/decisions",
            headers=ah,
            json={"decision": "rejected", "comment": "Synthetic rejection"},
        ).status_code
        == 200
    )
    assert (
        member.post(
            endpoint, headers=mh, json={"evidence_ids": [receipt["id"]]}
        ).status_code
        == 409
    )


def test_decision_evidence_concurrent_freeze(accounts):  # noqa: F811
    from family_ledger.domain import FAMILY
    from family_ledger.expenses.models import ExpenseDecisionInput
    from family_ledger.expenses.repository import ExpenseRepository

    admin, _ah, member, mh = setup(accounts)
    payload = body(member, mh)
    item = member.post(BASE, headers=mh, json=payload).json()
    first = upload(member, mh)
    second = upload(member, mh)
    policy(accounts)
    actor = admin.get("/api/v1/session").json()["user"]["id"]
    user = member.get("/api/v1/session").json()["user"]["id"]
    repo = ExpenseRepository(accounts)
    now = datetime.now(UTC)

    def decide():
        return repo.decide(
            FAMILY,
            actor,
            item["id"],
            ExpenseDecisionInput(decision="approved", comment="Concurrent snapshot"),
            now,
        )

    def attach():
        return repo.attach_evidence(FAMILY, user, item["id"], [first["id"]], now)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = [executor.submit(decide), executor.submit(attach)]
        decision, _ = [f.result() for f in results]
    assert decision.decision_evidence_ids in ([], [first["id"]])
    final = repo.attach_evidence(FAMILY, user, item["id"], [second["id"]], now)
    assert final.decision_evidence_ids == decision.decision_evidence_ids
    assert len(final.evidence) == 2
    assert member.post(BASE, headers=mh, json=payload).json()["id"] == item["id"]


def test_image_metadata_animation_and_dimensions():
    from PIL.PngImagePlugin import PngInfo

    from family_ledger.auth import AuthError
    from family_ledger.evidence.images import inspect_image

    data = io.BytesIO()
    metadata = PngInfo()
    metadata.add_text("private", "synthetic metadata")
    Image.new("RGB", (2500, 10)).save(data, "PNG", pnginfo=metadata)
    _, preview = inspect_image(data.getvalue())
    with Image.open(io.BytesIO(preview)) as image:
        assert "private" not in image.info
        assert max(image.size) <= 2400
    data = io.BytesIO()
    Image.new("RGB", (2, 2), "red").save(
        data, "PNG", save_all=True, append_images=[Image.new("RGB", (2, 2), "blue")]
    )
    with pytest.raises(AuthError):
        inspect_image(data.getvalue())


def test_wrong_key_and_receipt_limit(accounts, monkeypatch):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    account, _ = bank(member, mh)
    receipts = [upload(member, mh) for _ in range(5)]
    payload = {
        **body(),
        "request_type": "reimbursement",
        "bank_account_id": account["id"],
        "evidence_ids": [e["id"] for e in receipts],
    }
    item = member.post(BASE, headers=mh, json=payload)
    assert item.status_code == 200
    policy(accounts)
    decision = admin.post(
        BASE + "/" + item.json()["id"] + "/decisions",
        headers=ah,
        json={"decision": "approved", "comment": "Receipt review"},
    )
    assert set(decision.json()["decision_evidence_ids"]) == set(payload["evidence_ids"])
    excess = {
        **body(),
        "bank_account_id": account["id"],
        "evidence_ids": [e["id"] for e in receipts] + ["extra"],
    }
    assert member.post(BASE, headers=mh, json=excess).status_code == 422
    monkeypatch.setenv("FINANCIAL_DATA_KEY", Fernet.generate_key().decode())
    assert (
        member.post(
            ROOT + "/bank-accounts/" + account["id"] + "/reveal", headers=mh, json={}
        ).status_code
        == 503
    )
    assert (
        member.get(ROOT + "/evidence/" + receipts[0]["id"] + "/preview").status_code
        == 503
    )
    with psycopg.connect(accounts) as conn:
        assert conn.execute("SELECT count(*) FROM financial_access").fetchone()[0] == 0


def test_image_pixel_limit():
    from family_ledger.auth import AuthError
    from family_ledger.evidence.images import inspect_image

    data = io.BytesIO()
    Image.new("1", (5000, 4001)).save(data, "PNG")
    with pytest.raises(AuthError):
        inspect_image(data.getvalue())
