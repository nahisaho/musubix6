---
feature: domain
tier: T2
---
# domain
Goal: shared booking domain primitives.   Non-goals: persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DOMAIN-001 | When money(amount,currency) is called with a safe integer amount and a 3-uppercase-letter currency, the system shall return a frozen {amount,currency}. | TEST-DOMAIN-001 |
| REQ-DOMAIN-002 | If money() gets a non-integer amount or a malformed currency, then the system shall throw RangeError. | TEST-DOMAIN-002 |
| REQ-DOMAIN-003 | When addMoney(a,b) has equal currencies, the system shall return the summed Money. | TEST-DOMAIN-003 |
| REQ-DOMAIN-004 | If addMoney(a,b) has different currencies, then the system shall throw Error "currency mismatch". | TEST-DOMAIN-004 |
| REQ-DOMAIN-005 | The system shall allow exactly pending→confirmed, pending→cancelled, confirmed→cancelled, confirmed→completed in canTransition. | TEST-DOMAIN-005 |
| REQ-DOMAIN-006 | When transition(from,to) is requested and illegal, the system shall throw IllegalTransitionError, otherwise return to. | TEST-DOMAIN-006 |
| REQ-DOMAIN-007 | When isBookingId(s) is called, the system shall accept only `bk_` followed by 8 digits. | TEST-DOMAIN-007 |
| REQ-DOMAIN-008 | When newBookingId(seq) is called with an integer 0..99999999, the system shall return `bk_` plus the 8-digit zero-padded seq, else throw RangeError. | TEST-DOMAIN-008 |
| REQ-DOMAIN-009 | When isTerminal(status) is called, the system shall return true iff the status has no outgoing transitions. | TEST-DOMAIN-009 |

## Design
Components: money.ts (value object), status.ts (state machine), ids.ts; barrel src/index.ts re-exports (hub for other packages).
State table (single source): TRANSITIONS = {pending:[confirmed,cancelled], confirmed:[cancelled,completed], cancelled:[], completed:[]}; every cell tested incl. illegal and self-loops.
Decision: money is integer minor units, never floats.
## Assumptions / risks
Terminal states never transition (TEST-DOMAIN-005 covers all 16 pairs).
