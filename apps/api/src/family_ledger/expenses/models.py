from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from ..banking.models import BankAccount
from ..evidence.models import EvidenceItem
from ..models import Model


class ExpenseCreate(Model):
    amount_krw: str = Field(pattern=r"^[1-9][0-9]{0,18}$")
    purpose: str = Field(min_length=1, max_length=500)
    request_type: Literal["reimbursement", "advance"]
    bank_account_id: str = Field(min_length=1, max_length=80)
    evidence_ids: list[str] = Field(default_factory=list, max_length=5)
    requested_on: date
    operation_id: UUID

    @field_validator("amount_krw")
    @classmethod
    def amount_limit(cls, value: str) -> str:
        if int(value) > 9223372036854775807:
            raise ValueError("Amount exceeds integer storage")
        return value

    @field_validator("purpose")
    @classmethod
    def meaningful_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Required text")
        return value


class ExpenseDecisionInput(Model):
    decision: Literal["approved", "rejected"]
    comment: str = Field(min_length=1, max_length=500)

    @field_validator("comment")
    @classmethod
    def comment_required(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Decision reason required")
        return value.strip()


class PaymentInput(Model):
    paid_on: date
    note: str = Field(default="", max_length=500)
    confirmed: Literal[True]
    operation_id: UUID


class PaymentRecord(Model):
    actor_name: str
    paid_on: date
    recorded_at: datetime
    note: str


class ExpenseItem(Model):
    id: str
    requires_super_admin: bool
    requester_id: str
    requester_name: str
    amount_krw: str
    purpose: str
    payee_name: str
    requested_on: date
    created_at: datetime
    status: Literal["submitted", "approved", "rejected"]
    actor_name: str | None = None
    comment: str | None = None
    decided_at: datetime | None = None
    policy_version: str | None = None
    request_type: Literal["reimbursement", "advance", "legacy"]
    bank_account: BankAccount | None
    evidence: list[EvidenceItem]
    decision_evidence_ids: list[str]
    payment: PaymentRecord | None
    can_record_payment: bool
    approval_notice: Literal["not_required", "not_recorded", "configuration_required"]


class ExpenseList(Model):
    items: list[ExpenseItem]
    approval_configured: bool
