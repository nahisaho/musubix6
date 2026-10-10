| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | bucket | | T2 token bucket |
| 2 | window | | T2 sliding window |
| 3 | pq | | T1 priority queue |
| 4 | limiter | bucket, window | T2 registry+composite |
| 5 | pool | pq, limiter | T2 worker pool |
