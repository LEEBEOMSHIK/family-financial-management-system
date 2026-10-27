"""Bounded KakaoBank statement reader. Never expose source cell values in errors."""

import csv
import io
import re
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from itertools import pairwise
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
HEADERS = ["거래일시", "구분", "거래금액", "거래후잔액", "거래구분", "내용", "메모"]


class StatementError(ValueError):
    def __init__(self, message: str, row: int | None = None):
        self.row = row
        super().__init__((f"{row}행: " if row else "") + message)


@dataclass(frozen=True)
class Entry:
    row: int
    at: datetime
    amount: int
    balance: int
    bank_type: str
    description: str
    memo: str

    @property
    def core(self) -> tuple[datetime, int, int]:
        return self.at, self.amount, self.balance


@dataclass(frozen=True)
class Statement:
    start: date
    end: date
    requested: datetime
    account: str
    transactions: list[Entry]


def compact(value: str) -> str:
    return re.sub(r"\s+", "", value)


def table(data: bytes, filename: str) -> tuple[list[tuple[int, list[str]]], bool]:
    if filename.lower().endswith(".csv"):
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("cp949")
        values = []
        for index, row in enumerate(csv.reader(io.StringIO(text)), 1):
            if index > 2200 or len(row) > 100:
                raise StatementError(
                    "표 크기 한도를 초과했습니다. 조회기간을 나누어 주세요."
                )
            values.append((index, row))
        return values, False
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        sheets = [
            name
            for name in archive.namelist()
            if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name)
        ]
        if len(sheets) != 1:
            raise StatementError("거래내역 시트가 하나인 원본을 올려 주세요.")
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = [
                "".join(item.itertext())
                for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall(
                    NS + "si"
                )
            ]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        props = workbook.find(NS + "workbookPr")
        epoch1904 = props is not None and props.get("date1904") in ("1", "true")
        values = []
        root = ET.fromstring(archive.read(sheets[0]))
        for row in root.findall(f"{NS}sheetData/{NS}row"):
            number = int(row.get("r", "0"))
            if not 1 <= number <= 2200 or len(values) >= 2200:
                raise StatementError(
                    "표 크기 한도를 초과했습니다. 조회기간을 나누어 주세요."
                )
            cells: dict[int, str] = {}
            for cell in row.findall(NS + "c"):
                reference = re.fullmatch(r"([A-Z]+)\d+", cell.get("r", ""))
                if not reference:
                    raise StatementError("셀 위치를 확인할 수 없습니다.", number)
                column = 0
                for letter in reference[1]:
                    column = column * 26 + ord(letter) - 64
                if column > 100 or column in cells:
                    raise StatementError("지원하지 않는 셀 구조입니다.", number)
                if cell.find(NS + "f") is not None:
                    raise StatementError("수식이 없는 은행 원본을 올려 주세요.", number)
                value = cell.findtext(NS + "v", "")
                if cell.get("t") == "s":
                    value = strings[int(value)]
                elif cell.get("t") == "inlineStr":
                    value = "".join(cell.find(NS + "is").itertext())
                elif cell.get("t") in ("e", "b"):
                    raise StatementError("지원하지 않는 셀 값입니다.", number)
                cells[column] = value
            values.append(
                (
                    number,
                    [cells.get(i, "") for i in range(1, max(cells, default=0) + 1)],
                )
            )
        return values, epoch1904


def timestamp(value: str, epoch1904: bool = False) -> datetime:
    value = value.strip()
    if re.fullmatch(r"\d+(\.\d+)?", value):
        serial = Decimal(value)
        if not epoch1904 and 60 <= serial < 61:
            raise ValueError()
        epoch = datetime(1904, 1, 1) if epoch1904 else datetime(1899, 12, 30)
        return (
            epoch + timedelta(seconds=int((serial * 86400).to_integral_value()))
        ).replace(tzinfo=KST)
    return datetime.strptime(value.replace(".", "-"), "%Y-%m-%d %H:%M:%S").replace(
        tzinfo=KST
    )


def money(value: str) -> int:
    value = value.strip()
    if not re.fullmatch(r"[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?", value):
        raise ValueError()
    amount = int(Decimal(value.replace(",", "")))
    if not -(2**63) <= amount < 2**63:
        raise ValueError()
    return amount


