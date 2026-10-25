"""Parameterized PostgreSQL adapter; no bank execution or implicit schema reset."""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from .domain import FAMILY, Membership, RoleAssignment, SyntheticRepository
from .models import RoleChange, RoleEvent, RoleMember, RolesResponse, Transaction
from .roles import RoleError

MIGRATIONS = Path(__file__).resolve().parents[2] / "migrations"
INITIAL_START = datetime(2026, 1, 1, tzinfo=UTC)
INITIAL_END = datetime(2027, 1, 1, tzinfo=UTC)


def migrate(dsn: str, app_role: str = "family_ledger_app") -> None:
    """Owner-only, transactional, checksum-verified forward migrations."""
    if app_role not in {"family_ledger_app", "family_ledger_test_app"}:
        raise ValueError("Unsupported runtime database role")
    with psycopg.connect(dsn) as conn:
        conn.execute("SELECT pg_advisory_xact_lock(726418001)")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migration (version text PRIMARY KEY, sha256 text NOT NULL)"
        )
        for path in sorted(MIGRATIONS.glob("*.sql")):
            content = path.read_bytes()
            digest = hashlib.sha256(content).hexdigest()
            row = conn.execute(
                "SELECT sha256 FROM schema_migration WHERE version=%s", (path.name,)
            ).fetchone()
            if row:
                if row[0] != digest:
                    raise ValueError(f"Migration checksum mismatch: {path.name}")
                continue
            # Migration files use a fixed role token, substituted only by a quoted
            # identifier from the two explicitly supported deployment roles.
            script = content.decode("utf-8").replace(
                "family_ledger_app", sql.Identifier(app_role).as_string(conn)
            )
            conn.execute(script)
            conn.execute(
                "INSERT INTO schema_migration VALUES (%s,%s)", (path.name, digest)
            )
        schema = conn.execute("SELECT current_schema()").fetchone()[0]
        conn.execute(
            sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(
                sql.Identifier(schema), sql.Identifier(app_role)
            )
        )


def _history(conn: psycopg.Connection, family_id: str) -> list[RoleEvent]:
    rows = conn.execute(
        "SELECT user_id,before_role AS before,after_role AS after,actor_id,occurred_at,reason "
        "FROM role_event WHERE family_id=%s ORDER BY version",
        (family_id,),
    ).fetchall()
    return [RoleEvent.model_validate(row) for row in rows]


def _roles(
    conn: psycopg.Connection, family_id: str | None = None
) -> tuple[RoleAssignment, ...]:
    rows = conn.execute(
        "SELECT a.user_id,a.family_id,a.role,a.valid_from,"
        "LEAST(a.valid_to,e.ended_at) AS valid_to FROM role_assignment a "
        "LEFT JOIN role_assignment_end e ON e.assignment_id=a.id AND e.family_id=a.family_id "
        "WHERE (%s::text IS NULL OR a.family_id=%s) ORDER BY a.id",
        (family_id, family_id),
    ).fetchall()
    return tuple(RoleAssignment(**row) for row in rows)


def _snapshot(conn: psycopg.Connection, family_id: str, now: datetime) -> RolesResponse:
    version = conn.execute(
        "SELECT role_version FROM family WHERE id=%s", (family_id,)
    ).fetchone()
    if not version:
        raise RoleError(404, "가족을 찾을 수 없습니다.")
    roles = {
        r.user_id: r.role
        for r in _roles(conn, family_id)
        if r.valid_from <= now and (r.valid_to is None or now < r.valid_to)
    }
    members = conn.execute(
        "SELECT user_id FROM membership WHERE family_id=%s AND active ORDER BY user_id",
        (family_id,),
    ).fetchall()
    return RolesResponse(
        version=version["role_version"],
        history=_history(conn, family_id),
        members=[
            RoleMember(user_id=m["user_id"], role=roles.get(m["user_id"], "member"))
            for m in members
        ],
    )


