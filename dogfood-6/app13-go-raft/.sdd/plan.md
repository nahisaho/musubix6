# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | clock | | T1 fake clock with ordered timers |
| 2 | rlog | | T1 Raft log: match/merge/up-to-date |
| 3 | network | clock | T2 fake network: latency, FIFO, partitions |
| 4 | election | clock, rlog | T2 terms, votes, timeouts |
| 5 | replication | election, rlog | T2 AppendEntries, commit rule |
| 6 | sim | network, election, replication | T2 cluster + invariants |
