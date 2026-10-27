from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Money = Annotated[str, Field(pattern=r"^-?(0|[1-9][0-9]*)$")]
Period = Literal["month", "quarter"]
Direction = Literal["all", "income", "expense"]
Role = Literal["member", "treasurer", "super_admin"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class LoginRequest(Model):
    profile: Role


class User(Model):
    id: str
    display_name: str


class SessionResponse(Model):
    user: User
    family_id: str
    capabilities: list[str]
    csrf_token: str
    data_mode: Literal["synthetic"] = "synthetic"


class Transaction(Model):
    id: str
    occurred_on: str
    description: str
    amount_krw: Money
    category: str
    reconciliation_status: Literal["reconciled", "pending"]
    occurred_at: str | None = None
    balance_after_krw: Money | None = None
    memo: str | None = None
    source_document_id: str | None = None
    source_document_title: str | None = None
    source_document_filename: str | None = None


class Monthly(Model):
    month: str
    income_krw: Money
    expense_krw: Money
    balance_krw: Money


class Category(Model):
    label: str
    amount_krw: Money


class DashboardResponse(Model):
    family_id: str
    data_mode: Literal["synthetic", "bank_import"] = "synthetic"
    as_of: str
    source: str
    period: Period
    balance_krw: Money | None
    balance_as_of: str | None = None
    summary_start: str | None = None
    summary_end: str | None = None
    coverage: list[str] = Field(default_factory=list)
    income_krw: Money
    expense_krw: Money
    net_krw: Money
    approved_commitments_krw: Money
    monthly: list[Monthly]
    categories: list[Category]
    recent_transactions: list[Transaction]


class TransactionsResponse(Model):
    items: list[Transaction]
    income_krw: Money
    expense_krw: Money
    net_krw: Money
    limit: int = 50
    next_cursor: None = None
    as_of: str
    data_mode: Literal["synthetic", "bank_import"] = "synthetic"
    total: int | None = None
    offset: int = 0


class ManagementResponse(Model):
    pending_approvals: int
    missing_evidence: int
    unreconciled_payments: int


class ErrorDetail(Model):
    code: str
    message: str


class RoleChange(Model):
    user_id: str
    role: Role
    expected_version: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=200, pattern=r"\S")


class RoleMember(Model):
    user_id: str
    role: Role
    display_name: str | None = None


class RoleEvent(Model):
    user_id: str
    before: Role
    after: Role
    actor_id: str
    occurred_at: str
    reason: str


class RolesResponse(Model):
    version: int
    members: list[RoleMember]
    history: list[RoleEvent]


class ErrorResponse(Model):
    error: ErrorDetail
