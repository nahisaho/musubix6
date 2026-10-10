| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | contract | - | shared bucket scheme, Go loader |
| 2 | hist | contract | Rust histogram |
| 3 | digest | - | Rust t-digest |
| 4 | window | hist | Rust windowing |
| 5 | ingest | contract | Go parser |
| 6 | rollup | ingest, contract | Go rollups |
