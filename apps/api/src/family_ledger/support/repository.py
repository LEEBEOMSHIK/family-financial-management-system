import base64
import binascii
import hashlib
from datetime import datetime
from uuid import uuid4

from psycopg.types.json import Jsonb

from ..auth import AuthError
from ..banking.crypto import cipher, decrypt
from ..banking.repository import BankRepository
from ..evidence.images import inspect_image
from ..expenses.repository import ExpenseRepository
from .models import IssueCreate, IssueEventCreate, IssueItem, IssueList

FIELDS = "i.id,i.family_id,i.actor_id,i.title,i.description,i.path,i.screen_name,i.viewport_width,i.viewport_height,i.pins,i.created_at,(i.image_cipher IS NOT NULL) AS has_image,a.display_name AS author_name"


class SupportRepository(BankRepository):
    @staticmethod
    def access(conn, family: str, actor: str, now: datetime) -> bool:
        ExpenseRepository.authority(conn, family, actor, now)
        return ExpenseRepository.has_role(conn, family, actor, "super_admin", now)

    @staticmethod
    def find(conn, family: str, actor: str, manager: bool, identifier: str):
        row = conn.execute(
            f"SELECT {FIELDS} FROM support_issue i JOIN account a ON a.id=i.actor_id WHERE i.family_id=%s AND i.id=%s AND (%s OR i.actor_id=%s)",
            (family, identifier, manager, actor),
        ).fetchone()
        if not row:
            raise AuthError(404, "NOT_FOUND", "문의를 찾을 수 없습니다.")
        return row

    @staticmethod
    def item(conn, row) -> IssueItem:
        events = conn.execute(
            "SELECT e.version,a.display_name AS actor_name,e.comment,e.status,e.created_at FROM support_event e JOIN account a ON a.id=e.actor_id WHERE e.family_id=%s AND e.issue_id=%s ORDER BY version",
            (row["family_id"], row["id"]),
        ).fetchall()
        return IssueItem(
            **{
                k: row[k]
                for k in (
                    "id",
                    "title",
                    "description",
                    "path",
                    "screen_name",
                    "viewport_width",
                    "viewport_height",
                    "pins",
                    "author_name",
                    "created_at",
                )
            },
            has_image=row["has_image"],
            status=next(
                (e["status"] for e in reversed(events) if e["status"]), "received"
            ),
            version=len(events),
            events=events,
        )

    def listing(
        self,
        family: str,
        actor: str,
        now: datetime,
        q: str,
        status: str | None,
        offset: int,
    ) -> IssueList:
        with self.connect() as conn:
            manager = self.access(conn, family, actor, now)
            where = "i.family_id=%s AND (%s OR i.actor_id=%s) AND strpos(lower(i.title || ' ' || i.description),lower(%s))>0 AND (%s::text IS NULL OR COALESCE((SELECT e.status FROM support_event e WHERE e.family_id=i.family_id AND e.issue_id=i.id AND e.status IS NOT NULL ORDER BY e.version DESC LIMIT 1),'received')=%s)"
            args = (family, manager, actor, q, status, status)
            total = conn.execute(
                "SELECT count(*) AS n FROM support_issue i WHERE " + where, args
            ).fetchone()["n"]
            rows = conn.execute(
                f"SELECT {FIELDS} FROM support_issue i JOIN account a ON a.id=i.actor_id WHERE "
                + where
                + " ORDER BY i.created_at DESC,i.id LIMIT 30 OFFSET %s",
                (*args, offset),
            ).fetchall()
            return IssueList(
                items=[self.item(conn, row) for row in rows],
                total=total,
                can_manage=manager,
            )

    def detail(
        self, family: str, actor: str, identifier: str, now: datetime
    ) -> IssueItem:
        with self.connect() as conn:
            return self.item(
                conn,
                self.find(
                    conn,
                    family,
                    actor,
                    self.access(conn, family, actor, now),
                    identifier,
                ),
            )

    def image(self, family: str, actor: str, identifier: str, now: datetime) -> bytes:
        with self.connect() as conn:
            row = self.find(
                conn, family, actor, self.access(conn, family, actor, now), identifier
            )
            if not row["has_image"]:
                raise AuthError(404, "NOT_FOUND", "첨부 화면이 없습니다.")
            image = conn.execute(
                "SELECT image_cipher FROM support_issue WHERE family_id=%s AND id=%s",
                (family, identifier),
            ).fetchone()
            return decrypt(image["image_cipher"])

    def create(
        self, family: str, actor: str, body: IssueCreate, now: datetime
    ) -> IssueItem:
        digest = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
        with self.connect() as conn:
            self.lock(conn, family)
            manager = self.access(conn, family, actor, now)
            old = conn.execute(
                "SELECT id,digest FROM support_issue WHERE family_id=%s AND actor_id=%s AND operation_id=%s",
                (family, actor, str(body.operation_id)),
            ).fetchone()
            if old:
                if old["digest"] != digest:
                    raise AuthError(
                        409,
                        "OPERATION_CONFLICT",
                        "등록 내용이 변경되었습니다. 새 등록 작업으로 시도해 주세요.",
                    )
                return self.item(
                    conn, self.find(conn, family, actor, manager, old["id"])
                )
            encrypted = None
            if body.image_base64:
                try:
                    raw = base64.b64decode(body.image_base64, validate=True)
                except (ValueError, binascii.Error):
                    raise AuthError(
                        422, "INVALID_IMAGE", "첨부 화면을 다시 확인해 주세요."
                    ) from None
                _, clean = inspect_image(raw)
                encrypted = cipher().encrypt(clean)
            identifier = str(uuid4())
            conn.execute(
                "INSERT INTO support_issue VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    identifier,
                    family,
                    actor,
                    str(body.operation_id),
                    digest,
                    body.title,
                    body.description,
                    body.path,
                    body.screen_name,
                    body.viewport_width,
                    body.viewport_height,
                    Jsonb([p.model_dump() for p in body.pins]),
                    encrypted,
                    now,
                ),
            )
            return self.item(conn, self.find(conn, family, actor, manager, identifier))

    def event(
        self,
        family: str,
        actor: str,
        identifier: str,
        body: IssueEventCreate,
        now: datetime,
    ) -> IssueItem:
        digest = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
        with self.connect() as conn:
            self.lock(conn, family)
            manager = self.access(conn, family, actor, now)
            row = self.find(conn, family, actor, manager, identifier)
            if body.status is not None and not manager:
                raise AuthError(
                    403, "FORBIDDEN", "처리 상태는 총괄관리자만 변경할 수 있습니다."
                )
            old = conn.execute(
                "SELECT digest FROM support_event WHERE family_id=%s AND issue_id=%s AND actor_id=%s AND operation_id=%s",
                (family, identifier, actor, str(body.operation_id)),
            ).fetchone()
            current = self.item(conn, row)
            if old:
                if old["digest"] != digest:
                    raise AuthError(
                        409,
                        "OPERATION_CONFLICT",
                        "같은 작업으로 다른 내용을 저장할 수 없습니다.",
                    )
                return current
            if body.expected_version != current.version:
                raise AuthError(
                    409,
                    "VERSION_CONFLICT",
                    "새 답변이나 상태 변경이 있습니다. 새로고침한 뒤 다시 확인해 주세요.",
                )
            conn.execute(
                "INSERT INTO support_event VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    str(uuid4()),
                    family,
                    identifier,
                    actor,
                    current.version + 1,
                    str(body.operation_id),
                    digest,
                    body.comment,
                    body.status,
                    now,
                ),
            )
            return self.item(conn, row)
