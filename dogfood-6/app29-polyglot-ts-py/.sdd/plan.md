# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | contract | - | shared state machine, TS + Py parity |
| 2 | validate | contract | TS job validation |
| 3 | retry | contract | Py backoff/budget/DLQ |
| 4 | queue | contract, validate | TS priority/lease queue |
| 5 | executor | contract, retry | Py executor |
