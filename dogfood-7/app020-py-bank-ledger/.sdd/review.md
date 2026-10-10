spec: sha256:b3a1d93dfcaa7b255c3305e0fc40f030d8914f12b943a2f6508311613a50535a
verdict: pass
open: 0

## Findings
| ID | Severity | Where | Status |
| --- | --- | --- | --- |
| R1 | high | ledger/money.py allocation | Fixed |
| R2 | high | ledger/posting.py exact sums | Fixed |
| R3 | high | ledger/fx.py exact product | Fixed |
| R4 | high | ledger/posting.py closed snapshots | Fixed |
| R5 | high | ledger/posting.py normalized Line | Fixed |
| R6 | high | ledger/recon.py normalized BankEntry | Fixed |

Initial spec review: ledger-spec-review; delta: ledger-spec-delta.
Parallel state/contract review: ledger-state-review and ledger-contract-review.
First clean round: ledger-state-delta and ledger-contract-delta.
Second clean round: ledger-final-review.
47 tests pass, including six regression tests and one explicit characterization.
