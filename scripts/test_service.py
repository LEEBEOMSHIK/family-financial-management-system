"""Run browser tests against an isolated PostgreSQL test schema and ports."""
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time
from datetime import datetime, UTC
from uuid import uuid4
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))


def main() -> int:
    import psycopg
    from cryptography.fernet import Fernet
    from psycopg import sql
    from psycopg.conninfo import make_conninfo, conninfo_to_dict
    from family_ledger.postgres import migrate, seed, PostgresRepository
    from family_ledger.auth import bootstrap_admin, LocalAuth
    from family_ledger.auth_models import RegisterRequest
    from family_ledger.domain import FAMILY
    from family_ledger.models import RoleChange

    config = json.loads((ROOT / "var/postgres/connection.json").read_text(encoding="utf-8"))
    if conninfo_to_dict(config["test_owner_dsn"])["dbname"] != "family_ledger_test":
        raise RuntimeError("Tests require the dedicated test database")
    for port in (3001, 8001):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", port))
    schema = "e2e_" + uuid4().hex
    owner = make_conninfo(config["test_owner_dsn"], options=f"-c search_path={schema}")
    app = make_conninfo(config["test_app_dsn"], options=f"-c search_path={schema}")
    children = []
    credential_file = ROOT / "var/postgres/e2e-credentials.json"
    with psycopg.connect(config["test_owner_dsn"], autocommit=True) as conn:
        conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    logs = []
    try:
        migrate(owner, app_role="family_ledger_test_app"); seed(owner)
        with psycopg.connect(owner) as conn:
            conn.execute("INSERT INTO expense_policy VALUES ('synthetic-e2e-v1',%s,true,false,now(),'Isolated synthetic E2E policy only')", (FAMILY,))
        credentials = {kind: {"username": "test_" + kind, "password": secrets.token_urlsafe(24)} for kind in ("member", "treasurer", "super_admin")}
        administrator = bootstrap_admin(owner, **credentials["super_admin"], display_name="테스트 총괄관리자")
        credentials["super_admin"]["id"] = administrator
        auth = LocalAuth(app)
        now = datetime.now(UTC)
        for kind, label in (("member", "테스트 구성원"), ("treasurer", "테스트 총무")):
            token, _ = auth.invite(administrator, FAMILY, now)
            uid = auth.register(RegisterRequest(**credentials[kind], invite_token=token, display_name=label), "test-setup", now)
            credentials[kind]["id"] = uid
            if kind == "treasurer":
                repo = PostgresRepository(app)
                repo.change(administrator, RoleChange(user_id=uid, role="treasurer", expected_version=repo.snapshot(now).version, reason="Test fixture"), now)
        credential_file.write_text(json.dumps(credentials), encoding="utf-8")
        env = {**os.environ, "APP_ENV": "development", "AUTH_PROVIDER": "local_password", "DATABASE_URL": app, "WEB_ORIGIN": "http://127.0.0.1:3001", "API_INTERNAL_URL": "http://127.0.0.1:8001", "E2E_BASE_URL": "http://127.0.0.1:3001", "E2E_CREDENTIALS": str(credential_file), "NEXT_TELEMETRY_DISABLED": "1", "PYTHONUTF8": "1"}
        env["DEV_ACCOUNTS_FILE"] = str(credential_file)
        env.pop("FINANCIAL_DATA_KEY", None)
        commands = [([sys.executable, "-m", "uvicorn", "family_ledger.main:create_app", "--factory", "--app-dir", "apps/api/src", "--host", "127.0.0.1", "--port", "8001", "--no-access-log"], ROOT),
                    ([shutil.which("node"), str(ROOT / "apps/web/node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3001"], ROOT / "apps/web")]
        for index, (command, cwd) in enumerate(commands):
            log = (ROOT / f"var/e2e-server-{index}.log").open("w", encoding="utf-8"); logs.append(log)
            child_env = {**env, "FINANCIAL_DATA_KEY": Fernet.generate_key().decode()} if index == 0 else env
            children.append(subprocess.Popen(command, cwd=cwd, env=child_env, stdout=log, stderr=log))
        for _ in range(60):
            try:
                with urlopen("http://127.0.0.1:3001/login", timeout=1):
                    break
            except Exception:
                time.sleep(.5)
        else:
            raise RuntimeError("Test services failed to start")
        return subprocess.run([shutil.which("node"), "node_modules/@playwright/test/cli.js", "test", *sys.argv[1:]], cwd=ROOT / "apps/web", env=env).returncode
    finally:
        for child in children:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                child.terminate(); child.wait(timeout=10)
        for log in logs:
            log.close()
        credential_file.unlink(missing_ok=True)
        # Only the fresh, generated test-owned schema is removed; never a database.
        if schema.startswith("e2e_") and len(schema) == 36:
            with psycopg.connect(config["test_owner_dsn"], autocommit=True) as conn:
                conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


if __name__ == "__main__":
    raise SystemExit(main())
