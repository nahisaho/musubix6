from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from threading import RLock
from types import MappingProxyType
from .money import exact, quantum, minor, from_minor

@dataclass(frozen=True)
class Line:
    account: str
    currency: str
    amount: Decimal

@dataclass(frozen=True)
class Journal:
    key: str
    day: date
    lines: tuple
    description: str

class Ledger:
    def __init__(self, accounts):
        for currency in accounts.values():
            quantum(currency)
        self.accounts = MappingProxyType(dict(accounts))
        self._balances = {name: Decimal(0) for name in accounts}
        self.closed = set()
        self.lock = RLock()
        self._journals = {}

    @property
    def journals(self):
        with self.lock:
            return tuple(self._journals.values())

    # @id CODE-POSTING-001 @implements REQ-POSTING-001 REQ-POSTING-002 REQ-POSTING-003 REQ-POSTING-004 REQ-POSTING-005 REQ-POSTING-006 REQ-POSTING-007 REQ-POSTING-009 REQ-POSTING-010 REQ-PERIOD-009
    def post(self, key, day, lines, description=""):
        rows = tuple(lines)
        if not isinstance(key, str) or not key or type(day) is not date or not isinstance(description, str):
            raise ValueError("invalid journal metadata")
        if any(not isinstance(row, Line) or self.accounts.get(row.account) != row.currency for row in rows):
            raise ValueError("unknown or mismatched account")
        rows = tuple(Line(row.account, row.currency, exact(row.amount, row.currency)) for row in rows)
        candidate = Journal(key, day, rows, description)
        with self.lock:
            if key in self._journals:
                if self._journals[key] != candidate:
                    raise ValueError("idempotency conflict")
                return self._journals[key]
            if any(day.strftime("%Y-%m") <= closed for closed in self.closed):
                raise ValueError("period closed")
            if len(rows) < 2:
                raise ValueError("journal needs two lines")
            totals = {}
            updates = {}
            for row in rows:
                amount = minor(row.amount, row.currency)
                if not amount:
                    raise ValueError("zero line")
                totals[row.currency] = totals.get(row.currency, 0) + amount
                updates[row.account] = updates.get(row.account, 0) + amount
            if any(totals.values()):
                raise ValueError("journal not balanced per currency")
            for name, delta in updates.items():
                currency = self.accounts[name]
                self._balances[name] = from_minor(minor(self._balances[name], currency) + delta, currency)
            self._journals[key] = candidate
            return candidate

    # @id CODE-POSTING-002 @implements REQ-POSTING-001
    def balance(self, account):
        with self.lock:
            return self._balances[account]

    # @id CODE-POSTING-003 @implements REQ-POSTING-008
    def audit(self):
        with self.lock:
            expected = {name: 0 for name in self.accounts}
            for journal in self._journals.values():
                totals = {}
                for row in journal.lines:
                    if self.accounts.get(row.account) != row.currency or not exact(row.amount, row.currency):
                        raise ValueError("line invariant")
                    units = minor(row.amount, row.currency)
                    expected[row.account] += units
                    totals[row.currency] = totals.get(row.currency, 0) + units
                if any(totals.values()):
                    raise ValueError("currency invariant")
            if any(expected[name] != minor(self._balances[name], self.accounts[name]) for name in expected):
                raise ValueError("account balance invariant")
            return True