def parse_statement(data: bytes, filename: str) -> Statement:
    try:
        rows, epoch = table(data, filename)
        header = next(
            (
                i
                for i, (_, row) in enumerate(rows)
                if [compact(v) for v in row if v.strip()] == HEADERS
            ),
            None,
        )
        if header is None or not any(
            "카카오뱅크거래내역" == compact(v) for _, row in rows[:header] for v in row
        ):
            raise StatementError("카카오뱅크 거래내역 제목과 7개 열을 확인해 주세요.")
        meta: dict[str, str] = {}
        for _, row in rows[:header]:
            for i, value in enumerate(row):
                if compact(value) in ("성명", "계좌번호", "조회기간", "요청일시"):
                    key = compact(value)
                    if key in meta:
                        raise StatementError("중복된 조회 정보가 있습니다.")
                    meta[key] = next((v.strip() for v in row[i + 1 :] if v.strip()), "")
        period = re.fullmatch(
            r"(\d{4}[.-]\d{2}[.-]\d{2})\s*[-~]\s*(\d{4}[.-]\d{2}[.-]\d{2})",
            meta.get("조회기간", ""),
        )
        if not period or not meta.get("성명") or not meta.get("계좌번호"):
            raise StatementError("조회기간·성명·계좌번호 정보를 확인해 주세요.")
        start, end = (date.fromisoformat(v.replace(".", "-")) for v in period.groups())
        requested = timestamp(meta.get("요청일시", ""), epoch)
        if start > end or end > requested.date():
            raise StatementError("조회기간과 요청일시가 맞지 않습니다.")
        columns = [i for i, value in enumerate(rows[header][1]) if value.strip()]
        entries: list[Entry] = []
        for number, row in rows[header + 1 :]:
            if not any(v.strip() for v in row):
                continue
            if len(entries) >= 2000:
                raise StatementError(
                    "거래는 2,000건까지 처리합니다. 조회기간을 나누어 주세요."
                )
            values = [(row[i] if i < len(row) else "").strip() for i in columns]
            try:
                at = timestamp(values[0], epoch)
                amount, balance = money(values[2]), money(values[3])
                if not start <= at.date() <= end or at > requested:
                    raise ValueError()
                if (
                    values[1] not in ("입금", "출금")
                    or amount == 0
                    or (amount > 0) != (values[1] == "입금")
                ):
                    raise ValueError()
                if any(len(v) > 1000 for v in values[4:]):
                    raise ValueError()
            except (ValueError, InvalidOperation, OverflowError):
                raise StatementError(
                    "거래일시·입출금 구분·정수 금액·잔액을 확인해 주세요.", number
                ) from None
            entries.append(Entry(number, at, amount, balance, *values[4:]))
        if len({entry.core for entry in entries}) != len(entries):
            raise StatementError(
                "동일 시각·금액·잔액의 거래가 반복되어 확인이 필요합니다."
            )

        def consistent(candidate: list[Entry]) -> bool:
            return all(
                previous.at <= current.at
                and previous.balance + current.amount == current.balance
                for previous, current in pairwise(candidate)
            )

        backwards = list(reversed(entries))
        if len(entries) > 1 and consistent(entries) and consistent(backwards):
            raise StatementError(
                "같은 시각 거래의 순서를 잔액으로 구별할 수 없어 확인이 필요합니다."
            )
        if not consistent(entries):
            if not consistent(backwards):
                raise StatementError(
                    "거래 순서 또는 앞 거래와의 잔액 연결이 맞지 않습니다."
                )
            entries = backwards
        return Statement(
            start,
            end,
            requested,
            compact(meta["성명"]) + "|" + compact(meta["계좌번호"]),
            entries,
        )
    except StatementError:
        raise
    except (
        ValueError,
        IndexError,
        AttributeError,
        KeyError,
        ET.ParseError,
        OverflowError,
        csv.Error,
        zipfile.BadZipFile,
    ):
        raise StatementError(
            "은행 원본의 셀 형식과 조회 정보를 확인해 주세요."
        ) from None
