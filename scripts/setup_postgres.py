"""Create/start an isolated native development cluster. Never touch port 5432."""
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "var" / "postgres"
DATA = BASE / "data"
CONFIG = BASE / "connection.json"
PORT = 55432


def run(*args: str) -> None:
    with (BASE / "setup.log").open("a", encoding="utf-8") as log:
        subprocess.run(args, check=True, stdout=log, stderr=log)


def main() -> None:
    import psycopg
    from psycopg import sql
    from psycopg.conninfo import make_conninfo

    BASE.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        sid = subprocess.check_output(["powershell", "-NoProfile", "-Command", "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], text=True).strip()
        run("icacls", str(BASE), "/inheritance:r", "/grant:r", f"*{sid}:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F")
    else:
        BASE.chmod(0o700)
    ctl = shutil.which("pg_ctl")
    if not ctl:
        raise RuntimeError("Install native PostgreSQL and put its bin directory on PATH")
    bindir = Path(ctl).parent
    if CONFIG.exists():
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
    else:
        if DATA.exists():
            raise RuntimeError("Cluster exists without private config; restore config, do not reset")
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", PORT))
        config = {"port": PORT, "bin": str(bindir)}
        for key, user, db in [
            ("bootstrap_dsn", "family_ledger_bootstrap", "postgres"),
            ("owner_dsn", "family_ledger_owner", "family_ledger_dev"),
            ("app_dsn", "family_ledger_app", "family_ledger_dev"),
            ("test_owner_dsn", "family_ledger_test_owner", "family_ledger_test"),
            ("test_app_dsn", "family_ledger_test_app", "family_ledger_test"),
        ]:
            config[key] = make_conninfo(host="127.0.0.1", port=PORT, user=user, password=secrets.token_urlsafe(36), dbname=db, connect_timeout=5)
        CONFIG.write_text(json.dumps(config, indent=2), encoding="utf-8")
    from psycopg.conninfo import conninfo_to_dict
    if not (DATA / "PG_VERSION").exists():
        password = BASE / "init-password.tmp"
        password.write_text(conninfo_to_dict(config["bootstrap_dsn"])["password"], encoding="utf-8")
        try:
            run(str(bindir / "initdb"), "-D", str(DATA), "-U", "family_ledger_bootstrap", "-A", "scram-sha-256", "--encoding=UTF8", "--locale=C", f"--pwfile={password}")
        finally:
            password.unlink(missing_ok=True)
        with (DATA / "postgresql.conf").open("a", encoding="utf-8") as stream:
            stream.write("\nlisten_addresses = '127.0.0.1'\nport = 55432\npassword_encryption = 'scram-sha-256'\nlog_statement = 'none'\nlog_min_error_statement = 'panic'\n")
    status = subprocess.run([ctl, "-D", str(DATA), "status"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if status.returncode:
        run(ctl, "-D", str(DATA), "-l", str(BASE / "server.log"), "-w", "start")
    with psycopg.connect(config["bootstrap_dsn"], autocommit=True) as conn:
        for key in ("owner_dsn", "app_dsn", "test_owner_dsn", "test_app_dsn"):
            info = conninfo_to_dict(config[key])
            if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (info["user"],)).fetchone():
                conn.execute(sql.SQL("CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD {}").format(sql.Identifier(info["user"]), sql.Literal(info["password"])))
        for owner_key, app_key in (("owner_dsn", "app_dsn"), ("test_owner_dsn", "test_app_dsn")):
            owner = conninfo_to_dict(config[owner_key]); app = conninfo_to_dict(config[app_key])
            if not conn.execute("SELECT 1 FROM pg_database WHERE datname=%s", (owner["dbname"],)).fetchone():
                conn.execute(sql.SQL("CREATE DATABASE {} OWNER {} ENCODING 'UTF8'").format(sql.Identifier(owner["dbname"]), sql.Identifier(owner["user"])))
            conn.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(sql.Identifier(owner["dbname"])))
            conn.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}, {}").format(sql.Identifier(owner["dbname"]), sql.Identifier(owner["user"]), sql.Identifier(app["user"])))
    print("Native PostgreSQL ready on 127.0.0.1:55432; isolated dev/test databases ready. Credentials not printed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Database setup stopped ({type(exc).__name__}). Inspect local setup log without sharing secrets.", file=sys.stderr)
        raise SystemExit(1)
