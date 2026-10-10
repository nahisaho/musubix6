| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | wire | | Bounded DNS codec |
| 2 | cache | wire | Concurrent expiring cache |
| 3 | dnssec | wire | DNSSEC-lite authenticity |
| 4 | transport | wire | UDP exchange |
| 5 | resolver | cache,dnssec,transport | Iteration and query minimisation |
