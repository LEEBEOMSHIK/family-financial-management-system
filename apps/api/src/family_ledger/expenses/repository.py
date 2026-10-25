"""Append-only expense storage. All monetary values cross the API as strings."""

from datetime import datetime
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from ..auth import AuthError
from ..banking.models import AccountReveal
from ..banking.repository import BankRepository
from ..evidence.repository import EvidenceRepository
from .models import ExpenseCreate, ExpenseDecisionInput, ExpenseItem, ExpenseList


class ExpenseRepository:
    def __init__(self, dsn: str):
        self.dsn = dsn

    def connect(self):
        return psycopg.connect(self.dsn, row_factory=dict_row)

    @staticmethod
    def has_role(conn, family: str, user: str, role: str, at: datetime) -> bool:
        return bool(
            conn.execute(
                "SELECT 1 FROM role_assignment a LEFT JOIN role_assignment_end e "
                "ON e.assignment_id=a.id AND e.family_id=a.family_id "
                "WHERE a.family_id=%s AND a.user_id=%s AND a.role=%s "
                "AND a.valid_from<=%s AND (a.valid_to IS NULL OR a.valid_to>%s) "
                "AND (e.ended_at IS NULL OR e.ended_at>%s)",
                (family, user, role, at, at, at),
            ).fetchone()
        )

    @staticmethod
    def authority(conn, family: str, actor: str, now: datetime) -> bool:
        membership = conn.execute(
            "SELECT 1 FROM membership m JOIN account a ON a.id=m.user_id "
            "WHERE m.family_id=%s AND m.user_id=%s AND m.active AND a.active",
            (family, actor),
        ).fetchone()
        if not membership:
            raise AuthError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.")
        return bool(
            conn.execute(
                "SELECT 1 FROM role_assignment a LEFT JOIN role_assignment_end e ON e.assignment_id=a.id "
                "AND e.family_id=a.family_id WHERE a.family_id=%s AND a.user_id=%s "
                "AND a.role IN ('treasurer','super_admin') AND a.valid_from<=%s "
                "AND (a.valid_to IS NULL OR a.valid_to>%s) AND (e.ended_at IS NULL OR e.ended_at>%s)",
                (family, actor, now, now, now),
            ).fetchone()
        )

    @staticmethod
    def configured(conn, family: str, now: datetime):
        return conn.execute(
            "SELECT * FROM expense_policy WHERE family_id=%s AND effective_at<=%s ORDER BY effective_at DESC,version DESC LIMIT 1",
            (family, now),
        ).fetchone()

    @staticmethod
    def rows(
        conn, family: str, actor: str, manager: bool, request_id: str | None = None
    ):
        rows = conn.execute(
            "SELECT r.id,r.requester_id,a.display_name AS requester_name,r.amount_krw::text,r.purpose,"
            "r.payee_name,r.requested_on,r.created_at,COALESCE(d.decision,'submitted') AS status,"
            "u.display_name AS actor_name,d.actor_id AS decision_actor,d.comment,d.decided_at,d.policy_version,r.request_type,r.bank_account_id,COALESCE(d.evidence_ids,'{}') AS decision_evidence_ids "
            "FROM expense_request r JOIN account a ON a.id=r.requester_id "
            "LEFT JOIN expense_decision d ON d.family_id=r.family_id AND d.request_id=r.id "
            "LEFT JOIN account u ON u.id=d.actor_id WHERE r.family_id=%s AND (%s OR r.requester_id=%s) "
            "AND (%s::text IS NULL OR r.id=%s) ORDER BY r.created_at DESC,r.id",
            (family, manager, actor, request_id, request_id),
        ).fetchall()
        items = []
        now = conn.execute("SELECT CURRENT_TIMESTAMP AS now").fetchone()["now"]
        for row in rows:
            decision_actor = row.pop("decision_actor")
            row["payment"] = conn.execute(
                "SELECT a.display_name AS actor_name,p.paid_on,p.recorded_at,p.note FROM expense_payment p JOIN account a ON a.id=p.actor_id WHERE p.family_id=%s AND p.request_id=%s",
                (family, row["id"]),
            ).fetchone()
            row["can_record_payment"] = bool(
                row["status"] == "approved"
                and not row["payment"]
                and ExpenseRepository.has_role(conn, family, actor, "treasurer", now)
            )
            notice = conn.execute(
                "SELECT state FROM expense_approval_notice WHERE family_id=%s AND request_id=%s",
                (family, row["id"]),
            ).fetchone()
            row["approval_notice"] = (
                notice["state"]
                if notice
                else (
                    "not_required"
                    if row["status"] != "approved"
                    or (
                        decision_actor
                        and ExpenseRepository.has_role(
                            conn, family, decision_actor, "treasurer", row["decided_at"]
                        )
                    )
                    else "not_recorded"
                )
            )
            row["requires_super_admin"] = any(
                ExpenseRepository.has_role(
                    conn, family, row["requester_id"], "treasurer", at
                )
                for at in (row["created_at"], now)
            )
            account_id = row.pop("bank_account_id")
            row["bank_account"] = (
                BankRepository.summary(
                    BankRepository.account(
                        conn, family, row["requester_id"], account_id
                    )
                )
                if account_id
                else None
            )
            row["evidence"] = EvidenceRepository.items(conn, family, row["id"])
            items.append(ExpenseItem.model_validate(row))
        return items

    def list(self, family: str, actor: str, now: datetime) -> ExpenseList:
        with self.connect() as conn:
            manager = self.authority(conn, family, actor, now)
            policy = self.configured(conn, family, now)
            return ExpenseList(
                items=self.rows(conn, family, actor, manager),
                approval_configured=bool(
                    policy and policy["single_approval"] and not policy["self_approval"]
                ),
            )

    def detail(
        self, family: str, actor: str, request_id: str, now: datetime
    ) -> ExpenseItem:
        with self.connect() as conn:
            manager = self.authority(conn, family, actor, now)
            rows = self.rows(conn, family, actor, manager, request_id)
            if not rows:
                raise AuthError(404, "NOT_FOUND", "요청을 찾을 수 없습니다.")
            return rows[0]

    def create(
        self, family: str, actor: str, body: ExpenseCreate, now: datetime
    ) -> ExpenseItem:
        with self.connect() as conn:
            # Same family lock as role changes; authorization cannot race a demotion.
            conn.execute("SELECT id FROM family WHERE id=%s FOR UPDATE", (family,))
            self.authority(conn, family, actor, now)
            account = BankRepository.account(conn, family, actor, body.bank_account_id)
            if body.request_type == "reimbursement" and not body.evidence_ids:
                raise AuthError(
                    422, "EVIDENCE_REQUIRED", "정산 요청에는 영수증이 필요합니다."
                )
            if len(body.evidence_ids) != len(set(body.evidence_ids)):
                raise AuthError(422, "INVALID_EVIDENCE", "중복 증빙을 확인해 주세요.")
            old = conn.execute(
                "SELECT * FROM expense_request WHERE family_id=%s AND requester_id=%s AND operation_id=%s",
                (family, actor, str(body.operation_id)),
            ).fetchone()
            if old:
                if (
                    str(old["amount_krw"]),
                    old["purpose"],
                    old["requested_on"],
                    old["request_type"],
                    old["bank_account_id"],
                    sorted(old["initial_evidence_ids"]),
                ) != (
                    body.amount_krw,
                    body.purpose,
                    body.requested_on,
                    body.request_type,
                    body.bank_account_id,
                    sorted(body.evidence_ids),
                ):
                    raise AuthError(
                        409,
                        "IDEMPOTENCY_CONFLICT",
                        "이미 제출한 요청과 내용이 다릅니다. 목록을 확인해 주세요.",
                    )
                request_id = old["id"]
            else:
                request_id = str(uuid4())
                conn.execute(
                    "INSERT INTO expense_request(id,family_id,requester_id,amount_krw,purpose,payee_name,requested_on,created_at,operation_id,request_type,bank_account_id,initial_evidence_ids) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (
                        request_id,
                        family,
                        actor,
                        int(body.amount_krw),
                        body.purpose,
                        account["account_holder"],
                        body.requested_on,
                        now,
                        str(body.operation_id),
                        body.request_type,
                        body.bank_account_id,
                        body.evidence_ids,
                    ),
                )
                EvidenceRepository.attach(
                    conn, family, actor, request_id, body.evidence_ids, now
                )
            return self.rows(conn, family, actor, False, request_id)[0]

    def decide(
        self,
        family: str,
        actor: str,
        request_id: str,
        body: ExpenseDecisionInput,
        now: datetime,
    ) -> ExpenseItem:
        with self.connect() as conn:
            conn.execute("SELECT id FROM family WHERE id=%s FOR UPDATE", (family,))
            if not self.authority(conn, family, actor, now):
                raise AuthError(
                    403, "FORBIDDEN", "총무 또는 총괄관리자만 처리할 수 있습니다."
                )
            rows = self.rows(conn, family, actor, True, request_id)
            if not rows:
                raise AuthError(404, "NOT_FOUND", "요청을 찾을 수 없습니다.")
            item = rows[0]
            if item.requester_id == actor:
                raise AuthError(
                    403,
                    "SELF_APPROVAL_FORBIDDEN",
                    "본인의 요청은 다른 총무 또는 총괄관리자가 처리해야 합니다.",
                )
            if item.requires_super_admin and not self.has_role(
                conn, family, actor, "super_admin", now
            ):
                raise AuthError(
                    403,
                    "SUPER_ADMIN_REQUIRED",
                    "총무가 제출한 요청은 총괄관리자만 처리할 수 있습니다.",
                )
            if item.status != "submitted":
                raise AuthError(
                    409,
                    "ALREADY_DECIDED",
                    "이미 처리된 요청입니다. 목록을 새로고침해 주세요.",
                )
            if item.request_type == "legacy" or item.bank_account is None:
                raise AuthError(
                    409,
                    "REQUEST_INCOMPLETE",
                    "계좌와 요청 유형을 포함하여 새 요청을 제출해 주세요.",
                )
            policy = self.configured(conn, family, now)
            if not policy or not policy["single_approval"] or policy["self_approval"]:
                raise AuthError(
                    409,
                    "POLICY_NOT_CONFIGURED",
                    "승인 규칙 확정 후 처리할 수 있습니다.",
                )
            conn.execute(
                "INSERT INTO expense_decision VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    family,
                    request_id,
                    actor,
                    body.decision,
                    body.comment,
                    now,
                    policy["version"],
                    [e.id for e in item.evidence],
                ),
            )
            if body.decision == "approved" and not self.has_role(
                conn, family, actor, "treasurer", now
            ):
                conn.execute(
                    "INSERT INTO expense_approval_notice VALUES (%s,%s,%s,'kakao_alimtalk','configuration_required')",
                    (family, request_id, now),
                )
            return self.rows(conn, family, actor, True, request_id)[0]

    def attach_evidence(
        self, family: str, actor: str, request_id: str, ids: list[str], now: datetime
    ) -> ExpenseItem:
        with self.connect() as conn:
            BankRepository.lock(conn, family)
            self.authority(conn, family, actor, now)
            rows = self.rows(conn, family, actor, False, request_id)
            if not rows:
                raise AuthError(404, "NOT_FOUND", "요청을 찾을 수 없습니다.")
            item = rows[0]
            if item.request_type != "advance" or item.status == "rejected":
                raise AuthError(
                    409,
                    "EVIDENCE_ATTACHMENT_FORBIDDEN",
                    "이 요청에는 사후 증빙을 추가할 수 없습니다.",
                )
            EvidenceRepository.attach(conn, family, actor, request_id, ids, now)
            return self.rows(conn, family, actor, False, request_id)[0]

    def reveal_account(
        self, family: str, actor: str, request_id: str, now: datetime
    ) -> AccountReveal:
        with self.connect() as conn:
            BankRepository.lock(conn, family)
            manager = self.authority(conn, family, actor, now)
            rows = self.rows(conn, family, actor, manager, request_id)
            if not rows or rows[0].bank_account is None:
                raise AuthError(404, "NOT_FOUND", "계좌를 찾을 수 없습니다.")
            item = rows[0]
            row = BankRepository.account(
                conn, family, item.requester_id, item.bank_account.id
            )
            return BankRepository.reveal_row(conn, family, actor, row, now, request_id)
