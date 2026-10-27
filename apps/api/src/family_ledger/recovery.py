"""Read-only, private recovery fingerprints. Never log rows or plaintext."""

import hashlib
import os
from typing import Any

import psycopg
from cryptography.fernet import Fernet, InvalidToken
from psycopg import sql


def fingerprint_database(conn: psycopg.Connection) -> dict[str, Any]:
    """Call within the same repeatable-read snapshot as pg_dump.

    All table content includes role/membership history, migration checksums and
    monetary values. Digests stay private, and are not evidence of runtime ACL
    grants: those require a separate runtime-role smoke test after recovery.
    """
    conn.execute("SET LOCAL TIME ZONE 'UTC'")
    conn.execute("SET LOCAL DateStyle = 'ISO, YMD'")
    schema = conn.execute("SELECT current_schema()").fetchone()[0]
    tables = conn.execute("SELECT tablename FROM pg_tables WHERE schemaname=%s ORDER BY tablename", (schema,)).fetchall()
    result: dict[str, Any] = {"tables": {}, "encrypted_values_verified": 0, "original_hashes_verified": 0}
    for (table,) in tables:
        identifier = sql.Identifier(schema, table)
        columns = conn.execute("SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position", (schema, table)).fetchall()
        names = [column[0] for column in columns]
        digest = hashlib.sha256()
        count = 0
        # Canonical order also handles tables without a primary key. Stream rows.
        with conn.cursor(name="recovery_rows") as cursor:
            cursor.execute(sql.SQL('SELECT row_to_json(t)::text FROM {} t ORDER BY row_to_json(t)::text COLLATE "C"').format(identifier))
            for (encoded,) in cursor:
                raw = encoded.encode("utf-8")
                digest.update(len(raw).to_bytes(8, "big"))
                digest.update(raw)
                count += 1
        totals = {}
        for name in names:
            if name.endswith("_krw"):
                value = conn.execute(sql.SQL("SELECT sum({}) FROM {}").format(sql.Identifier(name), identifier)).fetchone()[0]
                totals[name] = str(value) if value is not None else None
        result["tables"][table] = {"count": count, "sha256": digest.hexdigest(), "totals": totals}
        encrypted = [name for name in names if name.endswith("_cipher")]
        if not encrypted:
            continue
        selected = encrypted + (["sha256", "byte_size"] if "original_cipher" in names else [])
        with conn.cursor(name="recovery_cipher") as cursor:
            cursor.execute(sql.SQL("SELECT {} FROM {}").format(sql.SQL(",").join(map(sql.Identifier, selected)), identifier))
            for values in cursor:
                row = dict(zip(selected, values, strict=True))
                for name in encrypted:
                    if row[name] is None:
                        continue
                    try:
                        plain = Fernet(os.environ["FINANCIAL_DATA_KEY"].encode("ascii")).decrypt(bytes(row[name]))
                    except (KeyError, UnicodeError, ValueError, InvalidToken):
                        raise ValueError("Encrypted recovery verification failed") from None
                    result["encrypted_values_verified"] += 1
                    if name == "original_cipher":
                        if hashlib.sha256(plain).hexdigest() != row["sha256"] or len(plain) != row["byte_size"]:
                            raise ValueError("Original recovery hash mismatch")
                        result["original_hashes_verified"] += 1
    return result


def verify_fingerprint(expected: dict[str, Any], actual: dict[str, Any]) -> None:
    if expected != actual:
        raise ValueError("Restore content mismatch; source database remains unchanged")
