"""Local password identities with revocable PostgreSQL sessions.

This provider is for a loopback development installation, not an Internet deployment.
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from .auth_models import PasswordLogin, RegisterRequest
from .domain import FAMILY


class AuthError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


@dataclass
class AuthSession:
    user_id: str
    family_id: str
    csrf_token: str
    expires_at: datetime


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=32768,
        r=8,
        p=1,
        dklen=32,
        maxmem=64 * 1024 * 1024,
    )
    return f"scrypt${salt.hex()}${derived.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt, _ = encoded.split("$")
        return algorithm == "scrypt" and secrets.compare_digest(
            hash_password(password, bytes.fromhex(salt)), encoded
        )
    except (ValueError, TypeError):
        return False


DUMMY_HASH = hash_password("dummy-password-for-timing", b"0" * 16)


class LocalAuth:
    def __init__(self, dsn: str):
        self.dsn = dsn

    def connect(self):
        return psycopg.connect(self.dsn, row_factory=dict_row)

    def throttle(self, username: str, remote: str, now: datetime) -> None:
        # Commit attempts even when later credential verification is rejected.
        blocked = False
        with self.connect() as conn:
            for value, limit in (("user:" + username, 10), ("ip:" + remote, 60)):
                row = conn.execute(
                    """INSERT INTO auth_throttle(key_hash, attempts, window_start)
                       VALUES (%s, 1, %s) ON CONFLICT(key_hash) DO UPDATE SET
                       attempts = CASE WHEN auth_throttle.window_start <= %s
                           THEN 1 ELSE auth_throttle.attempts + 1 END,
                       window_start = CASE WHEN auth_throttle.window_start <= %s
                           THEN EXCLUDED.window_start ELSE auth_throttle.window_start END
                       RETURNING attempts""",
                    (
                        digest(value),
                        now,
                        now - timedelta(minutes=15),
                        now - timedelta(minutes=15),
                    ),
                ).fetchone()
                blocked = blocked or row["attempts"] > limit
        if blocked:
            raise AuthError(429, "AUTH_THROTTLED", "잠시 후 다시 로그인해 주세요.")

    def login(self, body: PasswordLogin, remote: str, now: datetime) -> str:
        self.throttle(body.username, remote, now)
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM account WHERE username=%s", (body.username,)
            ).fetchone()
        valid = verify_password(
            body.password, row["password_hash"] if row else DUMMY_HASH
        )
        if not row or not valid or not row["active"]:
            raise AuthError(
                401, "INVALID_CREDENTIALS", "아이디 또는 비밀번호를 확인해 주세요."
            )
        return row["id"]

    def create_session(self, user_id: str, now: datetime) -> tuple[str, AuthSession]:
        token = secrets.token_urlsafe(32)
        session = AuthSession(
            user_id, FAMILY, secrets.token_urlsafe(32), now + timedelta(hours=8)
        )
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO auth_session(token_hash,user_id,family_id,csrf_token,expires_at) VALUES (%s,%s,%s,%s,%s)",
                (
                    digest(token),
                    user_id,
                    FAMILY,
                    session.csrf_token,
                    session.expires_at,
                ),
            )
        return token, session

    def session(
        self, token: str, now: datetime, require_active: bool = True
    ) -> AuthSession | None:
        with self.connect() as conn:
            row = conn.execute(
                """SELECT s.user_id,s.family_id,s.csrf_token,s.expires_at
                FROM auth_session s JOIN account a ON a.id=s.user_id
                WHERE s.token_hash=%s AND s.revoked_at IS NULL AND s.expires_at>%s AND (a.active OR NOT %s)""",
                (digest(token), now, require_active),
            ).fetchone()
        return AuthSession(**row) if row else None

    def revoke(self, token: str, now: datetime) -> None:
        with self.connect() as conn:
            conn.execute(
                "UPDATE auth_session SET revoked_at=%s WHERE token_hash=%s AND revoked_at IS NULL",
                (now, digest(token)),
            )

    def display_name(self, user_id: str) -> str:
        with self.connect() as conn:
            return conn.execute(
                "SELECT display_name FROM account WHERE id=%s", (user_id,)
            ).fetchone()["display_name"]

    def invite(
        self,
        actor: str,
        family_id: str,
        now: datetime,
        participant_id: str | None = None,
    ) -> tuple[str, datetime]:
        token, expires = secrets.token_urlsafe(32), now + timedelta(days=7)
        with self.connect() as conn:
            conn.execute("SELECT id FROM family WHERE id=%s FOR UPDATE", (family_id,))
            if not self.inviter_authorized(conn, actor, family_id, now):
                raise AuthError(
                    403, "FORBIDDEN", "현재 총괄관리자만 초대할 수 있습니다."
                )
            if participant_id is not None:
                person = conn.execute(
                    "SELECT id FROM family_participant WHERE family_id=%s AND id=%s",
                    (family_id, participant_id),
                ).fetchone()
                if not person:
                    raise AuthError(404, "NOT_FOUND", "구성원을 찾을 수 없습니다.")
                if conn.execute(
                    "SELECT 1 FROM account WHERE id=%s", (participant_id,)
                ).fetchone():
                    raise AuthError(
                        409,
                        "ACCOUNT_ALREADY_LINKED",
                        "이미 계정이 연결된 구성원입니다.",
                    )
            conn.execute(
                "INSERT INTO invitation(token_hash,family_id,actor_id,expires_at,created_at) VALUES (%s,%s,%s,%s,%s)",
                (digest(token), family_id, actor, expires, now),
            )
            if participant_id is not None:
                conn.execute(
                    "INSERT INTO participant_invitation(token_hash,family_id,participant_id) VALUES (%s,%s,%s)",
                    (digest(token), family_id, participant_id),
                )
        return token, expires

    @staticmethod
    def inviter_authorized(conn, actor: str, family_id: str, now: datetime) -> bool:
        return (
            conn.execute(
                """SELECT 1 FROM account u
               JOIN membership m ON m.user_id=u.id AND m.family_id=%s
               JOIN role_assignment a ON a.user_id=m.user_id AND a.family_id=m.family_id
               LEFT JOIN role_assignment_end e ON e.assignment_id=a.id AND e.family_id=a.family_id
               WHERE u.id=%s AND u.active AND m.active AND a.role='super_admin'
               AND a.valid_from<=%s AND (a.valid_to IS NULL OR a.valid_to>%s)
               AND (e.ended_at IS NULL OR e.ended_at>%s) LIMIT 1""",
                (family_id, actor, now, now, now),
            ).fetchone()
            is not None
        )

    def register(self, body: RegisterRequest, remote: str, now: datetime) -> str:
        self.throttle("registration:" + body.username, remote, now)
        encoded = hash_password(body.password)
        user_id = str(uuid4())
        try:
            with self.connect() as conn:
                # Same lock order as role changes: family, then invitation.
                conn.execute("SELECT id FROM family WHERE id=%s FOR UPDATE", (FAMILY,))
                row = conn.execute(
                    "SELECT * FROM invitation WHERE token_hash=%s FOR UPDATE",
                    (digest(body.invite_token),),
                ).fetchone()
                if (
                    not row
                    or row["used_at"] is not None
                    or row["expires_at"] <= now
                    or row["family_id"] != FAMILY
                    or not self.inviter_authorized(conn, row["actor_id"], FAMILY, now)
                ):
                    raise AuthError(
                        400,
                        "REGISTRATION_REJECTED",
                        "초대 코드와 가입 정보를 확인해 주세요.",
                    )
                target = conn.execute(
                    "SELECT participant_id FROM participant_invitation WHERE token_hash=%s AND family_id=%s",
                    (digest(body.invite_token), FAMILY),
                ).fetchone()
                if target:
                    user_id = target["participant_id"]
                conn.execute(
                    "INSERT INTO account(id,username,display_name,password_hash) VALUES (%s,%s,%s,%s)",
                    (user_id, body.username, body.display_name.strip(), encoded),
                )
                conn.execute(
                    "INSERT INTO membership(family_id,user_id,active) VALUES (%s,%s,true)",
                    (FAMILY, user_id),
                )
                conn.execute(
                    "UPDATE invitation SET used_at=%s,used_by=%s WHERE token_hash=%s",
                    (now, user_id, digest(body.invite_token)),
                )
                conn.execute(
                    "UPDATE family SET role_version=role_version+1 WHERE id=%s",
                    (FAMILY,),
                )
        except psycopg.errors.UniqueViolation as exc:
            raise AuthError(
                400, "REGISTRATION_REJECTED", "초대 코드와 가입 정보를 확인해 주세요."
            ) from exc
        return user_id


def bootstrap_admin(
    owner_dsn: str,
    username: str,
    password: str,
    display_name: str = "총괄관리자",
    valid_to: datetime | None = None,
) -> str:
    """Explicit owner-only first setup. Never creates or overwrites later accounts."""
    credentials = PasswordLogin(username=username, password=password)
    now = datetime.now(UTC)
    if valid_to is not None and (valid_to.tzinfo is None or valid_to <= now):
        raise ValueError("An explicit future timezone-aware role expiry is required")
    if not display_name.strip() or len(display_name) > 60:
        raise ValueError("Invalid display name")
    encoded, user_id = hash_password(credentials.password), str(uuid4())
    with psycopg.connect(owner_dsn) as conn:
        conn.execute("SELECT id FROM family WHERE id=%s FOR UPDATE", (FAMILY,))
        conn.execute("LOCK TABLE account IN EXCLUSIVE MODE")
        if conn.execute("SELECT 1 FROM account LIMIT 1").fetchone():
            raise ValueError(
                "Initial setup already completed; refusing to create another administrator"
            )
        conn.execute(
            "INSERT INTO account(id,username,display_name,password_hash) VALUES (%s,%s,%s,%s)",
            (user_id, credentials.username, display_name.strip(), encoded),
        )
        conn.execute(
            "INSERT INTO membership(family_id,user_id,active) VALUES (%s,%s,true)",
            (FAMILY, user_id),
        )
        conn.execute(
            "INSERT INTO role_assignment(family_id,user_id,role,valid_from,valid_to) VALUES (%s,%s,'super_admin',%s,%s)",
            (FAMILY, user_id, now, valid_to),
        )
        version = conn.execute(
            "UPDATE family SET role_version=role_version+1 WHERE id=%s RETURNING role_version",
            (FAMILY,),
        ).fetchone()[0]
        conn.execute(
            """INSERT INTO role_event(family_id,version,user_id,before_role,after_role,actor_id,occurred_at,reason)
                     VALUES (%s,%s,%s,'member','super_admin',%s,%s,%s)""",
            (
                FAMILY,
                version,
                user_id,
                user_id,
                now.isoformat(),
                "Explicit initial administrator setup",
            ),
        )
        conn.execute(
            "UPDATE membership SET active=false WHERE family_id=%s AND user_id LIKE 'synthetic-%%'",
            (FAMILY,),
        )
    return user_id
