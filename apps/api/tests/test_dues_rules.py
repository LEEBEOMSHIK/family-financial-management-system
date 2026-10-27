from datetime import date

from family_ledger.dues.rules import due_date, state


def test_calendar_and_missing_policy():
    assert due_date("2028-02", 31) == date(2028, 2, 29)
    assert due_date("2026-02", 31) == date(2026, 2, 28)
    assert state(None, 0, None, date(2026, 10, 26), True) == "unconfigured"
    assert state(30000, 0, None, date(2026, 10, 26), True) == "pending"


def test_payment_status_and_coverage():
    today = date(2026, 10, 26)
    deadline = date(2026, 10, 25)
    assert state(30000, 10000, deadline, today, True) == "overdue"
    assert state(30000, 10000, today, today, True) == "partial"
    assert state(30000, 0, deadline, today, False) == "awaiting_data"
    assert state(30000, 30000, deadline, today, False) == "paid"
    assert state(9007199254740993, 9007199254740992, today, today, True) == "partial"
