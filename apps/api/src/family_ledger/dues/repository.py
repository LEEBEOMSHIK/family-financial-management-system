"""Append-only dues decisions; imported bank facts and ledger stay untouched."""

from datetime import date, datetime, timedelta
from uuid import uuid4

from psycopg.types.json import Jsonb

from ..auth import AuthError
from ..banking.repository import BankRepository
from ..documents.statement import KST
from ..expenses.repository import ExpenseRepository
from .matching import candidate, reconcile, unlinked_deposits
from .models import DuesCommand, DuesOverview, DuesResult
from .rules import due_date, state


class DuesRepository(BankRepository):
    @staticmethod
    def manager(conn, family: str, actor: str, now: datetime) -> bool:
        if not ExpenseRepository.authority(conn, family, actor, now):
            raise AuthError(
                403, "FORBIDDEN", "총무 또는 총괄관리자만 확인할 수 있습니다."
            )
        return ExpenseRepository.has_role(conn, family, actor, "super_admin", now)

    @staticmethod
    def events(conn, family: str):
        return conn.execute(
            "SELECT e.*,EXISTS(SELECT 1 FROM dues_fee_replacement r JOIN dues_event old ON old.family_id=r.family_id AND old.id=r.previous_id WHERE r.family_id=e.family_id AND e.kind='fee' AND old.member_id=e.member_id AND old.month=e.month AND old.sequence>=e.sequence) AS superseded,a.display_name AS actor_name,COALESCE((SELECT p.display_name FROM participant_profile_event p WHERE p.family_id=e.family_id AND p.participant_id=e.member_id ORDER BY p.version DESC LIMIT 1),m.display_name) AS member_name FROM dues_event e JOIN account a ON a.id=e.actor_id LEFT JOIN family_participant m ON m.id=e.member_id AND m.family_id=e.family_id WHERE e.family_id=%s ORDER BY e.sequence DESC",
            (family,),
        ).fetchall()

    def overview(
        self, family: str, actor: str, month: str, now: datetime
    ) -> DuesOverview:
        with self.connect() as conn:
            conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            admin = self.manager(conn, family, actor, now)
            return self.project(conn, family, month, now, admin)

    def project(
        self, conn, family: str, month: str, now: datetime, admin: bool
    ) -> DuesOverview:
        first = date.fromisoformat(month + "-01")
        today = now.astimezone(KST).date()
        events = self.events(conn, family)
        reversed_ids = {e["payment_id"] for e in events if e["kind"] == "reversal"}
        active = [
            e for e in events if e["kind"] == "payment" and e["id"] not in reversed_ids
        ]
        settings = sorted(
            (e for e in events if e["month"] <= first and not e["superseded"]),
            key=lambda e: (e["month"], e["sequence"]),
            reverse=True,
        )
        deadline = next(
            (e["due_day"] for e in settings if e["kind"] == "deadline"), None
        )
        due = due_date(month, deadline) if deadline else None
        periods = conn.execute(
            "SELECT period_start,period_end FROM bank_statement_sync WHERE family_id=%s AND status='synced' ORDER BY period_start",
            (family,),
        ).fetchall()
        cursor = first
        end = min(today, due_date(month, 31))
        for p in periods:
            if p["period_start"] <= cursor <= p["period_end"]:
                cursor = p["period_end"] + timedelta(days=1)
        covered = end >= first and cursor > end
        members = []
        for m in conn.execute(
            "SELECT p.id,COALESCE(e.display_name,p.display_name) AS display_name,e.birthday,COALESCE(e.version,0) AS profile_version,(a.id IS NOT NULL) AS has_account FROM family_participant p LEFT JOIN account a ON a.id=p.id LEFT JOIN LATERAL (SELECT display_name,birthday,version FROM participant_profile_event WHERE family_id=p.family_id AND participant_id=p.id ORDER BY version DESC LIMIT 1) e ON true WHERE p.family_id=%s ORDER BY display_name,p.id",
            (family,),
        ).fetchall():
            fee = next(
                (
                    e["amount_krw"]
                    for e in settings
                    if e["kind"] == "fee" and e["member_id"] == m["id"]
                ),
                None,
            )
            upcoming = sorted(
                (
                    e
                    for e in events
                    if e["kind"] == "fee"
                    and not e["superseded"]
                    and e["member_id"] == m["id"]
                    and e["month"] > first
                ),
                key=lambda e: (e["month"], -e["sequence"]),
            )
            next_fee = upcoming[0] if upcoming else None
            paid = sum(
                e["amount_krw"]
                for e in active
                if e["member_id"] == m["id"] and e["month"] == first
            )
            reminder = next(
                (
                    e["created_at"]
                    for e in events
                    if e["kind"] == "reminder"
                    and e["member_id"] == m["id"]
                    and e["month"] == first
                ),
                None,
            )
            members.append(
                {
                    "id": m["id"],
                    "name": m["display_name"],
                    "has_account": m["has_account"],
                    "birthday": m["birthday"],
                    "profile_version": m["profile_version"],
                    "next_fee_start_on": next_fee["starts_on"] if next_fee else None,
                    "next_fee_id": next_fee["id"] if next_fee else None,
                    "next_fee_month": next_fee["month"].strftime("%Y-%m")
                    if next_fee
                    else None,
                    "next_fee_amount_krw": str(next_fee["amount_krw"])
                    if next_fee
                    else None,
                    "amount_krw": str(fee) if fee is not None else None,
                    "paid_krw": str(paid),
                    "remaining_krw": str(max(fee - paid, 0))
                    if fee is not None
                    else None,
                    "excess_krw": str(max(paid - fee, 0)) if fee is not None else "0",
                    "status": state(fee, paid, due, today, covered),
                    "last_requested_at": reminder,
                }
            )
        review = []
        for deposit in unlinked_deposits(conn, family, now):
            if deposit["occurred_at"].astimezone(KST).strftime("%Y-%m") != month:
                continue
            _, reason = candidate(deposit, members, deadline)
            review.append({"id": deposit["id"], "occurred_at": deposit["occurred_at"], "description": deposit["description"], "amount_krw": str(deposit["amount_krw"]), "reason": reason})
        ready = covered and deadline is not None and not review and any(m["amount_krw"] is not None for m in members)
        if review:
            for member in members:
                if member["remaining_krw"] is not None and int(member["remaining_krw"]) > 0:
                    member["status"] = "awaiting_data"
        deposits = conn.execute(
            "SELECT t.id,t.occurred_at,t.description,t.amount_krw::text FROM imported_bank_transaction t WHERE t.family_id=%s AND t.amount_krw>0 AND t.occurred_at<=%s AND NOT EXISTS (SELECT 1 FROM dues_event p WHERE p.family_id=t.family_id AND p.transaction_id=t.id AND p.kind='payment' AND NOT EXISTS(SELECT 1 FROM dues_event r WHERE r.family_id=p.family_id AND r.payment_id=p.id AND r.kind='reversal')) ORDER BY t.occurred_at DESC,t.source_order DESC LIMIT 200",
            (family, now),
        ).fetchall()
        return DuesOverview(
            matching_review_count=len(review),
            review_deposits=review[:100],
            overdue_count=sum(m["status"] == "overdue" for m in members) if ready else None,
            overdue_krw=str(sum(int(m["remaining_krw"] or "0") for m in members if m["status"] == "overdue")) if ready else None,
            month=month,
            today=today,
            due_day=deadline,
            due_on=due,
            data_through=max((p["period_end"] for p in periods), default=None),
            coverage_complete=covered,
            can_configure=admin,
            outstanding_count=sum(
                m["remaining_krw"] is not None and int(m["remaining_krw"]) > 0
                for m in members
            ),
            unconfigured_count=sum(
                m["amount_krw"] is None and m["next_fee_month"] is None for m in members
            ),
            remaining_krw=str(sum(int(m["remaining_krw"] or "0") for m in members)),
            members=members,
            deposits=deposits,
            events=[
                {
                    "auto_matched": bool(e["payload"].get("auto_match")),
                    "transaction_id": e["transaction_id"],
                    "id": e["id"],
                    "kind": e["kind"],
                    "starts_on": e["starts_on"],
                    "superseded": e["superseded"],
                    "month": e["month"].strftime("%Y-%m"),
                    "member_id": e["member_id"],
                    "member_name": e["member_name"],
                    "actor_name": e["actor_name"],
                    "amount_krw": str(e["amount_krw"])
                    if e["amount_krw"] is not None
                    else None,
                    "due_day": e["due_day"],
                    "created_at": e["created_at"],
                    "reversed": e["id"] in reversed_ids,
                }
                for e in events
                if e["month"] == first or e["kind"] in ("fee", "deadline")
            ][:100],
        )

    def command(
        self, family: str, actor: str, body: DuesCommand, now: datetime
    ) -> DuesResult:
        with self.connect() as conn:
            return self.command_in_transaction(conn, family, actor, body, now)

    def command_in_transaction(
        self, conn, family: str, actor: str, body: DuesCommand, now: datetime, *, reconcile_after: bool = True
    ) -> DuesResult:
        self.lock(conn, family)
        admin = self.manager(conn, family, actor, now)
        if body.kind in ("fee", "deadline") and not admin:
            raise AuthError(
                403, "FORBIDDEN", "회비와 마감일은 총괄관리자만 설정할 수 있습니다."
            )
        payload = body.model_dump(mode="json")
        previous = conn.execute(
            "SELECT id,payload FROM dues_event WHERE family_id=%s AND actor_id=%s AND operation_id=%s",
            (family, actor, str(body.operation_id)),
        ).fetchone()
        if previous:
            if previous["payload"].get("auto_match"):
                raise AuthError(409, "IDEMPOTENCY_CONFLICT", "자동 연결에 사용된 요청 번호입니다.")
            if (
                DuesCommand.model_validate(previous["payload"]).model_dump(mode="json")
                != payload
            ):
                raise AuthError(
                    409,
                    "IDEMPOTENCY_CONFLICT",
                    "다른 작업에 사용한 요청 번호입니다.",
                )
            return DuesResult(id=previous["id"], message="이미 기록된 요청입니다.")
        month = date.fromisoformat(body.month + "-01")
        today = now.astimezone(KST).date()
        if body.kind in ("fee", "deadline") and month < today.replace(day=1):
            raise AuthError(
                409,
                "PAST_PERIOD",
                "과거 월 설정은 변경할 수 없습니다. 현재 월 이후를 선택해 주세요.",
            )
        if body.starts_on is not None and body.starts_on < today.replace(day=1):
            raise AuthError(
                409, "PAST_PERIOD", "회비 시작일은 이번 달 이후로 설정해 주세요."
            )
        view = self.project(conn, family, body.month, now, admin)
        member_id = str(body.member_id) if body.member_id else None
        member = next((m for m in view.members if m.id == member_id), None)
        amount = int(body.amount_krw) if body.amount_krw else None
        if body.kind in ("fee", "payment", "reminder") and member is None:
            raise AuthError(404, "NOT_FOUND", "현재 가족 구성원을 찾을 수 없습니다.")
        if body.kind in ("payment", "reminder") and (
            member.amount_krw is None or view.due_day is None
        ):
            raise AuthError(
                409,
                "POLICY_NOT_CONFIGURED",
                "해당 월의 회비와 마감일을 먼저 설정해 주세요.",
            )
        if body.kind == "payment":
            # Do not restrict valid older deposits to the listing's latest 200.
            row = conn.execute(
                "SELECT amount_krw,occurred_at FROM imported_bank_transaction WHERE family_id=%s AND id=%s",
                (family, str(body.transaction_id)),
            ).fetchone()
            if not row or row["amount_krw"] <= 0 or row["occurred_at"] > now:
                raise AuthError(
                    404, "NOT_FOUND", "확인할 입금 거래를 찾을 수 없습니다."
                )
            used = conn.execute(
                "SELECT 1 FROM dues_event p WHERE p.family_id=%s AND p.transaction_id=%s AND p.kind='payment' AND NOT EXISTS(SELECT 1 FROM dues_event r WHERE r.family_id=p.family_id AND r.payment_id=p.id AND r.kind='reversal')",
                (family, str(body.transaction_id)),
            ).fetchone()
            if used:
                raise AuthError(
                    409,
                    "DEPOSIT_ALREADY_LINKED",
                    "이미 회비에 연결된 입금입니다. 기존 연결을 취소한 후 정정해 주세요.",
                )
            amount = row["amount_krw"]
        if body.kind == "reversal":
            payment = conn.execute(
                "SELECT member_id,month FROM dues_event WHERE family_id=%s AND id=%s AND kind='payment'",
                (family, str(body.payment_id)),
            ).fetchone()
            if not payment or payment["month"] != month:
                raise AuthError(
                    404, "NOT_FOUND", "해당 월의 납부 확인을 찾을 수 없습니다."
                )
            if conn.execute(
                "SELECT 1 FROM dues_event WHERE family_id=%s AND payment_id=%s",
                (family, str(body.payment_id)),
            ).fetchone():
                raise AuthError(409, "ALREADY_REVERSED", "이미 취소한 연결입니다.")
            member_id = payment["member_id"]
        if body.kind == "reminder":
            if month > today.replace(day=1) or int(member.remaining_krw or "0") == 0:
                raise AuthError(
                    409, "NOT_OUTSTANDING", "현재 납부 요청 대상이 아닙니다."
                )
            if (
                member.last_requested_at
                and member.last_requested_at.astimezone(KST).date() == today
            ):
                raise AuthError(
                    409, "ALREADY_REQUESTED", "오늘 이미 납부 요청을 기록했습니다."
                )
            amount = int(member.remaining_krw)
        identifier = str(uuid4())
        conn.execute(
            "INSERT INTO dues_event(id,family_id,actor_id,kind,month,member_id,amount_krw,due_day,transaction_id,payment_id,operation_id,payload,created_at,starts_on) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                identifier,
                family,
                actor,
                body.kind,
                month,
                member_id,
                amount,
                body.due_day,
                str(body.transaction_id) if body.transaction_id else None,
                str(body.payment_id) if body.payment_id else None,
                str(body.operation_id),
                Jsonb(payload),
                now,
                body.starts_on,
            ),
        )
        if reconcile_after and body.kind in ("fee", "deadline"):
            reconcile(conn, family, actor, now)
        return DuesResult(
            id=identifier,
            message="납부 요청을 기록했습니다. 외부 알림은 발송되지 않았습니다."
            if body.kind == "reminder"
            else "저장했습니다.",
        )
