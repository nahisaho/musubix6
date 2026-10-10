| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | cron | | UTC iteration, local wall-clock matching |
| 2 | clock | | Deterministic event clock |
| 3 | leases | clock | Fenced atomic ownership |
| 4 | queue | clock | Stable eligible priority queue |
| 5 | dispatch | cron, clock, leases, queue | Retry and recurring-job state machine |
