from decimal import Decimal
import pytest
from ledger.money import rounded, allocate

# @id TEST-MONEY-001 @verifies REQ-MONEY-001
def test_money_001():
    assert rounded("12.345", "USD") == Decimal("12.34")

# @id TEST-MONEY-002 @verifies REQ-MONEY-002
def test_money_002():
    assert rounded("12.6", "JPY") == Decimal("13")

# @id TEST-MONEY-003 @verifies REQ-MONEY-003
def test_money_003():
    assert rounded("12.3456", "KWD") == Decimal("12.346")

# @id TEST-MONEY-004 @verifies REQ-MONEY-004
def test_money_004():
    assert [rounded(x, "USD") for x in ("1.005", "1.015", "-1.005", "-1.015")] == [
        Decimal("1.00"), Decimal("1.02"), Decimal("-1.00"), Decimal("-1.02")]

# @id TEST-MONEY-005 @verifies REQ-MONEY-005
def test_money_005():
    with pytest.raises(ValueError, match="currency"):
        rounded("1", "ZZZ")

# @id TEST-MONEY-006 @verifies REQ-MONEY-006
def test_money_006():
    for bad in (0.1, "NaN", "sNaN", "Infinity", "-Infinity", True):
        with pytest.raises(ValueError, match="amount"):
            rounded(bad, "USD")

# @id TEST-MONEY-007 @verifies REQ-MONEY-007
def test_money_007():
    assert allocate("0.05", "USD", [1, 1, 1]) == [
        Decimal(".02"), Decimal(".02"), Decimal(".01")]
    assert allocate("10", "JPY", [1, 3]) == [Decimal("3"), Decimal("7")]

# @id TEST-MONEY-008 @verifies REQ-MONEY-008
def test_money_008():
    for weights in ([], [0, 0], [-1, 2], [1.5, 2], [True, 2]):
        with pytest.raises(ValueError, match="weights"):
            allocate("1", "USD", weights)

# @id TEST-MONEY-009 @verifies REQ-MONEY-009
def test_money_009():
    from decimal import localcontext
    with localcontext() as ctx:
        ctx.prec = 6
        amount = Decimal("100000000000000000000000000.01")
        assert allocate(amount, "USD", [1]) == [amount]
        assert allocate(".05", "USD", [1, 1, 1]) == [Decimal(".02"), Decimal(".02"), Decimal(".01")]

# @id TEST-MONEY-010 @verifies REQ-MONEY-010
def test_money_010():
    from ledger.money import EXPONENTS
    assert EXPONENTS == {"USD": 2, "EUR": 2, "GBP": 2, "JPY": 0, "KWD": 3}
