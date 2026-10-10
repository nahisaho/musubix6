# Plan

| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | store | | MVCC core |
| 2 | watch | store | streams |
| 3 | lease | store | TTL |
| 4 | txn | store, lease | CAS |
| 5 | compact | store, watch | history GC |
