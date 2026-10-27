"""Exact-name monthly allocation. Caller holds the family lock for writes."""

from datetime import datetime
from uuid import uuid4

from psycopg.types.json import Jsonb

from ..documents.statement import KST


def unlinked_deposits(conn, family: str, now: datetime):
    return conn.execute(
        "SELECT t.*,EXISTS(SELECT 1 FROM dues_event p WHERE p.family_id=t.family_id AND p.transaction_id=t.id AND p.kind='payment') AS previously_linked FROM imported_bank_transaction t WHERE t.family_id=%s AND t.amount_krw>0 AND t.occurred_at<=%s AND t.bank_type NOT IN ('예금이자','이자') AND NOT EXISTS (SELECT 1 FROM dues_event p WHERE p.family_id=t.family_id AND p.transaction_id=t.id AND p.kind='payment' AND NOT EXISTS(SELECT 1 FROM dues_event r WHERE r.family_id=p.family_id AND r.payment_id=p.id AND r.kind='reversal')) ORDER BY t.occurred_at,t.source_order,t.id",
        (family, now),
    ).fetchall()


def candidate(deposit, members, deadline):
    if deposit["previously_linked"]:
        return None, "reversed"
    matches = [m for m in members if m["name"] == deposit["description"]]
    if not matches:
        return None, "name_mismatch"
    if len(matches) != 1:
        return None, "ambiguous_name"
    member = matches[0]
    if member["amount_krw"] is None or deadline is None:
        return None, "policy_not_configured"
    return member["id"], "awaiting_match"


def reconcile(conn, family: str, actor: str, now: datetime) -> int:
    # No read endpoint calls this. Imported facts and existing decisions are immutable.
    from .repository import DuesRepository

    repository = DuesRepository("")
    views = {}
    added = 0
    for deposit in unlinked_deposits(conn, family, now):
        month = deposit["occurred_at"].astimezone(KST).strftime("%Y-%m")
        if month not in views:
            views[month] = repository.project(conn, family, month, now, False)
        view = views[month]
        member, _ = candidate(
            deposit, [m.model_dump() for m in view.members], view.due_day
        )
        if member is None:
            continue
        identifier, operation = str(uuid4()), str(uuid4())
        payload = {
            "kind": "payment",
            "month": month,
            "member_id": member,
            "transaction_id": deposit["id"],
            "operation_id": operation,
            "auto_match": "exact_name_month_v1",
        }
        conn.execute(
            "INSERT INTO dues_event(id,family_id,actor_id,kind,month,member_id,amount_krw,transaction_id,operation_id,payload,created_at) VALUES (%s,%s,%s,'payment',%s,%s,%s,%s,%s,%s,%s)",
            (
                identifier,
                family,
                actor,
                month + "-01",
                member,
                deposit["amount_krw"],
                deposit["id"],
                operation,
                Jsonb(payload),
                now,
            ),
        )
        added += 1
    return added
