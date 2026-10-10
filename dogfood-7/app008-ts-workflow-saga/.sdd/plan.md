| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | history | - | Durable hash-chained events and compare-and-append |
| 2 | definitions | history | Immutable validated versioned definitions |
| 3 | timers | - | Logical clock and deterministic timer queue |
| 4 | saga | definitions,timers | Bounded retries and reverse compensation |
| 5 | runtime | history,definitions,timers,saga | Replay-driven durable execution |
