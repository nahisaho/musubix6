| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | rules | | Typed rule DSL and evaluation |
| 2 | rollout | | Deterministic hashing and variants |
| 3 | segments | rules | Validated targeting DAG |
| 4 | control | rules,rollout,segments | Atomic config and audit snapshots |
| 5 | sdk | control | Offline evaluator and safe updates |
