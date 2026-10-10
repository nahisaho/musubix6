from calendar import monthrange
from dataclasses import dataclass
from datetime import date
import re
from .money import minor, from_minor

TRANSITIONS = {
    ("OPEN", "close"): "CLOSED",
    ("CLOSED", "close"): "CLOSED",
    ("CLOSED", "reopen"): "OPEN",
}

@dataclass(frozen=True)
class Snapshot:
    month: str
    end: date
    balances: tuple
    version: int

class PeriodService:
    def __init__(self, ledger, controllers):
        self.ledger = ledger
        self.controllers = frozenset(controllers)
        self._history = {}

    def _authorize(self, month, actor):
        if actor not in self.controllers:
            raise PermissionError("controller required")
        if not isinstance(month, str) or not re.fullmatch(r"\d{4}-\d{2}", month):
            raise ValueError("invalid month")
        year, number = map(int, month.split("-"))
        return date(year, number, monthrange(year, number)[1])

    # @id CODE-PERIOD-001 @implements REQ-PERIOD-001 REQ-PERIOD-002 REQ-PERIOD-003 REQ-PERIOD-004 REQ-PERIOD-006 REQ-PERIOD-007 REQ-PERIOD-008
    def close(self, month, actor):
        end = self._authorize(month, actor)
        book = self.ledger
        with book.lock:
            state = "CLOSED" if month in book.closed else "OPEN"
            next_state = TRANSITIONS[(state, "close")]
            if state == next_state:
                return self._history[month][-1]
            book.audit()
            totals = {name: 0 for name in book.accounts}
            for journal in book.journals:
                if journal.day <= end:
                    for row in journal.lines:
                        totals[row.account] += minor(row.amount, row.currency)
            history = self._history.setdefault(month, [])
            balances = tuple((name, from_minor(totals[name], book.accounts[name])) for name in sorted(totals))
            snapshot = Snapshot(month, end, balances, len(history) + 1)
            history.append(snapshot)
            book.closed.add(month)
            return snapshot

    # @id CODE-PERIOD-002 @implements REQ-PERIOD-004 REQ-PERIOD-005
    def reopen(self, month, actor):
        self._authorize(month, actor)
        with self.ledger.lock:
            if any(closed > month for closed in self.ledger.closed):
                raise ValueError("later periods closed")
            state = "CLOSED" if month in self.ledger.closed else "OPEN"
            if (state, "reopen") not in TRANSITIONS:
                raise ValueError("period already open")
            self.ledger.closed.remove(month)

    # @id CODE-PERIOD-003 @implements REQ-PERIOD-005 REQ-PERIOD-006
    def history(self, month):
        with self.ledger.lock:
            return tuple(self._history.get(month, ()))
