"""Real PostgreSQL tests; isolated schemas in an explicitly named test database."""

import importlib.util
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest


def test_postgres_adapter_exists():
    assert importlib.util.find_spec("family_ledger.postgres") is not None


@pytest.fixture
def database():
    psycopg = pytest.importorskip("psycopg")
    dsn = os.environ.get("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("TEST_DATABASE_URL is required for real PostgreSQL tests")
    from psycopg import sql
    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    if conninfo_to_dict(dsn).get("dbname") != "family_ledger_test":
        pytest.fail("Refusing tests outside family_ledger_test")
    schema = "test_" + uuid4().hex
    with psycopg.connect(dsn) as conn:
        assert (
            conn.execute("SELECT current_database()").fetchone()[0]
            == "family_ledger_test"
        )
        conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    isolated = make_conninfo(dsn, options=f"-c search_path={schema}")
    try:
        yield isolated
    finally:
        with psycopg.connect(dsn) as conn:
            conn.execute(
                sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema))
            )


NOW = datetime(2026, 10, 24, tzinfo=UTC)
ADMIN = "synthetic-super_admin"
MEMBER = "synthetic-member"


def change(version=0, role="treasurer", user=MEMBER):
    from family_ledger.models import RoleChange

    return RoleChange(
        user_id=user, role=role, expected_version=version, reason="합성 변경 검증"
    )


def initialized(dsn):
    from family_ledger.postgres import PostgresRepository, migrate, seed

    migrate(dsn, app_role="family_ledger_test_app")
    seed(dsn, None)
    return PostgresRepository(dsn)


def test_restart_money_family_and_idempotent_migration(database):
    from family_ledger.domain import FAMILY
    from family_ledger.postgres import PostgresRepository, migrate, seed

    repo = initialized(database)
    repo.change(ADMIN, change(), NOW)
    migrate(database, app_role="family_ledger_test_app")
    seed(database, None)
    restarted = PostgresRepository(database)
    assert restarted.snapshot(NOW).version == 1
    assert restarted.history() == repo.history()
    assert restarted.transactions("other-family") == ()
    assert all(isinstance(t.amount_krw, str) for t in restarted.transactions(FAMILY))


def test_atomic_version_and_permission_checks(database):
    from family_ledger.roles import RoleError

    repo = initialized(database)
    with pytest.raises(RoleError) as denied:
        repo.change(MEMBER, change(), NOW)
    assert denied.value.status == 403
    with pytest.raises(RoleError):
        repo.change(ADMIN, change(user=ADMIN, role="member"), NOW)

    def attempt(_):
        try:
            repo.change(ADMIN, change(), NOW)
            return 200
        except RoleError as exc:
            return exc.status

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(attempt, range(2))) == [200, 409]
    assert len(repo.history()) == 1
    with pytest.raises(RoleError) as expired:
        repo.change(
            ADMIN, change(version=1, role="member"), datetime(2027, 1, 1, tzinfo=UTC)
        )
    assert expired.value.status == 403


def test_audit_immutable_and_historical_role_preserved(database):
    import psycopg

    repo = initialized(database)
    repo.change(ADMIN, change(role="super_admin"), NOW)
    repo.change(
        MEMBER, change(version=1, user=ADMIN, role="member"), NOW + timedelta(seconds=1)
    )
    previous = {
        r.user_id: r.role for r in repo.roles() if r.valid_from <= NOW < r.valid_to
    }
    assert previous[ADMIN] == "super_admin"
    assert len(repo.history()) == 2
    for table in ("role_event", "role_assignment", "role_assignment_end"):
        with pytest.raises(psycopg.Error), psycopg.connect(database) as conn:
            conn.execute(f"DELETE FROM {table}")


