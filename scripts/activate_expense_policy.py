"""Append the explicitly user-confirmed local approval policy; never overwrite history."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))


def main() -> None:
    import psycopg
    from family_ledger.domain import FAMILY
    from psycopg.conninfo import conninfo_to_dict

    settings = json.loads(
        (ROOT / "var/postgres/connection.json").read_text(encoding="utf-8")
    )
    dsn = settings["owner_dsn"]
    if conninfo_to_dict(dsn)["dbname"] != "family_ledger_dev":
        raise RuntimeError("Only the project local development database is allowed")
    version = "user-confirmed-20261024-single-approval-v1"
    source = (
        "User confirmed 2026-10-24: one treasurer or super administrator decides; "
        "treasurer requests require super administrator; no self approval; "
        "actual bank transfer is separately performed by treasurer."
    )
    with psycopg.connect(dsn) as conn:
        conn.execute("SELECT id FROM family WHERE id=%s FOR UPDATE", (FAMILY,))
        existing = conn.execute(
            "SELECT family_id,single_approval,self_approval,source FROM expense_policy WHERE version=%s",
            (version,),
        ).fetchone()
        if existing:
            if existing != (FAMILY, True, False, source):
                raise RuntimeError(
                    "Existing policy version differs; history was preserved"
                )
        else:
            conn.execute(
                "INSERT INTO expense_policy(version,family_id,single_approval,self_approval,effective_at,source) VALUES (%s,%s,true,false,now(),%s)",
                (version, FAMILY, source),
            )
    print("Confirmed local approval policy recorded; requests and decisions preserved.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - suppress connection details at CLI boundary
        print(
            f"Policy activation stopped ({type(error).__name__}); no credentials printed.",
            file=sys.stderr,
        )
        raise SystemExit(1)
