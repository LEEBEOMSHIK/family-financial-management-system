from datetime import datetime

from pydantic import Field

from ..models import Model


class EvidenceItem(Model):
    id: str
    media_type: str
    byte_size: int
    created_at: datetime
    sha256: str


class EvidenceAttach(Model):
    evidence_ids: list[str] = Field(min_length=1, max_length=5)
