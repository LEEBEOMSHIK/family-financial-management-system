"""Fail-closed production settings; development remains loopback-only."""

import ipaddress
import os
import re
from urllib.parse import urlsplit

from cryptography.fernet import Fernet


def production_origin(origin: str) -> str:
    try:
        parsed = urlsplit(origin)
        host = parsed.hostname or ""
        if (
            parsed.scheme != "https" or not host or parsed.username or parsed.password
            or parsed.path or parsed.query or parsed.fragment or "*" in host
            or any(char.isspace() for char in origin)
            or host == "localhost" or host.endswith(".localhost")
            or parsed.port not in (None, 443)
        ):
            raise ValueError
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if "." not in host or not all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in host.split(".")):
                raise ValueError from None
        else:
            if not address.is_global:
                raise ValueError
        canonical_host = f"[{host}]" if ":" in host else host
        if origin != f"https://{canonical_host}":
            raise ValueError
    except ValueError:
        raise RuntimeError("Production WEB_ORIGIN must be an explicit public HTTPS origin on port 443") from None
    return origin


def validate_production(auth_provider: str, database_url: str | None, origins: tuple[str, ...]) -> None:
    if auth_provider != "local_password" or not database_url:
        raise RuntimeError("Production requires PostgreSQL password authentication")
    if len(origins) != 1:
        raise RuntimeError("Production requires one explicit HTTPS origin")
    production_origin(origins[0])
    if os.getenv("ENABLE_DEV_LOGIN", "0") != "0" or os.getenv("DEV_ACCOUNTS_FILE"):
        raise RuntimeError("Remove development login settings before production startup")
    try:
        Fernet(os.environ["FINANCIAL_DATA_KEY"].encode("ascii"))
    except (KeyError, ValueError, UnicodeError):
        raise RuntimeError("Production requires a valid externally supplied financial encryption key") from None
