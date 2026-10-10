| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | mailbox | - | bounded local delivery |
| 2 | scheduler | mailbox | deterministic turns |
| 3 | supervision | scheduler | fault containment |
| 4 | deadlock | scheduler | wait-for graph |
| 5 | remoting | mailbox | virtual network |
