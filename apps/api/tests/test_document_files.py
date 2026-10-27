import io
import struct
import zipfile

import pytest

from family_ledger.auth import AuthError
from family_ledger.documents.files import inspect_file


def workbook(*, external: bool = False) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("xl/workbook.xml", "<workbook/>")
        if external:
            archive.writestr(
                "xl/_rels/workbook.xml.rels",
                '<Relationships><Relationship TargetMode="External" Target="https://example.invalid"/></Relationships>',
            )
    return buffer.getvalue()


def test_xlsx_structural_check_and_external_reference():
    assert inspect_file("synthetic.xlsx", workbook(), "bank").endswith(
        "spreadsheetml.sheet"
    )
    with pytest.raises(AuthError) as rejected:
        inspect_file("external.xlsx", workbook(external=True), "bank")
    assert rejected.value.status == 422


def test_corrupt_deflate_is_validation_error_not_unknown_outcome():
    data = bytearray(workbook())
    name_length, extra_length = struct.unpack_from("<HH", data, 26)
    data[30 + name_length + extra_length] = 0xFF
    with pytest.raises(AuthError) as rejected:
        inspect_file("corrupt.xlsx", bytes(data), "bank")
    assert rejected.value.status == 422
