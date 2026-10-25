"""Export the development contract without starting a listener."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))
from family_ledger.main import Config, create_app  # noqa: E402

target = Path(__file__).resolve().parents[2] / "packages/contracts/openapi.json"
target.write_text(
    json.dumps(create_app(Config("development", "local_password", database_url="dbname=contract_export")).openapi(), ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print("Generated packages/contracts/openapi.json")
