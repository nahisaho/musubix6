# Bank ledger

Python 3 in-memory double-entry ledger with Decimal ingress, exact integer-minor-unit
aggregation, deterministic allocations, atomic idempotent posting, FX currency
bridges, reversible monthly close, immutable snapshots, and one-to-one bank reconciliation.

```sh
python3 -m pytest
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root "$PWD" gate
```

`Line` amounts use debit-positive signs. Supply explicit accounts/currencies to `Ledger`;
`post(key, date, lines, description)` commits only balanced journals.
`FXService` requires separate bridge accounts per currency. Float/nonfinite amounts and
rates are forbidden. `PeriodService` requires an allowlisted controller; reopening retains
history. Posting into any closed cumulative snapshot is forbidden, even when the posting's
own month was never closed. Reopen later months before earlier ones.
`reconcile` uses journal keys as statement references and inclusive date ranges.

Supported currencies: USD/EUR/GBP (2 decimals), JPY (0), KWD (3), half-even.
This is not a persistent service; private internals are not an external mutation API.
The `.sdd` directory preserves requirements, approval locks, chained TDD evidence and
review results. Regression rounds cover exact arithmetic and closed-period boundaries.
