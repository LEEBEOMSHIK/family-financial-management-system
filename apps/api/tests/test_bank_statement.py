import csv
import io
import zipfile
from xml.sax.saxutils import escape

import pytest

from family_ledger.documents.statement import StatementError, parse_statement


def rows():
    return [
        ["", "카카오뱅크 거래내역"],
        [],
        [],
        ["", "성명", "합성 총무", "", "조회기간", "2026.01.01 - 2026.01.31"],
        ["", "계좌번호", "****-**-***0000", "", "요청일시", "2026.02.01 09:00:00"],
        [],
        [],
        [],
        [],
        [],
        [
            "",
            "거래일시",
            "구분",
            "거래금액",
            "거래 후 잔액",
            "거래구분",
            "내용",
            "메모",
        ],
        ["", "2026.01.03 09:00:00", "입금", "1,000", "2,000", "이체", "합성 입금", ""],
        [
            "",
            "2026.01.05 10:00:00",
            "출금",
            "-300",
            "1,700",
            "이체",
            "합성 출금",
            "합성 메모",
        ],
    ]


def csv_file(values=None):
    stream = io.StringIO()
    csv.writer(stream).writerows(rows() if values is None else values)
    return stream.getvalue().encode("utf-8-sig")


def xlsx_file(values=None):
    data = io.BytesIO()
    values = rows() if values is None else values
    xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    for n, row in enumerate(values, 1):
        xml += f'<row r="{n}">'
        for c, value in enumerate(row):
            xml += f'<c r="{chr(65 + c)}{n}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
        xml += "</row>"
    xml += "</sheetData></worksheet>"
    with zipfile.ZipFile(data, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("xl/workbook.xml", "<workbook/>")
        archive.writestr("xl/worksheets/sheet1.xml", xml)
    return data.getvalue()


@pytest.mark.parametrize(
    "factory,name", [(csv_file, "bank.csv"), (xlsx_file, "bank.xlsx")]
)
def test_screenshot_structure_and_exact_amounts(factory, name):
    statement = parse_statement(factory(), name)
    assert str(statement.start) == "2026-01-01"
    assert [t.amount for t in statement.transactions] == [1000, -300]
    assert statement.transactions[1].row == 13
    assert statement.transactions[1].balance == 1700


@pytest.mark.parametrize(
    "column,value",
    [(2, "입금"), (3, "-30.5"), (4, "1,699"), (1, "2025.12.31 09:00:00")],
)
def test_invalid_rows_never_partially_succeed(column, value):
    values = rows()
    values[-1][column] = value
    with pytest.raises(StatementError):
        parse_statement(csv_file(values), "bank.csv")


def test_large_integer_and_descending_order():
    values = rows()
    values[-2][3:5] = ["9007199254740993", "9007199254740993"]
    values[-1][4] = "9007199254740693"
    values[-2:] = reversed(values[-2:])
    result = parse_statement(csv_file(values), "bank.csv")
    assert result.transactions[0].amount == 9007199254740993


def test_empty_period_and_duplicate_ambiguity():
    assert parse_statement(csv_file(rows()[:-2]), "bank.csv").transactions == []
    with pytest.raises(StatementError):
        parse_statement(csv_file(rows() + [rows()[-1]]), "bank.csv")


def test_same_second_descending_uses_balance_chain():
    values = rows()
    values[-1][1] = values[-2][1]
    values[-2:] = reversed(values[-2:])
    assert [
        entry.amount
        for entry in parse_statement(csv_file(values), "bank.csv").transactions
    ] == [1000, -300]


def test_same_second_bidirectional_chain_is_ambiguous():
    values = rows()
    values[-1][1] = values[-2][1]
    values[-2][3:5] = ["100", "200"]
    values[-1][3:5] = ["-100", "100"]
    with pytest.raises(StatementError, match="순서"):
        parse_statement(csv_file(values), "bank.csv")


def test_shared_strings_numeric_date_amount_and_formula_rejection():
    from datetime import datetime
    from xml.etree import ElementTree as ET

    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with zipfile.ZipFile(io.BytesIO(xlsx_file())) as source:
        contents = {name: source.read(name) for name in source.namelist()}
    tree = ET.fromstring(contents["xl/worksheets/sheet1.xml"])
    strings = ET.Element(ns + "sst")
    for cell in tree.iter(ns + "c"):
        value = "".join(cell.itertext())
        reference = cell.get("r")
        for child in list(cell):
            cell.remove(child)
        if reference == "B12":
            value = (
                str((datetime(2026, 1, 3, 9) - datetime(1899, 12, 30)).days) + ".375"
            )
            cell.attrib.pop("t")
        elif reference == "D12":
            value = "1000.0"
            cell.attrib.pop("t")
        else:
            cell.set("t", "s")
            ET.SubElement(ET.SubElement(strings, ns + "si"), ns + "t").text = value
            value = str(len(strings) - 1)
        ET.SubElement(cell, ns + "v").text = value
    contents["xl/sharedStrings.xml"] = ET.tostring(strings)

    def packaged():
        contents["xl/worksheets/sheet1.xml"] = ET.tostring(tree)
        result = io.BytesIO()
        with zipfile.ZipFile(result, "w") as archive:
            for name, value in contents.items():
                archive.writestr(name, value)
        return result.getvalue()

    assert parse_statement(packaged(), "bank.xlsx").transactions[0].amount == 1000
    ET.SubElement(next(tree.iter(ns + "c")), ns + "f").text = "1+1"
    with pytest.raises(StatementError, match="수식"):
        parse_statement(packaged(), "bank.xlsx")
