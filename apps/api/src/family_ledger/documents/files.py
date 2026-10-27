"""Bounded structural checks, not an antivirus verdict. Never execute file content."""

import io
import zipfile
import zlib
from pathlib import PurePosixPath
from xml.etree import ElementTree

from ..auth import AuthError
from ..evidence.images import inspect_image

MAX_BYTES = 6 * 1024 * 1024


def invalid() -> AuthError:
    return AuthError(
        422,
        "INVALID_DOCUMENT",
        "지원 형식과 파일 내용을 확인해 주세요. 암호·매크로·외부 연결 문서는 지원하지 않습니다.",
    )


def inspect_file(filename: str, data: bytes, kind: str) -> str:
    if len(data) > MAX_BYTES:
        raise AuthError(413, "FILE_TOO_LARGE", "파일은 6MiB 이하로 올려 주세요.")
    if not data or any(c in filename for c in "/\\:") or filename in (".", ".."):
        raise invalid()
    suffix = PurePosixPath(filename).suffix.lower()
    allowed = (
        {".xlsx", ".csv"}
        if kind == "bank"
        else {".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".webp"}
    )
    if suffix not in allowed:
        raise invalid()
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        mime, _ = inspect_image(data)
        expected = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
        }[suffix]
        if mime != expected:
            raise invalid()
        return mime
    if suffix in {".txt", ".csv"}:
        for encoding in ("utf-8-sig", "cp949"):
            try:
                text = data.decode(encoding)
                break
            except UnicodeError:
                continue
        else:
            raise invalid()
        if any(ord(c) < 32 and c not in "\r\n\t" for c in text):
            raise invalid()
        return "text/csv" if suffix == ".csv" else "text/plain"
    if suffix == ".pdf":
        if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
            raise invalid()
        return "application/pdf"
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if (
                len(entries) > 1000
                or sum(e.file_size for e in entries) > 24 * 1024 * 1024
            ):
                raise invalid()
            names = [entry.filename for entry in entries]
            if len(names) != len(set(names)):
                raise invalid()
            required = "xl/workbook.xml" if suffix == ".xlsx" else "word/document.xml"
            if "[Content_Types].xml" not in names or required not in names:
                raise invalid()
            for entry in entries:
                name = entry.filename.lower()
                if (
                    entry.flag_bits & 1
                    or ".." in PurePosixPath(name).parts
                    or name.startswith("/")
                    or "\\" in name
                ):
                    raise invalid()
                if any(
                    token in name
                    for token in (
                        "vbaproject",
                        "embeddings/",
                        "externallinks/",
                        "activex/",
                    )
                ):
                    raise invalid()
                if name.endswith((".xml", ".rels")):
                    content = archive.read(entry)
                    if (
                        b"<!doctype" in content.lower()
                        or b"<!entity" in content.lower()
                    ):
                        raise invalid()
                    xml = ElementTree.fromstring(content)
                    if any(
                        element.attrib.get("TargetMode", "").lower() == "external"
                        for element in xml.iter()
                    ):
                        raise invalid()
                    if b"macroenabled" in content.lower():
                        raise invalid()
    except (
        zipfile.BadZipFile,
        zlib.error,
        EOFError,
        ElementTree.ParseError,
        RuntimeError,
        NotImplementedError,
        ValueError,
    ):
        raise invalid() from None
    return "application/vnd.openxmlformats-officedocument." + (
        "spreadsheetml.sheet" if suffix == ".xlsx" else "wordprocessingml.document"
    )
