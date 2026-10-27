"""Owner-only custom-format backup; optional isolated restore verification."""
import argparse
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))


def main() -> None:
    import psycopg
    from family_ledger.recovery import fingerprint_database, verify_fingerprint
    from psycopg import sql
    from psycopg.conninfo import conninfo_to_dict, make_conninfo
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-restore", action="store_true")
    args = parser.parse_args()
    config = json.loads((ROOT / "var/postgres/connection.json").read_text(encoding="utf-8"))
    source = conninfo_to_dict(config["owner_dsn"])
    if source["dbname"] != "family_ledger_dev" or source["host"] != "127.0.0.1" or source["port"] != "55432":
        raise RuntimeError("Refusing backup outside this local development database")
    folder = ROOT / "var/postgres/backups"
    folder.mkdir(exist_ok=True)
    target = folder / f"family-ledger-{datetime.now(UTC):%Y%m%dT%H%M%S}-{uuid4().hex[:8]}.dump"
    env = {**os.environ, "PGPASSWORD": source["password"]}
    command = [str(Path(config["bin"]) / "pg_dump"), "-h", source["host"], "-p", source["port"], "-U", source["user"], "-d", source["dbname"], "-Fc", "-f", str(target)]
    # Keep the exporting transaction alive until pg_dump imports its snapshot.
    # Writes in the running service cannot change the comparison baseline.
    with psycopg.connect(config["owner_dsn"]) as baseline:
        baseline.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        snapshot = baseline.execute("SELECT pg_export_snapshot()").fetchone()[0]
        expected = fingerprint_database(baseline) if args.verify_restore else None
        subprocess.run([*command, "--snapshot", snapshot], env=env, check=True, capture_output=True)
    print("Database backup created in private var/postgres/backups.")
    if not args.verify_restore:
        return
    temporary_db = "family_ledger_restore_" + uuid4().hex[:12]
    with psycopg.connect(config["bootstrap_dsn"], autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {} OWNER {}").format(sql.Identifier(temporary_db), sql.Identifier(source["user"])))
        try:
            subprocess.run([str(Path(config["bin"]) / "pg_restore"), "-h", source["host"], "-p", source["port"], "-U", source["user"], "-d", temporary_db, "--no-owner", "--no-privileges", "--exit-on-error", str(target)], env=env, check=True, capture_output=True)
            restored_dsn = make_conninfo(config["owner_dsn"], dbname=temporary_db)
            with psycopg.connect(restored_dsn) as restored:
                restored.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                actual = fingerprint_database(restored)
            verify_fingerprint(expected, actual)
            print("Isolated restore verified: all table contents, money totals, encrypted values and original hashes match.")
            report = {"verified_at": datetime.now(UTC).isoformat(), "dump_file": target.name,
                      "table_count": len(actual["tables"]),
                      "encrypted_values_verified": actual["encrypted_values_verified"],
                      "original_hashes_verified": actual["original_hashes_verified"],
                      "status": "verified", "runtime_acl_smoke": "not_performed"}
            target.with_suffix(".verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        finally:
            admin.execute(sql.SQL("DROP DATABASE {}").format(sql.Identifier(temporary_db)))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - prevent private DSNs/rows in CLI tracebacks
        print(f"Backup stopped ({type(exc).__name__}); no source database changes.", file=sys.stderr)
        raise SystemExit(1)
