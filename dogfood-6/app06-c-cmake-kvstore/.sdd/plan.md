# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | hashtable | - | chained table, resize |
| 2 | ttl | hashtable | injected clock, expiry, sweep |
| 3 | lru | hashtable | recency list, eviction |
| 4 | protocol | - | binary frame parser/encoder |
| 5 | store | hashtable, ttl, lru, protocol | facade + frame execution |
