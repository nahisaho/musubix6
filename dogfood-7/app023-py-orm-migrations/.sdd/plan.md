| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | model | | Metaclass and descriptors |
| 2 | query | model | Immutable bound SQL |
| 3 | work | model, query | Transactions and identity |
| 4 | relation | work | Lazy and batched loading |
| 5 | migration | model | Deterministic schema changes |
