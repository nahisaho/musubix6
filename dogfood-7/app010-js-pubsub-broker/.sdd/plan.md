| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | topics | | Partitioned immutable append-only log |
| 2 | groups | topics | Deterministic fenced assignments |
| 3 | offsets | groups | Poll and monotonic commit |
| 4 | delivery | offsets | Transactions, dedupe and dead letters |
| 5 | lifecycle | delivery | Injected time, expiry and maintenance |
