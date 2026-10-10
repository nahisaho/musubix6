from datetime import date
from decimal import Decimal
import pytest
from ledger.posting import Ledger, Line
from ledger.period import PeriodService

DAY = date(2024, 1, 15)
ROWS = (Line("cash", "USD", Decimal("10")), Line("equity", "USD", Decimal("-10")))
def setup():
    book = Ledger({"cash": "USD", "equity": "USD"})
    book.post("one", DAY, ROWS)
    return book, PeriodService(book, {"controller"})

# @id TEST-PERIOD-001 @verifies REQ-PERIOD-001
def test_period_001():
    book, periods = setup()
    book.post("future", date(2024, 2, 1), ROWS)
    snap = periods.close("2024-01", "controller")
    assert dict(snap.balances)["cash"] == 10 and snap.end == date(2024, 1, 31)

# @id TEST-PERIOD-002 @verifies REQ-PERIOD-002
def test_period_002():
    book, periods = setup()
    periods.close("2024-01", "controller")
    with pytest.raises(ValueError, match="closed"):
        book.post("two", DAY, ROWS)
    assert len(book.journals) == 1

# @id TEST-PERIOD-003 @verifies REQ-PERIOD-003
def test_period_003():
    book, periods = setup()
    first = book.journals[0]
    periods.close("2024-01", "controller")
    assert book.post("one", DAY, ROWS) is first

# @id TEST-PERIOD-004 @verifies REQ-PERIOD-004
def test_period_004():
    _, periods = setup()
    with pytest.raises(PermissionError):
        periods.close("2024-01", "guest")
    periods.close("2024-01", "controller")
    with pytest.raises(PermissionError):
        periods.reopen("2024-01", "guest")

# @id TEST-PERIOD-005 @verifies REQ-PERIOD-005
def test_period_005():
    book, periods = setup()
    first = periods.close("2024-01", "controller")
    periods.close("2024-02", "controller")
    with pytest.raises(ValueError, match="later"):
        periods.reopen("2024-01", "controller")
    periods.reopen("2024-02", "controller")
    periods.reopen("2024-01", "controller")
    book.post("two", DAY, ROWS)
    second = periods.close("2024-01", "controller")
    assert dict(first.balances)["cash"] == 10 and dict(second.balances)["cash"] == 20
    assert periods.history("2024-01") == (first, second)

# @id TEST-PERIOD-006 @verifies REQ-PERIOD-006
def test_period_006():
    _, periods = setup()
    first = periods.close("2024-01", "controller")
    assert periods.close("2024-01", "controller") is first
    assert len(periods.history("2024-01")) == 1

# @id TEST-PERIOD-007 @verifies REQ-PERIOD-007
def test_period_007():
    book, periods = setup()
    book._balances["cash"] += 1
    with pytest.raises(ValueError, match="invariant"):
        periods.close("2024-01", "controller")
    assert "2024-01" not in book.closed

# @id TEST-PERIOD-008 @verifies REQ-PERIOD-008
def test_period_008():
    book, periods = setup()
    book.post("leap", date(2024, 2, 29), ROWS)
    snap = periods.close("2024-02", "controller")
    assert snap.end == date(2024, 2, 29) and dict(snap.balances)["cash"] == 20

# @id TEST-PERIOD-009 @verifies REQ-PERIOD-009
def test_period_009():
    book, periods = setup()
    periods.close("2024-02", "controller")
    with pytest.raises(ValueError, match="closed"):
        book.post("backdated", DAY, ROWS)
    periods.reopen("2024-02", "controller")
    book.post("backdated", DAY, ROWS)
    assert book.balance("cash") == 20
