from datetime import UTC

from family_ledger.dashboard_layout import Widget, normalize


def test_legacy_tasks_merge_at_first_position_and_keep_either_visible():
    items = [Widget(id="balance"), Widget(id="payment", visible=False),
             Widget(id="approval", visible=True), Widget(id="recent")]
    result = normalize(items, ["tasks", "balance", "recent"])
    assert [item.id for item in result] == ["balance", "tasks", "recent"]
    assert result[1].visible


def test_legacy_hidden_tasks_remain_hidden_and_removed_roles_stay_removed():
    items = [Widget(id="approval", visible=False), Widget(id="payment", visible=False)]
    assert not normalize(items, ["tasks"])[0].visible
    assert normalize(items, ["balance"])[0].id == "balance"


def test_precise_height_preserves_legacy_and_rejects_invalid_values():
    import pytest
    from pydantic import ValidationError

    assert Widget(id="recent", height_px=1200).height_px == 1200
    assert Widget(id="recent", height="tall").height_px is None
    for height in (0, -1, 119, 32769, 200.5, True, "200"):
        with pytest.raises(ValidationError):
            Widget(id="recent", height_px=height)


def test_dues_widget_added_without_changing_saved_layout_and_removed_with_role():
    items = [Widget(id="tasks", height_px=740), Widget(id="balance", width="half")]
    result = normalize(items, ["tasks", "dues", "balance"])
    assert result[:2] == items
    assert result[2].id == "dues"
    assert result[2].visible
    assert normalize(result, ["balance"]) == [items[1]]


def test_support_widget_requires_current_super_admin_and_preserves_layout(monkeypatch):
    from datetime import datetime

    from family_ledger.dashboard_layout import Layout, LayoutRepository, defaults
    from family_ledger.expenses.repository import ExpenseRepository
    for manager, treasury in ((False, False), (False, True), (True, False)):
        monkeypatch.setattr(ExpenseRepository, 'authority', staticmethod(lambda *args, manager=manager: manager))
        monkeypatch.setattr(ExpenseRepository, 'has_role', staticmethod(lambda *args, treasury=treasury: treasury))
        allowed = LayoutRepository.allowed(None, 'family', 'user', datetime.now(UTC))
        assert ('support' in allowed) == manager
        Layout(desktop=defaults(allowed), mobile=defaults(allowed))
    saved = [Widget(id='balance', width='half', height_px=400)]
    assert normalize(saved, ['balance','support'])[0] == saved[0]
    assert normalize([*saved, Widget(id='support')], ['balance']) == saved
