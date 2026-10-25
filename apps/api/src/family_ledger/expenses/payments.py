"""Record a completed manual bank payment; never execute bank transfers."""

from datetime import datetime
from zoneinfo import ZoneInfo

from ..auth import AuthError
from .models import ExpenseItem, PaymentInput
from .repository import ExpenseRepository


def record_payment(
    dsn: str,
    family: str,
    actor: str,
    request_id: str,
    body: PaymentInput,
    now: datetime,
) -> ExpenseItem:
    repository = ExpenseRepository(dsn)
    with repository.connect() as conn:
        conn.execute("SELECT id FROM family WHERE id=%s FOR UPDATE", (family,))
        repository.authority(conn, family, actor, now)
        if not repository.has_role(conn, family, actor, "treasurer", now):
            raise AuthError(
                403,
                "TREASURER_REQUIRED",
                "현직 총무만 실제 송금 완료를 기록할 수 있습니다.",
            )
        rows = repository.rows(conn, family, actor, True, request_id)
        if not rows:
            raise AuthError(404, "NOT_FOUND", "요청을 찾을 수 없습니다.")
        item = rows[0]
        if item.status != "approved":
            raise AuthError(
                409,
                "APPROVAL_REQUIRED",
                "승인된 요청만 송금 완료를 기록할 수 있습니다.",
            )
        existing = conn.execute(
            "SELECT * FROM expense_payment WHERE family_id=%s AND (request_id=%s OR operation_id=%s)",
            (family, request_id, body.operation_id),
        ).fetchone()
        if existing:
            if (
                existing["request_id"],
                existing["actor_id"],
                existing["operation_id"],
                existing["paid_on"],
                existing["note"],
            ) == (
                request_id,
                actor,
                body.operation_id,
                body.paid_on,
                body.note.strip(),
            ):
                return item
            raise AuthError(
                409,
                "PAYMENT_ALREADY_RECORDED",
                "이미 송금 완료가 기록됐습니다. 처리 이력을 확인해 주세요.",
            )
        zone = ZoneInfo("Asia/Seoul")
        if body.paid_on > now.astimezone(zone).date() or (
            item.decided_at and body.paid_on < item.decided_at.astimezone(zone).date()
        ):
            raise AuthError(
                422,
                "INVALID_PAYMENT_DATE",
                "송금일은 승인일 이후부터 오늘까지 선택해 주세요.",
            )
        conn.execute(
            "INSERT INTO expense_payment VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (
                family,
                request_id,
                actor,
                body.paid_on,
                now,
                body.note.strip(),
                body.operation_id,
            ),
        )
        return repository.rows(conn, family, actor, True, request_id)[0]
