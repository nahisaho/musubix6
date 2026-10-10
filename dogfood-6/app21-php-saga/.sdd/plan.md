# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | retry | - | clock, backoff policy, retry executor |
| 2 | def | - | step definitions, DAG order, fingerprint |
| 3 | state | - | persisted saga/step state machines |
| 4 | idem | retry | idempotency keys and store (uses clock) |
| 5 | orch | def, state, retry, idem | orchestrator with compensation and resume |
| 6 | report | state | timeline and summary |
