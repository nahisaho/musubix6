| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | trace | - | W3C context and cancellation |
| 2 | sampling | trace | Bounded tail decisions |
| 3 | metrics | - | HDR aggregation |
| 4 | logging | trace | Structured correlation |
| 5 | pipeline | sampling,metrics,logging | Concurrent integration |
