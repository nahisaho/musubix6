from datetime import date
from decimal import Decimal
import pytest
from ledger.posting import Ledger
from ledger.fx import FXService

DAY = date(2024, 1, 15)
def setup():
    book = Ledger({"usd": "USD", "jpy": "JPY", "kwd": "KWD",
                   "bridge_usd": "USD", "bridge_jpy": "JPY", "bridge_kwd": "KWD"})
    return book, FXService(book, {"USD": "bridge_usd", "JPY": "bridge_jpy", "KWD": "bridge_kwd"})

# @id TEST-FX-001 @verifies REQ-FX-001
def test_fx_001():
    book, fx = setup()
    journal = fx.exchange("fx", DAY, "usd", "jpy", "10", "150")
    assert len(journal.lines) == 4 and book.audit()
    assert book.balance("usd") == -10 and book.balance("jpy") == 1500
    assert book.balance("bridge_usd") == 10 and book.balance("bridge_jpy") == -1500

# @id TEST-FX-002 @verifies REQ-FX-002
def test_fx_002():
    book, fx = setup()
    fx.exchange("a", DAY, "usd", "jpy", "1", "150.5")
    fx.exchange("b", DAY, "usd", "kwd", "1", ".3075")
    assert book.balance("jpy") == Decimal("150")
    assert book.balance("kwd") == Decimal(".308")

# @id TEST-FX-003 @verifies REQ-FX-003
def test_fx_003():
    book, fx = setup()
    for rate in ("0", "-1", "NaN", "sNaN", "Infinity", "-Infinity", 1.2):
        with pytest.raises(ValueError, match="rate|amount"):
            fx.exchange("bad", DAY, "usd", "jpy", "1", rate)
    assert book.journals == ()

# @id TEST-FX-004 @verifies REQ-FX-004
def test_fx_004():
    _, fx = setup()
    with pytest.raises(ValueError, match="same"):
        fx.exchange("bad", DAY, "usd", "bridge_usd", "1", "1")

# @id TEST-FX-005 @verifies REQ-FX-005
def test_fx_005():
    book, fx = setup()
    for amount in ("0", "-1", "1.001"):
        with pytest.raises(ValueError, match="positive|precision"):
            fx.exchange("bad", DAY, "usd", "jpy", amount, "150")
    assert book.journals == ()

# @id TEST-FX-006 @verifies REQ-FX-006
def test_fx_006():
    book, fx = setup()
    first = fx.exchange("one", DAY, "usd", "jpy", "1", "150")
    assert fx.exchange("one", DAY, "usd", "jpy", "1", "150.0") is first
    with pytest.raises(ValueError, match="idempotency"):
        fx.exchange("one", DAY, "usd", "jpy", "1", "150.01")
    assert len(book.journals) == 1

# @id TEST-FX-007 @verifies REQ-FX-007
def test_fx_007():
    book, fx = setup()
    with pytest.raises(ValueError, match="zero"):
        fx.exchange("bad", DAY, "usd", "jpy", ".01", ".01")
    assert book.journals == ()

# @id TEST-FX-008 @verifies REQ-FX-008
def test_fx_008():
    book, fx = setup()
    for bridge in ("missing", "usd"):
        fx.bridges["JPY"] = bridge
        with pytest.raises(ValueError, match="account|bridge"):
            fx.exchange("bad", DAY, "usd", "jpy", "1", "150")
    assert book.journals == () and book.balance("usd") == 0

# @id TEST-FX-009 @verifies REQ-FX-009
def test_fx_009():
    from decimal import localcontext
    book, fx = setup()
    with localcontext() as ctx:
        ctx.prec = 6
        fx.exchange("exact", DAY, "usd", "kwd", "1", "1.00050000000000000000000000001")
        assert book.balance("kwd") == Decimal("1.001")
        assert book.audit()
