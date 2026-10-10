from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
import pytest
from ledger.posting import Ledger, Line

DAY = date(2024, 1, 15)
def ledger():
    return Ledger({"cash": "USD", "equity": "USD", "yen": "JPY"})
def lines(amount="10"):
    return (Line("cash", "USD", Decimal(amount)), Line("equity", "USD", -Decimal(amount)))

# @id TEST-POSTING-001 @verifies REQ-POSTING-001
def test_posting_001():
    book = ledger()
    journal = book.post("deposit", DAY, lines())
    assert book.balance("cash") == Decimal("10")
    assert book.balance("equity") == Decimal("-10")
    assert journal.lines == lines()

# @id TEST-POSTING-002 @verifies REQ-POSTING-002
def test_posting_002():
    book = ledger()
    for rows in ((Line("cash", "USD", Decimal("2")), Line("equity", "USD", Decimal("-1"))),
                 (Line("cash", "USD", Decimal("1")), Line("yen", "JPY", Decimal("-1")))):
        with pytest.raises(ValueError, match="balanced"):
            book.post("bad", DAY, rows)
        assert book.journals == () and book.balance("cash") == 0

# @id TEST-POSTING-003 @verifies REQ-POSTING-003
def test_posting_003():
    book = ledger()
    first = book.post("one", DAY, lines())
    assert book.post("one", DAY, lines()) is first
    assert len(book.journals) == 1

# @id TEST-POSTING-004 @verifies REQ-POSTING-004
def test_posting_004():
    book = ledger()
    book.post("one", DAY, lines())
    for day, rows, description in ((DAY, lines("20"), ""), (date(2024, 1, 16), lines(), ""),
                                   (DAY, lines(), "changed")):
        with pytest.raises(ValueError, match="idempotency"):
            book.post("one", day, rows, description)
    assert book.balance("cash") == 10

# @id TEST-POSTING-005 @verifies REQ-POSTING-005
def test_posting_005():
    book = ledger()
    for account, currency in (("missing", "USD"), ("cash", "JPY")):
        with pytest.raises(ValueError, match="account"):
            book.post("bad", DAY, (Line(account, currency, Decimal("1")), lines()[1]))
    assert book.journals == ()

# @id TEST-POSTING-006 @verifies REQ-POSTING-006
def test_posting_006():
    book = ledger()
    for rows in ((), (lines()[0],), lines("0"), lines("1.001")):
        with pytest.raises(ValueError, match="lines|precision|zero"):
            book.post("bad", DAY, rows)
    assert book.journals == ()

# @id TEST-POSTING-007 @verifies REQ-POSTING-007
def test_posting_007():
    book = ledger()
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(lambda _: book.post("one", DAY, lines()), range(100)))
    assert all(j is results[0] for j in results)
    assert len(book.journals) == 1 and book.balance("cash") == 10

# @id TEST-POSTING-008 @verifies REQ-POSTING-008
def test_posting_008():
    book = ledger()
    book.post("one", DAY, lines())
    assert book.audit() is True
    book._balances["cash"] += Decimal("1")
    with pytest.raises(ValueError, match="invariant"):
        book.audit()

# @id TEST-POSTING-009 @verifies REQ-POSTING-009
def test_posting_009():
    from decimal import localcontext
    book = ledger()
    rows = (Line("cash", "USD", Decimal("10000000000000000000000000000")),
            Line("cash", "USD", Decimal(".01")),
            Line("equity", "USD", Decimal("-10000000000000000000000000000")))
    with localcontext() as ctx:
        ctx.prec = 6
        with pytest.raises(ValueError, match="balanced"):
            book.post("bad", DAY, rows)
        rows = rows + (Line("equity", "USD", Decimal("-.01")),)
        book.post("good", DAY, rows)
        assert book.balance("cash") == Decimal("10000000000000000000000000000.01")
        assert book.audit()

# @id TEST-POSTING-010 @verifies REQ-POSTING-010
def test_posting_010():
    book = ledger()
    rows = (Line("cash", "USD", "10"), Line("equity", "USD", -10))
    first = book.post("strings", DAY, rows)
    assert all(isinstance(row.amount, Decimal) for row in first.lines)
    assert book.post("strings", DAY, rows) is first and book.audit()
