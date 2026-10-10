from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from .money import exact, minor, from_minor

@dataclass(frozen=True)
class BankEntry:
    identifier: str
    reference: str
    day: date
    currency: str
    amount: Decimal

@dataclass(frozen=True)
class Reconciliation:
    matched: tuple
    unmatched: tuple
    outstanding: tuple
    difference: Decimal

# @id CODE-RECON-001 @implements REQ-RECON-001 REQ-RECON-002 REQ-RECON-003 REQ-RECON-004 REQ-RECON-005 REQ-RECON-006 REQ-RECON-007 REQ-RECON-008 REQ-RECON-009
def reconcile(ledger, account, entries, start, end):
    if type(start) is not date or type(end) is not date or start > end:
        raise ValueError("invalid range")
    currency = ledger.accounts[account]
    entries = tuple(BankEntry(e.identifier, e.reference, e.day, e.currency, exact(e.amount, e.currency)) for e in entries)
    seen = set()
    for entry in entries:
        if entry.identifier in seen:
            raise ValueError("duplicate bank ID")
        seen.add(entry.identifier)
        if entry.currency != currency:
            raise ValueError("bank currency mismatch")
        exact(entry.amount, currency)
    with ledger.lock:
        rows = [(j.key, j.day, sum(minor(row.amount, currency) for row in j.lines if row.account == account))
                for j in ledger.journals if start <= j.day <= end and any(r.account == account for r in j.lines)]
    available = list(rows)
    matched, unmatched = [], []
    bank_total = 0
    for entry in entries:
        if not start <= entry.day <= end:
            continue
        units = minor(entry.amount, currency)
        bank_total += units
        candidate = (entry.reference, entry.day, units)
        if candidate in available:
            available.remove(candidate)
            matched.append((entry.identifier, entry.reference))
        else:
            unmatched.append(entry.identifier)
    return Reconciliation(tuple(matched), tuple(unmatched), tuple(row[0] for row in available),
                          from_minor(bank_total - sum(row[2] for row in rows), currency))
