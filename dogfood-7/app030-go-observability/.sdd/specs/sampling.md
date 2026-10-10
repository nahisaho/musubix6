---
feature: sampling
tier: T2
approval: auto
---
# Tail sampling
Goal: deterministic bounded pending traces with error/latency tail decisions.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SAMPLE-001 | When a span arrives, the sampler shall group it by trace ID. | TEST-SAMPLE-001 |
| REQ-SAMPLE-002 | While a trace is younger than the wait window, the sampler shall defer its decision. | TEST-SAMPLE-001 |
| REQ-SAMPLE-003 | When any span is erroneous, the sampler shall retain the trace at expiry. | TEST-SAMPLE-001 |
| REQ-SAMPLE-004 | When any span meets the latency threshold, the sampler shall retain it. | TEST-SAMPLE-001 |
| REQ-SAMPLE-005 | When no keep policy matches, the sampler shall drop the expired trace. | TEST-SAMPLE-001 |
| REQ-SAMPLE-006 | If a new trace exceeds pending capacity, then Add shall return capacity error without eviction. | TEST-SAMPLE-001 |
| REQ-SAMPLE-007 | When capacity is freed by Flush, the sampler shall accept a new trace. | TEST-SAMPLE-001 |
| REQ-SAMPLE-008 | When callers add and flush concurrently, the sampler shall remain race-free and emit each pending trace once. | TEST-SAMPLE-001 |
| REQ-SAMPLE-009 | If a trace already contains capacity spans, then Add shall reject without mutating the trace. | TEST-SAMPLE-001 |
## Design
Mutex-protected trace map, first-seen monotonic time supplied by callers for deterministic tests.
State table: absent→pending on Add; pending→keep/drop on expiry; absent→error at capacity; full trace Add→error.
Each trace holds at most capacity spans, bounding total storage to capacity squared.
## Assumptions
Late arrivals start a new pending generation; downstream deduplication is out of scope.
Flush returns value copies in sorted trace order; input IDs must already be valid.
