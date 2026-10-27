from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from ..models import Model, Money

Month = Annotated[str, Field(pattern=r"^[0-9]{4}-(0[1-9]|1[0-2])$")]
Kind = Literal["fee", "deadline", "payment", "reversal", "reminder"]


def first_fee_month(starts_on: date) -> str:
    return date(
        starts_on.year + (starts_on.month == 12), starts_on.month % 12 + 1, 1
    ).strftime("%Y-%m")


class DuesCommand(Model):
    kind: Kind
    starts_on: date | None = None
    operation_id: UUID
    month: Month
    member_id: UUID | None = None
    amount_krw: Money | None = None
    due_day: int | None = Field(default=None, ge=1, le=31)
    transaction_id: UUID | None = None
    payment_id: UUID | None = None

    @field_validator("month")
    @classmethod
    def valid_month(cls, value: str) -> str:
        date.fromisoformat(value + "-01")
        return value

    @model_validator(mode="after")
    def fields_for_kind(self):
        if self.starts_on is not None and (
            self.kind != "fee" or self.month != first_fee_month(self.starts_on)
        ):
            raise ValueError("회비 적용 월은 시작일 다음 달이어야 합니다.")
        required = {
            "fee": {"member_id", "amount_krw"},
            "deadline": {"due_day"},
            "payment": {"member_id", "transaction_id"},
            "reversal": {"payment_id"},
            "reminder": {"member_id"},
        }[self.kind]
        supplied = {
            key
            for key in (
                "member_id",
                "amount_krw",
                "due_day",
                "transaction_id",
                "payment_id",
            )
            if getattr(self, key) is not None
        }
        if supplied != required:
            raise ValueError("작업에 필요한 항목을 확인해 주세요.")
        if (
            self.amount_krw is not None
            and not 0 < int(self.amount_krw) <= 9223372036854775807
        ):
            raise ValueError("회비는 1원 이상의 정수여야 합니다.")
        return self


class Birthday(Model):
    year: int | None = Field(default=None, ge=1, le=9999)
    calendar: Literal["solar", "lunar"]
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    leap_month: bool = False

    @model_validator(mode="after")
    def valid_birthday(self):
        if self.calendar == "solar":
            date(self.year or 2000, self.month, self.day)
            if self.leap_month:
                raise ValueError("양력 생일에는 윤달을 선택할 수 없습니다.")
        elif self.day > 30:
            raise ValueError("음력 생일은 1~30일로 입력해 주세요.")
        return self


class DuesMember(Model):
    next_fee_month: str | None = None
    next_fee_id: str | None = None
    next_fee_start_on: date | None = None
    next_fee_amount_krw: Money | None = None
    birthday: Birthday | None = None
    profile_version: int = 0
    has_account: bool
    id: str
    name: str
    amount_krw: Money | None
    paid_krw: Money
    remaining_krw: Money | None
    excess_krw: Money
    status: Literal[
        "unconfigured", "pending", "partial", "paid", "overdue", "awaiting_data"
    ]
    last_requested_at: datetime | None


class DuesEvent(Model):
    auto_matched: bool = False
    transaction_id: str | None = None
    superseded: bool = False
    starts_on: date | None = None
    id: str
    kind: Kind
    month: str
    member_id: str | None
    member_name: str | None
    actor_name: str
    amount_krw: Money | None
    due_day: int | None
    created_at: datetime
    reversed: bool = False


class DuesDeposit(Model):
    id: str
    occurred_at: datetime
    description: str
    amount_krw: Money


class DuesReviewDeposit(DuesDeposit):
    reason: Literal["reversed", "name_mismatch", "ambiguous_name", "policy_not_configured", "awaiting_match"]


class ReconcileResult(Model):
    matched_count: int
    message: str


class DuesOverview(Model):
    matching_review_count: int
    review_deposits: list[DuesReviewDeposit]
    overdue_count: int | None
    overdue_krw: Money | None
    month: str
    today: date
    due_day: int | None
    due_on: date | None
    data_through: date | None
    coverage_complete: bool
    can_configure: bool
    outstanding_count: int
    unconfigured_count: int
    remaining_krw: Money
    members: list[DuesMember]
    deposits: list[DuesDeposit]
    events: list[DuesEvent]


class DuesResult(Model):
    id: str
    message: str


class ParticipantProfile(Model):
    birthday: Birthday | None = None
    name: str = Field(min_length=1, max_length=60)
    operation_id: UUID

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(c) < 32 for c in value):
            raise ValueError("구성원 이름을 확인해 주세요.")
        return value


class ParticipantCreate(ParticipantProfile):
    amount_krw: Money | None = None
    fee_month: Month | None = None
    fee_start_on: date | None = None

    @model_validator(mode="after")
    def initial_fee(self):
        if self.fee_month is not None and self.fee_start_on is not None:
            raise ValueError("시작일 또는 이전 적용 월 형식 중 하나만 입력해 주세요.")
        period = self.fee_start_on if self.fee_start_on is not None else self.fee_month
        if (self.amount_krw is None) != (period is None):
            raise ValueError("회비와 적용 시작일을 함께 입력해 주세요.")
        if self.amount_krw is not None:
            if not 0 < int(self.amount_krw) <= 9223372036854775807:
                raise ValueError("회비는 1원 이상의 정수여야 합니다.")
            if self.fee_start_on is not None:
                first_fee_month(self.fee_start_on)
            else:
                date.fromisoformat(self.fee_month + "-01")

        return self


class ParticipantUpdate(ParticipantCreate):
    replaces_fee_id: UUID | None = None
    expected_version: int = Field(ge=0)

    @model_validator(mode="after")
    def update_fee_date(self):
        if self.replaces_fee_id is not None and self.amount_krw is None:
            raise ValueError("대체할 회비 금액과 시작일을 입력해 주세요.")
        if self.amount_krw is not None and self.fee_start_on is None:
            raise ValueError("회비 변경에는 시작일을 입력해 주세요.")
        return self
