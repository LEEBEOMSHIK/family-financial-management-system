from datetime import datetime
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from ..auth import AuthError
from .crypto import cipher, decrypt
from .models import AccountReveal, BankAccount, BankAccountCreate, BankAccountList

FIELDS = "id,bank_name,account_holder,label,masked_number,created_at"


class BankRepository:
    def __init__(self, dsn: str):
        self.dsn = dsn

    def connect(self):
        return psycopg.connect(self.dsn, row_factory=dict_row)

    @staticmethod
    def authority(conn, family: str, actor: str, now: datetime) -> bool:
        from ..expenses.repository import ExpenseRepository

        return ExpenseRepository.authority(conn, family, actor, now)

    @staticmethod
    def lock(conn, family: str) -> None:
        conn.execute("SELECT id FROM family WHERE id=%s FOR UPDATE", (family,))

    @staticmethod
    def account(conn, family: str, actor: str, account_id: str):
        row = conn.execute(
            "SELECT * FROM bank_account WHERE family_id=%s AND user_id=%s AND id=%s",
            (family, actor, account_id),
        ).fetchone()
        if not row:
            raise AuthError(404, "NOT_FOUND", "계좌를 찾을 수 없습니다.")
        return row

    @staticmethod
    def summary(row) -> BankAccount:
        return BankAccount(**{name: row[name] for name in FIELDS.split(",")})

    def listing(self, family: str, actor: str, now: datetime) -> BankAccountList:
        with self.connect() as conn:
            self.authority(conn, family, actor, now)
            rows = conn.execute(
                f"SELECT {FIELDS} FROM bank_account WHERE family_id=%s AND user_id=%s ORDER BY created_at DESC,id",
                (family, actor),
            ).fetchall()
            default = conn.execute(
                "SELECT account_id FROM bank_account_default WHERE family_id=%s AND user_id=%s ORDER BY sequence DESC LIMIT 1",
                (family, actor),
            ).fetchone()
            return BankAccountList(
                items=[self.summary(row) for row in rows],
                default_account_id=default["account_id"] if default else None,
            )

    def create(
        self, family: str, actor: str, body: BankAccountCreate, now: datetime
    ) -> BankAccount:
        encrypted = cipher().encrypt(body.account_number.encode())
        with self.connect() as conn:
            self.lock(conn, family)
            self.authority(conn, family, actor, now)
            account_id = str(uuid4())
            row = conn.execute(
                "INSERT INTO bank_account VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                (
                    account_id,
                    family,
                    actor,
                    body.bank_name,
                    body.account_holder,
                    body.label,
                    "•••• " + body.account_number[-4:],
                    encrypted,
                    now,
                ),
            ).fetchone()
            if body.make_default:
                conn.execute(
                    "INSERT INTO bank_account_default(family_id,user_id,account_id,created_at) VALUES (%s,%s,%s,%s)",
                    (family, actor, account_id, now),
                )
            return self.summary(row)

    def set_default(
        self, family: str, actor: str, account_id: str, now: datetime
    ) -> BankAccountList:
        with self.connect() as conn:
            self.lock(conn, family)
            self.authority(conn, family, actor, now)
            self.account(conn, family, actor, account_id)
            conn.execute(
                "INSERT INTO bank_account_default(family_id,user_id,account_id,created_at) VALUES (%s,%s,%s,%s)",
                (family, actor, account_id, now),
            )
        return self.listing(family, actor, now)

    @staticmethod
    def reveal_row(
        conn, family: str, actor: str, row, now: datetime, request_id: str | None = None
    ) -> AccountReveal:
        number = decrypt(row["number_cipher"]).decode()
        conn.execute(
            "INSERT INTO financial_access VALUES (%s,%s,%s,%s,%s,%s)",
            (str(uuid4()), family, actor, row["id"], request_id, now),
        )
        return AccountReveal(account_number=number)

    def reveal(
        self, family: str, actor: str, account_id: str, now: datetime
    ) -> AccountReveal:
        with self.connect() as conn:
            self.lock(conn, family)
            self.authority(conn, family, actor, now)
            return self.reveal_row(
                conn, family, actor, self.account(conn, family, actor, account_id), now
            )
