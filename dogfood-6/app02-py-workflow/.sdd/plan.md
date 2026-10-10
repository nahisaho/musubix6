# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | dag | - | graph, cycle detection, toposort |
| 2 | retry | - | clock, backoff, retry runner |
| 3 | store | - | state machine + persisted journal (T2) |
| 4 | engine | dag, retry, store | scheduler, cancel, resume (T2) |
