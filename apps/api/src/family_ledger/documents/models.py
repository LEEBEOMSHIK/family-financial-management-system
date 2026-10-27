from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from ..models import Model

DocumentKind = Literal["bank", "family"]


class DocumentUpload(Model):
    kind: DocumentKind
    title: str = Field(min_length=1, max_length=120)
    category: str = Field(default="기타", min_length=1, max_length=40)
    description: str = Field(default="", max_length=1000)
    filename: str = Field(min_length=1, max_length=180)
    operation_id: UUID
    root_id: UUID | None = None

    @field_validator("title", "category", "filename")
    @classmethod
    def trimmed(cls, value: str) -> str:
        if not value.strip() or any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise ValueError("비어 있거나 제어 문자가 있는 이름은 사용할 수 없습니다.")
        return value.strip()


class BankSync(Model):
    status: Literal['synced', 'needs_review']
    period_start: date | None = None
    period_end: date | None = None
    requested_at: datetime | None = None
    transaction_start: datetime | None = None
    transaction_end: datetime | None = None
    added: int
    duplicates: int
    error: str | None = None
    completed_at: datetime


class DocumentItem(Model):
    id: str
    root_id: str
    version: int
    kind: DocumentKind
    title: str
    category: str
    description: str
    filename: str
    media_type: str
    byte_size: int
    created_at: datetime
    actor_name: str
    processing_status: Literal["stored", "format_review_required", "synced"]
    sync: BankSync | None = None
    scan_status: Literal["not_scanned"] = "not_scanned"


class DocumentList(Model):
    items: list[DocumentItem]
    total: int


class ManagedEvidence(Model):
    id: str
    request_id: str
    purpose: str
    requester_name: str
    media_type: str
    byte_size: int
    created_at: datetime
    approved_evidence: bool


class ManagedEvidenceList(Model):
    items: list[ManagedEvidence]
    total: int
