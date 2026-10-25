"""Create explicit local testing accounts; never reset existing account roles."""
import json
import secrets
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))


def main():
    from family_ledger.auth import LocalAuth
    from family_ledger.auth_models import PasswordLogin, RegisterRequest
    from family_ledger.domain import FAMILY
    from family_ledger.models import RoleChange
    from family_ledger.postgres import PostgresRepository

    folder = ROOT / "var/postgres"
    config = json.loads((folder / "connection.json").read_text())
    destination = folder / "development-accounts.json"
    if destination.exists():
        print("Development accounts already configured; roles preserved.")
        return
    auth = LocalAuth(config["app_dsn"])
    admin = json.loads((folder / "initial-admin.json").read_text())
    now = datetime.now(UTC)
    actor = auth.login(PasswordLogin(**admin), "local-test-setup", now)
    credentials = {}
    for role, label in (("member", "테스트 일반사용자"), ("treasurer", "테스트 총무"), ("super_admin", "테스트 총괄관리자")):
        account = {"username": "dev_" + role, "password": secrets.token_urlsafe(24)}
        token, _ = auth.invite(actor, FAMILY, now)
        uid = auth.register(RegisterRequest(**account, invite_token=token, display_name=label), "local-test-setup", now)
        if role != "member":
            repo = PostgresRepository(config["app_dsn"])
            repo.change(actor, RoleChange(user_id=uid, role=role, expected_version=repo.snapshot(now).version, reason="개발 테스트 계정 최초 권한 부여"), now)
        credentials[role] = account
    destination.write_text(json.dumps(credentials), encoding="utf-8")
    print("Three development accounts configured. Credentials not printed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 -- never emit database credentials in tracebacks
        print(f"Test account setup stopped ({type(exc).__name__}).", file=sys.stderr)
        raise SystemExit(1) from None
