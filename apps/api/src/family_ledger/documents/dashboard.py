"""Read-only dashboard projection of synchronized bank facts."""

from datetime import date, datetime, timedelta

from ..banking.repository import BankRepository
from ..models import Category, DashboardResponse, Monthly, Period, Transaction
from .statement import KST


def imported_dashboard(
    dsn: str, family: str, actor: str, now: datetime, period: Period
) -> DashboardResponse | None:
    repository = BankRepository(dsn)
    with repository.connect() as conn:
        # All widgets describe one database snapshot even during another upload.
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        repository.authority(conn, family, actor, now)
        syncs = conn.execute(
            "SELECT period_start,period_end,requested_at,completed_at FROM bank_statement_sync WHERE family_id=%s AND status='synced' ORDER BY period_end DESC,requested_at DESC,completed_at DESC,id",
            (family,),
        ).fetchall()
        if not syncs:
            return None
        latest = syncs[0]
        end = latest["period_end"]
        start = end.replace(day=1)
        if period == "quarter":
            for _ in range(2):
                start = (start - timedelta(days=1)).replace(day=1)
        rows = conn.execute(
            "SELECT * FROM imported_bank_transaction WHERE family_id=%s AND (occurred_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN %s AND %s ORDER BY occurred_at,source_order,id",
            (family, start, end),
        ).fetchall()
        recent = conn.execute(
            "SELECT * FROM imported_bank_transaction WHERE family_id=%s ORDER BY occurred_at DESC,source_order DESC,id LIMIT 5",
            (family,),
        ).fetchall()
        commitments = conn.execute(
            "SELECT COALESCE(sum(r.amount_krw),0) AS amount FROM expense_request r JOIN expense_decision d ON d.family_id=r.family_id AND d.request_id=r.id WHERE r.family_id=%s AND d.decision='approved' AND NOT EXISTS(SELECT 1 FROM expense_payment p WHERE p.family_id=r.family_id AND p.request_id=r.id)",
            (family,),
        ).fetchone()["amount"]
        income = sum(row["amount_krw"] for row in rows if row["amount_krw"] > 0)
        expense = -sum(row["amount_krw"] for row in rows if row["amount_krw"] < 0)
        monthly: dict[str, list] = {}
        categories: dict[str, int] = {}
        for row in rows:
            month = row["occurred_at"].astimezone(KST).strftime("%Y-%m")
            monthly.setdefault(month, []).append(row)
            if row["amount_krw"] < 0:
                label = row["bank_type"] or "미분류"
                categories[label] = categories.get(label, 0) - row["amount_krw"]
        covered: list[tuple[date, date]] = []
        for first, last in sorted(
            (max(s["period_start"], start), min(s["period_end"], end))
            for s in syncs
            if s["period_start"] <= end and s["period_end"] >= start
        ):
            if covered and first <= covered[-1][1] + timedelta(days=1):
                covered[-1] = (covered[-1][0], max(last, covered[-1][1]))
            else:
                covered.append((first, last))
        return DashboardResponse(
            family_id=family,
            data_mode="bank_import",
            period=period,
            as_of=latest["requested_at"].astimezone(KST).isoformat(),
            last_synced_at=max(s["completed_at"] for s in syncs).astimezone(KST).isoformat(),
            data_through=str(end),
            source="카카오뱅크 업로드 자료",
            balance_krw=str(recent[0]["balance_after_krw"]) if recent else None,
            balance_as_of=recent[0]["occurred_at"].astimezone(KST).isoformat()
            if recent
            else None,
            summary_start=str(start),
            summary_end=str(end),
            coverage=[f"{first} ~ {last}" for first, last in covered],
            income_krw=str(income),
            expense_krw=str(expense),
            net_krw=str(income - expense),
            approved_commitments_krw=str(int(commitments)),
            monthly=[
                Monthly(
                    month=month,
                    income_krw=str(
                        sum(r["amount_krw"] for r in items if r["amount_krw"] > 0)
                    ),
                    expense_krw=str(
                        -sum(r["amount_krw"] for r in items if r["amount_krw"] < 0)
                    ),
                    balance_krw=str(items[-1]["balance_after_krw"]),
                )
                for month, items in monthly.items()
            ],
            categories=[
                Category(label=label, amount_krw=str(amount))
                for label, amount in sorted(categories.items())
            ],
            recent_transactions=[
                Transaction(
                    id=row["id"],
                    occurred_on=str(row["occurred_at"].astimezone(KST).date()),
                    occurred_at=row["occurred_at"].astimezone(KST).isoformat(),
                    description=row["description"],
                    amount_krw=str(row["amount_krw"]),
                    category=row["bank_type"],
                    reconciliation_status="pending",
                    balance_after_krw=str(row["balance_after_krw"]),
                    memo=row["memo"],
                )
                for row in recent
            ],
        )
