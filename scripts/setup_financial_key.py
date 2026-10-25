"""Create a local encryption key once, separately from database backups."""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    import psycopg
    from cryptography.fernet import Fernet

    folder = ROOT / "var/secrets"
    target = folder / "financial-data.key"
    folder.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        sid = subprocess.check_output(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
            ],
            text=True,
        ).strip()
        subprocess.run(
            [
                "icacls",
                str(folder),
                "/inheritance:r",
                "/grant:r",
                f"*{sid}:(OI)(CI)F",
                "*S-1-5-18:(OI)(CI)F",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
    else:
        folder.chmod(0o700)
    if target.exists():
        Fernet(target.read_bytes().strip())
        print("Existing financial encryption key preserved.")
        return
    config = json.loads((ROOT / "var/postgres/connection.json").read_text())
    with psycopg.connect(config["owner_dsn"]) as conn:
        # Once migration 004 exists, a missing key is a recovery event, not setup.
        if conn.execute(
            "SELECT 1 FROM schema_migration WHERE version='004_accounts_evidence.sql'"
        ).fetchone():
            raise RuntimeError("Restore the original encryption key before restarting")
    with target.open("xb") as stream:
        stream.write(Fernet.generate_key())
    if os.name != "nt":
        target.chmod(0o600)
    print("Financial encryption key created privately; contents not printed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 -- do not expose private database details
        print(
            f"Encryption key setup stopped ({type(exc).__name__}); do not replace existing keys.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
