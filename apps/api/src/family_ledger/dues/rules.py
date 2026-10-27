from calendar import monthrange
from datetime import date


def due_date(month: str, day: int) -> date:
    year, number = map(int, month.split("-"))
    return date(year, number, min(day, monthrange(year, number)[1]))


def state(
    amount: int | None, paid: int, deadline: date | None, today: date, covered: bool
) -> str:
    if amount is None:
        return "unconfigured"
    if paid >= amount:
        return "paid"
    if not covered:
        return "awaiting_data"
    if deadline is not None and today > deadline:
        return "overdue"
    return "partial" if paid else "pending"
