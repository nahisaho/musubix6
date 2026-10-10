---
feature: gateway
tier: T2
approval: auto
---
# Gateway API
Goal: Offer a real reusable gateway over composed local subgraph adapters.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-GATE-001 | When constructed with subgraphs, the gateway shall compose and execute a query. | TEST-GATE-001 |
| REQ-GATE-002 | When a query repeats, the gateway shall reuse a bounded query plan cache. | TEST-GATE-002 |
| REQ-GATE-003 | When requests use different variables, the gateway shall keep their results isolated. | TEST-GATE-003 |
| REQ-GATE-004 | When subgraphs update successfully, the gateway shall invalidate plans atomically. | TEST-GATE-004 |
| REQ-GATE-005 | If an update fails composition, the gateway shall preserve the prior schema and services. | TEST-GATE-005 |
| REQ-GATE-006 | If query validation fails, the gateway shall return a structured error without calling services. | TEST-GATE-006 |
| REQ-GATE-007 | When requests run concurrently, the gateway shall not share entity data caches. | TEST-GATE-007 |
| REQ-GATE-008 | When health is requested, the gateway shall report schema version and subgraph names. | TEST-GATE-008 |
| REQ-GATE-009 | When callers or adapters mutate structured arguments, the gateway shall preserve cached argument snapshots. | TEST-GATE-009 |
## Design
Gateway snapshots schema/services per request; bounded LRU plan cache includes variable values in its key.
Update composes a replacement before committing it and clears plan state only after successful composition.
## Assumptions
Spike: synchronous snapshot capture prevents updates from changing in-flight request ownership.
Public API is execute(query, variables), update(subgraphs), health(); adapters are in-process.
