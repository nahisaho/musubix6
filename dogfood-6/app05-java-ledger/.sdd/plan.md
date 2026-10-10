# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | money | - | value objects |
| 2 | accounts | money | chart |
| 3 | audit | - | hash chain |
| 4 | journal | money, accounts, audit | posting invariants |
| 5 | period | journal, audit | close/reopen |