def _append(
    conn: psycopg.Connection,
    family_id: str,
    event: RoleEvent,
    version: int,
    ends: datetime | None,
) -> None:
    stamp = datetime.fromisoformat(event.occurred_at)
    conn.execute(
        "INSERT INTO role_assignment_end(assignment_id,family_id,ended_at) "
        "SELECT a.id,a.family_id,%s FROM role_assignment a "
        "LEFT JOIN role_assignment_end e ON e.assignment_id=a.id "
        "WHERE a.family_id=%s AND a.user_id=%s AND e.assignment_id IS NULL AND (a.valid_to IS NULL OR a.valid_to>%s)",
        (stamp, family_id, event.user_id, stamp),
    )
    conn.execute(
        "INSERT INTO role_assignment(family_id,user_id,role,valid_from,valid_to) VALUES (%s,%s,%s,%s,%s)",
        (family_id, event.user_id, event.after, stamp, ends),
    )
    conn.execute(
        "INSERT INTO role_event VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            family_id,
            version,
            event.user_id,
            event.before,
            event.after,
            event.actor_id,
            event.occurred_at,
            event.reason,
        ),
    )
    conn.execute("UPDATE family SET role_version=%s WHERE id=%s", (version, family_id))


def seed(dsn: str, legacy_path: Path | None = None) -> None:
    """Import the explicitly synthetic development family once, without rewriting history."""
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        conn.execute("SELECT pg_advisory_xact_lock(726418002)")
        if conn.execute(
            "SELECT 1 FROM seed_import WHERE marker='synthetic-v1'"
        ).fetchone():
            return
        raw = (
            legacy_path.read_bytes()
            if legacy_path is not None and legacy_path.exists()
            else None
        )
        events: list[RoleEvent] = []
        if raw is not None:
            data = json.loads(raw.decode("utf-8-sig"))
            if data.get("schema") != 1 or not isinstance(data.get("events"), list):
                raise ValueError("Unsupported legacy role journal")
            events = [RoleEvent.model_validate(row) for row in data["events"]]
        base = SyntheticRepository()
        conn.execute("INSERT INTO family(id) VALUES (%s)", (FAMILY,))
        for member in base.memberships():
            conn.execute(
                "INSERT INTO membership VALUES (%s,%s,%s)",
                (member.family_id, member.user_id, member.active),
            )
        for assignment in base.roles():
            conn.execute(
                "INSERT INTO role_assignment(family_id,user_id,role,valid_from,valid_to) VALUES (%s,%s,%s,%s,%s)",
                (
                    assignment.family_id,
                    assignment.user_id,
                    assignment.role,
                    assignment.valid_from,
                    assignment.valid_to,
                ),
            )
        previous = INITIAL_START
        for version, event in enumerate(events, 1):
            stamp = datetime.fromisoformat(event.occurred_at)
            if stamp.utcoffset() is None or not previous <= stamp < INITIAL_END:
                raise ValueError("Invalid legacy event timestamp")
            state = _snapshot(conn, FAMILY, stamp)
            roles = {m.user_id: m.role for m in state.members}
            if (
                roles.get(event.actor_id) != "super_admin"
                or roles.get(event.user_id) != event.before
                or event.before == event.after
                or not event.reason.strip()
                or (
                    event.before == "super_admin"
                    and event.after != "super_admin"
                    and list(roles.values()).count("super_admin") == 1
                )
            ):
                raise ValueError("Invalid legacy role chain")
            _append(conn, FAMILY, event, version, INITIAL_END)
            previous = stamp
        for item in base.transactions(FAMILY):
            conn.execute(
                "INSERT INTO ledger_transaction VALUES (%s,%s,%s,%s,%s,%s,%s,true)",
                (
                    FAMILY,
                    item.id,
                    item.occurred_on,
                    item.description,
                    int(item.amount_krw),
                    item.category,
                    item.reconciliation_status,
                ),
            )
        conn.execute(
            "INSERT INTO seed_import(marker,source_sha256) VALUES ('synthetic-v1',%s)",
            (hashlib.sha256(raw).hexdigest() if raw else None,),
        )


