import hashlib
from datetime import datetime
from uuid import uuid4

from ..auth import AuthError
from ..banking.crypto import cipher, decrypt
from ..banking.repository import BankRepository
from ..dues.matching import reconcile
from .files import inspect_file
from .models import (
    DocumentItem,
    DocumentList,
    DocumentUpload,
    ManagedEvidence,
    ManagedEvidenceList,
)
from .sync import summary, synchronize

FIELDS = "d.id,d.root_id,d.version,d.kind,d.title,d.category,d.description,d.filename,d.media_type,d.byte_size,d.created_at,a.display_name AS actor_name"


class DocumentRepository(BankRepository):
    def require(self, conn, family: str, actor: str, now: datetime) -> None:
        self.lock(conn, family)
        if not self.authority(conn, family, actor, now):
            raise AuthError(
                403, "FORBIDDEN", "문서 관리는 총무·총괄관리자만 사용할 수 있습니다."
            )

    def authorize(self, family: str, actor: str, now: datetime) -> None:
        with self.connect() as conn:
            self.require(conn, family, actor, now)

    @staticmethod
    def item(conn, family: str, row) -> DocumentItem:
        sync = summary(conn, family, row["id"]) if row["kind"] == "bank" else None
        return DocumentItem(
            **{key: row[key] for key in DocumentItem.model_fields if key in row},
            sync=sync,
            processing_status="synced" if sync and sync.status == "synced" else "format_review_required"
            if row["kind"] == "bank"
            else "stored",
        )

    @staticmethod
    def find(conn, family: str, document_id: str):
        row = conn.execute(
            f"SELECT {FIELDS},d.original_cipher,d.sha256,d.operation_id FROM managed_document d JOIN account a ON a.id=d.actor_id WHERE d.family_id=%s AND d.id=%s",
            (family, document_id),
        ).fetchone()
        if not row:
            raise AuthError(404, "NOT_FOUND", "문서를 찾을 수 없습니다.")
        return row

    def create(
        self, family: str, actor: str, body: DocumentUpload, data: bytes, now: datetime
    ) -> DocumentItem:
        self.authorize(family, actor, now)
        mime = inspect_file(body.filename, data, body.kind)
        digest = hashlib.sha256(data).hexdigest()
        encrypted = cipher().encrypt(data)
        with self.connect() as conn:
            self.require(conn, family, actor, now)
            previous = conn.execute(
                "SELECT id FROM managed_document WHERE family_id=%s AND actor_id=%s AND operation_id=%s",
                (family, actor, str(body.operation_id)),
            ).fetchone()
            if previous:
                row = self.find(conn, family, previous["id"])
                same = all(
                    row[name] == getattr(body, name)
                    for name in ("kind", "title", "category", "description", "filename")
                )
                expected_root = str(body.root_id) if body.root_id else row["id"]
                if (
                    not same
                    or row["sha256"] != digest
                    or row["root_id"] != expected_root
                ):
                    raise AuthError(
                        409,
                        "OPERATION_CONFLICT",
                        "이미 사용된 업로드 작업입니다. 목록을 확인해 주세요.",
                    )
                return self.item(conn, family, row)
            identifier = str(uuid4())
            root = str(body.root_id) if body.root_id else identifier
            version = 1
            if body.root_id:
                original = self.find(conn, family, root)
                if original["root_id"] != root or original["kind"] != body.kind:
                    raise AuthError(
                        422,
                        "INVALID_VERSION",
                        "같은 종류 문서에만 새 버전을 추가할 수 있습니다.",
                    )
                version = conn.execute(
                    "SELECT max(version)+1 AS version FROM managed_document WHERE family_id=%s AND root_id=%s",
                    (family, root),
                ).fetchone()["version"]
            conn.execute(
                "INSERT INTO managed_document(id,family_id,actor_id,root_id,version,kind,title,category,description,filename,media_type,byte_size,sha256,original_cipher,operation_id,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    identifier,
                    family,
                    actor,
                    root,
                    version,
                    body.kind,
                    body.title,
                    body.category,
                    body.description,
                    body.filename,
                    mime,
                    len(data),
                    digest,
                    encrypted,
                    str(body.operation_id),
                    now,
                ),
            )
            if body.kind == "bank":
                synchronize(conn, family, identifier, data, body.filename, now)
                reconcile(conn, family, actor, now)
            return self.item(conn, family, self.find(conn, family, identifier))

    def sync_document(self, family: str, actor: str, document_id: str, now: datetime) -> DocumentItem:
        with self.connect() as conn:
            self.require(conn, family, actor, now)
            row = self.find(conn, family, document_id)
            if row['kind'] != 'bank':
                raise AuthError(422, 'INVALID_DOCUMENT', '통장 내역 문서만 동기화할 수 있습니다.')
            data = decrypt(row['original_cipher'])
            inspect_file(row['filename'], data, 'bank')
            synchronize(conn, family, document_id, data, row['filename'], now)
            reconcile(conn, family, actor, now)
            return self.item(conn, family, row)

    def listing(
        self,
        family: str,
        actor: str,
        now: datetime,
        kind: str | None,
        q: str,
        offset: int,
    ) -> DocumentList:
        with self.connect() as conn:
            self.require(conn, family, actor, now)
            where = "d.family_id=%s AND (%s::text IS NULL OR d.kind=%s) AND NOT EXISTS(SELECT 1 FROM managed_document n WHERE n.family_id=d.family_id AND n.root_id=d.root_id AND n.version>d.version) AND strpos(lower(d.title || ' ' || d.filename || ' ' || d.category),lower(%s))>0"
            params = (family, kind, kind, q)
            total = conn.execute(
                "SELECT count(*) AS total FROM managed_document d WHERE " + where,
                params,
            ).fetchone()["total"]
            rows = conn.execute(
                f"SELECT {FIELDS} FROM managed_document d JOIN account a ON a.id=d.actor_id WHERE "
                + where
                + " ORDER BY d.created_at DESC,d.id LIMIT 30 OFFSET %s",
                (*params, offset),
            ).fetchall()
            return DocumentList(items=[self.item(conn, family, row) for row in rows], total=total)

    def versions(
        self, family: str, actor: str, document_id: str, now: datetime
    ) -> DocumentList:
        with self.connect() as conn:
            self.require(conn, family, actor, now)
            root = self.find(conn, family, document_id)["root_id"]
            rows = conn.execute(
                f"SELECT {FIELDS} FROM managed_document d JOIN account a ON a.id=d.actor_id WHERE d.family_id=%s AND d.root_id=%s ORDER BY version DESC",
                (family, root),
            ).fetchall()
            return DocumentList(items=[self.item(conn, family, row) for row in rows], total=len(rows))

    def download(
        self, family: str, actor: str, document_id: str, now: datetime
    ) -> tuple[bytes, str, str]:
        with self.connect() as conn:
            self.require(conn, family, actor, now)
            row = self.find(conn, family, document_id)
            data = decrypt(row["original_cipher"])
            conn.execute(
                "INSERT INTO document_download VALUES (%s,%s,%s,%s,NULL,%s)",
                (str(uuid4()), family, actor, document_id, now),
            )
            return data, row["media_type"], row["filename"]

    def evidence(
        self, family: str, actor: str, now: datetime, q: str, offset: int
    ) -> ManagedEvidenceList:
        with self.connect() as conn:
            self.require(conn, family, actor, now)
            source = "FROM evidence e JOIN expense_evidence l ON l.family_id=e.family_id AND l.evidence_id=e.id JOIN expense_request r ON r.family_id=l.family_id AND r.id=l.request_id JOIN account a ON a.id=r.requester_id LEFT JOIN expense_decision d ON d.family_id=r.family_id AND d.request_id=r.id WHERE e.family_id=%s AND strpos(lower(r.purpose || ' ' || a.display_name),lower(%s))>0"
            total = conn.execute(
                "SELECT count(*) AS total " + source, (family, q)
            ).fetchone()["total"]
            rows = conn.execute(
                "SELECT e.id,r.id AS request_id,r.purpose,a.display_name AS requester_name,e.media_type,e.byte_size,e.created_at,COALESCE(d.decision='approved' AND e.id=ANY(d.evidence_ids),false) AS approved_evidence "
                + source
                + " ORDER BY e.created_at DESC,e.id LIMIT 30 OFFSET %s",
                (family, q, offset),
            ).fetchall()
            return ManagedEvidenceList(
                items=[ManagedEvidence(**row) for row in rows], total=total
            )

    def evidence_download(
        self, family: str, actor: str, evidence_id: str, now: datetime
    ) -> tuple[bytes, str, str]:
        with self.connect() as conn:
            self.require(conn, family, actor, now)
            row = conn.execute(
                "SELECT e.original_cipher,e.media_type FROM evidence e JOIN expense_evidence l ON l.family_id=e.family_id AND l.evidence_id=e.id WHERE e.family_id=%s AND e.id=%s",
                (family, evidence_id),
            ).fetchone()
            if not row:
                raise AuthError(404, "NOT_FOUND", "증빙을 찾을 수 없습니다.")
            data = decrypt(row["original_cipher"])
            conn.execute(
                "INSERT INTO document_download VALUES (%s,%s,%s,NULL,%s,%s)",
                (str(uuid4()), family, actor, evidence_id, now),
            )
            extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[
                row["media_type"]
            ]
            return data, row["media_type"], f"evidence-{evidence_id}.{extension}"
