from datetime import date, datetime

from ..auth import AuthError
from ..banking.repository import BankRepository
from ..models import Transaction, TransactionsResponse
from .statement import KST


def imported_transactions(
    dsn: str,
    family: str,
    actor: str,
    now: datetime,
    direction: str,
    start: date | None,
    end: date | None,
    offset: int,
    limit: int = 50,
) -> TransactionsResponse | None:
    if start and end and start > end:
        raise AuthError(422, "INVALID_PERIOD", "시작일은 종료일보다 늦을 수 없습니다.")
    repository = BankRepository(dsn)
    with repository.connect() as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        manager = repository.authority(conn, family, actor, now)
        latest = conn.execute(
            "SELECT max(requested_at) AS as_of,max(completed_at) AS last_synced_at,max(period_end) AS data_through FROM bank_statement_sync WHERE family_id=%s AND status='synced'",
            (family,),
        ).fetchone()
        if latest["as_of"] is None:
            return None
        where = "t.family_id=%s AND (%s='all' OR (%s='income' AND t.amount_krw>0) OR (%s='expense' AND t.amount_krw<0)) AND (%s::date IS NULL OR (t.occurred_at AT TIME ZONE 'Asia/Seoul')::date>=%s) AND (%s::date IS NULL OR (t.occurred_at AT TIME ZONE 'Asia/Seoul')::date<=%s)"
        params = (family, direction, direction, direction, start, start, end, end)
        totals = conn.execute(
            "SELECT count(*) AS total, COALESCE(sum(t.amount_krw) FILTER (WHERE t.amount_krw>0),0) AS income, COALESCE(-sum(t.amount_krw) FILTER (WHERE t.amount_krw<0),0) AS expense, COALESCE(sum(t.amount_krw),0) AS net FROM imported_bank_transaction t WHERE " + where,
            params,
        ).fetchone()
        rows = conn.execute(
            "SELECT t.*,d.title AS document_title,d.filename AS document_filename FROM imported_bank_transaction t JOIN managed_document d ON d.family_id=t.family_id AND d.id=t.document_id WHERE "
            + where
            + " ORDER BY t.occurred_at DESC,t.source_order DESC,t.id LIMIT %s OFFSET %s",
            (*params, limit, offset),
        ).fetchall()
        return TransactionsResponse(
            data_mode="bank_import",
            as_of=latest["as_of"].isoformat(),
            last_synced_at=latest["last_synced_at"].astimezone(KST).isoformat(),
            data_through=str(latest["data_through"]),
            total=totals["total"],
            income_krw=str(totals["income"]),
            expense_krw=str(totals["expense"]),
            net_krw=str(totals["net"]),
            limit=limit,
            offset=offset,
            items=[
                Transaction(
                    id=row["id"],
                    occurred_on=str(row["occurred_at"].astimezone(KST).date()),
                    occurred_at=row["occurred_at"].astimezone(KST).isoformat(),
                    description=row["description"],
                    category=row["bank_type"],
                    memo=row["memo"],
                    amount_krw=str(row["amount_krw"]),
                    balance_after_krw=str(row["balance_after_krw"]),
                    reconciliation_status="pending",
                    source_document_id=row["document_id"] if manager else None,
                    source_document_title=row["document_title"] if manager else None,
                    source_document_filename=row["document_filename"]
                    if manager
                    else None,
                )
                for row in rows
            ],
        )