def test_import_exact_events_and_reject_bad_chain(database, tmp_path):
    from family_ledger.postgres import PostgresRepository, migrate, seed

    migrate(database, app_role="family_ledger_test_app")
    path = tmp_path / "legacy.json"
    event = {
        "user_id": MEMBER,
        "before": "member",
        "after": "treasurer",
        "actor_id": ADMIN,
        "occurred_at": NOW.isoformat(),
        "reason": "  original reason  ",
    }
    path.write_text(
        json.dumps({"schema": 1, "events": [{**event, "before": "super_admin"}]}),
        encoding="utf-8",
    )
    with pytest.raises(ValueError):
        seed(database, path)
    path.write_text(json.dumps({"schema": 1, "events": [event]}), encoding="utf-8")
    seed(database, path)
    assert PostgresRepository(database).history()[0].model_dump() == event
    seed(database, path)
    assert len(PostgresRepository(database).history()) == 1


def test_real_members_no_scheduled_expiry_bigint_and_family_fk(database):
    import psycopg

    from family_ledger.domain import FAMILY, ReadService

    repo = initialized(database)
    with psycopg.connect(database) as conn:
        conn.execute(
            "INSERT INTO membership VALUES (%s,'real-admin',true),(%s,'real-member',true)",
            (FAMILY, FAMILY),
        )
        conn.execute(
            "INSERT INTO role_assignment(family_id,user_id,role,valid_from,valid_to) VALUES (%s,'real-admin','super_admin',%s,NULL)",
            (FAMILY, NOW),
        )
        conn.execute(
            "UPDATE membership SET active=false WHERE user_id LIKE 'synthetic-%%'"
        )
        conn.execute(
            "INSERT INTO ledger_transaction VALUES (%s,'big','2026-10-24','synthetic BIGINT test',9223372036854775807,'test','pending',true)",
            (FAMILY,),
        )
    later = datetime(2028, 1, 1, tzinfo=UTC)
    assert "manage_roles" in ReadService(repo).capabilities("real-admin", FAMILY, later)
    assert (
        next(t for t in repo.transactions(FAMILY) if t.id == "big").amount_krw
        == "9223372036854775807"
    )
    repo.change("real-admin", change(user="real-member", role="treasurer"), later)
    assert any(r.user_id == "real-member" and r.valid_to is None for r in repo.roles())
    from family_ledger.roles import RoleError

    with pytest.raises(RoleError):
        repo.change(
            "real-admin", change(version=1, user="real-admin", role="member"), later
        )
    with (
        pytest.raises(psycopg.errors.ForeignKeyViolation),
        psycopg.connect(database) as conn,
    ):
        conn.execute(
            "INSERT INTO role_assignment(family_id,user_id,role,valid_from) VALUES ('other-family','real-admin','super_admin',%s)",
            (NOW,),
        )


def test_migration_drift_fails_closed(database):
    import psycopg

    from family_ledger.postgres import migrate

    initialized(database)
    with psycopg.connect(database) as conn:
        conn.execute(
            "UPDATE schema_migration SET sha256='tampered' WHERE version='001_postgres.sql'"
        )
    with pytest.raises(ValueError, match="checksum mismatch"):
        migrate(database, app_role="family_ledger_test_app")


def test_runtime_role_cannot_destroy_audit(database):
    import psycopg
    from psycopg.conninfo import make_conninfo

    from family_ledger.postgres import PostgresRepository

    initialized(database)
    with psycopg.connect(database) as conn:
        schema = conn.execute("SELECT current_schema()").fetchone()[0]
    runtime_dsn = os.environ.get("TEST_APP_DATABASE_URL")
    if not runtime_dsn:
        pytest.skip("TEST_APP_DATABASE_URL is required to test runtime grants")
    runtime = make_conninfo(runtime_dsn, options=f"-c search_path={schema}")
    repo = PostgresRepository(runtime)
    assert repo.change(ADMIN, change(), NOW).version == 1
    with (
        pytest.raises(psycopg.errors.InsufficientPrivilege),
        psycopg.connect(runtime) as conn,
    ):
        conn.execute("DELETE FROM role_event")
    with (
        pytest.raises(psycopg.errors.InsufficientPrivilege),
        psycopg.connect(runtime) as conn,
    ):
        conn.execute("TRUNCATE role_event")
