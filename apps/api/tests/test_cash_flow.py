from datetime import UTC, date, datetime

from family_ledger.cash_flow import FlowEntry, project_flow


def test_week_uses_korean_today_and_monday_across_year():
    result = project_flow(datetime(2025, 12, 31, 15, 30, tzinfo=UTC), "week", [], [])
    assert result.today == "2026-01-01"
    assert len(result.items) == 8
    assert result.items[-1].start_on == "2025-12-29"
    assert result.items[-1].end_on == "2026-01-01"
    assert result.items[-1].in_progress
    assert result.items[-1].income_krw is None


def test_month_leap_year_and_missing_periods():
    result = project_flow(datetime(2024, 3, 1, tzinfo=UTC), "month", [], [])
    assert len(result.items) == 6
    assert result.items[-2].end_on == "2024-02-29"
    assert result.items[-1].start_on == result.items[-1].end_on == "2024-03-01"
    assert result.items[0].start_on == "2023-10-01"


def test_covered_zero_partial_and_balance_carry_keep_exact_amounts():
    entries = [
        FlowEntry(datetime(2026, 1, 3, tzinfo=UTC), 9007199254740993, 9007199254740993)
    ]
    result = project_flow(
        datetime(2026, 3, 1, tzinfo=UTC),
        "month",
        entries,
        [(date(2026, 1, 1), date(2026, 2, 28))],
    )
    jan, feb, mar = result.items[-3:]
    assert jan.income_krw == "9007199254740993"
    assert feb.income_krw == "0"
    assert feb.balance_krw == "9007199254740993"
    assert mar.coverage == "none"
    assert mar.balance_krw is None
    partial = project_flow(
        datetime(2026, 3, 1, tzinfo=UTC),
        "month",
        entries,
        [(date(2026, 1, 1), date(2026, 1, 5)), (date(2026, 2, 1), date(2026, 2, 28))],
    )
    assert partial.items[-3].coverage == "partial"
    assert partial.items[-2].balance_krw is None


def test_future_transactions_are_not_in_today_totals():
    result = project_flow(
        datetime(2026, 1, 5, tzinfo=UTC),
        "week",
        [FlowEntry(datetime(2026, 1, 5, 1, tzinfo=UTC), 100, 100)],
        [(date(2026, 1, 1), date(2026, 1, 31))],
    )
    assert result.items[-1].income_krw == "0"
    assert result.items[-1].balance_krw is None
