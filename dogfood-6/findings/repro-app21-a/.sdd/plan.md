# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | sk | sk2 | self-cycle via sk2 |
| 2 | sk2 | sk | cycle |
| 3 | sk3 | sk3 | self |
| 3 | sk | - | dup feature |
| x | zz | - | bad order |
| 5 | ghost | zz, nope | missing spec |
