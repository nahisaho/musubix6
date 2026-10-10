---
feature: offsets
tier: T2
approval: auto
---
# Offsets
Goal: Fenced polling and monotonic acknowledgement. Non-goals: durable commits.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-OFFSETS-001 | When a member polls, the broker shall deliver assigned records in deterministic topic/partition order up to total limit. | TEST-OFFSETS-001 |
| REQ-OFFSETS-002 | When polling repeatedly within a generation, the broker shall advance a local cursor without changing committed offsets. | TEST-OFFSETS-001 |
| REQ-OFFSETS-003 | When committing delivered records, the broker shall store the next-read offset independently per group and partition. | TEST-OFFSETS-002 |
| REQ-OFFSETS-004 | If a commit rewinds, exceeds delivered position or uses invalid offsets, the broker shall reject atomically. | TEST-OFFSETS-002 |
| REQ-OFFSETS-005 | When a generation changes, the broker shall restart polling from committed offsets, replaying uncommitted records. | TEST-OFFSETS-003 |
| REQ-OFFSETS-006 | If polling/committing uses stale tokens or unowned partitions, the broker shall reject without changing cursors. | TEST-OFFSETS-003 |
| REQ-OFFSETS-007 | When seeking within the owned partition log range, the broker shall change only the local cursor and never committed offsets. | TEST-OFFSETS-004 |
| REQ-OFFSETS-008 | If seek/poll options are invalid, the broker shall reject without changing delivery position. | TEST-OFFSETS-004 |
## Design
Offsets reference Log and Groups; cursor keys include generation, group, member, topic, partition.
Commit validates all entries before applying any; poll maintains a separate delivered high-water mark.
## Assumptions / risks
Commits mean next offset, never last processed offset; initial commit is log base.
Seek backwards may replay but may not erase delivered high-water history.
