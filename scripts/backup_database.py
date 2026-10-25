"""Owner-only custom-format backup; optional isolated restore verification."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, UTC
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    import psycopg
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
    target = folder / f"family-ledger-{datetime.now(UTC):%Y%m%dT%H%M%S}.dump"
    env = {**os.environ, "PGPASSWORD": source["password"]}
    command = [str(Path(config["bin"]) / "pg_dump"), "-h", source["host"], "-p", source["port"], "-U", source["user"], "-d", source["dbname"], "-Fc", "-f", str(target)]
    subprocess.run(command, env=env, check=True)
    print("Database backup created in private var/postgres/backups.")
    if not args.verify_restore:
        return
    temporary_db = "family_ledger_restore_" + uuid4().hex[:12]
    with psycopg.connect(config["bootstrap_dsn"], autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {} OWNER {}").format(sql.Identifier(temporary_db), sql.Identifier(source["user"])))
        try:
            subprocess.run([str(Path(config["bin"]) / "pg_restore"), "-h", source["host"], "-p", source["port"], "-U", source["user"], "-d", temporary_db, "--no-owner", "--no-privileges", "--exit-on-error", str(target)], env=env, check=True)
            restored_dsn = make_conninfo(config["owner_dsn"], dbname=temporary_db)
            def counts(dsn: str) -> dict[str, int]:
                with psycopg.connect(dsn) as conn:
                    schema = conn.execute("SELECT current_schema()").fetchone()[0]
                    tables = conn.execute("SELECT tablename FROM pg_tables WHERE schemaname=%s ORDER BY tablename", (schema,)).fetchall()
                    return {table: conn.execute(sql.SQL("SELECT count(*) FROM {}.{}").format(sql.Identifier(schema), sql.Identifier(table))).fetchone()[0] for (table,) in tables}
            if counts(config["owner_dsn"]) != counts(restored_dsn):
                raise RuntimeError("Backup restore verification count mismatch")
            print("Backup restored into a fresh temporary database; all application table counts match.")
        finally:
            admin.execute(sql.SQL("DROP DATABASE {}").format(sql.Identifier(temporary_db)))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Backup stopped ({type(exc).__name__}); no source database changes.", file=sys.stderr)
        raise SystemExit(1)
