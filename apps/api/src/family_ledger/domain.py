"""Read services and immutable synthetic adapter; no HTTP, ORM or bank SDK."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from .models import Category, DashboardResponse, Direction, Monthly, Period, Transaction

FAMILY = "00000000-0000-4000-8000-000000000001"
AS_OF = "2026-10-23T09:00:00+09:00"


@dataclass(frozen=True)
class RoleAssignment:
    user_id: str
    family_id: str
    role: str
    valid_from: datetime
    valid_to: datetime | None


@dataclass(frozen=True)
class Membership:
    user_id: str
    family_id: str
    active: bool = True


class Repository(Protocol):
    def transactions(self, family_id: str) -> tuple[Transaction, ...]: ...
    def memberships(self) -> tuple[Membership, ...]: ...
    def roles(self) -> tuple[RoleAssignment, ...]: ...


@dataclass(frozen=True)
class SyntheticRepository:
    """Fixed fixtures, deliberately neither a database nor mutable business state."""

    def transactions(self, family_id: str) -> tuple[Transaction, ...]:
        if family_id != FAMILY:
            return ()
        rows = (
            ("t1", "2026-08-05", "합성 정기 회비", "600000", "회비", "reconciled"),
            ("t2", "2026-08-20", "합성 여름 모임", "-300000", "모임", "reconciled"),
            ("t3", "2026-09-05", "합성 정기 회비", "500000", "회비", "reconciled"),
            ("t4", "2026-09-18", "합성 행사 준비", "-650000", "행사", "reconciled"),
            ("t5", "2026-10-22", "합성 정기 회비", "500000", "회비", "reconciled"),
            ("t6", "2026-10-18", "합성 식사", "-80000", "모임", "reconciled"),
            ("t7", "2026-10-12", "합성 행사 물품", "-120000", "행사", "pending"),
        )
        return tuple(
            Transaction(
                **dict(
                    zip(
                        (
                            "id",
                            "occurred_on",
                            "description",
                            "amount_krw",
                            "category",
                            "reconciliation_status",
                        ),
                        row,
                    )
                )
            )
            for row in rows
        )

    def memberships(self) -> tuple[Membership, ...]:
        return (
            Membership("synthetic-member", FAMILY),
            Membership("synthetic-treasurer", FAMILY),
            Membership("synthetic-super_admin", FAMILY),
        )

    def roles(self) -> tuple[RoleAssignment, ...]:
        return (
            RoleAssignment(
                "synthetic-super_admin",
                FAMILY,
                "super_admin",
                datetime(2026, 1, 1, tzinfo=UTC),
                datetime(2027, 1, 1, tzinfo=UTC),
            ),
            RoleAssignment(
                "synthetic-treasurer",
                FAMILY,
                "treasurer",
                datetime(2026, 1, 1, tzinfo=UTC),
                datetime(2027, 1, 1, tzinfo=UTC),
            ),
        )


class ReadService:
    def __init__(self, repository: Repository):
        self.repository = repository

    def capabilities(self, user_id: str, family_id: str, now: datetime) -> list[str]:
        if not any(
            m.user_id == user_id and m.family_id == family_id and m.active
            for m in self.repository.memberships()
        ):
            return []
        roles = self.repository.roles()
        capabilities = ["view_dashboard", "view_transactions"]
        if any(
            r.user_id == user_id
            and r.family_id == family_id
            and r.role in ("treasurer", "super_admin")
            and r.valid_from <= now
            and (r.valid_to is None or now < r.valid_to)
            for r in roles
        ):
            capabilities.append("manage")
        if any(
            r.user_id == user_id
            and r.family_id == family_id
            and r.role == "super_admin"
            and r.valid_from <= now
            and (r.valid_to is None or now < r.valid_to)
            for r in roles
        ):
            capabilities.append("manage_roles")
        return capabilities

    def transactions(
        self, family_id: str, period: Period, direction: Direction = "all"
    ) -> list[Transaction]:
        # Quarter means trailing three fixture months (Aug-Oct), documented in UI.
        start = "2026-10" if period == "month" else "2026-08"
        return sorted(
            (
                t
                for t in self.repository.transactions(family_id)
                if start <= t.occurred_on[:7] <= "2026-10"
                and (
                    direction == "all"
                    or (int(t.amount_krw) > 0) == (direction == "income")
                )
            ),
            key=lambda t: (t.occurred_on, t.id),
            reverse=True,
        )

    def dashboard(self, family_id: str, period: Period) -> DashboardResponse:
        selected = self.transactions(family_id, period)
        income = sum(int(t.amount_krw) for t in selected if int(t.amount_krw) > 0)
        expense = -sum(int(t.amount_krw) for t in selected if int(t.amount_krw) < 0)
        balance = 2000000  # Synthetic opening balance at 2026-08-01.
        monthly = []
        all_rows = self.repository.transactions(family_id)
        for month in ("2026-08", "2026-09", "2026-10"):
            amounts = [
                int(t.amount_krw) for t in all_rows if t.occurred_on.startswith(month)
            ]
            inc, exp = (
                sum(a for a in amounts if a > 0),
                -sum(a for a in amounts if a < 0),
            )
            balance += inc - exp
            if period == "quarter" or month == "2026-10":
                monthly.append(
                    Monthly(
                        month=month,
                        income_krw=str(inc),
                        expense_krw=str(exp),
                        balance_krw=str(balance),
                    )
                )
        categories = [
            Category(
                label=label,
                amount_krw=str(
                    -sum(
                        int(t.amount_krw)
                        for t in selected
                        if t.category == label and int(t.amount_krw) < 0
                    )
                ),
            )
            for label in sorted({t.category for t in selected if int(t.amount_krw) < 0})
        ]
        return DashboardResponse(
            family_id=family_id,
            as_of=AS_OF,
            source="합성 자료 · 은행 미연결",
            period=period,
            balance_krw=str(balance),
            income_krw=str(income),
            expense_krw=str(expense),
            net_krw=str(income - expense),
            approved_commitments_krw="150000",
            monthly=monthly,
            categories=categories,
            recent_transactions=selected[:5],
        )
