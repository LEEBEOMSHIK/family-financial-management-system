import base64
import io
from uuid import uuid4

import psycopg
from PIL import Image
from test_auth import accounts  # noqa: F401
from test_documents import key  # noqa: F401
from test_expenses import setup
from test_postgres import database  # noqa: F401

from family_ledger.domain import FAMILY

BASE = f"/api/v1/families/{FAMILY}/issues"


def body():
    image = io.BytesIO()
    Image.new("RGB", (100, 100), "white").save(image, format="PNG")
    return {
        "operation_id": str(uuid4()),
        "title": "합성 화면 문의",
        "description": "위치 확인",
        "path": "/dashboard",
        "screen_name": "대시보드",
        "viewport_width": 1000,
        "viewport_height": 800,
        "pins": [{"x": 1000, "y": 2000, "note": "확인 필요", "target": "button"}],
        "image_base64": base64.b64encode(image.getvalue()).decode(),
    }


def test_issue_acl_image_idempotency_and_conflict(accounts):  # noqa: F811
    admin, ah, member, mh = setup(accounts)
    data = body()
    assert member.post(BASE, json=data).status_code == 403
    created = member.post(BASE, headers=mh, json=data)
    assert created.status_code == 200
    item = created.json()
    path = BASE + "/" + item["id"]
    assert member.post(BASE, headers=mh, json=data).json()["id"] == item["id"]
    assert (
        member.post(BASE, headers=mh, json={**data, "title": "다른 내용"}).status_code
        == 409
    )
    assert member.get(path + "/image").headers["content-type"] == "image/png"
    assert admin.get(path).status_code == 200
    assert member.get(path.replace(FAMILY, str(uuid4()))).status_code == 404
    private = admin.post(BASE, headers=ah, json=body()).json()
    assert member.get(BASE + "/" + private["id"]).status_code == 404
    assert member.get(BASE + "/" + private["id"] + "/image").status_code == 404
    assert member.get(BASE).json()["total"] == 1
    event = {
        "operation_id": str(uuid4()),
        "expected_version": 0,
        "comment": "확인 중입니다",
        "status": "investigating",
    }
    assert member.post(path + "/events", headers=mh, json=event).status_code == 403
    assert admin.post(path + "/events", headers=ah, json=event).json()["version"] == 1
    assert admin.post(path + "/events", headers=ah, json=event).status_code == 200
    assert (
        admin.post(
            path + "/events", headers=ah, json={**event, "operation_id": str(uuid4())}
        ).status_code
        == 409
    )
    reply = {
        "operation_id": str(uuid4()),
        "expected_version": 1,
        "comment": "추가 설명입니다",
    }
    assert member.post(path + "/events", headers=mh, json=reply).json()["version"] == 2
    actor = admin.get("/api/v1/session").json()["user"]["id"]
    with psycopg.connect(accounts) as conn:
        conn.execute(
            "INSERT INTO role_assignment_end(assignment_id,family_id,ended_at) SELECT id,family_id,now() FROM role_assignment WHERE user_id=%s",
            (actor,),
        )
    assert admin.get(path).status_code == 404
    assert admin.get(path + "/image").status_code == 404


def test_issue_limits_and_invalid_image(accounts):  # noqa: F811
    _, _, member, mh = setup(accounts)
    data = body()
    five = {**data, "pins": data["pins"] * 5}
    assert member.post(BASE, headers=mh, json=five).status_code == 200
    for fields in (
        {"pins": data["pins"] * 6},
        {"path": "https://example.com"},
        {"path": "/dashboard?secret=x"},
        {"pins": [{"x": -1, "y": 0, "note": "test"}]},
    ):
        assert (
            member.post(BASE, headers=mh, json={**body(), **fields}).status_code == 422
        )
    assert (
        member.post(
            BASE, headers=mh, json={**body(), "image_base64": "invalid"}
        ).status_code
        == 422
    )
    assert (
        member.post(
            BASE, headers=mh, json={**body(), "image_base64": None, "pins": []}
        ).status_code
        == 200
    )


