from datetime import date
from decimal import Decimal
import pytest
from ledger.posting import Ledger, Line
from ledger.recon import BankEntry, reconcile

DAY = date(2024, 1, 15)
START, END = date(2024, 1, 1), date(2024, 1, 31)
def setup():
    book = Ledger({"cash": "USD", "equity": "USD"})
    book.post("one", DAY, (Line("cash", "USD", Decimal("10")), Line("equity", "USD", Decimal("-10"))))
    return book
def entry(identifier="bank1", reference="one", amount="10", day=DAY, currency="USD"):
    return BankEntry(identifier, reference, day, currency, Decimal(amount))

# @id TEST-RECON-001 @verifies REQ-RECON-001
def test_recon_001():
    result = reconcile(setup(), "cash", [entry()], START, END)
    assert result.matched == (("bank1", "one"),) and result.outstanding == ()
    result = reconcile(setup(), "cash", [entry(), entry("bank2")], START, END)
    assert len(result.matched) == 1 and result.unmatched == ("bank2",)

# @id TEST-RECON-002 @verifies REQ-RECON-002
def test_recon_002():
    result = reconcile(setup(), "cash", [entry(reference="wrong")], START, END)
    assert result.unmatched == ("bank1",)

# @id TEST-RECON-003 @verifies REQ-RECON-003
def test_recon_003():
    result = reconcile(setup(), "cash", [], START, END)
    assert result.outstanding == ("one",)

# @id TEST-RECON-004 @verifies REQ-RECON-004
def test_recon_004():
    result = reconcile(setup(), "cash", [entry(day=date(2024, 2, 1))], START, END)
    assert result.unmatched == () and result.outstanding == ("one",)
    result = reconcile(setup(), "cash", [], date(2024, 2, 1), date(2024, 2, 29))
    assert result.outstanding == () and result.difference == 0

# @id TEST-RECON-005 @verifies REQ-RECON-005
def test_recon_005():
    with pytest.raises(ValueError, match="currency"):
        reconcile(setup(), "cash", [entry(currency="JPY")], START, END)

# @id TEST-RECON-006 @verifies REQ-RECON-006
def test_recon_006():
    with pytest.raises(ValueError, match="duplicate"):
        reconcile(setup(), "cash", [entry(), entry()], START, END)

# @id TEST-RECON-007 @verifies REQ-RECON-007
def test_recon_007():
    book = setup()
    journals, balance = book.journals, book.balance("cash")
    reconcile(book, "cash", [entry()], START, END)
    assert book.journals == journals and book.balance("cash") == balance and book.audit()

# @id TEST-RECON-008 @verifies REQ-RECON-008
def test_recon_008():
    result = reconcile(setup(), "cash", [entry(amount="7")], START, END)
    assert result.difference == Decimal("-3")

# @id TEST-RECON-009 @verifies REQ-RECON-009
def test_recon_009():
    book = setup()
    result = reconcile(book, "cash", [BankEntry("bank", "one", DAY, "USD", "10")], START, END)
    assert result.matched == (("bank", "one"),) and result.difference == 0
