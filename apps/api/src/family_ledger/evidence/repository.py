import hashlib
from datetime import datetime
from uuid import uuid4

from ..auth import AuthError
from ..banking.crypto import cipher, decrypt
from ..banking.repository import BankRepository
from .images import inspect_image
from .models import EvidenceItem

FIELDS = "id,media_type,byte_size,created_at,sha256"


class EvidenceRepository(BankRepository):
    def upload(
        self, family: str, actor: str, data: bytes, now: datetime
    ) -> EvidenceItem:
        key = cipher()
        media_type, preview = inspect_image(data)
        with self.connect() as conn:
            self.lock(conn, family)
            self.authority(conn, family, actor, now)
            row = conn.execute(
                f"INSERT INTO evidence VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING {FIELDS}",
                (
                    str(uuid4()),
                    family,
                    actor,
                    media_type,
                    len(data),
                    hashlib.sha256(data).hexdigest(),
                    key.encrypt(data),
                    key.encrypt(preview),
                    now,
                ),
            ).fetchone()
            return EvidenceItem(**row)

    def preview(
        self, family: str, actor: str, evidence_id: str, now: datetime
    ) -> bytes:
        with self.connect() as conn:
            self.lock(conn, family)
            manager = self.authority(conn, family, actor, now)
            row = conn.execute(
                "SELECT e.preview_cipher FROM evidence e WHERE e.family_id=%s AND e.id=%s AND (e.user_id=%s OR (%s AND EXISTS(SELECT 1 FROM expense_evidence l WHERE l.family_id=e.family_id AND l.evidence_id=e.id)))",
                (family, evidence_id, actor, manager),
            ).fetchone()
            if not row:
                raise AuthError(404, "NOT_FOUND", "증빙을 찾을 수 없습니다.")
            return decrypt(row["preview_cipher"])

    @staticmethod
    def items(conn, family: str, request_id: str) -> list[EvidenceItem]:
        rows = conn.execute(
            "SELECT e.id,e.media_type,e.byte_size,e.created_at,e.sha256 FROM evidence e JOIN expense_evidence l ON l.family_id=e.family_id AND l.evidence_id=e.id WHERE l.family_id=%s AND l.request_id=%s ORDER BY l.created_at,e.id",
            (family, request_id),
        ).fetchall()
        return [EvidenceItem(**row) for row in rows]

    @staticmethod
    def attach(
        conn, family: str, actor: str, request_id: str, ids: list[str], now: datetime
    ) -> None:
        existing = conn.execute(
            "SELECT count(*) AS total FROM expense_evidence WHERE family_id=%s AND request_id=%s",
            (family, request_id),
        ).fetchone()["total"]
        if len(ids) != len(set(ids)) or existing + len(ids) > 5:
            raise AuthError(
                422,
                "INVALID_EVIDENCE",
                "증빙은 중복 없이 최대 5개까지 제출할 수 있습니다.",
            )
        for evidence_id in ids:
            row = conn.execute(
                "SELECT id FROM evidence WHERE family_id=%s AND user_id=%s AND id=%s",
                (family, actor, evidence_id),
            ).fetchone()
            if not row:
                raise AuthError(404, "NOT_FOUND", "증빙을 찾을 수 없습니다.")
            linked = conn.execute(
                "SELECT 1 FROM expense_evidence WHERE evidence_id=%s", (evidence_id,)
            ).fetchone()
            if linked:
                raise AuthError(
                    409, "EVIDENCE_ALREADY_ATTACHED", "이미 요청에 연결된 증빙입니다."
                )
            conn.execute(
                "INSERT INTO expense_evidence VALUES (%s,%s,%s,%s,%s)",
                (family, actor, request_id, evidence_id, now),
            )
