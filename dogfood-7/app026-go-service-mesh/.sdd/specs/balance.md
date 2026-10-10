---
feature: balance
tier: T2
approval: auto
---
# Balancing policies
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-BALANCE-001 | When round robin selects, the system shall rotate through eligible endpoints. | TEST-BALANCE-001 |
| REQ-BALANCE-002 | When round robin reaches the end, the system shall wrap to the first endpoint. | TEST-BALANCE-001 |
| REQ-BALANCE-003 | When weighted round robin selects, the system shall distribute by positive weights. | TEST-BALANCE-002 |
| REQ-BALANCE-004 | When repeated weighted cycles execute, the system shall remain deterministic. | TEST-BALANCE-002 |
| REQ-BALANCE-005 | When least request selects, the system shall prefer the smallest active-request count. | TEST-BALANCE-003 |
| REQ-BALANCE-006 | If counts tie, the system shall choose the earliest input endpoint. | TEST-BALANCE-003 |
| REQ-BALANCE-007 | When consistent hashing selects the same key, the system shall return the same endpoint. | TEST-BALANCE-004 |
| REQ-BALANCE-008 | When endpoint input order changes, the system shall preserve hash routing. | TEST-BALANCE-004 |
| REQ-BALANCE-009 | If no healthy endpoint exists, the system shall return an error. | TEST-BALANCE-005 |
| REQ-BALANCE-010 | When selecting, the system shall omit unhealthy endpoints. | TEST-BALANCE-005 |
## Design
Balancer owns a mutex-protected round counter; weighted rotation uses cumulative integer weights.
Rendezvous FNV-64 hashing avoids ring mutation and is independent of list ordering.
Counts are supplied by the proxy; lowest-count ties follow stable input order.
## Assumptions / risks
Spike confirms Go uint64 hash arithmetic; ID uniqueness is validated by mesh contracts.
No random source or clock is needed; policy names are a closed string set.
Large weights are bounded by caller configuration; concurrent selection is serialized.
