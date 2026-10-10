# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | page | - | slotted page + crc32 |
| 2 | btree | page | B+tree, invariants, page serialization |
| 3 | wal | page | frames, torn-write recovery |
| 4 | mvcc | btree | versioned keys, snapshot isolation, gc |
| 5 | iter | mvcc | snapshot-consistent fwd/rev range scans |
| 6 | engine | wal, mvcc, iter | durable commit + crash recovery |
