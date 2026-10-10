| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | audit | | hash chain, T2 |
| 2 | velocity | | windows, clock |
| 3 | dsl | | parser/evaluator |
| 4 | scoring | dsl, velocity | pipeline |
| 5 | decision | scoring, audit | state machine, T2 |
