# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | vclock | - | clocks |
| 2 | counters | - | G/PN |
| 3 | lwwmap | - | LWW |
| 4 | orset | vclock | OR-Set |
| 5 | sync | vclock, counters, lwwmap, orset | anti-entropy |
| 6 | convergence | sync, counters, lwwmap, orset | property harness |
