| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | graph | - | Validated transactional DAG |
| 2 | cache | - | Canonical content-addressed artifacts |
| 3 | executor | graph | Fake-clock bounded parallel execution |
| 4 | engine | graph,cache,executor | Incremental sessions and early cutoff |
| 5 | dynamic | engine | Discovered dependency reconciliation |
