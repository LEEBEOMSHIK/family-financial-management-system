from dataclasses import replace
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from family_ledger.domain import FAMILY, ReadService, SyntheticRepository
from family_ledger.main import Config, create_app
from family_ledger.models import Transaction


def test_reviewed_synthetic_balances():
    service = ReadService(SyntheticRepository())
    month, quarter = (
        service.dashboard(FAMILY, "month"),
        service.dashboard(FAMILY, "quarter"),
    )
    assert (month.balance_krw, month.income_krw, month.expense_krw) == (
        "2450000",
        "500000",
        "200000",
    )
    assert (
        quarter.income_krw,
        quarter.expense_krw,
        quarter.approved_commitments_krw,
    ) == ("1600000", "1150000", "150000")


def test_role_interval_is_start_inclusive_end_exclusive():
    service = ReadService(SyntheticRepository())
    for instant, allowed in [
        (datetime(2025, 12, 31, tzinfo=UTC), False),
        (datetime(2026, 1, 1, tzinfo=UTC), True),
        (datetime(2027, 1, 1, tzinfo=UTC), False),
    ]:
        assert (
            "manage" in service.capabilities("synthetic-treasurer", FAMILY, instant)
        ) is allowed


@pytest.mark.parametrize("amount", [1.5, 1, "1.5", "1e3"])
def test_money_contract_rejects_floats_numbers_and_exponents(amount):
    row = SyntheticRepository().transactions(FAMILY)[0].model_dump()
    with pytest.raises(ValidationError):
        Transaction(**{**row, "amount_krw": amount})


def test_large_integer_aggregation_remains_exact():
    class LargeRepository(SyntheticRepository):
        def transactions(self, family_id):
            rows = super().transactions(family_id)
            return tuple(
                row.model_copy(update={"amount_krw": "9007199254740993"})
                if row.id == "t5"
                else row
                for row in rows
            )

    result = ReadService(LargeRepository()).dashboard(FAMILY, "month")
    assert result.income_krw == "9007199254740993"
    assert result.net_krw == "9007199254540993"


def test_membership_revocation_is_checked_for_existing_session():
    class RevocableRepository:
        active = True

        def memberships(self):
            return tuple(
                replace(m, active=self.active)
                for m in SyntheticRepository().memberships()
            )

        def roles(self):
            return SyntheticRepository().roles()

        def transactions(self, family_id):
            return SyntheticRepository().transactions(family_id)

    repository = RevocableRepository()
    with TestClient(
        create_app(Config("development", "development"), repository)
    ) as client:
        assert (
            client.post(
                "/api/v1/dev/session",
                json={"profile": "member"},
                headers={"Origin": "http://127.0.0.1:3000"},
            ).status_code
            == 200
        )
        repository.active = False
        assert client.get("/api/v1/session").status_code == 403
        assert client.get(f"/api/v1/families/{FAMILY}/transactions").status_code == 403
