from datetime import datetime

from pydantic import Field, field_validator

from ..models import Model


class BankAccountCreate(Model):
    bank_name: str = Field(min_length=1, max_length=80)
    account_holder: str = Field(min_length=1, max_length=80)
    account_number: str = Field(pattern=r"^[0-9][0-9 -]{4,38}[0-9]$")
    label: str = Field(default="", max_length=80)
    make_default: bool = False

    @field_validator("bank_name", "account_holder")
    @classmethod
    def required_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Required text")
        return value.strip()

    @field_validator("account_number")
    @classmethod
    def number(cls, value: str) -> str:
        value = value.replace(" ", "").replace("-", "")
        if not 6 <= len(value) <= 32:
            raise ValueError("Invalid account number")
        return value


class BankAccount(Model):
    id: str
    bank_name: str
    account_holder: str
    label: str
    masked_number: str
    created_at: datetime


class BankAccountList(Model):
    items: list[BankAccount]
    default_account_id: str | None


class AccountReveal(Model):
    account_number: str
