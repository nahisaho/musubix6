| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | model | | immutable validated snapshots |
| 2 | xds | model | versioned subscriptions and ACK/NACK |
| 3 | balance | model | deterministic routing |
| 4 | circuit | | concurrency and state machine |
| 5 | resilience | xds,balance,circuit | retries and outlier ejection |
