"""Called under the family lock, in the same transaction as document storage."""

from datetime import datetime, timedelta
from itertools import pairwise
from uuid import uuid4

from ..banking.crypto import cipher, decrypt
from .models import BankSync
from .statement import KST, Statement, StatementError, parse_statement

PARSER_VERSION = 1


def validate_boundary(conn, family: str, statement: Statement) -> None:
    periods = [(statement.start, statement.end)] + [
        (row["period_start"], row["period_end"])
        for row in conn.execute(
            "SELECT period_start,period_end FROM bank_statement_sync WHERE family_id=%s AND status='synced'",
            (family,),
        ).fetchall()
    ]
    merged = []
    for start, end in sorted(periods):
        if merged and start <= merged[-1][1] + timedelta(days=1):
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    before = conn.execute(
        "SELECT occurred_at,amount_krw,balance_after_krw FROM imported_bank_transaction WHERE family_id=%s AND (occurred_at AT TIME ZONE 'Asia/Seoul')::date<%s ORDER BY occurred_at DESC,source_order DESC LIMIT 1",
        (family, statement.start),
    ).fetchone()
    after = conn.execute(
        "SELECT occurred_at,amount_krw,balance_after_krw FROM imported_bank_transaction WHERE family_id=%s AND (occurred_at AT TIME ZONE 'Asia/Seoul')::date>%s ORDER BY occurred_at,source_order LIMIT 1",
        (family, statement.end),
    ).fetchone()
    chain = (
        [(before["occurred_at"], before["amount_krw"], before["balance_after_krw"])]
        if before
        else []
    )
    chain += [entry.core for entry in statement.transactions]
    if after:
        chain.append(
            (after["occurred_at"], after["amount_krw"], after["balance_after_krw"])
        )
    for previous, current in pairwise(chain):
        continuous = any(
            start <= previous[0].astimezone(KST).date()
            and current[0].astimezone(KST).date() <= end
            for start, end in merged
        )
        if continuous and previous[2] + current[1] != current[2]:
            raise StatementError(
                "연속된 조회기간의 기존 거래와 잔액이 이어지지 않습니다. 빠진 거래나 원본을 확인해 주세요."
            )


def summary(conn, family: str, document: str) -> BankSync | None:
    row = conn.execute(
        "SELECT * FROM bank_statement_sync WHERE family_id=%s AND document_id=%s ORDER BY parser_version DESC LIMIT 1",
        (family, document),
    ).fetchone()
    return BankSync(**{key: row[key] for key in BankSync.model_fields}) if row else None


def synchronize(
    conn, family: str, document: str, data: bytes, filename: str, now: datetime
) -> None:
    if conn.execute(
        "SELECT 1 FROM bank_statement_sync WHERE family_id=%s AND document_id=%s AND parser_version=%s",
        (family, document, PARSER_VERSION),
    ).fetchone():
        return
    statement = None
    error = None
    existing = {}
    try:
        statement = parse_statement(data, filename)
        account = conn.execute(
            "SELECT account_cipher FROM bank_statement_sync WHERE family_id=%s AND status='synced' ORDER BY completed_at,id LIMIT 1",
            (family,),
        ).fetchone()
        if account and decrypt(account["account_cipher"]).decode() != statement.account:
            raise StatementError(
                "기존에 동기화한 통장과 계좌 표시 정보가 다릅니다. 통장을 확인해 주세요."
            )
        rows = conn.execute(
            "SELECT * FROM imported_bank_transaction WHERE family_id=%s AND (occurred_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN %s AND %s",
            (family, statement.start, statement.end),
        ).fetchall()
        existing = {
            (row["occurred_at"], row["amount_krw"], row["balance_after_krw"]): row
            for row in rows
        }
        keys = {entry.core for entry in statement.transactions}
        if not existing.keys() <= keys:
            raise StatementError(
                "겹치는 조회기간에 이미 반영된 거래가 빠져 있습니다. 은행 원본을 확인해 주세요."
            )
        existing_times = {key[0] for key in existing}
        group_orders: dict[datetime, int] = {}
        for entry in statement.transactions:
            previous = existing.get(entry.core)
            order = group_orders.get(entry.at, 0)
            group_orders[entry.at] = order + 1
            if previous and previous["source_order"] != order:
                raise StatementError(
                    "같은 시각의 기존 거래 순서와 달라 확인이 필요합니다.", entry.row
                )
            if not previous and entry.at in existing_times:
                raise StatementError(
                    "이미 반영된 거래와 같은 시각에 새 거래가 추가되어 순서 확인이 필요합니다.",
                    entry.row,
                )
            if previous and (
                previous["bank_type"],
                previous["description"],
                previous["memo"],
            ) != (entry.bank_type, entry.description, entry.memo):
                raise StatementError(
                    "이미 반영된 거래와 내용이 다릅니다. 기존 거래는 변경하지 않았습니다.",
                    entry.row,
                )
        validate_boundary(conn, family, statement)
    except StatementError as failure:
        error = str(failure)
    entries = statement.transactions if statement and not error else []
    identifier = str(uuid4())
    conn.execute(
        "INSERT INTO bank_statement_sync VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            identifier,
            family,
            document,
            PARSER_VERSION,
            cipher().encrypt(statement.account.encode()) if statement else None,
            "needs_review" if error else "synced",
            statement.start if statement else None,
            statement.end if statement else None,
            statement.requested if statement else None,
            min((e.at for e in entries), default=None),
            max((e.at for e in entries), default=None),
            len(entries) - len(existing) if not error else 0,
            len(existing) if not error else 0,
            error,
            now,
        ),
    )
    new_rows = []
    links = []
    order = 0
    last_at = None
    for entry in entries:
        order = order + 1 if entry.at == last_at else 0
        last_at = entry.at
        previous = existing.get(entry.core)
        transaction = previous["id"] if previous else str(uuid4())
        if not previous:
            new_rows.append(
                (
                    transaction,
                    family,
                    entry.at,
                    entry.amount,
                    entry.balance,
                    entry.bank_type,
                    entry.description,
                    entry.memo,
                    document,
                    entry.row,
                    order,
                )
            )
        links.append((family, identifier, entry.row, transaction))
    with conn.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO imported_bank_transaction VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            new_rows,
        )
        cursor.executemany("INSERT INTO bank_statement_row VALUES (%s,%s,%s,%s)", links)
