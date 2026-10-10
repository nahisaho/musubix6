# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | domain | - | money, status machine, ids |
| 2 | interval | - | half-open interval algebra |
| 3 | avail | domain, interval | time zones + availability |
| 4 | validate | domain, avail | request validation |
| 5 | booking | domain, avail, validate | create/cancel handlers |