def test_runtime_treasurer_and_concurrent_updates(accounts):  # noqa: F811
    import os
    from concurrent.futures import ThreadPoolExecutor
    from datetime import UTC, datetime

    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    from family_ledger.auth import AuthError
    from family_ledger.models import RoleChange
    from family_ledger.postgres import PostgresRepository
    from family_ledger.support.models import IssueCreate, IssueEventCreate
    from family_ledger.support.repository import SupportRepository

    admin, ah, member, _mh = setup(accounts)
    admin_id = admin.get("/api/v1/session").json()["user"]["id"]
    member_id = member.get("/api/v1/session").json()["user"]["id"]
    now = datetime.now(UTC)
    roles = PostgresRepository(accounts)
    roles.change(
        admin_id,
        RoleChange(
            user_id=member_id,
            role="treasurer",
            expected_version=roles.snapshot(now).version,
            reason="Synthetic support ACL",
        ),
        now,
    )
    private = admin.post(BASE, headers=ah, json=body()).json()
    assert member.get(BASE + "/" + private["id"]).status_code == 404
    assert member.get(BASE + "/" + private["id"] + "/image").status_code == 404
    runtime = make_conninfo(
        os.environ["TEST_APP_DATABASE_URL"],
        options=conninfo_to_dict(accounts)["options"],
    )
    repo = SupportRepository(runtime)
    item = repo.create(FAMILY, member_id, IssueCreate(**body()), now)
    assert repo.detail(FAMILY, member_id, item.id, now).has_image

    def change(_):
        try:
            repo.event(
                FAMILY,
                admin_id,
                item.id,
                IssueEventCreate(
                    operation_id=uuid4(), expected_version=0, status="investigating"
                ),
                now,
            )
            return 200
        except AuthError as exc:
            return exc.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(change, range(2))) == [200, 409]
    assert len(repo.detail(FAMILY, member_id, item.id, now).events) == 1


def test_pin_region_contract_and_legacy(accounts):  # noqa: F811
    _, _, member, mh = setup(accounts)
    data = body()
    pin = {
        **data["pins"][0],
        "label": "잔액 위젯",
        "region": {"left": 500, "top": 600, "width": 3000, "height": 2000},
    }
    response = member.post(BASE, headers=mh, json={**data, "pins": [pin]})
    assert response.status_code == 200
    assert response.json()["pins"][0]["region"]["width"] == 3000
    assert response.json()["pins"][0]["label"] == "잔액 위젯"
    invalid = {**pin, "region": {"left": 9000, "top": 0, "width": 2000, "height": 1000}}
    assert (
        member.post(BASE, headers=mh, json={**body(), "pins": [invalid]}).status_code
        == 422
    )
    assert member.post(BASE, headers=mh, json=body()).status_code == 200


def test_pin_target_context_round_trip(accounts):  # noqa: F811
    _, _, member, mh = setup(accounts)
    data = body()
    context = {
        "schema_version": 1,
        "component_id": "dashboard.widget.balance",
        "element_id": "balance",
        "locator": "[data-report-id=dashboard.widget.balance] [data-testid=balance]",
        "source_file": "apps/web/src/features/dashboard/dashboard-view.tsx",
        "hierarchy": ["대시보드", "잔액 위젯", "현재 잔액"],
        "tag": "strong",
    }
    data["pins"][0]["context"] = context
    response = member.post(BASE, headers=mh, json=data)
    assert response.status_code == 200
    assert response.json()["pins"][0]["context"] == context
    assert (
        member.get(BASE + "/" + response.json()["id"]).json()["pins"][0]["context"]
        == context
    )
    invalid = body()
    invalid["pins"][0]["context"] = {**context, "source_file": "../../secret"}
    assert member.post(BASE, headers=mh, json=invalid).status_code == 422
