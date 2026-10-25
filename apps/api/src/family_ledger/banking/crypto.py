import os

from cryptography.fernet import Fernet, InvalidToken

from ..auth import AuthError


def cipher() -> Fernet:
    try:
        return Fernet(os.environ["FINANCIAL_DATA_KEY"].encode("ascii"))
    except (KeyError, ValueError, UnicodeError):
        raise AuthError(
            503, "FINANCIAL_STORAGE_UNAVAILABLE", "금융 정보 보안 설정을 확인해 주세요."
        ) from None


def decrypt(value: bytes) -> bytes:
    try:
        return cipher().decrypt(bytes(value))
    except InvalidToken:
        raise AuthError(
            503, "FINANCIAL_STORAGE_UNAVAILABLE", "금융 정보를 열 수 없습니다."
        ) from None
