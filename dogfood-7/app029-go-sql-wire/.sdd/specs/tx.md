---
feature: tx
tier: T2
approval: auto
---
# Transaction policy
Goal: deterministic ReadyForQuery states. Non-goals: persistent storage and savepoints.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TX-001 | When an idle session begins, it shall enter transaction state T. | TEST-TX-001 |
| REQ-TX-002 | When an active session begins again, it shall remain T. | TEST-TX-001 |
| REQ-TX-003 | When an active transaction commits, it shall return to I with COMMIT. | TEST-TX-002 |
| REQ-TX-004 | When a failed transaction commits, it shall return to I with ROLLBACK. | TEST-TX-002 |
| REQ-TX-005 | When any state rolls back, it shall enter I. | TEST-TX-003 |
| REQ-TX-006 | When an idle session commits, it shall remain I. | TEST-TX-003 |
| REQ-TX-007 | When a query fails in T, the state shall become E. | TEST-TX-004 |
| REQ-TX-008 | When a query fails in I, it shall remain I. | TEST-TX-004 |
| REQ-TX-009 | If a query runs in E, it shall be rejected with 25P02. | TEST-TX-005 |
| REQ-TX-010 | When unknown events occur, state shall remain unchanged and return an error. | TEST-TX-005 |
## Design
Machine State is I/T/E. The implementation's transition map is the single policy table.
BEGIN: I→T,T→T,E→E(error); COMMIT: I→I,T→I,E→I(ROLLBACK); ROLLBACK: all→I.
QUERY: I→I,T→T,E→E(error); FAIL: I→I,T→E,E→E. Unknown: unchanged(error).
## Assumptions
Spike: table tests enumerate all fifteen legal state/event cells, plus unknown events.
Connection ownership serializes access; cross-connection state is never shared.
