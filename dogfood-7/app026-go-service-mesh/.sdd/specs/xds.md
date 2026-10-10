---
feature: xds
tier: T2
approval: auto
---
# Config distribution
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-XDS-001 | When a valid newer snapshot is published, the system shall deliver it to subscribers. | TEST-XDS-001 |
| REQ-XDS-002 | When delivering a snapshot, the system shall issue a nonempty nonce. | TEST-XDS-001 |
| REQ-XDS-003 | If a publication version does not increase, the system shall reject it. | TEST-XDS-002 |
| REQ-XDS-004 | If a publication is invalid, the system shall preserve the last good version. | TEST-XDS-002 |
| REQ-XDS-005 | When a subscriber ACKs its current nonce, the system shall record the version. | TEST-XDS-003 |
| REQ-XDS-006 | If an ACK nonce is stale, the system shall reject it. | TEST-XDS-003 |
| REQ-XDS-007 | When a subscriber NACKs, the system shall preserve its acknowledged version. | TEST-XDS-004 |
| REQ-XDS-008 | When subscribing after publication, the system shall deliver the current snapshot. | TEST-XDS-004 |
| REQ-XDS-009 | When a slow subscriber has pending config, the system shall replace it with the newest snapshot. | TEST-XDS-005 |
| REQ-XDS-010 | When unsubscribing, the system shall close the subscription channel safely. | TEST-XDS-005 |
| REQ-XDS-011 | When a subscriber ID is replaced, cancelling the old handle shall not remove the replacement. | TEST-XDS-006 |
## Design
Control owns a mutex, monotonically increasing versions, and capacity-one channels.
Each subscriber has its own nonce and ACK state; NACK does not roll back global publication.
Publish validates and clones before committing; delivery is nonblocking, last-write-wins.
## Assumptions / risks
Spike confirms buffered channel replacement and closure under one mutex.
Caller-owned maps cannot escape; external callbacks are never invoked while locked.
The simulator has no persistent storage or destructive operations.
