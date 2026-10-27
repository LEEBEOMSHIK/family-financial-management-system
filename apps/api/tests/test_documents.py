import io
import os
import zipfile
from uuid import uuid4

import psycopg
import pytest
from cryptography.fernet import Fernet
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from test_accounts_evidence import bank, upload
from test_auth import accounts  # noqa: F401
from test_expenses import BASE as EXPENSES
from test_expenses import body, setup
from test_postgres import database  # noqa: F401

ROOT = EXPENSES.removesuffix("/expenses")
BASE = ROOT + "/documents"


@pytest.fixture(autouse=True)
def key(monkeypatch):
    monkeypatch.setenv("FINANCIAL_DATA_KEY", Fernet.generate_key().decode())


def store(browser, headers, *, content=b"Synthetic rules", **params):
    query = {
        "kind": "family",
        "title": "합성 규정",
        "category": "정책·규정",
        "description": "테스트",
        "filename": "rules.txt",
        "operation_id": str(uuid4()),
    }
    query.update(params)
    return browser.post(
        BASE,
        params=query,
        headers={**headers, "Content-Type": "application/octet-stream"},
        content=content,
    )


def test_document_versions_retry_privacy_and_revocation(accounts):  # noqa: F811
    runtime = make_conninfo(
        os.environ["TEST_APP_DATABASE_URL"],
        options=conninfo_to_dict(accounts)["options"],
    )
    admin, ah, member, mh = setup(runtime)
    assert member.get(BASE).status_code == 403
    assert store(member, mh).status_code == 403
    operation = str(uuid4())
    result = store(admin, ah, operation_id=operation)
    assert result.status_code == 200, result.text
    first = result.json()
    assert first["version"] == 1
    assert store(admin, ah, operation_id=operation).json()["id"] == first["id"]
    assert (
        store(admin, ah, operation_id=operation, content=b"Changed").status_code == 409
    )
    second = store(admin, ah, root_id=first["root_id"], content=b"Second rules").json()
    assert second["version"] == 2
    assert admin.get(BASE).json()["total"] == 1
    assert admin.get(BASE, params={"q": "없는제목"}).json()["total"] == 0
    versions = admin.get(f"{BASE}/{first['id']}/versions").json()["items"]
    assert [v["version"] for v in versions] == [2, 1]
    path = f"{BASE}/{first['id']}/download"
    response = admin.get(path)
    assert response.content == b"Synthetic rules"
    assert response.headers["content-disposition"].startswith("attachment;")
    assert "no-store" in response.headers["cache-control"]
    assert member.get(path).status_code == 403
    assert member.get(f"{BASE}/{first['id']}/versions").status_code == 403
    assert admin.get(path.replace(ROOT.split("/")[4], str(uuid4()))).status_code == 404
    assert store(admin, {}, title="CSRF").status_code == 403
    with psycopg.connect(accounts) as conn:
        blob = conn.execute(
            "SELECT original_cipher FROM managed_document WHERE id=%s", (first["id"],)
        ).fetchone()[0]
        assert b"Synthetic rules" not in bytes(blob)
    with pytest.raises(psycopg.Error), psycopg.connect(runtime) as conn:
        conn.execute("DELETE FROM managed_document")
    actor = admin.get("/api/v1/session").json()["user"]["id"]
    with psycopg.connect(accounts) as conn:
        conn.execute(
            "INSERT INTO role_assignment_end(assignment_id,family_id,ended_at) SELECT id,family_id,now() FROM role_assignment WHERE user_id=%s",
            (actor,),
        )
    assert admin.get(path).status_code == 403
    assert admin.get(BASE).status_code == 403
    assert store(admin, ah).status_code == 403


def test_document_file_validation_and_bank_status(accounts):  # noqa: F811
    admin, ah, _, _ = setup(accounts)
    for filename, content in [
        ("x.pdf", b"not-pdf"),
        ("x.xlsx", b"not-zip"),
        ("x.exe", b"MZ"),
        ("../rules.txt", b"test"),
    ]:
        assert store(admin, ah, filename=filename, content=content).status_code == 422
    assert store(admin, ah, content=b"x" * (6 * 1024 * 1024 + 1)).status_code == 413
    assert store(admin, ah, kind="bank", filename="rules.txt").status_code == 422
    result = store(
        admin,
        ah,
        kind="bank",
        filename="synthetic.csv",
        content="거래일,입금,출금\n2026-10-26,1000,0".encode(),
    )
    assert result.status_code == 200, result.text
    assert result.json()["processing_status"] == "format_review_required"
    assert result.json()["scan_status"] == "not_scanned"
    # An OOXML-looking zip with an embedded macro must not pass.
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("xl/workbook.xml", "<workbook/>")
        archive.writestr("xl/vbaProject.bin", b"macro")
    assert (
        store(
            admin, ah, kind="bank", filename="macro.xlsx", content=data.getvalue()
        ).status_code
        == 422
    )


def test_evidence_management_only_linked_and_download(accounts):  # noqa: F811
    admin, _ah, member, mh = setup(accounts)
    account, _ = bank(member, mh)
    receipt = upload(member, mh)
    path = BASE + "/evidence"
    assert admin.get(path).json()["items"] == []
    original = path + "/" + receipt["id"] + "/download"
    assert admin.get(original).status_code == 404
    payload = {
        **body(),
        "request_type": "reimbursement",
        "bank_account_id": account["id"],
        "evidence_ids": [receipt["id"]],
    }
    request = member.post(EXPENSES, headers=mh, json=payload).json()
    listing = admin.get(path).json()
    assert listing["total"] == 1
    assert listing["items"][0]["request_id"] == request["id"]
    assert admin.get(original).content.startswith(b"\x89PNG")
    assert member.get(path).status_code == 403
    assert member.get(original).status_code == 403
    assert (
        member.get(ROOT + "/evidence/" + receipt["id"] + "/preview").status_code == 200
    )
