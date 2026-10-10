| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | net | | deterministic delivery |
| 2 | quorum | | joint configuration |
| 3 | paxos | net, quorum | acceptors and leader recovery |
| 4 | machine | paxos | replicated register |
| 5 | history | machine | bounded linearizability |
