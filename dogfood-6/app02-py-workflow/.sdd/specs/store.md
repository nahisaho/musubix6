---
feature: store
tier: T2
---
# store
Goal: task state machine and a persisted append-only journal enabling reload and crash recovery. Non-goals: concurrency across processes.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-STORE-001 | The system shall define states PENDING, RUNNING, RETRYING, SUCCEEDED, FAILED, CANCELLED with the transition table in Design. | TEST-STORE-001 |
| REQ-STORE-002 | When transition(task, new) is requested and allowed by the table, the store shall update the state. | TEST-STORE-002 |
| REQ-STORE-003 | If a transition is not allowed, then the store shall raise IllegalTransition and leave the state unchanged. | TEST-STORE-003 |
| REQ-STORE-004 | While a task is in a terminal state (SUCCEEDED, FAILED, CANCELLED), the store shall reject every transition. | TEST-STORE-004 |
| REQ-STORE-005 | When a transition is applied, the store shall append one JSON line (seq, task, from, to, detail) to the journal file before returning. | TEST-STORE-005 |
| REQ-STORE-006 | When a store is opened on an existing journal, the store shall restore every task's latest state and the next seq. | TEST-STORE-006 |
| REQ-STORE-007 | If only the final journal line is truncated, then open shall ignore it; if any earlier line is corrupt, open shall raise CorruptJournal. | TEST-STORE-007 |
| REQ-STORE-008 | When history(task) is called, the store shall return that task's transitions in seq order. | TEST-STORE-008 |
| REQ-STORE-009 | When recover() is called, the store shall move every RUNNING task to RETRYING and return their ids. | TEST-STORE-009 |
| REQ-STORE-010 | If a task has no recorded state, then state(task) shall return PENDING and first transition shall originate from PENDING. | TEST-STORE-010 |

## Design
Components: states.py (enum + TRANSITIONS table, single source), journal.py (JSONL append/read, truncation tolerance), store.py (StateStore combining both).
Data flow: transition -> validate against TRANSITIONS -> append journal line (flush+fsync) -> update in-memory map.
Transition table: PENDING->{RUNNING,CANCELLED}; RUNNING->{SUCCEEDED,FAILED,RETRYING,CANCELLED}; RETRYING->{RUNNING,CANCELLED}; terminal->{}.
Decisions: journal written before memory update so memory never leads disk; seq is global monotonic.
## Assumptions / risks
Single writer assumed (TEST-STORE-006 reload). Truncated tail tolerated only for the last line (TEST-STORE-007).
