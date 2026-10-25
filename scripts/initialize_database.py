"""Migrate/import this project's local DB; create the first private admin once."""
import json
from pathlib import Path
import secrets
import shutil
import sys
from datetime import datetime, UTC

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))


def main() -> None:
    import psycopg
    from family_ledger.postgres import migrate, seed
    from family_ledger.auth import bootstrap_admin

    config = json.loads((ROOT / "var/postgres/connection.json").read_text(encoding="utf-8"))
    owner = config["owner_dsn"]
    legacy = ROOT / "var/development-roles.json"
    backup = ROOT / "var/postgres/backups"
    backup.mkdir(exist_ok=True)
    if legacy.exists():
        target = backup / f"roles-before-db-{datetime.now(UTC):%Y%m%dT%H%M%S}.json"
        shutil.copy2(legacy, target)
    migrate(owner)
    seed(owner, legacy if legacy.exists() else None)
    with psycopg.connect(owner) as conn:
        count = conn.execute("SELECT count(*) FROM account").fetchone()[0]
    if not count:
        credentials = {"username": "family_admin", "password": secrets.token_urlsafe(24)}
        credential_path = ROOT / "var/postgres/initial-admin.json"
        if credential_path.exists():
            raise RuntimeError("Initial credentials already exist; inspect interrupted setup before retry")
        # Write private recovery information before committing account creation.
        credential_path.write_text(json.dumps(credentials, indent=2), encoding="utf-8")
        bootstrap_admin(owner, credentials["username"], credentials["password"])
    with psycopg.connect(owner) as conn:
        versions = conn.execute("SELECT version FROM schema_migration ORDER BY version").fetchall()
        members = conn.execute("SELECT count(*) FROM membership WHERE active").fetchone()[0]
        history = conn.execute("SELECT count(*) FROM role_event").fetchone()[0]
        transactions = conn.execute("SELECT count(*) FROM ledger_transaction").fetchone()[0]
    print(f"Migrations={len(versions)} active_members={members} preserved_role_events={history} synthetic_transactions={transactions}")
    print("Initial admin credentials are in private var/postgres/initial-admin.json (not printed).")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Database initialization stopped ({type(exc).__name__}); source and history are preserved.", file=sys.stderr)
        raise SystemExit(1)