class PostgresRepository:
    def __init__(self, dsn: str, family_id: str = FAMILY):
        self.dsn, self.family_id = dsn, family_id

    def transactions(self, family_id: str) -> tuple[Transaction, ...]:
        with psycopg.connect(self.dsn, row_factory=dict_row) as conn:
            rows = conn.execute(
                "SELECT id,occurred_on::text,description,amount_krw::text,category,reconciliation_status FROM ledger_transaction WHERE family_id=%s ORDER BY id",
                (family_id,),
            ).fetchall()
            return tuple(Transaction.model_validate(row) for row in rows)

    def memberships(self) -> tuple[Membership, ...]:
        with psycopg.connect(self.dsn, row_factory=dict_row) as conn:
            return tuple(
                Membership(**row)
                for row in conn.execute(
                    "SELECT user_id,family_id,active FROM membership"
                ).fetchall()
            )

    def roles(self) -> tuple[RoleAssignment, ...]:
        with psycopg.connect(self.dsn, row_factory=dict_row) as conn:
            return _roles(conn)

    def history(self) -> list[RoleEvent]:
        with psycopg.connect(self.dsn, row_factory=dict_row) as conn:
            return _history(conn, self.family_id)

    def snapshot(self, now: datetime) -> RolesResponse:
        with psycopg.connect(self.dsn, row_factory=dict_row) as conn:
            conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            return _snapshot(conn, self.family_id, now)

    def change(self, actor: str, body: RoleChange, now: datetime) -> RolesResponse:
        if now.utcoffset() is None:
            raise ValueError("Timezone-aware request time required")
        with psycopg.connect(self.dsn, row_factory=dict_row) as conn:
            conn.execute(
                "SELECT role_version FROM family WHERE id=%s FOR UPDATE",
                (self.family_id,),
            )
            state = _snapshot(conn, self.family_id, now)
            roles = {m.user_id: m.role for m in state.members}
            if roles.get(actor) != "super_admin":
                raise RoleError(403, "총괄관리자만 권한을 변경할 수 있습니다.")
            if body.user_id not in roles:
                raise RoleError(404, "구성원을 찾을 수 없습니다.")
            if body.expected_version != state.version:
                raise RoleError(
                    409, "권한 목록이 변경되었습니다. 새로고침 후 확인해 주세요."
                )
            if roles[body.user_id] == body.role:
                raise RoleError(409, "현재 역할과 같습니다.")
            if (
                roles[body.user_id] == "super_admin"
                and body.role != "super_admin"
                and list(roles.values()).count("super_admin") == 1
            ):
                raise RoleError(409, "마지막 총괄관리자의 권한은 해제할 수 없습니다.")
            latest = conn.execute(
                "SELECT max(valid_from) AS stamp FROM role_assignment WHERE family_id=%s AND user_id=%s",
                (self.family_id, body.user_id),
            ).fetchone()["stamp"]
            if latest is not None and now < latest:
                raise RoleError(
                    409, "이전 역할 적용 시각보다 앞선 변경은 허용되지 않습니다."
                )
            # The current local family uses a documented fixed synthetic term. Real
            # assignments preserve the target's existing end, or the actor's term.
            assignments = _roles(conn, self.family_id)
            ends = next(
                (
                    r.valid_to
                    for r in reversed(assignments)
                    if r.user_id == body.user_id
                    and r.valid_from <= now
                    and (r.valid_to is None or now < r.valid_to)
                ),
                next(
                    r.valid_to
                    for r in reversed(assignments)
                    if r.user_id == actor
                    and r.role == "super_admin"
                    and r.valid_from <= now
                    and (r.valid_to is None or now < r.valid_to)
                ),
            )
            event = RoleEvent(
                user_id=body.user_id,
                before=roles[body.user_id],
                after=body.role,
                actor_id=actor,
                occurred_at=now.isoformat(),
                reason=body.reason.strip(),
            )
            _append(conn, self.family_id, event, state.version + 1, ends)
            return _snapshot(conn, self.family_id, now)
