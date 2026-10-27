"""Recovery checks must detect corruption even when row counts still match."""

import psycopg
import pytest
from cryptography.fernet import Fernet
from test_auth import accounts  # noqa: F401
from test_postgres import database  # noqa: F401

from family_ledger.domain import FAMILY


def fingerprint(dsn):
    from family_ledger.recovery import fingerprint_database
    with psycopg.connect(dsn) as conn:
        return fingerprint_database(conn)


def test_same_counts_with_changed_permissions_fail(accounts):  # noqa: F811
    from family_ledger.recovery import verify_fingerprint
    expected = fingerprint(accounts)
    with psycopg.connect(accounts) as conn:
        conn.execute("UPDATE membership SET active=false WHERE user_id=(SELECT id FROM account LIMIT 1)")
    with pytest.raises(ValueError, match="Restore content mismatch"):
        verify_fingerprint(expected, fingerprint(accounts))


def test_encrypted_original_requires_correct_key_and_hash(accounts, monkeypatch):  # noqa: F811
    from hashlib import sha256

    from family_ledger.recovery import fingerprint_database
    key = Fernet.generate_key()
    monkeypatch.setenv("FINANCIAL_DATA_KEY", key.decode())
    payload = b"synthetic-document"
    with psycopg.connect(accounts) as conn:
        uid = conn.execute("SELECT id FROM account LIMIT 1").fetchone()[0]
        conn.execute("INSERT INTO evidence(id,family_id,user_id,media_type,byte_size,sha256,original_cipher,preview_cipher,created_at) VALUES ('synthetic-evidence',%s,%s,'image/png',%s,%s,%s,%s,now())", (FAMILY, uid, len(payload), sha256(payload).hexdigest(), Fernet(key).encrypt(payload), Fernet(key).encrypt(payload)))
    with psycopg.connect(accounts) as conn:
        actual = fingerprint_database(conn)
    assert actual["encrypted_values_verified"] == 2
    assert actual["original_hashes_verified"] == 1
    monkeypatch.setenv("FINANCIAL_DATA_KEY", Fernet.generate_key().decode())
    with pytest.raises(ValueError, match="Encrypted recovery verification failed"):
        fingerprint(accounts)
    monkeypatch.setenv("FINANCIAL_DATA_KEY", key.decode())
    with psycopg.connect(accounts) as conn:
        conn.execute("INSERT INTO evidence(id,family_id,user_id,media_type,byte_size,sha256,original_cipher,preview_cipher,created_at) VALUES ('bad-hash',%s,%s,'image/png',%s,%s,%s,%s,now())", (FAMILY, uid, len(payload), '0'*64, Fernet(key).encrypt(payload), Fernet(key).encrypt(payload)))
    with pytest.raises(ValueError, match="Original recovery hash mismatch"):
        fingerprint(accounts)
