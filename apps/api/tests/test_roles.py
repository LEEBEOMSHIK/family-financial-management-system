import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from family_ledger.domain import SyntheticRepository
from family_ledger.models import RoleChange
from family_ledger.roles import RoleError, RoleRepository


@pytest.mark.parametrize("timestamp", ["bad", "2026-10-24T09:00:00"])
def test_corrupt_journal_fails_closed(tmp_path, timestamp):
    path = tmp_path / "roles.json"
    path.write_text(
        json.dumps(
            {
                "schema": 1,
                "events": [
                    {
                        "user_id": "synthetic-member",
                        "before": "member",
                        "after": "treasurer",
                        "actor_id": "synthetic-super_admin",
                        "occurred_at": timestamp,
                        "reason": "test",
                    }
                ],
            }
        )
    )
    with TestClient(
        create_app(Config("development", "development", role_path=path))
    ) as client:
        assert (
            client.post(
                "/api/v1/dev/session", json={"profile": "super_admin"}, headers=ORIGIN
            ).status_code
            == 503
        )


def test_concurrent_writes_and_expired_actor(tmp_path):
    repo = RoleRepository(SyntheticRepository(), tmp_path / "roles.json")
    body = RoleChange(
        user_id="synthetic-member", role="treasurer", reason="test", expected_version=0
    )

    def change():
        try:
            repo.change(
                "synthetic-super_admin", body, datetime(2026, 10, 24, tzinfo=UTC)
            )
            return 200
        except RoleError as exc:
            return exc.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: change(), range(2))) == [200, 409]
    assert len(repo.history()) == 1
    with pytest.raises(RoleError) as exc:
        repo.change("synthetic-super_admin", body, datetime(2027, 1, 1, tzinfo=UTC))
    assert exc.value.status == 403


from family_ledger.main import Config, create_app

ORIGIN = {"Origin": "http://127.0.0.1:3000"}
BASE = "/api/v1/families/00000000-0000-4000-8000-000000000001/roles"


def sign_in(client, profile):
    response = client.post(
        "/api/v1/dev/session", json={"profile": profile}, headers=ORIGIN
    )
    assert response.status_code == 200
    return {**ORIGIN, "X-CSRF-Token": response.json()["csrf_token"]}


def test_roles_authorization_history_restart_and_stale_session(tmp_path):
    config = Config("development", "development", role_path=tmp_path / "roles.json")
    app = create_app(config)
    with TestClient(app) as admin, TestClient(app) as treasurer:
        headers = sign_in(admin, "super_admin")
        th = sign_in(treasurer, "treasurer")
        change = {
            "user_id": "synthetic-treasurer",
            "role": "member",
            "expected_version": 0,
            "reason": "Synthetic handover",
        }
        assert treasurer.get(BASE).status_code == 403
        assert treasurer.post(BASE, json=change, headers=th).status_code == 403
        assert admin.post(BASE, json=change).status_code == 403
        assert (
            admin.post(
                BASE.replace("4000", "4001"), json=change, headers=headers
            ).status_code
            == 404
        )
        assert admin.post(BASE, json=change, headers=headers).status_code == 200
        assert "manage" not in treasurer.get("/api/v1/session").json()["capabilities"]
        assert admin.post(BASE, json=change, headers=headers).status_code == 409
        result = admin.get(BASE).json()
        assert result["version"] == 1 and len(result["history"]) == 1
        assert result["history"][0]["before"] == "treasurer"
        assert result["history"][0]["actor_id"] == "synthetic-super_admin"
    with TestClient(create_app(config)) as restarted:
        headers = sign_in(restarted, "super_admin")
        assert restarted.get(BASE).json() == result
        assert (
            restarted.post(
                BASE,
                json={
                    **change,
                    "user_id": "synthetic-super_admin",
                    "expected_version": 1,
                },
                headers=headers,
            ).status_code
            == 409
        )
        assert restarted.get(BASE).json() == result


def test_member_unknown_role_and_unknown_target_rejected(tmp_path):
    with TestClient(
        create_app(
            Config("development", "development", role_path=tmp_path / "roles.json")
        )
    ) as client:
        headers = sign_in(client, "member")
        assert client.get(BASE).status_code == 403
        headers = sign_in(client, "super_admin")
        body = {
            "user_id": "missing",
            "role": "member",
            "expected_version": 0,
            "reason": "Synthetic check",
        }
        assert client.post(BASE, json=body, headers=headers).status_code == 404
        assert (
            client.post(
                BASE, json={**body, "role": "auditor"}, headers=headers
            ).status_code
            == 422
        )
