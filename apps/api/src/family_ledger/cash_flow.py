"""Calendar buckets for the flow widget, independent of summary widget periods."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

from .banking.repository import BankRepository
from .documents.statement import KST
from .domain import AS_OF, Repository
from .models import Model, Money

FlowUnit = Literal["week", "month"]


class FlowBucket(Model):
    label: str
    start_on: str
    end_on: str
    income_krw: Money | None
    expense_krw: Money | None
    balance_krw: Money | None
    balance_as_of: str | None
    coverage: Literal["none", "partial", "complete"]
    in_progress: bool


class FlowResponse(Model):
    unit: FlowUnit
    today: str
    data_mode: Literal["bank_import", "synthetic"] = "bank_import"
    data_through: str | None
    items: list[FlowBucket]


@dataclass(frozen=True)
class FlowEntry:
    at: datetime
    amount: int
    balance: int


def previous_month(first: date) -> date:
    return (first - timedelta(days=1)).replace(day=1)


def project_flow(
    now: datetime,
    unit: FlowUnit,
    entries: list[FlowEntry],
    periods: list[tuple[date, date]],
    mode: Literal["bank_import", "synthetic"] = "bank_import",
) -> FlowResponse:
    today = now.astimezone(KST).date()
    first = (
        today - timedelta(days=today.weekday())
        if unit == "week"
        else today.replace(day=1)
    )
    starts = [first]
    for _ in range(7 if unit == "week" else 5):
        starts.append(
            starts[-1] - timedelta(days=7)
            if unit == "week"
            else previous_month(starts[-1])
        )
    starts.reverse()
    merged: list[tuple[date, date]] = []
    for start, end in sorted((a, min(b, today)) for a, b in periods if a <= today):
        if merged and start <= merged[-1][1] + timedelta(days=1):
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    entries = sorted((e for e in entries if e.at <= now), key=lambda e: e.at)
    items = []
    for i, start in enumerate(starts):
        end = starts[i + 1] - timedelta(days=1) if i + 1 < len(starts) else today
        covered = any(a <= start and end <= b for a, b in merged)
        overlap = any(a <= end and b >= start for a, b in merged)
        selected = [e for e in entries if start <= e.at.astimezone(KST).date() <= end]
        previous = next(
            (e for e in reversed(entries) if e.at.astimezone(KST).date() <= end), None
        )
        balance = (
            previous
            if previous
            and (
                previous.at.astimezone(KST).date() >= start
                or any(
                    a <= previous.at.astimezone(KST).date() and end <= b
                    for a, b in merged
                )
            )
            else None
        )
        items.append(
            FlowBucket(
                label=f"{start.month}/{start.day} 주"
                if unit == "week"
                else start.strftime("%Y-%m"),
                start_on=str(start),
                end_on=str(end),
                income_krw=str(sum(e.amount for e in selected if e.amount > 0))
                if overlap
                else None,
                expense_krw=str(-sum(e.amount for e in selected if e.amount < 0))
                if overlap
                else None,
                balance_krw=str(balance.balance) if overlap and balance else None,
                balance_as_of=balance.at.astimezone(KST).isoformat()
                if overlap and balance
                else None,
                coverage="complete" if covered else "partial" if overlap else "none",
                in_progress=end == today,
            )
        )
    return FlowResponse(
        unit=unit,
        today=str(today),
        data_mode=mode,
        data_through=str(merged[-1][1]) if merged else None,
        items=items,
    )


def bank_flow(
    dsn: str, family: str, actor: str, now: datetime, unit: FlowUnit
) -> FlowResponse | None:
    repository = BankRepository(dsn)
    with repository.connect() as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        repository.authority(conn, family, actor, now)
        syncs = conn.execute(
            "SELECT period_start,period_end FROM bank_statement_sync WHERE family_id=%s AND status='synced'",
            (family,),
        ).fetchall()
        if not syncs:
            return None
        # Fetch the displayed window and just one opening balance, not all history.
        start = date.fromisoformat(project_flow(now, unit, [], []).items[0].start_on)
        rows = conn.execute(
            "SELECT occurred_at,amount_krw,balance_after_krw FROM imported_bank_transaction WHERE family_id=%s AND occurred_at>=%s AND occurred_at<=%s ORDER BY occurred_at,source_order,id",
            (family, datetime.combine(start, datetime.min.time(), KST), now),
        ).fetchall()
        opening = conn.execute(
            "SELECT occurred_at,amount_krw,balance_after_krw FROM imported_bank_transaction WHERE family_id=%s AND occurred_at<%s ORDER BY occurred_at DESC,source_order DESC,id LIMIT 1",
            (family, datetime.combine(start, datetime.min.time(), KST)),
        ).fetchone()
        if opening:
            rows.insert(0, opening)
        return project_flow(
            now,
            unit,
            [
                FlowEntry(r["occurred_at"], r["amount_krw"], r["balance_after_krw"])
                for r in rows
            ],
            [(s["period_start"], s["period_end"]) for s in syncs],
        )


def synthetic_flow(
    repository: Repository, family: str, now: datetime, unit: FlowUnit
) -> FlowResponse:
    balance = 2000000
    entries = []
    for row in sorted(
        repository.transactions(family), key=lambda r: (r.occurred_on, r.id)
    ):
        balance += int(row.amount_krw)
        entries.append(
            FlowEntry(
                datetime.combine(
                    date.fromisoformat(row.occurred_on), datetime.min.time(), KST
                ),
                int(row.amount_krw),
                balance,
            )
        )
    periods = (
        [(date(2026, 8, 1), datetime.fromisoformat(AS_OF).date())] if entries else []
    )
    return project_flow(now, unit, entries, periods, "synthetic")
