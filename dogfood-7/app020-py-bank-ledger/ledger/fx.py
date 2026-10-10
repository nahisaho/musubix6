from .money import decimal, exact, rounded
from .posting import Line
from decimal import localcontext

class FXService:
    def __init__(self, ledger, bridges):
        self.ledger = ledger
        self.bridges = dict(bridges)

    # @id CODE-FX-001 @implements REQ-FX-001 REQ-FX-002 REQ-FX-003 REQ-FX-004 REQ-FX-005 REQ-FX-006 REQ-FX-007 REQ-FX-008 REQ-FX-009
    def exchange(self, key, day, source, target, amount, rate):
        book = self.ledger
        if source not in book.accounts or target not in book.accounts:
            raise ValueError("unknown account")
        src, dst = book.accounts[source], book.accounts[target]
        if src == dst:
            raise ValueError("same currencies")
        rate = decimal(rate)
        if rate <= 0:
            raise ValueError("rate must be positive")
        amount = exact(amount, src)
        if amount <= 0:
            raise ValueError("source must be positive")
        with localcontext() as context:
            context.prec = max(28, len(amount.as_tuple().digits) + len(rate.as_tuple().digits) + 2)
            received = rounded(amount * rate, dst)
            rate_text = format(rate.normalize(), "f")
        if not received:
            raise ValueError("target rounds to zero")
        for currency in (src, dst):
            account = self.bridges.get(currency)
            if book.accounts.get(account) != currency or account in (source, target):
                raise ValueError("invalid bridge account")
        rows = (Line(source, src, amount.copy_negate()), Line(self.bridges[src], src, amount),
                Line(target, dst, received), Line(self.bridges[dst], dst, received.copy_negate()))
        return book.post(key, day, rows, f"FX {src}/{dst} {rate_text}")
